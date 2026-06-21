# Round-6 Advisor Review: Electron/React Architect lens

Reviewer role: ADVISOR (improve the plan, do not implement).
Plan under review: `docs/dashboard/PLAN.md` (round 6) + `PLAN-PHASE-2-3.md` + `PHASE-GATE.md`.
Build target verified: worktree `infrastructure/claude-terminal-dashboard`, branch `dashboard`, HEAD `ce2e9e0` (confirmed live).
Recon authority: round-2 R1-R6 (read in full).

## Verdict

This is a strong plan, roughly 8/10 on the architect lens. The integration map is worktree-accurate where I spot-checked it, the renderer-only-Home decision is correct and the consequences are traced honestly, the IPC discipline is real (exported channel constants + send-fires-callback tests + the `REMOTE_FORWARDED_CHANNELS` absence gate are exactly right), and the security posture around the free-text-to-PTH/log/clipboard sinks is unusually disciplined (branded `ClaudeQueryLine`/`InertDisplayString` types as compile-time choke points is the correct pattern).

What keeps it from 9/10 is one load-bearing factual error about the keybindings architecture that flows into M3a-iii's whole implementation shape, plus a handful of reuse and seam-precision gaps that a builder will hit mid-milestone. The findings below are ordered by impact.

---

## MUST FIX (load-bearing, blocks a clean build)

### MF-1. The keybindings hardening (M3a-iii / 2.2 / R6 item 4) targets the wrong code shape

The plan and R6 both describe `keybindings.ts` as a set of line-cited global chords to "short-circuit": `cycleTab` at `:40`, `Ctrl+\`` at `:58`, `Ctrl+F4` at `:59`, and instruct M3a-iii to "short-circuit each global chord when `activeTabId === HOME_TAB_ID`."

Verified against HEAD `ce2e9e0`, this mischaracterizes the architecture:

- `keybindings.ts` is a DECLARATIVE registry: `export const keybindings: Keybinding[]`, where each entry is `{ mod, key, action: (ctx: KeybindingContext) => void }`. There are no per-chord line-number seams to edit; the handlers are closures over a `KeybindingContext` interface (`activeTabId()`, `tabs()`, `selectTab()`, `closeTab()`, `newDefaultShellTab()`, etc.).
- `App.tsx` is the sole place that builds the `KeybindingContext` and dispatches `kb.action(ctx)`. That is the real, single hardening surface, not edits inside `keybindings.ts`.
- Two of the three "crash" claims are already false today. `Ctrl+F4` is `(ctx) => { const id = ctx.activeTabId(); if (id) ctx.closeTab(id); }` (already null-guarded). `Ctrl+\`` is `ctx.newDefaultShellTab(ctx.activeTabId() ?? undefined)` (already `?? undefined`, so `HOME_TAB_ID` would be PASSED as `afterTabId`, not crash; the bug is a wrong insertion position, not a deref). Only `cycleTab` genuinely misbehaves: `findIndex(t => t.id === ctx.activeTabId())` returns `-1`, and `(-1 + 1 + len) % len` lands on index 0, so Ctrl+Tab silently jumps to the first real tab (the plan's description of this one is correct).

Why this matters for the architect lens: the cleanest fix is NOT to scatter `if (activeTabId === HOME_TAB_ID)` checks across the registry. It is to harden ONCE at the `KeybindingContext` provider in `App.tsx`:
- `cycleTab`: when `activeTabId()` is the Home sentinel, `findIndex` returns `-1`; decide deliberately that Ctrl+Tab enters the real tabs at index 0 (the plan's stated intent) and add a comment, or special-case `-1 -> 0` explicitly so it is not an accident.
- The shell/close closures already tolerate the Home sentinel; the only real edit is ensuring `newDefaultShellTab` is called with `undefined` (not the Home id) when Home is active, which is a one-line guard in the `App.tsx` closure, not a `keybindings.ts:58` edit.

Concrete change to the plan: rewrite 2.2's "Home-active global chords" bullet, the 2.10 row, and M3a-iii to (a) cite the registry architecture (`KeybindingContext` in `App.tsx`, not `keybindings.ts:40/:58/:59`), (b) drop the two false crash claims and keep only the `cycleTab` `-1 -> 0` case as a real behavior bug, and (c) make M3a-iii's test target the `KeybindingContext` closures (assert `cycleTab` with Home active behaves as decided, and `newDefaultShellTab` receives `undefined`), since there is no per-line seam to unit-test. This also retires the "the `window:setTitle` title-setter tolerates no match (never `undefined.name`)" sub-claim, which needs re-grounding: there is no `window:setTitle` in `keybindings.ts`; the title is computed elsewhere and the plan should cite the real site or drop it.

### MF-2. `generateId` reuse is understated and mis-scoped (Section 8 / DRY)

The plan defers `generateId` to Section 8 / Phase 2 ("Id minting uses a SHARED exported `generateId(prefix)` from `src/shared/`, ... the round-3 citation of the module-private `tab-manager.ts:4-6` pattern is corrected there"). Verified live: `generateId` is duplicated TWICE already (`tab-manager.ts:4` and `components/HookManagerDialog.tsx:18`), neither exported, neither takes a prefix.

For the architect lens (maximize reuse), this is a Phase-0/1 concern, not a Phase-2 footnote:
- The `DashboardItem.id` is "source-prefixed" (`pb:...`, `tab:...`, `todo:...`) per 4.1, so the prefix-accepting shared `generateId(prefix)` is needed the moment the mapper exists (M4/M8a), not when capture lands.
- Recommend: pull the shared `generateId` extraction into Section 2.7's shared-logic list and into M7 (the pure-helpers milestone), with the existing two duplicates refactored to import it. One collision test. This removes a third future copy rather than sanctioning a Phase-2 cleanup of two existing copies plus a new one.

### MF-3. The `explicitCwd` `tab:create` change needs the full AGENTS.md channel treatment called out, not just "add a param"

M10 step (2) and the 2.10 row say `explicitCwd` is "ADDED to `tab:create` mirroring `tab:createShell`." Correct mechanically. But `tab:create` is a registered IPC channel with a preload signature (`createTab(projectId, worktree?, resumeSessionId?, savedName?)` at `preload.ts:30`) and a `global.d.ts` type. Adding a parameter is a CHANGED channel contract, which AGENTS.md's "Remote / Local Parity" rule covers: the remote `tab:create` handler (`web-remote-server.ts:316`) and the `ws-bridge.ts` send (`:249-254`) both build the message and currently discard projectId/worktree. The plan handles the remote DISABLE decision for the dashboard action (good, 3.1/2.11), but M10's change-list and DoD should explicitly state that the `explicitCwd` param addition updates: preload signature + `global.d.ts` + the registration test's signature expectation (if any) + an explicit note that the remote `tab:create` message shape is INTENTIONALLY not extended (so a future remote Home does not silently inherit a half-threaded param). Right now the param addition reads as a local-only edit; name it as a channel-contract change so the reviewer checks the four-plus-remote surfaces, per AGENTS.md.

---

## TOP IMPROVEMENTS (toward 9/10)

### TI-1. The render seam's "sibling after `tabs.map`" is correct but the `selectActiveView` helper signature leaks a layout assumption

2.2 / M3a-ii specify `selectActiveView(activeTabId, homeId, tabs)` returning `'home'` or a real tab id, unit-tested without mounting App. Good. But the seam is `{activeTabId === HOME_TAB_ID && <HomeView/>}` placed as a SIBLING of `{tabs.map(...)}`, both inside `data-terminal-area`. The pure helper tests the decision but NOT the placement; a builder can pass `selectActiveView` tests and still nest `<HomeView/>` inside the map (the exact mistake 2.2 warns about). The plan's mitigation is the App-mount smoke test asserting "Home mounts `HomeView` and instantiates no `Terminal`." That catches a Terminal-instantiation regression but NOT a HomeView-rendered-inside-the-map layout bug (HomeView could render once per tab if mis-placed and the smoke test, which likely uses a one-tab fixture, stays green). Recommend M3a-ii's smoke test use a MULTI-tab fixture with Home active and assert exactly ONE `HomeView` instance renders (and zero `Terminal` instances). One word in the test fixture, closes the real seam.

### TI-2. The `HomeView` props-only contract has no Phase-1 enforcement, only a Phase-3 promise

2.6 mechanically enforces "zero `window.claudeTerminal` references in HomeView" via a lint/build guard, but defers that guard to "the Phase-3 remote-Home milestone." So for all of Phase 0/1/2, the props-only invariant is convention, and a convenience `window.claudeTerminal.getTabs()` inside HomeView would ship green and only break when remote-Home mounts it two phases later (the exact silent-rot the plan elsewhere refuses). For the reuse lens this is the single most important compile-checkable invariant in the plan. Recommend pulling the guard (an ESLint `no-restricted-globals`/`no-restricted-properties` rule scoped to `HomeView.tsx` and its imports, or a one-line grep test in the suite) into M8a, where HomeView is born. It costs one test and makes the props-only contract real from day one rather than aspirational.

### TI-3. `@shared/*` web-client bundle check is asserted for M6/M7 but the Phase-1 shared modules land in M4

2.7 and M7's DoD assert `@shared/*` imports "resolve under the web-client vite config, not only vitest." Good catch. But the FIRST shared modules ship in M4 (`parseState`, `parseNaiveLocal`, `parseOffsetAware`, `isStateJsonPathSafe`, the mapper) and M4 is on the Phase-0 critical path before M7. If the web-client vite alias for `@shared/*` is missing, M4's modules fail to bundle for the web client and the failure surfaces at M7, far from the cause. Recommend adding the "`@shared/*` resolves under the web-client vite config" assertion to M4's DoD too (or, cleaner, a single one-time alias-presence smoke test as part of M0 that all later shared-logic milestones inherit). The plan already values "a pure function can pass vitest yet fail to bundle"; apply it at the first shared module, not the third.

### TI-4. The `sendToRenderer` -> `REMOTE_FORWARDED_CHANNELS` refactor is correct but the live blast radius deserves one more test

M5's refactor of the inline if/else-if forward chain (`index.ts:80-98`) into an exported constant is the right call and the full-set-present + absence + end-to-end-survival tests are excellent. One gap: the inline chain at `:95-97` INTENTIONALLY does NOT forward the project-management channels (`project:added` etc.). The refactor to a data-driven constant could accidentally make the forwarding logic "forward everything in the set, drop everything else" in a way that changes behavior for a channel that was dropped by ABSENCE from the if-chain rather than by an explicit branch. The full-set assertion proves the six wanted channels are present; add a companion assertion that a known intentionally-unforwarded channel (e.g. `project:added`) is NOT in `REMOTE_FORWARDED_CHANNELS` and does NOT reach the remote forward path through the refactored `sendToRenderer`. This pins the "intentionally not forwarded" contract (`index.ts:95-97`) that the refactor could silently break, symmetric to the `program-board:state` absence gate.

### TI-5. Two named timezone parsers is right; add the cross-use compile guard the plan implies but does not specify

2.8 chooses `parseNaiveLocal` + `parseOffsetAware` over one flagged function, "so the name and the compiler then prevent misuse." But both return `Date` (or epoch ms) and take `string`, so the compiler does NOT actually prevent passing `last_commit.iso` to `parseNaiveLocal`; only the name discourages it. If the plan wants the compiler to enforce it (as 2.8 claims), the cheap move is branded input or output types: `parseNaiveLocal(s: NaiveLocalString)` vs `parseOffsetAware(s: OffsetAwareString)`, where the mapper tags `generated_at` as `NaiveLocalString` at the single point it is read from the parsed state. That is heavier than warranted for two callers; the lighter honest fix is to soften 2.8's claim from "the compiler prevents misuse" to "the names plus a lint/review convention prevent misuse," OR commit to the branded-string approach. Right now the plan over-claims compiler enforcement it does not specify. (Contrast: `ClaudeQueryLine`/`InertDisplayString` ARE genuinely compiler-enforced because the SINK accepts only the brand. The timezone parsers have no such asymmetric sink.)

### TI-6. M10's MAIN-side injection ownership: name the module that owns the pending Map, do not leave it as "extend HookRouterDeps OR relocate to index.ts"

3.1 step 4 and the 2.10 rows offer a fork: "give MAIN injection write access to `ptyManager.write` (extend `HookRouterDeps` or relocate the write to `index.ts`)." For a boringly-small milestone with one rollback point, an unresolved either/or at the most coupled seam invites two builders to choose differently and invites a half-applied M10. The architect call: the injection state machine (pending Map + once-flag + 30s timer + the idle-convergence gate) is NOT hook-routing; folding it into `HookRouterDeps` widens the router's contract and its test surface for a concern that is not routing. Recommend the plan COMMIT to a small dedicated owner (e.g. a `QueryInjector` in `src/main/` that the hook-router's idle-emission calls via a single injected callback, mirroring how `notifyTabActivity` is a single emit site), with `ptyManager.write` injected into it. That keeps the hook-router change to "call one callback on idle" (testable in isolation) and isolates the injector's own test surface. Pick the owner in the plan; do not ship the fork.

### TI-7. The `claude:injectQuery` handler returning the tab id is correct; make the no-tab-created failure mode explicit

3.1 step 3 resolves the round-5 "same tick" defect well: the MAIN handler creates the tab, arms pending + timeout, returns the id, renderer awaits once. But what does the handler return / how does the renderer behave if `tab:create` itself throws inside the handler (the `if (!workDir) throw 'Session not started'` guard at `ipc-handlers.ts:365`, or `project:add` side effects, or an `explicitCwd` that does not exist)? The plan declares the no-workDir path "unreachable in Phase 1" (defensible under R-10 Option A), but `explicitCwd` pointing at a non-existent dir is reachable (3.1 already routes that to Copy-only via `resolveProgramProject` returning `null` BEFORE the handler is called, good) yet a dir that resolves but fails at spawn is not covered. Recommend M10's test matrix add: the `claude:injectQuery` handler, when `tab:create` rejects, REJECTS the renderer promise (does not arm a dangling timer for a tab that does not exist), and the renderer surfaces the same "failed to start" affordance. One assertion; closes the only un-traced branch of the handler.

### TI-8. `text-attention-foreground` AA fix (M7b) is excellent; verify it does not regress an EXISTING attention consumer

M7b registers `--attention-foreground` as dark `#1e1e1e` to fix the hero button's ~2.7:1 white-on-`#ce9178`. Correct. But grep the existing tree: is `--attention` (or `bg-attention`) ALREADY used anywhere as a background with assumed-white foreground today (StatusBar "Input" pill, TabIndicator `requires_response`)? R2 cites StatusBar `text-attention` (a foreground color on the default bg, unaffected) but if any existing surface uses `bg-attention` with implicit white text, registering a dark `--attention-foreground` and switching those to `text-attention-foreground` would flip them to dark-on-warm. The plan should add one line to M7b: confirm the new `--attention-foreground` token is consumed ONLY by the hero button (the new code), and existing `text-attention` foreground uses are untouched, so the AA fix has zero blast radius on shipped chrome. (Likely true, but it is a token-level global change and the plan's own rigor standard wants it asserted.)

### TI-9. Minor: the plan cites `App.tsx:577-583` render map but R5 corrected it to `:578-581`

R5 §"Citation corrections" explicitly flags "App.tsx Terminal render entry is at `:578-581`, prior A doc said `:577-583`." The PLAN's 2.2 and 2.10 still use `:577-583` (and the appendix reconciles it as container `:576`, map `:577`, Terminal `:578-582`, close `:583`). This is a near-tie reconciliation, not wrong, but since R5 is cited authority and made an explicit correction, either adopt R5's `:578-581` for the Terminal element or add a one-line note that the plan's `:578-582` reconciliation supersedes R5's `:578-581` after a re-read (the plan does re-read in the appendix, so just cross-reference it). Low stakes; flagged because the plan's whole credibility rests on citation precision and this is one place a cited R-doc and the plan disagree silently.

---

## What the plan gets right (so revisions do not regress it)

- Renderer-only Home, never in `TabManager`, with the `tabs:sync` phantom-tab hazard correctly avoided (2.1) and the separate-slot decision making every `tabs`-derived count Home-free without a six-site audit (2.3). This is the correct architecture.
- The exported-channel-constant + send-fires-callback pattern for BOTH new channel pairs, and the `REMOTE_FORWARDED_CHANNELS` absence gate as a hard DoD because the payload is a clinical/financial digest (2.4, M5). Exactly right for AGENTS.md remote-decision discipline.
- The branded `ClaudeQueryLine` / `InertDisplayString` types as asymmetric-sink compile-time choke points (3.4, 3.6, 3.3). This is the genuinely compiler-enforced invariant and it is applied to both PTY-write and clipboard sinks.
- The idle-gate convergence-point correction (gate at the `tab:updated` emission / both `updateStatus(...,'idle')` sites, because the FIRST idle arrives via `tab:ready` SessionStart, not `tab:status:idle`) is a real, verified bug fix over round 5 and the "test MUST drive a real `tab:ready`" clause prevents the green-while-broken case (3.1 step 4, M10).
- Moving the pending-injection intent + timeout into MAIN so a renderer reload cannot orphan the query (3.1, 1.5b), with the arm-before-resolve testable property replacing the unbuildable "same tick" slogan. Correct ownership call.
- The `waitingSince` clock separated from the display `statusSince`, with null-init in the `createTab` LITERAL (verified the literal at `tab-manager.ts:22` indeed omits these fields today, so the `undefined !== null` warning is real) and the M1 test asserting against a tab FROM `createTab`, not a hand-built object. This is the kind of seam most plans miss.
- The poll-primary / watcher-deferred inversion of R4 §(c), flagged as a deliberate departure (2.11) with the correct reason (the deaf-handle failure is undetectable, so watch-first lags silently). Honest override of cited authority.
- The logger-leak-into-git-trees fix sequenced as a HARD pre-paint gate (M0b before M8a), with the redaction (not the DevTools-mirror gate) correctly identified as the actual PHI control, and `.claude/settings.local.json` added to the global excludesfile because the hero action's `installer.install(cwd)` is unconditional AND required. The "install is required, artifact is git-ignored" resolution is correct.

## Net

Fix MF-1 (the keybindings architecture is the one place a builder will write the wrong code from the plan), tighten MF-2/MF-3 (reuse + channel-contract framing), and apply the TI items (most are one-assertion or one-sentence tightenings of seams the plan already half-covers). With those, this reaches 9/10 on the architect lens: worktree-accurate, reuse-maximizing, Home renderer-only, AGENTS.md-compliant, and remote-safe by explicit per-action decision.
