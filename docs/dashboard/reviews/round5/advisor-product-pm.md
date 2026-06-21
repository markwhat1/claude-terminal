# Advisor review (round 5): Product / PM lens

Plan reviewed: `docs/dashboard/PLAN.md` (round 5 revision) + `docs/dashboard/PLAN-PHASE-2-3.md` (dashboard worktree, branch `dashboard`, HEAD `ce2e9e0`, verified live).
Lens: the Phase 0/1/2 split, the MVP cut that ships value early, boringly-small milestones with DoD + rollback, the vitest test plan.

Verdict: round 5 closed the big round-4 findings. The gate is now measurable in the phase it gates (M14a/b moved into Phase 1, A1), both phases carry a real demo-acceptance sentence distinct from the test list (A2), the milestone-ID-vs-run-order rule is stated plainly at the top with a one-line run order (A3), M14d carries the no-regression-default behavioral assertion (A4), M0b is a hard graph edge into M8a not a side note (B1), M3b's live blank-screen fix is split from its dead Phase-2/3 slot (B3), and the Phase-3 sketch-discipline note is present (B5). The M4 -> M4b split is a clean extra boringly-small move the lens asked for in spirit. Current score on this lens: about 9.0/10.

What stands between here and a clean 9+ is a short list of test-completeness and reviewability seams, not direction. Three of them are round-4 items that did not make it into round 5 (the both-conditions precedence fixture B4, the uniform regression DoD clause C1, the rollback-to-`/cad:milestone` tie C2), and one is the round-4 B2 ask (a runnable gate artifact) that is still prose only. None requires re-architecting; all are editing-pass fixes on Section 7 and a handful of milestone DoDs.

What I re-verified against source this round:
- Branch/HEAD `dashboard` / `ce2e9e0`. `package.json` `test` is `vitest run`, `test:watch` is `vitest`; `vitest.config.ts` present. The plan's stated conventions (vitest, jsdom, tests mirror `src/`, test-first for logic) match.
- Live `state.json` (`generated_at 2026-06-20T22:35:43`, 18 programs, 6 needs-you). Confirmed the data shape the plan leans on: all 6 needs-you cards `dod.met:0`; `practice-reports` is the lone time-sensitive (2026-06-22, `dodAlmost:false`); `incomplete-notes` is the lone `dodAlmost:true` (`total:1`, `time_sensitive:null`); `marketing-roi` is `paused:true + needs_you:true`. This directly grounds B1 below: no single live card is BOTH time-sensitive AND dodAlmost, so the Tier-1-vs-Tier-3 precedence is exercised by NO live fixture, which is exactly when an unasserted precedence rule ships inverted.
- M8a's test list (line 820), the M14d test list (line 866), and the Section 7 preamble (lines 696-718), read in full for the DoD-completeness items below.

The rest of this review uses the plan's own section and milestone IDs.

---

## A. Must-fix (defects in the phase split and milestone plan, the thing this lens grades)

### A1. The Tier-1-vs-Tier-3 hero override precedence is the one branch live data cannot exercise, and M8a still has no both-conditions fixture asserting it

This is round-4 B4, reopened by the live-data check rather than closed. 1.11 and 5.3 state the order unambiguously: time-sensitive within 5 days wins, ELSE dodAlmost, ELSE producer head. M8a's test list covers the time-sensitive fixture and the single-item-DoD fixture SEPARATELY ("for the time-sensitive fixture the hero is the deadline card, for the single-item-DoD fixture the hero is that card with the gap-led 'Start the first step'"). It does not assert what happens when ONE card is both.

The live-data check makes this worse than a generic precedence gap. On the current board the only time-sensitive card (`practice-reports`) is `dodAlmost:false` and the only `dodAlmost` card (`incomplete-notes`) is `time_sensitive:null`. So no live fixture, and none of M8a's listed fixtures, ever puts both flags on one card. A builder who implements the override dodAlmost-first (Tier 3 before Tier 1) passes every listed M8a test AND every live-data smoke run, and ships an inverted hero the day a deadline card crosses into its last step. This is the same class of bug the M4 single-item-DoD parity test was added to catch (a branch the common data shape silently skips), and it is the bug a precedence test exists to prevent.

Fix (one fixture, one assertion, in M0's golden set + M8a): add a synthetic both-conditions golden card (time-sensitive within 5 days AND `dod.total - dod.met === 1`) and assert in M8a "a card that is both time-sensitive-within-5-days and dodAlmost is the hero AS the time-sensitive branch (the deadline beats the 90%-killer)." Mirror it in M6's `rankItems` Phase-2 subset (5.6 already lists "Tier 1 beats Tier 2 beats Tier 3 beats Tier 4" but Tier-1-beats-Tier-3 with both flags on the SAME card is the case that pins the predicate, not two separate single-flag cards). This is the cheapest correctness fix in the review and it closes the one ordering the data will never test for you.

### A2. The Phase gate is the most consequential go/no-go in the document and it still exists only as prose Mark must remember to run

This is round-4 B2, still open. Round 5 did the hard part: the gate is now measurable in Phase 1 (the `startupView` instrument ships in M14a/b), it has a named decider (Mark, deliberately, never automatic on a merge), two conditions, and a kill criterion. What it does not have is the THING Mark checks. It lives across two long paragraphs in the "What round 5 changes" preamble (lines 53-60) and is referenced again at line 884.

For a solo-dev tool whose author has a documented ADHD profile that the plan cites as its design basis, a go/no-go buried in a 1000-line plan as two dense paragraphs will not get run. It will get skipped, and the build lane will roll from M14d straight into M14c/M6 because the milestones are sequential in the doc, the exact failure the gate exists to prevent and the exact failure R-13 names as most likely to strand the whole accountability layer. The plan itself argues (1.2, 4.6, 6.4) that an undifferentiated wall of prose reads as nothing to an ADHD scanner; the gate is subject to its own finding.

Fix: extract the gate into a small concrete runnable artifact, a `docs/dashboard/PHASE-GATE.md` (or a 5-line checklist appended to Section 7), in checkbox form so it is run, not read:

```
Before opening ANY Phase-2 milestone (M14c, M6, M11, M12, M13), confirm:
[ ] startupView:'home' has been my default landing for >= 5 working days
[ ] I have named one concrete friction a specific Phase-2 milestone fixes: ______________________
[ ] KILL CHECK: I am NOT avoiding Home (have not reverted to 'lastSession', still opening the app)
If the kill check fails: Phase 2 does NOT ship. The core bet (a calm board earns daily opens) is judged false.
```

This costs five lines and it is the single highest-leverage edit for actually realizing the phased bet, because the bet is only real if the gate is run. The plan's own discipline (a falsifiable observable, M0c shipping beside its caller, the kill criterion) all assumes the gate fires; give it a surface that fires.

### A3. The uniform regression-DoD clause (round-4 C1) is still absent, and round 5's new milestones widened the gap

Round-4 C1 asked for a "`pnpm run test` still green" clause on every milestone that touches heavily-tested shared code, as the cheapest regression DoD. Round 5 did not add it, and the round-5 re-cut added milestones that touch exactly such code without the clause:

- M0b touches `logger.ts` (has tests), `hook-router.ts`, and `tab-namer.ts`, and rewires `shell:openExternal` plus two `index.ts` nav sinks. The largest blast radius in Phase 0, and its DoD lists only the new assertions.
- M1 touches `tab-manager.ts` (`updateStatus`, which `tests/main/tab-manager.test.ts` already exercises) and `types.ts`. A transition-guard change to a tested setter is a textbook silent-regression site.
- M2 has an existing `TabIndicator.test.tsx`; its DoD should be "new reduced-motion assertion green AND the existing TabIndicator test still passes."
- M3a/M3b touch `App.tsx` consumers (the appender, `handleSelectTab`, `onTabRemoved`, the StatusBar lookup).
- M5 extends `ipc-handlers.test.ts` and refactors the live `sendToRenderer` forward chain (the remote contract). The full-set absence assertion is strong, but the broader "existing suite green" is the backstop for the refactor.
- M14d touches `hook-router.ts` (has `hook-router.test.ts`).

Fix: add one line to the Section 7 preamble: "Every milestone's DoD implicitly includes `pnpm run test` still green; milestones that modify already-tested code (M0b, M1, M2, M3a/b, M5, M14d) state it explicitly so the regression backstop is not skipped under time pressure." This is one sentence and it is the cheapest insurance in the plan against a green new-test masking a red old one.

---

## B. Should-fix (raises reviewability and de-risks the build)

### B1. M14d ships the single most consequential behavior knob but the plan never resolves its OWN contradiction between the preamble default and R-12

R-12 (line 951) decides the shipped Phase-1 default is `notifyOnIdle:true` (no regression), and M14d's test asserts the idle toast fires unchanged at the default (A4 from round 4, correctly landed). Good. But the plan elsewhere argues calm-by-default should win (1.2, 1.4, the whole notification-amplification framing in 9.4), and open question 10 (line 966) re-opens the very default R-12 just decided. So the plan simultaneously says "decided: `true`" (R-12, M14d) and "open question: `true` or `false`?" (Q10). A builder reading Section 7 sees a decided default; a Mark reading Section 10 sees an open question. They disagree on whether M14d's default is settled.

This is not a correctness bug (the no-regression default is the safe call and M14d's test pins it). It is a plan-internal inconsistency that will surface as "did we decide this or not?" mid-build. Fix: make Q10 a confirmation, not an open question. Reword it to "R-12 ships `notifyOnIdle:true` (no regression); confirm, or set the calm `false` now" and add one clause to R-12 stating the default is DECIDED and Q10 is a sign-off, not a re-litigation. The plan does this correctly for the carrot calibration (Q8 explicitly says "confirm" against a stated decision); apply the same pattern to Q10.

### B2. The "one rollback point per milestone" language is never tied to the workspace's actual save-point mechanism (round-4 C2)

Section 7's preamble says "one rollback point" per milestone and "No commit or push without explicit user permission" (line 698), and AGENTS.md says "Do NOT commit or push unless the user asks." These are consistent but disconnected: a rollback point that is never committed is just a working-tree state that the next milestone overwrites. The workspace has a save-point tool for exactly this (`/cad:milestone`, "commit one clean named rollback point"), and the AGENTS.md "ask before commit" rule means each rollback point is a `/cad:milestone` CANDIDATE Mark green-lights, not an automatic commit.

Fix (one clause, Section 7 preamble): "Each milestone's rollback point is a `/cad:milestone` candidate Mark green-lights at the milestone boundary; per AGENTS.md the build does not commit or push without his say-so, so 'rollback point' means a clean reviewed save point offered, not an automatic per-milestone commit." This makes "rollback point" a real artifact a session can act on, instead of a property of an uncommitted tree.

### B3. M0's fixture set needs the both-conditions card (A1) AND a note that the first-open-timeline state is a timer mock, not a seventh golden file

M0 lists six golden `state.json` variants (line 722). A1 above adds a seventh (the both-conditions card). Separately, round-4 C3 is still open: M8a's first-open-timeline test (line 820, "skeleton persists across a pending tick") drives a PENDING-FETCH state that is a fake-timer/mock condition, not a `state.json` fixture. A builder reading M0's "the full fixture variant set is importable" DoD could go looking for a seventh (now eighth) golden file for the pending state and not find one.

Fix: (a) add the both-conditions card to M0's enumerated set (it serves A1's M8a assertion and 5.6's M6 assertion); (b) add one clause to M0's DoD: "the first-open pending-fetch state is driven by fake timers in M8a/M4, not a golden file, so the golden set covers data shapes only." Cheap, removes a wrong-turn for the builder.

### B4. M8a's DoD is a strong test list but the Phase-0 ACCEPTANCE sentence and the Phase-0 behavior breakdown live in the preamble, far from the milestone that delivers them

Round 5 added the per-phase acceptance sentences (lines 57-58) and the YAGNI scope paragraph (line 51), which is the round-4 A2/C5 fix and it is good. But they sit in the preamble ~760 lines above M8a, and M8a's own DoD (line 821) restates the test list, not the user-observable acceptance. A session executing M8a reads the milestone, not the preamble. The acceptance sentence is the "value landed" check that the DoD's 30-assertion test list cannot be read as.

Fix: copy the Phase-0 acceptance sentence (line 57) verbatim into M8a's DoD as its closing line, and copy the Phase-1 acceptance sentence (line 58) into M10's DoD (M10 is the last Phase-1 build milestone). This is duplication on purpose: the acceptance sentence belongs where the milestone is executed, so "did value land" is checkable at the milestone boundary without a 700-line scroll. C5's Phase-0-behaviors list (the six behaviors Phase 0 ships) is in the preamble at line 51; M8a's DoD should name them too so the dogfoodable MVP's scope is legible at the milestone.

### B5. The Phase gate's kill criterion references a section name that round 5 renamed

Minor but it is a broken internal reference in the load-bearing gate. R-13 (line 952) says the kill criterion is named "Section 'What round 4 changes'" but the section is now "What round 5 changes" (line 27). Line 53's gate text and line 884 correctly say "round 5"; R-13 lags. A reader chasing the kill criterion from R-13 lands on a section title that does not exist. Fix: one-word edit, "round 4" -> "round 5" in R-13.

---

## C. Nits / polish (cheap, worth doing)

- C1. Open question 12 (the Phase-1 hero reads as a dev/admin task, not an avoidance area) is still question 12 of 14 (line 968), and it is the falsification risk for the entire phased bet (if Phase 1 reads as "just another status board," Phase 2 never ships, R-13). Round-4 C4 asked to promote it; round 5 kept it at the bottom. The content is right and honest (1.11, R-8, R-13 all name it). Lift it to question 1, or annotate it inline at the gate artifact (A2) as "the bet this gate tests," so the most important product question is not the second-to-last thing Mark reads.

- C2. The run-order line at the top (line 25) is excellent and closes round-4 A3. One gap: it lists the order but not the PHASE BOUNDARIES as ship events. Consider appending the two ship points to that same line so the run order and the two demos are read together: "...M14d (Phase 1, SHIPS here); then M14c, M6...". The acceptance sentences (lines 57-58) already exist; this just co-locates "what runs" with "what ships."

- C3. M4b's DoD says "the artifact lives under `userData`" and "reset-at-construction is owned here, not in M8b" (line 789). Good. Add the regression clause from A3 (M4b does not touch tested code, so it is lower-risk, but it writes `closed.json` to `userData` and a path bug there is a silent PHI-adjacent artifact in the wrong place). One clause: "assert the resolved `closed.json` path is NOT under any project `dir` or the workspace `dashboard/` tree" (the test already asserts under-`userData`; the negative assertion against the git tree is the one that catches a regression to the old location).

- C4. M10 is the largest milestone in the plan (line 838: the `explicitCwd` param, two new IPC channels, the `HookRouterDeps` extension, the MAIN once-flag + timer + timeout, the pwsh resolver, the permission override, the pending/failure UI). It is "one change" only in the loosest sense. It is correctly the headline Phase-1 milestone and the pieces are genuinely coupled (the injection path is not shippable in fragments), but it has the most rollback-blast-radius of any milestone. Consider naming an internal sub-sequence in M10's change list so a mid-M10 failure has an intermediate rollback point: (a) `composeClaudeQuery` + `pickPrimaryAction` (pure, testable alone), (b) the `explicitCwd` param + `resolveProgramProject` (the spawn path), (c) the channel pair + MAIN once-flag + timeout (the injection), (d) the pwsh resolver + Copy. Each is a `/cad:milestone` candidate inside M10. This does not split M10 (the user-observable headline ships as one), it just gives the build internal save points so a failure in (c) does not roll back (a).

---

## D. What round 5 got right (keep these)

- The gate is now measurable in the phase it gates. Moving M14a (store key) and M14b (the resolve wiring) into Phase 1 while leaving the picker M14c in Phase 2 is the exact A1 fix, done the recommended way (split the instrument from the UI, not undo the extraction). The circular dependency round 4 flagged is gone.
- The M4 -> M4b split (the reader vs the done-lane resolved-set) is a clean boringly-small move beyond what round 4 asked. M4b is independently testable, MAIN-owned, consumed only by M8b, with its own DoD and rollback. This is the "one change, one test, one rollback point" discipline applied without being told.
- M14d's no-regression-default assertion (line 866) is the A4 fix landed correctly: it asserts the idle toast fires unchanged at the DEFAULT (behavior, not a bare store value), so a builder cannot default to `false`, pass the suppression test, and silently regress the ping. This is the precedence-bug-class defense the lens kept asking for.
- M0b as a hard graph EDGE into M8a (line 708, "M8a depends on BOTH M7b AND M0b and MUST NOT open until M0b is green") closes round-4 B1. The security gate and the value-early critical path are now one reading, not two.
- The done-lane carrot's progress-guard (M4b: a close counts only when `dod.met` increased OR `lane` became done OR `last_commit.iso` advanced) is grounded in the live-data finding that 11 of 18 programs are `dod.total:0` and can never cross to Done, and the over-fire guard (a lapsed deadline pays nothing) is exactly the calibration an ADHD-aware reward owes. Catching that against live data is the plan testing reality.
- The per-phase acceptance sentences (lines 57-58) distinct from the test lists close round-4 A2; the YAGNI scope-honesty paragraph (line 51) closes C5. The only gap is co-locating them with the milestones that deliver them (B4 above).
- The run-order line + the "milestone IDs are labels not run order" note at the top (lines 21-25) close round-4 A3 cleanly: the M14d-before-M14a/b/c and M6-after-M14d traps are now stated plainly with the literal run order.

---

## Summary of the path to 9/10

Round 5 closed the round-4 must-fixes; the three-phase spine, the gate's measurability, and the live-data grounding are right. The remaining work is test-completeness and the gate's runnability:

1. Add the both-conditions precedence fixture (time-sensitive AND dodAlmost on one card) to M0 + M8a + M6, the one ordering live data will never exercise for you (A1). Top item.
2. Extract the Phase gate into a runnable checkbox artifact (`PHASE-GATE.md` or a 5-line Section-7 checklist); a paragraph-only gate in a 1000-line plan will not get run by an ADHD author (A2).
3. Add the uniform "`pnpm run test` still green" DoD clause, explicit on the milestones that touch tested code (M0b, M1, M2, M3a/b, M5, M14d) (A3).
4. Resolve the M14d default contradiction: R-12 decides `true`, Q10 re-opens it; make Q10 a sign-off, not an open question (B1).
5. Tie "rollback point" to `/cad:milestone` (B2); add the both-conditions card + the pending-state-is-a-timer note to M0 (B3); copy the acceptance sentences into M8a/M10 DoDs (B4); fix the "round 4"->"round 5" reference in R-13 (B5); promote Q12 (C1); name M10's internal sub-sequence for intermediate rollback points (C4).
