# Advisor review (round 3): ADHD design coach lens

Reviewer role: ADHD ergonomics advisor. Date: 2026-06-20 (round 3).
Target: `docs/dashboard/PLAN.md` (round-3 revision), `dashboard` worktree, HEAD `ce2e9e0` (verified).
Lens: deepen the ADHD ergonomics so the design measurably lowers activation energy. Grade against J.O.T. one-thing hero, calm-by-default, sub-2s capture, shame-free avoidance nudges, restrained dopamine feedback.

Hard constraints I checked the plan against and held my own prose to: `claude-terminal-dashboard` worktree only; PowerShell 7 is the shell; no em dashes, no AI-slop words; no PHI in argv/logs/artifacts; AGENTS.md IPC discipline (handler + preload + `global.d.ts` + registration test + explicit remote decision per new channel); every keybinding challenged; vitest test-first for logic; boringly small milestones (one change, one expected test, one rollback point each).

## Verdict

Round 3 is the strongest revision yet, and it is the right kind of strong: it pruned. Round 2 swung from too thin to too busy and bolted five interactive mechanisms onto Phase 1; the ADHD skeptic called that a control panel wearing a calm coat. Round 3 absorbed that critique almost completely. The hero affordance budget is now a hard cap (1.1, one full-weight button + one quiet "not now" + one quiet copy); re-roll and lock-in are no longer both persistent (1.1, 1.9); the stall-interrupt is in-place not a relayout, default OFF, with mandatory motion arbitration (1.8, M16); lock-in moved to intake-only (1.9); the done-lane count is suppressed at zero and honestly scoped to "since open" (1.5); the count-up is minute-coarsened off the poll tick (1.2); the goal-gradient finally ships in Phase 1 off `dod.met`/`dod.total` (1.10); the avoidance-pin classifier got pulled to Phase 2 (8.4); the single-field hero override stops the Phase-1 hero from being "newest commit" (1.11); and the notification amplification is named as a risk with the idle-toast demotion as a Phase-1 mitigation (9.4, R-12). On the five named axes the design is now around **8.5/10**. Nearly every round-2 ADHD finding landed.

What keeps it off 9 is not a missing mechanism. It is that three of the highest-confidence findings in the recon are honored as *principle* but not yet pinned to a *testable surface or a measurable target*, and the lens grades on "measurably lower activation energy," not "stated intent." Specifically:

1. The button label is the micro-step (E1 P4, high-confidence), and the plan's verb-first labels are generic ("Open PowerShell here", "Confirm the send") rather than the smallest concrete first move. This is the single cheapest unclaimed activation-energy win left.
2. Sub-2s capture is the lens's one *numeric* target, and round 3 quietly weakened it: capture moved to Phase 2 (1.3), the measured focus-on-keydown test that round 2 had in M12 is now described as "tested" but the sub-2s number is not encoded anywhere as a falsifiable assertion. The lens names a number; the plan must assert that number.
3. The endowed-progress win the plan correctly added (1.10) stops at the hero and the DoD rows. E5 P5 is "never show a goal at zero" as a global rule, and the goal-gradient is most motivating exactly where the plan does not yet apply it: the empty/caught-up state and the single-item-DoD "0 of 1" case, which currently reads as a goal at zero.

Below: must-fix (in scope for Phase 1 as scoped, or a one-line scope decision) and deepen-the-ergonomics. I do not re-litigate what round 3 already fixed; the "kept right" list records it so the fixes do not regress it.

---

## What round 3 already gets right (keep these, do not regress)

- The hero affordance budget is a HARD cap stated as an invariant (1.1, 6.3): one full-weight primary button, one quiet "not now", one quiet copy, and re-roll and lock-in are never both persistent controls at once. This is the exact fix the round-2 skeptic D1 demanded (E1 AP4, E5 anti-pattern 7, E7 C7). It is the difference between a one-thing hero and a control panel.
- The stall-interrupt is in-place (pulse + dim by opacity, nothing moves position), default OFF, Phase 3, with mandatory motion arbitration so only one motion source runs at a time (1.8, M16). Round-2 skeptic D2 landed in full. The plan correctly noticed that an auto-relayout fires on exactly the frozen-in-paralysis user it claims to exempt.
- Lock-in is intake-only and the locked hero never adds "still not done" / time-since-lock language, with the evening softening toward "carry to tomorrow" (1.9, 6.6, E7 F6, C2). Round-2 skeptic D1/D7 landed.
- The done-lane count is suppressed entirely at zero (never "0 closed"), scoped honestly to "resolved since open" (in-memory, reset on launch, not persisted), with the answered-`requires_response` count deferred with its source named (1.5, 4.6, R-8). Round-2 skeptic D5 landed.
- The count-up is minute-coarsened, recomputed on the ~20s poll tick not a `setInterval(1000)`, frozen/coarsened further under reduced-motion, with true per-second ticking reserved for an explicit Phase-3 focus timer (1.2, E4 A7, E3 P7). Round-2 skeptic D6 landed.
- The goal-gradient ships in Phase 1 off `dod.met`/`dod.total` verbatim, turning the 90%-killer from a demand into a pull (1.10, M4). Round-2 advisor MF-2 landed.
- The two time computations (working count-up vs idle duration) are specified as distinct and the M9 test asserts the working value INCREASES across fake-timer ticks and is semantically distinct (1.2, 6.4, M9). Round-2 advisor MF-3 landed.
- The idle-toast demotion behind `notifyOnIdle` is a named Phase-1 milestone with the deferred coalescing/Focus/quiet-hours stated as a Phase-3 decision in R-12, not a two-sentence dismissal (9.4, R-12). Round-2 advisor MF-1 landed.
- The avoidance-pin classifier is pulled to Phase 2 (not Phase 3), so the code-activity-only Phase-1 gap closes as soon as the ranker lands, and R-8 states the Phase-1 gap plainly (8.4, R-8). Round-2 skeptic D4 landed.
- The single-field hero override stops the dogfoodable Phase-1 hero from being "whichever needs-you card has the newest commit," using time-sensitive-within-5-days then dodAlmost then board head (1.11, M8a). This is a genuinely sharp catch: without it, the first thing Mark sees contradicts the thesis.
- Copy voice is pinned in ONE module with a voice test covering empty/error/loading/degraded/goal-gradient/pull-forward AND the nudge/lock strings, asserting zero em dashes, zero slop, and no "still not done" / time-since-lock language (6.6). Round-2 advisor MF-4 landed.
- The caught-up pull-forward ("Pull one forward?", one quiet dismissible line, never a list) and the empty-board live-tab hero eligibility are both specified and tested (4.6, M8b). Round-2 advisor D-1/D-3 landed.

This is a long list because round 3 did the work. The items below are the 8.5-to-9 frontier, not a re-open of settled ground.

---

## Must-fix (raises the floor toward 9; in scope or a one-line scope decision)

### MF-1. The button label is the micro-step, and the plan's labels are still the whole task, not the smallest first move

Where: 1.7 (the `pickPrimaryAction` verbs: "Draft the first version for review", "Open PowerShell here", "Confirm the send"), 6.3 (hero anatomy), E1 P4 (high-confidence), E1 4.2, E7 C6.

Why it fails the lens at the frontier: E1 P4 is explicit and high-confidence: "the button text IS the micro-step." The whole activation-energy thesis (E1 1: starting costs ~10x continuing) routes through the label on the one button the hero exists to make cheap. The plan reframes the *query content* as a micro-step (draftFirstVersion turns create into review, which is excellent and the headline affordance), but the *button label itself* is still framed at task scale. "Open PowerShell here" tells Mark the mechanism, not the first move. "Confirm the send" is closer but still names the whole act. E7 C6 names the failure: "Whole-task nudges with no tiny first step... re-presents the dread." For an avoidance item, the label is the last thing standing between window-focus and the first keystroke, and a task-scale label re-loads the dread the hero is supposed to strip.

This is not asking for free text on the button (that would reopen the PHI seam). It is asking the canned label set to be sized to the smallest move, the same way the canned query was. The plan already proved it can pin canned strings safely; do it for the labels too.

Fix (Phase 1, small, no new data, no PHI surface):
- Make the `pickPrimaryAction` -> label mapping a fixed table of micro-step labels, one per `KnownActionId`, sized to the first move: `draftFirstVersion` -> "Draft the first version" (already micro, keep it); `needs-CADDC02`/powershell -> "Open a shell to start" (the move is "start", not "here"); `reviewTodos` -> "Look at the open TODOs" (E1 4.2's "look at the number" register, the smallest possible move); `summarizeChanges` -> "See what changed". The label names what Mark does in the next five seconds, not the deliverable.
- This is a one-table change in the copy module (6.6) plus the existing voice test extended to assert each label is present and slop/em-dash-free. No new milestone; it tightens M8a/M10 and 6.6.
- One sentence in 1.7: the canned label set is sized to the smallest concrete first move (E1 P4), not the task goal, and is pinned in the copy module like the query templates.

This is the cheapest unclaimed win in the plan: it changes a string table and a test, touches no data, widens no PHI surface, and it is the literal mechanism the highest-confidence executive-function finding names.

### MF-2. Sub-2s capture is the lens's one numeric target and round 3 dropped both the number and the milestone out of the gradable phase

Where: 1.3 (capture deferred to Phase 2, "the design ... is held in 8.5"), 8.5 (M12, "Enter saves raw text ... the measured sub-2s claim, tested"), open question 5.

Why it is a real regression and not a nit: the five lens axes are J.O.T., calm, **sub-2s capture**, shame-free, restrained dopamine. Four are qualities; one is a number. Round 2 had capture in Phase 1 with the measured focus-on-keydown assertion as the M12 test, and the round-2 advisor recorded it as landed. Round 3 made a defensible architecture call (capture is the heaviest plumbing, by data lineage it fronts Phase 2) but in moving it, the *measurable* part of the lens left the gradable phase, and 8.5's "the measured sub-2s claim, tested" no longer says what the assertion IS. "Sub-2s" with no encoded threshold is exactly the "asserted not tested" pattern round 3 fixed everywhere else (it made count-up testable, goal-gradient testable, motion-arbitration testable). Capture is the one place where the upgrade slid backward.

I am not asking to pull capture back to Phase 1 (the data-lineage argument is sound, and object permanence, E1 P5/4.7/AP5, can hold one phase). I am asking the number to survive the move as a falsifiable target:
- In 8.5/M12, encode the sub-2s claim as a concrete test, not an adjective: the bar opens and focuses its input synchronously on the keydown handler (assert `document.activeElement === input` in the same tick the chord fires, no `await`, no `setTimeout`), and Enter persists with only `text` set (zero required fields asserted). Synchronous-focus-on-keydown is the testable proxy for "sub-2s"; a render that focuses in a `useEffect` or after an IPC round-trip fails it. That is the mechanical guarantee behind the number.
- State in 1.3 that the sub-2s target moves WITH the milestone to Phase 2 as a measured assertion, so the lens's one numeric axis is never just prose. One sentence + the M12 test wording.
- One-line scope decision for Mark (open question 5 already touches store scope): confirm capture-in-Phase-2 is acceptable given it pushes the only quantified ADHD target out of the first dogfoodable build. If he wants the number provable on day one, the keydown-focus shell is the smallest thing that could ship in Phase 1b without the remote channel (a renderer-only local-write capture, remote deferred). Flag it; let him pick.

### MF-3. "Never show a goal at zero" is a global E5 rule, and the plan still shows three goals at zero

Where: 1.10 (goal-gradient on hero + DoD rows, the "0 of 1 done" single-item case), 4.3/6.5 (the caught-up empty state), E5 P5 (high-confidence), E5 anti-pattern 5.

Why it fails the lens: the plan added the goal-gradient (good, MF-2 from round 2 landed) but applied E5 P5 as a *local* hero treatment, when E5 P5 is a *global* rule: "When the dashboard presents a batch or a multi-step item, show it as already partway done... a bar that starts at 0 of 8 reads as a mountain." Three surfaces in the plan currently present a goal at zero, which is the precise anti-pattern P5 names:

1. The single-item-DoD case renders "0 of 1 done, last step: <gap>" (1.10, verified live: `incomplete-notes` is `total:1, met:0`). The plan is proud of preserving this item (4.4 fights to keep it on needs-you), but "0 of 1" is a goal at zero, which P5 says reads as a mountain. The endowed-progress fix is in P5 itself: count surfacing/opening as the first step. Reframe the single-item case as "one step from done" or "last step: <gap>" WITHOUT the demotivating "0 of 1" fraction. The fraction is honest but it is the exact frame P5 forbids; the gap label alone carries the information without the zero.
2. The caught-up state pays out the done count and offers the pull-forward, but it offers no sense of *cumulative* progress, which is where endowed progress lives in a status board. A quiet "you cleared the board" is a finish line; that is the moment to show the goal already crossed, not reset to a blank "Clear. Keep working." This is small: the caught-up state is the one place a (suppressed-when-zero) "N closed since open" already lives, so it is half-built. P5's point is that the cleared state should read as a goal *reached*, not a goal at zero waiting to refill.
3. Any needs-you row with `dod.total > 0 && dod.met === 0` (not just the single-item case) shows a zero fraction. The rule is the same: lead with "last step" / "almost there" framing for `dodAlmost`, and for a genuinely-zero-progress multi-step item, show the count of steps as the endowment ("5 steps, start the first") rather than "0 of 5", so the goal is never presented at zero.

Fix (Phase 1, small, no new data):
- In 1.10, state the global rule (E5 P5): no surface renders a goal at zero. The `dodMet === 0` case (single-item or multi-step) leads with the gap label and a "start the first step" frame, never the bare "0 of N" fraction. The M4 test already covers the single-item case; change the asserted string from "0 of 1 done" to the zero-free frame.
- One sentence in 6.5: the caught-up state acknowledges the goal reached (the closed count when nonzero), so the cleared board reads as a finish, not a blank reset.

This is a copy-and-predicate change, not architecture, and it closes the gap between "the plan added a goal-gradient" and "the plan honors E5 P5," which are not the same thing.

---

## Deepen the ergonomics (moves 8.5 toward 9)

### D-1. The morning intake is the one sanctioned "now is the moment to act" cue, and the plan defers the whole cue-binding mechanism without using the cheapest cue it already has

Where: 1.9 (lock-in at "first-open / morning intake"), 8.7 (the morning ritual, Phase 3), E7 P2/P3/P5/F1 (all high-confidence), E7 implementation-intentions (large-effect meta-analysis).

E7's single most evidence-backed technique is implementation intentions: bind the nudge to a cue the user already hits, not willpower (P5, the PMC meta-analysis, high-confidence). The plan defers the entire morning/evening ritual to Phase 3, which is the right call for the *ritual UI*. But the plan already has the cheapest possible cue sitting unused: `startupView` (M14) and the app-open event. App-open is a cue. The plan opens on Home (when opted in) and paints the hero, but it does not treat the first open of the day as the "declare intent / here is the one thing, lock it in?" moment E7 F1 describes; it just renders the board.

I am not asking to build the Phase-3 ritual early. I am asking the plan to name app-open as the reserved cue now, so the Phase-1 Home and the Phase-3 ritual share one mechanism instead of the ritual inventing a second one later:
- One sentence in 1.9 or Section 8.7: the implementation-intention cue is app-open (and later first-open-after-Nam), not a wall-clock alarm; Phase 1's Home-on-open is the unstyled precursor, and the Phase-3 morning intake is the same cue with the lock-in gesture attached. This makes the deferral a sequencing decision (consistent with how 9.3 names the stale-synthesis overturns), not a silent gap, and it keeps E7's highest-confidence finding from being orphaned across the phase boundary.
- No code change. It is the framing that tells the M17 builder the cue already exists and where it fires.

### D-2. The deterministic ranker plus per-day re-roll/pin needs a stated "what survives a restart" rule, or the dreaded hero re-confronts Mark every time he reopens the app

Where: 1.6 (re-roll parks the hero id "renderer-side parked-id-with-expiry, no store"), 1.9 (per-day pinned-hero-id, read by lock-in), M3b (the per-day pinned-hero-id slot), open question 1/6.

This is the round-2 advisor D-5 item, partially addressed (re-roll is now the hero's single "not now") but the persistence question is still open and it matters for the lens. The re-roll parks the dreaded hero "renderer-side, no store, with expiry." If that park is renderer-only, an app restart (or a renderer reload, which the plan handles at `App.tsx:310`) un-parks the dreaded item straight back to the hero. For an avoidance brain, reopening the app to the exact thing you deferred this morning is the guilt-billboard dynamic 1.6 exists to prevent (E5 5.1, E1 P8). The plan already mints a per-day pinned-hero-id slot in M3b for lock-in; the parked-id should ride the same per-day lifetime so re-roll and lock-in share one temporal model.

Fix (Phase 2, small, when re-roll ships in M6):
- Decide and state: the parked-hero-id is per-day, persisted next to the per-day pinned-hero-id from M3b (same slot mechanism, already built), so a restart does not re-confront a deferred item the same day. State the re-roll window default (until end of day, matching lock-in's per-day lifetime) the way the plan states the 150s/10min/45-60s/5-day defaults, so all tunables live in one place (open question 2).
- One assertion in M6: a parked hero id is still parked after a simulated reload within the same day, and clears on a new day. This is the test that protects the avoidance brain from its own deferral being undone.

### D-3. The idle-age floor is correct, but "N need you" can still read as zero-when-something-is-waiting on the day the board service is down, and the empty-board hero rule should also cover the count

Where: 5.2 (idle-age floor), 4.6/M8b (empty-board live-tab hero eligibility), 6.3/6.4 (the needs-you header "N need you / N working").

The plan correctly makes an `idleNeedsYou` live tab hero-eligible when `programs:[]` (4.6, M8b, the round-2 D-3 fix). But the needs-you HEADER glance metric ("N need you / N working", 6.3) is described as living in the needs-you list header, which is the program region. On the day the board is down (R-1), the header could read "0 need you" while a live tab is in fact waiting on Mark and correctly promoted to the hero. A "0 need you" header sitting above a hero that is a waiting session is internally contradictory and, worse, tells the time-blind brain "nothing needs you" at the exact moment something does (E3 P4, the not-now-made-visible rule; E7 C9, the completing-the-loop loop must not die silently).

Fix (one assertion, no new architecture):
- State in 6.3 that the "N need you" glance count is computed off the UNIFIED item set (board needs-you + past-floor `idleNeedsYou` tabs), the same source the hero draws from (4.6), so the count and the hero never disagree. Add to the M8b test: with `programs:[]` and one past-floor `idleNeedsYou` tab, the header reads "1 need you", not "0", and that tab is the hero. This closes the seam where an empty board makes the count lie about a waiting loop.

### D-4. Restraint on the done-lane settle is right; add the one explicit "no streak, no chain" guardrail the recon flags twice as the highest-risk dopamine trap

Where: 1.5 (done-lane payoff: "No confetti, no streaks"), 8.7 ("No confetti, no hard streaks"), open question 8 (streak appetite, default none), E5 anti-pattern 2 (high-confidence), E7 C10/P10.

The plan says "no streaks" in two places, which is good, but it says it as a passing clause, not as a pinned guardrail with a test, and streaks are the single most-warned-against dopamine trap in the recon (E5 anti-pattern 2, E7 C10, both high-confidence, both citing loss aversion producing ADHD shame spirals). The plan pins the copy voice with a test, pins the affordance budget with a test, pins motion arbitration with a test. The "no streak / no chain / no loss-aversion counter" rule deserves the same treatment, because it is the one carrot that, if a future contributor adds it innocently ("a little 'N days in a row' would be motivating"), silently weaponizes Mark's neurology against him (E5 anti-pattern 9).

Fix (Phase 1, one test):
- Add to the 6.6 copy/voice test (or the M8b done-lane test): assert the done-lane and caught-up surfaces contain no streak/chain/consecutive-day language (no "in a row", "streak", "don't break", "N days"). This is the same mechanical guardrail the plan already uses for em dashes and "still not done", applied to the highest-confidence dopamine anti-pattern. One assertion.
- One sentence in 1.5: if any show-up signal is ever added (open question 8), it rewards attendance to a check-in, never performance, and ships grace-from-day-one (E7 P10), never a hard chain. State it as a decision so a future "soft streak" cannot arrive without the grace logic.

### D-5. Land in pwsh 7, not powershell 5.1, because the workspace is PS7 and every wrong-shell landing is a papercut on the avoidance act-path

Where: 3.2 (Open PowerShell spawns `powershell.exe` 5.1 via `platform.ts:15`), Section 9 + open question 9 (defer a `pwsh` option), and the workspace constraint (PowerShell 7 is the shell).

This is the round-2 advisor D-4 item, still unaddressed. The lens cares about every papercut between window-focus and first keystroke, and the hard constraints for this very task name PowerShell 7 as the shell. The CADDC02 follow-ups and the financial/marketing act-paths the dashboard exists to shorten all assume `pwsh`. Landing Mark in 5.1 when he clicked "Open a shell to start" on an avoidance item is a recurring friction tax, and 5.1-vs-7 behavior differences are exactly the surprise that derails an avoidance-task start. This is a one-line shell-id choice with a `powershell` fallback, not a Phase-9 follow-up.

Fix (small, pull into M10):
- Resolve `pwsh` if present, fall back to `powershell`. Test: the resolver prefers `pwsh` when present (mock the lookup). It is free, it honors the workspace constraint more tightly than the current plan, and it removes a papercut on precisely the avoidance items. If `pwsh` resolution on Mark's box is genuinely uncertain, ship `pwsh`-with-fallback and the resolver test; do not defer it.

### D-6. Make "one full-weight button" a structural test, not only a prose cap

Where: 1.1 (the hard affordance budget), 6.3 (hero anatomy), 6.2 (the dominance-level render test asserts the hero title carries `text-xl`).

The affordance budget (1.1) is the round-3 win, but it is enforced by prose and by the dominance-class test (6.2 asserts the title is `text-xl`, a strip row is `text-muted-foreground`). What is not asserted is the *count* of full-weight buttons on the hero, which is the actual AP4 guard (E1 AP4, E5 anti-pattern 7). The round-2 advisor D-6 asked for this and it is still unenforced in round 3. Because re-roll (Phase 2) and lock-in's intake state (Phase 3) add controls over time, the one-button invariant is exactly the thing a later phase can erode without noticing.

Fix (one render test, no new milestone):
- Add to the M8a HomeView test: the hero renders exactly ONE full-weight `Button` (the primary action), and copy/re-roll/any-secondary render at the demoted icon/quiet scale. A render test that counts `bg-[--attention]`-weight buttons === 1. This makes "one obvious next move" a structural guarantee on the busiest card across all three phases, the same way 1.1 bans a fourth dominance level. It is the AP4 guard applied where the plan adds the most controls over time.

---

## Constraint compliance check (the plan, and my own additions, against the hard constraints)

- Worktree scope: the plan is grounded to `claude-terminal-dashboard` at `ce2e9e0` and re-grounds the stale-synthesis citations (9.3). I verified my code-touching claims against this checkout: `TabIndicator.tsx` glyphs (working `animate-spin` bare, requires_response `animate-pulse` bare, both confirmed for MF-context), the `ctrl+shift` matcher arm case-sensitivity (`keybindings.ts:73-95`), HEAD `ce2e9e0`. Clean.
- PowerShell 7: D-5 pulls the `pwsh` choice into M10; the plan currently defers it to Phase 9. My recommendation honors the constraint more tightly than the plan does.
- No em dashes / no AI-slop: this review is clean. MF-1 and MF-3 extend the plan's own pinned-copy discipline to the button labels and the zero-goal frames; D-4 extends the voice test to streak language. All additions stay inside the one copy module the plan already mandates.
- No PHI in argv/logs/artifacts: MF-1's micro-step labels are a FIXED canned table, zero free text, so they widen no PHI surface (this is why I ask for a label table, not free-text labels). MF-3's `dod.met`/`dod.total` are integers. MF-2's capture text is already display-only and server-validated (8.5); my ask is only to encode the focus-timing assertion, no data change. D-3's count is computed off structured `needsYou`/`idleNeedsYou` booleans. None of my additions touch `blocked_on`/`detail`/`dod.gaps` free text or reach `composeClaudeQuery`/`log.*`.
- AGENTS.md IPC discipline: none of my additions create a new IPC channel. MF-1/MF-3/D-4/D-6 are renderer-side copy + render tests. MF-2 tightens the existing M12 capture channel's test (the channel already gets the full five-part treatment in the plan). D-2 reuses the M3b per-day slot (no new channel). D-5 is a main-process shell-id resolver (no channel). D-1 is framing only. If a future Phase-3 morning-intake needs a renderer-to-main cue channel, full treatment then.
- Keybinding challenge: I add no keybinding. `Ctrl+Shift+K` (uppercase `'K'`, verified the matcher is case-sensitive at `keybindings.ts:77` so the plan's 8.6 uppercase note is correct) stays the one to raise with Mark.
- Vitest test-first for logic: every fix carries a concrete test (MF-1 label-presence in the voice test; MF-2 the synchronous-focus assertion in M12; MF-3 the zero-free fraction string in M4 + the caught-up acknowledgement; D-2 the parked-id-survives-reload assertion in M6; D-3 the unified-count assertion in M8b; D-4 the no-streak-language assertion; D-5 the resolver-prefers-pwsh test; D-6 the one-full-weight-button render count in M8a). The discipline extends to exactly the surfaces where intent still outruns a test.
- Boringly small milestones: maintained. MF-1 is a label table + a test assertion (tightens M8a/M10/6.6). MF-2 tightens M12's test wording + one sentence in 1.3. MF-3 is a predicate/string change + one M4 assertion. Each deepen item is one change, one expected test, one rollback point, slotted into an existing milestone, no new milestone introduced.

## Bottom line

Round 3 did the hard thing: it pruned the round-2 over-correction back to one-thing and calm-by-default, and it made nearly every stated principle testable. The mechanical layer is at 8.5. To reach 9, close the gap between principle and provable surface on the three highest-confidence findings the plan honors only in prose: size the button label to the micro-step (MF-1, the cheapest activation-energy win left, E1 P4), keep sub-2s capture as a *number* when it moves to Phase 2 (MF-2, the lens's one quantified axis), and apply "never a goal at zero" globally instead of only on the hero (MF-3, E5 P5). The deepen items (name app-open as the reserved cue, persist the re-roll park per-day, make the empty-board count tell the truth, pin the no-streak guardrail with a test, land in pwsh 7, and turn the one-button cap into a render assertion) are the polish between a calm board you read and a calm command center you act from in under two seconds, which is the lens's actual bar.
