# Advisor review (round 2): UX / information architecture

Reviewer lens: UX/IA. Target: `PLAN.md` round-2 revision for the ClaudeTerminal in-app dashboard, `dashboard` worktree (HEAD `ce2e9e0`). Scored against the four focus areas: hero-wins-by-muting hierarchy, the secondary session strip, shadcn/Tailwind fit, and the mandatory empty/loading/error states.

Current grade on the UX/IA lens: about 8/10. Round 2 closed most of round 1: the grid is now named (6.1), the missing primitives have a milestone (6.0/M7b), the four states are per-region with last-good (4.5, 6.5), the copy-voice test exists (6.6), the disabled-reason uses helper text not a disabled-button tooltip (3.2), the relative-time cadence is pinned to the poll (1.2), and Focus mode has a spec (6.5). Those are real gains.

What still keeps it off 9 is concrete and mostly small: the session-strip glyph table (6.4) describes states the tab data model does not have and reuses glyph names the codebase does not contain, so M9's "color is always paired with an icon" test is built against fiction; the three-dominance contrast/type story is still adjectives, not token+type-step assignments; the per-session hue rule fights the established codebase pattern; and three load-bearing interaction decisions (row-click behavior, strip-empty, the "N closed today" source for live tabs) are written as "decide one and state it" rather than decided. None of these is a rethink. They are the last mile of making the spec buildable without re-deciding at code time.

---

## Verified facts this review rests on (re-grounded against the dashboard checkout)

- `globals.css` tokens confirmed present: `--foreground:#d4d4d4` (`:40`), `--card:#252526` (`:41`), `--muted-foreground:#808080` (`:50`), `--attention:#ce9178` (`:62`), `--success:#6a9955` (`:58`), `--warning:#dcdcaa` (`:60`), `--destructive:#f44747` (`:53`), `--border:#3c3c3c` (`:55`), `--project-hue:0` (`:65`). The plan's color budget maps onto these cleanly. There is NO type-scale token in `globals.css`; type steps come from Tailwind classes only.
- `TabStatus` is exactly `'new' | 'working' | 'idle' | 'requires_response' | 'shell'` (`src/shared/types.ts:1`). There is NO `'done'` and NO `'failed'` tab status. The only `done`/`failed` in the codebase is the HookStatus lifecycle type (`types.ts:129`, `status: 'running' | 'done' | 'failed'`), a different concept (a single hook run, not a session).
- `TabIndicator.tsx` is the real status-glyph vocabulary: `working` = `Loader2` + `text-warning` + `animate-spin` (`:15`), `idle` = `CheckCircle2` + `text-success` (a GREEN CHECK, `:21`, not a dim circle), `requires_response` = `MessageCircle` + `text-attention` + `animate-pulse` (`:27`), `shell` = `TerminalSquare`, `new` = `Circle`. ICON_SIZE is 12 (`:5`).
- `CircleAlert`, `CircleCheck`, `CircleX` (the glyphs the plan's 6.4 table names) appear NOWHERE in `src/renderer`. They exist in lucide and are vendorable, but the plan presents them as "reuse the existing palette and TabIndicator vocabulary" when they are not in it.
- `--project-hue` is set via inline `style` and read via `hsl(var(--project-hue) ...)` arbitrary-value classes throughout: `App.tsx:109` sets it inline; `StatusBar.tsx:37`, `Tab.tsx:89-90`, `TabBar.tsx:100` read it via `bg-[hsl(var(--project-hue)_...)]`; `ProjectSidebar.tsx:69-70` and `ProjectSwitcherDialog.tsx:87` use inline `style={{ backgroundColor: hsl(...) }}`. Inline style for the hue is the established house pattern, not an anti-pattern.
- shadcn set present: badge, button, dialog, dropdown-menu, input, label, popover, radio-group, select, switch, table. Missing: card, skeleton, tooltip (M7b vendors them, correct). `components.json` is new-york + lucide.

---

## Area 1: Hero-wins-by-muting hierarchy

The strongest area and round 2 kept it strong: the grid with named areas + hero `min-height` + internal scroll on short windows (6.1) fixes round 1's biggest hole, the three-dominance table (6.2) has the explicit fourth-level ban, the 90%-killer keeps its own tier, and the saturation-capped hero (1.4) is a sharp ADHD-specific call that pairs with the re-roll. Keep all of it.

What blocks 9:

1. **The three dominance levels are still distinguished by adjectives, not by token + type-step assignments.** 6.1 says "airy hero spacing tokens, tight strip tokens" and 6.2 says "one step down in scale/contrast," but a builder still cannot tell what type size the hero title is versus a sub-dominant row versus a strip row. There is no type token in `globals.css`, so this MUST be pinned as Tailwind classes or two builders ship two hierarchies. Pin a concrete three-step ladder, for example: hero title `text-xl font-semibold text-foreground`; sub-dominant row title `text-sm text-foreground`; strip row `text-xs text-muted-foreground`. The contrast lever is then real (full `--foreground` for the two action tiers, `--muted-foreground` only for the subordinate strip), and the density lever is real (hero `p-6 gap-4`, sub-dominant rows `px-3 py-2`, strip rows `px-2 py-1`). Put the exact classes in 6.2's table cells, not in prose. This is the cheapest single edit that moves the hierarchy from describable to buildable.

2. **The "thin desaturated identity tint from `--project-hue`" (1.2, 6.4) needs to say HOW, and it should match the house pattern rather than round 1's "never inline style" advice.** Round 1 said "never an inline `style` for the hue tint." That advice is wrong for this repo: the entire codebase sets `--project-hue` inline (`App.tsx:109`) and reads it via `hsl(var(--project-hue) ...)` arbitrary-value classes (`StatusBar.tsx:37`, `Tab.tsx:89`, `TabBar.tsx:100`). The correct, consistent move for the strip's identity tint is the same arbitrary-value class form already in use, for example a thin left-edge `border-l-2 border-[hsl(var(--project-hue)_30%_35%)]` or a near-flat `bg-[hsl(var(--project-hue)_15%_18%)]`, NEVER a saturated fill (anti-pattern 4 in F2). State the exact form and the desaturation ceiling (low S, the rail must not spend the color budget) so the rare needs-you accent still spikes.

3. **The hero's age-color "thin left-edge band" needs its render mechanism named, since `Card` has no such slot.** 6.3 says age color is a thin left-edge band on the hero `Card`. Once M7b vendors `card.tsx`, the band is a Tailwind `border-l-4` plus the `ageColorClass` token from M7 applied to the `Card` root, not a Card feature. Say so in 6.3 (one sentence) so the builder does not look for a Card prop that does not exist. Same note for the sub-dominant rows: list-row verbatim age color (1.4) is a `border-l-2` + `ageColorClass`, the producer's full band in the list, the capped thin band on the hero.

---

## Area 2: Secondary session strip (the weakest area in round 2)

Round 2 correctly deferred the one-line activity string to Phase 2 (6.4), adopted group-by-attention, and added the aggregate `consolidateAttention` badge. But the glyph table (6.4) is now actively wrong against the data model, which is worse than round 1's "glyphs unnamed" because it reads as decided and will be built against:

1. **The 6.4 glyph table lists `done` and `failed` as session-strip states. Tabs have neither status.** `TabStatus` is `new | working | idle | requires_response | shell` (`types.ts:1`). There is no `done` and no `failed` tab. So a strip row can never enter the `CircleCheck`/`done` or `CircleX`/`failed` rows of that table from live-tab data. Two consequences:
   - The `done` row collides with the done-lane payoff (1.5). 1.5's `justResolved` settle beat fires when a tab LEAVES the needs-you set, then the tab is still `idle`, not a new `done` status. The strip's "done" treatment, if it exists at all, is a transient `justResolved` decoration on an `idle` row, not a steady-state glyph. State that, or drop the `done`/`failed` rows from the strip table entirely.
   - `failed` has no source at all in Phase 1. The closest is the HookStatus `failed` (`types.ts:129`), which is a hook-run outcome surfaced in `StatusBar`, not a per-session steady state. Either map the strip to the FIVE real `TabStatus` values, or explicitly define a derived `failed` (and say from what) before M9 can build it.

2. **The glyph names are presented as reuse but are not in the codebase.** `CircleAlert`, `CircleCheck`, `CircleX` are not imported anywhere in `src/renderer`. The real reusable vocabulary is `TabIndicator.tsx`: `Loader2` (working), `CheckCircle2` (idle, and it is GREEN `text-success`, not a dim circle), `MessageCircle` (requires_response), `Circle` (new), `TerminalSquare` (shell). Round 2 even cites `TabIndicator.tsx:27` for `MessageCircle` then lists `CircleAlert` in the same row. Resolve the contradiction: either reuse `TabIndicator` verbatim (best, since the strip and the tab bar should speak ONE status language for an ADHD user, see point 4) or state that the Home introduces a new glyph set and why it diverges from the tab bar. Right now M9's DoD "every state row has both color and icon" is untestable because the icon set is internally inconsistent.

3. **Three interaction decisions are still written as "decide one and state it," which is the round-1 failure repeating.** 6.4 says "A row click is a no-op except the action buttons ... (or a click jumps via `handleSelectTab` ... decide one and state it)" and "pick the fold number, e.g. 5, and the default group-collapse state, in the component." Deciding-at-code-time is exactly what produces an unfinished-looking surface. Decide them in the plan:
   - Strip row click: the whole row jumps to that tab via the Home-aware `handleSelectTab` (`App.tsx:113-121`). A session row IS a tab, so row-click-to-focus is the obvious affordance and matches the tab bar. The needs-you LIST is the different case (cards have no tab); state separately that a card row-click is a no-op or expands detail and only the action buttons act (round 1 raised this; it is still unstated for the card rows in 6.3).
   - Fold threshold: pick 5 (F2's 5-7 restraint, low end for calm). Default collapsed for the idle/completed group, expanded for needs-you and working.
   - The `done`/`idle` fold: 6.4 says "completed/idle fold into ... N more" but there is no completed status; this is the `idle` group, possibly with a transient `justResolved` row floated to the top of the working group for its settle beat. Pin it.

4. **One status language, stated as a requirement.** For an ADHD-calm tool, the strip glyph for "working" and the tab-bar glyph for "working" should be the SAME glyph and color, or the user learns two vocabularies. The plan should state: the Home reuses `TabIndicator`'s glyph+color mapping verbatim for the shared statuses, and only adds the `motion-safe:` gate (which `TabIndicator` lacks today, see Area 3). This also makes M9's icon test trivial: assert the strip renders the same component/mapping as the tab bar.

5. **The strip's own empty state is still unspecified.** 6.5 covers the program region's four states but never says what the strip shows with zero live tabs (the common case landing on Home after a clean close). State it: with zero tabs the strip renders a single quiet line ("No active sessions") in `--muted-foreground`, NOT a skeleton (the strip is fed by `onTabUpdate`, which is synchronously available, so it never "loads"). This matters because 6.5's caught-up "Clear. Keep working." over an empty strip should read as genuinely-done, not broken.

---

## Area 3: shadcn / Tailwind fit

Round 2 fixed the headline gap: M7b vendors card/skeleton/tooltip as one rollback point (6.0), and the disabled-reason is now helper text, not a disabled-button tooltip (3.2). Remaining:

1. **`motion-safe:` is specified for the Home's own glyphs but the REUSED `TabIndicator` is not gated.** 1.2 correctly says the reduced-motion variant must suppress both `animate-spin` (working) and `animate-pulse` (requires_response), and names `TabIndicator.tsx:15` and `:27` as the two animated glyphs. But `TabIndicator.tsx` today uses bare `animate-spin` (`:15`) and bare `animate-pulse` (`:27`), no `motion-safe:`. If the strip reuses `TabIndicator` (Area 2 point 4), the reduced-motion promise is broken unless `TabIndicator` itself is gated. Decide: either gate `TabIndicator` at the source (a one-line change to `:15` and `:27`, which also improves the existing tab bar and is the cleaner fix) and note it as a tiny milestone, or have the strip render its own gated glyphs and accept two vocabularies (worse, see Area 2 point 4). State which, and if gating `TabIndicator` at the source, add it as its own one-change/one-test rollback point so it does not ride silently inside M9.

2. **Map the hero anatomy to the actual Card subcomponents once vendored.** 6.3 lists the hero anatomy but does not bind it to `CardHeader`/`CardTitle`/`CardContent`/`CardFooter`. After M7b, name the mapping so M8a is not inventing structure: title + kind icon in `CardHeader`/`CardTitle`, the one-line missing step + tag badges in `CardContent`, the primary `Button` + quiet re-roll/lock-in/secondary icon buttons in `CardFooter`. The age band is `border-l-4` + `ageColorClass` on the `Card` root (Area 1 point 3).

3. **Name the accent application form.** Round 1 asked for this and it is still prose. The one accent is `--attention`: the hero primary `Button` (`bg-[--attention]` or the existing `text-attention` precedent from `StatusBar.tsx:16`) and the single highest needs-you strip dot. State the exact class so a builder does not reach for an inline color, and state that NOTHING else on the surface gets `--attention`.

---

## Area 4: mandatory empty / loading / error states

Round 2 is strong here: per-region states (4.5), last-good preference (4.5, M8a), the skeleton shape with `data-testid` (4.5, 6.5), error distinct from degraded (4.5), and the three program-board empties plus caught-up (4.3). This area is close to 9. Two refinements:

1. **The caught-up scope is named but the cross-region reading is not pinned.** Round 1 raised that "Clear. Keep working." governs the needs-you/hero region only and the strip still shows working sessions beneath it. Round 2 pairs the caught-up copy with "N closed today" (good) but does not state the strip-still-shows-working invariant. State it in 6.5: caught-up governs the hero + needs-you region; the strip renders independently, so "Clear. Keep working." over a strip showing two active sessions reads as "nothing to action, work is proceeding," and over an empty strip (Area 2 point 5) reads as genuinely idle. Both must read correctly; that is a per-region state-matrix assertion worth adding to M8a/M9.

2. **The "N closed today" source for the LIVE-TAB half is hand-waved.** 1.5 says the count is sourced from "program cards crossing into the Done lane PLUS `requires_response` sessions that have been answered." The program-card half is sound (the producer has a Done lane). The live-tab half is not: a `requires_response` session that gets answered transitions back to `working` then `idle` (per the `new -> working <-> idle/requires_response` flow in AGENTS.md); there is no persisted "this was answered today" event, and the M1 fields are `statusSince`/`lastActivityAt`/`firstActivityAt` only, none of which records a requires_response-to-answered transition count. So "N closed today" cannot count answered sessions from the M1 data as written. Either (a) scope the Phase-1 "N closed today" to program-card Done-lane crossings only and defer the answered-session count to a Phase-2 field, or (b) add a main-side counter field and spec it. Pick (a) for Phase 1 (it needs no new field) and say so, so M8b's done-lane test is built against a real source.

---

## Cross-cutting

1. **Focus mode (1.8 / 6.5) is now spec'd but its keybinding decision is deferred mid-sentence.** 6.5 says "its keybinding, if any, is challenged per AGENTS.md before merge or cut from Phase 1 explicitly." Decide now: Focus mode in Phase 1 is the stall-interrupt TARGET (auto-triggered, 1.8) plus a click toggle, NO keybinding (avoids spending an AGENTS.md keybinding challenge on a low-frequency action). If a keybinding is ever wanted, it rides Phase 2 with the full challenge. State that so M13 does not stall on a keybinding decision.

2. **Keyboard traversal of the Home view is still unstated.** Round 1 flagged that 6.4's "keyboard-first" claim has no milestone. Round 2 dropped the "keyboard-first" phrasing (good, no false promise) but never says whether the hero primary action and the re-roll are reachable by keyboard at all. For an ADHD tool the hero CTA should be focusable and Enter-activatable (it is a shadcn `Button`, so it is by default). State the minimum: the hero primary button is in the natural tab order and Enter-activates; no custom arrow-key model in Phase 1; capture is the one chord (`Ctrl+Shift+K`, M12). That closes the half-promise without scope creep.

3. **Copy-voice test (6.6) should assert the strip/empty STRINGS too, not only the canned templates.** 6.6 tests the canned `KnownActionId` templates and the empty/error/loading copy for em dashes and slop. Add the strip empty string ("No active sessions"), the caught-up pairing, and the disabled-reason helper text ("Available on the desktop app only") to that same assertion set, since all are user-facing copy.

---

## Concrete additions to specific milestones

- **6.2 / M8a:** put the three-step type+density+contrast ladder in the dominance table cells as exact Tailwind classes (hero `text-xl font-semibold text-foreground p-6 gap-4`; sub-dominant `text-sm text-foreground px-3 py-2`; strip `text-xs text-muted-foreground px-2 py-1`). DoD: a render test asserts the hero title node carries the hero type class and a strip row carries `text-muted-foreground`.
- **6.4 / M9:** rewrite the glyph table to the FIVE real `TabStatus` values, reusing `TabIndicator`'s mapping verbatim (`Loader2`/working, `CheckCircle2`/idle, `MessageCircle`/requires_response, `Circle`/new, `TerminalSquare`/shell); drop the `done`/`failed` rows or define `done` as a transient `justResolved` decoration on an `idle` row and `failed` with a named source. Decide row-click = jump-to-tab, fold = 5, idle group default-collapsed. DoD: M9's icon test asserts the strip uses the same status->glyph map as the tab bar.
- **TabIndicator gate (new tiny milestone, before M9):** add `motion-safe:` to `TabIndicator.tsx:15` (`animate-spin`) and `:27` (`animate-pulse`). One change, one test (reduced-motion suppresses both), one rollback. This makes the reused vocabulary honor 1.2's reduced-motion promise and improves the existing tab bar.
- **6.4 / M9:** add the strip empty state ("No active sessions", `--muted-foreground`, never a skeleton) and a test for zero-tabs.
- **6.5 / M8a + M9:** add the per-region cross-reading assertion (caught-up hero region over a working strip; caught-up over an empty strip).
- **1.5 / M8b:** scope Phase-1 "N closed today" to program-card Done-lane crossings only; defer the answered-session count to a Phase-2 field; the M8b done-lane test counts only the producer-sourced crossings.
- **6.3 / M8a:** state that a needs-you CARD row-click is a no-op (only the action buttons act), distinct from a strip row-click (jumps to tab); name the hero age band as `border-l-4` + `ageColorClass` on the `Card` root and map the anatomy to `CardHeader`/`CardContent`/`CardFooter`.
- **6.6 / M8a:** extend the no-em-dash/no-slop assertion set to the strip empty string, the disabled-reason helper text, and the caught-up pairing.

---

## What is already at 9 and should not be touched

- The grid with named areas + hero `min-height` + internal scroll on short windows (6.1). This was round 1's biggest hole and it is now solid.
- The three-dominance-level rule with the explicit fourth-level ban (6.2).
- The saturation-capped hero paired with the re-roll (1.4 / 1.6) as an ADHD-specific anti-shame mechanism.
- The 90%-killer as its own ranking tier driven OFF the producer's exact predicate including the single-item DoD (Tier 3, 4.4).
- The four per-region states with last-good preference and the distinct error-vs-degraded split (4.5, 6.5).
- The three-distinct-empty-states taxonomy and the verbatim "Clear. Keep working." reuse (4.3).
- The relative-time cadence pinned to the poll, not a per-second ticker, with the single 1s active-tab exception justified (1.2).
- The remote-parity-per-action table with the program region's "not available remotely" empty state while the strip stays live (3.5).
- The deterministic-rank anti-flicker rule (keys by `id`, deterministic tie-break) as an explicit ADHD requirement (5.5).

The work to reach 9/10 is the last mile of buildability: fix the strip glyph table to the real `TabStatus` set and one shared status vocabulary, turn the three-dominance contrast/density story into exact Tailwind classes, align the hue tint with the house inline pattern, gate the reused `TabIndicator` animations, and decide the four "decide one and state it" interaction points in the plan rather than at code time. None of it is a rethink of the hierarchy, which is genuinely strong.
