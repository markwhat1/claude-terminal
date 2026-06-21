# Advisor review (round 4): Product / PM lens

Plan reviewed: `docs/dashboard/PLAN.md` + `docs/dashboard/PLAN-PHASE-2-3.md` (dashboard worktree, branch `dashboard`, HEAD `ce2e9e0`, verified live).
Lens: Phase 0/1/2 split, the MVP cut that ships value early, boringly-small milestones with DoD + rollback, the vitest test plan.

Verdict: round 4 closed round 3 cleanly and then some. Every round-3 must-fix landed: the MVP no longer ships a copy-only hero (reframe-as-review is in Phase 1 / M10, A1), the Phase gate is now an observable with a named decider and a kill criterion (A2), Phase 0 is a dependency graph not a flat list (A3), the resolved-set moved into M4's reader with reset-at-construction (A4), and the floating `notifyOnIdle` demotion became M14d (B5). The extraction of Phase 2/3 into a sibling file is the right "decompose to fit" move. Current score on this lens: about 8.8/10.

What stands between here and 9/10 is no longer direction or grounding. It is a small set of seams that the round-4 re-cut opened and did not quite close: the gate's two conditions reference a `startupView` setting that the plan's own YAGNI call ships AFTER the gate window starts, so the gate is unmeasurable as written; the Phase 0 -> Phase 1 boundary lost its own ship line and acceptance sentence when the cut went from 1a/1b to 0/1; the milestone-ID-vs-run-order hazard the round-3 review named (B3) is unaddressed and got worse with M14d inserted out of numeric order; and a few falsifiable-DoD gaps remain in the milestones the re-cut touched. All are editing-pass fixes on the "What round 4 changes" preamble and Section 7.

What I re-verified against source this round:
- Branch/HEAD `dashboard` / `ce2e9e0`. Confirmed.
- `package.json`: `pnpm run test` is `vitest run`; `vitest.config.ts` is jsdom + globals, aliases `@shared`/`@main`/`@`, excludes worktrees. The plan's test conventions (vitest, test-first for logic, tests mirror `src/`) match.
- `settings-store.ts`: `StoreData` and `DEFAULTS` are the three-key shape the plan cites; getters/setters (`getDefaultShell`/`setDefaultShell`) are `async` returning `Promise<void>` (M14a's "mirroring" inherits async correctly). `SettingsDialog.tsx` exists (M14c's picker target is real).
- No existing test mounts `App.tsx` (M0's shared mock premise holds). `tests/renderer/TabIndicator.test.tsx`-class tests are prop-only.
- `PLAN-PHASE-2-3.md` exists and inherits authority/constraints; its milestone list (M14a/b/c, M6, M11, M12, M13 / M15-M19 + M0c) matches the Phase index in PLAN.md Section 7/8.

The rest of this review uses the plan's own section and milestone IDs.

---

## A. Must-fix (defects in the phase split and milestone plan, the thing this lens grades)

### A1. The Phase gate's two conditions are unmeasurable because both depend on `startupView`, which the plan ships at the START of Phase 2, not before the gate

This is the top PM defect in round 4 and it is a circular dependency the plan does not see.

The gate (preamble "The Phase gate") requires, to OPEN Phase 2: "(1) Mark has run Phase 1 as the default landing surface (`startupView:'home'`) for at least 5 working days, AND (2) Mark has named at least one concrete friction that a specific Phase-2 milestone addresses." The kill criterion is "if after that window Mark is avoiding Home (reverts `startupView` to `'lastSession'`, or stops opening the app)."

But the plan ALSO defers `startupView` entirely to Phase 2: M14a/b/c "DEFERRED to the start of Phase 2" (Section 7), and "Phase 2 milestones: M14a/b/c (`startupView` persistence + picker, deferred here from Phase 1)" (Section 8). Both conditions and the kill criterion are written in terms of a setting that does not exist until the phase the gate is supposed to authorize. In Phase 1 there is no `startupView:'home'` to set and none to revert; Home is OPENABLE (the synthetic slot + render seam, M3a) but the default landing is hardcoded `'lastSession'`. So the gate as written can never be satisfied or falsified during the Phase-1 window it governs.

The two correct fixes (pick one and write it down):
- (a) Move M14a (the store key + getter/setter ONLY, not the picker UI M14c) into Phase 1, so `startupView:'home'` is a real, settable, revertible thing during the gate window. M14a is a clean one-change/one-test store addition with no UI surface; it is the minimum the gate needs to be observable. The picker (M14c) and the all-three-sites branch (M14b) can stay in Phase 2 if you want, but the gate needs the persisted setting to exist in Phase 1, or it has nothing to measure. This is my recommendation: the gate is the most consequential go/no-go in the document and it must be measurable in the phase it gates.
- (b) Rewrite the gate's two conditions and kill criterion to NOT reference `startupView`, using only signals that exist in Phase 1. Concretely: condition (1) becomes "Mark has manually opened Home as his first action on >=5 working mornings" (observable without a setting, just a habit), and the kill criterion becomes "Mark stops opening Home / stops opening the app." This keeps M14a/b/c fully in Phase 2 but makes the gate self-measuring.

What is not acceptable is the current state, where the gate's instrument (`startupView:'home'` set-and-left-that-way) is built by the milestone the gate authorizes. The whole phase model rests on this gate (R-13 names it the most-likely-to-strand risk); an unmeasurable gate is the round-3 A2 defect reopened by the round-4 YAGNI deferral of M14a/b/c.

### A2. The re-cut from 1a/1b to Phase 0/1 dropped the per-phase ship line and the demo-acceptance sentence; "ships and is used first" is asserted again, not anchored

Round 3 had explicit ship points and the round-3 review (B1) asked for a one-sentence demo acceptance. Round 4's re-cut to Phase 0/1 left the ship discipline thinner than round 3, not thicker:

- The preamble says Phase 0 "Ships and is looked-at before Phase 1" and Phase 1 "Ships and is used before Phase 2 is built." But Section 7's closing line collapses both into "Phase 0 ships after M8a (the read-only paint). Phase 1 ships after M10 + M14d." There is no stated observable for "Phase 0 has shipped and been looked at" as distinct from "Phase 1 has shipped and been used." The two ship events are the spine of the whole "each phase earns the next" model and they get one clause each.
- The round-3 B1 demo-acceptance sentence ("launching the app and selecting Home shows, against live `state.json`, the correct hero / goal-gradient / list / one-of-four-states; the hero's primary action does X") never made it into round 4. M8a's DoD is a long green-test list; it is not a one-line user-observable demo a reviewer or Mark can read and check. The plan has 80-plus falsifiable test assertions and zero "here is what the shipped thing does when you open it" sentences.

Fix: add a one-line ACCEPTANCE sentence to BOTH phase ship points, distinct from the test list. Phase 0: "Acceptance: launch the app, open Home; against live `state.json` it shows the correct hero (time-sensitive-within-5-days, else dodAlmost, else needs-you head, paused filtered), the goal-gradient line, the needs-you list in board order capped at N+more, and exactly one of {loading, caught-up, not-running, degraded} with no strobe; the hero's primary action is Copy." Phase 1: "Acceptance: the same, plus the hero's primary button performs reframe-as-review (opens a Claude session in the hero program's tree and injects the canned review query within 30s or surfaces a retry), the live strip renders, and a closed needs-you card ticks 'N closed today'." This is the bridge between the green suite and "value landed," and it forces the reader to see the two phases as two demos, not one test run.

### A3. The milestone-ID-vs-run-order hazard (round-3 B3) is unaddressed and the round-4 re-cut made it worse

Round 3's B3 named this and round 4 did not act on it. Run order is now M0, M0b, M1, M2, M3a, M3b, M4, M5, M7, M7b, M8a (Phase 0), then M8b, M9, M10, M14d (Phase 1), then M14a, M14b, M14c, M6, M11, M12, M13 (Phase 2), then M15-M19 + M0c (Phase 3). So:
- M14d runs in Phase 1 but M14a/b/c run in Phase 2: the `d` suffix runs BEFORE the `a/b/c` it is lettered after.
- M6 (numerically the sixth milestone) runs in Phase 2, after M14d.
- M0c (numerically first-ish) runs LAST, in Phase 3.
- A contractor reading "M6" assumes it runs sixth; it runs roughly twentieth.

This is not a correctness bug, it is a build-lane and reviewability hazard the plan can kill with one sentence. The plan already gestures at it ("'Header position' no longer equals run order; the graph below is authoritative," Section 7) but never states the cross-phase rule plainly. Add one line to the Section 7 preamble: "Milestone IDs are STABLE LABELS, not run order. Run order is the phase sequence below; a numeric or letter suffix never implies sequence across phases (M14d ships in Phase 1, M14a/b/c in Phase 2; M6 ships after M14d; M0c ships last, beside M19)." This is the cheapest item in the review and it removes a real "build the wrong milestone next" risk for any session that picks up the plan cold.

### A4. M14d's DoD lacks the no-regression assertion that R6 item 2 made the explicit priority

M14d (the `notifyOnIdle` demotion) is a behavior change to the idle ping the user relies on. R6 item 2's entire decision frame is "default = current behavior preserved, no regression": the shipped two-notification behavior must be reproducible by a user who never opens Settings. M14d's DoD ("idle toast suppressible; `requires_response` preserved") tests the suppression PATH but not the DEFAULT. The test list covers "with `notifyOnIdle:false` ... idle does NOT notify while `requires_response` STILL notifies; the flag round-trips; default value confirmed" but "default value confirmed" is checked as a store value, not as BEHAVIOR.

The R6-mandated assertion is: with `notifyOnIdle` at its DEFAULT, an idle event STILL fires the toast exactly as today (no regression for the user who never touches Settings). Add that one assertion to M14d's test list and DoD: "at the default flag value, an idle event notifies (the shipped ping is preserved); only `notifyOnIdle:false` suppresses it." Without it, a builder could ship `notifyOnIdle` defaulting to `false` (suppressing the ping by default), pass every listed test, and silently regress the exact ping R6 item 2 was written to protect. This is the same class of precedence/default bug the M4 single-item-DoD parity test and the round-3 B4 both-conditions override test were added to catch.

---

## B. Should-fix (raises reviewability and de-risks the build)

### B1. M0b is the hard pre-paint gate but the dependency graph does not place it ON the critical path; state the ordering relationship as an edge, not a side note

The Phase 0 graph reads: "Hard pre-paint security gate (MUST land before any milestone paints real feed data): M0b" then "Critical path to first paint: M0 -> M1 -> M3a -> M4 -> M5 -> M7 -> M7b -> M8a." M0b is named as a gate but it is not IN the arrow chain, and the arrow chain is what a builder follows. The relationship "M0b before M8a" is the load-bearing security ordering (the leak goes live the instant M8a renders real `title`/`detail`), and it is stated in prose twice but never as a graph edge. A builder optimizing the critical path could legitimately read M0b as parallel (it is parallel to M0->M1->M3a->M4->M5->M7->M7b) and schedule M8a as soon as M7b lands, before M0b. The prose says don't; the graph doesn't enforce it.

Fix: make the edge explicit in the graph: "M8a depends on BOTH (M7b, the render-primitive chain) AND (M0b, the security gate); M8a MUST NOT open until M0b is green." One edge, and the "value early" critical path and the "security clean" gate stop being two separate readings of the same list.

### B2. The Phase gate has no owner-action checklist artifact; it is prose Mark must remember to run

A2 (round 3) asked for the gate to be an observable with a decider; round 4 delivered the observable and named Mark as decider. What is still missing is the THING Mark checks. The gate lives in the preamble as a paragraph. For a solo-dev tool whose author has a documented ADHD profile (the plan cites it repeatedly), a go/no-go that exists only as a paragraph buried in a 900-line plan will not get run; it will get skipped, and the build lane will roll into M6 because the milestones are sequential (the exact failure round-3 A2 warned about). Make the gate a SMALL CONCRETE ARTIFACT: a 4-line checklist at the end of Section 7 (or a `docs/dashboard/PHASE-GATE.md`) that reads "Before opening any Phase-2 milestone, confirm: [ ] Home was first-opened >=5 working days; [ ] one concrete friction named (write it here: ____); [ ] NOT avoiding Home (kill check). If the kill check fails, Phase 2 does not ship." This is the difference between a gate that is documented and a gate that is run. It costs three lines and it is the highest-leverage thing in the plan for actually realizing the phased bet.

### B3. M3a and M3b ordering vs the dependency graph is ambiguous; M3b is listed as independent but M8b/M10 read the slot it mints

The Phase 0 graph lists M3a on the critical path and M3b under "Independent / parallelizable any time in Phase 0 (do NOT block the paint)." That is right for the paint (M8a does not need the per-day pinned/parked slot). But M3b also "routes BOTH `onTabRemoved` null returns to the Home id" (the cross-project blank-screen fix) AND "mints a per-day pinned-hero-id slot" read by Phase-3 lock-in and Phase-2 re-roll park. The blank-screen route is a real Phase-0 correctness fix (close the last tab of project A while B has tabs -> blank screen today); the per-day slot is dead until Phase 2/3. Bundling a live Phase-0 bug fix with a Phase-2/3-only slot into one "independent" milestone means the milestone's value is split across three phases and its DoD ("the cross-project-close test catches the latent blank-screen bug") only exercises the Phase-0 half. Consider splitting: the `onTabRemoved` route is a standalone Phase-0 correctness milestone (one change, one test, ships value now); the per-day slot rides into Phase 2 with M6 (its first consumer), per the plan's own "ships beside its caller" principle it applied to M0c. As written, M3b ships a dead slot one to two phases early, the exact YAGNI pattern the plan corrected for M0c and M14a/b/c.

### B4. M8a's DoD should assert the override precedence between its two branches (round-3 B4 was applied to the test list but not pinned as the headline DoD)

Round 3's B4 asked for a both-conditions fixture (a card that is BOTH time-sensitive-within-5-days AND dodAlmost must pick the time-sensitive one, per the 1.11 precedence). Round 4's M8a test list covers the time-sensitive fixture and the single-item-DoD fixture SEPARATELY ("for the time-sensitive fixture the hero is the deadline card, for the single-item-DoD fixture the hero is that card"), but I do not see the BOTH-conditions fixture asserting precedence. The 1.11 order is explicit (time_sensitive wins, ELSE dodAlmost, ELSE producer head); a builder can implement dodAlmost-first and pass both single-condition tests while inverting the documented order. Add the one fixture + one assertion to M8a: "a card that is both time-sensitive-within-5-days and dodAlmost is the hero AS the time-sensitive branch (deadline beats the 90%-killer)." This closes the precedence gap the same way M4's single-item parity test closed the dodAlmost gap.

### B5. Section 8's Phase-3 "sketch" milestones promise full discipline but show none; state that DoD/rollback come when the gate opens

PLAN-PHASE-2-3.md says "Each milestone is one change + one expected vitest test + falsifiable DoD + one rollback point" (line 5) and then lists Phase-3 milestones M15-M19 as a "sketch" (line 67) with no DoDs or rollback points. That is acceptable for gated, far-out work, but the promise and the delivery disagree on the same page. Add one line: "Phase-3 milestones are sketches; each gets its full DoD + rollback when its phase gate opens, not now." This is the round-3 C4 nit, still open. Phase 2's milestones (M6, M11, M12, M13) DO carry DoD-grade detail (M6's park-persistence assertion, M12's server-side-validation rejection tests), so the inconsistency is only Phase 3; saying so resolves it.

---

## C. Nits / polish (cheap, worth doing)

- C1. "Existing suite still passes" DoD clause (round-3 C2) is still not uniform. Milestones touching heavily-tested shared code should carry "`pnpm run test` still green" as the cheapest regression DoD: M3a/M3b (touch `App.tsx`), M0b (touches `logger.ts`, which has tests), M2 (an existing `TabIndicator.test.tsx` exists, so M2's DoD should be "new reduced-motion assertion green AND the existing TabIndicator test still passes"), M5 (extends `ipc-handlers.test.ts`), M14d (touches `hook-router.ts`, which has `hook-router.test.ts`). One clause each.

- C2. The "one rollback point" / `/cad:milestone` connection (round-3 C3) is still abstract. Section 7's preamble says "No commit or push without explicit user permission" and "one rollback point" per milestone, but never connects "rollback point" to the tag-able save point mechanism. One clause in the Section 7 preamble: "each milestone's rollback point is a `/cad:milestone` candidate Mark green-lights; rollback discipline does not require a pushed commit per milestone, per AGENTS.md 'Do NOT commit or push unless the user asks.'" Ties the plan's rollback language to the workspace's actual save-point tool.

- C3. M0's fixture set is six variants but M8a's first-open-timeline test needs a SEVENTH implicit input: the "pending fetch in flight" state (skeleton holds across a pending tick). That is a timer/mock state, not a `state.json` fixture, so it is fine, but M0's DoD ("the full fixture variant set is importable") should note the timeline test drives the skeleton state via fake timers, not a fixture, so a builder does not go looking for a seventh golden file. One clause.

- C4. Open question 12 (Phase-1 hero will read as a dev/admin task, not an avoidance area) is the single most important product question in the plan and it is question 12 of 14 at the very bottom. The plan is admirably honest about it (1.11 "Honest Phase-1 hero expectation," R-8, R-13), but for Mark's decision-making it should be promoted: it is the falsification risk for the entire phased bet (if Phase 1 reads as "just another status board," Phase 2 never ships). Consider lifting it to question 1, or flagging it inline at the gate as "the bet this gate tests." It is a sequencing-of-attention nit, not a content gap; the content is right.

- C5. The Phase 0 "true MVP" framing is strong, but the preamble's "Honesty about scale (YAGNI)" paragraph lists "seven small ADHD behaviors" shipped in Phase 0+1 while Phase 0 alone ships a subset (goal-gradient, paused-filter, single-field override, the four non-strobing states, Copy). A reader cannot tell from the preamble which of the seven are in Phase 0 vs Phase 1. Since Phase 0 is the thing that ships and gets looked at FIRST, list its behaviors explicitly: "Phase 0 ships: goal-gradient (1.10), single-field hero override (1.11), paused-respect (4.4), the four non-strobing states (4.3), the disclosure cap (4.6), Copy-as-hero (3.3). Phase 1 adds: done-lane payoff (1.5), reframe-as-review (1.7), the live strip, the pwsh resolver, notification demotion." This makes the two demos legible and reinforces A2.

---

## D. What round 4 got right (keep these)

- The Phase gate as an observable with a named decider AND an explicit kill criterion (preamble) is the correct resolution of round-3 A2, and the kill criterion ("if Mark is avoiding Home, Phase 2 does NOT ship and the core bet is judged false") is exactly the self-falsification a plan this aware of avoidance owed. The only gap is making it measurable in Phase 1 (A1) and making it a runnable artifact (B2), not the gate's design.
- Reframe-as-review moved into Phase 1 / M10 (the round-3 A1 top finding), so the MVP can perform its own headline move. The honest follow-through ("the canned default is SAFE BUT GENERIC, not highest-specificity," 1.7/3.4) is the right call: it ships the affordance without overclaiming what slug-only filling can do.
- The resolved-set ownership moved into M4's reader with reset-at-construction and `closed.json` persistence (round-3 A4 + open-question-14 resolution). The reasoning ("the only component with prior-vs-current poll memory and a process-lifetime lifecycle") is the correct lifecycle argument, and persisting last-24h so a morning glance reflects yesterday's wins is the right ADHD call for a user who works away from the terminal.
- The Phase 0 dependency graph (round-3 A3) replaced the flat list; the critical path is now visible and the independent milestones are named. Just needs the M0b edge made explicit (B1).
- M14d gave the floating `notifyOnIdle` demotion a real milestone with DoD and rollback (round-3 B5). Just needs the no-regression-default assertion (A4).
- The done-lane carrot broadened to "a card LEAVING the needs-you set" (not Done-lane-only) is a genuinely important data-grounded fix: the appendix verifies 11 of 18 live programs have `dod.total:0` and can never cross to Done, so a Done-only carrot would light zero pixels for the most common program kind. Catching that against live data is the plan testing reality, not a schema.
- Extracting Phase 2/3 to `PLAN-PHASE-2-3.md` (decompose-to-fit) and deferring M14a/b/c and M0c to ship beside their consumers is correct YAGNI discipline. The only casualty is that the gate's instrument (`startupView`) got deferred along with the picker (A1) - the fix is to split M14a (the store key) back into Phase 1, not to undo the extraction.

---

## Summary of the path to 9/10

Direction, grounding, and the three-phase spine are right; round 4 closed round 3. The remaining work is in the seams the re-cut opened:

1. Make the Phase gate measurable in the phase it gates: split M14a (the `startupView` store key only) into Phase 1, OR rewrite the gate's conditions to not reference `startupView`. As written, the gate's instrument is built by the milestone the gate authorizes (A1). Top item.
2. Restore the per-phase ship line and add a one-sentence demo-acceptance to BOTH Phase 0 and Phase 1, distinct from the test lists (A2).
3. State the milestone-ID-vs-run-order rule plainly in one sentence; M14d-before-M14a/b/c and M6-after-M14d are live build-lane traps (A3).
4. Add the no-regression-DEFAULT assertion to M14d's DoD, per R6 item 2's stated priority (A4).
5. Make M0b a graph EDGE into M8a, not a side-note gate (B1); make the Phase gate a runnable checklist artifact (B2); split M3b's live Phase-0 bug fix from its dead Phase-2/3 slot (B3); pin the override-precedence both-conditions fixture in M8a (B4); say Phase-3 sketches get DoDs when the gate opens (B5).
