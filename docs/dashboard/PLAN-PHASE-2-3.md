# ClaudeTerminal Dashboard: Phase 2 + Phase 3 spec

Companion to `PLAN.md` (the Phase 0 + Phase 1 plan). Extracted here so the shipping slice fits in one head (the workspace "decompose to fit" rule). Authority order and all hard constraints are inherited from `PLAN.md`; file:line citations are against the `dashboard` worktree at HEAD `ce2e9e0` and the producer at `infrastructure/program-board/src/program_board/`. Milestone IDs are stable LABELS, not run order (PLAN.md run-order note). Nothing here ships until the Phase gate (`docs/dashboard/PHASE-GATE.md`, read off `home-opens.json` per M14e) is verified: the artifact shows Home was the genuine first surface (R-10 Option A: land on Home WITHOUT auto-restoring tabs, M14b) on >=5 working days AND Mark named one concrete friction a Phase-2 milestone addresses (the `startupView` store key M14a + wiring M14b + the gate instrument M14e all ship in Phase 1 so this is measurable from data; only the picker M14c is here).

Same MVP discipline as PLAN.md: a SEPARATE store that does NOT touch program-board tags or `state.json`. Phase 2 adds the ranker, the re-roll, the capture store, and the avoidance pin. Phase 3 adds horizons/categories/parking and the coaching rituals (default OFF). Each milestone is one change + one expected vitest test + falsifiable DoD + one rollback point.

---

## Phase 2 milestones

- M14c: the "When ClaudeTerminal opens" picker UI only (the store key M14a + the `resolveStartupActiveId` wiring M14b ship in PHASE 1, corrected from round 4, so the Phase gate is measurable during its own window; see PLAN.md M14a/b/c).
- M6: `rankItems` + `pickPrimaryAction` + the manual re-roll + the per-day pinned/parked-hero-id slot + the read-only avoidance slug/name TIE-BREAK (PLAN.md Section 5; build Tier 1/2/3/4, test the 5.6 Phase-2 subset; re-roll parks the hero id and surfaces `ranked[1]`, PLAN.md 1.6). The read-only avoidance slug/name tie-break (PLAN.md 5.4 step 4) lands HERE, not in Phase 1: it was deferred out of Phase 1 because it re-sorts the Tier-4 list that PLAN.md 1.11 mandates mirror the producer board, and on live data it fires on zero cards (the only avoidance item is paused and filtered). M6 tests an avoidance-slug card outranks a non-avoidance card when all prior Tier-4 keys tie; the classifier-by-category pin over `blocked_on` text is the separate M13. The per-day pinned/parked-hero-id slot is built HERE (split out of M3b, which in Phase 1 ships only the live cross-project close-route fix), its first real consumer. M6 ALSO asserts re-roll park PERSISTENCE: a parked hero id (per-day, persisted into that slot) survives a simulated same-day reload and clears on a new day (PLAN.md 1.6). The re-roll window default is until end of day.
- M11: HomeView swaps board-order for `rankItems(...)[0]` with the per-day pinned-hero-id and parked-id applied on top (the single-field override from M8a becomes the ranker). The remaining list still mirrors the producer board order so the dashboard does not diverge from the board Mark also sees (PLAN.md 1.11/5.4); a Phase-2 builder MUST NOT re-sort it.
- M12: one-gesture capture (see "Capture" below): append-only `app.getPath('userData')/dashboard/todos.json` (OUT of the workspace git tree, the consistent MAIN-owned-app-state rule, PLAN.md 3.6); a NEW IPC channel pair with full AGENTS.md treatment, REMOTE-ENABLED with SERVER-SIDE VALIDATION; the capture bar keybinding; the quiet `Inbox(N)` glance number.
- M13: the avoidance-pin keyword classifier as a read-only pin over existing card `blocked_on`/`needs_you` text, pulled forward so Phase 2 surfaces no-git-activity avoidance items (closing the Phase-1 R-8 gap as soon as the ranker lands). M13 ALSO feeds the louder `avoidanceClose` settle tier (the two-tier calibrated payout, PLAN.md 1.5): a needs-you card carrying an avoidance category that closes with a progress signal earns the slightly-longer, still-calm, still-motion-safe beat, distinct from the ordinary settle. Renderer-only, never logged, never in `composeClaudeQuery`.

## Ownership

The `todos.json` store is owned by MAIN, `fs.readFileSync`/`writeFileSync` (AGENTS.md "No electron-store"), at `app.getPath('userData')/dashboard/todos.json` (written by the app, never the poller; OUT of the workspace git tree so its un-scrubbed phone-captured text never rests on a cross-repo gitignore, PLAN.md 3.6 / R-6). It sits beside the Phase-1 `closed.json` (the done-lane resolved-set, owned by MAIN's `ProgramBoardReader`, M4b / PLAN.md 1.5), under the same `userData` data dir. The capture channel is remote-enabled (M12). Phase-3 mutations (triage/park/done) extend that channel or add a sibling, each a deliberate remote decision per AGENTS.md.

## JSON schema (Phase-3 extension of the M12 file)

```jsonc
{
  "version": 2,
  "items": [
    {
      "id": "todo-<timestamp>-<random>",   // minted via a SHARED, collision-tested id generator (see note)
      "text": "string",                    // raw capture, the only required field (M12)
      "createdAt": 1718900000000,          // epoch ms
      "horizon": "now" | "next" | "later" | null,  // null until triaged (Phase 3)
      "category": "financial" | "documentation" | "delegation" | "completing-the-loop" | "health" | "marketing" | null,
      "project": "string | null",          // optional, assigned at triage
      "parkedUntil": 1719000000000 | null, // resurfacing timestamp; null = always visible
      "doneAt": 1718990000000 | null       // completion; null = open
    }
  ]
}
```

Id-generator note (the architect's reuse finding): the round-3 plan cited `tab-manager.ts:4-6` as the id-minting pattern, but that symbol is module-private and not importable. Export a single `generateId(prefix)` from `src/shared/` (the plan's own src/shared consolidation principle) and reuse it for BOTH tab ids and todo ids, with one collision test, rather than copying an unexported pattern.

## Horizons + anti-overwhelm triage (Phase 3)

`@now` (this week), `@next` (this month), `@later` (backlog), matching Mark's J.O.T. labels. `@now` items are visible and hero-eligible (Tier 5). `@next`/`@later` collapse behind one "+N more" (never three equal columns). Triage rules, fixed now so the build cannot violate them: triage surfaces ONE untriaged item at a time (J.O.T. applied to triage), with one-tap horizon assign + one-tap park/not-now, never the full inbox list (E4 A11, E7 C5 "produces freeze"); the untriaged count is a single quiet glance number (the M12 `Inbox(N)`), never a red badge, never auto-promoted to the hero.

## Six-category enum (and the avoidance-pin classifier, M13)

`AvoidanceCategory = 'financial' | 'documentation' | 'delegation' | 'completing-the-loop' | 'health' | 'marketing'`. These are NOT program-board tags; the producer's tag set is open and free-form, and the real `BLOCKER_TAGS` is the 2-element `{needs-CADDC02, needs-your-decision}` (`src/program_board/status.py:3`), untouched. A renderer-side PURE keyword classifier maps program-board `blocked_on`/`needs_you` text to the six categories so a no-git-activity item stays pinned in needs-you by category: items with no commits have no recency to age them, so without the pin the exact avoidance items most likely to rot are the ones the board cannot escalate. It is one pure function, one Tier-4 tie-break, one test. The classifier MUST never feed `composeClaudeQuery` and never be logged.

## Capture via the capture bar (M12, with remote validation)

The bar opens and focuses its input SYNCHRONOUSLY on the keydown handler, and Enter persists with only text set. The sub-2s activation target (the lens's one quantified ADHD axis) is encoded as a FALSIFIABLE test, not an adjective: assert `document.activeElement === input` in the SAME TICK as the keydown (no `await`, no `setTimeout`), and that Enter persists with only `text` set. The number moves WITH this milestone (it was the Phase-1 M12 target in round 2; moving capture to Phase 2 moves the encoded threshold with it). Scope decision for Mark: confirm capture-in-Phase-2 is acceptable given it pushes the only quantified ADHD target out of the first dogfoodable build (open question, PLAN.md Section 10). Capture and triage are separate.

Server-side validation is REQUIRED (the capture channel writes attacker-influenceable text to `todos.json` on the PHI-adjacent work PC, and the existing `tab:rename` remote handler trusts `msg.name` with no bound, `web-remote-server.ts:297-307`, a warning not a pattern to copy). The remote `capture:append` handler MUST: require `typeof msg.text === 'string'`, cap length (e.g. 2000), reject control bytes, cap total items / file size, atomic-write to the `userData` path. Captured text is DISPLAY-ONLY and is never an action payload (PLAN.md 1.7: a `source:'todo'` item's only action is Copy of inert text). M12 tests that over-length / non-string / control-byte captures are rejected server-side, and that the resolved path is under `userData`, not the workspace git tree.

## Keybinding challenge (mandatory per AGENTS.md)

The proposed capture chord is `Ctrl+Shift+K`, which must register as UPPERCASE `'K'`, not `'k'`. Verified: `matchKeybinding` compares `e.key === kb.key` case-sensitively (`keybindings.ts:77`), and with Shift held `KeyboardEvent.key` is the uppercase `'K'`. A lowercase `'k'` entry NEVER fires, so the capture bar would ship dead with green-looking code. The registry entry is `{ mod: 'ctrl+shift', key: 'K' }` and the M12 test dispatches a `KeyboardEvent` with `key:'K', ctrlKey:true, shiftKey:true`.

`Ctrl+Shift+K` is otherwise clean: not in the app registry (`keybindings.ts:53-67`), not a dynamic `Ctrl+1..9` jump (`isTabJump`, `:93-94`). Bare `Ctrl+K` is readline kill-line and terminal-claimed (AGENTS.md), but the `ctrl` matcher arm requires `!e.shiftKey` (`:77`), so `Ctrl+Shift+K` is a distinct chord the terminal does not consume. It satisfies AGENTS.md's `Ctrl+Shift+*` preference and avoids the taken `Ctrl+Shift+Tab`/`Ctrl+Shift+P`. Fallback if disliked: `Alt+C` (the `alt` arm requires `e.altKey && !e.ctrlKey`, `:82-84`; only `Alt+F4` is registered). Avoid `Ctrl+Shift+C`/`Ctrl+Shift+V` (xterm copy/paste). Raise with the user before merge (PLAN.md open question 4).

## Resurfacing / parking + the morning ritual (Phase 3)

A parked item must come back, or capture is useless. `parkedUntil` is epoch ms; an item with `parkedUntil > now` is hidden from the needs-you band but NOT deleted (silent decay is the AP-F anti-pattern). On each Home open and the ~20s poll tick, items whose `parkedUntil <= now` resurface into Tier 5. Parking is one-tap ("not now") with a small duration set (today, this week, next week). The morning intake / commitment mirror (the full E7 ritual: declare intent, the dashboard holds you to it, PLAN.md 1.9) is the Phase-3 expansion of the lock-in; it is CUE-BOUND to first-open (the same app-open cue Phase 1's Home-on-open already uses, E7 P5), not a fixed alarm, default OFF, and is where parked-and-resurfaced items get retriaged. Completion: `doneAt` set on finish, the row settles, the next Tier-5 item slides up, the completion count ticks. No confetti, no hard streaks (PLAN.md 1.4): any future show-up signal rewards attendance with grace-from-day-one, never a breakable chain.

The morning-ritual completion surface MUST carry the Phase-1 honesty guards forward (the ADHD skeptic's medium finding: the ritual fires at the START of the day when a fresh-at-midnight "N done today" is 0, opening on a bare-zero goal at the most fragile, highest-leverage moment, and a daily-resetting count surfaced at the morning cue is one "you did N yesterday" away from a de-facto streak). Three guards, attached explicitly here so the Phase-3 sketch does not ship without them:

1. The completion count obeys the SUPPRESSED-WHEN-ZERO rule (PLAN.md 1.5): no "0 done today" at a morning open with nothing done; at a bare-zero morning open it shows goal-reached / forward framing, never a blank reset (PLAN.md 1.10).
2. It surfaces a ROLLING last-24h / yesterday's-wins count (the same `closedRecent` model PLAN.md 1.5 already uses, non-zero at a morning open), NOT a fresh-at-midnight reset, so the cue opens on MOMENTUM not a zero.
3. The morning-ritual / `doneAt` completion copy is IN the M16/M17/M18 voice-test scope: no streak / chain / "in a row" / "N days" language, and no bare-zero fraction, in the surface fired at the most fragile moment of the day (PLAN.md 1.4, 6.6).

## Phase 3 milestones (sketch)

- M15: horizons + triage-one-at-a-time UI.
- M16: the stall pattern-interrupt (in-place pulse, default OFF, motion-arbitration test, PLAN.md 1.8). Tested with vitest fake timers: threshold-with-no-interaction triggers the in-place pulse (NOT a relayout); interaction before threshold cancels; the toggle off disables it; a pending `justResolved` settle DEFERS the timer (one motion source at a time).
- M17: the commitment-mirror intake (intake-only lock-in, default OFF, no time-since-lock copy, PLAN.md 1.9). The voice test asserts the locked-hero copy contains no "still not done" / time-since-lock language.
- M18: resurfacing/parking + the full morning ritual (cue-bound to app-open).
- M19 (opt-in, gated): the off-app batched nudge, and only if separately scheduled and confirmed, the disabled-by-default free-text path wiring `scrubFreeText` as harm-reduction (PLAN.md 3.4). M0c (the `scrubFreeText` pure function + test) sits immediately before M19 here so it ships beside its only caller, not two phases early. If the free-text opt-in ever enables `dod.gaps[0]` into the query slot, it MUST also gate the tab-namer (`tab-namer.ts:75`, suppress auto-naming for dashboard-injected tabs or scrub the namer prompt) so specificity does not leak to Haiku unscrubbed (PLAN.md R-14).
- Optional remote-Home milestone (PLAN.md 2.9): mounts `HomeView` in `RemoteApp` with its own Home slot + sibling render seam + a `ws-bridge` board stub, with a web-client render test. Until then Home is desktop-only and the plan does not claim an unbuilt surface.

Each milestone is one change + one test + DoD + rollback.
