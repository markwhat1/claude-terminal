# Recon E1 — Executive Function & Task Initiation (Activation Energy)

Lane: ADHD design research, one lens only: executive function and task initiation. The question this lane answers: how does the in-app home page lower the cost of *getting started* so the user acts instead of stalling?

Scope note: read-only investigation. Web claims cite URLs; code claims cite `file:line` from `claude-terminal-dashboard`. Confidence is marked per claim. Personal ADHD model details come from the user's own documented profile (J.O.T., avoidance areas, "one recommendation not ten"), not from any online search.

---

## 1. The core axiom of this lane

**Starting costs roughly 10x more energy than continuing.** Activation energy is the psychological fuel to overcome inertia, and for an ADHD brain that initiation mechanism is the broken part, not willpower or character. ([Cohorty](https://blog.cohorty.app/activation-energy-lowering-the-barrier-to-start); [Thrive Psychiatry on INCUP](https://www.thrivepsychiatryclinic.com/articles/why-trying-harder-doesnt-work-with-adhd)) Confidence: high.

Everything below is deductive from that axiom. If the home page makes the *first action* cheap, visible, and singular, it works. If it makes the user plan, choose, or remember before acting, it fails, no matter how pretty it is.

This reframes what the home page is. It is not a status report you read. It is a launch ramp you act from. The success metric is "seconds from window-focus to first keystroke in a real session," not "information density."

---

## 2. Design principles (prioritized)

### P1 — One Thing, pre-decided, above the fold (highest priority)
Display one task at a time rather than the full list; a full list creates emotional overwhelm and narrows nothing. ([Tiimo](https://www.tiimoapp.com/resource-hub/task-initiation-adhd)) This matches the user's documented J.O.T. ("Just One Thing") method exactly: surface ONE actionable item, with the rest collapsed behind `@now / @next / @later` horizons.

Implication: the hero of the home page is a single card, "the one thing to do now," with a primary action button already wired. Not a todo list with one item highlighted. A single card. The backlog exists, but it is a quiet, collapsed second tier the user opens deliberately, not the default view.

### P2 — Kill the choice before it paralyzes (very high)
Too many options causes decision avoidance in everyone and hits ADHD harder; the fix is to offer 2-3 curated options or, better, one recommendation, then "get to two choices and pick either." ([ADDitude](https://www.additudemag.com/slideshows/analysis-paralysis-and-adhd-trouble-making-decisions/); [Focus Bear](https://www.focusbear.io/blog-post/choice-paralysis-adhd-tips-for-easier-decision-making)) The user's own rule states it directly: "offer 1 recommendation not 10 options."

Implication: every actionable item exposes ONE obvious primary action (a big button), with secondary actions (copy, alternate session) demoted to small icons or a hover/right-click menu. Never present a row of five equal-weight buttons. The home page itself should not ask "which project? which mode? which directory?" up front; it should pick a sane default and let the user override after the fact.

### P3 — Pay the planning cost once, in advance (high)
Planning is dozens of micro-decisions that drain executive resources; pre-structuring the day removes the "where do I start?" friction. ([Tiimo](https://www.tiimoapp.com/resource-hub/task-initiation-adhd)) The user's rule: "batch related work so the initiation cost is paid once."

Implication: the click on an item must not drop the user at a blank prompt. It should open a session with the query already typed (or already running). The work of figuring out *what to ask Claude* is done at item-creation time, stored on the item, and replayed on click. The user pays the thinking cost once when the item is captured, never again at launch.

### P4 — Make the first step a micro-step, not the whole task (high)
The "next smallest step" removes the activation barrier; "put one dish away," not "clean the kitchen." The five-minute commitment sidesteps internal resistance. ([Klarity](https://www.helloklarity.com/post/breaking-the-first-step-barrier-how-micro-steps-can-help-adhd-brains-overcome-task-initiation-problems/); [Tiimo](https://www.tiimoapp.com/resource-hub/task-initiation-adhd)) Breaking tasks into micro-goals improved focus duration by up to 47% in a 4-week study. ([Tiimo gamification](https://www.tiimoapp.com/resource-hub/gamification-adhd)) Confidence: medium (single-study figure, cited secondhand).

Implication: an item's action label should be the smallest concrete first move, "open the file," "draft the email," "look at the number," not the project goal. The button text *is* the micro-step. If an item is big, the home page should let it carry a one-line "first move" the button performs.

### P5 — Visible = exists; out of sight is out of mind (high)
ADHD brains treat tasks as "out of sight, out of mind"; making work visible reduces the chance a commitment quietly drops. Weak working memory cannot hold 30 open loops, so the loops must live on screen, not in the head. ([SimplyPsychology object permanence](https://www.simplypsychology.org/object-permanence-and-adhd.html); [Super Productivity](https://super-productivity.com/blog/visual-task-management-adhd/)) Confidence: high.

This is the entire justification for an *always-on home page* over a notification or a buried list. The dashboard is external working memory. An item the user can't see does not exist to them.

Implication: the home page is the default tab and is always reachable in one keystroke. Items the user keeps deferring should get *more* visible over time (age color, a nudge), not silently sink down a list. Time blindness means a 3-day-old "in progress" item feels like yesterday; the UI must show the age explicitly. ([SimplyPsychology time blindness](https://www.simplypsychology.org/adhd-time-blindness.html))

### P6 — Visible progress feeds the dopamine loop (medium-high)
ADHD brains have lower baseline dopamine, so delayed rewards feel flat; immediate feedback (a bar advancing, a check, a count dropping) releases dopamine and makes the next action feel worth it. Gamified apps showed 48% higher retention in a 2022 JMIR study. ([Tiimo gamification](https://www.tiimoapp.com/resource-hub/gamification-adhd); [Happiful](https://happiful.com/why-gamification-techniques-are-brilliant-for-adhd-brains)) Confidence: medium (retention figure is secondhand; the mechanism is well-supported).

Implication: completing or launching an item should produce immediate, satisfying visual feedback, the card animates out, a counter ticks down, the "now" slot refills with the next one thing. Closing the loop should feel good in the half-second after the click. This is also a gentle hook on the user's documented "completing-the-loop" avoidance: make the finish the most rewarding pixel on screen.

### P7 — Borrow urgency and novelty; the brain runs on them, not importance (medium)
INCUP: ADHD motivation is driven by Interest, Novelty, Challenge, Urgency, Passion, not by importance. ([Thrive Psychiatry](https://www.thrivepsychiatryclinic.com/articles/why-trying-harder-doesnt-work-with-adhd)) "ADHD brains respond to urgency, not importance." ([Unstuck](https://untstuck.com/blog/adhd-decision-paralysis)) Confidence: medium-high.

Implication (use with restraint, see anti-patterns): the "now" item can carry a soft urgency cue (age color escalating, an optional timer/"5 minutes on this?" button). Novelty: the home page rotating which framing or first-move it shows for a stale item can re-trigger interest in something that went flat. Don't manufacture fake deadlines, but do surface real recency/staleness honestly.

### P8 — Pattern-interrupt the oscillation (medium)
Decision oscillation (bouncing between options, re-opening the same choice) is a documented ADHD trap, and the user's profile explicitly calls for pattern-interrupts to break it. The interface itself can be the interrupt: a timer creates urgency where none existed. ([ADDitude](https://www.additudemag.com/slideshows/analysis-paralysis-and-adhd-trouble-making-decisions/))

Implication: if the user lingers on the home page without acting (measurable: home tab focused N seconds, no click), the page can gently collapse to JUST the one card, or pulse the primary button, or offer "just 5 minutes." A pattern-interrupt is a feature, not nagging, when it fires only on detected stall.

---

## 3. Anti-patterns (what will actively break this for an ADHD user)

- **AP1 — The wall of cards.** Showing all todos/problems/sessions at equal weight is the failure mode. It recreates the overwhelmed feeling the home page exists to fix. The brief already mandates "one item at a time"; honor it literally. A 12-item grid is not a dashboard, it's a stressor. (Counters P1, P2.)

- **AP2 — Blank-slate launch.** Clicking an item and landing on an empty Claude prompt or a fresh PowerShell with nothing typed throws the activation cost right back at the user at the worst moment. The whole point was to pre-load. An item that opens to a blank cursor has failed. (Counters P3.)

- **AP3 — The setup gauntlet.** Asking project/mode/directory/branch questions *before* the user can act. Every modal between "I want to start" and "I'm started" is activation energy added, not removed. Pick defaults, act, let them adjust after. (Counters P2, P3.)

- **AP4 — Equal-weight action rows.** Five same-size buttons per item (jump / copy / new session / edit / delete) forces a micro-decision per item. One primary button, the rest demoted. (Counters P2.)

- **AP5 — Silent decay.** Letting a deferred item drift to the bottom and disappear. For an ADHD user that equals deletion. Stale items must get louder (color, position, a nudge), never quieter. (Counters P5.)

- **AP6 — Punitive or red-everywhere urgency.** Overdue counts, guilt language, a sea of red badges. The user's documented avoidance areas (financial confrontation, completing-the-loop, personal health, marketing) are precisely the items most likely to pile up; hammering them with shame increases avoidance. Frame as "next," not "you're behind." Honest staleness color, yes; a wall of angry red, no. ([Cohorty's "knowing isn't the bottleneck, doing is"](https://blog.cohorty.app/activation-energy-lowering-the-barrier-to-start), and the user's "honest, not fear" framing carried over from clinical work.) (Counters P6, P7.)

- **AP7 — Notification reliance instead of an always-on surface.** A toast that fires once and vanishes is the opposite of object permanence. The persistent home page is the mechanism; transient alerts supplement it, never replace it. (Counters P5.)

- **AP8 — Gamification as decoration.** Points/badges bolted on without tying to the real loop is noise. The reward must be the *actual* state changing (item done, count down), not a meaningless trophy. Hollow gamification adds cognitive load. (Counters P6.)

- **AP9 — Making sessions the hero.** The brief is explicit: live sessions are the SECONDARY glanceable list, not the hero. A session list is "what's running," which is interesting but not actionable; it does not lower the cost of starting the *next* thing. Keeping it secondary is a direct executive-function decision, not just layout taste. (Counters P1.)

---

## 4. Feature implications for THIS home page (concrete, mapped to the codebase)

The app already has the primitives this lane needs. Mapping:

### 4.1 The hero: "One Thing" card
- A single, large card at the top: the current `@now` item, with its pre-stored "first move" as the button label (P1, P4).
- Below it, three quiet collapsed sections: `@now (this week)`, `@next (this month)`, `@later (backlog)`, matching the user's J.O.T. horizon labels. Default state: only `@now` expanded, showing only its top item. (P1)
- A clear, honest age indicator on the hero ("started 3 days ago", "captured Monday") to fight time blindness. (P5)

### 4.2 The three required click actions, mapped to existing IPC
The brief requires each item to support: (a) jump to a new PowerShell tab, (b) copy text, (c) open a NEW Claude session pre-loaded with a query. All three already exist as IPC channels:

- **(a) PowerShell tab** -> `tab:createShell` handler at `src/main/ipc-handlers.ts:515` (`ipcMain.handle('tab:createShell', ...)`, creates a shell tab via `tabManager.createTab(cwd, null, 'shell', ...)` at `:537`). Pass the item's `cwd`/project as `explicitCwd`. Confidence: high.
- **(b) Copy text** -> renderer-only clipboard write; no IPC needed. The item stores the copy payload. Confidence: high.
- **(c) New Claude session pre-loaded with a query** -> two-step: `tab:create` at `src/main/ipc-handlers.ts:336` (creates a claude tab, supports resume via `resumeSessionId`), then inject the stored query through `pty:write` at `src/main/ipc-handlers.ts:736` (`ipcMain.on('pty:write', (_event, tabId, data) => ...)`) once the PTY is ready. The query is the pre-loaded "paid once" planning from P3. Confidence: high that the channels exist; medium on timing (need to write the query only after the PTY/Claude prompt is ready, likely gated on a session-start hook or a short ready signal, not immediately on create).

Action hierarchy on the card (P2, P4, AP4): the **primary** button is action (c) for most items (the pre-loaded Claude query is the highest-value start). Actions (a) and (b) are small secondary icons. Pick the primary per item type; never show three equal buttons.

### 4.3 Secondary: live sessions strip
- A compact, glanceable row/strip (not cards, not the hero) listing live sessions with their status. The app's `TabStatus` already distinguishes `working | idle | requires_response` (`src/shared/types.ts:1`). Map those to dots/colors. (AP9 keeps this secondary.) Confidence: high.

### 4.4 "Needs you" is a first-class, pre-built signal
- `requires_response` (`src/shared/types.ts:1`) is exactly "a session is blocked waiting on the user." This is the strongest activation-energy win available, the next action is already decided by Claude, the user just has to show up. Any session in `requires_response` should be promoted INTO the actionable zone (it can even outrank the `@now` item, since the cost to act is near-zero: click the tab and answer). Confidence: high. This is the single highest-leverage feature for this lane.
- Driven by hooks today (`AGENTS.md`: tab status flow `new -> working <-> idle / requires_response`), and `on-notification.js` / `on-stop.js` hooks exist in `src/hooks/`. Confidence: high.

### 4.5 Closing-the-loop reward
- On launch/complete, animate the card out and refill the `@now` slot with the next single item; tick a small "X left this week" counter. Immediate, real, dopamine-aligned feedback (P6). Keep it to the actual state change, not confetti for its own sake (AP8). Confidence: medium (design recommendation, not a code finding).

### 4.6 Stall-detected pattern interrupt
- If the home tab is focused for ~20-30s with no action, collapse to just the one card and softly pulse the primary button, or surface a "5 minutes on this?" affordance (P4, P8). Fire only on detected stall so it never nags. Confidence: medium (design recommendation).

### 4.7 Capture must be one gesture
- The home page needs a frictionless "add an item" path (one keystroke / one field) so capturing a todo doesn't itself cost activation energy. The user's documented avoidance of "system documentation" means a heavyweight capture form will simply not get used; items will live in their head and vanish (P5, AP5). A single text field that accepts a title + optional pre-loaded query is enough to start. Confidence: medium-high (grounded in user profile + object-permanence research).

### 4.8 Honest, age-based staleness color (not shame)
- Reuse the sibling `program-board` project's idea of age-color/needs-you (per workspace `CLAUDE.md`: program-board "computes lane/age-color/needs-you"). Apply the same honest aging here: older deferred items shift color to draw the eye, but the language stays "next," never "overdue/failed" (P5, P7, AP6). Confidence: medium (cross-project pattern, applicability is a design judgment).

---

## 5. How this lane interacts with the others (handoffs)

- The **layout/IA lane** must enforce the one-hero rule; this lane supplies the *why* (P1, AP1, AP9) but the spatial hierarchy is theirs.
- The **data-model lane** must let an item carry: a horizon (`@now/@next/@later`), a stored "first move" label, a pre-loaded query string, a copy payload, a target cwd/project, and a captured-at timestamp. Those fields are what make P3/P4/4.2 possible. This is the most important cross-lane dependency.
- The **session-status lane** owns the `requires_response` promotion logic (4.4); this lane just declares it the top priority.

---

## 6. Sources

Web (cited above):
- Cohorty, Activation Energy: https://blog.cohorty.app/activation-energy-lowering-the-barrier-to-start
- Tiimo, Task Initiation: https://www.tiimoapp.com/resource-hub/task-initiation-adhd
- Tiimo, Gamification: https://www.tiimoapp.com/resource-hub/gamification-adhd
- Klarity, Micro-Steps: https://www.helloklarity.com/post/breaking-the-first-step-barrier-how-micro-steps-can-help-adhd-brains-overcome-task-initiation-problems/
- Thrive Psychiatry, INCUP: https://www.thrivepsychiatryclinic.com/articles/why-trying-harder-doesnt-work-with-adhd
- ADDitude, Analysis Paralysis: https://www.additudemag.com/slideshows/analysis-paralysis-and-adhd-trouble-making-decisions/
- Focus Bear, Choice Paralysis: https://www.focusbear.io/blog-post/choice-paralysis-adhd-tips-for-easier-decision-making
- Unstuck, Decision Paralysis: https://untstuck.com/blog/adhd-decision-paralysis
- SimplyPsychology, Object Permanence: https://www.simplypsychology.org/object-permanence-and-adhd.html
- SimplyPsychology, Time Blindness: https://www.simplypsychology.org/adhd-time-blindness.html
- Super Productivity, Visual Task Management: https://super-productivity.com/blog/visual-task-management-adhd/
- Happiful, Gamification for ADHD: https://happiful.com/why-gamification-techniques-are-brilliant-for-adhd-brains

Code:
- `infrastructure/claude-terminal-dashboard/src/shared/types.ts:1` (TabStatus incl. `requires_response`)
- `infrastructure/claude-terminal-dashboard/src/main/ipc-handlers.ts:336` (`tab:create`)
- `infrastructure/claude-terminal-dashboard/src/main/ipc-handlers.ts:515` (`tab:createShell`)
- `infrastructure/claude-terminal-dashboard/src/main/ipc-handlers.ts:736` (`pty:write`)
- `infrastructure/claude-terminal-dashboard/AGENTS.md` (tab status flow, hook system)

User ADHD model: documented J.O.T. method, `@now/@next/@later` horizons, escalating reminders, pattern-interrupts, "offer 1 recommendation not 10," "batch related work so initiation is paid once," documented avoidance areas. Not web-sourced.
