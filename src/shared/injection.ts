/**
 * The Claude-injection channel pair contract (M10c, PLAN 3.1 / 1.5b).
 *
 * Two channels carry the dashboard hero's "open Claude with a canned query"
 * action:
 *   - claude:injectQuery  renderer -> MAIN (ipcMain.handle), RETURNS the new tab
 *     id. The MAIN handler creates the tab, arms the pending injection plus the
 *     30s timeout BEFORE it resolves, then returns the id.
 *   - claude:injectStatus MAIN -> renderer broadcast: pending / success / failure
 *     for the spawning tab's pending affordance.
 *
 * ONE exported constant per channel, used for BOTH the send site and the on/
 * handle site, so a typo cannot ship the feed dead (a string mismatch between
 * sender and listener would silently drop every event).
 *
 * Neither channel is forwarded to remote clients: both are absent from
 * REMOTE_FORWARDED_CHANNELS (the action is desktop-only in Phase 1, PLAN 3.5).
 *
 * Pure constants and types: no DOM, no Electron, no window. Importable by main,
 * preload, renderer, and tests.
 */

/** Channel for the inject request/response (renderer -> MAIN, returns tab id). */
export const CLAUDE_INJECT_QUERY_CHANNEL = 'claude:injectQuery';

/** Channel for the inject status broadcast (MAIN -> renderer). */
export const CLAUDE_INJECT_STATUS_CHANNEL = 'claude:injectStatus';

/**
 * The lifecycle of one injection, surfaced to the spawning tab.
 *   - pending: the tab was created, the query is armed, waiting for first idle.
 *   - success: the canned query was written to the live PTY.
 *   - failure: the PTY was dead at write time, or the 30s timeout fired.
 */
export type InjectStatusKind = 'pending' | 'success' | 'failure';

/** The payload carried over CLAUDE_INJECT_STATUS_CHANNEL. */
export interface InjectStatus {
  /** The spawning tab the status is about. */
  tabId: string;
  kind: InjectStatusKind;
  /** A failure reason for the failed-start surface (failure only). */
  reason?: string;
}

/**
 * The failed-start copy. Reads "session may have failed to start; check
 * permission mode" so the always-timeout case is legible if the bypass override
 * is ever removed and a plan-mode tab errors at startup (PLAN 3.1 step 8).
 */
export const INJECT_FAILED_START_COPY =
  'The session may have failed to start; check permission mode.';

/** The failure reason emitted when the PTY is dead at write time (PLAN 3.1 step 6). */
export const INJECT_PTY_GONE_REASON = 'pty-gone';

/** The failure reason emitted when the 30s fail-safe fires (PLAN 3.1 step 7). */
export const INJECT_TIMEOUT_REASON = 'timeout';

/** The mandatory MAIN-side fail-safe window, in milliseconds (PLAN 3.1 step 7). */
export const INJECT_TIMEOUT_MS = 30_000;
