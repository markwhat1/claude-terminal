import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));
vi.mock('@main/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { WebRemoteServer, type WebRemoteServerDeps } from '@main/web-remote-server';
import type { TabManager } from '@main/tab-manager';
import type { PtyManager } from '@main/pty-manager';
import type { AppState } from '@main/ipc-handlers';

function makeMockDeps(): WebRemoteServerDeps {
  const mockProc = { pid: 9999, onData: vi.fn(), onExit: vi.fn() };

  return {
    tabManager: {
      createTab: vi.fn(() => ({ id: 'tab-new', name: 'Tab', cwd: '/test', worktree: null, pid: null, type: 'claude', projectId: '' })),
      getTab: vi.fn((id: string) => ({ id, name: 'Tab', cwd: '/test', worktree: null, pid: null, type: 'claude', projectId: '' })),
      getAllTabs: vi.fn(() => []),
      getActiveTabId: vi.fn(() => null),
      setActiveTab: vi.fn(),
      rename: vi.fn(),
      removeTab: vi.fn(),
    } as unknown as TabManager,
    ptyManager: {
      spawn: vi.fn(() => mockProc),
      write: vi.fn(),
      getSize: vi.fn(),
    } as unknown as PtyManager,
    state: {
      workspaceDir: '/test',
      permissionMode: 'bypassPermissions',
      worktreeManager: null,
      hookInstaller: null,
      hookConfigStore: null,
      hookEngine: null,
      mainWindow: null,
      cliStartDir: null,
      pipeName: '\\\\.\\pipe\\test-pipe',
    } as AppState,
    sendToRenderer: vi.fn(),
    persistSessions: vi.fn(),
    serializeTerminal: vi.fn(async () => ''),
    wirePtyToTab: vi.fn(),
    settings: { addRecentDir: vi.fn(async () => {}) },
  };
}

// Helper: call handleMessage directly via private method on authenticated client
function createTestClient(server: WebRemoteServer) {
  const sentMessages: any[] = [];
  const mockWs = {
    readyState: 1, // WebSocket.OPEN
    send: vi.fn((data: string) => sentMessages.push(JSON.parse(data))),
    close: vi.fn(),
    on: vi.fn(),
  };

  return {
    sendMessage: async (msg: any) => {
      await (server as any).handleMessage({ ws: mockWs, authenticated: true, synced: true }, msg);
    },
    sentMessages,
    mockWs,
  };
}

describe('WebRemoteServer handleMessage', () => {
  let deps: WebRemoteServerDeps;
  let server: WebRemoteServer;

  beforeEach(() => {
    deps = makeMockDeps();
    server = new WebRemoteServer(deps);
  });

  describe('tab:create', () => {
    it('creates a tab and spawns a PTY', async () => {
      const { sendMessage, sentMessages } = createTestClient(server);
      await sendMessage({ type: 'tab:create' });

      expect(deps.tabManager.createTab).toHaveBeenCalledWith('/test', null, 'claude');
      expect(deps.ptyManager.spawn).toHaveBeenCalledWith(
        'tab-new', '/test', expect.any(Array), expect.any(Object),
      );
      expect(deps.wirePtyToTab).toHaveBeenCalledWith(
        expect.anything(), expect.objectContaining({ id: 'tab-new' }), '/test',
      );
      expect(sentMessages).toContainEqual(
        expect.objectContaining({ type: 'tab:created', tab: expect.objectContaining({ id: 'tab-new' }) }),
      );
    });

    it('ignores when workspaceDir is null', async () => {
      deps.state.workspaceDir = null;
      const { sendMessage } = createTestClient(server);
      await sendMessage({ type: 'tab:create' });

      expect(deps.tabManager.createTab).not.toHaveBeenCalled();
    });
  });

  describe('tab:createWithWorktree', () => {
    it('ignores when worktreeManager is null', async () => {
      const { sendMessage } = createTestClient(server);
      await sendMessage({ type: 'tab:createWithWorktree', name: 'my-feature' });

      // Tab is NOT created because worktreeManager is null
      expect(deps.tabManager.createTab).not.toHaveBeenCalled();
    });

    it('creates tab immediately and responds with tab:created', async () => {
      deps.state.worktreeManager = {
        getCurrentBranch: vi.fn(async () => 'main'),
        createAsync: vi.fn(async () => '/test/.claude/worktrees/feat'),
      } as any;

      const { sendMessage, sentMessages } = createTestClient(server);
      await sendMessage({ type: 'tab:createWithWorktree', name: 'feat' });

      expect(deps.tabManager.createTab).toHaveBeenCalled();
      expect(sentMessages).toContainEqual(
        expect.objectContaining({ type: 'tab:created' }),
      );
    });
  });

  describe('worktree:currentBranch', () => {
    it('returns empty string when worktreeManager is null', async () => {
      const { sendMessage, sentMessages } = createTestClient(server);
      await sendMessage({ type: 'worktree:currentBranch' });

      expect(sentMessages).toContainEqual({ type: 'worktree:currentBranch', branch: '' });
    });

    it('returns branch name when worktreeManager exists', async () => {
      deps.state.worktreeManager = {
        getCurrentBranch: vi.fn(async () => 'main'),
      } as any;

      const { sendMessage, sentMessages } = createTestClient(server);
      await sendMessage({ type: 'worktree:currentBranch' });

      expect(sentMessages).toContainEqual({ type: 'worktree:currentBranch', branch: 'main' });
    });
  });

  describe('unknown message type', () => {
    it('logs a warning for an unknown type and does not throw', async () => {
      // This pins the no-generic-passthrough invariant: program-board:getState
      // is handled locally via ipcMain.handle and must never be processed
      // through the WebSocket bridge's handleMessage switch.
      const { sendMessage } = createTestClient(server);

      // Must not throw
      await expect(sendMessage({ type: 'program-board:getState' })).resolves.toBeUndefined();

      // The default case logs a warning
      const { log: mockLog } = await import('@main/logger');
      expect((mockLog as any).warn).toHaveBeenCalled();
    });

    it('logs a warning for any other unknown type', async () => {
      const { sendMessage } = createTestClient(server);
      await expect(sendMessage({ type: 'not:a:real:channel' })).resolves.toBeUndefined();
      const { log: mockLog } = await import('@main/logger');
      expect((mockLog as any).warn).toHaveBeenCalled();
    });

    it('capture:count is LOCAL-ONLY: handleMessage has no case for it', async () => {
      // The explicit remote decision (PLAN.md 3.5 / AGENTS.md): capture:append is
      // remote-enabled with validation, but the Inbox glance count stays local
      // (Home is desktop-only in Phase 1). A future generic passthrough would
      // break this test rather than the privacy boundary.
      const { sendMessage } = createTestClient(server);
      await expect(sendMessage({ type: 'capture:count' })).resolves.toBeUndefined();
      const { log: mockLog } = await import('@main/logger');
      expect((mockLog as any).warn).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // M12: remote capture:append (REMOTE-ENABLED with SERVER-SIDE VALIDATION)
  // -------------------------------------------------------------------------
  describe('capture:append (remote, server-side validation)', () => {
    let captureDir: string;

    beforeEach(() => {
      captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-capture-'));
      deps.captureDir = captureDir;
      server = new WebRemoteServer(deps);
    });

    afterEach(() => {
      fs.rmSync(captureDir, { recursive: true, force: true });
    });

    function todosPath(): string {
      return path.join(captureDir, 'dashboard', 'todos.json');
    }
    function readItems(): Array<{ text: string }> {
      if (!fs.existsSync(todosPath())) return [];
      return JSON.parse(fs.readFileSync(todosPath(), 'utf-8')).items;
    }

    it('persists a valid capture and replies with the new count', async () => {
      const { sendMessage, sentMessages } = createTestClient(server);
      await sendMessage({ type: 'capture:append', text: 'call from the phone' });
      expect(readItems().map((i) => i.text)).toEqual(['call from the phone']);
      expect(sentMessages).toContainEqual({ type: 'capture:appended', ok: true, count: 1 });
    });

    it('writes under captureDir (userData), NOT the workspace git tree', () => {
      const workspaceRoot = path.resolve(path.join(__dirname, '..', '..'));
      expect(todosPath().startsWith(workspaceRoot)).toBe(false);
    });

    it('REJECTS an over-length capture server-side (never writes)', async () => {
      const { sendMessage, sentMessages } = createTestClient(server);
      await sendMessage({ type: 'capture:append', text: 'a'.repeat(2001) });
      expect(fs.existsSync(todosPath())).toBe(false);
      expect(sentMessages).toContainEqual({ type: 'capture:appended', ok: false, count: null });
    });

    it('REJECTS a non-string capture server-side (the typeof guard)', async () => {
      const { sendMessage, sentMessages } = createTestClient(server);
      await sendMessage({ type: 'capture:append', text: { evil: true } });
      expect(fs.existsSync(todosPath())).toBe(false);
      expect(sentMessages).toContainEqual({ type: 'capture:appended', ok: false, count: null });
    });

    it('REJECTS a control-byte capture server-side (never writes)', async () => {
      const { sendMessage, sentMessages } = createTestClient(server);
      await sendMessage({ type: 'capture:append', text: 'wipe\x1b[2Jthis' });
      expect(fs.existsSync(todosPath())).toBe(false);
      expect(sentMessages).toContainEqual({ type: 'capture:appended', ok: false, count: null });
    });

    it('REJECTS a missing text field server-side (never writes)', async () => {
      const { sendMessage, sentMessages } = createTestClient(server);
      await sendMessage({ type: 'capture:append' });
      expect(fs.existsSync(todosPath())).toBe(false);
      expect(sentMessages).toContainEqual({ type: 'capture:appended', ok: false, count: null });
    });
  });
});
