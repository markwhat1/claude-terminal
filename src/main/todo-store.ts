/**
 * M12: the MAIN-owned capture store (todos.json).
 *
 * Owned by MAIN, fs.readFileSync/writeFileSync (AGENTS.md "No electron-store"),
 * at <userDataDir>/dashboard/todos.json. It is OUT of the workspace git tree so
 * its un-scrubbed phone-captured text never rests on a cross-repo gitignore
 * (PLAN.md 3.6 / R-6). It sits beside the Phase-1 closed.json under the same
 * userData data dir.
 *
 * This module is Electron-free: it takes the resolved userDataDir as an argument
 * so it is unit-testable with a temp dir. index.ts passes app.getPath('userData').
 *
 * Every write runs validateCaptureText FIRST (the server-side validation the
 * remote capture:append handler is REQUIRED to enforce, PLAN-PHASE-2-3 line 55):
 * non-string / over-length / control-byte / empty payloads are rejected, total
 * items + file size are capped, and the persist is an ATOMIC write (write a temp
 * file then rename) so a crash mid-write cannot corrupt the store.
 *
 * Captured text is DISPLAY-ONLY: nothing here logs the text or feeds it to an
 * LLM/PTY. Failure logs carry the path + reason only, never the captured text.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  validateCaptureText,
  makeTodoItem,
  emptyTodosFile,
  MAX_CAPTURE_ITEMS,
  MAX_CAPTURE_FILE_BYTES,
  TODOS_SCHEMA_VERSION,
  type TodoItem,
  type TodosFile,
} from '@shared/capture';
import { log } from './logger';

/** The append result. A rejection carries a machine reason, never the text. */
export type AppendTodoResult =
  | { ok: true; item: TodoItem; count: number }
  | { ok: false; reason: 'not-string' | 'empty' | 'too-long' | 'control-bytes' | 'at-capacity' | 'write-failed' };

/** Resolves the todos.json path under the userData dashboard dir. */
export function resolveTodosPath(userDataDir: string): string {
  return path.join(userDataDir, 'dashboard', 'todos.json');
}

/**
 * Reads + validates the store file, returning a normalized v2 TodosFile.
 *
 * A missing, unparseable, wrong-version, or non-array file degrades to an empty
 * v2 file rather than throwing (a corrupt store must not block capture). Only
 * well-formed item objects survive; malformed entries are dropped. Path only in
 * any log line, never the captured text.
 */
export function readTodosFile(userDataDir: string): TodosFile {
  const filePath = resolveTodosPath(userDataDir);
  if (!fs.existsSync(filePath)) return emptyTodosFile();
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return emptyTodosFile();
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.items)) return emptyTodosFile();
    const items: TodoItem[] = [];
    for (const e of obj.items) {
      if (!e || typeof e !== 'object') continue;
      const rec = e as Record<string, unknown>;
      if (typeof rec.id !== 'string' || typeof rec.text !== 'string') continue;
      if (typeof rec.createdAt !== 'number') continue;
      items.push({
        id: rec.id,
        text: rec.text,
        createdAt: rec.createdAt,
        horizon: (rec.horizon as TodoItem['horizon']) ?? null,
        category: (rec.category as TodoItem['category']) ?? null,
        project: (rec.project as string | null) ?? null,
        parkedUntil: (rec.parkedUntil as number | null) ?? null,
        doneAt: (rec.doneAt as number | null) ?? null,
      });
    }
    return { version: TODOS_SCHEMA_VERSION, items };
  } catch {
    // Missing / unparseable file: start fresh. Path only in log (never text).
    log.warn('[todo-store] could not read %s; starting fresh', filePath);
    return emptyTodosFile();
  }
}

/** The open-item count for the quiet Inbox(N) glance number (M12). */
export function countOpenTodos(userDataDir: string): number {
  // M12 has no triage/done, so every item is open. doneAt is honored now so the
  // Phase-3 done flow does not need to change the count contract.
  return readTodosFile(userDataDir).items.filter((i) => i.doneAt === null).length;
}

/**
 * Appends one captured todo to the store.
 *
 * Runs the FULL server-side validation chain before any write:
 *   1. validateCaptureText (typeof string, length cap, control bytes, non-empty)
 *   2. item-count cap (MAX_CAPTURE_ITEMS)
 *   3. serialized file-size cap (MAX_CAPTURE_FILE_BYTES)
 *   4. atomic write (temp file + rename)
 *
 * Returns the created item + new count on success, or a machine reason on
 * rejection. The reason never carries the captured text.
 *
 * createdAt is injectable so the store is deterministic in tests.
 */
export function appendTodo(
  userDataDir: string,
  text: unknown,
  now: number = Date.now(),
): AppendTodoResult {
  const validation = validateCaptureText(text);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }

  const file = readTodosFile(userDataDir);

  if (file.items.length >= MAX_CAPTURE_ITEMS) {
    log.warn('[todo-store] capture rejected: store at capacity (%d items)', file.items.length);
    return { ok: false, reason: 'at-capacity' };
  }

  const item = makeTodoItem(validation.text, now);
  const next: TodosFile = { version: TODOS_SCHEMA_VERSION, items: [...file.items, item] };
  const serialized = JSON.stringify(next);

  if (Buffer.byteLength(serialized, 'utf-8') > MAX_CAPTURE_FILE_BYTES) {
    log.warn('[todo-store] capture rejected: file-size cap exceeded');
    return { ok: false, reason: 'at-capacity' };
  }

  if (!atomicWrite(resolveTodosPath(userDataDir), serialized)) {
    return { ok: false, reason: 'write-failed' };
  }

  return { ok: true, item, count: next.items.filter((i) => i.doneAt === null).length };
}

/**
 * Atomically writes content to filePath: write a sibling temp file, fsync it,
 * then rename over the target. A crash mid-write leaves either the old file or
 * the new file intact, never a half-written store. Returns false on failure
 * (path only in any log line, never content).
 */
function atomicWrite(filePath: string, content: string): boolean {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, content, 'utf-8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, filePath);
    return true;
  } catch {
    log.warn('[todo-store] could not write %s', filePath);
    return false;
  }
}
