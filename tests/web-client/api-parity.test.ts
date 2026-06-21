// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { WebSocketBridge } from '../../src/web-client/ws-bridge';

// The shared UI reads window.claudeTerminal, which is the preload api locally
// and the bridge api remotely. If the bridge ever drops a stub for a method the
// shared components call, the web client and native remote mode crash at runtime.
// (preload.ts can't be imported here — it pulls electron — so this is a curated
// list of the methods the shared components actually invoke.)
const REQUIRED_METHODS = [
  'onTabUpdate', 'onTabRemoved', 'onTabSwitched', 'onPtyData', 'onPtyResized',
  'onWorktreeProgress', 'onDisconnect', 'onUpdateAvailable', 'onRemoteAccessUpdate',
  'switchTab', 'renameTab', 'createTab', 'createTabWithWorktree',
  'writeToPty', 'resizePty', 'pausePty', 'resumePty',
  'getCurrentBranch', 'getUpdateInfo',
  'getRemoteTransport', 'setRemoteTransport',
  'getRemoteConnection', 'setRemoteConnection', 'clearRemoteConnection',
  'activateRemoteAccess', 'deactivateRemoteAccess', 'getRemoteAccessInfo', 'regenerateRemoteCode',
  'getRecentDirs', 'removeRecentDir', 'getPermissionMode', 'getDefaultShell', 'setDefaultShell',
  'getHookConfig', 'saveHookConfig', 'onHookStatus', 'setWindowTitle', 'openExternal',
];

describe('WebSocketBridge api parity', () => {
  it('stubs every method the shared UI calls via window.claudeTerminal', () => {
    const api = new WebSocketBridge().api as Record<string, unknown>;
    const missing = REQUIRED_METHODS.filter((m) => typeof api[m] !== 'function');
    expect(missing).toEqual([]);
  });
});
