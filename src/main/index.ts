import { app, BrowserWindow, dialog, Menu, Notification, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { handleSquirrelEvent } from './squirrel-startup';
import {
  PROGRAM_BOARD_STATE_CHANNEL as _PROGRAM_BOARD_STATE_CHANNEL,
  type ProgramBoardBroadcast,
} from '@shared/program-board-state';
import {
  ProgramBoardReader,
  resolveProgramBoardStatePath,
} from './program-board-reader';

// ---------------------------------------------------------------------------
// Program-board channel constants (re-exported for tests and type consumers)
// ---------------------------------------------------------------------------

/**
 * Channel name for the program-board state broadcast (main -> renderer).
 * Renderer-only: never forwarded to remote WebSocket clients.
 * Defined in src/shared/program-board-state.ts; re-exported here for tests.
 */
export const PROGRAM_BOARD_STATE_CHANNEL = _PROGRAM_BOARD_STATE_CHANNEL;

/**
 * The set of channel names that sendToRenderer DOES forward to remote
 * WebSocket clients. Used only for the absence assertion in tests:
 * PROGRAM_BOARD_STATE_CHANNEL must NOT appear here.
 */
export const REMOTE_FORWARDED_CHANNELS: ReadonlySet<string> = new Set([
  'pty:data',
  'tab:updated',
  'tab:removed',
  'pty:resized',
  'tab:switched',
  'tab:worktreeProgress',
]);

/**
 * Build the broadcast payload for a given channel and its args.
 * Returns the object to broadcast, or null if the channel is not forwarded.
 *
 * The six forwarded channels each have a DISTINCT payload shape, so each
 * case reconstructs the correct object from positional args. A flat string
 * array cannot carry the shape differences across the switch.
 */
export function buildBroadcastPayload(channel: string, args: unknown[]): object | null {
  switch (channel) {
    case 'pty:data':
      return { type: 'pty:data', tabId: args[0], data: args[1] };
    case 'tab:updated':
      return { type: 'tab:updated', tab: args[0] };
    case 'tab:removed':
      return { type: 'tab:removed', tabId: args[0] };
    case 'pty:resized':
      return { type: 'pty:resized', tabId: args[0], cols: args[1], rows: args[2] };
    case 'tab:switched':
      return { type: 'tab:switched', tabId: args[0] };
    case 'tab:worktreeProgress':
      return { type: 'tab:worktreeProgress', tabId: args[0], text: args[1] };
    default:
      return null;
  }
}

import { TabManager } from './tab-manager';
import { PtyManager } from './pty-manager';
import { HookIpcServer } from './ipc-server';
import { SettingsStore } from './settings-store';
import { WorkspaceStore } from './workspace-store';
import { createTabNamer } from './tab-namer';
import { createHookRouter } from './hook-router';
import { registerIpcHandlers, type AppState, type WirePtyToTabFn } from './ipc-handlers';
import { QueryInjector } from './query-injector';
import { TunnelManager } from './tunnel-manager';
import { WebRemoteServer } from './web-remote-server';
import type { RemoteAccessInfo } from '@shared/types';
import { isAllowedExternalScheme } from '@shared/url-scheme';
import { log } from './logger';
import { checkForUpdate, registerUpdateHandlers } from './update-checker';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (handleSquirrelEvent()) {
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------
const tabManager = new TabManager();
const ptyManager = new PtyManager();
const settings = new SettingsStore();
const workspaceStore = new WorkspaceStore();
const PIPE_NAME = `\\\\.\\pipe\\claude-terminal-${process.pid}`;
let ipcServer: HookIpcServer | null = null;
const tunnelManager = new TunnelManager();
let webRemoteServer: WebRemoteServer | null = null;
let cleanupIpcHandlers: (() => void) | null = null;
let wirePtyToTabFn: WirePtyToTabFn | null = null;
let programBoardReader: ProgramBoardReader | null = null;

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseCliStartDir(): string | null {
  for (const arg of process.argv.slice(1)) {
    if (arg.startsWith('-')) continue;
    if (arg === '.') continue; // Electron Forge passes '.' as the app entry
    if (arg.toLowerCase().includes('electron')) continue;
    if (arg.includes('.vite') || arg.includes('node_modules')) continue;
    try {
      if (fs.statSync(arg).isDirectory()) return arg;
    } catch { /* not a valid path */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared mutable state
// ---------------------------------------------------------------------------
const state: AppState = {
  workspaceId: null,
  projectManager: null,
  workspaceDir: null,
  permissionMode: 'bypassPermissions',
  worktreeManager: null,
  hookInstaller: null,
  hookConfigStore: null,
  hookEngine: null,
  mainWindow: null,
  cliStartDir: parseCliStartDir(),
  pipeName: PIPE_NAME,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Send a channel event to the Electron renderer and, for the six forwarded
 * channels, broadcast to any connected remote WebSocket clients.
 *
 * Accepts an optional trailing _mockBroadcast override (last arg is an object
 * with a _mockBroadcast property) used by unit tests to capture broadcasts
 * without a live WebRemoteServer instance.
 */
export function sendToRenderer(channel: string, ...args: unknown[]) {
  // Strip optional test-only mock override from the trailing args
  let mockBroadcast: ((msg: object) => void) | undefined;
  if (args.length > 0 && typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null) {
    const last = args[args.length - 1] as Record<string, unknown>;
    if (typeof last._mockBroadcast === 'function') {
      mockBroadcast = last._mockBroadcast as (msg: object) => void;
      args = args.slice(0, -1);
    }
  }

  const win = state.mainWindow as BrowserWindow | null;
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args);
  }

  // Forward relevant events to remote WebSocket clients.
  // buildBroadcastPayload returns null for channels NOT in REMOTE_FORWARDED_CHANNELS,
  // which guarantees program-board:state is never forwarded.
  const payload = buildBroadcastPayload(channel, args);
  if (payload !== null) {
    if (mockBroadcast) {
      mockBroadcast(payload);
    } else if (webRemoteServer) {
      webRemoteServer.broadcast(payload);
    }
  }
  // Channels not in REMOTE_FORWARDED_CHANNELS (project:added, project:removed,
  // tab:projectSwitch, hook:status, git:branchChanged, program-board:state, etc.)
  // are intentionally not forwarded to remote clients.
}

let persistDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let shuttingDown = false;

async function doPersistSessions() {
  if (shuttingDown) return;

  // Multi-project: persist sessions per project
  if (state.projectManager) {
    for (const project of state.projectManager.getAllProjects()) {
      const projectTabs = tabManager.getTabsByProject(project.id);
      const claudeTabs = projectTabs.filter(t => t.type === 'claude');
      const savedTabs = claudeTabs
        .filter(t => t.sessionId && t.status !== 'new')
        .map(t => ({
          name: t.name,
          cwd: t.cwd,
          worktree: t.worktree,
          sourceBranch: t.sourceBranch,
          sessionId: t.sessionId!,
        }));
      if (savedTabs.length === 0 && claudeTabs.length > 0) {
        log.debug('[sessions] skip persist for %s: %d claude tab(s) still initializing', project.dir, claudeTabs.length);
        continue;
      }
      await settings.saveSessions(project.dir, savedTabs);
    }
    return;
  }

  // Legacy single-project fallback
  if (!state.workspaceDir) return;
  const allTabs = tabManager.getAllTabs();
  const claudeTabs = allTabs.filter(t => t.type === 'claude');
  const savedTabs = claudeTabs
    .filter(t => t.sessionId && t.status !== 'new')
    .map(t => ({
      name: t.name,
      cwd: t.cwd,
      worktree: t.worktree,
      sessionId: t.sessionId!,
    }));
  if (savedTabs.length === 0 && claudeTabs.length > 0) {
    log.debug('[sessions] skip persist: %d claude tab(s) still initializing', claudeTabs.length);
    return;
  }
  await settings.saveSessions(state.workspaceDir, savedTabs);
}

function persistSessions() {
  if (persistDebounceTimer) clearTimeout(persistDebounceTimer);
  persistDebounceTimer = setTimeout(() => {
    persistDebounceTimer = null;
    doPersistSessions();
  }, 200);
}

// ---------------------------------------------------------------------------
// Remote access
// ---------------------------------------------------------------------------
function getRemoteAccessInfo(): RemoteAccessInfo {
  if (!webRemoteServer) {
    return { status: 'inactive', tunnelUrl: null, token: null, error: null };
  }
  return {
    status: tunnelManager.isActive ? 'active' : 'connecting',
    tunnelUrl: tunnelManager.url,
    token: webRemoteServer.accessToken,
    error: null,
  };
}

async function activateRemoteAccess(): Promise<RemoteAccessInfo> {
  if (webRemoteServer) return getRemoteAccessInfo();

  webRemoteServer = new WebRemoteServer({
    tabManager, ptyManager, state,
    sendToRenderer, persistSessions,
    serializeTerminal: async (tabId: string): Promise<string> => {
      const win = state.mainWindow as BrowserWindow | null;
      if (!win || win.isDestroyed()) return '';
      return win.webContents.executeJavaScript(
        `window.__serializeTerminal(${JSON.stringify(tabId)})`,
      );
    },
    wirePtyToTab: wirePtyToTabFn!,
    settings: { addRecentDir: (dir: string) => settings.addRecentDir(dir) },
    // M12: the capture store path; the remote capture:append handler validates +
    // persists through the same appendTodo path as the local handler.
    captureDir: app.getPath('userData'),
  });

  try {
    const localPort = await webRemoteServer.start(0);
    await tunnelManager.start(localPort);
  } catch (err) {
    log.error('[remote] Failed to activate:', String(err));
    webRemoteServer?.stop();
    webRemoteServer = null;
    tunnelManager.stop();
    return { status: 'error', tunnelUrl: null, token: null, error: String(err) };
  }

  return getRemoteAccessInfo();
}

async function deactivateRemoteAccess(): Promise<void> {
  tunnelManager.stop();
  webRemoteServer?.stop();
  webRemoteServer = null;
}

// ---------------------------------------------------------------------------
// Wire up extracted modules
// ---------------------------------------------------------------------------
const { generateTabName, generateResumeTabName, cleanupNamingFlag } = createTabNamer({
  tabManager, sendToRenderer, persistSessions,
});

// M10c: the single QueryInjector instance owns the pending-injection state. It is
// injected into BOTH the ipc-handlers (the claude:injectQuery handler arms it) and
// the hook-router (the idle gate clears it). The injectStatus broadcast is sent
// via sendToRenderer, which does NOT forward it to remote clients (the channel is
// absent from REMOTE_FORWARDED_CHANNELS), so the feed stays desktop-only.
const queryInjector = new QueryInjector({
  ptyManager,
  sendStatus: (channel, status) => sendToRenderer(channel, status),
});

const { handleHookMessage, clearPendingNotification } = createHookRouter({
  tabManager, sendToRenderer, persistSessions,
  generateTabName, generateResumeTabName, cleanupNamingFlag,
  getMainWindow: () => state.mainWindow as BrowserWindow | null,
  hookEngine: { emit: (event: any, context: any) => state.hookEngine?.emit(event, context) ?? Promise.resolve() } as any,
  getProjectName: (projectId) => {
    const ctx = state.projectManager?.getProject(projectId);
    return ctx ? path.basename(ctx.dir) : undefined;
  },
  // M10c: the idle gate (clears the pending injection on the first idle) and the
  // post-turn toast suppression for the watched injected tab.
  onInjectionIdle: (tabId) => queryInjector.onIdle(tabId),
  consumeInjectionNotifySuppression: (tabId) => queryInjector.consumeNotifySuppression(tabId),
  // M14d: idle notification demotion (notifyOnIdle:false default).
  // The hook-router reads the flag at toast-time so a settings change takes
  // effect on the next idle without restarting the app.
  getNotifyOnIdle: () => settings.getNotifyOnIdle(),
  isFirstRunNoteShown: () => settings.getNotifyOnIdleFirstRunShown(),
  showFirstRunNote: () => {
    // Mark the note shown first so a rapid second idle cannot double-fire
    // even if the async save hasn't completed yet.
    void settings.setNotifyOnIdleFirstRunShown(true);
    if (Notification.isSupported()) {
      const n = new Notification({
        title: 'ClaudeTerminal',
        body: 'Idle notifications are off; the dashboard shows finished sessions. Turn them on in Settings.',
      });
      n.show();
    }
    log.info('[M14d] first-run note shown');
  },
});

// ---------------------------------------------------------------------------
// Tunnel event listeners
// ---------------------------------------------------------------------------
tunnelManager.on('installing', (percent: number) => {
  sendToRenderer('remote:updated', {
    status: 'installing', tunnelUrl: null, token: null, error: null, progress: percent,
  } satisfies RemoteAccessInfo);
});
tunnelManager.on('url', () => {
  sendToRenderer('remote:updated', getRemoteAccessInfo());
});
tunnelManager.on('connected', () => {
  sendToRenderer('remote:updated', getRemoteAccessInfo());
});
tunnelManager.on('error', (err: Error) => {
  // Tear down the web server so the state resets to a retryable error.
  webRemoteServer?.stop();
  webRemoteServer = null;
  sendToRenderer('remote:updated', {
    status: 'error', tunnelUrl: null, token: null, error: String(err),
  });
});
tunnelManager.on('exit', () => {
  // If an error already tore things down, getRemoteAccessInfo returns 'inactive'
  // which is fine — the renderer already has the error state from the error event.
  if (!webRemoteServer) return;
  sendToRenderer('remote:updated', getRemoteAccessInfo());
});

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------
const createWindow = () => {
  Menu.setApplicationMenu(null);

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1e1e1e',
    icon: path.resolve(__dirname, '../../assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  state.mainWindow = mainWindow;

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  const initialTitle = state.cliStartDir
    ? `ClaudeTerminal - ${path.resolve(state.cliStartDir)}`
    : 'ClaudeTerminal';
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setTitle(initialTitle);
    log.attach(mainWindow);
    checkForUpdate(mainWindow);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Always filter setWindowOpenHandler through the scheme allowlist:
    // there is no app-url passthrough here since new-window requests are
    // never part of the dev-server / hot-reload flow.
    if (isAllowedExternalScheme(url)) {
      shell.openExternal(url);
    } else {
      log.warn(`setWindowOpenHandler blocked non-http(s) scheme: ${url}`);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Preserve the app-url passthrough so hot reload survives.
    // This check must come BEFORE the scheme gate; file:// and the Vite
    // dev-server URL both start with appUrl and are intentionally allowed.
    const appUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL || 'file://';
    if (url.startsWith(appUrl)) return;

    event.preventDefault();
    if (isAllowedExternalScheme(url)) {
      shell.openExternal(url);
    } else {
      log.warn(`will-navigate blocked non-http(s) scheme: ${url}`);
    }
  });

  // Ctrl+Shift+I DevTools toggle is only available in dev builds.
  // In packaged builds the DevTools menu and F12 are also absent (see
  // Menu.setApplicationMenu(null) above), so production has no console path
  // that could expose warn/error lines containing interpolated state.
  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.control && input.shift && input.key === 'I') {
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  mainWindow.on('close', (event) => {
    const workingTabs = tabManager.getAllTabs().filter(t => t.status === 'working');
    if (workingTabs.length > 0) {
      const names = workingTabs.map(t => t.name).join(', ');
      const result = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['Close', 'Cancel'],
        defaultId: 1,
        title: 'Close ClaudeTerminal?',
        message: `${workingTabs.length === 1 ? '1 tab is' : `${workingTabs.length} tabs are`} still running`,
        detail: names,
      });
      if (result === 1) {
        event.preventDefault();
      }
    }
  });

  mainWindow.on('closed', () => {
    state.mainWindow = null;
  });
};

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.setPath(
  'sessionData',
  path.join(app.getPath('temp'), `claude-terminal-${process.pid}`),
);

app.on('ready', async () => {
  ipcServer = new HookIpcServer(PIPE_NAME);
  try {
    await ipcServer.start();
    log.info('[ipc-server] listening on pipe');
    ipcServer.onMessage(handleHookMessage);
  } catch (err) {
    log.error('[ipc-server] FAILED to start:', String(err));
  }

  registerUpdateHandlers();

  const ipcResult = registerIpcHandlers({
    tabManager, ptyManager, settings, workspaceStore, state,
    sendToRenderer, persistSessions, cleanupNamingFlag, clearPendingNotification,
    activateRemoteAccess, deactivateRemoteAccess, getRemoteAccessInfo,
    queryInjector,
    // M14e: home-opens.json lives under userData, never the workspace git tree.
    homeOpensDir: app.getPath('userData'),
    // M12: the capture store (todos.json) lives under userData/dashboard, never
    // the workspace git tree (PLAN.md 3.6).
    captureDir: app.getPath('userData'),
  });
  cleanupIpcHandlers = ipcResult.cleanup;
  wirePtyToTabFn = ipcResult.wirePtyToTab;

  createWindow();

  // Construct the ProgramBoardReader and wire it into state so the
  // program-board:getState handler returns live data instead of the sentinel.
  // The reader does an immediate first read on construction, then polls every
  // ~20s. Each successful parse broadcasts the new state to the renderer.
  const { stateFilePath, root } = resolveProgramBoardStatePath();
  programBoardReader = new ProgramBoardReader(stateFilePath, root, {
    onStateUpdated: (boardState) => {
      // Broadcast the state together with the done-lane counts so the renderer
      // gets closedRecent and recentCloses in the same event (M8b-i, 1.5).
      const broadcast: ProgramBoardBroadcast = {
        boardState,
        closedRecent: programBoardReader!.getClosedRecent(),
        recentCloses: programBoardReader!.getRecentCloses(),
      };
      sendToRenderer(PROGRAM_BOARD_STATE_CHANNEL, broadcast);
    },
    // The done-lane resolved set persists to userData/dashboard/closed.json,
    // NEVER the workspace git tree (1.5 / 3.6).
    userDataDir: app.getPath('userData'),
  });
  (state as any).programBoardReader = programBoardReader;
  log.info('[program-board] reader started, polling', stateFilePath);
});

app.on('window-all-closed', async () => {
  log.info('[quit] workspaceDir:', state.workspaceDir, 'tabs:', tabManager.getAllTabs().length);
  // Stop persisting immediately — the on-disk sessions file is already
  // up-to-date because every tab mutation (create, close, rename, reorder,
  // sessionId) calls persistSessions() at the point of change.  Writing
  // again here is redundant and risks overwriting good state with degraded
  // shutdown state (e.g. after PTYs are killed).
  shuttingDown = true;
  if (persistDebounceTimer) {
    clearTimeout(persistDebounceTimer);
    persistDebounceTimer = null;
  }

  for (const tab of tabManager.getAllTabs()) {
    cleanupNamingFlag(tab.id);
  }

  ptyManager.killAll();
  programBoardReader?.stop();
  programBoardReader = null;
  cleanupIpcHandlers?.();
  tunnelManager.stop();
  webRemoteServer?.stop();
  if (ipcServer) {
    try { await ipcServer.stop(); } catch { /* best-effort */ }
  }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ---------------------------------------------------------------------------
// Forge Vite plugin globals (injected at build time)
// ---------------------------------------------------------------------------
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;
