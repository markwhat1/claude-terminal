# Advisor review: Product / PM lens

Plan reviewed: `docs/dashboard/PLAN.md` (dashboard worktree, HEAD `ce2e9e0`).
Lens: harden the Phase 1 / Phase 2 split, the MVP cut that ships value early, boringly-small milestones with DoD + rollback, and the vitest test plan.
Verdict: strong plan, well grounded in the R-docs and re-verified against the live checkout. Current score on this lens: about 7.5/10. The gaps below are what stand between it and 9/10. Most are precision and sequencing issues, not direction problems.

What I verified against source (not just against the R-docs):
- Branch/HEAD: `dashboard` / `ce2e9e0`. Confirmed.
- `types.ts`: `TabType` at :3 is `'claude' | 'shell'` (no `'home'` yet); `Tab` interface :7-21 has no `statusSince`/`lastActivityAt`; `PERMISSION_FLAGS.plan = ['--plan']` bug confirmed at :70-75. All match the plan.
- `tab-manager.ts` `updateStatus` :55-58 is a flat `tab.status = status` setter, no timestamp. Matches.
- `App.tsx`: state :27-29, `activeProjectTabs` :81-84 and `tabCounts` :87-102 both derive purely from `tabs`, `handleSelectTab` :113-121 calls `switchTab`, render map :577-583 (`tabs.map` -> `<Terminal>`), fallback spawns :341-344 and :524-527 read `allTabs` from `getTabs()`. All match.
- Test layout: `tests/{main,renderer,shared,integration,hooks}`, runner is `vitest run` exposed as `pnpm run test`. Matches.

The plan is honest and the architecture is right. My findings are about making it executable without a reviewer-loop catching surprises mid-build.

---

## A. Must-fix (these will bite during the build)

### A1. The renderer test strategy has no precedent for "mount App" and the plan leans on it twice

M2 says "a renderer test mounting `App`" and M3 says "a renderer test mounting `App` (or the extracted seam)." I checked: there is NO existing test in this repo that mounts the `App` component. `tests/integration/app.test.ts` is a `@vitest-environment node` test that drives `TabManager` directly, it never renders React. The three renderer tests (`ProjectSidebar`, `ProjectSwitcherDialog`, `TabIndicator`) all mount small presentational components that take plain props and never call `window.claudeTerminal`. `App.tsx` calls `window.claudeTerminal.*` across its effects (createTab, switchTab, getCurrentBranch, onTabUpdate, onTabRemoved, ...), so mounting it needs a full `window.claudeTerminal` mock that no fixture currently provides.

This breaks the "boringly small" contract: M2 and M3 each smuggle in "build a whole App-mounting test harness" as a hidden sub-task. Fix one of two ways, and state it in the plan:
- Preferred: extract the seam. Pull the Home-vs-Terminal branch and the select/close routing into a pure helper (for example `resolveRenderTarget(activeTab, homeTab)` and a `routeSelect(tabId, homeId)` / `routeLastClose(remaining, homeId)`), unit-test those in `tests/renderer/` or `tests/shared/` as pure functions, and keep `App.tsx` a thin caller. This is also better design (the routing logic becomes testable without a DOM). M3's DoD then asserts the helpers, not a mounted App.
- Or: add a shared `window.claudeTerminal` mock fixture as an explicit M0 (its own milestone, one change, one rollback) so M2/M3/M8/M9/M10 can all reuse it. Do not let the first milestone that needs it also build it.

Either way, M2 as written ("tests that assert the Home tab is kept out of `getTabs()`-derived counts" with "no code change") is testing a property of code that does not exist yet (there is no Home tab in M2). M2 is really "lock the invariant via a pure-function test on the count derivation," which only works if the count logic is reachable as a pure function. Today it is inline `useMemo` in `App.tsx`. Reconcile M2 with reality: either extract `computeTabCounts(tabs, projects)` and `filterActiveProjectTabs(tabs, activeProjectId)` into a tested helper in M2 (a real, tiny, valuable change), or fold M2's intent into M3's seam test. A "no code change" regression net that cannot import the thing it guards is not a milestone.

### A2. M3's last-tab-close routing misses a second null-return path

The plan (Section 2.3, Section 7 M3) routes the last-tab-close to Home at "the `App.tsx:373` null." Reading `onTabRemoved` (`App.tsx:366-381`), there are TWO null returns inside the `setActiveTabId` updater:
- `:373` `if (remaining.length === 0) return null;` (no tabs left at all)
- `:375` `return sameProject.length > 0 ? sameProject[0].id : null;` (other projects still have tabs, but the closing tab's own project is now empty)

The second path returns `null` while real tabs still exist in other projects. If the plan only patches `:373`, closing the last tab of project A while project B still has tabs lands the user on `null` (blank), not Home and not project B. Decide the intended behavior and encode it in M3's DoD with a test: most likely "route to Home whenever the result would be `null`" (cover both branches), or "fall through to the first remaining tab of any project, else Home." Add a test fixture for the cross-project close, not just the zero-tabs close. As written this is a latent blank-screen bug the M3 test would not catch.

### A3. The MVP cut inside Phase 1 is not drawn; M1-M11 is "all of Phase 1," not "value early"

The brief asks for an MVP cut that ships value early. Phase 1 is 11 milestones and the first user-visible value (a painted Home with real data) does not arrive until M8, after M1-M7 (types, guard tests, render seam, the reader, the IPC channel, two pure functions). That is a long runway with nothing on screen. Define an explicit "MVP / first demoable slice" line inside Phase 1 and call it Phase 1a:
- Phase 1a (ships value): M1, M3 (render seam with a static placeholder Home), M4, M5, M8 reading the program-board needs-you list with the hero = `rankItems[0]`. Even a trivial `rankItems` (Tier 4 only: hottest needs-you card first) makes M8 demoable. That is a Home that shows "here is the one thing" from real program-board data. Copy and PowerShell actions can be read-only/stubbed in 1a.
- Phase 1b (hardening + actions): M6 full ranking, M7 formatting, M9 strip, M10 the three live actions, M11 startup setting.

This reordering also de-risks: you prove the load-bearing data path (program-board reader -> IPC -> render) end-to-end early, before investing in the ranking and action surface. Right now M6 (`rankItems`) is built before M8 even has a consumer, so a ranking edge case found in M8 forces a revisit. Build the simplest ranking that makes M8 paint, then enrich. State the MVP line in Section 7's preamble so the build lane knows where "shippable value" sits, and so a reviewer can gate it there.

### A4. Several DoD lines are not falsifiable as written

"Boringly small with DoD" means each DoD is a checkable predicate, ideally the green test plus one observable. A few are soft:
- M4 DoD: "reader reads the real `state.json` in a manual smoke run and logs a parsed card count." A manual smoke run is not a rollback-safe DoD and is not reproducible in CI. Keep the smoke run as a nice-to-have, but make the DoD the unit assertions on `parseState` and `computeFreshness` against committed fixtures (a captured real `state.json` snapshot, PHI-free, checked into `tests/fixtures/`). The plan already says program-board data has no PHI; capture one real payload as a golden fixture so the parser is tested against the actual byte shape, not a hand-written mock.
- M5 DoD: "the broadcast fires." Specify how: assert `sendToRenderer` (mocked) is called with channel `program-board:state` when the reader emits. Name the assertion.
- M8/M9 DoD: "no console errors." That is not assertable without wiring a console spy; either add the spy assertion or drop the clause (it reads as aspirational). Replace with the specific fixture-to-rendered-state assertions you already list, which are good.
- M10 DoD: "copy writes to clipboard (mocked)." Good, keep. "the once-flag is idempotent" should name the test: "second `idle` event does not call `writeToPty` a second time."

### A5. M11 changes two settings sites plus a dialog plus a keybinding comment in one milestone

M11 bundles: a `StoreData`/`DEFAULTS` extension + getter/setter, branching TWO `setActiveTabId` sites in `App.tsx`, a new `SettingsDialog` picker UI, AND reserving `Ctrl+Shift+K` in `keybindings.ts`. That is four changes with four rollback surfaces. Split:
- M11a: settings store `startupView` key + getter/setter + the registration/round-trip test (pure main-process, real temp file, mirrors the existing `settings-store.test.ts` pattern exactly). One change, one test, one rollback.
- M11b: branch the two `setActiveTabId` sites on `startupView` + the renderer test. One change.
- M11c: the `SettingsDialog` picker (UI only, reads/writes the M11a setting). One change.
The `Ctrl+Shift+K` reservation is a comment-only no-op; fold it into M11c or make it a trivial standalone, but it should not ride inside the settings-store milestone where a revert of the store also reverts an unrelated keybinding comment.

---

## B. Should-fix (raises quality and reviewability)

### B1. Make the AGENTS.md "five-part IPC treatment" a literal DoD checklist on M5 (and M13)

AGENTS.md requires, for every new channel: main handler + preload + `global.d.ts` + registration-test assertion + explicit remote decision. M5 describes all five in prose but its DoD only says "registration test green; the channel is the only new one; remote stub documented." Turn the five parts into five DoD checkboxes so the reviewer can tick them and so nothing is silently skipped. Same for M13 in Phase 2. The plan also correctly notes `global.d.ts` updates automatically via `typeof api`; keep the explicit "type-presence check" test it proposes, because "it updates automatically" is exactly the kind of claim that rots silently.

### B2. The "only one new IPC channel in Phase 1" claim needs `program-board:state` counted honestly

Section 2.4 and the M5 DoD say "the channel is the only new one," but the design uses TWO message names: `program-board:getState` (invoke/handle) and `program-board:state` (broadcast). That is fine and intended, but "one channel" undersells it for the registration test and the remote decision. Both names need: the handle registered (getState), the broadcast listed in `sendToRenderer`'s forwarded set decision (state, explicitly NOT forwarded), the preload bridge methods for both, and the `ws-bridge` stub for both. Reword to "one new channel pair (request + broadcast)" and make the M5 test assert both names. As written, a reviewer checking "only one new channel" against the diff will see two strings and flag it.

### B3. Phase 2 remote-enabled todo channel is a real security expansion; gate it explicitly

Section 8.1 makes the todo channel remote-enabled "so the user captures from his phone," needing a handler in `WebRemoteServer.handleMessage()` and a real `ws-bridge` send. R5 is emphatic that adding remote handlers is "a deliberate security expansion; do not do it implicitly." The plan says this is deliberate, good, but it lives in a one-line aside in a "sketch" section. Promote it: M13's DoD must include (a) the explicit remote decision recorded in `docs/ipc.md`, (b) path/`..` validation on any todo field that could reach a file path (AGENTS.md Security: "Validate path parameters before `path.join()`"), and (c) confirmation that capture text written remotely is treated as untrusted (the same scrub posture as the Claude query if a todo ever feeds a `claudeQuery`). The plan already routes todos through the same `DashboardItem`/`rankItems`, so a Tier-5 todo could become a hero whose action is a `claudeQuery`; that closes the loop back to the PHI choke point and should be stated.

### B4. The PHI choke point is well specified; add it as a standing test invariant, not just an M10 test

Section 3.4 is strong (canned default, `scrubFreeText`, log action+repo only). To keep it from regressing, add a guard test that asserts `composeClaudeQuery` is the ONLY producer: a test that fails if anything other than the choke point can produce the string that reaches `writeToPty`. Practically, structure the code so the write path imports the composed string from one module, and add a test that the canned-template default output contains no interpolated free text for every `KnownActionId`. Also assert the negative: feed `scrubFreeText` a chart-number-like digit run, an email, and a `Bearer ...` token and assert each is redacted. The plan lists these as M10 cases; elevate "the choke point is the sole producer" to an explicit invariant so a future feature cannot add a second producer without a failing test.

### B5. The "one-line activity" in the session strip (M9) has an undefined source

Section 6.4 / M9 says each session row shows "one-line activity (last tool call / last non-empty line)." Where does that string come from? The renderer gets tab status via `onTabUpdate`, but "last tool call / last non-empty line" is terminal scrollback the renderer would have to scrape, or a new field on the hook payload. This is an unscoped data dependency hiding in a Phase 1 milestone. Either (a) cut it from Phase 1 and show only `[status] [name] [relative time]` (which is fully sourced from existing fields plus the new `statusSince`), or (b) make it its own milestone with a named source. Do not let M9's DoD ("strip is subordinate, no grid") pass while the activity string is hand-waved. Recommend cutting it from Phase 1; it is the kind of detail that turns a 1-day milestone into a 3-day one.

### B6. `formatRelative` depends on `statusSince` (M1) and is used by M8; M7 ordering is slightly off

M7 (`formatRelative` + age-color mapping) is sequenced after M6 but its output is consumed by M8 (hero card relative time) and M9 (strip relative time). That ordering is fine, but Section 1.2 ties `formatRelative` to "the new `statusSince`/`lastActivityAt` fields (Section 2.3)" which land in M1. Good, M1 precedes M7. Just make M7's DoD assert it handles BOTH inputs it will actually receive: epoch-ms (`statusSince`, a number) AND ISO-with-offset (`last_commit.iso`, `last_touched`). The plan's M7 test says "epochMsOrIso"; confirm the ISO-offset case is in the test surface, because Section 9.2 is explicit that these two time formats must never share a parse path. One test for the number input, one for the offset-bearing ISO, one for the naive-local case (which should NOT go through `formatRelative` at all, it goes through `computeFreshness` in M4). Spell out which function owns which time string so the boundary is testable.

---

## C. Nits / polish (cheap, worth doing)

- C1. Section 7 preamble says "No commit or push without explicit user permission (AGENTS.md)." Good and correct. Add the corollary the workspace cares about: each milestone is a `/cad:milestone` candidate (commit as a rollback point) only when the user green-lights, so the "one rollback point" per milestone is a tag-able save point, not necessarily a pushed commit. This keeps the milestone discipline honest without violating the commit gate.
- C2. The `pnpm run test` DoD is correct, but the repo runs `vitest run` with 40 tests today (AGENTS.md says 40). Add "and the existing N tests still pass" to each DoD that touches shared code (M1 touches `types.ts` and `tab-manager.ts`, both heavily tested). M1 already says this; propagate it to M3 (touches `App.tsx`) and M11 (touches `settings-store.ts`).
- C3. Section 10.2 open question 9 (PS7 vs PS5.1): the Open-PowerShell action spawns `powershell.exe` (5.1) but the workspace convention is PS7 (`pwsh`). This is flagged as a follow-up, which is fine for scope, but for a Mark-facing tool the 5.1-vs-7 gap is more than cosmetic (profile path differs, `&&` chaining differs). Recommend bumping it from "Section 9 follow-up" to an M10 sub-decision: spawn `pwsh` if present on PATH, else fall back to `powershell.exe`. The shell-id plumbing already exists (`platform.ts:15`); this is small and removes a known papercut on day one rather than filing it.
- C4. Section 9.1 (the `--plan` bug): the plan correctly scopes it out and files an issue. Good. One addition: the dashboard's default permission mode is `bypassPermissions` (confirmed `settings-store.ts` `DEFAULTS.permissionMode = 'bypassPermissions'`), so the common path is safe, but if a user has set `plan` mode the write-after-ready injection silently never fires (tab never reaches `idle`). The 30s timeout (Section 3.1 step 7) is the right catch; make sure M10's test covers "tab never idles -> timeout surfaces the failure," not just the happy path. That converts a silent dependency on an unfixed bug into an observable failure.
- C5. Minor authority note: R5 flags `App.tsx` Terminal render entry at `:578-581` and calls the prior `:577-583` a wrong-revision artifact. I confirmed against the live checkout: the `tabs.map` block is `:577-583`, the inner `<Terminal>` element is `:578-581`. Both citations describe the same code at different granularity, so there is no real conflict, but the plan should add a one-line note that `:577-583` is the map block (matching R5's `:578-581` element) to pre-empt a reviewer thinking the plan ignored R5's correction.

---

## D. What the plan gets right (keep these)

- The "store the synthetic Home tab in a separate renderer slot, not in `tabs`" decision is verified correct: both `activeProjectTabs` and `tabCounts` derive purely from `tabs`, so Home stays out of every count for free. This is the cleanest possible fix and it is well argued.
- Home as renderer-only synthetic tab (never in `TabManager`, never over the wire) is the right call and neutralizes the `ipc-handlers.ts:105` activation hazard and the remote phantom-tab risk.
- The program-board consumption design (watch the directory not the file, debounce + retry + poll + HTTP fallback, naive-local `generated_at` parse, verbatim `age_color`) is faithful to R4 and the Windows `os.replace` hazard is correctly handled. The three distinct empty states are a genuinely good ADHD-aware touch.
- write-after-ready as the primary injection with positional spawn gated behind a node-pty spike is the right risk posture and correctly honors R3 over the stale synthesis.
- The PHI choke point (canned default + single producer + log action/repo only) is the right shape and matches R6 item 1 and the workspace PHI rule.
- Remote parity is decided per action with explicit disabled state for PowerShell, matching R5 and AGENTS.md. The "keep the bridge stub throwing" instruction is exactly right.

---

## Summary of the path to 9/10

The direction is right and the grounding is real. To reach 9/10 on this lens:
1. Fix the test strategy (A1): extract testable seams or build a shared `window.claudeTerminal` mock as M0; stop asserting "mount App" with no precedent.
2. Fix the M3 second null path (A2): cross-project last-close must not blank-screen.
3. Draw the MVP line inside Phase 1 (A3): Phase 1a = M1+M3+M4+M5+M8 with a trivial ranking, demoable early; Phase 1b enriches.
4. Make every DoD falsifiable (A4) and split M11 (A5).
5. Turn the AGENTS.md five-part IPC treatment into literal DoD checkboxes (B1), count the channel pair honestly (B2), and pin the session-strip "activity" data source or cut it (B5).
