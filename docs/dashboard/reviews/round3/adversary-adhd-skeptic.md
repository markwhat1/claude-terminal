# Adversary review (round 3) — ADHD anti-pattern skeptic

Lens: will this dashboard overwhelm, nag, guilt, or quietly become another shiny thing that gets avoided? Where does it still violate calm-by-default, one-thing, or shame-free? Authority is the recon (E-lanes + round2 R-docs), Mark's ADHD profile, and the live `state.json` read this pass.

Verdict: round 3 fixed the over-correction. The round-2 review's seven defects (D1 affordance cap, D2 stall in-place + default OFF, D3 don't ship five mechanisms at once, D4 avoidance pin pulled forward, D5 zero-payoff suppressed, D6 count-up coarsened, D7 lock-in self-shame) are all genuinely resolved in the plan text, and I verified each below. The three-phase re-cut is the right spine: Phase 1 is now a calm read-only board with exactly one carrot (the done-lane payoff) plus the goal-gradient, and every screen-collapsing or pinning mechanism is Phase 3 default-OFF. The plan also caught real things I would have raised (paused-vs-needs-you is the only structural one left, the rest are tightening).

So this pass does what an adversary should on a third round: it stops re-litigating the resolved carrots and attacks (a) the ONE place the plan reads the producer's calm signal and then ignores it, (b) the gaps the re-cut opened, and (c) the spots where calm-by-default is asserted in prose but not yet bound to a test or a field. None of these should block Phase 1; the first is a real defect, the rest are tighten-before-build.

---

## Round-2 defect closure (verified, so fixes are not regressed)

- D1 (hero control panel): RESOLVED. 1.1 now states a HARD affordance budget (one primary, one quiet "not now", one quiet copy) and 1.9 moves lock-in to intake-only, never a second resting button. The "re-roll and lock-in are semantic opposites side by side" trap is named and banned (1.1, last sentence). Good.
- D2 (stall-interrupt mutates the screen on the frozen user): RESOLVED. 1.8 is in-place pulse only, default OFF, Phase 3, with mandatory motion arbitration (M16 test). The relayout collapse is gated behind an explicit tap.
- D3 (five mechanisms ship at once): RESOLVED. Phase 1 ships the done-lane payoff + goal-gradient only; re-roll/capture move to Phase 2, coaching to Phase 3. The MVP cut inside Phase 1a/1b is honest.
- D4 (avoidance pin all Phase 2): PARTIALLY RESOLVED and HONESTLY STATED. The classifier is pulled to Phase 2 (M13) not Phase 3, and R-8 states plainly that Phase 1 cannot surface no-git-activity avoidance items. See D2 below for why the live data softens but does not erase this.
- D5 (zero payoff reads as guilt): RESOLVED. 1.5 suppresses the count entirely when zero, scopes it honestly to "closed since open", drops the unsourced answered-session count.
- D6 (1s count-up forever): RESOLVED. 1.2 coarsens to minute resolution on the ~20s tick, reserves per-second for a Phase-3 user-started timer.
- D7 (lock-in self-shame): RESOLVED. 1.9 forbids "still not done" / time-since-lock copy (6.6 voice test), softens an unmet lock toward "carry to tomorrow", keeps re-roll reachable.

The plan listened. The findings below are the new surface.

---

## D1 (HIGH) — `paused` is read from the producer and then ignored; a card Mark deliberately parked can still nag him

Where: Section 4.3 schema list ("`paused`" is named as a consumed field), Section 4.1 `DashboardItem` (which does NOT carry a `paused` field), Section 4.4 (the verbatim needs-you signals, no mention of paused), Section 1.11 hero override, Section 5.3 tiers. Live-verified: `marketing-roi` is `paused:true` AND `needs_you:true` in today's `state.json`.

Why it fails the lens: `paused` is the producer's "Mark set this aside on purpose" signal, the single calmest piece of intent in the feed. The plan parses it (4.3 lists it among consumed fields) and then drops it on the floor: it is not in the `DashboardItem` shape (4.1), so by the time the ranker/override/list sees an item, the paused bit is gone. The consequence on real data right now: `marketing-roi` is one of Mark's named avoidance areas (marketing homework), he has it paused, and it carries `needs_you:true`, so it will render in the Phase-1 sub-dominant needs-you list (it is not the hero today only because `practice-reports` wins the time-sensitive override). A board that re-surfaces the exact item the user explicitly parked is the "another shiny thing that nags, so I stop opening it" failure (E4 P4/A9, user profile "batch and park"). This is calm-by-default read straight from the source and then thrown away.

Note the tension this exposes, which the plan must decide rather than inherit: the producer emits `paused:true` and `needs_you:true` on the SAME card, so "consume verbatim, never re-derive" (4.4) and "respect the park" point opposite directions here. The plan cannot do both silently.

Minimal fix: add `paused: boolean` to `DashboardItem` (4.1), carry it verbatim. Then make ONE explicit decision, stated in 4.4 and 1.11: a `paused` card is demoted out of the hero-override candidate set and out of the default needs-you band (it folds into a quiet "N paused" disclosure, findable not visible, A11), even when `needs_you:true`. It is never the hero. One field, one filter in the override, one line in the needs-you list builder, one M4/M8a test asserting a paused+needs_you card is not the hero and not in the default list. This is also the cleanest answer to the open question of how Phase 1 avoids nagging on parked work before the Phase-2 capture/park store exists: the producer already has a park bit, use it.

---

## D2 (MEDIUM) — Phase 1's "one thing" hero is, on today's real data, structurally an admin/server task, not an avoidance item; R-8 understates this

Where: Section 1.11 (single-field override: time-sensitive, else dodAlmost, else producer needs-you head), Section 5.3 (Phase-2 tiers), R-8 ("Phase 1 is a code-activity board"). Live-verified against `state.json`: the 6 needs-you cards are `cad-staff-portal` (needs-CADDC02 server action), `incomplete-notes` (compliance decision, single-item DoD), `marketing-roi` (paused avoidance), `od-query-consolidation` (decisions), `practice-reports` (time-sensitive, the override hero), `cad-document-pipeline` (decision). All green.

Why it partially fails the lens: the override picks `practice-reports` (a "watch the PHI send" monitoring task) as the hero today. The dodAlmost branch would otherwise pick `incomplete-notes` (a BAA compliance decision). Neither is one of the six avoidance areas the app exists to drag into now (E7 1, E1 P5, G 56-62). The avoidance item present right now (`marketing-roi`) is paused and, per D1, will either nag from the list or, once D1 is fixed, be correctly parked, in BOTH cases not the hero. So on real data, Phase 1's hero is whatever the producer flags as time-sensitive or almost-done, which is genuinely useful but is the program-board's existing job. R-8 says this ("Phase 1 cannot surface no-git-activity avoidance items"), which is honest, but it frames the gap as "no-git-activity" when the live data shows the sharper version: even the WITH-git-activity avoidance item (marketing-roi has commits, age_days small) is paused-or-deprioritized, so Phase 1's hero will essentially never be an avoidance item. The differentiated ADHD value lands entirely in Phase 2 (M13 classifier).

This is not a defect to fix by building Phase 2 early; round 2 already correctly resisted that and the re-cut is right. It is a defect of EXPECTATION SETTING that risks the "shiny thing avoided" outcome: if Mark opens Phase 1 expecting it to catch his financial/marketing avoidance and it instead heroes a deploy-watch task, the app reads as "just another status board I already have" and he stops opening it before Phase 2 ever ships. The whole phased bet depends on Phase 1 earning enough real use to justify Phase 2; if Phase 1's hero never touches the avoidance failure mode, the gate may never open.

Minimal fix: two cheap moves, no new mechanism. (1) Sharpen R-8 and Section 1 to say explicitly: "On current data the Phase-1 hero will be a time-sensitive or almost-done dev/admin task; surfacing the avoidance areas (the app's differentiated value) is Phase 2 (M13). Phase 1 is the calm-board foundation, not yet the accountability layer." That makes the limited Phase-1 payoff a stated decision Mark signs off on (it becomes open question 12), not a silent disappointment. (2) Since the avoidance keyword classifier (8.4) is already described as a pure function over `blocked_on`/`needs_you` text the Phase-1 feed carries, consider shipping ONLY its read-only tie-break inside Phase 1b (not the full Tier-5 store), exactly as round-2 D4 proposed, so Phase 1 at least keeps an avoidance item from sinking below a fresher dev card in the 6-row list. The plan moved this to Phase 2 M13; that is defensible, but the live data shows the gap is wider than "no-git-activity", so the decision deserves to be re-surfaced to Mark, not settled by the re-cut.

---

## D3 (MEDIUM) — "Calm by default" is asserted for the needs-you LIST but the list has no size ceiling or disclosure rule; 6 today, but the producer tracks ~25 programs

Where: Section 6.3 ("the ranked rows; each row is actionable inline; `@next`/`@later` (Phase 2) collapse behind one '+N more'"), Section 1.1 (three dominance levels), Section 6.1 (the needs-you area "scrolls internally on short windows"). Live: 6 needs-you cards today, but G 26 notes ~25 active programs and the producer tracks 18 in this snapshot; needs-you is producer-computed and can spike (a bad week where many cards cross the 5-day time-sensitive window or go DoD-almost).

Why it partially fails the lens: the sub-dominant needs-you list is rendered "in board order" (1.11) with every needs-you card as a row. The only collapse rule in Phase 1 is the session strip's "... N more" fold at threshold 5 (6.4), which is the WRONG list, that is the live-tab strip, not the program needs-you list. The program needs-you list itself has no stated cap, no "+N more" disclosure, and no progressive-disclosure floor in Phase 1 (the `@next`/`@later` collapse at 6.3 is a Phase-2 todo concept, not a cap on Phase-1 program needs-you rows). E4 P3/A11 is explicit: lead with the floor of information, reveal the rest on demand; a long needs-you list that scrolls is still a wall, just a vertical one. Six rows is fine. Twelve to fifteen needs-you rows on a heavy week, all equal-weight under the hero, re-creates the exact "list with no clear starting point" paralysis (E4 1, forget.work) the hero was supposed to kill, and "scrolls internally" (6.1) is the plan's only answer, which is "make the wall scroll" not "collapse the wall."

Minimal fix: give the Phase-1 program needs-you list the same disclosure discipline the plan already applies elsewhere. State a default visible cap (e.g. the hero + top N needs-you rows, N around 4-5 to match the calm-tech "max two loud things, short list" floor), with the remainder behind one "+N more" control (counts-on-a-disclosure-control are allowed, E4 F5/A3). One render rule, one M8a test that a fixture with >N needs-you cards shows exactly N rows + a "+N more" control. This is a few lines and it is the difference between "calm on a 6-card day" and "calm on every day."

---

## D4 (MEDIUM) — The done-lane "closed since open" reset-on-launch can make the one Phase-1 carrot pay out almost never, given how Mark actually works

Where: Section 1.5 ("an in-memory 'resolved-since-app-open' set ... reset on app launch, never persisted"), Section 4.6, R-8. Cross-ref G 23/52-54: Mark is "chairside most of the day, away from the terminal," batches work.

Why it partially fails the lens: the round-2 D5 fix (suppress when zero) is correct and shipped, so the carrot never shows a demotivating "0". But the new round-3 sourcing decision (resolved-set reset on every app launch, never persisted) interacts badly with Mark's actual usage to make the carrot show NOTHING most of the time, which is a quieter version of the same problem: the one Phase-1 dopamine mechanism rarely fires. A Done-lane crossing requires a program card to change lane WHILE the app is open and observing polls. Mark is away from the terminal most of the day (G 23); the app is an always-on Home he glances at. Many of his closes happen as a burst of commits in one session, or the lane crossing is observed across an app restart (he reinstalls builds often, and CLAUDE.md/AGENTS.md both warn that installing a release kills running instances). Every restart wipes the resolved set. So the realistic lived experience is: open Home, "closed since open" is suppressed (nothing closed since this launch), glance all day, still nothing, because the closes either happened before launch or in a session that did not stay open across the crossing poll. The carrot that is supposed to make the finish "the most rewarding pixel" (E5 P6, 1.5) is structurally starved.

Minimal fix: the plan already flags "a rolling-window or persisted count is a Phase-2/3 field if real use wants it." Promote that to a stated open question for Mark NOW (it is the carrot's whole point), and lean toward a cheap persisted last-24h count rather than reset-on-launch: persist the resolved-set timestamps to the same `dashboard/` data dir (the app already owns `todos.json` there in Phase 2; a tiny `closed.json` is the same machinery) so a morning glance reflects yesterday evening's wins (the exact case round-2 D5 raised and round-3 dropped to a deferral). If persistence is genuinely out of Phase-1 scope, then say in 1.5 that the carrot is "best-effort, fires only for closes observed while open, may often be empty," so its frequent absence is a known limitation, not a silent failure that reads as "I never finish anything." One sentence of honesty or one small JSON file; pick one, do not leave it implicit.

---

## D5 (LOW) — The Phase-3 morning ritual / lock-in is the mechanism that actually converts a board into accountability, and the phasing risks it never shipping

Where: Section 1.9 (intake-only lock-in, Phase 3 default OFF), 8.7 (morning ritual Phase 3), R-8 ("the accountability ritual is Phase 3 and default OFF; this is a decision, not an accident"), the phase gates throughout (each phase "gated on real use of the prior").

Why it is a latent lens failure, not a defect: I agree with the round-2 conclusion and the round-3 placement; lock-in as a persistent button was correctly killed, and intake-only default-OFF is right (E7 F1/F3). The skeptic flag is structural, not about the design: E7's entire thesis is that the RITUAL (declare intent, the board holds you to it) is what makes this an accountability partner rather than a status mirror, and the plan correctly cites that. But the plan has now placed the single most differentiating ADHD mechanism behind two real-use gates (Phase 1 must earn use, then Phase 2 must earn use) AND defaulted it OFF. Combine that with D2 (Phase 1's hero never touches the avoidance areas) and D4 (the Phase-1 carrot rarely fires), and there is a real risk the app never accrues enough felt value in Phase 1/2 to justify building Phase 3, so the accountability layer, the actual point, is the most likely thing to get stranded. This is the "shiny thing that gets avoided" risk operating at the ROADMAP level rather than the screen level.

Minimal fix: nothing in Phase 1 changes. Make the dependency explicit in Section 10 as a roadmap risk (R-13): "the differentiated accountability value (avoidance surfacing M13, the ritual M17-M18) is gated behind Phase 1/2 real use; if Phase 1's calm board does not itself earn daily opens, the accountability layer never ships. Mitigation: Phase 1 must include at least one avoidance-facing signal (see D2/D3 above) so the foundation hints at the eventual value." This turns an implicit roadmap bet into a stated one Mark can weigh, consistent with how the plan already states R-8.

---

## D6 (LOW) — `prefers-reduced-motion` is promised everywhere but the done-lane settle and the count-up coarsening are the only two with their own tests; the strip's transient settle is unguarded in spec

Where: 1.2 ("every animation gated behind `motion-safe:`"), 1.5/M8b (settle honors reduced-motion, tested), 1.2/D6-round2 fix (count-up coarsen under reduced-motion), 6.4 ("idle: none; transient settle on `justResolved`"), M9 (strip tests two time computations, does NOT list a reduced-motion assertion for the strip's settle decoration).

Why it is a minor lens gap: the plan's reduced-motion discipline is genuinely good (M2 gates the source TabIndicator, a real catch). But 6.4 puts a "transient settle on `justResolved`" decoration on the idle strip row, and M9's test surface lists the two-time-computation assertion and the fold, not a reduced-motion assertion for that strip settle. The settle is tested for the HERO (M8b) but the strip reuses the same justResolved concept (6.4) and its test (M9) does not pin the reduced-motion path. A reviewer could ship a strip settle that animates under `prefers-reduced-motion: reduce` and M9 stays green. For a user who set reduced-motion, an un-gated settle in the periphery is exactly the A7 peripheral-motion the plan fought hardest to remove.

Minimal fix: add one assertion to M9's DoD: under a `prefers-reduced-motion: reduce` match-media mock, a strip row crossing `justResolved` applies NO transition class (mirror the M8b hero assertion). One line of test, no code change if the implementation already uses the `motion-safe:` variant. Cheap insurance that the promise holds on the surface the user stares at all day.

---

## What round 3 got right (so the fixes do not regress it)

- The three-phase re-cut with default-OFF coaching is the correct resolution of the round-2 over-correction. Phase 1 is genuinely calm: read-only board, one carrot, no screen-collapsing, no pinning, no ritual.
- The hard affordance budget on the hero (1.1) is stated as a cap the same way dominance levels are, and lock-in/re-roll are explicitly barred from co-existing as persistent controls. This is the round-2 D1 fix, clean.
- The capped hero color (1.4) plus the zero-suppressed payoff (1.5) plus the no-shame copy rule with a voice test (6.6) together close the three shame seams (red hero, zero count, "still not done" language) the recon flagged. The plan converts each from a rule into a tested string/state.
- The idle-age floor (5.2) keeps "N need you" meaningful, and the coarsened minute-resolution count-up (1.2) removes the perpetual 1s tick. Both round-2 carry-overs landed.
- R-8 stating the Phase-1 avoidance gap as a decision (not an accident) is exactly the honesty standard, and it is what let me sharpen rather than re-discover D2.
- The empty/caught-up state uses the producer's own "Clear. Keep working." and pairs it with the payoff and the pull-forward, so caught-up reads as momentum, not a blank (E4 F9/A12).

The findings here are, in order: D1 (paused ignored, the one real defect, a calm signal read and discarded), then D2/D3/D4 (expectation-setting and disclosure tightening so the calm and the payoff hold on every day and on real data, not just a 6-card demo day), then D5/D6 (a roadmap-risk statement and one test line). None blocks Phase 1. D1 should be fixed before M8a paints real cards, because `marketing-roi` will be in that list on day one.
