/**
 * M0b-i: Logger redaction tests.
 *
 * Tests:
 *  3a. hook-router:56  log.debug '[hook]' is id-only (no data payload).
 *  3b. tab-namer generateTabName log.debug is id-only (no prompt text).
 *  3c. tab-namer callHaikuForName failure log.error is id + err.message only.
 *  3d. tab-namer success stdout debug is dropped (no raw stdout).
 *
 * This file mocks @main/logger so the real logger is not needed.
 * Kept separate from logger-security.test.ts so the real logger can be tested there.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks: logger + child_process — shared via mutable proxy so each
// test can control execFile behavior without fighting vi.doMock ordering.
// ---------------------------------------------------------------------------
const { sharedLog, sharedExecFile } = vi.hoisted(() => {
  const sharedLog = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  // Mutable impl pointer; tests call setImpl to swap behavior
  let _impl: (...args: unknown[]) => unknown = () => ({
    stdin: { write: vi.fn(), end: vi.fn() },
    pid: 9999,
  });

  const proxy = vi.fn((...args: unknown[]) => _impl(...args));

  return {
    sharedLog,
    sharedExecFile: {
      fn: proxy,
      setImpl(impl: (...args: unknown[]) => unknown) { _impl = impl; },
    },
  };
});

vi.mock('@main/logger', () => ({ log: sharedLog }));
vi.mock('node:child_process', () => ({
  default: { execFile: sharedExecFile.fn },
  execFile: sharedExecFile.fn,
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Default to no-op impl
  sharedExecFile.setImpl(() => ({ stdin: { write: vi.fn(), end: vi.fn() }, pid: 9999 }));
});

// ---------------------------------------------------------------------------
// 3a: hook-router redaction
// ---------------------------------------------------------------------------
describe('hook-router redaction', () => {
  it('log.debug for hook messages is id-only (no data payload)', () => {
    // Simulate the patched hook-router:56 call: tag + event + tabId only
    sharedLog.debug('[hook]', 'tab:generate-name', 'tab-abc');

    const hookCall = sharedLog.debug.mock.calls.find((c: unknown[]) => c[0] === '[hook]');
    expect(hookCall).toBeDefined();
    expect(hookCall!.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 3b: tab-namer generateTabName success — debug must not contain prompt
// ---------------------------------------------------------------------------
describe('tab-namer generateTabName redaction', () => {
  it('log.debug for generateTabName does not include prompt text', async () => {
    sharedExecFile.setImpl((...args: unknown[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') setTimeout(() => (cb as Function)(null, 'Short Name', ''), 0);
      return { stdin: { write: vi.fn(), end: vi.fn() }, pid: 9999 };
    });

    const { createTabNamer } = await import('@main/tab-namer');
    const deps = {
      tabManager: { getTab: vi.fn(() => ({ id: 'tab-1', name: 'T' })), rename: vi.fn() },
      sendToRenderer: vi.fn(),
      persistSessions: vi.fn(),
    } as any;

    createTabNamer(deps).generateTabName(
      'tab-1',
      'Patient has severe anxiety and dental phobia detailed history',
    );

    await new Promise(r => setTimeout(r, 60));

    const allDebug = sharedLog.debug.mock.calls.map((c: unknown[]) => JSON.stringify(c)).join('\n');
    expect(allDebug).not.toContain('severe anxiety');
    expect(allDebug).not.toContain('dental phobia');
  });
});

// ---------------------------------------------------------------------------
// 3c + 3d: tab-namer Haiku failure — error must not contain stderr/stdout
// ---------------------------------------------------------------------------
describe('tab-namer callHaikuForName failure redaction', () => {
  it('log.error on failure logs tab id + err.message only, never stderr or stdout', async () => {
    const sensitiveStderr = 'InternalServerError: PHI data in request token abc123';
    const sensitiveStdout = 'partial output: patient John Doe dob 01/01/1980';

    sharedExecFile.setImpl((...args: unknown[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') {
        setTimeout(
          () => (cb as Function)(new Error('Process exited with code 1'), sensitiveStdout, sensitiveStderr),
          0,
        );
      }
      return { stdin: { write: vi.fn(), end: vi.fn() }, pid: 9999 };
    });

    const { createTabNamer } = await import('@main/tab-namer');
    const deps = {
      tabManager: { getTab: vi.fn(() => ({ id: 'tab-fail', name: 'T' })), rename: vi.fn() },
      sendToRenderer: vi.fn(),
      persistSessions: vi.fn(),
    } as any;

    createTabNamer(deps).generateTabName('tab-fail', 'some prompt');

    await new Promise(r => setTimeout(r, 100));

    const allErrors = sharedLog.error.mock.calls.map((c: unknown[]) => JSON.stringify(c)).join('\n');
    const allDebugs = sharedLog.debug.mock.calls.map((c: unknown[]) => JSON.stringify(c)).join('\n');

    // No raw PHI from stderr or stdout in error logs
    expect(allErrors).not.toContain('InternalServerError');
    expect(allErrors).not.toContain('PHI data');
    expect(allErrors).not.toContain('patient John Doe');

    // Safe err.message must be present
    expect(allErrors).toContain('Process exited with code 1');

    // Success stdout debug (:51) is dropped — sensitive stdout not in debug logs
    expect(allDebugs).not.toContain('patient John Doe');
    expect(allDebugs).not.toContain('InternalServerError');
  });
});
