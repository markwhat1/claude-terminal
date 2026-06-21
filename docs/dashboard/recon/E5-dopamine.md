# Lane E5 — Dopamine, Novelty, Reward, and Momentum

Recon for the always-on in-app dashboard / home page inside ClaudeTerminal (Electron + React 19 + TS + Vite + node-pty + shadcn/Tailwind). One lens only: how to make the home page motivating to an ADHD brain through dopamine, novelty, reward, and forward momentum (progress + done feedback that actually motivates rather than guilts or numbs).

The home page surfaces todos / problems / in-progress items as PRIMARY content, with live sessions as a SECONDARY glanceable list, and lets the user click an item to (a) open a new PowerShell tab, (b) copy text, or (c) open a new Claude session pre-loaded with a query.

Scope note: read-only investigation. No code was changed. Findings cite file:line for code claims and URLs for web claims, with confidence marked. Dental/PHI specifics kept general; no patient data anywhere.

---

## 1. The model this user actually runs (no online lookup of personal data)

These come from the user's documented ADHD operating model, supplied in the task brief. They are the local axioms; the web research below either reinforces or refines them.

- **J.O.T. — "Just One Thing."** Surface ONE actionable item at a time. Time-horizon labels: `@now` (this week), `@next` (this month), `@later` (backlog). The home page hero should be a single thing, not a wall.
- **Escalating reminders.** A nudge that grows if ignored, rather than one static alert that gets banner-blind.
- **Pattern-interrupts** to break decision oscillation. When the user is stuck choosing, the interface should make the choice for them, not present another menu.
- **Documented avoidance areas:** financial confrontation, system documentation, delegation, completing-the-loop, personal health, marketing homework. These are exactly the items that will rot in a backlog because they carry no intrinsic dopamine. The dashboard must give them borrowed dopamine.
- **"Offer 1 recommendation, not 10 options. Batch related work so the initiation cost is paid once."** This is the single most load-bearing rule for this lane. Every design decision below bends toward it.

The throughline: this user's model is *anti-choice-overload and pro-single-next-action*. That is the same conclusion the dopamine/initiation literature reaches from the other direction. They agree, which is why I weight them heavily.

---

## 2. Why the ADHD brain needs this lens at all (the mechanism)

**The interest-based nervous system (Dodson).** Dr. William Dodson's framing: an ADHD brain is not driven by importance or deadlines the way a neurotypical "importance-based" system is. It is driven by **interest, novelty, challenge, urgency, and passion** — the INCUP factors. "A person with an interest-based nervous system must be personally interested, challenged, find it novel, or [find it] urgent right now, or nothing happens." (Confidence: high — this is the user's own "interest-based nervous system" reference, and it is well-attested.)
Sources: <https://www.additudemag.com/secrets-of-the-adhd-brain/>, <https://neurodivergentinsights.com/interest-based-nervous-system/>, <https://themighty.com/topic/adhd/icnu-william-dodson-adhd-motivation/>

**The practical consequence for a dashboard:** importance alone ("this is overdue", "this matters financially") will NOT move the needle for an avoidance item. The dashboard has to manufacture at least one of N-C-U (novelty, challenge, urgency) on demand, because interest and passion can't be faked for, say, "system documentation." That manufacturing is the design job.

**Task initiation costs more activation energy for ADHD.** Every step between "decide to do it" and "actually doing it" is a derail point. Reducing setup time, simplifying decisions, and making the first step genuinely small matters more than any motivational effort. (Confidence: high.)
Sources: <https://saskadhd.com/adhd-task-initiation-evidence-based-strategies-that-actually-work/>, <https://habit-streak.com/en/blog/habit-tracking/habit-tracker-for-adhd>, <https://www.tiimoapp.com/resource-hub/task-initiation-adhd>

**Dopamine on completion is the reinforcement loop.** Checking off a task releases dopamine and produces the sense of accomplishment ADHD brains are short on; "done lists" exploit this by making accomplishment visible instead of making the undone list the focus. (Confidence: high.)
Sources: <https://www.getinflow.io/post/to-do-lists-that-work>, <https://www.theminiadhdcoach.com/living-with-adhd/adhd-to-do-lists>

---

## 3. Design PRINCIPLES (prioritized)

Ordered by impact for this user and this surface. P1 are non-negotiable; P3 are polish.

### P1 — One hero item, chosen for the user (J.O.T. as the literal layout)
The top of the page is a single, large, unmistakable "do this now" card. Not a list with a highlighted row — one card that owns the visual hero zone. Everything else (the rest of the todos, the sessions) is demonstrably smaller and below the fold of attention. This directly implements J.O.T. and "1 recommendation not 10," and it sidesteps choice paralysis, which is the #1 ADHD initiation failure. (Confidence: high — converges user model + initiation research + goal-gradient "one clear target" guidance.)

The card carries the three actions inline: **[Start a PowerShell tab] · [Copy] · [Ask Claude about this]**. The whole point is that initiation cost is paid by one click, not by the user re-deciding what to do and then figuring out how.

### P2 — Show DONE, not just TODO (a visible accomplishment lane)
Reserve a persistent strip for "what you finished" — today, this session, this week. Every completion lands there with a small reward beat. This is the dopamine payoff loop and it is also self-esteem maintenance for a brain that "may struggle with self-esteem due to perceived underachievement." A done lane makes the dashboard feel like it is *paying out*, not just *demanding*. (Confidence: high.)
Sources: <https://www.getinflow.io/post/to-do-lists-that-work>, <https://dayoptimizer.com/adhd/effective-daily-to-do-lists-for-adhd-brains/>

### P3 — Reward must scale to the achievement, and be reserved for real completion
Tiny check animation for a tiny task. A bigger, rarer celebration for closing a genuine loop (an avoidance item finished, a multi-step batch cleared). Never celebrate administrative noise (opening a tab, saving a setting). Celebrating trivia trains the brain to ignore the celebration, and burns the dopamine response through hedonic adaptation. "Confetti works best when layered on top of real progress — not as a substitute for it." (Confidence: high.)
Sources: <https://uxplanet.org/why-confetti-celebrations-backfire-and-how-to-make-them-work-be838a6e7b8b>, <https://uxdesign.cc/the-over-confetti-ing-of-digital-experiences-af523745db19>

### P4 — Manufacture urgency and challenge, because importance won't land
For avoidance items (financial confrontation, documentation, marketing homework, personal health, delegation, completing-the-loop), add a borrowed INCUP hook:
- **Urgency:** a visible timer / "15-min start" framing, or an aging signal that the dashboard escalates. Artificial time pressure is a documented ADHD ignition.
- **Challenge:** frame as "clear this in one batch" with a tiny target ("just the first email," "just the outline").
- **Novelty:** rotate framing/copy/visual treatment so the same stale item doesn't read identically every day (see P6).
(Confidence: high for the mechanism; medium for the exact UI form, which needs prototyping.)
Sources: <https://www.getinflow.io/post/adhd-motivation-incup>, <https://www.truenorth-psychology.com/post/unlocking-adhd-motivators-the-incup-framework>

### P5 — Endowed progress and goal-gradient: never show a goal at zero
When the dashboard presents a batch or a multi-step item, show it as already partway done (endowed progress) and emphasize *remaining* steps as the user nears the end (goal-gradient). Motivation rises as the finish line approaches; a bar that starts at 0 of 8 reads as a mountain, while 2 of 8 (because "we counted opening it as a step") reads as momentum already underway. Break every large item into completable sub-steps with their own checkmarks so dopamine fires more than once per item. (Confidence: high.)
Sources: <https://www.ux-bulletin.com/goal-gradient-effect-in-ux/>, <https://medium.com/@davidteodorescu/design-perfect-ux-tasks-the-endowed-progress-effect-7461ca20076c>, <https://helio.app/ux-research/laws-of-ux/goal-gradient-effect/>

### P6 — Controlled novelty without sensory overload
Novelty is genuine fuel for the ADHD brain, but it fades and it can tip into overload. Rotate *small* things: the hero card's surfacing (which item gets picked), a fresh micro-copy line, a subtle accent. Do NOT churn the whole layout — predictable structure with novel *content* is the balance. "Keep gamification simple, meaningful, and tailored," because flashy constant feedback causes ADHD sensory overload and novelty burnout. (Confidence: high.)
Sources: <https://www.adhdcentre.co.uk/adhd-gamification-and-its-role-in-boosting-focus-and-learning/>, first WebSearch result set on dopamine/reward design.

### P7 — Escalating reminders, forgiving cadence
A nudge that grows when ignored (size, position, accent), not a static banner that goes invisible. But escalation must never become shame. Aging color or a gentle "this has been waiting 5 days" beats a red "OVERDUE — you failed." The line is escalate the *salience*, never escalate the *guilt*. (Confidence: high — user model + loss-aversion research below.)

### P8 — Pattern-interrupt the oscillation
When the user is visibly stuck (returns to the home page repeatedly without acting, or the same item keeps getting skipped), the dashboard should change state: it picks for them, shrinks the choice to a binary ("this one, 15 minutes — yes / not now"), or injects a different framing. The interrupt is the product deciding so the user doesn't have to. (Confidence: medium — strongly grounded in the user model; the trigger heuristics need tuning.)

---

## 4. ANTI-PATTERNS (explicit — do not build these)

These are the traps that look motivating and quietly destroy motivation for this user specifically.

1. **The wall of todos as the hero.** A long, flat, scrollable backlog at the top. It overwhelms, reads as clutter/guilt, and becomes invisible. "Long, rigid lists don't motivate ADHD brains — they overwhelm them." This is the exact failure the J.O.T. single-item hero exists to prevent. (Confidence: high.) Source: <https://www.getinflow.io/post/to-do-lists-that-work>

2. **Hard streaks with loss aversion.** "Don't break the chain" counters, daily-goal streaks, and anything where missing a day destroys progress. The pain of losing a streak is psychologically stronger than the pleasure of extending it; for ADHD this produces shame spirals, alarm-setting, and meaningless filler activity to keep the counter alive. ADHD brains "need forgiveness for inconsistency, not punishment." If any streak-like idea ships, it must have grace days / pause / weekend-skip baked in from day one. (Confidence: high.)
Sources: <https://nerdsip.com/blog/gamification-gone-wrong-when-streaks-become-the-point>, <https://www.thebrink.me/gamified-life-dark-psychology-app-addiction/>, <https://lifetrails.ai/blog/best-adhd-procrastination-apps>

3. **Confetti for everything.** Celebrating tab-opens, setting saves, page loads. Over-celebration causes hedonic adaptation: the brain stops registering it, and real wins feel cheap. Celebrate first *use*, not sign-up; completion, not initiation. (Confidence: high.) Sources: <https://uxplanet.org/why-confetti-celebrations-backfire-and-how-to-make-them-work-be838a6e7b8b>, <https://uxdesign.cc/the-over-confetti-ing-of-digital-experiences-af523745db19>

4. **Celebrating the app's milestone, not the user's.** Animations timed to a system event ("synced!", "indexed!") rather than the user actually closing a loop. It reads as noise and erodes trust in the reward. (Confidence: high.) Source: <https://uxplanet.org/why-confetti-celebrations-backfire-and-how-to-make-them-work-be838a6e7b8b>

5. **False / inflated progress bars.** Endowed progress is legitimate; *lying* about completion is not. A bar that claims 80% when the work is 20% done erodes trust and frustrates. Head-start yes; fake finish no. (Confidence: high.) Source: <https://www.ux-bulletin.com/goal-gradient-effect-in-ux/>

6. **Red "OVERDUE / FAILED" guilt UI.** For a brain with avoidance areas and documented self-esteem sensitivity, punishment framing on exactly the items already being avoided guarantees more avoidance. Escalate salience, never guilt. (Confidence: high — user model + ADHD-forgiveness research.) Source: <https://lifetrails.ai/blog/best-adhd-procrastination-apps>

7. **Choice overload at the action step.** Surfacing one item but then asking "what do you want to do? (10 options)" reimposes the exact paralysis the hero card removed. Three fixed actions max (PowerShell / Copy / Ask Claude), with one of them visually the default. (Confidence: high — user model "1 recommendation not 10.")

8. **Layout churn mistaken for novelty.** Rearranging the whole dashboard daily to feel "fresh" destroys the spatial muscle memory ADHD users rely on and adds re-orientation cost every visit. Novelty belongs in content and micro-treatment, not structure. (Confidence: medium-high.)

9. **Manipulative engagement loops.** Variable-ratio reward, fake urgency unconnected to real stakes, dependency hooks. This is a personal command center, not an attention-farming consumer app; borrowing dark-pattern engagement mechanics here would weaponize the user's own neurology against them. (Confidence: high.) Source: <https://www.thebrink.me/gamified-life-dark-psychology-app-addiction/>

---

## 5. SPECIFIC feature implications for THIS command-center home page

Concrete, buildable, mapped to the React/shadcn stack. Where I name a status concept, it already exists in the app's vocabulary (`new` / `working` / `requires_response` / `idle` per `src/shared/types.ts` and `AGENTS.md`).

### 5.1 The Hero "Just One Thing" card (PRIMARY)
- One large card, top of page, occupies the hero zone. The dashboard's picker chooses the item; the user does not scan a list to find it.
- Picker logic (proposal, tune later): prefer an item that is (a) in `@now`, (b) already in-progress (lowest re-initiation cost — "the next step visible" principle), then (c) an aging avoidance item with a manufactured urgency hook. Confidence: medium on the exact ranking.
- Three inline actions, one styled as primary default:
  - **Start PowerShell tab** — opens a shell tab (the app already has `Ctrl+Shift+P` PowerShell + shell tab type per `AGENTS.md`).
  - **Copy** — copies the item text / a ready command to clipboard.
  - **Ask Claude** — opens a NEW Claude session pre-loaded with a query about this item. This is the highest-leverage action: it pays the entire initiation cost in one click by handing the work to an agent. For avoidance items especially, "Ask Claude to draft the first version" converts a dreaded blank-page task into a review task.
- A "Not this — give me another" control (the pattern-interrupt escape) that re-rolls the hero. This both adds novelty and respects that the picker won't always be right, *without* dumping the user back into a 10-item menu.

### 5.2 Endowed progress + sub-steps on the hero
- If the hero item is multi-step, render a chunked progress bar that is already partway filled (count "surfaced / opened" as step 1) and emphasize remaining steps. Each sub-step checks off independently for repeated dopamine. (Goal-gradient + endowed progress, P5.)

### 5.3 The "Done" lane (reward payoff, secondary-but-prominent)
- A persistent horizontal strip or right rail: "Finished today / this session." Items animate in on completion with a reward beat scaled to size (small check for routine, bigger beat for an avoidance loop closed).
- A quiet running count ("4 done today") is fine; a punishing streak counter is not (anti-pattern #2). If a streak appears at all, ship grace days first.
- This lane reuses the same data the rest of the dashboard tracks; closing the loop on a todo moves it here rather than just deleting it.

### 5.4 Live sessions list (SECONDARY, glanceable, NOT the hero)
- A compact, dense list below/beside the hero. Each row = session name + status glyph (reuse the existing `●` new / `◉` working / `◈` requires_response / `○` idle indicators per `docs/plans/2026-02-27-claude-terminal-design.md` lines 130-135).
- This list earns attention only when a session needs the user: a `requires_response` session should pull a small salience escalation (P7) toward the hero zone, because "Claude is blocked waiting on you" is a real completing-the-loop item. It should NOT visually compete as a hero on its own.
- Clicking a session row jumps to that tab (the app already does click-to-switch + toast-to-switch per design doc lines 143-153). The dashboard reuses that, it doesn't reinvent it.

### 5.5 Escalating, forgiving aging signal (P7)
- Items carry a subtle age treatment that grows with neglect: a deepening accent or a "waiting N days" line, not a red overdue stamp. The escalation can promote a long-ignored avoidance item into hero-eligibility (manufactured urgency) — that is the escalation paying off without shaming.

### 5.6 Batch-start affordance ("pay initiation once")
- When several todos share a context (e.g., several items that are all "marketing homework"), offer a single "Start all of these in one Claude session" / "open a batch tab" action. This is the literal implementation of "batch related work so the initiation cost is paid once." Surfacing the *batch* as the hero (with sub-step progress) beats surfacing five separate items. (Confidence: high — directly from user model.)

### 5.7 Reward implementation, kept restrained
- Use a lightweight micro-interaction (a check that fills, a brief lift) for ordinary completions; reserve any larger flourish for closing a genuine loop. A small, well-vetted lib (e.g., a react reward / confetti package) is fine *if* gated behind "real completion only." Default to subtle; let the rare big win be the only loud moment. (Confidence: high.) Source: <https://www.thedevelobear.com/post/microinteractions/>

### 5.8 Novelty without overload (P6)
- Rotate the hero micro-copy and which item surfaces; keep the grid, the lane positions, and the action buttons fixed. The user should never have to re-learn where things are; only *what's inside* changes.

---

## 6. Open questions (need the user or a prototype to resolve)

- **Where do todos come from?** This lane assumes a todo/problem source exists. The dashboard's value depends on it; the picker and done-lane both need a real data source (the app already integrates Claude sessions and hooks, but a personal todo store is not evidenced in the code I read). Confidence: this is a genuine gap, not an oversight in my reading.
- **Picker ranking weights.** The hero-selection heuristic (in-progress > @now > aging-avoidance) is a proposal. It needs real use to tune, and it risks always surfacing the same avoided item if not balanced with novelty.
- **Pattern-interrupt trigger.** What signal reliably means "the user is oscillating"? Repeat visits without action is a candidate but could misfire. Needs instrumentation before it can drive a UI change.
- **Streak appetite.** Does the user want *any* streak/count, given the loss-aversion risk? Default to a soft "done today" count and no chain; confirm before adding anything stronger.
- **Reward intensity calibration.** The exact threshold for "small beat vs big celebration" is subjective and adaptation-prone; ship conservative and adjust.

---

## 7. Source list (URLs)

ADHD mechanism / interest-based nervous system / INCUP:
- <https://www.additudemag.com/secrets-of-the-adhd-brain/>
- <https://neurodivergentinsights.com/interest-based-nervous-system/>
- <https://themighty.com/topic/adhd/icnu-william-dodson-adhd-motivation/>
- <https://www.getinflow.io/post/adhd-motivation-incup>
- <https://www.truenorth-psychology.com/post/unlocking-adhd-motivators-the-incup-framework>

Task initiation / activation energy / novelty fade:
- <https://saskadhd.com/adhd-task-initiation-evidence-based-strategies-that-actually-work/>
- <https://habit-streak.com/en/blog/habit-tracking/habit-tracker-for-adhd>
- <https://www.tiimoapp.com/resource-hub/task-initiation-adhd>

Done lists / dopamine on completion / todo overwhelm:
- <https://www.getinflow.io/post/to-do-lists-that-work>
- <https://www.theminiadhdcoach.com/living-with-adhd/adhd-to-do-lists>
- <https://dayoptimizer.com/adhd/effective-daily-to-do-lists-for-adhd-brains/>

Goal-gradient / endowed progress:
- <https://www.ux-bulletin.com/goal-gradient-effect-in-ux/>
- <https://medium.com/@davidteodorescu/design-perfect-ux-tasks-the-endowed-progress-effect-7461ca20076c>
- <https://helio.app/ux-research/laws-of-ux/goal-gradient-effect/>

Celebration / micro-interaction restraint + backfire:
- <https://uxplanet.org/why-confetti-celebrations-backfire-and-how-to-make-them-work-be838a6e7b8b>
- <https://uxdesign.cc/the-over-confetti-ing-of-digital-experiences-af523745db19>
- <https://www.thedevelobear.com/post/microinteractions/>

Gamification / streak / loss-aversion anti-patterns:
- <https://nerdsip.com/blog/gamification-gone-wrong-when-streaks-become-the-point>
- <https://www.thebrink.me/gamified-life-dark-psychology-app-addiction/>
- <https://lifetrails.ai/blog/best-adhd-procrastination-apps>
- <https://www.adhdcentre.co.uk/adhd-gamification-and-its-role-in-boosting-focus-and-learning/>

Code / project context (file:line):
- `C:/Users/Mark/Claude-Code/infrastructure/claude-terminal-dashboard/AGENTS.md` — stack, tab types, status flow, PowerShell/shell tab, keybindings
- `C:/Users/Mark/Claude-Code/infrastructure/claude-terminal-dashboard/docs/plans/2026-02-27-claude-terminal-design.md` lines 130-135 (status glyphs), 143-153 (notifications + click-to-switch)
- `C:/Users/Mark/Claude-Code/infrastructure/claude-terminal-dashboard/src/shared/types.ts` (per AGENTS.md: `TabStatus`, `Tab`, `IpcMessage`)
