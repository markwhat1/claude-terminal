/**
 * A test double for window.claudeTerminal (ClaudeTerminalApi).
 *
 * Satisfies the full ClaudeTerminalApi shape so any test that mounts App.tsx
 * or renders a component that calls window.claudeTerminal can import this
 * fixture and assign it without type errors.
 *
 * All async methods resolve with safe empty values. All listener registration
 * methods return a no-op cleanup function, matching the real preload contract.
 */

import type { ClaudeTerminalApi } from '../../../src/preload';
import type { Tab, RemoteAccessInfo, HookExecutionStatus, ProjectConfig, WorkspaceConfig, PermissionMode, RepoHookConfig, SavedTab } from '../../../src/shared/types';
import type { ShellOption } from '../../../src/shared/platform';
import type { InjectStatus } from '../../../src/shared/injection';
import type { ClaudeQueryLine } from '../../../src/shared/home-copy';
import type { TodoUpdatePatch } from '../../../src/shared/capture';

const noop = (): void => undefined;
const noopCleanup = (): (() => void) => () => undefined;

export const claudeTerminalMock: ClaudeTerminalApi = {
  // Platform
  platform: 'win32',
  getAvailableShells: (): Promise<ShellOption[]> => Promise.resolve([]),

  // Workspace / Project management
  initWorkspace: (_mode: PermissionMode): Promise<string> => Promise.resolve('proj-mock'),
  addProject: (_dir: string, _id?: string, _colorIndex?: number): Promise<ProjectConfig> =>
    Promise.resolve({ id: 'proj-mock', dir: '/mock/repo', colorIndex: 0 }),
  removeProject: (_projectId: string): Promise<void> => Promise.resolve(),
  listProjects: (): Promise<ProjectConfig[]> => Promise.resolve([]),

  // Workspace persistence
  listWorkspaces: (): Promise<WorkspaceConfig[]> => Promise.resolve([]),
  saveWorkspace: (_ws: WorkspaceConfig): Promise<void> => Promise.resolve(),
  deleteWorkspace: (_wsId: string): Promise<void> => Promise.resolve(),

  // Tab operations
  // M10b: explicitCwd added as optional 5th param (mirrors the preload signature update).
  createTab: (
    _projectId: string,
    _worktree?: string | null,
    _resumeSessionId?: string,
    _savedName?: string,
    _explicitCwd?: string,
  ): Promise<Tab> =>
    Promise.resolve({
      id: 'tab-mock',
      type: 'claude',
      name: 'Mock Tab',
      defaultName: 'Mock Tab',
      status: 'new',
      worktree: null,
      sourceBranch: null,
      cwd: '/mock/repo',
      shellType: null,
      pid: null,
      sessionId: null,
      projectId: 'proj-mock',
      statusSince: null,
      lastActivityAt: null,
      firstActivityAt: null,
      waitingSince: null,
    }),
  createTabWithWorktree: (_projectId: string, _worktreeName: string): Promise<Tab> =>
    Promise.resolve({
      id: 'tab-wt-mock',
      type: 'claude',
      name: 'Worktree Tab',
      defaultName: 'Worktree Tab',
      status: 'new',
      worktree: '/mock/repo/.worktrees/branch',
      sourceBranch: 'main',
      cwd: '/mock/repo/.worktrees/branch',
      shellType: null,
      pid: null,
      sessionId: null,
      projectId: 'proj-mock',
      statusSince: null,
      lastActivityAt: null,
      firstActivityAt: null,
      waitingSince: null,
    }),
  createShellTab: (
    _shellType: string,
    _afterTabId?: string,
    _cwd?: string,
  ): Promise<Tab> =>
    Promise.resolve({
      id: 'tab-shell-mock',
      type: 'shell',
      name: 'PowerShell',
      defaultName: 'PowerShell',
      status: 'shell',
      worktree: null,
      sourceBranch: null,
      cwd: '/mock/repo',
      shellType: 'pwsh',
      pid: null,
      sessionId: null,
      projectId: 'proj-mock',
      statusSince: null,
      lastActivityAt: null,
      firstActivityAt: null,
      waitingSince: null,
    }),
  closeTab: (_tabId: string, _removeWorktree?: boolean): Promise<void> => Promise.resolve(),
  switchTab: (_tabId: string): Promise<void> => Promise.resolve(),
  renameTab: (_tabId: string, _name: string): Promise<void> => Promise.resolve(),
  getTabs: (): Promise<Tab[]> => Promise.resolve([]),
  getActiveTabId: (): Promise<string | null> => Promise.resolve(null),
  reorderTabs: (_tabIds: string[]): void => noop(),

  // PTY data
  writeToPty: (_tabId: string, _data: string): void => noop(),
  resizePty: (_tabId: string, _cols: number, _rows: number): void => noop(),
  pausePty: (_tabId: string): void => noop(),
  resumePty: (_tabId: string): void => noop(),

  // Worktree
  createWorktree: (_projectId: string, _name: string): Promise<string> =>
    Promise.resolve('/mock/repo/.worktrees/branch'),
  getCurrentBranch: (_projectId?: string): Promise<string> =>
    Promise.resolve('main'),
  listWorktreeDetails: (
    _projectId?: string,
  ): Promise<{ name: string; path: string; clean: boolean; changesCount: number }[]> =>
    Promise.resolve([]),
  removeWorktree: (_worktreePath: string, _projectId?: string): Promise<void> =>
    Promise.resolve(),
  checkWorktreeStatus: (
    _worktreePath: string,
    _projectId?: string,
  ): Promise<{ clean: boolean; changesCount: number }> =>
    Promise.resolve({ clean: true, changesCount: 0 }),

  // Settings
  getRecentDirs: (): Promise<string[]> => Promise.resolve([]),
  removeRecentDir: (_dir: string): Promise<void> => Promise.resolve(),
  getPermissionMode: (): Promise<PermissionMode> => Promise.resolve('default'),
  getDefaultShell: (): Promise<string | null> => Promise.resolve(null),
  setDefaultShell: (_shellId: string | null): Promise<void> => Promise.resolve(),
  getStartupView: (): Promise<'lastSession' | 'home'> => Promise.resolve('lastSession'),
  // M14c: startup view setter
  setStartupView: (_view: 'lastSession' | 'home'): Promise<void> => Promise.resolve(),
  // M14d: idle notification flag
  getNotifyOnIdle: (): Promise<boolean> => Promise.resolve(false),
  setNotifyOnIdle: (_value: boolean): Promise<void> => Promise.resolve(),
  // M16: stall pattern-interrupt flag
  getStallInterrupt: (): Promise<boolean> => Promise.resolve(false),
  setStallInterrupt: (_value: boolean): Promise<void> => Promise.resolve(),
  // M17: commitment-mirror intake flag
  getCommitmentMirror: (): Promise<boolean> => Promise.resolve(false),
  setCommitmentMirror: (_value: boolean): Promise<void> => Promise.resolve(),
  // M18: morning ritual + parking flag
  getMorningRitual: (): Promise<boolean> => Promise.resolve(false),
  setMorningRitual: (_value: boolean): Promise<void> => Promise.resolve(),

  // Hook config
  getHookConfig: (_projectId?: string): Promise<RepoHookConfig> =>
    Promise.resolve({ hooks: [] }),
  saveHookConfig: (
    _projectIdOrConfig: string | RepoHookConfig,
    _config?: RepoHookConfig,
  ): Promise<void> => Promise.resolve(),

  // Hook execution status events (one of the ~8 listener registrations)
  onHookStatus: (_callback: (status: HookExecutionStatus) => void): (() => void) =>
    noopCleanup(),

  // Program board (M5, local-only channel)
  getProgramBoardState: (): Promise<unknown> => Promise.resolve(null),
  onProgramBoardState: (_callback: (state: unknown) => void): (() => void) =>
    noopCleanup(),

  // Claude injection (M10c, local-only channel pair)
  injectQuery: (_payload: { explicitCwd?: string; query: ClaudeQueryLine; projectId?: string | null }): Promise<string> =>
    Promise.resolve('tab-mock'),
  onInjectStatus: (_callback: (status: InjectStatus) => void): (() => void) =>
    noopCleanup(),

  // Capture (M12, remote-enabled append + local count)
  appendCapture: (_text: string): Promise<{ ok: boolean; count: number | null }> =>
    Promise.resolve({ ok: true, count: 1 }),
  getCaptureCount: (): Promise<number> => Promise.resolve(0),

  // todo:update (M15, local-only)
  updateTodo: (_id: string, _patch: TodoUpdatePatch): Promise<{ ok: boolean }> =>
    Promise.resolve({ ok: true }),

  // Window title
  setWindowTitle: (_title: string): void => noop(),

  // Instance hue
  getInstanceHue: (): Promise<number> => Promise.resolve(210),

  // New window
  createNewWindow: (): void => noop(),

  // Open external
  openExternal: (_url: string): void => noop(),

  // Startup (legacy)
  selectDirectory: (): Promise<string | null> => Promise.resolve(null),
  startSession: (
    _dir: string,
    _mode: PermissionMode,
  ): Promise<{ projectId: string }> =>
    Promise.resolve({ projectId: 'proj-mock' }),
  getSavedTabs: (_dir: string): Promise<SavedTab[]> => Promise.resolve([]),
  getCliStartDir: (): Promise<string | null> => Promise.resolve(null),

  // Remote access
  activateRemoteAccess: (): Promise<RemoteAccessInfo> =>
    Promise.resolve({ status: 'inactive', tunnelUrl: null, token: null, error: null }),
  deactivateRemoteAccess: (): Promise<void> => Promise.resolve(),
  getRemoteAccessInfo: (): Promise<RemoteAccessInfo> =>
    Promise.resolve({ status: 'inactive', tunnelUrl: null, token: null, error: null }),

  // Update notification
  getUpdateInfo: (): Promise<{ version: string; url: string } | null> =>
    Promise.resolve(null),
  onUpdateAvailable: (
    _callback: (info: { version: string; url: string }) => void,
  ): (() => void) => noopCleanup(),

  // Events (the ~8 listener registrations from App.tsx:354-434)
  onPtyData: (_callback: (tabId: string, data: string) => void): (() => void) =>
    noopCleanup(),
  onTabUpdate: (_callback: (tab: Tab) => void): (() => void) => noopCleanup(),
  onRemoteAccessUpdate: (
    _callback: (info: RemoteAccessInfo) => void,
  ): (() => void) => noopCleanup(),
  onTabRemoved: (_callback: (tabId: string) => void): (() => void) => noopCleanup(),
  onWorktreeProgress: (
    _callback: (tabId: string, text: string) => void,
  ): (() => void) => noopCleanup(),
  onTabSwitched: (_callback: (tabId: string) => void): (() => void) => noopCleanup(),
  onBranchChanged: (
    _callback: (branch: string, projectId?: string) => void,
  ): (() => void) => noopCleanup(),
  onProjectAdded: (
    _callback: (project: ProjectConfig) => void,
  ): (() => void) => noopCleanup(),
  onProjectRemoved: (_callback: (projectId: string) => void): (() => void) =>
    noopCleanup(),
  onProjectSwitch: (_callback: (projectId: string) => void): (() => void) =>
    noopCleanup(),
};
