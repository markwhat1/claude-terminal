# Advisor review: ADHD design coach lens

Reviewer role: ADHD ergonomics advisor. Date: 2026-06-20.
Target: `docs/dashboard/PLAN.md` (the ClaudeTerminal in-app Home view plan), `dashboard` worktree, HEAD `ce2e9e0`.
Lens: deepen ADHD ergonomics so the design measurably lowers activation energy. Grade against J.O.T. one-thing hero, calm-by-default, sub-2s capture, shame-free avoidance nudges, restrained dopamine feedback.

Hard constraints I checked the plan against and held myself to: dashboard-branch worktree only; PowerShell 7 is the shell; no em dashes and no AI-slop words in my prose; no PHI in argv/logs/artifacts; AGENTS.md IPC discipline; every keybinding challenged; vitest test-first for logic; boringly small milestones (one change, one expected test, one rollback point each).

## Verdict

The plan is architecturally excellent and integration-honest. On the ADHD lens specifically it sits around **6.5/10**. It states the right principles in Section 1, then ships a Phase 1 that is mostly a calm read-only board. The single highest-leverage ADHD affordance the recon found (the "reframe a dreaded blank-page task as a review task" pre-loaded query, E1 P3/P4, E7 P6) is named in Section 1.4 and 3 but has no fixed copy, no metric, and is buried inside one generic `KnownActionId`. Sub-2s capture, the done-lane dopamine payoff, the stall pattern-interrupt, count-up for active work, and the morning/evening ritual are all deferred to Phase 2 or left as prose with no milestone. The plan optimizes "read what needs me" over "act in under two seconds," which inverts the lane's own success metric (E1 §1: "seconds from window-focus to first keystroke," not information density).

Below are concrete, buildable changes that move it toward 9/10 without breaking any hard constraint. I separate must-fix (in scope for Phase 1 as scoped, or a one-line scope correction) from deepen-the-ergonomics improvements.

---

## What the plan already gets right (keep these)

- The one-hero, three-dominance-levels rule with a fourth level banned in the component spec (§1.1, §6.1). This is the literal J.O.T. layout and it is enforced structurally, not by taste.
- Calm-by-default is real: one saturated accent reserved for the hero CTA, update-in-place, `prefers-reduced-motion` honored, count-up not countdown stated (§1.2). This matches E3 P5/P7 and E5 P6.
- Shame-free escalation by salience, verbatim "Clear. Keep working." empty state, neutral verb-first copy (§1.4, §6.6). This is E5 P7 / E7 P4 done right.
- The 90%-killer gets its own ranking tier so it cannot drop below the fold (§5.3 Tier 3). This is the project's whole reason to exist (Lane G §3.5) and the plan protects it correctly.
- `statusSince`/`lastActivityAt` added so the strip can say "idle 4 min" vs "idle 2 h" (§2.2, M1). This is the single highest-leverage data-model change E3 §2.2 demanded, and it is in Phase 1. Good.
- The PHI choke point design (`composeClaudeQuery()`, canned-template default, deny-by-default `scrubFreeText`, log action-id only) is correct and constraint-compliant (§3.4).

---

## Must-fix (raises the floor; in scope or a one-line scope correction)

### MF-1. The "reframe as review" query is the headline ADHD feature and it is under-specified

Three recon lanes independently named one thing as the highest-leverage affordance on this surface: pre-loading "draft the first version of X" so the initiation cost is paid by Claude, turning a feared *create* task into a tolerable *review* task (E1 §4.2/P3, E5 §5.1, E7 P6/F4). The plan agrees in §1.4 ("the single highest-leverage ADHD affordance") and §5.3 makes it the hero default for decision items. But the actual deliverable, `composeClaudeQuery()`, lists only generic verbs: "review the open TODOs," "summarize what changed," "help me decide: <action label>" (§3.4, §4.1 `KnownActionId`).

The problem: "help me decide: <label>" hands Mark a *decide* task, not a *draft-then-review* task. That is the exact dread the affordance is supposed to remove. A decision item with a blank-page deliverable (an SOP, a vendor email, a Danielle delegation note) should pre-load a query that produces a first draft, so the session opens with Claude already working and Mark arrives to edit.

Fix (Phase 1, M10, no new IPC, no constraint change):
- Make `KnownActionId` carry an explicit `draftFirstVersion` template alongside the generic ones, with fixed copy: "Draft the first version of <repo-scoped deliverable> so I can review and send it." The deliverable label comes from the canned template, not free text, so the PHI floor holds.
- Decide the hero primary action by item kind in `rankItems` consumers, not by a single default: avoidance-category and decision items with a blank-page deliverable get `draftFirstVersion`; `needs-CADDC02` items get `Open PowerShell here`; pure-information items get `review`/`summarize`. Add this as a small pure mapping function `pickPrimaryAction(item): KnownActionId` so it is test-first.
- Add a vitest assertion in M10: an avoidance/decision item resolves to `draftFirstVersion`; a `needs-CADDC02` item resolves to PowerShell; the composed `draftFirstVersion` body contains zero interpolated free text (the PHI assertion you already planned, extended to this template).

This is one fixed-template addition plus one tested pure mapper. It is the difference between "a calm board with buttons" and "a launch ramp," which is the lane's stated success metric.

### MF-2. Sub-2s capture is a Phase 2 deferral, and that breaks object permanence for the whole of Phase 1

E1 §4.7 ("capture must be one gesture") and E5 are explicit: a heavyweight or absent capture path means items live in Mark's head and vanish, and the documented avoidance area "system documentation" guarantees a form will not get used. The plan reserves `Ctrl+Shift+K` in Phase 1 but does not wire it, and the entire todo store is Phase 2 (§1.3, §8). So for the whole of Phase 1, the moment Mark notices "I need to follow up with the vendor" while looking at the board, there is nowhere to put it. The thought drops. That is AP5 (silent decay) and it is the failure the dashboard exists to kill.

I am not asking to pull the full Phase 2 store forward. I am asking for the smallest capture that satisfies object permanence:

Option A (preferred, smallest honest version): ship a one-field capture in Phase 1 that appends a raw line to a plain JSON inbox (`<workspaceRoot>/dashboard/todos.json`, exactly the Phase 2 location), with NO triage, NO horizons, NO categories, NO ranking integration. The captured lines render as a quiet "Inbox (N)" count under the needs-you list, openable but not hero-eligible. This is one new IPC channel pair (full AGENTS.md treatment: handler + preload + global.d.ts + registration test + remote decision) and one tiny store module. It makes capture real in Phase 1; Phase 2 then adds triage/horizons/categories/ranking on top of an inbox that already exists.

Option B (if you insist on zero new Phase 1 IPC): wire `Ctrl+Shift+K` to write the line through the *existing* Todoist connection is wrong here (that is a different surface and breaks the local-first model). So if not Option A, then capture genuinely cannot ship in Phase 1, and the plan must say so plainly in §1.3 and accept that Phase 1 has no object-permanence path. Name the gap; do not let it read as solved by a reserved keybinding.

My recommendation is Option A. It is a boringly small milestone (store module TDD with a temp file; then the IPC pair with the registration test; then the capture bar wired to `Ctrl+Shift+K`), it respects every constraint, and it removes the single biggest Phase 1 ADHD hole. If you take it, renumber: insert M10.5a (inbox store), M10.5b (inbox IPC pair), M10.5c (capture bar + keybinding) before M11, and keep the bar's behavior to "Enter saves raw text, zero fields," which is the sub-2s bar.

### MF-3. The capture target time is asserted but never measured

§1.3 says "sub-2-second" and the metric is "measurably lower activation energy," but no milestone defines or tests the capture latency, and E1 §1 defines the real metric as "seconds from window-focus to first keystroke in a real session." Right now nothing in M1..M17 measures either.

Fix: add one concrete, testable timing contract to the capture milestone (MF-2) and to the hero action:
- Capture: a vitest interaction test that `Ctrl+Shift+K` mounts the bar and focuses the input synchronously (no async data dependency), and Enter persists without any required field. "Sub-2s" then means "no blocking field, input focused on open," which is testable as "input has focus immediately after the keydown handler runs" and "submit succeeds with only `text` set."
- Hero action: assert the hero primary button is reachable and fires its action with a single activation from a cold Home open, with the program-board data mocked present. That encodes "window-focus to first keystroke is one click," the lane's metric, as a test rather than a hope.

This converts the headline claim into a regression net. It is the difference between grading the plan on intent and grading it on a guarantee.

### MF-4. The done-lane (visible accomplishment + the dopamine payoff) is missing entirely

E5 P2 is a P1-priority finding: "Show DONE, not just TODO." The dopamine loop is the reinforcement that makes the next action feel worth starting, and a done lane is also self-esteem maintenance for a brain that runs an underachievement narrative (E5 §3, E7 P10). The plan has restraint covered (no confetti, no streaks, §1.4) but restraint without any payoff is just a demanding board. There is no "N done today," no card-settles-out beat, no completion feedback anywhere in Phase 1 or even sketched concretely for Phase 2 beyond one line in §8.7.

This is partly a data-source problem: in Phase 1 the only completion signal available is a program card crossing into the `Done` lane (all DoD met) or a `requires_response` session getting answered. That is enough for a minimal, honest done-lane without the Phase 2 store.

Fix (Phase 1, restrained, honest):
- Add a single quiet "Done this week" line sourced from program cards in the `Done` lane plus a session-level "answered" transition (an `idleNeedsYou` tab that returned to plain working/idle after you acted). No store needed; both signals already exist in Phase 1 data.
- The reward beat is the card settling out of the needs-you list with the existing in-place update, plus the count ticking. No new animation library; `tw-animate-css` is already imported (`globals.css:2`), so a 150-200ms ease on removal honors `prefers-reduced-motion` via the variant you already planned. Reserve any larger beat for an avoidance-category loop closing (E5 P3), which is a Phase 2 refinement once categories exist.
- Test: a HomeView fixture where a card moves to `Done` renders in the done line and decrements the needs-you count; under `prefers-reduced-motion` no transition class is applied.

Without this, the dashboard only ever *demands*. E5's whole point is that it must visibly *pay out* or Mark stops opening it.

### MF-5. The stall pattern-interrupt is the lane's named ADHD feature and it is absent

Pattern-interrupting decision oscillation is in Mark's own documented model and surfaced by four lanes (E1 P8/§4.6, E3, E5 P8, E7 P9). The trigger is concrete and measurable: Home tab focused for ~20-30s with no action. The plan has the data to detect this (it owns the Home active state locally, §2.2) and even has Focus mode (§6.5) as the collapse target, but there is no stall detection, no interrupt, and no milestone.

Fix (Phase 1, small, opt-in-safe):
- Add a stall timer in HomeView: if Home is the active tab and no action fires within a threshold (default 25s, settings-tunable later), collapse to Focus mode (just the hero) and apply a single, reduced-motion-respecting emphasis to the primary button (not a pulse loop; one transition). This is "the interface is the interrupt" (E1 P8), and it fires only on detected stall, so it is a feature, not nagging.
- This must be gentle and reversible: any pointer/key activity cancels it; it never blocks; it never reorders. Respect E5 AP8 and E7 C1 (presence, not pestering).
- Test: a fake-timer test that after the threshold with no interaction the view enters Focus mode, and that any interaction before the threshold cancels it. Pure-ish; jsdom + vitest fake timers.

I would gate this behind a setting defaulting ON but trivially disableable, because the trigger heuristic admittedly needs tuning (every lane flags this). Shipping it OFF-by-default would waste the highest-novelty interrupt the lane offers; shipping it with no off-switch risks annoyance. Default ON, one toggle.

---

## Deepen the ergonomics (moves 6.5 toward 9)

### D-1. Make the avoidance-category pin survive into Phase 1 as a read-only concept, even without the store

The plan correctly pins avoidance items by category in Tier 5 (§5.3) but the six categories only exist in the Phase 2 store (§8.4). In Phase 1 there is no way for a `blocked_on` that is a financial follow-up or a Danielle delegation to be recognized as avoidance, so it ages only by recency, and an item with no git activity has no recency to age it (Lane G §3.11, the load-bearing gap E7 §7 flags). Result: in Phase 1 the exact items most likely to rot are the ones the board cannot escalate.

Fix: in Phase 1, allow a lightweight read-only mapping from program-board `blocked_on` / needs-you reason text to an avoidance category via a small, explicit keyword map (financial/vendor/dispute, doc/SOP, Danielle/delegate, follow-up/loop, health/appointment, marketing/MediaNV). This is not the closed program tag set (untouched per Lane G §3.4); it is a renderer-side classification of free text the board already produces, used only to keep an item pinned in the needs-you band when it has no recency. Test the mapper as a pure function. This closes the "no commits to age it" hole a full Phase 1 cycle earlier than the Phase 2 store would.

Caveat to honor: this classification reads `blocked_on` free text, which is exactly the text the PHI choke point worries about. The classifier must run renderer-side, never feed `composeClaudeQuery`, and never be logged. Document that explicitly.

### D-2. Hero copy needs fixed, voice-checked strings, not just a rule

§6.6 says "verb-first, em-dash-free, no AI-slop" but ships no actual copy. E7 F8 wants all accountability copy centralized and human, and Mark's style is direct with light snark when stalling. Vague "buttons lead with the verb" will drift in implementation.

Fix: add a small copy module (one file, the single source per E7 F8) with the fixed hero/button/empty/nudge strings, and a vitest test that asserts none contain an em dash or any word from the project banned list. You already enforce the writing standard on the doc; enforce it on the rendered strings too, mechanically. Example registers to lock: primary button "Draft it with Claude" / "Open PowerShell here" / "Confirm the send"; needs-you glance "4 need you, 2 working"; avoidance nudge "The vendor follow-up has been sitting 6 days. Want Claude to draft the first email so you just have to send it?" (no "OVERDUE," no guilt). The test is the guardrail that keeps the voice from regressing to chatbot.

### D-3. Count-up for active work is asserted but has no surface or test

§1.2 and E3 P7/§4.5 want a calm count-up (or filling ring) on the actively-working session, never a countdown. The plan states the principle and adds `statusSince`, but the SessionStrip spec (§6.4, M9) only renders "relative time" on the right edge. "Updated 38s ago" is recency, not elapsed-on-this-turn. The count-up that fights time-blindness ("you have been on this 50 min") is not specified.

Fix: in M9, render the working session's elapsed time as a count-up from `statusSince` (a 1s-tick relative string is fine; no ring needed for v1), distinct from the idle "stalled Nm" string. Test that a working tab shows elapsed-since-`statusSince` and an idle tab shows idle-duration. This is cheap and it is the concrete time-blindness antidote E3 calls the lane's hard prerequisite.

### D-4. The morning/evening ritual is the accountability spine and it is entirely absent

E7 P2/P3/F1/F6 (high confidence) make the open-and-close-the-day check-in the thing that converts a status board into an accountability partner: a cue-bound (first-open-of-the-workday, not a fixed alarm) "here is the one thing today, lock it in?" and an evening "done today / carries to tomorrow." The plan has `startupView` (M11) which can land on Home, but landing on Home is not a check-in ritual; there is no intent declaration, no commitment mirror, no evening review.

I would NOT force this into Phase 1 (it depends on the store and a last-open timestamp), but the plan currently does not even sketch it, and it is the single highest-leverage idea in E7. Fix: add it to the Phase 2 sketch (§8) as a named milestone with the cue-binding mechanism (first-open-after-Nam via a persisted last-open timestamp, the lifecycle hook E7 §7 asks about), the one-tap accept that declares intent, and the dismissible-in-one-tap "not now" (E7 F9, C4). Mark it explicitly cue-bound and never a fixed alarm so it cannot interrupt mid-flow (E3 P5). This keeps Phase 1 small while making the plan's accountability story complete rather than silently dropped.

### D-5. The `requires_response` answered-loop deserves an explicit "did not die" guarantee

E7 C9/F5 and Lane G call letting a waiting agent die silently the failure being solved (avoidance area #4, completing-the-loop). The plan ranks `idleNeedsYou` highly (Tier 2) and escalates a long-idle tab into needs-you (§5.2), which is good. But there is no explicit "this loop will not silently disappear" guarantee: if the program-board region is empty and the only needs-you item is a waiting session, the plan should still surface it as the hero. Confirm `idleNeedsYou` items are hero-eligible even when `programBoardState` is the empty/"not running" state, because the live-tab feed is independent of the board IPC (§3.5 says the strip works even when the board is stubbed remotely). Add a test: with `programBoardState` empty and one `idleNeedsYou` tab, the hero is that tab, not the "Clear. Keep working." empty state. This is one assertion that protects the exact loop the project exists for.

### D-6. Restraint is good, but the plan should name the one sanctioned "center" moment

E4/E7 reconcile by allowing exactly one sanctioned center-of-screen moment (the morning intake), everything else peripheral and calm. The plan's calm rules are strong but absolute, which risks a board so quiet that nothing ever earns the center and the stall-interrupt (MF-5) reads as a violation. Fix: state the rule as E7 §6 does: the periphery stays calm and uninterrupted; the ONE permitted center moment is the cue-bound intake (Phase 2) and the stall-collapse to Focus mode (Phase 1, MF-5), both user-cancelable in one gesture. This makes the interrupt principled rather than a contradiction of §1.2.

---

## Constraint compliance check (the plan against the hard constraints)

- Worktree scope: the plan is correctly grounded to `claude-terminal-dashboard` at `ce2e9e0` and re-grounds the stale-synthesis citations from the `dev` worktree (§9.3). Clean.
- PowerShell 7: the plan flags that `createShellTab('powershell')` spawns 5.1 not pwsh 7 and defers a `pwsh` option to a follow-up (§3.2, §9.4, open question 9). For an ADHD action that is supposed to drop Mark into his real shell, landing in 5.1 when the whole workspace is PS7 is a small friction tax on every CADDC02 action. I would pull the `pwsh` option into Phase 1 M10 rather than defer it; it is a one-line shell-id choice and it removes a recurring "wrong shell" papercut. Not a blocker, but the lens cares about every papercut on the act path.
- No em dashes / no AI-slop: the plan's prose is clean. D-2 extends this enforcement to rendered strings, which is the gap.
- No PHI in argv/logs/artifacts: the choke point design is correct (§3.4). My MF-1 and D-1 both add free-text-adjacent paths; I have constrained each (canned templates only for MF-1; renderer-side, never-logged, never-to-query for D-1) so the floor holds. Verify both in review.
- AGENTS.md IPC discipline: the one Phase 1 channel gets the full five-part treatment (§2.4, M5). MF-2 Option A adds one more pair and I have stated it needs the same treatment. Honor that.
- Keybinding challenge: `Ctrl+Shift+K` is challenged thoroughly (§8.6, R6 item 3). If MF-2 pulls capture into Phase 1, the challenge stands; just raise it with Mark before merge as R6 requires.
- Vitest test-first for logic: the plan is disciplined here (M6/M7 are pure TDD). Every fix above I have paired with a concrete test so the discipline extends to the ADHD affordances, which is exactly where intent currently outruns tests.
- Boringly small milestones: maintained. Each addition above is one change + one test + one rollback point; I gave the renumbering for MF-2.

## One factual correction for the plan

§1.2 and §6.4 say "the only animation is the existing `animate-pulse`." The working-status glyph also uses `animate-spin` (a `Loader2`), `TabIndicator.tsx:13-18`. So the strip already has two animations, not one. Under `prefers-reduced-motion` both the pulse and the spin should be suppressed (a spinner is uninvited motion too). Update the claim and the reduced-motion variant to cover `animate-spin` as well, or the calm-by-default guarantee has a hole on the busiest glyph.

## Bottom line

Ship Section 1's principles as written; they are correct. Then close the gap between the principles and the deliverables: make the reframe-as-review query a fixed, tested template chosen by item kind (MF-1); give Phase 1 a real one-gesture capture and an honest done-lane and a stall-interrupt (MF-2, MF-4, MF-5); and turn the asserted timing and copy claims into tests (MF-3, D-2). Those changes move the plan from a calm board you read to a launch ramp you act from in under two seconds, which is the lens's actual bar.
