# Advisor review (round 2): ADHD design coach lens

Reviewer role: ADHD ergonomics advisor. Date: 2026-06-20 (round 2).
Target: `docs/dashboard/PLAN.md` (round-2 revision), `dashboard` worktree, HEAD `ce2e9e0`.
Lens: deepen the ADHD ergonomics so the design measurably lowers activation energy. Grade against J.O.T. one-thing hero, calm-by-default, sub-2s capture, shame-free avoidance nudges, restrained dopamine feedback.

Hard constraints I checked the plan against and held my own prose to: dashboard-branch worktree only; PowerShell 7 is the shell; no em dashes and no AI-slop words; no PHI in argv/logs/artifacts; AGENTS.md IPC discipline (handler + preload + `global.d.ts` + registration test + explicit remote decision per new channel); every keybinding challenged; vitest test-first for logic; boringly small milestones (one change, one expected test, one rollback point each).

## Verdict

This is a different plan from round 1. The round-1 ADHD review (and the ADHD skeptic) hit it hard, and the round-2 revision absorbed nearly all of it: the reframe-as-review query is now a fixed `draftFirstVersion` template chosen by a tested `pickPrimaryAction` mapper (1.7, M6); sub-2s capture is real in Phase 1 with a measured focus-on-keydown test (1.3, M12); the done-lane payoff ships from existing data (1.5, M8b); the manual re-roll, the stall pattern-interrupt, and the minimal commitment mirror are all in Phase 1 (1.6, 1.8, 1.9, M13/M14); the idle-age floor fixes the badge-soup firehose (5.2); the hero saturation cap distinguishes list-row red from hero red (1.4). On the J.O.T. / calm / capture / shame-free / restrained-dopamine axes the mechanical layer is now around **8/10**.

What keeps it off 9 is one whole lane the plan still treats as out of scope, plus three smaller holes where a principle is stated but the surface or the test that proves it is missing.

The big one: **E6 (interruption / notification cost) is deferred almost entirely** (Section 9.4: "Notification policy NOT changed in Phase 1"), yet Phase 1 ships an always-on, self-refreshing surface that *inherits the existing toast-per-event engine unchanged*. E6 calls that engine "an interruption engine" and rates the fix high-confidence. Verified in code: `notifyTabActivity` (`hook-router.ts:23-48`) fires a fresh OS toast on every `idle` and every `input`, deduped only per-tab via `pendingNotifications`, with no cross-tab batching, no Focus gate, no quiet hours. With the dashboard actively pulling Mark into running more concurrent sessions (its whole reason to exist), the per-tab dedup leaks one toast per session per turn. The plan optimizes the calm of the *visual* surface and leaves the loudest ADHD-hostile channel (OS push) firing at its current rate. That is the gap between "a calm board" and "a calm command center."

The rest are: endowed-progress / goal-gradient (E5 P5, a high-confidence finding) is completely absent, not even a Phase 2 note; count-up for active work is asserted (1.2) but its surface in the strip is underspecified relative to "stalled Nm"; and the avoidance-nudge copy that three lanes call the headline relationship move (E7 F3/F8) has no fixed string and no voice test, while the empty/error copy does.

Below: must-fix (in scope for Phase 1 as scoped, or a one-line scope decision) and deepen-the-ergonomics (moves 8 toward 9). I do not re-litigate what the round-2 plan already fixed; the "kept right" list records it so the fixes do not regress it.

---

## What the round-2 plan already gets right (keep these, do not regress)

- The reframe-as-review query is now a fixed `draftFirstVersion` template routed by a tested pure `pickPrimaryAction` mapper, with a zero-interpolated-free-text assertion (1.7, 3.4, M6). This was round 1's MF-1 and it is the single highest-leverage affordance; it is now a guarantee, not a verb buried in a generic enum.
- Sub-2s capture is real in Phase 1, remote-enabled, with the measured claim ("input focused synchronously on keydown, Enter persists with only `text` set") encoded as the M12 test (1.3). Round 1's MF-2/MF-3 landed.
- The done-lane payoff ships from Phase-1 data (program cards crossing into Done + answered `requires_response`), with `justResolved`, a 150-200ms settle, and the reduced-motion no-transition variant as its own acceptance criterion (1.5, M8b). Round 1's MF-4 / skeptic D1 landed.
- The idle-age floor (5.2) is the right fix for the per-turn `idle` firehose: a tab idle-with-activity under the ~45-60s floor stays subordinate, so "N need you" keeps meaning something. Round-1 skeptic D2 landed, and the plan correctly grounds `hadActivity` in the main-side `firstActivityAt` so it survives reload and rides `tabs:sync`.
- The hero saturation cap (1.4) separates verbatim list-row age color from a capped thin-band hero, paired with the re-roll so a hot dreaded item is always deferrable. Round-1 skeptic D4/D5 landed.
- The stall pattern-interrupt (1.8, M13), the minimal commitment mirror (1.9, M14), and the manual re-roll (1.6) are all in Phase 1, default-ON where appropriate, fake-timer tested. Round 1's MF-5 / skeptic D3/D4 landed.
- The factual correction from round 1 (the `working` glyph also uses `animate-spin`, not just `animate-pulse`) is absorbed: 1.2 now names both and requires the reduced-motion variant to suppress the spin too. Verified in `TabIndicator.tsx:15,27`.
- Calm-by-default discipline holds: one accent reserved for the hero CTA and the single highest dot, update-in-place, relative time via one helper, count-up-not-countdown stated (1.2). This is textbook E3/E4/E5.

---

## Must-fix (raises the floor toward 9; in scope or a one-line scope decision)

### MF-1. The notification engine is the loudest ADHD-hostile channel and the plan leaves it untouched while amplifying its inputs

Where: Section 9.4 ("Notification policy NOT changed in Phase 1... A `notifications` settings block is a Phase 2 refinement"), Section 2 (the always-on reader), and the inherited `notifyTabActivity` (`hook-router.ts:23-48`).

Why it fails the lens at the 8-to-9 frontier: E6 is an entire high-confidence lane and the plan engages with exactly none of its load-bearing findings. E6 P1/P2/P3, F2/F3/F4 converge on: pull over push; batch bursts into one summary; only `requires_response` (a true block) earns a push, `idle` ("finished") should be a quiet dashboard update; and a Focus state that mutes non-blocking signals when the active tab is `working`. Verified against code, today the app does the opposite of every one of these: it toasts on both `idle` and `input` (the `idle` path is the "finished" ping E6 F3 says to demote), the only throttle is a per-tab `Set` (E6 F4's named gap), and there is no Focus or quiet-hours gate (E6 A4).

The dashboard makes this worse without touching it. Its stated purpose is to surface needs-you across many programs and pull Mark into more concurrent sessions. More sessions running through more turns means the per-tab dedup leaks proportionally more toasts. The plan builds a calm visual surface and routes the user straight into a louder push stream. For a brain where one involuntary switch costs ~23 minutes of re-entry (E6 1), this is the single biggest activation-energy regression hiding in an otherwise activation-energy-lowering plan.

I am not asking to build E6's full Focus/quiet-hours/coalescing system in Phase 1. I am asking for the smallest honest move plus an explicit decision:

- Phase 1, small and tested: demote the `idle` ("finished working") toast to a quiet dashboard update by default, behind a settings flag that defaults OFF-toast (E6 F3). This is a `shouldNotify(tabId, kind)` predicate in `hook-router.ts` (extend the existing `!isActive` guard at `:60,127,136` referenced by E6) plus a `notifyOnIdle` setting in the store, mirroring the M11 `startupView` pattern exactly. `requires_response` keeps pushing (it is a real block, and it is avoidance area #4, completing-the-loop). One change, one settings round-trip test plus a `shouldNotify` unit test, one rollback point. It is the same shape as M11 and it removes the highest-frequency uninvited interruption the dashboard amplifies.
- The harder pieces (cross-tab coalescing window F4, Focus-on-active-working F2, quiet hours F9) stay Phase 2, but the plan must say so as a *named decision with the consequence stated*, the way Section 9.3 names the stale-synthesis overturns. Right now Section 9.4 dismisses the whole lane in two sentences ("preserved exactly... a Phase 2 refinement") without acknowledging that an always-on board amplifies the very engine it declines to govern. Name it in Section 1 (the calm-by-default principle is incomplete if it covers only the visual surface) and in the risks (a new R-row: "Phase 1 raises OS-push frequency by driving more concurrent sessions; idle-toast demotion is the only Phase-1 mitigation; coalescing/Focus deferred").

Constraint note: `notifyOnIdle` is a settings change, not a new IPC channel, so no AGENTS.md five-part treatment is triggered. If a future Focus state needs a renderer-to-main channel, that gets the full treatment then.

### MF-2. Endowed progress and goal-gradient are a high-confidence E5 finding and the plan has zero of it

Where: nowhere. E5 P5 ("never show a goal at zero"), E5 5.2 (sub-steps on the hero), E1 P6, and the 90%-killer concept (Tier 3) all point at the same mechanic, and the plan ships the *escalation* half (the 90%-killer gets its own tier) while dropping the *motivation* half (showing remaining steps as a near-done bar so the finish line pulls).

Why it matters for the lens: the 90%-killer is precisely the item where goal-gradient does the most work. The producer already hands you the data: `dod{met, total, gaps[]}`. An item at `dod.met=4, dod.total=5` is not just "almost done" (the Tier-3 boolean the plan consumes); it is "4 of 5, one step left," which is the exact endowed-progress frame E5 says converts a mountain into momentum. The plan reduces this rich signal to a single boolean (`dodAlmost`) and a single gap label (`dodGap`), throwing away the count that makes the goal-gradient fire. E5 P5 is high-confidence and the plan does not even sketch it.

Fix (Phase 1, small, no new data, restraint preserved):
- On the hero and on any needs-you row with a DoD, render the honest fraction "4 of 5 done, last step: <gap>" using the `dod.met`/`dod.total` already in `state.json` (4.3 lists them in the consumed schema). This is endowed progress with zero fabrication (E5 anti-pattern 5 forbids *lying* about completion; showing the real `met/total` is the legitimate form). A thin progress indicator filled to `met/total` is optional; the fraction string alone satisfies the finding.
- Add `dodMet: number | null` and `dodTotal: number | null` to `DashboardItem` (4.1), driven verbatim off the producer like everything else, never re-derived.
- Test: a needs-you fixture with `dod.met=4,total=5` renders "4 of 5" and names the gap; a single-item DoD (`total:1, met:0`, the case 4.4 fights to preserve) renders "0 of 1" without crashing the fraction. This rides on the M4/M8 parity tests you already have.

This is the cheapest remaining dopamine win in the plan: it reuses data already consumed, adds one string, and turns the Tier-3 hero from "this is almost done" (a demand) into "you are one step from closing this" (a pull). Reserve actual sub-step checkmarks-fire-dopamine (E5 5.2) for Phase 2 when the todo store can hold sub-steps; the Phase-1 fraction off `dod` is the honest minimum.

### MF-3. Count-up for active work is asserted but its surface in the strip is half-specified, so the time-blindness antidote can ship as just another "ago" string

Where: 1.2 ("Count-UP for active work... a 1s tick from `statusSince`"), 6.4 (the strip table), M9.

Why it is a real hole and not a nit: E3 is explicit that "idle 4 min" vs "idle 2 h" are completely different signals for a time-blind brain, and that count-up on *active* work ("you have been on this 50 min") is the lane's hard prerequisite, distinct from recency ("updated 38s ago"). The plan states the principle and adds `statusSince`, but 6.4's strip row is specified as `[glyph][name][relative time]`, and "relative time" is ambiguous between elapsed-on-this-turn and time-since-last-update. M9's test says "the active count-up renders a 1s tick while the idle string does not," which is good, but it does not assert the two strings are *semantically different* (count-up from `statusSince` for working vs idle-duration for idle). Without that, an implementer can satisfy the test with one `formatRelative(statusSince)` call for both and lose the distinction E3 calls load-bearing.

Fix (tighten M9, no new milestone):
- Specify in 6.4 that the working row shows elapsed-since-`statusSince` count-up ("working 12m", count-up) and the idle-past-floor row shows idle-duration ("idle 6m", the stall signal), and that these are two different computations, not one formatter applied twice.
- Extend the M9 test: a working tab shows a value that *increases* across two fake-timer ticks (count-up), and an idle tab shows idle-duration; assert the working string derives from `statusSince` and the idle string from the same field but framed as duration-waiting. This closes the "both are just `formatRelative` ago-strings" failure.

This is the E3 antidote made testable rather than asserted, the same upgrade the round-2 plan applied everywhere else.

### MF-4. The avoidance-nudge copy is the headline relationship move and it has no fixed string and no voice test, while the empty/error copy does

Where: 1.4 ("Copy is neutral and verb-first... never 'You keep skipping this'"), 6.6 (a test asserts canned templates and empty/error/loading copy contain no em dashes and no slop), 8.4 (Phase 2 classifier), E7 F3/F8.

Why it fails the lens: E7 names centralized, human, shame-free nudge copy as the active ingredient of the body-double relationship (F8), and gives the exact register: "The vendor follow-up's been sitting 6 days. Want me to draft the first email so you just have to send it?" The plan's 6.6 copy-voice test covers the empty, error, and loading strings and the canned query templates, but the *nudge* copy (the avoidance-pin surface, the re-roll label, the lock-in label, the stall-interrupt emphasis) is described by rule ("neutral, verb-first") and never pinned as fixed strings under the same test. Round 1 raised this as D-2 and the plan extended the test to empty/error/canned but stopped short of the nudge strings, which is the half E7 weights highest.

This also interacts with PHI. The eventual avoidance nudge wants to name the thing ("the vendor follow-up"), and the only Phase-1 source for that label is program-board `blocked_on` free text, which is exactly what the choke point worries about. So the nudge copy needs the same discipline as `composeClaudeQuery`: a fixed template with only producer-structured slots, never raw `blocked_on`.

Fix:
- Add the fixed nudge/label strings to the single copy module (6.6 already implies one place; make it explicit and the single source per E7 F8): the re-roll ("Not now, show me another"), the lock-in ("Lock this in as today's one thing" / "Your one thing today: <item>"), and the avoidance-pin row framing. Where a nudge names the item, the name comes from the program slug/name + fixed kind label (the same canned discipline as `draftFirstVersion`), never from `blocked_on`/`detail`.
- Extend the 6.6 test to cover the nudge/label strings, not just empty/error/canned. Same mechanical guardrail, applied to the strings E7 cares about most.
- One sentence in 1.4: the nudge that names an item uses the producer's structured slug/name, never `blocked_on` free text, so the shame-free *and* PHI-safe floors hold together.

---

## Deepen the ergonomics (moves 8 toward 9)

### D-1. The caught-up state pays out but does not offer the one calm "pull one forward" the recon asks for

Where: 1.4 and 4.3 (caught-up = "Clear. Keep working." + "N closed today"), round-1 skeptic D6, E4 F9.

The round-2 plan fixed half of D6: the caught-up state now pairs the verbatim empty copy with the "N closed today" payout, so a cleared board acknowledges the win instead of going blank. The missing half is E4 F9's "optionally offer the single oldest backlog item as 'want to pull one forward?'". Right now the caught-up state is still a soft dead end: you cleared needs-you, you get one neutral line plus a count, and there is nothing to act on. For a brain that just earned a dopamine moment by clearing the set, that is the cheapest possible moment to offer one calm next pull (a Tier-6 active program card in Phase 1, the oldest `@next` in Phase 2), opt-in, no pressure.

Fix (Phase 1, small): when needs-you is empty, render "Clear. Keep working." + "N closed today" + one quiet, dismissible "Pull one forward?" surfacing the calmest single active program card (lowest age color, mirrors the producer order). One row, one action, never a list. Test: caught-up fixture renders the headline, the count, and exactly one pull-forward candidate (or none if there are zero active cards). This is a 6.5 acceptance-criterion change, not new architecture, and it closes the last open clause of the skeptic's D6.

### D-2. The stall-interrupt and the morning intake are the only two sanctioned "center" moments; say so, so the interrupt is principled not a contradiction of 1.2

Where: 1.8 (stall collapse to Focus), 1.2 (calm, no uninvited motion), 8.7 (Phase 2 morning ritual), round-1 D-6, E7 §6.

The plan's calm rules (1.2) are strong and near-absolute: no uninvited motion, update in place, periphery quiet. The stall-interrupt (1.8) deliberately *does* take the center on a detected stall. As written these read as in tension: an implementer or reviewer can reasonably ask "does the stall collapse violate calm-by-default?" E7 §6 resolves it cleanly: the periphery stays calm and uninterrupted; there are exactly two permitted center moments, both user-cancelable in one gesture: the cue-bound morning intake (Phase 2) and the stall-collapse to Focus (Phase 1). State that rule explicitly in Section 1, so the interrupt is a named exception to the calm rule rather than an apparent contradiction. No code change; it is a one-paragraph framing that makes the design internally consistent and tells the M13 reviewer the collapse is sanctioned, not a calm-by-default regression.

### D-3. Make `requires_response` (completing-the-loop) hero-eligible when the board is empty, and test it

Where: 3.5 (the strip works even when the board IPC is stubbed), 5.3 (Tier 2 is `idleNeedsYou`), round-1 D-5, E7 P7/C9/F5, E1 4.4.

E1, E6, and E7 independently call a waiting `requires_response` session the highest-leverage, lowest-activation-cost item on the surface (the next action is already decided; Mark just has to show up) and the literal completing-the-loop avoidance area #4. The plan ranks it correctly (Tier 2, with the idle-age floor and the `requiresResponse` overlay). What is not guaranteed in writing or in a test: when the program-board region is empty or "not running," a waiting session must still be the hero, not the "Clear. Keep working." empty state. The per-region independence (4.5) and the strip-works-when-board-stubbed note (3.5) imply this, but the hero selection lives in the program region's render path, so it is exactly the seam where an empty board could swallow a live needs-you tab.

Fix (one assertion, no new architecture): state in 4.5/5.3 that hero eligibility draws from the *unified* item set (board + live-tab), so an `idleNeedsYou` item is hero-eligible regardless of board state. Add an M8/M9 test: `programBoardState` empty + one past-floor `idleNeedsYou` tab => the hero is that tab, not the caught-up empty state. This is the single assertion that protects the loop the project exists for, on the day the board service is down.

### D-4. Land in the right shell (pwsh 7), because every wrong-shell landing is a papercut on the act path

Where: 3.2 (Open PowerShell spawns `powershell.exe` 5.1 via `platform.ts:15`), Section 9 + open question 9 (defer a `pwsh` option), round-1 constraint note.

The lens cares about every papercut between window-focus and first keystroke. The whole workspace is PS7; CADDC02 follow-ups and the act-path the dashboard exists to shorten all assume `pwsh`. Landing Mark in 5.1 when he clicked "Open PowerShell here" on a financial/CADDC02 item is a small, recurring friction tax, and worse, 5.1 vs 7 behavior differences are exactly the kind of surprise that derails an avoidance-task start. This is a one-line shell-id choice (or a `pwsh`-if-present fallback to `powershell`), not the Phase 9 follow-up the plan files it as. Pull it into M10. If `pwsh` resolution is genuinely uncertain on Mark's box, ship `pwsh` with a `powershell` fallback and a test that the resolver prefers `pwsh` when present. Not a blocker, but it is free and it removes a papercut on precisely the avoidance items.

### D-5. The re-roll park window and the stall threshold need a stated default *and* a "does it persist" decision, or they will feel random

Where: 1.6 (re-roll parks "for a short window," renderer-side, no store), 1.8 (~25s stall, settings-tunable), open questions 2/6.

Two small consistency gaps. First, the re-roll parks the hero "for a short window" but never states the window or what happens to a parked hero on app restart. If the park is renderer-only state (as 1.6 says, "no store"), a restart un-parks the dreaded item straight back to the hero, which for an avoidance brain reads as the board re-confronting you the moment you reopen it (the exact guilt-billboard dynamic 1.6 exists to prevent). Decide: either park survives the day (persist a per-day parked-id set alongside the per-day pinned-hero-id from M3b, which already exists) or it is explicitly session-only with the consequence stated. I recommend per-day, matching the lock-in's per-day lifetime, so re-roll and lock-in have the same temporal model.

Second, state the re-roll window default (a few hours / until end of day) the way you state the 25s stall and 150s freshness defaults, so all three tunables live in one place (open question 2). One sentence each; no new milestone.

### D-6. Reduce the action step to the one default per item kind, and prove the count of equal buttons is bounded

Where: 6.3 (hero anatomy: one primary button + secondary icon buttons + re-roll + lock-in), 1.1 ("the hero carries one primary action button"), E1 AP4 / E1 P2 / E5 anti-pattern 7 (choice overload at the action step).

The plan is right that the hero has one primary action. But the hero now also carries: the primary button, secondary action icon buttons, a re-roll control, and a lock-in control. That is four interactive affordances on the one-thing card, and E1 AP4 / E5 anti-pattern 7 warn that re-imposing a choice at the action step undoes the choice-removal the hero exists for. The fix is not to cut features (re-roll and lock-in both earned their place); it is to enforce the visual hierarchy mechanically so only one reads as a decision. The plan says secondary actions render "at icon scale" (1.1) but does not bound the *count* of equal-weight affordances.

Fix (component-level invariant + test): assert that the `HeroCard` renders exactly one full-weight `Button` (the primary), and that re-roll, lock-in, and secondary actions all render at the demoted (icon/quiet) scale. A render test counts full-weight buttons === 1. This makes "one obvious next move" a structural guarantee on the busiest card, the same way 1.1 bans a fourth dominance level. It is the AP4 guard applied to the place the plan added the most controls.

---

## Constraint compliance check (the plan, and my own additions, against the hard constraints)

- Worktree scope: the plan is grounded to `claude-terminal-dashboard` at `ce2e9e0` and re-grounds the stale-synthesis citations (9.3). Clean. Every code claim I add (the `hook-router.ts` toast paths, `TabIndicator.tsx` glyphs, `platform.ts` shell id) I verified against this checkout.
- PowerShell 7: D-4 pulls the `pwsh` choice into Phase 1; the plan currently defers it. My recommendation respects the constraint more tightly than the plan does.
- No em dashes / no AI-slop: this review is clean. MF-4 extends the plan's own copy-voice test to the nudge strings, which is the gap.
- No PHI in argv/logs/artifacts: MF-1's `idle`-toast demotion touches no free text. MF-4 explicitly routes nudge item-names through producer-structured slots, never `blocked_on`, so the floor holds. MF-2's `dod.met/total` are integers, not free text. None of my additions widen the PHI surface. Note for the build: MF-1's `shouldNotify` work sits next to the pre-existing `log.debug('[hook]', ..., data.substring(0,80))` at `hook-router.ts:56` that the plan already flags for a follow-up issue (3.6); do not let the MF-1 change copy that pattern.
- AGENTS.md IPC discipline: MF-1 is a settings flag + a main-process predicate, no new channel, so the five-part treatment is not triggered (I checked: the toast fires in main, the setting reads in main). If Phase 2's Focus state needs a renderer channel, full treatment then. Every other addition is renderer-side or pure-shared logic.
- Keybinding challenge: I add no keybinding. `Ctrl+Shift+K` stays the one to raise with Mark (8.6).
- Vitest test-first for logic: every fix above carries a concrete test (the `shouldNotify` unit + settings round-trip for MF-1; the `dod` fraction render for MF-2; the count-up-increases assertion for MF-3; the nudge-copy voice test for MF-4; the empty-board-hero test for D-3; the one-full-weight-button render test for D-6). The discipline extends to exactly the affordances where intent still outruns tests.
- Boringly small milestones: maintained. MF-1 is one settings flag + one predicate (mirrors M11). MF-2 is two `DashboardItem` fields + one string + one test. MF-3 tightens M9. MF-4 extends the M12/6.6 copy module + test. Each is one change, one expected test, one rollback point.

## Bottom line

The round-2 plan closed the round-1 ADHD gaps well; the mechanical layer is at 8. To reach 9: govern the one channel the dashboard amplifies but declines to touch (MF-1, demote the `idle` toast and name the deferred E6 work as a decision); add the goal-gradient finish-line pull that the `dod` data already supports for free (MF-2); make the count-up the *time-blindness* antidote it claims to be rather than another ago-string (MF-3); and put the headline relationship copy under the same voice test as the rest (MF-4). The deepen items (caught-up pull-forward, the sanctioned-center framing, the empty-board-hero guarantee, the right shell, the park/stall defaults, the bounded action step) are the polish between a calm board you read and a calm command center you act from in under two seconds, which is the lens's actual bar.
