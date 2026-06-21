# Lane D — Action-Routing Mechanics

Recon for the in-app dashboard / home page in **ClaudeTerminal**
(`C:/Users/Mark/Claude-Code/infrastructure/claude-terminal`).

Scope: how to wire three click-actions from a dashboard card:

1. Click -> open a **new PowerShell tab** at a given `cwd`.
2. Click -> **copy a string** to the clipboard.
3. Click -> **spawn a new Claude session and inject a starting query** so Claude
   immediately begins working.

Read-only investigation. All claims cite `file:line` or a URL. Confidence marked
per claim. Nothing dental/PHI here; the query-injection design must not embed
patient data in spawn args or logs (see "Security & PHI" at the end).

App facts (verified):
- Electron 40 + React 19 + TS, node-pty (ConPTY), xterm.js v6, shadcn/Tailwind.
  (`AGENTS.md` Tech Stack)
- All renderer->main calls go through `contextBridge` in `src/preload.ts`;
  `sandbox: true`, `contextIsolation`, no `nodeIntegration`. (`AGENTS.md`,
  `src/preload.ts:1`, `src/preload.ts:241`)
- IPC naming convention: `noun:action`; `ipcMain.handle` for request/response,
  `ipcMain.on` for fire-and-forget. (`AGENTS.md` Code Review Standards)
- claude CLI present at `C:/Users/Mark/.local/bin/claude`, version **2.1.183**.
  (verified: `claude --version`)

---

## Action 1 — New PowerShell tab at a given cwd

### Existing mechanism (reuse as-is, no new IPC needed)

The exact channel already exists: **`tab:createShell`**.

- Preload method:
  `createShellTab: (shellType, afterTabId?, cwd?) => ipcRenderer.invoke('tab:createShell', shellType, afterTabId, cwd)`
  (`src/preload.ts:34`)
- Main handler:
  `ipcMain.handle('tab:createShell', async (_event, shellType, afterTabId?, explicitCwd?) => {...})`
  (`src/main/ipc-handlers.ts:515`)
- cwd resolution inside the handler:
  `let cwd = explicitCwd || workDir;` then, if no explicitCwd and an `afterTabId`
  is given, it inherits the parent tab's cwd. (`src/main/ipc-handlers.ts:531-535`)
  **So passing `explicitCwd` wins** — exactly what the dashboard wants.
- It spawns via `ptyManager.spawnShell(tab.id, cwd, shellType)` and wires it with
  `{ alwaysActivate: true }`, so the new tab is focused. (`src/main/ipc-handlers.ts:544-545`)

The shell type string is `'powershell'` on Windows.
(`src/shared/platform.ts:15` — `{ id: 'powershell', command: 'powershell.exe', ... }`)
`spawnShell` looks up the option by id and spawns `powershell.exe` directly.
(`src/main/pty-manager.ts:42-64`)

### Recommended call from the dashboard

From the renderer (dashboard is a React surface in the renderer process):

```ts
// shellType 'powershell', no afterTabId so it appends at end, explicit cwd
const tab = await window.claudeTerminal.createShellTab('powershell', undefined, targetCwd);
setActiveTabId(tab.id);
await window.claudeTerminal.switchTab(tab.id);
```

This mirrors the existing handler in `App.tsx`:
- `handleNewShellTab` (`src/renderer/App.tsx:174-190`) already calls
  `createShellTab(shellType, afterTabId)`, updates `tabs` state, sets active,
  and calls `switchTab`. The dashboard should call the **same** code path, just
  add the `cwd` arg. The cleanest path: lift `handleNewShellTab` to accept an
  optional `cwd` and thread it into `createShellTab(shellType, afterTabId, cwd)`,
  then have the dashboard call that. There is precedent: the WorktreeManager
  dialog already calls `createShellTab(shellType, undefined, cwd)` directly.
  (`src/renderer/App.tsx:603`)

**Confidence: high** — the channel, the cwd parameter, and a working call site
all exist today.

### Edge cases & failure handling

- **cwd does not exist / is not a directory.** The handler does **not** validate
  `explicitCwd` before spawning (`src/main/ipc-handlers.ts:531`). `node-pty`
  `pty.spawn` with a bad `cwd` will throw, surfacing as a rejected
  `invoke`. The dashboard should `try/catch` and show an inline error. *Better:*
  add a guard in the handler that checks `fs.existsSync(cwd) && isDirectory`
  before `spawnShell`, falling back to `workDir`. (gap noted below)
- **Path traversal / security.** AGENTS.md Security says "Validate path
  parameters before `path.join()` — reject `..` and absolute paths."
  `tab:createShell`'s `explicitCwd` is used raw and is intended to be absolute,
  so the existing `..`-rejection rule is about worktree names, not this. Since
  the dashboard supplies cwd from a trusted local source (repos.conf / git /
  override YAMLs), this is acceptable, but still validate that the path is one of
  the known project/worktree roots rather than arbitrary user text.
  (`AGENTS.md` Security; `src/main/ipc-handlers.ts:531`)
- **No workspace / project yet.** Handler throws `'Session not started'` if no
  `workDir` resolves. (`src/main/ipc-handlers.ts:529`) Dashboard should only
  enable the action once a project is active.
- **PowerShell not the right shell.** `shell:getAvailable` filters by platform
  and verifies WSL; PowerShell is assumed present on Windows.
  (`src/main/ipc-handlers.ts:160-173`) On Windows `'powershell'` is always in the
  list. If you want pwsh 7 specifically, note the option uses
  **`powershell.exe`** (Windows PowerShell 5.1), not `pwsh.exe`.
  (`src/shared/platform.ts:15`) That is a separate decision; the project's
  convention is PS7 for user-facing work, so the dashboard may want a `pwsh`
  shell option added to `getAllShellOptions`.
- **Remote parity.** `tab:createShell` is **local-only**; the web-remote server
  handles `tab:create` and `tab:createWithWorktree` but **not** `tab:createShell`
  (`src/main/web-remote-server.ts:315,351` — no `tab:createShell` case). Per the
  AGENTS.md remote-parity rule, a dashboard "open shell" action triggered from a
  remote client would silently no-op. Decide explicitly: keep shell-spawn
  local-only (recommended, matches current posture) and disable/hide that
  dashboard button when running in the web client.

---

## Action 2 — Copy a string to the clipboard

### Existing mechanism (renderer-side, no IPC)

The app already copies to clipboard **directly from the renderer** using the
standard Web API `navigator.clipboard.writeText`, with **no preload bridge and
no Electron `clipboard` module**:

- Remote-access dialog copy buttons:
  `navigator.clipboard.writeText(text)` (`src/renderer/components/RemoteAccessButton.tsx:64`,
  call sites `:163` and `:182`, with a "Copied!" -> revert UI pattern at `:165`/`:184`).
- Terminal right-click copy of selection:
  `navigator.clipboard.writeText(selection)` (`src/renderer/components/Terminal.tsx:260`).
- Terminal paste reads with `navigator.clipboard.readText()`
  (`src/renderer/components/Terminal.tsx:139`, `:263`).

There is **no `clipboard:` IPC channel** anywhere (grep of `src` found only
`navigator.clipboard` usages; no Electron `clipboard` import).
(grep across `src` for clipboard usages)

### Recommended mechanism

For the dashboard, **copy in the renderer**:

```ts
await navigator.clipboard.writeText(text);
// then flip a per-card "Copied!" state for ~1.5s, mirroring RemoteAccessButton
```

**Confidence: high** — this is the established, working pattern in the same
codebase, and it needs zero new main-process or preload code.

### Edge cases & failure handling

- **Focus / permissions.** `navigator.clipboard.writeText` requires the document
  to be focused and (in browsers) a secure context. In Electron's renderer the
  page is `file://`/app-served and focused on click, so this works; the existing
  RemoteAccessButton relies on the same assumption. If a write rejects, catch and
  fall back. **Robust fallback** for Electron specifically: expose an IPC method
  that calls Electron's main-process `clipboard.writeText` (from `electron`),
  which never depends on document focus. This is optional; only add it if you see
  failures. (Electron `clipboard` API; current code does not use it.)
- **Large strings.** No practical limit for the short strings a dashboard copies
  (a query, a path, a command).
- **Web-remote client.** `navigator.clipboard` runs in whatever browser opened
  the remote URL; copy targets *that* machine's clipboard, which is usually the
  desired behavior for a remote user. No special handling needed.

---

## Action 3 — Spawn a new Claude session and inject a starting query

This is the load-bearing item. Two candidate mechanisms; recommendation and
rationale below.

### CLI investigation (verified)

`claude --help` top line:

```
Usage: claude [options] [command] [prompt]
Claude Code - starts an interactive session by default, use -p/--print for
non-interactive output
Arguments:
  prompt   Your prompt
```

(verified: `claude --help`, version 2.1.183)

Key facts:
- **`-p` / `--print` is non-interactive** ("Print response and exit, useful for
  pipes"). This is **NOT** what the dashboard wants. (`claude --help` `-p` entry)
- **A positional `prompt` arg starts an INTERACTIVE session and auto-submits the
  prompt.** Confirmed by docs and by a closed feature request:
  - Anthropic CLI reference and community references: `claude "Fix the bug"`
    "launches with an initial prompt" interactively; `claude -p "..."` is the
    one-shot non-interactive form.
    (https://code.claude.com/docs/en/cli-reference)
  - GitHub issue #11476 "[FEATURE] Command line arg to not auto-submit the
    provided prompt" is **closed as not planned**, and the issue body confirms
    the current behavior: a positional prompt is **auto-submitted** in the TUI,
    and there is **no flag to disable auto-submit**.
    (https://github.com/anthropics/claude-code/issues/11476)

So the cleanest mechanism for "spawn Claude and immediately start on this query"
is to pass the query as a **positional argument** to `claude` when spawning the
PTY.

### How the app spawns Claude today (and the one change needed)

- `tab:create` builds an `args: string[]` from permission flags, optional
  `-w <worktree>`, `--append-system-prompt`, and optional `--resume`, then calls
  `ptyManager.spawn(tab.id, spawnCwd, args, extraEnv)`.
  (`src/main/ipc-handlers.ts:390-409`)
- `PtyManager.spawn` resolves the command via `getClaudeCommand(args)` which on
  Windows returns `cmd.exe /c claude <...args>`. (`src/main/pty-manager.ts:28-36`,
  `src/shared/claude-cli.ts:1-6`)
- **Today no positional prompt is ever passed.** The args array is all flags.

The change: thread an optional `initialPrompt` into `tab:create` (or a new
sibling channel `tab:createWithPrompt`) and **append it as the final positional
arg** after all flags:

```ts
// in tab:create handler, after building args[]
if (initialPrompt) args.push(initialPrompt);  // positional prompt, last
const proc = ptyManager.spawn(tab.id, spawnCwd, args, extraEnv);
```

Because the final command is `cmd.exe /c claude <flags...> <prompt>`, the prompt
is one element of the spawn **args array** (no shell string concatenation), so
node-pty passes it as a single argv entry. This sidesteps the cmd.exe
backslash/quoting hazards the project already documents for hook args — those
were about building paths into a single cmd string; here node-pty handles argv
quoting. (`AGENTS.md` "Hook args: use env vars"; `src/main/pty-manager.ts:28-36`)

**Caveat to verify at build time:** node-pty on Windows spawns
`cmd.exe /c claude ...`. cmd.exe argument quoting for a prompt that contains
spaces, `&`, `|`, `^`, `"`, `<`, `>`, `(`, `)`, or `%` can still be mangled by
cmd.exe even though node-pty quotes argv, because the `/c` layer re-parses.
Two mitigations, in order of preference:

1. **Avoid cmd.exe for the prompt path.** Spawn claude without the cmd wrapper by
   resolving the real executable. node-pty cannot run `.cmd` directly, but the
   native install at `C:/Users/Mark/.local/bin/claude` is a native binary, not a
   `.cmd` shim (verified: `which claude` -> `/c/Users/Mark/.local/bin/claude`,
   and `claude --version` runs). If `getClaudeCommand` is taught to use the
   resolved native binary path when it exists, the cmd.exe re-parse disappears
   entirely and argv quoting is clean. This is the most reliable fix and worth a
   small spike. (`src/shared/claude-cli.ts:1-6`, current code always uses
   cmd.exe on win32)
2. **Keep cmd.exe but sanitize.** If staying on `cmd.exe /c`, escape `%` (to
   `%%` is wrong under `/c`; the safe move is to avoid `%VAR%` patterns) and rely
   on node-pty's double-quote wrapping. Lower confidence; test with a prompt
   containing `&`, `"`, and `%`.

**Confidence: high** that a positional prompt auto-submits; **medium** on the
exact cmd.exe quoting behavior for special characters — that needs a build-time
test, and option (1) removes the risk.

### Alternative mechanism: spawn plain Claude, then writeToPty the query

The other approach is the one the dashboard could fall back to if positional-arg
quoting proves fragile: spawn an ordinary interactive Claude tab (the existing
`tab:create`), wait until the TUI is ready, then send the query text + Enter via
the existing PTY write path.

- Write path exists: `writeToPty(tabId, data)` ->
  `ipcRenderer.send('pty:write', ...)` -> `ptyManager.write` -> `proc.write`.
  (`src/preload.ts:50`, `src/main/ipc-handlers.ts:744-746`,
  `src/main/pty-manager.ts:66-68`)
- **Readiness detection is the hard part.** There IS a reliable ready signal: the
  SessionStart hook fires `tab:ready` over the named pipe once Claude's session
  has started. (`src/hooks/on-session-start.js:1,19` sends `tab:ready` with
  `sessionId`/`source`.) The dashboard/main could listen for `tab:ready` for the
  new tab id and only then writeToPty the query. This is far more robust than a
  fixed timer.
  - **However**, `tab:ready` carries `sessionId`/`source` but the pipe routing
    keys on `CLAUDE_TERMINAL_TAB_ID` (set per PTY in `extraEnv`,
    `src/main/ipc-handlers.ts:400-404`), so the main process knows which tab
    became ready. Confirm the renderer is notified (it would need a
    `tab:updated`/dedicated event); today `tab:ready` is consumed in main to set
    session id and status. (`src/hooks/on-session-start.js`; pipe handling is in
    `src/main/ipc-server.ts` — not re-read in full here.) **Confidence: medium**
    on the exact propagation; verify in `ipc-server.ts` before relying on it.
  - Even after the hook fires, the TUI input box may need a beat to accept input.
    A small post-ready delay (e.g. 150-300ms) plus the write is pragmatic.
- **Newline convention for submit.** xterm/PTY input uses **CR** (`\r`) to
  submit, not `\n`. Evidence in-repo: the Ctrl+Enter keybinding writes
  `'\x1b\r'` (ESC + CR) to the PTY. (`src/renderer/keybindings.ts:66`) For a
  plain submit, send the query text then `'\r'`. Do **not** send `\r\n`; the
  TUI may interpret the extra `\n` as a second line/submit. (`keybindings.ts:66`;
  general ConPTY/xterm convention)
- **ConPTY timing.** node-pty/ConPTY can drop or reorder input written
  immediately after spawn before the child has attached its console. The hook
  `tab:ready` gate is the correct guard; without it, a naive `setTimeout` race is
  flaky. The project already spaces out worktree setup with `setTimeout(...,50)`
  for ordering. (`src/main/ipc-handlers.ts:511`)

**Confidence: high** that writeToPty + `\r` submits; **medium** on readiness
plumbing to the renderer.

### Recommendation for Action 3

**Primary: positional-prompt spawn.** Add an optional `initialPrompt` to a
Claude-spawn channel and pass it as the final positional argv. It is the
documented, auto-submitting, single-step mechanism with no readiness race. Pair
it with the **native-binary spawn** fix (resolve
`C:/Users/Mark/.local/bin/claude` instead of `cmd.exe /c claude`) to eliminate
cmd.exe quoting risk for prompts with special characters.

**Fallback: spawn + writeToPty gated on `tab:ready`.** Keep this as the
contingency if positional quoting can't be made bulletproof, or if you want the
prompt to be *editable before submit* (positional always auto-submits;
issue #11476 closed not-planned, so no prefill-only flag exists). For
prefill-without-submit, the only path is spawn-plain then `writeToPty(query)`
**without** the trailing `\r`, letting the user press Enter.

### Edge cases & failure handling (Action 3)

- **No/closed session vs new session.** This action always creates a fresh tab,
  so "no session" is not a concern; "busy session" is irrelevant because you do
  not inject into an existing tab. (If a future variant injects into the active
  Claude tab, you must check its status — `working`/`requires_response` vs
  `idle` — from the `Tab.status` state machine before writing.
  `src/shared/types.ts:1`)
- **Permission mode.** The new tab inherits `state.permissionMode` and its flags
  via `PERMISSION_FLAGS`. (`src/main/ipc-handlers.ts:390`, `src/shared/types.ts:70`)
  A dashboard that wants a specific mode (e.g. `plan` for a read-only query)
  should pass it explicitly; today `tab:create` uses the global mode. Note the
  app's `PERMISSION_FLAGS` map uses older flag spellings (`--plan`,
  `--dangerously-skip-permissions`); the installed CLI exposes
  `--permission-mode <mode>` with values `plan`/`acceptEdits`/`bypassPermissions`
  (`claude --help` permission-mode entry). The existing flags still work, but if
  you add per-action modes, prefer `--permission-mode`.
- **cwd resolution.** Same as Action 1: the query session should open in the
  repo/worktree the dashboard item belongs to. `tab:create` derives cwd from the
  project (and worktree if given). (`src/main/ipc-handlers.ts:363-369`) If the
  dashboard needs an arbitrary cwd not tied to a registered project, that path
  doesn't exist yet for Claude tabs (only `tab:createShell` takes `explicitCwd`);
  you'd extend `tab:create` to accept one, with the same validation guard.
- **Prompt with newlines.** A multi-line query passed as a single positional arg
  is fine for argv, but auto-submit will submit at first interpretation; if the
  query legitimately needs multiple lines, the writeToPty fallback (text with
  embedded `\r` only at the very end, internal newlines as the TUI's multiline
  insert) is safer. Keep dashboard-injected queries single-paragraph.
- **Failure surfacing.** `tab:create` is an `invoke`; wrap in try/catch and show
  an inline dashboard error (e.g. "Couldn't start Claude here"). On spawn the
  `proc.onExit` cleanup removes the tab and fires `tab:removed`
  (`src/main/ipc-handlers.ts:95-103`), so a claude that exits immediately (bad
  args) will just vanish — log the args (minus any sensitive content) to
  `logger` for diagnosis.

---

## New IPC surface to add (summary for the build lane)

Following AGENTS.md "every new channel needs: main handler + preload method +
type in `global.d.ts` + assertion in the registration test, plus an explicit
remote decision":

| Need | Reuse / Add | Channel | Notes |
|---|---|---|---|
| New PowerShell tab at cwd | **Reuse** | `tab:createShell` | Already takes `explicitCwd`. (`ipc-handlers.ts:515`) Add a cwd-exists guard. Local-only (no remote case today). |
| Copy string | **Reuse** | none (renderer `navigator.clipboard`) | Pattern: `RemoteAccessButton.tsx:64`. Optional Electron-main fallback if focus issues appear. |
| Spawn Claude + query | **Add** | extend `tab:create` with `initialPrompt`, or new `tab:createWithPrompt` | Append prompt as final positional argv. Prefer native-binary spawn over `cmd.exe /c`. Decide remote parity (web-remote `tab:create` exists at `web-remote-server.ts:315`; would need the prompt arg added there too if remote-enabled). |

---

## Gaps / bugs noticed (out of scope; flag, don't fix)

1. **`tab:createShell` does not validate `explicitCwd`.** A non-existent or
   non-directory cwd reaches `pty.spawn` and throws.
   (`src/main/ipc-handlers.ts:515-545`) Worth a guard
   (`fs.existsSync` + `isDirectory`, fall back to `workDir`) before the dashboard
   starts handing it arbitrary paths. Candidate GitHub issue in
   `markwhat1/claude-terminal` (renamed repo) if not already tracked.
2. **Windows shell is `powershell.exe` (5.1), not `pwsh.exe` (7).**
   (`src/shared/platform.ts:15`) The workspace convention is PS7 for user-facing
   shells; the dashboard's "open PowerShell" may want a pwsh option added.
3. **Remote parity for shell spawn.** `tab:createShell` has no web-remote
   handler. (`web-remote-server.ts` has no `tab:createShell` case) A remote
   dashboard click would no-op; decide and document local-only, and stub in the
   web client per AGENTS.md.

These are notes for the implementer; I did not file issues (read-only recon).

---

## Security & PHI

- **Never put patient data in spawn argv or logs.** A query-injection prompt is
  passed as a process argument and may appear in process listings and in the
  app's `logger`. Keep dashboard-injected Claude queries generic
  (e.g. "review the open TODOs in this repo"), not patient-identifying. The
  workspace rule is to minimize what the LLM job *sees*, and never push real
  patient names into args/git. (workspace CLAUDE.md / memory
  `feedback_phi_minimize_to_llm_not_caddc02`)
- **Path inputs from trusted sources only.** cwd values should come from
  `repos.conf` / git / override YAMLs, not free-text, and be validated against
  known project roots. (`AGENTS.md` Security)

---

## Sources

Code (this repo, `infrastructure/claude-terminal`):
- `src/preload.ts:34` (`createShellTab`), `:50` (`writeToPty`), `:241` (contextBridge)
- `src/main/ipc-handlers.ts:515-547` (`tab:createShell`), `:336-411` (`tab:create`),
  `:390-409` (args build + spawn), `:744-746` (`pty:write`)
- `src/main/pty-manager.ts:16-40` (`spawn`), `:42-64` (`spawnShell`), `:66-68` (`write`)
- `src/shared/claude-cli.ts:1-6` (`getClaudeCommand`, cmd.exe wrapper)
- `src/shared/platform.ts:15` (powershell.exe option)
- `src/shared/types.ts:1` (TabStatus), `:70-75` (`PERMISSION_FLAGS`)
- `src/renderer/App.tsx:174-197` (`handleNewShellTab`/default shell), `:603` (shell tab with cwd)
- `src/renderer/keybindings.ts:66` (Ctrl+Enter writes `\x1b\r` — CR submit convention)
- `src/renderer/components/RemoteAccessButton.tsx:64,163,165,182,184` (clipboard write + Copied! UX)
- `src/renderer/components/Terminal.tsx:139,260,263` (clipboard read/write)
- `src/hooks/on-session-start.js:1,19` (`tab:ready` readiness signal)
- `src/main/web-remote-server.ts:271-322` (remote handles pty:write, tab:create; no tab:createShell)
- `docs/pty-management.md` (spawn/IO/kill model), `AGENTS.md` (IPC + security conventions)

CLI / web:
- `claude --version` -> 2.1.183; `claude --help` (positional `[prompt]` starts
  interactive; `-p/--print` is non-interactive)
- Claude Code CLI reference: https://code.claude.com/docs/en/cli-reference
- Auto-submit confirmed + no disable flag (closed not-planned):
  https://github.com/anthropics/claude-code/issues/11476
- Prefill-into-interactive feature request (context):
  https://github.com/anthropics/claude-code/issues/6009
