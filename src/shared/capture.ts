/**
 * M12: one-gesture capture store schema + server-side validation.
 *
 * Pure and Electron-free: importable by main (the local + remote capture:append
 * handlers), the renderer (no DOM use here), and the web-client. The MAIN store
 * (todos.json) is owned by src/main/todo-store.ts; this module only defines the
 * v2 shape and the validation that every write path MUST run first.
 *
 * The captured text is DISPLAY-ONLY (PLAN.md 1.7 / 3.3). A source:'todo' item is
 * never an action payload: it is never eligible for draftFirstVersion or a
 * claudeQuery, and its raw text never reaches composeClaudeQuery or the log. The
 * only action a captured item carries is Copy of inert text. Nothing in this
 * module passes captured text to an LLM, a PTY, or a logger.
 */

import { generateId } from './dashboard-ui-helpers';

// ---------------------------------------------------------------------------
// IPC channel names (one constant per channel, shared by every send/handle site)
// ---------------------------------------------------------------------------

/**
 * Append a captured todo. Request/response (ipcMain.handle): the renderer sends
 * { text }, MAIN validates + persists and returns the new open-item count. This
 * channel is REMOTE-ENABLED (PLAN.md 3.5) with server-side validation in the
 * web-remote-server handler; the desktop and remote paths both call appendTodo.
 */
export const CAPTURE_APPEND_CHANNEL = 'capture:append';

/**
 * Read the open-item count for the quiet Inbox(N) glance number (M12).
 * Request/response (ipcMain.handle); local-only (the count is a desktop-Home
 * affordance, and Home is desktop-only in Phase 1, PLAN.md 2.9).
 */
export const CAPTURE_COUNT_CHANNEL = 'capture:count';

/**
 * Mutate an existing todo item (M15: horizon assign, park, done).
 * Request/response (ipcMain.handle); LOCAL-ONLY (Home is desktop-only,
 * PLAN.md 2.9). The ws-bridge stub throws so a missed disabled-state fails
 * loudly.
 */
export const TODO_UPDATE_CHANNEL = 'todo:update';

/**
 * List the captured todo items so the renderer can render the Phase-3 triage /
 * parking / morning-ritual surfaces (M15/M18) and feed Tier-5 @now todos to the
 * ranker. Request/response (ipcMain.handle); LOCAL-ONLY (Home is desktop-only,
 * PLAN.md 2.9), so this channel is NOT in REMOTE_FORWARDED_CHANNELS and the
 * ws-bridge stub returns an empty list. The returned items carry only the
 * structured TodoItem fields; the raw text is DISPLAY-ONLY and never an action
 * payload (PLAN.md 1.7 / 3.3), and the list is never logged.
 */
export const TODO_LIST_CHANNEL = 'capture:list';

// ---------------------------------------------------------------------------
// M15: mutation patch type
// ---------------------------------------------------------------------------

/**
 * A partial patch for an existing TodoItem. Only the keys present in the
 * patch are written; other fields are unchanged. Every key is optional.
 */
export interface TodoUpdatePatch {
  horizon?: TodoHorizon | null;
  category?: TodoItem['category'];
  project?: string | null;
  parkedUntil?: number | null;
  doneAt?: number | null;
}

// ---------------------------------------------------------------------------
// Validation bounds (PLAN-PHASE-2-3.md line 55)
// ---------------------------------------------------------------------------

/**
 * Maximum captured-text length. The capture channel writes
 * attacker-influenceable text to todos.json on the PHI-adjacent work PC, so the
 * remote handler MUST cap length (the existing tab:rename remote handler trusts
 * msg.name with no bound, web-remote-server.ts:297-307, a warning not a pattern
 * to copy).
 */
export const MAX_CAPTURE_TEXT_LENGTH = 2000;

/**
 * Maximum number of items the store keeps. A cap bounds both the file size and
 * the unbounded-growth path a remote attacker could otherwise drive. When the
 * store is at the cap a new append is rejected (the caller surfaces a calm
 * message; nothing is silently dropped from the persisted set).
 */
export const MAX_CAPTURE_ITEMS = 5000;

/**
 * Maximum serialized file size in bytes. A second, independent bound so a small
 * item count of very large items still cannot blow the file up. Enforced by the
 * store before the atomic write.
 */
export const MAX_CAPTURE_FILE_BYTES = 4 * 1024 * 1024; // 4 MB

/** The current todos.json schema version (PLAN-PHASE-2-3.md lines 22-41). */
export const TODOS_SCHEMA_VERSION = 2 as const;

// ---------------------------------------------------------------------------
// The v2 item shape (PLAN-PHASE-2-3.md lines 22-41)
// ---------------------------------------------------------------------------

/** The six-category enum (PLAN-PHASE-2-3.md line 33). Null until triaged. */
export type TodoCategory =
  | 'financial'
  | 'documentation'
  | 'delegation'
  | 'completing-the-loop'
  | 'health'
  | 'marketing';

/** The three J.O.T. horizons (PLAN-PHASE-2-3.md line 31). Null until triaged. */
export type TodoHorizon = 'now' | 'next' | 'later';

/**
 * One captured todo. M12 sets only id/text/createdAt; the Phase-3 nullable
 * fields are present (and default null) so the schema is stable across phases.
 */
export interface TodoItem {
  /** Minted via the SHARED generateId('todo') so tab + todo ids share one minter. */
  id: string;
  /** Raw capture, the only required field at M12. DISPLAY-ONLY; never an action payload. */
  text: string;
  /** Epoch ms. */
  createdAt: number;
  /** Triage horizon (Phase 3). Null until triaged. */
  horizon: TodoHorizon | null;
  /** Avoidance category (Phase 3). Null until triaged. */
  category: TodoCategory | null;
  /** Optional project, assigned at triage (Phase 3). */
  project: string | null;
  /** Resurfacing timestamp epoch ms (Phase 3). Null = always visible. */
  parkedUntil: number | null;
  /** Completion timestamp epoch ms (Phase 3). Null = open. */
  doneAt: number | null;
}

/** The on-disk file shape. version 2 + items[]. */
export interface TodosFile {
  version: typeof TODOS_SCHEMA_VERSION;
  items: TodoItem[];
}

/** A fresh, empty v2 file. */
export function emptyTodosFile(): TodosFile {
  return { version: TODOS_SCHEMA_VERSION, items: [] };
}

// ---------------------------------------------------------------------------
// Server-side validation (REQUIRED on every write path, local + remote)
// ---------------------------------------------------------------------------

/** A discriminated validation result so callers can branch without throwing. */
export type CaptureValidation =
  | { ok: true; text: string }
  | { ok: false; reason: 'not-string' | 'empty' | 'too-long' | 'control-bytes' };

/**
 * True for a code point that must be rejected from captured text.
 *
 * Rejects C0 controls (0x00-0x1F) and DEL (0x7F), with two exceptions kept so a
 * multi-line paste is not silently truncated: TAB (0x09) and LINE FEED (0x0A).
 * CARRIAGE RETURN (0x0D) is rejected so a lone CR cannot smuggle a terminal
 * control sequence into a display string. C1 controls (0x80-0x9F) are also
 * rejected.
 */
function isRejectedControlChar(code: number): boolean {
  if (code === 0x09 || code === 0x0a) return false; // TAB, LF allowed
  if (code <= 0x1f) return true; // C0 controls (incl. CR 0x0D)
  if (code === 0x7f) return true; // DEL
  if (code >= 0x80 && code <= 0x9f) return true; // C1 controls
  return false;
}

/**
 * Validates a candidate capture payload server-side.
 *
 * The remote capture:append handler MUST run this before any write:
 *   - require typeof text === 'string'
 *   - reject empty / whitespace-only text
 *   - cap length at MAX_CAPTURE_TEXT_LENGTH
 *   - reject control bytes
 *
 * Returns a trimmed text on success. The trim is applied AFTER the length cap so
 * a 2001-char string of spaces is rejected as too-long rather than trimmed to
 * empty (an attacker cannot pad past the bound).
 */
export function validateCaptureText(text: unknown): CaptureValidation {
  if (typeof text !== 'string') {
    return { ok: false, reason: 'not-string' };
  }
  if (text.length > MAX_CAPTURE_TEXT_LENGTH) {
    return { ok: false, reason: 'too-long' };
  }
  for (let i = 0; i < text.length; i++) {
    if (isRejectedControlChar(text.charCodeAt(i))) {
      return { ok: false, reason: 'control-bytes' };
    }
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  return { ok: true, text: trimmed };
}

// ---------------------------------------------------------------------------
// Item construction
// ---------------------------------------------------------------------------

/**
 * Builds a v2 TodoItem from already-validated text.
 *
 * The id is minted via the SHARED generateId('todo'), the same minter tab ids
 * use, so there is one collision-tested id path (PLAN-PHASE-2-3.md line 41).
 * Only id/text/createdAt are set at M12; the Phase-3 fields default null.
 *
 * createdAt is injectable so the store + tests are deterministic.
 */
export function makeTodoItem(text: string, now: number = Date.now()): TodoItem {
  return {
    id: generateId('todo'),
    text,
    createdAt: now,
    horizon: null,
    category: null,
    project: null,
    parkedUntil: null,
    doneAt: null,
  };
}
