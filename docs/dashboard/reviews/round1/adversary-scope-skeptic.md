# Adversary Review: Scope / YAGNI Skeptic

Target: `docs/dashboard/PLAN.md` (the ClaudeTerminal in-app Home / dashboard plan).
Lens: is this secretly two products fused again? over-engineered? will Phase 1 truly ship and be testable?
Posture: hostile. The job is to find the seams where this breaks or bloats, not to praise the prep.

Verdict up front: the recon (R1-R6) is genuinely good and the citations check out against the
`dashboard` worktree (I re-read App.tsx 320-410 / 560-599, tab-manager.ts 1-58, the registration
test 178-206, and the live state.json). But the PLAN built ON that recon has a Phase-1 scope that is
roughly 2x what the stated Phase-1 goal ("a verified data-reader") needs, and at least one of its
"testable" milestones is not testable as written. The single biggest risk is not in any one section;
it is that Phase 1 has eleven milestones and ships a hero-ranking engine, a six-tier priority system,
a session strip, three actions, a PHI scrubber, and a settings-store change before a single pixel of
"read the board and show it" has shipped and been used. That is the same fusion failure the lens was
told to hunt for: a "data-reader" and a "priority/attention product" welded into one Phase 1.

---

## D1 (HIGH) — Phase 1 is two products fused. The "verified data-reader" goal does not need M5-M11.

Section (lines 17-21) defines Phase 1 as "a verified data-reader. Consume program-board state.json,
drive a secondary live-session strip, wire the three click-actions." But the milestone list (M1-M11,
Section 7) ships, inside that same Phase 1:

- a full hero-ranking engine with six tiers and four tie-breaks (M6, Section 5),
- the unified `DashboardItem` normalization across three sources (M8),
- the Agent-View session strip with attention-grouping and fold-behavior (M9),
- three actions including a PHI scrub choke point (M10),
- a settings-store schema change + a SettingsDialog picker (M11).

A "verified data-reader" is M1-M5 plus a dead-simple render: read state.json, show the needs-you
cards in board order (the producer ALREADY sorts needs-you-first, oldest-first per `poller.py:115`,
quoted in Section 5.3 tier 4). That is shippable, testable, and usable on its own. Everything from M6
onward is the *attention/triage product*, which is exactly what Phase 2 was supposed to be the
separable half of. The plan drew the Phase 1/2 line in the wrong place: it put the entire ranking and
actions surface in Phase 1 and only the *new todo store* in Phase 2.

Why this matters for "will Phase 1 ship": eleven milestones, each gated on the prior, with two of them
(M6 ranking, M8 HomeView) being the hardest pure-logic and hardest integration work in the build. The
probability that all eleven land and the result gets dogfooded before scope drifts is low. The recon
itself hands you the cheaper path and the plan ignores it.

Minimal fix: split Phase 1 into 1a and 1b. 1a = M1-M5 + a trivial HomeView that renders the
board's already-sorted needs-you list verbatim (no `rankItems`, no strip, no actions beyond Copy).
Ship 1a, use it for a few days, THEN build the ranking engine (M6), strip (M9), and the spawn/PS
actions (M10) as 1b. The hero can be `needs-you-cards[0]` in board order until `rankItems` earns its
place. This is one expected test per step and an actual rollback point that a user has touched.

---

## D2 (HIGH) — M3 is not testable as written, and its own DoD contradicts the chosen architecture.

M3 (lines 365-370) says: "branch the render map (`App.tsx:577-583`) to render a placeholder
`<HomeView/>` when the Home tab is active" and the test is "a renderer test mounting `App` (or the
extracted seam) asserting: selecting Home does not call switchTab; closing the last real tab sets
active to Home; activeProjectTabs/tabCounts never include Home."

Two problems:

1. **The render map at 577-583 maps `tabs` only** (I confirmed: `{tabs.map((tab) => <Terminal ...>)}`).
   But Section 2.3 (lines 80-82) commits to storing the Home tab OUTSIDE the `tabs` array, in a
   separate slot. So when Home is active, `activeTabId` points at an id that is NOT in `tabs`, and the
   map renders zero `<Terminal>` and no HomeView. The plan's own fix is "the render map iterates
   `[homeTab, ...tabs]` only at the JSX layer" (line 82) — but M3's change description says branch the
   EXISTING map, which maps `tabs`. These are different changes. M3 as written will render a blank
   terminal area when Home is selected. The milestone description and the architecture decision
   disagree; whichever the builder follows, the other's assertions fail.

2. **"Mounting App" as a unit test is a fiction here.** `App.tsx` calls `window.claudeTerminal.*`
   (getTabs, getActiveTabId, onTabUpdate, getCurrentBranch, plus ~8 listener registrations I counted
   at 354-407) on mount inside effects. To "mount App" in jsdom you must mock the entire preload
   surface. The plan never says this mock exists or budgets building it. The recon even flags
   (R1 residual, R1:275) that the web-client tab model was "not exhaustively traced." M3's test is
   the first one that requires a full `window.claudeTerminal` harness and the plan treats it as a
   one-liner. Either the test is much bigger than "one expected vitest test" (violating the
   boringly-small rule the plan states at line 22 and 349), or it silently becomes "extract the seam"
   — and the plan never specifies what the extracted seam is or that App gets refactored to expose it.

Minimal fix: M3 must pick ONE seam and state it. Recommended: do the `[homeTab, ...tabs]` render
change (matching Section 2.3) and extract a pure `selectActiveView(activeTabId, homeTabId, tabs)`
helper plus a pure `nextActiveOnRemove(...)` helper, and test THOSE pure functions, not a mounted App.
If the test really must mount App, add a milestone-zero "build the `window.claudeTerminal` test double"
and stop pretending M3 is one change.

---

## D3 (HIGH) — The separate-slot Home decision creates an audit surface the plan claims to avoid.

Section 2.3 (lines 80-82) sells the separate-slot decision as "the cleanest way to satisfy R1's
'count real tabs only' without auditing six sites." That is backwards. Keeping Home out of `tabs`
means EVERY place that renders, iterates, or routes tabs now has a special case:

- the render map must become `[homeTab, ...tabs]` (line 82) — a change to the JSX,
- `onTabRemoved` must route `activeTabId` to a Home id that is not in `remaining` (line 80, 119),
- `handleSelectTab` must short-circuit a Home id that is not in `tabs` (line 72),
- any code that does `tabs.find(t => t.id === activeTabId)` (status bar, title, keyboard tab-cycle)
  now returns undefined when Home is active and must tolerate it.

R5 itself (R5:75) says the remote `RemoteApp` treats "the tabs array passed down" as the source of
truth. A Home tab living outside that array means the remote path needs the SAME `[homeTab, ...tabs]`
special-casing in a SECOND renderer entry (`web-client/main.tsx`), which the plan does not mention.
So the decision sold as "avoid auditing six sites" actually requires auditing the same sites for a
DIFFERENT invariant ("tolerate activeTabId not being in tabs") in TWO renderers. The alternative the
plan dismissed (Home in `tabs`, excluded from counts) is one predicate `(t.type !== 'home')` applied
at the handful of count sites the recon already enumerated (R1 (b), four sites). That predicate is
greppable and testable; "activeTabId might not be in the array" is a diffuse invariant that fails
silently.

Minimal fix: reconsider. If Home stays a synthetic renderer tab, putting it IN `tabs` with a
`type === 'home'` exclusion at the four counted sites (R1:60-92) is the smaller, more local change,
and it makes the existing render map work unmodified (it already maps `tabs` and gates by activeTabId;
you just branch `tab.type === 'home' ? <HomeView/> : <Terminal/>` inside the map). The plan's stated
reason for the separate slot does not survive contact with the remote renderer.

---

## D4 (MEDIUM) — The hero-ranking engine (Section 5, M6) is over-built for Phase 1 and half its tiers are untestable now.

Section 5 specifies six tiers and four tie-breaks. But in Phase 1:

- Tier 5 (line 285) is "Phase 2 @now todos and avoidance-category items" — there is NO todo store in
  Phase 1, so Tier 5 is structurally empty. M6 builds and tests a tier that cannot receive an item
  until Phase 2.
- Tier 1 (line 281, time-sensitive) keys off `time_sensitive`, which in the live board is `null` for
  the one existing program (I checked state.json). It can fire, but there is no fixture in the real
  data today, so its "test" is a hand-built fixture asserting a branch that no real card exercises.
- Tier 3 (the 90%-killer, `dodAlmost`) requires `dod.met === dod.total - 1 && dod.total >= 2`. The
  live card is `met:0, total:3` — not almost-done. Again real-data-empty in Phase 1.

So of six tiers, Phase 1 real data exercises Tier 2 (idle live tabs) and Tier 4 (needs-you cards).
The other four are speculative. Building and TDD-ing a six-tier engine where two-thirds of the tiers
have no Phase-1 producer is textbook YAGNI. The determinism/tie-break machinery (Section 5.4-5.5,
the `id` lexical tie-break, the anti-flicker rule) is real engineering effort spent on a sort that, in
1a, the producer already did for you (`poller.py:115`).

Minimal fix: in 1a, do not build `rankItems`. Render needs-you cards in the order the board already
provides. Introduce `rankItems` in 1b with ONLY the tiers that have a Phase-1 producer (idle-needs-you
above needs-you cards, plus dodAlmost since it is cheap and high-value), and add Tier 1/Tier 5 in
Phase 2 alongside their actual producers (time-sensitive surfacing and the todo store). TDD the engine
when the engine has inputs.

---

## D5 (MEDIUM) — The four "fallback-spawn" guards are mostly proving a no-op; M2 tests an invariant for code that does not exist yet.

Section 2.3 / M2 (lines 358-363) adds tests "that assert the Home tab is kept out of getTabs()-derived
counts (a regression net ... before Home exists)." M2's own description says "no code change." You are
writing tests, before the feature, asserting a property of an architecture decision (Home-not-in-tabs)
that M3 then implements — and the plan ALSO concedes (lines 78-79, 117-118) that the two real
spawn sites (`App.tsx:341-344`, `:524-527`) are "SAFE as-is" because they read `getTabs()`
(main-process truth, never contains Home). If they are safe as-is and Home never enters main-process
truth, there is nothing to regress at those sites. M2 is a test guarding against a mistake the chosen
architecture cannot make. That is ceremony, not coverage.

The genuinely load-bearing guard is the ONE behavioral change: `onTabRemoved` routing the last close
to Home instead of null (line 80). That deserves a test. The other three sites are "confirm by test"
of a no-op.

Minimal fix: drop M2 as a standalone milestone. Fold the single real assertion (last-tab-close routes
to Home) into M3's test, where the behavior actually changes. Do not spend a milestone writing a
regression net for a spawn path the architecture guarantees is untouched.

---

## D6 (MEDIUM) — composeClaudeQuery's scrubber (Section 3.4, M10) is belt-and-suspenders that ships in Phase 1 with no Phase-1 consumer.

Section 3.4 (lines 166-167) and R6 item 1 are emphatic: the SHIPPED default is "canned templates with
ZERO free-text interpolation." Good. But then the same section specifies a full `scrubFreeText()` with
digit-run redaction, email patterns, Bearer/token/secret patterns, and "a configurable name list,"
and M10's test (line 417) asserts the scrubber "redacts digit runs/emails/secret patterns." The plan
states the free-text path is "opt-in, never default" (line 167) and "It only matters if the LATER
positional-prompt optimization ships" (line 169, for the quoting half).

So Phase 1 ships a scrubber that, by the plan's own design, nothing in Phase 1 feeds. The canned
template is the guarantee (line 527: "The canned default is the real guarantee; the scrubber is
belt-and-suspenders"). Building, testing, and maintaining a regex PHI scrubber with a "configurable
name list" for a code path that has no Phase-1 caller is scope creep dressed as safety. Worse, a
half-tested regex scrubber that exists invites a future contributor to flip on free-text
interpolation believing it is safe (R6 residual itself rates "scrubber false-negatives" as Medium and
says "the canned-template default is the real guarantee").

Minimal fix: Phase 1 ships ONLY `composeClaudeQuery({action, repo})` with canned templates and a hard
assertion/test that NO free-text reaches the output. Do not build `scrubFreeText()` until the opt-in
free-text feature is actually scheduled. A scrubber with no consumer is a liability, not a control.
If you want a guard, make it a test that fails if anyone interpolates a non-allowlisted field.

---

## D7 (MEDIUM) — The program-board reader (M4) ships four redundant fetch mechanisms; the poll alone covers the goal.

Section 4.3 (lines 235-245) specifies, for ONE 4-5KB local JSON file on a 60s cadence: (1) a directory
watcher with filename filtering, (2) a 250-400ms debounce, (3) a 100ms-x3 ENOENT/EBUSY retry, AND
(4) a 15-30s safety-net poll, AND (5) an HTTP GET fallback to `127.0.0.1:5173/api/state`. That is five
mechanisms, and the plan's own risk note (R-2, line 523) says "The poll alone guarantees the UI is
never more than one producer cycle stale."

If the poll alone meets the freshness goal (one producer cycle = 60s, and a 20s poll beats that
3x over), then the directory watcher, the debounce, the retry ladder, and the HTTP fallback are all
optimizations for sub-60s latency that the recon explicitly says program-board's own cadence does not
provide anyway (R4: the producer writes every 60s; there is no sub-60s truth to chase). The dir-watch +
atomic-replace handling (R4 §c) is real Windows knowledge, but it is solving a latency problem the data
source does not have. For a status board that updates once a minute, a 20s poll with a try/parse/retry
is the entire correct design. The HTTP fallback adds a second code path, a second failure mode, and a
dependency on the Flask port for a file that is already on local disk.

Minimal fix: 1a ships the poll + read-with-retry only. That is testable (`parseState`, `computeFreshness`,
a temp-file read) and meets the freshness bar. Add the directory watcher ONLY if dogfooding shows the
20s poll feels laggy (it will not, for a 60s producer). Drop the HTTP fallback unless a real scenario
("file exists but is days stale AND the service is up") is observed; the empty-state already names the
resolved path when the file is missing, which is the actual first-run case.

---

## D8 (LOW) — Inherited line-citation conflict the plan did not resolve: render map 577-583 vs 578-581.

R5 (R5:53) explicitly corrects the render entry to `:578-581` and labels `:577-583` a
"wrong-revision artifact" from the prior recon. The PLAN uses `:577-583` throughout (lines 70, 114,
367, 549) and its authority order (line 11) says "round-2 R-docs win on every conflict." R5 IS a
round-2 R-doc and it conflicts with the number the plan adopted. I checked: the `<Terminal>` JSX is
578-582 inside the container at 576, with the map opening at 577 and closing at 583, so both are
defensible depending on whether you count the `{tabs.map(` line and the closing `))}`. This is not a
build-breaker, but the plan claims byte-accurate citations re-resolved against HEAD (line 4) and then
carries a number a round-2 R-doc flagged. It signals the citations were copied from R1 without
reconciling R5's correction.

Minimal fix: state the range as `App.tsx:576-583` (container through map close) once, and stop citing
a single contested line. Cosmetic, but the plan's credibility rests on "every file:line verified," so
an unreconciled conflict with its own governing doc is worth one sentence.

---

## D9 (LOW) — The Phase 2 todo store re-imports the avoidance-category framework, the J.O.T. horizons, parking/resurfacing, and triage mode. That is a third product.

Section 8 sketches Phase 2 as a JSON store, but the sketch carries: three horizons (@now/@next/@later),
six avoidance categories with a pinning rule that bypasses recency (line 466), parking with
durations and resurfacing on poll tick (8.7), a triage mode (8.3), a capture bar with a keybinding
(8.5-8.6), and a morning intake cue (8.7), and M12-M17 to build it (line 482). That is not "a todo
store"; it is a personal-productivity methodology engine. It is correctly fenced OUT of Phase 1, so it
is not a Phase-1 ship risk — hence LOW — but it confirms the lens's suspicion: this is ultimately
THREE products (board reader, attention/ranking surface, J.O.T. productivity system) and the plan only
admits to two phases. When Phase 2 is actually scoped, it will face the same "is this fused?" question
this review raises about Phase 1.

Minimal fix: when Phase 2 is planned, apply the same 1a/1b discipline: ship the dumb capture+list+done
store first (text in, list out, mark done), and treat horizons, categories, parking, and triage as
separate additive milestones each gated on real use. Note it now so the Phase-2 plan does not repeat
the Phase-1 fusion.

---

## What I am NOT objecting to (so a wrong result is easy to trace)

- The recon (R1-R6) is sound. Citations verified: App.tsx render map (577-583 maps `tabs`), the two
  listeners (onTabUpdate 354-364, onTabRemoved 366-381 with the `remaining.length===0` null at 373),
  tab-manager updateStatus flat setter (55-58), the registration test shape (182-206), and the live
  state.json schema + naive-local `generated_at` + offset-bearing `last_touched`. All correct.
- The three corrections to synthesis (write-after-ready primary, idle+hadActivity spine not
  requires_response, watch-the-directory) are right and well-justified by R2/R3/R4.
- The "Home is renderer-only, never in TabManager" core decision (Section 2.1) is correct and is the
  right way to dodge the phantom-tab and activation-count hazards. My D3 objection is narrowly about
  the SEPARATE-SLOT sub-decision, not about keeping Home out of TabManager.
- The remote disabled-state discipline for PowerShell (Section 3.2) and the canned-template PHI
  default (Section 3.4) are the right defaults.
- Write-after-ready with the once-flag (Section 3.1) is a clean, no-new-IPC mechanism.

The defect is not the analysis. It is that the PLAN packed the attention/ranking/actions PRODUCT into
the same Phase 1 as the data-reader, made one milestone (M3) untestable as written, and front-loaded
machinery (six-tier ranker, PHI scrubber, five-mechanism fetcher) whose Phase-1 consumers do not exist.
Cut Phase 1 to the data-reader the plan says it is, and ship that first.
