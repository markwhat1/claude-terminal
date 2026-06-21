# Advisor review (round 4): UX / information architecture

Reviewer lens: UX/IA. Target: `PLAN.md` round-4 revision for the ClaudeTerminal in-app dashboard, `dashboard` worktree (HEAD `ce2e9e0`), with Phase 2/3 extracted to `PLAN-PHASE-2-3.md`. Scored against the four focus areas: hero-wins-by-muting hierarchy, the secondary session strip, shadcn/Tailwind fit, and the mandatory empty/loading/error states.

Current grade on the UX/IA lens: about 9.0/10. Round 4 closed almost the entire round-3 list and the single highest-value add I asked for (the first-open state timeline) landed in full. What keeps it from a clean 9.5 is four items, two of which I raised in round 3 and which silently did not land, plus a small cluster of net-new buildability nits around foreground/contrast tokens.

I graded the delta by diffing round 4 against my own round-3 review rather than re-reviewing from scratch, since round 3 was already at 8.5 and the structure has not changed.

---

## What landed from round 3 (confirmed against the plan and source)

This is a genuinely thorough absorption. Each round-3 item I can confirm:

- **The accent-class defect is fixed everywhere.** 6.2 line 564 and 6.3 now write `bg-attention` (not `bg-[--attention]`), with the explicit note that `--color-attention` is registered in `@theme inline` (verified live: `globals.css:30`) so the utility resolves, and the M8a test asserts `bg-attention` not the arbitrary form (740). Prose and test now agree.
- **Hero anatomy is bound to the vendored Card subcomponents.** 6.3 maps icon+name to `CardHeader`/`CardTitle`, the goal-gradient line + badges to `CardContent`, and the three-affordance budget to `CardFooter` so "no fourth button" is a single-location invariant. M8a asserts at most one full-weight button (the AP4 guard).
- **The no-action-constructible fallback is specified and tested.** 6.3 "No-action-constructible FALLBACK" makes the hero Copy-only when no primary action resolves; it is in the M8a matrix (a no-resolvable-action fixture renders a Copy-only hero, never a disabled primary button). This was an open hero-region IA hole; closed.
- **The heat-signal-once rule is stated.** 6.3 "HEAT signaling rule": heat escalates only via the capped age band; the primary button keeps a constant `bg-attention` regardless of band color. The over-saturation-under-hot-hero case is now closed in prose.
- **The display-only `detail` clarification landed.** 6.3 CardContent says the non-goal-gradient one-liner renders `detail`/`needsYouReasons` as DISPLAY-ONLY and is never an action source, and 3.6's branded `ClaudeQueryLine` type enforces it at compile time. The render/action PHI boundary is now explicit at the most prominent surface.
- **Strip group mini-headers are decided.** 6.4 line 599: quiet `text-xs text-muted-foreground` mini-headers label the needs-you and working groups; the idle group is its own default-collapsed fold at threshold 5.
- **Hue-precedence is decided and asserted.** 6.4 line 602: the per-project border stays low-S (`hsl(... 30% ...)`) so it never competes with the status accent, and M9 asserts the low-S form (754).
- **The `justResolved` strip decoration is named and reduced-motion-tested.** 6.4 line 600: a motion-safe one-shot fade (no new glyph), with the M9 assertion that under a reduced-motion mock the crossing applies NO transition class.
- **Tooltip is cut from M7b.** 6.0 line 548 cuts it explicitly as the dead-dependency it would be, since the disabled-reason uses helper text (3.2). M7b now vendors only `card` + `skeleton`.
- **The first-open state TIMELINE is pinned (the round-3 highest-value add).** 4.3 "First-open STATE TIMELINE" sequences the four states in time, 6.5 references it, and M8a has the fake-timer assertion (skeleton persists across a pending tick; "not running" appears only after the first read/timeout; a later success replaces it with NO second skeleton). This converts "four states exist" into "the four states never strobe," which was the real bar. Fully landed.

That is the clean sweep. It is rare to see this complete a turnaround; round 4 earned it.

---

## Must-fix 1: the Phase-1 keyboard / focus-order minimum is still entirely absent (the biggest remaining UX gap)

I raised this in round 2 and round 3. Round 4 dropped the earlier false "keyboard-first" promise (correct) but never stated the floor that replaces it, and the whole plan now contains zero mentions of focus order, tab order, focusable, `tabindex`, or aria (verified: grep across all of `PLAN.md` returns nothing). For an ADHD activation tool this is not an accessibility footnote, it is core to the thesis: the hero exists so Mark can land on Home and act on the one thing without aiming a mouse. If the primary button is not focus-and-Enter-reachable as the first interactive element, the "one-action surface" claim is half-built.

This is nearly free (shadcn `Button` is focusable by default) and belongs in Phase 0's M8a, because the read-only paint already renders the hero and the Copy action. State the Phase-1 minimum and make it falsifiable:

- The hero primary `Button` (or the Copy-only fallback button) is the FIRST focusable element in the Home region's tab order and activates on Enter.
- Copy is reachable by Tab from the hero.
- Strip rows are focusable and Enter jumps to the tab (the `handleSelectTab` wiring already exists, 6.4 line 601); the "+N more" and "N paused" disclosures are focusable.
- No custom arrow-key model in Phase 1 (explicitly out of scope, so a reviewer does not over-build).

Add a focus-order assertion to M8a: the hero primary button is the first focusable element in the Home region (`@testing-library` `tab()` / `toHaveFocus()` after a `tab` from the region root). One assertion, one sentence in 6.3 or a new 6.7, and the hero is genuinely the keyboard-first one-action surface it claims to be. Without it, the most ADHD-load-bearing interaction in the plan rests on a default nobody verified.

---

## Must-fix 2: the degraded "banner" placement decision was asked for in round 3 and still is not made

Round 3 asked to downgrade the degraded marker from a "banner" to a quiet header line and decide its persistence/dismissibility. Round 4 still writes "degraded banner" in three places (434, 607 line "Degraded: the 'last updated Nm ago' banner, data still shown", and 740 "degraded banner for the stale fixture") and never decides placement. "Banner" implies a full-width treatment that spends the hero region's scarce vertical budget and competes with the hero for attention on exactly a flaky-poll day, which is the calm-by-default failure the rest of the plan works hard to avoid. The two failure modes are symmetric: a persistent un-dismissible full banner becomes ambient noise; an auto-dismissing one hides a real staleness signal.

Decide it, in 6.5, in one sentence:

- The degraded marker is a single quiet `text-muted-foreground` line in the needs-you header next to "N need you / N working" (NOT a full-width banner), non-dismissible but quiet, and it clears itself the instant a fresh read lands.
- The hard-stale case (line 434, `>= ~10min`) MAY use a slightly more prominent treatment, but state which (still a header line, just `text-warning`, not a relayout that pushes the hero down). A staleness change must never reflow the hero (its own uninvited-motion problem, 1.2).
- Replace the word "banner" at 434 / 607 / 740 with "degraded line" so the M8a placement assertion has a concrete target. Add a placement assertion: the degraded marker renders inside the needs-you header, not as a sibling above the hero, and does not change the hero's position.

This is one decision and a word swap, but it is load-bearing: "banner" is the heaviest word in an otherwise calm states section.

---

## Must-fix 3: skeleton-mirrors-dominance did not land (a real loading-to-content reflow)

Round 3 asked that the loading skeleton mirror the dominance hierarchy so the skeleton-to-content transition has no reflow and no hierarchy flicker. Round 4's 4.5 line 480 still only says "1 hero block + N row blocks, each with a `data-testid`." A skeleton that gives the hero block and the row blocks equal visual weight pre-trains the eye to a flat layout, then the real content snaps into the hero-dominant grid: a layout shift plus a hierarchy flicker on every cold open, which is precisely the cold-start jarring the new first-open timeline (must-fix-1 of round 3, now landed) exists to kill. The timeline fixed the STATE strobe; this is the within-skeleton SHAPE strobe, a different defect.

State it in 4.5/6.5: the hero skeleton block uses the hero's grid area and `min-height` (6.1) and the row skeletons use the sub-dominant row height (6.2), so the skeleton occupies the same boxes the real content will, and the transition has zero reflow. Add to the M8a skeleton test: the hero skeleton block carries the hero `min-height` (or its grid-area `data-testid`), so loading-to-content cannot reflow. This pairs naturally with the grid in 6.1, which already gives the hero a stated `min-height`; the skeleton just has to honor the same area.

---

## Must-fix 4: the nav-badge / on-Home non-duplication rule is still unstated

6.4 line 603 defines the aggregate needs-you badge on the Home nav item via `consolidateAttention()` (and correctly fixes the orange-between-red-and-yellow ordering, MF-4). But the plan never states the badge's relationship to the on-Home surface. When Home IS the active view, the nav badge and the needs-you header's "N need you / N working" count and the strip's per-row needs-you glyphs all signal the same thing at once, which is mild but real redundancy and invites a builder to make the badge a second always-on counter competing with the header.

State the intent in 6.4 (IA clarification, no new code): the nav badge is the OFF-Home glance (the signal you see from inside a session that something on Home needs you); on the Home surface itself the unified header count (4.6) is the source of truth, and the badge need not be suppressed but is understood as redundant-by-design there. One sentence stops the badge from drifting into a competing counter.

---

## Net-new buildability nits (small, but they will bite M7b/M8a)

These are net-new in round 4 (mostly side effects of the new `--age-orange` token and the accent-class fix) and are cheap to close now:

1. **`--attention` has no foreground token, and the plan leaves the hero button label legibility unresolved.** 6.2 line 564 says "Button foreground is `text-attention-foreground` if added, else an explicit light foreground class since `#ce9178` is a mid-tone." Verified: `@theme inline` registers `--color-attention` but NO `--color-attention-foreground` (it stops at line 30; success/warning/destructive all have `-foreground` pairs, attention does not). So `text-attention-foreground` will NOT resolve today. Decide one: either M7b registers `--attention-foreground` (a light tone, e.g. `#1e1e1e` is wrong on this mid-tone, use `#ffffff` or near-white) alongside the existing pairs, OR the hero button uses an explicit `text-white`/`text-foreground` class. Pin it in 6.2 and assert the button has a resolvable foreground class in M8a, since `#ce9178` white-on-accent contrast is borderline (roughly 2.7:1 for white, which fails WCAG AA for normal text). This is a real legibility risk on the single most important pixel in the app. The cleanest fix: register `--attention-foreground: #1e1e1e` (dark text on the warm mid-tone clears AA at about 5.5:1) and use `text-attention-foreground`.

2. **The new `--age-orange` token has no foreground/contrast check stated.** 4.3 line 460 specifies `--age-orange` as a desaturated `#b5835a`-class tone with `text-age-orange`/`border-age-orange`/`bg-age-orange` utilities, distinct from `--attention`. Good. But age-orange is used as `text-age-orange` on the muted field (a row's age color) and potentially `bg-age-orange` (the hero band). `text-age-orange` on the dark VS Code field needs a legibility floor like the other three status text colors have. Add one line: `--age-orange` is chosen to clear AA on `--background` as text, same bar as `--warning`/`--success`. M7b's existing assertion (`bg-age-orange` distinct from `bg-attention`, 733) does not cover text legibility; add a contrast note so the desaturated tone is not picked so muted it disappears as a row's age signal.

3. **Shell glyph color: table vs code form mismatch (consistency nit).** 6.4's strip table (596) writes the shell color as a bare `#569cd6` "Color token," but TabIndicator applies it as `text-[#569cd6]` (verified `TabIndicator.tsx:33`, an arbitrary value, not a registered token). Since the strip REUSES TabIndicator verbatim (6.4 line 588), this is harmless in practice, but the table presents `#569cd6` as a token alongside real tokens (`text-success`, `text-attention`). One word: note it is the arbitrary `text-[#569cd6]` inherited from TabIndicator, not a registered token, so a reader does not go looking for a `--shell` token that does not exist.

---

## Cross-cutting (carried, still worth a line)

1. **The "N closed today" launch-reset concern is resolved better than I asked.** Round 3 flagged that an in-memory reset-on-launch count collides with all-day-open usage. Round 4's 1.5 made it a persisted last-24h `closed.json` owned by MAIN, reconstructed at reader construction, so a renderer reload never erases the day's payoff, and the header copy is "N closed today" (last 24h). This is the right fix and it is tested (M4 line 708). No further action; calling it out so it is not re-opened.

2. **The Phase-1 hero honesty is well-handled and should stay as written.** 1.11 and R-8/open-question 12 state plainly that on current live data the Phase-1 hero is a time-sensitive or almost-done dev/admin task, not an avoidance area (the one avoidance item, `marketing-roi`, is paused and filtered). That honesty is exactly right for a plan whose core bet is "a calm board earns daily opens." Do not soften it.

---

## Concrete additions to specific milestones

- **6.3 (or new 6.7) / M8a (must-fix 1, highest value):** state the Phase-1 keyboard minimum (hero primary button first in tab order, Enter-activates; Copy Tab-reachable; strip rows + disclosures focusable and Enter-jump; no custom arrow model) and add a focus-order assertion (hero primary button is the first focusable element in the Home region).
- **6.5 / 4.5 / M8a (must-fix 2):** downgrade "degraded banner" to a quiet `text-muted-foreground` header line next to "N need you," non-dismissible, self-clearing on a fresh read, never reflowing the hero; swap the word "banner" at lines 434 / 607 / 740; add a placement assertion.
- **4.5 / 6.5 / M8a (must-fix 3):** state the skeleton mirrors the dominance (hero skeleton block uses the hero grid area + `min-height`, rows use the sub-dominant height) so loading-to-content has no reflow; add the hero-skeleton-min-height assertion to the M8a skeleton test.
- **6.4 (must-fix 4):** state the nav-badge / on-Home non-duplication rule (nav badge is the off-Home glance; the unified header count is truth on Home).
- **6.2 / M7b / M8a (nit 1):** resolve the hero button foreground: register `--attention-foreground` (dark `#1e1e1e` on the warm mid-tone clears AA) and use `text-attention-foreground`, OR pin an explicit foreground class; assert the button has a resolvable, AA-passing foreground in M8a.
- **4.3 / M7b (nit 2):** state that `--age-orange` clears AA as text on `--background`, same bar as the other status text colors.
- **6.4 (nit 3):** note the shell glyph color is the inherited arbitrary `text-[#569cd6]` from TabIndicator, not a registered token.

---

## What is already at 9 and should not be touched

- The three-dominance ladder bound to exact Tailwind classes with the M8a hierarchy test, and the fourth-level ban (6.2).
- The hero anatomy bound to Card subcomponents with the three-affordance budget anchored in `CardFooter`, the one-button guard, and the Copy-only no-action fallback (6.3).
- The heat-signal-once rule (age band escalates, button accent constant) and the display-only `detail` boundary (6.3).
- The first-open state TIMELINE with the fake-timer M8a assertion, the per-region states, last-good preference, and the distinct error-vs-degraded split (4.3 / 4.5 / 6.5). The timeline is the standout addition.
- The strip rewritten to the five real `TabStatus` values reusing `TabIndicator`, the idle-age floor against `waitingSince` keeping "N need you" meaningful, the two distinct time computations, group mini-headers, the low-S hue-precedence rule, and the motion-safe `justResolved` fade with the reduced-motion M9 assertion (6.4).
- The progressive-disclosure cap (hero + N rows + "+N more") and the paused-card "N paused" disclosure, so the board stays calm on a heavy week, not only a 6-card day (4.4 / 4.6).
- The `--age-orange` token decision that resolves the hero-accent collision so age-orange never shares `--attention` (4.3 / M7b).
- Tooltip cut from M7b as the dead dependency it would be (6.0).
- The persisted last-24h `closed.json` carrot owned by MAIN, surviving renderer reload (1.5 / M4).
- The copy-voice test covering the whole module including the no-streak and no-"0 of N" assertions (6.6).

The remaining work is genuinely the last mile: state the keyboard floor, downgrade one word ("banner"), make the skeleton mirror the hero box, add one IA sentence about the nav badge, and resolve two foreground tokens. None of it is a rethink. The hierarchy, the strip vocabulary, the state taxonomy, and now the cold-open choreography are all strong.
