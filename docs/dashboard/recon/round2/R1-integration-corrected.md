# R1 Integration Map (CORRECTED) — In-App Dashboard / Home View

**GAP closed:** Round-1 recon cited file:line against the wrong branch. This document re-derives every citation from the BUILD-TARGET worktree.

- **Worktree:** `C:/Users/Mark/Claude-Code/infrastructure/claude-terminal-dashboard`
- **Branch:** `dashboard` (based on `master`)
- **HEAD:** `ce2e9e02d4e886ee892a284c7a2a7009491236b8`
- All line numbers below are verified against this exact checkout.

---

## 0. Why the prior citations were wrong (branch divergence)

The `dev` branch added remote-access plumbing (`RemoteTransport` / `RemoteConnection` types, tailscale transport, secure-store, RemoteSession UI). Those additions land **early** in several shared files, which pushes every later line down. If round-1 read `dev`, its citations for the files below are shifted.

Verified shifts (`git diff dashboard..dev`):

| File | dev divergence | Effect on later citations |
|---|---|---|
| `src/shared/types.ts` | +17 lines inserted at the "Remote access" block (line ~86): `RemoteTransport` type + `transport?` field on `RemoteAccessInfo` + `RemoteConnection` interface | **Tab (line 7) and TabType (line 3) are UNAFFECTED** because they sit above the insertion. Anything below line 77 on `dev` is shifted. |
| `src/main/index.ts` | +75/-? lines (remote transport, secure-store wiring) inserted before the persistence helpers | Persistence filter shifts **+7** (dashboard 111/133 vs dev 118/140); broadcast block shifts **+7** (dashboard 84-85 vs dev 91-92) |
| `src/main/ipc-handlers.ts` | +27 lines (remote IPC channels) | Later handlers shifted |
| `src/preload.ts` | +14 lines (remote connection API) | Later methods shifted |
| `src/main/settings-store.ts` | +68 lines (remembered remote connections) | Everything after the recent-dirs block shifted |
| `src/main/web-remote-server.ts` | +22 lines | Snapshot/sync logic shifted |

**Net:** types.ts `Tab`/`TabType` citations happen to match across branches; `index.ts`, `ipc-handlers.ts`, `preload.ts`, `settings-store.ts`, `web-remote-server.ts` do NOT. The corrected numbers below are from `dashboard`.

Confidence: **high** (diffs run directly against both refs).

---

## (a) App.tsx — tab render map + active-tab / startup logic

File: `src/renderer/App.tsx`

### Where a Home view branches in (the render map)

The terminal render map is the place a Home view would conditionally replace or sit alongside terminals:

- **Render map:** `App.tsx:577-583` — `{tabs.map((tab) => <Terminal key={tab.id} tabId={tab.id} isVisible={tab.id === activeTabId} />)}`, inside the `data-terminal-area` container at `App.tsx:576`.
  - Note: this maps over **`tabs`** (all tabs), not `activeProjectTabs`; visibility is gated by `tab.id === activeTabId`. A Home view added as overlay would render a sibling element here, shown when `activeTabId === '__home__'` (or whatever sentinel) / when a synthetic Home tab is active.
- **TabBar** receives `activeProjectTabs` at `App.tsx:555-556`; **StatusBar** at `App.tsx:585`. Both filter by project, so a global Home tab must be handled outside the per-project filter (see activeProjectTabs at `App.tsx:81-84`).

### Active-tab state and startup

- **State decls:** `tabs` at `App.tsx:28`, `activeTabId` at `App.tsx:29`, `appState` ('startup' | 'running') at `App.tsx:27` (type at `App.tsx:24`).
- **Active-tab refs (stale-closure guards):** `activeTabIdRef` at `App.tsx:45-46`.
- **Select-tab handler:** `handleSelectTab` at `App.tsx:113-121` (calls `window.claudeTerminal.switchTab`). A Home selection must short-circuit this (no PTY to switch to) — flag.
- **Startup auto-start effect (CLI dir path):** `App.tsx:282-350`. Sets tabs/active/appState. Contains a fallback spawn (see (b)).
- **Manual start path:** `handleStartSession` at `App.tsx:495-528`. Also contains a fallback spawn (see (b)).
- **Startup gate render:** `App.tsx:530-538` returns the `StartupDialog` while `appState === 'startup'`; the main running UI returns at `App.tsx:540+`.

Confidence: **high**.

---

## (b) Every `allTabs.length === 0` fallback-spawn site to guard

A synthetic Home tab must NOT count as a real tab for "do we need to auto-spawn a Claude tab?" decisions, or it suppresses the first real spawn. Verified sites:

1. **`App.tsx:341-344`** (startup auto-start effect):
   ```ts
   if (allTabs.length === 0) {
     const tab = await window.claudeTerminal.createTab(projectId, null);
     setActiveTabId(tab.id);
   }
   ```
   `allTabs` comes from `getTabs()` at `App.tsx:329`. Guard: compute the count from real (claude/shell) tabs only.

2. **`App.tsx:524-527`** (`handleStartSession`):
   ```ts
   if (allTabs.length === 0) {
     const tab = await window.claudeTerminal.createTab(projectId, null);
     setActiveTabId(tab.id);
   }
   ```
   `allTabs` from `getTabs()` at `App.tsx:514`.

3. **`App.tsx:373`** (`onTabRemoved` listener) — `if (remaining.length === 0) return null;` sets `activeTabId` to null when the last tab closes. This is the natural hook point to instead fall back to the Home view when the last real tab closes. Not a spawn, but the same "zero tabs" decision — flag as the place to route to Home rather than null.

4. **Main-process activation guard — `ipc-handlers.ts:105`**:
   ```ts
   if (opts?.alwaysActivate || tabManager.getAllTabs().length === 1) {
     tabManager.setActiveTab(tab.id);
   }
   ```
   This auto-activates the first tab. If a synthetic Home tab were ever registered in `TabManager` (NOT recommended — see remote-parity note), `getAllTabs().length === 1` would be wrong. **Recommendation: keep Home entirely renderer-side; never insert it into `TabManager`.** If Home must live in `TabManager`, this line plus every `getAllTabs()`-derived count must exclude it.

5. **Related (not zero-checks but Home-aware):** `handleSelectProject` at `App.tsx:142-145` auto-creates a tab when a project has zero tabs (`projectTabs.length > 0` else-branch). A Home view that is per-project would interact here.

There is **no** main-process auto-spawn on last-tab-close (verified: `git grep createTab` in main shows only explicit handlers, not zero-tab fallbacks). The web-remote-server has its own explicit `tab:create` handlers (`web-remote-server.ts:323`, `:368`) triggered by remote clients, not zero-tab fallbacks.

Confidence: **high**.

---

## (c) types.ts — Tab interface, TabType union, new fields, remote-parity

File: `src/shared/types.ts`

- **TabType union:** `types.ts:3` — `export type TabType = 'claude' | 'shell';`
  Add `'home'`: `export type TabType = 'claude' | 'shell' | 'home';`
- **TabStatus union:** `types.ts:1` — `export type TabStatus = 'new' | 'working' | 'idle' | 'requires_response' | 'shell';` (relevant if Home needs its own status sentinel).
- **Tab interface:** `types.ts:7-21`. Current fields: `id, type, name, defaultName, status, worktree, sourceBranch, cwd, shellType, pid, sessionId, projectId`.
  - Add `statusSince` and `lastActivityAt` here (e.g. `statusSince: number | null;` `lastActivityAt: number | null;` — epoch ms).
- **`PERMISSION_FLAGS`:** `types.ts:70-75` (the claude spawn flag map; see (f)).

### Remote-parity implication (CRITICAL)

`Tab` is broadcast verbatim to remote web clients. Adding fields to `Tab` ships them over the wire:

- `index.ts:84-85` broadcasts `tab:updated` with `args[0]` (a full `Tab`) to `webRemoteServer.broadcast(...)`.
- `web-remote-server.ts:234` + `:244` build `tabs:sync` from `tabManager.getAllTabs()` — full `Tab[]` — and send to every authenticating client.
- `web-remote-server.ts:302-303` and `:312` re-broadcast/re-sync full tabs.

Implications:
1. `statusSince` / `lastActivityAt` are harmless additive fields over the wire (web client can ignore them). Adding them is **remote-safe** but the web client's tab model / `ws-bridge.ts` should be checked so it doesn't choke on unknown fields (it currently spreads tabs, so low risk).
2. `TabType: 'home'` is the real hazard. If a Home tab is ever inserted into `TabManager`, it flows into `tabs:sync` and the web client renders a phantom tab with no PTY. `sendTerminalSnapshots` (`web-remote-server.ts:115-127`) calls `serializeTerminal(tab.id)`; for a Home tab that returns empty and is caught/logged (benign), but the phantom tab still appears remotely. **Decision driver:** keep Home a renderer-only concept; do NOT register it in `TabManager`. The `'home'` TabType then only ever exists on renderer-side synthetic objects, never crossing IPC.

Confidence: **high**.

---

## (d) index.ts — persistence filter that excludes non-claude tabs

File: `src/main/index.ts`

- **Multi-project persist filter:** `index.ts:111` — `const claudeTabs = projectTabs.filter(t => t.type === 'claude');` (inside `doPersistSessions`, `index.ts:104-128`).
- **Legacy single-project persist filter:** `index.ts:133` — `const claudeTabs = allTabs.filter(t => t.type === 'claude');` (`index.ts:131-146`).

Both already exclude anything that is not `type === 'claude'`, so a `'home'` tab would be auto-excluded from session persistence with **no change required** here. (This is the corrected location; `dev` has these at 118/140.)

- **The "still initializing" skip:** `index.ts:121` and `index.ts:142` — `if (savedTabs.length === 0 && claudeTabs.length > 0)`. A Home tab does not affect this because it is filtered out before the count.

- **Broadcast forwarding (remote parity):** `sendToRenderer` at `index.ts:75-99`; the `tab:updated` -> remote broadcast at `index.ts:84-85`; the explicit "NOT forwarded" comment at `index.ts:95-98`.

Confidence: **high**.

---

## (e) ipc-handlers.ts + preload.ts — tab:create / tab:createShell / pty:write signatures

### Main handlers (`src/main/ipc-handlers.ts`)

- **`tab:create`:** handler at `ipc-handlers.ts:336-411`. Signature: `(_event, projectIdOrWorktree: string | null, worktreeNameOrResumeId?: string | null, resumeSessionIdOrSavedName?: string, savedNameArg?: string)`. Dual old/new signature detection at `:344-361`. Creates the Tab at `ipc-handlers.ts:378` via `tabManager.createTab(cwd, worktreeName, 'claude', savedName, projectId, sourceBranch)`. Spawns claude at `:407` and wires at `:409`.
- **`tab:createWithWorktree`:** `ipc-handlers.ts:413-513` (creates tab at `:444`, spawns at `:496`).
- **`tab:createShell`:** handler at `ipc-handlers.ts:515-547`. Signature: `(_event, shellType: string, afterTabId?: string, explicitCwd?: string)`. Creates the Tab at `ipc-handlers.ts:537` via `tabManager.createTab(cwd, null, 'shell', undefined, projectId, null, shellType)`; spawns shell at `:544` and wires with `{ alwaysActivate: true }` at `:545`.
- **`pty:write`:** fire-and-forget at `ipc-handlers.ts:736-738` — `ipcMain.on('pty:write', (_event, tabId, data) => ptyManager.write(tabId, data))`. A Home tab has no PTY, so any write keyed to a Home tabId is a no-op silently (`PtyManager.write` uses `?.process.write`, `pty-manager.ts:66-68`). Flag: keystrokes routed to Home must be intercepted renderer-side.
- **`wirePtyToTab`:** defined `ipc-handlers.ts:73-118`; activation count check at `:105`.
- **`TabManager.createTab` signature (source of truth):** `tab-manager.ts:11` — `createTab(cwd, worktree, type='claude', savedName?, projectId='', sourceBranch=null, shellType?)`. Status assigned at `tab-manager.ts:21`: `type === 'claude' ? 'new' : 'shell'`. A `'home'` type would currently fall to the `'shell'` status branch — flag if Home is ever created here (recommend it is not).

### Preload bridge (`src/preload.ts`)

- **`createTab`:** `preload.ts:30-31` — `createTab(projectId, worktree?, resumeSessionId?, savedName?) => invoke('tab:create', ...)`.
- **`createTabWithWorktree`:** `preload.ts:32-33`.
- **`createShellTab`:** `preload.ts:34-35` — `createShellTab(shellType, afterTabId?, cwd?)`.
- **`writeToPty`:** `preload.ts:50-51` — `writeToPty(tabId, data) => send('pty:write', tabId, data)`.
- **`switchTab`:** `preload.ts:38-39` (Home selection must avoid calling this for a non-PTY view).
- **`getTabs` / `getActiveTabId`:** `preload.ts:42-45`.

### Registration-test obligation (from AGENTS.md code-review standard)

Any NEW IPC channel needs: main handler + preload method + `global.d.ts` type (`global.d.ts:1-7`, currently just augments `Window.claudeTerminal` from `ClaudeTerminalApi`) + assertion in `tests/main/ipc-handlers.test.ts`, and an explicit remote-availability decision in `web-remote-server.handleMessage()` + web client `ws-bridge.ts`. A renderer-only Home view ideally adds **no** new IPC channel (lowest-risk path).

Confidence: **high**.

---

## (f) pty-manager.ts — claude spawn path, getClaudeCommand, PERMISSION_FLAGS

- **Spawn entry:** `PtyManager.spawn` at `pty-manager.ts:16-40`. Builds env (`:22-24`), resolves the command via `getClaudeCommand(args)` at `pty-manager.ts:28`, then `pty.spawn(shell, spawnArgs, ...)` at `:30-36`.
- **`getClaudeCommand`:** `src/shared/claude-cli.ts:1-6`. On Windows returns `{ command: 'cmd.exe', args: ['/c', 'claude', ...flags] }`; otherwise `{ command: 'claude', args: flags }`. This is the `cmd.exe /c claude` path the task referenced. **Confirmed it lives in `shared/claude-cli.ts`, not `pty-manager.ts`** (pty-manager only imports it).
- **`PERMISSION_FLAGS`:** defined `src/shared/types.ts:70-75`. Consumed at the spawn sites:
  - `ipc-handlers.ts:390` (tab:create): `const args = [...(PERMISSION_FLAGS[state.permissionMode] ?? [])];`
  - `ipc-handlers.ts:485` (tab:createWithWorktree).
- **Shell spawn (non-claude):** `PtyManager.spawnShell` at `pty-manager.ts:42-64`.

A Home view never spawns a PTY, so it never touches this path. Relevance: the dashboard may want to **read** PERMISSION_FLAGS / permission mode to display state, not to spawn. Permission mode is held in `state.permissionMode` (`ipc-handlers.ts` AppState, `index.ts:62` default `'bypassPermissions'`) and exposed via `settings:permissionMode` (`ipc-handlers.ts:683-685`, preload `getPermissionMode` `preload.ts:76-77`).

Confidence: **high**.

---

## (g) settings-store.ts

File: `src/main/settings-store.ts`

- **StoreData shape:** `settings-store.ts:12-16` — `{ recentDirs, permissionMode, defaultShell }`.
- **DEFAULTS:** `settings-store.ts:18-22`.
- **Settings file path:** `settings-store.ts:29` — `<userData>/claude-terminal-settings.json`.
- **Getters/setters:** recentDirs `:49-63`, permissionMode `:65-72`, defaultShell `:74-81`.
- **Per-directory session persistence:** `getSessions` `:89-104`, `saveSessions` `:106-116` (writes `<dir>/.claude-terminal/sessions.json`). Constants `SESSIONS_DIR`/`SESSIONS_FILE` at `:9-10`.

For a dashboard that persists Home-view preferences (e.g. "open to Home on startup", last-seen filters), the additive pattern is: extend `StoreData` (`:12-16`) + `DEFAULTS` (`:18-22`) + add a getter/setter pair (mirror `:74-81`), then an IPC channel pair + preload method. The store tolerates unknown/extra keys on load via `{ ...DEFAULTS, ...JSON.parse(raw) }` at `:37` (forward-compatible). **No `dev`-branch secure-store/remote-connection persistence exists on `dashboard`** — settings-store here is the simpler 3-field version (dev added +68 lines for remembered remote connections).

Confidence: **high**.

---

## (h) StartupDialog launch flow

File: `src/renderer/components/StartupDialog.tsx`

- **Component:** `StartupDialog.tsx:23-143`. Props `StartupDialog.tsx:9-14` (`onStart`, `onCancel?`, `title?`, `hidePermissions?`).
- **Permission options:** `StartupDialog.tsx:16-21`.
- **Launch trigger:** `handleStart` at `StartupDialog.tsx:48-52` calls `onStart(selectedDir, permissionMode)`; double-click-to-open at `:85-88`; Enter-to-start at `:54-58`.
- **Mounted from App:** as the startup-gate screen at `App.tsx:530-538` (`appState === 'startup'`), and reused as the "Add Project" dialog at `App.tsx:644-651` (with `hidePermissions`).
- **App-side launch handler:** `handleStartSession` at `App.tsx:495-528` (the `onStart` target for the startup screen). The "Add Project" reuse targets `handleAddProjectConfirm` at `App.tsx:263-279`.

### Home-view integration choices at the StartupDialog seam

Two viable seams, both verified:
1. **Replace the StartupDialog gate** (`App.tsx:530-538`) so the app opens to a Home/dashboard view instead of the modal directory picker, with directory selection living inside Home. Highest-visibility change; touches the `appState` machine (`App.tsx:24,27`).
2. **Keep StartupDialog, add Home as the post-start landing** so after `handleStartSession` (`App.tsx:495-528`) sets `appState='running'`, the active view defaults to Home rather than the first terminal. Lower blast radius; the `allTabs.length === 0` fallback at `App.tsx:524` would instead route to Home (see (b) item 2).

Confidence: **high** (both seams read directly; choice is a design decision, not a fact gap).

---

## Corrected Integration Map — summary table (all `dashboard` worktree)

| Concern | File:line | Note |
|---|---|---|
| Tab render map (Home branch-in) | `App.tsx:577-583` (container `:576`) | maps `tabs`, visibility by `activeTabId` |
| Active-tab state | `App.tsx:28-29`, ref `:45-46` | |
| Select-tab handler | `App.tsx:113-121` | Home must short-circuit `switchTab` |
| Startup effect | `App.tsx:282-350` | |
| Manual start | `App.tsx:495-528` | |
| Startup gate render | `App.tsx:530-538` | StartupDialog mount |
| Fallback spawn #1 | `App.tsx:341-344` | guard against Home counting |
| Fallback spawn #2 | `App.tsx:524-527` | guard against Home counting |
| Last-tab-close -> null | `App.tsx:373` | route to Home instead of null |
| Activation count guard | `ipc-handlers.ts:105` | `getAllTabs().length === 1` |
| TabType union | `types.ts:3` | add `'home'` |
| TabStatus union | `types.ts:1` | |
| Tab interface | `types.ts:7-21` | add `statusSince`, `lastActivityAt` |
| PERMISSION_FLAGS | `types.ts:70-75` | |
| Persist filter (multi) | `index.ts:111` | excludes non-claude already |
| Persist filter (legacy) | `index.ts:133` | excludes non-claude already |
| Remote broadcast tab:updated | `index.ts:84-85` | Tab goes over the wire |
| Remote NOT-forwarded comment | `index.ts:95-98` | |
| tabs:sync (full Tab[]) | `web-remote-server.ts:234,244` | phantom-tab hazard |
| Remote re-broadcast | `web-remote-server.ts:302-303,312` | |
| serializeTerminal tolerance | `web-remote-server.ts:115-127` | empty for Home, caught |
| tab:create handler | `ipc-handlers.ts:336-411` (createTab `:378`) | |
| tab:createShell handler | `ipc-handlers.ts:515-547` (createTab `:537`) | |
| pty:write handler | `ipc-handlers.ts:736-738` | no-op for Home tabId |
| TabManager.createTab | `tab-manager.ts:11` (status `:21`) | `'home'` would map to 'shell' status |
| preload createTab | `preload.ts:30-31` | |
| preload createShellTab | `preload.ts:34-35` | |
| preload writeToPty | `preload.ts:50-51` | |
| pty spawn | `pty-manager.ts:16-40` (getClaudeCommand `:28`) | |
| getClaudeCommand | `claude-cli.ts:1-6` | `cmd.exe /c claude` |
| PERMISSION_FLAGS consumed | `ipc-handlers.ts:390,485` | |
| settings StoreData/DEFAULTS | `settings-store.ts:12-22` | |
| settings file path | `settings-store.ts:29` | |
| StartupDialog | `StartupDialog.tsx:23-143` (handleStart `:48-52`) | |
| global.d.ts augmentation | `global.d.ts:1-7` | new IPC -> add type here |

---

## Dev-branch divergence flags affecting the dashboard

1. **`RemoteTransport` / `RemoteConnection` do not exist on `dashboard`** (`types.ts`). Any plan text borrowed from a `dev`-based recon that references them is off-branch. (Confidence: high — `git grep` returns nothing on `dashboard`.)
2. **Broadcast `Tab` type is the parity surface.** On both branches `Tab` is sent to remote clients via `tabs:sync` / `tab:updated`. Additive fields (`statusSince`, `lastActivityAt`) are safe; a `'home'` TabType is only safe if Home never enters `TabManager`/`getAllTabs()`. (Confidence: high.)
3. **settings-store on `dashboard` is the 3-field version** (no remembered remote connections / secure-store). Persisting dashboard prefs follows the simple additive pattern; do not assume the dev secure-store exists. (Confidence: high.)
4. **Line-number shift map** (section 0) is the concrete correction: re-cite `index.ts`, `ipc-handlers.ts`, `preload.ts`, `settings-store.ts`, `web-remote-server.ts` from `dashboard`, not `dev`.

---

## Residual risks / open items

- **Home in TabManager vs renderer-only is a design decision, not a fact.** The safest path (renderer-only synthetic Home, never crossing IPC) is recommended on evidence, but the plan owner must commit to it; if Home goes into `TabManager`, ~6 `getAllTabs()`/`type==='claude'` sites need Home-exclusion audits.
- **Web client tab model parity for new fields** not exhaustively traced into `src/web-client/` (out of the (a)-(h) scope). If `statusSince`/`lastActivityAt` are added to `Tab`, a quick check of the web client's tab rendering is warranted, though additive fields are low-risk.
- **`ws-bridge.ts` stub obligation** (AGENTS.md) applies only if a NEW preload method is added for the dashboard; a renderer-only Home avoids it.
