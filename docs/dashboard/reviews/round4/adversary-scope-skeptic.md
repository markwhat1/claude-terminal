# Adversary review (round 4): Scope / YAGNI skeptic

Reviewer lens: is this secretly two products fused? over-engineered? will Phase 1 actually ship and be dogfooded? Attack untestable claims and scope creep. Default to finding real defects.

Plan reviewed: `docs/dashboard/PLAN.md` (round 4, 904 lines) + `docs/dashboard/PLAN-PHASE-2-3.md`, against the `dashboard` worktree at HEAD `ce2e9e0`.

## Verdict up front

Round 4 did real work on the round-3 scope findings, and it deserves the credit: the Phase 0 / Phase 1 split is now explicit, C1 (remote auth hardening) is genuinely cut to a filed issue, M4's watcher and cold-file HTTP are cut from the shipped change, M0c moved to Phase 3 beside its caller, M14 (startupView) deferred to Phase 2, and the inter-phase gate is now an observable (5 days as default landing + one named friction). Those were my round-3 D1/D2/D5/D6/D7/D8. They are addressed in the body text.

But the revision introduced a new, self-defeating contradiction at the seam of those fixes, and left the risk register stale relative to the cuts. The headline problem: the plan deferred the ONLY two mechanisms that can make Home the landing surface (the last-tab-close route, and `startupView:'home'`) in a way that leaves the "first dogfoodable artifact" (M8a) with no rendered, clickable way to reach it, AND makes the Phase gate's own precondition unsatisfiable until after the gate is passed. The phases are cleaner on paper than they are reachable in the running app.

The file:line discipline remains strong. I re-verified the load-bearing anchors: `logger.init(dir)` does join the log into `<dir>/.claude-terminal/logs/main.log` (`logger.ts:60-64`) and `emit` mirrors every level via `executeJavaScript` (`logger.ts:42-51`); `TabBar` renders from `tabs[]` and takes no Home affordance (`TabBar.tsx:11-30`); `handleSelectTab` is wired into `TabBar.onSelectTab` (`App.tsx:560`). The citations are not the problem. Reachability and internal consistency are.

---

## Defects

### D1 (HIGH) M8a, the "first dogfoodable artifact," has no rendered way to reach it in Phase 0/1

`HomeView` is reached only when `activeTabId === HOME_TAB_ID` (the sibling render seam, `App.tsx:577-583`, plan line 188). The plan enumerates EVERY place that sets `activeTabId` to Home in Phase 0/1 (lines 163, 190, 198-201, 261, 698, 784). Going through them:

- `handleSelectTab` short-circuit (line 190): only sets Home if something CALLS `handleSelectTab(HOME_TAB_ID)`. `handleSelectTab` is wired to `TabBar.onSelectTab` (`App.tsx:560`), and `TabBar` renders only from `tabs[]` (`TabBar.tsx:12`), which by the separate-slot decision (2.3) NEVER contains Home. So nothing in the rendered tab strip can call it with the Home id.
- `onTabRemoved` route (M3b, lines 198-201, 698): sets Home only when the LAST tab (or the last same-project tab) closes. That is reaching Home by emptying the terminal, the opposite of a daily landing surface.
- `startupView:'home'` (line 784, M14b): the only deliberate "land on Home" path. DEFERRED to the start of Phase 2 (line 641, 776).

So across Phase 0 and Phase 1 there is no nav button, tab, menu item, or keybinding that deliberately opens Home. M8a's change list (line 739) renders `HomeView.tsx` and its test mounts the component in isolation (`tests/renderer/HomeView.test.tsx`, line 740); the DoD goes green (line 741) while the surface is unreachable in the running app except by closing all tabs. "M8a is the first dogfoodable artifact" (line 638) and "Home is OPENABLE in Phase 0/1" (line 778) are both overstated: you cannot dogfood a landing surface you can only land on by emptying the app.

Where it fails: the entire phased bet (PLAN.md "the whole phased bet depends on Phase 1 earning daily opens", line 151; R-13) rests on Mark using Home daily through Phase 0/1. With no entry affordance and `startupView` deferred, he structurally cannot, so the read-only MVP cannot actually be exercised before the heavier interactive milestones land.

Minimal fix: add ONE small Phase-0 affordance to reach Home, in the same milestone that makes it dogfoodable. Either a "Home" item in the tab strip or sidebar that calls `handleSelectTab(HOME_TAB_ID)` (the short-circuit already exists), or a keybinding. This is a few lines and one render-test assertion (clicking it sets active to the Home id), and it belongs in M8a (or a tiny M8a-prerequisite), not M14. Without it, M8a is a tested-but-unreachable component.

### D2 (HIGH) The Phase gate's precondition cannot be met until after the gate is passed (circular dependency)

The gate (line 34) requires, as condition (1): "Mark has run Phase 1 as the default landing surface (`startupView:'home'`) for at least 5 working days." The kill criterion (line 34) is triggered if "Mark ... reverts `startupView` to `'lastSession'`."

But `startupView` persistence + the picker (M14a/b/c) is DEFERRED to the START OF PHASE 2 (lines 641, 776-778, and PLAN-PHASE-2-3.md line 11). The default stays `'lastSession'` with "no Phase-1 behavior change" (line 778). So during Phase 1, `startupView:'home'` does not exist as a persisted setting and cannot be set as the default landing. The gate that decides whether to ENTER Phase 2 depends on a setting that is itself a Phase 2 milestone.

Where it fails: this is the round-4 fix for my round-3 D6 (make the gate falsifiable) colliding with the round-4 fix for D8 (defer the startupView setting). Each is locally reasonable; together the gate is unsatisfiable as written. A builder who reaches the gate finds condition (1) unobservable (the mechanism ships in Phase 2), so the gate degrades back to the vibe it was meant to replace, and the round-2 failure (build ahead of validation) recurs, exactly the outcome the gate exists to prevent.

Minimal fix: pick one. Either (a) pull M14a/b (the store key + the `resolveStartupActiveId` wiring, NOT necessarily the picker UI M14c) back into Phase 1 so `startupView:'home'` is settable during the 5-day window, OR (b) restate the gate's condition (1) in terms a Phase-1 user can actually produce (for example "Mark opens Home manually as his first action on >=N of the last working days," which D1's nav affordance makes measurable, or simply a deliberate Mark sign-off after a stated trial period) and drop the `startupView`-based wording. Do not leave a gate whose precondition ships only after the gate.

### D3 (MEDIUM) The risk register (Section 10) was not updated to the round-4 cuts; it still sells cut subsystems as mitigations

Section 4.3 and M4 explicitly CUT the directory watcher and the cold-file HTTP fallback from the shipped Phase-1 change ("no watcher, no cold-file HTTP in the shipped change/test", line 705; "M4 tests the poll-only correctness path ... No watcher assertion", line 427). But Section 10 still lists them as live mitigations:

- R-1 (line 845): "Mitigation: cold-file HTTP fallback + ...". The HTTP fallback is a deferred follow-up (4.3 item 3, line 429), not a Phase-1 mitigation.
- R-2 (line 846): "Mitigation: the ~20s poll is primary and tested as the backstop; the watcher re-reads on ANY event and is re-armed on error. M4 tests both the never-arms and the `filename:null` cases." The watcher is cut from M4 entirely, M4 has NO watcher assertion (line 427), and 4.3 (line 428) explicitly says the deaf-handle failure is undetectable so "re-armed on error" is the exact claim the round-4 body retracted as a defect ("DO NOT claim it is 're-armed on error' ... there is no signal to re-arm on").

Where it fails: R-1/R-2 are the two risks most likely to be consulted by a builder hitting a board-down or stale-data situation. They point at code (the watcher with re-arm, the HTTP fallback, M4 tests of `filename:null`) that M4 does not build. A builder trusting the risk register will either re-introduce the cut subsystems (re-bloating M4, undoing my round-3 D5 fix) or waste time looking for tests that do not exist. The register contradicts the milestone ledger, which is the same class of inconsistency I flagged in round 3.

Minimal fix: rewrite R-1 and R-2 to match the cuts. R-1 mitigation = the four distinct states + validated path resolution + last-good retention; the cold-file HTTP fallback is a named follow-up, not a Phase-1 mitigation. R-2 = the ~20s poll is the sole Phase-1 mechanism and is tested; the watcher is a deferred best-effort latency option whose deaf-handle failure is undetectable, so it is explicitly NOT relied on. Two-paragraph edit, no code.

### D4 (MEDIUM) M4 is still four responsibilities in one "boringly-small" milestone, now with the closed.json owner folded in

Round 4 correctly cut M4's watcher and HTTP fallback (my D5). But it then folded the done-lane resolved-set ownership INTO M4 (lines 703-710): the reader now also tracks needs-you membership across polls, detects cards leaving the set, writes/prunes `<workspaceRoot>/dashboard/closed.json` as a rolling 24h list, reconstructs that set from disk at construction, and surfaces `closedToday`. So M4 is: (1) poll + retry + last-good reader, (2) the path validator, (3) the two timezone parsers, (4) the cross-poll resolved-set with its own persistence file and prune logic. Its test list has ~10 distinct assertions (line 708), spanning parse, freshness bands, DoD-parity, paused exclusion, last-good, cross-poll crossing detection, reset-at-construction, 24h prune, and three path-safety rejections, plus real temp files for two different on-disk files.

Where it fails: this is the same "one milestone, four subsystems" pattern my round-3 D5 named, just with a different fourth subsystem swapped in. The plan's own rule is "one change, one expected vitest test, one rollback point" (line 38, 629). M4 is at least three changes (a reader, a persisted resolved-set with a second file, and the shared pure helpers) and ~10 tests. The closed.json resolved-set is independently testable and has a clean seam (it consumes the reader's poll ticks); it does not need to ride the reader's first landing.

Minimal fix: split M4. M4 = the reader (poll + retry + last-good + the shared parsers + path validator). M4b = the done-lane resolved-set (cross-poll crossing detection + `closed.json` persistence + prune + `closedToday`), which depends on M4 and is consumed by M8b. Two rollback points, each honestly "boringly small," each with a focused test set. The PM-lens argument for putting the resolved-set in MAIN (line 705) is sound and unaffected by the split.

### D5 (MEDIUM) "One carrot, restrained" is still contradicted by the shipped Phase-0+1 behavior count; round 4 half-concedes this and keeps the label anyway

Round 4 added an honest paragraph (line 32): Phase 0+1 "ships seven small ADHD behaviors" and "the earlier 'one carrot' framing is dropped." Good. But the document then keeps using the restraint framing throughout: 1.5 is titled "the one Phase-1 carrot, restrained" (line 78); Section 1 (line 46) still says "exactly ONE carrot adds a resting affordance ... the rest of the motivational weight is carried by the calm visual layer." The "seven behaviors" admission and the "one carrot, restrained" framing coexist in the same plan.

The seven (line 32, cross-checked to milestones): goal-gradient (1.10, M8a), single-field hero override (1.11, M8a), done-lane payoff + settle (1.5, M8b), caught-up pull-forward (4.6, M8b), empty-board live-tab hero (4.6, M8b), idle-age floor (5.2, M9), saturation-capped hero band (1.4, M8b). Each carries its own copy-module entries, edge cases, and tests. That is materially more than "one carrot," whatever the affordance-vs-calm-layer taxonomy says. The distinction between "a carrot (resting affordance)" and "a calm-layer behavior (no interaction surface)" is a real one, but it is doing rhetorical work here: it lets the plan claim restraint while shipping seven behaviors by classifying six of them as not-carrots.

Where it fails: this is softer than D1/D2 because round 4 DID add the honest sentence. The residual defect is that the honest sentence and the restraint labels both survive, so a reader skimming section titles (1.5 "the one Phase-1 carrot, restrained") still gets the under-count. The scope is fine if owned; the labeling is half-owned.

Minimal fix: finish the concession. Retitle 1.5 to drop "restrained," and edit the Section 1 line 46 sentence so it does not claim "exactly ONE carrot ... the rest is calm layer" when line 32 already admits seven behaviors. State plainly: Phase 0+1 is a full calm-and-motivational board (seven behaviors), and that is the intended scope. One-paragraph reconciliation, no code, no scope change, just stop claiming restraint the milestone list does not show.

### D6 (LOW) The plan pair is still past the "fits in one head" line, and the split did not fully relocate Phase-2/3 detail

Round 4 extracted Phase 2/3 to `PLAN-PHASE-2-3.md` (my round-3 D9), which is the right move. But PLAN.md is now 904 lines (up from round 3's 820), longer than the document I called too big, because the round-4 additions (the new gate prose, the broadened done-lane justification, the closed.json persistence argument, the per-defect "the integration skeptic's X" / "the architect MF-Y" attributions) outweigh what moved out. And Phase-1 sections still carry substantial Phase-2/3 detail inline: 1.6 (re-roll, Phase 2) is a full sub-section with park-persistence design; 1.8/1.9 (Phase 3 stall-interrupt and lock-in) are full sub-sections; Section 5's tiers describe Tier 5 (Phase 2) and the deferred subset. The "shipping slice fits in one head" goal (line 5) is not yet met.

Where it fails: a builder still cannot hold the Phase-1 slice without paging through Phase-2/3 design embedded in Sections 1 and 5. The density that hides contradictions like D2 (gate vs deferred startupView) and D3 (stale risk register) is itself a symptom: those two contradictions survived review precisely because the relevant statements are ~800 lines apart.

Minimal fix: move the Phase-2 and Phase-3 sub-sections that are currently inline in Section 1 (1.6, 1.8, 1.9, and the Phase-2 parts of 1.3) and the deferred-tier detail in Section 5 into `PLAN-PHASE-2-3.md`, leaving one-line pointers. Target a Phase-1 PLAN.md that a builder can read in one sitting; the round-4 additions are worth keeping but several belong in the sibling file.

---

## What is NOT a defect (to preempt counterarguments)

- The C1 cut is real this time. Round 4 removed it from the milestone list (line 719, "CUT from the dashboard") and files it as a separate security issue. My round-3 D2 is resolved.
- The M0c move is real (line 667-669): the scrubber now sits beside M19 in Phase 3, or lands in M0b only if it gains a real caller (the prompt-prefix redaction). Either way it does not ship caller-less. My round-3 D7 is resolved.
- The M4 watcher/HTTP cut from the SHIPPED change is real in Section 4.3 and the M4 change list (lines 425-429, 705). The defect that remains (D3) is that the risk register did not get the memo, and (D4) that a different fourth subsystem got folded in. The original D5 cut itself stands.
- The program-board seam is still clean: the app consumes `state.json`, owns no producer code, every producer citation carries the `src/program_board/` prefix. This is not the two-products-fused failure.
- The `rankItems` Phase-2 deferral (Section 5 "Phase split (YAGNI)") remains the model YAGNI win: Phase 1 uses the few-line single-field override, the tiered engine waits. Correct.

## Summary

Round 4 fixed the round-3 scope findings in the body text but introduced two new HIGH defects at the seams of those fixes, and left the risk register stale. The two HIGHs are coupled and decisive: D1 (no rendered way to reach Home in Phase 0/1) and D2 (the gate's `startupView` precondition ships only in Phase 2, after the gate). Together they mean the read-only MVP cannot be dogfooded and the gate that protects against over-building cannot be evaluated, which is the exact round-2 failure mode the whole re-cut exists to prevent. Both are small code/wording fixes (one nav affordance; pull M14a/b forward OR restate the gate). Fix those two and the phase discipline becomes real instead of asserted; leave them and "each phase ships and gets used first" is once again a claim the plan's own mechanics contradict. D3 (stale R-1/R-2), D4 (M4 still four responsibilities), and D5 (the "one carrot" label vs seven behaviors) are cleanup that keeps the ledger honest.
