# IPC Architecture

ClaudeTerminal uses Electron's IPC (inter-process communication) with `contextBridge` to provide secure, typed communication between the main process and the renderer. The renderer never has direct access to Node.js APIs; all interaction flows through a narrow, explicitly defined bridge.

## IPC Patterns

Three communication patterns are used throughout the application:

### 1. handle/invoke (request/response)

The renderer calls `ipcRenderer.invoke(channel, ...args)` and awaits a `Promise` resolved by the main process via `ipcMain.handle(channel, handler)`. Used for operations that return data or need confirmation of completion.

```
Renderer                          Main
  |                                 |
  |-- ipcRenderer.invoke(ch) ----->|
  |                                 |-- handler runs
  |<-- Promise resolves -----------|
```

### 2. send/on (fire-and-forget, renderer to main)

The renderer calls `ipcRenderer.send(channel, ...args)` and the main process listens with `ipcMain.on(channel, handler)`. No response is returned. Used for high-frequency or low-importance signals like PTY writes and resize events.

```
Renderer                          Main
  |                                 |
  |-- ipcRenderer.send(ch) ------>|
  |                                 |-- handler runs (no reply)
```

### 3. webContents.send/on (main to renderer)

The main process pushes events to the renderer via `webContents.send(channel, ...args)` (wrapped as `sendToRenderer` in the codebase). The renderer listens with `ipcRenderer.on(channel, handler)`. Used for asynchronous events like PTY output, tab state changes, and git branch updates.

```
Renderer                          Main
  |                                 |
  |<-- webContents.send(ch) ------|
  |-- handler runs                  |
```

## Preload Bridge

The preload script (`src/preload.ts`) uses `contextBridge.exposeInMainWorld` to attach a `claudeTerminal` object to `window`. This is the only surface the renderer can use to interact with the main process.

### Security Model

- **`nodeIntegration: false`** -- The renderer cannot import Node.js modules.
- **`contextIsolation: true`** -- The preload and renderer run in separate JavaScript contexts. The renderer cannot tamper with the preload's references to `ipcRenderer`.
- **`sandbox: true`** -- The renderer process is OS-sandboxed.
- **Explicit allowlist** -- Only the methods defined in the `api` object are exposed. There is no blanket `ipcRenderer` access.

### Bridge Shape

```typescript
contextBridge.exposeInMainWorld('claudeTerminal', api);

// The type is exported so global.d.ts can reference it:
export type ClaudeTerminalApi = typeof api;
```

The renderer accesses the API as `window.claudeTerminal.<method>(...)`.

## Channel Reference

### Workspace & Project

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `workspace:init` | renderer -> main | invoke | `initWorkspace(mode)` | `mode: PermissionMode` -> `string` (workspace ID) |
| `workspace:list` | renderer -> main | invoke | `listWorkspaces()` | -> `WorkspaceConfig[]` |
| `workspace:save` | renderer -> main | invoke | `saveWorkspace(ws)` | `ws: WorkspaceConfig` |
| `workspace:delete` | renderer -> main | invoke | `deleteWorkspace(wsId)` | `wsId: string` |
| `project:add` | renderer -> main | invoke | `addProject(dir, id?, colorIndex?)` | `dir: string`, `id?: string`, `colorIndex?: number` -> `ProjectConfig` |
| `project:remove` | renderer -> main | invoke | `removeProject(projectId)` | `projectId: string` |
| `project:list` | renderer -> main | invoke | `listProjects()` | -> `ProjectConfig[]` |
| `project:added` | main -> renderer | webContents.send | `onProjectAdded(cb)` | `project: ProjectConfig` |
| `project:removed` | main -> renderer | webContents.send | `onProjectRemoved(cb)` | `projectId: string` |
| `tab:projectSwitch` | main -> renderer | webContents.send | `onProjectSwitch(cb)` | `projectId: string` |

### Platform / Shell Discovery

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `shell:getAvailable` | renderer -> main | invoke | `getAvailableShells()` | -> `ShellOption[]` |

The `shell:getAvailable` handler returns the list of shells installed on the current platform. On Windows, it verifies WSL availability via an async `exec('wsl.exe --status')`. On Unix, it checks each shell binary with `fs.accessSync`. This channel is local-only; the web client's `ws-bridge.ts` returns an empty array (remote clients cannot spawn local shells).

### Session & Startup (Legacy)

The `session:start` channel is retained for backward compatibility. It wraps `workspace:init` + `project:add` into a single call and now returns `{ projectId: string }` instead of `void`.

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `session:start` | renderer -> main | invoke | `startSession(dir, mode)` | `dir: string`, `mode: PermissionMode` -> `{ projectId: string }` |
| `session:getSavedTabs` | renderer -> main | invoke | `getSavedTabs(dir)` | `dir: string` -> `SavedTab[]` |
| `cli:getStartDir` | renderer -> main | invoke | `getCliStartDir()` | -> `string \| null` |

### Tabs

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `tab:create` | renderer -> main | invoke | `createTab(projectId, worktree?, resumeSessionId?, savedName?, explicitCwd?)` | `projectId: string`, `explicitCwd?` (M10b), `permissionModeOverride?` (M10c, handler arg) -> `Tab` |
| `tab:createShell` | renderer -> main | invoke | `createShellTab(shellType, afterTabId?, cwd?)` | `shellType: string` -> `Tab` |
| `tab:close` | renderer -> main | invoke | `closeTab(tabId, removeWorktree?)` | `tabId: string`, `removeWorktree?: boolean` |
| `tab:switch` | renderer -> main | invoke | `switchTab(tabId)` | `tabId: string` |
| `tab:rename` | renderer -> main | invoke | `renameTab(tabId, name)` | `tabId: string`, `name: string` |
| `tab:getAll` | renderer -> main | invoke | `getTabs()` | -> `Tab[]` |
| `tab:getActiveId` | renderer -> main | invoke | `getActiveTabId()` | -> `string \| null` |
| `tab:reorder` | renderer -> main | send | `reorderTabs(tabIds)` | `tabIds: string[]` |
| `tab:updated` | main -> renderer | webContents.send | `onTabUpdate(cb)` | `tab: Tab` |
| `tab:removed` | main -> renderer | webContents.send | `onTabRemoved(cb)` | `tabId: string` |
| `tab:switched` | main -> renderer | webContents.send | `onTabSwitched(cb)` | `tabId: string` |

### PTY

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `pty:write` | renderer -> main | send | `writeToPty(tabId, data)` | `tabId: string`, `data: string` |
| `pty:resize` | renderer -> main | send | `resizePty(tabId, cols, rows)` | `tabId: string`, `cols: number`, `rows: number` |
| `pty:pause` | renderer -> main | send | `pausePty(tabId)` | `tabId: string` |
| `pty:resume` | renderer -> main | send | `resumePty(tabId)` | `tabId: string` |
| `pty:data` | main -> renderer | webContents.send | `onPtyData(cb)` | `tabId: string`, `data: string` |
| `pty:resized` | main -> renderer | webContents.send | (no preload listener) | `tabId: string`, `cols: number`, `rows: number` |

Note: `pty:resized` is sent by the main process to notify remote web clients of terminal size changes but has no corresponding listener registered in the preload bridge.

### Worktree

Worktree channels accept an optional `projectId` parameter to scope the operation to a specific project. If omitted, the first project is used.

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `worktree:create` | renderer -> main | invoke | `createWorktree(projectId, name)` | `projectId: string`, `name: string` -> `string` (path) |
| `worktree:currentBranch` | renderer -> main | invoke | `getCurrentBranch(projectId?)` | `projectId?: string` -> `string` |
| `worktree:listDetails` | renderer -> main | invoke | `listWorktreeDetails(projectId?)` | `projectId?: string` -> `{ name, path, clean, changesCount }[]` |
| `worktree:remove` | renderer -> main | invoke | `removeWorktree(worktreePath, projectId?)` | `worktreePath: string`, `projectId?: string` |
| `worktree:checkStatus` | renderer -> main | invoke | `checkWorktreeStatus(worktreePath, projectId?)` | `worktreePath: string`, `projectId?: string` -> `{ clean: boolean, changesCount: number }` |

### Settings

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `settings:recentDirs` | renderer -> main | invoke | `getRecentDirs()` | -> `string[]` |
| `settings:removeRecentDir` | renderer -> main | invoke | `removeRecentDir(dir)` | `dir: string` |
| `settings:permissionMode` | renderer -> main | invoke | `getPermissionMode()` | -> `PermissionMode` |

### Dialog

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `dialog:selectDirectory` | renderer -> main | invoke | `selectDirectory()` | -> `string \| null` |

### Window

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `window:setTitle` | renderer -> main | send | `setWindowTitle(title)` | `title: string` |
| `window:createNew` | renderer -> main | send | `createNewWindow()` | *(none)* — spawns a new detached app instance |

### Remote Access

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `remote:activate` | renderer -> main | invoke | `activateRemoteAccess()` | -> `RemoteAccessInfo` |
| `remote:deactivate` | renderer -> main | invoke | `deactivateRemoteAccess()` | -> `void` |
| `remote:getInfo` | renderer -> main | invoke | `getRemoteAccessInfo()` | -> `RemoteAccessInfo` |
| `remote:updated` | main -> renderer | webContents.send | `onRemoteAccessUpdate(cb)` | `info: RemoteAccessInfo` |

### Program Board

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `program-board:getState` | renderer -> main | invoke | `getProgramBoardState()` | -> `ProgramBoardState \| null` |
| `program-board:state` | main -> renderer | webContents.send | `onProgramBoardState(cb)` | `state: ProgramBoardState` |

Both channels are **local-only**. `program-board:getState` is handled by `ipcMain.handle` and has no generic passthrough in `WebRemoteServer.handleMessage`; remote clients sending this type receive a warning and no response. `program-board:state` is not in `REMOTE_FORWARDED_CHANNELS` and is never broadcast to WebSocket clients. The program-board state is a work-digest for the local machine operator, not remote clients.

The channel name constant `PROGRAM_BOARD_STATE_CHANNEL` is defined in `src/shared/program-board-state.ts` and used by both the main-process send and the preload `on()` to prevent a rename from silently breaking the subscription.

#### Remote parity table

| Channel | Remote (WebSocket) | Notes |
|---|---|---|
| `program-board:getState` | local-only | `handleMessage` has no generic passthrough (3.6) |
| `program-board:state` | local-only | absent from `REMOTE_FORWARDED_CHANNELS` |

### Claude Injection (M10c)

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `claude:injectQuery` | renderer -> main | invoke | `injectQuery(payload)` | `{ explicitCwd?, query: ClaudeQueryLine, projectId? }` -> `tabId: string` |
| `claude:injectStatus` | main -> renderer | webContents.send | `onInjectStatus(cb)` | `status: InjectStatus` (pending / success / failure) |

`claude:injectQuery` is the dashboard hero's "open Claude with a canned query" action. The main handler creates the tab via the M10b `explicitCwd` route with a `bypassPermissions` override (so a plan-mode workspace cannot wedge the idle gate), makes the tab main-active, ARMS the `QueryInjector` pending entry plus the mandatory 30s timeout BEFORE it resolves (the arm-before-resolve property: a renderer reload after the awaited round-trip cannot orphan the query), and returns the new tab id. The canned query is written on the FIRST idle (the hook-router idle gate, pinned to the convergence point covering both the `tab:ready` first idle and the later `tab:status:idle`), using CR not CRLF. A dead PTY at write time or the 30s timeout surface a `claude:injectStatus` failure with a one-click retry.

Both channels are **local-only**. The remote `tab:create` handler discards the resolved cwd (`web-remote-server.ts:316-323`), so a canned query would run against the wrong tree; the action is desktop-only in Phase 1. Neither channel is in `REMOTE_FORWARDED_CHANNELS`, and `handleMessage` has no generic passthrough, so `claude:injectQuery` is unreachable from a remote client.

The channel-name constants `CLAUDE_INJECT_QUERY_CHANNEL` and `CLAUDE_INJECT_STATUS_CHANNEL` live in `src/shared/injection.ts`; ONE constant per channel serves both the send site and the `on`/`handle` site, so a typo cannot ship the feed dead.

#### Remote parity table

| Channel | Remote (WebSocket) | Notes |
|---|---|---|
| `claude:injectQuery` | local-only | remote `tab:create` discards cwd; no generic passthrough in `handleMessage` |
| `claude:injectStatus` | local-only | absent from `REMOTE_FORWARDED_CHANNELS` |

### Capture (M12)

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `capture:append` | renderer -> main | invoke | `appendCapture(text)` | `{ text: string }` -> `{ ok: boolean, count: number \| null }` |
| `capture:count` | renderer -> main | invoke | `getCaptureCount()` | -> `count: number` |

`capture:append` is the one-gesture capture write. The main handler runs the shared `appendTodo` (server-side validation: `typeof text === 'string'`, a 2000-char length cap, control-byte rejection, a non-empty trim, plus total-item and file-size caps) and atomic-writes the v2 store to `<userData>/dashboard/todos.json`, OUT of the workspace git tree. The captured text is DISPLAY-ONLY: it is never an action payload, never reaches `composeClaudeQuery`, and never reaches the log (rejection logs carry a machine reason only). A `source:'todo'` item routes to the `copyOnly` action (its only action is Copy of inert text). `capture:count` is the quiet `Inbox(N)` glance number (the open-item count), never a red badge.

`capture:append` is **remote-enabled** with the SAME server-side validation: `WebRemoteServer.handleMessage` has a `capture:append` case that calls `appendTodo` and replies `{ type: 'capture:appended', ok, count }`. `capture:count` is **local-only** (Home is desktop-only in Phase 1); `handleMessage` has no case for it, so a remote client sending that type receives a warning and no response. Neither channel is a broadcast, so neither appears in `REMOTE_FORWARDED_CHANNELS`. The channel-name constants `CAPTURE_APPEND_CHANNEL` and `CAPTURE_COUNT_CHANNEL` live in `src/shared/capture.ts`.

#### Remote parity table

| Channel | Remote (WebSocket) | Notes |
|---|---|---|
| `capture:append` | remote-enabled | `handleMessage` case runs `appendTodo` server-side validation; reply `capture:appended` |
| `capture:count` | local-only | `handleMessage` has no case; the Inbox glance is desktop-only |

### Todo mutation (M15)

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `todo:update` | renderer -> main | invoke | `updateTodo(id, patch)` | `{ id: string, patch: TodoUpdatePatch }` -> `{ ok: boolean }` |

`todo:update` is the M15 mutation channel for horizon assign, park, and done. The patch carries only structured fields (`horizon`, `category`, `project`, `parkedUntil`, `doneAt`); the item text is never modified. The main handler calls `updateTodo` (which validates the id, finds the item, applies the patch, and atomic-writes the store). The channel is **local-only** (Home is desktop-only, PLAN.md 2.9); the `ws-bridge` stub throws so a missed disabled-state fails loudly. The channel constant `TODO_UPDATE_CHANNEL` lives in `src/shared/capture.ts`. Not in `REMOTE_FORWARDED_CHANNELS`.

M18 reuses this same `todo:update` channel for resurfacing/parking and the morning ritual: the hero-todo "not now" duration set writes a future `parkedUntil` (a parked item is hidden, never deleted, and resurfaces when `parkedUntil <= now` on the next open or the ~20s tick), and the hero-todo "Done" writes `doneAt`. No new mutation channel is added; the deliberate remote decision is unchanged (local-only, no `ws-bridge` write path). The morning-ritual ON/OFF preference is the `settings:getMorningRitual` / `settings:setMorningRitual` pair (local-only settings, default OFF, mirroring `notifyOnIdle`); like the other coaching flags it is not a broadcast and is stubbed in `ws-bridge`.

### Git

| Channel | Direction | Pattern | Renderer Signature | Payload |
|---|---|---|---|---|
| `git:branchChanged` | main -> renderer | webContents.send | `onBranchChanged(cb)` | `branch: string, projectId?: string` |

## Event Listeners

Main-to-renderer events are subscribed in the preload via wrapper methods that return cleanup functions. Each wrapper:

1. Creates a handler that strips the Electron `IpcRendererEvent` first argument.
2. Registers the handler with `ipcRenderer.on(channel, handler)`.
3. Returns a `() => void` cleanup function that calls `ipcRenderer.removeListener`.

### Registered Events

| Preload Method | Channel | Callback Signature |
|---|---|---|
| `onPtyData` | `pty:data` | `(tabId: string, data: string) => void` |
| `onTabUpdate` | `tab:updated` | `(tab: Tab) => void` |
| `onTabRemoved` | `tab:removed` | `(tabId: string) => void` |
| `onTabSwitched` | `tab:switched` | `(tabId: string) => void` |
| `onRemoteAccessUpdate` | `remote:updated` | `(info: RemoteAccessInfo) => void` |
| `onBranchChanged` | `git:branchChanged` | `(branch: string, projectId?: string) => void` |
| `onHookStatus` | `hook:status` | `(status: HookExecutionStatus) => void` |
| `onWorktreeProgress` | `tab:worktreeProgress` | `(tabId: string, text: string) => void` |
| `onProjectAdded` | `project:added` | `(project: ProjectConfig) => void` |
| `onProjectRemoved` | `project:removed` | `(projectId: string) => void` |
| `onProjectSwitch` | `tab:projectSwitch` | `(projectId: string) => void` |
| `onProgramBoardState` | `program-board:state` | `(state: unknown) => void` |
| `onInjectStatus` | `claude:injectStatus` | `(status: InjectStatus) => void` |

### Cleanup Pattern in App.tsx

The renderer sets up all event listeners in a single `useEffect` and returns a combined cleanup function:

```typescript
useEffect(() => {
  const cleanupUpdate = window.claudeTerminal.onTabUpdate((tab) => { ... });
  const cleanupRemoved = window.claudeTerminal.onTabRemoved((tabId) => { ... });
  const cleanupRemote = window.claudeTerminal.onRemoteAccessUpdate((info) => { ... });
  const cleanupSwitched = window.claudeTerminal.onTabSwitched((tabId) => { ... });
  const cleanupBranch = window.claudeTerminal.onBranchChanged((b, projectId) => { ... });
  const cleanupHookStatus = window.claudeTerminal.onHookStatus((status) => { ... });
  const cleanupProjectAdded = window.claudeTerminal.onProjectAdded((project) => { ... });
  const cleanupProjectRemoved = window.claudeTerminal.onProjectRemoved((projectId) => { ... });
  const cleanupProjectSwitch = window.claudeTerminal.onProjectSwitch((projectId) => { ... });

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
```

The empty dependency array (`[]`) ensures listeners are registered exactly once. The PTY data listener (`onPtyData`) is registered separately in the `Terminal` component, scoped to each individual tab.

## Type Safety

### global.d.ts Augmentation

The renderer augments the global `Window` interface so TypeScript knows about `window.claudeTerminal`:

```typescript
// src/renderer/global.d.ts
import type { ClaudeTerminalApi } from '../preload';

declare global {
  interface Window {
    claudeTerminal: ClaudeTerminalApi;
  }
}
```

`ClaudeTerminalApi` is exported directly from the preload as `typeof api`, so every method signature, parameter type, and return type is inferred from the preload's implementation. Adding a new IPC method to the `api` object in `preload.ts` automatically makes it available (and type-checked) in the renderer.

### Shared Types

Types used across both processes live in `src/shared/types.ts`:

- `Tab` -- Tab state object (id, type, name, status, worktree, cwd, pid, sessionId, projectId)
- `SavedTab` -- Persisted tab info for session restore (name, cwd, worktree, sessionId)
- `TabStatus` -- `'new' | 'working' | 'idle' | 'requires_response' | 'shell'`
- `TabType` -- `'claude' | 'powershell' | 'wsl'`
- `PermissionMode` -- `'default' | 'plan' | 'acceptEdits' | 'bypassPermissions'`
- `ProjectConfig` -- Project identity (id, dir, colorIndex)
- `WorkspaceConfig` -- Workspace layout (id, name, projects, activeProjectId, geometry)
- `PROJECT_COLORS` -- 8-entry color palette for per-project tinting (name, hue)
- `RemoteAccessInfo` -- Remote tunnel state (status, tunnelUrl, token, error)
- `RemoteAccessStatus` -- `'inactive' | 'installing' | 'connecting' | 'active' | 'error'`
- `IpcMessage` -- Named pipe message format (tabId, event, data)
- `HookExecutionStatus` -- Hook execution progress (hookId, hookName, event, status, etc.)

## Flow Control

PTY data delivery supports per-tab flow control to prevent the renderer from being overwhelmed by high-throughput output. The main process maintains a `flowControl` map keyed by tab ID:

- **`pty:pause`** -- Buffers all incoming PTY data instead of sending it to the renderer.
- **`pty:resume`** -- Flushes the buffer and resumes live delivery.

This is driven by the renderer (via `pausePty`/`resumePty`) when xterm.js signals backpressure.

## Key Files

| File | Role |
|---|---|
| `src/preload.ts` | Defines the `contextBridge` API; single source of truth for available IPC methods |
| `src/main/ipc-handlers.ts` | Registers all `ipcMain.handle` and `ipcMain.on` handlers |
| `src/main/project-manager.ts` | `ProjectManager` — per-project manager instances, used by IPC handlers |
| `src/main/workspace-store.ts` | `WorkspaceStore` — persists workspace configs as JSON files |
| `src/renderer/global.d.ts` | Augments `Window` with the `ClaudeTerminalApi` type |
| `src/shared/types.ts` | Shared type definitions used in IPC payloads |
| `src/renderer/App.tsx` | Sets up main-to-renderer event listeners and drives the UI |
| `src/renderer/components/Terminal.tsx` | Subscribes to `pty:data` events per tab |
| `src/main/tab-manager.ts` | Tab state management called by IPC handlers |
| `src/main/pty-manager.ts` | PTY lifecycle management called by IPC handlers |
