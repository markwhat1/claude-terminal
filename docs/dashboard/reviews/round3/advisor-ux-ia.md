# Advisor review (round 3): UX / information architecture

Reviewer lens: UX/IA. Target: `PLAN.md` round-3 revision for the ClaudeTerminal in-app dashboard, `dashboard` worktree (HEAD `ce2e9e0`). Scored against the four focus areas: hero-wins-by-muting hierarchy, the secondary session strip, shadcn/Tailwind fit, and the mandatory empty/loading/error states.

Current grade on the UX/IA lens: about 8.5/10. Round 3 closed essentially every round-2 UX/IA point. Each one landed:

- The three-dominance ladder is now exact Tailwind classes in 6.2's table cells (hero `text-xl font-semibold text-foreground p-6 gap-4`, sub-dominant `text-sm text-foreground px-3 py-2`, strip `text-xs text-muted-foreground px-2 py-1`), with an M8a test that asserts the hero title carries `text-xl` and a strip row carries `text-muted-foreground`. The hierarchy is now buildable, not describable.
- The strip glyph table (6.4) is rewritten to the FIVE real `TabStatus` values, reusing `TabIndicator` verbatim, with the fictional `done`/`failed` rows dropped and "done" reframed as the transient `justResolved` settle on an `idle` row. M9 asserts the strip uses the same status vocabulary.
- The `TabIndicator` motion gate is its own one-change/one-test milestone (M2) instead of riding silently inside M9.
- The hue tint matches the house inline pattern (`border-l-2 border-[hsl(var(--project-hue)_30%_35%)]`), the "never inline style" advice is explicitly dropped, and the hero age band is named as `border-l-4` + `ageColorClass` on the `Card` root.
- The four interaction decisions are decided in-plan (strip row-click jumps via `handleSelectTab`; card row-click is a no-op; fold threshold 5, idle group default-collapsed; strip empty state "No active sessions" in `--muted-foreground`, never a skeleton).
- "N closed today" is honestly rescoped to program-card Done-lane crossings only, renamed "N closed since open", suppressed at zero, with the answered-session count deferred and its missing source named.
- The copy-voice test (6.6) now covers the whole copy module including the strip empty string and the locked-hero copy.

That is a clean sweep of round 2. The verification log is also accurate where I spot-checked it: `TabIndicator.tsx:15/:27` are bare `animate-spin`/`animate-pulse` today (M2 is real work), the five statuses are correct, `--attention` is at `globals.css:62`, and there is no type-scale token so type steps correctly come from Tailwind classes only.

What keeps it off 9 is now a short list of genuine UX/IA gaps, most of them net-new (not round-2 leftovers). They fall in three buckets: one buildability defect in the accent class form, two information-architecture decisions still unmade for the hero region, and the loading/empty-state choreography that the plan specifies statically but never sequences in time.

---

## Verified facts this review rests on

- `--color-attention` is registered in the `@theme inline` block (`globals.css:30`), which makes `text-attention` and `bg-attention` real Tailwind utilities. The codebase applies the attention color ONLY as `text-attention` (`StatusBar.tsx:15`, `TabIndicator.tsx:27`). There is no `bg-[--attention]` anywhere; the project-hue arbitrary classes use the `bg-[hsl(var(--project-hue)_...)]` form, a different mechanism.
- The strip reuses `TabIndicator`, which renders a 12px glyph (`ICON_SIZE = 12`, `[&_svg]:size-3`) wrapped in an `inline-flex` span. It takes ONLY a `status` prop; it has no size, color-override, or "dot" variant.
- `idle` in `TabIndicator` is a GREEN `CheckCircle2` (`text-success`, `:21`), not a dim circle. This is load-bearing for the strip's resting appearance (point 5 below).
- StatusBar's strip is `text-muted-foreground text-xs` with `gap-4 px-3 py-0.5` (`StatusBar.tsx:37`), the closest existing precedent for the session strip's density.

---

## Area 1: Hero-wins-by-muting hierarchy

Strong and now buildable. The three-step ladder in 6.2, the fourth-level ban, the 90%-killer's own tier, the saturation-capped hero band, and the M8a test that pins the hierarchy are all at 9. Three remaining items, one a real defect:

1. **The accent class form is wrong and will fail the M8a test as written (buildability defect).** 6.2 says the hero primary `Button` is `bg-[--attention]`, and 6.3 / Area 3 repeat `bg-[--attention]`. That arbitrary-property syntax is not how this codebase applies the accent and is not guaranteed to resolve. Because `--color-attention` is registered in `@theme inline` (`globals.css:30`), the correct, house-consistent utility is `bg-attention` (and `text-attention-foreground` or an explicit readable foreground for the label, since `--attention` `#ce9178` is a mid-tone where white-on-accent contrast must be checked). Fix every `bg-[--attention]` occurrence to `bg-attention`, and state the button's foreground class explicitly so the label is legible on the accent. This matters precisely because 6.2's DoD asserts the hero carries the accent class: if the test asserts `bg-[--attention]` it green-lights a class that the rest of the app never uses, and if it asserts `bg-attention` the prose and the test disagree. Pin one (`bg-attention`) in both.

2. **The hero has no specified resting-vs-attention contrast on the primary button itself.** The plan reserves `--attention` for the hero primary button and the single highest needs-you dot (1.2), but the hero exists in two very different moods: a calm "review and send" hero versus a hot, long-avoided, red-banded hero. Right now the primary button is `bg-attention` in BOTH. For the calm case that is fine. For the capped-hot case (1.4), a saturated accent button sitting next to a red age band is two loud signals on one card, which is the same over-saturation the cap was added to prevent. State the rule: the age band is the ONLY thing that escalates with heat; the primary button keeps a single constant accent regardless of band color, so heat is communicated once (the band), not twice (band plus a hotter button). One sentence in 6.3, and it keeps the "one saturated accent" budget honest under the hot-hero case.

3. **The hero's empty-of-actions case is unaddressed.** Every hero spec assumes `pickPrimaryAction` returns an action. But Tier 1 (a time-sensitive program card with no `repos[]` resolvable cwd) or an info/review item with no eligible action can land as the hero with nothing for the primary button to do. 1.7's `pickPrimaryAction` routes by kind but the plan never says what the hero renders when the routed action is not constructible (no cwd for PowerShell, no project for Claude-with-query, per 3.1 step 2). State the fallback: when no action is constructible, the hero degrades to its Copy-only affordance plus the goal-gradient line, never a dead/disabled primary button as the dominant pixel. Add it to the M8a test matrix (a hero item whose only action is Copy still renders a complete, non-dead hero).

---

## Area 2: Secondary session strip

Round 2's weakest area is now solid: five real statuses, `TabIndicator` reuse, the idle-age floor keeping "N need you" meaningful, the two distinct time computations with an M9 test, group-by-attention with fold = 5 default-collapsed, and the "No active sessions" empty line. Remaining items:

1. **The strip's identity-tint and status-glyph colors can collide, and the precedence is unstated.** 6.4 puts a `--project-hue` left border on each strip row (`border-l-2 border-[hsl(var(--project-hue)_30%_35%)]`) AND a status glyph with its own color (`text-warning` working, `text-attention` requires_response, `text-success` idle). On a row these are different elements (border vs glyph) so they do not literally overlap, but visually a saturated project hue on the left edge competes with the one accent the strip is supposed to reserve for the single highest needs-you row. State the precedence: the project-hue border is desaturated to a near-flat identity tag (low S, as 1.2 says) so it never reads as a status signal, and the ONLY saturated mark in the strip is the `requires_response`/needs-you glyph. Add it to the M9 assertion set (the hue border class uses the desaturated form, distinct from any status color token) so a builder cannot ship a vivid per-project rail that drowns the attention accent.

2. **"Done" as a transient `justResolved` decoration on an `idle` row needs its render mechanism named, like the hero band was.** 6.4 correctly reframes "done" as a settle beat on an `idle` row rather than a fake status, but it never says what the decoration IS. Since `idle` is already a green `CheckCircle2`, a "just resolved" idle row and a steady idle row look identical unless the settle adds something. Name it: the `justResolved` beat is the 150-200ms ease-out (1.5) plus a one-shot, motion-safe-gated emphasis (for example a brief `text-success` -> `text-muted-foreground` fade on the row, NOT a new glyph), after which the row is an ordinary idle row. Without this, the M8b "renders in the done line" assertion has nothing to assert against on the strip side, and the strip's "done" promise is invisible. One sentence in 6.4 + one M9 line.

3. **The strip's group headers are unspecified, which undercuts group-by-attention.** 6.4 groups needs-you / working / idle and folds idle behind "... N more", but never says whether the groups carry labels or are silent bands. For an ADHD user scanning the periphery, three unlabeled clusters read as one undifferentiated list; a one-word quiet label ("Needs you", "Working", then the "... N more" fold) is the cheap IA win that makes the grouping legible. Decide: silent bands with spacing only, OR `text-xs text-muted-foreground` mini-headers. I would pick mini-headers for the two visible groups (needs-you, working) and let the collapsed fold be its own affordance. State it in 6.4 so it is not re-litigated at code time; this is the last "decide one and state it" the strip still carries.

4. **The aggregate nav badge (`consolidateAttention`) and the strip's per-row signals need a stated non-duplication rule.** 6.4 has both a single aggregate needs-you badge on the Home nav item AND per-row needs-you glyphs in the strip. When Home is the active view, the nav badge and the strip are both visible and both signal the same thing, which is mild but real redundancy. State the intent: the nav badge is for when Home is NOT the active surface (the glance from inside a session), and on the Home surface itself the strip is the source of truth. This is an IA clarification, not new code, but it prevents a builder from making the badge a second always-on counter that competes with the header's "N need you / N working".

---

## Area 3: shadcn / Tailwind fit

Round 3 added the Card-subcomponent question implicitly (6.3 anatomy) and kept M7b. Remaining:

1. **The hero anatomy is still not bound to the vendored Card subcomponents.** 6.3 lists the hero anatomy (icon + name + goal-gradient line + badges + band + buttons) but, after M7b vendors `card.tsx`, never maps it to `CardHeader`/`CardTitle`/`CardContent`/`CardFooter`. I raised this in round 2 and it is the one Area-3 item that did not fully land. Name the mapping in 6.3: kind icon + name in `CardHeader`/`CardTitle`; the goal-gradient line + tag badges in `CardContent`; the primary `Button` + quiet Copy (+ Phase-2 re-roll) in `CardFooter`; the `border-l-4` + `ageColorClass` on the `Card` root. Without it, M8a invents the structure and the "exactly three affordances" budget (1.1) has no structural anchor (the budget should live in `CardFooter`, which makes "no fourth button" a single-location invariant).

2. **`Skeleton` shape is specified as "1 hero block + N rows" but the skeleton's dominance is not.** 6.5/4.5 pin the skeleton shape and `data-testid`, good. But a loading skeleton that gives the hero block and the row blocks equal visual weight pre-trains the eye to a flat hierarchy, then the real content snaps into the hero-dominant layout, which is a small but real layout shift and a hierarchy flicker. State that the skeleton mirrors the dominance: the hero skeleton block uses the hero's `min-height` and width, the row skeletons use the sub-dominant row height, so the skeleton-to-content transition has no reflow and the hierarchy is legible even while loading. Add the hero-skeleton-min-height assertion to the M8a skeleton test.

3. **`Tooltip` is vendored (M7b) but the plan decided helper text over tooltips for the disabled-reason (3.2).** So the only consumer of the vendored `Tooltip` is unclear. Either name where `Tooltip` is actually used (for example the Copy "Copied" confirmation, or a truncated-title hover) or drop it from M7b's `pnpm dlx` line. Vendoring an unused primitive is minor, but M7b's DoD is "the three files exist and mount", which passes without anything consuming `Tooltip`; that is a latent dead-dependency. One sentence: name the `Tooltip` consumer or cut it to `card skeleton`.

---

## Area 4: mandatory empty / loading / error states

Strong: per-region states, last-good preference, error-distinct-from-degraded, three program empties, the strip empty line, and the cross-region reading (caught-up hero over a live strip) are all specified. Two refinements, the first the most valuable single UX addition in this review:

1. **The states are specified statically but never sequenced as a first-open TIMELINE, and that sequence is where the ADHD-calm promise is won or lost.** The plan has skeleton, then real cards or the right state (4.3). But on a cold first open the actual sequence is: skeleton -> (file may not exist) -> HTTP fallback with a 2-3s AbortController -> possibly the "not running" empty -> possibly real data arriving on the next ~20s poll. Without a stated timeline, a builder can ship a surface that flashes skeleton -> "Program board not running" -> (3s later) real cards, which is exactly the jarring, broken-feeling first-run the calm-by-default principle exists to prevent. Pin the sequence: hold the skeleton until the FIRST read resolves (file OR HTTP fallback OR the bounded timeout elapses), and only then commit to either real cards or an empty/error state; never show the "not running" empty while a fallback is still in flight; once committed to "not running", a later successful poll transitions in place (last-good preference) without a second skeleton. Add a timeline assertion to M8a using fake timers: skeleton persists across a pending-fetch tick, the "not running" state appears only after the bounded timeout, and a subsequent successful read replaces it without re-showing the skeleton. This converts "four states exist" into "the four states never strobe", which is the actual UX bar.

2. **The degraded ("last updated Nm ago") banner placement and persistence are unstated.** 6.5 says degraded shows the banner with data still shown, but not WHERE (a top strip across the hero region? a line in the needs-you header?) or whether it is dismissible. For calm-by-default, a persistent degraded banner that cannot be dismissed becomes ambient noise on a flaky-poll day; an auto-dismissing one hides a real staleness signal. Decide: the degraded marker is a single quiet `text-muted-foreground` line in the needs-you header next to "N need you" (NOT a full-width banner, which spends the hero region's vertical budget and competes with the hero), non-dismissible but quiet, and it clears itself the instant a fresh read lands. State it in 6.5 and add a placement assertion to M8a. The word "banner" in 6.5/4.5 implies a heavier treatment than the calm principle wants; downgrade it to a header line and say so.

---

## Cross-cutting

1. **Keyboard traversal of the Home view is still unstated for Phase 1.** Round 2 raised this; round 3 dropped the false "keyboard-first" promise (good) but still never states the minimum. For an ADHD tool the hero primary button being focus-and-Enter-reachable is the difference between "I can act without the mouse" and "I have to aim". State the Phase-1 minimum (it is nearly free, shadcn `Button` is focusable by default): the hero primary button is first in the Home tab order and Enter-activates; Copy is reachable by Tab; the strip rows are focusable and Enter jumps to the tab (they already have `handleSelectTab` wired); no custom arrow-key model in Phase 1. Add a focus-order assertion to M8a (the hero primary button is the first focusable element in the Home region). This closes the half-promise without scope creep and makes the hero genuinely the one-action surface it claims to be.

2. **The hero "decision context as a one-liner" (6.3) is an unscoped free-text slot that fights the PHI discipline.** 6.3 says the hero shows "the goal-gradient line OR the decision context as a one-liner". The goal-gradient line is producer-computed and safe. But "the decision context as a one-liner" has no named source; the obvious source is `DashboardItem.detail` (the `blocked_on` text), which 4.1 marks as NEVER fed to composeClaudeQuery and NEVER logged but says nothing about RENDERING. Rendering `detail` is allowed (it is on-screen, not in argv/logs), but the plan should state explicitly that the hero one-liner, when it is not the goal-gradient, renders `detail`/`needsYouReasons` as DISPLAY-ONLY text and is never the source for any action body. This is a one-sentence IA clarification that keeps the render/action boundary from being re-blurred at the hero, the most prominent surface.

3. **"N closed since open" resets on app launch, which collides with the all-day-open usage model.** 1.5 honestly scopes the count to an in-memory resolved-set reset on launch. For a tool whose whole point is to stay open all day driving many sessions, "since open" can mean "since 7am", so by afternoon the number is large and the dopamine beat is diluted, OR if the app restarts the count silently zeroes mid-day and the user loses their visible progress (a small but real loss-aversion hit for exactly this user profile, per the open-question 8 streak-appetite caution). This is fine for Phase 1 as a stated tradeoff, but the copy should match the mechanic: if it resets on launch, "since open" is honest; just make sure 6.6's pinned string is literally "N closed since open" (it is) and that open-question 1/8 surfaces the reset behavior to the user so the Phase-2 rolling-window decision is made deliberately, not discovered. No code change; one line in the open questions making the launch-reset explicit to Mark.

---

## Concrete additions to specific milestones

- **6.2 / 6.3 / M8a (defect):** replace every `bg-[--attention]` with `bg-attention`; state the button foreground class for legibility on `#ce9178`; the M8a accent assertion checks `bg-attention`, matching the house pattern, not the arbitrary-property form.
- **6.3 / M8a:** map the hero anatomy to `CardHeader`/`CardTitle`/`CardContent`/`CardFooter` and put the three-affordance budget in `CardFooter` so "no fourth button" is a single-location invariant; state the no-action-constructible fallback (Copy-only hero, never a dead primary button) and add it to the test matrix.
- **6.3 / M8a:** state that the heat signal escalates only via the age band, the primary button keeps a constant accent regardless of band color; state that the hero one-liner, when not the goal-gradient, is DISPLAY-ONLY `detail` text and never an action source.
- **6.4 / M9:** decide the strip group headers (quiet `text-xs text-muted-foreground` mini-headers for needs-you and working, the fold its own affordance); state the project-hue border is desaturated low-S so it never competes with the status accent, and assert that in M9; name the `justResolved` strip decoration (motion-safe one-shot fade, no new glyph) so M8b's "done line" has something to assert.
- **6.4:** state the nav-badge / strip non-duplication rule (nav badge is the off-Home glance, the strip is truth on Home).
- **6.5 / M8a (highest-value add):** pin the first-open state TIMELINE (skeleton holds until the first read or the bounded timeout resolves; "not running" never shows while a fallback is in flight; a later successful read replaces an empty/error in place with no second skeleton) and assert it with fake timers.
- **6.5 / 4.5 / M8a:** downgrade the degraded "banner" to a quiet `text-muted-foreground` header line next to "N need you", non-dismissible, self-clearing on a fresh read; assert placement.
- **6.0 / M7b:** name the `Tooltip` consumer or cut M7b to `card skeleton`.
- **M8a:** add the skeleton-mirrors-dominance assertion (hero skeleton uses the hero `min-height`) so loading-to-content has no reflow.
- **M8a:** add the Phase-1 keyboard minimum (hero primary button first in tab order, Enter-activates; Copy Tab-reachable; strip rows focusable and Enter-jump) and a focus-order assertion.
- **10.2:** make the "N closed since open" launch-reset behavior explicit in open question 1/8 so the Phase-2 rolling-window decision is deliberate.

---

## What is already at 9 and should not be touched

- The three-dominance ladder bound to exact Tailwind classes with the M8a hierarchy test (6.2). This was round 2's biggest hole and it is now buildable and testable.
- The strip glyph table rewritten to the five real `TabStatus` values reusing `TabIndicator` verbatim, with the fictional `done`/`failed` rows dropped (6.4). Round 2's weakest area, now correct against the data model.
- The `TabIndicator` motion gate as its own one-change/one-test milestone (M2), which also fixes the existing tab bar.
- The saturation-capped hero band paired with the deferred re-roll (1.4 / 1.6) as an ADHD-specific anti-shame mechanism, and the honest "a red hero every morning is an OVERDUE stamp" reasoning.
- The 90%-killer as its own tier driven off the producer's exact predicate including the single-item DoD, with the goal-gradient reframe (Tier 3 / 1.10 / 4.4).
- The four per-region states with last-good preference, the distinct error-vs-degraded split, and the three-empty taxonomy with the verbatim "Clear. Keep working." reuse (4.3 / 4.5 / 6.5).
- The relative-time discipline: minute-coarsened ambient count-up, two distinct computations with an M9 test, per-second ticking reserved for an explicit Phase-3 focus timer (1.2).
- The hue tint aligned to the house inline pattern with the round-1 "never inline style" advice explicitly dropped (1.2 / 6.4).
- The "N closed since open" honest rescope to producer-sourced Done-lane crossings, suppressed at zero, with the answered-session count deferred and its missing source named (1.5).
- The copy-voice test covering the whole copy module including the locked-hero "no time-since-lock" assertion (6.6).
- The one-thing hero with the hard three-affordance budget and the re-roll/lock-in mutual-exclusion (1.1).

The remaining work to reach 9 is the last mile of the same kind round 3 already did: fix the one accent-class defect, bind the hero to the Card subcomponents, decide the strip group-header and hue-precedence questions, and (the single highest-value add) sequence the first-open states as a timeline so the four states never strobe. None of it is a rethink. The hierarchy, the strip vocabulary, and the state taxonomy are all genuinely strong.
