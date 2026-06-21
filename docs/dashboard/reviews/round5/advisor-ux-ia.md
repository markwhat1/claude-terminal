# Advisor review (round 5): UX / information architecture

Reviewer lens: UX/IA. Target: `PLAN.md` round-5 revision for the ClaudeTerminal in-app dashboard, `dashboard` worktree (HEAD `ce2e9e0`), Phase 2/3 extracted to `PLAN-PHASE-2-3.md`. Scored against the four focus areas: hero-wins-by-muting hierarchy, the secondary session strip, shadcn/Tailwind fit, and the mandatory empty/loading/error states.

Current grade on the UX/IA lens: about 9.2/10. Every round-4 must-fix and all three nits landed in full and are now tested (keyboard floor in 6.3 + M8a focus-order assertion; degraded downgraded from banner to a muted header line in 4.3/6.5 with a no-reflow assertion; skeleton-mirrors-dominance in 4.5 with the hero-min-height assertion; the nav-badge off-Home rule in 6.4; `--attention-foreground` registered dark and AA-asserted in M7b; `--age-orange` as a real distinct token; the shell-glyph arbitrary-value note). This is a complete absorption again.

I reviewed round 5 by diffing it against my round-4 review AND by re-grounding the new claims against source, because round 5 promoted real write actions, the strip, and the keyboard floor into testable milestones, which is where new IA collisions surface. The remaining gap is no longer in any single section the plan has been polishing. It is in the seams BETWEEN the new Home surface and the app chrome that already exists, which the plan cites for line numbers but never reconciles as competing information surfaces. Four of those, plus a short buildability cluster, are what stand between 9.2 and 9.5.

---

## What landed from round 4 (confirmed against the plan and source)

- **Keyboard floor is real and tested.** 1.1 and 6.3 state the Phase-1 minimum (hero primary first focusable, Enter-activates; Copy Tab-reachable; strip rows and the "+N more"/"N paused" disclosures focusable; no custom arrow model), and M8a asserts the first focusable element in Home is the hero primary action and it Enter-activates. The biggest round-4 gap is closed.
- **Degraded is no longer a banner.** 4.3 and 6.5 specify a single quiet `text-muted-foreground` line in the needs-you header, non-dismissible, self-clearing, and M8a asserts it renders as a header-adjacent muted line, not a banner element, and does not reflow the hero. The word "banner" is gone from the states sections.
- **Skeleton mirrors dominance.** 4.5 says the hero skeleton uses the hero grid area + `min-height` and rows use the sub-dominant height, with the M8a assertion that the hero skeleton carries the hero min-height. The within-skeleton SHAPE strobe is closed alongside the round-3 STATE strobe.
- **Nav-badge off-Home rule.** 6.4 states the aggregate badge is the off-Home glance and the unified header count is the source of truth on Home, with the explicit "do not turn the badge into a second number that competes" instruction.
- **Foreground/contrast tokens resolved.** M7b registers `--attention-foreground` dark (`#1e1e1e`, ~5.5:1 on `#ce9178`) and `--age-orange` as a distinct desaturated tone, both with M7b render assertions, and M8a asserts the hero button foreground passes AA.

That is the clean sweep, two rounds running. The hierarchy, state taxonomy, strip vocabulary, and cold-open choreography are all at 9.

---

## Must-fix 1: the new SessionStrip collides with two status surfaces that already exist (StatusBar + TabBar), and the plan never reconciles them

This is the highest-value remaining UX finding, and it is invisible from inside the plan because the plan treats the strip as a clean new component. It is not. The running app already paints tab status in two places the plan cites for line numbers but never reads as information surfaces:

- **`StatusBar`** (`src/renderer/components/StatusBar.tsx`, mounted at `App.tsx:585`, verified) renders an aggregate count row at the bottom of the window: working / idle / input / new, each `TabIndicator` glyph + a count, scoped to `activeProjectTabs` (the active project only). It is always visible, including when Home is the active view (it is a sibling of the `data-terminal-area` container the Home seam lives inside, so it does not unmount on Home).
- **`TabBar`** (`App.tsx:555`) renders one row per tab with the same `TabIndicator` glyph + the tab name, also scoped to the active project.

The plan's SessionStrip (6.4) is a THIRD surface with the SAME `TabIndicator` vocabulary, but scoped to ALL real `tabs` (cross-project, per 2.6 "the real-tab array for the live strip"). So on the Home view a user sees, simultaneously:

1. TabBar: per-tab glyphs + names, active project.
2. StatusBar: aggregate working/idle/input/new counts, active project.
3. SessionStrip: per-session rows with glyph + name + relative time, ALL projects, grouped by attention.
4. The needs-you header's "N need you / N working" unified count (4.6), all projects.

Four surfaces, three different scopes, one status vocabulary. This is exactly the "competing counter" failure the plan correctly forbade for the nav badge (6.4) and never applied to its own strip. Worse, StatusBar's "N working" (active project) and the needs-you header's "N working" (unified) will routinely show DIFFERENT numbers on the same screen, which is the time-blind-brain confusion the whole plan exists to remove. The strip and StatusBar are near-duplicates that disagree.

This needs an explicit IA decision in 6.4, in three or four sentences, before M9 builds the strip:

- **State the scope reconciliation.** Either the strip is the cross-project superset and StatusBar is hidden/suppressed on the Home view (cleanest: when `activeTabId === HOME_TAB_ID`, the bottom StatusBar is redundant with the strip and should not also render its own counts), OR the strip is explicitly the only multi-project status surface and StatusBar stays project-scoped with a one-line note that the two scopes differ by design. Pick one and say which.
- **Resolve "N working" appearing twice at two scopes.** The needs-you header count (4.6) and StatusBar's working count must not both be visible on Home showing different totals. The decision can be "StatusBar does not render on Home" or "the strip header carries the only working count on Home"; either removes the contradiction. M9 (or M8a, since StatusBar is already mounted) gets one assertion: on the Home view there is exactly one working-count source visible.
- **Name the relationship to TabBar.** TabBar is per-project navigation; the strip is cross-project attention triage. State that the strip is NOT a second tab bar (it groups by attention, not project, and its row-click jumps via the same `handleSelectTab`), so a builder does not reach for TabBar's per-tab affordances (rename, close, drag) on strip rows. 6.4 already says a strip row-click jumps and a card row-click is a no-op; extend that to "strip rows carry no close/rename/drag affordance; the strip is read-and-jump only, distinct from TabBar."

Without this, M9 ships a fourth status surface that contradicts an existing one on the exact screen meant to be the calmest in the app. This is the single most load-bearing IA gap left, and it is grounded in code the plan already cites.

---

## Must-fix 2: the Home grid lives INSIDE `data-terminal-area`, which has no documented layout contract for a full app-shell view

6.1 specs a CSS grid with named areas `hero` / `needs-you` / `groups` / `strip` and a responsive breakpoint flipping the strip between a right rail (wide) and a bottom strip (narrow). Good. But the render seam (2.2, verified `App.tsx:576`) places HomeView as a sibling of `{tabs.map(...)}` INSIDE `<div className="flex-1 relative overflow-hidden" data-terminal-area>`. That container is `relative` + `overflow-hidden` and is sized by `flex-1` inside a `flex flex-col` column that ALSO contains TabBar (above) and StatusBar (below). Three consequences the plan never states:

- **The Home grid's height is whatever `flex-1` leaves after TabBar and StatusBar.** The hero `min-height` (6.1) can exceed that on a short window, and the container is `overflow-hidden`, so the hero can be clipped rather than scrolled. 6.1 says "needs-you and groups scroll internally so the hero never reflows," but it never says the Home grid root itself must be `h-full overflow-hidden` with only the inner regions scrolling, inside a parent that is already `overflow-hidden`. State that HomeView's root fills the `data-terminal-area` box (`absolute inset-0` or `h-full`, matching how `Terminal` fills it) and owns its own internal scroll, so the hero is never clipped by the parent's `overflow-hidden`.
- **The breakpoint in 6.1 is a CONTAINER-width breakpoint, not a viewport one.** The strip rail-vs-bottom flip must key off the `data-terminal-area` width (which shrinks when the ProjectSidebar is expanded, `App.tsx:544`), not the window width, or an expanded sidebar on a medium window flips the layout wrong. Tailwind's default breakpoints are viewport-based; this needs a container query (`@container`, which Tailwind v4 supports) or a measured width. Say which. One sentence prevents M8a/M9 from shipping a viewport breakpoint that misbehaves with the sidebar open.
- **The strip is specced as a grid area (`strip`) in 6.1 AND as a separate component `SessionStrip.tsx` in M9.** State that the grid reserves the `strip` area and HomeView renders `<SessionStrip>` into it, so the grid-area decision (6.1) and the component decision (M9) are the same surface, not two. This is a one-line cross-reference but it prevents the strip from being built as a free-floating element ignoring the grid.

This is buildability-of-the-layout, the same class as the round-4 "min-height/grid" work, but one level up: the grid has to coexist with the app shell it is injected into, and the plan specs the grid in isolation.

---

## Must-fix 3: "+N more" expand and the "N paused" disclosure have no in-place-expansion behavior spec, and they can fight the hero's no-reflow rule

4.6 and 6.3 cap the needs-you list at hero + N rows with one "+N more" control, and the expanded overflow is grouped by age-band mini-headers (a good round-5 add). 4.4/6.5 fold paused cards into a quiet collapsible "N paused" disclosure. Both are correct as IA. But the plan never says HOW they expand, and the obvious implementation breaks a rule the plan enforces elsewhere:

- If "+N more" expands IN PLACE (pushing the strip/groups down), it reflows the layout below the hero on every expand/collapse. The plan bans uninvited motion and hero reflow (1.2, 6.1) but says nothing about reflow of the regions BELOW the hero on a user-initiated expand. A user-initiated expand is not "uninvited," so some reflow is acceptable, but the plan should say the hero NEVER moves on expand (the `needs-you` and `groups` grid areas absorb the expansion via internal scroll, per 6.1), so the one dominant pixel stays put. Add one sentence to 6.3/4.6: expanding "+N more" or "N paused" grows the internally-scrolling `needs-you`/`groups` area and never shifts the `hero` grid area.
- The expanded state needs a stated collapse affordance and a focus-management note (the keyboard floor, 1.1, now applies): when "+N more" is Enter-expanded, focus should land on the first revealed row or stay on the now-"show less" toggle, not get lost. One sentence; M8a's focus-order assertion already exists, extend it to "+N more expands and focus is not lost."
- "N paused" and "+N more" are two disclosures in the same region. State their order and that they do not nest (paused is its own fold BELOW the needs-you overflow, not inside "+N more"). 6.5 implies this but does not pin it; a builder could nest them, producing a two-click-deep paused list (the "trains do-not-click" paralysis the plan calls out for the overflow itself).

These are small, but disclosure behavior is where calm boards quietly become janky, and the plan has been rigorous about every other motion/reflow surface.

---

## Must-fix 4: the 1.5b success-pending affordance has no specified VISUAL FORM or PLACEMENT, only a string and a lifecycle

1.5b is one of round 5's best adds: the multi-second window between hero-click and the injected query landing gets a calm pending state ("Starting your session, the first step will be typed in for you"), armed synchronously, cleared on first idle, motion-safe, with M10 asserting it shows-while-armed and clears-on-idle plus a reduced-motion assertion. The lifecycle and the test are solid. What is missing is the UX of the thing:

- **WHERE does it render?** The click navigates to the new tab (`setActiveTabId(tab.id)`, synchronous, 3.1 step 3), so the user is now looking at a blank xterm for the spawning tab, NOT at Home. The pending affordance therefore has to render OVER or NEAR the spawning terminal, not on the Home hero (which is no longer visible). The plan says "the injected tab/hero shows" the pending affordance, eliding exactly this: it is the TAB surface, and the tab surface is `Terminal`, which the plan otherwise treats as off-limits to dashboard code. State whether the pending affordance is an overlay on the `data-terminal-area` for that tab, a transient state in TabBar (a "starting..." glyph on the new tab), or a small banner. This is a real new render surface and it touches the one component (`Terminal`) the architecture keeps the dashboard out of. Decide it.
- **What does it look like under the dominance ladder?** It is the most important transient state in the app (the headline activation moment). It should not be a spinner that reads as "working" (which collides with the `working` glyph vocabulary). State it as a calm sub-dominant line, not a loud loader, consistent with "calm by default" and the no-strobe states.
- **The reduced-motion form is asserted but not specified.** M10 asserts NO transition class under reduced motion, but the plan never says what the pending state IS under reduced motion (a static line? the same text without a fade-in?). Say "a static muted line, no pulse," so the assertion has a target.

This is the difference between a tested lifecycle and a designed moment. The lifecycle is done; the surface is undrawn.

---

## Buildability and consistency cluster (small, will bite M8a/M9/M10)

1. **Kind icons for the hero and rows are referenced but never enumerated.** 6.3 says `CardHeader` carries a "kind icon + program/item name," and 1.7's `pickPrimaryAction` routes by item kind (decision / draft / needs-CADDC02 / info-review). But the plan never lists which icon maps to which kind, and unlike the strip (which reuses `TabIndicator`'s five real glyphs, verified), there is no existing icon vocabulary for program-card KINDS. M8a will invent one ad hoc. Add a small table (kind -> lucide icon) in 6.3 the same way 6.4 tables the strip glyphs, or explicitly say "no kind icon in Phase 1, name only" (cheapest, and avoids a new visual vocabulary on the calmest screen). Either is fine; leaving it implicit means two builders ship two icon sets on the hero.

2. **The "N closed today" line and the degraded line both want the needs-you header.** 6.2/6.3 put "N need you / N working" + "N closed today" in the sub-dominant header, and 4.3/6.5 put the degraded "last updated Nm ago" line "next to the needs-you count" in that same header. On a stale-poll day with closes, that header carries three things at once (need-you count, closed count, staleness). State the order/priority within the header so it does not become a cramped status strip of its own (e.g., counts left, staleness right in `text-muted-foreground`, closed count only when nonzero). One sentence; the header is the second-most-glanced region after the hero.

3. **The empty-state copy "Clear. Keep working." plus "Pull one forward?" plus "N closed today" is three stacked lines at the dopamine peak.** 4.3/4.6/1.5 each add a line to the caught-up state independently, and read together that is a small paragraph where the plan otherwise prizes one-thing calm. Confirm the stacking order and that it reads as one calm acknowledgment, not three competing messages (suggested: headline "Clear. Keep working.", then the quiet "N closed today" beneath, then the single optional "Pull one forward?" as the only action). The voice test (6.6) covers slop/streaks but not visual stacking; add a one-line layout note to 6.5.

4. **`--age-orange` text legibility is asserted distinct-from-attention but still not asserted legible on the field.** M7b asserts `bg-age-orange` is distinct from `bg-attention` and that `--attention-foreground` passes AA, but I do not see a `text-age-orange` on `--background` contrast assertion (the round-4 nit 2 ask). The desaturated `#b5835a`-class tone is used as a ROW's age color via `text-age-orange` on the dark field; if it is picked too muted to clear AA, the 7-13 day band (the common one) becomes invisible as a signal. Add one M7b assertion: `text-age-orange` clears AA on `--background`, same bar as `--warning`/`--success`. The plan states the intent in prose (4.3) but the round-4 ask was for the assertion, and it is the only one of the round-4 contrast items not converted to a test.

---

## Cross-cutting (carried, worth one line each)

1. **The Home entry affordance is specced as "a Home item in the tab strip/sidebar or a keybinding (challenged)" (M8a) but its VISUAL placement is left open.** This is the user's only mouse path to the dogfoodable MVP, so its placement matters for reachability. A "Home" pill at the left of TabBar (before the project tabs) is the natural spot and matches the app-shell. Pin it in M8a rather than leaving "tab strip/sidebar" as an either/or, so the MVP's reachability is not itself ambiguous. Per AGENTS.md, if a keybinding is added it must be challenged; a visible affordance avoids that entirely and is the safer Phase-0 choice.

2. **The strip's "No active sessions" empty state (6.4) and the program-region empties (4.3) are two empties on one screen.** When there are zero real tabs AND the board is caught-up, the user sees "No active sessions" (strip) + "Clear. Keep working." (program region) stacked. That is fine and arguably correct (two independent regions, 4.5), but state that this is the intended double-empty and not a bug, so a builder does not try to merge them into one message and lose the per-region independence the plan deliberately built.

3. **The hero honesty (1.11 / R-8 / open question 12) remains exactly right.** On current data the Phase-1 hero is a time-sensitive or almost-done dev/admin task, not an avoidance area, and the plan says so plainly. Do not soften it. Carried from round 4; still correct.

---

## Concrete additions to specific sections / milestones

- **6.4 + M9 (must-fix 1, highest value):** reconcile SessionStrip against the existing StatusBar (`App.tsx:585`) and TabBar. Decide StatusBar's behavior on the Home view (suppress, or keep project-scoped with a stated scope difference), ensure exactly one working-count source is visible on Home, and state the strip is read-and-jump only (no close/rename/drag), distinct from TabBar. Add an assertion: on the Home view there is one working-count source.
- **6.1 + 2.2 + M8a (must-fix 2):** state HomeView's root fills the `data-terminal-area` box (`h-full`/`absolute inset-0`) and owns internal scroll so the parent's `overflow-hidden` never clips the hero; make the strip rail-vs-bottom breakpoint a CONTAINER-width breakpoint (Tailwind v4 `@container`), not viewport, so the expanded sidebar does not mis-flip it; cross-reference the 6.1 `strip` grid area to the M9 `SessionStrip` component.
- **6.3 + 4.6 + M8a (must-fix 3):** expanding "+N more"/"N paused" grows the internally-scrolling region and never shifts the hero; "N paused" is its own fold below the overflow, not nested inside "+N more"; on expand, focus is not lost. Extend M8a's focus assertion to the expand path.
- **1.5b + M10 (must-fix 4):** specify the pending affordance's render surface (overlay on the spawning tab's `data-terminal-area`, or a TabBar "starting" state), its calm sub-dominant form (not a `working`-vocabulary spinner), and its reduced-motion static form.
- **6.3 (cluster 1):** enumerate kind -> icon, or state name-only with no kind icon in Phase 1.
- **6.2/6.3 + 4.3 (cluster 2):** state the order/priority of need-you count, closed count, and staleness within the one needs-you header.
- **6.5 (cluster 3):** state the caught-up stacking order (headline, then closed count, then the single optional pull-forward) so the dopamine-peak state reads as one calm acknowledgment.
- **M7b (cluster 4):** add the `text-age-orange` clears-AA-on-`--background` assertion (the only round-4 contrast ask not yet converted to a test).
- **M8a (cross-cutting 1):** pin the Home entry affordance placement (a "Home" pill at the left of TabBar) rather than leaving tab-strip-or-sidebar open.

---

## What is already at 9 and should not be touched

- The three-dominance ladder bound to exact classes with the M8a hierarchy test and the fourth-level ban (6.2), now with the keyboard floor and focus-order assertion (1.1 / 6.3 / M8a).
- The hero anatomy bound to Card subcomponents, the `CardFooter` three-affordance budget, the one-button guard, the Copy-only no-action fallback, and the heat-signal-once rule (6.3).
- The first-open state TIMELINE with the fake-timer assertion, per-region states, last-good preference, the error-vs-degraded split, and now the degraded-as-muted-line (not banner) decision with the no-reflow assertion (4.3 / 4.5 / 6.5).
- The skeleton-mirrors-dominance decision with the hero-min-height assertion (4.5 / M8a).
- The strip reduced to the five real `TabStatus` values reusing `TabIndicator`, the idle-age floor against `waitingSince`, the two distinct time computations, group mini-headers, the low-S hue-precedence rule, and the motion-safe `justResolved` fade with the reduced-motion M9 assertion (6.4). (The vocabulary is right; the collision with StatusBar, must-fix 1, is the only strip gap.)
- The progressive-disclosure cap with age-band mini-headers on the expanded overflow, and the paused "N paused" disclosure (4.4 / 4.6). (Behavior of the expand, must-fix 3, is the only gap.)
- `--attention-foreground` registered dark and AA-asserted, `--age-orange` distinct from the hero accent (M7b).
- The nav-badge off-Home non-duplication rule (6.4). (Apply the same discipline to StatusBar, must-fix 1.)
- The copy-voice test covering the whole module: no streaks, no "0 of N", no near-finish-at-zero, present-partner waiting register (6.6).

The remaining work is the seam between Home and the app shell it is injected into: reconcile the strip against the StatusBar/TabBar that already exist, give the Home grid a contract inside `data-terminal-area`, spec disclosure-expand and the pending-state surface, and convert the last contrast nit to a test. None of it is a rethink of the design, which is strong. It is the integration UX the line-number citations point at but the section-by-section polish has not yet touched.
