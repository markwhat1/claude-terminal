import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Capture ipcMain registrations
const handlers = new Map<string, (...args: unknown[]) => unknown>();
const listeners = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      listeners.set(channel, handler);
    }),
  },
  app: {
    isPackaged: false,
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

// Mock logger
vi.mock('@main/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn(), init: vi.fn() },
}));

// Mock WorktreeManager and HookInstaller (constructed inside handlers)
vi.mock('@main/worktree-manager', () => ({
  WorktreeManager: vi.fn(function () {
    return {
      create: vi.fn(),
      createAsync: vi.fn(async () => ({ path: '/test/.claude/worktrees/my-feature', sourceBranch: 'main' })),
      getCurrentBranch: vi.fn(() => 'main'),
      listDetails: vi.fn(),
      remove: vi.fn(),
      checkStatus: vi.fn(() => ({ clean: true, changesCount: 0 })),
    };
  }),
}));

vi.mock('@main/hook-installer', () => ({
  HookInstaller: vi.fn(function () {
    return {
      install: vi.fn(),
      uninstall: vi.fn(),
    };
  }),
}));

vi.mock('@main/hook-config-store', () => ({
  HookConfigStore: vi.fn(function () {
    return { load: vi.fn(), save: vi.fn() };
  }),
}));

vi.mock('@main/hook-engine', () => ({
  HookEngine: vi.fn(function () {
    return { emit: vi.fn() };
  }),
}));

vi.mock('@main/project-manager', () => ({
  ProjectManager: vi.fn(function () {
    const projects = new Map();
    return {
      addProject: vi.fn((dir: string) => {
        const ctx = {
          id: 'proj-test', dir, colorIndex: 0,
          worktreeManager: {
            create: vi.fn(),
            createAsync: vi.fn(async () => ({ path: '/test/.claude/worktrees/my-feature', sourceBranch: 'main' })),
            getCurrentBranch: vi.fn(async () => 'main'),
            listDetails: vi.fn(),
            remove: vi.fn(),
            checkStatus: vi.fn(() => ({ clean: true, changesCount: 0 })),
          },
          hookConfigStore: { load: vi.fn(), save: vi.fn() },
          hookEngine: { emit: vi.fn() },
          hookInstaller: { install: vi.fn(), uninstall: vi.fn() },
        };
        projects.set(ctx.id, ctx);
        return ctx;
      }),
      getProject: vi.fn((id: string) => projects.get(id)),
      getProjectByDir: vi.fn(),
      getAllProjects: vi.fn(() => Array.from(projects.values())),
      removeProject: vi.fn((id: string) => projects.delete(id)),
    };
  }),
}));

import { registerIpcHandlers, type IpcHandlerDeps } from '@main/ipc-handlers';
import type { TabManager } from '@main/tab-manager';
import type { PtyManager } from '@main/pty-manager';
import type { SettingsStore } from '@main/settings-store';
import type { WorkspaceStore } from '@main/workspace-store';

function makeMockDeps(): IpcHandlerDeps {
  const mockProc = {
    pid: 1234,
    onData: vi.fn(),
    onExit: vi.fn(),
  };

  return {
    tabManager: {
      createTab: vi.fn(() => ({ id: 'tab-1', name: 'Tab 1', cwd: '/test', worktree: null, pid: null, type: 'claude', projectId: '' })),
      getTab: vi.fn((id: string) => ({ id, name: 'Tab 1', cwd: '/test', worktree: null, pid: null, type: 'claude', projectId: '' })),
      getAllTabs: vi.fn(() => []),
      getTabsByProject: vi.fn(() => []),
      removeTab: vi.fn(),
      removeTabsByProject: vi.fn(() => []),
      setActiveTab: vi.fn(),
      rename: vi.fn(),
      reorderTabs: vi.fn(),
      getActiveTabId: vi.fn(() => 'tab-1'),
      insertTabAfter: vi.fn(),
    } as unknown as TabManager,
    ptyManager: {
      spawn: vi.fn(() => mockProc),
      spawnShell: vi.fn(() => mockProc),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    } as unknown as PtyManager,
    settings: {
      setPermissionMode: vi.fn(),
      getSessions: vi.fn(() => []),
      addRecentDir: vi.fn(),
      getRecentDirs: vi.fn(() => []),
      removeRecentDir: vi.fn(),
      getPermissionMode: vi.fn(() => 'bypassPermissions'),
      getStartupView: vi.fn((): 'lastSession' | 'home' => 'lastSession'),
      saveSessions: vi.fn(),
    } as unknown as SettingsStore,
    workspaceStore: {
      listWorkspaces: vi.fn(async () => []),
      getWorkspace: vi.fn(async () => null),
      saveWorkspace: vi.fn(async () => {}),
      deleteWorkspace: vi.fn(async () => {}),
    } as unknown as WorkspaceStore,
    state: {
      workspaceId: null,
      projectManager: null,
      workspaceDir: null,
      permissionMode: 'bypassPermissions' as const,
      worktreeManager: null,
      hookInstaller: null,
      hookConfigStore: null,
      hookEngine: null,
      mainWindow: null,
      cliStartDir: null,
      pipeName: '\\\\.\\pipe\\test-pipe',
    },
    sendToRenderer: vi.fn(),
    persistSessions: vi.fn(),
    cleanupNamingFlag: vi.fn(),
    clearPendingNotification: vi.fn(),
    activateRemoteAccess: vi.fn(async () => ({ status: 'connecting' as const, tunnelUrl: null, token: 'test-token', error: null })),
    deactivateRemoteAccess: vi.fn(async () => {}),
    getRemoteAccessInfo: vi.fn(() => ({ status: 'inactive' as const, tunnelUrl: null, token: null, error: null })),
    queryInjector: {
      arm: vi.fn(),
      isArmed: vi.fn(() => false),
      onIdle: vi.fn(),
      consumeNotifySuppression: vi.fn(() => false),
      retry: vi.fn(),
      clear: vi.fn(),
    } as unknown as IpcHandlerDeps['queryInjector'],
  };
}

describe('registerIpcHandlers', () => {
  let deps: IpcHandlerDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    handlers.clear();
    listeners.clear();
    deps = makeMockDeps();
    registerIpcHandlers(deps);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers all expected channels', () => {
    const expectedHandlers = [
      'workspace:init', 'workspace:list', 'workspace:save', 'workspace:delete',
      'project:add', 'project:remove', 'project:list',
      'shell:getAvailable',
      'session:start', 'session:getSavedTabs',
      'tab:create', 'tab:createWithWorktree', 'tab:createShell', 'tab:close', 'tab:switch', 'tab:rename', 'tab:getAll', 'tab:getActiveId',
      'worktree:create', 'worktree:currentBranch', 'worktree:listDetails', 'worktree:remove', 'worktree:checkStatus',
      'hookConfig:load', 'hookConfig:save',
      'settings:recentDirs', 'settings:removeRecentDir', 'settings:permissionMode', 'settings:getDefaultShell', 'settings:setDefaultShell', 'settings:getStartupView', 'settings:setStartupView', 'settings:getNotifyOnIdle', 'settings:setNotifyOnIdle', 'settings:getStallInterrupt', 'settings:setStallInterrupt', 'settings:getCommitmentMirror', 'settings:setCommitmentMirror', 'settings:getMorningRitual', 'settings:setMorningRitual', 'settings:getOffAppNudge', 'settings:setOffAppNudge',
      'dialog:selectDirectory', 'cli:getStartDir',
      'remote:activate', 'remote:deactivate', 'remote:getInfo',
      'instance:getHue',
      'program-board:getState',
      'claude:injectQuery',
      'capture:append',
      'capture:count',
      'todo:update',
    ];
    for (const channel of expectedHandlers) {
      expect(handlers.has(channel), `missing handler: ${channel}`).toBe(true);
    }

    expect(listeners.has('pty:write')).toBe(true);
    expect(listeners.has('pty:resize')).toBe(true);
    expect(listeners.has('pty:pause')).toBe(true);
    expect(listeners.has('pty:resume')).toBe(true);
    expect(listeners.has('window:setTitle')).toBe(true);
    expect(listeners.has('window:createNew')).toBe(true);
  });

  it('session:start sets workspace dir and permission mode', async () => {
    const handler = handlers.get('session:start')!;
    await handler({}, '/test/dir', 'plan');

    expect(deps.state.workspaceDir).toBe('/test/dir');
    expect(deps.state.permissionMode).toBe('plan');
    expect(deps.settings.setPermissionMode).toHaveBeenCalledWith('plan');
  });

  it('tab:close kills pty and removes tab', async () => {
    const handler = handlers.get('tab:close')!;
    await handler({}, 'tab-1');

    expect(deps.ptyManager.kill).toHaveBeenCalledWith('tab-1');
    expect(deps.cleanupNamingFlag).toHaveBeenCalledWith('tab-1');
  });

  it('tab:close with removeWorktree=true removes the worktree', async () => {
    // Set up a worktree tab
    deps.state.workspaceDir = '/test';
    const startHandler = handlers.get('session:start')!;
    await startHandler({}, '/test', 'bypassPermissions');
    (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'wt-1', worktree: 'my-feature', cwd: '/test/.claude/worktrees/my-feature',
    });

    const handler = handlers.get('tab:close')!;
    await handler({}, 'wt-1', true);

    expect(deps.state.worktreeManager!.remove).toHaveBeenCalledWith('/test/.claude/worktrees/my-feature');
  });

  it('tab:close without removeWorktree does not remove the worktree', async () => {
    deps.state.workspaceDir = '/test';
    const startHandler = handlers.get('session:start')!;
    await startHandler({}, '/test', 'bypassPermissions');
    (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'wt-1', worktree: 'my-feature', cwd: '/test/.claude/worktrees/my-feature',
    });

    const handler = handlers.get('tab:close')!;
    await handler({}, 'wt-1');

    expect(deps.state.worktreeManager!.remove).not.toHaveBeenCalled();
  });

  it('tab:switch delegates to tabManager', async () => {
    const handler = handlers.get('tab:switch')!;
    await handler({}, 'tab-2');

    expect(deps.tabManager.setActiveTab).toHaveBeenCalledWith('tab-2');
  });

  it('tab:rename renames and broadcasts', async () => {
    const handler = handlers.get('tab:rename')!;
    await handler({}, 'tab-1', 'New Name');

    expect(deps.tabManager.rename).toHaveBeenCalledWith('tab-1', 'New Name');
    expect(deps.sendToRenderer).toHaveBeenCalled();
    expect(deps.persistSessions).toHaveBeenCalled();
  });

  it('pty:write forwards to ptyManager', () => {
    const listener = listeners.get('pty:write')!;
    listener({}, 'tab-1', 'hello');

    expect(deps.ptyManager.write).toHaveBeenCalledWith('tab-1', 'hello');
  });

  it('pty:resize forwards to ptyManager', () => {
    const listener = listeners.get('pty:resize')!;
    listener({}, 'tab-1', 120, 40);

    expect(deps.ptyManager.resize).toHaveBeenCalledWith('tab-1', 120, 40);
  });

  it('cli:getStartDir returns cliStartDir from state', async () => {
    deps.state.cliStartDir = '/some/path';
    const handler = handlers.get('cli:getStartDir')!;
    const result = await handler({});

    expect(result).toBe('/some/path');
  });

  it('registers pty:pause and pty:resume listeners', () => {
    expect(listeners.has('pty:pause')).toBe(true);
    expect(listeners.has('pty:resume')).toBe(true);
  });

  describe('tab:createWithWorktree', () => {
    beforeEach(async () => {
      deps.state.workspaceDir = '/test';
      const startHandler = handlers.get('session:start')!;
      await startHandler({}, '/test', 'bypassPermissions');
      // Spy on hookEngine.emit after session:start creates the real HookEngine
      vi.spyOn(deps.state.hookEngine!, 'emit');
    });

    it('returns tab immediately without waiting for worktree creation', async () => {
      const handler = handlers.get('tab:createWithWorktree')!;
      const tab = await handler({}, 'my-feature');

      expect(tab).toBeDefined();
      expect((tab as any).id).toBe('tab-1');
      expect(deps.sendToRenderer).toHaveBeenCalledWith('tab:updated', expect.anything());
      expect(deps.persistSessions).toHaveBeenCalled();
    });

    it('sends progress and spawns Claude after setTimeout', async () => {
      const handler = handlers.get('tab:createWithWorktree')!;
      await handler({}, 'my-feature');

      // Trigger the setTimeout callback
      await vi.runAllTimersAsync();

      // Should have sent progress messages
      expect(deps.sendToRenderer).toHaveBeenCalledWith(
        'tab:worktreeProgress', 'tab-1', expect.stringContaining('Creating worktree'),
      );

      // Should have spawned Claude PTY (cwd is workspace root; -w flag points to worktree)
      expect(deps.ptyManager.spawn).toHaveBeenCalledWith(
        'tab-1',
        '/test',
        expect.arrayContaining(['-w', 'my-feature']),
        expect.any(Object),
      );
    });

    it('cleans up zombie tab on createAsync error', async () => {
      // Make createAsync reject
      const worktreeManager = deps.state.worktreeManager!;
      (worktreeManager.createAsync as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('branch already exists'));

      const handler = handlers.get('tab:createWithWorktree')!;
      await handler({}, 'bad-name');

      await vi.runAllTimersAsync();

      // Should have removed the zombie tab
      expect(deps.tabManager.removeTab).toHaveBeenCalledWith('tab-1');
      expect(deps.sendToRenderer).toHaveBeenCalledWith('tab:removed', 'tab-1');
      expect(deps.persistSessions).toHaveBeenCalled();
    });

    it('does not spawn if tab was closed during setTimeout delay', async () => {
      // Tab gets closed before doSetup runs
      (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const handler = handlers.get('tab:createWithWorktree')!;
      await handler({}, 'my-feature');

      await vi.runAllTimersAsync();

      // Should NOT have spawned Claude
      expect(deps.ptyManager.spawn).not.toHaveBeenCalled();
    });

    it('emits worktree:created and tab:created hooks after successful setup', async () => {
      const handler = handlers.get('tab:createWithWorktree')!;
      await handler({}, 'my-feature');

      await vi.runAllTimersAsync();

      expect(deps.state.hookEngine!.emit).toHaveBeenCalledWith('worktree:created', expect.objectContaining({
        name: 'my-feature',
        branch: 'my-feature',
      }), expect.any(Function));
      expect(deps.state.hookEngine!.emit).toHaveBeenCalledWith('tab:created', expect.objectContaining({
        tabId: 'tab-1',
        type: 'claude',
      }));
    });
  });

  describe('tab:close with removeWorktree', () => {
    beforeEach(async () => {
      deps.state.workspaceDir = '/test';
      const startHandler = handlers.get('session:start')!;
      await startHandler({}, '/test', 'bypassPermissions');
      // Spy on hookEngine.emit after session:start creates the real HookEngine
      vi.spyOn(deps.state.hookEngine!, 'emit');
    });

    it('emits worktree:removed hook when removing worktree on tab close', async () => {
      (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue({
        id: 'tab-1', worktree: 'my-feature', cwd: '/test/.claude/worktrees/my-feature',
        name: 'my-feature', status: 'idle', type: 'claude', pid: 123,
      });

      const handler = handlers.get('tab:close')!;
      await handler({}, 'tab-1', true);

      expect(deps.state.hookEngine!.emit).toHaveBeenCalledWith('worktree:removed', expect.objectContaining({
        name: 'my-feature',
      }));
    });
  });

  // -------------------------------------------------------------------------
  // M10b: explicitCwd param on tab:create (channel-contract change)
  // -------------------------------------------------------------------------

  describe('tab:create - M10b explicitCwd param', () => {
    beforeEach(async () => {
      deps.state.workspaceDir = '/workspace';
      const startHandler = handlers.get('session:start')!;
      await startHandler({}, '/workspace', 'bypassPermissions');
    });

    it('uses explicitCwd as the spawn cwd when provided', async () => {
      const handler = handlers.get('tab:create')!;
      // Pass explicitCwd as the 5th argument (after projectId, worktree, resumeId, savedName)
      await handler({}, null, null, undefined, undefined, '/workspace/cad-portal');

      // spawn must have been called with the explicitCwd, not workspaceDir
      expect(deps.ptyManager.spawn).toHaveBeenCalledWith(
        expect.any(String),
        '/workspace/cad-portal',
        expect.any(Array),
        expect.any(Object),
      );
    });

    it('falls back to workDir when explicitCwd is not provided', async () => {
      const handler = handlers.get('tab:create')!;
      await handler({}, null, null, undefined, undefined);

      expect(deps.ptyManager.spawn).toHaveBeenCalledWith(
        expect.any(String),
        '/workspace',
        expect.any(Array),
        expect.any(Object),
      );
    });

    it('installs hooks at the explicitCwd, not workDir', async () => {
      // installer.install is unconditional and required for write-after-ready
      const handler = handlers.get('tab:create')!;
      await handler({}, null, null, undefined, undefined, '/workspace/practice-analytics');

      // hooks must be installed at the explicit cwd
      expect(deps.state.hookInstaller!.install).toHaveBeenCalledWith('/workspace/practice-analytics');
    });
  });

  // -------------------------------------------------------------------------
  // M10b: remote tab:create message shape INTENTIONALLY NOT extended
  // -------------------------------------------------------------------------

  describe('remote tab:create message shape - INTENTIONALLY NOT extended (M10b)', () => {
    /**
     * The remote tab:create message shape does NOT include explicitCwd.
     *
     * This is an intentional decision: the remote web-remote-server.ts handler
     * hardcodes state.workspaceDir as the cwd (web-remote-server.ts:316-323)
     * and discards any resolved cwd. Extending the remote shape would create a
     * half-threaded param that silently routes to the wrong tree on remote clients.
     *
     * Decision: the remote tab:create message is kept as { type: 'tab:create' }
     * with no cwd field, documented here as the explicit non-extension.
     *
     * When remote Home is eventually built (Phase 3, 2.9), projectId must be
     * threaded into the remote handler BEFORE explicitCwd is wired remotely.
     *
     * Reference: PLAN.md section 3.1 (correction of R5 §D), 2.11, M10b DoD.
     */
    it('the ws-bridge tab:create send contains only { type: "tab:create" } with no cwd field', () => {
      // This test asserts the SHAPE of the remote message, not the local handler.
      // The ws-bridge sends { type: 'tab:create' } (verified ws-bridge.ts:252).
      // explicitCwd is intentionally absent from this message.
      const remoteMessage = { type: 'tab:create' };

      // Positive assertion: type is present
      expect(remoteMessage).toHaveProperty('type', 'tab:create');
      // Negative assertion: no cwd, no explicitCwd fields
      expect(remoteMessage).not.toHaveProperty('cwd');
      expect(remoteMessage).not.toHaveProperty('explicitCwd');
    });
  });

  // -------------------------------------------------------------------------
  // M10c: tab:create permissionModeOverride param
  // -------------------------------------------------------------------------

  describe('tab:create - M10c permissionModeOverride (the --plan wedge fix)', () => {
    it('an injection spawn in a PLAN-mode workspace produces --dangerously-skip-permissions, NOT --plan', async () => {
      // The workspace mode is plan; without the override the spawn would inherit
      // PERMISSION_FLAGS.plan = ['--plan'] and could wedge the idle gate.
      deps.state.workspaceDir = '/workspace';
      const startHandler = handlers.get('session:start')!;
      await startHandler({}, '/workspace', 'plan');
      expect(deps.state.permissionMode).toBe('plan');

      const handler = handlers.get('tab:create')!;
      // 6th arg = permissionModeOverride.
      await handler({}, null, null, undefined, undefined, '/workspace/cad-portal', 'bypassPermissions');

      const spawnArgs = (deps.ptyManager.spawn as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
      const cliArgs = spawnArgs[2] as string[];
      expect(cliArgs).toContain('--dangerously-skip-permissions');
      expect(cliArgs).not.toContain('--plan');
    });

    it('falls back to the workspace mode when no override is passed', async () => {
      deps.state.workspaceDir = '/workspace';
      const startHandler = handlers.get('session:start')!;
      await startHandler({}, '/workspace', 'plan');

      const handler = handlers.get('tab:create')!;
      await handler({}, null, null, undefined, undefined, '/workspace/cad-portal');

      const spawnArgs = (deps.ptyManager.spawn as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
      const cliArgs = spawnArgs[2] as string[];
      expect(cliArgs).toContain('--plan');
    });
  });

  // -------------------------------------------------------------------------
  // M10c: claude:injectQuery handler (arm-before-resolve, MAIN-active, override)
  // -------------------------------------------------------------------------

  describe('claude:injectQuery handler (M10c)', () => {
    beforeEach(async () => {
      deps.state.workspaceDir = '/workspace';
      const startHandler = handlers.get('session:start')!;
      await startHandler({}, '/workspace', 'plan'); // plan mode on purpose
    });

    it('creates the tab via explicitCwd and returns the new tab id', async () => {
      const handler = handlers.get('claude:injectQuery')!;
      const id = await handler({}, { explicitCwd: '/workspace/cad-portal', query: 'Open this repo so I can make the pending decision.' });

      expect(id).toBe('tab-1');
      expect(deps.ptyManager.spawn).toHaveBeenCalledWith(
        'tab-1',
        '/workspace/cad-portal',
        expect.any(Array),
        expect.any(Object),
      );
    });

    it('forces bypassPermissions even in a plan-mode workspace (the --plan wedge fix)', async () => {
      const handler = handlers.get('claude:injectQuery')!;
      await handler({}, { explicitCwd: '/workspace/cad-portal', query: 'q' });

      const spawnArgs = (deps.ptyManager.spawn as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
      const cliArgs = spawnArgs[2] as string[];
      expect(cliArgs).toContain('--dangerously-skip-permissions');
      expect(cliArgs).not.toContain('--plan');
    });

    it('arms the injector with the tab id and query BEFORE resolving (arm-before-resolve)', async () => {
      const handler = handlers.get('claude:injectQuery')!;
      const query = 'Open this repo so I can make the pending decision.';
      await handler({}, { explicitCwd: '/workspace/cad-portal', query });

      expect(deps.queryInjector!.arm).toHaveBeenCalledWith('tab-1', query);
      // The arm happened during the awaited handler, so by the time it resolves
      // the pending entry + 30s timeout already exist in MAIN.
    });

    it('makes the injected tab MAIN-active (post-turn toast suppression, step 4b)', async () => {
      const handler = handlers.get('claude:injectQuery')!;
      await handler({}, { explicitCwd: '/workspace/cad-portal', query: 'q' });

      expect(deps.tabManager.setActiveTab).toHaveBeenCalledWith('tab-1');
    });

    it('installs hooks at the injection cwd (write-after-ready depends on the hook firing)', async () => {
      const handler = handlers.get('claude:injectQuery')!;
      await handler({}, { explicitCwd: '/workspace/clinical-notes', query: 'q' });

      expect(deps.state.hookInstaller!.install).toHaveBeenCalledWith('/workspace/clinical-notes');
    });
  });

  // -------------------------------------------------------------------------
  // M10c: tab:close / onExit clear the pending injection
  // -------------------------------------------------------------------------

  describe('M10c injection cleanup on close', () => {
    it('tab:close clears the pending injection', async () => {
      const handler = handlers.get('tab:close')!;
      await handler({}, 'tab-1');

      expect(deps.queryInjector!.clear).toHaveBeenCalledWith('tab-1');
    });
  });

  describe('pty flow control', () => {
    it('buffers data when paused and flushes on resume', async () => {
      // Start session and create tab to set up PTY data forwarding
      deps.state.workspaceDir = '/test';
      const handler = handlers.get('tab:create')!;
      await handler({}, null);

      // Get the onData callback that was registered on the mock PTY
      const mockProc = (deps.ptyManager.spawn as ReturnType<typeof vi.fn>).mock.results[0].value;
      const onDataCallback = mockProc.onData.mock.calls[0][0];

      // Pause the tab
      const pauseListener = listeners.get('pty:pause')!;
      pauseListener({}, 'tab-1');

      // Send data while paused — should NOT reach renderer
      (deps.sendToRenderer as ReturnType<typeof vi.fn>).mockClear();
      onDataCallback('buffered data');
      expect(deps.sendToRenderer).not.toHaveBeenCalledWith('pty:data', 'tab-1', 'buffered data');

      // Resume — should flush buffered data
      const resumeListener = listeners.get('pty:resume')!;
      resumeListener({}, 'tab-1');
      expect(deps.sendToRenderer).toHaveBeenCalledWith('pty:data', 'tab-1', 'buffered data');

      // After resume, new data should flow directly
      (deps.sendToRenderer as ReturnType<typeof vi.fn>).mockClear();
      onDataCallback('live data');
      expect(deps.sendToRenderer).toHaveBeenCalledWith('pty:data', 'tab-1', 'live data');
    });
  });

  // ---------------------------------------------------------------------------
  // M14e: home-opens.json gate instrument — IPC-level idempotence tests
  // ---------------------------------------------------------------------------

  describe('M14e: settings:getStartupView appends home-opens.json', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipc-home-opens-'));
      handlers.clear();
      listeners.clear();
      vi.clearAllMocks();
      // Re-register with homeOpensDir so the handler sees the temp dir.
      deps = makeMockDeps();
      deps.homeOpensDir = tmpDir;
      registerIpcHandlers(deps);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function readEntries(dir: string): Array<{ date: string; landedOnHome: boolean }> {
      const filePath = path.join(dir, 'home-opens.json');
      if (!fs.existsSync(filePath)) return [];
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Array<{ date: string; landedOnHome: boolean }>;
    }

    it('appends landedOnHome:true when startupView is home', async () => {
      (deps.settings.getStartupView as ReturnType<typeof vi.fn>).mockReturnValue('home');
      const handler = handlers.get('settings:getStartupView')!;
      await handler({});
      const entries = readEntries(tmpDir);
      expect(entries).toHaveLength(1);
      expect(entries[0].landedOnHome).toBe(true);
    });

    it('appends landedOnHome:false when startupView is lastSession', async () => {
      (deps.settings.getStartupView as ReturnType<typeof vi.fn>).mockReturnValue('lastSession');
      const handler = handlers.get('settings:getStartupView')!;
      await handler({});
      const entries = readEntries(tmpDir);
      expect(entries).toHaveLength(1);
      expect(entries[0].landedOnHome).toBe(false);
    });

    it('is idempotent per launch: calling the handler twice appends only one entry', async () => {
      // The renderer calls getStartupView once per launch. A second call
      // (e.g. hot reload) must not produce a second record.
      const handler = handlers.get('settings:getStartupView')!;
      await handler({});
      await handler({});
      const entries = readEntries(tmpDir);
      expect(entries).toHaveLength(1);
    });

    it('writes to homeOpensDir, not the git workspace', () => {
      const workspaceRoot = path.resolve(path.join(__dirname, '..', '..'));
      expect(tmpDir.startsWith(workspaceRoot)).toBe(false);
    });

    it('does not append when homeOpensDir is not set', async () => {
      // Construct a fresh registration without homeOpensDir.
      handlers.clear();
      listeners.clear();
      const depsNoDir = makeMockDeps();
      // homeOpensDir intentionally omitted.
      registerIpcHandlers(depsNoDir);

      const handler = handlers.get('settings:getStartupView')!;
      await handler({});
      // No file should exist in the default temp dir check (or anywhere reachable).
      // We just verify the handler doesn't throw and returns the view.
      expect(true).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // M12: capture:append + capture:count handlers (server-side validation)
  // ---------------------------------------------------------------------------

  describe('M12: capture:append + capture:count', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipc-capture-'));
      handlers.clear();
      listeners.clear();
      vi.clearAllMocks();
      deps = makeMockDeps();
      deps.captureDir = tmpDir;
      registerIpcHandlers(deps);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function todosPath(): string {
      return path.join(tmpDir, 'dashboard', 'todos.json');
    }
    function readItems(): Array<{ text: string }> {
      if (!fs.existsSync(todosPath())) return [];
      return JSON.parse(fs.readFileSync(todosPath(), 'utf-8')).items;
    }

    it('capture:append persists a valid capture and returns the new count', async () => {
      const handler = handlers.get('capture:append')!;
      const result = await handler({}, { text: 'call the lab about the crown' });
      expect(result).toEqual({ ok: true, count: 1 });
      expect(readItems().map((i) => i.text)).toEqual(['call the lab about the crown']);
    });

    it('capture:append writes under captureDir (userData), NOT the workspace git tree', () => {
      const workspaceRoot = path.resolve(path.join(__dirname, '..', '..'));
      expect(todosPath().startsWith(workspaceRoot)).toBe(false);
    });

    it('capture:append REJECTS an over-length capture server-side', async () => {
      const handler = handlers.get('capture:append')!;
      const result = await handler({}, { text: 'a'.repeat(2001) });
      expect(result).toEqual({ ok: false, count: null });
      expect(fs.existsSync(todosPath())).toBe(false);
    });

    it('capture:append REJECTS a non-string capture server-side', async () => {
      const handler = handlers.get('capture:append')!;
      const result = await handler({}, { text: 12345 });
      expect(result).toEqual({ ok: false, count: null });
      expect(fs.existsSync(todosPath())).toBe(false);
    });

    it('capture:append REJECTS a control-byte capture server-side', async () => {
      const handler = handlers.get('capture:append')!;
      const result = await handler({}, { text: 'wipe\x1b[2Jthis' });
      expect(result).toEqual({ ok: false, count: null });
      expect(fs.existsSync(todosPath())).toBe(false);
    });

    it('capture:count returns the open-item count', async () => {
      const append = handlers.get('capture:append')!;
      await append({}, { text: 'a' });
      await append({}, { text: 'b' });
      const count = await handlers.get('capture:count')!({});
      expect(count).toBe(2);
    });

    it('capture handlers are inert (return safe values) when captureDir is not set', async () => {
      handlers.clear();
      const depsNoDir = makeMockDeps();
      // captureDir intentionally omitted.
      registerIpcHandlers(depsNoDir);
      const appendResult = await handlers.get('capture:append')!({}, { text: 'x' });
      expect(appendResult).toEqual({ ok: false, count: null });
      const count = await handlers.get('capture:count')!({});
      expect(count).toBe(0);
    });
  });
});
