# Adversary review: Security / privacy skeptic (round 3)

Lens: hunt PHI/secret leak paths (argv, logger, DevTools mirror, remote client), remote
exposure, and any place the scrub is policy not control. Every claim below was checked against
source in the `dashboard` worktree (HEAD `ce2e9e0`), not against the plan's own citations.

Verdict: the plan's *active* controls (the `ClaudeQueryLine` branded type, the canned-template
default, C1 token hardening, the `openExternal` allowlist at the IPC boundary, the
`isStateJsonPathSafe` validator) are real controls and are well-placed. The plan is honest
about the local-only nature of the injection guarantee and the raw remote `pty:write`
passthrough. But the LOGGER analysis is wrong in a way that turns the single largest standing
PHI leak into a "follow-up issue," and one PHI-to-LLM seam is missed entirely. Those are the
defects that would ship.

---

## D1 (CRITICAL): the logger writes PHI-capable lines INTO every opened repo's working tree, which is not gitignored

The plan (3.6 "Logger DevTools mirror + disk", 9.4) frames disk exposure as: "the per-run wipe
fires only at `logger.init` (process start, `:67-69`), so within a long-running session up to
~2MB plaintext persists." Two parts of that are false, and the false parts hide a worse leak.

Verified against source:

- `log.init(dir)` is NOT called at process start. It is called inside the session-start /
  add-project handlers: `ipc-handlers.ts:205` (`addProject` for an additional project) and
  `ipc-handlers.ts:284` (the single-project `session:start`). So `init` fires once PER OPENED
  PROJECT, re-pointing the log stream each time.
- The log file path is `path.join(dir, '.claude-terminal', 'logs', 'main.log')`
  (`logger.ts:60-64`). `dir` is the opened PROJECT directory. So opening `cad-portal` writes
  `cad-portal/.claude-terminal/logs/main.log`; opening `practice-analytics` writes into that
  repo; and so on. The plan reasons as if there is one workspace-root log; there is one log
  per opened repo, landing inside the repo's own working tree.
- That tree is a git repo that gets pushed to GitHub. I checked the five most sensitive repos
  the dashboard is designed to surface and drive you into: `cad-portal`, `practice-analytics`,
  `open-dental`, `clinical-notes`, `connections`. NONE of them gitignore `.claude-terminal/`,
  and there is no global `core.excludesfile`. Only the `claude-terminal-dashboard` repo's own
  `.gitignore:99` has the entry, which protects the wrong repo.
- The lines written there are PHI-capable today: `hook-router.ts:56`
  `log.debug('[hook]', event, tabId, data.substring(0, 80))` and `tab-namer.ts:74`
  `log.debug('[generateTabName] ... prompt:', prompt.substring(0, 80))`. The first 80 chars of
  a user's first prompt routinely contain a patient name ("Patient 4412, draft the incomplete
  note for Jane Doe ...").
- A live `main.log` (340 KB) exists right now at `C:\Users\Mark\Claude-Code\.claude-terminal\
  logs\main.log`, demonstrating the behavior is active, not hypothetical.

Why this is the dashboard's problem and not just a pre-existing one: the dashboard's stated
purpose is to be "a tidy cross-repo index of in-flight clinical/financial work" that drives you
to OPEN MORE of these repos as projects. Every newly-opened clinical repo gets a fresh
plaintext PHI-capable log dropped into a git-tracked tree that is not ignored. The plan
explicitly downgrades exactly these lines to "File a follow-up issue for those pre-existing
lines; stop citing them as a precedent to copy." That is the "scrub is policy not control"
trap: the control is deferred while the activity that triggers the leak is what the milestone
ships.

The M0b unit test the plan does specify ("asserts `composeClaudeQuery` and the item mapper
never pass `title`/`detail`/`blocked_on`/`dod.gaps`/tab-name to `log.*`") guards only the
dashboard's OWN new log lines. It does nothing about the two existing lines that write PHI into
the per-repo tree, which is the real disk leak.

Minimal fix (Phase 1, gate alongside the dashboard, not a follow-up):
1. Move the log file OUT of the project tree. Write to a single fixed app-data location
   (`app.getPath('userData')/logs/main.log`), not `path.join(dir, '.claude-terminal', ...)`.
   This is a one-line change in `logger.init` and removes the git-leak path entirely.
2. Until (1) lands, add `.claude-terminal/` to a global git excludesfile AND redact the two
   prompt-prefix lines: drop the `prompt`/`data` substring from `hook-router.ts:56` and
   `tab-namer.ts:74` to id-only, OR route them through `scrubFreeText` (which M0c already
   builds and tests).
3. Correct the plan's text: `init` is per-project-add (`:205`,`:284`), so the "wipe" can fire
   mid-session on opening a second project, and the disk window is per-repo, not "~2MB at
   workspace root."

---

## D2 (HIGH): a 500-char raw user prompt is sent to the Haiku tab-namer LLM, unscrubbed; the plan never addresses this PHI-to-LLM seam

`tab-namer.ts:75` composes `namePrompt = "...:\n\n${prompt.substring(0, 500)}"` and calls
`callHaikuForName(tabId, namePrompt)`. So the first 500 characters of every first prompt are
shipped to an LLM purely to auto-name the tab. That is a direct PHI-to-LLM path, and it is the
exact thing the workspace memory `feedback_phi_minimize_to_llm_not_caddc02` is about
(minimize what the Claude job sees).

The plan's entire PHI argument is built around `composeClaudeQuery` being the "only action that
can carry free text into a PTY write and logs" (3.4). That is false for the LLM seam: the
tab-namer carries far more free text (500 chars vs the 80-char log) to an external model, for
every tab, and the dashboard multiplies tab creation (write-after-ready spawns a fresh tab per
"ask this query" click, each of which gets auto-named off its first injected prompt).

Today the dashboard's canned queries are PHI-free, so the auto-name of a dashboard-spawned tab
is currently safe. But the plan documents a Phase-2/3 opt-in that lets producer-computed
`dod.gaps[0]` text into the query slot, and the moment that ships, the tab-namer re-broadcasts
that slot to Haiku at 500 chars with zero scrub. The plan reasons about the query reaching the
PTY and the log, never about it reaching the namer LLM.

Minimal fix: name it as a residual risk in Section 10 now (it is at least as load-bearing as
R-11), and add one sentence to 3.4: any free-text-bearing query opt-in must ALSO gate the
tab-namer (either suppress auto-naming for dashboard-injected tabs, or run the namer prompt
through `scrubFreeText`). One line in the risk register; the code gate ships with the opt-in,
not now.

---

## D3 (MEDIUM): C1 hardens the token but the real exposure is the PUBLIC quick tunnel; the plan never recommends the actual control

C1 is correct as far as it goes (widen 6 -> >=16 chars, bound connection attempts). But the
plan states the keyspace problem as if token strength were the exposure. Verified: the remote
HTTP/WS server binds `127.0.0.1` (`web-remote-server.ts:78`) and is fronted by a Cloudflare
QUICK tunnel that mints a public `https://<random>.trycloudflare.com` URL
(`tunnel-manager.ts:25,103`). A quick tunnel has NO Cloudflare Access, NO IP allowlist, and the
tunnel terminates traffic AS localhost, so the app-layer `127.0.0.1` bind provides no source
restriction against tunnel traffic. Anyone who learns the URL reaches the auth handshake. The
URL is short, guessable-ish, and is the kind of thing that ends up in browser history, a phone,
a screenshot, or a Telegram message.

So the dashboard raises the value of an endpoint whose front door is a public URL guarded by
one shared token. Widening the token from 8.87e8 to ~16 chars helps brute force, but the real
control for "internet-reachable endpoint exposing full PTY scrollback of clinical sessions" is
a named tunnel behind Cloudflare Access (or at minimum an explicit acknowledgment that quick
tunnels are unauthenticated-by-URL and a recommendation to move off them).

Minimal fix: keep C1, and add R-9 a second mitigation line: "the quick tunnel is public-by-URL
with no Cloudflare Access; recommend a named tunnel + Access policy, or at minimum surface the
URL's public nature in the Remote Access UI so it is not pasted casually." This is a doc/risk
change plus a one-line UI warning, not new plumbing, and it stops the plan from billing token
width as the fix for a problem that is really tunnel posture.

---

## D4 (MEDIUM): the openExternal allowlist is specified for the IPC handler, but the dashboard's `url` link in the desktop renderer can reach the two UNGUARDED main-window sinks the plan defers

The plan (3.6, 2.10) enforces the http/https allowlist INSIDE `shell:openExternal`
(`ipc-handlers.ts:783`) so "it protects EVERY caller," and files the unguarded
`setWindowOpenHandler`/`will-navigate` sinks (`index.ts:294-304`) as a follow-up. Verified
those two sinks are real and unguarded:
- `index.ts:295` `setWindowOpenHandler` calls `shell.openExternal(url)` with zero scheme check.
- `index.ts:303` `will-navigate` calls `shell.openExternal(url)` for any non-app URL.

The gap: if the dashboard renders a poisoned feed `url` as an ordinary `<a href="...">` (the
natural way to render a clickable link) rather than wiring its onClick through
`window.claudeTerminal.openExternal`, the click is a navigation/window-open that the renderer's
`will-navigate` / `setWindowOpenHandler` intercepts and sends to the UNGUARDED
`shell.openExternal`, bypassing the IPC handler the plan hardened. A `file:`/`vscode:`/
`javascript:`-ish scheme in `state.json` then reaches `shell.openExternal` despite the IPC
allowlist. So "protects EVERY caller" is true only for callers that go through the IPC method;
an `<a>` tag does not.

This is fixable cheaply but must be stated as a hard build rule, not left implicit. Minimal
fix: (a) the HomeView MUST route every feed-`url` click through
`window.claudeTerminal.openExternal` (never a bare `href` that navigates), and the M8a test
must assert the rendered link has no navigating `href` (or that the click handler calls the
mocked `openExternal`); OR (b) promote the `index.ts:294-304` allowlist from "follow-up" to the
same C1/M0b Phase-1 tier, since the dashboard is the feature that introduces attacker-influenced
URLs (`state.json` is producer-written but the producer reads YAML overrides and gh/diag
enrichment, so a poisoned upstream is in scope). (a) is one line of build discipline plus one
test; prefer it, and keep (b) but acknowledge the `<a>`-tag bypass exists until (b) lands.

---

## D5 (LOW): `program-board:state` not-remote-forwarded is enforced behaviorally, but the data it carries is more sensitive than the plan credits, so the test is load-bearing and must not be softened

The plan's M5 correctly makes the "not remote-forwarded" decision a tested invariant (spy
`broadcast`, or an exported `REMOTE_FORWARDED_CHANNELS` const). Verified the forward chain is an
inline if/else-if in `sendToRenderer` (`index.ts:80-98`) and `program-board:state` is not in it,
so the default is already safe. Good.

The one thing to underline so a future editor does not "simplify" it: the program-board state is
a cross-repo digest of in-flight clinical/financial work (program names, blocked_on text,
DoD gaps, time-sensitive dates). If a later contributor adds `program-board:state` to the
forward chain to "let remote see the board," they ship the workspace's entire work-status digest
to whoever holds the public-tunnel URL. The plan's behavioral test is the only thing standing in
front of that, so its DoD must be a HARD gate (the test must assert a `program-board:state`
`sendToRenderer` does NOT call `broadcast`), and the `ws-bridge` stub must stay returning the
empty payload, never wired to a real send. The plan says this; flag it as non-negotiable rather
than one option of two, because option (b)'s "spy and assert not called" is the stronger of the
two and should be the chosen one.

---

## Things the plan gets RIGHT (so they are not re-litigated)

- `ClaudeQueryLine` branded type as a compiler-enforced sole-producer invariant: a real control,
  not policy. The detail free-text field sitting on `DashboardItem` is exactly the future foot-gun
  the brand blocks. Keep it.
- Canned-template default with zero free-text interpolation, billed honestly as safe-but-generic
  (not "highest specificity"): correct, and the honesty about `incomplete-notes`'s real
  deliverable living in the forbidden `dod.gaps[0]` slot is the right call.
- Raw remote `pty:write` named as a local-only-guarantee residual (R-11), with the token as the
  channel's only guard: verified accurate (`web-remote-server.ts:272-276` passes
  `msg.data` straight to `ptyManager.write`). Correctly not papered over.
- `scrubFreeText` billed as harm-reduction not a control, shipped tested-but-unwired, with the
  honest admission it cannot enumerate patient names: correct framing.
- `isStateJsonPathSafe` as a named, unit-tested pure function rather than an inline check: correct,
  and the M4 cases (out-of-root, `..`, UNC) are the right ones.
- Remote `openExternal` is a renderer-local `window.open` (`ws-bridge.ts:351-353`), so a poisoned
  url does not reach the main `shell.openExternal` from the REMOTE client. The plan's remote-parity
  table is right that this is a local concern (which is what D4 is about).
