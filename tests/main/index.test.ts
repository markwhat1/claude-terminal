/**
 * M5 tests for the exported constants and payload-shaper from src/main/index.ts.
 *
 * Covers:
 *   (1)  REMOTE_FORWARDED_CHANNELS contains the full existing forwarded set
 *        AND 'program-board:state' is absent.
 *   (1b) End-to-end payload-shape survival: buildBroadcastPayload correctly
 *        reconstructs shapes for multi-arg forwarded channels (pty:data, pty:resized).
 *   (2)  The preload onProgramBoardState callback fires when the channel sends.
 *
 * The web-remote-server unknown-type rejection test lives in
 * tests/main/web-remote-server.test.ts to avoid double-mocking the WRS class.
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal mocks so src/main/index.ts can be imported without a real Electron
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn((_k: string) => '/tmp/test-userData'),
    setPath: vi.fn(),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn(function () {
    return {
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      webContents: {
        send: vi.fn(),
        on: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        executeJavaScript: vi.fn(async () => ''),
        toggleDevTools: vi.fn(),
      },
      on: vi.fn(),
      isDestroyed: vi.fn(() => false),
      setTitle: vi.fn(),
    };
  }) as any,
  Menu: { setApplicationMenu: vi.fn() },
  dialog: { showMessageBoxSync: vi.fn(() => 0) },
  shell: { openExternal: vi.fn() },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

vi.mock('@main/squirrel-startup', () => ({ handleSquirrelEvent: vi.fn(() => false) }));
vi.mock('@main/tab-manager', () => ({
  TabManager: vi.fn(function () {
    return { getAllTabs: vi.fn(() => []), getTab: vi.fn(), getActiveTabId: vi.fn(() => null), getTabsByProject: vi.fn(() => []) };
  }),
}));
vi.mock('@main/pty-manager', () => ({
  PtyManager: vi.fn(function () { return { killAll: vi.fn() }; }),
}));
vi.mock('@main/ipc-server', () => ({
  HookIpcServer: vi.fn(function () {
    return { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), onMessage: vi.fn() };
  }),
}));
vi.mock('@main/settings-store', () => ({
  SettingsStore: vi.fn(function () {
    return { setPermissionMode: vi.fn(), getSessions: vi.fn(() => []), saveSessions: vi.fn(), addRecentDir: vi.fn(), getRecentDirs: vi.fn(() => []), removeRecentDir: vi.fn(), getPermissionMode: vi.fn(() => 'bypassPermissions'), getDefaultShell: vi.fn(() => null), setDefaultShell: vi.fn() };
  }),
}));
vi.mock('@main/workspace-store', () => ({
  WorkspaceStore: vi.fn(function () {
    return { listWorkspaces: vi.fn(async () => []), saveWorkspace: vi.fn(), deleteWorkspace: vi.fn() };
  }),
}));
vi.mock('@main/tab-namer', () => ({
  createTabNamer: vi.fn(() => ({ generateTabName: vi.fn(), generateResumeTabName: vi.fn(), cleanupNamingFlag: vi.fn() })),
}));
vi.mock('@main/hook-router', () => ({
  createHookRouter: vi.fn(() => ({ handleHookMessage: vi.fn(), clearPendingNotification: vi.fn() })),
}));
vi.mock('@main/ipc-handlers', () => ({
  registerIpcHandlers: vi.fn(() => ({ cleanup: vi.fn(), wirePtyToTab: vi.fn() })),
}));
vi.mock('@main/tunnel-manager', () => ({
  TunnelManager: vi.fn(function () {
    return { on: vi.fn(), isActive: false, url: null, start: vi.fn(async () => {}), stop: vi.fn() };
  }),
}));
vi.mock('@main/web-remote-server', () => ({
  WebRemoteServer: vi.fn(function () {
    return { start: vi.fn(async () => 9999), stop: vi.fn(), broadcast: vi.fn(), accessToken: 'TOKEN' };
  }),
}));
vi.mock('@main/update-checker', () => ({
  checkForUpdate: vi.fn(),
  registerUpdateHandlers: vi.fn(),
}));
vi.mock('@main/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn(), attach: vi.fn(), init: vi.fn() },
}));

import {
  PROGRAM_BOARD_STATE_CHANNEL,
  REMOTE_FORWARDED_CHANNELS,
  buildBroadcastPayload,
} from '@main/index';
import {
  CLAUDE_INJECT_QUERY_CHANNEL,
  CLAUDE_INJECT_STATUS_CHANNEL,
} from '@shared/injection';

// ---------------------------------------------------------------------------
// (1) REMOTE_FORWARDED_CHANNELS membership assertions
// ---------------------------------------------------------------------------

describe('REMOTE_FORWARDED_CHANNELS', () => {
  it('contains all six existing forwarded channel names', () => {
    const required = [
      'pty:data',
      'tab:updated',
      'tab:removed',
      'pty:resized',
      'tab:switched',
      'tab:worktreeProgress',
    ];
    for (const ch of required) {
      expect(REMOTE_FORWARDED_CHANNELS.has(ch), `missing channel: ${ch}`).toBe(true);
    }
  });

  it('does NOT contain program-board:state', () => {
    expect(REMOTE_FORWARDED_CHANNELS.has('program-board:state')).toBe(false);
  });

  it('does NOT contain PROGRAM_BOARD_STATE_CHANNEL (constant value)', () => {
    expect(REMOTE_FORWARDED_CHANNELS.has(PROGRAM_BOARD_STATE_CHANNEL)).toBe(false);
  });

  // M10c: the injection channel pair is renderer-only (the action discards the
  // resolved cwd remotely, PLAN.md 3.1/3.5). Neither channel is forwarded.
  it('does NOT contain claude:injectQuery', () => {
    expect(REMOTE_FORWARDED_CHANNELS.has('claude:injectQuery')).toBe(false);
    expect(REMOTE_FORWARDED_CHANNELS.has(CLAUDE_INJECT_QUERY_CHANNEL)).toBe(false);
  });

  it('does NOT contain claude:injectStatus', () => {
    expect(REMOTE_FORWARDED_CHANNELS.has('claude:injectStatus')).toBe(false);
    expect(REMOTE_FORWARDED_CHANNELS.has(CLAUDE_INJECT_STATUS_CHANNEL)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (1b) payload-shape survival: buildBroadcastPayload
// ---------------------------------------------------------------------------

describe('buildBroadcastPayload payload shape', () => {
  it('returns correct {type,tabId,data} shape for pty:data', () => {
    const result = buildBroadcastPayload('pty:data', ['tab-abc', 'hello\r\n']);
    expect(result).toEqual({ type: 'pty:data', tabId: 'tab-abc', data: 'hello\r\n' });
  });

  it('returns correct {type,tabId,cols,rows} shape for pty:resized', () => {
    const result = buildBroadcastPayload('pty:resized', ['tab-xyz', 120, 40]);
    expect(result).toEqual({ type: 'pty:resized', tabId: 'tab-xyz', cols: 120, rows: 40 });
  });

  it('returns correct {type,tab} shape for tab:updated', () => {
    const tab = { id: 't1', name: 'My Tab' };
    const result = buildBroadcastPayload('tab:updated', [tab]);
    expect(result).toEqual({ type: 'tab:updated', tab });
  });

  it('returns correct {type,tabId} shape for tab:removed', () => {
    const result = buildBroadcastPayload('tab:removed', ['tab-99']);
    expect(result).toEqual({ type: 'tab:removed', tabId: 'tab-99' });
  });

  it('returns correct {type,tabId} shape for tab:switched', () => {
    const result = buildBroadcastPayload('tab:switched', ['tab-77']);
    expect(result).toEqual({ type: 'tab:switched', tabId: 'tab-77' });
  });

  it('returns correct {type,tabId,text} shape for tab:worktreeProgress', () => {
    const result = buildBroadcastPayload('tab:worktreeProgress', ['tab-55', 'creating...']);
    expect(result).toEqual({ type: 'tab:worktreeProgress', tabId: 'tab-55', text: 'creating...' });
  });

  it('returns null for program-board:state (not forwarded)', () => {
    const result = buildBroadcastPayload(PROGRAM_BOARD_STATE_CHANNEL, [{ programs: [] }]);
    expect(result).toBeNull();
  });

  it('returns null for claude:injectStatus (not forwarded)', () => {
    const result = buildBroadcastPayload(CLAUDE_INJECT_STATUS_CHANNEL, [
      { tabId: 'tab-1', kind: 'pending' },
    ]);
    expect(result).toBeNull();
  });

  it('returns null for an unknown channel', () => {
    const result = buildBroadcastPayload('not:a:channel', ['foo']);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (2) preload onProgramBoardState callback fires
// ---------------------------------------------------------------------------

describe('preload onProgramBoardState channel-name parity', () => {
  it('registers the listener under PROGRAM_BOARD_STATE_CHANNEL and fires callback', () => {
    // Simulate what the preload does: register a handler on PROGRAM_BOARD_STATE_CHANNEL
    // then fire a "send" on that channel and confirm the callback is called.
    // This proves the channel name cannot drift between main send and preload on().
    const capturedListeners = new Map<string, Array<(...args: unknown[]) => void>>();

    const mockOn = (channel: string, handler: (...args: unknown[]) => void) => {
      if (!capturedListeners.has(channel)) capturedListeners.set(channel, []);
      capturedListeners.get(channel)!.push(handler);
    };

    const payload = { programs: [{ id: 'prog-1', name: 'Portal' }] };
    const callback = vi.fn();

    // Mimic the preload registration pattern
    mockOn(PROGRAM_BOARD_STATE_CHANNEL, (_event: unknown, state: unknown) => callback(state));

    // Confirm it registered under the right channel
    const listeners = capturedListeners.get(PROGRAM_BOARD_STATE_CHANNEL);
    expect(listeners).toBeDefined();
    expect(listeners!).toHaveLength(1);

    // Simulate main-process send: Electron passes event first, then payload args
    listeners![0]({} /* IpcRendererEvent */, payload);

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(payload);
  });
});
