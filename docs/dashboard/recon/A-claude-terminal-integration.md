# Lane A — ClaudeTerminal Integration Surface

Recon for an always-on in-app Dashboard / Home page inside the ClaudeTerminal Electron app. Read-only investigation of `infrastructure/claude-terminal`. All code claims cite `file:line` from the source tree. This work happens on the `claude-terminal-dashboard` git worktree (the dir at `infrastructure/claude-terminal-dashboard/` is a worktree of `infrastructure/claude-terminal`, per its `.git` pointer to `claude-terminal/.git/worktrees/claude-terminal-dashboard`).

The Home page must surface todos / problems / in-progress items as PRIMARY content, show live sessions as a SECONDARY glanceable list, and let an item click (a) open a PowerShell tab, (b) copy text, or (c) open a NEW Claude session pre-loaded with a query.

---

## 0. Executive summary

The cleanest, lowest-risk mount for a Home view is a **special pinned, non-PTY tab kind** added as a third `TabType` (`'home'`), rendered in the renderer as a sibling overlay to the `Terminal` instances, never spawning a PTY. The app already has every primitive the Home page needs:

- `tab:create` (claude), `tab:createShell` (shell with chosen `shellType`), and `pty:write` (fire-and-forget write to a PTY) are all exposed through the preload bridge and main handlers.
- Tab status (`new | working | idle | requires_response`) is already pushed to the renderer live via `tab:updated`, so the SECONDARY session list is free: it reads the same `tabs` state `App.tsx` already holds.
- Multi-project, per-project hue tint, and persisted sessions all exist and the Home view can read them with zero new IPC.

The single real gap is **launching a Claude session with an initial prompt**: `claude` is spawned interactively (`cmd.exe /c claude <flags>`) with no positional prompt and no `-p`. The robust pattern is "create the tab, then write the prompt to its PTY once it is ready," which the app already does for other PTY writes. Details in section 3.

Confidence: high on all integration-point claims (read directly from source). Medium on the exact timing primitive for the initial-prompt write (no existing "tab became ready" renderer event; options in section 3).

---

## 1. Renderer entry, App state machine, and the tab model

### Renderer entry
- `src/renderer/renderer.tsx:1-11` — `createRoot(...).render(<App/>)`, imports `./globals.css`. Mounted into `#root` from `src/renderer/index.html`.
- `src/renderer/index.html` is the renderer HTML; `main`/`preload` are wired in `src/main/index.ts:291-315` (`createWindow`, `loadURL`/`loadFile`, `preload: path.join(__dirname,'preload.js')`).

### App state machine (startup vs running)
- `src/renderer/App.tsx:24` — `type AppState = 'startup' | 'running'`.
- `src/renderer/App.tsx:27` — `const [appState, setAppState] = useState<AppState>('startup')`.
- Startup branch: `App.tsx:530-538` returns `<StartupDialog/>` wrapped in `ShellContext.Provider`.
- Running branch: `App.tsx:540-663` returns the sidebar + tab bar + terminal area + status bar shell.
- Transition to `'running'` happens in two places: the auto-start CLI effect (`App.tsx:311`, `335`) and `handleStartSession` (`App.tsx:518`). Both load saved tabs first, then flip `appState`.

### Tab model (`src/shared/types.ts`)
- `types.ts:1` — `TabStatus = 'new' | 'working' | 'idle' | 'requires_response' | 'shell'`.
- `types.ts:3` — `TabType = 'claude' | 'shell'`.
- `types.ts:7-21` — `interface Tab { id; type; name; defaultName; status; worktree; sourceBranch; cwd; shellType; pid; sessionId; projectId }`.
- `types.ts:23-29` — `SavedTab` (persisted shape): `name, cwd, worktree, sourceBranch, sessionId`.

### Can a third tab kind / pinned non-PTY "home" view be added? — Yes, cleanly.

The renderer renders one `<Terminal>` per tab unconditionally:

- `App.tsx:577-583` — `{tabs.map((tab) => (<Terminal key={tab.id} tabId={tab.id} isVisible={tab.id===activeTabId} />))}`.

`Terminal.tsx` creates an xterm instance and (separately) the main process spawns a PTY for every tab created via `tab:create`/`tab:createShell`. A Home tab must NOT spawn a PTY and must NOT mount xterm. Two viable strategies:

**Strategy H1 (recommended): a real pinned tab of a new `TabType: 'home'`, created in the renderer only.**
- Add `'home'` to `TabType` (`types.ts:3`) and a status value or reuse `'shell'`-style neutrality. The Home tab is a renderer-only object; it never calls `tab:create`/`tab:createShell`, so the main process never spawns a PTY for it.
- In the render map, branch on `tab.type === 'home'` to render `<HomeView/>` instead of `<Terminal/>` (`App.tsx:577-583`). xterm is never instantiated for it.
- Pin it first and make it the default active tab on launch (section 4).
- Lowest risk because it reuses the existing active-tab visibility machinery (`isVisible`), keybindings, and tab-bar rendering. The Home tab can be excluded from `tab:reorder`/close where appropriate.

**Strategy H2: a separate non-tab "overlay" pane toggled by a button/shortcut, outside the `tabs` array.**
- Render `<HomeView/>` as an absolutely-positioned sibling inside the terminal area (`App.tsx:576`) shown when a `showHome` boolean is true, hiding the active terminal beneath it.
- Pro: zero changes to `Tab`/`TabType`, no main-process awareness, no persistence concerns.
- Con: it is not "a tab," so it does not show in the tab bar and cannot be selected with Ctrl+1..9; the "always-on home as the landing surface" UX is weaker.

Given the requirement that Home is the PRIMARY landing content, **H1 is the better fit**: it makes Home a first-class, pinned, default tab. The PTY-spawn avoidance is purely a renderer concern (don't call the create IPCs for it), so the blast radius in the main process is near zero. The one main-process touch is persistence filtering (section 4): `doPersistSessions` already filters to `type === 'claude'` (`index.ts:119`, `:141`), so a `'home'` tab is naturally excluded from `sessions.json` with no change. If you want it restored on launch you synthesize it in the renderer, not from disk.

Risk note (H1): `App.tsx:341-344` and the auto-start path create a fallback Claude tab when `allTabs.length === 0`. If Home is a renderer-only pinned tab, ensure these "no tabs -> create one" guards count only real (claude/shell) tabs, or the app will spawn an unwanted Claude tab behind Home.

---

## 2. IPC + preload to create tabs and write to a PTY

All three operations the Home page needs already exist. Channel naming follows `noun:action` (AGENTS.md "Code Review Standards").

### (a) Create a Claude tab — `tab:create`
- Preload: `preload.ts:30-31` — `createTab(projectId, worktree?, resumeSessionId?, savedName?) => invoke('tab:create', projectId, worktree ?? null, resumeSessionId, savedName)`.
- Main handler: `ipc-handlers.ts:336-411`. Signature is overloaded (new: `projectId, worktree, resume, savedName`; legacy: `worktree, resume, savedName`) detected at `:345` by whether arg 1 is a known project id. Spawns Claude via `ptyManager.spawn(...)` at `:407`, then `wirePtyToTab(proc, tab, cwd)` at `:409`, returns the `Tab`.
- From the renderer App you already call it as `window.claudeTerminal.createTab(projectId, null)` (`App.tsx:143`, `:170`, `:274`, `:342`, `:525`).

### (b) Create a shell tab with a chosen shell — `tab:createShell`
- Preload: `preload.ts:34-35` — `createShellTab(shellType, afterTabId?, cwd?) => invoke('tab:createShell', shellType, afterTabId, cwd)`.
- Main handler: `ipc-handlers.ts:515-547`. Resolves project from `afterTabId` or first project (`:517-525`), picks `cwd` (`:531-535`), creates a shell tab (`tabManager.createTab(cwd, null, 'shell', undefined, projectId, null, shellType)` at `:537`), spawns via `ptyManager.spawnShell(tab.id, cwd, shellType)` at `:544`, wires with `{ alwaysActivate: true }` at `:545`.
- `shellType` is the shell id string. Valid Windows ids: `'powershell' | 'wsl' | 'cmd'` — `platform.ts:14-18`. For the Home page "jump to a new PowerShell tab" action, pass `'powershell'`. The default shell preference is read via `settings:getDefaultShell` (`preload.ts:78`) and surfaced in `App.tsx:59` `defaultShell`; `handleNewDefaultShellTab` (`App.tsx:192-197`) already resolves the default. Use `createShellTab('powershell', activeTabId)` for an explicit PowerShell tab, or reuse `handleNewDefaultShellTab` if the user's default should win.

### (c) Write to a PTY — `pty:write` / `writeToPty`
- Preload: `preload.ts:50-51` — `writeToPty(tabId, data): void => ipcRenderer.send('pty:write', tabId, data)` (fire-and-forget).
- Main listener: `ipc-handlers.ts:744-746` — `ipcMain.on('pty:write', (_e, tabId, data) => ptyManager.write(tabId, data))`.
- `PtyManager.write`: `pty-manager.ts:66-68` — `this.ptys.get(tabId)?.process.write(data)`.
- Existing renderer usages: `Terminal.tsx:149` (forward keystrokes), `App.tsx:211` (Ctrl+L refresh sends `\x0c`), `keybindings.ts:66` (Ctrl+Enter sends `\x1b\r`). This is the exact mechanism for the "copy text into a session" and "pre-load a query" behaviors (send the text, optionally followed by `\r` to submit).

### Adding a new channel (if needed)
Per AGENTS.md, a new channel needs: main handler (`ipc-handlers.ts`) + preload method (`preload.ts`) + type in `global.d.ts` (auto via `typeof api`, `preload.ts:243`, `global.d.ts:1-7`) + an assertion in `tests/main/ipc-handlers.test.ts:184-209` (the "registers all expected channels" list). Also decide remote parity: broadcast channels are listed in `sendToRenderer` (`index.ts:88-105`) and the web client stubs new methods in `src/web-client/ws-bridge.ts`. The Home page likely needs **no new IPC** for create/write — only possibly a small helper for "open Claude with a prompt" timing (section 3).

---

## 3. How a Claude session is spawned, and whether an initial prompt can be passed

### Spawn path
- `tab:create` builds `args` starting from `PERMISSION_FLAGS[state.permissionMode]` (`ipc-handlers.ts:390`), appends `-w <worktree>` + an `--append-system-prompt` for worktree tabs (`:391-394`), and `--resume <sessionId>` when resuming (`:395-398`).
- Sets env: `CLAUDE_TERMINAL_TAB_ID`, `CLAUDE_TERMINAL_PIPE`, `CLAUDE_TERMINAL_TMPDIR` (`:400-404`) — these are how hooks find the named pipe.
- `ptyManager.spawn(tab.id, spawnCwd, args, extraEnv)` (`:407`).
- `PtyManager.spawn`: `pty-manager.ts:16-40`. Merges `process.env` + `extraEnv` (`:22-24`), resolves the command via `getClaudeCommand(args)` (`:28`), `pty.spawn(shell, spawnArgs, {cols:120, rows:40, cwd, env})` (`:30-36`).
- `getClaudeCommand`: `claude-cli.ts:1-6` — Windows: `{ command: 'cmd.exe', args: ['/c','claude', ...flags] }`; non-Windows: `{ command:'claude', args: flags }`.

### Permission flags
- `types.ts:70-75` — `PERMISSION_FLAGS = { default: [], plan: ['--plan'], acceptEdits: ['--allowedTools','Edit,Write,NotebookEdit'], bypassPermissions: ['--dangerously-skip-permissions'] }`.
- Default stored mode is `bypassPermissions` (`settings-store.ts:21`), so new tabs are non-interactive on permissions by default.

### Can an initial prompt be passed? — Not as a spawn arg today; use the PTY-write pattern.

There is no positional prompt and no `-p` anywhere in the spawn args (verified: the only `--*-prompt` usage is `--append-system-prompt` for worktree isolation, `ipc-handlers.ts:393`, `:487`; grep found no `-p`/positional/initial-prompt). These are interactive sessions; a positional prompt with `claude "<text>"` would run headless and is wrong for an interactive tab.

The robust pattern for "open a new Claude session pre-loaded with a query":

1. Call `createTab(projectId, null)` to spawn the interactive Claude REPL (`preload.ts:30`).
2. Once Claude's REPL is ready to accept input, `writeToPty(tabId, query)` (optionally `+ '\r'` to submit) (`preload.ts:50`).

The timing question is "when is the REPL ready?" Two signals exist:
- **Hook-driven (cleanest):** the `tab:ready` hook fires when SessionStart completes; the main process sets the tab to `idle`/`new` and pushes `tab:updated` (`hook-router.ts:63-118`, status set at `:104`/`:106`, broadcast at `:167-170`). The renderer sees this via `onTabUpdate` (`App.tsx:354-364`). So: create the tab, remember its id, and when an `onTabUpdate` for that id arrives with `status !== 'new'` (i.e. `idle`), send the prompt. This rides existing infrastructure with no new IPC.
- **Naive (fragile):** a fixed `setTimeout` after create before writing. Works but racey on slow starts; avoid.

Recommendation: implement the prompt-injection in the renderer by queuing `{tabId, query}` after `createTab`, and flushing the write inside the existing `onTabUpdate` handler when that tab first reports a non-`new` status. If you prefer to keep it main-side, add a `tab:create` option that stashes a pending prompt and writes it in `hook-router.ts` on `tab:ready` — but that crosses more layers; the renderer-side queue is lower risk. Confidence: medium (depends on REPL accepting a paste immediately at `idle`; validate live before shipping).

Caveat for `--resume`: when resuming, two SessionStart events fire ("startup" then "resume") per the comment at `hook-router.ts:108-112`; gate the prompt-write on the first transition to `idle` to avoid double-send.

---

## 4. Session persistence and a pinned/default Home tab

### Persistence model (two tiers)
- Global app settings (`claude-terminal-settings.json` in `userData`): `settings-store.ts:30-92` — recentDirs, permissionMode, defaultShell, remoteTransport.
- Per-directory session list (`<projectDir>/.claude-terminal/sessions.json`): `settings-store.ts:96-127` (`getSessions`/`saveSessions`), constants at `:9-10`.
- Write path: `index.ts:111-162` — `doPersistSessions()` iterates projects (`:115-135`), maps `claude` tabs with a `sessionId` and `status !== 'new'` into `SavedTab` (`:119-127`), debounced by `persistSessions()` (`:156-162`, 200 ms).
- Restore path: on start, `App.tsx:319` / `:504` reads `getSavedTabs(dir)` and recreates each via `createTab(projectId, worktree, sessionId, name)` (`App.tsx:322-326`, `:507-511`). `session:getSavedTabs` filters out worktree tabs whose dir vanished (`ipc-handlers.ts:309-320`).

### How a pinned Home tab persists/restores + defaults on launch
A Home tab should be **synthesized in the renderer, not persisted to disk**:
- `doPersistSessions` already filters to `type === 'claude'` (`index.ts:119`, `:141`), so a `'home'` tab is automatically excluded from `sessions.json`. No change needed.
- On launch, after the existing restore completes (both branches: `App.tsx:333-344` and `:514-527`), prepend a synthesized Home tab to `tabs` and set it active by default. Concretely: after `setTabs(allTabs)` / `setActiveTabId(activeId)`, insert the Home tab at index 0 and set `activeTabId = homeTab.id` so Home is the landing surface.
- Because the Home tab is renderer-only, the "renderer reload" path (`App.tsx:303-316`, which reads `getTabs()` from the still-alive main process) will NOT return Home (the main process never knew about it). Re-synthesize it the same way on that path too.
- Guard the `allTabs.length === 0 -> createTab` fallbacks (`App.tsx:341-344`, `:524-527`) so they ignore the synthetic Home tab when deciding whether to spawn a real Claude tab.

If you instead want Home to be a true main-process tab (Strategy H1 with main awareness), you would add a `type: 'home'` skip in `wirePtyToTab`/spawn paths and in `doPersistSessions` — more surface area, not recommended. Keep Home renderer-only.

Default-on-launch is purely "set `activeTabId` to the Home tab id after restore." There is no main-process notion of a default tab to fight with; the active tab is whatever the renderer sets via `setActiveTabId` + `switchTab` (`App.tsx:113-121`).

---

## 5. Multi-project model + per-project tinting

- Project types: `types.ts:44-60` — `PROJECT_COLORS` (8 hues), `ProjectConfig { id, dir, colorIndex, displayName? }`. Workspace: `types.ts:62-68`.
- Main registry: `ProjectManager` (referenced throughout `ipc-handlers.ts`); channels `project:add` (`:191-230`), `project:remove` (`:232-256`), `project:list` (`:258-263`). Each project owns its own `worktreeManager`, `hookInstaller`, `hookConfigStore`, `hookEngine` (`ipc-handlers.ts:430-432` etc.).
- Renderer state: `App.tsx:35-36` `projects`/`activeProjectId`; tab filtering by active project at `App.tsx:81-84`; per-project tab counts (idle/working/requires_response/total) computed at `App.tsx:87-102` — this is exactly the data a multi-project Home view would aggregate.
- Per-project tint: `App.tsx:105-111` sets CSS var `--project-hue` from `PROJECT_COLORS[colorIndex].hue`. The tab bar and status bar consume it: `TabBar.tsx:100` `bg-[hsl(var(--project-hue)_30%_18%)]`, `StatusBar.tsx:37` likewise, window border `App.tsx:533`/`:542`. `ProjectSidebar.tsx:50-90` renders per-project buttons with status dots (waiting=amber `#f59e0b`, working=blue `#3b82f6` pulsing) — a ready-made visual vocabulary the Home page should match.
- Implication for Home: the Home view can show problems/sessions **across all projects** (read `tabs` unfiltered, group by `projectId`) or scoped to the active project. The unfiltered `tabs` array plus `tabCounts` (`App.tsx:87-102`) and `PROJECT_COLORS` give everything needed without new IPC.

---

## 6. Hook / status system (the live data feed for the dashboard)

This is the engine that makes "in-progress items" live with zero polling.

### Transport
- Named pipe per app instance: `index.ts:33` `PIPE_NAME = \\\\.\\pipe\\claude-terminal-${process.pid}`. Server: `HookIpcServer` (`ipc-server.ts:7-64`), started at `index.ts:377-381`, newline-delimited JSON frames parsed at `ipc-server.ts:26-40`.
- Hook scripts live in `src/hooks/` (`on-session-start.js`, `on-prompt-submit.js`, `on-tool-use.js`, `on-stop.js`, `on-notification.js`, `on-session-end.js`, shared `pipe-send.js`). They are Node scripts (AGENTS.md: hooks MUST be Node, not bash). `pipe-send.js:1-28` reads `CLAUDE_TERMINAL_TAB_ID` + `CLAUDE_TERMINAL_PIPE` from env (not argv, to dodge cmd.exe backslash mangling) and sends `{tabId, event, data}`.
- Example: `on-stop.js:1-7` execs `pipe-send.js tab:status:idle`.

### Status state machine
- Router: `hook-router.ts:54-171` (`handleHookMessage`). Events: `tab:ready` (`:63-118`, sets sessionId + idle/new), `tab:status:working` (`:121-123`), `tab:status:idle` (`:125-132`), `tab:status:input` -> `requires_response` (`:134-141`), `tab:name`/`tab:generate-name` (`:150-161`).
- Status values map to `TabStatus` (`types.ts:1`): `new | working | idle | requires_response | shell`.
- After any status change the router pushes `tab:updated` (`hook-router.ts:167-170` -> `sendToRenderer('tab:updated', updated)`).
- Off-screen notifications: when an idle/input event lands on a non-active tab, a native `Notification` is shown (`hook-router.ts:23-48`, `:127-131`, `:136-140`); clicking it switches project + tab.

### How the Home view consumes this
- The renderer already subscribes: `App.tsx:354-364` `onTabUpdate` merges each updated `Tab` into the `tabs` array. The Home view simply reads `tabs` (and derived `tabCounts`, `App.tsx:87-102`). No new IPC, no polling. `requires_response` tabs are the "needs you" items; `working` are "in progress"; `idle` are "ready". This is the live backbone of the SECONDARY session list AND a strong signal source for the PRIMARY "problems / needs-you" feed.
- Note: `hook:status` (hook-execution status, distinct from tab status) is also pushed (`ipc-handlers.ts:184-188`, consumed `App.tsx:398-407`, shown in `StatusBar`). Separate concern; not needed for the session list but available.

---

## 7. shadcn / Tailwind setup and where renderer state lives

### Styling
- shadcn config: `components.json:1-21` — style `new-york`, lucide icons, CSS at `src/renderer/globals.css`, aliases `@/components`, `@/lib/utils`, `@/components/ui`, `@/lib`, `@/hooks`.
- Tailwind v4: `globals.css:1-2` (`@import "tailwindcss"; @import "tw-animate-css";`), theme tokens as CSS vars in `:root` (`globals.css:37-66`) including `--background #1e1e1e`, `--card #252526`, `--primary #007acc`, `--success`, `--warning`, `--destructive`, `--attention`, and `--project-hue` (`:65`). Token-to-utility mapping in `@theme inline` (`globals.css:6-35`).
- Existing shadcn primitives in `src/renderer/components/ui/`: `badge, button, dialog, dropdown-menu, input, label, popover, radio-group, select, switch, table`. A dashboard can be built from `card`-styled divs + `button` + `badge` + `table` + `dropdown-menu` without pulling new deps (no `card.tsx` yet — either add it via shadcn or use `bg-card` utility divs).
- `cn()` helper: `src/renderer/lib/utils.ts` (clsx + tailwind-merge), aliased `@/lib/utils` (used everywhere, e.g. `TabBar.tsx:8`).

### Path aliases (build + test must agree)
- `tsconfig.json:16-20` — `@shared/* -> src/shared/*`, `@main/* -> src/main/*`, `@/* -> src/renderer/*`. Same aliases are configured in vite + vitest configs (AGENTS.md "Common Patterns").

### Where renderer state lives
- **No external state library.** All app state is local React state in `App.tsx` via `useState` + `useRef` mirrors (`App.tsx:27-72`). Cross-cutting context is minimal: `ShellContext` (`src/renderer/shell-context.ts`) provides available shells (`App.tsx:532`, `:541`). Tabs/active-tab/projects/active-project all live in `App.tsx`. A Home view should receive `tabs`, `projects`, `tabCounts`, `activeProjectId`, and the existing handlers (`handleSelectTab`, `handleNewShellTab`, `createTab`, `writeToPty`) as props, mirroring how `TabBar`/`StatusBar`/`ProjectSidebar` are wired (`App.tsx:555-585`).
- xterm instances are cached out-of-React in `terminalCache` (`src/renderer/components/terminalCache.ts`, used by `Terminal.tsx:8`). Home is not a terminal, so it does not touch this cache.

---

## 8. Recommended mounting strategy for the Home view

**Mount as a pinned, renderer-only `TabType: 'home'` tab, default-active on launch, rendered as a branch in the existing tab map.** Concrete steps, smallest-blast-radius first:

1. **Type:** add `'home'` to `TabType` (`types.ts:3`). Leave `Tab` shape unchanged (Home uses `pid:null`, `sessionId:null`, `shellType:null`).
2. **Synthesize Home in the renderer** after restore in both start paths (`App.tsx:333-344`, `:514-527`) and the renderer-reload path (`App.tsx:306-316`): build a Home tab object, prepend to `tabs`, set it active. Do NOT call any `tab:create*` IPC for it (so no PTY spawns).
3. **Render branch:** in the terminal-area map (`App.tsx:577-583`), render `<HomeView ... />` when `tab.type === 'home'`, else `<Terminal/>`. HomeView is absolutely positioned `inset-0` with `display` driven by `isVisible`, same visibility contract as `Terminal.tsx:307-313`.
4. **Wire props:** pass `tabs` (unfiltered, for cross-project), `projects`, `tabCounts`, `activeProjectId`, and handlers: `handleSelectTab` (jump to a session), `handleNewShellTab`/`handleNewDefaultShellTab` (open PowerShell), a new thin `openClaudeWithPrompt(projectId, query)` helper (createTab + queued PTY write per section 3), and a copy helper (`navigator.clipboard.writeText`, already used in `Terminal.tsx:261`).
5. **Guard fallbacks:** make the `allTabs.length === 0 -> createTab` guards (`App.tsx:341-344`, `:524-527`) ignore the synthetic Home tab so they do not spawn a stray Claude tab behind Home.
6. **Tab bar:** optionally pin Home leftmost and suppress its close button in `Tab.tsx` (render based on `tab.type === 'home'`). Tint already applies via `--project-hue`.
7. **Persistence:** nothing to do — `type === 'claude'` filters in `doPersistSessions` (`index.ts:119`, `:141`) already exclude Home.
8. **Docs/tests:** if any new IPC is added (likely none, or only an `openClaudeWithPrompt` convenience), update `tests/main/ipc-handlers.test.ts:184-209` channel list, `docs/ipc.md`, and `global.d.ts` (auto via `typeof api`). Most of the Home build needs no IPC changes.

### Primary vs secondary content sourcing
- PRIMARY (todos / problems / in-progress): aggregate from (a) live tab statuses — `requires_response` = needs-you, `working` = in-progress (read `tabs` + `tabCounts`, `App.tsx:87-102`); (b) any external todo source Lane B/C defines. Lane A confirms the in-app live signal is free and real-time via the hook->`tab:updated` pipe (section 6).
- SECONDARY (live sessions, glanceable): the same `tabs` array, grouped by `projectId`, colored by `PROJECT_COLORS[colorIndex].hue`, with `TabIndicator`-style status dots (`StatusBar.tsx`, `ProjectSidebar.tsx:76-86` show the existing dot vocabulary). Click -> `handleSelectTab(tab.id)`.
- Item actions: (a) PowerShell tab -> `createShellTab('powershell', activeTabId)` (`preload.ts:34`); (b) copy -> `navigator.clipboard.writeText(text)`; (c) new Claude w/ query -> `createTab(projectId,null)` then queued `writeToPty` on first `idle` (section 3).

---

## 9. Risks and constraints

1. **Initial-prompt timing (medium).** No spawn-arg prompt exists; the PTY-write-after-ready pattern depends on the REPL accepting input at first `idle`. Validate live (paste + optional `\r`). The `--resume` double-SessionStart (`hook-router.ts:108-112`) means gate on the first `new -> idle` transition to avoid double-send. (Confidence: medium.)
2. **Fallback tab spawns (high impact if missed).** The `length === 0 -> createTab` guards (`App.tsx:341-344`, `:524-527`) and the per-project "no tabs -> createTab" branch (`App.tsx:142-145` in `handleSelectProject`) will treat a renderer-only Home tab as "no real tabs" unless you filter by type. Miss this and a phantom Claude tab spawns. (Confidence: high.)
3. **Renderer-reload path (medium).** `App.tsx:303-316` rehydrates from the live main process (`getTabs()`), which will not include the synthetic Home tab; re-synthesize on that branch too or Home vanishes after an HMR/reload. (Confidence: high.)
4. **Remote parity (low/medium).** The web client (`src/web-client/`, `ws-bridge.ts`) mirrors the preload API. A Home tab is local-desktop UX; if you add any preload method, `ws-bridge.ts` must stub it (AGENTS.md "Remote / Local Parity"), and `index.ts:88-105` `sendToRenderer` only forwards specific channels to remote. Decide explicitly that Home is local-only (likely). (Confidence: high on the requirement, the choice is a design call.)
5. **No `card.tsx` primitive yet (low).** shadcn `card` is not in `components/ui/`; either add it or use `bg-card` utility divs. No blocker. (Confidence: high.)
6. **PowerShell is the house shell (project rule).** The workspace mandates PowerShell for user-facing/remote commands; the Home "jump to a shell" action should default to `'powershell'` (`platform.ts:15`) rather than the OS default if you want to honor that, though `getDefaultShell` already lets the user pick. (Confidence: high on shell ids; the default choice is a UX call.)
7. **One PTY per app instance pipe (info).** Status hooks key off `CLAUDE_TERMINAL_PIPE`/`TAB_ID` env set at spawn (`ipc-handlers.ts:400-404`); Home spawns nothing so it has no hook footprint, which is correct. (Confidence: high.)

---

## 10. Key files

| File | Role for the Home view |
|---|---|
| `src/renderer/App.tsx` | Root state machine, `tabs`/`projects`/`tabCounts`, render map (mount point at `:577-583`), handlers to pass to HomeView |
| `src/shared/types.ts` | `Tab`, `TabType` (add `'home'` at `:3`), `TabStatus`, `PROJECT_COLORS`, `PERMISSION_FLAGS` |
| `src/preload.ts` | Bridge: `createTab` (`:30`), `createShellTab` (`:34`), `writeToPty` (`:50`), `onTabUpdate` (`:159`) |
| `src/main/ipc-handlers.ts` | Handlers: `tab:create` (`:336`), `tab:createShell` (`:515`), `pty:write` (`:744`) |
| `src/main/pty-manager.ts` | `spawn`/`spawnShell`/`write`; Claude spawn shape |
| `src/shared/claude-cli.ts` | `getClaudeCommand` — `cmd.exe /c claude <flags>`, no prompt arg |
| `src/main/hook-router.ts` | Status state machine; `tab:ready`->idle, the "ready" signal for prompt injection |
| `src/main/ipc-server.ts` | Named-pipe hook server (live status transport) |
| `src/hooks/pipe-send.js` | How hooks emit status frames |
| `src/main/settings-store.ts` | Per-dir `sessions.json` persistence (Home excluded automatically) |
| `src/main/index.ts` | `doPersistSessions` (`:111`, type filter at `:119`/`:141`), `sendToRenderer` remote forwarding (`:88`), window creation |
| `src/renderer/components/Terminal.tsx` | Visibility contract + clipboard usage to mirror in HomeView |
| `src/renderer/components/StatusBar.tsx`, `ProjectSidebar.tsx` | Existing status-dot/count visual vocabulary to reuse |
| `src/renderer/globals.css`, `components.json` | shadcn/Tailwind tokens + config |
| `tests/main/ipc-handlers.test.ts` | Channel-registration assertion list (update only if new IPC added) |
