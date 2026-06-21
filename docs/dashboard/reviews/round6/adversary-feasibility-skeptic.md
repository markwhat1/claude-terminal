# Round 6 Adversary Review — Integration / Feasibility Skeptic

**Lens:** attack any mechanism that may not actually work on the `dashboard` branch
(`ce2e9e0`). Write-after-ready timing, fs.watch on atomic rename, hero-ranking under
the unreliable `requires_response`, remote parity, the renderer-only Home guards.

**Method:** every claim below was checked against the real source in the build-target
worktree, not against the recon. The plan is unusually strong: it has already absorbed a
prior integration-skeptic pass and pre-empted most of the obvious breakage (the
convergence-point idle gate, the cwd-discard remote correction, the MAIN-owned pending
state, the `waitingSince`/`statusSince` split, the `firstActivityAt:null` floor guard,
the per-file-vs-directory watch hazard, the poll-primary inversion). I could not break
those; they hold against the code. What follows is the residual set that still does not
fully survive contact with the branch.

Verification anchors I read directly: `hook-router.ts` (full), `ipc-handlers.ts:336-410,
515-547`, `index.ts:75-99`, `web-remote-server.ts:316-350`, `keybindings.ts:36-96`,
`on-session-start.js`, `pty-manager.ts:66`, live `state.json` (18 programs, relative
slugs), the on-disk hero repos, and the global/per-repo git-ignore state.

---

## D1 (HIGH) — The per-spawn `bypassPermissions` override has no buildable mechanism in M10's change list

**Where:** Plan 3.1 step 8, R-4 mitigation, M10 change-list (3); against
`ipc-handlers.ts:390`.

The plan commits, in scope for Phase 1, that "the dashboard-spawned injection tab passes
an explicit `bypassPermissions`/`default` regardless of the workspace `permissionMode`"
so the `--plan` bug (9.1) cannot wedge the idle gate. This is the load-bearing mitigation
for R-4: without it, a workspace in plan mode makes EVERY hero click silently time out for
the full 30s.

But the mechanism does not exist and is not in the change list. `tab:create` reads the
permission flags ONLY from module-scope state: `const args = [...(PERMISSION_FLAGS[state.permissionMode] ?? [])]`
(`ipc-handlers.ts:390`; the only writers are `settings:permissionMode` at `:177` and the
startup path at `:270`). There is NO per-call permission parameter. M10's change list adds
exactly one new param to `tab:create`: `explicitCwd`. Adding `explicitCwd` does nothing to
the permission flags.

So to deliver step 8 you must EITHER add a SECOND new param (a per-call permission mode) to
the already-overloaded dual-signature `tab:create` handler, OR have the injection handler
temporarily mutate `state.permissionMode` around the spawn (racy: a concurrent normal
spawn in the same tick inherits the wrong mode). The plan names the requirement but lists
only `explicitCwd`, so a builder following M10's change list ships the cwd param, never
touches permission flags, and R-4 is unmitigated.

**Fix:** add a second optional param to `tab:create` (e.g. `permissionModeOverride?: PermissionMode`)
alongside `explicitCwd`, applied at `:390` as `PERMISSION_FLAGS[permissionModeOverride ?? state.permissionMode]`,
and name it in M10 sub-step (2). Add an M10 test that an injection spawn in a plan-mode
workspace still produces `--dangerously-skip-permissions` (or the default flags), not
`--plan`.

---

## D2 (HIGH) — The shared pending-injection Map has no specified owner across the three MAIN modules

**Where:** Plan 3.1 steps 3-4, M10 change-list (3), the integration map row "Injection
write access"; against the module split in `index.ts:216` / `ipc-handlers.ts:65` /
`hook-router.ts:18`.

The plan repeatedly says the pending-injection Map + once-flag + timer are "OWNED in MAIN"
and treats MAIN as one place. MAIN is three separately-constructed modules wired by
explicit dependency injection:

- `claude:injectQuery` (the ARM side) lives in `ipc-handlers.ts` (`registerIpcHandlers`,
  `:65`), which receives `IpcHandlerDeps`.
- The idle gate (the CONSUME/clear side) lives in `hook-router.ts` (`createHookRouter`,
  `:18`), which receives `HookRouterDeps` and today does NOT import `ptyManager`
  (`:6-16`).
- They are constructed independently in `index.ts` (`createHookRouter({...})` at `:216`;
  `registerIpcHandlers` separately).

For the gate to read what the handler armed, the Map must be a single object shared by both
modules. The plan specifies the WRITE-access half ("extend `HookRouterDeps` or relocate the
write to `index.ts`") but never says where the Map is constructed or that `IpcHandlerDeps`
must ALSO carry it so `claude:injectQuery` can arm it. As written, a builder can put a Map
inside `createHookRouter`'s closure (so the gate sees it) and then have no handle to it from
`ipc-handlers`, or vice versa. This is the exact cross-module wiring class the plan caught
for the convergence point; it stopped one step short on Map ownership.

**Fix:** name the owner explicitly: construct the pending-injection Map (+ timers) in
`index.ts`, pass it into BOTH `HookRouterDeps` (gate reads/clears) and `IpcHandlerDeps`
(`claude:injectQuery` arms), or make the whole inject feature a small module constructed in
`index.ts` and injected into both. Add the `IpcHandlerDeps` extension to M10's change list
beside the `HookRouterDeps` one.

---

## D3 (MEDIUM) — The "no toast on the injected FIRST idle" test asserts the wrong idle and can pass while the real toast ships

**Where:** Plan 3.1 step 4b, M10 test ("an injection-driven first idle fires NO OS
notification"); against `hook-router.ts:104` vs `:125-131`.

Step 4b states the failure as: "the first idle would fire the OS 'Claude has finished
working' toast for the tab the user is actively watching." That is not how the code fires.
The FIRST idle for a freshly-spawned tab arrives via `tab:ready` with a sessionId, which
calls `updateStatus(tabId,'idle')` at `:104` and then falls straight to the emission at
`:167-170`. The `tab:ready` path contains NO `notifyTabActivity` call. The "Claude has
finished working" toast fires ONLY in the `tab:status:idle` case (`:130`), which is the
LATER Stop-hook idle after the user's first turn.

Consequence: the toast the user actually sees is the POST-injection Stop idle (when the
canned query's turn finishes), not the first idle. The M10 test as written ("first idle
fires no notification") passes trivially, because the first idle never notifies regardless
of any fix, so it green-lights while the real post-turn toast still fires for a non-MAIN-
active injected tab. The mitigation (drive MAIN-active / do-not-notify flag) is still
correct and still needed, but anchored and tested at the wrong event it provides false
assurance.

**Fix:** re-aim the assertion: after the injected write, drive a `tab:status:idle` (the
Stop-hook idle) for the injected tab while it is NOT the renderer-active tab, and assert
`notifyTabActivity`/`Notification` is not called BECAUSE the injection path set the tab
MAIN-active or a do-not-notify flag. The do-not-notify flag should persist for at least the
first post-injection Stop idle, not just the `tab:ready` idle.

---

## D4 (MEDIUM) — Global `core.excludesfile` does not exist; M0b's git-leak guard is a workspace-wide environment mutation, not a one-line add

**Where:** Plan 3.1, 3.6 (M0b "add `.claude/settings.local.json` and `.claude-terminal/`
to a global git excludesfile"), M0b change list; against live git config.

Verified on the box: `git config --global core.excludesfile` is NOT SET. `clinical-notes`
and `connections` do NOT ignore `.claude/settings.local.json` (confirmed via
`git check-ignore`), so the leak the plan describes is real. But the fix is not a "belt-and-
suspenders one-line add": there is no excludesfile to append to. M0b must CREATE a file and
RUN `git config --global core.excludesfile <path>`, which is a mutation of the user's entire
git environment (every repo on the machine, not the five), performed by an Electron app's
build/install. The plan treats this as a trivial guard and never flags it as a global side
effect. Two real risks: (a) clobbering a future user-set excludesfile, (b) the dashboard
silently changing git behavior workspace-wide.

Adjacent observation: `cad-portal` already ignores `.claude/` via its own `.gitignore` yet
TRACKS files under `.claude/skills/` and `.claude/workflows/`. A global excludesfile entry
scoped to the specific file `.claude/settings.local.json` (not the `.claude/` dir) is safe
there, so the plan's file-specific entry is the right granularity — but this confirms
`.claude/` handling is inconsistent per-repo and a dir-level global ignore would be wrong.

**Fix:** M0b should (1) check whether `core.excludesfile` is already set and APPEND rather
than overwrite, (2) create the file if absent, (3) scope entries to the specific files
(`.claude/settings.local.json`, not `.claude/`), (4) record in the DoD that this mutates
global git config, and (5) prefer the real fix (the logger move to `userData`, already in
M0b) as primary so the excludesfile is genuinely belt-and-suspenders, not the load-bearing
control for the hook-install artifact.

---

## D5 (MEDIUM) — `REMOTE_FORWARDED_CHANNELS` cannot be a flat string array; the six forwards have six distinct payload shapes

**Where:** Plan 2.4, M5 change/test; against `index.ts:80-98`.

M5 describes refactoring the forward chain into "an exported `REMOTE_FORWARDED_CHANNELS`
constant that `sendToRenderer` consults," tested by asserting the constant "contains the
FULL existing forwarded set." But the six branches are not uniform: `pty:data` broadcasts
`{type, tabId, data}` from `args[0],args[1]`; `tab:updated` broadcasts `{type, tab}` from
`args[0]`; `pty:resized` broadcasts `{type, tabId, cols, rows}` from `args[0..2]`;
`tab:worktreeProgress` from `args[0],args[1]`. A string-array constant cannot carry the
per-channel arg-to-payload mapping, so `sendToRenderer` cannot "consult" it and reconstruct
the right broadcast shape. The real refactor is a map of channel -> payload-shaper (or
keeping the switch and exporting only the channel-name SET for the absence test). The plan's
membership-only framing understates this; a builder who literally builds a
`broadcast({type: channel, ...args})` from a flat array will regress the `pty:data` /
`pty:resized` shapes.

The plan's own end-to-end survival test (M5 step 1b, "drive `sendToRenderer('tab:updated',
tab)` and assert it reaches the remote forward path") would catch a `tab:updated` shape
regression, but it only exercises ONE channel; a `pty:data` or `pty:resized` shape break
ships green because no test drives those through the refactored function.

**Fix:** specify the constant as a channel -> shaper map (or keep the switch and export a
separate `REMOTE_FORWARDED_CHANNELS` name-set used only by the absence assertion). Extend
the M5 end-to-end test to drive at least one MULTI-ARG channel (`pty:data` or
`pty:resized`) through the refactored `sendToRenderer` and assert the broadcast payload
shape, not just that it was forwarded.

---

## D6 (LOW) — Dashboard PowerShell tab is mis-attributed to `projects[0]` while running in the hero repo

**Where:** Plan 3.2 / M10 sub-step (4); against `ipc-handlers.ts:522-537`.

The PowerShell action reuses `createShellTab(shell, activeTabId, explicitCwd=heroRepo)`.
In the handler, when no `afterTabId` resolves a real parent, `projectId` falls back to
`projects[0]` (`:522-524`) while `cwd` becomes `explicitCwd` (the hero repo). The created
tab therefore carries `projectId = projects[0].id` but runs in a different tree, so it
appears under the wrong project in the sidebar and inherits that project's color tint. The
plan flagged the `project:add` side effects for the Claude path but did not flag this
projectId/cwd mismatch for the shell path. Cosmetic, not a data hazard, but it makes the
"opens in the hero's tree" affordance visually lie about which project it belongs to.

**Fix:** pass the resolved hero `afterTabId` only when it is a real tab; otherwise accept
that the shell is project-unattributed and ensure the helper text ("Open a shell in
clinical-notes") names the repo so the sidebar mismatch is legible, or set `projectId` to
null/the resolved program rather than `projects[0]`.

---

## D7 (LOW) — `ptyManager.write` silently no-ops on a dead PTY, and the timeout is already cleared by then

**Where:** Plan 3.1 steps 5-7; against `pty-manager.ts:66-68`.

`write(tabId, data)` is `this.ptys.get(tabId)?.process.write(data)` — a silent no-op if the
PTY is gone. The injection flow: first `idle` arrives, the gate writes the query AND clears
the 30s timeout / sets `injected=true`. If the tab's PTY dies in the narrow window between
the idle signal and the write landing (CLI crash on first turn, or a `/exit`-like race),
the write vanishes into the no-op and the timeout has already been cancelled, so NOTHING
surfaces the failure — the exact silent-drop the 30s fail-safe exists to prevent, for this
one ordering. Low probability, but it is the precise failure mode the plan elevates as "the
worst failure for an ADHD user who walked away."

**Fix:** have the gate check the write landed (e.g. `ptyManager.hasPty(tabId)` before
write, or surface a failed-inject status if the PTY is absent at write time) and emit the
`claude:injectStatus` failure rather than assuming the write always reaches a live PTY.

---

## D8 (LOW) — M3a-iii over-states two of the three "Home-breaking" chords; only Ctrl+F4 is a true defect

**Where:** Plan 2.2 / 2.10 / M3a-iii; against `keybindings.ts:37-43, 58, 59`.

Re-grounding the three named chords against the real registry:

- **Ctrl+F4 (`:59`)** IS a real defect: `const id = ctx.activeTabId(); if (id) ctx.closeTab(id)`
  — with Home active, `id = HOME_TAB_ID` is truthy, so `closeTab(HOME_TAB_ID)` fires
  `tab:close` on a non-existent main tab. Correctly identified. Worth hardening.
- **Ctrl+Tab / `cycleTab` (`:40`)**: with Home active, `findIndex` returns -1, so
  `next = (-1 + 1 + len) % len = 0`, i.e. it jumps to `tabs[0]`. The plan's prescribed fix
  ("Ctrl+Tab cycles into the real tabs deliberately") is EXACTLY the existing behavior, so
  there is nothing to change; M3a-iii spends a test pinning behavior that already holds.
- **Ctrl+\` (`:58`)**: passes `HOME_TAB_ID` as `afterTabId` to `createShellTab`;
  `getTab(HOME_TAB_ID)` is undefined, so it falls back to `projects[0]` and `workDir` and
  opens a shell with no insert-after. Harmless today; the plan's "open with no afterTabId"
  is a tidy-up, not a crash fix.

Not a correctness risk — the plan is conservative, which is fine — but it inflates M3a-iii's
scope. More importantly, the plan says "short-circuit each global chord IN
`keybindings.ts`," yet the chords are declarative `action: (ctx) => ...` entries; the
short-circuit cleanly belongs in the dispatcher that runs `matchKeybinding` then invokes the
action (or in the `KeybindingContext` methods), not as edits to the registry array. Minor
seam imprecision.

**Fix:** narrow M3a-iii to the Ctrl+F4 guard as the load-bearing fix; keep Ctrl+\` as
tidy-up; drop the Ctrl+Tab "fix" (assert existing behavior is acceptable, or note no change
needed). State that the short-circuit lives in the dispatcher/context, not the registry
entries.

---

## What I could NOT break (verified, holds against the branch)

- **Write-after-ready idle gate at the convergence point.** Confirmed the first idle for a
  fresh tab arrives via `tab:ready` -> `updateStatus(...,'idle')` at `:104` -> emission
  `:167-170`, and `on-session-start.js` sends a real `session_id`, so gating the emission on
  `status==='idle'` catches the first idle. Gating only `tab:status:idle:125` would indeed
  miss it. The plan is right and its M10 test (drive a real `tab:ready`, reject a
  `tab:status:idle`-only test) is the correct discriminator.
- **CR-not-CRLF write.** `\r` matches xterm Enter; `pty:write -> ptyManager.write ->
  process.write` does no translation. Correct.
- **`waitingSince` vs `statusSince` clock separation.** Traced the snippet across
  `working->idle->idle->requires_response->working->idle`; the waiting clock starts once per
  continuous wait span, survives the idle->requires_response overlay, and clears on a new
  turn. Sound.
- **`firstActivityAt:null` / `waitingSince:null` floor guard.** The `now - null` 56-year
  trap is real and the `waitingSince !== null && ...` predicate closes it. Correct.
- **Renderer-only Home / never in TabManager.** Confirmed `getAllTabs()`-derived counts and
  the activation guard `:105` never see Home; the appender at `:362` cannot receive a
  `type:'home'` tab (it only forwards `tabManager` tabs), so dropping the impossible-input
  guard for the focus-steal invariant is right.
- **Remote cwd-discard correction.** `web-remote-server.ts:322-323` hardcodes
  `state.workspaceDir`; disabling remote Open-Claude is the correct override of R5 §D.
- **program-board path + relative slugs.** Live `state.json` at the workspace-root
  `dashboard/`, 18 programs, `repos[0]` relative slugs, all hero repo dirs exist as git
  repos. `WORKSPACE_ROOT + repos[0]` is valid.
- **Poll-primary inversion over the deaf watcher.** The "no error to re-arm on" reasoning is
  correct; making the ~20s poll the sole tested mechanism is the right call.
- **`requires_response` demoted to overlay; `idle`+`hadActivity`+idle-floor as the spine.**
  Confirmed `requires_response` has a single producer (the Notification hook) and the spine
  rests on the Stop-driven idle. Sound under `bypassPermissions`.

---

## Severity summary

| ID | Severity | One-line |
|----|----------|----------|
| D1 | HIGH   | Per-spawn `bypassPermissions` override has no param/mechanism in M10; R-4 unmitigated |
| D2 | HIGH   | Shared pending-injection Map has no named cross-module owner (ipc-handlers vs hook-router) |
| D3 | MEDIUM | "No toast on first idle" test asserts the wrong idle; passes while the real post-turn toast ships |
| D4 | MEDIUM | No global `core.excludesfile` exists; M0b's git guard is a workspace-wide env mutation, not a one-liner |
| D5 | MEDIUM | `REMOTE_FORWARDED_CHANNELS` can't be a flat array; six forwards have six payload shapes |
| D6 | LOW    | Dashboard PowerShell tab mis-attributed to `projects[0]` while running in hero repo |
| D7 | LOW    | `ptyManager.write` silent no-op on dead PTY after the timeout is already cleared = silent drop |
| D8 | LOW    | M3a-iii over-states two chords; only Ctrl+F4 is a real defect; short-circuit seam mis-located |
