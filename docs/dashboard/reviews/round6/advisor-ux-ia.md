# Advisor review (round 6): UX / information architecture

Reviewer lens: UX/IA. Target: `PLAN.md` round-6 revision for the ClaudeTerminal in-app dashboard, `dashboard` worktree (HEAD `ce2e9e0`), Phase 2/3 extracted to `PLAN-PHASE-2-3.md`. Scored against the four focus areas: hero-wins-by-muting hierarchy, the secondary session strip, shadcn/Tailwind fit, and the mandatory empty/loading/error states.

Current grade on the UX/IA lens: about 9.4/10. Round 6 absorbed all four round-5 must-fixes and the whole buildability cluster, and it did so by grounding each against source rather than restating prose. The SessionStrip-vs-StatusBar collision is named and given a one-working-count rule with an M9 assertion (6.4, M9); the Home grid gets a real `data-terminal-area` root contract (6.1 ROOT SIZING); the disclosure-expand behavior is pinned with a no-hero-shift rule and a focus assertion (6.3); the 1.5b pending affordance gets a drawn surface, a placement, and a reduced-motion form (1.5b, M10); the `text-age-orange` AA-on-background assertion is added to M7b. That is a clean sweep of round 5.

I reviewed round 6 by diffing it against my round-5 review and by re-grounding the new claims against source. I read `App.tsx` (the render seam at `:576`, StatusBar mount at `:585`, TabBar at `:555`), `StatusBar.tsx` (full), `TabBar.tsx` (props), and `TabIndicator.tsx` (full). The design is strong and the absorption is honest. What remains between 9.4 and a clean 9.5+ is a narrow band: a few places where the plan states the IA decision correctly but stops one level short of the build mechanism, which is the exact failure class the plan has been catching everywhere else. None is a rethink. Two are buildability-of-the-decision gaps that will bite the implementing session; the rest are consistency and one-line pins.

---

## What landed from round 5 (confirmed against the plan and source)

- **SessionStrip collision reconciled.** 6.4 now opens by reconciling the strip against StatusBar + TabBar, states the strip is read-and-jump only (no close/rename/drag, distinct from TabBar), commits to one working-count source on Home, and M9 asserts it. The single highest-value round-5 gap is closed in concept.
- **Home grid has a shell contract.** 6.1 ROOT SIZING pins HomeView's root to fill the `data-terminal-area` box (`h-full`/`absolute inset-0`) and own its internal scroll so the parent `overflow-hidden` never clips the hero, and the strip flip is a container-width breakpoint (`@container`), not viewport. Verified against `App.tsx:576` (`flex-1 relative overflow-hidden`).
- **Disclosure-expand pinned.** 6.3 states expanding "+N more"/"N paused" grows the internally-scrolling region and never shifts the hero, "N paused" is its own fold below the overflow (not nested), and M8a extends the focus assertion to the expand path.
- **1.5b pending affordance is drawn.** 1.5b now specifies WHERE (overlay on the spawning tab's `data-terminal-area`), the calm sub-dominant form (no `working`-vocabulary spinner, not `Loader2`), and the reduced-motion static line, with M10 assertions. The "deliberate seam onto the Terminal surface" framing is exactly right.
- **Contrast nits converted to tests.** M7b adds the `text-age-orange` clears-AA-on-`--background` assertion alongside the `--attention-foreground` AA assertion.
- **Caught-up stacking and header priority pinned.** 6.3 fixes the caught-up stack order (headline, then closed count, then the single pull-forward) and the needs-you header priority (need-you count left, closed count, degraded marker right, first to truncate).

That is the clean sweep, three rounds running. The hierarchy, state taxonomy, strip vocabulary, cold-open choreography, and now the Home-to-shell seam are all at or near 9.

---

## Must-fix 1: the StatusBar one-working-count decision is stated but has no build mechanism, and StatusBar cannot currently know Home is active

This is the highest-value remaining finding, and it is the same class the plan keeps catching elsewhere: the IA decision is correct, but the plan stops at the decision and never names the prop/wiring that makes it buildable, so the implementing session will improvise it.

6.4 says: "On the Home view, the StatusBar's status COUNTS are hidden (or StatusBar renders only its keybinding-hint footer)... off Home, StatusBar is unchanged." M9 asserts "on Home there is exactly one working-count source (the StatusBar status counts are not rendered while Home is active)." Verified against source, the mechanism does not exist:

- `StatusBar` is mounted at `App.tsx:585` as `<StatusBar tabs={activeProjectTabs} hookStatus={hookStatus} />`. It receives NO `activeTabId` and NO Home awareness (verified `StatusBar.tsx:25-29`, props are `tabs` + `hookStatus` only). It has no way to know Home is active.
- StatusBar renders BOTH the status counts (`StatusBar.tsx:38-48`) AND the keybinding-hint footer (`:56-58`) in one component. "Hide the counts but keep the footer" requires a conditional inside StatusBar, which requires a new input.

So the round-6 decision needs one of two concrete mechanisms, named in 6.4 and reflected in the milestone that owns it, before M9 builds against it:

- **Option A (prop):** add a `hideStatusCounts?: boolean` (or `isHomeActive`) prop to StatusBar, set from `App.tsx` via `activeTabId === HOME_TAB_ID`. StatusBar early-returns the counts block but keeps the footer. This is the minimal change and matches the codebase's prop-driven pattern. It modifies already-tested code (StatusBar has the existing render), so it carries the regression clause.
- **Option B (conditional mount in App):** App renders StatusBar's counts vs a counts-suppressed variant based on `activeTabId === HOME_TAB_ID`. Heavier; touches the App render tree.

Either is fine, but the plan must pick ONE and name it, because right now M9's assertion ("StatusBar status counts are not rendered while Home is active") cannot pass against the current StatusBar without a wiring change the plan never specifies. There is a second-order point: this change touches `StatusBar.tsx` / `App.tsx:585`, which means it is NOT purely an M9 (SessionStrip) change. The StatusBar suppression is the App-shell side of the strip decision and is arguably an M8a concern (StatusBar is already mounted and visible the instant Home paints in Phase 0, before M9's strip exists). State which milestone owns the StatusBar prop edit: if M8a paints Home with no strip yet, StatusBar's counts are ALREADY a competing surface on the Phase-0 board (StatusBar shows active-project counts under a hero that draws from a cross-project set), so the suppression likely belongs in M8a, not M9. Decide and assign it, or Phase 0 ships the exact double-count the plan forbids, for a whole phase, until M9 lands.

One sentence in 6.4 (the prop + its owning milestone) plus moving the StatusBar edit into M8a's change-list closes this. It is the difference between a tested intent and a buildable one.

---

## Must-fix 2: the Home entry affordance placement is still an either/or, and it is the MVP's only mouse path

M8a ships "a VISIBLE 'Home' item in the tab strip/sidebar that calls `handleSelectTab(HOME_TAB_ID)`." This is the user's only mouse route to the dogfoodable Phase-0 MVP (every other Home-activation path is last-tab-close or `startupView:'home'`), so its placement is load-bearing for reachability, and "tab strip/sidebar" leaves the single most important reachability decision in the plan ambiguous. The round-5 review asked to pin this; round 6 still says "tab strip/sidebar."

The two candidate locations have materially different IA consequences and a builder picking the wrong one ships a worse MVP:

- **A "Home" pill at the LEFT of TabBar** (before the project tabs) is the natural app-shell spot. It is always visible regardless of active project, it reads as "the home of all projects," and it sits where a browser's home button sits. But TabBar is scoped to `activeProjectTabs` (verified `App.tsx:556`), and the pill must NOT be a tab (it carries no close/rename/drag, no `TabIndicator` status), so it is a distinct affordance rendered ahead of the `tabs.map` inside TabBar, not a synthetic entry in the tabs array. State that explicitly so a builder does not push a fake Home tab into `activeProjectTabs` and reintroduce the exact "Home in the tabs array" hazard 2.1/2.3 spent paragraphs removing.
- **A "Home" item in the ProjectSidebar** only renders when `projects.length > 0` (verified `App.tsx:573`, the sidebar is conditional), so on a fresh single-project launch the sidebar may be collapsed or the entry buried, and the MVP becomes hard to reach on exactly the cold-start the plan optimizes.

Recommendation: pin it as a Home pill at the left of TabBar, rendered as a non-tab affordance (no status glyph, no close), and state it is NOT a member of `activeProjectTabs`. This also keeps it visible cross-project, matching the strip's cross-project scope. One or two sentences in M8a. The keybinding stays an open question per AGENTS.md (proposed `Ctrl+Shift+H`); the visible affordance is the safe Phase-0 path and the plan already says so, it just needs to commit to where.

---

## Must-fix 3: the hero's "single highest needs-you dot" accent is introduced once (1.2) and then never specified or budgeted

1.2 says the one saturated `--attention` accent "is reserved for the hero primary button AND the single highest needs-you dot." That second use is a real accent surface and it appears exactly once in the whole plan. It is never defined (what is a "dot"? a leading status dot on the top needs-you row?), never placed in the dominance ladder (6.2), never bound to a class, and never tested. Three problems:

- It silently widens the "one accent" budget to TWO `--attention` surfaces on Home (the hero button AND a list-row dot). The plan's calm thesis is one saturated accent; 1.2 itself says "the one saturated accent." A second `--attention` element on the sub-dominant list competes with the hero button for the eye, which is the exact over-saturation the capped-hero rule (1.4) and the heat-signal-once rule (6.3) remove elsewhere. Either the dot is NOT `--attention` (use the row's verbatim `ageColorClass` instead, consistent with 4.3), or the plan must justify why two `--attention` surfaces is calm.
- If kept, it has no class binding in 6.2's dominance table and no test, so two builders ship two treatments (or skip it), exactly the failure 6.2 exists to prevent.
- It interacts with the sub-dominant list spec in 6.2 (compact rows, `text-sm text-foreground`), which mentions no per-row accent dot at all. The two sub-sections disagree about whether the needs-you list carries an accent.

Cheapest fix and the one I recommend: DROP the "single highest needs-you dot" from 1.2. The hero already carries the one accent (the button) plus the capped age band; the needs-you list rows carry their verbatim `ageColorClass` (4.3), which is already the per-item heat signal. A second `--attention` dot adds a competing accent for no IA gain. If Mark wants a "this is the top one" marker on the list, make it the row's existing age color or a weight bump (`font-medium`), not the hero's reserved accent. One deletion in 1.2 (or one binding-plus-test if kept) removes a latent budget creep on the calmest screen.

---

## Buildability and consistency cluster (small, will bite M8a/M9)

1. **The strip empty state and the program-region empty are two empties on one screen, acknowledged in prose but with no layout note for the double-empty.** Round 5 raised this as cross-cutting; round 6 does not address it. When there are zero real tabs AND the board is caught-up, the user sees "No active sessions" (strip, 6.4) stacked with "Clear. Keep working." + pull-forward (program region, 4.3/4.6). That is correct per-region independence (4.5), but on the calmest possible screen (nothing running, nothing needed) it reads as two separate "empty" messages, and a builder may try to merge them. Add one sentence to 6.5: the zero-tabs + caught-up screen intentionally shows both region empties, the strip's "No active sessions" stays subordinate (`text-xs text-muted-foreground`) below the caught-up acknowledgment, and they are NOT merged (preserving per-region independence). This is the genuine all-clear state and it deserves one line so it is not janky.

2. **The "N working" in the unified header (4.6) and the strip's working group mini-header (6.4) are both working counts on Home, and the plan made StatusBar defer but not these two.** 6.4 says "the strip's group mini-headers are that [working-count] source on Home" while 4.6 / 6.2 put "N need you / N working" in the needs-you header. So on Home, "N working" still appears in TWO places: the needs-you header AND the strip's "working" group mini-header. These are the same scope (both unified/cross-project) so they will not DISAGREE the way StatusBar did, but they are still two renderings of the same number on the calmest screen, which is the redundant-counter pattern the plan polices. State the relationship: the needs-you header's "N working" is the glance metric; the strip's "working" mini-header is a GROUP LABEL (e.g. "Working") not a count, OR the header carries "N need you" only and the strip owns the working count. Pick one so "N working" is not rendered twice. One sentence; this is the same discipline as the StatusBar reconciliation applied one layer in.

3. **The pull-forward "Pull one forward?" surface has no specified affordance type.** 4.6 / 6.3 call it "one quiet, dismissible line" that surfaces the calmest active card. Is it a text link, a quiet button, a row with the hero's primary-action treatment scaled down? It is the ONLY action on the caught-up screen, so its form sets the tone of the dopamine-peak state. State it as a single quiet `text-muted-foreground` button or link (not a full-weight `bg-attention` button, which would reintroduce a loud accent on the all-clear screen) and that activating it promotes that card to the hero. One sentence in 6.3; the caught-up stack order is pinned but the affordance form is not.

4. **`prefers-reduced-motion` for the `data-terminal-area` pending overlay (1.5b) and the hero settle (1.5) are specified, but the strip's coarsened-time recompute is not motion, yet the FIRST-PAINT of the strip on Home has no reduced-motion note.** Minor: the `justResolved` strip fade is reduced-motion-gated (M9, verified), and the pending overlay is (M10). The plan is consistent. No action needed; noting it so the reviewer set knows the reduced-motion surface is fully covered, not skipped.

5. **`animate-spin`/`animate-pulse` live on the wrapper `span`, not the SVG (verified `TabIndicator.tsx:14,28`).** M2 says add `motion-safe:` to `:15` and `:27`. The current source has `animate-spin` inside the `cn()` on the outer span at the working case and `animate-pulse` on the requires_response span. M2's edit (prepend `motion-safe:`) is correct against the real lines; just confirm the M2 verification-log line numbers (`:15`/`:27`) match the shipped file (the working `animate-spin` is on the span opened at `:14` in my read, the class string itself is `:15`). This is a one-token line-number confirm, not a defect; flagging only so M2's "one change, one test" stays exact.

---

## Cross-cutting (carried, worth one line each)

1. **The hero honesty (1.11 / R-8 / open question 12) remains exactly right and should not be softened.** On current data the Phase-1 hero is a time-sensitive or almost-done dev/admin task, not an avoidance area, and the plan says so plainly with the live `practice-reports` / `incomplete-notes` grounding. The read-only avoidance slug/name tie-break pulled into Phase 1 (1.4 / 5.4) is the right partial step. Carried from rounds 4-5; still correct.

2. **The kind-icon decision (name-only, no hero kind icon in Phase 1) is the right call and is now explicit (6.3).** Round 5 flagged the ad-hoc icon vocabulary risk; round 6 resolved it by shipping no hero kind icon so the strip's `TabIndicator` is the one icon vocabulary on Home. Good. Do not add a hero kind icon in Phase 1.

3. **The degraded-as-muted-line (not banner) decision with the no-reflow assertion is at 9 (4.3 / 6.5 / M8a).** Untouched, correct.

4. **The first-open state TIMELINE with fake-timer assertions is at 9 (4.3 / M8a).** The four-states-never-strobe framing is the right bar and it is tested. Untouched.

---

## Concrete additions to specific sections / milestones

- **6.4 + M8a (must-fix 1, highest value):** name the StatusBar suppression MECHANISM (add a `hideStatusCounts`/`isHomeActive` prop set from `activeTabId === HOME_TAB_ID`, counts early-return, footer kept), and ASSIGN the StatusBar prop edit to M8a (not M9), because StatusBar's active-project counts compete with the cross-project hero the instant Phase 0 paints, before the strip exists. The M9 assertion stays; M8a gains the StatusBar edit + its own one-working-count assertion for the strip-less Phase-0 board.
- **M8a (must-fix 2):** pin the Home entry affordance as a "Home" pill at the LEFT of TabBar, rendered as a non-tab affordance (no status glyph, no close/rename/drag) that is NOT a member of `activeProjectTabs`, so it cannot reintroduce the Home-in-tabs hazard (2.1/2.3). Keep the keybinding an open question.
- **1.2 (must-fix 3):** drop the "single highest needs-you dot" from the one-accent reservation (the needs-you rows already carry their verbatim `ageColorClass`), OR bind it to a class in 6.2 and add an M8a test; do not leave a second `--attention` surface unspecified and unbudgeted on the calm list.
- **6.5 (cluster 1):** state the zero-tabs + caught-up double-empty is intentional, the strip's "No active sessions" stays subordinate below the caught-up acknowledgment, and the two region empties are NOT merged.
- **4.6 / 6.4 (cluster 2):** resolve "N working" appearing in both the needs-you header and the strip's working mini-header; make the strip mini-header a group LABEL not a count, or give the header "N need you" only. One working-count rendering on Home.
- **6.3 (cluster 3):** specify the "Pull one forward?" affordance as a single quiet link/button (not a `bg-attention` button), and that activating it promotes that card to the hero.
- **M2 (cluster 5):** confirm the `:15`/`:27` line numbers in the verification log match the shipped `TabIndicator.tsx` (the `animate-*` is on the wrapper span); one-token confirm, keeps M2's one-change scope exact.

---

## What is already at 9 and should not be touched

- The three-dominance ladder bound to exact classes with the M8a hierarchy test, the fourth-level ban, the keyboard floor, and the focus-order assertion (6.2 / 1.1 / 6.3 / M8a).
- The hero anatomy bound to Card subcomponents, the `CardFooter` three-affordance budget, the one-button guard, the Copy-only no-action fallback, the heat-signal-once rule, and the name-only (no kind icon) header (6.3).
- The SessionStrip reconciled against StatusBar + TabBar at the IA level, read-and-jump only, the five real `TabStatus` values reusing `TabIndicator`, the idle-age floor against `waitingSince`, the two distinct time computations, the sparse per-row time recompute, group mini-headers, the low-S hue-precedence rule, and the motion-safe `justResolved` fade with the reduced-motion M9 assertion (6.4). (The vocabulary and IA are right; must-fix 1 is the build mechanism for the StatusBar half, not a design change.)
- The Home grid's `data-terminal-area` root contract (`h-full`/`absolute inset-0`, internal scroll, container-width breakpoint) (6.1 ROOT SIZING).
- The disclosure-expand-without-hero-shift rule, "N paused" as its own non-nested fold, and the focus-not-lost assertion (6.3 / 4.6 / M8a).
- The 1.5b pending affordance with its drawn surface, placement on the spawning tab's `data-terminal-area`, calm sub-dominant non-spinner form, and reduced-motion static line (1.5b / M10).
- The first-open state TIMELINE with fake-timer assertions, per-region states, last-good preference, error-vs-degraded split, degraded-as-muted-line, and skeleton-mirrors-dominance (4.3 / 4.5 / 6.5 / M8a).
- The progressive-disclosure cap committed to N=4 with age-band mini-headers freshest-first on the expanded overflow (4.4 / 4.6).
- `--attention-foreground` registered dark and AA-asserted, `--age-orange` distinct from the hero accent AND AA-asserted on `--background` (M7b).
- The nav-badge off-Home non-duplication rule (6.4).
- The copy-voice test covering the whole module: no streaks, no "0 of N", no near-finish-at-zero, the present-partner waiting register, no "closed today" (6.6).

The remaining work is narrow: name the StatusBar suppression mechanism and assign it to the phase where the competing count first appears (must-fix 1), pin the MVP's one mouse path (must-fix 2), and remove or bind the stray second accent (must-fix 3), plus a handful of one-line consistency pins. None is a design rethink. The design is strong and the round-5 absorption was complete; what is left is the last layer of build-mechanism specificity on decisions the plan has already made correctly, which is the same rigor the plan applies everywhere else, carried one step further into the seams.
