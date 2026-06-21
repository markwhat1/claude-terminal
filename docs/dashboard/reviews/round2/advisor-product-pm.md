# Advisor review (round 2): Product / PM lens

Plan reviewed: `docs/dashboard/PLAN.md` (dashboard worktree, HEAD `ce2e9e0`, verified live).
Lens: Phase 1 / Phase 2 split, the MVP cut that ships value early, boringly-small milestones with DoD + rollback, the vitest test plan.

Verdict: this revision absorbed almost all of round 1. The MVP line is now drawn (Phase 1a vs 1b), the App-mount test problem is solved by M0 fixtures plus extracted pure helpers, the M3 second null path is fixed, DoDs are mostly falsifiable, and the AGENTS.md IPC discipline is encoded per channel. Strong work. Current score on this lens: about 8.3/10. What stands between here and 9/10 is a set of precision and sequencing defects in Section 7 itself, plus three real gaps where a Phase-1 milestone leans on data or a control that is not yet in place. None are direction problems; all are fixable in an editing pass on the milestone list.

What I re-verified against source this round (not just the R-docs):
- Branch/HEAD `dashboard` / `ce2e9e0`. Confirmed.
- `settings-store.ts`: `StoreData` at :12-16, `DEFAULTS` at :18-22 (`permissionMode: 'bypassPermissions'`, `defaultShell: null`), `getDefaultShell`/`setDefaultShell` at :74-81, `{ ...DEFAULTS, ...JSON.parse(raw) }` merge at :37. All match the M11 citations.
- `App.tsx`: `onTabRemoved` :366-381 with the TWO null returns (`:373` zero-tabs, `:375` empty-source-project), the `onTabUpdate` appender `[...prev, tab]` at :362, the `tabs.map` render container at :576-583. All match.
- Test layout: runner is `vitest run` exposed as `pnpm run test`; tests mirror `src/` under `tests/{main,renderer,shared,integration,hooks}`. No `tests/fixtures/` directory exists yet (M0 must create it). The three renderer tests are prop-only; no test mounts `App`. Matches the plan's premise.

The rest of this review assumes the plan's own line numbers and milestone IDs.

---

## A. Must-fix (defects in the milestone plan, the thing this lens grades)

### A1. The milestone list is physically out of order, and the disorder hides a real sequencing bug

The headers in Section 7, in document order, are: M0, M1, M3, **M0b**, M4, M5, M6, M7, M7b, M8a, M8b, M9, M10, M11, M12, M13, M14. Two problems:

1. M0b ("Logger DevTools-mirror gate", a declared "pre-M10 security control") sits between M3 and M4 in the file but is numbered `0b`, so a reader cannot tell when it actually runs. Renumber it so position equals order. If it must run before M4 (it should, see below), call it M3c or M3.5 and move the header there; if it can run any time before M10, say so explicitly and stop implying it is an M0-class prerequisite.

2. The bigger issue: **M0b is NOT in the Phase 1a cut (line 476) but M8a is.** M8a paints the HomeView, which renders feed `title`/`detail`/`blocked_on` and (per the mapper) can route them into `log.*` and the DevTools mirror. The DevTools mirror leak (`logger.ts:42-51`, mirrors every level unredacted) is live the moment HomeView renders real program-board data. So the security control that section 3.6 marks CRITICAL ships AFTER the first milestone that exposes the data it protects. Fix: put M0b (the logger gate) INTO the Phase 1a cut, sequenced before M4 (the reader) or at the latest before M8a. A "pre-M10" label is wrong; the exposure starts at the MVP paint, not at the actions milestone. This is the single most important sequencing fix in the plan.

### A2. The Phase 1b milestone enumeration names a milestone that does not exist in Phase 1

Line 477: "plus the ADHD carrots M12-M15 (capture, done-lane, re-roll, stall-interrupt)." There is no M15 in Phase 1. M15 is the FIRST Phase 2 milestone (line 604: "Phase 1 ships after M14. M15+ are Phase 2"; line 656: "M15 horizons + triage"). The carrots are M12 (capture), M13 (stall-interrupt), M14 (commitment lock-in), and the done-lane payoff is actually folded into M8b (line 555), not a standalone carrot. Reconcile line 477 to the real set: "M12-M14 (capture, stall-interrupt, lock-in); the done-lane payoff and re-roll live in M8b." A milestone list that miscounts its own contents will not survive a reviewer-gate, and a build lane reading "M12-M15" will look for a Phase-1 M15 that is not there.

### A3. The "N closed today" done-lane payoff has no committed data source, and it is load-bearing for the anti-avoidance thesis

Section 1.5 and 6.3 promise "N closed today" sourced from "program cards crossing into the Done lane plus `requires_response` sessions that have been answered (both already in the Phase-1 feed)." Verify this against the producer contract: `state.json` is a SNAPSHOT. It carries `lane` per program at poll time; it does NOT carry a "crossed into Done since midnight" event or a per-day close count. To compute "N closed today" the reader has to remember which cards were in a non-Done lane on a prior poll and are now in Done, across app restarts and across the producer's own 60s churn. That is per-day state the plan never specifies who owns. Same for "`requires_response` sessions answered": a tab leaving the needs-you set is observable in-session but evaporates on renderer reload. As written, M8b's DoD ("a card moving to Done... decrements the needs-you count") tests the live transition only, which is the easy half; the persistent daily count is unscoped. Either (a) define the tiny per-day store (an in-memory set of "ids seen resolved today," reset at local midnight, explicitly NOT persisted in Phase 1, so the count is "since app open today" and the copy says so), or (b) cut the numeric "N closed today" from Phase 1 and ship only the per-card settle beat (which IS fully sourced from the live `justResolved` transition), promoting the count to Phase 2 where the todo store gives it a real `doneAt`. Recommend (a) with the honest "since open" framing; it keeps the payoff in Phase 1 without smuggling a persistence sub-task into M8b.

### A4. M11 is still one milestone doing four things with four rollback surfaces

Round 1 (A5) asked to split this; the revision kept M11 as: `StoreData`/`DEFAULTS` extension + getter/setter (main, real-temp-file test), branching TWO `setActiveTabId` sites in `App.tsx` (renderer), AND a `SettingsDialog` picker (renderer UI). That is three distinct change surfaces and three rollback points fused into one "boringly small" milestone, which violates the plan's own one-change rule. Split:
- M11a: settings-store `startupView` key + getter/setter + round-trip/missing-key test (pure main, mirrors `settings-store.test.ts` exactly, real temp file). One change.
- M11b: branch the two `setActiveTabId` sites (`App.tsx:334`, `:517`) on `startupView` + the renderer selection test. One change.
- M11c: the `SettingsDialog` "When ClaudeTerminal opens" picker, reads/writes M11a. One change.
The win is concrete: a revert of the picker UI should not also revert the persisted setting, and vice versa. This is the same defect I raised last round and it is cheap to fix now.

### A5. Two DoDs still hide a non-falsifiable or under-specified clause

The revision tightened most DoDs (good, the "no console errors" clauses are gone). Two remain soft:
- M9 DoD: "strip is subordinate; no board/grid." "Subordinate" is not assertable. The TEST surface for M9 is good and specific (sort order, sub-floor exclusion, icon+color pairing, fold, count-up tick). Make the DoD the green test plus one observable from that list (for example "every state row asserts both an icon and a color token; the sub-floor idle tab is absent from the needs-you count"), and drop the adjective. The "no board/grid" intent is better enforced by a structural assertion (the strip component renders no element with the `hero`/`groups` grid-area data-testids) than by prose.
- M13 DoD: "the interrupt fires only on detected stall." That is the feature description, not a checkable predicate. The test surface already states the three cases (threshold-no-interaction enters Focus; interaction-before-threshold cancels; toggle-off disables). Make the DoD: "all three fake-timer cases green; Focus mode never reorders the ranked list (asserted by snapshotting item order across the collapse)." The non-reorder guarantee is a real ADHD-safety property the plan claims (line 90) but no test currently pins.

### A6. The Phase 1a cut claims "the four states" but the empty/error/degraded coverage depends on M4 fixtures that M8a re-uses; make the dependency explicit in the cut line

Phase 1a = M0, M1, M3, M4, M5, M7b, M8a. M8a's test asserts five rendered conditions (skeleton, hero, caught-up, not-running, degraded, hard-error). Those rendered states consume `computeFreshness` and `parseState` outputs built and tested in M4. Good. But the cut line (476) lists M4 and M8a without noting that M8a's state-rendering tests REQUIRE the M4 freshness bands and the M0 golden fixture variants (fresh / `programs:[]` / `generated_at:null` / stale / corrupt-for-last-good). M0's stated deliverable is "a golden `state.json` fixture" (singular). For M8a to test four-plus states it needs FIVE fixture variants. Either expand M0's DoD to "golden fixture plus the four state-variant fixtures (fresh, empty-programs, never-polled `generated_at:null`, hard-stale)" or note in M8a that it authors its own variant fixtures. As written, M0 under-delivers what M4 and M8a both consume, and that gap surfaces mid-build as "wait, I need four more fixtures," which is exactly the boringly-small violation the plan is trying to avoid.

---

## B. Should-fix (raises reviewability and de-risks the build)

### B1. Make the five-part AGENTS.md IPC treatment a literal DoD checklist on M5 AND M12

Round 1 (B1) asked for this. The revision describes all five parts in prose for both channels but the DoDs still summarize ("green; only these channel names added"). Turn the five parts into five tickable DoD lines on M5 (handler / preload / `global.d.ts` presence-check / registration-test assertion / remote-decision assertion) and on M12 (handler / preload / `global.d.ts` / registration-test / the remote-ENABLED decision recorded in `docs/ipc.md` + `WebRemoteServer.handleMessage` + real `ws-bridge` send). M12 is the higher-risk one because it is the only NEW remote-enabled channel in Phase 1 (a deliberate security expansion per R5), so its DoD should also include the AGENTS.md path-validation line: capture text is untrusted input; assert it cannot reach a `path.join` and that the append target is the fixed `dashboard/todos.json`, never a path derived from the payload.

### B2. Close the loop: a Phase-1 captured todo can become a hero whose action is a `claudeQuery`, which re-touches the PHI choke point

The `DashboardItem` mapper normalizes todos into the same shape (4.1) and `rankItems` Tier 5 makes a todo hero-eligible. The hero's primary action routes through `pickPrimaryAction` -> `composeClaudeQuery`. So a raw phone-captured string could, in principle, drive the deliverable slot of a canned query. The plan already protects this: `draftFirstVersion`'s slot is filled "ONLY from the program slug/name and a fixed kind label, never from free `blocked_on`/`detail` text" (1.7, 3.4). But a TODO has no program slug; it is free text by definition. State explicitly in 1.7 / 4.1 that a `source:'todo'` item is NOT eligible for `draftFirstVersion` (or any free-text-slot action) in Phase 1, and that its only Phase-1 action is `copy` of the inert text. Add one `pickPrimaryAction` test: a `todo` item returns a no-free-text action (copy), never a composed query with the capture text in the body. This is a one-line scope decision that prevents the capture feature from quietly reopening the choke point the plan worked hard to seal.

### B3. The Phase 1a "Copy only" actions cut needs the canned-command discipline stated, or it is not actually safe-by-omission

Line 476 says Phase 1a ships "Copy only." Section 3.3 is careful that a copy payload which is a runnable command must be a CANNED command with only the resolved path interpolated, and that generic `copy:{text}` is for INERT display values only. But M8a (the Phase 1a paint) is where Copy first ships, and M8a's milestone body does not restate that constraint; it lands in M10's body (3.3/3.4 wiring). Risk: a 1a build that adds a "copy this PowerShell" affordance using the generic `copy:{text}` path. Add to M8a's DoD: "Copy in 1a is limited to inert display strings (title, detail rendered as text); no runnable-command copy ships until the canned composer lands in M10." That keeps the MVP genuinely safe rather than safe-by-the-feature-not-existing-yet.

### B4. M6 builds `rankItems` in Phase 1b but M8a (Phase 1a) already needs a hero; the "board order" bridge is correct, state it as a contract test

The plan handles this well (5, line 373: 1a renders the producer's already-sorted list, hero = `needsYouCards[0]`; `rankItems` lands in M8b/M6). One gap: nothing tests that the 1a board-order hero and the 1b `rankItems[0]` hero AGREE for the common case (a single hottest needs-you card). If they diverge silently, the MVP and the enriched build show different "one things" for the same data, which is a trust break for an ADHD user who learns to rely on the hero. Add one M8b test: for a fixture with one clear top needs-you card, `rankItems[0]` equals the 1a board-order hero. This pins the MVP-to-enriched continuity that the two-phase paint depends on.

### B5. The capture sub-2s "measured not asserted" claim (M12) tests focus + persist, not latency; name what is actually measured

Section 1.3 and M12 promise the sub-2s claim is "MEASURED, not asserted." The M12 test as described asserts (a) the bar focuses its input synchronously on keydown and (b) Enter persists with only `text` set. That proves the INTERACTION shape is sub-2s-capable (synchronous focus, single keystroke to persist), not a wall-clock 2s. That is the right test (a timing assertion in jsdom would be flaky and meaningless), but the prose oversells it as a latency measurement. Reword 1.3/M12 to "the test proves the interaction is single-gesture and synchronous (the precondition for sub-2s), not a wall-clock timing." Honest framing here matters because "measured" is a falsifiable word and a reviewer will check it.

---

## C. Nits / polish (cheap, worth doing)

- C1. The MVP cut line (476) omits M0b entirely (see A1) and the milestone headers interleave `0b` out of order; once A1 is fixed, restate both cut lines (476, 477) so every Phase-1 milestone appears in exactly one of 1a/1b. Today M0b appears in NEITHER cut line, which means the security control is unscheduled relative to the MVP.
- C2. M7b (vendor shadcn `card`/`skeleton`/`tooltip`) is correctly in the 1a cut and correctly placed before M8a. Good. Add to its DoD that `pnpm dlx shadcn@latest add ...` is run, not hand-vendored, and that the three files land in `src/renderer/components/ui/` matching the existing new-york style (the others are already there). One observable: `pnpm run test` still green plus the three import-smoke mounts.
- C3. Every DoD that touches heavily-tested shared code should carry "and the existing suite still passes." M1 (touches `types.ts` + `tab-manager.ts`) says it; propagate to M3 (touches `App.tsx`), M11a (touches `settings-store.ts`), and M0b (touches `logger.ts`). The repo has a real suite (24 test files) and a green-bar regression is the cheapest falsifiable DoD there is.
- C4. Open question 9 (PS7 vs PS5.1): round 1 (C3) recommended bumping the `pwsh`-if-present fallback into M10 rather than a Section 9 follow-up. The revision left it as a follow-up (line 223, 719). For a Mark-facing tool on a PS7 workspace this is a real day-one papercut (profile path and `&&` chaining differ), and the shell-id plumbing exists (`platform.ts:15`). Reaffirming: make it an M10 sub-decision (spawn `pwsh` if on PATH, else `powershell.exe`), not a deferred question. Small change, removes a known annoyance from the MVP.
- C5. Section 7 preamble correctly says "no commit/push without explicit user permission." Add the workspace corollary: each milestone's "one rollback point" is a `/cad:milestone` candidate (a tag-able save point) that the user green-lights; the rollback discipline does not require a pushed commit per milestone. This keeps the boringly-small contract honest under the AGENTS.md commit gate.

---

## D. What the revision got right (keep these)

- The MVP line is now drawn and it is the RIGHT cut: 1a proves the load-bearing seam (reader -> IPC -> render) with a board-order hero and the four states, dogfoodable before any ranking or action surface exists. This is the single biggest improvement over round 1.
- M0 (shared fixtures + `window.claudeTerminal` mock) as an explicit prerequisite milestone, plus the move to extracted pure helpers (`selectActiveView`, `computeTabCounts`, `nextActiveOnRemove`) tested without mounting App, fully resolves round-1 A1. This is the cleanest possible fix.
- M3b routes BOTH `onTabRemoved` null returns to Home (round-1 A2), and the cross-project-close test is named as the thing that catches the latent blank-screen bug. Verified against `App.tsx:373` and `:375`.
- The self-enforcing slot guard (`if (tab.type === 'home') return prev;` at the `onTabUpdate` appender) turns a six-call-site discipline into one defensive invariant. Verified the appender is exactly where the plan says (`:362`).
- M8a/M8b split (board-order MVP paint, then `rankItems` enrichment) is exactly the 1a/1b discipline applied at the component level, and it de-risks the ranking edge cases by giving them a consumer first.
- The DoD falsifiability pass landed: "no console errors" is gone, M4 is unit assertions against a committed golden fixture instead of a manual smoke run, M5 names the `sendToRenderer` spy assertion and the absent-from-forward-list assertion as the tested remote decision.
- Phase 2 (Section 8) correctly inherits the 1a/1b discipline and the same one-change/one-test/one-rollback structure, and the keybinding challenge for `Ctrl+Shift+K` is done properly against the real matcher arms.

---

## Summary of the path to 9/10

The direction and grounding are right and the revision closed most of round 1. To reach 9/10 on this lens, the work is now entirely in tightening Section 7:

1. Fix the milestone ordering and pull the logger-leak gate (M0b) INTO Phase 1a, sequenced before the MVP paint that exposes the data it protects (A1). This is the top item.
2. Reconcile the Phase 1b enumeration with the real milestone set (no Phase-1 M15; carrots are M12-M14; done-lane lives in M8b) (A2).
3. Scope the "N closed today" data source or cut the count from Phase 1 (A3).
4. Split M11 into store / branch / picker (A4), and make M9 and M13 DoDs falsifiable (A5).
5. Expand M0's fixture deliverable to the state-variant set M4 and M8a both consume (A6).
6. State the todo-cannot-be-a-free-text-query-hero scope decision and test it (B2), and limit Phase-1a Copy to inert strings (B3).
