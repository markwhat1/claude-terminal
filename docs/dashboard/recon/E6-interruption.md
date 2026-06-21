# Lane E6 — Interruption, Notification & Context-Switch Cost / Hyperfocus Protection

Recon for the always-on in-app home page inside the ClaudeTerminal Electron app. One lens: the **cost of interruption**. How the home page (and the app's existing notification machinery) can protect a focused state, minimize self-inflicted context switches, and let attention move from the periphery to the center and back without paying the full re-entry tax each time.

This lane is written against the user's documented ADHD model: J.O.T. "Just One Thing" (surface ONE actionable item; `@now` this week / `@next` this month / `@later` backlog); escalating reminders; pattern-interrupts to break decision oscillation; documented avoidance areas (financial confrontation, system documentation, delegation, completing-the-loop, personal health, marketing homework); and the rule "offer 1 recommendation not 10 options; batch related work so the initiation cost is paid once."

Web sources are cited inline; codebase claims cite `file:line`. Confidence is marked per claim. No patient/PHI data appears here; nothing personal was searched online.

Sibling lanes already own the adjacent ground: **E4 (overwhelm / visual noise)** owns "calm by default, one hero, progressive disclosure"; **E1 (exec function)**, **E2 (working memory)**, **E3 (time-blindness)**, **E5 (dopamine)**. This lane deliberately does NOT re-derive "make one hero todo." It assumes that, and asks the narrower question: *given an always-on dashboard that updates itself and an OS notification system that already fires, how do we keep it from becoming an interruption engine?*

---

## 1. The core tension this lane exists to resolve

An always-on home page plus a live notification system is, by construction, a machine for generating interruptions. Every session that flips state, every poll cycle that re-sorts a list, every "Claude finished" toast is a candidate context switch. For an ADHD brain that math is brutal.

The numbers from the research:

- A single interruption costs an average of **23 minutes and 15 seconds** to fully return to the original task, and people cycle through ~2 intervening tasks before getting back ([Gloria Mark / UC Irvine, summarized](https://pomogolo.com/blog/23-minute-refocus-cost); [oberien blog on the original study](https://blog.oberien.de/2023/11/05/23-minutes-15-seconds.html)).
- Switching tasks can cut effective productivity by up to ~40%, and the damage is heavier for ADHD brains ([Wake Forest News on switch cost](https://news.wfu.edu/2024/04/16/the-switch-cost-of-multitasking/); [Favor Mental Health](https://www.favormentalhealthservices.com/post/the-cost-of-context-switching-how-bouncing-between-tasks-fuels-adhd-like-symptoms)).
- **Attention residue**: after a switch you operate on ~60-70% of your working memory because part of it stays stuck on the prior task ([Goals & Progress on Leroy's research](https://goalsandprogress.com/attention-residue-management/); [Brain Labs / Medium](https://medium.com/brain-labs/attention-residue-the-invisible-cost-of-switching-tasks-9762b14a14e2)).
- **~44% of interruptions are self-generated** ([Speakwise summary of the research](https://speakwiseapp.com/blog/workplace-interruption-statistics)). You cannot fix this lane by managing other people. The dashboard's own affordances are the interrupter.
- ADHD specifically impairs **attentional set-shifting**: adults with ADHD are slower and less accurate when the context forces a switch of task rules ([Selective impairment of attentional set shifting in adults with ADHD, PMC6230251](https://pmc.ncbi.nlm.nih.gov/articles/PMC6230251/)). So each switch this app provokes costs *more* than it would for a neurotypical user.

The design conclusion: **the home page must be a place attention comes to rest, not a place it gets pulled away from.** Its job in this lens is to (a) hold the one thing so the user does not have to, (b) never yank focus on its own initiative, and (c) when the user *does* glance over, give them a clean re-entry point so the switch they chose to make is cheap.

There is a second, subtler tension. ADHD hyperfocus is fragile and the fear of having it broken is itself documented as a stressor ([ADHD Goals on fear of hyperfocus interruption](https://adhdgoals.co/adhd/adhd-hyperfocus-and-fear-of-interruption/)). The app already sits on top of *real* working sessions. When the user is in flow inside one tab, the dashboard and its notifications must defer; the "right" moment to surface anything non-urgent is a natural breakpoint, not the clock ([Orchestrating Attention, arXiv 2602.07865](https://arxiv.org/pdf/2602.07865)).

---

## 2. What the codebase already does (the interruption surface that exists)

This is the load-bearing part of the lane, because the app *already ships an interruption system* and the dashboard will inherit it.

- **Tab status state machine.** `TabStatus = 'new' | 'working' | 'idle' | 'requires_response' | 'shell'` (`src/shared/types.ts:1`). The flow `new -> working <-> idle / requires_response` is driven entirely by Claude Code hooks, no output parsing (`AGENTS.md`, "Tab status flow").
- **Hooks map cleanly to attention demands.** `on-tool-use.js` -> `working`; `on-stop.js` -> `idle`; `on-notification.js` -> `requires_response` (`src/hooks/on-tool-use.js:5`, `src/hooks/on-stop.js:5`, `src/hooks/on-notification.js:5`). `requires_response` is the canonical **"needs you"** signal. (Confidence: high.)
- **OS notifications already fire on two events**, and only when the tab is NOT active:
  - On `tab:status:idle`: `"Claude has finished working"` (`src/main/hook-router.ts:125-131`).
  - On `tab:status:input`: `"Claude needs your input"` (`src/main/hook-router.ts:134-141`).
  Clicking a notification shows+focuses the window, switches project, switches to the tab (`hook-router.ts:29-47`). (Confidence: high.)
- **A dedup guard exists but no batching / quiet hours.** `pendingNotifications` is a `Set<string>` that suppresses a *second* notification for a tab that already has one pending; it clears on click (`hook-router.ts:21-26, 50-52`). This prevents the idle-then-input double-fire, but it does NOT throttle across tabs, batch bursts, or respect a focus state. (Confidence: high.)
- **Per-project "needs you" counts already aggregated** in the renderer: `requires_response` is counted per project alongside idle/working/total (`src/renderer/App.tsx:88-98`), surfaced in `ProjectSidebar.tsx:8,55` and `StatusBar.tsx`. The data the dashboard needs for a "who needs you" view is already computed. (Confidence: high.)
- **`requires_response` already maps to an attention color** (`text-attention`) in `StatusBar.tsx:15` and a tab indicator in `TabIndicator.tsx:25`. There is an existing visual vocabulary for "this one needs you." (Confidence: high.)
- **Notification click is the only "jump to the thing" path today.** It is imperative and OS-mediated. The dashboard can offer the same jump as an in-app, user-initiated action, which is strictly better for this lens (the user chooses the moment). (Confidence: high.)

Implication: the dashboard does not need to *invent* an interruption model. It needs to **govern the one that exists** and add a calmer, in-app, pull-based path next to the existing push path.

---

## 3. Design principles (prioritized, interruption lens)

### P1 — Pull over push: the dashboard is a place you *go*, notifications are a thing that *come to you*. Bias hard toward pull. (Confidence: high)
The cheapest interruption is the one the user initiates at a moment of their choosing. The 23-minute recovery cost applies to *involuntary* switches; a glance the user decides to take at a natural breakpoint is far cheaper ([Gloria Mark summary](https://pomogolo.com/blog/23-minute-refocus-cost); [Orchestrating Attention](https://arxiv.org/pdf/2602.07865) on deferring to breakpoints). The home page should hold state silently and well, so the user can *choose* to look. Every piece of information that can wait for a glance should NOT also fire a push notification. The default for new dashboard signals is: appear quietly on the home page, do not toast.

### P2 — Batch, don't stream. Coalesce bursts into one summary. (Confidence: high)
Duke research found batching notifications (scheduled intervals) beat both real-time delivery and total silence; complete silence created anxiety about missing things ([brain.fm digital minimalism](https://www.brain.fm/blog/digital-minimalism-adhd-phone-focus)). iOS ships exactly this as the Scheduled Notification Summary ([Apple Community thread](https://discussions.apple.com/thread/255168448)). For ClaudeTerminal: when three sessions finish within a short window, the user should see "3 sessions finished" once, not three separate toasts. The current code has no such coalescing window (`hook-router.ts:21-26` only dedups per-tab), so this is a concrete gap the dashboard layer should close. (See feature F4.)

### P3 — Distinguish "needs you" from "finished," and only the first earns a push. (Confidence: high)
The app currently toasts on BOTH `idle` ("finished working") and `input` ("needs your input") (`hook-router.ts:125-141`). From an interruption-cost view these are not equal. `requires_response` is *blocking* (the session is stalled until the user acts); `idle` is *informational* (work is done, nothing is waiting). Align delivery to urgency: "determine how much attention it needs and when, then align the delivery form with the urgency of the message" ([Microsoft Design, How to Design Interruptions](https://medium.com/microsoft-design/how-to-design-interruptions-b93c0c667e6f)). Recommendation: `requires_response` may push (it's a true block); `idle` should default to a quiet dashboard update, not an OS toast, unless the user opts in. This is a behavior change to existing code and should be flagged as such. (Confidence: high that the distinction matters; medium on the exact default, since some users *want* the "done" ping.)

### P4 — Protect hyperfocus: a Focus state that mutes non-blocking signals. (Confidence: high)
Interruptions during hyperfocus are uniquely disruptive, and the fear of them is itself a load ([ADHD Goals](https://adhdgoals.co/adhd/adhd-hyperfocus-and-fear-of-interruption/); [ADDA on hyperfocus](https://add.org/adhd-hyperfocus/)). A "focus mode" for ADHD should mean *less*: fewer alerts, fewer animations, larger/calmer targets ([Welcoming Web](https://welcomingweb.com/learn/designing-for-neurodiversity-adhd-ux); [Din Studio](https://din-studio.com/ui-ux-for-adhd-designing-interfaces-that-actually-help-students/)). Implementation hook: when the *active* tab is `working`, the user is likely in flow with that session; the dashboard and notifications for *other* tabs should soften automatically (defer toasts to a breakpoint, hold updates in place). A manual Focus toggle should also exist for when the user is heads-down outside the app. The active-tab guard already in `hook-router.ts:60,127,136` (only notify when `!isActive`) is the seed of this; extend it from "is this tab active" to "is the user in a protected state."

### P5 — Defer to natural breakpoints, not the clock. (Confidence: medium-high)
"Verification should be scheduled based on cognitive availability... defer to natural breakpoints during hyperfocus" ([Orchestrating Attention, arXiv](https://arxiv.org/pdf/2602.07865)). The app *has* breakpoint signals already: a session going `idle` or `requires_response`, or the user switching tabs, are natural seams. When a non-urgent dashboard signal arrives mid-flow, hold it and release it at the next breakpoint (the user returns to the dashboard, or the active session itself pauses) rather than interrupting. This is the difference between a notification queue that drains *to the user's rhythm* and one that drains to a timer.

### P6 — Make re-entry cheap: when the user does switch to the dashboard, show the landing pad. (Confidence: high)
Attention residue means a returning user is at ~60-70% capacity ([Goals & Progress](https://goalsandprogress.com/attention-residue-management/)). The dashboard's job at the moment of return is to *reconstitute context for them*, not make them rebuild it. The hero should already say the one next thing; the "needs you" rows should already be sorted to the top. This is where this lane meets E2 (working memory) and E4 (overwhelm): the home page is the external working memory that survives the switch, so the switch costs less. A returning glance should answer "what was I doing / what needs me" in under a second, with zero scrolling.

### P7 — Self-interruption is the real enemy; reduce the *reasons* to leave the current task. (Confidence: high)
~44% of interruptions are self-generated ([Speakwise](https://speakwiseapp.com/blog/workplace-interruption-statistics)), and open tabs/apps invite the wandering switch ([Healthline ADHD task switching](https://www.healthline.com/health/adhd/task-switching-adhd); [ADHD Homestead](https://adhdhomestead.net/manage-adhd-work-screen-time/)). The dashboard reduces self-interruption by being the **single place** the user checks instead of fanning out across terminals, a browser, a todo app, and a chat. "Tasks and calendar in a single view reduce context switching between tools" ([Akiflow](https://akiflow.com/blog/task-switching-strategies-adhd)). Every external tool the dashboard absorbs into one glance is one fewer reason to leave. This is the strategic case for the dashboard existing at all, from this lens.

### P8 — Update in place; never re-flow the layout on a poll cycle. (Confidence: high)
An always-on board that re-sorts or relocates zones every refresh is a self-inflicted interruption: motion captures attention involuntarily, and "avoid auto-expansion... interruptions kill flow" ([Welcoming Web](https://welcomingweb.com/learn/designing-for-neurodiversity-adhd-ux); [Sterling, ADHD-friendly UI checklist](https://medium.com/@sterling.benjamin/adhd-friendly-ui-checklistadhd-accessibility-building-uis-that-work-for-everyone-including-me-61dbde186a42)). When session N flips to `requires_response`, its row should brighten *in place*; it should not animate to the top and shove everything down. Reordering, if any, should happen only on explicit user action (a "sort by needs-you" click) or at a breakpoint, never silently mid-glance. (Overlaps E4 P6/P7; included here because the *interruption* cost of motion is the specific harm.)

### P9 — Escalating, not repeating. A "needs you" item that's ignored should get *more visible*, not *louder more often*. (Confidence: medium-high)
The user's model uses escalating reminders. The interruption-safe form of escalation is **increasing salience on the surface the user already chooses to look at**, not increasing push frequency. A `requires_response` session that's been waiting 30 seconds is a quiet row; one waiting 10 minutes is a brighter row, maybe nudged toward the hero; one waiting an hour might earn a single (batched) push. Escalation rides the dashboard's visual hierarchy and time-since-flagged, with a push as the *last* resort, not the first. This keeps escalation from becoming a notification storm.

### P10 — One re-entry action per item, pre-decided. (Confidence: high)
A returning, residue-laden brain should not have to *choose* how to act on an item. The user's rule is "1 recommendation not 10 options." Each dashboard item should have ONE obvious primary action (jump to the session that needs you / start the one thing in a new pre-loaded Claude session), with copy/snooze/open-elsewhere as visibly subordinate secondary actions. The existing notification-click already does exactly one thing (show + focus + switch, `hook-router.ts:29-47`); the dashboard should preserve that single-gesture re-entry and not turn it into a decision tree.

---

## 4. Anti-patterns (what would actively harm this user, interruption lens)

| # | Anti-pattern | Why it harms (interruption / ADHD lens) | Confidence |
|---|---|---|---|
| A1 | **Toast per event.** Firing an OS notification for every session that finishes or every state flip. | Each push is a 23-min recovery risk and ~60-70% working-memory hit; bursts compound. Streaming beats batching only in the marketer's interest, not the user's ([brain.fm](https://www.brain.fm/blog/digital-minimalism-adhd-phone-focus)). Current code toasts on both idle and input (`hook-router.ts:125-141`); scaling that across many sessions is an interruption engine. | high |
| A2 | **Auto-refresh that re-flows layout / auto-scrolls / auto-expands.** Zones move, lists re-sort, panels open on poll. | Involuntary motion captures attention; "interruptions kill flow" ([Welcoming Web](https://welcomingweb.com/learn/designing-for-neurodiversity-adhd-ux)). Self-inflicted switching on a timer. | high |
| A3 | **Badge-count anxiety.** A growing unread/needs-you number with no way to make it stop nagging. | Open loops and rising counters create background dread and pull the user out of flow to "clear" them. Counts should be glanceable state, not a debt meter. | medium-high |
| A4 | **Notifications with no quiet hours / no focus respect.** Pinging during heads-down work or off-hours. | Hyperfocus interruption is uniquely costly and feared ([ADHD Goals](https://adhdgoals.co/adhd/adhd-hyperfocus-and-fear-of-interruption/)). No quiet-hours/focus-aware gate exists in `hook-router.ts` today. | high |
| A5 | **Sound + motion + color all at once on a single event.** Multi-channel alerting for routine state. | Sensory overload; reserve multi-channel for the rare true-blocking case. Match channel to urgency ([Microsoft Design](https://medium.com/microsoft-design/how-to-design-interruptions-b93c0c667e6f)). | high |
| A6 | **Forcing the user to triage a notification *center* (a second inbox).** A list of past alerts to read/dismiss. | Creates a new completion loop to chase. The dashboard *is* the state; don't add an alert log that must be cleared. | medium |
| A7 | **Notification that loses context on click.** Jumps to a tab but the user can't tell what was happening. | Residue means the returning brain needs context handed to it; a bare jump forces a costly mental rebuild. The current click does switch correctly (`hook-router.ts:36-45`) but the dashboard should add a one-line "what it's waiting on." | medium |
| A8 | **Modal interruptions / confirmation dialogs for routine dashboard actions.** | Modals are the loudest possible interruption and break flow for low-stakes actions ([Sterling](https://medium.com/@sterling.benjamin/adhd-friendly-ui-checklistadhd-accessibility-building-uis-that-work-for-everyone-including-me-61dbde186a42)). | high |
| A9 | **Escalation by repetition** (same toast every N minutes until acted on). | Trains the user to dismiss reflexively; nag fatigue. Escalate by *salience on the surface*, not frequency of push (P9). | medium-high |
| A10 | **Per-event "completion" celebration animations** (confetti on every finish). | Motion + interruption masquerading as reward; competes with E5's calibrated dopamine. Keep completion feedback in-place and quiet. | medium |

---

## 5. Specific feature implications for the command-center home page

These are concrete, prioritized features from the interruption lens. They assume E4's calm/one-hero layout and slot into the existing hook/status architecture.

### F1 — A "Needs You" lane that is the *only* thing allowed to be loud (priority: high, effort: low-med)
Drive it straight off `requires_response`. The renderer already computes these counts (`App.tsx:88-98`) and has the `text-attention` color (`StatusBar.tsx:15`). On the home page, sessions in `requires_response` get one quiet, bright row each at the top of the secondary session strip; everything else (working, idle) stays muted. This is the dashboard's single sanctioned attention magnet, and it is *pull* (it sits there) not *push* (it doesn't toast by default beyond the existing input notification).
- Re-entry action: click = the existing show+focus+switch path (`hook-router.ts:29-47`), exposed as an in-app button so the user triggers it at their chosen moment.
- Each row carries a one-line "waiting on: <last prompt/permission>" so re-entry is cheap (counters A7).

### F2 — Focus / Do-Not-Disturb state that gates the existing notifications (priority: high, effort: med)
Add an app-level Focus state with two triggers: (a) manual toggle, (b) automatic when the active tab is `working` (user is in flow with a session). While Focus is on, route `idle` notifications to the dashboard only (no toast) and hold non-blocking dashboard changes for release at a breakpoint (P5). `requires_response` may still push, or be configurable. Implementation: extend the `!isActive` guard in `hook-router.ts:127,136` into a `shouldNotify(tabId, kind)` predicate that also checks Focus state and quiet hours. Keep destructive/blocking events able to break through; mute the rest.
- This is the single highest-leverage interruption feature, because it governs the system that already exists.

### F3 — Split "finished" from "needs you" in notification policy (priority: high, effort: low)
Today both `idle` and `input` toast (`hook-router.ts:125-141`). Make `requires_response` the only default OS push; make `idle` ("finished") a quiet dashboard update (a session row moves to an "idle / done" group) with an *opt-in* toast for users who want the done-ping. Match channel to urgency (P3). Flag this clearly as a behavior change to existing shipped code; some users rely on the "done" toast, so it should be a setting, not a silent removal.

### F4 — Notification coalescing window (priority: high, effort: med)
Add a short coalescing buffer (e.g. a few seconds) in the main process so a burst becomes one summary toast: "3 sessions finished, 1 needs you" rather than four separate pings (P2; [brain.fm](https://www.brain.fm/blog/digital-minimalism-adhd-phone-focus)). The current `pendingNotifications` Set (`hook-router.ts:21-26`) is per-tab dedup only; this adds cross-tab batching. Clicking the summary opens the dashboard's Needs-You lane (the calm triage surface), not a specific tab, so the user picks.

### F5 — Update-in-place rendering with no auto-reflow (priority: high, effort: low-med)
The always-on board must mutate rows in place: a session flipping to `requires_response` brightens where it sits; counts tick without the layout jumping (P8, A2). Reordering ("float needs-you to top") happens only on explicit user click or at a breakpoint, never silently mid-glance. Concretely: keep stable React keys per tab/session id, animate only color/opacity (cheap, non-displacing), never height/position on poll.

### F6 — Escalation by salience, on a clock the user can see (priority: medium, effort: med)
For `requires_response` rows, track time-since-flagged and escalate *visually*: quiet -> brighter -> nudged toward the hero, with a single batched push only after a long ignore window (P9, A9). No repeating toasts. This renders the user's "escalating reminders" model in an interruption-safe form and ties to E3 (time-blindness) for the "this has been waiting N minutes" cue.

### F7 — One pre-loaded re-entry, one gesture (priority: high, effort: low-med)
Each home-page item offers ONE primary action (P10): "needs-you" rows -> jump to that session; `@now` hero -> open a NEW Claude session pre-loaded with the query for that one thing (batching related items so one gesture opens the whole batch, per the user's "pay initiation cost once"). Copy-text and open-PowerShell are present but visibly secondary. Single-gesture re-entry mirrors the existing notification click, which already does exactly one thing.

### F8 — No notification center; the dashboard is the state (priority: medium, effort: zero/avoid)
Explicitly decide *not* to build an alert inbox/log (A6). Past events that were missed are reflected in current state (a session is still `requires_response` or now `idle`); there is nothing to "clear." This avoids manufacturing a second completion loop, which is one of the user's named avoidance areas (completing-the-loop).

### F9 — Quiet hours (priority: medium, effort: low)
A simple time window during which no OS push fires and the dashboard holds non-blocking changes for the next session (A4). Pairs with F2's Focus state; both feed the same `shouldNotify` predicate.

---

## 6. How this maps onto the user's documented ADHD model

- **J.O.T. "Just One Thing."** The interruption lens reinforces it: the hero is the one thing, and the *whole point* of P1/P6/P7 is to remove every competing reason to switch away from it. The dashboard protects the one thing by being the only place the user has to look.
- **Escalating reminders.** Rendered as F6: escalate *salience on the surface*, not push frequency. The user's instinct (escalation) is right; the interruption-safe implementation is visual, not auditory/repetitive.
- **Pattern-interrupts to break oscillation.** Subtle tension with this lane: a pattern-interrupt is a *deliberate* interruption to break a stuck loop. Reconcile by making pattern-interrupts *user-pulled or breakpoint-timed*, never a surprise push. The Focus/breakpoint machinery (F2, P5) is exactly what lets a pattern-interrupt land at a seam instead of mid-flow.
- **Avoidance areas (financial, documentation, delegation, completing-the-loop, health, marketing).** These are the items most likely to sit in `requires_response`/`@now` and get ignored, which is what F6's escalation-by-salience is for. F8 (no second inbox) directly serves "completing-the-loop": the design refuses to create new loops to close.
- **"1 recommendation not 10 options; batch so initiation cost is paid once."** F7 (one pre-decided re-entry action; batched session launch) is this rule applied to the moment of re-entry, when a residue-laden brain can least afford a decision tree.

---

## 7. Open questions / decisions for the planning phase

1. **Does the user want the "Claude finished" ping at all?** F3 proposes demoting it to a quiet dashboard update by default. Some users depend on it. This needs a setting and a default decision; it is a change to currently-shipped behavior (`hook-router.ts:125-131`).
2. **Auto-Focus trigger.** Should Focus engage automatically when the active tab is `working` (P4/F2), or only manually? Auto is more protective but can surprise; manual is predictable. Likely: auto with a visible, dismissible indicator.
3. **Coalescing window length** (F4). Too short and bursts still leak through; too long and `requires_response` feels laggy. Needs a value, probably a few seconds, ideally configurable.
4. **Escalation thresholds** (F6). When does a waiting `requires_response` go quiet -> bright -> hero -> push? Needs concrete timings, which intersect E3 (time-blindness) and the user's tolerance.
5. **Remote/web parity.** The app has a remote web client (`docs/remote-access.md`). Do Focus state and notification policy apply to remote sessions, and where does the coalescing live (main process, so it covers both)? Per AGENTS.md remote-parity rules, any new notification/focus channel must be explicitly decided for remote.
6. **Interaction with OS-level Focus/DND.** Should app Focus respect Windows Focus Assist, or be independent? Double-muting vs. conflicting states.

---

## 8. Sources

- Gloria Mark / UC Irvine, 23-minute refocus cost (summary): https://pomogolo.com/blog/23-minute-refocus-cost
- Original 23:15 figure discussion: https://blog.oberien.de/2023/11/05/23-minutes-15-seconds.html
- Workplace interruption statistics (44% self-generated): https://speakwiseapp.com/blog/workplace-interruption-statistics
- Switch cost of multitasking (Wake Forest): https://news.wfu.edu/2024/04/16/the-switch-cost-of-multitasking/
- Context switching fuels ADHD-like symptoms: https://www.favormentalhealthservices.com/post/the-cost-of-context-switching-how-bouncing-between-tasks-fuels-adhd-like-symptoms
- Attention residue (Leroy's research): https://goalsandprogress.com/attention-residue-management/
- Attention residue (Brain Labs): https://medium.com/brain-labs/attention-residue-the-invisible-cost-of-switching-tasks-9762b14a14e2
- Selective impairment of attentional set shifting in adults with ADHD (PMC6230251): https://pmc.ncbi.nlm.nih.gov/articles/PMC6230251/
- Digital minimalism for ADHD / batching beats silence (brain.fm): https://www.brain.fm/blog/digital-minimalism-adhd-phone-focus
- Hyperfocus and fear of interruption (ADHD Goals): https://adhdgoals.co/adhd/adhd-hyperfocus-and-fear-of-interruption/
- ADHD hyperfocus (ADDA): https://add.org/adhd-hyperfocus/
- How to Design Interruptions (Microsoft Design): https://medium.com/microsoft-design/how-to-design-interruptions-b93c0c667e6f
- Orchestrating Attention / defer to breakpoints (arXiv 2602.07865): https://arxiv.org/pdf/2602.07865
- Designing for ADHD in UX / focus mode = less (Welcoming Web): https://welcomingweb.com/learn/designing-for-neurodiversity-adhd-ux
- ADHD-friendly UI checklist (Sterling, Medium): https://medium.com/@sterling.benjamin/adhd-friendly-ui-checklistadhd-accessibility-building-uis-that-work-for-everyone-including-me-61dbde186a42
- UI/UX for ADHD / focus mode toggle (Din Studio): https://din-studio.com/ui-ux-for-adhd-designing-interfaces-that-actually-help-students/
- Scheduled Notification Summary (Apple Community): https://discussions.apple.com/thread/255168448
- ADHD task switching tips (Healthline): https://www.healthline.com/health/adhd/task-switching-adhd
- ADHD and screen-time management (ADHD Homestead): https://adhdhomestead.net/manage-adhd-work-screen-time/
- Task switching strategies, single view reduces switching (Akiflow): https://akiflow.com/blog/task-switching-strategies-adhd
- Object permanence / externalize to stay in-sight (Simply Psychology): https://www.simplypsychology.org/object-permanence-and-adhd.html

### Codebase references
- `src/shared/types.ts:1` — `TabStatus` union
- `src/hooks/on-notification.js:5` — Notification hook -> `tab:status:input`
- `src/hooks/on-stop.js:5`, `src/hooks/on-tool-use.js:5` — idle / working hooks
- `src/main/hook-router.ts:21-26,50-52` — `pendingNotifications` dedup (no batching)
- `src/main/hook-router.ts:29-47` — notification click: show+focus+project switch+tab switch
- `src/main/hook-router.ts:60,121-141` — status updates + idle/input toasts, `!isActive` guard
- `src/renderer/App.tsx:88-98` — per-project `requires_response` aggregation
- `src/renderer/components/StatusBar.tsx:9,15` — `requires_response` label + `text-attention` color
- `src/renderer/components/TabIndicator.tsx:25` — `requires_response` indicator
- `src/renderer/components/ProjectSidebar.tsx:8,55` — needs-you count surfaced in sidebar
