# Round 4 Advisor Review: Electron/React Architect lens

Reviewer lens: Electron/React architect. Goal: tighten integration against the R1 corrected citations, maximize reuse, keep Home renderer-only, ensure AGENTS.md compliance, keep new Tab additions remote-safe. Scored toward a 9/10 bar.

Build target verified: worktree `claude-terminal-dashboard`, branch `dashboard`, HEAD `ce2e9e0`. I re-resolved the load-bearing citations against this exact checkout before writing. Confirmed exactly as the plan states:

- `tab-manager.ts:55-58` `updateStatus` is a flat setter (`if (tab) tab.status = status;`), no transition guard, no timestamp. The 2.2 snippet is the correct fix.
- `logger.ts` `init(dir)` writes to `path.join(dir, '.claude-terminal', 'logs', 'main.log')` inside the opened repo tree; `emit` mirrors EVERY level via `executeJavaScript`. M0b's leak fix and mirror gate target the right lines.
- `ipc-handlers.ts:783` `shell:openExternal` calls `shell.openExternal(url)` with no scheme check; `index.ts:294-305` `setWindowOpenHandler` and `will-navigate` also call it unguarded. M0b's three-sink allowlist is warranted.
- `index.ts:75-99` `sendToRenderer` forwards via an inline if/else-if chain (NOT exported). M5's exported-`REMOTE_FORWARDED_CHANNELS` refactor is the right call.
- The registration test is a hardcoded `expectedHandlers` array (`tests/main/ipc-handlers.test.ts:182-209`); extending it is the documented mechanism.
- `web-client/main.tsx:270-274` spreads tabs (`[...prev, tab]`), so the four additive Tab fields are remote-safe.

This is a strong round-4 plan. The integration map is worktree-accurate, Home-renderer-only is correctly locked, the AGENTS.md five-part IPC discipline is applied to every new channel, and the milestones are genuinely small with falsifiable DoDs. The findings below are the gap between "very good" and 9/10. None overturn the architecture; they close concrete seams a builder would otherwise hit.

---

## MUST-FIX (blocks 9/10)

### MF-A. The hero primary button has no working foreground token, and no milestone owns it.

Verified: `globals.css` registers `--color-attention` in `@theme inline` (so `bg-attention` resolves) but there is NO `--attention-foreground` value and NO `--color-attention-foreground` registration. `#ce9178` is a mid-tone salmon; white-on-salmon and dark-on-salmon both sit near the WCAG AA edge for button text. The plan acknowledges this in 6.2 ("`text-attention-foreground` if added, else an explicit light foreground class since `#ce9178` is a mid-tone") but then assigns it to no milestone. M7b adds `--age-orange` but not the attention foreground; M8a asserts the button carries `bg-attention` but asserts nothing about legibility.

Why it matters: the hero primary button is THE single most dominant pixel in the whole design and the one accent the calm rule reserves. Shipping it with unreadable or borderline text is the most visible possible defect, and "if added" is exactly the hedge that ships as not-added.

Fix: fold the decision into M7b (the same "make the rendering primitives exist" rollback point that adds `--age-orange`). Either (a) register `--attention-foreground` + `--color-attention-foreground` with a chosen high-contrast value and assert a contrast ratio in the M7b token test, or (b) commit to a fixed explicit foreground utility (e.g. a dark `text-[#1e1e1e]` matching the `--warning-foreground` pattern, since salmon is light-mid) and make M8a's button assertion check that class too, not just `bg-attention`. Pick one in the plan; do not leave it conditional.

### MF-B. M0b's openExternal allowlist will break the existing `will-navigate` app-url guard if applied naively.

Verified `will-navigate` at `index.ts:299-305`:

```ts
const appUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL || 'file://';
if (!url.startsWith(appUrl)) {
  event.preventDefault();
  shell.openExternal(url);
}
```

This handler's existing job is to let in-app navigation (the Vite dev server URL, or `file://` in prod) pass through and shunt everything else to the OS browser. If M0b inserts an http/https allowlist here without preserving this guard, one of two regressions ships: either internal `file://` navigation gets sent to `shell.openExternal` (it currently is NOT, it falls through the `startsWith` check), or the allowlist rejects the legitimate dev-server URL and breaks hot reload. The plan's M0b change list says "enforce the http/https allowlist in the `setWindowOpenHandler`/`will-navigate` sinks" as if these two sinks are symmetric; they are not. `setWindowOpenHandler` ALWAYS calls openExternal (new-window requests), while `will-navigate` only calls it for non-app URLs.

Fix: spell out in M0b that the allowlist applies to the openExternal CALL in both sinks, AFTER the existing app-url passthrough logic in `will-navigate` is preserved. Add an M0b test asserting (1) an app-url / `file://` navigation is NOT sent to openExternal (passthrough preserved), (2) an external `https:` URL IS sent, (3) a `file:`/`javascript:`/`vscode:` external URL is rejected at both sinks. Factor the scheme check into one shared `isAllowedExternalScheme(url)` pure function in `src/shared/` (you already have the `src/shared` discipline) so both sinks plus the IPC handler call the same predicate and the test hits it directly. Without this the allowlist is three hand-copied checks that can drift, which is the exact failure mode AGENTS.md's "validate before the sink" rule exists to prevent.

### MF-C. M3a's render-seam test cannot actually exercise the seam, because no test mounts App.tsx and the seam is JSX in App.

M0 provides a `window.claudeTerminal` mock and notes "no existing test mounts `App.tsx`". M3a's DoD says "Home renders as a placeholder; no PTY for it; counts Home-free" and its test covers extracted pure helpers (`selectActiveView`, `computeTabCounts`, the `onTabUpdate` guard). Those are good unit tests, but NONE of them proves the actual render seam at `App.tsx:577-583` (the `{activeTabId === HOME_TAB_ID && <HomeView/>}` sibling) renders HomeView and NOT a Terminal when Home is active. The structural observable in the DoD ("Home renders as a placeholder") is asserted nowhere. This is the one seam where a wrong conditional (e.g. placing the Home branch inside the `tabs.map` instead of as a sibling, the exact mistake the plan warns against in 2.2) ships green.

Fix: either (a) extract the active-view decision into the already-named `selectActiveView(activeTabId, homeId, tabs)` pure helper AND have App.tsx render off its return value (a discriminated result the test can assert maps Home->HomeView, real-tab->Terminal), so the seam is testable without mounting App; or (b) add a minimal App-mount smoke test in M3a (M0's mock makes this possible) asserting that with `activeTabId === HOME_TAB_ID` the HomeView testid is present and no Terminal mounts. Option (a) is the higher-reuse path and matches the plan's "extract pure helpers" instinct everywhere else. Make the DoD's "Home renders as a placeholder" observable a real assertion, not prose.

---

## HIGH (lifts quality materially)

### H-1. `firstActivityAt`/`waitingSince` are added to the `Tab` interface but the snippet only stamps them in `updateStatus`. Tab CREATION must initialize all four to null, and that init site is unspecified.

M1's change line says "init to `null` at tab creation" but does not cite the site. `TabManager.createTab` is at `tab-manager.ts:11` (per R1) and constructs the Tab object literal. If the four fields are added to the interface but the constructor literal omits them, they are `undefined`, not `null`, and every `=== null` guard in the 2.2 snippet (`tab.firstActivityAt === null`, `tab.waitingSince === null`) silently misbehaves: `undefined === null` is false, so `firstActivityAt` never stamps and `waitingSince` never sets. The R2 spine quietly breaks. The M1 test asserts "fields default `null`" but a builder reading only the change list may add them to the interface and the snippet and forget the constructor.

Fix: cite `tab-manager.ts:11` (the `createTab` object literal, status assigned at `:21`) explicitly in M1's change list as the init site, and make the "fields default `null`" test assert against a tab fresh from `createTab`, not a hand-built object. This is one line but it is the line the spine rests on.

### H-2. The `claude:injectStatus` direction is under-specified for the AGENTS.md five-part treatment, and may not need to be a separate channel.

3.1 and the M10 change list describe `claude:injectQuery` (renderer->main) and `claude:injectStatus` (main->renderer broadcast) as a "channel pair", and say both get handler + preload + global.d.ts + registration test + remote decision. But a broadcast (main->renderer push) is not an `ipcMain.handle` channel; it has no entry in the `handlers`/`listeners` registration test the way `injectQuery` does. The plan already solved this exact problem for `program-board:state` in M5 (the send-fires-callback test against an exported channel constant, because a push channel name can drift silently). M10 does not reference that pattern for `injectStatus`, so the "registration test" obligation for the status direction is ambiguous: a builder will either skip it (no membership to assert) or invent a different test.

Fix: state in M10 that `claude:injectStatus` (the push direction) reuses the M5 pattern: a single exported channel constant referenced by both the main `sendToRenderer` call and the preload `on`, plus a send-fires-callback test, plus an entry in `REMOTE_FORWARDED_CHANNELS`-absence (it is local-only, so assert ABSENT). Alternatively, fold the failure/status signal onto the existing `tab:updated` plus a dedicated failure field rather than minting a second channel at all (3.1 floats this as "or the existing `tab:updated`"); decide it, because "one new channel pair" vs "one new channel + a field on tab:updated" is a different AGENTS.md surface and the milestone should commit. Fewer channels is the higher-reuse answer if the failure can ride an existing broadcast.

### H-3. M5's `REMOTE_FORWARDED_CHANNELS` refactor changes the behavior of FIVE existing broadcast channels, but the milestone only tests the new one.

The refactor converts the inline if/else-if chain (`pty:data`, `tab:updated`, `tab:removed`, `pty:resized`, `tab:switched`, `tab:worktreeProgress`) into a data-driven constant the function consults. That is the right move, but it is a behavior-touching refactor of the live remote path: every remote client depends on those six channels being forwarded. M5's test asserts only that `program-board:state` is ABSENT and `tab:updated` is PRESENT. A refactor that accidentally drops `pty:data` or `tab:worktreeProgress` from the set (a copy error converting six branches to six entries) ships green, and the regression is "remote terminals go blank" or "worktree progress stalls remotely", caught only by manual remote testing.

Fix: M5's constant-membership test should assert the FULL expected forwarded set (all six existing channels present, `program-board:state` absent), not just the two it names. This is one array literal in the test and it pins the refactor against silent drops. The plan's own "boringly small, one rollback point" rule argues for it: a refactor that touches the remote contract needs the remote contract asserted.

### H-4. Home selection sets `activeTabId` to the Home sentinel, but no main-process call is made; verify `tab:switched`/`StatusBar`/persistence do not assume `activeTabId` always maps to a real tab.

2.2 short-circuits `handleSelectTab` for the Home id (`setActiveTabId(tabId); return;`, no `switchTab` IPC). Correct. But several renderer-side consumers read `activeTabId` and look up a tab: `StatusBar` receives `activeProjectTabs` (R1 `App.tsx:585`), and the render map gates Terminal visibility by `tab.id === activeTabId`. When `activeTabId === HOME_TAB_ID`, every `tabs.find(t => t.id === activeTabId)` returns undefined. The plan handles the render map (sibling seam) and the counts (separate slot), but does not enumerate the OTHER `activeTabId`-keyed lookups (StatusBar's active-tab display, any "current tab" derivation, the title-setter `window:setTitle`). One of them dereferencing `undefined.name` is a renderer crash on landing on Home.

Fix: add one line to the 2.10 integration table or a 2.x sub-note: "every `tabs.find(... === activeTabId)` consumer must tolerate Home (no match)". Concretely audit `StatusBar` props at `App.tsx:585` and the title-setter, and add to M3a's test a "render with `activeTabId === HOME_TAB_ID` and a non-empty `tabs` array does not throw" assertion (this rides the same App-mount smoke test MF-C asks for). This is the renderer-only-Home decision's last unswept corner.

### H-5. The cwd resolution for the hero actions ("find-or-add the project for `WORKSPACE_ROOT + program.repos[0]`") is described but the find-or-add primitive is not cited, and may not exist as a renderer-callable.

3.1 step 2 and 3.2 both rely on resolving the hero program's repo to a project and adding it if absent. The plan cites `handleAddProjectConfirm` (`App.tsx:263-279`, via R1) for the add path and `activeProjectId`/`projects` state, but does not show that a renderer-side "find project by cwd, else add and return its id" helper exists or specify where it is added. `program.repos[0]` is a RELATIVE repo name or an absolute path? The producer's `repos[]` field shape determines whether `WORKSPACE_ROOT + repos[0]` is a valid join. If `repos[0]` is already absolute, the join is wrong; if it is a slug, the join is right. This is load-bearing for MF-3 (the wrong-tree fix) and is unverified against the actual `state.json` repo field.

Fix: verify the `repos[]` element shape in the live `state.json` (relative vs absolute) and state it in 4.3's schema list and 3.1 step 2. Specify the find-or-add helper as a named renderer function (e.g. `resolveProgramProject(repos[0], projects)`) with its own M10 test (given a project matching the resolved cwd, returns its id; given none, calls add and returns the new id; given an unresolvable repo, returns null -> Copy-only fallback). Right now the highest-value action (reframe-as-review) rests on an unverified path join.

### H-6. Maximize reuse: `formatRelative`, the idle-age floor, and the strip's status vocabulary should be the SAME source the tab bar uses, but only `TabIndicator` reuse is specified.

The plan reuses `TabIndicator` for glyphs (good, 6.4) and computes relative time through one `formatRelative` (good, 1.2). But the tab bar / `Tab.tsx` likely already renders its own status and possibly its own relative-time or status-label logic. The plan does not check whether `Tab.tsx`/`TabBar.tsx` have duplicable status-to-label logic that the strip could share, nor whether the existing tab bar would benefit from the same `formatRelative`. If the strip and the tab bar diverge on how they describe `working`/`idle`, the "one status vocabulary" goal (6.4) holds for glyphs but not for text.

Fix: in 2.7 (shared logic) or 6.4, add a one-line audit obligation: check `Tab.tsx`/`TabBar.tsx` for existing status-label or time logic and reuse it if present, or note explicitly that none exists. This is cheap and it is the difference between "reuse the glyph" and "reuse the vocabulary". Not a blocker, but it is squarely the reuse lens.

---

## MEDIUM (polish / de-risking)

### M-1. `isStateJsonPathSafe` and the M4 reader run in MAIN, but the plan files them in `src/shared/`. Confirm the Node `path`/`url` imports are allowed there.

2.7 says `src/shared/` is "no Electron, no DOM imports" and lists the path validator there. `isStateJsonPathSafe` needs `path` resolution semantics (normalize, isAbsolute, UNC detection) which is Node's `path` module. That is fine for a function consumed only by MAIN, but `src/shared/` is also bundled for the WEB CLIENT (the whole point of 2.7's web-vite-resolves assertion). `node:path` does not bundle for a browser target without a polyfill. If `isStateJsonPathSafe` imports `node:path` and lands in `src/shared/`, the M7-style "imports resolve under web-client vite" check will fail for it.

Fix: either keep `isStateJsonPathSafe` in `src/main/` (it has no web consumer; the web client never reads state.json) and drop it from the 2.7 shared list, or write it string-only (no `node:path` import) so it bundles everywhere. The plan currently lists it in BOTH 2.7 and 3.6 as shared; resolve the contradiction. Lowest-risk: it is main-only logic, move it to `src/main/` and the M4 test runs in node-env anyway.

### M-2. The `--project-hue` left border reuses `border-[hsl(var(--project-hue)_30%_35%)]`, but `--project-hue` is a single GLOBAL value set from the ACTIVE project (`App.tsx:109`), not per-card.

6.4 wants a per-session identity tint in the strip via `--project-hue`. But verified (and the plan notes) `--project-hue` is set once globally from the active project. A strip listing tabs from MULTIPLE projects cannot tint each row by its own project hue using a single global CSS variable; every row would get the active project's hue. The plan's "per-session identity in the strip is a thin desaturated tint from `--project-hue`" (1.2) is therefore only correct for single-project rows or would need a per-row inline `--project-hue` override.

Fix: state in 6.4 that each strip row sets its OWN `--project-hue` inline from that tab's project color (mirroring the `App.tsx:109` inline-set pattern the plan endorses in 1.2), not the global variable. Add it to M9's change list. Otherwise the identity tint is a no-op distinction across projects. Small but it is a real "looks right in a one-project fixture, wrong in multi-project use" trap.

### M-3. M8a is doing a lot for one "boringly small" milestone; consider whether the four-state non-strobe timeline is its own rollback point.

M8a's test list is the longest in the plan (skeleton, first-open timeline with fake timers, time-sensitive hero, single-item-DoD hero, paused exclusion, list cap, copy-only fallback, caught-up, not-running, degraded, hard-error, last-good, three dominance-class assertions, openExternal-not-href, voice). That is excellent coverage but it is not "one change, one expected test, one rollback point"; it is ~14 assertions across ~6 behaviors. If M8a fails review, the rollback reverts the entire read-only paint.

Fix: consider splitting M8a into M8a-1 (hero + needs-you list + dominance classes + override selection + paused exclusion + list cap) and M8a-2 (the four-state non-strobe timeline + last-good + degraded/error, the state-machine half). Each is a clean rollback point and the state timeline is independently the trickiest (fake timers, no-second-skeleton invariant). This matches the plan's own M3/M3a/M3b and M14a/b/c splitting instinct. Not strictly required (the milestone is internally coherent as "the read-only paint") but it would honor the boringly-small rule the plan sets for itself.

### M-4. The `Inbox(N)` and capture keybinding are Phase 2, but `Ctrl+Shift+K` collides per the verified case-sensitive matcher; flag the conflict now so it is not a Phase-2 surprise.

Appendix notes `keybindings.ts:77` matches `e.key === kb.key` case-sensitive, so a Shift chord registers as uppercase `'K'`. Open question 4 asks Mark to approve `Ctrl+Shift+K` vs `Alt+C`. That is correctly deferred. But AGENTS.md demands every keybinding be challenged against terminal/Claude meaning. `Ctrl+Shift+K` has no terminal collision, but the plan should record the one-line challenge result now (it is clear) rather than leaving it as an open question that re-opens the AGENTS.md gate in Phase 2.

Fix: in the Phase-2 index (Section 8) or open question 4, add the challenge conclusion: "`Ctrl+Shift+K` does not collide with the readline/terminal combos enumerated in AGENTS.md; it needs only Mark's preference sign-off, not a conflict resolution." Keeps the AGENTS.md keybinding obligation visibly discharged.

### M-5. Risk R-2's mitigation text still claims the watcher is "re-armed on error", which 4.3 explicitly debunks.

R-2 (Section 10.1) reads: "the watcher re-reads on ANY event and is re-armed on error. M4 tests both the never-arms and the `filename:null` cases." But 4.3 item 2 (and 9.3) correctly establish that the dominant Windows `fs.watch` failure is a DEAF handle that throws NOTHING, so "re-armed on error" is a mitigation that cannot fire, and the watcher is a DEFERRED follow-up not in M4. R-2's mitigation contradicts the body, and claims an M4 test for a watcher M4 does not ship.

Fix: rewrite R-2's mitigation to match 4.3: "the ~20s poll is the primary and only Phase-1 mechanism and is the tested backstop; the directory watcher is a deferred follow-up; the deaf-handle failure is undetectable so correctness rests on the poll, and if the watcher is ever added it is torn down and recreated on the poll tick, not re-armed on an error that never comes." Drop the "M4 tests both" clause (M4 ships no watcher). This is a residual inconsistency from the round-3 watcher prose that the round-4 4.3 rewrite did not propagate to the risk register.

---

## What is already at or above bar (keep)

- Home-renderer-only is correctly locked and the separate-slot + self-enforcing `onTabUpdate` guard is the right way to make it not rely on six disciplined call sites. The remote-truth note (main `activeTabId` null after last-tab-close, remote reconnect lands on first real tab) is exactly the kind of corner round-3 missed.
- The waiting-clock-vs-display-clock separation (`waitingSince` not reset by `idle->requires_response`) is a genuinely subtle correctness fix and the snippet is right.
- Every new IPC channel carries the full five-part AGENTS.md treatment with an EXPLICIT remote decision, and the exported-constant path for the remote-forward absence assertion (M5 MF-1) is the correct way to make "not forwarded" a compiler/test invariant rather than a comment.
- The `ClaudeQueryLine` branded type making "sole producer" a compile-time invariant is the right enforcement altitude for the PHI choke point.
- Moving `closed.json` ownership to MAIN (the only component with cross-poll memory + process lifetime) is the correct owner decision; reconstruct-at-construction defeats the renderer-reload erase.
- The two-named-parsers (`parseNaiveLocal`/`parseOffsetAware`) over one flagged function is the right call; a flag relabels the misuse surface rather than removing it.
- M0b sequenced BEFORE any real-data paint is correct; the leak goes live the instant M8a renders real `title`/`detail`, and the citations are exact.
- The dependency-graph framing of the milestones (critical path to first paint, parallelizable set) over a flat list is the right structure and makes "value early" verifiable.

---

## Scoring summary

The plan is close. The three MUST-FIX items are real seams a builder hits in Phase 0/1 (an unreadable hero button, a navigation-allowlist regression, an untestable render seam), the HIGH items close integration corners (the null-init spine dependency, the push-channel test ambiguity, the remote-refactor blast radius, the unswept `activeTabId` lookups, the unverified cwd join), and the MEDIUM items are polish and one stale-prose inconsistency. Address MF-A/B/C and H-1/H-3/H-4 and this is a 9. The architecture is sound; these are the last load-bearing details.
