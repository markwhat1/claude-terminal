import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PermissionMode, Tab, RemoteAccessInfo, HookExecutionStatus, ProjectConfig } from '../shared/types';
import { PROJECT_COLORS, HOME_TAB_ID } from '../shared/types';
import { selectActiveView, nextActiveOnRemove } from '../shared/dashboard-helpers';
import { applyTabUpdate } from './appender';
import type { ShellOption } from '../shared/platform';
import { getAllShellOptions } from '../shared/platform';
import { ShellContext } from './shell-context';
import StartupDialog from './components/StartupDialog';
import RemoteSession from './RemoteSession';
import ConnectRemoteDialog from './components/ConnectRemoteDialog';
import { WebSocketBridge } from '../web-client/ws-bridge';
import { restoreLocal } from './remote-swap';
import TabBar from './components/TabBar';
import Terminal from './components/Terminal';
import HomeView, { type HomeLoadStatus } from './components/HomeView';
import { InjectionOverlayHost } from './components/InjectionOverlayHost';
import type { InjectionRetryPayload } from './hooks/useInjectionStatus';
import type { ProgramBoardState, ProgramBoardBroadcast, ClosedRecord } from '../shared/program-board-state';
import { resolvePreferredPowershell } from '../shared/dashboard-ui-helpers';
import { resolveStartupActiveId } from '../shared/startup-view';
import type { ClaudeQueryLine } from '../shared/home-copy';
import type { TodoItem, TodoUpdatePatch } from '../shared/capture';
import { destroyTerminal } from './components/terminalCache';
import StatusBar from './components/StatusBar';
import ProjectSidebar from './components/ProjectSidebar';
import ProjectSwitcherDialog from './components/ProjectSwitcherDialog';
import { buildWindowTitle } from '../shared/window-title';
import { matchKeybinding, isTabJump, type KeybindingContext } from './keybindings';
import WorktreeNameDialog from './components/WorktreeNameDialog';
import WorktreeManagerDialog from './components/WorktreeManagerDialog';
import WorktreeCloseDialog from './components/WorktreeCloseDialog';
import HookManagerDialog from './components/HookManagerDialog';
import SettingsDialog from './components/SettingsDialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type AppState = 'startup' | 'running' | 'remote';

export default function App() {
  const [appState, setAppState] = useState<AppState>('startup');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // Synthetic Home slot: kept OUT of the `tabs` array so every tabs-derived
  // count (activeProjectTabs, tabCounts, the render map) is automatically
  // Home-free. The id is the imported HOME_TAB_ID sentinel; it never enters
  // TabManager or crosses IPC.
  const homeTabId = HOME_TAB_ID;
  const [showWorktreeDialog, setShowWorktreeDialog] = useState(false);
  const [showWorktreeManager, setShowWorktreeManager] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Native remote-connect (this app as a client of another machine)
  const bridgeRef = useRef<WebSocketBridge | null>(null);
  const [remoteTarget, setRemoteTarget] = useState<{ url: string; token: string; autoConnect: boolean } | null>(null);
  const remoteTargetRef = useRef(remoteTarget);
  remoteTargetRef.current = remoteTarget;
  const [showConnectRemote, setShowConnectRemote] = useState(false);
  const [rememberedRemoteUrl, setRememberedRemoteUrl] = useState('');
  // Pending connect intent; the connection is persisted only after the connect
  // succeeds (see persistToken in the remote render), so a mistyped url/code
  // never poisons future auto-reconnect.
  const pendingConnectRef = useRef<{ url: string; remember: boolean } | null>(null);
  const bootstrappedRef = useRef(false);

  // Multi-project state
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false);
  const [showAddProjectDialog, setShowAddProjectDialog] = useState(false);

  // Remember last active tab per project for Up/Down navigation
  const lastActiveTabByProject = useRef<Map<string, string>>(new Map());

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  const [remoteInfo, setRemoteInfo] = useState<RemoteAccessInfo>({
    status: 'inactive', tunnelUrl: null, token: null, error: null,
  });
  const [branch, setBranch] = useState<string | null>(null);
  const [showHookManager, setShowHookManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [defaultShell, setDefaultShell] = useState<string | null>(null);
  // M14c: reactive copy of startupView for the SettingsDialog picker. The ref
  // copy (startupViewRef) drives startup tab resolution; this state drives the UI.
  const [startupViewSetting, setStartupViewSetting] = useState<'lastSession' | 'home'>('lastSession');
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [availableShells, setAvailableShells] = useState<ShellOption[]>(
    () => getAllShellOptions(window.claudeTerminal?.platform ?? 'linux')
  );
  const defaultShellRef = useRef(defaultShell);
  defaultShellRef.current = defaultShell;
  const availableShellsRef = useRef(availableShells);
  availableShellsRef.current = availableShells;
  const [hookStatus, setHookStatus] = useState<{ hookName: string; status: 'running' | 'done' | 'failed'; error?: string } | null>(null);
  const hookDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [worktreeCloseConfirm, setWorktreeCloseConfirm] = useState<{
    tabId: string; worktreeName: string; clean: boolean; changesCount: number;
  } | null>(null);

  // M14b: startupView drives resolveStartupActiveId at all three setActiveTabId
  // sites. Stored in a ref so the onTabSwitched listener (registered once) can
  // read the value set by the auto-start useEffect without re-registering.
  const startupViewRef = useRef<'lastSession' | 'home'>('lastSession');

  // Program-board state for the Home dashboard. App owns the IPC read and the
  // subscription; HomeView is pure and receives this as a prop.
  const [programBoardState, setProgramBoardState] = useState<ProgramBoardState | null>(null);
  const [homeLoadStatus, setHomeLoadStatus] = useState<HomeLoadStatus>('loading');
  // Done-lane payoff data from the reader (M8b-i, 1.5). The reader's session-
  // high guard means closedRecent never decrements, but HomeView adds a second
  // layer for stale-prop safety.
  const [closedRecent, setClosedRecent] = useState(0);
  const [recentCloses, setRecentCloses] = useState<ClosedRecord[]>([]);
  // M12: the quiet Inbox(N) glance number (the open-todo count). App owns the
  // capture:count read; HomeView renders it as a calm muted number.
  const [inboxCount, setInboxCount] = useState(0);
  // Phase-3 wiring: App owns the captured todo list (capture:list) and the three
  // coaching flags, then passes them to the pure HomeView. The flags ship
  // DEFAULT-OFF (PLAN-PHASE-2-3); a getter that fails leaves them off.
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [stallInterrupt, setStallInterrupt] = useState(false);
  const [commitmentMirror, setCommitmentMirror] = useState(false);
  const [morningRitual, setMorningRitual] = useState(false);
  // M18: the ids of todos completed THIS session, so HomeView can render the
  // motion-safe settle for each. Session-only; never persisted.
  const [recentTodoCloses, setRecentTodoCloses] = useState<string[]>([]);
  // The resolved path is surfaced in the not-running and error states; the
  // reader returns it inside the state, but Phase 0 keeps a stable label.
  const PROGRAM_BOARD_PATH = 'C:\\Users\\Mark\\Claude-Code\\dashboard\\state.json';

  // Fetch available shells (filter to installed ones) and default shell preference
  useEffect(() => {
    window.claudeTerminal.getAvailableShells().then(setAvailableShells).catch(() => {});
    window.claudeTerminal.getDefaultShell().then(setDefaultShell).catch(() => {});
    // M14c: seed the UI copy so SettingsDialog shows the persisted value on first open.
    window.claudeTerminal.getStartupView().then(setStartupViewSetting).catch(() => {});
  }, []);

  // Program-board: read once on mount and subscribe to the broadcast. A
  // successful read sets 'ready'; a failure with no prior state sets 'error'.
  const loadProgramBoard = useCallback(async () => {
    try {
      // The handler now returns a ProgramBoardBroadcast (state + closed stats).
      const broadcast = (await window.claudeTerminal.getProgramBoardState()) as ProgramBoardBroadcast | null;
      if (broadcast && broadcast.boardState) {
        setProgramBoardState(broadcast.boardState);
        setClosedRecent(broadcast.closedRecent ?? 0);
        setRecentCloses(broadcast.recentCloses ?? []);
        setHomeLoadStatus('ready');
      } else {
        // No state and no prior state: hard error. If we already have last-good,
        // keep it (4.5) and stay ready.
        setHomeLoadStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
      }
    } catch {
      setHomeLoadStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
    }
  }, []);

  useEffect(() => {
    loadProgramBoard();
    const cleanup = window.claudeTerminal.onProgramBoardState((raw) => {
      // The broadcast now carries a ProgramBoardBroadcast envelope (M8b-i).
      // Last-good preference (4.5): only replace when a real state arrives.
      const broadcast = raw as ProgramBoardBroadcast | null;
      if (broadcast && broadcast.boardState) {
        setProgramBoardState(broadcast.boardState);
        setClosedRecent(broadcast.closedRecent ?? 0);
        setRecentCloses(broadcast.recentCloses ?? []);
        setHomeLoadStatus('ready');
      }
    });
    return cleanup;
  }, [loadProgramBoard]);

  // M12: refresh the Inbox(N) glance count from the capture store.
  const refreshInboxCount = useCallback(async () => {
    try {
      const n = await window.claudeTerminal.getCaptureCount();
      setInboxCount(n);
    } catch {
      // A failed count read leaves the prior glance number; never throws.
    }
  }, []);

  useEffect(() => {
    refreshInboxCount();
  }, [refreshInboxCount]);

  // Phase-3 wiring: read the captured todo list so HomeView can render the
  // triage / parking / morning-ritual surfaces and feed Tier-5 @now todos to
  // the ranker. A failed read leaves the prior list; never throws.
  const refreshTodos = useCallback(async () => {
    try {
      const list = await window.claudeTerminal.listTodos();
      setTodos(list);
    } catch {
      // Leave the prior list on a failed read.
    }
  }, []);

  useEffect(() => {
    refreshTodos();
  }, [refreshTodos]);

  // Phase-3 wiring: seed the three coaching flags from their store getters. They
  // are DEFAULT-OFF (PLAN-PHASE-2-3); a getter that rejects leaves them off.
  useEffect(() => {
    window.claudeTerminal.getStallInterrupt().then(setStallInterrupt).catch(() => {});
    window.claudeTerminal.getCommitmentMirror().then(setCommitmentMirror).catch(() => {});
    window.claudeTerminal.getMorningRitual().then(setMorningRitual).catch(() => {});
  }, []);

  // M12: persist one captured todo, then refresh the glance count + the list.
  // The text is the inert capture payload; the server-side validation lives in
  // MAIN.
  const handleCapture = useCallback(async (text: string) => {
    try {
      await window.claudeTerminal.appendCapture(text);
    } catch {
      // A failed append is surfaced only by the count not moving; never throws.
    }
    await refreshInboxCount();
    await refreshTodos();
  }, [refreshInboxCount, refreshTodos]);

  // M15/M18: mutate one todo (triage horizon, park, or done), then refresh the
  // list + count so the surfaces re-render. A doneAt patch records the id in
  // recentTodoCloses so HomeView renders the motion-safe settle this session.
  const handleUpdateTodo = useCallback(async (id: string, patch: TodoUpdatePatch) => {
    try {
      await window.claudeTerminal.updateTodo(id, patch);
    } catch {
      // A failed mutation is surfaced only by the list not moving; never throws.
    }
    if ('doneAt' in patch && patch.doneAt != null) {
      setRecentTodoCloses((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
    await refreshTodos();
    await refreshInboxCount();
  }, [refreshTodos, refreshInboxCount]);

  // Phase-3 wiring: the coaching-flag setters. Each persists to the store, then
  // updates the local reactive copy so SettingsDialog and HomeView re-render.
  const handleStallInterruptChange = useCallback(async (value: boolean) => {
    setStallInterrupt(value);
    await window.claudeTerminal.setStallInterrupt(value);
  }, []);
  const handleCommitmentMirrorChange = useCallback(async (value: boolean) => {
    setCommitmentMirror(value);
    await window.claudeTerminal.setCommitmentMirror(value);
  }, []);
  const handleMorningRitualChange = useCallback(async (value: boolean) => {
    setMorningRitual(value);
    await window.claudeTerminal.setMorningRitual(value);
  }, []);

  const handleOpenPowerShellInRepo = useCallback(async (repo: string | null) => {
    // Resolve the preferred PowerShell from the installed shells (pwsh else 5.1).
    const shells = availableShellsRef.current;
    const hasPwsh = shells.some((s) => s.id === 'pwsh');
    const shellId = resolvePreferredPowershell(hasPwsh);
    // The hero repo is a relative workspace slug; join to the workspace root.
    const cwd = repo && workspaceDir
      ? `${workspaceDir.replace(/[\\/]$/, '')}/${repo}`
      : undefined;
    const tab = await window.claudeTerminal.createShellTab(shellId, undefined, cwd);
    setTabs((prev) => [...prev.filter((t) => t.id !== tab.id), tab]);
    setActiveTabId(tab.id);
    await window.claudeTerminal.switchTab(tab.id);
  }, [workspaceDir]);

  // M10c: remember the injection payload per spawning tab so the failed-start
  // surface can re-run the SAME canned query (into a fresh tab; see
  // handleRetryInjection). The 30s fail-safe itself lives in MAIN (QueryInjector),
  // so a renderer reload cannot orphan the query; this ref only serves retry.
  const injectionPayloads = useRef<Map<string, InjectionRetryPayload>>(new Map());

  // M10d: open Claude in the hero program's own repo with the canned query typed
  // in. Resolves the absolute cwd from workspaceDir + repo slug (same pattern as
  // handleOpenPowerShellInRepo). Calls injectQuery then sets the active tab.
  const handleOpenClaudeWithQuery = useCallback(async (query: ClaudeQueryLine, repo: string | null) => {
    const cwd = repo && workspaceDir
      ? `${workspaceDir.replace(/[\\/]$/, '')}/${repo}`
      : undefined;
    const payload: InjectionRetryPayload = {
      explicitCwd: cwd,
      query,
      projectId: activeProjectIdRef.current ?? undefined,
    };
    const tabId = await window.claudeTerminal.injectQuery(payload);
    // Remember the payload keyed by the spawning tab so a failed-start retry can
    // re-run the same canned query.
    injectionPayloads.current.set(tabId, payload);
    setActiveTabId(tabId);
    await window.claudeTerminal.switchTab(tabId);
  }, [workspaceDir]);

  // M10c: the failed-start retry. A failed start cannot recover on the same tab
  // (the session-start hook never fired, or the PTY is gone), so retry spawns a
  // FRESH tab with the same canned query and CLOSES the prior failed tab so it
  // does not orphan. The 30s fail-safe lives in MAIN (QueryInjector); this only
  // re-runs the remembered intent.
  const handleRetryInjection = useCallback(async (failedTabId: string) => {
    const payload = injectionPayloads.current.get(failedTabId);
    if (!payload) return;
    injectionPayloads.current.delete(failedTabId);
    const newTabId = await window.claudeTerminal.injectQuery(payload);
    injectionPayloads.current.set(newTabId, payload);
    // Clean up the orphaned failed tab now that its replacement is spawning.
    await window.claudeTerminal.closeTab(failedTabId);
    setActiveTabId(newTabId);
    await window.claudeTerminal.switchTab(newTabId);
  }, []);

  const handleCopyToClipboard = useCallback((text: string) => {
    void navigator.clipboard?.writeText(text);
  }, []);

  const handleOpenExternal = useCallback((url: string) => {
    window.claudeTerminal.openExternal(url);
  }, []);

  // Filter tabs by active project
  const activeProjectTabs = useMemo(
    () => activeProjectId ? tabs.filter(t => t.projectId === activeProjectId) : tabs,
    [tabs, activeProjectId]
  );

  // Compute tab counts per project for sidebar
  const tabCounts = useMemo(() => {
    const counts: Record<string, { idle: number; working: number; requires_response: number; total: number }> = {};
    for (const project of projects) {
      counts[project.id] = { idle: 0, working: 0, requires_response: 0, total: 0 };
    }
    for (const tab of tabs) {
      const c = counts[tab.projectId];
      if (c) {
        c.total++;
        if (tab.status === 'idle') c.idle++;
        else if (tab.status === 'working') c.working++;
        else if (tab.status === 'requires_response') c.requires_response++;
      }
    }
    return counts;
  }, [tabs, projects]);

  // Set per-project color tint
  useEffect(() => {
    const project = projects.find(p => p.id === activeProjectId);
    if (project) {
      const hue = PROJECT_COLORS[project.colorIndex % PROJECT_COLORS.length].hue;
      document.documentElement.style.setProperty('--project-hue', String(hue));
    }
  }, [activeProjectId, projects]);

  const handleSelectTab = useCallback(async (tabId: string) => {
    setActiveTabId(tabId);
    // Home is a renderer-only synthetic view. It never enters TabManager,
    // so there is no IPC switchTab call for it.
    if (tabId === HOME_TAB_ID) return;
    // Remember this tab as the last active for its project
    const tab = tabsRef.current.find(t => t.id === tabId);
    if (tab) {
      lastActiveTabByProject.current.set(tab.projectId, tabId);
    }
    await window.claudeTerminal.switchTab(tabId);
  }, []);

  const handleSelectProject = useCallback(async (projectId: string) => {
    // Save current tab for the project we're leaving
    const leavingProjectId = activeProjectIdRef.current;
    const leavingTabId = activeTabIdRef.current;
    if (leavingProjectId && leavingTabId) {
      lastActiveTabByProject.current.set(leavingProjectId, leavingTabId);
    }

    setActiveProjectId(projectId);
    setShowProjectSwitcher(false);

    const projectTabs = tabsRef.current.filter(t => t.projectId === projectId);
    if (projectTabs.length > 0) {
      // Restore last active tab for this project, or fall back to first tab
      const rememberedTabId = lastActiveTabByProject.current.get(projectId);
      const targetTab = rememberedTabId && projectTabs.some(t => t.id === rememberedTabId)
        ? rememberedTabId
        : projectTabs[0].id;
      handleSelectTab(targetTab);
    } else {
      const tab = await window.claudeTerminal.createTab(projectId, null);
      setActiveTabId(tab.id);
    }
  }, [handleSelectTab]);

  const handleCloseTab = useCallback(async (tabId: string) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (tab?.worktree) {
      try {
        const status = await window.claudeTerminal.checkWorktreeStatus(tab.cwd, tab.projectId);
        setWorktreeCloseConfirm({
          tabId, worktreeName: tab.worktree, clean: status.clean, changesCount: status.changesCount,
        });
        return;
      } catch {
        // If status check fails, close without removing worktree
      }
    }
    await window.claudeTerminal.closeTab(tabId);
  }, []);

  const handleRenameTab = useCallback(async (tabId: string, name: string) => {
    await window.claudeTerminal.renameTab(tabId, name);
  }, []);

  const handleNewTabWithoutWorktree = useCallback(async () => {
    const projectId = activeProjectIdRef.current ?? '';
    const tab = await window.claudeTerminal.createTab(projectId, null);
    setActiveTabId(tab.id);
  }, []);

  const handleNewShellTab = useCallback(async (shellType: string, afterTabId?: string) => {
    const tab = await window.claudeTerminal.createShellTab(shellType, afterTabId);
    setTabs((prev) => {
      const filtered = prev.filter(t => t.id !== tab.id);
      if (afterTabId) {
        const afterIdx = filtered.findIndex(t => t.id === afterTabId);
        if (afterIdx >= 0) {
          const next = [...filtered];
          next.splice(afterIdx + 1, 0, tab);
          return next;
        }
      }
      return [...filtered, tab];
    });
    setActiveTabId(tab.id);
    await window.claudeTerminal.switchTab(tab.id);
  }, []);

  const handleNewDefaultShellTab = useCallback(async (afterTabId?: string) => {
    const shells = availableShellsRef.current;
    const shellId = defaultShellRef.current ?? shells[0]?.id;
    if (!shellId) return;
    await handleNewShellTab(shellId, afterTabId);
  }, [handleNewShellTab]);

  const handleDefaultShellChange = useCallback(async (shellId: string) => {
    setDefaultShell(shellId);
    await window.claudeTerminal.setDefaultShell(shellId);
  }, []);

  // M14c: startup view picker handler. Updates both the UI state and the persisted store.
  const handleStartupViewChange = useCallback(async (view: 'lastSession' | 'home') => {
    setStartupViewSetting(view);
    await window.claudeTerminal.setStartupView(view);
  }, []);

  const handleReorderTabs = useCallback((reordered: Tab[]) => {
    setTabs(reordered);
    window.claudeTerminal.reorderTabs(reordered.map((t) => t.id));
  }, []);

  const handleRefreshTab = useCallback((tabId: string) => {
    // Send Ctrl+L to the PTY so the running app redraws the current screen
    window.claudeTerminal.writeToPty(tabId, '\x0c');
  }, []);

  const handleActivateRemote = useCallback(async () => {
    const info = await window.claudeTerminal.activateRemoteAccess();
    setRemoteInfo(info);
  }, []);

  const handleDeactivateRemote = useCallback(async () => {
    await window.claudeTerminal.deactivateRemoteAccess();
    setRemoteInfo({ status: 'inactive', tunnelUrl: null, token: null, error: null });
  }, []);

  // --- Native remote-connect (this app as a client of another machine) ---
  const handleConnectRemote = useCallback((url: string, code: string, remember: boolean) => {
    // Persist only AFTER a successful connect (via persistToken in the remote
    // render), so a mistyped url/code never poisons future auto-reconnect.
    pendingConnectRef.current = { url, remember };
    setRememberedRemoteUrl(url);
    bridgeRef.current = new WebSocketBridge();
    setRemoteTarget({ url, token: code, autoConnect: remember });
    setShowConnectRemote(false);
    setAppState('remote');
  }, []);

  const handleForgetRemoteHost = useCallback(async () => {
    await window.claudeTerminal.clearRemoteConnection();
    setRememberedRemoteUrl('');
    setShowConnectRemote(false);
  }, []);

  const handleDisconnectRemote = useCallback(async () => {
    // Restore the local Electron api first so the calls below (and any later
    // local session) hit the real preload, not the dead bridge stubs.
    restoreLocal();
    bridgeRef.current?.close();
    bridgeRef.current = null;
    const conn = await window.claudeTerminal.getRemoteConnection();
    if (conn) {
      await window.claudeTerminal.setRemoteConnection({ ...conn, autoConnect: false });
    }
    setRemoteTarget(null);
    setAppState('startup');
  }, []);

  const handleRegenerateRemoteCode = useCallback(async () => {
    const info = await window.claudeTerminal.regenerateRemoteCode();
    setRemoteInfo(info);
  }, []);

  const handleRemoteConnectError = useCallback((err: Error) => {
    // Initial connect failed (host down / bad code): fall back to local startup.
    // The global was never swapped (connect throws before enterRemote), so no
    // restore is needed.
    setAppState('startup');
    setAlertMessage(`Could not reach ${remoteTargetRef.current?.url ?? 'the host'}: ${err.message}`);
  }, []);

  const tryShowWorktreeDialog = useCallback(async () => {
    try {
      await window.claudeTerminal.getCurrentBranch(activeProjectIdRef.current ?? undefined);
      setShowWorktreeDialog(true);
    } catch {
      setAlertMessage('Cannot create a worktree: this workspace is not a Git repository, or the repository has no commits yet.');
    }
  }, []);

  const handleNewTabWithWorktree = useCallback(async (name: string) => {
    try {
      const projectId = activeProjectIdRef.current ?? '';
      const tab = await window.claudeTerminal.createTabWithWorktree(projectId, name);
      setActiveTabId(tab.id);
      setShowWorktreeDialog(false);
    } catch (err) {
      console.error('Failed to create tab with worktree:', err);
    }
  }, []);

  const handleRemoveProject = useCallback(async (projectId: string) => {
    try {
      await window.claudeTerminal.removeProject(projectId);
      // onProjectRemoved listener handles state cleanup
    } catch (err) {
      setAlertMessage(`Failed to remove project: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleRenameProject = useCallback((projectId: string, name: string) => {
    setProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, displayName: name } : p
    ));
  }, []);

  const handleAddProject = useCallback(() => {
    setShowAddProjectDialog(true);
  }, []);

  const handleAddProjectConfirm = useCallback(async (dir: string) => {
    setShowAddProjectDialog(false);
    try {
      const config = await window.claudeTerminal.addProject(dir);
      // Dedup: onProjectAdded listener may have already added it
      setProjects(prev => {
        if (prev.some(p => p.id === config.id)) return prev;
        return [...prev, config];
      });
      setActiveProjectId(config.id);
      // Auto-create first tab for the new project
      const tab = await window.claudeTerminal.createTab(config.id, null);
      setActiveTabId(tab.id);
    } catch (err) {
      setAlertMessage(`Failed to add project: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // Auto-start when a CLI directory was provided (skip StartupDialog)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (bootstrappedRef.current) return;
      bootstrappedRef.current = true;
      const cliDir = await window.claudeTerminal.getCliStartDir();
      if (cancelled) return;
      if (!cliDir) {
        // No CLI dir: auto-reconnect to a remembered remote host if one is set.
        // CLI start dir always wins over auto-reconnect, so they never race.
        const conn = await window.claudeTerminal.getRemoteConnection();
        if (cancelled) return;
        if (conn?.url) setRememberedRemoteUrl(conn.url);
        if (conn?.autoConnect && conn.url && conn.token) {
          pendingConnectRef.current = { url: conn.url, remember: true };
          bridgeRef.current = new WebSocketBridge();
          setRemoteTarget({ url: conn.url, token: conn.token, autoConnect: true });
          setAppState('remote');
        }
        return;
      }

      setWorkspaceDir(cliDir);

      const [savedMode, startupView] = await Promise.all([
        window.claudeTerminal.getPermissionMode(),
        window.claudeTerminal.getStartupView(),
      ]);
      if (cancelled) return;
      startupViewRef.current = startupView;

      const result = await window.claudeTerminal.startSession(cliDir, savedMode);
      if (cancelled) return;

      const projectId = result.projectId;
      const config: ProjectConfig = { id: projectId, dir: cliDir, colorIndex: 0 };
      setProjects([config]);
      setActiveProjectId(projectId);

      // Check if tabs already exist in the main process (renderer reload).
      // M14b: resolveStartupActiveId maps the active id to HOME_TAB_ID when
      // startupView is 'home', ensuring this path and the fresh-start path
      // cannot drift.
      const existingTabs = await window.claudeTerminal.getTabs();
      if (cancelled) return;

      if (existingTabs.length > 0) {
        const rawActiveId = await window.claudeTerminal.getActiveTabId();
        if (cancelled) return;
        setTabs(existingTabs);
        setActiveTabId(resolveStartupActiveId(startupView, homeTabId, rawActiveId));
        setAppState('running');
        try {
          setBranch(await window.claudeTerminal.getCurrentBranch(projectId));
        } catch { /* not a git repo */ }
        return;
      }

      // M14b R-10 Option A: when startupView is 'home', skip restoring saved
      // terminal tabs. The directory is already resolved above (setWorkspaceDir
      // + startSession) so hero actions have a cwd. Landing on Home without
      // re-instantiating whatever was open avoids dropping the user into a
      // half-finished tree at the calmest, highest-agency moment (morning cue).
      if (startupView === 'home') {
        setAppState('running');
        setActiveTabId(homeTabId);
        try {
          setBranch(await window.claudeTerminal.getCurrentBranch(projectId));
        } catch { /* not a git repo */ }
        return;
      }

      // Fresh start — restore from saved sessions
      const savedTabs = await window.claudeTerminal.getSavedTabs(cliDir);
      if (cancelled) return;

      await Promise.allSettled(
        savedTabs.map(saved =>
          window.claudeTerminal.createTab(projectId, saved.worktree, saved.sessionId, saved.name)
        )
      );
      if (cancelled) return;

      const allTabs = await window.claudeTerminal.getTabs();
      const rawActiveId = await window.claudeTerminal.getActiveTabId();
      if (cancelled) return;

      setTabs(allTabs);
      setActiveTabId(resolveStartupActiveId(startupView, homeTabId, rawActiveId));
      setAppState('running');

      try {
        setBranch(await window.claudeTerminal.getCurrentBranch(projectId));
      } catch { /* not a git repo */ }

      if (allTabs.length === 0) {
        const tab = await window.claudeTerminal.createTab(projectId, null);
        setActiveTabId(tab.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for tab updates from main process (registered once)
  useEffect(() => {
    const cleanupUpdate = window.claudeTerminal.onTabUpdate((tab) => {
      // applyTabUpdate is a pure (prev, tab) -> Tab[] function. It never
      // produces a new activeTabId, so Home focus is never stolen by an
      // incoming tab:updated event.
      setTabs((prev) => applyTabUpdate(prev, tab));
    });

    const cleanupRemoved = window.claudeTerminal.onTabRemoved((tabId) => {
      destroyTerminal(tabId);
      setTabs((prev) => {
        const closingTab = prev.find((t) => t.id === tabId);
        const remaining = prev.filter((t) => t.id !== tabId);
        setActiveTabId((prevActive) => {
          if (prevActive === tabId) {
            return nextActiveOnRemove(closingTab, remaining, homeTabId);
          }
          return prevActive;
        });
        return remaining;
      });
    });

    const cleanupRemote = window.claudeTerminal.onRemoteAccessUpdate((info) => {
      setRemoteInfo(info);
    });

    // M14b: apply resolveStartupActiveId so that a main-process tab:switched
    // event cannot override a home landing when startupView is 'home'.
    const cleanupSwitched = window.claudeTerminal.onTabSwitched((tabId) => {
      setActiveTabId(resolveStartupActiveId(startupViewRef.current, homeTabId, tabId));
    });

    const cleanupBranch = window.claudeTerminal.onBranchChanged((b, projectId) => {
      // Only update branch display if it's for the active project
      if (!projectId || projectId === activeProjectIdRef.current) {
        setBranch(b);
      }
    });

    const cleanupHookStatus = window.claudeTerminal.onHookStatus((status: HookExecutionStatus) => {
      if (hookDismissTimer.current) {
        clearTimeout(hookDismissTimer.current);
        hookDismissTimer.current = null;
      }
      setHookStatus({ hookName: status.hookName, status: status.status, error: status.error ?? status.stderr });
      if (status.status === 'done') {
        hookDismissTimer.current = setTimeout(() => setHookStatus(null), 3000);
      }
    });

    const cleanupProjectAdded = window.claudeTerminal.onProjectAdded((project) => {
      setProjects(prev => {
        if (prev.some(p => p.id === project.id)) return prev;
        return [...prev, project];
      });
    });

    const cleanupProjectRemoved = window.claudeTerminal.onProjectRemoved((projectId) => {
      setProjects(prev => prev.filter(p => p.id !== projectId));
      setActiveProjectId(prev => prev === projectId ? null : prev);
    });

    const cleanupProjectSwitch = window.claudeTerminal.onProjectSwitch((projectId) => {
      setActiveProjectId(projectId);
    });

    return () => {
      cleanupUpdate();
      cleanupRemoved();
      cleanupRemote();
      cleanupSwitched();
      cleanupBranch();
      cleanupHookStatus();
      cleanupProjectAdded();
      cleanupProjectRemoved();
      cleanupProjectSwitch();
    };
  }, []);

  // Update window title when tabs, active project, or branch change
  useEffect(() => {
    const activeProject = projects.find(p => p.id === activeProjectId);
    const dir = activeProject?.dir ?? workspaceDir;
    const title = buildWindowTitle(dir, activeProjectTabs, branch);
    window.claudeTerminal.setWindowTitle(title);
  }, [activeProjectTabs, activeProjectId, projects, workspaceDir, branch]);

  // Keyboard shortcuts
  useEffect(() => {
    if (appState !== 'running') return;

    const ctx: KeybindingContext = {
      activeTabId: () => activeTabIdRef.current,
      tabs: () => {
        // When project filtering is active, cycle within project tabs
        const projectId = activeProjectIdRef.current;
        if (projectId) {
          return tabsRef.current.filter(t => t.projectId === projectId);
        }
        return tabsRef.current;
      },
      projects: () => projectsRef.current,
      activeProjectId: () => activeProjectIdRef.current,
      addProject: handleAddProject,
      newTab: handleNewTabWithoutWorktree,
      newWorktreeTab: tryShowWorktreeDialog,
      // When Home is active, do not forward HOME_TAB_ID as an afterTabId;
      // pass undefined so the new shell tab opens at the end of the list.
      newDefaultShellTab: (afterTabId) =>
        handleNewDefaultShellTab(afterTabId === homeTabId ? undefined : afterTabId),
      // Home is a renderer-only view with no PTY. Closing it has no meaning,
      // so no-op when the active id is the Home sentinel.
      closeTab: (tabId) => {
        if (tabId === homeTabId) return;
        handleCloseTab(tabId);
      },
      selectTab: handleSelectTab,
      selectProject: handleSelectProject,
      renameTab: (id) => setRenamingTabId(id),
      openProjectSwitcher: () => setShowProjectSwitcher(true),
      // M12: HomeView owns the capture bar and listens for the chord itself so it
      // can open + focus the input SYNCHRONOUSLY on the keydown (no await, no
      // setTimeout, no cross-component state round-trip). The registry entry
      // exists for the AGENTS.md chord challenge + the registry test; this app-
      // level action is a deliberate no-op so the global handler does not race
      // HomeView's synchronous focus.
      openCapture: () => undefined,
    };

    const handler = (e: KeyboardEvent) => {
      if (isTabJump(e)) {
        e.preventDefault();
        const projectTabs = activeProjectIdRef.current
          ? tabsRef.current.filter(t => t.projectId === activeProjectIdRef.current)
          : tabsRef.current;
        const idx = parseInt(e.key) - 1;
        if (idx < projectTabs.length) handleSelectTab(projectTabs[idx].id);
        return;
      }

      const kb = matchKeybinding(e);
      if (kb?.action) {
        e.preventDefault();
        kb.action(ctx);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [appState, handleAddProject, handleNewTabWithoutWorktree, handleNewDefaultShellTab, handleSelectTab, handleSelectProject, handleCloseTab, tryShowWorktreeDialog]);

  const handleStartSession = useCallback(async (dir: string, mode: PermissionMode) => {
    const result = await window.claudeTerminal.startSession(dir, mode);
    setWorkspaceDir(dir);

    const projectId = result.projectId;
    const config: ProjectConfig = { id: projectId, dir, colorIndex: 0 };
    setProjects([config]);
    setActiveProjectId(projectId);

    const savedTabs = await window.claudeTerminal.getSavedTabs(dir);

    if (savedTabs.length > 0) {
      await Promise.allSettled(
        savedTabs.map(saved =>
          window.claudeTerminal.createTab(projectId, saved.worktree, saved.sessionId, saved.name)
        )
      );
    }

    const allTabs = await window.claudeTerminal.getTabs();
    const activeId = await window.claudeTerminal.getActiveTabId();
    setTabs(allTabs);
    setActiveTabId(activeId);
    setAppState('running');

    try {
      setBranch(await window.claudeTerminal.getCurrentBranch(projectId));
    } catch { /* not a git repo */ }

    if (allTabs.length === 0) {
      const tab = await window.claudeTerminal.createTab(projectId, null);
      setActiveTabId(tab.id);
    }
  }, []);

  if (appState === 'remote' && bridgeRef.current && remoteTarget) {
    return (
      <ShellContext.Provider value={availableShells}>
        <div className="flex flex-col h-screen border border-[hsl(var(--project-hue)_40%_25%)]">
          <RemoteSession
            bridge={bridgeRef.current}
            targetUrl={remoteTarget.url}
            initialToken={remoteTarget.token}
            persistToken={(token) => {
              // Fires after a successful connect, before the api swap, so the
              // local api is still active. This is the only place the connection
              // is persisted, so a failed connect can never poison auto-reconnect.
              const p = pendingConnectRef.current;
              if (p) window.claudeTerminal.setRemoteConnection({ url: p.url, token, autoConnect: p.remember });
            }}
            loadSavedToken={() => remoteTargetRef.current?.token ?? null}
            onExit={handleDisconnectRemote}
            onRetry={handleDisconnectRemote}
            onConnectError={handleRemoteConnectError}
          />
        </div>
      </ShellContext.Provider>
    );
  }

  if (appState === 'startup') {
    return (
      <ShellContext.Provider value={availableShells}>
        <div className="flex flex-col h-screen border border-[hsl(var(--project-hue)_40%_25%)]">
          <StartupDialog onStart={handleStartSession} onConnectRemote={() => setShowConnectRemote(true)} />
          {showConnectRemote && (
            <ConnectRemoteDialog
              defaultUrl={rememberedRemoteUrl}
              onConnect={handleConnectRemote}
              onCancel={() => setShowConnectRemote(false)}
              onForget={handleForgetRemoteHost}
            />
          )}
        </div>
      </ShellContext.Provider>
    );
  }

  return (
    <ShellContext.Provider value={availableShells}>
    <div className="flex flex-row h-screen border border-[hsl(var(--project-hue)_40%_25%)]">
      {projects.length > 0 && (
        <ProjectSidebar
          projects={projects}
          activeProjectId={activeProjectId ?? ''}
          tabCounts={tabCounts}
          onSelectProject={handleSelectProject}
          onAddProject={handleAddProject}
          onRemoveProject={handleRemoveProject}
          onRenameProject={handleRenameProject}
        />
      )}
      <div className="flex flex-col flex-1 min-w-0">
        <TabBar
          tabs={activeProjectTabs}
          activeTabId={activeTabId}
          renamingTabId={renamingTabId}
          defaultShell={defaultShell}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onRenameTab={handleRenameTab}
          onRenameHandled={() => setRenamingTabId(null)}
          onNewClaudeTab={handleNewTabWithoutWorktree}
          onNewWorktreeTab={tryShowWorktreeDialog}
          onNewShellTab={handleNewShellTab}
          onReorderTabs={handleReorderTabs}
          onRefreshTab={handleRefreshTab}
          onManageWorktrees={() => setShowWorktreeManager(true)}
          onManageHooks={() => setShowHookManager(true)}
          onOpenSettings={() => setShowSettings(true)}
          remoteInfo={remoteInfo}
          onActivateRemote={handleActivateRemote}
          onDeactivateRemote={handleDeactivateRemote}
          onSelectHome={() => handleSelectTab(homeTabId)}
          isHomeActive={activeTabId === homeTabId}
          onConnectRemote={() => setShowConnectRemote(true)}
          onRegenerateRemoteCode={remoteInfo.status === 'active' ? handleRegenerateRemoteCode : undefined}
        />
        <div className="flex-1 relative overflow-hidden" data-terminal-area>
          {tabs.map((tab) => (
            <Terminal
              key={tab.id}
              tabId={tab.id}
              isVisible={tab.id === activeTabId}
            />
          ))}
          {/* M10c: the 1.5b success-pending affordance, rendered over the
              spawning tab's terminal surface off claude:injectStatus. */}
          <InjectionOverlayHost
            activeTabId={activeTabId}
            onRetry={handleRetryInjection}
          />
          {selectActiveView(activeTabId, homeTabId, tabs) === 'home' && (
            <HomeView
              programBoardState={programBoardState}
              loadStatus={homeLoadStatus}
              resolvedPath={PROGRAM_BOARD_PATH}
              now={new Date()}
              closedRecent={closedRecent}
              recentCloses={recentCloses}
              tabs={tabs}
              projects={projects}
              handleSelectTab={handleSelectTab}
              onOpenPowerShell={handleOpenPowerShellInRepo}
              onOpenClaudeWithQuery={handleOpenClaudeWithQuery}
              onCopy={handleCopyToClipboard}
              onOpenExternal={handleOpenExternal}
              onRetry={loadProgramBoard}
              onCapture={handleCapture}
              inboxCount={inboxCount}
              todos={todos}
              onUpdateTodo={handleUpdateTodo}
              stallInterrupt={stallInterrupt}
              commitmentMirror={commitmentMirror}
              morningRitual={morningRitual}
              recentTodoCloses={recentTodoCloses}
            />
          )}
        </div>
        <StatusBar
          tabs={activeProjectTabs}
          hookStatus={hookStatus}
          hideStatusCounts={activeTabId === homeTabId}
        />
      </div>
      {showConnectRemote && (
        <ConnectRemoteDialog
          defaultUrl={rememberedRemoteUrl}
          onConnect={handleConnectRemote}
          onCancel={() => setShowConnectRemote(false)}
          onForget={handleForgetRemoteHost}
        />
      )}
      {showWorktreeDialog && (
        <WorktreeNameDialog
          onCreateWithWorktree={handleNewTabWithWorktree}
          onCancel={() => setShowWorktreeDialog(false)}
        />
      )}
      {showWorktreeManager && (
        <WorktreeManagerDialog
          tabs={activeProjectTabs}
          onClose={() => setShowWorktreeManager(false)}
          onOpenClaude={async (worktreeName) => {
            const projectId = activeProjectIdRef.current ?? '';
            const tab = await window.claudeTerminal.createTab(projectId, worktreeName);
            setActiveTabId(tab.id);
          }}
          onOpenShell={async (shellType, cwd) => {
            const tab = await window.claudeTerminal.createShellTab(shellType, undefined, cwd);
            setActiveTabId(tab.id);
          }}
        />
      )}
      {worktreeCloseConfirm && (
        <WorktreeCloseDialog
          worktreeName={worktreeCloseConfirm.worktreeName}
          clean={worktreeCloseConfirm.clean}
          changesCount={worktreeCloseConfirm.changesCount}
          onConfirm={async (removeWorktree) => {
            const { tabId } = worktreeCloseConfirm;
            setWorktreeCloseConfirm(null);
            await window.claudeTerminal.closeTab(tabId, removeWorktree);
          }}
          onCancel={() => setWorktreeCloseConfirm(null)}
        />
      )}
      {showHookManager && (
        <HookManagerDialog onClose={() => setShowHookManager(false)} />
      )}
      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        defaultShell={defaultShell}
        onDefaultShellChange={handleDefaultShellChange}
        startupView={startupViewSetting}
        onStartupViewChange={handleStartupViewChange}
        stallInterrupt={stallInterrupt}
        onStallInterruptChange={handleStallInterruptChange}
        commitmentMirror={commitmentMirror}
        onCommitmentMirrorChange={handleCommitmentMirrorChange}
        morningRitual={morningRitual}
        onMorningRitualChange={handleMorningRitualChange}
      />
      {showProjectSwitcher && (
        <ProjectSwitcherDialog
          projects={projects.map(p => ({
            ...p,
            tabCount: tabCounts[p.id]?.total ?? 0,
          }))}
          onSelect={handleSelectProject}
          onAddProject={() => {
            setShowProjectSwitcher(false);
            handleAddProject();
          }}
          onCancel={() => setShowProjectSwitcher(false)}
        />
      )}
      {showAddProjectDialog && (
        <StartupDialog
          title="Add Project"
          hidePermissions
          onStart={(dir) => handleAddProjectConfirm(dir)}
          onCancel={() => setShowAddProjectDialog(false)}
        />
      )}
      <Dialog open={!!alertMessage} onOpenChange={() => setAlertMessage(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Error</DialogTitle></DialogHeader>
          <DialogDescription>{alertMessage}</DialogDescription>
          <DialogFooter>
            <Button autoFocus onClick={() => setAlertMessage(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </ShellContext.Provider>
  );
}
