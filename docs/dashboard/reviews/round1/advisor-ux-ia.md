# Advisor review: UX / information architecture

Reviewer lens: UX/IA. Target: `PLAN.md` for the ClaudeTerminal in-app dashboard, `dashboard` worktree (HEAD `ce2e9e0`). Scored against the four focus areas in the brief: hero-wins-by-muting hierarchy, the secondary session strip, shadcn/Tailwind fit, and the mandatory empty/loading/error states.

Current grade on the UX/IA lens: about 7/10. The hierarchy theory is sound and well-cited, the three-action plumbing is precise, and the empty-state taxonomy is genuinely good. What keeps it off 9 is that the plan describes the hierarchy in prose and ratios but never pins the layout to a buildable, responsive structure; it leans on three shadcn primitives that do not exist in the repo; and several of the "mandatory states" are named but not specified tightly enough to build or test without re-deciding at code time.

---

## Verified facts the review rests on

- `globals.css` tokens are real and as cited: `--attention:#ce9178` at `:62`, plus `--success`, `--warning`, `--destructive`, `--muted-foreground:#808080`, `--project-hue:0`. The plan's color budget maps cleanly onto these. Good.
- The shadcn set actually present in `src/renderer/components/ui/`: `badge, button, dialog, dropdown-menu, input, label, popover, radio-group, select, switch, table`. There is **no `card.tsx`, no `skeleton.tsx`, no `tooltip.tsx`.** The plan names "a shadcn `Card`" for the hero (Section 6.1, 6.2, the dominance table) and a "skeleton on open" (Section 6.5, M8 DoD), and relies on a hover/disabled reason string ("Available on the desktop app only", Section 3.2) that wants a tooltip. None of the three exist, and no milestone adds them. This is the single biggest buildability hole in the UX spec.
- `components.json`: style `new-york`, `iconLibrary: lucide`. So lucide glyphs ARE available for the two-axis status icon (Section 6.4) and the kind icons (Section 6.2). Good, but the plan never names the actual glyphs.
- `StatusBar.tsx` and `TabIndicator.tsx` exist (the `text-attention` and `animate-pulse` precedents the plan cites are real anchors).

---

## Area 1: Hero-wins-by-muting hierarchy

This is the strongest part of the plan and it is faithful to F2: three dominance levels, the explicit ban on a fourth (Section 1.1, 6.1), "turn the volume down on everything else" rather than inflate the hero, color reserved for one accent. The 90%-killer getting its own ranking tier (Tier 3) is a sharp, opinionated call that earns the grade. Keep all of that.

What blocks 9 here:

1. **The 40/30/20/10 ratio is stated but never bound to a layout primitive.** Section 1.2 and 6.1 both quote "roughly 40/30/20/10 vertical space" and "rail 240-280px," but there is no CSS-grid or flex skeleton anywhere in the plan that a builder can implement against. F2's own recommendation (Section 6 of F2) gives a concrete two-column ASCII layout with the rail on the cold right edge; the plan should lift that into an explicit container spec: a top-level `grid` with named areas (`hero`, `needs-you`, `groups`, `strip`) and the responsive breakpoint that flips the rail from right-column to bottom-strip. Right now "40/30/20/10 vertical" and "240-280px rail" are in tension (one is a vertical budget, one is a horizontal rail width) and a builder cannot tell whether the strip is a right rail or a bottom band at a given width. Pin it: rail-right above some px width, bottom-strip below it, and state the width.

2. **"Above the fold" and "top-left golden triangle" are asserted but the app window has no fixed height.** ClaudeTerminal is a resizable Electron window that can be short. The plan should say what happens to the 40/30/20/10 budget when the window is short: does the hero hold a min-height and the lower regions scroll, or does the whole thing compress? An ADHD-calm surface that reflows its hero on every window resize is its own uninvited-motion problem. Recommend: hero gets a `min-height`, the needs-you list and groups share the remaining space and scroll internally, the strip stays pinned. State it.

3. **The contrast mechanism is named but not tokenized.** "One step down in scale and contrast" (Section 6.1) needs concrete token assignments or it gets re-litigated per component. Bind it now: hero title at the largest type step on `--foreground`; sub-dominant rows on `--foreground` at a smaller step; the strip on `--muted-foreground` (`#808080`) which IS the one-step-down-contrast lever already in the palette. Saying "the strip renders its text in `--muted-foreground`" is buildable; "one step down in contrast" is not.

4. **Whitespace-as-hierarchy needs a spacing scale, not adjectives.** "Airy hero, tight strip" should land as concrete Tailwind spacing (e.g. hero `p-6`/`gap-4`, strip rows `px-2 py-1`). Otherwise two builders produce two different densities and the density-contrast signal (the cheapest hero-maker per F2 Lever 4) is left to chance.

---

## Area 2: Secondary session strip

The plan correctly adopts the F3 Agent-View model: one compact row, group-by-attention not recency, two-axis glyph (color = state, shape/animation = liveness), fold the tail, one aggregate badge, click-to-jump. Section 6.4 is close. Gaps:

1. **The two-axis glyph is described but the glyphs are not chosen.** F3 leans on Agent View's `✻ / ✽ / ∙ / ✢`. The repo uses lucide. The plan must name the lucide icons per state (e.g. working = a spinning `Loader2`, needs-you = `CircleAlert` in `--attention`, idle = `Circle` dimmed, done = `CircleCheck` in `--success`, failed = `CircleX` in `--destructive`) and the liveness treatment. "Color + icon, never color alone" is the accessibility rule the plan states; it cannot be satisfied without naming the icon. This is also a test surface: M9 already asserts "color is always paired with an icon," which is untestable until the icon set is fixed.

2. **The "one-line activity" source is hand-waved.** Section 6.4 says "last tool call / last non-empty line." Where does that come from? The app's tabs carry `status`, `name`, `statusSince`, `lastActivityAt` (the M1 fields), but not a last-output-line. F3 flags this exact gap (F3 open question 1: a PowerShell tab has no Agent-View state file). Either: (a) the strip shows status + relative-time only in Phase 1 and the activity line is explicitly deferred, or (b) a new field/derivation is specified. Pick one. Today the plan implies an activity line the data model does not provide, so M9 cannot build it as written.

3. **The strip's empty and overflow states are unspecified.** What does the strip show with zero live tabs (the common case when the user just landed on Home from a clean close)? What is the fold threshold for "... N more" (F2 cites 5-7; the plan never picks a number)? And when grouped by project with collapsible headers (Section 6.4), what is the default collapsed/expanded state? These are small but they are exactly the decisions that get skipped and then look unfinished.

4. **The aggregate needs-you badge has no home in the current chrome.** Section 6.4 says "one aggregate needs-you badge on the Home nav item." Home is a renderer-only synthetic tab (Section 2.1) that lives in the tab bar. The plan should say where on the tab/Home affordance the badge sits and that it consolidates to the highest-attention color (F2 Section 5, F3 item 6: green+yellow+red consolidates to red). That consolidation rule is a one-line testable function worth adding to M7 alongside `ageColorClass`.

5. **Click-to-jump for a non-tab item is undefined.** The strip rows are live tabs, so `handleSelectTab` works. But the needs-you LIST (Section 6.3) mixes program-board cards (no tab) with idle-tab items (a tab). A program-board row's "click" has no `switchTab` target. The plan's `DashboardItem.actions` model (Section 4.1) handles this via `focusTab?` being optional, which is right, but Section 6.3 should state explicitly that a card row's row-click is a no-op or expands detail, and only the action buttons act. Otherwise a builder wires a dead click.

---

## Area 3: shadcn / Tailwind fit

The intent is correct (AGENTS.md: no hand-rolled CSS, compose with `cn()`, tokens from `globals.css`). The execution gap is concrete:

1. **Three required primitives are missing and unscheduled (the headline issue).** `card`, `skeleton`, `tooltip` are not in `components/ui/`. Add a milestone BEFORE M8 (call it M7.5 or fold into M8's first step) that vendors them via the shadcn CLI (`pnpm dlx shadcn@latest add card skeleton tooltip`) and commits them as one rollback point. Without this, M8 ("hero card ... skeleton on open") cannot be built test-first; the test would import a component that does not exist. This is the cleanest single fix that moves the plan toward buildable.

2. **The disabled-PowerShell reason needs a real surface.** Section 3.2 renders the control "VISIBLY DISABLED ... with a stated reason: 'Available on the desktop app only.'" A disabled `Button` cannot fire hover events in most browsers, so a tooltip on a disabled button is a known trap. Specify the pattern now: wrap the disabled button in a `span` (the tooltip trigger) or render the reason as always-visible helper text beneath the control. Either is fine; leaving it as "with a stated reason" invites the disabled-tooltip bug.

3. **No `Card` means the hero anatomy (Section 6.2) is unanchored.** Once `card.tsx` is vendored, Section 6.2 should map its anatomy to the actual subcomponents (`CardHeader`/`CardTitle`/`CardContent`/`CardFooter`) so the builder is not inventing structure. The "age color on the left edge" is a left border, which is a Tailwind `border-l-4` plus the `ageColorClass` token from M7, not a Card feature; say so.

4. **`animate-pulse` under reduced-motion.** Section 1.2 says suppress it "via a Tailwind variant." Tailwind v4 has no built-in `motion-reduce:` opt-out that DISABLES an animation by default; the correct move is `motion-safe:animate-pulse` (animate only when motion is safe) rather than `animate-pulse motion-reduce:animate-none`. Name the exact class so the reduced-motion promise is real and testable. The repo imports `tw-animate-css`; confirm the working-state spinner (Loader2) is also gated `motion-safe:`.

5. **Tailwind, not inline color, for the accent.** The plan is disciplined about tokens, but spell out that the one accent is `bg-[--attention]` / `text-attention` (the latter already exists per `StatusBar.tsx:15`) and that per-session tint uses `--project-hue` via an existing class, never an inline `style`. One sentence prevents a builder reaching for inline styles for the hue tint.

---

## Area 4: mandatory empty / loading / error states

The empty-state taxonomy (Section 4.3, three distinct zero-data conditions plus the caught-up "Clear. Keep working.") is the best-specified part of the states story and it is correct to distinguish "never ran" from "ran, nothing matched" from "caught up." Keep it. The gaps are loading, error/degraded, and per-region coverage:

1. **Loading is one word ("skeleton") with no shape.** Section 6.5 and M8 both say "a skeleton on open." Specify what the skeleton mimics: one hero-sized block plus 3-4 row-sized blocks (skeletons should preview the real layout, not a generic spinner, which is the whole point of using a skeleton over a spinner). M8's test ("renders a skeleton before data") needs a `data-testid` or role to assert against; name it. And specify the FIRST-PAINT path: the synthetic Home tab can be selected before the first IPC `getProgramBoardState` resolves, so the skeleton is the guaranteed initial render, not an edge case.

2. **The error/degraded state conflates two different failures.** Section 4.3 freshness bands ("stale >= 150s," "hard-stale >= 10min") are about DATA AGE. A separate failure is "the IPC read threw / JSON failed to parse / HTTP fallback 500'd," which is not staleness, it is an error. The plan should give error its own visible state distinct from degraded-stale: degraded = "showing data from 4 min ago" (data still on screen); error = "could not read the program board" with the resolved path and a retry affordance, shown only when there is NO last-good data to fall back to. Right now M8 tests "the degraded banner for a stale fixture" but there is no test for a hard read error with no prior data. Add that fixture and state.

3. **Last-good-data caching is implied but never stated.** The calm principle says update-in-place and never blank the screen. If a re-read fails, the UI should keep the last good cards and layer the degraded marker on top, NOT drop to an empty/error state. The reader (M4) should retain the last successful parse in memory and the renderer should render last-good + degraded marker. This is the difference between a calm dashboard and one that flickers to "error" every time a poll hiccups. Make it an explicit requirement in M4 (reader holds last-good) and M8 (renderer prefers last-good over empty when a refresh fails).

4. **Per-region states, not just whole-page.** The plan has a remote case where the program region shows "not available remotely" while the strip still works (Section 2.4, 3.5). That is the right instinct, but it means states are PER-REGION: the program/needs-you region can be empty/loading/error/degraded INDEPENDENTLY of the live-session strip (which is fed by `onTabUpdate`, always available). Section 6.5 should state the matrix explicitly: each of the two data regions (program-board-fed, tab-fed) owns its own state set. Otherwise a builder renders one page-level empty state and the strip vanishes when the board is down, which is wrong since the strip has its own live data.

5. **The caught-up state's scope is ambiguous.** "Clear. Keep working." (verbatim, good) applies to the needs-you region. But if there are live working sessions, the page is not idle. Specify that the caught-up copy governs the needs-you/hero region only, and the strip still shows the working sessions beneath it, so "Clear. Keep working." over a strip showing two active sessions reads correctly (you have nothing to action, work is proceeding) rather than contradictorily.

---

## Cross-cutting UX issues

1. **Focus-mode toggle is mentioned twice with no spec.** Section 6.5 ("A Focus-mode toggle collapses to only the hero") and 3.x do not say how it is toggled, whether it persists, or whether it gets a keybinding. Per AGENTS.md every keybinding must be challenged; if Focus mode gets one, it needs the same treatment as `Ctrl+Shift+K`. Either spec it (control + persistence + optional challenged keybinding) or cut it from Phase 1 and list it as a Phase 2 item. Right now it is a floating feature with no milestone.

2. **Keyboard-first traversal is claimed but unbuilt.** Section 6.4 says "keyboard-first traversal" and F3 leans hard on arrow-keys/Enter/number-jump. No milestone implements any keyboard handling for the Home view, and no keybinding is challenged for it. For an ADHD-calm tool the keyboard path matters, but if it is out of Phase 1 scope, say so explicitly rather than implying it in the spec. A half-promised keyboard model reads as unfinished.

3. **Relative-time refresh cadence is a hidden motion source.** `formatRelative()` (M7) produces "idle 4 min." For that to stay accurate it must re-render on a timer, which is recurring motion on a calm surface. Specify the cadence (e.g. recompute on the existing ~20s poll tick, not a per-second ticker) so the relative times do not become a once-a-second flicker that violates the no-uninvited-motion rule. Tie it to the poll, not a `setInterval(1000)`.

4. **Copy voice rule is stated; give it one banned-words line for this repo.** Section 6.6 is correct (verb-first, no em dashes, no AI-slop). Since this prose ships in the UI, add the one concrete guard: the canned `KnownActionId` template strings (Section 3.4) and every empty/error string are user-facing copy and must pass the same no-em-dash / no-slop bar. Worth a single test that asserts the template table contains no `--` / `—`.

---

## Concrete additions to specific milestones

- **New milestone before M8:** vendor `card`, `skeleton`, `tooltip` via the shadcn CLI; one commit; rollback = remove the three files. DoD: the three import cleanly and `pnpm run test` stays green. This unblocks M8/M9/M10's component imports.
- **M7:** add `consolidateAttention(colors[]): AttentionColor` (green+yellow+red -> red) as a pure tested function alongside `ageColorClass` and `formatRelative`; it powers the aggregate strip badge. Add the boundary test for the relative-time poll cadence assumption.
- **M8:** name the skeleton shape (1 hero block + N row blocks) and its `data-testid`; add a fixture/test for the hard read-error-with-no-prior-data state distinct from degraded-stale; assert last-good-data is preferred over empty on a failed refresh; assert per-region independence (board region empty while strip renders tab fixtures).
- **M9:** fix the lucide glyph-per-state table before the "color is always paired with an icon" test can pass; decide and state whether the one-line activity ships in Phase 1 or is deferred to status+time-only; pick the fold threshold number and the default group collapse state.
- **M4:** state that the reader retains the last successful parse in memory so the renderer can prefer last-good over empty on a transient read failure.
- **Layout (fold into M8 or a small M7.5):** add the explicit grid container spec (named areas, the rail-right vs bottom-strip breakpoint width, the hero `min-height` + internal scroll behavior on short windows).

---

## What is already at 9 and should not be touched

- The three-dominance-level rule with the explicit fourth-level ban.
- The 90%-killer getting a dedicated ranking tier.
- The "calm by default / color is signal not decoration / no uninvited motion" principle set.
- The three-distinct-empty-states taxonomy and the verbatim "Clear. Keep working." reuse.
- The remote-parity-per-action table (Section 3.5) and the decision to render the program region's "not available remotely" empty state while keeping the strip live.
- The deterministic-rank anti-flicker rule (keys by `id`, deterministic tie-break) as an explicit ADHD requirement.

These are genuinely good and well-grounded in the recon. The work to reach 9/10 is almost entirely about making the layout and the four state sets concrete and buildable, plus closing the three-missing-primitives gap, not about rethinking the hierarchy.
