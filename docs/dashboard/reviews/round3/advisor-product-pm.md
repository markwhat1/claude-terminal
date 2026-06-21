# Advisor review (round 3): Product / PM lens

Plan reviewed: `docs/dashboard/PLAN.md` (dashboard worktree, branch `dashboard`, HEAD `ce2e9e0`, verified live).
Lens: Phase 1 / Phase 2 split, the MVP cut that ships value early, boringly-small milestones with DoD + rollback, the vitest test plan.

Verdict: round 3 closed nearly all of round 2. The logger-leak gate (M0b) is now inside Phase 1a and sequenced before the MVP paint, M14 is split into store/branch/picker, M0 carries the six-fixture set, the done-lane count is reframed to honest "since open", the todo-cannot-be-a-free-text-hero scope decision is stated and tested, and the three-phase re-cut (board, then enrichment, then coaching default OFF) is the right spine. The work is genuinely strong. Current score on this lens: about 8.6/10.

What stands between here and 9/10 is no longer direction. It is a small set of real defects in the phase boundaries themselves: the Phase-1a MVP as currently cut ships a hero whose only working button copies text, which undercuts the plan's own headline thesis; the "real use" gate that the whole phase model rests on is never defined as an observable; the milestone sequence inside Phase 1a does not separate the load-bearing critical path from the parallel/independent milestones, so "ships value early" is asserted but not engineered; and two carried-over data-ownership and DoD gaps remain soft. All are fixable in an editing pass on Sections 7 and 10.

What I re-verified against source and against the round-2 review this round:
- Branch/HEAD `dashboard` / `ce2e9e0`. Confirmed.
- `package.json`: test runner is `vitest run` exposed as `pnpm run test`; `pnpm run test:watch` for watch. `tests/` mirrors `src/` under `{main,renderer,shared,integration,hooks}` plus `setup.ts`. The three renderer tests (`ProjectSidebar`, `ProjectSwitcherDialog`, `TabIndicator`) are prop-only; no test mounts `App`. Matches the plan's M0 premise.
- `src/renderer/components/ui/`: badge, button, dialog, dropdown-menu, input, label, popover, radio-group, select, switch, table present; card, skeleton, tooltip MISSING (M7b vendors them). Matches 6.0.
- Round-2 product-PM review items A1-A6, B2-B4 are all addressed in the round-3 text. M0b is in the Phase 1a cut (line 535) and sequenced before M8a; M14 is split a/b/c (lines 654-663); M0 ships six fixture variants (line 542); "N closed since open" is the honest reframe (line 69); todo-not-eligible-for-draftFirstVersion is stated (1.7, line 83) and tested (5.6, line 461). Good. This review does not re-raise those.

The rest of this review uses the plan's own line numbers and milestone IDs.

---

## A. Must-fix (defects in the phase split and milestone plan, the thing this lens grades)

### A1. The Phase-1a MVP ships a hero whose only working action is Copy, which contradicts the plan's own headline affordance and the "dogfooded first" claim

This is the top PM defect in round 3 and it is a self-contradiction the plan does not acknowledge.

- Line 22 (PHASE 1 description): "paint the calm one-thing Home with the producer's needs-you list, four states, Copy, and the live-session strip... Plus exactly ONE carrot... and **the write-after-ready actions**. Ships and is used before Phase 2 is built."
- Line 535 (Phase 1a cut): M0, M0b, M0c, M1, M2, M3, M4, M5, C1, M7, M7b, M8a. No M10.
- Line 536 (Phase 1b cut): "M8b, M9, M10, M14. The done-lane payoff, the live strip, **the three actions**, the `startupView` opt-in."
- Line 625 (M8a body): "Copy is the hero's primary action in 1a (canned paste-ready, 3.3) so the button is never dead before M10 wires the richer actions."
- Line 627 (M8a DoD): "this is the dogfoodable read-only MVP (hero + list + states + Copy)."

So the write-after-ready actions live in M10, M10 is Phase 1b, and the Phase-1a "dogfoodable MVP" hero's primary button copies a string to the clipboard. Section 1.7 names reframe-as-review (Open Claude with a canned review query) as "the single highest-payoff ADHD affordance" and "the headline affordance." The MVP as cut cannot perform it. The user dogfooding Phase 1a sees the most important thing, then has to paste into a terminal by hand. That is a status board, not the action board the plan argues for.

Two internal contradictions compound it: line 22 lists the write-after-ready actions as part of the PHASE 1 thing that "ships and is used before Phase 2," but the milestone cut defers them to 1b; and M8a's DoD calls a copy-only hero "the dogfoodable read-only MVP" while line 22 calls the same phase action-bearing.

Resolve it one of two honest ways, and state which:
- (a) Pull `openClaudeWithQuery` (the write-after-ready half of M10, not PowerShell, not the disabled-remote staging) INTO Phase 1a so the MVP hero can actually do its headline action. The choke point (`composeClaudeQuery` + `ClaudeQueryLine`) and the idle-gated write are already specified; this is the load-bearing affordance and it belongs in the MVP. The 30s timeout (3.1 step 7) ships with it. This is my recommendation: the MVP should be able to do the one thing the plan says matters most.
- (b) Keep M10 in 1b but stop calling 1a "the MVP" and stop listing the actions in the PHASE 1 line. Relabel 1a as "the read-only board (no actions yet)" and move the "ships and is used before Phase 2" claim to the END of 1b. Then the dogfood gate is "after M10," not "after M8a."

Either is fine. What is not fine is the current state where line 22, line 535/536, and line 627 describe three different MVPs.

### A2. The entire phase model rests on "gated on Phase-1 real use" but "real use" is never defined as an observable, and nobody owns the gate

Lines 23, 24, 34, 90, 537 all gate later phases on "Phase-1 real use" / "real-use feedback." This is the correct discipline (do not build Phase 2 until Phase 1 has earned it). But a gate with no defined trigger is not a gate; it is a hope. The plan defines falsifiable DoDs for every milestone (good) and then leaves the most consequential go/no-go in the whole document, "is Phase 1 used enough to justify Phase 2," entirely unspecified.

Add a short "Phase gate" subsection (in Section 7 or 10) that makes each gate an observable Mark can check:
- What signal closes the Phase-1 gate? Concrete candidates: "Home set as `startupView:'home'` and left that way for N days," or "the write-after-ready action used at least once on a real card," or simply "Mark says the board changed what he opened first for a week." Pick one and write it down.
- Who decides? This is a solo-dev tool; the answer is "Mark," but the plan should say the gate is a deliberate user decision, not an automatic graduation when M14 merges. Otherwise the build lane will roll straight from M14 into M6 because the milestones are sequential in the doc.
- What is the explicit kill criterion? The plan's own thesis (E5 P2, line 33) is that a demanding board becomes a guilt object and gets avoided. State the falsification: "if after the Phase-1 window Mark is avoiding the Home view, Phase 2 does not ship and the board is reconsidered, not extended." A plan this self-aware about avoidance should name the condition under which its own artifact has failed.

Without this, "MVP that ships value early" is a structure on paper that the build will run through without ever stopping to check the value landed.

### A3. Phase 1a does not separate the critical path from the independent milestones, so "ships value early" is asserted, not sequenced

Phase 1a is eleven milestones: M0, M0b, M0c, M1, M2, M3, M4, M5, C1, M7, M7b, M8a. The plan says header position equals run order (line 533), which implies a strict linear chain. But several of these are independent of the dogfoodable paint and several are hard prerequisites for it. Treating them as one flat ordered list buries the actual critical path and works against the "value early" goal:

- True critical path to a painted, real-data Home: M0 (fixtures) -> M1 (tab fields, needed by the mapper) -> M3 (Home slot + render seam) -> M4 (reader) -> M5 (IPC) -> M7 (formatRelative/ageColorClass) -> M7b (shadcn primitives) -> M8a (paint). That chain is the thing that ships value.
- M0b (logger gate) is a hard SECURITY prerequisite of M8a (it must precede the first real-data render, correctly stated at line 535) but is NOT on the rendering critical path; it is a parallel gate.
- M0c (scrubFreeText test), M2 (motion-safe on TabIndicator), and C1 (remote token) are fully INDEPENDENT of the paint. M2 fixes the existing tab bar. C1 hardens an existing remote endpoint. M0c ships a tested-but-unwired pure function. None of them block M8a and none depend on it.

Recommend: re-present Phase 1a as a short dependency statement, not a flat list. "Critical path: M0 -> M1 -> M3 -> M4 -> M5 -> M7 -> M7b -> M8a. Hard gate before M8a: M0b. Independent (any time in 1a, parallelizable): M0c, M2, C1." This is exactly the "decompose to fit, one change one rollback" discipline the plan already follows; making the dependency graph explicit is what lets the build ship the value spine first and slot the independent hardening around it, instead of running eleven milestones in a line and reaching the first dogfoodable artifact only at milestone eleven.

This also surfaces a real question the flat list hides: must C1 (remote token hardening) land before M8a? C1 protects the remote surface, which Home does not even use in Phase 1 (Home is desktop-only, 2.9). C1 is correctly a Phase-1 milestone because the dashboard raises the value of the endpoint (R-9), but it is not a blocker for the desktop MVP paint. Saying so lets the MVP land without waiting on it.

### A4. The "N closed since open" resolved-set still has no named owner or reset-mechanics location, only a behavior description

Round 2 (A3) got the count reframed to honest "since open" and in-memory (line 69, good). But round 3 still does not say WHERE the resolved-set lives or HOW it is fed, and that gap will surface mid-build as an unscoped sub-task inside M8b, which is the boringly-small violation the plan works to avoid.

Specifics the plan leaves open:
- Owner: is the resolved-set in MAIN (the `ProgramBoardReader`, which already sees every poll and every lane transition) or in the RENDERER (HomeView, which only sees the pushed state snapshots)? Done-lane crossing detection requires comparing the current poll's lanes to the prior poll's lanes. The reader (M4) is the only component that holds prior-vs-current state across polls; the renderer gets discrete snapshots. So the crossing detection belongs in MAIN, computed in M4's reader, and surfaced as a field, not recomputed in M8b's renderer. The plan never says this and M8b's body (line 632) reads as if the renderer owns it ("add the 'N closed since open' in-memory resolved-set source").
- Reset: "reset on app launch" (line 69) is stated, but the reader is a long-lived main-process object; "app launch" for it means process start, which is fine, but the plan should say the set resets at `ProgramBoardReader` construction, not at renderer reload (a renderer reload must NOT zero the count, or a refresh erases the day's payoff). This is a real edge: the renderer can reload without the main process restarting.
- Feed cadence: crossings are detected on the ~20s poll tick (the reader's cadence), not the 60s producer cadence and not on watch events alone. Say so, because a crossing observed only via a watch event that the poll later confirms must not double-count.

Fix: move the resolved-set into M4's reader scope (it is the component with prior-poll memory and the right lifecycle), give it one line in M4's DoD ("a card observed in a non-Done lane then in Done across two polls increments a reset-on-construction count, surfaced as a field; a renderer reload does not reset it"), and reduce M8b to consuming the field plus the settle beat. That keeps M8b genuinely one-change and puts the cross-poll state where the lifecycle is correct.

---

## B. Should-fix (raises reviewability and de-risks the build)

### B1. The MVP cut should state a single demo acceptance sentence, not only per-milestone DoDs

Every milestone has a falsifiable DoD, which is excellent. What the plan lacks is one sentence that defines "Phase 1a is shippable" as a user-observable demo, distinct from "all the milestone tests are green." A reviewer or Mark should be able to read one line and know what the MVP does. Suggest adding to the Phase-1a cut line: "Acceptance: launching the app and selecting Home shows, against live `state.json`, the correct hero (deadline/almost-done/needs-you head), the goal-gradient line, the needs-you list in board order, and the right one of {loading, caught-up, not-running, degraded}; the hero's primary action [copies / opens Claude per A1]." This is the thing you can actually demo, and it is the bridge between the green test suite and "value landed." It also forces the A1 decision into the open.

### B2. M2 (motion-safe) is correctly in Phase 1a but its placement implies it gates the paint; state that it is independent and also a standalone existing-bug fix

M2 adds `motion-safe:` to `TabIndicator.tsx:15` and `:27`. The plan correctly notes this is needed once the strip reuses TabIndicator (M9, Phase 1b) AND that it fixes the existing tab bar today (line 47, 570). But the strip is M9 (1b), not M8a (1a). So M2's reduced-motion value is not actually consumed until 1b. M2 in 1a is justified ONLY as a standalone fix to the existing bare-`animate-*` tab bar. That is a fine reason to ship it early (it is a real accessibility bug in shipped code, one change, one test, one rollback), but the plan should say that is why it is in 1a, rather than leaving a reader to assume M8a depends on it. One clause: "M2 ships in 1a as a standalone fix to the existing tab bar's ungated animations; the strip (M9, 1b) is the consumer that makes it load-bearing." This removes a phantom dependency from the critical-path reading in A3.

### B3. The Phase-2 milestone IDs are now non-contiguous (M6, M11, M12, M13) and the numbering no longer tracks run order; reconcile or note it

Round 2 forced a renumber and round 3 produced a set where Phase 2 is M6, M11, M12, M13 (line 537) and Phase 3 is M15-M19 (line 538), while M14 is the LAST Phase-1 milestone (line 665, "Phase 1 ships after M14"). So run order is M0..M10, M14, then M6, M11, M12, M13, then M15-M19. M6 (numerically early) runs after M14 (numerically late). The plan half-acknowledges this ("Header position equals run order," line 533, applies within a section but the IDs jump across sections). This is not a correctness defect but it is a reviewability and build-lane hazard: a contractor reading "M6" will assume it runs sixth. Either renumber Phase 2/3 to continue from M14 (M15, M16, M17... which then collides with the current Phase-3 IDs, so a full renumber), or add one explicit line: "Milestone IDs are stable labels, not run order; run order is M0-M10, M14, then Phase 2 (M6, M11, M12, M13), then Phase 3 (M15-M19). The numeric ID does not imply sequence across phases." The second is cheaper and honest. Pick it and stop the reader from inferring sequence from the integer.

### B4. M8a DoD should assert the hero-selection override precedence, not just that it "picks deadline/almost-done over newest-commit"

The 1.11 single-field override has a defined precedence: time-sensitive-within-5-days wins, ELSE dodAlmost-fewest-steps, ELSE producer needs-you head. M8a's DoD (line 627) tests "the override picks deadline/almost-done over newest-commit," and the test surface (line 626) covers the time-sensitive fixture and the single-item-DoD fixture separately. What is not pinned is the PRECEDENCE BETWEEN the two override branches: a fixture that is BOTH time-sensitive AND dodAlmost must pick the time-sensitive one (deadline beats 90%-killer, per 1.11 ordering). Without that test, a builder could implement dodAlmost-first and pass both single-condition tests while inverting the documented precedence. Add one fixture (a card that is both time-sensitive within 5 days and dodAlmost) and one assertion (hero is the time-sensitive card). This is the same class of bug the M4 single-item-DoD parity test was added to catch: a precedence that two independent tests each satisfy but their interaction breaks.

### B5. The notification demotion (`notifyOnIdle`, 9.4) is a Phase-1 behavior change but has no milestone, no DoD, and no rollback point

Section 9.4 and R-12 commit Phase 1 to demoting the idle toast behind a `notifyOnIdle` setting ("a `shouldNotify(tabId, kind)` predicate in `hook-router.ts` plus a store flag, mirroring M14's `startupView` pattern"). This is a real behavior change to shipped code (the idle ping the user relies on, per R6 item 2), and it is in Phase 1. But it appears in NO milestone in Section 7. It is not in the Phase 1a cut (line 535) or the Phase 1b cut (line 536). So a committed Phase-1 behavior change has no one-change/one-test/one-rollback milestone, which is exactly the boringly-small contract the plan enforces everywhere else. Either give it a milestone (it is a clean one: store flag + `shouldNotify` predicate + a test that `notifyOnIdle:false` suppresses the idle path while `requires_response` still fires, mirroring M14a/M14b structure) and place it in a phase cut, or explicitly move the demotion to Phase 3 with the rest of the notification policy and say so in 9.4. Right now it is a floating commitment with no rollback point. Given R6 item 2 made the no-regression default the priority, I lean toward: make it M14d (a Phase-1b sibling to the `startupView` work it already says it mirrors) so the one-toast-per-session amplification is addressed in the phase that ships the action board which causes it.

---

## C. Nits / polish (cheap, worth doing)

- C1. Open question 9 (PS7 vs PS5.1) is still a deferred Section-9 follow-up (line 793). Round 2 (C4) recommended folding `pwsh`-if-present into M10; round 3 left it deferred. For a Mark-facing tool on a PS7 workspace this is a real day-one papercut (the Open-PowerShell action lands the user in `powershell.exe` 5.1, not PS7, so profile path and `&&` chaining differ from everything else Mark uses). The shell-id plumbing exists (`platform.ts:15`). Reaffirming: make it an M10 sub-decision (spawn `pwsh` if on PATH, else `powershell.exe`), not a deferred question. One small change, removes a known annoyance from the action MVP. If A1 pulls only `openClaudeWithQuery` into 1a and leaves PowerShell in 1b/M10, this rides along with M10 cleanly.

- C2. Propagate the "and the existing suite still passes" DoD clause. Round 2 (C3) asked for this on M3, M14a, M0b. Round 3 has it on M1 (line 565, implied by "Quick check... web-client") but it is not uniform. Every milestone touching heavily-tested shared code (M3 touches `App.tsx`; M0b touches `logger.ts`; M14a touches `settings-store.ts`; C1 touches `web-remote-server.ts`; M2 touches `TabIndicator.tsx` which has an existing `TabIndicator.test.tsx`) should carry "`pnpm run test` still green" as the cheapest falsifiable regression DoD. M2 especially: there is an existing `tests/renderer/TabIndicator.test.tsx`, so M2's DoD should be "new reduced-motion assertion green AND the existing TabIndicator test still passes."

- C3. The workspace commit corollary (round 2 C5) is worth restating in Section 7's preamble: each milestone's "one rollback point" is a `/cad:milestone` candidate (a tag-able save point) the user green-lights; the rollback discipline does not require a pushed commit per milestone, consistent with AGENTS.md "Do NOT commit or push unless the user asks." The plan says "No commit or push without explicit user permission" (line 529) but does not connect "rollback point" to the milestone tag mechanism, leaving "rollback" slightly abstract.

- C4. Section 8 says Phase 2/3 milestones are "one change + one test + DoD + rollback, gated on real use of the prior phase" (line 671) but then 8.8 lists Phase-3 milestones as a "sketch" (line 728) without DoDs or rollback points. That is acceptable for Phase 3 (it is gated and far out), but say so: "Phase-3 milestones are sketches; each gets a full DoD + rollback when its phase gate opens, not now." Otherwise the Section-8 promise of full milestone discipline reads as unmet for the milestones actually shown there.

- C5. M7b's DoD (line 620) says "the three files exist in `components/ui/`; smoke green." Add the round-2 C2 observable: the vendor step is `pnpm dlx shadcn@latest add card skeleton tooltip` (not hand-vendored) and the files match the existing new-york style of the other eleven primitives. One line; prevents a hand-rolled `card.tsx` that diverges from the shadcn baseline the rest of the UI uses.

---

## D. What round 3 got right (keep these)

- The three-phase re-cut (board dogfooded first, enrichment gated, coaching default OFF and last) is the correct product spine, and the round-3 framing ("round 2 went from too thin to too busy," line 20) is an honest diagnosis that drove a real pruning. The carrots-to-one-thing reduction (one Phase-1 carrot, escape valve and coaching deferred) is the right anti-overwhelm call for the user.
- M0b is now IN Phase 1a and sequenced before the first real-data paint (line 535), fully resolving the round-2 A1 top finding. The CRITICAL logger leak no longer ships after the milestone that exposes it.
- The "N closed since open" honest reframe (line 69) is exactly right: in-memory, reset on launch, suppressed when zero, with the answered-session count deferred WITH its missing source named. This is the model for how to scope a feature down without faking a data source.
- M14 split into store / branch / picker (a/b/c, lines 654-663) resolves round-2 A4; the win the plan states (a picker-UI revert does not revert the persisted setting) is the correct rollback-granularity argument.
- The todo-cannot-be-a-free-text-query-hero scope decision is now stated (1.7 line 83) AND tested (5.6 line 461), closing round-2 B2. The B4 MVP-to-enriched continuity test (1a board-order hero equals 1b `rankItems[0]` for the common case) is in M8b's surface. Both prior should-fixes landed.
- DoD falsifiability held and improved: M9's "subordinate" adjective is replaced by a structural assertion (a strip row carries `text-muted-foreground`, line 641), and M16's stall-interrupt DoD now pins the non-reorder ADHD-safety property via motion arbitration (line 92). The two soft DoDs from round 2 A5 are both fixed.
- The single-field-override fixtures and the M4 single-item-DoD parity test (`incomplete-notes` `total:1`) show the plan is testing the live data's actual edges, not a hypothetical schema. The override being "load-bearing" because today's board order is newest-commit-first (verified live, appendix line 819) is the right justification for shipping it in the MVP rather than deferring to the ranker.

---

## Summary of the path to 9/10

Direction and grounding are right; round 3 closed round 2. The remaining work is in the phase boundaries:

1. Resolve the Phase-1a MVP contradiction: either pull `openClaudeWithQuery` into 1a so the MVP can do its headline action, or stop calling the copy-only 1a "the MVP" and move the "ships and is used" claim to after M10. Make line 22, line 535/536, and line 627 describe ONE MVP (A1). Top item.
2. Define the "Phase-1 real use" gate as an observable with a named decision-maker and an explicit kill criterion; the whole phase model rests on it (A2).
3. Re-present Phase 1a as a dependency graph (critical path vs independent/parallel milestones), not a flat ordered list, so "value early" is engineered not asserted (A3).
4. Move the "N closed since open" resolved-set into M4's reader (the component with cross-poll memory and the right lifecycle) and reduce M8b to consuming it (A4).
5. Add a one-sentence MVP demo acceptance (B1), give the Phase-1 `notifyOnIdle` demotion an actual milestone and rollback point (B5), pin the override precedence with a both-conditions fixture (B4), and note that milestone IDs are labels not run order (B3).
