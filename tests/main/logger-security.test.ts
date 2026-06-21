/**
 * M0b-i: Logger security gate tests — logger path and idempotency.
 *
 * Tests:
 *  1. Log path resolves under app.getPath('userData'), not under any project dir.
 *  2. logger.init is idempotent: a second call does NOT re-wipe the log file.
 *
 * For redaction tests see logger-redaction.test.ts.
 */

import { describe, it, expect, vi, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Electron mock — controllable userData path.
// This file does NOT mock @main/logger so we can exercise the real module.
// ---------------------------------------------------------------------------
const FAKE_USER_DATA = path.join(os.tmpdir(), 'ct-log-sec-' + process.pid);

vi.mock('electron', () => ({
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), send: vi.fn() },
  ipcMain:     { handle: vi.fn(), on: vi.fn() },
  app: {
    getPath: vi.fn((key: string) => (key === 'userData' ? FAKE_USER_DATA : '/tmp')),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  Notification: { isSupported: vi.fn(() => false) },
}));

afterAll(() => {
  try { fs.rmSync(FAKE_USER_DATA, { recursive: true, force: true }); } catch { /* ok */ }
});

// ---------------------------------------------------------------------------
// Deterministic flush wait: the logger writes via an async fs.WriteStream, so
// the file may not exist the instant after a log call. A fixed setTimeout races
// the stream under full-suite CPU load. Poll for the sentinel instead, bounded.
// ---------------------------------------------------------------------------
async function waitForSentinel(file: string, sentinel: string, timeoutMs = 2000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes(sentinel)) return content;
    } catch { /* file not created yet */ }
    if (Date.now() >= deadline) {
      // Final read so the caller's assertion reports the real content (or throws ENOENT).
      return fs.readFileSync(file, 'utf-8');
    }
    await new Promise(r => setTimeout(r, 10));
  }
}

// ---------------------------------------------------------------------------
// Test 1: log path is under userData, not project dir
// ---------------------------------------------------------------------------
describe('logger.init path', () => {
  it('creates the logs directory under userData/logs, not under the project dir argument', async () => {
    vi.resetModules();
    const { log } = await import('@main/logger');

    const projectDir = path.join(os.tmpdir(), 'ct-test-project-' + process.pid);
    log.init(projectDir);

    // mkdirSync is synchronous — the directory exists immediately after init.
    const expectedLogsDir = path.join(FAKE_USER_DATA, 'logs');
    expect(fs.existsSync(expectedLogsDir)).toBe(true);

    // Must NOT create anything under the project dir
    const projectLogsDir = path.join(projectDir, '.claude-terminal');
    expect(fs.existsSync(projectLogsDir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 2: logger.init is idempotent
// ---------------------------------------------------------------------------
describe('logger.init idempotency', () => {
  it('does not re-wipe the log on a second init call with a different dir', async () => {
    vi.resetModules();
    const { log } = await import('@main/logger');

    const dir1 = path.join(os.tmpdir(), 'ct-proj-a-' + process.pid);
    const dir2 = path.join(os.tmpdir(), 'ct-proj-b-' + process.pid);

    log.init(dir1);

    const logFile = path.join(FAKE_USER_DATA, 'logs', 'main.log');

    log.info('SENTINEL_LINE_MARKER');
    // Wait for the async write stream to flush the sentinel to disk.
    const contentAfterFirst = await waitForSentinel(logFile, 'SENTINEL_LINE_MARKER');
    expect(contentAfterFirst).toContain('SENTINEL_LINE_MARKER');

    // Second init: must be a no-op (no re-wipe). The sentinel must still be present.
    log.init(dir2);
    const contentAfterSecond = await waitForSentinel(logFile, 'SENTINEL_LINE_MARKER');
    expect(contentAfterSecond).toContain('SENTINEL_LINE_MARKER');
  });
});
