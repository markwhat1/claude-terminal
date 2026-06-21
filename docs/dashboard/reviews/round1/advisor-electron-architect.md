# Advisor Review: Electron/React Architect Lens

Plan reviewed: `docs/dashboard/PLAN.md` (In-App Dashboard / Home View).
Recon read: round2 R1-R6, plus direct source verification against the `dashboard` worktree at HEAD `ce2e9e0`.
Reviewer lens: Electron/React architecture, reuse, renderer-only Home, AGENTS.md IPC discipline, remote-safe Tab additions.

## Verdict

Strong plan, around 7.5/10 as written. The integration map is honest, the three R-doc corrections are honored throughout, Home stays renderer-only, and the one new Phase-1 IPC channel gets the full five-part AGENTS.md treatment. I verified the load-bearing citations against source and they hold: `types.ts:1,3,7-21`, `tab-manager.ts:55-58` (the flat `updateStatus` with no timestamp), `App.tsx:341-344`, `:373`, `:577-583` (render map inside `data-terminal-area` `:576`), `:113-121`, `:334`, `:517`, the registration test at `tests/main/ipc-handlers.test.ts:182-209` (the `expectedHandlers` array + `listeners.has`), `ws-bridge.ts:261-263` (`createShellTab` throws), the keybinding matcher arms (`ctrl+shift` requires `!e.altKey`, `ctrl` requires `!e.shiftKey`), and the hook-router idle collapse (`hook-router.ts:104` sets `idle` on `tab:ready`, emits `tab:updated` at `:44`/`:169`, so the renderer never sees `tab:ready`). R2's spine verdict is well-grounded (only producer of `requires_response` is the Notification hook, suppressed under `bypassPermissions`).

What keeps it off 9/10 is a split-brain in the liveness model, a sourcing slip in the program-board citations, a missing backfill path for tabs that exist before Home first renders, and a few places where the plan describes a behavior without binding it to a concrete seam or a test. Specifics below.

---

## Must-fix (architecture correctness)

### MF-1. The `hadActivity` spine has no home and no backfill. This is the highest-impact gap.

R2 makes idle + `hadActivity` the PRIMARY needs-you signal, and the whole ranking (Tier 2, Section 5.2) and the strip grouping (Section 6.4, M9) depend on it. But the plan splits the liveness model across the process boundary in a way that breaks on the exact events Home must survive:

- `statusSince` / `lastActivityAt` are stamped in MAIN (`tab-manager.updateStatus`, M1) and ride the wire as additive `Tab` fields.
- `hadActivity` is computed RENDERER-side "in App from the status stream" (M9).

Three concrete failures fall out:

1. **Cold-open backfill.** When Home first renders (or `startupView: 'home'` lands the user there at launch), tabs may already be `working` or `idle` from a restored session. The renderer never saw their first `working` transition, so `hadActivity` is false for every pre-existing tab. A resumed session that is genuinely waiting on the user reads as "ready, not needs-you" and never enters Tier 2. R2's whole point is defeated for restored tabs.
2. **Remote reconnect.** The web client builds its tab model from `tabs:sync` (full `Tab[]`). `hadActivity` is not a `Tab` field, so a remote Home that reconnects mid-session has no activity history at all. Section 3.5 claims the strip "still works" remotely via forwarded `onTabUpdate`/`tabs:sync`, but the grouping it promises (needs-you on top) cannot be computed without `hadActivity`.
3. **Reload.** A renderer reload (dev hot-reload, or the user re-opening) wipes the renderer-only flag while `statusSince` survives in main. Inconsistent liveness between two reads.

Fix: make `hadActivity` a derived field of the SAME main-side model, not a renderer parallel. Cheapest correct version: add a third additive `Tab` field `hadActivity: boolean` (or derive it from a `firstActivityAt: number | null`) stamped in `tab-manager.updateStatus` the first time status enters `working`, persisted nowhere but living in `TabManager` so it survives renderer reload and rides `tabs:sync` to remote for free. This also collapses M1 and the M9 "compute hadActivity in App" step into one main-side change with one test, which is more boringly-small than the current split. If you keep it renderer-side, you MUST add an explicit cold-open backfill rule (treat any tab already past `new` at Home-mount as `hadActivity: true`, the conservative choice that surfaces rather than hides) and a test for it, and accept that remote loses the signal.

### MF-2. Program-board source citations point at bare filenames that do not exist at those paths.

The plan cites `state.py:6-11`, `config.py:4,16`, `web.py:33-35`, `poller.py:115,116`, `board.html:13`. The line numbers are correct, but these files live at `infrastructure/program-board/src/program_board/state.py` (and `.../web.py`, `.../poller.py`, `.../config.py`), with `board.html` under `.../program_board/templates/` (verify), NOT at top-level `state.py`. A builder following the plan literally cannot find them. The `dashboard/` directory the plan also references holds only the DATA output (`state.json`, `enrichment.json`, `programs/`), not the producer source. Fix: re-path every program-board citation to `infrastructure/program-board/src/program_board/<file>`. This is the same class of error the R1 doc was written to correct (dev-vs-dashboard branch citations); it just slipped on the cross-repo producer.

### MF-3. The verbatim "Clear. Keep working." string is at `board.html:16`, not `:13`.

Verified: `board.html:13` is the `hx-get="/partials/board"` trigger div; line 16 is `{% if not needs_you %}<p class="empty">Clear. Keep working.</p>{% endif %}`. The plan leans on this exact string for the caught-up empty state (Sections 1.2, 4.3, 6.5) and stakes its credibility on citation precision, so fix the line number. (The string itself is correct, so the behavior is fine; only the citation is off.)

---

## Top improvements (toward 9/10)

### TI-1. Bind the render-seam branch to one concrete JSX shape, and decide the `[homeTab, ...tabs]` iteration vs the separate-slot store.

Section 2.3 makes a clean decision (keep Home OUT of the `tabs` array, in a separate renderer slot) and Section 2.2 says "render `<HomeView>` instead of a `<Terminal>`." But the render map (`App.tsx:577-583`) iterates `tabs.map(...)`. If Home is not in `tabs`, the JSX must render Home as a SIBLING of the `tabs.map`, gated by `activeTabId === HOME_TAB_ID`, not branched inside the map (there is nothing to branch on, since Home is not in the array). Section 2.7's table row says "branch the render map" and Section 2.3 says "the render map iterates `[homeTab, ...tabs]` only at the JSX layer," which contradicts the sibling approach and would reintroduce Home into a `.map` count if anyone reads it loosely. Pick one and write the exact JSX in M3:

```tsx
<div className="flex-1 relative overflow-hidden" data-terminal-area>
  {activeTabId === HOME_TAB_ID && <HomeView .../>}
  {tabs.map((tab) => (
    <Terminal key={tab.id} tabId={tab.id} isVisible={tab.id === activeTabId} />
  ))}
</div>
```

The sibling form keeps every `tabs`-derived count Home-free with zero `[homeTab, ...tabs]` spread, which is what Section 2.3 actually wants. Drop the `[homeTab, ...tabs]` sentence; it fights the separate-slot decision.

### TI-2. M3 is too big for "one change, one test, one rollback." Split it.

M3 currently does five things at once: add the TabType, add the Home state slot, branch the render seam, short-circuit `handleSelectTab`, and reroute `onTabRemoved` last-close. Each is independently testable and independently revertable. The last-tab-close reroute (`App.tsx:373` null -> Home id) is a behavior change with its own failure mode (closing the last tab now lands on Home instead of the StartupDialog gate, which interacts with `appState`); it deserves its own milestone and its own test. Suggested split: M3a (TabType + Home slot + render seam, placeholder HomeView, select short-circuit) and M3b (last-tab-close routes to Home). This keeps each milestone to one rollback point per the hard constraint.

### TI-3. The `handleSelectTab` short-circuit guard placement matters; state it exactly.

`handleSelectTab` (`App.tsx:113-121`) sets `setActiveTabId(tabId)` FIRST, then records last-active, then `await switchTab`. The plan's guard `if (tabId === HOME_TAB_ID) { setActiveTabId(tabId); return; }` at the top is correct, but note the existing body also writes `lastActiveTabByProject` keyed by `tab.projectId`. Home has no project. The early return correctly skips that, but spell out in M3 that Home selection must NOT pollute `lastActiveTabByProject` (it would map an undefined/global projectId to the Home id and could later be restored by `handleSelectProject` `:137-141` as a project's remembered tab). The early `return` handles it; just assert it in the test so a future refactor that moves the guard below the map does not regress.

### TI-4. The HTTP fallback to `127.0.0.1:5173` runs in MAIN and needs an explicit no-proxy / IPv4 note.

Section 4.3 item 4 fetches `http://127.0.0.1:5173/api/state` from main. Node's `fetch`/`http` on Windows can be subject to a system proxy and to IPv4/IPv6 resolution surprises (`localhost` resolving to `::1` when Flask binds `127.0.0.1`). The plan already uses the literal `127.0.0.1` (good, avoids the `localhost` trap), but add: bypass any proxy for loopback, set a hard `~2-3s` timeout with an `AbortController` (you say 2-3s; name the mechanism), and treat a connection refused (Flask down) as a fast fall-through, not a 2-3s hang on every poll when the service is simply not running. Verified `web.py:33-35` returns `jsonify(read_state(state_path))` with the identical schema, so the single-parser claim holds.

### TI-5. `composeClaudeQuery` PHI-scrub: move the choke point to MAIN or state why it stays in the renderer.

Section 3.4 puts `composeClaudeQuery()` and `scrubFreeText()` in the renderer (it feeds `writeToPty`). That is defensible (the write originates renderer-side), but the AGENTS.md security rule "no credentials or tokens in logs" and the PHI constraint are easier to GUARANTEE at a single main-side boundary, because the renderer can be driven by a compromised remote client over the wire. Today the remote path for the query is `tab:create` + `pty:write`, and `pty:write` (`ipc-handlers.ts:736-738`) is a raw passthrough with no scrub. So a remote client can call `writeToPty` with arbitrary text REGARDLESS of `composeClaudeQuery`. The choke point as designed only governs the Home BUTTON, not the channel. State this honestly: the canned-template default is the real guarantee for the dashboard action; the scrubber is belt-and-suspenders; and raw `pty:write` is an existing, out-of-scope passthrough (it is the user's own keystroke path). Do not imply `composeClaudeQuery` makes the CHANNEL safe; it makes the ACTION safe. Add one sentence to Section 3.4 and R-6's mitigation owning that distinction.

### TI-6. Add a registration-test assertion that `program-board:state` is in the broadcast set but NOT in the remote-forward set.

M5 asserts `program-board:getState` is registered and the broadcast fires. The remote decision (Section 2.4: do NOT forward over the wire) is the load-bearing safety claim, and it is currently only documented in prose. `index.ts:75-99` lists the remote-forwarded channels explicitly with a "NOT forwarded" comment block at `:95-98`. Add an assertion in M5 (or M4's reader test) that `program-board:state` does NOT appear in the remote broadcast list, so a future edit that "helpfully" forwards it trips a test instead of silently shipping workspace-local program data to a remote device. This is the testable form of the AGENTS.md "explicit remote decision."

### TI-7. The dir-watch needs a watcher-lifecycle and re-arm story.

Section 4.3 item 1 watches `dashboard/` with `fs.watch`. On Windows `fs.watch` can emit a single event and then go deaf if the underlying handle is invalidated (directory recreated, network blip), and it does not auto-recover. The ~20s safety poll (item 3) covers data freshness, but the plan should say the poll is ALSO the watcher's liveness backstop, and that the watcher is closed and re-armed on `error`. Add to M4: a test that the reader still produces fresh state via the poll path when the watcher is never armed (simulate `fs.watch` throwing), proving the poll alone satisfies R-2's "never more than one producer cycle stale."

### TI-8. PowerShell action: PS7 vs PS5.1 is a workspace-convention violation worth elevating from a footnote.

Section 3.2 spawns `powershell.exe` (5.1) and defers `pwsh` (7) to a Section 9 follow-up. The workspace standard is PS7 for anything user-facing, and Mark's CADDC02 work is paste-ready PowerShell. Shipping a button that opens 5.1 when the convention is 7 is a small but real papercut on the single most-used action. Recommend: check `platform.ts` for an existing `pwsh` shell option (the shell registry already distinguishes shells via `getShellOption`); if `pwsh` is registerable, ship the action against `pwsh` from M10, not as a deferred follow-up. If `pwsh` is not in the registry, that is the actual follow-up (add the shell option), and the plan should say so concretely rather than "a `pwsh` shell option is a follow-up."

### TI-9. State the keybinding decision as deferred-with-signoff, and remove the reserved-comment-in-`keybindings.ts` from Phase 1.

Section 1.3 / M11 reserve `Ctrl+Shift+K` "in a comment in `keybindings.ts`." A comment in a central registry is a weak reservation (it does not prevent collision; nothing reads it). The chord is verified clean (the `ctrl+shift` arm requires `!e.altKey`, distinct from readline `Ctrl+K`), so the analysis is right. But per AGENTS.md the keybinding needs the user's signoff BEFORE merge, and Phase 1 does not build the capture bar. So Phase 1 should reserve NOTHING in code; the reservation belongs in the Phase 2 plan and the open-questions list (it is already Q4). Drop the `keybindings.ts` comment from M11; it adds a Phase-1 code change that buys nothing and risks a reviewer treating it as a wired binding.

### TI-10. `formatRelative` and the freshness bands both parse time; share one local-vs-offset parse helper and test it once.

M7 (`formatRelative`) and M4 (`computeFreshness`) both touch the naive-local-vs-offset-aware trap (Section 9.2). `generated_at` is naive local (`poller.py:116` `now.isoformat(timespec="seconds")`, no offset, verified), while `last_commit.iso`/`last_touched` carry `-06:00`. Two separate milestones each re-implementing the parse is a drift risk. Extract one `parseProgramBoardTime(value, { assumeLocal: boolean })` used by both, with the timezone-trap test owned in M4 and re-used in M7. One source of truth for the single nastiest correctness bug in the data path.

### TI-11. The 30s injection-failure timeout (Section 3.1 item 7) needs a cleanup binding.

The fail-safe timeout that surfaces "Session failed to start" must be cleared when the injection succeeds AND when the tab is removed, or it fires after a successful write or after a closed tab. The plan already deletes the `pendingInjection` entry on `onTabRemoved` (item 6); say the timeout handle lives in that same entry and is `clearTimeout`-ed in both the success path (item 4) and the removal path (item 6). Add it to M10's "fires exactly once" test: assert the timeout does not fire after a successful idle-gated write.

---

## Smaller notes

- Section 2.7 table row "Last-tab-close route" cites `App.tsx:366-381 (the :373 null)`. Correct; `:373` is `if (remaining.length === 0) return null;` inside the `setActiveTabId` updater. Note the reroute target must be the Home id, and that updater currently also has a same-project fallback (`:374-375`); the Home reroute belongs only in the `remaining.length === 0` arm. Spell that out so the same-project fallback is untouched.
- Section 4.3 says "Sibling `enrichment.json` exists; the app does NOT parse it." Verified present. Good scoping. Keep the dir-watch filter to `state.json`/`state.tmp` only so `enrichment.json` writes do not trigger spurious re-reads.
- The plan never states where `rankItems` and the unified `DashboardItem` mapper live relative to the process boundary. M6 says `src/renderer/lib/` "or `src/shared/`." Decide: it is pure logic with no Electron deps and the web client will want it too, so `src/shared/` is the reuse-maximizing choice (the lens explicitly asks to maximize reuse). Put `rankItems`, `formatRelative`, `ageColorClass`, and the item mapper in `src/shared/` so both the desktop renderer and the web client consume one copy.
- Section 6.4 reuses `--project-hue`. Confirm it is per-active-project (set in React from the active project), so the strip rendering multiple projects at once cannot rely on a single global hue. If the strip shows cross-project sessions, the per-row tint needs each row's own project hue, not the global CSS var. Flag for M9.
- Appendix verification log is excellent and should stay. Add the corrected program-board source paths (MF-2) and the `board.html:16` fix (MF-3) to it.

## What the plan gets right (keep)

- Renderer-only Home, never in `TabManager`. This is the correct call and it neutralizes the phantom-tab and activation-count hazards cleanly.
- The separate-slot decision (Home out of `tabs`) is the right way to keep all six count sites Home-free without auditing each.
- Honoring all three R-doc corrections (write-after-ready primary, idle+hadActivity spine, dir-watch) with explicit "synthesis is overruled here" callouts (Section 9.3).
- The one Phase-1 IPC channel with the full five-part treatment plus an explicit local-only remote stub.
- Test-first for `rankItems` and the time helpers; real-temp-file for the reader retry path (mirrors the settings-store test pattern).
- The PHI canned-template default as the real guarantee, scrubber as belt-and-suspenders. Just tighten the channel-vs-action framing (TI-5).
- Per-action remote-parity table (Section 3.5) with a concrete disabled-state for PowerShell rather than the existing `noop` anti-pattern.
