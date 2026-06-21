# Lane E4 — Overwhelm & Visual-Noise Reduction / Progressive Disclosure

Recon for the always-on in-app home page inside the ClaudeTerminal Electron app. One lens: keep the page calm. Surface the user's todos/problems/in-progress items as the hero, keep the all-sessions list secondary and glanceable, and make every item a one-click action (new PS tab / copy text / new pre-loaded Claude session).

This lane is written against the user's documented ADHD model (J.O.T. "Just One Thing", escalating reminders, pattern-interrupts, named avoidance areas, "1 recommendation not 10 options, batch related work"). Web sources are cited inline; codebase claims cite `file:line`. Confidence is marked per claim.

---

## 1. The core tension this lane exists to resolve

A command center is, by default, a wall of competing signals: every session, every status, every todo, every alert all shouting at equal volume. For an ADHD brain that is the worst possible starting state. "A long list of tasks with no clear starting point is paralyzing — when everything feels equally important (or equally unimportant), the ADHD brain freezes and does nothing" ([forget.work](https://forget.work/blog/from-overwhelm-to-action-combatting-decision-paralysis-adhd)). Decision paralysis hits when the number of choices exceeds the cognitive capacity to compare them ([Relational Psych](https://www.relationalpsych.group/articles/adhd-and-decision-paralysis-why-small-choices-can-feel-overwhelming)).

So the home page has exactly one job from this lens: **collapse the wall into one obvious next action, and push everything else to the periphery without losing it.** That is the J.O.T. methodology rendered as UI. The user's own model already says it: "Don't present 10 options. Present 1 recommendation with reasoning... Batch related tasks so the initiation cost is paid once" (`user_adhd_profile.md:25-28`).

The all-sessions list is the single biggest overwhelm risk here, because in a *tabbed session manager* the sessions are the thing the app is "about" — the gravitational pull is to make them the hero. This lane's strongest recommendation is to resist that pull.

---

## 2. Design principles (prioritized)

### P1 — One hero, and the hero is a TODO, not the session grid (Confidence: high)
The page must lead with a single primary focal point: the one thing to do next. "Pick a single hero message + primary CTA, and make sure everything else looks and feels secondary" ([Eleken](https://www.eleken.co/blog-posts/visual-hierarchy-in-ux)). Limit big/loud elements to a maximum of two so they actually stand out ([Eleken](https://www.eleken.co/blog-posts/visual-hierarchy-in-ux)). Users spend ~80% of viewing time above the fold, so the one-thing card has to win that real estate ([Eleken](https://www.eleken.co/blog-posts/visual-hierarchy-in-ux)).

This maps cleanly onto J.O.T.: the hero is the current `@now` item. Everything below it is "and here's the rest, when you're ready," visually quieter.

### P2 — De-emphasize the secondary, don't amplify the primary (Confidence: high)
The way you make the todo win is *not* by making it bigger and louder; it's by turning the volume down on everything else. "Start by reducing visual weight on secondary elements instead of adding more weight to primary ones. When you lower the volume on everything else, your main message gets louder without changing a thing about it" ([Eleken](https://www.eleken.co/blog-posts/visual-hierarchy-in-ux)). For an ADHD brain this matters twice over, because added weight = added stimulus = more noise to filter. The sessions list should be deliberately muted: smaller type, lower contrast, denser, no color unless a session needs the user.

### P3 — Progressive disclosure: lead with the summary, reveal detail on demand (Confidence: high)
"Presenting everything at once is overwhelming, so lead with only the most important information and let users choose to reveal more detail as needed" ([Welcoming Web](https://welcomingweb.com/learn/designing-for-neurodiversity-adhd-ux)). "Surface only essential information initially; reveal details on demand... prevents dashboard overload where six panels, badges, and alerts compete for attention at once" ([B. Sterling, Medium](https://medium.com/@sterling.benjamin/adhd-friendly-ui-checklistadhd-accessibility-building-uis-that-work-for-everyone-including-me-61dbde186a42)). The default home view is the *floor* of information: one todo, a short list, a quiet session strip. Counts, full backlogs, logs, and per-session detail live one click deeper.

This is also how you reconcile J.O.T.'s three buckets. `@now` (this week) is visible by default; `@next` (this month) and `@later` (backlog) are *collapsed* behind a single "show more / X more later" affordance, not laid out as three equal columns. Three equal columns would re-create the wall.

### P4 — Calm by default; the periphery informs without burdening (Confidence: high)
Calm-technology framing fits this app almost perfectly. "A calm technology moves easily from the periphery of attention to the center and back, with the periphery informing without overburdening." Status that's useful-but-rarely-urgent should be a glanceable cue — color or a small state in a quiet corner — like Synced / Syncing / Needs attention, *not* a modal or a loud alert ([Principles of Calm Technology, Amber Case](https://www.caseorganic.com/post/principles-of-calm-technology); [calmtech.com](https://calmtech.com/)). The all-sessions list IS the periphery. It should sit quietly until a session flips to "needs you," at which point that one row brightens. The user's escalating-reminder model is the same idea on a clock: quiet until it earns attention.

### P5 — Whitespace is the primary noise-reduction tool (Confidence: high)
"Whitespace isn't wasted space — it's a clarity multiplier... dense layouts force users to parse multiple elements simultaneously, causing mental fatigue" ([B. Sterling](https://medium.com/@sterling.benjamin/adhd-friendly-ui-checklistadhd-accessibility-building-uis-that-work-for-everyone-including-me-61dbde186a42)). "Whitespace gives elements room to breathe" ([Welcoming Web](https://welcomingweb.com/learn/designing-for-neurodiversity-adhd-ux)). Generous spacing around the hero card is what makes it read as "the one thing" without needing a giant font or a bright color.

### P6 — No uninvited interruptions; the user chooses when to engage (Confidence: high)
"Avoid autoplay, auto-expand, and unsolicited modal popups... unexpected interactions disrupt focus and create sensory overload" ([B. Sterling](https://medium.com/@sterling.benjamin/...)). "Avoid autoplay, auto-expansion, or uninvited pop-ups; interruptions kill flow" ([Welcoming Web](https://welcomingweb.com/learn/designing-for-neurodiversity-adhd-ux)). For an always-on home page this is critical: the page refreshes its own state (sessions come and go, todos complete), and naive auto-reordering or auto-expanding is itself an interruption. State should update in place, quietly, without yanking the user's eye.

### P7 — Predictable, stable layout (Confidence: high)
"Keep navigation consistent... predictability preserves mental models and prevents disorientation" ([B. Sterling](https://medium.com/@sterling.benjamin/...)). The hero is always in the same spot; the session strip is always in the same spot. An always-on dashboard that re-shuffles its own zones every poll cycle is hostile to a brain that's already spending budget on filtering. Reordering within a list is fine; relocating the zones is not.

### P8 — One recommendation, not a menu of equal options (Confidence: high)
"App designs should minimize choice at the interface level rather than present comprehensive option lists — a single clear call to action... is preferable to overwhelming users with multiple pathways" ([search synthesis, decision-paralysis sources](https://www.relationalpsych.group/articles/adhd-and-decision-paralysis-why-small-choices-can-feel-overwhelming)). The user's model is identical: "1 recommendation not 10 options" (`user_adhd_profile.md:25`). The hero card should have ONE obvious primary action (a big button), with secondary actions (copy, snooze, open elsewhere) present but visibly subordinate.

### P9 — Immediate completion feedback to feed momentum (Confidence: medium)
ADHD motivation leans on small immediate rewards over delayed ones; "the simple act of ticking off completed tasks can provide a small dopamine hit," and visible completion markers build momentum ([Private ADHD UK](https://www.privateadhd.com/blog/dopamine-completing-tasks); [Mutra](https://mutra.app/resources/guides/adhd-dopamine-motivation-explained/)). When the user finishes the hero todo, the page should respond visibly and immediately, then promote the next `@now` item into the hero slot. This is a *small* reward, not confetti everywhere (see anti-patterns) — calm tech and dopamine feedback have to be balanced.

### P10 — Batch related items so initiation cost is paid once (Confidence: medium)
The user's model: "Batch related tasks so the initiation cost is paid once" (`user_adhd_profile.md:28`). When several todos share a context (same repo, same project), group them so one "start" gesture opens the work for all of them, rather than forcing a fresh decision per item. This is progressive disclosure applied to *action*: surface the batch as one move.

---

## 3. Anti-patterns (what would actively harm this user)

| # | Anti-pattern | Why it harms (ADHD/overwhelm lens) | Confidence |
|---|---|---|---|
| A1 | **Session grid as the hero.** Big card-grid of every live session front and center. | Re-creates the wall; everything equal-weight = freeze ([forget.work](https://forget.work/blog/from-overwhelm-to-action-combatting-decision-paralysis-adhd)). It also makes the app about its mechanism (sessions) not the user's goal (the next thing to do). | high |
| A2 | **Three equal J.O.T. columns** (@now / @next / @later side by side). | Three full lists = three walls. Defeats "just one thing." Collapse @next/@later behind disclosure. | high |
| A3 | **Badge soup / count everywhere.** Numeric badges on every zone, tab, and item. | "Six panels, badges, and alerts compete for attention at once" is the named failure mode ([B. Sterling](https://medium.com/@sterling.benjamin/...)). | high |
| A4 | **Color used for decoration, not signal.** Every project/session in its own bright color all the time. | When everything is colored, color stops meaning "look here." Reserve saturated color for "needs you." Calm default = muted ([calm tech](https://www.caseorganic.com/post/principles-of-calm-technology)). Note the app already ships 8 project hues (`shared/types.ts:42-51`) — fine as quiet identity tags, dangerous if used at full saturation across the board. | high |
| A5 | **Auto-expanding / auto-popping detail** on hover or on poll. | Uninvited interruption; kills flow ([Welcoming Web](https://welcomingweb.com/...)). | high |
| A6 | **Live auto-reordering that moves the user's eye** every refresh tick. | Always-on + constant reshuffle = the page never sits still; predictability lost (P7). | high |
| A7 | **Animated/looping motion in the periphery** (spinners, pulsing, marquee status). | "ADHD brains already run noisy — our UIs don't need to"; motion must be calm and toggleable ([B. Sterling](https://medium.com/@sterling.benjamin/...)). A spinner per session is peripheral motion overload. | high |
| A8 | **A "menu of equal buttons" on each item** (5 actions all the same size). | Re-introduces choice paralysis at the item level (P8). One clear primary, rest subordinate. | high |
| A9 | **Notification fatigue from identical repeated nudges.** | Same tone/same time → the brain filters it out; ADHD habituates faster ([AFFiNE](https://affine.pro/blog/setting-effective-reminders-adhd); [Sprout](https://www.sproutapp.tech/blog/adhd-reminder-app)). If the dashboard ever nudges, escalate distinctly, don't repeat. | high |
| A10 | **Over-celebration on completion** (confetti, sounds, big modals). | Conflicts with calm-by-default (P4/P6); the reward should be a small in-place acknowledgment, not a sensory event. | medium |
| A11 | **Surfacing the whole backlog by default** "so nothing is hidden." | The fear of hiding things is what produces the wall. Progressive disclosure means *findable*, not *visible* (P3). | high |
| A12 | **Empty state that reads as failure** ("No sessions. Nothing here."). | A blank command center is demotivating; the empty/done state should read as momentum ("you're clear — here's your next thing" or "inbox zero"). | medium |

---

## 4. Specific feature implications for THIS home page

Grounded in the existing app. The renderer already has `App.tsx` (`src/renderer/App.tsx:1-60`), a `TabStatus` union `'new' | 'working' | 'idle' | 'requires_response' | 'shell'` (`src/shared/types.ts:1`), a `Tab` model with `projectId`/`status`/`cwd`/`sessionId` (`src/shared/types.ts:7-21`), and 8 `PROJECT_COLORS` hues (`src/shared/types.ts:42-51`). The home page is a new top zone the app currently lacks (existing surfaces are `TabBar`, `Terminal`, `StatusBar`, `ProjectSidebar`).

### F1 — Zone layout: hero on top, periphery below (P1, P7)
Three stacked zones, fixed positions:
1. **THE ONE THING** (hero) — the single `@now` item, large, with one primary action.
2. **What's next (collapsed)** — a short scannable todo list (the rest of `@now`), with `@next`/`@later` behind a single "+ N more" disclosure.
3. **Sessions (peripheral strip)** — all live sessions, muted, glanceable, *not* the hero.

The hero must be the only visually loud thing. Whitespace, not size, separates the zones (P5).

### F2 — The all-sessions list as calm periphery (P2, P4, A1)
Render sessions as a compact, low-contrast single-line-per-session strip/list, not a card grid. Default state of every session row: quiet (muted text, neutral background). Use the existing `status` field to drive a single glanceable cue per row:
- `working` / `idle` → quiet, no color.
- `requires_response` → this is the only row that earns a brighter cue (a small dot/left-border in one accent color). This is the Synced/Syncing/**Needs attention** pattern from calm tech ([Case](https://www.caseorganic.com/post/principles-of-calm-technology)). `requires_response` already exists in the type system (`src/shared/types.ts:1`), so "needs you" is a glance, not a hunt.

No spinners per row (A7). State updates in place (A5/A6). Project hue (`src/shared/types.ts:42-51`) may appear as a thin, desaturated identity tag, never a full-saturation fill (A4).

### F3 — "Needs you" rolls UP into the hero region when it's real (P4, A1)
When a session flips to `requires_response`, that is a genuine "center of attention" moment per calm tech (periphery → center → back). Surface it as a quiet promotion: a single line directly under the hero ("1 session needs you → [Open]"), not a popup (A5), not a sound. When resolved, it recedes back to the strip. This keeps the sessions list secondary in the *common* case while still letting a real interruption reach the center *once*, deliberately.

### F4 — Per-item one-click actions, one primary + subordinate rest (P8, A8)
Each todo/problem/in-progress item exposes the three required actions, but ranked:
- **Primary (one obvious button):** "Open a new Claude session pre-loaded with [this query]" — this is the start gesture, the thing that pays the initiation cost.
- **Secondary (icon/quiet):** "New PowerShell tab here" (uses `cwd`, `src/shared/types.ts:13`) and "Copy text."
The app already creates tabs and shell sessions, so all three actions are wiring to existing tab-creation paths from a new surface, not new infrastructure (high confidence the plumbing exists; the integration lane should confirm the exact tab-create API).

### F5 — Progressive disclosure of the J.O.T. buckets (P3, A2, A11)
Default home shows `@now` only. `@next` and `@later` are a single collapsed control ("12 more — show"). Counts are allowed *here* (one count, on the disclosure control), because one count is a summary, not badge soup (A3). Backlog is findable, not visible (A11).

### F6 — Surface avoidance areas as gentle, named nudges (medium) (P9, A9)
The user has documented avoidance buckets (financial confrontation, system docs, delegation, completing-the-loop, personal health, marketing homework — `user_adhd_profile.md:15-22`) and the model says "if something has been sitting undone, flag it directly" (`user_adhd_profile.md:29`). A todo that has aged past a threshold in one of these categories can be the thing the dashboard *chooses* to promote to the hero (a pattern-interrupt). Implementation note: the nudge must change form as it escalates, not repeat identically, or it habituates ([AFFiNE](https://affine.pro/blog/setting-effective-reminders-adhd); [Sprout](https://www.sproutapp.tech/blog/adhd-reminder-app)). Keep it in-app and quiet (calm tech) rather than a barrage. Confidence medium because it depends on a todo source that has category + age metadata, which the recon could not confirm exists yet.

### F7 — Completion feedback + auto-promote next (P9, A10)
Completing the hero todo gives a small, immediate, in-place acknowledgment (the row settles/checks), then the next `@now` item slides into the hero slot. No confetti, no sound by default (A10). This is the dopamine-momentum loop kept inside calm-tech bounds ([Private ADHD UK](https://www.privateadhd.com/blog/dopamine-completing-tasks)).

### F8 — A "Focus mode" toggle (P4, P6)
Offer a one-tap focus mode that drops the page to *only* the hero card (hides the next-list and the session strip). "Enable a focus mode toggle with less color, fewer visual distractions, larger targets, and reduced animations" ([Din Studio synthesis](https://din-studio.com/ui-ux-for-adhd-designing-interfaces-that-actually-help-students/) / general WebSearch synthesis). This is the ultimate progressive-disclosure escape hatch for an overwhelmed moment: collapse the whole command center to one thing.

### F9 — Empty/done state reads as momentum (P9, A12)
When there are no `@now` items, show a calm "you're clear" state, optionally with the single oldest backlog item offered as "want to pull one forward?" — not a blank panel that reads as the app being broken or the user being behind.

### F10 — Density and motion are user-controllable (P6)
"Allow users to control animations and density of information" (WebSearch synthesis; [Welcoming Web](https://welcomingweb.com/learn/designing-for-neurodiversity-adhd-ux)). Respect `prefers-reduced-motion`; keep any transitions short and calm. The session strip refresh should never animate movement that pulls the eye (A6/A7).

---

## 5. Cross-lane handoffs / open questions

- **Todo data source + schema is the load-bearing unknown.** F5/F6/F7 assume todos carry a J.O.T. label (@now/@next/@later), a category (to map to avoidance buckets), and an age/timestamp. The recon did not find a todo store in the dashboard repo; this is likely a different lane (data/integration). If the schema lacks category+age, the pattern-interrupt features (F6) degrade to "show oldest" rather than "push on avoidance areas."
- **Tab-create API surface for F4.** The three click actions reuse existing tab/session creation. Confirm the exact renderer→main IPC call (an IPC doc exists at `docs/ipc.md`) so the home page calls the same path the `TabBar` does, rather than a parallel one.
- **`requires_response` emission.** F2/F3 lean on `requires_response` being set reliably by the hook system (`src/hooks/on-notification.js`, `on-stop.js`). Worth confirming with the status/hooks lane that "needs you" fires accurately, since it's the single signal that justifies pulling a session toward the center.
- **Where the hero "next thing" decision lives.** Choosing which item is THE one thing (newest `@now`? oldest avoidance item past threshold? user-pinned?) is a product/logic decision another lane should own; this lane only asserts that *exactly one* is promoted at a time.

---

## Sources

- [Decision paralysis / overwhelm — forget.work](https://forget.work/blog/from-overwhelm-to-action-combatting-decision-paralysis-adhd)
- [ADHD and decision paralysis — Relational Psych](https://www.relationalpsych.group/articles/adhd-and-decision-paralysis-why-small-choices-can-feel-overwhelming)
- [ADHD-friendly UI checklist — Benjamin Sterling, Medium](https://medium.com/@sterling.benjamin/adhd-friendly-ui-checklistadhd-accessibility-building-uis-that-work-for-everyone-including-me-61dbde186a42)
- [Designing for neurodiversity / ADHD UX — Welcoming Web](https://welcomingweb.com/learn/designing-for-neurodiversity-adhd-ux)
- [Visual hierarchy in UX — Eleken](https://www.eleken.co/blog-posts/visual-hierarchy-in-ux)
- [Principles of Calm Technology — Amber Case](https://www.caseorganic.com/post/principles-of-calm-technology)
- [calmtech.com](https://calmtech.com/)
- [Calm technology — Wikipedia](https://en.wikipedia.org/wiki/Calm_technology)
- [Setting effective ADHD reminders — AFFiNE](https://affine.pro/blog/setting-effective-reminders-adhd)
- [ADHD reminder app: one notification is never enough — Sprout](https://www.sproutapp.tech/blog/adhd-reminder-app)
- [Dopamine and completing tasks — Private ADHD UK](https://www.privateadhd.com/blog/dopamine-completing-tasks)
- [ADHD and dopamine / motivation — Mutra](https://mutra.app/resources/guides/adhd-dopamine-motivation-explained/)
- [UI/UX for ADHD — Din Studio](https://din-studio.com/ui-ux-for-adhd-designing-interfaces-that-actually-help-students/)

Codebase: `src/renderer/App.tsx:1-60`, `src/shared/types.ts:1`, `:7-21`, `:42-51`; hooks `src/hooks/on-notification.js`, `on-stop.js`; `docs/ipc.md`.
User model: `~/.claude/.../memory/user_adhd_profile.md:9-29`.
