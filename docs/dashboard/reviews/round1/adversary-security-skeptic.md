# Adversary review: Security / privacy skeptic

Target: `docs/dashboard/PLAN.md` (ClaudeTerminal in-app dashboard), worktree `claude-terminal-dashboard`, branch `dashboard`, HEAD `ce2e9e0`.
Lens: hunt PHI/secret leak paths (argv, logger, DevTools mirror, remote client), remote exposure, and any place the scrub is policy not control.
Method: every claim below is grounded in code I read in this worktree, not in the recon's paraphrase of it.

The plan is unusually careful for a dashboard plan. It correctly names the right single choke point (`composeClaudeQuery`), correctly defaults to canned templates with zero free-text, and correctly keeps the program-board reader off the remote wire. That is the floor, and it holds. The defects below are the places where the plan's own stated guarantee leaks through a path the plan did not trace to code, or where a "control" is actually a convention a future edit will quietly break.

---

## D1 (CRITICAL) — The DevTools mirror + remote broadcast is a confirmed PHI exfil path the plan treats as "Low-medium"

The plan's Section 9.4 and R6 residual both flag DevTools log forwarding and rate it "Low-medium," promising only to "confirm the web-remote path does not relay main logs during M10." That confidence is wrong, and the mitigation is a verification step, not a control.

What the code actually does (`src/main/logger.ts:42-51`): EVERY `log.*` call, at every level including `debug`, is mirrored into the renderer via `_window.webContents.executeJavaScript("console.<level>('[main]', ...)")`. There is no level filter, no opt-out, no redaction (`format()` at `:20-22` just stringifies). So anything any main-process module logs lands in the renderer's DevTools console.

Now the leak the plan never connects: the dashboard plan itself adds new log calls (Section 3.4 says "Log the action id and repo," "log `scrubbed.substring(0, 80)`"). The repo path is workspace-relative and benign, fine. But the plan also leans on the EXISTING logging habit as precedent (`hook-router.ts:56` logs `data.substring(0, 80)`, `tab-namer.ts:74` logs `prompt.substring(0, 80)`). I read both:

- `hook-router.ts:56`: `log.debug('[hook]', event, tabId, data ? data.substring(0, 80) : null)` — `data` is the raw hook payload, which for a prompt-submit event is the user's first 80 chars of prompt text.
- `tab-namer.ts:74-75`: logs `prompt.substring(0, 80)` AND builds a Haiku name-prompt from `prompt.substring(0, 500)`.

These pre-existing lines already mirror up to 80 chars of arbitrary prompt text into DevTools. The dashboard does not create that leak, but the dashboard's whole reason to exist is to surface OD/clinical work, and `tab.name` (LLM-summarized from those prompts) becomes `DashboardItem.title`, a copy payload, and (per R6 item 1, which the plan adopts) an opt-in free-text source for `composeClaudeQuery`.

The hard part: this is not just DevTools-local. `sendToRenderer` is NOT what mirrors logs (logs go straight to `webContents`), so logs are not on the `pty:data` broadcast list. Good. BUT a remote web client that opens its OWN browser DevTools sees its own `console`, and the question is whether main-process logs reach the remote renderer. They do NOT via the logger (the logger only targets `state.mainWindow`). So the DevTools-to-remote path is actually narrower than the plan fears in one direction and wider in another:

- Logger to remote DevTools: does not happen (logger binds to the local main window only). The plan's stated worry is partly unfounded.
- The REAL remote exfil is the terminal mirror, see D2.

Net for D1: the plan must (a) downgrade `logger.emit` from "mirror everything" to "mirror warn+error only, or nothing," because the dashboard is about to make the work this app runs systematically more clinical/financial, and a 1MB plaintext `main.log` under `<dir>/.claude-terminal/logs/main.log` (`logger.ts:60-74`) that captures 80-char prompt prefixes is a HIPAA-relevant artifact on disk regardless of DevTools; and (b) stop citing the existing 80-char-prompt log lines as a precedent to copy. "Confirm during M10" is not a control. A control is a code change to the logger or a test that asserts no prompt-derived field is ever passed to `log.*`.

Minimal fix: add a milestone (before M10) that (1) gates `emit`'s DevTools mirror to `warn`/`error` only (or behind a dev-only flag), and (2) adds a unit test asserting `composeClaudeQuery` / the item mapper never call `log.*` with `title`/`detail`/`blocked_on`/tab-name content. File a follow-up issue for the pre-existing `hook-router.ts:56` and `tab-namer.ts:74` prompt-prefix logging (out of dashboard scope, but it is the same disk artifact).

---

## D2 (CRITICAL) — Remote terminal mirroring sends raw PTY output (full clinical/financial session content) to any holder of a 6-char token over a Cloudflare tunnel; the plan inherits this and adds reasons to use it

The plan repeatedly says actions "work remotely" and treats remote as a first-class daily surface (Section 3.5, R5). It never states the blast radius of the surface it is building onto.

What the code does:
- `sendToRenderer('pty:data', ...)` broadcasts the raw terminal byte stream of every tab to every synced remote client (`index.ts:82-83`). On connect, `sendTerminalSnapshots` serializes each tab's visible buffer and pushes it too (`web-remote-server.ts:115-129, 253`). So a remote client sees the full live and scrollback content of every Claude session, which for this user is OD queries, patient data on screen, financial reports.
- Auth is a 6-character code from a 31-char alphabet (`web-remote-server.ts:56-58`): ~31^6 ≈ 8.8e8 keyspace. Compared with `crypto.timingSafeEqual` (good), 10s auth timeout (good), but there is NO attempt limiter: a client can open a socket, fail auth, and reconnect immediately; the only cost is a new TCP+WS handshake per guess. Over a public Cloudflare quick tunnel (`tunnel-manager.ts:25`), that is an unauthenticated, internet-reachable endpoint guarding all session content with an ~8.8e8 space and no rate limit.

This is pre-existing, and the plan is not obligated to fix the remote-access security model. But the plan IS obligated, under its own "Security/privacy" framing and the workspace PHI rule, to (a) name this as the dominant risk of "works remotely," and (b) NOT add features that increase the value of cracking that token without saying so. The plan does the opposite: it makes "Open Claude with query" and "Copy" work remotely and frames the dashboard as the landing surface. A dashboard that aggregates needs-you items by program/title across all repos, rendered remotely, means a token-cracker now gets a tidy index of what is in flight, not just raw scrollback.

Minimal fix the plan should adopt (not a full remote-auth rebuild):
1. State in Section 10 risks that the remote surface exposes full session content under a 6-char token with no rate limit, and that the dashboard increases its information value. One sentence, but it must be there for an honest security posture.
2. Add a bounded auth-attempt limiter to `handleWebSocketConnection` (e.g. N failed auths per source IP per minute -> refuse) as a filed follow-up issue against ClaudeTerminal, since the dashboard is the feature raising the stakes. Cite `web-remote-server.ts:177-266`.
3. For the dashboard specifically: confirm and DOCUMENT that the program-board region is stubbed off the wire (the plan already decides this in Section 2.4 — good), AND that `DashboardItem.title`/`detail` for the LIVE-TAB feed (which DOES flow remotely via `onTabUpdate`) carries only `tab.name`, never raw PTY content. Verify `tab.name` is the only tab-derived string the remote Home renders.

---

## D3 (HIGH) — The PHI scrub is policy, not control: `composeClaudeQuery` is the "sole producer" by convention only; nothing prevents a second producer

Section 3.4 and R6 item 1 hang the entire PHI guarantee on "`composeClaudeQuery()` is the SOLE producer of the query string." That is the correct design. But as written it is an architectural convention a single future edit silently defeats: `writeToPty(tabId, line)` is a public preload method (`preload.ts:50-51`) callable from anywhere in the renderer with any string. The plan adds the dashboard's own `writeToPty` call inside the `onTabUpdate` listener (Section 3.1 step 5). There is no type, no wrapper, no lint rule that forces the injected `line` to have come from `composeClaudeQuery`. A later "quick win" that writes a tab name or a `blocked_on` string directly to a PTY bypasses the choke point entirely and there is no test that fails.

Worse, the plan's own data model invites it: `DashboardItem.actions.claudeQuery: { action: KnownActionId; repo: string }` is the clean typed shape (good), but `DashboardItem.actions.copy: { text: string }` is free text, and `detail` is "blocked_on text, one-line activity" (Section 4.1). The moment someone wires a "send this detail to Claude" affordance (an obvious product ask), they will reach for `detail`, not `composeClaudeQuery`, because `detail` is right there on the item.

Minimal fix:
1. Make the choke point a TYPE control, not a naming convention. Define `type ClaudeQueryLine = string & { readonly __brand: 'ClaudeQueryLine' }` (a branded type) returned ONLY by `composeClaudeQuery`. Have the dashboard's injection write a `ClaudeQueryLine`, not a `string`. Any direct `writeToPty(tab.id, someRawString)` for injection then fails to typecheck. This converts "sole producer" from prose into a compiler-enforced invariant.
2. Add an explicit test that `composeClaudeQuery` with the canned default produces a string with zero interpolated `detail`/`title`/`blocked_on` substrings, and that `scrubFreeText` redacts the documented patterns. The plan lists this test in M10 — good — but it tests the function, not the invariant that the function is the only path. The branded type covers the invariant.

---

## D4 (HIGH) — `scrubFreeText`'s deny-list is a best-effort regex presented as a redaction "control"; the plan over-trusts it for the opt-in path

Section 3.4 and R6 item 1 specify `scrubFreeText` as: strip digit runs >= 5, emails, `Bearer/token/key/secret/password/apikey`, and a configurable name list. This is fine as belt-and-suspenders, and the plan correctly says the canned default is the real guarantee. But two gaps make the opt-in path more dangerous than the plan admits, and the plan should either close them or state plainly that the opt-in free-text path is unsafe-by-design and is shipped disabled.

Gaps in the deny-list as specified:
- Patient NAMES are the primary PHI here and a regex cannot catch them. The plan hand-waves "a configurable name list." A name list of WHOM? The practice has staff names in memory (Danielle, Dolores, Mariah, etc.) but PATIENT names are unbounded and unknown to the app. So the one PHI category that matters most for this user (patient identity) is exactly the one the scrubber structurally cannot redact. The plan's "redact if unsure" bar is not implementable for free-form names.
- Digit-run >= 5 misses formatted MRN/DOB/phone with separators (e.g. `303-986-9337` is three runs of 3/3/4, none >= 5; a DOB `04/12/1985` is runs of 2/2/4). The most common real PHI digit shapes slip the filter.

Minimal fix: do not present `scrubFreeText` as a control that makes free-text safe. The plan should state the opt-in free-text path is NOT shippable as a PHI control for this practice (names + formatted identifiers defeat regex), ship it disabled, and require an explicit per-call user confirmation if ever enabled. Keep the canned-template default as the only enabled path. Concretely: add to Section 3.4 a one-line "free-text injection is OFF and gated behind an explicit per-use opt-in; the scrubber is harm-reduction, not a guarantee, and cannot redact patient names." Tighten the digit rule to also catch separated runs (`\d[\d\s.\-/]{3,}\d`) as a cheap improvement, but flag it as still insufficient for names.

---

## D5 (HIGH) — Remote `tab:create` ignores the projectId/cwd the dashboard resolves; the injected query runs in the WRONG directory remotely, and the plan's careful cwd logic is silently void over the wire

This is a correctness-with-security-consequence defect the plan's remote-parity section (3.1, R5 §D) misses entirely.

Section 3.1 step 2-3 carefully resolves `projectId` via `activeProjectIdRef.current` and calls `createTab(projectId, null)` so the injected query runs in the intended project's cwd. The plan asserts (R5 §D, Section 3.5) this "works remotely, no new channel."

But the remote `tab:create` handler (`web-remote-server.ts:316-323`) IGNORES the message's projectId/worktree entirely: it reads `state.workspaceDir` and calls `tabManager.createTab(cwd, null, 'claude')`. The bridge stub confirms it never even sends the projectId: `createTab: async (_projectId?, _worktree?) => { ... this.send({ type: 'tab:create' }); }` (`ws-bridge.ts:249-254`) — both args are discarded (`_`-prefixed). So remotely, the dashboard's "open Claude with query in THIS program's repo" creates a tab in `state.workspaceDir` and then writes the query there.

Security consequence: the canned query "review the open TODOs in this repo" / "summarize what changed on this branch" now runs Claude against whatever `state.workspaceDir` is, not the program the user clicked. If `state.workspaceDir` happens to be the PHI-adjacent workspace root and the clicked program was a benign repo, the user has unknowingly pointed an LLM session at the wrong, possibly more sensitive, tree. At minimum it is a silent wrong-context action; at worst it directs a canned "summarize what changed" at a directory the user did not intend.

Minimal fix: the plan must NOT claim "Open Claude with query works remotely" without qualification. Either (a) thread projectId/worktree into the remote `tab:create` message and handler (a real channel change, the "decide remote parity for a changed channel" case AGENTS.md names — and what R5's own §D bullet 3 flags as "not required for v1," wrongly, because v1 ships the action remotely), or (b) disable the Claude-with-query action remotely (explicit disabled state, same pattern as PowerShell) until the cwd is honored. Document the chosen path in Section 3.1 with the `web-remote-server.ts:316-323` citation.

---

## D6 (MEDIUM) — Remote clipboard "Copy" of paste-ready PowerShell is an injection-into-the-host vector the plan frames purely as convenience

Section 3.3 says Copy "writes to the remote user's own device clipboard, which is the right semantics" and Mark wants "paste-ready PS for CADDC02 work." Reading it as the adversary: the dashboard composes PowerShell command text from program-board fields (`blocked_on`, etc.) and offers a one-click copy, intended to be pasted into a PowerShell tab that runs on the HOST (the PHI-adjacent work PC). If any composed PS command interpolates free-text from a program-board override YAML (`dashboard/programs/*.yml`, author-controlled but still free-text), a malformed or hostile string becomes a command the user pastes and runs with the user's full privileges on the work PC.

This is lower severity because the user is pasting their own workspace's YAML content and there is a human in the loop. But the plan presents zero guard on what goes INTO a "paste-ready PowerShell command," and the same content-vs-quoting hazard the plan acknowledges for the deferred positional-argv path (Section 3.4 residual) applies here the moment the copy payload is a runnable command rather than inert text.

Minimal fix: in Section 3.3, restrict the "paste-ready PowerShell" copy payload to canned commands with only the resolved repo path interpolated (mirror the `composeClaudeQuery` canned-template discipline), never free-text from `blocked_on`/reasons. State that copy of arbitrary free-text strings (the `copy: { text }` action) is for inert display values only and is never a runnable command. One sentence + a note that command payloads go through a canned composer.

---

## D7 (MEDIUM) — `PROGRAM_BOARD_WORKSPACE` env + HTTP fallback to `127.0.0.1:5173` are two unauthenticated trust inputs the plan reads without validation

Section 4.3 resolves the state path from `process.env.PROGRAM_BOARD_WORKSPACE` and falls back to `GET http://127.0.0.1:5173/api/state`. Two trust issues:

- The env var is an arbitrary path the reader will `fs.watch` and read JSON from. The plan says "fallback `C:\Users\Mark\Claude-Code`" but does not validate that the resolved `dashboard/state.json` is inside an expected root or reject UNC/remote paths. A poisoned env (or a future config surface that sets it) points the reader at attacker-chosen JSON whose `title`/`detail`/`url` fields then render in the hero and, for `url`, could feed an `openExternal`. The plan's Section 4.2 already says OD tasks must "never feed `openExternal`" — good instinct — but never states that program-board `url` fields are themselves untrusted and must be validated (scheme allowlist `https?:` only) before any open.
- The `127.0.0.1:5173` HTTP fallback trusts whatever is listening on that port. On a multi-user box or if 5173 is taken by another process, the dashboard ingests and renders foreign JSON. Low probability, but the plan treats the HTTP fallback as obviously safe ("identical schema, same parser") without noting it is an unauthenticated local endpoint.

Minimal fix: (1) validate the resolved state path is under an expected workspace root and is a local fixed path, reject if not; (2) when rendering any `url` from the feed, allowlist the scheme (`https:`/`http:` only, no `file:`/`javascript:`) before it becomes a clickable/openExternal target; state this in Section 4.1 next to the `url` field. These are cheap and turn two implicit trust inputs into validated ones.

---

## D8 (LOW) — The plaintext `main.log` retention and "fresh each run" deletion is a partial control the plan should make explicit

`logger.init` deletes prior logs each run (`logger.ts:67-69`) and caps at 1MB with one rotation (`:14, :24-31, :38`). That bounds on-disk exposure, which is genuinely helpful and the plan should CREDIT it as the existing mitigation it relies on. But the plan never states that the dashboard's new log calls inherit this file, nor that the 1MB window can still hold many 80-char prompt prefixes between runs. Combined with D1, the honest posture is: the disk log is bounded and wiped per run, the dashboard adds only action-id+repo lines (safe), but the SHARED file still co-mingles the pre-existing prompt-prefix lines.

Minimal fix: one line in Section 9.4 crediting the per-run wipe + 1MB cap as the disk-exposure bound, and confirming the dashboard's own log lines add no prompt content (which D1's test enforces).

---

## What the plan gets right (so it is not over-corrected)

- Choke-point location (compose step feeding both spawn and log) is correct; both sinks derive from one string (verified `pty-manager.ts:28-36`, `logger.ts:20-51`).
- Canned-template default with zero free-text is the right floor and is the real guarantee, correctly stated.
- Keeping the program-board reader OFF the remote wire (Section 2.4 stub) is the right call and removes the biggest new-data remote risk.
- PowerShell local-only + explicit disabled state (not a silent noop) is correct and matches `ws-bridge.ts:261-263` throwing-stub discipline.
- Write-after-ready over positional-argv correctly sidesteps the cmd.exe quoting injection surface for Phase 1 (verified the argv path is the only one that would quote, and Phase 1 never uses it).
- `crypto.timingSafeEqual` for the remote token is already in place and the plan does not weaken it.

The corrections that matter most: D1/D2 (the existing log + remote surfaces are leak paths the dashboard makes more valuable, rated too low), D3 (make the choke point a type, not a convention), D5 (the remote cwd mismatch silently voids the plan's careful cwd logic), and D4 (stop presenting the name-scrubber as a control it cannot be for patient names).
