/**
 * M0b-ii: Logger DevTools mirror gate.
 *
 * The emit function writes to disk via writeToFile unconditionally, but
 * only mirrors to the renderer console (executeJavaScript) for warn/error.
 * debug and info are intentionally disk-only to avoid rendering ephemeral
 * process data in a console that stays open across a session.
 *
 * Tests:
 *  1. executeJavaScript does NOT receive debug or info calls.
 *  2. executeJavaScript DOES receive warn and error calls.
 *  3. debug/info still reach disk (writeToFile stays unconditional).
 */

import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Electron mock — each describe block gets its own module via vi.resetModules().
// ---------------------------------------------------------------------------
const FAKE_USER_DATA = path.join(os.tmpdir(), 'ct-mirror-gate-' + process.pid);

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
// Helper: fresh logger + attached fake window for each test.
// ---------------------------------------------------------------------------
async function makeLog() {
  vi.resetModules();
  const { log } = await import('@main/logger');
  log.init('/some/project');

  const mockExecuteJS = vi.fn().mockResolvedValue(undefined);
  const fakeWindow = {
    isDestroyed: vi.fn(() => false),
    webContents: { executeJavaScript: mockExecuteJS },
  } as any;
  log.attach(fakeWindow);

  return { log, mockExecuteJS };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('logger mirror gate (M0b-ii)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executeJavaScript does NOT receive debug messages', async () => {
    const { log, mockExecuteJS } = await makeLog();
    log.debug('this should not reach devtools');

    const jsCalls = mockExecuteJS.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(jsCalls.some(s => s.includes('debug'))).toBe(false);
  });

  it('executeJavaScript does NOT receive info messages', async () => {
    const { log, mockExecuteJS } = await makeLog();
    log.info('info is disk-only');

    const jsCalls = mockExecuteJS.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(jsCalls.some(s => s.includes('info'))).toBe(false);
  });

  it('executeJavaScript DOES receive warn messages', async () => {
    const { log, mockExecuteJS } = await makeLog();
    log.warn('a warning message');

    const jsCalls = mockExecuteJS.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(jsCalls.some(s => s.includes('warn'))).toBe(true);
  });

  it('executeJavaScript DOES receive error messages', async () => {
    const { log, mockExecuteJS } = await makeLog();
    log.error('an error message');

    const jsCalls = mockExecuteJS.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(jsCalls.some(s => s.includes('error'))).toBe(true);
  });

  it('debug still reaches disk (writeToFile unconditional)', async () => {
    const { log, mockExecuteJS } = await makeLog();
    const logFile = path.join(FAKE_USER_DATA, 'logs', 'main.log');

    log.debug('disk-only-debug-sentinel');
    // Allow stream to flush
    await new Promise(r => setTimeout(r, 30));

    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toContain('disk-only-debug-sentinel');

    // And it must NOT have gone to executeJavaScript
    const jsCalls = mockExecuteJS.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(jsCalls.some(s => s.includes('disk-only-debug-sentinel'))).toBe(false);
  });

  it('info still reaches disk (writeToFile unconditional)', async () => {
    const { log, mockExecuteJS } = await makeLog();
    const logFile = path.join(FAKE_USER_DATA, 'logs', 'main.log');

    log.info('disk-only-info-sentinel');
    await new Promise(r => setTimeout(r, 30));

    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toContain('disk-only-info-sentinel');

    const jsCalls = mockExecuteJS.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(jsCalls.some(s => s.includes('disk-only-info-sentinel'))).toBe(false);
  });
});
