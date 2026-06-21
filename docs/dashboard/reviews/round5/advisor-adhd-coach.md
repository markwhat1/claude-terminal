# Round 5 advisor review: ADHD design coach

Lens: deepen the ADHD ergonomics so the design measurably lowers activation energy. J.O.T. one-thing hero, calm by default, sub-2s capture, shame-free avoidance nudges, restrained dopamine feedback.

Build target: `C:/Users/Mark/Claude-Code/infrastructure/claude-terminal-dashboard` (the `dashboard` worktree). PowerShell 7 shell. No em dashes, no AI-slop words. No patient data in argv, logs, or artifacts. AGENTS.md IPC discipline. Repo test conventions (vitest, test-first for logic). Boringly small milestones.

## Verdict

The plan is strong on the calm-by-default and shame-free axes. The one-thing hero is well bounded (a hard three-affordance budget, capped heat, paused exclusion, no "0 of N", no streaks, a tested voice module). Round 5's corrections are honest: the goal-gradient reclassified as an anti-demotivation floor, the dodAlmost hero never claiming "almost done" at zero, decision cards routed away from "draft a decision."

Where it falls short of 9/10 on the lens's own headline metric, "measurably lower activation energy," is that the only QUANTIFIED activation-energy target in the whole plan (sub-2s capture) leaves with capture to Phase 2, and the plan adds no replacement number for Phase 0/1. The first dogfoodable build therefore lowers activation energy by ARGUMENT, not by a falsifiable number. For an ADHD coach lens that is the central gap. Three other gaps below compound it: the morning cue is structurally taxed by a preceding modal, the restrained-dopamine calibration is unconfirmed and its only loud tier is gated to Phase 2, and a dangling cross-reference ("1.32 restraint list") means the plan's own restraint inventory does not exist on the page.

None of these are architecture problems. They are ergonomics-measurability problems, which is exactly this lens's job.

## Must-fix (blocks a 9 on this lens)

### MF-1. The "1.32 restraint list" does not exist. Fix the dangling pointer and make the restraint inventory real.

Section 1.10 (line 168) and the round-5 changelog (line 70 region) both cite "the 1.32 restraint list" as the place that classifies the goal-gradient as anti-demotivation rather than a dopamine engine. There is no section 1.32. The section numbering stops at 1.11 (verified: the only `### 1.x` headers are 1.1 through 1.11, plus 1.5b). So the plan twice points the reader to a restraint inventory that is not on the page.

This matters for THIS lens specifically. "Restrained dopamine feedback" is one of the five things I am grading, and the plan claims to have a single audited list of every motivational element classified by whether it is a real reward, an anti-demotivation floor, or calm-only. That list is the artifact that proves restraint. Right now it is vapor.

Fix: add a real Section 1.12 (or fold it into the "Honesty about scale" block) titled "Restraint inventory" that enumerates every motivational element with its honest classification, then repoint both citations to it. The seven behaviors are already named at line 51; the new section just classifies each:

| Element | Class | Why it is restrained |
|---|---|---|
| Done-lane "N closed today" + settle | Real reward (the one carrot) | Suppressed at zero; counts only on real progress; no confetti |
| Goal-gradient gap frame | Anti-demotivation floor | Never shows a bare zero; honest-fraction branch does not fire on live data |
| Single-field hero override | Calm prioritization | Elevates only when it reorders; no payout |
| Caught-up pull-forward | Calm continuation | One optional line, dismissible, paused excluded |
| Empty-board live-tab hero | Calm correctness | Prevents a false "nothing needs you" |
| Idle-age floor | Calm signal hygiene | Keeps "N need you" meaningful, no reward |
| Saturation-capped hero band | Calm signal | A single loud signal, never band + button both hot |

One table, no new code, repoints two live references. This is the cheapest must-fix in the review and it is the one that makes the restraint claim auditable instead of asserted.

### MF-2. Phase 0/1 has no quantified activation-energy target. Add one that survives without capture.

The lens asks for a design that MEASURABLY lowers activation energy. The plan acknowledges, at line 896 and open question 13, that "the only quantified ADHD target" (sub-2s capture) leaves Phase 1 with the capture bar. So the first build that Mark actually dogfoods, the build the entire phase gate hangs on, ships with zero falsifiable activation-energy number. Everything in Phase 0/1 is argued, not measured.

This is the difference between an 8 and a 9 on this lens. The fix is not to drag capture forward (the plumbing argument for deferring it is sound). The fix is to add a DIFFERENT quantified target that the Phase-0/1 surface already controls, and encode it as a test the same way capture's sub-2s is encoded.

Two concrete candidates, both already half-present:

- **Hero-to-first-keystroke is app-side zero, and PROVE it as a latency assertion, not a tick assertion.** M10 already asserts the click dispatches the inject intent and `setActiveTabId` synchronously "in the same tick" (line 852). Reframe that as the plan's headline activation-energy metric and state it numerically: the app's share of click-to-query-armed is 0 ms (no `await`, no `setTimeout`), and the out-of-app CLI boot is bounded by the 30s timeout. That gives Phase 1 a real, falsifiable activation number ("the app adds nothing to the gap between deciding and starting"), which is the exact thing the lens wants measured. It is already tested; what is missing is naming it as THE Phase-1 activation metric in Section 1 and in the M10 DoD, so the plan stops treating sub-2s capture as the only quantified axis.

- **Time-to-glance: the one-thing must be legible before a reflow.** The skeleton-to-content zero-reflow work (4.5, M8a's hero-min-height assertion) is the raw material. State it as a number: the hero occupies its final footprint from the first painted frame (zero layout shift, CLS = 0 on the hero region), so the time-blind brain reads the one thing without a jump that re-costs attention. M8a already asserts the hero skeleton carries the hero min-height; add the explicit "zero hero-region layout shift between skeleton and content" framing to the DoD so it reads as an activation-energy guarantee, not a cosmetic one.

Pick at least one, name it in Section 1 as the Phase-0/1 activation-energy target, and put the number in the milestone DoD. Without a named number, "measurably lower activation energy" is unmet by construction for the shipping slice.

### MF-3. The morning cue is taxed by a preceding modal. Decide R-10 Option A now, or stop calling Home a cue in Phase 1.

The plan's whole behavioral bet (line 70) is that APP-OPEN is the cue, the cue-bound implementation-intention finding, the precursor to the Phase-3 morning intake. R-10 (line 949) honestly admits the problem: `startSession` requires a chosen directory before any `setActiveTabId` site the `startupView` branch hooks, so `startupView:'home'` still lands the user on the StartupDialog modal FIRST, then Home. A decision-gate before the calm surface is precisely the activation tax that makes "I will just not open it" win. For an ADHD user a modal between the icon click and the one-thing is not a minor friction; it is the friction the whole design exists to remove, reintroduced at the front door.

The plan offers Option A (auto-resume the last directory, go straight to Home) and Option B (admit Home cannot be a zero-gate landing and downgrade the morning-cue claim), and defers both to open question 3. That deferral is the problem. The phase gate measures whether Home earns daily opens over 5 days; if every one of those opens is taxed by a modal, the gate measures a handicapped version of the bet and a "fail" verdict cannot distinguish "Home is not compelling" from "the modal taxed it to death."

Fix: make Option A a Phase-1 design commitment, not an open question. When `startupView:'home'` AND a last-session directory exists, auto-resume that directory and land on Home; the dialog stays reachable on demand. This keeps the cue clean during the gate window so the gate measures the real bet. The implementation is bounded (auto-resume the saved directory at the existing restore path, then select Home instead of the active tab) and it is the single highest-leverage activation-energy change in the plan, because it fixes the cue the entire phased roadmap is built on. If Mark prefers to keep the modal, then MF-3's alternative is mandatory: strike every "morning cue" and "Home-on-open" framing from Section 1 and replace it with the honest Option-B language, so the plan does not bank roadmap weight on a cue the architecture taxes.

## Top improvements (raise toward 9)

### TI-1. Confirm the two-tier dopamine calibration BEFORE M8b, and give the louder tier a Phase-1 home or admit it is invisible.

The restrained-dopamine design is two-tier (1.5): an ordinary finish gets the calm settle + count tick; an avoidance-category loop close gets "one slightly longer, still-calm, still-motion-safe, no-confetti beat." This is the right instinct (a reward sized to the achievement, E5 5.7). Two problems for this lens:

1. The louder tier rides M13 (the avoidance classifier), which is Phase 2. So in Phase 1, the ONLY finish that matters for a low-baseline brain (closing a long-avoided loop) gets the identical tiny beat as a routine close. The plan's own honesty section says six of seven behaviors carry real motivational weight; this is the one place where the single most motivationally important event is flattened to the routine one for the entire Phase-1 window. Either accept that explicitly in 1.5 (Phase 1 has ONE payout tier, the two-tier story is Phase 2), or pull a minimal avoidance signal forward so the louder beat has a trigger in Phase 1. Open question 12 already floats pulling the read-only avoidance tie-break (M13) earlier; if Mark says yes there, the louder tier gets a Phase-1 home for free.

2. The calibration is unconfirmed (open question 8). The difference between "one finish registers louder" and "every finish is one uniform settle" is the entire restrained-dopamine axis. Shipping M8b before Mark signs off on 8 risks building the wrong settle and re-touching it. Move open question 8 to a pre-M8b sign-off, since M8b is where the settle is built.

### TI-2. Give the avoidance nudge a shame-free PRESENCE in Phase 1, not just a Phase-2 promise.

The lens names "shame-free avoidance nudges" as a graded axis. The plan handles the shame-free part well (no OVERDUE stamp, no red card fill, capped heat, neutral verb-first copy, the voice test banning "still/again/keep"). But the actual avoidance SURFACING is entirely Phase 2 (M13 classifier) and Phase 3 (morning ritual), and R-13 honestly flags this as the most-likely-stranded value. On live data the Phase-1 hero will be a dev/admin task, never an avoidance area, and the one avoidance item present (`marketing-roi`) is paused and filtered out.

So Phase 1 ships a board that is shame-free precisely because it shows no avoidance items at all. That is a hollow version of the axis. The fix is the same lever as TI-1: open question 12's read-only avoidance keyword tie-break, pulled into Phase 1 as a TIE-BREAK only (not a pin, not a classifier write), so an avoidance item at least does not sink below a fresher dev card. This is the cheapest way to make the foundation "hint at the eventual value" (R-13's own mitigation language) with real behavior instead of a promise. Recommend it as the answer to open question 12, scoped tightly: a keyword set over the existing non-PHI program slug/name, never `blocked_on`, never logged, never into `composeClaudeQuery`, used only to break a Tier-4 recency tie.

### TI-3. The "N closed today" payoff is invisible to a user who is away all day. State the glance window honestly.

The done-lane carrot is persisted last-24h under `userData` (1.5/M4b) precisely so a morning glance reflects yesterday evening's wins. Good. But the header copy is "N closed today" while the window is actually the last 24 hours (line 115 says exactly this). For a time-blind brain, "today" at 9am after a 24h window means the number includes yesterday afternoon, which can read as a lie ("I did not close 4 things today, it is 9am"). The honesty corrections elsewhere in the plan (no "almost done" at zero, no "0 of N") are exactly this kind of fix; this one slipped. Either make the copy match the window ("4 closed recently" / "4 closed, last 24h") or make the window match the copy (since-midnight-local). For a brain that distrusts its own time sense, the number must not invite the "that is not right" reflex that makes the user stop trusting the board. Recommend the copy fix ("last 24h" suffix or "recently"), since the 24h window is the deliberate, defensible choice for a user who works away from the terminal.

### TI-4. Make the keyboard floor a stated activation-energy guarantee, not only a focus-order test.

M8a asserts focus order (the hero primary is the first focusable element, Enter-activates). For an ADHD user the keyboard floor is an activation-energy feature, not an accessibility checkbox: reaching for the mouse, locating a small target, and clicking is measurable added cost over "the thing is already focused, press Enter." The plan tests focus order but frames it as accessibility (6.3). Reframe it in Section 1 as a Phase-1 activation behavior: on open, the one recommended action is ALREADY focused, so the cost from window-focus to first move is one keystroke. That is a real, defensible activation-energy claim that the existing M8a test already proves; it just is not credited as one. This pairs with MF-2 (it is a second, complementary activation number that needs no new code).

### TI-5. The progressive-disclosure cap (N around 4-5) needs a committed number, and the expanded-overflow grouping should default to the hottest band visible.

Section 4.6 caps the visible needs-you list at "hero + top N rows (N around 4-5)." For a one-thing design the difference between 4 and 5 visible rows is the difference between calm and a wall; "around 4-5" is the kind of prose the plan elsewhere (6.1, 6.2) correctly refuses to ship. Commit one number in the component and the M8a fixture. Recommend N=4 (hero plus four reads as "five things," the documented working-memory ceiling; five-plus-hero starts to read as a list). Second: when "+N more" expands, the plan groups by age band under mini-headers, which is good, but does not say which group is open by default. For a shame-free design the expansion should NOT lead with the hottest (oldest, most-avoided) band, which would re-create the guilt wall the cap exists to remove. Default the expanded view to show the freshest band first (momentum framing, "5 fresh, 3 getting old"), matching the 1.4 "empty state reads as momentum" instinct. State the default-open band so two builders do not ship two orders.

### TI-6. Coarsen-or-freeze the count-up under reduced motion is specified; add the same restraint to the poll cadence so the periphery is never a metronome.

1.2 correctly coarsens the active count-up to minute resolution and recomputes on the ~20s poll, not a 1s interval, to avoid looping peripheral motion (E4 A7). One gap: the ~20s poll still re-renders the whole strip on every tick, and a strip of N rows whose relative-time strings all advance together on a fixed cadence is a soft metronome in the periphery, the same anti-pattern at lower frequency. The plan keys by `id` to avoid remounts (5.5), which handles layout churn but not the synchronized text-flip. Recommend: only the rows whose coarsened minute value actually CHANGED re-render their time string (compare prior coarsened value), so the periphery updates sparsely and irregularly, never as a synchronized pulse. This is a small mapper detail but it is the difference between a calm periphery and a clock. It also strengthens the existing "no uninvited motion" claim with a concrete mechanism instead of a React-keys hand-wave.

## What the plan already gets right (do not regress)

- The one-thing hero with a hard three-affordance budget, enforced as a single-location invariant in `CardFooter` and tested ("at most one full-weight button across all fixtures"). This is the J.O.T. axis done correctly.
- Capped heat on the hero (left-edge band only, never a red fill, button stays a constant accent) is the right shame-free escalation, and the reasoning that a red hero every morning equals an OVERDUE stamp is exactly correct.
- NO STREAKS as a tested guardrail, not a passing clause, with the voice test banning the language. For Mark's neurology specifically this is load-bearing and the test that stops a well-meaning contributor from re-adding it is the right instinct.
- The goal-at-zero gap frame ("Start the first step: <gap>", never "0 of 1 done") and the honest reclassification of the whole goal-gradient as an anti-demotivation floor once live data showed all six needs-you cards at `met:0`. That is the plan choosing honesty over a nicer story; preserve it.
- The paused-card exclusion from the hero, the default list, AND the caught-up pull-forward. Re-surfacing a deliberately parked avoidance item at the dopamine peak of "Clear, keep working" would be the exact calm-by-default failure that makes an ADHD user stop opening the board; the plan catches it in three places.
- Notification demotion (`notifyOnIdle`) as its own boringly-small milestone with a no-regression DEFAULT behavioral assertion. The dashboard amplifies one toast per session per turn, the biggest activation-energy regression hiding in an activation-lowering plan; demoting the idle ping while preserving `requires_response` is the right call, and testing the default behaviorally (not as a bare store value) stops a silent regression.
- The present-partner waiting-loop register ("Waiting on you, 6m") over a bare status timestamp, named slug-only, never `blocked_on`, voice-tested for no guilt framing. This is the accountability axis handled without shame.

## Constraint check

- No em dashes, no AI-slop words in this review.
- Every fix is scoped to the `dashboard` worktree; no change proposed to the program-board producer repo or to CADDC02.
- No PHI in argv/logs/artifacts: TI-2's avoidance tie-break is explicitly constrained to non-PHI slug/name, never `blocked_on`, never logged, never into `composeClaudeQuery`, consistent with 3.4 and the existing R-6/R-14 seams.
- AGENTS.md IPC discipline: none of these fixes adds an IPC channel. MF-2's latency framing reuses the M10 channels already specified with full treatment; MF-3's auto-resume reuses the existing restore path and the `startupView` store (no new channel).
- Test conventions: every proposed change names the milestone and the vitest assertion that would prove it (MF-2 as an M10 latency assertion and an M8a zero-shift assertion, TI-1 as a pre-M8b sign-off plus the existing settle test, TI-5 as the committed-N M8a fixture, TI-6 as a mapper unit test on sparse re-render).
- Milestone discipline: no fix expands a milestone beyond one change + one test + one rollback. MF-1 is doc-only. MF-3 is a bounded change to the existing M14b wiring plus the restore path.
