# Adversary review (round 5) — Security / privacy skeptic

Lens: hunt PHI/secret leak paths (argv, logger, DevTools mirror, remote client, LLM), remote exposure, and any place the scrub is policy not control.

Target: `docs/dashboard/PLAN.md` (round-5 revision, build HEAD `ce2e9e0`). All code citations re-verified against the `dashboard` worktree source this pass.

## Bottom line

This is the most security-aware revision yet. The plan has already self-found and named the big standing leaks: the logger-into-git-tree path (M0b), the DevTools mirror over-credit, the openExternal asymmetry, the branded `ClaudeQueryLine` choke point, the remote scrollback/tab-title/pty:write/tab:rename paths (R-9/R-9b/R-11/R-14), the `userData` relocation of app-owned writes, and the path validator. I verified each of those claims against source and they hold.

But it ships one NEW write-into-a-sensitive-git-tree path created by its own headline Phase-1 action, and it makes that path's safety a false claim. It also leaves several "controls" honestly labeled as policy-not-control yet still on the Phase-1 critical path with no enforced gate. The defects below are where the round-5 plan still fails, ordered by severity.

---

## CRITICAL — the hero action installs ClaudeTerminal hooks into the hero program's git tree, and the plan claims it does not

**Where:** Section 2.5, 3.1, 2.10 (the `tab:create explicitCwd param` row). Plan text (3.1): the `explicitCwd` route "spawns in `WORKSPACE_ROOT + program.repos[0]` WITHOUT calling `project:add`" and (2.10) "spawn in `repos[0]` WITHOUT `project:add` (no sidebar project / hook install)."

**The defect:** The claim that routing through `tab:create` + `explicitCwd` avoids hook install is false against the actual handler. `tab:create` (`ipc-handlers.ts:385-388`, verified this pass) UNCONDITIONALLY runs:

```
const installer = project?.hookInstaller ?? state.hookInstaller;
if (installer) { installer.install(cwd); }
```

`installer.install(targetDir)` writes `.claude/settings.local.json` INTO `targetDir` (`hook-installer.ts:42-50`, verified: `path.join(targetDir, '.claude')` + `mkdirSync` + write). Adding an `explicitCwd` param changes the cwd but does NOT skip this block. So clicking the hero spawns a Claude tab in `program.repos[0]` AND installs ClaudeTerminal hooks into that repo's working tree, without Mark ever registering it as a project.

This is exactly the class of uninvited-write-into-a-sensitive-tree leak the plan elevated to CRITICAL for the logger (M0b, 3.6) and then missed for the action it ships first. It is worse than the `project:add` side effects the plan says it is avoiding: it produces the hook-install side effect anyway, silently.

**Severity driver (verified):** `clinical-notes` and `connections` do NOT gitignore `.claude/` (checked their `.gitignore`). `clinical-notes` is the verified `repos[0]` of `incomplete-notes`, which the plan itself names a likely Phase-1 hero (the single-item-DoD card, 1.11/appendix). So the most likely hero click writes a committable `.claude/settings.local.json` into a PHI-adjacent repo. (cad-portal `.claude/`, open-dental and practice-analytics `.claude/settings.local.json` ARE ignored, so the leak is repo-dependent, not universal, which is its own trap: it ships green and leaks only for some heroes.)

Contrast the PowerShell action: `createShellTab` does NOT install hooks (`ipc-handlers.ts:537-547`, verified), so the plan's PowerShell path is clean. The asymmetry is the tell that the Open-Claude path's hook-install was not reasoned through.

**Minimal fix:** M10's `explicitCwd` addition to `tab:create` must also carry a `skipHookInstall` (or `ephemeral:true`) flag that gates the `installer.install(cwd)` block, set true for the dashboard injection spawn. Add an M10 test asserting that a `tab:create` with `explicitCwd` + the flag does NOT call `hookInstaller.install`. Without hooks installed, write-after-ready still works only if `on-session-start.js` fires; the plan's whole injection mechanism depends on the hook firing for that cwd (3.1 step 7 says so). So this is not free: skipping hook install means the idle gate may never fire and every hero click times out at 30s. The real resolution is either (a) install hooks into a fixed app-owned temp/sentinel and spawn there, not the repo, or (b) accept the hook install but make it land somewhere ignored, or (c) document that the hero action requires hook install into the hero repo and gitignore-guard it. The plan currently asserts (no install) what the code does (always installs) AND depends on the install for the feature to work. That contradiction is unresolved and must be before M10.

---

## HIGH — `composeClaudeQuery` is honestly labeled "call-site control, not channel control", but the plan still ships a renderer with `actions.copy.text` carrying free text and no enforced ban

**Where:** Section 3.4 (the choke point), 3.3 (Copy), 4.1 (`DashboardItem.actions.copy.text`), 3.6 (the branded type).

**The defect:** The branded `ClaudeQueryLine` type genuinely constrains the injection write at compile time (good, verified the injection write is the only consumer in the plan). But the Copy action is `navigator.clipboard.writeText(actions.copy.text)` where `copy.text` is a plain `string` composed in the renderer mapper. The plan says (3.3) "copy payload composes from already-plain-string fields" and forbids interpolating `blocked_on`/`needs_you_reasons` into RUNNABLE commands. But `detail` (= `blocked_on` text, per 4.1) and `needsYouReasons` are right there on the item, and nothing at compile time stops a future mapper line from doing `copy: { text: item.detail }`. The clipboard is a leak surface too: a copied PHI-bearing `detail` lands on the remote user's device clipboard when the (remote-enabled) Copy action runs (3.3 says Copy works remotely). The plan's own M0b assertion covers `writeToPty` (never gets `detail`/`blocked_on`/`dod.gaps`) but does NOT cover `clipboard.writeText` or the `copy.text` field.

**Minimal fix:** Extend the M0b/M8a mapper assertion to also assert the renderer never passes `detail`/`blocked_on`/`needs_you_reasons`/`dod.gaps` into `actions.copy.text` OR `navigator.clipboard.writeText`. Better: make `copy.text` a branded `InertDisplayString` type produced only by a `composeCopy()` whitelist, mirroring the `ClaudeQueryLine` discipline, so the clipboard sink gets the same compile-time guarantee the PTY write got. As written, the clipboard is the one free-text sink in Phase 1 with no enforced control and a remote reach.

---

## HIGH — the canned-query "PHI cannot leak" guarantee rests on `program.slug`/`name` being clean, which is asserted nowhere

**Where:** Section 1.7, 3.4 (the canned default, "slot filled from slug/name + fixed kind label only", "zero PHI surface").

**The defect:** The entire Phase-1 leak-free claim for the injected query is: the only interpolated value is `program.slug`/`name` + a fixed kind label, and those are dev identifiers, so no PHI. That is true for TODAY's 18 programs (verified: `cad-staff-portal`, `od-query-consolidation`, etc., all dev slugs). But `slug`/`name` come from the per-program override YAMLs (`dashboard/programs/*.yml`) and the producer, which is an UNTRUSTED read source by the plan's own 3.6 framing. A program named after a patient case (Mark tracks consults; a future YAML could carry `name: "Smith airway consult"`) would flow verbatim into `composeClaudeQuery`, into the PTY write, into the new tab's Haiku auto-name (tab-namer at 500 chars, R-14), and into the remote-broadcast `tab.name`. The "zero PHI surface" is a property of current data, not a control. The plan validates the state.json PATH (`isStateJsonPathSafe`) but never validates or constrains the CONTENT of `slug`/`name` it interpolates into an LLM query and a remote-broadcast title.

**Minimal fix:** State plainly that the canned-query leak-free guarantee is conditional on program slugs/names being non-PHI dev identifiers, and add that as an explicit producer-side contract (program names must be dev identifiers, never case/patient labels) OR run `slug`/`name` through the same id-only/length treatment before interpolation. At minimum this belongs in the risk register as a named residual (it currently is not), because the plan repeatedly bills slug-only filling as "zero PHI surface" without the precondition.

---

## HIGH — the remote `tab:create` hook-install into `workspaceDir` is a standing uninvited-write path the plan does not name

**Where:** Section 3.1 remote-parity (cites `web-remote-server.ts:316-323`), R-9/R-11.

**The defect:** The plan correctly disables the dashboard's Open-Claude action remotely because the remote `tab:create` discards cwd. But it analyzes only the MISROUTING risk (canned query runs against `state.workspaceDir`). It misses that the remote `tab:create` handler also calls `state.hookInstaller.install(cwd)` (`web-remote-server.ts:323-325`, verified) into `state.workspaceDir`, AND spawns a Claude session there with `PERMISSION_FLAGS[state.permissionMode]` (which defaults to `bypassPermissions`, verified `settings-store.ts` DEFAULTS). So an authed remote client can spawn a `--dangerously-skip-permissions` Claude session at the workspace root and `pty:write` arbitrary instructions into it (R-11 covers the pty:write but not the bypass-permissions spawn it lands in). This is a pre-existing remote-access hole, not dashboard code, but it is in the same family as R-9/R-11 and the plan's remote-security filing should name it: remote tab:create yields a workspace-root, permissions-bypassed agent reachable by anyone holding the 6-char token over the public tunnel.

**Minimal fix:** Add to the filed remote-security issue (R-9): the remote `tab:create` spawns at workspace root with the host's permission mode (commonly `bypassPermissions`); recommend forcing `default` mode and a fixed safe cwd for remote-created tabs, or disabling remote tab:create entirely. Reference it in R-11 so the residual register is complete.

---

## MEDIUM — DevTools is reachable in production via the menu accelerator, not only the Ctrl+Shift+I chord the plan gates

**Where:** Section 3.6 (DevTools chord gating, "optionally gates the `Ctrl+Shift+I` toggle to dev builds").

**The defect:** The plan treats `index.ts:307-309` (the `before-input-event` Ctrl+Shift+I handler) as the DevTools entry point and optionally gates it. It correctly says the real control is REDACTION not the mirror gate, which is right. But it should verify there is no OTHER DevTools opener: Electron's default application menu includes a "Toggle Developer Tools" item (and F12 in many configs) unless the menu is replaced/removed. If the app keeps the default menu, gating only the custom chord leaves DevTools openable, and the mirror (gated to warn/error in M0b) still surfaces any `warn`/`error` line that interpolates state. The plan's own appendix does not record whether the default menu is suppressed. An ungated DevTools opener turns the warn/error mirror into a live PHI console for any `log.warn`/`log.error` that happens to interpolate a tab name or state field.

**Minimal fix:** M0b should verify and record whether the default Electron menu (with Toggle DevTools / F12) is present in production; if so, remove the DevTools menu item in packaged builds, not just gate the custom chord. Pair with the M0b assertion that no `log.warn`/`log.error` call interpolates `title`/`detail`/`name`/`blocked_on` (the plan asserts this for `log.*` generally in 3.6/M0b; make sure warn/error are in scope since those are the levels that still reach the mirror).

---

## MEDIUM — `scrubFreeText` and the canned-only path are policy enforced by review, not by a build gate

**Where:** Section 3.4 ("The opt-in free-text branch ships DISABLED, gated behind explicit per-use confirmation IN CODE"), 1.7.

**The defect:** The plan is admirably honest that `scrubFreeText` is harm-reduction not a control and cannot enumerate patient names. Good. But the "only canned templates are enabled" guarantee is enforced by the branded type ONLY for the PTY write. The mapper builds `actions.claudeQuery: { action: KnownActionId, repo }`, and `composeClaudeQuery` takes only `{action, repo}`. That IS a real gate for the query body. The gap: the plan repeatedly says a Phase-2/3 opt-in "MAY allow `dod.gaps[0]` behind the scrubber". There is no build-time tripwire that fails CI if a future contributor wires `dod.gaps[0]` (or `detail`) into the slot. "Gated behind explicit per-use confirmation in code" is described but not specified as a testable invariant. Given this codebase's pattern (the plan elsewhere insists controls be tests not conventions), the free-text opt-in deserves the same: a test that asserts `composeClaudeQuery`'s only string inputs are `KnownActionId` + a path-shaped repo, and a test that asserts no producer free-text field (`detail`, `dod.gaps`, `blocked_on`, `needs_you_reasons`) appears in any composed query for any `KnownActionId`. The plan's 1.7 says "the test asserts ZERO interpolated free text reaches the composed body" — make that the load-bearing, named invariant test, and state that the Phase-2/3 opt-in cannot ship without deleting/modifying that test (so the deletion is the visible decision point), rather than "per-use confirmation in code" prose.

**Minimal fix:** Promote the "zero free text in composed body" assertion to a named regression test that any free-text opt-in must explicitly defeat, and say so in 3.4. Convert the policy into a gate whose removal is reviewable.

---

## MEDIUM — argv leak surface for the positional-prompt LATER optimization is dismissed as "does not apply in Phase 1" but the deferral has no guard

**Where:** Section 3.4 residual ("cmd.exe argv quoting ... does not apply in Phase 1"), Section 9.3 (positional spawn gated on a spike).

**The defect:** Correct that write-after-ready never puts the query in argv. But the plan keeps the positional-prompt path alive as a future opt-in `initialPrompt` arg threaded through `tab:create` AND the REMOTE `web-remote-server.ts:316` (9.3). If that ever ships, the query string becomes a `cmd.exe /c claude "<prompt>"` argument, which is BOTH an argv/process-list exposure (visible to any local process via process enumeration, and to the logger if the spawn args are ever logged) AND a quoting-injection surface. The plan notes the quoting risk for content-vs-quoting but does not note the argv-as-leak-surface dimension (process list / Sysmon / EDR captures full command lines, and this is a PHI-server-adjacent work PC). For a positional prompt carrying any free text, the PHI lands in the Windows process command line.

**Minimal fix:** Add to 9.3/Section 10 that the positional-prompt optimization, if ever pursued, puts the query in the process command line (argv), a PHI/secret exposure to local process enumeration and EDR independent of the quoting concern, so it must stay canned-only and is a second reason write-after-ready is preferred. The spike's acceptance criteria should include "no free-text prompt in argv".

---

## LOW — the userData log re-wipes on every project open, losing prior-session diagnostics (regression, not a leak)

**Where:** Section 3.6 / 9.4 / M0b (move log to `app.getPath('userData')/logs/main.log`, "ignore the incoming `dir`").

**The defect:** `logger.init` does an unconditional wipe of the log file each call (`logger.ts:67-69`, verified). Today `init(dir)` is per-project so each project gets its own (wiped) log in its own tree. After M0b ignores `dir` and writes one fixed userData log, the per-project-add `init` calls (`ipc-handlers.ts:205,284`) all target the SAME file and each re-wipes it. Opening a second project mid-session erases the first project's logs. Not a security defect (it actually shrinks the on-disk window, which the plan counts as a benefit), but it silently destroys diagnostics, and a future dev "fixing" the missing logs is exactly the reopen-the-leak risk the plan warns about elsewhere.

**Minimal fix:** In M0b, make `logger.init` idempotent (wipe once per process, e.g. guard on `_logStream` already open / a `_initialized` flag), so the second project-open `init` does not re-wipe. One line, and it removes a foot-gun that invites re-introducing the mirror leak.

---

## Notes on claims I verified as SOUND (so the build does not re-litigate them)

- Logger writes inside the opened repo tree today, `init` is per-project, prompt-prefix lines log `data.substring(0,80)` / `prompt.substring(0,80)` — all verified (`logger.ts:60-64`, `ipc-handlers.ts:205,284`, `hook-router.ts:56`, `tab-namer.ts:74`). M0b's diagnosis is accurate.
- Remote token is 6 chars over the 31-char alphabet; auth uses `crypto.timingSafeEqual` with a length precheck (`web-remote-server.ts:227-230`) so it does not throw and is constant-time; the public Cloudflare quick tunnel with no Access (`tunnel-manager.ts:25,103`) is the real exposure. Verified. R-9 framing is correct.
- `tabs:sync`/`tab:updated` broadcast the full `Tab` incl. `name` (Haiku-summarized first prompt) and absolute `cwd`; `tab.name` derives from the first prompt (`tab-namer.ts:57`). Verified. R-9b is a real standing PHI-to-remote path and correctly named.
- `handleMessage` is a switch with no default passthrough (verified), so `program-board:getState` stays local-only; remote `pty:write` passes raw bytes; remote `tab:rename` trusts `msg.name` unbounded; remote `tab:create` hardcodes `state.workspaceDir` and discards cwd. All verified. R-11/R-14 accurate.
- No connection/rate limiting on the WebSocket server (verified absent), so R-9 #3 (do-now failed-auth counter) is correctly identified.
- `userData` survives reinstall (settings-store/workspace-store persist there, no wipe), so `closed.json` under userData achieves the plan's stated morning-glance persistence.
- The `ClaudeQueryLine` brand genuinely constrains the injection PTY write at compile time; the openExternal asymmetry (`setWindowOpenHandler` always vs `will-navigate` non-app-only, `index.ts:294-305`) is real and the shared-predicate fix preserves the dev-server passthrough correctly.

The plan's self-honesty is its strength. The remaining defects are: one false safety claim on the headline action (CRITICAL), and several places where a correctly-identified residual is still policy rather than a build gate (HIGH/MEDIUM).
