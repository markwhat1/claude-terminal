# Round 4 adversarial review: integration / feasibility skeptic

Lens: attack any mechanism that may not actually work on the `dashboard` branch. Write-after-ready timing, `fs.watch` on atomic rename, hero-ranking under the unreliable `requires_response`, remote parity, and the renderer-only Home guards. Default to finding real defects, specific about where and how it fails, with the minimal fix.

Verification basis: read against the `dashboard` worktree at `infrastructure/claude-terminal-dashboard` (the build target), the live `C:\Users\Mark\Claude-Code\dashboard\state.json`, and the producer repo. Files read directly: `src/main/hook-router.ts`, `src/main/tab-manager.ts`, `src/main/ipc-handlers.ts` (tab:create, tab:createShell, project:add, git-head watcher), `src/main/project-manager.ts`, `src/main/logger.ts`, `src/main/pty-manager.ts`, `src/renderer/App.tsx` (startup + listeners), `src/shared/types.ts`, `src/web-client/main.tsx`, `src/web-client/ws-bridge.ts`.

The plan is unusually thorough and most of its corrections (write-after-ready over positional spawn, Stop-idle over `requires_response`, poll over `fs.watch`, paused-respect, the logger leak, the branded choke point) are correct and verified. The defects below are the places where a mechanism the plan treats as "wired" or "a few lines" is actually missing plumbing, points at the wrong target on live data, or rests on an assumption the live data contradicts. Ordered by severity.

---

## CRITICAL-1: The Open-Claude hero action has NO cwd path on `tab:create`; "find-or-add the project for `repos[0]`" is unscoped main-process plumbing, not a renderer wrapper

Where: PLAN 3.1 step 2, 2.5, M10 (Section 7), integration table row "Claude-with-query". Code: `ipc-handlers.ts:336-411` (`tab:create`), `:363-365` (cwd resolution), `project-manager.ts:34-40` (`addProject` throws on duplicate dir).

The plan repeatedly says the Open-Claude action "find-or-adds the project for `WORKSPACE_ROOT + program.repos[0]` and injects there," and frames the action helpers as "thin wrappers over existing primitives" (2.6). Verified against the code, that is false:

- `tab:create` accepts `(projectIdOrWorktree, worktreeName, resumeSessionId, savedName)`. It resolves cwd ONLY from `state.projectManager.getProject(projectId).dir` or the legacy `state.workspaceDir` fallback (`:363-364`). There is NO arbitrary-cwd parameter. You cannot point a new Claude tab at `repos[0]` without the target dir already being a registered project.
- So "find-or-add the project" means actually calling the `project:add` handler (`ipc-handlers.ts:~190-230`) for that repo path. That handler is NOT a thin primitive: it runs `addProject` (which `throw`s if the dir is already a project, `project-manager.ts:37-39`), `log.init(dir)`, `ctx.hookInstaller.install(dir)`, `setupGitHeadWatcher`, a `hookEngine.emit('app:started')`, `settings.addRecentDir(dir)`, and broadcasts `project:added` to the renderer (which paints a NEW project in the sidebar). Clicking "Draft the first version" on the hero would silently spawn a brand-new sidebar project, install hooks into that repo, and start a git-HEAD watcher, none of which the plan's M10 change-list or test mentions.

Contrast: `tab:createShell` DOES accept `explicitCwd` (`:515,531`), so Open-PowerShell can target `repos[0]` cleanly. The plan assumes symmetry that does not exist; only one of the two actions has a cwd seam.

Fix (minimal): either (a) add an `explicitCwd` parameter to `tab:create` mirroring `tab:createShell` (one new arg threaded to the `cwd` resolution at `:367`, plus the hook-installer call which already takes `cwd`), so the action can spawn in `repos[0]` WITHOUT registering a sidebar project; or (b) make M10 explicitly own the full `project:add`-find-or-add flow including the `addProject` duplicate-throw catch (use the existing `getProjectByDir`, `project-manager.ts:92-97`, before adding), the sidebar broadcast, hook install, and a test that clicking the hero action does not create a duplicate project for an already-open repo. Option (a) is far smaller and matches the PowerShell action's existing seam; the plan should pick it and say so. Until one is chosen, M10 as written cannot compile a working Open-Claude action.

---

## CRITICAL-2: `program.repos[0]` is the wrong target on live data for the exact cards the plan names as the Phase-1 hero

Where: PLAN 3.1 ("Resolve the target project from `program.repos[0]`"), 3.2, M10. Live data: `dashboard/state.json` (verified 2026-06-20).

The plan hard-codes `repos[0]` as the action target. The live board breaks that assumption two ways:

1. Multi-repo program, wrong repo first. `incomplete-notes` has `repos = ["clinical-notes", "infrastructure/cad-runner"]`, and its `dod.gaps[0]` is "portal Incomplete Notes surface live end to end" (cad-portal work). `repos[0]` is `clinical-notes`. The plan even names `incomplete-notes` as a likely Phase-1 hero (the single-item-DoD 90%-killer, 1.11). So the headline reframe-as-review action would open Claude / PowerShell in `clinical-notes` to do work whose deliverable lives in a different repo entirely. The canned query "Draft the first version of Incomplete Notes so I can review and send it" lands in the wrong tree, which is the precise "wrong tree" failure 3.6 treats as security-relevant for the remote path, here live on the local path.

2. Two distinct programs share one repo. `practice-reports` (the verified Phase-1 hero: `time_sensitive:2026-06-22`, `needs_you:true`) and `marketing-roi` BOTH have `repos = ["practice-analytics"]`. The find-or-add-by-dir scheme (CRITICAL-1 option b) maps both programs to the SAME project; `getProjectByDir` returns whichever was added first, with its permission mode and tab history. `marketing-roi` is paused so it is filtered today, but the design is one wrong unpause away from two heroes whose actions are indistinguishable at the project layer.

Fix: state in 3.1 that the action target is best-effort and document the `repos[0]`-is-not-the-deliverable case as a known limitation; add a test fixture with a multi-repo program asserting the chosen target is deterministic and surfaced to the user (e.g. the button helper text names the repo it will open: "Open a shell in clinical-notes"). For the shared-repo case, the per-program identity cannot come from the repo dir; if find-or-add-by-dir is the mechanism, the plan must accept that two programs collapse to one action target and say so. Do not bill `repos[0]` as "the hero's program repo" without this caveat; on the two cards the plan itself elevates to hero, it is wrong.

---

## HIGH-1: The write-after-ready once-flag + timer "lives in MAIN" but MAIN has no injection hook point today; M10 is a real main-process feature, not the renderer sketch R3 verified

Where: PLAN 3.1 steps 3-7, 2.5, M10. Code: `hook-router.ts:54-171` (`handleHookMessage`, the `tab:status:idle` case at `:125-132`, the unconditional `sendToRenderer('tab:updated')` at `:167-169`), `pty-manager.ts:66-68` (`write`).

The plan made a correct call moving the fail-safe to MAIN (a renderer reload during CLI boot would otherwise orphan the pending write, since `App.tsx`'s listeners re-register and any renderer-side `useRef` Map is wiped on reload, verified `App.tsx:302-316,353-364`). But it then describes MAIN as if the hook already exists: "MAIN, which already observes the `idle` transition before broadcasting `tab:updated`." MAIN observes idle only to set status and fire a notification; there is NO injection seam. R3's verified, low-risk sketch is entirely renderer-side (R3 lines 78-102). Moving it to MAIN means net-new main-process state that the plan underweights:

- A `pendingInjection: Map<tabId, { query: ClaudeQueryLine, injected: boolean, timer }>` owned in `index.ts`/`hook-router.ts`.
- A new branch inside the `tab:status:idle` case (`hook-router.ts:125`) that, before/after `updateStatus`, checks the pending map and calls `ptyManager.write(tabId, line)` exactly once. `hook-router.ts` does not import `ptyManager` today (its deps are `tabManager`, `sendToRenderer`, naming, hookEngine); the injection write needs `ptyManager.write` threaded into `HookRouterDeps` (`hook-router.ts:6-16`), or the write must live in `index.ts` where both the router and pty manager are visible.
- Per-tab 30s timers armed on inject-intent and cleared on first write or on `tab:removed` (the `tab:closed`/onExit path), plus the failed-start event back to the renderer.
- The two new IPC channels (`claude:injectQuery`, `claude:injectStatus`) with full AGENTS.md treatment.

This is fine as a design, but it is a meaty main-process change, not "two small additions inside listeners that already exist" (R3's framing for the renderer version the plan discarded). Risk: M10 is sized like the renderer sketch but is actually a cross-module main feature touching `hook-router.ts`'s dependency contract.

Fix: M10's change-list must explicitly name (1) the `HookRouterDeps` extension (or the index.ts placement) for the injection write, (2) the pending-map + timer ownership in MAIN, and (3) that the `tab:status:idle` case is the injection trigger point. The test must drive a real `handleHookMessage({event:'tab:status:idle'})` and assert exactly one `ptyManager.write` with a trailing `\r`, a second idle is ignored, and `tab:closed` clears the timer. Without naming the `hook-router.ts` dependency change, the milestone underspecifies the one file that must change for injection to fire at all.

---

## HIGH-2: `--plan` / `acceptEdits` flag bug can block the idle gate, and the plan files it as out-of-scope while building the injection feature on top of it

Where: PLAN 9.1 (filed-issue follow-up), R3 §(d). Code: `types.ts:70-75` (verified: `plan: ['--plan']`, `acceptEdits: ['--allowedTools', 'Edit,Write,NotebookEdit']`).

The plan correctly notes the real CLI flag is `--permission-mode plan` and files `--plan` as a separate issue because it affects all plan-mode tabs. Fair. But the feasibility consequence for THIS feature is undersold: write-after-ready depends on the spawned tab reaching `idle`. If a user is in `plan` mode (or the unverified `acceptEdits` form), the dashboard-spawned tab can error at startup, never fire SessionStart, never reach idle, and the injection silently waits for the 30s timeout every time. The plan's R-4 mitigation is "the dashboard default is `bypassPermissions`, so the common path is unaffected" — but the dashboard tab inherits `state.permissionMode` (`ipc-handlers.ts:390`), which is whatever the workspace is set to, not forced to bypass. A user who set plan mode gets a hero action that always times out.

Note also `acceptEdits: ['--allowedTools', ...]` looks similarly suspect (the documented flag is `--permission-mode acceptEdits`); the plan only flags `plan`.

Fix: this is in-scope enough to handle, not just file. Either (a) the dashboard injection path forces `bypassPermissions` (or `default`) for the tab it spawns regardless of workspace mode, since the canned queries are safe, OR (b) the 30s-timeout failed-start message explicitly says "session may have failed to start; check permission mode" so the silent-timeout-every-time case is legible. Pick one in M10. Also verify `acceptEdits` against the installed CLI in the same filed issue.

---

## HIGH-3: The "N closed today" carrot can over-fire on a routine renderer event, manufacturing fake wins

Where: PLAN 1.5, M4 (resolved-set crossing detection). Code: `hook-router.ts` needs-you is recomputed per poll in the reader; the producer recomputes `needs_you` every 60s.

The plan broadens "finish" to "a card LEAVING the needs-you set across polls" so the 11/18 no-DoD programs can trigger the carrot. The failure mode the plan does not address: `needs_you` is a producer-computed boolean that flips for reasons that are NOT finishes. A card drops out of needs-you when its `time_sensitive` date passes the 5-day window WITHOUT the work being done, when a tag is removed from the override YAML, when `blocked_on` is cleared by editing the YAML, or when a commit ages the card out of a "stalled Nd" reason. Each of those is a needs-you-set departure that the reader will count as "closed today" and reward with a settle beat. For an ADHD user the plan is explicitly protecting, a dopamine hit for a deadline silently lapsing is worse than no hit.

Fix: tighten the crossing predicate. Count a "close" only when a card leaves needs-you AND (its `dod.met` increased since the last poll, OR its `lane` became `done`, OR it transitioned needs-you -> not-needs-you while `git.last_commit.iso` advanced in the same window). A needs-you departure with no progress signal is a lapse, not a finish, and must not increment `closedToday`. Add an M4 fixture: a card whose `time_sensitive` simply expired (no DoD change, no new commit) leaves needs-you and does NOT increment the count.

---

## HIGH-4: `closed.json` is written by MAIN into `<workspaceRoot>/dashboard/` — the same directory the producer owns and the dashboard validates as a trust boundary

Where: PLAN 1.5, M4 (closed.json), 3.6 (`isStateJsonPathSafe` validates the `dashboard/` path). Producer writes `state.json`, `state.tmp`, `enrichment.json`, `programs/*.yml` into `C:\Users\Mark\Claude-Code\dashboard\`.

The plan puts `closed.json` "next to the Phase-2 `todos.json`" in `<workspaceRoot>/dashboard/`. That directory is the PRODUCER's output directory, watched/written every 60s by a separate nssm service. Two problems: (1) the dashboard app now WRITES into a directory the same plan treats as an untrusted read source needing path validation (3.6) — mixing app-owned writes into the producer's data dir muddies the "producer owns this, app only reads" division of labor (4.3) and means a future `dashboard/` cleanup or the producer enumerating its own dir could trip over app files; (2) if the directory watcher is ever added (4.3 follow-up), the app writing `closed.json` into the watched dir self-triggers its own re-read loop.

Fix: put `closed.json` (and `todos.json`) under `app.getPath('userData')`, the SAME place M0b correctly moves the log to and away from any shared/producer tree. The plan already establishes `userData` as the app's private data dir for the log; reuse it for app-owned state. Keep the producer's `dashboard/` strictly read-only from the app's side, which is what the division-of-labor section promises.

---

## MEDIUM-1: The directory-watcher "re-armed on error" mitigation in R-2 contradicts the plan's own body and the verified deaf-handle failure

Where: PLAN R-2 (Section 10.1): "the watcher re-reads on ANY event and is re-armed on error. M4 tests both the never-arms and the `filename:null` cases." This directly contradicts PLAN 4.3 item 2, which correctly says the dominant Windows failure (deaf handle after one atomic-rename event) "is NOT an error, the handle stays alive and throws nothing, so there is no signal to re-arm on," and that M4 ships NO watcher.

R-2 is stale text from an earlier round. It (a) claims a watcher mitigation the body explicitly cut from M4, (b) claims M4 tests watcher cases that 4.3/M4 say are not in M4's shipped change, and (c) re-asserts the "re-armed on error" robustness the body identifies as false. The git-HEAD watcher the plan cites as precedent (`ipc-handlers.ts:142-156`, verified) has exactly the `.on('error', ...)` ignore handler and a 1000ms debounce, and it watches a single FILE — the precise pattern 4.3 says must NOT be copied for state.json.

Fix: rewrite R-2 to match the body: the ~20s poll is the only Phase-1 mechanism and the sole backstop; the watcher is a deferred follow-up whose deaf-handle failure is undetectable; M4 tests the poll + retry + last-good, not watcher cases. Remove the "re-armed on error" claim and the `filename:null` M4 assertion.

---

## MEDIUM-2: `idleNeedsYou` and the idle-age floor read `waitingSince`, but `waitingSince` only exists after M1 ships AND only for tabs that transition through the new stamping; restored/pre-existing tabs have it null

Where: PLAN 2.2 (`waitingSince` stamping), 5.2 (floor measured against `waitingSince`), M7 (`formatRelative` handles null anchors), M9. Code: `tab-manager.ts:11-28` (createTab inits no timestamps), `App.tsx:303-316` (renderer-reload rehydrate path uses `getTabs()` from main, which returns the existing in-memory tabs).

The plan acknowledges null anchors for `formatRelative` (M7 placeholder) but not for the FLOOR LOGIC. A tab that was `idle` BEFORE M1's stamping took effect (app upgraded mid-session is impossible since restart re-spawns, but a tab restored from persistence and resumed) reaches `idle` via the `tab:ready` resume branch (`hook-router.ts:98-104`), which calls `updateStatus(id,'idle')`. Per the 2.2 snippet, entering `idle` sets `waitingSince` only if `firstActivityAt !== null`. A freshly-resumed tab has `firstActivityAt === null` (correct, it is "ready" not "needs you"), so `waitingSince` stays null. Good. But then if that resumed tab does one turn (`working` clears `waitingSince` to null and stamps `firstActivityAt`), finishes (`idle` sets `waitingSince`), the math works. The actual gap: the idle-age floor `now - waitingSince` must guard `waitingSince === null` or it computes `now - null = now` (a ~56-year age in ms, NaN-adjacent), which would push EVERY ready-but-never-worked tab past the floor into needs-you on the first poll. The plan tests this for `formatRelative` display but not for the floor comparison in the mapper (5.2 / M9).

Fix: the idle-floor predicate must be `waitingSince !== null && (now - waitingSince) >= floor`. Add an M9 assertion: a tab with `firstActivityAt:null, waitingSince:null` (resumed, never worked) is NOT `idleNeedsYou` regardless of wall-clock, so the empty-board live-tab hero (4.6) does not falsely elevate a just-resumed idle tab.

---

## MEDIUM-3: M1's "web-client spreads tabs and tolerates unknown fields" is not how the web client consumes tabs; the spread-check tests a property the code does not rely on

Where: PLAN 2.2 ("the web client spreads tabs and ignores unknown fields"), M1 (web-client spread-check), 9.4. Code: `web-client/main.tsx:122,141,211,216` (tabs typed as `Tab[]`, stored in `useState<Tab[]>`), `ws-bridge.ts:9,135,167` (`tab:updated`/`tabs:sync` typed as `Tab`).

Verified: the web client does not "spread tabs and ignore unknown fields" as a tolerance mechanism. It consumes the shared `Tab` type directly and stores `Tab[]`. The additive fields ARE remote-safe, but for a stronger reason than the plan states: they are part of the shared `Tab` type both sides import, so they flow through typed, never as "unknown fields a spread tolerates." The M1 "spread-check covering all four fields" is testing a behavior (graceful handling of unknown fields) that is not the actual safety property. If the real concern is the web client choking, the failure mode would be a TYPE mismatch at build, not a runtime unknown-field issue.

Fix: reword M1's verification to "confirm the shared `Tab` type change compiles against `web-client/main.tsx` and `ws-bridge.ts` (both import `Tab`) and that `groupTabsByProject`/render do not assume a closed field set." The four-field "spread-check" as written asserts the wrong thing. This is a low-risk additive change; the test should assert build-time type compatibility, not runtime spread tolerance.

---

## LOW-1: Remote `pty:write` passthrough (R-11) is correctly named as a residual, but the plan ships the branded `ClaudeQueryLine` choke point as if it constrains the channel; it constrains only the dashboard action

Where: PLAN 3.4, 3.6, R-11. Code: `ws-bridge.ts:283-285` (remote `writeToPty` sends raw), `web-remote-server.ts:272-276` (remote `pty:write` passthrough, cited in appendix).

The plan does name this honestly in R-11 ("the injection-safety guarantee is LOCAL-ONLY"). The only thing to sharpen: 3.4's compiler-enforced choke point (`ClaudeQueryLine`) is described in the same breath as the channel safety, which could read as if the brand protects the write channel. It does not: any caller can still call `writeToPty(tabId, rawString)` for non-injection writes (every keystroke does), and the remote bridge sends raw bytes. The brand only stops a future `writeToPty(tab.id, detail)` for the DASHBOARD injection action. This is correctly residual-risked; just ensure the M0b/M10 test that asserts "any direct `writeToPty(tab.id, rawString)` for injection fails to typecheck" does not overclaim channel-level safety in its DoD wording.

Fix: keep R-11 as is; in 3.4 add one clause that the brand constrains the dashboard action's call site only, not the `pty:write` channel, so a reviewer does not read the choke point as a channel control.

---

## Confirmed sound (attacked, did not break)

- Write-after-ready CR (`\r`) handling, idle-gate-not-`tab:ready`, resume double-fire idempotency: verified against `Terminal.tsx` onData, `App.tsx:209-212` refresh precedent, and the `hook-router.ts:80-113` double-fire comments. Correct.
- `requires_response` demoted to overlay, Stop-idle + `hadActivity` (`firstActivityAt`) + in-app idle timer as the spine: verified the single-producer chain (`hook-router.ts:134-135` <- `on-notification.js`) and the bypass-mode suppression. The spine choice is right.
- Poll-primary over `fs.watch`: verified the producer's atomic `os.replace` and the existing single-file watcher anti-precedent. Correct (modulo MEDIUM-1's stale R-2 text).
- Renderer-only Home, separate slot, never in TabManager, both `onTabRemoved` null returns routed, self-enforcing `onTabUpdate` guard: verified `App.tsx:366-381`, `:354-364`, the `getAllTabs` activation guard. The guards are real and complete.
- Remote Home desktop-only: verified `web-client/main.tsx` never imports `App`/`HomeView` and is a separate renderer. Correct.
- Logger leak: verified `logger.init` writes into `path.join(dir, '.claude-terminal', 'logs', 'main.log')` (`logger.ts:60-64`) and `log.init(dir)` is called per-project-add (`ipc-handlers.ts:205,284`). The CRITICAL classification and the move-to-userData fix are right. (See HIGH-4: extend the same userData destination to `closed.json`/`todos.json`.)
- Paused-respect: verified live `marketing-roi` is `paused:true + needs_you:true + lane:paused`. The filter-from-hero-and-default-list decision is correct and load-bearing.
- Producer single-item-DoD predicate (`incomplete-notes` `total:1, met:0`): verified live; the plan's use of the exact producer predicate (no `>=2` guard) is correct.
