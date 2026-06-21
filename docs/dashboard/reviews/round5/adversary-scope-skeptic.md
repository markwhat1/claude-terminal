# Adversary review (round 5): Scope / YAGNI skeptic

Reviewer lens: is this secretly two products fused? over-engineered? will Phase 1 actually ship and be dogfooded? Attack untestable claims and scope creep. Default to finding real defects.

Plan reviewed: `docs/dashboard/PLAN.md` (round 5, 1002 lines) + `docs/dashboard/PLAN-PHASE-2-3.md` (76 lines), against the `dashboard` worktree at HEAD `ce2e9e0`. Live `state.json` re-verified at `C:\Users\Mark\Claude-Code\dashboard\state.json`.

## Verdict up front

Round 5 genuinely closed the two coupled HIGH defects I (the scope lens) raised in round 4. D1 is fixed: M8a now ships a "Home" entry affordance (the tab-strip/sidebar item that calls `handleSelectTab(HOME_TAB_ID)`), so the read-only MVP is reachable without emptying the app. D2 is fixed in mechanism: M14a (store key) + M14b (resolve wiring) moved into Phase 1, so `startupView:'home'` exists during the gate's own window. D4 is fixed: M4 was split into M4 (reader) + M4b (resolved-set). The program-board seam is still clean (app reads `state.json`, owns no producer code, every producer citation carries the `src/program_board/` prefix). This is not the two-products-fused failure.

The empirical spine holds. I re-ran the live data: 18 programs, 6 needs-you cards ALL `dod.met:0`, `marketing-roi` is `paused:true + needs_you:true`, `practice-reports` carries `time_sensitive:2026-06-22`, `incomplete-notes` is `dod{0,1}`, 11 active/blocked at `dod.total:0`. Every "verified live" claim in the plan matches disk. The file:line discipline is real and I am not disputing it.

What I am disputing: round 5 fixed the round-4 seams but reintroduced the SAME class of defect at the new seams, and did not fix two cleanup items it claimed to fix. Specifically: (1) the Phase-0 "critical path to first paint" now drags a Phase-1-only dependency (M4b) in front of the MVP, re-bloating the exact thing the M4/M4b split was supposed to un-bloat; (2) the two Phase-1 ship criteria disagree with each other on whether M14a is required; (3) the gate is "measurable" only via hand-editing a JSON file, which is a fiction for a 5-working-day default-landing trial; (4) the plan GREW (904 to 1002 lines) while claiming the extraction made the shipping slice fit in one head; (5) the one sanctioned carrot quietly became a two-tier calibrated payout, scope creep into the single element the plan points to as proof of restraint.

None of these is fatal. All are small wording/sequencing fixes. But they are the same "the plan's own mechanics contradict its claims" pattern, and they survived because the document is now long enough to hide them.

---

## Defects

### D1 (HIGH) M4b sits on the Phase-0 "critical path to first paint" but is a Phase-1 dependency the MVP never consumes

The critical path to first paint is stated as `M0 -> M1 -> M3a -> M4 -> M4b -> M5 -> M7 -> M7b -> M8a` (line 709). M4b is "the done-lane resolved-set (progress-guarded crossing detection + closed.json persistence)" (line 783), whose own change list says it "surfaces `closedToday`" and "is consumed by M8b" (lines 785-789). M8b is a PHASE 1 milestone (line 712, 824). M8a, the Phase-0 read-only paint, is the "first dogfoodable artifact" and its DoD is "read-only hero + needs-you list + goal-gradient + the four non-strobing states + Copy" (line 709, 821).

I checked M8a's full change/test/DoD (lines 819-821) for any consumption of `closedToday` or the resolved-set: there is none. The single "N closed today" token in M8a's test (line 820) is inside the caught-up-state copy assertion, and even that is a copy/suppression check, not a wiring to M4b's field (M8a has no `closedToday` data source; the resolved-set is owned in MAIN and surfaced for M8b to consume per line 826 "CONSUME the `closedToday` field from M4b"). So M8a does not depend on M4b at all.

Where it fails: the round-4 D4 fix split M4b OUT of M4 precisely so the Phase-0 reader could land "boringly small" without the cross-poll persistence subsystem riding along. Round 5 then put M4b back on the Phase-0 critical path as a hard predecessor of M8a. The split achieved nothing for first-paint scope: a builder following the critical path must build the closed.json persistence, the 24h prune, the reset-at-construction, and the progress-guarded crossing detection (M4b's whole test list, lines 787-789) BEFORE the read-only MVP paints, even though the MVP renders none of it. This is the YAGNI violation the split was supposed to remove, relocated one milestone over.

Minimal fix: remove M4b from the Phase-0 critical path. The first-paint path is `M0 -> M1 -> M3a -> M4 -> M5 -> M7 -> M7b -> M8a` (gated on M0b). Move M4b to the Phase-1 lane beside M8b (its only consumer), where the run-order line on line 25 already implicitly puts the payoff. One-line edit to line 709, plus confirm line 25's Phase-0 grouping does not list M4b before M8a as a gating predecessor (it currently does: "M4, M4b, M5 ... M8a (Phase 0)").

### D2 (MEDIUM) The two Phase-1 ship criteria contradict each other on whether M14a is required

Line 58: "PHASE 1 SHIPS after M10 + M14b + M14d." (M14a omitted.)
Line 884: "Phase 1 ships after M10 + M14a + M14b + M14d." (M14a included.)

These are the two authoritative statements of when Phase 1 is done, and they disagree. M14a is the `startupView` store KEY; M14b (the resolve wiring) reads it. Per the plan's own logic (line 872), M14a is the milestone that makes the gate measurable; M14b without M14a's persisted key reads a value that is never written. So line 58's omission is not harmless shorthand: it drops the exact milestone the round-5 D2 fix added to make the gate falsifiable. A builder using line 58 as the acceptance checklist ships Phase 1, declares the gate window open, and finds `startupView` has no persisted key to set.

Where it fails: the demo-acceptance sentence (line 58) is explicitly billed as "the user-observable sentence that says value landed, distinct from the test lists" (line 55), i.e. the thing a human reads to decide Phase 1 is done. It is the most-read line and it is wrong.

Minimal fix: line 58 reads "PHASE 1 SHIPS after M10 + M14a + M14b + M14d" to match line 884 and line 712.

### D3 (MEDIUM) The gate is "measurable" only by hand-editing a JSON settings file, which is not a realistic 5-day default-landing trial

The gate's condition (1) is: "Mark has run Phase 1 with `startupView:'home'` as the DEFAULT LANDING surface for at least 5 working days" (line 53). The round-5 fix says this is now measurable because M14a/b ship the setting in Phase 1. But the picker UI (M14c) is Phase 2, so the plan's actual mechanism for setting it in Phase 1 is: "`startupView:'home'` is set by editing the store, which is sufficient for the gate window" (line 872). The store is `app.getPath('userData')/claude-terminal-settings.json` (verified `settings-store.ts:29`).

Two problems. First, "run it as my default landing for 5 working days" requires Mark to hand-edit a JSON file, and the KILL criterion ("reverts `startupView` to `'lastSession'`", line 53) requires him to hand-edit it back to abandon it. A gate whose pass-and-fail both route through manual JSON surgery is technically observable but practically a vibe: the friction of editing JSON to opt in is itself a confound (an ADHD user who has to edit a config file to turn on the calm surface has been handed an activation tax, R-10's exact failure mode), and there is no instrumentation that records whether `home` was actually the landing on N of the last 5 days. Second, the plan ALSO ships a Home entry affordance (M8a) that opens Home on click without touching `startupView`. So the realistic Phase-1 behavior is "Mark clicks Home sometimes," not "Home is his default landing," and the gate's condition (1) measures the latter while the app only makes the former easy.

Where it fails: this is the round-4 D2 (circular dependency) re-emerging as a usability gap rather than a sequencing gap. The mechanism now exists in Phase 1, but the gate's wording ("default landing for 5 working days") describes a workflow the Phase-1 app does not actually support without JSON editing, so the gate degrades toward the "deliberate Mark sign-off" it was meant to replace. The plan half-admits this (R-10, line 949, offers Option A auto-resume so Home is genuinely first), but R-10's fix is itself gated on an open question (#3) and is not wired into the gate's condition (1).

Minimal fix: restate the gate's condition (1) in terms the Phase-1 app actually produces. Either (a) accept R-10 Option A (auto-resume + Home-first) and make the gate "Home was the first surface on >=N of the last working days," or (b) drop "default landing" and state the gate as "Mark deliberately chose Home as his first action on most working days for two weeks (entry affordance clicks), judged by his own sign-off." Do not keep selling "default landing for 5 working days" as measurable when the only Phase-1 way to make Home the default is editing JSON.

### D4 (MEDIUM) The plan grew 904 -> 1002 lines while claiming the extraction made the shipping slice fit in one head; D6 from round 4 is not fixed and is arguably worse

Round 4's scope review (D6) flagged PLAN.md as past the "fits in one head" line at 904 lines, and asked to move the inline Phase-2/3 sub-sections (1.6, 1.8, 1.9, the deferred Section 5 tiers) into the sibling file. Round 5's own scope note (line 5) restates the goal: "the slice that ships first fits in one head, per the workspace decompose-to-fit rule."

Measured: PLAN.md is now 1002 lines, up 98 from round 4. PLAN-PHASE-2-3.md is 76 lines. The Phase-2/3 sub-sections round 4 asked to move are STILL inline in PLAN.md: 1.6 (re-roll, Phase 2, lines 129-131), 1.8 (stall-interrupt, Phase 3, lines 156-158), 1.9 (commitment mirror, Phase 3, lines 160-162), and Section 5's tier list still describes Tier 5 (Phase 2) and the deferred subset (lines 582, 601). The round-5 additions (the two-tier payout justification, the M4b persistence argument, the per-defect "the integration skeptic's X" / "architect MF-Y" attributions, the expanded R-9b/R-11/R-14 PHI prose) outweigh anything extracted.

Where it fails: this is not aesthetic. D2 (the M14a ship-criteria contradiction), D3 (the gate-vs-JSON gap), and the dangling cross-reference (D6 below) all survived review because the relevant statements are hundreds of lines apart in a document no reviewer can hold at once. The density is the mechanism by which the contradictions hide; the plan even argues this itself in round 4's D6. The "fits in one head" claim (line 5) is false on its face for a 1002-line plan.

Minimal fix: actually move the Phase-2/3 sub-sections (1.6, 1.8, 1.9, the Phase-2 parts of 1.3, the deferred Section 5 tier detail) into PLAN-PHASE-2-3.md, leaving one-line pointers, as round 4 already requested. Stop adding the "this defect was raised by lens X" attributions to PLAN.md; they are review-process archaeology that belongs in the review files, not the plan a builder executes. Target a Phase-0/1 plan a builder reads in one sitting.

### D5 (LOW) The "one sanctioned carrot" became a two-tier calibrated payout; the single element the plan cites as proof of restraint quietly grew

The plan's restraint argument rests on a precise count: "the dedicated carrot is one (the done-lane payoff)" (line 51), "ONE dedicated carrot adds a resting INTERACTION affordance" (line 70). Round 5 then redefines that one carrot as a TWO-TIER calibrated payout (line 38, line 110-113): an ordinary finish gets the calm settle + count tick, and an "avoidance-category loop closed" gets "one slightly longer, still-calm, still-motion-safe, no-confetti beat" with its own `avoidanceClose` flag (line 118, line 787). The louder tier requires the M13 classifier (Phase 2) and is "decided as a Phase-1 design commitment now" (line 113).

So the one carrot is now: two payout tiers, a second transient flag (`avoidanceClose` beside `justResolved`), a dependency on the Phase-2 avoidance classifier, and an open question for Mark to sign off the calibration (open question 8, line 964). That is more surface than "one carrot, one settle." The plan defends the wording by redefining "restrained" to mean "calibrated, not uniform" (line 113), which is the same rhetorical move round 4's D5 flagged: relabeling growth as restraint rather than owning it.

Where it fails: softer than D1-D4 because the two-tier design is defensible on its merits (a low-baseline brain should feel the rare big win). The defect is the claim, not the feature: a plan that points to "exactly one carrot" as its YAGNI evidence, then ships that carrot as a two-tier, two-flag, classifier-dependent, sign-off-gated payout, is under-counting its own scope the same way the "seven behaviors vs one carrot" labeling did. The honest framing exists (line 51 admits seven behaviors), but the "one carrot" restraint claim coexists with a carrot that is no longer one thing.

Minimal fix: own it in one sentence. The done-lane payoff is one carrot with two calibrated tiers (ordinary finish in Phase 1, louder avoidance-close in Phase 2); the second tier is a deliberate Phase-2 add, not part of the Phase-1 carrot. Drop "one sanctioned dopamine payout" (line 38) as the restraint proof, or scope it to "one Phase-1 payout tier." The feature can stay; the restraint claim should match it.

### D6 (LOW) Dangling cross-reference: R-13 cites a section titled "What round 4 changes" that no longer exists

Line 952 (R-13) cites 'the Phase gate's kill criterion (Section "What round 4 changes")'. The section is now titled "What round 5 changes (and why)" (line 27). Every other reference in the plan was updated to "What round 5 changes" (lines 53, 60, 712, 884, 890); this one was missed.

Where it fails: trivial on its own, but it is direct evidence for D4: the document is large enough that a global rename of the round label missed an instance, and that instance sits in the risk register, the section round 4's D3 already caught as stale. A builder chasing the kill criterion from R-13 follows a dead pointer.

Minimal fix: line 952, change "What round 4 changes" to "What round 5 changes."

---

## What is NOT a defect (to preempt counterarguments)

- The round-4 HIGHs are genuinely fixed. D1 (Home unreachable): M8a ships the entry affordance with a test that activating it sets the active tab to the Home id (line 820). D2 (gate circular dep, sequencing half): M14a/b are in Phase 1 (line 712, 872). I am not re-raising either; D3 here is a residual usability gap, not the sequencing defect.
- The M4/M4b split is real (D4 from round 4 resolved). My D1 here is about M4b's PLACEMENT on the critical path, not the split itself.
- The risk register was rewritten to match the cuts (round-4 D3): R-1 and R-2 now correctly state the HTTP fallback and watcher as deferred follow-ups, not Phase-1 mitigations (lines 939-940). Resolved.
- The program-board seam is clean. The app reads `state.json` and `closed.json`/`todos.json` under `userData`; it owns no producer code; the producer/consumer division of labor (Section 4.3) is explicit. Not two-products-fused.
- The `rankItems` Phase-2 deferral (Section 5 "Phase split YAGNI", line 562) remains the model YAGNI win: Phase 1 uses the few-line single-field override (1.11), the tiered engine waits for M6. Correct, and the round-5 honesty about the override only ELEVATING when it reorders (line 77) is a real tightening.
- M0c (scrubFreeText) correctly stays in Phase 3 beside its only caller M19 (line 738), and the M0b prompt-prefix lines use id-only redaction, not the scrubber (line 740, 389). The dead-code-two-phases-early pattern is avoided.

## Summary

Round 5 closed the two decisive round-4 HIGHs (Home reachability, gate sequencing) and the M4 split. The seam fixes are real. But the revision reintroduced the same "mechanics contradict the claims" pattern at the new seams: M4b, just split out to un-bloat first paint, is back on the Phase-0 critical path as a predecessor the MVP never consumes (D1, HIGH); the two Phase-1 ship criteria disagree on M14a (D2, MEDIUM); the gate is "measurable" only by hand-editing JSON, which is not the 5-day default-landing trial it claims (D3, MEDIUM); the plan grew to 1002 lines while claiming it fits in one head, with the Phase-2/3 sub-sections round 4 asked to move still inline (D4, MEDIUM); the one sanctioned carrot became a two-tier calibrated payout (D5, LOW); and a stale "What round 4 changes" pointer sits in the risk register (D6, LOW). All six are wording/sequencing fixes, no code, no scope change. Fix D1 (un-gate first paint from M4b) and D2 (reconcile the ship criteria) and the Phase-0/1 critical path is honest; the rest keep the ledger consistent. The plan is close, and it is not over-engineered at the architecture level; it is over-DOCUMENTED, and the over-documentation is now the thing hiding the small contradictions.
