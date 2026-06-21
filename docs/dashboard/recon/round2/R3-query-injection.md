# R3 — Query Injection Mechanism for "open a NEW Claude session pre-loaded with a query"

GAP (high). The dashboard/home-page wants a one-click "ask this query in a fresh Claude session" action. The prior recon round recommended spawning the native `claude` binary with a positional prompt argument as the PRIMARY mechanism. That recommendation is wrong on two counts, and this document corrects it and replaces it.

All code citations below are from the BUILD-TARGET worktree at `C:/Users/Mark/Claude-Code/infrastructure/claude-terminal-dashboard` on git branch `dashboard` (HEAD `ce2e9e0`), not any other checkout.

---

## Correction of the prior recon

1. **It contradicts AGENTS.md.** `AGENTS.md:52` states the architecture decision verbatim: "node-pty on Windows: Must spawn `cmd.exe /c claude` because node-pty cannot resolve `.cmd` wrappers." The single spawn helper enforces this: `src/shared/claude-cli.ts:1-6` returns `{ command: 'cmd.exe', args: ['/c', 'claude', ...flags] }` on Windows. A "native-binary positional-prompt spawn" means bypassing `cmd.exe /c` and invoking the `claude` binary directly, which is exactly the thing node-pty cannot do on Windows for a `.cmd` shim.

2. **It would change the spawn path for ALL claude tabs.** Every claude tab is created through `tab:create` (`src/main/ipc-handlers.ts:336-411`) or `tab:createWithWorktree` (`:413-513`), both of which build a `string[]` of flags and call `ptyManager.spawn(tab.id, spawnCwd, args, extraEnv)` (`:407`, `:496`). `PtyManager.spawn` (`src/main/pty-manager.ts:16-40`) routes every spawn through `getClaudeCommand(args)`. There is exactly one spawn path; a positional-prompt variant either forks that path (new risk surface for every tab) or mutates the shared helper (touches every tab). Neither is warranted for one dashboard feature.

A positional prompt does NOT actually require a native-binary spawn. `cmd.exe /c claude "<prompt>"` is a legal invocation, and `getClaudeCommand(flags)` would carry a positional string as just another entry in `flags`. So the prior recon's stated technical justification ("native-binary spawn") is doubly confused: it's neither necessary for a positional prompt nor compatible with the project's spawn rule. But the positional approach still has a real first-byte interaction risk under `cmd.exe /c` quoting, plus an unproven node-pty interaction, which is why it stays a LATER optimization gated on a spike (see the last section).

---

## Recommended PRIMARY mechanism: write-after-ready

Spawn a normal interactive claude tab through the EXISTING `tab:create` path (no spawn changes whatsoever), then, once that tab's session reaches `idle`, do a single `writeToPty(tabId, query + "\r")`. This reuses the proven input path the renderer already uses for every keystroke and never touches the spawn helper.

### (a) The exact tab:ready -> idle propagation to the renderer

The chain is fully traceable in the worktree:

1. **Hook fires on the CLI.** `src/hooks/on-session-start.js` runs on Claude Code's `SessionStart` hook. It reads `session_id` and `source` from the hook stdin JSON and sends `tab:ready` with payload `JSON.stringify({ sessionId, source })` over the named pipe (`pipe-send.js`). `source` is the CLI-provided `"startup" | "resume" | "clear"`.

2. **Main process routes it.** The pipe server delivers the message to `handleHookMessage` (`src/main/index.ts:349` wires `ipcServer.onMessage(handleHookMessage)`). The `tab:ready` case lives at `src/main/hook-router.ts:63-119`. The load-bearing transition is:
   - `src/main/hook-router.ts:98-107`: if a `sessionId` is present it calls `deps.tabManager.setSessionId(tabId, sessionId)` then `deps.tabManager.updateStatus(tabId, 'idle')`. (The comment at `:100-104` is explicit that `idle` is used rather than `new` so the resumed-but-idle tab is not dropped from persistence.)

3. **Renderer is notified.** After the switch, `src/main/hook-router.ts:167-170` calls `deps.sendToRenderer('tab:updated', updated)` with the mutated tab object. `sendToRenderer` (`src/main/index.ts:75-99`) does `win.webContents.send('tab:updated', tab)` (and also broadcasts to remote clients at `:84-85`).

4. **Renderer consumes it.** The preload exposes `onTabUpdate` (`src/preload.ts:155-162`), an `ipcRenderer.on('tab:updated', ...)` listener. `App.tsx` registers it once at `src/renderer/App.tsx:354-364`; the callback replaces the tab in React state by id. So the renderer observes the tab object flip to `status === 'idle'` for the specific `tabId`.

The "first new -> idle" signal the dashboard needs is therefore: the first `tab:updated` event for that `tabId` whose `tab.status === 'idle'`. The tab starts life as `status: 'new'` (`src/main/tab-manager.ts:21`, claude tabs get `'new'`), and the `tab:ready`/SessionStart handler is what moves it to `idle`. That `new -> idle` edge is the ready gate.

Note the in-renderer return value of `createTab` already carries the synchronous `tab.id` (`tab:create` returns the tab at `ipc-handlers.ts:410`; `App.tsx` handlers like `handleNewTabWithoutWorktree` at `:168-172` capture it), so the dashboard can subscribe to that exact id before the first `idle` arrives.

### (b) Gating the single injected write to fire exactly once (and survive the --resume double-fire)

The double-fire is real and already documented in the code. On `--resume`, the Claude CLI fires `SessionStart` TWICE: once with `source: "startup"`, then again with `source: "resume"` (`src/main/hook-router.ts:80-84` comment, and the resume-name branch at `:110-113`). For a fresh dashboard session there is no `--resume`, so the dashboard path normally sees a single `startup`. But the gate must be robust regardless, because the user could later `--resume` a dashboard-spawned tab, and because `/clear` produces a third `source: "clear"` `tab:ready`.

Gate design (renderer-side, in the dashboard action that created the tab):

- Maintain a per-tab `injected` flag keyed by `tabId` (a `Set<string>` or a `Map<string, boolean>` ref). When the dashboard creates the tab, record `{ tabId, query, injected: false }`.
- In the `onTabUpdate` handler, when a tracked tab transitions to `status === 'idle'` AND `!injected`, do the write and set `injected = true`. Every subsequent `idle` (the `resume` second fire, a later `/clear`, or the normal idle-after-each-turn that Claude reaches between prompts) is ignored because the flag is set.
- This is the same "fire exactly once" shape the existing first-prompt naming hook uses (`src/hooks/on-prompt-submit.js:11-14` guards on a flag file `claude-terminal-named-<tabId>` so naming happens only on the first prompt). The dashboard gate is the renderer analog of that pattern.

Why gate on `idle` rather than the raw `tab:ready` event: the renderer never sees `tab:ready` directly. It only sees `tab:updated` (the hook router collapses every hook event into a tab-object update). So the only observable is `status`. Keying off "first `idle` for this tab" is the correct and only renderer-visible gate. The flag makes it idempotent against the resume double-fire, which manifests as two `tab:ready` -> two `updateStatus(tabId,'idle')` -> two `tab:updated`, both with `status: 'idle'`.

Edge note on `/clear`: `tab:ready` with `source: "clear"` (`hook-router.ts:82-96`) resets the tab name and can re-emit `idle`. The `injected` flag already covers this, but the dashboard should NOT clear the flag on a `tab:updated` with a different status; clear it only on `tab:removed` (`src/preload.ts:173-180`, consumed at `App.tsx:366-381`) so a closed-and-reopened tab id can't be confused (tab ids are unique per creation anyway — `tab-manager.ts:4-6` mints `tab-<timestamp>-<random>` — so reuse is not a concern, but cleaning up the flag on removal prevents an unbounded Set).

### (c) CRLF / newline handling for ConPTY

The authoritative answer is in the worktree: match exactly what xterm.js already sends for an Enter keypress, which is a single carriage return `\r` (0x0D), NOT `\r\n`.

Evidence:
- The renderer's xterm instance forwards raw keystrokes verbatim to the PTY: `src/renderer/components/Terminal.tsx:148-150`, `term.onData((data) => { window.claudeTerminal.writeToPty(tabId, data); })`. xterm.js emits `\r` on Enter by default (no `convertEol` is configured on input), so the proven byte that submits a line to the running `claude` process through ConPTY is `\r`.
- The existing in-app "refresh" action writes a single control byte directly the same way: `App.tsx:209-212` `handleRefreshTab` does `writeToPty(tabId, '\x0c')` (Ctrl+L). This confirms the established pattern is to push raw terminal bytes through `writeToPty`, no newline translation layer.
- The write path itself does no translation: `preload.ts:50-51` `writeToPty -> ipcRenderer.send('pty:write', ...)`; `ipc-handlers.ts:736-738` `pty:write -> ptyManager.write`; `pty-manager.ts:66-68` `write -> process.write(data)` straight into node-pty/ConPTY stdin (confirmed by `docs/pty-management.md` "User Input" flow).

So: `writeToPty(tabId, query + "\r")`. Do not append `\n`; a trailing `\r\n` can register as two line submissions in a ConPTY-hosted TUI and is not what the user's own Enter key produces. Send the query text followed by one `\r`. If the query itself contains embedded newlines (multi-line paste), each interior newline should also be `\r` to mirror paste behavior, but the dashboard query is expected to be a single line, so the simplest correct form is `query.replace(/\r?\n/g, "\r") + "\r"`.

One timing nuance: do the write only after the `idle` gate (b), not immediately on `createTab` return. The PTY exists the moment `ptyManager.spawn` returns, but the `claude` REPL inside `cmd.exe /c claude` is not ready to accept a prompt until SessionStart has fired (the `idle` signal). Writing earlier races the CLI's own startup and the bytes can be eaten or land in the wrong input state.

### (d) Edge cases

- **No session / spawn failure.** If the spawn or hook never produces a `tab:ready`, the tab stays `status: 'new'` and the `idle` gate never fires, so nothing is injected (fail-safe: a silent no-op rather than a misdirected write). The tab's `proc.onExit` (`ipc-handlers.ts:95-103`) emits `tab:removed`; the dashboard should clear its pending-injection entry on `onTabRemoved` so a dead tab doesn't hold a stale pending write. Optionally add a timeout (e.g. 30s) after which the dashboard surfaces "session failed to start" and drops the pending query.
- **Busy session.** Not applicable to the recommended flow: the dashboard creates a brand-new tab for the query, so there is no in-flight turn to collide with. (If a future variant injects into an existing tab, it must check `status === 'idle'` before writing and queue otherwise — `requires_response` or `working` means the write would interleave with an active turn.)
- **Permission mode.** `tab:create` already applies the persisted permission mode via `PERMISSION_FLAGS[state.permissionMode]` (`ipc-handlers.ts:390`). The dashboard tab inherits whatever mode the workspace is in; no special handling needed. NOTE a pre-existing flag concern worth flagging separately: `PERMISSION_FLAGS` (`src/shared/types.ts:70-75`) maps `plan: ['--plan']` and `acceptEdits: ['--allowedTools', ...]`. The real Claude CLI flag is `--permission-mode plan` rather than `--plan`; if `--plan` is not accepted by the installed CLI, a tab spawned in plan mode could error at startup and never reach `idle`, which would also block injection. This is out of scope for R3 (it affects all plan-mode tabs, not just dashboard ones) and is captured as a follow-up below.
- **cwd / project.** The dashboard must pass a `projectId` to `createTab(projectId, ...)` (`preload.ts:30-31`). If the dashboard is project-scoped, use the active project's id (`activeProjectIdRef` pattern, `App.tsx:169-171`). If no project is selected, `tab:create` falls back to the first project (`ipc-handlers.ts:356-360`) or throws `'Session not started'` (`:365`) when none exists. The dashboard should ensure a project is active before offering the action, or handle the throw and prompt the user to open a folder first. The injected query runs in that project's cwd; there is no per-query cwd override and none is needed.
- **Worktree tabs.** Not needed for the dashboard query (pass `worktree = null`). The `-w` / `--append-system-prompt` plumbing (`ipc-handlers.ts:391-394`) only applies when a worktree name is given.
- **Remote clients.** `tab:updated` is already broadcast to remote web clients (`index.ts:84-85`), and `pty:write` is a normal preload method. If the dashboard ever runs in the remote web client, the same write-after-ready logic works because the same events flow; just confirm the web client's `ws-bridge.ts` forwards `pty:write` (AGENTS.md "Remote / Local Parity" requires every new preload method to be handled or stubbed there — the dashboard reuses the existing `writeToPty`, so no new channel is introduced).

### Implementation sketch (renderer-side, no main-process or spawn changes)

```ts
// In the dashboard action, alongside the existing onTabUpdate listener in App.tsx.
const pendingInjection = useRef<Map<string, { query: string; injected: boolean }>>(new Map());

async function askInNewSession(query: string) {
  const projectId = activeProjectIdRef.current;
  if (!projectId) { /* surface "open a project first" */ return; }
  const tab = await window.claudeTerminal.createTab(projectId, null); // EXISTING path
  pendingInjection.current.set(tab.id, { query, injected: false });
  setActiveTabId(tab.id); // optional: focus the new tab
}

// Inside the existing onTabUpdate callback (App.tsx:354):
const pending = pendingInjection.current.get(tab.id);
if (pending && !pending.injected && tab.status === 'idle') {
  pending.injected = true;
  const line = pending.query.replace(/\r?\n/g, '\r') + '\r';
  window.claudeTerminal.writeToPty(tab.id, line);
}

// Inside the existing onTabRemoved callback (App.tsx:366):
pendingInjection.current.delete(tabId);
```

This is the entire change: one new action, two small additions inside listeners that already exist. Zero changes to `pty-manager.ts`, `claude-cli.ts`, `ipc-handlers.ts` spawn logic, or the hook scripts. It cannot regress any other tab because it only ever calls the public `createTab` + `writeToPty` API.

---

## LATER optimization (gated): native-binary positional-prompt spawn

Document, do not adopt now. A positional prompt (`claude "<query>"`, or with `--resume`/flags) would make the query land without a write-after-ready dance. But:

- Under the project's mandated `cmd.exe /c claude "<query>"` invocation, the query becomes a `cmd.exe`-quoted argument, inheriting the same backslash/quote mangling that AGENTS.md:56 already calls out for hook args. Embedded quotes, `&`, `|`, `%VAR%`, and newlines in the query would need careful escaping, and getting it wrong silently corrupts the prompt or breaks the spawn.
- Whether node-pty + ConPTY + `cmd.exe /c claude "<positional>"` actually delivers the prompt to an interactive REPL (vs. headless one-shot mode) is unverified. This is exactly the kind of "authenticate against the real endpoint and inspect the actual behavior" step that should be a spike, not an assumption.

Gate: build it only after an **isolated node-pty spawn spike** confirms (1) the positional prompt survives `cmd.exe /c` quoting for adversarial query strings, and (2) it produces an interactive session pre-loaded with the prompt (not a headless run that exits). If the spike passes, the change can be a separate, opt-in flag passed through `tab:create` (e.g. an `initialPrompt` arg appended to the `args` array in `ipc-handlers.ts`), still going through `getClaudeCommand` so the `cmd.exe /c` rule is preserved — never a direct native-binary spawn. Until the spike passes, write-after-ready is the only mechanism that ships.

---

## Residual risks

- The whole mechanism depends on Claude Code's `SessionStart` hook firing (`on-session-start.js`). If hooks are not installed for the cwd (they are installed by `hookInstaller.install(cwd)` on tab create, `ipc-handlers.ts:385-388`), no `tab:ready` arrives and the `idle` gate never fires. Mitigation: the timeout fail-safe in (d).
- `--plan` vs `--permission-mode plan` (see permission-mode edge case) could block `idle` for plan-mode tabs; pre-existing, flagged below.
- Multi-line / adversarial query content is handled by the `\r` normalization for the recommended path; the positional-prompt path's escaping is unsolved and is the reason it's deferred.
