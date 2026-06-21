# Round 5 Adversary Review: Integration / Feasibility Skeptic

Lens: attack any mechanism that may not actually work on the `dashboard` branch. Every claim below is re-verified against the worktree at `C:/Users/Mark/Claude-Code/infrastructure/claude-terminal-dashboard` (branch `dashboard`, the same HEAD the plan cites). I read the real source, not the plan's quotes of it.

Verdict up front: the plan is unusually disciplined and most of its self-corrections hold. But the single most load-bearing mechanism in the whole feature, the write-after-ready injection, is pinned to the WRONG hook-router case and will not fire on the first idle of a freshly spawned tab. That is a ship-stopping defect that a green M10 test as currently specified would still pass against, because the test drives a `tab:status:idle` event, which is exactly the case that never carries the first idle. Details below, most severe first.

---

## CRITICAL-1: The injection gate is wired to the wrong idle producer; it never fires on the ready transition

Plan locations: Section 3.1 step 4, Section 2.10 row "HookRouterDeps extension", M10 change-list ("a new branch in the `tab:status:idle` case (`hook-router.ts:125`)"), M10 test ("driven by a REAL `handleHookMessage` idle event ... exactly one `ptyManager.write` ... on first `idle`").

What the code actually does (`src/main/hook-router.ts`, read in full):

- A freshly spawned Claude tab starts `status:'new'` (`tab-manager.ts:21`).
- The CLI boots and fires `SessionStart`. `on-session-start.js:19` sends `tab:ready` with `{sessionId, source:"startup"}`.
- The router handles `tab:ready` in the case at `:63-119`. Because `sessionId` is present, it calls `deps.tabManager.updateStatus(tabId, 'idle')` at **`:104`**. THIS is the first idle. It happens inside the `tab:ready` case.
- The `tab:status:idle` case at **`:125-132`** is fired only by the `Stop` hook (`on-stop.js:5` -> `tab:status:idle`), i.e. AFTER Claude finishes responding to the first user prompt.

So a dashboard tab created for an injection reaches `idle` for the first time via the `tab:ready` case (`:104`), never via the `tab:status:idle` case (`:125`). If M10 adds the injection branch only to the `tab:status:idle` case as the plan instructs, the canned query is never typed in until the user manually submits a first prompt and Claude finishes a turn, which defeats the entire feature (the user clicks "Draft the first version", nothing types in, they stare at a blank REPL, the reframe is destroyed in its first three seconds, the exact 1.5b failure the plan claims to fix).

Why R3 did not catch this: R3's gate is a RENDERER-side observer of `tab:updated` (R3 §(a) step 4, §(b)). Both the `tab:ready` path and the `tab:status:idle` path converge on the single `sendToRenderer('tab:updated', updated)` at `:167-170`, so a renderer observing `tab.status === 'idle'` sees BOTH. R3 is correct for a renderer gate. The plan's round-5 change MOVED the gate into MAIN (a good change for renderer-reload safety) but pinned it to one specific case (`:125`) instead of the convergence point, silently dropping the ready transition that R3 was actually relying on.

The M10 test as written hides the bug: "the MAIN idle gate driven by a REAL `handleHookMessage` idle event" with "a second `idle` ignored (the resume double-fire)". A `tab:status:idle` event does drive the `:125` branch, so the test passes, while the real first-idle (`tab:ready`) is never exercised. The test proves the wrong path.

Minimal fix: gate the injection in MAIN at the point where ALL idle transitions converge, not in one case. Either (a) add the once-flag check inside `tab:ready` at `:104` AND `tab:status:idle` at `:126` (both call `updateStatus(...,'idle')`), or (b) hook it after the switch at the `tab:updated` emission (`:167-170`), checking `updated.status === 'idle'` for a tracked tab. Option (b) is the cleaner single seam and matches R3's actual observable. Then the M10 test MUST drive a real `tab:ready` message (`{sessionId, source:"startup"}`) as the first-idle case, and additionally assert the `tab:status:idle` (Stop) case and the resume double-`tab:ready` are idempotent. A test that only sends `tab:status:idle` is insufficient and must be rejected in review.

---

## HIGH-2: `notifyTabActivity`'s per-tab dedup will swallow the injection's first idle-driven notification AND the plan's "isActive suppresses it" reasoning is incomplete

Plan location: 3.1 step 3 sets the injected tab active (`setActiveTabId(tab.id)`); the injection branch lives next to the idle notification.

Code facts (`hook-router.ts:19-52, 125-141`): `notifyTabActivity` guards on a process-lifetime `pendingNotifications` Set, only cleared on notification CLICK (`:30`) or via `clearPendingNotification` (called from `proc.onExit` path? no — grep shows it is returned but the idle/input cases never call it except on click). The idle case notifies only when `!isActive`.

Two interacting problems the plan does not address:

1. The plan relies on the injected tab being active so the idle notification is suppressed. But the injected tab is set active in the RENDERER (`setActiveTabId`), while `isActive` in the router reads MAIN's `tabManager.getActiveTabId()` (`:60`). For a renderer-only-Home app, the renderer's active id and main's active id already diverge (2.1 remote-truth note admits main's active id goes null when Home is active). If the user clicks the hero while Home is the active surface, main's active id is whatever it was; `setActiveTabId(tab.id)` in the renderer does NOT call `switchTab` for the new tab unless the action path explicitly does so (the plan's step 3 calls `setActiveTabId`, a pure renderer state setter, not the IPC `switchTab`). So `isActive` in main can be false for the freshly created tab, and the first idle WILL fire an OS toast ("Claude has finished working") for the very tab the user is actively watching. That is the notification-amplification regression M14d exists to reduce, reintroduced on the headline path.

2. `pendingNotifications` is sticky until click. If a toast fires for the injected tab and the user never clicks it, the Set keeps that tabId, and the plan's MAIN-owned injection logic shares no state with it. Not a correctness break for injection, but it means the calm-by-default promise is broken precisely on the action the plan markets as the headline move.

Minimal fix: the injection path must drive main's active id (call the IPC switch or have MAIN set active on inject intent) so `isActive` is true and the idle toast is genuinely suppressed; OR the injection branch must call `clearPendingNotification(tabId)` / set a "do not notify, this is a dashboard inject" flag on the tracked tab so the idle-driven toast is suppressed for injected tabs regardless of active state. Add an M10 assertion: an injection-driven first idle fires NO OS notification.

---

## HIGH-3: `tab:createShell` and the `explicitCwd` `tab:create` both throw when no project is registered, contradicting the "no-active-project Home" first-class case

Plan locations: 3.1 step 2 and 6.5 ("No-active-project Home state ... resolve the hero PROGRAM's own repo as the target via the `explicitCwd` route, which is well-defined with no active project"); 3.2 (Open PowerShell via `explicitCwd`).

Code facts:

- `tab:createShell` (`ipc-handlers.ts:515-547`): resolves `projectId` from `afterTabId` or first project; then `const workDir = project?.dir ?? state.workspaceDir; if (!workDir) throw new Error('Session not started');` at `:528-529`. `cwd = explicitCwd || workDir`. So even with `explicitCwd` supplied, if there is no project AND `state.workspaceDir` is unset, the handler throws BEFORE using `explicitCwd`. The throw is gated on `workDir`, not on `explicitCwd`.
- The plan's proposed `explicitCwd` addition to `tab:create` would mirror this, and `tab:create` today has the same `if (!workDir) throw new Error('Session not started')` at `:365`.

Why this matters less than it looks, but still matters: in Phase 1 the Home surface only renders inside `appState:'running'`, which is only reached after `startSession` resolves a `projectId` and sets `state.workspaceDir` (`App.tsx:294-300`, and `state.workspaceDir`/`cliStartDir` are set in main). So in practice `workDir` is non-null by the time Home paints. BUT the plan explicitly elevates "no project has ever been opened" to a first-class, tested case (M14b "tests Home-landing-with-no-active-project", 6.5). That tested case, if it ever reaches `explicitCwd` spawn, hits the `!workDir` throw, because `explicitCwd` is consumed AFTER the guard. The "well-defined with no active project" claim is false against the current handler shape.

Minimal fix: either (a) drop the no-active-project Home path as unreachable in Phase 1 and say so (it contradicts R-10's own finding that the StartupDialog modal always precedes Home), or (b) when adding `explicitCwd` to `tab:create`, move the cwd resolution so `explicitCwd` short-circuits the `workDir` guard (`const cwd = explicitCwd ?? workDir; if (!cwd) throw`), and apply the same to `tab:createShell`. Pick one; the plan currently asserts (a) is handled by (b) without the code change that makes (b) true.

---

## HIGH-4: The plan hardens a Home active-tab lookup that does not exist (StatusBar) while missing the ones that do (keybindings, TabBar)

Plan location: 2.2 ("the `StatusBar` active-tab lookup (`App.tsx:585`) ... must tolerate no match (render an empty/Home-appropriate value, never dereference `undefined.name`)"); 2.10 row H-4.

Code facts:

- `App.tsx:585` is `<StatusBar tabs={activeProjectTabs} hookStatus={hookStatus} />`. StatusBar (`StatusBar.tsx:30-60`) takes a `tabs` array and COUNTS statuses. It never receives `activeTabId`, never does `tabs.find(t => t.id === activeTabId)`, never dereferences `.name`. There is no active-tab lookup at `:585` to harden. The plan's H-4 hardening targets a phantom.
- The REAL `activeTabId`-keyed lookups that break when Home is active (`findIndex` returns -1):
  - `keybindings.ts:40` `cycleTab`: `tabs.findIndex(t => t.id === ctx.activeTabId())`. With Home active, `idx = -1`, `next = (-1 + 1 + len) % len = 0`. Ctrl+Tab silently jumps to the first tab. Recoverable, but undefined-by-design behavior the plan never enumerated.
  - `keybindings.ts:58` `Ctrl+`` `: `ctx.newDefaultShellTab(ctx.activeTabId() ?? undefined)` passes `HOME_TAB_ID` as `afterTabId`. In `tab:createShell`, `tabManager.getTab(HOME_TAB_ID)` is undefined, so projectId falls back to first project (benign), but the shell is NOT inserted after the intended tab.
  - `keybindings.ts:59` `Ctrl+F4`: `const id = ctx.activeTabId(); if (id) ctx.closeTab(id)`. `HOME_TAB_ID` is truthy, so this fires `tab:close` on a non-existent main-process tab.
  - `App.tsx:557` passes `activeTabId={activeTabId}` to TabBar; TabBar may highlight no tab when Home is active (cosmetic, but unspecified).

The plan's "enumerate and harden each `tabs.find(t => t.id === activeTabId)` consumer" (2.2) was clearly not run against the code: it named the one component that does not do the lookup and missed the global keybinding handlers that do. The keyboard-floor section (1.1, 6.3) specifies focus order INSIDE the Home region but says nothing about what the EXISTING global chords do when Home is the active surface.

Minimal fix: add a real enumeration. Either short-circuit each global chord when `activeTabId === HOME_TAB_ID` (Ctrl+F4 is a no-op, Ctrl+Tab cycles into real tabs from index 0 deliberately, Ctrl+` opens a shell with no `afterTabId`), or define `HOME_TAB_ID` handling in the `KeybindingContext`. Add a test that each global chord behaves defined-ly with Home active. Drop the StatusBar hardening or re-point it at TabBar's highlight.

---

## HIGH-5: M10's synchronous-dispatch test asserts the wrong thing; "app's share of activation latency is provably zero" is not what the code can guarantee

Plan locations: 1.5b, 3.1 step 3, M10 test ("clicking the hero primary action dispatches the inject intent and calls `setActiveTabId` in the SAME tick (no `await`/`setTimeout` between click and dispatch)").

The problem: the injection intent must travel to MAIN over the new `claude:injectQuery` IPC channel (3.1 step 4, 359). IPC from renderer to main is `ipcRenderer.invoke`/`send`, which is asynchronous by nature; you can DISPATCH it synchronously (call `send` in the same tick) but the create-tab-then-arm-pending sequence in MAIN is not same-tick with the click. More importantly, the tab must be CREATED first (`createTab` is `await window.claudeTerminal.createTab(...)`, an async IPC round-trip per R3's sketch and `preload.ts:30`) before there is a `tab.id` to arm the pending injection against. So the real sequence is: click -> `await createTab` (async) -> dispatch inject intent for the returned id. The "same tick, no await" claim collides with the fact that you need the created tab's id, which only comes back from an awaited IPC call.

The plan tries to have it both ways: 3.1 step 3 says "SYNCHRONOUSLY ... dispatch the inject intent to MAIN ... and call `setActiveTabId(tab.id)`" but `tab.id` is the result of an awaited `createTab`. You cannot both await the tab and dispatch in the same tick as the click.

Either the action awaits `createTab` (then the dispatch is NOT same-tick with the click, and the M10 same-tick assertion is unsatisfiable as written), or `createTab`+inject is folded into a single MAIN-side channel that takes the query and does the create+arm internally (then `setActiveTabId` cannot run in the renderer in the same tick because the renderer does not yet have the id). The "app's share is provably zero" framing is a slogan, not a buildable assertion against the actual async create path.

Minimal fix: define the real contract. Best option: make `claude:injectQuery` a single MAIN-side handler that creates the tab (with `explicitCwd`), arms the pending injection, starts the timeout, and RETURNS the new tab id; the renderer awaits it once and then `setActiveTabId(id)`. Drop the "same tick / zero app latency" assertion and replace it with a measurable one: the handler returns before any `idle` is required, and the pending-injection + timeout are armed in MAIN before the handler resolves (so a renderer reload after the await cannot orphan the query). That is the property that actually matters and is testable; "same tick as the click" is not.

---

## MEDIUM-6: The `onTabUpdate` Home guard (`if (tab.type === 'home') return prev;`) defends against an event that cannot occur

Plan locations: M3a change ("the `onTabUpdate` self-enforcing guard (`if (tab.type === 'home') return prev;`, `:362`)"), 2.10 row "Self-enforcing slot guard".

Code fact: `onTabUpdate` (`App.tsx:354-364`) receives tabs from `sendToRenderer('tab:updated', tab)`, which only ever sends tabs from `tabManager` (main process). Home is renderer-only and never enters `tabManager` (2.1, the plan's own locked decision). So a `type:'home'` tab can never arrive over `tab:updated`. The guard is dead defensive code. It is harmless, but the plan presents it as a load-bearing "self-enforcing slot guard" with its own test ("the `onTabUpdate` guard drops a `type:'home'` tab"), spending a test on an impossible input while the REAL appender risk (a main tab arriving and being appended via `:362` `[...prev, tab]` when the renderer is showing Home) is unaddressed. The actual concern at `:362` is that a newly created real tab appended while Home is active does not steal focus; the guard as written does nothing for that.

Minimal fix: either drop the guard (and its test) as defending nothing, or repurpose the test to the real invariant: appending a real tab while `activeTabId === HOME_TAB_ID` does not change `activeTabId` (Home stays put until the user navigates).

---

## MEDIUM-7: Remote-parity claim "remote reconnect lands on the first real tab" is asserted but the null-active-id path is not verified end to end

Plan locations: 2.1 remote-truth note, 3.5 table ("remote reconnect lands on the first real tab, no Home").

Code facts: when the last real tab closes and the desktop routes to Home (M3b), MAIN's `tabManager.activeTabId` is set by `removeTab` (`tab-manager.ts:75-81`): it picks `remaining[0]` or null. With zero real tabs it is null. On remote reconnect, `tabs:sync` rebuilds from `getAllTabs()` (R1 §(c)). The plan asserts the remote client "lands on the first real tab", but with zero real tabs there is no first real tab, and with one-or-more real tabs the desktop only routes to Home when the SAME-project successor is empty (M3b patches `:373` AND `:375`). The interaction between main's `activeTabId` (which may still point at a real tab in another project) and the desktop's Home sentinel is not traced. The plan needs to state what the remote shows when the desktop is on Home but main's active id is (a) null vs (b) a real tab in a different project. R5 §A flagged that remote must source from the event stream, not stubbed reads, but the specific Home-active reconnect state is asserted, not verified.

Minimal fix: trace the actual `web-client/main.tsx` reconnect behavior for both sub-cases and state the result, or downgrade the table cell to "remote behavior when desktop is on Home is out of scope for Phase 1 (Home is desktop-only); remote shows whatever main's last active real tab was, which may be null (blank)". Do not assert a behavior that has not been read out of `RemoteApp`.

---

## MEDIUM-8: The directory-watcher retraction is correct, but the ~20s poll as the SOLE mechanism has an unstated worst-case latency the demo acceptance ignores

Plan locations: 4.3 item 1-2, R-2, M4.

The plan correctly retracts the "re-arm on error" claim (the deaf-handle failure throws nothing). Good. But by making the ~20s poll the ONLY Phase-1 freshness mechanism, the worst-case staleness is poll_interval + producer_cadence in the bad-overlap case: the producer writes at T, the poll just missed it at T-1, next poll at T+19 reads the new state, but the producer's own cadence means a card that cleared at T is invisible until T+19. For the done-lane payoff (the one carrot), a finish can take up to ~20s to show "N closed today". The plan's Phase-1 demo acceptance ("the header reads N closed today after a needs-you card clears with real progress") does not bound this latency, and an ADHD-tuned dopamine beat that lands up to 20s after the finish is a degraded version of the reward the section is built around. Not a correctness defect, but the acceptance sentence overstates immediacy.

Minimal fix: state the worst-case payoff latency (~20s) in 1.5/M8b acceptance, or reduce the poll interval for the done-lane detection specifically (it is cheap, a stat + parse), or accept it explicitly as a known Phase-1 limitation tied to open question 2's tuning pass.

---

## LOW-9: `composeClaudeQuery({action, repo})` cannot build the `draftFirstVersion` body from `{action, repo}` alone

Plan locations: 3.4 (`composeClaudeQuery({ action: KnownActionId, repo: string })`), 1.7 (the slot "filled from slug/name + fixed kind label only").

The signature `{action, repo}` carries the repo path, but `draftFirstVersion`'s canned body is "Draft the first version of `<repo-scoped deliverable>` so I can review and send it", where the slot is the program slug/NAME plus a fixed KIND label (1.7). `repo` is `repos[0]` (a relative slug like `clinical-notes`), which the plan itself notes is often NOT the deliverable's name (`incomplete-notes` has `repos[0]=clinical-notes`). So either the body is filled from `repo` (wrong, per the plan's own honesty note that this produces a near-meaningless query) or the signature is missing the program slug/name + kind label it actually needs. The signature and the fill rule disagree.

Minimal fix: widen the signature to `composeClaudeQuery({ action, programSlug, programName, kind })` (all producer-COMPUTED, PHI-free) and drop the bare `repo`-as-deliverable framing, or state that `draftFirstVersion` uses `programName` and `repo` is only for the action's cwd target. Keep zero free-text interpolation either way; both slug and name are producer fields.

---

## What holds up (so the plan owner knows what I tried and could not break)

- The atomic-write / `fs.watch` reasoning (R4) is correct: `state.py` does temp + `os.replace`, and `ipc-handlers.ts:142` is a single-file watcher that must not be copied. The retraction of the re-arm claim is right.
- `tab:createShell` genuinely accepts `explicitCwd` (`:515,531`); the asymmetry with `tab:create` (no arbitrary-cwd param, `:363-369`) is real; adding `explicitCwd` to `tab:create` mirroring it is the right minimal move (modulo the guard-ordering fix in HIGH-3).
- The `--plan` flag concern is real (`PERMISSION_FLAGS.plan = ['--plan']`, `types.ts:70-75`) and the in-scope mitigation (force `bypassPermissions` on the injected tab) correctly removes the idle-gate-wedge from the dashboard path; filing the user-facing fix separately is right.
- The CRLF decision (`\r` not `\r\n`, R3 §(c)) matches `Terminal.tsx` xterm `onData` and the `\x0c` precedent.
- The logger-leak severity is accurate: `logger.init(dir)` is per-opened-project (`ipc-handlers.ts:205,284`) and writes inside the repo tree; moving to `userData` is the real fix, the mirror gate is correctly NOT credited as the control.
- Renderer-only Home avoiding `TabManager` is the right call to dodge the `ipc-handlers.ts:105` activation-count and the `tabs:sync` phantom-tab hazards.

The plan's defenses are strong everywhere except the injection mechanism's exact wiring (CRITICAL-1) and its notification interaction (HIGH-2), which together mean the headline feature, as specified, does not work on first click. Those two must be fixed before M10 is opened, and the M10 test must drive a real `tab:ready` first-idle, not a `tab:status:idle` event.
