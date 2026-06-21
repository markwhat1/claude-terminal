# Round 6 advisor review: Product / PM lens

Reviewer lens: Product/PM. Scope graded: the Phase 0/1/2/3 split, the MVP cut that ships value early, boringly-small milestones with falsifiable DoD plus a rollback point, and the vitest test plan. Target: `infrastructure/claude-terminal-dashboard` (dashboard worktree). Plan read: `docs/dashboard/PLAN.md` at the round-6 revision, plus `PHASE-GATE.md`, `PLAN-PHASE-2-3.md`, and the round-2 R-docs.

## Verdict

This is a strong plan. On the four PM axes it is already near the top of the band. The phase split is real (each phase ships and gets dogfooded before the next is built), the MVP is honestly the read-only paint at M8a, the milestones are mostly one-change/one-test/one-rollback, the DoDs are falsifiable (green test plus a structural observable), and the test plan is specific down to the fixture and the rejected-test ("a test that drives only `tab:status:idle` is REJECTED"). The phase gate is extracted to a runnable checkbox artifact, the run order is a dependency graph not header order, and the restraint inventory makes the motivational claims auditable instead of rhetorical.

What keeps it under 9 is not big holes. It is a handful of places where the PM scaffolding is asserted in prose but not yet welded to a milestone DoD, a few milestones that are still secretly two changes, and a test plan that is exhaustive on logic but thin on the one thing this product lives or dies on: whether the human actually uses it. The improvements below are concrete and mostly small.

## What is already at 9/10 (so it is not weakened in a later round)

- The dependency-graph run order plus the "milestone IDs are labels not run order" note. This is the single best structural decision in the doc. Keep the one-line run order at the top.
- M3a split into i/ii/iii. Round-5 M3a was a phase wearing a milestone's clothes; the split is exactly right and each piece has its own rollback.
- The PHASE-GATE.md extraction with a kill criterion and a fill-in-the-blank named-friction line. A go/no-go that gets run, not read past.
- The rejected-test discipline (M10's "only `tab:status:idle` is REJECTED", M0c's negative cases). Naming the test that would pass while the bug ships is rare and valuable.
- The honesty passes (the carrot rarely fires on live data; the goal-gradient is a floor not an engine; the canned query is safe-but-generic). A plan that argues against its own motivational weight is a plan that will not over-promise to the user.

## Must-fix (blocks 9/10)

### MF-1. The Phase-1 ship line and the run order disagree on M4b, and the "Phase 1 SHIPS after" list omits it.

Three places state the Phase-1 ship set and they are not identical:

- Section "Ship points" (line ~60): "PHASE 1 SHIPS after M10 + M14a + M14b + M14d." No M4b, no M8b, no M9.
- Section 7 end (line ~965): "Phase 1 ships after M4b + M10 + M14a + M14b + M14d." M4b is in, M8b and M9 still absent.
- The one-line run order (line ~25) lists Phase 1 as M4b, M8b, M9, M10, M14a, M14b, M14d.

A builder reading the ship line will believe Phase 1 is done after M10 and the startup wiring, and will not ship the done-lane payoff (M8b), the live-session strip (M9), or even M4b in the first list. The Phase-1 demo-acceptance sentence in the same block describes the strip ("the live-session strip shows each running tab") and the payoff ("N closed, last 24h"), so the acceptance sentence already assumes M8b and M9, contradicting its own ship-set list. Pick ONE canonical Phase-1 ship set, state it once, and make every other mention point to it. The acceptance sentence implies the canonical set is M4b + M8b + M9 + M10 + M14a + M14b + M14d. Fix all three to match.

### MF-2. M8b is two milestones, not one; it carries four named behaviors with four independent rollbacks.

M8b's change line is: consume `closedRecent` and render the closed-count line and the `justResolved` settle, the saturation-capped hero band, the caught-up "Pull one forward?" line, AND the unified hero/glance count (`idleNeedsYou` eligibility plus the "N need you" header off the unified set). That is four separable features sharing one rollback ("revert to the M8a render"). A bug in the unified-count logic forces reverting the done-lane payoff too. This is the exact one-change/one-rollback violation the plan corrected for M3a and M4b. Split M8b into:

- M8b-i: done-lane payoff (the `closedRecent` header line plus the `justResolved` settle plus the saturation-capped hero band; these are the carrot and ship together).
- M8b-ii: caught-up pull-forward (the "Pull one forward?" line with the paused exclusion).
- M8b-iii: unified hero/glance count (the `idleNeedsYou` empty-board hero eligibility plus the unified "N need you" header).

Each gets its own test (the current M8b test list already separates cleanly along these three lines) and its own rollback. M8b-iii is the one with the subtlest bug surface (the unified-set count) and most deserves to fail in isolation.

### MF-3. M10 is named as the largest, most coupled milestone, but it is still one rollback point with an internal sub-sequence rather than four milestones.

The plan acknowledges this (it names a four-part internal sub-sequence with a `/cad:milestone` after each) but then files it as a single milestone M10 with one DoD and one rollback. The "one rollback point per milestone" rule is satisfied only by treating the four sub-points as four real milestones. Promote them to M10a/M10b/M10c/M10d:

- M10a: `composeClaudeQuery` + `composeCopy` + `pickPrimaryAction` (pure, test-first, no IPC). This is the lowest-risk, highest-reuse piece and can land first and independently.
- M10b: the `explicitCwd` param on `tab:create` (the one IPC-surface change; needs its own registration-test touch since it changes a channel's payload shape).
- M10c: the `claude:injectQuery`/`claude:injectStatus` channel pair plus the MAIN idle gate plus the 30s timeout (the net-new cross-module main feature; the heaviest test, including the real-`tab:ready` first-idle assertion).
- M10d: the pwsh resolver wiring into the PowerShell action plus Copy plus the 1.5b pending affordance.

Each already has a distinct test cluster in the current M10 test list. Splitting them means a failure in the idle gate (M10c, the hardest) does not force reverting the pure composer (M10a, the safest). The Phase-1 acceptance sentence is copied into M10d's DoD (the last one), where the full action is observable. Note that M10b also changes a `tab:create` payload, so per AGENTS.md it needs the registration-test assertion updated, which is easy to lose inside a four-part milestone.

### MF-4. The activation-energy "number" is falsifiable in prose but the two DoDs measure a proxy, not the number.

Section 1.13 promises a falsifiable activation number, and the DoDs cite "one IPC round-trip" (M10) and "zero hero-region layout shift" (M8a). Those are real and testable. But the headline activation claim for an ADHD user is wall-clock from window-focus to the query landing, and the plan deliberately splits that into "the app's controllable share" (one round-trip) plus "the out-of-app CLI boot" (bounded by the 30s timeout). The risk: a builder ships M10 green on the arm-before-resolve property and the team believes "activation energy is solved", while in real use the 3-8s CLI boot (1.5b) is the felt cost and is untested for actual duration. The number that matters to the product is not in any DoD as a measured value, only as a bounded fail-safe. Add a Phase-1 dogfood-measured observable to the gate (not a unit test, since it is out-of-process): in PHASE-GATE.md or M10d's DoD, record the observed median click-to-query-typed wall-clock across the 5-day window, with a stated ceiling (for example "if the median exceeds ~8s, the reframe affordance is failing its own thesis and the pending-UI/spawn path needs a tuning pass"). This converts "we bounded it at 30s" into "we measured it and it is acceptable", which is the falsifiable product claim 1.13 set out to make.

### MF-5. The vitest plan has no test that the human used the thing; the gate is the only instrument and it is manual.

Every milestone DoD is a green unit/render test plus a structural observable. That is correct for logic. But the product's core bet (a calm board earns daily opens) has exactly one instrument, the manual 5-day PHASE-GATE check, and nothing in the build observes whether `startupView:'home'` is actually being honored at launch over time. There is no telemetry, and given the Max-plan/no-API and PHI constraints there should not be a network one. The cheap, in-spec instrument: a local, `userData`-resident launch-log (append `{ts, landedOn}` on each app open, same MAIN-owned-app-state-under-userData rule as `closed.json`). M14b already branches all three `setActiveTabId` sites; have it record which surface it landed on. Then the 5-day gate is read off a real local artifact ("Home was the landed surface on N of the last M opens") instead of Mark's memory. This is one append-only write and one read, no new IPC channel (MAIN-owned), and it makes the single most consequential go/no-go falsifiable from data rather than recall. Add it as a small milestone in Phase 1 (M14e) or fold it into M14b's DoD. Without it, the gate that governs whether half the roadmap ships rests entirely on self-report from an ADHD user the plan elsewhere designs around forgetting things.

## Strong improvements (raise the score, not strictly blocking)

### SI-1. M0b is the widest milestone in the plan and is on the critical path; consider splitting the security gate.

M0b is four distinct changes (log-path move + idempotency, prompt-prefix redaction, the shared nav-sink predicate across three sinks, production DevTools removal) with one rollback. It is also a hard predecessor of M8a (first paint), so a flaky piece blocks the MVP. Unlike M10, these four are genuinely independent (the log move does not depend on the nav predicate). Split into M0b-i (logger: path move + idempotency + redaction) and M0b-ii (the nav/DevTools surface: shared `isAllowedExternalScheme` + both sinks + IPC handler + production DevTools). M8a depends on both, but a failure in the nav predicate then does not block landing the logger fix, and each has a tighter rollback. This is the same reasoning that split M3a; apply it consistently.

### SI-2. The "value landed" sentence exists for Phase 0 and Phase 1 but not Phase 2 or Phase 3.

The plan copies the Phase-0 acceptance sentence into M8a's DoD and the Phase-1 sentence into M10's, which is excellent. Phase 2 and Phase 3 have milestone lists but no "this is the user-observable sentence that says value landed" per phase. Since Phase 2/3 are gated and may never ship, a one-line acceptance sentence per phase (in the Section 8 index, pointing at PLAN-PHASE-2-3.md) keeps the same discipline and tells a future builder what "Phase 2 shipped" actually looks like to Mark, not just which milestones are green. Cheap, and it closes the asymmetry.

### SI-3. The MVP (M8a) Copy button is the only hero action in Phase 0, but the test does not assert it produces something paste-useful.

M8a ships Copy as the hero's working action so the button is never dead before M10. The M8a test asserts the mapper never routes `detail`/`blocked_on`/`dod.gaps` into `copy.text` (the leak guard, good) and that copy contains no slop. But there is no positive assertion that the copied string is actually useful to a human (for example, that it names the program and is non-empty). A Copy that produces a sterile empty-but-safe string passes every current M8a assertion and ships a dead-feeling MVP. Add one positive assertion: the Phase-0 hero Copy payload is non-empty and contains the program name (the same slug/name that is already PHI-precondition-gated). This makes the MVP's one action demonstrably do something, which is the whole point of shipping Copy early.

### SI-4. Open question 8 is a PRE-M8b gate but the milestone graph does not encode it as an edge.

The plan says the two-tier payout calibration (open question 8) must be signed off before M8b ships, because M8b builds the ordinary settle and could build the wrong one. That is a real sequencing dependency on a human decision, but it lives only in prose (1.5 and open question 8). The dependency graph encodes milestone-to-milestone edges (M8a depends on M0b) but not milestone-to-decision edges. Add the decision gates to the graph or to the relevant milestone DoD as an explicit predecessor: "M8b-i MUST NOT open until open question 8 is signed off" and "M14d ships `notifyOnIdle:true` per the decided default (open question 10)". Two of the open questions (8 and 14) are genuine build-blockers, not nice-to-haves; treat them as graph edges so a session picking up the plan cold does not build the wrong settle and discover the sign-off was needed only after.

### SI-5. The regression clause is uniform but the "still green" suite has no stated baseline count.

The UNIFORM REGRESSION CLAUSE requires `pnpm run test` green on every milestone. AGENTS.md says "40 tests" today. The plan adds dozens of tests across ~25 milestones. A drifting baseline ("still green" against an unknown N) lets a silently-skipped test slip through (a `.skip` keeps the suite green). Add to M0's DoD a recorded starting test count and require each milestone's DoD to state the new count (or that the count strictly increased). This is the cheapest guard against the "green suite, fewer tests" failure mode, and M0 (shared fixtures) is the natural place to pin the baseline.

### SI-6. PLAN-PHASE-2-3.md is referenced as authoritative for ~9 milestones but the Phase-1 plan should state the contract it depends on.

The Phase-1 plan correctly defers Phase 2/3 detail to the sibling file. But several Phase-1 decisions are made "as a Phase-1 design commitment now" for a Phase-2 thing (the two-tier settle's louder tier rides M13; the `avoidanceClose` flag is set in M4b's code path "in Phase 2"; capture is "front of Phase 2"). M4b's change line literally says "In Phase 2 it also flags `avoidanceClose`". That means M4b's Phase-1 code has a Phase-2 hook in it. Either (a) keep M4b strictly Phase-1 (no `avoidanceClose` mention in the shipped M4b change; add it in M13) so the Phase-1 milestone has zero forward-coupling, or (b) state explicitly in M4b that the `avoidanceClose` field is reserved-null in Phase 1 and written only by M13, with a test that Phase-1 M4b never sets it. Right now it reads as a YAGNI violation (a Phase-2 flag in a Phase-1 milestone), which is the exact pattern the plan cut for M3b's parked-id slot and M0c. Apply the same rule to M4b.

## Smaller notes (polish)

- The M9 change line is long (icon-per-state, idle-floor, two time computations, sparse per-row update, justResolved fade, project border, StatusBar count hiding). It is arguably one component so one rollback is defensible, but the "hide StatusBar counts on Home" change touches existing shipped code (a different file) and is a separable rollback from "build the strip". Consider pulling the StatusBar-count-hiding into its own tiny change with the regression clause called out (it modifies already-tested StatusBar behavior), the same treatment M2 got for TabIndicator.
- The Phase-0 critical path lists M5 before M7/M7b, but M8a needs the IPC channel (M5), the helpers (M7), and the primitives (M7b). The graph is correct; just confirm M7/M7b can run in parallel with M4/M5 (they have no dependency on the reader), which would shorten the path to first paint. Stating the parallelizable set explicitly (as Phase 0 already does for M2/M3b) would help a multi-session build.
- Open question 2 (threshold tuning) bundles five distinct numbers (freshness bands, idle floor, time-sensitive window, stall interrupt). The time-sensitive window is already reconciled to the producer's 5 days and is NOT tunable without diverging from the board (4.4). Remove it from the "tune later" bundle so a builder does not change it and silently desync from the producer.
- The `closedRecent` worst-case ~20s latency (R-2, deferred watcher) is honestly stated, but it is the dopamine payoff's latency and the payoff is the one real reward (1.12). For an ADHD reward, 20s is long. This is correctly an accepted Phase-1 limitation tied to open question 2, but consider stating in M8b-i's DoD that if dogfooding shows the delayed beat reads as "nothing happened", the cheaper done-lane-only stat-poll on a shorter interval is the committed fallback, so the fix is pre-decided rather than re-litigated.

## Constraint compliance check (PM-relevant)

- Boringly-small milestones: mostly yes; M8b, M10, M0b are the three that still bundle (MF-2, MF-3, SI-1).
- One expected test per milestone: yes, every milestone names its test.
- One rollback point per milestone: violated by M8b and M10 (they name multi-step internal sequences); see MF-2/MF-3.
- Falsifiable DoD: yes, uniformly (green test plus structural observable, no "no console errors").
- MVP ships value early: yes, M8a is a genuine dogfoodable read-only board; the one gap is SI-3 (Copy should be asserted useful, not just safe).
- Phase split hardening: strong, except the ship-set contradiction (MF-1) and the missing decision-edges in the graph (SI-4).
- No em dashes / no AI-slop in this review: checked.
- PowerShell 7, PHI-out-of-argv/logs, AGENTS.md IPC discipline, keybinding challenge: all honored by the plan and not weakened by any suggestion above (the launch-log in MF-5 and the closed.json idempotency stay MAIN-owned under userData, no new channel, no PHI).
