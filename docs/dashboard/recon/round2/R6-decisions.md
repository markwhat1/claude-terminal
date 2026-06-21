# R6 — Round-2 GAP decisions (medium gate)

Build target: ClaudeTerminal in-app dashboard / home page.
Worktree of record: `C:/Users/Mark/Claude-Code/infrastructure/claude-terminal-dashboard`,
git branch **`dashboard`** (HEAD `ce2e9e0`, based on master). Every code citation below is
`file:line` in THIS worktree. Web claims carry URLs. Confidence marked per claim.

## Branch-citation correction (prior recon error)

A prior recon round cited a different checkout. The grep that surfaced `claudeQuery`,
`blocked_on`, and `needs_you` matched files under the **workspace root**
`C:/Users/Mark/Claude-Code` (the separate `program-board` repo: `dashboard/programs/*.yml`,
`docs/plans/*`), NOT this Electron worktree. Verified: `dashboard/programs/` and
`docs/dashboard/recon/round2/00-synthesis.md` do **not** exist inside the
`claude-terminal-dashboard` worktree (`ls` returns "No such file or directory"); the round1
recon for this build lives at `docs/dashboard/recon/*.md` (16 files, e.g. `00-synthesis.md`,
`D-action-routing.md`). All R6 citations are re-grounded to the worktree.

Second correction: **there is no `claudeQuery` action in the worktree code today.** It is a
*planned* action from round1 Lane D ("Action 3 — Spawn a new Claude session and inject a
starting query", `docs/dashboard/recon/D-action-routing.md:165-361`). So item (1) below
specifies enforcement points for code that the build lane will add, anchored to the exact
spawn/log sites that already exist.

---

## Item 1 — PHI/secret SCRUB for the claudeQuery action

### What the query is composed from, and where it lands

The dashboard composes a Claude prompt from free-text that can carry patient-identifying or
secret content: program-board override fields (`blocked_on`, needs-you "reasons") and
user-authored tab names. Round1 Lane D's recommended mechanism is to pass that prompt as the
**final positional argv** to `claude` (`docs/dashboard/recon/D-action-routing.md:216-229`,
`:299-304`). Two sinks therefore see the raw prompt:

1. **Process argv.** The prompt becomes one element of the spawn args array. Spawn happens in
   `PtyManager.spawn` -> `pty.spawn(shell, spawnArgs, ...)`
   (`src/main/pty-manager.ts:28-36`). On Windows the command resolves to
   `cmd.exe /c claude <flags...> <prompt>` via `getClaudeCommand`
   (`src/shared/claude-cli.ts:1-6`). Argv is visible to any process listing on the box.
2. **The logger.** `src/main/logger.ts` writes every formatted arg to a plaintext file
   `<dir>/.claude-terminal/logs/main.log` (`logger.ts:33-40`, `:60-74`) **and** forwards the
   same string to the renderer DevTools console (`logger.ts:42-51`). The logger does **zero
   redaction** today (`format()` just stringifies, `logger.ts:20-22`). The existing
   `tab:create` handler already logs spawn-adjacent data, e.g. `--resume <sessionId>`
   (`src/main/ipc-handlers.ts:397`). Any future `log.*('[claudeQuery]', args)` would dump the
   prompt verbatim to disk and DevTools.

### Decision: scrub at the COMPOSE step, before spawn and before any log

Enforce in **one place: a `composeClaudeQuery()` helper that is the only producer of the
prompt string**, and make both the spawn arg and any log line read from its scrubbed output.
Do not scrub inside `PtyManager.spawn` (too late, also handles non-prompt args) and do not
rely on scrubbing only at the log call (argv would still leak). The compose step is the single
choke point that feeds both sinks.

Concrete enforcement, in order the build lane should wire it:

1. **Allowlist the structured inputs, never free-concatenate.** `composeClaudeQuery()` takes a
   typed shape (`{ action: KnownActionId, repo: string, cwd: string }`) where `action` is one
   of a fixed set of canned templates (e.g. "review the open TODOs in this repo", "summarize
   what changed on this branch"). Round1 already prescribes canned, generic prompts and names
   this as the rule: "Keep dashboard-injected Claude queries generic ... not
   patient-identifying" (`docs/dashboard/recon/D-action-routing.md:386-392`). The default path
   injects **no** free-text at all.
2. **If free-text from `blocked_on` / needs-you reasons / tab names is ever interpolated**, run
   it through a `scrubFreeText()` pass inside `composeClaudeQuery()` before it joins the
   template. Conservative default: **deny-by-default redaction.** Strip or `[redacted]`-replace
   anything matching: digit runs >= 5 (MRN / chart / phone / SSN-ish), email addresses,
   `Bearer`/`token`/`key`/`secret`/`password`/`apikey` token patterns, and a configurable
   name-pattern list. The bar is "redact if unsure," consistent with the workspace rule to
   minimize what the LLM job sees and to never push real patient names into args or logs
   (workspace `CLAUDE.md` / memory `feedback_phi_minimize_to_llm_not_caddc02`;
   `AGENTS.md:148` "No credentials or tokens in logs").
3. **Logging reads the scrubbed string only, and truncates.** Mirror the existing hook-log
   habit of logging only a prefix (`hook-router.ts:56` logs `data.substring(0, 80)`). For
   claudeQuery, log the **action id and repo**, never the composed prompt body; if the body
   must be logged for diagnosis, log `scrubbed.substring(0, 80)`. This satisfies `AGENTS.md:148`
   directly.
4. **Spawn reads the scrubbed string only.** `args.push(scrubbedPrompt)` is the only push of
   prompt text (the Lane-D insertion point, `D-action-routing.md:220`).

Confidence: **high** on the two sinks and the absence of redaction (read directly:
`pty-manager.ts:28-36`, `claude-cli.ts:1-6`, `logger.ts:20-51`). **High** on "compose is the
correct single choke point" because both sinks derive from the one prompt string.

### Conservative default (the shipped behavior)

Default the action to **canned templates with zero free-text interpolation.** Free-text
injection is an opt-in, behind the `scrubFreeText()` pass, never the default. This is the safe
floor: a default that injects only a fixed verb + the repo path cannot leak PHI even if the
scrubber has a gap.

---

## Item 2 — Notification policy (don't regress the shipped ping)

### Current shipped behavior (read directly)

`src/main/hook-router.ts` fires a native OS `Notification` on two transitions when the tab is
**not active**:

- **idle / "Claude has finished working"** — `hook-router.ts:125-131` (the
  `tab:status:idle` case): on `!isActive`, builds `"<project> - <tabName>"` and calls
  `notifyTabActivity(... 'Claude has finished working')`.
- **input / "Claude needs your input"** — `hook-router.ts:134-141` (`tab:status:input`).

`notifyTabActivity` (`hook-router.ts:23-48`) dedupes per tab via a `pendingNotifications`
`Set` (`:21`), refuses if `Notification.isSupported()` is false (`:24`), and on click shows +
focuses the window and switches to the originating tab/project (`:29-46`). This idle ping is
the behavior the user relies on; the design must not silently drop it.

### Decision: settings-gated refinement, default = current behavior preserved

Add a `notifications` block to the JSON settings store. The store today holds
`{ recentDirs, permissionMode, defaultShell }` with a `DEFAULTS` object merged over loaded
JSON (`src/main/settings-store.ts:12-22`, `:34-41`). Extend `StoreData` + `DEFAULTS` and add
getter/setter pairs mirroring `getDefaultShell`/`setDefaultShell`
(`settings-store.ts:74-81`); surface the controls in `SettingsDialog`
(`src/renderer/components/SettingsDialog.tsx`, currently a single "Default terminal" row).

Proposed shape and **defaults chosen to reproduce today's ping exactly**:

```ts
notifications: {
  enabled: true,            // master switch; default ON
  onIdle: true,             // "Claude has finished working"; default ON  (today's ping)
  onInput: true,            // "Claude needs your input";    default ON
  suppressWhenFocused: true,// already true in effect: only fires when !isActive
  quietHours: null,         // e.g. { start: '21:00', end: '07:00' }; default OFF (null)
  coalesceWindowMs: 0,      // 0 = today's per-tab dedupe only; >0 batches bursts
}
```

Why these defaults do not regress:

- `enabled:true` + `onIdle:true` + `onInput:true` reproduce the exact two notifications wired
  at `hook-router.ts:130` and `:139`. A user who never opens Settings sees no change.
- `suppressWhenFocused:true` matches the existing `!isActive` guard (`hook-router.ts:127`,
  `:136`); it is documented as a setting but its default is the status quo. "Focus" here means
  the originating tab is the active tab, which is what `isActive` already tests
  (`hook-router.ts:60`). A stricter "whole-window focused" suppression (using
  `getMainWindow()` focus state, available via `deps.getMainWindow()` `hook-router.ts:13`)
  should be a **separate opt-in flag**, default OFF, so we never swallow a ping the user
  currently gets when the window is up but on another tab.
- `quietHours:null` and `coalesceWindowMs:0` are inert by default; both are pure additions.

Enforcement point: gate inside `notifyTabActivity` (the single emit site,
`hook-router.ts:23-48`) and at the two call sites' guards. Read settings via a `deps` getter
(add `getNotificationSettings()` to `HookRouterDeps`, `hook-router.ts:6-16`) so the router
stays pure/testable; existing tests mock `deps`. Per-tab dedupe (`pendingNotifications`,
`:21`) stays as-is and is orthogonal to `coalesceWindowMs`.

Confidence: **high** on current behavior and the no-regression mapping (read
`hook-router.ts:23-141` and `settings-store.ts:12-81` in full). **High** that the settings
store extends cleanly (the `DEFAULTS`-merge pattern at `settings-store.ts:37` makes added keys
backward-compatible with existing on-disk settings files).

---

## Item 3 — Capture-bar keyboard shortcut

### Claimed combos (read directly)

- **AGENTS.md terminal-claimed list** (`AGENTS.md:158-166`): `Ctrl+Arrow*` (word jump / scroll
  history), `Ctrl+A/E/U/K/W` (readline), `Ctrl+C/D/Z` (signals), `Ctrl+R` (reverse search),
  `Ctrl+L` (clear screen, also bound to a WSL tab in-app). AGENTS.md's explicit guidance:
  "Prefer `Ctrl+Shift+*` or `Alt+*` combos for app-level actions" (`AGENTS.md:166`).
- **App-level registry** (`src/renderer/keybindings.ts:53-67`): `Ctrl+N/T/W/P`, `` Ctrl+` ``,
  `Ctrl+F4`, `Ctrl+Tab`, `Ctrl+Shift+Tab`, `Ctrl+ArrowUp/Down`, `F2`, `Alt+F4`, `Ctrl+Enter`.
  Plus `Ctrl+Shift+P` opens PowerShell (`AGENTS.md:184`) and dynamic `Ctrl+1..9` tab jumps
  (`keybindings.ts:92-95`).

### Decision: **`Ctrl+Shift+K`** for the capture bar

Rationale:

- Not in the app registry (`keybindings.ts:53-67`) and not a dynamic jump
  (`isTabJump` is `Ctrl+1..9` only, `keybindings.ts:93-94`). Verified clean: grep of
  `keybindings.ts` finds no `'h'`/`'k'` app binding and no Home binding.
- The bare `Ctrl+K` *is* readline kill-line and is on the claimed list (`AGENTS.md:162`), but
  the matcher requires `!e.shiftKey` for `ctrl` bindings (`keybindings.ts:77`), so
  `Ctrl+Shift+K` is a distinct chord that the terminal does not consume as kill-line. It lands
  in the `ctrl+shift` matcher arm (`keybindings.ts:79-81`), the same arm that already safely
  hosts `Ctrl+Shift+Tab`.
- It satisfies AGENTS.md's stated preference for `Ctrl+Shift+*` (`AGENTS.md:166`) and avoids
  the few `Ctrl+Shift+*` combos already taken (`Ctrl+Shift+Tab` reverse-cycle
  `keybindings.ts:61`; `Ctrl+Shift+P` PowerShell `AGENTS.md:184`).
- Mnemonic: K for "capture" reads cleanly and does not collide with `Ctrl+Shift+P`
  (PowerShell) or any browser/Electron default we rely on.

Fallback if K is disliked: **`Alt+C`** (capture). The `alt` matcher arm requires
`e.altKey && !e.ctrlKey` (`keybindings.ts:82-84`); only `Alt+F4` is registered
(`keybindings.ts:65`), so `Alt+C` is free and terminal apps rarely bind plain `Alt+letter`.
Avoid plain `Ctrl+Shift+C` (xterm copy convention) and `Ctrl+Shift+V` (paste).

Per AGENTS.md, any new shortcut should still be raised with the user before merge
(`AGENTS.md:166`); `Ctrl+Shift+K` is the recommendation to put in front of them.

Confidence: **high** on non-collision (read the registry and matcher arms directly,
`keybindings.ts:73-95`, and the AGENTS.md claimed list `AGENTS.md:158-166`).

---

## Item 4 — Default-tab behavior (Home as landing tab)

### Current landing behavior (read directly)

The app is a two-state machine: `'startup' | 'running'` (`src/renderer/App.tsx:24,27`).
`StartupDialog` is shown while `appState === 'startup'` (`App.tsx:530-538`) and gates entry
(directory + permission mode, `docs/startup-dialog.md`). After the user starts, both the
fresh-start path (`handleStartSession`, `App.tsx:495-528`) and the reload path
(`App.tsx:290-345`) restore saved tabs, then set the active tab to whatever the main process
reports via `getActiveTabId()` (`App.tsx:330`, `:515`) and flip to `'running'`
(`App.tsx:311/335/518`). If no tabs exist, a fresh Claude tab is created and made active
(`App.tsx:341-344`, `:524-527`). So today the landing tab is the restored/last-active terminal
tab, never a Home surface.

Making **Home the default landing tab changes this shipped UX**: a returning user who expects
their last terminal tab focused would instead land on Home. That needs an explicit setting with
an escape hatch, and it must reconcile with the StartupDialog gate (Home cannot precede choosing
a directory, since `App.tsx` has no project until `startSession` resolves, `App.tsx:294-300`).

### Decision: a `startupView` setting modeled on VS Code `workbench.startupEditor`

VS Code's welcome page opens by default and is disabled by setting
`workbench.startupEditor` to `none`; this is the canonical prior art the round1 F1 lane already
cited (`docs/dashboard/recon/F1-ide-home.md:23`, `:214`;
https://code.visualstudio.com/docs/getstarted/tips-and-tricks). VS Code exposes it as an enum
(values include `none`, `welcomePage`, `welcomePageInEmptyWorkbench`, `readme`,
`newUntitledFile`, `terminal`); we model the *mechanism* (default-on, disable-able), not the
literal enum. (Enum specifics: confidence **medium** — the F1 citation and the public docs
confirm `none` disables it and the welcome page is the default; the full value list was not
re-verifiable from the fetched doc markdown in this pass, and is not load-bearing since we
define our own setting.)

Add to the settings store (same extension pattern as item 2,
`settings-store.ts:12-22`,`:74-81`):

```ts
startupView: 'lastSession' | 'home'   // default: 'lastSession'
```

- **Default `'lastSession'`** = exactly today's behavior: restore tabs, focus the
  main-process active tab (`App.tsx:330`,`:515`). No regression for current users.
- **`'home'`** = after restore, instead of selecting the restored active tab, select/open the
  Home tab. This is the opt-in that the dashboard wants to encourage but must not force.

Escape hatch (two layers, both required):

1. **The setting itself** is the durable opt-out (`startupView:'lastSession'`), surfaced in
   `SettingsDialog` as a "When ClaudeTerminal opens" picker.
2. **A persistent close/pin affordance on the Home tab** so a user who set `'home'` but wants a
   terminal *this* launch can just click their terminal tab; Home should be a normal closeable
   tab in the bar, not a forced modal. (F1 lane's lesson: build a working surface that lives in
   the tab strip, not a splash that hijacks startup —
   `docs/dashboard/recon/F1-ide-home.md:11`,`:214`.)

Reconciliation with StartupDialog: **Home does not replace the StartupDialog; it supplements
it.** The directory/permission gate still runs first (`App.tsx:530-538`) because no project
context exists before `startSession` (`App.tsx:294-300`,`:496-502`). `startupView` only decides
which tab is **active** once `appState` becomes `'running'` (the `setActiveTabId` calls at
`App.tsx:334`/`:517`). Implementation point: branch on `startupView` at those two
`setActiveTabId(activeId)` sites, selecting the Home tab id instead of `activeId` when
`startupView === 'home'`. This keeps the change to two call sites and leaves the restore logic
untouched. F1 explicitly flagged this exact decision: "whether home replaces or supplements the
StartupDialog (`App.tsx:530-538`)" — answer: **supplements** (`F1-ide-home.md:214`).

Confidence: **high** on the current landing flow and the two-call-site insertion point (read
`App.tsx:24-27`,`:290-345`,`:495-538`). **High** that the setting store extends safely
(`DEFAULTS`-merge, `settings-store.ts:37`). **Medium** on the VS Code enum specifics (mechanism
verified, full value list not re-fetched).

---

## Summary of the four decisions

| Item | Decision | Default (no-regression floor) | Primary worktree anchor |
|---|---|---|---|
| 1 PHI/secret scrub | Single `composeClaudeQuery()` choke point: allowlist canned templates; deny-by-default `scrubFreeText()` before both spawn-argv and log; log action+repo only, truncate body | Canned templates, **zero free-text interpolation** | `pty-manager.ts:28-36`, `logger.ts:20-51`, `claude-cli.ts:1-6`, `D-action-routing.md:165-392` |
| 2 Notifications | `notifications` settings block gated in `notifyTabActivity`; quiet-hours + coalesce + per-trigger toggles | `enabled/onIdle/onInput = true` (today's ping intact); quiet-hours null; coalesce 0 | `hook-router.ts:23-141`, `settings-store.ts:12-81` |
| 3 Capture shortcut | **`Ctrl+Shift+K`** (fallback `Alt+C`) | n/a (new action) | `keybindings.ts:53-95`, `AGENTS.md:158-166` |
| 4 Default tab | `startupView: 'lastSession' \| 'home'`; Home supplements (not replaces) StartupDialog; branch at the two `setActiveTabId` sites | `'lastSession'` = today's restore-and-focus | `App.tsx:24-27,290-345,495-538`, `F1-ide-home.md:23,214` |

## Residual risks

- **cmd.exe argv quoting for the scrubbed prompt.** Even after scrubbing, a positional prompt
  through `cmd.exe /c claude` can be mangled by special chars (`& | ^ " % < >`); Lane D's
  native-binary spawn fix removes the risk (`D-action-routing.md:231-253`). Scrub is about
  *content*, not *quoting*; both must be handled. Medium.
- **Scrubber false-negatives.** Regex PHI/secret detection is best-effort; the canned-template
  default is the real guarantee. Keep free-text injection opt-in. Medium.
- **DevTools log forwarding.** `logger.emit` mirrors to the renderer console
  (`logger.ts:42-51`); a remote web client with DevTools could see logs. Truncate + log
  action-id-only mitigates, but confirm the web-remote path does not relay main logs. Low-medium.
- **"Focus" semantics for notifications.** `isActive` = originating tab is the active tab,
  not whole-window focus (`hook-router.ts:60`). The optional whole-window-focus suppression must
  ship default-OFF to avoid swallowing current pings. Low.
- **Home + StartupDialog double-gate friction.** Users could perceive "two screens on launch."
  Mitigate by making Home a fast, action-dense tab (F1 lesson), not a splash. Low.
- **VS Code enum drift.** We model the mechanism, not the literal `workbench.startupEditor`
  values; if a doc reader expects 1:1 parity, clarify in the setting's help text. Low.
