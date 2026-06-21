# Adversary review: security / privacy skeptic (round 2)

Lens: hunt PHI/secret leak paths (argv, logger, DevTools mirror, remote client), remote exposure, and any place the scrub is policy not control. Defaults to finding real defects.

Build target verified against the `dashboard` worktree at HEAD `ce2e9e0`:
- `src/main/logger.ts`, `src/main/web-remote-server.ts`, `src/main/index.ts`, `src/main/tunnel-manager.ts`, `src/main/ipc-handlers.ts`, `src/preload.ts`, `src/web-client/ws-bridge.ts` all read directly.

The plan is unusually security-aware for an internal tool. The choke point (`composeClaudeQuery` + branded `ClaudeQueryLine`), the canned-template default, the logger gate (M0b), and the scheme allowlist are all real controls, correctly placed. Most of what follows is gaps in the framing or in the controls' actual coverage, not a missing awareness. Two findings are factual errors in the plan that, left as written, will mislead the build lane. One is a control that the plan names but routes to "a follow-up issue" while shipping the exact feature that makes it dangerous.

---

## Critical

### C1. The plan ships the highest-value PHI exposure path (remote raw-PTY broadcast) and defers the only mitigation to "a follow-up issue"

Section 3.6 ("Remote blast radius") and R-9 correctly identify it: the remote surface broadcasts raw PTY output (full live + scrollback of every Claude session: OD queries, patient data on screen, financial reports) to any synced client. Verified: `index.ts:82-83` forwards every `pty:data` to `webRemoteServer.broadcast`; `web-remote-server.ts:121-123` serializes each terminal's visible buffer on connect; `:253` snapshots all tabs. Guarded only by a 6-char token over a public Cloudflare quick tunnel (`tunnel-manager.ts:103`, `--url http://localhost:PORT`, ephemeral `*.trycloudflare.com`, no Cloudflare Access in front).

The plan's own thesis is that the dashboard "raises the value of cracking that token (a tidy cross-repo index of in-flight clinical/financial work)." That is exactly right, and it is the reason the mitigation cannot be a deferred follow-up. The dashboard is the feature that turns "an attacker who guesses the token sees whatever tab happens to be open" into "an attacker who guesses the token gets a curated map of every clinical and financial workstream plus one-click pivots into them." You do not get to ship the value-multiplier and file the control as a backlog issue.

This is the single biggest gap in the plan's posture: it is a place where the scrub-equivalent control (auth hardening) is policy ("Section 10 names this; a follow-up issue adds a bounded failed-auth limiter") rather than a control that ships with the feature.

Where: PLAN.md Section 3.6 bullet 3, R-9; `index.ts:82-83`, `web-remote-server.ts:115-129,253`, `web-remote-server.ts:56-58` (token), `tunnel-manager.ts:103`.

Minimal fix: make the remote-auth hardening a Phase-1 milestone gated alongside the dashboard, not a follow-up issue. Concretely: (a) widen the token to >= 16 chars from the same 31-char alphabet (31^16 keyspace, one-line change at `web-remote-server.ts:58`, the client already accepts any length since it echoes the issued token), and (b) add a bounded failed-auth counter in `handleWebSocketConnection` that refuses new connections from a source after N failures in a window. The 6-char token (31^6 ~= 8.87e8) over a tunnel with no connection-rate limit is crackable by a determined attacker; the dashboard is the reason to fix it now.

### C2. The token-strength claim is internally inconsistent and understates the brute-force exposure

PLAN.md 3.6 says "6-char/31-alphabet token (~8.8e8 keyspace) ... with NO auth-attempt rate limiter." Two corrections, both load-bearing for the C1 risk assessment:

1. The alphabet is `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` = 31 chars (verified `web-remote-server.ts:57`; I, O, 0, 1 excluded). 31^6 = 8.87e8. The number is right but the plan should stop calling this adequate by implication; 8.87e8 is a small keyspace for an internet-reachable endpoint.

2. "NO auth-attempt rate limiter" is imprecise and the imprecision cuts the wrong way for the risk write-up. There IS a per-connection control: each failed auth closes the socket (`web-remote-server.ts:260-264`) and an unauthenticated socket is force-closed after 10s (`:184-190`). So an attacker pays one TCP+WS handshake per guess. But there is NO limit on how many connections a source may open, no backoff, no lockout. Over a tunnel that survives the host's local firewall, an attacker can pipeline reconnect-and-guess. The real defect is "unbounded connection attempts," not "no rate limiter at all," and the fix (a failed-attempt counter keyed by source, refusing new sockets past a threshold) closes it.

Where: PLAN.md 3.6, R-9; `web-remote-server.ts:56-58,184-190,260-264`.

Minimal fix: state the keyspace honestly (8.87e8 = weak for a public endpoint), correct "no rate limiter" to "no connection-attempt bound," and pair both with the C1 milestone (wider token + connection-attempt bound). These are the same one-file change.

---

## High

### H1. FACTUAL ERROR: the remote `tab:create` path is reachable today and creates a real Claude PTY against `state.workspaceDir`; the plan treats "remote cwd discard" only as a correctness annoyance, missing that the dashboard makes it an injection-target

The plan (3.1 Remote parity, 3.5, 3.6) correctly notes that remote `tab:create` discards the resolved cwd and hardcodes `state.workspaceDir` (`web-remote-server.ts:316-323`), and correctly disables the Open-Claude-with-query action remotely for that reason. Good. But it frames this purely as "the canned query would run against the wrong tree." The deeper issue: `pty:write` is ALSO remote-enabled (`web-remote-server.ts:272-276`, bridge `ws-bridge.ts:283-285`) and is an unscrubbed passthrough to `ptyManager.write(tabId, data)` for ANY tabId the client knows. A remote client that has authed (see C1/C2) can:

1. `tab:create` to spawn a fresh Claude session at the workspace root, then
2. `pty:write` arbitrary bytes into it (or into any existing tab's PTY).

So the dashboard's "write-after-ready" mechanism (the PRIMARY query-injection path, R3) has a remote twin that needs no dashboard code at all and bypasses `composeClaudeQuery` entirely. The plan acknowledges this once, in passing, in 3.4 ("Raw `pty:write` ... is an unscrubbed passthrough a remote client can call directly. The canned-template default is the real dashboard guarantee"), then drops it. That sentence is the whole ballgame and it deserves to be a named residual risk, not a parenthetical: the choke point makes the dashboard's ACTION safe, but the channel it rides was already wide open remotely before the dashboard existed. The dashboard does not widen it, but the dashboard's whole premise (surface clinical/financial work, make it one-click actionable) raises what an attacker does with that pre-existing open channel.

Where: PLAN.md 3.4 (the dropped sentence), 3.6; `web-remote-server.ts:272-276`, `ws-bridge.ts:283-285`, `ipc-handlers.ts:736-738`.

Minimal fix: promote the "raw `pty:write` is an unscrubbed remote passthrough" point from a 3.4 aside to a named residual risk in Section 10, tied to C1 (auth hardening is the only thing standing between an authed-but-malicious remote client and arbitrary PTY writes). No code change to the dashboard, but the risk register must state plainly that the dashboard's injection-safety guarantee is local-only and the remote channel's safety depends entirely on the token.

### H2. `shell.openExternal` is called with NO scheme validation at three live sinks; the plan's "scheme-allowlist before openExternal" is correct but must name the existing handler it has to fix, not just the new render path

PLAN.md 3.6 ("Before any `url` from the feed becomes clickable/`openExternal`, allowlist the scheme (http/https only, never `file:`/`javascript:`)") is the right control. But it reads as if the allowlist lives in new dashboard code. The dangerous sink already exists and is shared: `shell:openExternal` IPC handler (`ipc-handlers.ts:783-784`) does a bare `shell.openExternal(url)` with zero validation, and the preload exposes it to the renderer (`preload.ts:112-113`). The remote bridge routes `openExternal` to `window.open(url, '_blank', 'noopener')` instead (`ws-bridge.ts:351-353`), so the local and remote paths differ. There are also two main-window handlers that call `shell.openExternal(url)` unconditionally (`index.ts:295`, `:303`).

If the dashboard renders a `url` from the program-board feed as a clickable link wired to `window.claudeTerminal.openExternal`, a poisoned `state.json` with `"url": "file:///C:/..."` or a `javascript:`/`ms-...`/`vscode:` scheme reaches `shell.openExternal` unfiltered LOCALLY. `shell.openExternal('file:///...')` opens local files/Explorer; other registered protocol handlers can be invoked. The plan's allowlist must be enforced at or before the IPC boundary the dashboard uses, and the cleanest place is the existing `shell:openExternal` handler (`ipc-handlers.ts:783`), which protects every caller (dashboard, Terminal link clicks at `Terminal.tsx:123`, UpdateButton), not just the dashboard.

Where: PLAN.md 3.6 (urls); `ipc-handlers.ts:783-784`, `preload.ts:112-113`, `index.ts:295,303`, `ws-bridge.ts:351-353`.

Minimal fix: add the http/https allowlist inside the `shell:openExternal` handler (`ipc-handlers.ts:783`) so it is a control at the boundary, not a convention each caller must remember. Cite this exact line in the plan as the enforcement point. File the pre-existing unguarded `setWindowOpenHandler`/`will-navigate` sinks (`index.ts:294-304`) as a follow-up since they predate the dashboard.

### H3. The capture channel is remote-enabled and writes attacker-influenceable text to a workspace file, with no validation specified for the remote handler

M12 / 1.3 / 3.5 ship the capture channel REMOTE-ENABLED (`WebRemoteServer.handleMessage` + real `ws-bridge.ts` send), appending raw text to `<workspaceRoot>/dashboard/todos.json`. This is the ONE new write-capable channel the dashboard exposes to the remote surface, and the plan specifies its happy path (append `{id, text, createdAt}`) but not its server-side validation. The existing remote handlers are a fair warning: `tab:rename` (`web-remote-server.ts:297-307`) takes `msg.name` and writes it straight into the tab model and persists it, no length or content bound. A new `case 'capture:append'` written in that style would:

1. Trust `msg.text` with no max length (a remote client can grow `todos.json` unbounded, a write-amplification / disk-fill vector on the PHI-adjacent work PC).
2. Write whatever bytes arrive into a JSON file the dashboard then renders in the hero/inbox. The plan says `detail`/free-text is "NEVER fed to composeClaudeQuery, NEVER logged" but the capture text is itself rendered, and capture is the path where a remote client (or a phone with a borrowed token) can plant arbitrary content that the local user then sees and may act on.

The plan is careful that the LOCAL injection path is canned-only, but it ships a remote WRITE path into the local render surface without a stated validation contract. Object permanence does not require trusting unbounded remote input.

Where: PLAN.md 1.3, M12 (Section 7), 3.5 last row; pattern precedent `web-remote-server.ts:297-307`.

Minimal fix: specify the remote `capture:append` handler's validation as part of M12: enforce `typeof msg.text === 'string'`, a max length (e.g. 2000 chars), reject control bytes, cap total items / file size, and atomic-write. Add a test asserting an over-length or non-string capture is rejected server-side. The capture text must never be eligible for the hero's primary action (it already is not, since `claudeQuery` is canned, but state it: captured text is display-only, never an action payload).

---

## Medium

### M1. The state-path validation control is described but never assigned to a milestone, so the "policy not control" trap applies to it too

PLAN.md 3.6 ("validate that the resolved `state.json` path is under the expected fixed local workspace root (reject UNC/remote/`..`)") and 4.3 ("Validate the resolved path is under the expected local root") are the right idea: a poisoned `PROGRAM_BOARD_WORKSPACE` env var could point the reader at attacker-chosen JSON whose `title`/`detail`/`url` render in the hero (and whose `url` reaches H2's sink). But this validation appears only in prose. M4 (the reader milestone) says "resolves+validates the path (3.6)" in one clause with no test for the validation. Verified there is no existing path-validation helper in `ipc-handlers.ts` to reuse (grep for `..`/`startsWith`/path-reject found only unrelated matches), so this is net-new code that the plan must test or it will be skipped under time pressure, exactly like the controls in C1/H1.

Where: PLAN.md 3.6, 4.3, M4; no existing validator in the worktree.

Minimal fix: add an explicit M4 test asserting (a) a `PROGRAM_BOARD_WORKSPACE` resolving outside the fixed root is rejected and (b) a `..`/UNC path is rejected, with the reader returning the "not running" empty state rather than reading the attacker path. Make the validator a named pure function in `src/shared/` so it is unit-testable without the filesystem.

### M2. The `127.0.0.1:5173/api/state` HTTP fallback is trusted as "same-schema" but the plan never bounds what a hostile local listener on that port could inject

PLAN.md 3.6 ("the `127.0.0.1:5173/api/state` HTTP fallback is an unauthenticated local endpoint, trusted only as a same-schema fallback") and 4.3 item 3 acknowledge the endpoint is unauthenticated. But the fallback fires when `state.json` does not exist yet (cold first run), and any local process can bind `127.0.0.1:5173` before the real program-board service does. The dashboard would then parse that process's JSON and render its `title`/`detail`/`url` in the hero. This is a lower-likelihood local-process-confusion vector, but it feeds the same render+`openExternal` sinks as M1, and the plan's "trusted only as a same-schema fallback" understates it: schema-validity is not trust.

Where: PLAN.md 3.6, 4.3 item 3; `web.py:33-35` (the real endpoint).

Minimal fix: run the HTTP fallback payload through the SAME mapper-with-scheme-allowlist as the file path (which the plan already implies via "same parser"), and explicitly state that the `url` scheme allowlist (H2) and any render-side escaping apply identically to the HTTP payload. No new code if H2's allowlist is at the IPC boundary; just state it covers this path.

### M3. The logger gate (M0b) is correct but the plan still under-bounds the disk co-mingling, and credits a wipe that does not protect a live session

PLAN.md 3.6 bullet 1 and 9.4 gate the DevTools mirror to warn/error (good, verified the mirror at `logger.ts:42-51` forwards ALL levels including debug to the renderer via `executeJavaScript`, zero redaction) and credit the per-run wipe (`logger.ts:67-69`) + 1MB cap as bounding disk exposure. Two caveats the plan should state:

1. The per-run wipe only fires at `logger.init` (process start). Within a long-running session (this app stays open for days), `main.log` accumulates up to 1MB of plaintext before rotation, and rotation keeps one `.1` file (`logger.ts:24-31`), so up to ~2MB of plaintext log persists on disk at any moment, readable by any process running as the user. The wipe protects across restarts, not during a session. For a PHI-adjacent box this is the relevant window.

2. The plan's own dashboard log lines (action-id + repo only) are clean, but the gate does nothing about the PRE-EXISTING prompt-prefix lines (`hook-router.ts:56`, `tab-namer.ts:74`, raw `prompt.substring(0,80)`) that already write user prompt content to this same plaintext file. The plan correctly files these as a follow-up and stops citing them as precedent. Keep that, but note the disk file is co-mingled PHI-capable TODAY independent of the dashboard, so the "1MB cap bounds exposure" framing should not read as "exposure is small."

Where: PLAN.md 3.6 bullet 1, 9.4; `logger.ts:14,24-31,33-40,42-51,67-69`, `hook-router.ts:56`, `tab-namer.ts:74`.

Minimal fix: in the risk write-up, state the live-session disk window honestly (up to ~2MB plaintext readable mid-session, wipe is restart-only), and confirm the M0b test asserts the gate also covers the renderer mirror's `executeJavaScript` call specifically (an attacker with a remote DevTools-equivalent view is the threat the mirror gate addresses; the test should assert debug/info do not reach `_window.webContents.executeJavaScript`).

### M4. `scrubFreeText` is correctly labeled harm-reduction, but its digit regex as written will not catch all the separated identifiers the plan claims, and there is no test because there is no caller

PLAN.md 3.4 proposes `\d[\d\s.\-/]{3,}\d` for separated identifiers and gives examples (phone `303-986-9337`, DOB `04/12/1985`). The regex is reasonable for those, but the plan also (correctly) concedes it "CANNOT redact the primary PHI for this practice (patient NAMES)." The honest framing is already there. The residual concern is process, not regex: because `scrubFreeText` "has no Phase-1 caller" and "ships DISABLED," it ships UNTESTED. The plan defers it to M19 (Phase 2, opt-in). That is defensible IF and ONLY IF the disabled state is enforced by something stronger than a comment. The `ClaudeQueryLine` branded type protects the injection write, but `scrubFreeText` would be wired into `composeClaudeQuery`'s free-text branch, which is the branch that ships disabled. If a future edit enables the free-text branch without a test, an untested scrubber becomes the only guard.

Where: PLAN.md 3.4, M19.

Minimal fix: even though the free-text path ships disabled, ship a unit test for `scrubFreeText` now (it is a pure function) asserting it redacts the plan's own example identifiers, so the day someone enables the path they inherit a tested (if imperfect) scrubber rather than dead untested code. And state explicitly that enabling the free-text branch is gated behind per-use confirmation in code, not just in prose.

---

## Low

### L1. Remote reconnect lands on `state.workspaceDir`-scoped tabs; the plan's "renderer-truth only" Home note is fine but should confirm no Home data crosses the wire

PLAN.md 2.1 and 3.5 correctly keep Home renderer-only and assert `program-board:state` is NOT remote-forwarded (M5 test). Verified the forward list in `sendToRenderer` (`index.ts:81-94`) is exactly `pty:data`, `tab:updated`, `tab:removed`, `pty:resized`, `tab:switched`, `tab:worktreeProgress`; adding `program-board:state` there would leak the cross-repo index over the wire. The M5 assertion (channel absent from the forward list) is the right control. Keep it; it is the one place the plan turns a remote-exposure decision into a test. No defect, noted as the model the C1/H1/M1 controls should follow.

Where: PLAN.md 2.4, 3.6, M5; `index.ts:81-94`.

### L2. `tab.name` forwarded remotely can carry AI-generated content derived from the first prompt

The plan (3.6 last bullet) asks to "confirm ... the live-tab feed forwarded remotely via `onTabUpdate` carries only `tab.name`, never raw PTY content." Confirmed: `tab:updated` broadcasts the tab object (`index.ts:84-85`), which includes `name`. But `tab.name` is AI-auto-named from the first prompt (`on-prompt-submit.js` -> `tab-namer.ts`), so the name itself can be a summary of clinical/financial work and IS forwarded to every synced remote client today. This is pre-existing and not dashboard-introduced, but the dashboard's session strip renders these names prominently, raising their visibility. Minor.

Where: PLAN.md 3.6; `index.ts:84-85`, `tab-namer.ts:74`.

Minimal fix: note in the risk register that forwarded `tab.name` is auto-summarized work content, so the remote auth hardening (C1) is what protects it; no dashboard code change.

---

## Summary

The plan's security architecture is sound where it ships controls: the `composeClaudeQuery` choke point, the `ClaudeQueryLine` branded type, the canned-template default, the M0b logger gate, and the M5 not-remote-forwarded assertion are all real, correctly placed, and testable. The pattern to fix is consistent: the plan repeatedly identifies the right control, then routes the highest-severity ones (remote auth hardening C1/C2, the raw-`pty:write` remote passthrough H1, the `openExternal` allowlist's actual enforcement point H2, the capture channel's remote validation H3, the state-path validator M1) to prose or "a follow-up issue" rather than to a Phase-1 milestone with a test. For an internal tool that is a reasonable bias in general, but the dashboard's entire premise (curate clinical/financial work, make it one-click actionable, expose it remotely) is precisely the thing that converts those deferred controls from "nice to have" into "ships the value-multiplier without the seatbelt." The minimal fix across C1/C2/H1 is one milestone: widen the token and bound connection attempts in `web-remote-server.ts`, and name the raw-`pty:write` channel as the residual the token now guards.
