# Round 5 Advisor Review: Electron/React Architect Lens

Target: `docs/dashboard/PLAN.md` (round 5 revision, build target `dashboard` worktree at HEAD `ce2e9e0`).
Reviewer lens: Electron/React architect. Focus: integration fidelity against the R1/R3/R4/R5 corrected citations, reuse, renderer-only Home, AGENTS.md IPC discipline, remote-safe Tab additions, boringly-small milestones.

## Verdict

This is the strongest revision I have seen in this cycle. The integration map is worktree-accurate, the renderer-only Home decision is locked and self-enforced, the write-after-ready mechanism matches R3 exactly, and the PHI choke point is compiler-enforced. I spot-verified the load-bearing code claims against the actual checkout and they hold:

- `HookRouterDeps` (`hook-router.ts:6-16`) does NOT import `ptyManager`. M10's deps-extension is real and necessary, exactly as the plan states.
- `tab:create` resolves cwd only from `project?.dir ?? state.workspaceDir` (`ipc-handlers.ts:363-364`), with no arbitrary-cwd param. The `explicitCwd` addition is load-bearing, exactly as the plan states.
- `installer.install(cwd)` fires unconditionally inside the `tab:create` body (`ipc-handlers.ts:385-388`). This confirms the plan's claim that the find-or-add route would install hooks into the target repo, and it surfaces a gap in the `explicitCwd` route (see Must-fix 1).

Current grade against the architect metrics: about 8/10. Five concrete gaps keep it from 9. None are structural; all are small, specific, and fixable in the plan text before any code lands.

---

## Must-fix (blocks 9/10)

### 1. The `explicitCwd` route still triggers `installer.install(cwd)` into the hero's repo. The plan claims it does NOT.

The plan's whole justification for choosing the `explicitCwd` param over the find-or-add route is that find-or-add has "heavy side effects (`log.init`, `hookInstaller.install`, `setupGitHeadWatcher`, `addRecentDir`, and a `project:added` sidebar broadcast)" (3.1, and the integration table at 2.10: "spawn in `repos[0]` WITHOUT `project:add` (no sidebar project / hook install)").

But `explicitCwd` flows through the SAME `tab:create` handler body, and that body installs hooks unconditionally at `ipc-handlers.ts:385-388`:

```ts
const installer = project?.hookInstaller ?? state.hookInstaller;
if (installer) {
  installer.install(cwd);
}
```

With `explicitCwd` and no registered project, `project` is null, so `installer` falls back to `state.hookInstaller` and installs `.claude/settings.local.json` hooks INTO the hero's repo at `explicitCwd`. The `explicitCwd` route avoids the sidebar project and `project:added` broadcast, but NOT the hook install. The plan's "no hook install into the repo" claim is false as written, and write-after-ready actually DEPENDS on hooks being installed at that cwd (R3 residual risk: no hooks means no `tab:ready`, so the idle gate never fires and the injection silently waits out the 30s timeout). So the plan must NOT skip the install; it must STATE that `explicitCwd` deliberately installs hooks at the hero repo (which is correct and required), and drop "no hook install" from 3.1 and 2.10. This is the difference between a buildable M10 and one whose injection path never fires on a repo the user has not opened before. Decide it now: either (a) `explicitCwd` reuses the shared install (correct, required for write-after-ready, harmless since it is the same `.claude-terminal/`-style local hook the app installs everywhere), and the prose is corrected; or (b) M10 adds an explicit `skipHookInstall` guard, in which case write-after-ready cannot work and the action must fall back to Copy-only. Option (a) is right. Fix the prose so a builder does not "honor" the false no-install claim and break injection.

### 2. The `isRemote` thread for staged disabled states is dead code in Phase 1, and the plan ships it anyway against its own YAGNI rule.

M10 ships "PowerShell and Open-Claude render their staged disabled states for a future remote Home behind an `isRemote` branch that is false in Phase 1" plus a test that "the staged disabled-state branch shows reason text when `isRemote` is forced true". But 2.9 decides Home is desktop-only in Phase 1, `web-client/main.tsx` never imports `HomeView`, and "HomeView carries no `isRemote` prop in Phase 1 (the prop only mattered for a remote Home that does not exist)". These two statements contradict each other: 2.9 says no `isRemote` prop in Phase 1, M10 ships an `isRemote` branch and a test that forces it true.

This is the exact dead-code-shipped-ahead-of-its-consumer pattern the plan rejects for M0c (`scrubFreeText`), the per-day pinned slot (M3b -> M6), and capture. Apply the same discipline: CUT the `isRemote` branch and its test from M10. Phase 1 Home is desktop-only, so the disabled states have no surface to render on. The remote-Home milestone in Phase 3 (2.9) owns the `isRemote` prop, the disabled states, and their tests, beside its only consumer. R5 §B's "render a disabled state with a reason" is a remote-Home requirement, not a Phase-1 one. Keeping it in M10 ships a tested branch no Phase-1 user path reaches.

### 3. M3a is not a boringly-small milestone. It bundles eight distinct renderer changes under "one change."

M3a's change list: add `'home'` to `TabType`; add the synthetic Home state slot; add the sibling render seam; extract `selectActiveView`; add the `onTabUpdate` self-enforcing guard; short-circuit `handleSelectTab`; harden the `StatusBar` active-tab lookup; harden the `window:setTitle` title-setter. That is eight edits across `types.ts` and `App.tsx`, with five test assertions. The hard constraint is "one change, one expected test, one rollback point." M3a violates it as plainly as the plan accuses round 4 of violating sequencing.

These do not all need to land together. A minimal split that keeps each rollback point real:

- M3a-i: `TabType` `'home'` + the synthetic Home slot + the self-enforcing `onTabUpdate` guard (`if (tab.type === 'home') return prev;`). Test: the guard drops a `type:'home'` tab; the slot is never in `tabs`. This is the type-and-state foundation, independently revertible.
- M3a-ii: the render seam via `selectActiveView` + the `handleSelectTab` short-circuit + the App-mount smoke test. Test: `selectActiveView` routing + Home mounts `HomeView` not `Terminal`.
- M3a-iii: the consumer hardening (`StatusBar` lookup, `window:setTitle`) + the no-crash assertion. Test: rendering with `activeTabId === HOME_TAB_ID` and a non-empty `tabs` array does not throw.

Each is one coherent change with one rollback point. The current M3a is a phase disguised as a milestone, and a half-applied M3a (seam added, consumer-hardening not) ships a renderer that crashes on the default landing surface, which is the exact failure 2.2 H-4 exists to prevent. Splitting makes the rollback point honest.

### 4. The plan presents itself as following R4 on consumption, but it inverts R4's stated PRIMARY mechanism without saying so.

R4 §(c) is explicit: "**Primary: watch the DIRECTORY, not the file**" with "Poll as a safety net (events are best-effort)." The recommended precedence is "file-watch primary ... HTTP fallback for first-run/cold-file." The plan (4.3, M4, R-2) makes the ~20s POLL the primary and only Phase-1 mechanism and defers the watcher entirely.

I think the plan's inversion is CORRECT (the 60s producer cadence makes a 20s poll sufficient, and the deaf-handle Windows failure is genuinely undetectable, so a watcher buys latency at the cost of a false robustness claim). But the plan's authority order says "round-2 R-docs win on every conflict" and lists only three honored corrections to synthesis, none of which is "we overrode R4's primary mechanism." A builder reading R4 as authority and the plan as faithful will be confused when M4's change list says "no watcher." Add a fourth honored-correction bullet (or a line in 4.3) stating plainly: "This plan deliberately departs from R4's stated primary (directory-watch-first) and makes the poll primary, because R4's own deaf-handle finding makes the watcher's dominant failure undetectable, so correctness must rest on the poll regardless; the watcher is demoted to a deferred latency option." Name the departure so the plan is not silently contradicting the doc it cites as governing. This is a one-sentence honesty fix, not a design change.

### 5. The Open-Claude remote-parity verdict contradicts R5's verdict, and the plan cites R5 as authority without flagging the override.

R5 §D's verdict for Open-Claude-with-query is "**works-remotely, BUT requires a new remote-aware mechanism (no NEW channel needed)**" and its summary table marks it "works-remotely ... normal enabled action." The plan (3.1, 3.5) marks it "LOCAL-ONLY + explicit disabled state" because the remote `tab:create` handler discards the resolved cwd (`web-remote-server.ts:316-323`).

The plan is RIGHT and R5 missed the cwd-discard (R5 §D assumed `tab:create` carries the project, but `ws-bridge.ts:249-254` sends a bare `{type:'tab:create'}` and the server hardcodes `state.workspaceDir`). This is a real correction of R5. But the plan's authority order says the R-docs win on conflict, and here the plan overrides R5 §D without saying "this corrects R5." A reader reconciling the two sees the plan disagreeing with its own stated authority. Add an explicit "Correction of R5 §D" note in 3.1 (parallel to how R3 opens with "Correction of the prior recon"): R5 §D's "works-remotely" verdict is overridden because R5 did not trace the cwd-discard in the remote `tab:create` path; with the discard, the remote variant would run the canned query against `state.workspaceDir`, not the hero's tree, so it is disabled until projectId is threaded. One paragraph, and the plan stops contradicting its cited authority silently.

---

## Top improvements (raise toward 9, not strictly blocking)

### A. M5's `REMOTE_FORWARDED_CHANNELS` refactor touches the live remote contract; gate it harder than the plan already does.

The plan converts the inline if/else-if forward chain (`index.ts:80-98`) into an exported constant and asserts the full set is present plus `program-board:state` is absent. Good. One more guard worth naming: the refactor changes a hot path that forwards `pty:data` (every keystroke of output to every remote client). A subtle bug (forwarding via the constant but losing the per-channel argument shape, or a `.includes` that matches a channel prefix) would not be caught by a membership test. Add to M5's DoD that the send-fires-callback test also asserts a forwarded channel (e.g. `tab:updated`) STILL reaches the renderer through the refactored `sendToRenderer`, not only that the new channel does not. The plan tests the new channel's wiring and the set's membership; it should also prove an EXISTING forwarded channel survives the refactor end to end, since that is the actual regression surface.

### B. The shared-logic reuse story is strong, but `HomeView.tsx` living in `src/renderer/components/` while every other shared piece is in `src/shared/` creates a remote-Home trap the plan half-addresses.

2.7 puts pure logic in `src/shared/` and `HomeView.tsx` in `src/renderer/components/`, noting it is imported by both shells if ever mounted remotely (2.9 Phase 3). But `web-client/main.tsx` imports `../renderer/components/*` already (R5 §A), so the import path works; the trap is that `HomeView` must never reach for `window.claudeTerminal` directly (2.6 says so) AND must never import a renderer-only module that does. Add a concrete guard to the remote-Home milestone (2.9 Phase 3): a build-time assertion or lint rule that `HomeView.tsx` and its imports contain zero `window.claudeTerminal` references, so the "pure presentational, props-only" contract is enforced by tooling, not by reviewer vigilance. The plan states the contract; it does not make it mechanically checkable, and a future contributor adding a convenience `window.claudeTerminal.getTabs()` call inside HomeView would silently break remote-Home the moment Phase 3 mounts it. This mirrors the plan's own preference for compiler-enforced invariants (the `ClaudeQueryLine` brand).

### C. M1's web-client spread-check should assert build-time type compatibility, which the plan says elsewhere but does not put in M1's test.

2.2 correctly identifies that the real remote-safety property for the four new Tab fields is "BUILD-TIME type compatibility, not a runtime spread tolerating unknown fields," and says M1's web-client check asserts the shared `Tab` change still type-compiles against `web-client/main.tsx` and `ws-bridge.ts`. But M1's actual Test bullet (line 750) says only "A web-client spread-check covering all four fields," which reads as a runtime spread test, the exact thing 2.2 says is the wrong property. Align M1's test bullet with 2.2: the M1 web-client check is a `tsc` type-compile assertion (the shared `Tab` with four new fields compiles against `web-client/main.tsx` typed as `Tab[]` and `ws-bridge.ts`'s `tab:updated`/`tabs:sync` types), plus a `groupTabsByProject`/render check that nothing assumes a `closed` field. Make the test bullet match the architecture text so a builder writes the type-compile assertion, not a runtime spread.

### D. The Home entry affordance (M8a) needs its keybinding challenged in the plan, per AGENTS.md, not deferred to "or a keybinding, challenged per AGENTS.md."

M8a ships "a 'Home' item in the tab strip/sidebar that calls `handleSelectTab(HOME_TAB_ID)` (or a keybinding, challenged per AGENTS.md)." AGENTS.md requires challenging every keybinding BEFORE implementing, and the appendix already did the homework: `keybindings.ts` matcher is case-sensitive (`e.key === kb.key`, so a Shift chord registers uppercase), `Ctrl+`` ` opens the default shell, `Ctrl+Shift+P` is unbound. Decide the entry affordance in the plan now: the safe choice is the visible "Home" item (no keybinding, zero conflict surface), with any keybinding explicitly deferred to an open question. As written, "or a keybinding" invites a builder to add one mid-milestone without the challenge, which violates the constraint M8a cites. Pin it: M8a ships the visible affordance only; a Home keybinding is open question N with a proposed `Ctrl+Shift+H` (verified unbound) if Mark wants one. Keep the keybinding decision out of the milestone body.

### E. `claude:injectStatus` is a broadcast channel but the plan never adds it to `sendToRenderer`'s forwarded-channel decision the way it does for `program-board:state`.

2.4 and 3.1/M10 establish `claude:injectStatus` as a MAIN -> renderer broadcast carrying pending/success/failure, and say it is "added to `REMOTE_FORWARDED_CHANNELS`-absence" so the test asserts it is NOT forwarded. Good for the test. But `claude:injectStatus` is sent via `sendToRenderer`, and `sendToRenderer` (post-M5) consults `REMOTE_FORWARDED_CHANNELS` to decide forwarding. The plan should state explicitly that `claude:injectStatus` is sent through `sendToRenderer` (so the renderer receives it) AND is absent from `REMOTE_FORWARDED_CHANNELS` (so remote does not), the same two-property treatment `program-board:state` gets. The absence-assertion is named; the positive "it does reach the local renderer" path is not. Add a send-fires-callback assertion for `claude:injectStatus` to M10 mirroring M5's for `program-board:state`, so a channel-name typo between the MAIN send and the preload `on` cannot ship the injection-status feed dead (the 1.5b pending affordance and the failed-start retry both ride this channel; a silent drift makes the headline activation path show nothing).

---

## What the plan gets right (so it is not re-litigated)

- Renderer-only Home is locked, self-enforced via the `onTabUpdate` appender guard, and every `getAllTabs()`/`tabs`-derived count is structurally Home-free by the separate-slot decision. The H-4 active-tab-lookup hardening is the right last corner.
- Write-after-ready matches R3 exactly: gate on first `idle`, once-flag survives the `--resume` double-fire, `\r` not `\r\n`, cleanup on `tab:removed`. Moving the once-flag + timer + intent into MAIN (against R3's renderer sketch) is a genuine improvement that closes the renderer-reload silent-drop, and the plan names it as the cross-module feature it is.
- The PHI choke point as a branded `ClaudeQueryLine` type, with the honest "constrains the call site, not the channel" caveat and the raw-`pty:write` residual (R-11), is the correct security framing. The negative-test-case requirement for `scrubFreeText` (no over-redaction of ISO dates, `127.0.0.1`, `:line` citations) is exactly right and rarely seen.
- The logger leak (M0b) is correctly identified as the single largest standing PHI leak, correctly sequenced before any real-data paint, and the redaction-not-the-gate distinction is honest about what is and is not a privacy control.
- The two-named-timezone-parsers decision (2.8, `parseNaiveLocal` vs `parseOffsetAware`) is the correct response to R4's naive-local-vs-offset trap, and beats a single flagged function.
- Consuming `age_color`, `dod`, `time_sensitive`, and `paused` verbatim from the producer (4.4) rather than re-deriving honors R4's "consume, don't re-derive" and the off-by-one band trap.
- The milestone DoDs are falsifiable (green test plus a structural observable), and the dependency graph + stable-label note correctly separates run order from header order.

---

## Summary

The plan is at about 8/10 on the architect metrics. The five must-fixes are all prose-level corrections that prevent a builder from shipping a green-but-wrong milestone: the `explicitCwd` hook-install claim (the one that actually breaks injection), the dead `isRemote` branch, the oversized M3a, and two silent overrides of cited R-doc authority (R4 consumption primary, R5 remote verdict). Fix those plus the five improvements and this is a 9/10 buildable plan. The architecture is sound; the gaps are in precision, not design.
