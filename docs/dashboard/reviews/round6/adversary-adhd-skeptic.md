# Round 6 adversarial review — ADHD anti-pattern skeptic

Lens: will this overwhelm, nag, guilt, or become another shiny thing that gets avoided?
Attack any violation of calm-by-default, one-thing, or shame-free.

Reviewed: `docs/dashboard/PLAN.md` (round 6) against `docs/dashboard/recon/round2/R1-R6`.

## Verdict up front

This is the most ADHD-literate version of the plan so far. The obvious traps are caught
AND tested: no streaks (guardrail test), no red OVERDUE, suppressed-when-zero counts, paused
cards filtered from the hero and the pull-forward, "0 of N" forbidden everywhere, honest-window
"last 24h" copy, motion-safe gating at the source, the idle-age floor so "N need you" keeps
meaning, the single-hero affordance budget, the freshest-band-first overflow. Credit where due:
the restraint inventory (1.12) and the honest-limitation paragraphs (1.5, 1.10) are real
self-criticism, not theater.

The residual defects are second-order, but they are exactly where an ADHD board quietly fails:
the plan's own honesty has documented its way into a board that, on Mark's real data, surfaces a
dev/admin task as the hero, a carrot that almost never fires, and a goal-gradient that never
fires. It is at risk of being a sharper status board, not the accountability partner the whole
roadmap is justified by, and the gate that is supposed to catch that is biased toward a false
pass. Below, ordered by how directly each one breaks a core promise.

---

## CRITICAL

### C1. The Phase gate's pass condition is the act it is supposed to measure, and its kill criterion is unfalsifiable for the avoidance brain

Where: "The Phase gate" paragraph (line 55), `PHASE-GATE.md` reference, R-13 (line 1034),
gate condition (1) restated against R-10 Option A.

The gate condition (1) is "Mark ran Phase 1 with Home as the genuine first surface on >=5
working days." With Option A committed (auto-resume + land on Home when `startupView:'home'`),
satisfying the gate requires Mark to (a) set `startupView:'home'` and (b) keep opening the app.
But "keep opening the app and keep it set to Home" IS the behavior under test. The instrument
and the result are the same variable. An ADHD user who finds the board mildly aversive does not
file a complaint; he silently stops opening it or reverts the setting, and there is no
affirmative signal that distinguishes "the board earned its opens" from "Mark forgot the gate
exists and the default `'lastSession'` quietly won." The kill criterion ("if Mark reverts
`startupView` or stops opening the app") relies on Mark NOTICING and ATTRIBUTING his own
avoidance, which is precisely the metacognitive step the avoidance brain skips. The plan even
documents that Mark "works away from the terminal most of the day" (1.5), so low open-counts are
expected and ambiguous by default.

Why it breaks the lens: the entire phased bet (R-13) hinges on this gate, and the gate cannot
fail loudly. A gate that can only pass passively and can only fail by the user's own
self-diagnosed avoidance is the "shiny thing gets avoided, and nobody notices it was avoided"
anti-pattern promoted to project-governance level.

Minimal fix: make the gate produce a passive, observable artifact that does not depend on
Mark's self-report. The app already has `closed.json` and poll infrastructure under `userData`;
add a tiny append-only `home-opens.json` (date + whether Home was the landed surface) written in
MAIN at the same `setActiveTabId` resolution point M14b already touches. The gate then reads a
real count, and "Mark opened the app 11 days and Home was first 2 of them" is a falsifiable
kill signal instead of a vibe. This is one MAIN-owned counter beside `closed.json`, no new UI,
and it converts condition (1) from self-report to evidence. (It also feeds C2.)

### C2. On Mark's real data the Phase-1 board has no working reward and no working goal-gradient, so "the board pays out" is false for the whole gate window

Where: 1.5 HONEST LIMITATION (line 113), 1.10 HONEST classification (line 174), 1.12 restraint
inventory (lines 202-203), R-8 (line 1028).

Stacking the plan's own honest admissions:
- The one real reward (done-lane carrot) "rarely fires" because 4 of 6 live needs-you cards
  clear via the EXCLUDED path (a removed override tag), and the carrot is explicitly "NOT banked
  as Phase-1 weight" (1.12).
- The goal-gradient's honest-fraction branch "NEVER fires" because all 6 needs-you cards are
  `dod.met:0`; it is reclassified to an anti-demotivation floor (1.10).
- The hero on current data is a time-sensitive or almost-done dev/admin task, NOT an avoidance
  area (1.11, R-8).

Each admission is individually honest. Composed, they describe a Phase-1 board whose only
actually-firing motivational mechanisms are calm-only (hero selection, capped band, idle floor)
plus an anti-demotivation floor. There is no positive dopamine event that fires on Mark's real
board during the exact 5-day window the gate measures. For a low-baseline-dopamine brain, a board
that demands and orders but never pays is the precise thing E5 says becomes a guilt object and
gets avoided. The plan has reasoned itself into shipping the failure mode it set out to prevent,
and then scheduled a gate over that window.

Why it breaks the lens: "the finish must pay out" (Section 1 opening) is the load-bearing ADHD
principle, and on real data it does not, for the whole gated window. This is not a copy nit; it
is the motivational core being empty exactly when it is being judged.

Minimal fix: do not ship Phase 1 with zero firing rewards on real data. Adopt the "decided and
worked" exception (open question 14) as the Phase-1 DEFAULT, not a deferred sign-off: count a
`needs-your-decision` tag clearing as a finish when the card is not a simultaneously-lapsing
`time_sensitive` AND `last_commit.iso` is within ~1 day. That is the literal avoidance-loop
close (a parked decision resolved), it is the dominant real close on this board, and the guard
already specified separates it from a silent tag deletion. Without at least one reward that fires
on real data, the gate (C1) is measuring an empty board and the kill criterion will trip for the
right reason but the wrong stated cause ("Mark avoided it" rather than "we shipped nothing that
paid out").

---

## HIGH

### H1. R-10 Option A auto-resume reopens yesterday's session unasked, which can drop Mark into a dreaded tree at the morning cue

Where: M14b (line 958), R-10 (line 1031), 6.5 no-active-project drop (line 739), 3.1 step 2.

Option A is "when `startupView:'home'` and a last-session directory exists, AUTO-RESUME that
directory and land on Home." The intent is good (remove the modal tax before the calm surface).
But auto-resume is not free of ADHD cost: it silently re-instantiates whatever Mark was last
doing, including a half-finished avoidance task he closed the laptop on precisely to escape. The
morning cue is supposed to be the calmest, most-agency moment (E7's whole thesis). Auto-resuming
the last directory makes the first thing that happens on open a thing Mark did not choose this
morning. For the time-blind avoidance brain, "the computer reopened the dread I fled" is a
stronger disengagement trigger than a one-click directory picker, and it is involuntary.

The plan treats "modal before Home = bad" as settled and "auto-resume = the fix," but never
weighs the opposite ADHD cost: a modal is a moment of agency (I choose where to go); auto-resume
is a moment of imposition. The plan's own calm-by-default rule ("no uninvited motion / no
auto-anything") is violated by auto-resuming a session at launch.

Why it breaks the lens: calm-by-default and shame-free. Reopening yesterday's avoided work is a
silent nag dressed as convenience.

Minimal fix: land on Home WITHOUT auto-resuming the directory's terminal tabs. Home is
renderer-only and needs a resolved project only for its ACTIONS, not to paint (R5 §A; the hero
can be the program-board feed which is project-independent). Resolve the last directory for
context, paint Home as the first surface, but do NOT spawn/resume the last terminal tabs until
Mark acts. If Home genuinely cannot render without a resolved project (6.5 claims it cannot),
then resolve the project silently but leave its tabs un-restored and the active surface on Home,
so the morning cue is Home, not yesterday's dread. At minimum, name this tradeoff in R-10 and
make "auto-resume vs land-on-Home-only" an explicit sign-off, not a buried default.

### H2. The hero is auto-focused on mount AND the click navigates away from Home, which is a focus yank at the calmest moment

Where: 1.1 keyboard floor (line 80), 6.3 focus order (line 694), 1.5b (line 130), M8a focus
assertion (line 897), 1.13 (line 218).

The plan makes "the hero primary button is the document's active element on mount" a tested DoD
and credits it as an activation-energy win (one keystroke from focus to first move). That is a
reasonable a11y/activation argument, but it is in tension with calm-by-default in two ways the
plan does not reconcile:

1. Auto-focusing a button on every Home mount means every time Home becomes active (startup,
   last-tab-close routing to Home per M3b, the entry affordance, `startupView:'home'`), the
   focus ring lands on the loudest pixel (the `bg-attention` primary). On a re-poll or a
   tab-close that routes to Home, focus jumps to "Draft the first version" / "Open the repo to
   decide" unasked. For an ADHD user, an unrequested focus landing on the highest-salience
   action reads as "the app wants me to do this NOW," which is a soft demand, not a calm
   landing.
2. The headline click then navigates AWAY from Home to the spawning tab (1.5b), where a pending
   overlay paints on the Terminal surface. So the calm board's single most prominent interaction
   immediately yanks the user off the calm board into a booting terminal. The plan specifies the
   pending surface carefully (good), but the net first-run experience of the headline affordance
   is: land on calm board -> focus auto-jumps to the loud button -> one keystroke -> board
   vanishes -> blank-ish terminal for 3-8s. That is a lot of involuntary context change for the
   "calm" surface.

Why it breaks the lens: calm-by-default (auto-focus on the loud pixel; auto-navigation away) and
one-thing (the one thing the calm board does on open is point a focus ring at a demand).

Minimal fix: focus the Home REGION (a container or the hero card), not the primary action
button, on mount. Keep the button as the first TAB stop so the one-keystroke-to-act path is one
Tab + Enter (still cheap), but the resting state is not a focus ring on a demand. This preserves
the activation-energy claim (mouse-free reach) while removing the "app is pointing at me" feeling
on every Home mount. Separately, name the navigate-away tradeoff in 1.5b and consider an option
to keep Home visible with the spawning tab's pending state shown as a non-navigating inline
status until first idle, so the calm surface is not destroyed by its own headline action.

### H3. The notification default ships `notifyOnIdle:true`, which the plan itself calls "the biggest activation-energy regression hiding in an activation-lowering plan"

Where: M14d (line 946), R-12 (line 1033), 9.4 (line 1009), open question 10 (line 1049).

The plan diagnoses this precisely (9.4): the dashboard's purpose is to drive MORE concurrent
sessions, the inherited engine fires one OS toast per session per turn, and one involuntary
context switch costs ~23 min re-entry. Then it ships the default that preserves that toast storm
(`notifyOnIdle:true`) and justifies it as "no regression." The "no regression" framing is the
trap: the regression being avoided is to the OLD single-session world; in the NEW many-session
world the plan is explicitly building, `true` is the regression. The plan defends `true` with
"Home is not yet the guaranteed always-on landing surface in Phase 1 (R-10)," but R-10 Option A
is committed precisely to make Home the genuine landing surface during the gate window, so the
stated reason for `true` is undercut by the stated decision for Option A in the same document.

Why it breaks the lens: calm-by-default, head-on. The single most consequential calm knob ships
in the loud position, by an argument that a different decision in the same plan contradicts.

Minimal fix: ship `notifyOnIdle:false` as the Phase-1 default (the calm position) BUT keep the
`requires_response` toast and add a one-time first-run note ("Idle notifications are off; the
dashboard shows finished sessions. Turn them on in Settings.") so the change is discoverable, not
silent. This keeps the genuinely-needs-you ping (`requires_response`, the chime Mark listened
for) and kills the per-turn idle storm the dashboard amplifies. If Mark prefers `true`, that is a
sign-off, but the DEFAULT in a calm-by-default board should be the calm value, especially when
the plan's own prose argues `true` is the regression in the multi-session world it is building.

---

## MEDIUM

### M1. Two-tier payout is sold as a pre-M8b gate but its louder tier cannot exist in Phase 1, so Phase 1 ships the flattening the plan warns against

Where: 1.5 two-tier (lines 115-118), open question 8 (line 1047), M8b.

The plan makes the two-tier calibration (ordinary settle vs louder avoidance-close beat) a
"PRE-M8b gate" requiring sign-off before M8b ships. But the louder tier rides M13 (Phase 2), so
in Phase 1 there is exactly one tier no matter what Mark signs off. The "gate" therefore decides
nothing buildable in Phase 1; it only records intent for Phase 2. Worse, the plan admits "for the
whole Phase-1 window the most motivationally important finish (an avoidance-loop close) gets the
identical tiny beat as a routine close" and calls that flattening. So the single most important
reward event on Mark's board (per C2, the avoidance-loop close is the dominant real close) gets
the smallest beat for the entire gated window. The plan offers "pull the read-only avoidance
tie-break forward" as a Phase-1 predicate, but the tie-break only affects RANKING, not the SETTLE
beat, so it does not give Phase 1 a louder close.

Why it breaks the lens: the reward is miscalibrated in exactly the direction that matters least
for an ADHD brain (routine and important closes feel identical), for the whole window the bet is
judged.

Minimal fix: if the C2 "decided and worked" exception is adopted as the Phase-1 reward, give THAT
close the slightly-longer calm beat in Phase 1 (it is detectable from the same fields the carrot
already inspects: removed `needs-your-decision` tag + fresh commit). That gives Phase 1 a real
two-tier shape on the one close that matters, instead of deferring the louder tier to a phase
that may never ship (R-13). If that is too much for Phase 1, then drop the "two-tier is a pre-M8b
gate" framing and state plainly: Phase 1 is single-tier, calibration is a Phase-2 decision.

### M2. "+N more" can hide an arbitrarily large needs-you spike behind one collapsed control, and the count itself becomes a demand number

Where: 4.6 progressive-disclosure cap (line 604), 6.3 (line 705), 6.2 sub-dominant header.

The cap (hero + 4 rows) is the right instinct, and grouping the expansion by age band
freshest-first is good. But on a heavy week needs-you can spike "past 6 across ~25 tracked
programs" (the plan's own number). That means "+N more" can read "+18 more." A single control
labeled with a large number is itself a demand signal to an ADHD scanner: the collapsed state
says "five things visible, eighteen more you are ignoring." The plan fixed the WALL (grouped,
freshest-first) but not the COUNT: "+18 more" at the bottom of the calm board is a quiet
guilt number, the same shape as a red badge the plan correctly bans elsewhere (6.4 "no badge
soup").

Why it breaks the lens: shame-free. A large hidden-count is a backlog-guilt signal even when the
list is collapsed.

Minimal fix: cap the COMMUNICATED overflow, not just the visible rows. Show "+N more" only up to
a ceiling (e.g. "+9 more"); above the ceiling, render a neutral, non-numeric "more" affordance or
a calm "lots tracked, focus here" framing, so the collapsed board never quantifies the backlog as
a number to feel bad about. Alternatively, suppress the count entirely on the collapsed control
(just "Show more") so the calm state never displays a backlog magnitude. Add a voice/render test
that the collapsed control does not display a raw overflow count above the ceiling.

### M3. The waiting-loop "Waiting on you, 6m" present-partner register risks becoming the nag the plan bans, because the duration keeps climbing

Where: 6.4 waiting-loop copy register (line 728), 1.2 minute-coarsened time (line 90), 6.6 voice
test (line 754).

The plan promotes the waiting-loop string to a "present-partner register" ("Waiting on you, 6m")
and bans guilt words ("still"/"again"/"keep"). But the DURATION is the guilt, not the adjective.
"Waiting on you, 6m" coarsening upward to "Waiting on you, 47m" to "Waiting on you, 2h" on the
hero or needs-you header is a climbing accusation regardless of the neutral verb. The plan
carefully coarsens the ACTIVE count-up to avoid time-anxiety (1.2, good) but then attaches an
ever-climbing wait duration to the most accountability-loaded string in the app. For a
time-blind brain, a number that only goes up next to "Waiting on you" is the shame spiral the
duration was supposed to avoid; the present-partner framing makes it MORE pointed, not less.

Why it breaks the lens: shame-free. An unbounded climbing duration on an accountability string is
a guilt escalator even with neutral words.

Minimal fix: cap or bucket the promoted waiting duration. Past a threshold, drop to a calm
non-numeric band ("waiting since this morning" / "waiting a while") rather than a precise climbing
minute count, OR drop the duration entirely from the PROMOTED (hero/header) waiting string and
keep the precise minutes only in the subordinate strip row where it is ambient, not accusatory.
Add a voice/render test that the promoted waiting string does not render a raw climbing minute
count above a threshold.

### M4. The "Pull one forward?" line appears at the dopamine peak and can re-introduce a task the user just earned the right to stop

Where: 4.6 caught-up pull-forward (line 601), 6.3 caught-up stacking (line 701), 1.4 empty state.

The caught-up state stacks "Clear. Keep working." + "N closed, last 24h" + "Pull one forward?"
The first two are a clean reward. The third immediately hands the user a new task at the exact
moment the board acknowledged they are done. The plan correctly excludes paused cards from the
pull-forward candidate (good), but the deeper ADHD problem is structural: "Clear, keep working"
is a permission-to-stop signal; "Pull one forward?" is a permission-to-stop-revoked signal one
line below it. For a brain that struggles to ever feel "done," appending a fresh demand to the
done state can train the user that the board never lets them rest, which is the guilt-object
failure (E5 P2) in a polite voice.

Why it breaks the lens: shame-free / calm-by-default. The reward state is immediately monetized
into another demand.

Minimal fix: make "Pull one forward?" require a deliberate reveal, not auto-render at the dopamine
peak. Show the headline + count as the resting caught-up state; surface the pull-forward only
behind a quiet, optional affordance the user chooses to expand ("Want another? "), so the default
caught-up state is pure acknowledgment with no attached demand. The plan already calls it
"dismissible"; make it opt-IN (reveal), not opt-OUT (dismiss), so the calm default is "you're
done" with nothing to dismiss.

---

## LOW

### L1. The avoidance keyword tie-break (Phase 1) silently re-pins the user's most-avoided item toward the hero with no re-roll escape until Phase 2

Where: 1.4 (line 101), 5.4 step 4 (line 640), 1.11, open question 12.

Pulling the read-only avoidance tie-break into Phase 1 (so an avoidance item does not sink below a
fresher dev card) is defensible, but it nudges the most-avoided item UP toward the hero while the
re-roll escape ("not now, show me another") is explicitly Phase 2 (1.1 slot intentionally empty,
1.6). So Phase 1 can elevate a dread item with no calm exit, the exact no-exit-pinned-hero
failure 1.1/1.6 exist to prevent. The plan argues the override "only ELEVATES when it reorders"
and board order varies, but the avoidance tie-break is deterministic on slug/name, so for a
given avoidance card it pins the same direction every poll.

Why it breaks the lens: shame-free / one-thing escape valve. Elevation without an escape is a
guilt pin.

Minimal fix: either keep the avoidance tie-break OUT of Phase 1 until the re-roll ships with it
(accept Phase 1 reads as a sharper status board, which open question 12 already offers), or ensure
the tie-break only affects the LIST order (slots 1..n), never slot 0 (the hero), in Phase 1, so it
cannot pin a dread item as the hero before the escape exists.

### L2. Auto-focus + screen-reader: focusing a button on mount announces a demand to AT users on every Home landing

Where: 6.3 focus order, M8a active-element assertion.

Same root as H2 but distinct surface: auto-focusing the primary action button means a screen
reader announces the action label ("Draft the first version, button") on every Home mount,
including involuntary mounts (last-tab-close routing to Home). For any user relying on AT, that is
an unrequested action announcement at a moment they did not initiate. The same fix (focus the
region/card, not the action) resolves it.

Minimal fix: covered by H2 (focus the Home region, keep the button as first tab stop).

### L3. "N closed, last 24h" suppressed-when-zero is correct, but the transition from a nonzero count back to suppressed mid-session can read as a loss

Where: 1.5 (line 122), 1.10 caught-up (line 178), M8b.

The count is suppressed at zero (good) and shown when nonzero (good). But it is a rolling 24h
window owned in MAIN (1.5), so an entry pruned past 24h can take the count from "2 closed" back
to "1 closed" or to suppressed mid-session, in place. For a brain primed to loss-aversion (the
reason streaks are banned, 1.4), watching the closed count tick DOWN is a small loss signal, the
inverse of the reward. The plan tests the tick-UP and the suppress-at-zero but not the
tick-DOWN-as-pruning behavior.

Why it breaks the lens: shame-free (a decrementing reward count is a micro-loss).

Minimal fix: never decrement the visible count within a session from pruning; let pruning affect
only the next fresh read or the next day's baseline, or freeze the displayed count to its
session-high and only reset on a genuine new-day boundary. Add an M8b assertion that the displayed
`closedRecent` does not decrease within a session purely from 24h pruning.

---

## What I am NOT flagging (caught and tested already)

- Streaks: banned with a guardrail test (1.4, 6.6). Correct.
- Red OVERDUE / red hero fill: capped to a thin edge band, paired with re-roll plan (1.4). Correct.
- "0 of N" goal-at-zero: forbidden on every surface, tested (1.10, 6.6). Correct.
- Motion: motion-safe gated at the TabIndicator source (M2) and on every settle/fade. Correct.
- Per-turn idle pings as the SPINE: rejected in favor of Stop-hook idle + idle-age floor (R2, 5.2).
  Correct.
- Honest-window "last 24h" vs "today": enforced and tested (1.5, 6.6). Correct.
- Paused cards re-surfacing: filtered from hero and pull-forward, tested (4.4, 1.11, 4.6). Correct.
- Four-state cold-open strobe: sequenced in time with fake-timer tests (4.3, 6.5). Correct.
- Hero affordance budget: one primary, tested at-most-one-button (1.1, 6.3). Correct.

These are genuinely handled; I am not going to manufacture objections to them.
