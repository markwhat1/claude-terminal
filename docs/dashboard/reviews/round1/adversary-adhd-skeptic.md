# Adversary review — ADHD anti-pattern skeptic

Lens: will this dashboard overwhelm, nag, guilt, or quietly become another shiny thing that gets avoided? Where does it violate calm-by-default, one-thing, or shame-free? Authority for every claim below is the recon itself (round1 E-lanes + round2 R-docs) and the user's own ADHD profile, because that body of work is what the plan is supposed to honor. I attack where the plan dropped, weakened, or contradicted a high-confidence recon finding.

Verdict: the plan is excellent on the *mechanical* ADHD layer (one hero, calm color, relative time, no uninvited motion, shame-free escalation copy). It is dangerously thin on the *motivational* and *ritual* layers that the recon marked high-confidence and load-bearing. The dropped pieces are exactly the ones that decide whether Mark keeps opening this thing after week two. A calm board he doesn't return to is the "shiny thing that gets avoided" failure restated.

---

## D1 (HIGH) — The completion / "done" payoff loop is missing entirely

Where: Section 1 (principles), Section 6.5/6.6 (states/copy), Section 7 (M1-M11). Phase 1 ships with no completion feedback at all. The only mention anywhere is a one-line "a small 'N done today' count ticks" buried in Phase 2 §8.7.

Why it fails the lens: this is the single most-converged high-confidence finding across three independent lanes, and the plan dropped it.
- E5 P2 ("Show DONE, not just TODO," high) and P9, E4 P9/F7 ("completion feedback + auto-promote next," with F9 empty-state-as-momentum), E1 P6 ("visible progress feeds the dopamine loop," and explicitly "make the finish the most rewarding pixel on screen") all say the same thing: an ADHD brain runs on low baseline dopamine, and a board that only ever *demands* (here are the things you owe) without ever *paying out* (here's what you closed) becomes a guilt object and gets avoided. The recon names this directly: a done lane "makes the dashboard feel like it is paying out, not just demanding."
- The plan's hero loop is all stick, no carrot. The hero shows the next obligation; when you finish it, the next obligation slides up. Nothing acknowledges the close. For exactly the avoidance categories this app exists to fight, the finish is the moment that has to feel good or the loop never reinforces.

This is not gold-plating. The recon rates it high. The plan even cites E5's "Clear. Keep working." empty state but skipped E5's central thesis around it.

Minimal fix: add Phase 1 completion feedback for the live-session loop you already have, before any todo store exists. When a tracked needs-you item resolves (a tab leaves the needs-you set, a `dodAlmost` card's last gap closes, a needs-you program card clears), give it a small in-place settle (a check that fills, the row receding) and a quiet running "N closed today" glance metric in the needs-you list header you already spec in 6.3. Honor `prefers-reduced-motion` (you already gate motion). No confetti (E5 anti-pattern 3/4). This reuses signals Phase 1 already has; it does not require the Phase 2 store. Add it as an M8/M9 acceptance criterion plus a one-line item in the unified model (a transient `justResolved` flag) so the renderer can fire the beat.

---

## D2 (HIGH) — The idle-after-activity spine fires every turn; the plan never bounds the resulting needs-you churn

Where: Section 1.2 ("no uninvited motion"), Section 5.2 (the R2 spine), Section 6.3 (the "4 need you / 2 working" glance metric), Section 6.4 (strip grouping).

Why it fails the lens: R2 is explicit that the Stop hook fires `idle` "once per turn when Claude finishes responding." The plan adopts `idle && hadActivity` as the PRIMARY needs-you signal. That means: every time any tab finishes any turn, it enters the needs-you set. Mark runs many concurrent sessions (the app's whole reason to exist). In normal use, several tabs will be sitting `idle && hadActivity` at once, almost all of the time, because that is the resting state of a session between turns. The needs-you list and the "N need you" count will read 3, 4, 5+ as a near-constant baseline.

That is the wall, restated. E4 A3 (badge soup), E4 A1 (everything equal weight = freeze), and the plan's own Section 1.1 ("never a row of equal cards") all forbid exactly this. A needs-you count that is almost never low stops meaning "you owe a response" and becomes ambient noise the brain filters out (E4 A9, E3 anti-pattern on habituation). The hero still picks one, fine, but the sub-dominant list directly under it becomes a 5-row guilt strip every time you glance.

The plan half-sees this: Section 5.2 adds the 45-60s idle-escalation heuristic for the AskUserQuestion gap. But that is for *promoting* slow items, not for *suppressing* the firehose of just-finished-a-turn idles. Tier 2 (`idleNeedsYou === true`) has no recency floor: a tab that finished a turn 3 seconds ago and a tab abandoned 40 minutes ago are both in Tier 2, sorted only by idle duration. The freshly-idle tab is not "needs you," it's "you're mid-conversation with it."

Minimal fix: split the live-tab needs-you signal by idle age. A tab that is `idle && hadActivity` for LESS than a short floor (say the same ~45-60s you already picked for the AskUserQuestion escalation) is "ready / your turn, mid-flow" and belongs in the SUBORDINATE strip (working/idle middle band), NOT in the needs-you list or count. Only after it crosses the floor does it enter the sub-dominant needs-you set. This makes "needs you" mean "has been waiting on you long enough that you've probably lost the thread," which is the actual signal. One threshold, applied in `rankItems`/the mapper, gated by a test. Update the 6.3 glance metric and Tier 2 definition accordingly.

---

## D3 (HIGH) — The morning intake / commitment ritual and the "commitment mirror" are dropped to a Phase 2 parenthetical

Where: Section 1 has no ritual. Section 8.7 mentions "the morning intake (optional, cue-bound to first-open)" in one clause, inside Phase 2, with no spec. Section 10.2 Q3 asks about `startupView` default but never about the ritual.

Why it fails the lens: E7 is the entire coaching/accountability lane, and its highest-confidence findings (P1 "the dashboard IS the body double," P2 check-in ritual, P3 "declare intent; the dashboard holds you to it," F1 morning intake, F2 commitment mirror) all converge on one thing: a status board becomes an *accountability partner* only when the user declares an intent and the surface reflects it back. E3 §4.8 (event-anchored, not clock) and E1 P5 (external working memory) reinforce it. The recon's blunt framing: "The ritual is what converts a status board into an accountability partner." Without it, this is a read-only status board. Mark already has program-board for read-only status. The new value this app was supposed to add is the body-double relationship, and the plan defers all of it to a sketch.

The risk is precisely the prompt's "shiny thing that gets avoided." A board with no ritual and no payout (see D1) gives no reason to return. The recon predicts this directly (E7 C9: completing-the-loop dying silently is "the project's whole reason to exist").

Minimal fix: I am not asking to build the Phase 2 todo store early. The cheap, Phase-1-feasible version: the hero already picks one thing. Add a one-tap "lock this in as today's one thing" on the hero, and once locked, render the hero as a commitment mirror ("Your one thing today -> [item]") that persists across re-polls until resolved or re-rolled, pinning it above the auto-rank for the day. This needs a tiny piece of renderer state (a per-day pinned hero id), not the whole store. Cue it to first-open (you already touch the two `setActiveTabId` startup sites in M11). If even that is too much for Phase 1, then at minimum the plan must say plainly, in Section 1 and the risks, that Phase 1 ships as a read-only status board with NO accountability ritual, so the gap is a stated decision and not an accident. Right now the ritual's absence reads as an oversight, given how heavily the recon weights it.

---

## D4 (MEDIUM) — The single auto-ranked hero has no re-roll and no stall pattern-interrupt; it can lock onto a dreaded item with no exit

Where: Section 5 (ranking), Section 6.2 (hero card), Section 6.5 (Focus mode is the only escape). Section 10.2 Q1 asks the user about a hand-pin override but ships "auto-rank only."

Why it fails the lens: every E-lane that discussed the hero also specified an escape from it. E5 5.1 ("a 'Not this — give me another' control... the pattern-interrupt escape that re-rolls the hero... without dumping the user back into a 10-item menu"), E4 F8, E1 P8/P2, E7 P9, and the user's own profile (pattern-interrupts to break oscillation) all require it. The plan ships a deterministic ranker (good for anti-flicker, D-correct) but with no user move when the #1 item is the very thing being avoided. Tier 4's "hotter ageColor first, oldest first" guarantees that a long-avoided financial/marketing item (exactly the categories the profile flags) will deterministically pin itself as the hero and STAY there every poll until acted on. For an avoidance brain, an immovable hero showing the dreaded thing is not motivating; it is a guilt billboard you learn to not-look-at, and then you stop opening the app. The plan's only escape, Focus mode (6.5), collapses to *only* the hero, which makes the dreaded item more dominant, the opposite of an escape.

Worse, there is no stall detection. E5 P8, E1 P8, E7 P9 all call for a pattern-interrupt when the user is visibly oscillating (opens the board repeatedly without acting). The plan has nothing. The deterministic ranker will show the identical hero on every visit, which the recon names as habituation/invisibility (E3, E4 A9).

Minimal fix: add a quiet "not now / show me another" control on the hero that demotes the current hero for a short window (parks it, surfaces `ranked[1]`). This is one renderer-side parked-id-with-expiry, no store, no IPC. It doubles as the controlled-novelty mechanism the recon wants (E5 P6). Defer the auto-stall-detection interrupt to Phase 2 explicitly, but ship the manual re-roll in Phase 1; it is the minimum viable pattern-interrupt and the recon treats it as part of the hero, not an extra.

---

## D5 (MEDIUM) — "More visible, never a red OVERDUE" escalation has a hole: the hottest band IS red, and the plan reuses program-board's red verbatim

Where: Section 1.4 ("age color drifts cooler-to-hotter (green to red, verbatim program-board bands)"), Section 4.3 (age-color consumed verbatim, red `>= 14`), Section 6.2 (age color on the hero's left edge).

Why it partially fails the lens: the plan correctly bans the OVERDUE *stamp* and guilt *labels* (good, matches E5 anti-pattern 6, E1 AP6, E7 C2). But it then escalates avoidance items by drifting them to saturated RED and pinning them as the hero (Tier 4, hotter-first). For Mark's avoidance categories specifically, a red hero card is functionally the same shame signal as an OVERDUE stamp; the recon's nuance (E1 AP6, E5 P7, E7 P4) is "honest staleness color, yes; a wall of angry red, no" and "escalate salience, never guilt." A solitary red hero on the financial item every morning reads as "you're behind on the scary thing," which the recon says *increases* avoidance. The plan inherited program-board's day-scale red band without asking whether a personal-accountability surface for avoidance items should hit full red the same way a neutral program card does.

This interacts with D4: deterministic ranking + verbatim red + no re-roll = the dreaded item is reliably the reddest, most dominant thing on screen with no way to defer it. That compounding is the avoidance trap.

Minimal fix: keep age-color verbatim for program *cards in the list* (consistency with program-board is worth it, R4 is right). But for the HERO specifically, and for avoidance-category items specifically (Phase 2), cap the saturation: use the age color as a thin left-edge band, not a fill, and never let the hero card body go red. The plan already says color is "signal not decoration" and reserves the one saturated accent for the primary button (1.2); apply that same restraint so the escalation is "this rose to the top and is gently warm," not "this is screaming red at you." Pair with the D4 re-roll so a hot item is always deferrable. Add a sentence to 1.4 distinguishing list-row color (verbatim) from hero color (capped).

---

## D6 (MEDIUM) — Empty/caught-up state is calm but not a payoff; "Clear. Keep working." alone misses the momentum beat

Where: Section 1.4, Section 4.3, Section 6.5 all reuse program-board's verbatim "Clear. Keep working." for the caught-up state.

Why it partially fails the lens: reusing the verbatim copy is good (it dodges E4 A12's "No items / Nothing here" failure and keeps voice consistent). But the recon asks for more than calm here: E4 F9 ("empty/done state reads as momentum... optionally with the single oldest backlog item offered as 'want to pull one forward?'") and E5 P2 (the caught-up state is where the done-payoff should be most visible). The plan's caught-up state is a dead end: you cleared everything, and the board says one neutral line and offers nothing. For an ADHD brain that just earned a dopamine moment by clearing the needs-you set, that is the moment to pay out (D1) and optionally offer the next pull-forward, not to go blank. A blank-but-polite board after a win trains "nothing happens when I finish," which erodes the loop.

Minimal fix: when the needs-you set is empty, keep "Clear. Keep working." as the headline but pair it with the day's "N closed today" payout (the D1 metric) so the win is acknowledged, and offer one quiet "pull one forward?" surfacing the single oldest backlog/`@next` item (Phase 2) or the calmest active program card (Phase 1). One optional secondary line, calm, opt-in to act. This is a 6.5 acceptance-criterion change, not new architecture.

---

## D7 (LOW) — Capture exists but triage has no spec, and untriaged-inbox growth is an unaddressed overwhelm vector

Where: Section 1.3 (capture, "triage is a batched mode off the hero"), Section 8.3 (untriaged items "sit in a capture inbox surfaced in the batched triage mode"), Section 8.8 (M15 "the triage mode" one line).

Why it's a latent failure: the plan nails capture (zero required fields, sub-2s, correct ADHD pattern per E1 P3). But capture without a low-friction, low-shame triage path just relocates the wall: the untriaged inbox grows, and an inbox of 60 un-triaged raw-text items is itself a guilt object and an overwhelm surface (E4 A11, E7 C5 "confrontation by volume produces freeze"). The plan defers all triage design to a single milestone line with no anti-overwhelm rules. The risk is building the easy half (capture) and shipping the hard half (triage that doesn't itself overwhelm) as a stub.

Minimal fix: add two constraints to §8.3/§8.8 now, so the eventual build can't violate them: (1) triage surfaces ONE untriaged item at a time (J.O.T. applied to triage), never the full inbox list, with a one-tap horizon assignment and a one-tap "park / not now"; (2) the untriaged count is shown as a single quiet glance number, never a red badge, and never auto-promoted to the hero. This keeps the Phase 2 triage honest to the same one-thing/shame-free rules the rest of the plan follows.

---

## What the plan got right (so the fixes don't regress it)

- One hero, three dominance levels, fourth banned (1.1, 6.1): correct and well-enforced via the component prop shape.
- Calm-by-default color discipline, one saturated accent, motion suppressed under reduced-motion (1.2): textbook calm-tech, matches E4 P4/A4/A7.
- Relative time everywhere via one helper, count-up not countdown (1.2, M7): matches E3 P2/P7 exactly.
- Shame-free escalation *copy*, neutral verb-first, no OVERDUE stamp, "Clear. Keep working." voice (1.4, 6.6): matches E5/E7/E1 anti-patterns on guilt.
- Deterministic ranker with id tie-break for anti-flicker (5.5): correctly solves the "page never sits still" anti-pattern (E4 A6).
- `startupView` defaults to `lastSession`, Home opt-in, no forced splash (M11, 10.1 R-8): correctly avoids the dead-splash / double-gate friction (E4, F1 lesson).

The fixes above (D1, D3, D4, D6 especially) are about adding back the motivational and ritual layers the recon marked high-confidence, not undoing any of this. Do D1 and D2 at minimum before shipping Phase 1; they are the difference between a calm board and a calm board Mark actually returns to.
