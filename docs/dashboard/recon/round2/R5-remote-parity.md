# R5 — Remote/Local Parity per Dashboard Action

**GAP (medium):** Decide local vs remote (web-client) parity for each dashboard/Home-page action. AGENTS.md mandates an explicit per-channel decision; a remote click must never silently no-op.

**Build target:** worktree `C:/Users/Mark/Claude-Code/infrastructure/claude-terminal-dashboard`, git branch `dashboard`, HEAD `ce2e9e0` (based on master). All code citations below are from THIS worktree. A prior recon round cited a slightly different revision (off-by-one to off-by-eight line numbers); corrected citations are flagged inline.

---

## 1. How the remote client actually works (the load-bearing fact)

The web client does NOT talk to Electron IPC. After auth it overwrites the global:

```
(window as any).claudeTerminal = bridge.api;   // src/web-client/main.tsx:35
```

So every renderer component that calls `window.claudeTerminal.X` runs the **WebSocketBridge stub** (`src/web-client/ws-bridge.ts:233-407`) when loaded in a browser, not the Electron preload bridge (`src/preload.ts`). The bridge translates a subset of calls into WebSocket messages; the rest are no-ops, defaults, or `throw`.

Two pieces must agree for any action to work remotely:

1. **`ws-bridge.ts` `api`** must send a real message for that method (not a stub).
2. **`WebRemoteServer.handleMessage()`** (`src/main/web-remote-server.ts:268-461`) must have a `case` for that message type.

If (1) is a stub or (2) is missing, the remote action does nothing useful. AGENTS.md (`AGENTS.md:122-136`) codifies this: "Explicitly decide whether a new channel is available remotely. If yes, add handling in `WebRemoteServer.handleMessage()` and the web client's `ws-bridge.ts`. If no, add a stub/no-op in `ws-bridge.ts` and document why it's local-only."

Transport: remote is always served over **HTTPS** via a Cloudflare quick tunnel (`src/main/tunnel-manager.ts:25`, `docs/remote-access.md:3,11-12,19`). HTTPS is a secure context, so browser APIs that require one (clipboard) work. The user works VSCode Remote-SSH from home into the work PC, and the app ships this remote web client, so **remote is a real surface, not theoretical.**

---

## 2. The three named channels — verified

Authoritative remote handler list. `WebRemoteServer.handleMessage()` has `case` blocks ONLY for these message types (`src/main/web-remote-server.ts`):

`pty:write` (:272), `pty:resize` (:278, intentionally ignored), `tab:switch` (:283), `tab:rename` (:297), `tab:getAll` (:309), `tab:create` (:316), `tab:createWithWorktree` (:352), `worktree:currentBranch` (:449). Default case logs "unknown message type" (:458-459).

| Channel | Local handler | Preload | Remote handler? | ws-bridge behavior |
|---|---|---|---|---|
| `tab:create` | `ipc-handlers.ts:336` | `preload.ts:30` (`createTab`) | **YES** — `web-remote-server.ts:316-350` | sends `{type:'tab:create'}`, resolves on `tab:created` (`ws-bridge.ts:249-254`, :186-202) |
| `pty:write` | `ipc-handlers.ts:736` (`ipcMain.on`) | `preload.ts:50` (`writeToPty`) | **YES** — `web-remote-server.ts:272-276` | sends `{type:'pty:write',tabId,data}` (`ws-bridge.ts:283-285`) |
| `tab:createShell` | `ipc-handlers.ts:515` | `preload.ts:34` (`createShellTab`) | **NO** — no `case` anywhere in `web-remote-server.ts` (grep: zero `shell` references) | **throws** `'createShellTab is not available in remote mode'` (`ws-bridge.ts:261-263`) |

**Prior-recon finding confirmed, with one correction.** The prior round said `tab:createShell` "would silently no-op remotely." The mechanism is more specific and actually *better*: the bridge stub **throws** (`ws-bridge.ts:262`), it does not silently swallow. A caller that does not `try/catch` gets a rejected promise / thrown error. The current remote UI dodges this entirely by wiring the shell button to `noop`:

```
onNewShellTab={noop}      // src/web-client/main.tsx:373  (noop defined :355)
```

So today, on the remote client, there is no path that reaches the throwing stub — the "new shell" affordance is silently inert in the TabBar. A Home view that calls `createShellTab` directly WOULD hit the throw. Either way the user gets nothing; the fix is the same: show an explicit disabled state.

### Citation corrections vs prior recon (wrong-revision artifacts)
- `pty:write` handler is at **`ipc-handlers.ts:736`**, not `:744` (prior A doc).
- Remote `tab:create` case is at **`web-remote-server.ts:316`**, `tab:createWithWorktree` at **:352** — prior D doc said `:315` / `:351` (off by one).
- App.tsx Terminal render entry is at **:578-581** — prior A doc said `:577-583`.
- `tab:createShell` is a **registered local channel**, asserted in the registration test at `tests/main/ipc-handlers.test.ts:188` ("registers all expected channels"). It is a real local handler, just not remote-enabled.

### Stale doc to flag (not blocking)
AGENTS.md:184 claims "`Ctrl+Shift+P` opens PowerShell." The actual keybinding registry (`src/renderer/keybindings.ts:53-67`) has **no** PowerShell binding; `Ctrl+`` ` (backtick) opens the *default* shell (:58), and `Ctrl+Shift+P` is unbound. "Open PowerShell" is reachable only through the TabBar shell picker / `createShellTab('powershell', ...)`. The shell id `'powershell'` is defined at `src/shared/platform.ts:15`. This matters because the GAP names "Open-PowerShell" as a first-class action: the dashboard would be *adding* a direct affordance that the keybinding layer never had.

---

## 3. Per-action parity decision

Verdicts use the three required categories: **works-remotely** / **local-only-with-explicit-disabled-state** / **needs-a-new-remote-handler**.

### A. Home view rendering — **works-remotely (renderer-only, no IPC)**

The Home view is a renderer component rendered in place of `<Terminal/>` for a `type:'home'` tab (per recon A). It mounts no PTY and issues no IPC to *render*. The renderer bundle is shared between Electron and web (`src/web-client/main.tsx` imports `../renderer/components/*`). So the Home surface itself paints identically in both.

The catch is its *data* and its *actions*, not its rendering. Any data the Home view wants (tab list, statuses) it must get from `window.claudeTerminal` reads. In the bridge, many reads are stubs that return empty/default:

- `getTabs()` returns `[]` and only triggers an async `tabs:sync` (`ws-bridge.ts:273-277`).
- `getActiveTabId()` returns `null` (`ws-bridge.ts:278-280`).
- `listProjects()`, `getRecentDirs()`, `getPermissionMode()`, `getCurrentBranch()` (partially), workspace/hook reads — all stubbed empty (`ws-bridge.ts:239-320`).

**Decision:** Home *rendering* works remotely. But the Home view must source live tab/status data from the **event stream the bridge already forwards** (`onTabUpdate`, `onTabRemoved`, `onTabSwitched`, `onPtyResized` — `ws-bridge.ts:361-389`, fed by `tabs:sync` on connect at `web-remote-server.ts:234-246`), NOT from the stubbed pull reads. Treat the tabs array passed down from `RemoteApp` state (`main.tsx:216-309`) as the source of truth, mirroring how `RemoteApp` already does it. Any Home widget that depends on a stubbed read (recent dirs, projects, permission mode, hook config) renders **empty remotely** unless a new remote handler is added — call those out per-widget when the Home spec is finalized; for the four actions in this GAP, none require those reads.

### B. Open-PowerShell — **local-only-with-explicit-disabled-state** (recommended) ​/ alternatively needs-a-new-remote-handler

State today: `tab:createShell` has no remote handler; the bridge throws (`ws-bridge.ts:261-263`); the remote TabBar wires the affordance to `noop` (`main.tsx:373`).

Two defensible paths:

1. **Recommended: local-only with an explicit disabled state.** A new PowerShell tab spawns a real OS process on the *host* (work PC) and streams it to a remote browser. That is exactly what a Claude tab already does remotely via `tab:create`, so it is not technically impossible — but "open a raw PowerShell on the PHI-adjacent work PC from a tunneled browser" is a meaningfully larger blast radius than a sandboxed Claude session, and AGENTS.md already defaults "destructive / host-shell" operations to local-only (`AGENTS.md:135`). Keep it local-only.
   - **Remote must SHOW:** the Open-PowerShell control rendered **disabled**, with a visible reason — e.g. tooltip / inline caption "Available on the desktop app only." Detect remote at runtime (the web client sets `platform: 'linux'` in the bridge, `ws-bridge.ts:236`, and `main.tsx` is the only mounter of `bridge.api`; a `isRemote` flag threaded from `main.tsx` is cleaner than sniffing platform). Never render an enabled button that throws or no-ops.
   - **Belt-and-suspenders:** even with the button disabled, the bridge stub must keep throwing (do not "fix" it into a silent no-op) so any missed call path fails loudly in dev, per AGENTS.md:136 ("must stub any new preload API method, even if it throws or no-ops").

2. **Alternative if Mark wants shells remotely: needs-a-new-remote-handler.** Add a `case 'tab:createShell'` to `WebRemoteServer.handleMessage()` (mirror the `tab:create` block at `web-remote-server.ts:316-350`, calling `ptyManager.spawnShell(tab.id, cwd, shellType)` as the local handler does at `ipc-handlers.ts:544`), and replace the throwing stub in `ws-bridge.ts:261-263` with a real `send({type:'tab:createShell', shellType, cwd})` + pending-promise resolve on `tab:created`. This is a deliberate security expansion; do not do it implicitly.

**My recommendation: option 1 (local-only + disabled state).**

### C. Copy (copy a value to clipboard) — **works-remotely (no IPC at all)**

Copy is `navigator.clipboard.writeText(text)` in the renderer; it never touches IPC. Precedent in-repo: `RemoteAccessButton.tsx:52-53` and `Terminal.tsx:260` already call `navigator.clipboard` and run unchanged in both Electron and browser. The remote client is served over HTTPS (Cloudflare tunnel, `tunnel-manager.ts:25`), a secure context, so `navigator.clipboard` is available. Copy writes to the **remote user's own device** clipboard, which is the desired semantics for someone driving the work PC from their phone/home machine.

**Decision:** works-remotely, zero new plumbing. (Optional hardening: fall back to a hidden-textarea `execCommand('copy')` if `navigator.clipboard` is unavailable, but not required for HTTPS contexts.)

### D. Open-Claude-with-query — **works-remotely, BUT requires a new remote-aware mechanism (no NEW channel needed)**

There is no existing "open Claude with a prompt" IPC. The composition is: create a Claude tab, then write the query into its PTY once Claude is ready.

- **Create:** `tab:create` works remotely (`web-remote-server.ts:316`, bridge `ws-bridge.ts:249-254`). The remote create returns the new `tab` via the `tab:created` message and resolves the bridge promise (`ws-bridge.ts:186-202`), so the caller gets a real `tabId`.
- **Write the query:** `pty:write` works remotely (`web-remote-server.ts:272`, bridge `ws-bridge.ts:283-285`). So `writeToPty(tabId, query + '\r')` reaches the host PTY from a browser.

So both primitives are remote-capable — **no new channel is required.** The hard part is **timing**, and it is identical local and remote: you cannot write the prompt the instant the tab is created, because Claude's CLI is still booting (the PTY exists but the REPL is not listening). There is no existing first-idle/queued-prompt pattern in the codebase (grep for `initialPrompt`/`pendingPrompt`/queued write found nothing; only an unrelated `\x0c` clear-screen write at `App.tsx:211`). Whatever mechanism is chosen for local must be built remote-safe:

- **Preferred:** gate the prompt write on the tab reaching an `idle`/`requires_response` status via the hook-driven `onTabUpdate` event — which the bridge DOES forward remotely (`ws-bridge.ts:371-374`, fed by `web-remote-server.ts` broadcasts). So a "write the queued prompt when this tab first goes idle" listener works in both environments with the same code.
- **Avoid:** a fixed `setTimeout` delay (flaky, and worse over tunnel latency).
- **If a cleaner contract is wanted later:** an `initialPrompt` arg on `tab:create` would need to be threaded into BOTH the local handler (`ipc-handlers.ts:336`) AND the remote handler (`web-remote-server.ts:316-350`) — that is the "decide remote parity for a changed channel" case. Not required for v1; the create-then-queued-write path already works in both.

**Decision:** works-remotely using existing `tab:create` + `pty:write` + the forwarded `onTabUpdate` idle signal. No new IPC channel. The only real work is a shared, remote-safe "queue prompt until first idle" helper — build it once, in renderer code, so it runs in both shells.

---

## 4. What the remote client must SHOW for any local-only action

Non-negotiable, from AGENTS.md (`:122-136`) and the user constraint that remote is a daily surface:

- **Never** render an enabled control that maps to a stubbed/throwing/no-op bridge method. The current `onNewShellTab={noop}` (`main.tsx:373`) is the anti-pattern: the button exists, looks live, and does nothing.
- For **Open-PowerShell** (the one local-only action here): render the control **visibly disabled** with a **stated reason** ("Available on the desktop app only" / "Host shell access is local-only"). A tooltip or inline caption, not a dead button.
- Thread an explicit `isRemote` boolean from `src/web-client/main.tsx` down into the Home view (it is the sole place `bridge.api` is installed, `main.tsx:35`), and branch the action's enabled/disabled state on it. Do not infer remoteness by catching a thrown stub at click time.
- Keep the bridge stub **throwing** (do not soften `ws-bridge.ts:262` into a silent no-op) so a missed disabled-state in the UI surfaces loudly during development rather than dying quietly in production.

---

## 5. Summary table

| Action | Verdict | Remote mechanism | What remote SHOWS | Key cites (worktree) |
|---|---|---|---|---|
| Home view rendering | works-remotely | renderer-only; data via forwarded `onTabUpdate`/`tabs:sync`, not stubbed pull-reads | full Home UI; any widget bound to a stubbed read (recents/projects/hooks) renders empty until a handler is added | `main.tsx:35,216-309`; `ws-bridge.ts:273-320,361-389`; `web-remote-server.ts:234-246` |
| Open-PowerShell | **local-only + explicit disabled state** (alt: new remote handler if Mark opts in) | none (host-shell stays local) | disabled control + reason "Available on the desktop app only" | `ipc-handlers.ts:515`; `web-remote-server.ts` (no shell case); `ws-bridge.ts:261-263`; `main.tsx:373` |
| Copy | works-remotely | `navigator.clipboard.writeText` (no IPC); HTTPS secure context | normal enabled copy; writes to the remote device's clipboard | `RemoteAccessButton.tsx:52-53`; `Terminal.tsx:260`; `tunnel-manager.ts:25` |
| Open-Claude-with-query | works-remotely (no new channel) | `tab:create` + `pty:write` + queue prompt until first `idle` via `onTabUpdate` | normal enabled action | `web-remote-server.ts:316,272`; `ws-bridge.ts:249-254,283-285,371-374`; `preload.ts:30,50` |

**Net:** 3 of 4 actions work remotely with existing plumbing; only Open-PowerShell is local-only and must render a disabled state with a reason. Open-Claude-with-query needs a shared remote-safe prompt-timing helper but no new IPC channel. The prior recon's central claim (`tab:createShell` has no remote handler) is correct; the nuance is the stub throws rather than silently no-ops, and the live remote UI already routes the shell button to a `noop`, so the user sees nothing either way.
