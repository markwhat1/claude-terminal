# Adversary review (round 4): Security / privacy skeptic

Lens: hunt PHI/secret leak paths (argv, logger, DevTools mirror, remote client), remote exposure, and any place the scrub is policy not control.

Verdict up front: this is the most security-honest revision of the four. Every load-bearing leak claim I spot-checked against the `dashboard` checkout is accurate to the line: the logger writes into each opened repo's git tree (`logger.ts:60-64`, `init` called per-project at `ipc-handlers.ts:205,284`), the prompt-prefix lines log raw `substring(0,80)` (`hook-router.ts:56`, `tab-namer.ts:74`), the tab-namer ships `substring(0,500)` to Haiku (`tab-namer.ts:75`), the remote token is 6 chars over 31 (`web-remote-server.ts:57-58`), the forward chain is an explicit-case switch with no passthrough (`index.ts:80-98`), the two nav sinks call `shell.openExternal` with zero scheme check (`index.ts:294-305`), and the IPC `shell:openExternal` is a bare passthrough (`ipc-handlers.ts:783-784`). The choke-point design (branded `ClaudeQueryLine`, canned-only Phase-1 default, `composeClaudeQuery` as sole producer) is a real control, not policy.

So the defects below are NOT "you missed the leak." They are: (1) one control the plan asserts but does not actually constrain in code, (2) one leak path that already broadcasts PHI-derived data to remote that the plan files-but-under-scopes, (3) one new artifact whose protection rests on a gitignore in a DIFFERENT repo that the plan never names as a dependency, and (4) a couple of seams where the plan's own "scrub is harm-reduction not control" honesty should be promoted to a hard gate or a stated residual.

---

## CRITICAL

### S-1. `tabs:sync` / `tab:updated` already broadcast `cwd` + Haiku-summarized `name` to every remote client; the plan files the wrong half of this

`handleAuth` (`web-remote-server.ts:223-251`) sends the FULL `tabs:sync` payload (`getAllTabs()`) the instant a 6-char token validates, and `tab:updated` re-broadcasts the full `Tab` object on every status change (`index.ts:84-85`). The `Tab` interface (`types.ts:7-21`) carries `cwd` (absolute path, e.g. `C:\Users\Mark\Claude-Code\clinical-notes`, which by directory name reveals the kind of work) and `name` (the auto-generated tab title, which `tab-namer.ts:57` sets from the Haiku summary of the FIRST prompt, e.g. "Draft John Smith postop note" -> a 3-5 word title that can contain a patient name verbatim).

The plan's R-9 / R-11 / R-14 correctly file the PTY-scrollback exposure and the unbounded `tab:rename` write. But it frames `tab.name` only as "auto-summarized work content" written BY a remote rename. The larger, always-on exposure is that the host's OWN auto-named tabs (named from real prompts) broadcast their `name` and `cwd` to any authed remote client, with no scrub, today. This is a standing PHI-to-remote path that the dashboard makes worse (its whole purpose is to drive more sessions = more auto-named tabs), and it is exploitable with the same weak token over the same public quick tunnel as R-9.

Why CRITICAL and not just folded into R-9: R-9 is scoped as "PTY scrollback" and its fix is tunnel posture + token width. Even with a strong token and a named tunnel + Access, an authorized remote viewer (the intended remote-access user, on a phone over coffee-shop wifi, or anyone who shoulder-surfs the phone) sees patient names in tab titles. That is a data-minimization defect in the payload, orthogonal to the auth defect.

Minimal fix: name it as its own residual (call it R-9b) and, in the filed remote-security issue, add one concrete payload-minimization recommendation: when remote is active, send `defaultName` (the non-summarized fallback) or a redacted title over the wire instead of the Haiku `name`, and consider omitting absolute `cwd` (send `projectId` only) from `tabs:sync`. This is a few lines in the `tabs:sync`/`tab:updated` broadcast builders, independent of the dashboard. At minimum the plan must STATE that authed-remote tab titles can carry patient names today, not only that scrollback can.

---

## HIGH

### S-2. The `closed.json` / `todos.json` protection rests on the WORKSPACE repo's gitignore, a different repo than the app, and the plan never names that dependency

The plan moves the LOGGER out of git trees (M0b, correct) but then introduces NEW app-written artifacts, `<workspaceRoot>/dashboard/closed.json` (Phase 1, 1.5/M4) and `dashboard/todos.json` (Phase 2, M12), written into `C:\Users\Mark\Claude-Code\dashboard\`. I verified that directory IS inside a git work tree (`git rev-parse --is-inside-work-tree` -> true) and that the workspace `.gitignore` rule `/dashboard/*` (line 98, with only `programs/*.yml` re-included) DOES currently ignore `dashboard/closed.json` and `dashboard/todos.json` (`git check-ignore` confirms both). So today the leak does not fire.

But this is the exact "scrub is policy not control" pattern the lens is for, transplanted to a different file. The protection lives in a `.gitignore` in the `markwhat1/practice-analytics`-adjacent WORKSPACE repo, which is NOT the ClaudeTerminal app repo, is edited by unrelated work, and is invisible to anyone reviewing the dashboard PR. One future edit to that gitignore (e.g. someone adds `!/dashboard/state.json` to track a snapshot, or restructures the rule) silently starts committing `todos.json` (free-text phone captures, the highest-PHI-risk artifact in the whole plan: raw text Mark types on his phone, explicitly DISPLAY-ONLY and never scrubbed) to a pushed repo. The plan's own M0b logic ("the real fix is move it OUT of the tree, gitignore is belt-and-suspenders") applies verbatim here and is not applied.

Worse for `todos.json` specifically: it is the one artifact holding UN-scrubbed user free text (the capture text, 3.3/8). `closed.json` is just `{id, closedAt}` (low risk). `todos.json` is the high-risk one and it is placed in a git tree.

Minimal fix: write `closed.json` and `todos.json` to `app.getPath('userData')` (the SAME directory the plan just moved the log to in M0b), not into the workspace git tree. The plan already establishes `userData` as the safe data dir for MAIN-owned app state; use it consistently. If they MUST live next to `state.json` for the poller-adjacency story, the plan must (a) state the gitignore dependency explicitly as a control, (b) add an app-repo-level assertion or a startup check that the path is ignored, and (c) treat `todos.json` placement as a sign-off item for Mark. Do not let the highest-PHI artifact's safety rest on an un-named gitignore in another repo.

### S-3. The DevTools mirror gate (M0b) is undercut by an always-on `Ctrl+Shift+I` DevTools toggle, so "debug/info no longer reach the renderer console" is not the privacy boundary it reads as

M0b gates the `executeJavaScript` mirror to warn/error (`logger.ts:44-50`) so debug/info (which carry the redacted-but-still-prompt-adjacent lines) stop hitting the renderer console. Good. But `index.ts:307-309` wires `before-input-event` so `Ctrl+Shift+I` ALWAYS opens DevTools (verified), and the file-write path (`writeToFile`, `:43`) stays unconditional by design, writing debug/info to disk. So after M0b: the sensitive lines still hit disk, and DevTools is still one chord away. The mirror gate reduces accidental shoulder-surf exposure (debug spam in an already-open console) but it is NOT a containment boundary for someone with the keyboard.

This matters because S-3 interacts with M0b's redaction promise: the gate is sold in the DoD as "debug/info no longer reach the renderer console." That is true for the live mirror but false for a user who hits the chord (DevTools console does not replay disk, so this is narrow) and irrelevant to disk. The real control for the prompt-prefix lines is the REDACTION (id-only / `scrubFreeText`), not the mirror gate. The plan does specify the redaction, so the control exists, but the framing over-credits the mirror gate.

Minimal fix: in M0b's DoD, state plainly that the redaction (not the mirror gate) is the control for the prompt-prefix PHI, and that the mirror gate is dev-noise reduction only. Optionally gate the `Ctrl+Shift+I` DevTools toggle to dev builds (`MAIN_WINDOW_VITE_DEV_SERVER_URL` present), since a production app that mirrors warn/error to a one-chord console is still a casual-exposure path for any error line that happens to interpolate state. Low effort, removes the "gate implies containment" ambiguity.

### S-4. `scrubFreeText`'s digit rule, as specified, over-redacts repo paths and the plan's own canned payloads, and the plan ships it (M0b route) without testing that false-positive

3.4 / M0c specify `\d[\d\s.\-/]{3,}\d` to catch separated identifiers (phone `303-986-9337`, DOB `04/12/1985`). That regex also matches ordinary path/version fragments: `claude-terminal-dashboard` contains no digits so it survives, but `od-updater`-style `2026-06-22` dates, `127.0.0.1`, `v1.2.3`, and any path with a numeric segment (`C:\...\round2`, `:316-323`) get clobbered. The plan routes the prompt-prefix redaction through `scrubFreeText` as an OPTION in M0b (669-671), and `composeClaudeQuery`'s `draftFirstVersion` slot is filled from "slug/name + fixed kind label" where a slug like `practice-reports` is fine but a date-bearing or numeric program name would be mangled.

This is not a leak, it is the inverse, but it is a control-quality defect: a scrubber that mangles its own safe inputs trains the user/dev to see it as broken and route around it, and it gives false confidence that "the scrubber ran" when it actually destroyed legitimate text. The plan calls the scrubber "harm-reduction not a control" (good honesty) but then proposes using it on the redaction path without a false-positive test.

Minimal fix: M0c's test set MUST include negative cases (a clean repo path with a numeric segment, an ISO date, `127.0.0.1`, a `:line-line` citation) that the scrubber leaves UNTOUCHED, alongside the positive identifier cases. If those fail, the regex needs a word-boundary / min-length refinement before it is wired to any caller. And the M0b prompt-prefix redaction should default to id-ONLY (the plan's first option), not the scrubber, precisely because id-only has no false-positive surface. State id-only as the chosen route, scrubber as the rejected one for this line.

---

## MEDIUM

### S-5. `program-board:getState` (the request/response half) gets no stated remote decision; only the broadcast is asserted not-forwarded

M5 / 2.4 rigorously prove the `program-board:state` BROADCAST is not remote-forwarded (the exported `REMOTE_FORWARDED_CHANNELS` absence test, a genuinely good control). But the channel pair also includes `program-board:getState`, an `ipcMain.handle` request/response. The remote dispatch (`web-remote-server.ts:handleMessage`) is a switch over `msg.type` with explicit cases and NO default passthrough (verified, so an unknown `msg.type:'program-board:getState'` is silently dropped today). So the request/response is NOT remotely reachable in practice. But the plan asserts the absence-test for the broadcast only; it never states that the REQUEST channel is also local-only and why (the switch has no passthrough). A future refactor that adds a generic IPC-bridge case to `handleMessage` (a plausible "let remote call any handler" convenience) would expose `getState` and ship the cross-repo work digest to remote, with the broadcast absence-test still green.

Minimal fix: one row in the remote-parity table (3.5) and one line in M5's DoD stating `program-board:getState` is local-only because `handleMessage` has no generic-handler passthrough, and that this is a load-bearing invariant. Optionally add a test asserting `handleMessage` rejects an unknown `msg.type` (pins the no-passthrough property so a future generic bridge breaks the test, not the privacy boundary).

### S-6. The path validator `isStateJsonPathSafe` protects the READ path but the cold-start HTTP fallback to `127.0.0.1:5173` is trust-by-schema, deferred, and re-enters under-specified

3.6 / 4.3 correctly note the HTTP fallback port is unauthenticated and any local process can bind it first (a real local-spoofing seam), and defer the fallback as a follow-up carrying "the same scheme-allowlist + path-class trust rules." But the deferral means the trust argument is written for code that is not built, and the spec for it ("schema-validity is not trust") names the problem without naming the control. A schema-valid response from a squatting local process can inject attacker-chosen `url` fields (then routed through `openExternal`) and attacker-chosen `title`/`detail` (rendered in the hero). The scheme allowlist (M0b) covers the `url`, good. But there is no integrity control on the FEED itself if it comes from the HTTP port.

This is MEDIUM because the fallback is deferred and an always-on nssm poller means `state.json` almost always exists first (the plan's own argument). But "deferred + under-specified trust boundary" is exactly how a leak ships later under time pressure.

Minimal fix: when the HTTP fallback is eventually built, restrict it to the case where `state.json` has NEVER existed (not a general fallback), and state that the file path is authoritative the instant the poller writes once (the plan says this for freshness; say it for TRUST too). Better: drop the HTTP fallback entirely and show the "not running" state on a cold first run (the plan already leans this way in 4.3.3); a one-cycle cold window on an always-on service does not justify a second, lower-trust ingestion path. Recommend the cut explicitly.

### S-7. The branded `ClaudeQueryLine` type is the right control but does nothing about the raw `pty:write` preload method the renderer still holds

3.6 makes `composeClaudeQuery` the sole producer of `ClaudeQueryLine` and types the injection write to accept only that brand, blocking `writeToPty(tab.id, rawString)` for injection at compile time. Real control, good. But the renderer retains the un-branded `writeToPty(tabId, data: string)` preload method (`preload.ts:50-51`) for the legitimate terminal-typing path. A future HomeView affordance ("send this detail to the active session") can call `writeToPty` directly with `item.detail` and never touch `composeClaudeQuery` or the brand. The brand protects the INJECTION call site; it does not protect the CHANNEL, which the plan acknowledges for REMOTE (R-11) but not for the LOCAL renderer's own future code.

Minimal fix: state in 3.6 that the brand constrains the dashboard's injection call site only, and that `DashboardItem.detail` reaching `writeToPty` directly remains a possible local regression a brand cannot stop; the mitigation is the existing "M0b unit asserts the mapper never passes detail/blocked_on to log.*" should be EXTENDED to assert HomeView never passes `detail`/`blocked_on`/`dod.gaps` to `writeToPty` either. One more assertion, closes the local analogue of R-11.

---

## LOW

### S-8. `tab.cwd` over the remote wire reveals the avoidance-area map even with everything else fixed

Even after S-1's title redaction, broadcasting absolute `cwd` (`tabs:sync`) tells a remote viewer exactly which repos are open (cad-portal, clinical-notes, marketing-roi). For an app whose differentiated value is "surface avoidance areas," the set of open trees IS sensitive metadata (it reveals what Mark is and isn't working on). Low because it is metadata, not content, and the remote user is nominally Mark. Fold into S-1's payload-minimization recommendation (send `projectId` not absolute `cwd`).

### S-9. The 10s unauth-window + no connection-attempt bound lets an attacker brute the 8.87e8 keyspace over the public tunnel without lockout

The plan states the keyspace honestly (31^6) and files token-widening as recommendation #3 behind tunnel posture. Verified: `handleWebSocketConnection` closes unauthed sockets after 10s (`:184-190`) but there is no per-IP / global failed-attempt bound, so an attacker reconnects freely. At 8.87e8 keys this is not instantly brute-forceable over a network round-trip, but combined with the public-by-URL tunnel it is a standing online-guessing surface. The plan's filed-issue recommendation #3 already includes "a bounded failed-auth/connection-attempt counter," so this is COVERED, but it sits last behind two other recommendations. Given S-1 (the payload includes patient names), I'd raise the connection-attempt bound from "recommendation #3" to "do this one-liner now even before the tunnel fix," since it is independent and cheap. Note in R-9.
