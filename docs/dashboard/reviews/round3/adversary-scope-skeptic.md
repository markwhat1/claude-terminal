# Adversary review: Scope / YAGNI skeptic

Reviewer lens: is this secretly two products fused? over-engineered? will Phase 1 actually ship and be testable? Attack untestable claims and scope creep. Default to finding real defects.

Plan reviewed: `docs/dashboard/PLAN.md` (round 3 revision, 820 lines), against the `dashboard` worktree at HEAD `ce2e9e0`.

## Verdict up front

The plan's file:line discipline is genuinely strong. Every anchor I spot-checked resolves: `updateStatus` is a flat setter (`tab-manager.ts:55-58`), the token is 6 chars over the 31-alphabet (`web-remote-server.ts:57-58`), the logger mirrors every level (`logger.ts:42-51`), `onTabRemoved` has the two null returns (`App.tsx:373,375`), the render seam iterates `tabs` only inside `data-terminal-area` (`App.tsx:576-583`), the three startup `setActiveTabId` sites exist (`:310,:334,:517`), and the ui primitives card/skeleton/tooltip are genuinely absent. The verification appendix is not decorative. Credit where due.

But the lens question is not "are the citations accurate." It is "is the SCOPE honest, and will Phase 1 actually ship." On that axis the plan has real problems. The round-3 narrative claims it "prunes the carrots back to one thing" and "re-cuts the phases so each one ships and gets used before the next is built." The milestone ledger does not back that claim. Phase 1 is ~16 named milestones / ~20 rollback points spanning new IPC plumbing, a file-watcher subsystem, two security hardening milestones for pre-existing CVE-class holes, a scrubber, a branded type system, and a settings-persistence feature, before a single line of Home UI is dogfooded. That is not a thin first slice. It is the whole product minus the coaching layer, relabeled "Phase 1."

The two-products-fused risk is real but inverted from the obvious read. It is not "dashboard + program-board fused" (that seam is cleanly drawn: the app consumes `state.json`, owns no producer code). It is "dashboard + a security/hardening project fused," and "Phase 1 + a motivational-design product fused under the MVP label." Details below.

---

## Defects

### D1 (HIGH) Phase 1 is not an MVP; it is the whole product minus coaching, mislabeled

Section 7 lists Phase 1a as M0, M0b, M0c, M1, M2, M3, M4, M5, C1, M7, M7b, M8a and Phase 1b as M8b, M9, M10, M14. Counting M3 (a/b) and M14 (a/b/c) splits, that is ~20 rollback points before "Phase 1 ships after M14" (line 665). The round-3 thesis (lines 20-24) sells this as the lesson learned from round 2 being "too busy": each phase "ships and is used before the next is built."

But nothing in Phase 1 is dogfoodable until M8a (the 12th milestone), and the genuinely usable product (live strip + the three actions, which is what makes this a *terminal* dashboard rather than a static board viewer) does not exist until M9/M10 deep in Phase 1b. So the "ships and gets used before the next is built" promise is satisfied exactly once, between M8a and M8b, and only for a read-only board-viewer that overlaps heavily with the program-board web UI the user already has running at `:5173`.

Where it fails: a reader budgeting work or sequencing a session will believe "Phase 1" is the small first slice and "Phase 2/3" is the bulk. The truth is the reverse: Phase 1 is the bulk, Phase 2/3 are thin increments on top. The phase labels misdirect the effort estimate.

Minimal fix: rename the cut. Make the true MVP "Phase 0: read-only board paint" = M0, M0c (scrubber-is-pure-noop), M1, M3a, M4, M5, M7, M7b, M8a, plus M0b and C1 ONLY if D2/D3 are upheld. Everything from M8b onward (payoff, strip, actions, startupView) is "Phase 1: the interactive dashboard." Then the claim "each phase ships and gets used first" becomes true instead of aspirational. This is a documentation/sequencing fix, not new code.

### D2 (HIGH) C1 (remote auth hardening) is a different project smuggled into Phase 1

C1 (lines 300, 602-607) widens the remote WebSocket token from 6 to >=16 chars and adds a connection-attempt bound. The plan's justification (line 300): "the dashboard is precisely what raises the value of cracking the token."

This is scope creep dressed as a dependency. The weak token (`web-remote-server.ts:57-58`, verified 31^6 = 8.87e8) is a pre-existing hole in the SHIPPED remote-access feature. It is exploitable today, with zero dashboard code, because the remote surface already broadcasts full PTY scrollback of every Claude session (the plan says so itself, R-9/R-11). The dashboard does not touch `web-remote-server.ts` token generation, does not add a remote broadcast (M5 explicitly asserts `program-board:state` is NOT remote-forwarded), and Home is desktop-only in Phase 1 (2.9). So the dashboard's marginal contribution to the token's crack-value is the value of *one more local-only JSON feed that never crosses the wire*. That is approximately zero.

The "raises the value" argument is a rationalization that would justify pulling ANY security fix in the repo into ANY feature plan. By that logic every feature plan should also fix the `--plan` bug, the unguarded `openExternal` sinks, and the unbounded `tab:rename`. The plan correctly defers those (9.1, 3.6 "file a follow-up") but does not apply the same discipline to C1.

Where it fails: C1 is a real and worthy fix, but bolting it onto the dashboard's critical path means the dashboard cannot ship until a remote-access security change lands and is verified, coupling two unrelated risk surfaces and two unrelated rollback stories. If C1's connection-attempt counter has a bug, it can block or delay a dashboard that never used the remote channel.

Minimal fix: cut C1 from Phase 1. File it as its own security issue/PR against the remote-access feature with its own review, exactly as 9.1 does for `--plan`. The dashboard's actual remote posture (desktop-only, no new broadcast, asserted in M5) is already safe without it. If the user wants the token widened, that is a one-line change they can ship independently this afternoon; it does not need to ride the dashboard.

### D3 (MEDIUM) M0b (logger gate) is also a pre-existing-hole fix coupled to the dashboard, on weaker footing than C1

M0b (lines 301, 547-553) gates the DevTools log mirror to warn/error. Verified the leak is real: `logger.ts:42-51` mirrors every level including debug to the renderer console with zero redaction.

The dashboard-specific half of M0b is legitimate: a NAMED unit asserting `composeClaudeQuery` and the item mapper never pass `title`/`detail`/`blocked_on`/`dod.gaps`/tab-name to `log.*`. That is the dashboard owning its own log hygiene, and it belongs in Phase 1 (it goes live the instant M8a renders real feed text). Keep that.

But gating the *global* logger's mirror behavior (changing `logger.ts` so debug/info no longer reach DevTools for the WHOLE app) is, like C1, a fix to a pre-existing leak in shared infrastructure. The plan even admits (line 301) the truly dangerous pre-existing lines (`hook-router.ts:56`, `tab-namer.ts:74` raw prompt prefixes) are deferred to a follow-up issue. So M0b half-fixes a shared subsystem: it changes the global mirror policy but leaves the worst global leakers in place. That is an awkward middle: it touches shared code (incurring the regression-test and review cost of a cross-cutting change) without closing the actual PHI exposure it cites as motivation.

Where it fails: M0b changes app-wide logging behavior to protect a dashboard that has not been written yet, while the named worst-case leakers stay. The dashboard's own guarantee (never log free text) is fully achievable with ONLY the named-unit half plus a one-line policy in the dashboard's own log calls.

Minimal fix: split M0b. Keep the dashboard-owned named unit (mapper/compose never log free text) in Phase 1. Move the global `logger.ts` mirror-gate into the same deferred security issue as the `hook-router.ts:56` / `tab-namer.ts:74` lines, so the shared-logger change lands once, coherently, with all leakers addressed together, under its own review. The dashboard does not need the global gate to keep its own lines clean.

### D4 (MEDIUM) The motivational layer is still over-built relative to "one carrot," contradicting the round-3 thesis

Round 3's stated correction (line 34): "ONE carrot is first-class in Phase 1 (the done-lane payoff)." Good intention. But Phase 1 as specified ships materially more than one motivational mechanism:

- the done-lane payoff + `justResolved` settle beat with reduced-motion handling (1.5, M8b)
- the goal-gradient / endowed-progress "N of M done, last step" (1.10, M8a)
- the single-field hero override so the hero is not "newest commit" (1.11, M8a)
- the caught-up "Clear. Keep working." + "Pull one forward?" pull-forward (4.6, M8b)
- the empty-board live-tab hero-eligibility (4.6, M8b)
- the idle-age floor so "N need you" stays meaningful (5.2, M9)
- the saturation-capped hero age band (1.4, M8b)

That is seven distinct ADHD-design behaviors in Phase 1, each with its own copy, test, and edge cases. The plan calls 1.10 and 1.11 "cheap" because they reuse consumed data, which is true for the data but not for the design surface, the copy module entries, the tests, or the review burden. "One carrot" became "one carrot plus six supporting motivational behaviors." Section 1's own framing (line 34) admits the calm layer and goal-gradient "carry the motivational weight in Phase 1," which concedes the weight did not actually move to Phase 2/3; it was renamed from "carrot" to "calm layer."

Where it fails: the round-3 pruning is partly cosmetic. The interaction surface that round 2 was criticized for is mostly still in Phase 1, reclassified rather than removed. A builder following the milestones builds nearly the round-2 motivational scope.

Minimal fix: be honest in the phase narrative. Either (a) accept that Phase 1 ships a full calm-motivational board and stop claiming "one carrot," or (b) actually defer 1.4 (capped hero band), 1.5 (settle beat), and 4.6 (pull-forward + empty-board hero) to Phase 2 and ship Phase 1 as a literally-just-the-board-and-goal-gradient slice. The plan cannot both claim restraint and ship seven behaviors. Pick one.

### D5 (MEDIUM) M4's program-board reader is over-engineered for a 60s-cadence single-writer source

M4 (lines 588-593) builds: a ~20s poll, a read-with-retry (3x with 100ms backoff on ENOENT/EBUSY/parse-fail), last-good retention, an OPTIONAL re-arming directory watcher, AND a cold-file HTTP fallback with an AbortController timeout. The plan itself argues (line 367) that the watcher "chases latency the source does not have" and is "added only if dogfooding shows lag" (line 370).

So by the plan's own reasoning the watcher is YAGNI for Phase 1, yet M4's change list and test surface include it ("optionally arms a re-arming directory watcher," and M4's test asserts "a watch event with `filename:null` still yields fresh state"). You cannot both defer the watcher to "only if dogfooding shows lag" AND make it part of M4's shipped change and DoD test. One of those is wrong.

The HTTP fallback is similarly thin-value: it only fires on cold first run before `state.json` exists (line 375), a window of one 60s cycle on a service the user runs as an always-on nssm service (per the workspace CLAUDE.md, program-board is "Always-on ... nssm service"). For an always-on producer the file effectively always exists. The fallback adds an AbortController, a second parse path, a second trust-boundary argument (3.6 port-binding), and a test, to cover a one-minute cold-start edge that may never occur in practice.

Where it fails: M4 is sold as one milestone ("one change, one rollback point," line 529) but is actually four subsystems (poll, retry+last-good, watcher, HTTP fallback) with at least eight distinct test assertions (line 591). That violates the plan's own "boringly small" milestone rule and inflates Phase 1.

Minimal fix: M4 ships ONLY poll + read-with-retry + last-good. Drop the watcher entirely from Phase 1 (the plan already says it is optional and unneeded at 60s cadence; honor that by not coding or testing it). Drop the cold-file HTTP fallback to a Phase-2 "if cold-start lag is observed" follow-up; on a missing file Phase 1 simply shows the "not running" empty state (which the plan already builds), which is correct and informative for an always-on service that is genuinely down. This cuts M4 from four subsystems and ~8 assertions to two subsystems and ~4, and removes the self-contradiction.

### D6 (MEDIUM) "Dogfoodable / used before the next is built" is asserted, not made falsifiable

The spine claim of the re-cut (lines 20-24, 535) is that each phase "ships and gets used" before the next. Every milestone DoD is a green vitest test plus a structural observable (line 531), which is rigorous for code correctness. But there is NO milestone, gate, or acceptance criterion that operationalizes "got used." Phase 2 is described as "gated on Phase-1 real use" (line 537, 671) with no definition of what "real use" is measured as, who decides, or what signal unblocks Phase 2.

This is the central untestable claim of the plan. "Gated on real use" with no metric is a phase boundary that cannot be evaluated, so in practice the builder rolls straight from M14 into M6 because nothing stops them. The round-2 failure the plan is reacting to (too much built before it was validated) recurs unless the gate is concrete.

Where it fails: the entire phase discipline rests on a gate that has no falsifiable definition. Compare to the per-milestone DoDs, which are scrupulously falsifiable. The phase gate is held to a lower standard than the milestones inside it.

Minimal fix: define the Phase-1-to-2 gate in one sentence with a checkable condition. For example: "Phase 2 does not start until the user has run Phase 1 as their default landing for >=N days (`startupView:'home'`) AND has named at least one concrete friction (a wanted item the board could not surface, or a ranker complaint) that a Phase-2 milestone addresses." That converts "gated on real use" from a vibe into a precondition a session can check before opening M6.

### D7 (LOW) M0c ships a scrubber with no caller, justified by a path that is itself deferred to Phase 3

M0c (lines 554-559) adds `scrubFreeText()` as a tested pure function with "NO enabled Phase-1 caller." Its only consumer is the opt-in free-text query path, which 3.4 and 8.8 (M19) defer to Phase 3, default OFF, "only if separately scheduled and confirmed."

So Phase 1 ships tested code whose sole purpose is to feed a Phase-3 feature that the plan itself flags as "may never be enabled." The justification (line 558) is "a future opt-in path inherits a tested scrubber, not dead code." But a tested function with no caller IS dead code; the test proves the function does what it says, not that anything needs it. Building and testing it now, two phases ahead of its only consumer, is textbook YAGNI.

Where it fails: it is small (one function, one test), so the cost is low, but it is a clean example of the plan's pattern of pulling future-phase work into Phase 1 under a "ship it tested now" rationale. The same rationale, applied consistently, is how Phase 1 bloated to 20 milestones.

Minimal fix: move M0c to sit immediately before M19 in Phase 3, where its caller is. The PHI guarantee in Phase 1 is the canned-template default with zero free text (3.4), which needs no scrubber at all. Shipping the scrubber early protects nothing in Phase 1.

### D8 (LOW) M14 (startupView setting + picker + 3 call-site branches) is a settings-persistence feature riding the dashboard

M14 (lines 651-664) is split into three rollback points: a `StoreData` key + DEFAULTS + getter/setter (M14a), a `resolveStartupActiveId` helper wired at three call sites (M14b), and a SettingsDialog picker (M14c). This is a complete settings-persistence feature with UI.

It is in Phase 1b. But "land on Home vs last session" is meaningless until Home exists and the user has decided they want it as their default, which by D6's own logic is exactly the kind of decision that should follow "real use," not precede it. Shipping the durable opt-in setting AND the picker UI in Phase 1, before anyone has used Home enough to want it as the default, is premature. The default is `'lastSession'` (no behavior change), so in Phase 1 the entire M14 stack is invisible until the user toggles a picker for a surface they just met.

Where it fails: three rollback points of settings plumbing for a preference that cannot be informed until after Phase 1 has been used. It inflates the "Phase 1 ships first" count for zero Phase-1-visible value.

Minimal fix: ship Home as openable (a tab/affordance) in Phase 1, but defer the persisted `startupView` setting + picker (all of M14) to the start of Phase 2, alongside the "real use" gate (D6). Then the setting lands exactly when the user has the experience to choose it, and Phase 1 loses three rollback points it did not need.

### D9 (LOW) The plan document itself is a scope-of-prose problem

At 820 lines with 10 sections, sub-numbered to four levels (e.g. 1.11, 5.3, 8.5), cross-referencing R-docs R1-R6 and E-lanes E1-E7, this is a specification that has grown past the point where one person holds it in their head. The workspace CLAUDE.md rule is explicit: "If a plan won't fit in your head, it's too big. Break it into smaller chunks." This plan does not fit in one head; the sheer density is itself evidence of the scope problem the other defects describe. A builder cannot verify the plan is internally consistent (e.g., that M4's watcher claim and line 370's "optional, only if lag" claim agree, which they do not, per D5) without a multi-pass read.

Where it fails: the document's size correlates with the over-scoping. A genuinely thin MVP plan would be short.

Minimal fix: extract the Phase-2/Phase-3 specification (Sections 8, most of Section 1's Phase-2/3 sub-bullets, the deferred halves of Section 5) into a separate `PLAN-PHASE-2-3.md`. Keep the Phase-1 plan to the slice that actually ships first. This is the same "decompose to fit" the workspace standard requires and would make D1's mislabeling self-evident.

---

## What is NOT a defect (to preempt the obvious counterarguments)

- The program-board seam is clean. The app consumes `state.json` and owns no producer code; every producer citation carries the `src/program_board/` prefix; the "consume verbatim, never re-derive" discipline (4.4) is correct and well-defended. This is NOT the two-products-fused failure.
- The desktop-only Home decision (2.9) is a genuine scope cut, correctly made, and the remote-parity table honestly disables what does not work. Good.
- The `rankItems` deferral to Phase 2 (Section 5 "Phase split (YAGNI)") is the one place the plan applies real YAGNI discipline: Phase 1 uses a few-line single-field override instead of the tiered engine. That is exactly right and should be the model for the rest of the cut.
- The file:line accuracy is real. I verified ~10 anchors; all held. Untestable-claim attacks here would be unfounded.

## Summary

The plan is technically excellent and scope-dishonest in the same breath. Its one real YAGNI win (deferring `rankItems`) proves the team CAN cut; the problem is they cut once and then pulled two pre-existing security fixes (C1, half of M0b), a four-subsystem reader (M4), a Phase-3 scrubber (M0c), a settings feature (M14), and seven motivational behaviors into a "Phase 1" that is the whole product minus coaching. The single highest-leverage fix is D1 + D6 together: relabel the phases to match reality and make the inter-phase gate falsifiable. Do that and the over-scoping becomes visible and self-correcting; leave it and "Phase 1 ships and gets used first" stays a claim the milestone ledger contradicts.
