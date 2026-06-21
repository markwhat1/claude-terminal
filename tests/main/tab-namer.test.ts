import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock logger (uses Electron internals)
vi.mock('@main/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Mock child_process.execFile
// vi.hoisted ensures these are available inside the hoisted vi.mock factory
const { mockStdin, mockChild, mockExecFile } = vi.hoisted(() => {
  const mockStdin = { write: vi.fn(), end: vi.fn() };
  const mockChild = { stdin: mockStdin, pid: 9999 };
  const mockExecFile = vi.fn((...args: any[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') {
      setTimeout(() => cb(null, '  Fix Auth Bug  ', ''), 0);
    }
    return mockChild;
  });
  return { mockStdin, mockChild, mockExecFile };
});
vi.mock('node:child_process', () => ({
  default: { execFile: mockExecFile },
  execFile: mockExecFile,
}));

import { createTabNamer } from '@main/tab-namer';
import type { TabManager } from '@main/tab-manager';

function makeMockDeps() {
  const tabManager = {
    getTab: vi.fn(),
    rename: vi.fn(),
  } as unknown as TabManager;
  const sendToRenderer = vi.fn();
  const persistSessions = vi.fn();
  return { tabManager, sendToRenderer, persistSessions };
}

describe('cleanupNamingFlag', () => {
  it('deletes the flag file for the given tabId', () => {
    const deps = makeMockDeps();
    const { cleanupNamingFlag } = createTabNamer(deps);
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

    cleanupNamingFlag('tab-123');

    const expected = path.join(os.tmpdir(), 'claude-terminal-named-tab-123');
    expect(unlinkSpy).toHaveBeenCalledWith(expected);
    unlinkSpy.mockRestore();
  });

  it('does not throw if file does not exist', () => {
    const deps = makeMockDeps();
    const { cleanupNamingFlag } = createTabNamer(deps);
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(() => cleanupNamingFlag('tab-missing')).not.toThrow();
    unlinkSpy.mockRestore();
  });
});

describe('generateTabName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply execFile mock implementation after clearAllMocks wipes it
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') {
        setTimeout(() => cb(null, '  Fix Auth Bug  ', ''), 0);
      }
      return mockChild;
    });
  });

  it('calls execFile and renames tab on success', async () => {
    const deps = makeMockDeps();
    const tab = { id: 'tab-1', name: 'Tab 1' };
    (deps.tabManager.getTab as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(tab)   // check tab exists
      .mockReturnValueOnce(tab);  // get updated tab
    const { generateTabName } = createTabNamer(deps);

    generateTabName('tab-1', 'Fix the auth bug');

    // Wait for the async callback
    await new Promise(r => setTimeout(r, 50));

    expect(deps.tabManager.rename).toHaveBeenCalledWith('tab-1', 'Fix Auth Bug');
    expect(deps.sendToRenderer).toHaveBeenCalledWith('tab:updated', tab);
    expect(deps.persistSessions).toHaveBeenCalled();
  });

  it('writes prompt to stdin', async () => {
    const deps = makeMockDeps();
    const { generateTabName } = createTabNamer(deps);

    generateTabName('tab-1', 'Hello world');

    // callHaikuForName runs inside a .then() — flush the microtask queue
    await new Promise(r => setTimeout(r, 0));

    expect(mockStdin.write).toHaveBeenCalledWith(
      expect.stringContaining('Hello world'),
    );
    expect(mockStdin.end).toHaveBeenCalled();
  });

  it('does not rename if tab no longer exists', async () => {
    const deps = makeMockDeps();
    (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const { generateTabName } = createTabNamer(deps);

    generateTabName('tab-gone', 'test');
    await new Promise(r => setTimeout(r, 50));

    expect(deps.tabManager.rename).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// M19 / R-14: the tab-namer gate for dashboard-injected tabs
//
// When the free-text query opt-in is enabled, a dashboard-injected tab's namer
// prompt must NOT reach Haiku unscrubbed. The wiring suppresses the namer call
// entirely for those tabs. These tests assert the gate at the namer seam: a
// suppressed tab never spawns the Haiku subprocess (no execFile, no stdin write).
// ---------------------------------------------------------------------------

describe('generateTabName -- R-14 dashboard-injected gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') {
        setTimeout(() => cb(null, '  Fix Auth Bug  ', ''), 0);
      }
      return mockChild;
    });
  });

  it('suppresses the Haiku call for a dashboard-injected tab when the opt-in is ON', async () => {
    const deps = makeMockDeps();
    const { generateTabName } = createTabNamer({
      ...deps,
      isDashboardInjectedTab: (id) => id === 'tab-dash',
      isFreeTextOptInEnabled: () => true,
    });

    generateTabName('tab-dash', 'Draft the portal note for patient 303-986-9337');
    await new Promise((r) => setTimeout(r, 50));

    // No Haiku subprocess: the free text never reached the LLM.
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockStdin.write).not.toHaveBeenCalled();
    expect(deps.tabManager.rename).not.toHaveBeenCalled();
  });

  it('does NOT suppress a dashboard-injected tab when the opt-in is OFF (the shipped state)', async () => {
    const deps = makeMockDeps();
    const { generateTabName } = createTabNamer({
      ...deps,
      isDashboardInjectedTab: (id) => id === 'tab-dash',
      isFreeTextOptInEnabled: () => false,
    });

    generateTabName('tab-dash', 'Review the open TODOs in this repo.');
    await new Promise((r) => setTimeout(r, 50));

    // The canned query is PHI-free, so the namer runs as it does today.
    expect(mockExecFile).toHaveBeenCalled();
    expect(mockStdin.write).toHaveBeenCalled();
  });

  it('does NOT suppress an ordinary (non-dashboard) tab even when the opt-in is ON', async () => {
    const deps = makeMockDeps();
    const { generateTabName } = createTabNamer({
      ...deps,
      isDashboardInjectedTab: () => false,
      isFreeTextOptInEnabled: () => true,
    });

    generateTabName('tab-ordinary', 'Fix the auth bug');
    await new Promise((r) => setTimeout(r, 50));

    expect(mockExecFile).toHaveBeenCalled();
    expect(mockStdin.write).toHaveBeenCalled();
  });

  it('runs the namer normally when the gate deps are absent (backward compatible)', async () => {
    const deps = makeMockDeps();
    const { generateTabName } = createTabNamer(deps);

    generateTabName('tab-1', 'Hello world');
    await new Promise((r) => setTimeout(r, 50));

    expect(mockExecFile).toHaveBeenCalled();
    expect(mockStdin.write).toHaveBeenCalled();
  });
});
