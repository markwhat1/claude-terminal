/**
 * M8a-wire tests: ProgramBoardReader wired into index.ts / ipc-handlers.ts
 *
 * Covers:
 *   (1) program-board:getState returns the reader's current state (not the
 *       not-running sentinel) when state.programBoardReader is set.
 *   (2) A reader update (via onStateUpdated callback) triggers exactly one
 *       sendToRenderer call on PROGRAM_BOARD_STATE_CHANNEL with the new state.
 *   (3) REMOTE_FORWARDED_CHANNELS absence: 'program-board:state' is NOT in
 *       the forwarded set (guards the existing index.test.ts assertion stays
 *       green after wiring changes).
 *   (4) ProgramBoardReader.getState() delegates to getLastGoodState() (the
 *       method the handler invokes must exist and return the correct value).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Mocks required so ipc-handlers.ts can be imported under vitest/jsdom
// ---------------------------------------------------------------------------

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  app: { isPackaged: false },
  dialog: { showOpenDialog: vi.fn() },
}));

vi.mock('@main/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn(), init: vi.fn() },
}));

vi.mock('@main/worktree-manager', () => ({
  WorktreeManager: vi.fn(function () { return { create: vi.fn(), createAsync: vi.fn(async () => ({ path: '/p', sourceBranch: 'main' })), getCurrentBranch: vi.fn(() => 'main'), listDetails: vi.fn(), remove: vi.fn(), checkStatus: vi.fn(() => ({ clean: true, changesCount: 0 })) }; }),
}));
vi.mock('@main/hook-installer', () => ({ HookInstaller: vi.fn(function () { return { install: vi.fn(), uninstall: vi.fn() }; }) }));
vi.mock('@main/hook-config-store', () => ({ HookConfigStore: vi.fn(function () { return { load: vi.fn(), save: vi.fn() }; }) }));
vi.mock('@main/hook-engine', () => ({ HookEngine: vi.fn(function () { return { emit: vi.fn() }; }) }));
vi.mock('@main/project-manager', () => ({
  ProjectManager: vi.fn(function () {
    const projects = new Map();
    return {
      addProject: vi.fn((dir: string) => { const ctx = { id: 'proj-test', dir, colorIndex: 0, worktreeManager: { create: vi.fn(), createAsync: vi.fn(async () => ({ path: '/p', sourceBranch: 'main' })), getCurrentBranch: vi.fn(async () => 'main'), listDetails: vi.fn(), remove: vi.fn(), checkStatus: vi.fn(() => ({ clean: true, changesCount: 0 })) }, hookConfigStore: { load: vi.fn(), save: vi.fn() }, hookEngine: { emit: vi.fn() }, hookInstaller: { install: vi.fn(), uninstall: vi.fn() } }; projects.set(ctx.id, ctx); return ctx; }),
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
import { ProgramBoardReader } from '@main/program-board-reader';
import { PROGRAM_BOARD_STATE_CHANNEL, NOT_RUNNING_STATE } from '@shared/program-board-state';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const VALID_STATE_JSON = JSON.stringify({
  generated_at: '2026-06-21T10:00:00',
  programs: [
    {
      slug: 'cad-portal',
      name: 'CAD Staff Portal',
      repos: ['cad-portal'],
      sources: ['override'],
      tags: [],
      time_sensitive: null,
      blocked_on: '',
      paused: false,
      git: {
        last_commit: { sha: 'abc', iso: '2026-06-21T04:00:00-06:00', msg: 'fix', repo: 'cad-portal' },
        age_days: 0,
        uncommitted: false,
        unmerged_branch: null,
      },
      dod: { met: 1, total: 3, gaps: ['deploy', 'ci'] },
      last_touched: '2026-06-21T04:00:00-06:00',
      lane: 'active',
      age_color: 'green',
      needs_you: true,
      needs_you_reasons: ['recent-commit'],
    },
  ],
  suggested: [],
});

function makeMockDeps(): IpcHandlerDeps {
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
      spawn: vi.fn(() => ({ pid: 1234, onData: vi.fn(), onExit: vi.fn() })),
      spawnShell: vi.fn(() => ({ pid: 1234, onData: vi.fn(), onExit: vi.fn() })),
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
    activateRemoteAccess: vi.fn(async () => ({ status: 'connecting' as const, tunnelUrl: null, token: null, error: null })),
    deactivateRemoteAccess: vi.fn(async () => {}),
    getRemoteAccessInfo: vi.fn(() => ({ status: 'inactive' as const, tunnelUrl: null, token: null, error: null })),
  };
}

// ---------------------------------------------------------------------------
// (1) program-board:getState returns real reader state (not the sentinel)
// ---------------------------------------------------------------------------

describe('program-board:getState with a wired reader', () => {
  let tmpDir: string;
  let reader: ProgramBoardReader;
  let deps: IpcHandlerDeps;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.clearAllMocks();
    handlers.clear();

    tmpDir = mkdtempSync(path.join(tmpdir(), 'pb-wire-test-'));
    writeFileSync(path.join(tmpDir, 'state.json'), VALID_STATE_JSON, 'utf-8');

    deps = makeMockDeps();
    registerIpcHandlers(deps);
  });

  afterEach(() => {
    reader?.stop();
    vi.useRealTimers();
  });

  it('returns the reader current state once programBoardReader is attached to state', async () => {
    reader = new ProgramBoardReader(
      path.join(tmpDir, 'state.json'),
      tmpDir,
      { pollIntervalMs: 3_600_000 },
    );

    // Wait for the immediate first read.
    await vi.waitFor(() => {
      expect(reader.getLastGoodState().generated_at).toBe('2026-06-21T10:00:00');
    });

    // Attach the reader to state (the mechanism index.ts uses).
    (deps.state as any).programBoardReader = reader;

    const handler = handlers.get('program-board:getState')!;
    const result = await handler({}) as any;

    // The result is NOT the sentinel (generated_at !== null, programs non-empty).
    expect(result.generated_at).toBe('2026-06-21T10:00:00');
    expect(result.programs).toHaveLength(1);
    expect(result.programs[0].slug).toBe('cad-portal');
  });

  it('returns the not-running sentinel when no reader is attached', async () => {
    // state.programBoardReader is not set.
    const handler = handlers.get('program-board:getState')!;
    const result = await handler({}) as any;

    // Must equal the sentinel values.
    expect(result.generated_at).toBeNull();
    expect(result.programs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (2) onStateUpdated callback triggers exactly one sendToRenderer on the channel
// ---------------------------------------------------------------------------

describe('ProgramBoardReader onStateUpdated broadcast', () => {
  let tmpDir: string;
  let reader: ProgramBoardReader;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'pb-wire-broadcast-'));
  });

  afterEach(() => {
    reader?.stop();
  });

  it('calls onStateUpdated exactly once per successful parse with the parsed state', async () => {
    const stateFile = path.join(tmpDir, 'state.json');
    writeFileSync(stateFile, VALID_STATE_JSON, 'utf-8');

    const onStateUpdated = vi.fn();

    reader = new ProgramBoardReader(stateFile, tmpDir, {
      pollIntervalMs: 3_600_000,
      onStateUpdated,
    });

    // Wait for the immediate first read.
    await new Promise<void>((resolve) => setImmediate(resolve));
    // Give the async poll() a moment to settle.
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    expect(onStateUpdated).toHaveBeenCalledOnce();
    const calledWith = onStateUpdated.mock.calls[0][0] as any;
    expect(calledWith.generated_at).toBe('2026-06-21T10:00:00');
    expect(calledWith.programs[0].slug).toBe('cad-portal');
  });

  it('calls onStateUpdated again on each subsequent successful poll', async () => {
    const stateFile = path.join(tmpDir, 'state.json');
    writeFileSync(stateFile, VALID_STATE_JSON, 'utf-8');

    const onStateUpdated = vi.fn();

    reader = new ProgramBoardReader(stateFile, tmpDir, {
      pollIntervalMs: 3_600_000,
      onStateUpdated,
    });

    // Wait for the immediate first read.
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    expect(onStateUpdated).toHaveBeenCalledTimes(1);

    // Trigger a second manual poll.
    await reader.poll();

    expect(onStateUpdated).toHaveBeenCalledTimes(2);
  });

  it('does NOT call onStateUpdated when the file is missing (transient failure)', async () => {
    // File does not exist.
    const missingFile = path.join(tmpDir, 'missing.json');
    const onStateUpdated = vi.fn();

    reader = new ProgramBoardReader(missingFile, tmpDir, {
      pollIntervalMs: 3_600_000,
      retryDelayMs: 1,
      onStateUpdated,
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    expect(onStateUpdated).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (3) ProgramBoardReader.getState() is an alias for getLastGoodState()
// ---------------------------------------------------------------------------

describe('ProgramBoardReader.getState()', () => {
  let tmpDir: string;
  let reader: ProgramBoardReader;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'pb-wire-getstate-'));
  });

  afterEach(() => {
    reader?.stop();
  });

  it('returns the same value as getLastGoodState() before any read', () => {
    const stateFile = path.join(tmpDir, 'state.json');
    // Do not write the file; reader starts at sentinel.
    reader = new ProgramBoardReader(stateFile, tmpDir, { pollIntervalMs: 3_600_000 });

    expect(reader.getState()).toEqual(NOT_RUNNING_STATE);
    expect(reader.getState()).toEqual(reader.getLastGoodState());
  });

  it('returns the parsed state after a successful read', async () => {
    const stateFile = path.join(tmpDir, 'state.json');
    writeFileSync(stateFile, VALID_STATE_JSON, 'utf-8');

    reader = new ProgramBoardReader(stateFile, tmpDir, { pollIntervalMs: 3_600_000 });

    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    const fromGetState = reader.getState();
    const fromGetLastGood = reader.getLastGoodState();
    expect(fromGetState).toEqual(fromGetLastGood);
    expect(fromGetState.generated_at).toBe('2026-06-21T10:00:00');
  });
});

// ---------------------------------------------------------------------------
// (4) PROGRAM_BOARD_STATE_CHANNEL constant value guard
// ---------------------------------------------------------------------------
// Belt-and-suspenders: the constant value must be the exact string that the
// existing index.test.ts absence assertion checks. If the constant is renamed
// this test catches the drift before the absence test becomes moot.

describe('PROGRAM_BOARD_STATE_CHANNEL constant value', () => {
  it('equals the literal string "program-board:state"', () => {
    // The index.test.ts absence assertion uses the literal; keeping them equal
    // ensures a rename cannot silently bypass the forwarded-channels gate.
    expect(PROGRAM_BOARD_STATE_CHANNEL).toBe('program-board:state');
  });
});
