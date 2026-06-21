# R2: requires_response Attention-Spine Audit

GAP (critical): the dashboard's attention spine rests on the `requires_response` tab status, which is
driven by Claude Code's Notification hook. The app's DEFAULT permission mode is `bypassPermissions`,
which suppresses permission prompts. Does the attention signal still fire? Is `requires_response` a
dependable "which session needs me" spine, and if not, what is the reliable fallback?

Verdict up front: **`requires_response` is NOT a dependable needs-you spine under the default
`bypassPermissions` mode.** Its sole trigger is the Notification hook, whose dominant cause
(`permission_prompt`) is suppressed when permissions are bypassed, and whose only other "your turn"
cause (`idle_prompt`) is a 60-second-delayed, platform-flaky signal that Anthropic has declined to
fix. The reliable replacement is the **Stop hook** (already wired to `tab:status:idle`), which fires
once per turn when Claude finishes responding. The dashboard should treat **idle-after-activity** as
the primary needs-you signal and keep `requires_response` only as an additive, higher-urgency overlay
when it happens to fire.

---

## Provenance / branch correction

- BUILD-TARGET worktree audited: `C:/Users/Mark/Claude-Code/infrastructure/claude-terminal-dashboard`
- Branch: `dashboard` (based on master), HEAD `ce2e9e02d4e886ee892a284c7a2a7009491236b8`
- Verified via `git rev-parse --abbrev-ref HEAD` and `git worktree list`.
- **Correction to a prior recon round:** the sibling worktree
  `C:/Users/Mark/Claude-Code/infrastructure/claude-terminal` is on the **`dev`** branch
  (`42ceac1`), a DIFFERENT checkout. Any earlier recon that cited code from `claude-terminal`
  (the `dev` worktree) cited the wrong branch. All citations below are from the `dashboard`
  worktree only.

---

## 1. How status transitions are driven in the worktree (code facts)

### 1.1 The hook -> pipe -> router -> tab-status chain

Each Claude Code hook is a small Node script that pushes one event over the named pipe. The router
maps each event to a `TabStatus`.

| Claude Code hook | Hook script (worktree) | Pipe event emitted | Router action |
|---|---|---|---|
| SessionStart | `src/hooks/on-session-start.js:19` | `tab:ready` (+ sessionId, source) | -> `idle` if sessionId else `new` (`src/main/hook-router.ts:98-107`) |
| UserPromptSubmit | `src/hooks/on-prompt-submit.js:28` | `tab:generate-name` (first prompt only) | name only; **no status change** (`src/main/hook-router.ts:157-161`) |
| PreToolUse | `src/hooks/on-tool-use.js:5` | `tab:status:working` | -> `working` (`src/main/hook-router.ts:121-123`) |
| Stop | `src/hooks/on-stop.js:5` | `tab:status:idle` | -> `idle` (`src/main/hook-router.ts:125-132`) |
| Notification | `src/hooks/on-notification.js:5` | `tab:status:input` | -> `requires_response` (`src/main/hook-router.ts:134-141`) |
| SessionEnd | `src/hooks/on-session-end.js:5` | `tab:closed` | no-op; defers to onExit (`src/main/hook-router.ts:143-148`) |

The status enum: `type TabStatus = 'new' | 'working' | 'idle' | 'requires_response' | 'shell'`
(`src/shared/types.ts:1`). `updateStatus` is a flat setter with no transition guard
(`src/main/tab-manager.ts:55-58`), so the last event wins.

### 1.2 `requires_response` has exactly ONE producer

Grepping the worktree, the only path that sets `requires_response` is the `tab:status:input` case
(`src/main/hook-router.ts:134-135`), and the only producer of `tab:status:input` is
`src/hooks/on-notification.js:5`. `on-notification.js` is registered ONLY against Claude Code's
`Notification` event (`src/main/hook-installer.ts:65-67`). Therefore:

> **`requires_response` fires if and only if Claude Code emits a Notification.** No other code path
> in the worktree produces it.

### 1.3 What the attention spine renders off `requires_response`

The needs-you UI is fed entirely by this one status:

- Window title: `hasInput = tabs.some(t => t.status === 'requires_response')` -> `[Needs Attention]`
  (`src/shared/window-title.ts:13-16`).
- Status bar "Input" pill: `requires_response` -> `text-attention` color
  (`src/renderer/components/StatusBar.tsx:9,15`).
- Per-project sidebar waiting count: `counts?.requires_response`
  (`src/renderer/components/ProjectSidebar.tsx:8,55`; aggregated in `src/renderer/App.tsx:88-98`).
- Tab dot: `case 'requires_response'` (`src/renderer/components/TabIndicator.tsx:25`).
- OS toast on inactive tab: `notifyTabActivity(... 'Claude needs your input')`
  (`src/main/hook-router.ts:136-140`).

So the entire "which session needs me" surface is downstream of the Notification hook. If that hook
stays quiet, every one of these surfaces stays quiet for that condition.

### 1.4 Default permission mode is bypassPermissions (verified)

- `DEFAULTS.permissionMode = 'bypassPermissions'` (`src/main/settings-store.ts:18-22`).
- Main-process fallback state mirrors it: `permissionMode: 'bypassPermissions'`
  (`src/main/index.ts:62`).
- Startup dialog default + option: `useState<PermissionMode>('bypassPermissions')`,
  `{ value: 'bypassPermissions', label: 'Bypass' }`
  (`src/renderer/components/StartupDialog.tsx:17,26`).
- Maps to the CLI flag: `bypassPermissions: ['--dangerously-skip-permissions']`
  (`src/shared/types.ts:74`), applied at spawn
  (`src/main/ipc-handlers.ts:390,485`; `src/main/web-remote-server.ts:329,420`).

The installed Notification hook is registered with an empty matcher
(`src/main/hook-installer.ts:65-67`), i.e. it subscribes to ALL notification types, not just
permission prompts. That matters: it means the hook would still catch `idle_prompt` and the others
if Claude Code emits them. The limiting factor is not the matcher; it is whether Claude Code emits a
notification at all under bypass mode.

---

## 2. Claude Code's actual Notification-hook firing semantics (official docs)

Source: Claude Code "Hooks reference" — https://code.claude.com/docs/en/hooks
(the legacy `docs.anthropic.com/en/docs/claude-code/hooks` 301-redirects here).

The `Notification` hook fires "when Claude Code sends a notification." It is not permission-only; it
matches on a `notification_type`, with these values:

| `notification_type` | Fires when |
|---|---|
| `permission_prompt` | Claude needs your permission to use a tool |
| `idle_prompt` | the prompt input has been idle for at least 60 seconds |
| `auth_success` | successful authentication |
| `elicitation_dialog` | an MCP server requests user input |
| `elicitation_complete` | MCP elicitation finished |
| `elicitation_response` | user responded to an MCP elicitation |

So the answer to the gap's direct question: **the Notification hook does NOT fire only on permission
prompts.** It also fires on a 60-second idle (`idle_prompt`) and on MCP elicitation. But of these,
only `permission_prompt`, `idle_prompt`, and the `elicitation_*` set represent "Claude is waiting on
the human." `auth_success` is noise for attention purposes.

The `Stop` hook, by contrast, fires "when Claude finishes responding," once per turn
(per-turn cadence). It does not depend on permission mode.

---

## 3. The bypassPermissions interaction (definitive)

Source: "Choose a permission mode" — https://code.claude.com/docs/en/permission-modes

> "`bypassPermissions` mode disables permission prompts and safety checks so tool calls execute
> immediately." The table lists bypass mode as running "Everything" without asking. The only residual
> prompts are: explicit `ask` rules, and a `rm -rf /` / `rm -rf ~` circuit breaker.

Consequence for the spine:

1. **`permission_prompt` is structurally suppressed.** No permission pause means no permission
   notification. The Notification hook's single most common trigger is gone in the app's default
   mode. (Caveat: an explicit `ask` rule in a project's settings could still force a prompt and thus
   a `permission_prompt` notification, but that is not the app default and depends on per-project
   config the dashboard does not control.)
2. **`idle_prompt` is the only remaining "your turn" notification in normal use** (MCP `elicitation_*`
   fires only when an MCP server actively elicits input, which is rare and tool-specific).
3. Therefore, under default config, `requires_response` will, in practice, only ever be set by the
   60-second idle notification, if it fires at all.

### 3.1 Why `idle_prompt` cannot carry the spine

The idle notification is delayed and unreliable, confirmed by Anthropic's own tracker:

- **It is slow by design.** It fires only "after 60+ seconds idle." Anthropic's own feature request
  describes this as "too slow for immediate feedback"
  (GitHub anthropics/claude-code#13024:
  https://github.com/anthropics/claude-code/issues/13024). A dashboard that only learns "your turn"
  60 seconds after the fact is not a dependable needs-you signal.
- **It is platform-flaky and unfixed.** GitHub anthropics/claude-code#8320
  (https://github.com/anthropics/claude-code/issues/8320) reports the 60s idle notification simply
  not firing (Ubuntu/GNOME/Wayland), while permission notifications work; the issue was
  **closed as not planned**. A separate report (anthropics/claude-code#59718) shows the Notification
  hook never firing at all in the VS Code extension. The app targets Windows/ConPTY, not those exact
  setups, but the pattern is clear: `idle_prompt` delivery is best-effort and Anthropic is not
  treating its gaps as bugs to fix.

Net: even setting bypass mode aside, `idle_prompt` is too slow and too unreliable to be the spine.

---

## 4. Conclusion on the gap

**Under `bypassPermissions` (the app default):**

- Reliable attention signals that DO fire:
  - **`Stop` -> `tab:status:idle` -> `idle`** fires every turn when Claude finishes responding.
    This is the dependable one. It is mode-independent and already wired
    (`src/hooks/on-stop.js:5` -> `src/main/hook-router.ts:125-132`).
  - **`PreToolUse` -> `working`** reliably marks "currently busy" (mode-independent).
  - SessionStart -> `tab:ready` reliably marks new/idle at launch.
- Signals that are NOT dependable:
  - **`requires_response`** (Notification hook). Its main cause (`permission_prompt`) is suppressed
    by bypass mode; its fallback cause (`idle_prompt`) is 60s-delayed and platform-flaky. It will be
    silent for most "your turn" moments in the app's default configuration.

**So: `requires_response` is not a dependable "which session needs me" spine.** Treat it as a
best-effort, additive, higher-urgency overlay (when it does fire, it is meaningful), not as the
primary signal.

### Known residual the fallback cannot fully cover

Mid-turn questions via `AskUserQuestion` do not trigger the `Stop` hook (Stop fires only when the
turn finishes), and under bypass mode do not trigger a `permission_prompt` either
(anthropics/claude-code#13024 is the open request for a dedicated "waiting for input" hook). A
session that pauses mid-turn to ask the user a question has NO reliable hook today. The idle-duration
heuristic below is what bridges that gap (after ~60s of no output, surface it), accepting the delay.

---

## 5. Concrete fallback: an idle-after-activity needs-you signal

Make the dashboard derive "your turn" primarily from the Stop hook plus a session-lifecycle state
machine, and keep `requires_response` as an overlay. None of this requires changing Claude Code; it
uses signals the app already receives.

### 5.1 Primary: Stop-after-activity = "needs you"

Define needs-you on the dashboard as: a tab whose last status transition was to `idle` AND that has
had at least one `working` (PreToolUse) or prompt event during the session. That is precisely the
"Claude just finished a turn and is waiting on the human" condition.

- The Stop hook already drives this (`idle`). The dashboard's needs-you query becomes
  `status === 'idle' && hadActivity`, not `status === 'requires_response'`.
- `hadActivity` is cheap to track: set a per-tab flag on the first `tab:status:working` or
  `tab:generate-name` after a `tab:ready`. A freshly-resumed tab that lands on `idle` with no
  activity is "ready", not "needs you" (mirrors the existing `idle`-on-resume reasoning at
  `src/main/hook-router.ts:99-107`).
- This distinguishes "finished a turn, waiting on you" (needs-you) from "busy" (`working`) from
  "brand new / just resumed" (no activity yet).

### 5.2 Overlay: keep requires_response as a stronger ping when it fires

When the Notification hook does fire (an explicit `ask` rule trips, an MCP server elicits input, or
`idle_prompt` eventually lands), `requires_response` is a stronger, more specific signal than plain
idle. Keep rendering it as a distinct, higher-urgency state on top of idle-needs-you, rather than
relying on it as the only source.

### 5.3 Secondary heuristic: idle-duration for the AskUserQuestion gap

For the mid-turn-question case that has no hook, add an idle-duration timer on the dashboard side:
if a tab has been `idle` (or has produced no pipe events) for longer than a threshold (e.g. 45-60s),
escalate it into the needs-you set. This duplicates what `idle_prompt` is supposed to do but runs in
the app's own process, so it is not subject to Claude Code's flaky idle delivery. Track "last event
timestamp" per tab from the existing pipe traffic; no new hook is needed.

### 5.4 What NOT to do

- Do not switch the app's default mode away from `bypassPermissions` just to resurrect
  `permission_prompt`. That trades the user's chosen frictionless flow for a notification crutch, and
  even `default` mode would only fire on tool calls, not on plain "I asked you a question" turns.
- Do not add per-type Notification matchers expecting `idle_prompt` to be reliable; #8320 shows it is
  not, and #59718 shows the hook can be silent entirely on some hosts.

---

## Confidence

- High: the worktree code facts (the single-producer chain for `requires_response`, the default
  bypass mode, the Stop->idle wiring). All cited to file:line and directly read.
- High: the Notification `notification_type` taxonomy and the Stop "finishes responding / once per
  turn" semantics, and that bypass mode disables permission prompts. All from current official docs
  (code.claude.com/docs).
- High: that `idle_prompt` is 60s-delayed and unreliable, and that no hook exists for mid-turn
  questions today. Corroborated by three Anthropic GitHub issues (#8320 closed not-planned, #13024
  open feature request, #59718 VS Code silence).
- Medium: the exact Windows/ConPTY delivery reliability of `idle_prompt` specifically (the failing
  reports are Linux/Wayland and VS Code; the app's target host was not directly reproduced). This is
  why the fallback derives needs-you from Stop + an in-app idle timer rather than trusting
  `idle_prompt` on any platform.

## Sources

- Claude Code Hooks reference: https://code.claude.com/docs/en/hooks
- Claude Code permission modes: https://code.claude.com/docs/en/permission-modes
- anthropics/claude-code#8320 (idle notifications not triggering, closed not-planned):
  https://github.com/anthropics/claude-code/issues/8320
- anthropics/claude-code#13024 (feature request: hook for waiting on user input):
  https://github.com/anthropics/claude-code/issues/13024
- anthropics/claude-code#59718 (Notification hook never fires in VS Code extension):
  https://github.com/anthropics/claude-code/issues/59718
