# E3 — Time-Blindness & Temporal Cues (ADHD design lens)

Recon for the always-on in-app **home page / command center** inside the ClaudeTerminal Electron app. This lane looks at the home page through one lens only: **time-blindness** and the temporal cues that work for an ADHD brain (now / next, due, elapsed, gentle escalating timers). Read-only investigation.

Scope reminder: the home page must surface the user's todos / problems / in-progress items as the PRIMARY content, all live sessions as a SECONDARY glanceable list, and let a click (a) jump to a new PowerShell tab, (b) copy text, or (c) open a NEW Claude session pre-loaded with a query.

---

## 1. The core mechanism we are designing around

Time-blindness in ADHD is not casual forgetfulness. It is an impaired ability to sense how much time has passed, how long a task will take, and how much time is left before a deadline. The lived experience collapses to a near-binary: **now vs. not-now**. ([habi.app](https://habi.app/insights/time-blindness-adhd/), [super-productivity.com](https://super-productivity.com/blog/adhd-time-blindness-strategies/), [carolinaadhdcoaching.com](https://carolinaadhdcoaching.com/time-blindness-in-adhd-guide/))

Two design consequences fall directly out of that:

1. **"Not-now" items are invisible.** Anything off-screen, in a backlog, or expressed only as an absolute date the user has to mentally subtract from today, effectively does not exist. This is the engine behind Mark's documented avoidance areas (financial confrontation, system documentation, completing-the-loop, personal health, marketing homework): they are all "not-now" until they detonate. The home page's job is to **drag the right not-now item into now**, exactly once, without a wall of choices.
2. **Elapsed and remaining time must be shown, not computed.** A raw timestamp (`2:14 PM`, `started 13:42`) forces a subtraction the time-blind brain skips. A relative, glanceable form ("running 38 min", "idle 2 h", "3 d stalled") removes that step. ([theproductguy.in](https://theproductguy.in/blogs/relative-time-display/))

This user's documented model already encodes the antidote, and it lines up cleanly with the literature:
- **J.O.T. "Just One Thing"** — surface ONE actionable item at a time. Matches the strongest finding in the task-initiation literature: display one task at a time, smallest possible next action, to clear activation overwhelm. ([tiimoapp.com](https://www.tiimoapp.com/resource-hub/task-initiation-adhd), [add.org](https://add.org/adhd-paralysis/))
- **Temporal buckets `@now` (this week) / `@next` (this month) / `@later` (backlog)** — matches the "humans think in buckets of time, not dates" agenda pattern (tonight / this week / next month). ([eleken.co](https://www.eleken.co/blog-posts/calendar-ui))
- **Escalating reminders (8am / 1pm / 5pm / 8:30pm)** — matches the "checkpoint architecture" of multiple gentle nudges that escalate, and the "one notification is never enough" reminder research. ([super-productivity.com](https://super-productivity.com/blog/adhd-time-blindness-strategies/), [sproutapp.tech](https://www.sproutapp.tech/blog/adhd-reminder-app))
- **Pattern-interrupts to break decision oscillation** — the home page should be able to interrupt a stuck loop with one directive item, not add more options.
- **One recommendation, not ten options; batch related work so initiation cost is paid once** — the literal "next smallest action / pre-stage the tools so starting has no friction" finding, and the design hinge for the "open a pre-loaded Claude session" action. ([tiimoapp.com](https://www.tiimoapp.com/resource-hub/task-initiation-adhd))

---

## 2. What the codebase already gives us (and the one critical gap)

### 2.1 There is a proven temporal vocabulary in this exact workspace: the program-board

The sibling repo `infrastructure/program-board` already ships an ADHD-flavored status engine that this home page should **mirror, not reinvent**. It is the house dialect for "how stale is too stale" and "what counts as needing you."

- `age_color(age_days)` thresholds: green `< 3d`, yellow `< 7d`, orange `< 14d`, red `>= 14d` (`infrastructure/program-board/src/program_board/status.py:22-29`). This is a ready-made elapsed-time color ramp. Same idea, shorter scale, applies to a session that has gone idle: minutes/hours instead of days.
- `STALL_DAYS = 7` and the active/backlog boundary `ACTIVE_MAX_DAYS = 14` (`status.py:4-5`).
- `needs_you(...)` returns `(bool, reasons[])` with human reasons like `"stalled {n}d"`, `"almost done: {gap}"`, `"time-sensitive {date}"`, and high/critical open issues (`status.py:55-73`). This is the model for the home page's PRIMARY "NEEDS YOU" feed.
- The board's empty state is the J.O.T. tell, verbatim: **`<p class="empty">Clear. Keep working.</p>`** when `needs_you` is empty (`infrastructure/program-board/src/program_board/templates/board.html:13`). Copy that voice exactly.

Confidence: high — these are concrete, current files in the workspace.

### 2.2 The app's tab/session model has status but NO time

The session list (the SECONDARY glanceable surface) is built on `Tab` / `TabStatus`. The status machine is: `new -> working <-> idle / requires_response`, plus `shell` (`infrastructure/claude-terminal/src/shared/types.ts:1-21`, AGENTS.md "Tab status flow"). Hooks drive it: `on-stop.js` sends `tab:status:idle`, `on-notification.js` sends `tab:status:input` (`infrastructure/claude-terminal/src/hooks/on-stop.js:5`, `.../on-notification.js:5`).

The indicators already exist: spinner for `working`, green check for `idle`, pulsing message icon for `requires_response` (`infrastructure/claude-terminal/src/renderer/components/TabIndicator.tsx:11-43`), and the `StatusBar` already counts tabs by status (`infrastructure/claude-terminal/src/renderer/components/StatusBar.tsx:31-47`).

**The critical gap for this lane:** the `Tab` interface carries **no timestamps**. No `lastActivityAt`, no `idleSince`, no `requiresResponseSince`, no `workingStartedAt` (`src/shared/types.ts:7-21`; `TabManager.updateStatus` only flips the enum, `src/main/tab-manager.ts:55-58`). With no temporal field, the home page literally cannot say "idle 4 min" vs "idle 2 h", and **those two are completely different signals for a time-blind user**: the first is normal, the second is an abandoned session quietly waiting on him. This is the single highest-leverage data-model change for the whole lane.

Confidence: high — verified against the type and the manager source.

---

## 3. Design principles (prioritized)

**P1 — One hero item, never a list as the hero.** The PRIMARY surface leads with exactly ONE actionable card: the single most-needs-you item, chosen by an ordering function (see §4.3). Everything else is below the fold or one scroll down. This is J.O.T. and it is the strongest, most-repeated finding in the task-initiation literature: show one task at a time to defeat activation overwhelm. ([tiimoapp.com](https://www.tiimoapp.com/resource-hub/task-initiation-adhd), [add.org](https://add.org/adhd-paralysis/))

**P2 — Every time value is relative and glanceable, computed for the user.** "running 38 min", "idle 2 h", "stalled 3 d", "due in 2 d". Never make him subtract from a clock. Pair with the program-board color ramp so duration is also encoded as color, readable without reading the number. ([theproductguy.in](https://theproductguy.in/blogs/relative-time-display/), `status.py:22-29`)

**P3 — Temporal buckets, not dates.** Group the PRIMARY feed into `@now` / `@next` / `@later`, mirroring Mark's labels and the agenda "buckets of time" pattern. Progressive detail disclosure: `@now` items render full (title + why + one-click action); `@next` is scannable one-liners; `@later` is collapsed by default. ([eleken.co](https://www.eleken.co/blog-posts/calendar-ui))

**P4 — Make "not-now" visible on a duration ramp, automatically.** Reuse the `needs_you` reason vocabulary: an idle/`requires_response` session that crosses a threshold gets promoted from the SECONDARY list into the PRIMARY feed with a plain-language reason ("waiting on you 25 min", "stalled 3 d"). The user should never have to remember to check; the surface should escalate the item to him. ([super-productivity.com](https://super-productivity.com/blog/adhd-time-blindness-strategies/))

**P5 — Ambient, glanceable, always-on; not interruptive.** Time awareness comes from continuous visual state on a screen he can glance at, not from alarms that yank him out of hyperfocus (which costs 20+ min of context recovery). A single beep is dismissed during hyperfocus; ambient color/progress on the home page is felt without being jarred. The home page IS the ambient display. ([super-productivity.com](https://super-productivity.com/blog/adhd-time-blindness-strategies/), [audhdpsychiatry.co.uk](https://www.audhdpsychiatry.co.uk/adhd-tools-for-daily-tasks/))

**P6 — Escalate gently, and vary the signal to beat habituation.** Where a nudge is warranted, follow the checkpoint model (multiple soft surfaces, escalating prominence) rather than one hard alarm. Vary the form across the chain (color shift -> badge -> count-up -> a single louder cue), because a fixed daily tone is filtered out fast, doubly so for an ADHD brain already filtering noise. Maps to Mark's 8am/1pm/5pm/8:30pm cadence. ([super-productivity.com](https://super-productivity.com/blog/adhd-time-blindness-strategies/), [affine.pro](https://affine.pro/blog/setting-effective-reminders-adhd), [mypatientadvice.co.uk](https://mypatientadvice.co.uk/knowledge-base/why-do-adhd-brains-still-ignore-phone-alarms/))

**P7 — Prefer elapsed (count-up) over countdown for active work.** Count-down timers can induce time-anxiety that impairs focus; a calm count-up or filling progress ring shows "you've been here a while" without manufacturing dread. Reserve hard countdowns only for genuine external deadlines. ([pomodorotimer.vip](https://pomodorotimer.vip/blog/time-blindness-adhd/), [super-productivity.com](https://super-productivity.com/blog/adhd-time-blindness-strategies/))

**P8 — Pre-stage the action so initiation is one click.** The "open a NEW Claude session pre-loaded with a query" action is the literal embodiment of "pre-stage the tools so starting has no friction" and "batch related work so initiation cost is paid once." Each PRIMARY item should carry its ready-to-run action inline, not send him off to assemble it. ([tiimoapp.com](https://www.tiimoapp.com/resource-hub/task-initiation-adhd))

---

## 4. Specific feature implications for this home page

### 4.1 Add temporal fields to the session/tab model (prerequisite, do first)
Extend `Tab` (or a derived view-model) with: `lastActivityAt`, `statusSince` (when it entered the current status), and optionally `workingStartedAt`. Set `statusSince = Date.now()` inside `TabManager.updateStatus` (`src/main/tab-manager.ts:55-58`) and stamp `lastActivityAt` on every PTY data / hook event. Without this, none of P2/P4/P7 are possible. This is the one hard blocker for the lane. (Confidence: high)

### 4.2 A relative-time formatter as a shared util
One function `formatElapsed(sinceMs)` -> "just now" / "4 min" / "2 h" / "3 d", plus `elapsedColor(sinceMs)` reusing the program-board ramp at a session scale (e.g. green `<10 min`, yellow `<60 min`, orange `<4 h`, red `>=4 h` for an idle session waiting on input; tune later). Render both the string and the color everywhere a duration shows. (Confidence: medium — exact thresholds are a tuning decision, not a fact.)

### 4.3 The "NEEDS YOU" PRIMARY feed (the hero)
Port the program-board `needs_you` shape directly: each item is `{ title, reasons[], action }`. Source reasons from:
- A session in `requires_response` longer than a short threshold -> reason `"waiting on you {elapsed}"` (this is the #1 reason a session should jump from SECONDARY to PRIMARY).
- A session `idle` past a longer threshold -> `"stalled {elapsed}"` (mirrors `STALL_DAYS`, `status.py:63`).
- User todos tagged `@now`, and `@next`/`@later` items whose due date is near (`_time_sensitive_near` analog, `status.py:45-52`).
Order by severity, render the **single top item as the hero**, the rest as a short list. Empty state copy: **"Clear. Keep working."** (reuse the board's voice, `board.html:13`). (Confidence: high on pattern, medium on exact thresholds)

### 4.4 SECONDARY live-session list = glanceable status + age
Reuse the existing `TabIndicator` icons (`TabIndicator.tsx`) so the visual language matches the tab bar, and append the relative-age string + color per session. This turns the existing status counts (`StatusBar.tsx:31-47`) into a per-session, time-aware row. A session shows `working · 38 min`, `idle · 2 h` (orange), `input · 25 min` (red, and it has also been promoted up to NEEDS YOU). (Confidence: high)

### 4.5 Count-up, not count-down, on the active session
For the currently-`working` session, show a calm elapsed count-up or a filling progress ring (the most-recommended ADHD visual-timer form), never a countdown. The ring is ambient: it tells him "you've been on this 50 min" at a glance, no number-reading required. ([pomodorotimer.vip](https://pomodorotimer.vip/blog/time-blindness-adhd/), [super-productivity.com](https://super-productivity.com/blog/adhd-time-blindness-strategies/)) (Confidence: medium — UI form is a recommendation, not a mandate)

### 4.6 Per-item one-click action that pre-stages the work
Each PRIMARY card carries its action inline, using the three already-required home-page verbs:
- **Open pre-loaded Claude session** for "start this todo" items (pays the initiation cost once, P8).
- **Jump to PowerShell tab** for items that are really a shell command.
- **Copy text** for follow-ups (the email line, the number to send Danielle) so "completing the loop" costs one click.
This is where the home page actively fights Mark's avoidance areas: it doesn't just remind him financial/marketing/health items exist, it hands him the started session. (Confidence: high — these are the lane's given capabilities)

### 4.7 Soft, varied, in-app escalation (no OS alarm)
Escalate an un-acted item by changing its presentation over time on the always-on surface: color drift along the ramp -> a count-up badge -> finally bubbling to the hero slot. Tie the cadence to Mark's 8am/1pm/5pm/8:30pm rhythm if a daily reset/anchor is wanted, but keep it ambient-first. Avoid a recurring identical chime; vary the form so it doesn't habituate. ([affine.pro](https://affine.pro/blog/setting-effective-reminders-adhd), [mypatientadvice.co.uk](https://mypatientadvice.co.uk/knowledge-base/why-do-adhd-brains-still-ignore-phone-alarms/)) (Confidence: medium)

### 4.8 Anchor the home page to events, not clock-times
Where the dashboard wants to nudge a routine, anchor it to an event that already has an external cue ("when the last working session goes idle for the day, surface the end-of-day loop-closing list") rather than a wall-clock alarm. Event-anchoring removes the time-perception requirement entirely. ([pomodorotimer.vip](https://pomodorotimer.vip/blog/time-blindness-adhd/)) (Confidence: medium)

---

## 5. Anti-patterns (explicit do-not)

- **Do NOT show raw absolute timestamps as the primary time signal.** "Started 13:42" forces a subtraction a time-blind user skips. Relative + color, always. ([theproductguy.in](https://theproductguy.in/blogs/relative-time-display/))
- **Do NOT make a flat scrollable to-do list the hero.** A list is a choice-explosion; it triggers paralysis, the exact failure J.O.T. exists to prevent. One hero item. ([add.org](https://add.org/adhd-paralysis/), [tiimoapp.com](https://www.tiimoapp.com/resource-hub/task-initiation-adhd))
- **Do NOT use a single OS notification / one beep as the reminder mechanism.** It is registered as "not urgent" and dismissed during hyperfocus, backing up nothing the next glance would not show. ([super-productivity.com](https://super-productivity.com/blog/adhd-time-blindness-strategies/))
- **Do NOT use jarring interruptions that pull him out of a session.** Flow recovery costs 20+ min; the ambient home page should inform on glance, not seize attention. ([super-productivity.com](https://super-productivity.com/blog/adhd-time-blindness-strategies/))
- **Do NOT default to anxiety-inducing countdowns for ongoing work.** Count-up / progress ring for active sessions; reserve countdown for real external deadlines only. ([pomodorotimer.vip](https://pomodorotimer.vip/blog/time-blindness-adhd/))
- **Do NOT fire the same notification at the same time with the same tone forever.** Habituation kills it fast, faster for ADHD. Vary form and prominence across the escalation chain. ([affine.pro](https://affine.pro/blog/setting-effective-reminders-adhd), [mypatientadvice.co.uk](https://mypatientadvice.co.uk/knowledge-base/why-do-adhd-brains-still-ignore-phone-alarms/))
- **Do NOT present 10 options / 10 equal cards.** One recommendation with a reason and a ready action. Equal-weight cards re-create the oscillation the home page is meant to break. (user model; [tiimoapp.com](https://www.tiimoapp.com/resource-hub/task-initiation-adhd))
- **Do NOT bury "not-now" items where they vanish.** Auto-promote them up the duration ramp; relying on the user to remember to check the backlog defeats the purpose. ([super-productivity.com](https://super-productivity.com/blog/adhd-time-blindness-strategies/))

---

## 6. Open questions / handoffs to other lanes

- **Threshold tuning.** The session-scale color ramp and the idle/stall promotion thresholds (§4.2, §4.3) are guesses extrapolated from the program-board day-scale numbers. They need a real-usage tuning pass. (medium)
- **Data-model ownership.** Adding `statusSince` / `lastActivityAt` to `Tab` touches the IPC/persistence lane (the `Tab` type is broadcast to remote clients; per AGENTS.md any new field must be considered for remote parity). Flag to whichever lane owns the data model / IPC. (high)
- **Where do "todos" come from?** This lane assumes a todo/problem source exists for the PRIMARY feed (Todoist? a local store? program-board `needs_you` JSON?). The temporal treatment here is source-agnostic, but another lane must define ingestion. (high it's unresolved)
- **Notification surface.** Whether escalation ever leaves the in-app ambient surface for an OS/Telegram nudge is a cross-lane policy call; this lane recommends ambient-first and varied-if-escalated. (medium)

---

## Sources

- [Time Blindness and ADHD: How Visual Timers Help You Feel Time — pomodorotimer.vip](https://pomodorotimer.vip/blog/time-blindness-adhd/)
- [ADHD Time Blindness: Why Timers Fail and What Works — super-productivity.com](https://super-productivity.com/blog/adhd-time-blindness-strategies/)
- [Time Blindness: What It Means, Why It Happens, How to Manage It — habi.app](https://habi.app/insights/time-blindness-adhd/)
- [Essential Guide: Time Blindness in ADHD (Visual Timers) — carolinaadhdcoaching.com](https://carolinaadhdcoaching.com/time-blindness-in-adhd-guide/)
- [Relative Time Display: '2 Hours Ago' vs Raw Timestamps — theproductguy.in](https://theproductguy.in/blogs/relative-time-display/)
- [Task Initiation Tactics for ADHD Adults — tiimoapp.com](https://www.tiimoapp.com/resource-hub/task-initiation-adhd)
- [ADHD Paralysis Is Real: 8 Ways to Overcome It — add.org](https://add.org/adhd-paralysis/)
- [Setting Effective Reminders ADHD Brains Actually Notice — affine.pro](https://affine.pro/blog/setting-effective-reminders-adhd)
- [ADHD Reminder App: Why One Notification Is Never Enough — sproutapp.tech](https://www.sproutapp.tech/blog/adhd-reminder-app)
- [When Phone Alarms Don't Work for ADHD Adults — mypatientadvice.co.uk](https://mypatientadvice.co.uk/knowledge-base/why-do-adhd-brains-still-ignore-phone-alarms/)
- [The Best ADHD Tools for Remembering Daily Tasks — audhdpsychiatry.co.uk](https://www.audhdpsychiatry.co.uk/adhd-tools-for-daily-tasks/)
- [Calendar UI Examples: 33 Inspiring Designs (+ UX Tips) — eleken.co](https://www.eleken.co/blog-posts/calendar-ui)

### Workspace code references
- `infrastructure/program-board/src/program_board/status.py:4-73` — age_color ramp, STALL/ACTIVE thresholds, `needs_you` reason vocabulary, `_time_sensitive_near`.
- `infrastructure/program-board/src/program_board/templates/board.html:11-36` — "NEEDS YOU" section + "Clear. Keep working." empty state.
- `infrastructure/claude-terminal/src/shared/types.ts:1-21` — `TabStatus`, `Tab` (no timestamps: the gap).
- `infrastructure/claude-terminal/src/main/tab-manager.ts:55-58` — `updateStatus` (where `statusSince` should be stamped).
- `infrastructure/claude-terminal/src/hooks/on-stop.js:5`, `.../on-notification.js:5` — status events (idle / input).
- `infrastructure/claude-terminal/src/renderer/components/TabIndicator.tsx:11-43` — existing status icon language to reuse.
- `infrastructure/claude-terminal/src/renderer/components/StatusBar.tsx:31-47` — existing per-status counts to extend with age.
- `~/.claude/projects/.../memory/user_adhd_profile.md` — J.O.T., escalating reminders, avoidance areas, "one recommendation not ten options."
