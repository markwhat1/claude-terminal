# Adversary review: integration / feasibility skeptic

Lens: attack any mechanism that may not actually work on the `dashboard` branch. I verified every cited mechanism against the real checkout at HEAD `ce2e9e0` and against the live `dashboard/state.json`. Where the plan is sound I say so; the defects below are the ones I could not break the plan free of.

Method: read the real source for each load-bearing mechanism (write-after-ready timing in `tab:create` -> `wirePtyToTab`, the hook router status chain, the remote forward path, the logger mirror, the producer `status.py`/`poller.py`/`state.py`), and cross-checked the plan's factual claims against the live board (18 programs, 6 needs-you).

## What holds up (so the plan owner does not re-litigate these)

- **Write-after-ready timing is safe against the create/inject race.** `tab:create` calls `wirePtyToTab` synchronously (`ipc-handlers.ts:409`), which fires `sendToRenderer('tab:updated', tab)` with `status:'new'` (`:109`) before the handler returns the tab (`:410`). The renderer registers `pendingInjection` after the `createTab` await resolves. The `new` event does not trigger injection (gate is on `idle`); the `idle` event arrives seconds later after SessionStart. No race. The once-flag on first `idle` correctly survives the `--resume` double-fire and `/clear` (`hook-router.ts:98-113`). The renderer only ever sees `status` (never raw `tab:ready`), exactly as R3 states.
- **Additive Tab fields ride to remote for free.** `tab:updated` broadcasts `args[0]` (full Tab) at `index.ts:85`; `tabs:sync` sends full `getAllTabs()` at `web-remote-server.ts:244`. `statusSince`/`lastActivityAt`/`firstActivityAt` are carried; the ws-bridge spreads tabs. Remote-safe as claimed.
- **The logger DevTools-mirror defect is real and the M0b fix is correct.** `logger.ts:42-51` mirrors EVERY level (debug included) to `webContents.executeJavaScript` with zero redaction. Gating to warn/error is a one-line change. Verified.
- **The single-item-DoD trap is real and live.** The one almost-done program on the board right now (`incomplete-notes`) is exactly `total:1, met:0`; the producer flags it via `dod.total - dod.met == 1` with no `>= 2` guard (`status.py:66`). The plan's correction (drop the `>= 2`, read the reason string) is right and load-bearing.
- **The `time-sensitive` double-count is real and live.** `practice-reports` carries BOTH a literal `time-sensitive` string in `tags[]` AND `time_sensitive:"2026-06-22"`; `needs_you_reasons` mixes the raw tag and the computed `time-sensitive 2026-06-22`. The plan's "use structured fields only" rule (4.4) is correct.
- **Producer sort direction confirmed.** `poller.py:115` sorts `(not needs_you, git.age_days)` ascending = needs-you-first then newest-commit-first. Plan tie-break 5.4#3 mirrors it correctly.
- **age_color bands confirmed** (`status.py:22-29`): `<3/<7/<14/else`. Plan's off-by-one note is right.

## Defects

### D1 (high). Live `time_sensitive` data exists NOW; deferring Tier 1 mis-ranks the one item with a real deadline.

The plan repeatedly asserts Tier 1 has "No live producer yet" / `time_sensitive` is "currently null on the live board" (Section 5.3 tier 1, 5.6, and the YAGNI note 5). That is factually wrong on this checkout. `practice-reports` has `time_sensitive:"2026-06-22"`, two days out from today (2026-06-20), and the producer already flags it needs-you via `needs_you_reasons:["time-sensitive 2026-06-22"]`. Because Phase 1 defers Tier 1 to "Phase 2 with its data," the single item carrying a hard external deadline gets ranked in Tier 4 (by age color), under the plan's own thesis that "a hard external deadline beats everything." So the Phase-1 board actively under-ranks the one program that most deserves the hero.

Where: PLAN.md Section 5.3 (Tier 1), 5.6, Section 5 YAGNI paragraph; contradicted by `dashboard/state.json` (`practice-reports.time_sensitive`).

Fix: build the minimal Tier 1 in Phase 1b (M6) using the structured `time_sensitive` DATE field that already exists, instead of deferring it. It needs no new producer. Also reconcile the threshold: the producer's needs-you predicate is "within 5 days" (`status.py:61`, `_time_sensitive_near(..., near_days=5)`), while the plan's Tier 1 gate is `<= now + 1 day`. Pick one; the 1-day gate silently excludes producer-flagged time-sensitive items 2-5 days out (e.g. the live `practice-reports` at +2 days), which is the defect made concrete.

### D2 (high). M5's "assert program-board:state is NOT in the remote-forward list" is not testable where the plan puts it.

The plan's explicit-remote-decision guarantee (Section 2.4, 3.6, M5 DoD) rests on a test asserting `program-board:state` is absent from "index.ts's remote-forward list." But that list is an `if/else if` chain inside the module-private `sendToRenderer` function (`index.ts:80-98`), not exported data. M5 puts the assertion in `tests/main/ipc-handlers.test.ts`, which registers and tests `ipc-handlers.ts` handlers (verified: the test builds `handlers`/`listeners` maps from `registerIpcHandlers`, `:182-206`). It has no handle on `index.ts:sendToRenderer` at all. As specified, the assertion cannot be written, so the "tested remote decision" the plan leans on for its anti-leak guarantee does not exist.

Where: PLAN.md Section 2.4 (registration test bullet), 3.6 (remote blast radius), M5 DoD; against `index.ts:80-98` and `tests/main/ipc-handlers.test.ts:182-206`.

Fix: either (a) refactor the forward list into an exported `const REMOTE_FORWARDED_CHANNELS = new Set([...])` that `sendToRenderer` consults, then assert membership in a new `tests/main/index.test.ts`; or (b) write an integration test that spies on `webRemoteServer.broadcast` and asserts a `program-board:state` `sendToRenderer` call produces zero broadcast. State which, and put it in a test file that actually imports the code under test.

### D3 (medium). M11 misses the renderer-reload startup path, so `startupView:'home'` is silently ignored on reload.

The plan says M11 branches "the two `setActiveTabId(activeId)` sites (`App.tsx:334`, `:517`)." There are three `setActiveTabId` sites in the startup flow, and the one the plan omits short-circuits the one it names. On a renderer reload with existing main-process tabs, the effect takes the `existingTabs.length > 0` branch (`App.tsx:306-316`) which calls `setActiveTabId(activeId)` at `:310` and `return`s at `:315` BEFORE ever reaching `:334`. So a user who set "open to Home" gets dropped onto the first terminal whenever the renderer reloads (a common dev/runtime event). Low user-harm (Home is opt-in) but the milestone's DoD ("startupView:'home' selects the Home id at the two sites") is incomplete and the behavior is inconsistent.

Where: PLAN.md M11; against `App.tsx:306-316` (the omitted third site at `:310`).

Fix: branch all three sites (`:310`, `:334`, `:517`) or, cleaner, compute the post-startup active id once in a helper `resolveStartupActiveId(startupView, homeId, activeId)` and call it at each `setAppState('running')` site so the three cannot drift.

### D4 (medium). The headline affordance (`draftFirstVersion`) produces a query too vague to act on, because the useful specificity lives in the PHI-forbidden fields.

Section 1.7 calls reframe-as-review "the single highest-payoff ADHD affordance," and `composeClaudeQuery({action:'draftFirstVersion', repo})` fills the `<deliverable>` slot ONLY from slug/name + a fixed kind label (3.4, 1.7), never from `blocked_on`/`detail`/`dod.gaps`. Run against the live almost-done item, that yields: "Draft the first version of Incomplete Notes so I can review and send it." The actual deliverable ("portal Incomplete Notes surface live end to end") sits in `dod.gaps[0]`/`blocked_on`, which the choke point forbids interpolating. So the marquee affordance composes a near-meaningless instruction precisely for the item it most wants to help with. This is a genuine tension between the PHI guarantee and the affordance's usefulness that the plan does not acknowledge; it presents the canned default as both safe and high-payoff when, for the realistic case, it is safe but weak.

Where: PLAN.md Section 1.7, 3.4 (conservative default); against `dashboard/state.json` (`incomplete-notes.dod.gaps`, `.blocked_on`).

Fix: decide and document the tradeoff. Either (a) accept that `dod.gaps[0]` is producer-computed DoD-label text (auto-keys like "merged"/"deployed"/"ci" or the manual `check` string), not free-form patient text, and allow ONLY `dod.gaps[0]` into the slot behind the scrubber as a deliberate, tested exception (it is the field that makes the query useful); or (b) keep it canned-only and downgrade Section 1.7's "highest-payoff" framing to "safe but generic; specificity is a Phase-2 opt-in." Do not ship it billed as both.

### D5 (medium). Phase-1a hero is effectively arbitrary (newest-commit-first), contradicting "Hero = one thing."

Phase-1a (M8a) sets hero = `needsYouCards[0]` in board order. Board order is needs-you-first then `git.age_days` ascending (newest commit first), verified live: the 1a hero today would be `cad-staff-portal` (needs_you, age 0), purely because it has the most recent commit, while the 90%-killer `incomplete-notes` is rank 2 and the deadline item `practice-reports` is rank 5. So the first dogfoodable surface picks the hero by "what did I touch most recently," which is the opposite of the Section 1.1 thesis (surface the ONE most-important thing) and the plan's own anti-recency stance for avoidance items. The plan flags 1a as board-order, but it also sells 1a as a real-value MVP that "paints real needs-you data early," and a misranked hero is the one thing the hero is supposed to get right.

Where: PLAN.md M8a, MVP line (Section 7), Section 1.1; against `poller.py:115` + live board order.

Fix: pull the tiny Tier-3 (`dodAlmost`) and Tier-1 (`time_sensitive`) checks forward into M8a as a hero-selection override on top of board order (both are single structured-field reads, no full ranker needed), so the 1a hero is at least "almost-done or deadline beats newest-commit." Keep the rest of the list in board order. This is a few lines, not the full M6 engine.

### D6 (low). The session-strip icon table invents `done`/`failed` states that do not exist in TabStatus.

Section 6.4's strip table lists five rows including `done` (`CircleCheck`/`--success`) and `failed` (`CircleX`/`--destructive`). The real `TabStatus` union is `'new' | 'working' | 'idle' | 'requires_response' | 'shell'` (`types.ts:1`); there is no `done` and no `failed`. `idle` already IS the finished-a-turn state and renders `CheckCircle2`/`text-success` today (`TabIndicator.tsx:19-23`). A strip built to the table would have two unreachable rows and a naming mismatch (`CircleCheck` vs the existing `CheckCircle2`). The `done` settle is supposed to come from the transient `justResolved` flag, not a status, which the plan says elsewhere, so the table is just internally inconsistent.

Where: PLAN.md Section 6.4 table; against `types.ts:1` and `TabIndicator.tsx`.

Fix: drop the `failed` row (no such status; a crashed tab fires `tab:removed`, not a status), and reframe `done` as "`idle` + transient `justResolved` settle beat" rather than a state, reusing the existing `CheckCircle2`. Map the strip to the five real statuses only.

### D7 (low). The directory-watch filter drops `filename:null` events; fine because of the poll, but say so.

`fs.watch` on a directory on Windows (`ReadDirectoryChangesW`) can deliver events with `filename === null`. The plan's watcher filters `if (filename === 'state.json' || filename === 'state.tmp')` (4.3 / M4), which silently drops a null-filename swap notification. This is acceptable ONLY because the ~20s poll is the tested primary; the watcher is best-effort. The plan asserts the poll backstops a watcher that "never arms or throws," but not specifically the "fires with null filename" case. Make the M4 test cover it, or the watcher's correctness rests on an untested assumption.

Where: PLAN.md Section 4.3 step 2, M4; against Node `fs.watch` Windows semantics and the existing single-file idiom at `ipc-handlers.ts:142` (which the plan correctly says NOT to copy).

Fix: in M4, add an assertion that a watch event with `filename:null` still ends in fresh state via the poll (or have the watcher schedule a re-read on ANY event and let the debounced read+retry be the filter). One line of test, removes the assumption.
