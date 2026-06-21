# Adversary review: integration / feasibility skeptic

Lens: attack any mechanism that may not actually work on the `dashboard` branch. Write-after-ready timing, `fs.watch` on atomic rename, hero-ranking under the unreliable `requires_response`, remote parity, and the renderer-only Home guards. I read the PLAN, all six round-2 R-docs, and re-resolved the load-bearing claims against the real checkout (`dashboard` worktree at `ce2e9e0`) and the live producer (`infrastructure/program-board`, source under `src/program_board/`) plus the live `dashboard/state.json`.

Verdict: the spine mechanisms (write-after-ready, dir-watch, idle-as-spine, renderer-only Home) are sound and well-grounded. But the hero-ranking layer re-derives signals the producer already owns and disagrees with the producer's own logic, the `statusSince` stamping design has a concrete bug that breaks the very idle-escalation it exists to feed, the closed-tag-set assumption is false against live data, and several producer citations point at the wrong file path. Details below, severity-ranked.

---

## D1 (high) — `dodAlmost` re-derives the 90%-killer and disagrees with the producer

Where: PLAN Section 4.1 (`dodAlmost: boolean // dod.met === dod.total - 1 && dod.total >= 2`), Section 1.1 (same formula), Section 5.3 Tier 3, Section 5.6 test surface.

The producer already computes the 90%-killer. `status.py:66`:

```python
if dod["total"] > 0 and dod["total"] - dod["met"] == 1:
    reasons.append(f"almost done: {dod['gaps'][0]}")
```

This is emitted in `needs_you_reasons` (live data confirms: `"almost done: portal Incomplete Notes surface live end to end"`). The plan re-derives it in Electron with an EXTRA guard `dod.total >= 2` that the producer does NOT have. So a program with a single DoD item (`total:1, met:0`) is "almost done" to the producer (and shows in the board's NEEDS YOU), but the plan's `dodAlmost` is `false` for it, so the dashboard's Tier 3 silently drops it below the fold. The two boards disagree on the exact item the project exists to surface. This directly violates the plan's own stated principle ("consume verbatim, never re-derive," Section 4.3 age-color, R4 §(b)).

Fix: do not re-derive. Either (a) drive Tier 3 off the producer's `needs_you_reasons` entry that starts with `"almost done: "` and lift the gap label from it (the `gaps[0]` text is already in the string), or (b) compute `dodAlmost` with the producer's exact predicate `dod.total > 0 && dod.total - dod.met === 1` (drop the `>= 2`). Pick one and encode it as a test asserting parity with the live `needs_you_reasons` string. Prefer (a): the producer is the single source of truth for this signal.

---

## D2 (high) — `statusSince` stamped on every `updateStatus` call resets the idle clock; the R2 idle-escalation never fires

Where: PLAN Section 2.2 ("stamped in `TabManager.updateStatus` ... currently a flat setter with no timestamp"), Section 5.2 ("longer-idle (larger `now - statusSince`)"), Section 5.3 Tier 2 tie-break, M1.

`tab-manager.ts:55-58` is a flat setter with no transition guard: `updateStatus(id, status) { const tab = ...; if (tab) tab.status = status; }`. R2 itself states "the last event wins." The hook path fires `updateStatus(tabId,'idle')` on EVERY Stop (once per turn) and AGAIN on `tab:ready` with a sessionId (`hook-router.ts:104`), and AGAIN on `/clear` (`:104`), and AGAIN on the `--resume` double-fire. So `idle` can land consecutively.

If M1 stamps `statusSince = Date.now()` unconditionally inside `updateStatus`, then any same-status re-fire (idle->idle on resume, idle->idle on clear, or the normal idle that re-arrives) resets `statusSince`. The R2 secondary heuristic ("a tab idle longer than ~45-60s escalates into needs-you," Section 5.2) keys off `now - statusSince`. A spurious re-stamp pushes `statusSince` forward and the 45-60s threshold never elapses, so the AskUserQuestion-gap escalation that the plan calls the bridge for the mid-turn-question case (R2 §5.3) silently never triggers. The Tier 2 "longer-idle first" tie-break is also corrupted.

Fix: M1 must stamp `statusSince` ONLY on an actual status CHANGE. Guard inside `updateStatus`: `if (tab.status !== status) tab.statusSince = Date.now(); tab.lastActivityAt = Date.now(); tab.status = status;`. Keep `lastActivityAt` on every event (it is "last activity") but make `statusSince` change-gated. Add an M1 test: two consecutive `updateStatus(id,'idle')` calls leave `statusSince` unchanged on the second.

---

## D3 (high) — the program tag set is NOT closed; Tier 4 / Phase 2 assume a 3-element closed set that live data contradicts

Where: PLAN Section 8.4 ("the closed program tag set `{needs-CADDC02, needs-your-decision, time-sensitive}`"), Section 5.3 Tier 4 ("tag-driven: `needs-CADDC02`, `needs-your-decision`, or a `time_sensitive`"), Section 4.1 (`badges: verbatim program-board tags`).

Two errors, both verified against `status.py` and live `state.json`:

1. `BLOCKER_TAGS = {"needs-CADDC02", "needs-your-decision"}` (`status.py:3`). That is the ONLY closed set, and it has TWO members, not three. `time-sensitive` is not a blocker tag; lane=blocked is never driven by it.
2. Tags are free-form YAML (`overrides.py` / `poller.py:90` passes `ov.get("tags", [])` through unchanged). Live data shows a card carrying a literal `time-sensitive` STRING in its `tags` array AND a separate `time_sensitive` DATE field. So a `tags` array can contain arbitrary author-chosen strings. The plan's "closed set" assumption is false; any Tier-4 logic that switches on a fixed tag enum will mishandle unknown tags.

Plus an ambiguity this creates for Tier 4: `needs_you_reasons` mixes raw tags and computed strings. Live values seen: `["needs-CADDC02", "needs-your-decision", "time-sensitive", "time-sensitive 2026-06-22", "almost done: ..."]`. A substring match on `"time-sensitive"` to detect the time-sensitive reason (`status.py:62` emits `f"time-sensitive {date}"`) will ALSO match the raw `time-sensitive` tag, double-counting. The reasons array is not a clean structured signal.

Fix: stop treating tags as a closed enum. Render `badges` verbatim (already correct) but for Tier-4 bucketing use the structured fields the producer guarantees: `needs_you` (bool), `time_sensitive` (date field, not the tag), and membership test `tag === 'needs-CADDC02' || tag === 'needs-your-decision'` against `BLOCKER_TAGS` only. For "is this time-sensitive," read the `time_sensitive` date field directly, never parse `needs_you_reasons`. Correct Section 8.4 to the real 2-element `BLOCKER_TAGS` and state explicitly that the broader `tags` array is open/free-form.

---

## D4 (medium) — Tier 4's secondary sort cites the wrong producer sort key and the wrong direction

Where: PLAN Section 5.3 Tier 4 ("then oldest `last_touched` first (the program-board's own needs-you-first, oldest-first sort, `poller.py:115`)").

`poller.py:115` is `programs.sort(key=lambda p: (not p["needs_you"], p["git"]["age_days"]))`. That sorts by `git.age_days` ASCENDING (newest-committed first: age_days=0 before age_days=10), keyed off `git.age_days`, NOT `last_touched`, and it is newest-first, NOT oldest-first. The plan's claim is wrong on the field AND the direction. The plan elsewhere (Section 1.2, 5.4) deliberately wants oldest-first ("staleness is the failure being solved"), which is the OPPOSITE of what the producer does. So either the plan should stop citing `poller.py:115` as precedent for oldest-first (it is the reverse), or it should consciously re-sort and own that it diverges from the board's visible order (a UX inconsistency: the dashboard's Tier-4 order would differ from the board's order for the same cards).

Fix: drop the false "program-board's own ... oldest-first sort, `poller.py:115`" attribution. Decide deliberately: either mirror the producer (`git.age_days` ascending, hotter-color-first via the existing `age_color` tie-break) so the two surfaces agree, or document the oldest-first divergence as intentional. Use `git.age_days` as the recency proxy, not `last_touched` (which is sometimes tz-aware, sometimes naive per R4 and the live mixed data, so it is a worse sort key).

---

## D5 (medium) — every producer-side citation in the plan and R-docs has the wrong file path

Where: PLAN Section 4.3, 4.1, 1.3, Appendix; R4 throughout; R5 §2; R6.

The plan and R4 cite producer files as bare names: `state.py:6-11`, `web.py:33-35`, `config.py:4,16`, `poller.py:116`, `status.py:22-29`, `board.html:13`. The real files live at `infrastructure/program-board/src/program_board/state.py` etc. (and `templates/board.html` for the HTML). R4's verification log claims "read the real files in both checkouts," but the path it records (`state.py:6-11`) is not where the file is. The LINE NUMBERS are all correct (I confirmed `state.py` atomic write at 6-11, `web.py` api/state at 33-35, `config.py` at 4/16, `status.py` age bands at 22-29, `board.html` empty copy at line 13, `poller.py:115` sort + `:116` generated_at). So the contract is sound; only the path prefix is missing. This is the same class of defect (wrong path/branch) that the R-docs spent pages correcting on the Electron side, left uncorrected on the producer side.

Fix: a mechanical pass prefixing every producer citation with `src/program_board/` (and `src/program_board/templates/` for `board.html`). Low effort, prevents a builder from `cat`-ing a non-existent path and concluding the recon is stale.

---

## D6 (low) — write-after-ready: the idle gate fires before the first SessionStart only if hooks are installed for a brand-new cwd; the 30s timeout is the only backstop, and it is "optional"

Where: PLAN Section 3.1 steps 4 and 7, R3 §(a)/(d), residual risks.

The mechanism is correct: gate on the first `tab:updated` with `status==='idle'` (verified `hook-router.ts:104` moves `new`->`idle` on SessionStart-with-sessionId, and the renderer sees it via `onTabUpdate` at `App.tsx:354`). The genuine residual: it depends entirely on `on-session-start.js` firing, which depends on `hookInstaller.install(cwd)` having run for that cwd (`ipc-handlers.ts:385-388`). For a freshly-added project whose `.claude/settings.local.json` was just written, this is the first session in that dir. If install races spawn, or the user's global Claude config overrides hooks, no `tab:ready` arrives, the gate never fires, and the query is silently dropped. The plan calls the 30s timeout "optional" (Section 3.1 step 7, "Add an optional 30s timeout"). For an ADHD user who clicked "decide this in a new session" and walked away, a silent drop with no surfaced error is the worst failure mode.

Fix: make the 30s timeout MANDATORY in M10, not optional, with a visible "Session failed to start, query not sent" surface and a one-click retry that re-runs `composeClaudeQuery` into the same tab. Add the timeout-fires-and-surfaces case to the M10 test.

---

## D7 (low) — `onTabUpdate` appends unknown tabs to `tabs`; if a Home-derived id ever leaks into a `tab:updated`, the separate-slot invariant breaks

Where: PLAN Section 2.3 ("store the synthetic Home tab in a SEPARATE renderer slot, not in the `tabs` array"), M2/M3.

Verified `App.tsx:354-364`: the `onTabUpdate` callback does `[...prev, tab]` for any id not already in `tabs`. The separate-slot design is sound ONLY as long as no `tab:updated` ever carries the Home id. Since Home never enters `TabManager` (R1 §(c), confirmed), main never emits `tab:updated` for it, so the invariant holds. But it is an UNGUARDED invariant: a future change that registers Home in TabManager, or any code that calls `setTabs` with the Home tab, silently re-pollutes `tabs` and every `tabs`-derived count (`activeProjectTabs`, `tabCounts`, the `remaining.length===0` check) breaks at once. M2's "regression net" tests the counts but not this ingress path.

Fix: add a defensive filter in the `onTabUpdate` appender: `if (tab.type === 'home') return prev;` (or assert the id is never the Home sentinel). Cheap, makes the invariant self-enforcing rather than relying on six call sites staying disciplined. Add it to the M2 net.

---

## D8 (low) — remote: Home-after-last-tab-close plus `startupView` leaves main's active-tab state stale; benign now, a latent reconnect bug

Where: PLAN Section 2.3 (last-tab-close routes to Home id), Section 11/M11 (`startupView`).

Home is renderer-only, so when the last real tab closes and the renderer routes `activeTabId` to the Home sentinel, the MAIN process `tabManager.activeTabId` is now null/stale (main has no Home concept). On a remote reconnect, `tabs:sync` (`web-remote-server.ts:234-246`) rebuilds the remote client from `getAllTabs()` (no Home) and main's active id (null). The remote client then has no active tab and no Home, landing on an empty surface. Local desktop is fine (renderer state persists in-session). This is not a Phase-1 blocker because remote Home rendering is already stubbed for the board region, but it is a latent inconsistency between local and remote active-tab truth once Home is the post-close landing.

Fix: document that the Home sentinel is renderer-truth only and that remote reconnect intentionally lands on the first real tab (or its own Home sentinel computed renderer-side from the forwarded `tabs`). One sentence in Section 2.1/3.5 plus a note in the remote-parity table row for Home.

---

## What I checked and found SOUND (so the builder does not re-litigate)

- Write-after-ready chain: `on-session-start.js` -> `tab:ready` -> `hook-router.ts:104` `updateStatus(idle)` -> `sendToRenderer('tab:updated')` (`:169`) -> `preload onTabUpdate` (`:155-162`) -> `App.tsx:354`. The `new`->`idle` edge is real and renderer-visible. CR-only (`\r`) is correct (`Terminal.tsx` forwards xterm `onData` raw; `App.tsx` refresh writes `\x0c` the same way). The once-flag + cleanup-on-removal is idempotent against the resume double-fire (`hook-router.ts:80-84` comment confirms the double-fire).
- `requires_response` is genuinely unreliable under `bypassPermissions`: single producer (`hook-router.ts:134-135` <- `on-notification.js` only), default mode is `bypassPermissions` (verified `settings-store.ts` DEFAULTS + `index.ts:62`), so the idle-as-spine decision is correct. Keeping `requires_response` as an additive overlay is the right call.
- `fs.watch` on atomic rename: producer writes via `tmp.write_text` + `os.replace` (`state.py:6-11`, verified), so watching the `dashboard/` DIRECTORY + debounce + retry + ~20s poll + HTTP fallback is the correct Windows-safe design. The existing single-file watcher at `ipc-handlers.ts:142` is correctly called out as the anti-pattern not to copy.
- `generated_at` is naive-local (live: `'2026-06-20T20:21:40'`, no offset) while `last_commit.iso`/`last_touched` carry `-06:00` (live confirmed). The "parse generated_at as LOCAL, never UTC" rule is correct and load-bearing.
- `/api/state` returns the byte-identical schema (`web.py:33-35` `jsonify(read_state(...))`), so one parser for file + HTTP is correct.
- Age-color bands (`status.py:22-29`) match the plan's `< 3 / < 7 / < 14 / else` exactly; "consume verbatim, do not re-derive" is right.
- Renderer-only Home avoids the `ipc-handlers.ts:105` activation hazard and the `tabs:sync` phantom-tab hazard; the two `getTabs()`-sourced fallback-spawn sites (`App.tsx:341-344`, `:524-527`) are genuinely SAFE because `getTabs()` is main-truth and never holds Home.
- Remote parity per action (R5): Copy over HTTPS works, Claude-with-query reuses forwarded `tab:create`+`pty:write`+`onTabUpdate`, PowerShell is correctly local-only with an explicit disabled state (bridge throws at `ws-bridge.ts:261-263`, must stay throwing). All verified against the named remote handler list.
- Keybinding `Ctrl+Shift+K`: the matcher arm requires `e.shiftKey` (`keybindings.ts` `ctrl+shift` case), so it does not collide with bare `Ctrl+K` kill-line. Clean. (Note the stale AGENTS.md claim that `Ctrl+Shift+P` opens PowerShell: no such binding exists in `keybindings.ts:53-67`; R5/R6 already flag it. Not a plan defect.)
- The `--plan` / `--permission-mode plan` bug is real (`types.ts:70-75`) and correctly scoped OUT as a filed follow-up.
