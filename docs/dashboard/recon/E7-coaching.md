# Lane E7 — ADHD Coaching & Accountability (body-doubling, gentle nudges against avoidance)

Recon for the always-on in-app home page inside the ClaudeTerminal Electron app (React 19 + TS + Vite + node-pty + shadcn/Tailwind). One lens only: the home page as a **coach and accountability partner**, not just a status board. How does the page act like a body double, hold the user accountable to the work he avoids, and nudge without shaming?

The home page surfaces todos / problems / in-progress items as PRIMARY content, live sessions as a SECONDARY glanceable strip, and each item offers three actions: open a PowerShell tab, copy text, or open a NEW Claude session pre-loaded with a query.

Read-only investigation. Code claims cite `file:line`; web claims cite URLs. Confidence marked per claim. No PHI; practice items kept general (a date + label, never a name).

This lane deliberately does NOT re-cover overwhelm/progressive-disclosure (that is Lane E4) or dopamine/reward/momentum (Lane E5). It owns the **relationship** between the dashboard and the user: presence, accountability, the check-in ritual, and the gentle push against the six documented avoidance areas.

---

## 1. The user model this lane is built on (no online lookup of personal data)

From the user's documented ADHD operating model (`user_adhd_profile.md`, supplied in brief):

- **J.O.T. — "Just One Thing."** Surface ONE actionable item at a time. Labels `@now` (this week) / `@next` (this month) / `@later` (backlog). (`user_adhd_profile.md:9-13`)
- **Escalating reminders work:** 8am, 1pm, 5pm, 8:30pm. A nudge that grows on a clock, not a static banner. (`user_adhd_profile.md:12`)
- **Pattern-interrupts:** when he is stuck oscillating on a decision, directness breaks the loop. (`user_adhd_profile.md:13`)
- **Six documented avoidance areas, push on these proactively:** (1) financial confrontation (BLOC follow-ups, disputes, vendor negotiation), (2) system documentation / SOPs, (3) delegation to Danielle (office manager), (4) completing the loop ("look up X / follow up on Y" tasks that die), (5) personal health appointments, (6) marketing homework from vendors. (`user_adhd_profile.md:15-22`)
- **The working rules:** "Don't present 10 options. Present 1 recommendation with reasoning." "Don't ask 'what would you like to do?' — say 'here's what I'd do, want me to proceed?'" "When he's stuck, be direct. Break the paralysis." "Batch related tasks so the initiation cost is paid once." "If something has been sitting undone, flag it directly rather than letting it keep sliding." (`user_adhd_profile.md:24-29`)

The single load-bearing observation for THIS lane: the six avoidance areas carry **no intrinsic interest and no natural deadline**, so they rot quietly. The dashboard cannot make them interesting. What it CAN do is supply the one thing the user reliably responds to and cannot generate for himself in the moment: **external accountability**. That is the whole job of this lane.

---

## 2. Why accountability is the right lens for this user (the mechanism)

**External accountability compensates for an impaired internal regulator.** "The core principle of external accountability is creating systems and relationships that provide oversight, encouragement, and consequences from outside sources. This external support compensates for the internal regulatory systems that may be impaired in individuals with ADHD." ([slothzero](https://www.slothzero.com/blog/external-accountability-a-key-to-overcoming-adhd)). This is exactly the user's documented pattern: he does the work when someone is expecting it, and lets it slide when no one is. Confidence: high.

**Solo systems fail ADHD adults at a high rate; external presence is the fix.** Reported figure: "Solo habit tracking has a 72% failure rate for ADHD adults," and "having a partner, coach, or peer observer can increase dopamine activity and engagement in people with ADHD." ([Deepwrk](https://www.deepwrk.io/accountability-partner-app), citing a 2021 study). Treat the specific percentage as indicative rather than precise (secondary citation), but the direction is well-attested. Confidence: medium on the number, high on the direction.

**Body doubling = external executive function.** "Body doubling is a form of external executive functioning... essentially it's external executive functioning, like having an administrative assistant follow you around all day." ([ADDA](https://add.org/the-body-double/)). The presence "holds a person accountable to the task, so they are less likely to avoid or procrastinate." For a user whose failure mode is "work left 90% done, the last 10% stalls invisibly" (per Lane G), an always-on screen that behaves like a quiet co-worker is a body double he never has to schedule. Confidence: high for the mechanism.

**The soft social contract is the active ingredient.** Body doubling "creates a soft social contract: 'We're both working right now.'" The distracted person "feels responsible to and for the body double... *I can't waste this gift of time*." ([ADDA](https://add.org/the-body-double/)). The body double works through **passive presence**, not intervention: "Their job is to not engage with you." ([ADDA](https://add.org/the-body-double/)). This is critical for the design — the dashboard does not need to chatter to be a body double; it needs to be *present and aware*. Confidence: high.

**Avoidance is protective resistance, not laziness — so the coaching tone matters.** "What looks like avoidance is often your brain trying to protect you through resistance... perfectionism, decision fatigue, fear of failure, low stimulation, or burnout. Because procrastination is rooted in stress, not character, it can be changed." ([adhdcoachnearyou](https://adhdcoachnearyou.com/adhd-friendly-hacks-to-stop-procrastinating/)). And the hard constraint: "harsh self-criticism worsens stress and procrastination, while self-compassion improves motivation and task engagement." ([Hapday](https://hapday.app/en/mindfulness-coaching-for-tackling-adhd-induced-procrastination/)). Shame is not a motivator here; it is fuel for the avoidance. Confidence: high.

**Importance and deadlines do not move the ADHD brain until crisis.** "Everything is 'now' or 'not now.'... cortisol floods and activates ADHD brains... when the deadline fast approaches crisis levels." ([ADDitude](https://www.additudemag.com/avoidance-procrastination-how-to-stop-procrastinating-procrastivity-adhd/)). So an accountability surface cannot rely on "this is important" framing for the avoidance items. It has to manufacture a *social* now: someone (the dashboard, standing in for a partner) is expecting this from you, today. Confidence: high.

**Implementation intentions ("when X, then Y") close the intention-action gap.** "Implementation plans, also called 'If/When X-Then Y plans'... a specific action or obstacle is tied with a specific setting, such that the setting itself provides a cue for the desired action." A meta-analysis across 29 studies (1,636 participants) found "a large-sized effect on goal attainment" in people with mental-health problems. ([Liliana Turecki](https://www.lilianaturecki.com/post/implementation-intention-plans-a-productivity-hack-for-adhd-brains), [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4500900/)). The takeaway for an always-on app: bind the nudge to a recurring cue the user already has (the moment he opens the app, the start of the workday) rather than relying on willpower. Confidence: high.

---

## 3. Design PRINCIPLES (prioritized for the coaching/accountability lens)

Ordered by impact. P1 are the core of the lens; lower numbers are refinements. Each is distinct from E4 (overwhelm) and E5 (reward).

### P1 — The dashboard IS the body double: present, aware, non-chattering (Confidence: high)
The always-on home page should behave like a quiet co-worker in the room: it knows what you said you'd do, it is visibly "here," and it does not interrupt. The active ingredient is the **soft social contract** ("we're both working right now"), and the body double's job is "to not engage with you" beyond holding the goal ([ADDA](https://add.org/the-body-double/)). Design consequence: the page's accountability comes from *steady, ambient presence and awareness of the user's stated intent*, not from pop-ups or pestering. An always-on screen that shows "here's what you committed to today" and quietly tracks it is the digital body double. This is the single highest-leverage idea in the lane.

### P2 — Open and close the day with a check-in ritual (Confidence: high)
The proven accountability structure is a session with a beginning and an end: "share your goals for the session... at the end, you check in and celebrate your progress... so the session has a beginning and an end rather than just being on a call" ([Focusmate](https://www.focusmate.com/)). ADHD planning guidance independently says to review three+ times a day — morning to plan, midday, evening to review and set up tomorrow ([CHADD](https://chadd.org/for-adults/time-management-planner/)). Map this to the user's escalating-reminder clock (8am / 1pm / 5pm / 8:30pm, `user_adhd_profile.md:12`): the home page should have a **morning "what's the one thing today" intake** and an **evening "what closed / what carries to tomorrow" review**. The ritual is what converts a status board into an accountability partner. It is also the natural place to fire the implementation-intention cue (P5).

### P3 — Declare intent at the start; the dashboard holds you to it (Confidence: high)
The body-double pattern's power comes from declaring the goal up front so the partner "can hold you accountable for what you need or want to achieve" ([ADDA](https://add.org/the-body-double/)). The home page should let the user state (or accept) the day's one thing, then *reflect that commitment back* for the rest of the day. The accountability is not "you have 40 tasks"; it is "you told me this morning you'd do this one thing — still on it?" A commitment the user made to himself, surfaced by a present third party, is far stickier than an item on a list. Confidence: high.

### P4 — Gentle, specific, shame-free nudges; escalate salience, never guilt (Confidence: high)
Because self-criticism worsens avoidance ([Hapday](https://hapday.app/en/mindfulness-coaching-for-tackling-adhd-induced-procrastination/)) and the user has documented self-esteem sensitivity, every nudge must read as a supportive partner, not a scold. "Naming your negative experience in the moment — without judging yourself — is an important step toward your ability to change it" ([adhdcoachnearyou](https://adhdcoachnearyou.com/adhd-friendly-hacks-to-stop-procrastinating/)). So a nudge **names the avoided thing plainly and kindly** ("the BLOC follow-up has been waiting 6 days — want to knock out just the first email?") rather than stamping it OVERDUE. Escalation across the 8am/1pm/5pm/8:30pm clock raises *salience and specificity*, not volume of blame. Confidence: high. (Note: E5 also reaches "escalate salience not guilt" from the reward angle; this lane adds the coaching *copy* and the avoidance-area targeting.)

### P5 — Bind nudges to cues, not willpower (implementation intentions) (Confidence: high)
Stop relying on the user to remember; let the environment carry the load ([scienceworkshealth](https://www.scienceworkshealth.com/post/external-systems-for-adhd-at-work)). Every recurring accountability prompt should be tied to a cue the user already hits: app launch, the start of the workday, the evening review. The framing in the UI should itself be an if/when-then plan: "When you finish the current session, then do the 15-minute documentation step." This converts a vague intention into a triggered action and is the most evidence-backed single technique in the lane ([PMC meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC4500900/)). Confidence: high.

### P6 — Make the first step tiny, and let "Ask Claude" pay the initiation cost (Confidence: high)
"The Number One solution for avoidance procrastination is breaking down a task into tinier, manageable pieces... If you can't break a task into small enough steps that you can do, then the pieces aren't tiny enough." ([ADDitude](https://www.additudemag.com/avoidance-procrastination-how-to-stop-procrastinating-procrastivity-adhd/)). The accountability nudge should always offer a *next physical step measured in minutes*, never the whole task. The "open a NEW Claude session pre-loaded with a query" action is the killer move here: for a dreaded blank-page avoidance task (write an SOP, draft the vendor email), "Ask Claude to draft the first version" turns a feared *create* task into a tolerable *review* task, and it pays the entire activation-energy cost in one click. This is body-doubling literalized: the dashboard hands the work to a present partner (Claude) instead of leaving the user alone with it. Confidence: high.

### P7 — Treat "Claude is waiting on you" as a real accountability item (Confidence: high)
The live-session strip is secondary in general, but a session in `requires_response` (`src/shared/types.ts:1`) is a *completing-the-loop* item — avoidance area #4 — made literal: an agent is blocked, waiting on the user, and that loop will silently die if he wanders off. The dashboard should treat a stale `requires_response` session the same way a body double would: a quiet, specific "the cad-portal session has been waiting 12 minutes for your call" prompt that pulls toward the center. This is the chime he used to listen for, turned into gentle accountability. Confidence: high. (E4 covers *where* this sits visually; this lane covers *that it counts as accountability* and how the prompt should read.)

### P8 — One recommendation, stated as a coach would state it (Confidence: high)
The user's rule "1 recommendation not 10 options" is also a coaching stance: a good ADHD coach doesn't hand you a menu when you're stuck, they make the call. "App designs should minimize choice at the interface level rather than present comprehensive option lists" ([Relational Psych](https://www.relationalpsych.group/articles/adhd-and-decision-paralysis-why-small-choices-can-feel-overwhelming)). The hero copy should read "Here's what I'd start with: [one thing]. Want to go?" not "Pick a task." The voice is a confident partner, direct and a little warm, matching his documented communication style (direct, light snark when procrastinating, `feedback_communication_style.md`). Confidence: high.

### P9 — Pattern-interrupt the oscillation, the way a coach would (Confidence: medium)
When the user is visibly stuck (keeps opening the home page without acting, or the same avoidance item keeps getting skipped), a coach changes the frame: shrinks the ask to a binary ("this one, 15 minutes — yes / not now") or just decides for him. "When he's stuck, be direct. Break the paralysis, don't add more choices." (`user_adhd_profile.md:27`). The interrupt is the dashboard taking the decision off his plate, not adding another prompt. Confidence: medium (the trigger heuristic needs tuning; the principle is solid).

### P10 — Quiet streak of *showing up*, never a punishing chain (Confidence: medium)
Accountability research likes consistent touchpoints, and a soft "you've done your morning check-in 4 days running" reinforces the *ritual*. But hard streaks backfire for ADHD via loss aversion (covered in depth by E5). The coaching-safe version rewards **attendance** (you showed up to the check-in) rather than performance (you cleared everything), and it forgives gaps silently. Reward the relationship, not the output. Confidence: medium. (Defer the exact streak mechanics to E5; this lane only asserts: if any streak exists, make it about the check-in ritual, with grace built in.)

---

## 4. ANTI-PATTERNS (explicit — do not build these)

| # | Anti-pattern | Why it harms (coaching/accountability lens) | Confidence |
|---|---|---|---|
| C1 | **Nagging / chatty nudges that interrupt.** A "coach" that pops up constantly. | The body double works through *passive presence*; "their job is to not engage with you" ([ADDA](https://add.org/the-body-double/)). A chatty dashboard breaks flow and trains the user to dismiss it. Presence, not pestering. | high |
| C2 | **Guilt / shame framing on avoided items** ("OVERDUE", "you keep skipping this", "FAILED"). | Self-criticism *worsens* avoidance and engagement ([Hapday](https://hapday.app/en/mindfulness-coaching-for-tackling-adhd-induced-procrastination/)); on exactly the items already avoided, shame guarantees more avoidance. Name kindly, escalate salience not blame (P4). | high |
| C3 | **Identical repeated reminders.** Same copy, same look at 8/1/5/8:30. | ADHD habituates fast; an unchanging nudge becomes invisible. The escalation must change *form and specificity*, not just repeat. ([Sprout](https://www.sproutapp.tech/blog/adhd-reminder-app), [AFFiNE](https://affine.pro/blog/setting-effective-reminders-adhd)). | high |
| C4 | **Accountability that demands explanation.** "Why didn't you do this?" / forcing a reason before dismissing. | A coach for ADHD lowers friction; demanding justification adds friction and shame, and the user will just stop opening the app. Let "not now" be a one-tap, judgment-free move. | high |
| C5 | **Surfacing the whole avoidance backlog "so he confronts it."** All six areas, every stale item, at once. | This is the wall; confrontation-by-volume produces freeze, not action ([forget.work](https://forget.work/blog/from-overwhelm-to-action-combatting-decision-paralysis-adhd)). Accountability means *one* gentle, specific push at a time. Findable, not all visible. | high |
| C6 | **Whole-task nudges with no tiny first step.** "Write the SOP" with no 15-minute on-ramp. | Avoidance is triggered by perceived bigness ([ADDitude](https://www.additudemag.com/avoidance-procrastination-how-to-stop-procrastinating-procrastivity-adhd/)); a nudge without a tiny next step just re-presents the dread. Always offer the minute-sized first move (P6). | high |
| C7 | **A "menu of equal options" when he's stuck.** Surfacing the oscillation moment with 5 choices. | Re-imposes the paralysis a coach is supposed to break; contradicts "1 recommendation not 10" (`user_adhd_profile.md:25`). Decide for him, or offer a binary. | high |
| C8 | **Fake / performative accountability** (a cheerful "Great job!" the user didn't earn, or a "you're on track!" when he isn't). | Erodes trust in the partner; a body double's value is honest presence. Empty praise reads as a chatbot, which the user explicitly dislikes (`feedback_communication_style.md`, no "Great! Here's your dashboard"). | high |
| C9 | **Letting completing-the-loop items (incl. `requires_response`) die silently.** | This is avoidance area #4 and the project's whole reason to exist (the invisible 90%-done stall, per Lane G). Silence here is the failure being solved, not a calm default. A waiting agent must get *one* quiet, specific nudge. | high |
| C10 | **Hard streak / "don't break the chain" on doing the work.** | Loss aversion produces shame spirals for ADHD ([nerdsip](https://nerdsip.com/blog/gamification-gone-wrong-when-streaks-become-the-point)); reward showing up, forgive gaps (P10). | medium |
| C11 | **Treating accountability as surveillance the user can't see into.** Hidden scoring of his behavior. | Body doubling is a *consensual* soft contract; covert tracking that surfaces as judgment breaks trust. Keep the accountability legible and user-controllable. | medium |

---

## 5. SPECIFIC feature implications for THIS home page

Concrete and buildable on the existing stack. Status vocabulary already exists: `TabStatus = 'new' | 'working' | 'idle' | 'requires_response' | 'shell'` (`src/shared/types.ts:1`); the home page is a new top zone the app currently lacks (existing surfaces are `TabBar`, `Terminal`, `StatusBar.tsx`, `ProjectSidebar.tsx` — `src/renderer/components/`). Hook scripts that already emit session lifecycle events (`src/hooks/on-notification.js`, `on-stop.js`, `on-session-start.js`) are the feed for the "is Claude waiting" accountability signal.

### F1 — A morning "commit to one thing" intake (P2, P3, P5)
On the first app open of the workday (cue-bound, P5), the home page opens with a single, calm intake: "Morning. Here's what I'd start with today: [the picked one thing]. Lock it in?" with a one-tap accept and a quiet "different one" re-roll. Accepting *declares intent* (P3); the dashboard then holds that commitment in view all day. This is the body double's "share your goals at the start of the session" ([Focusmate](https://www.focusmate.com/)) rendered as the day's open. Implementation note: tie the trigger to first-open-after-Nam, not a fixed alarm, so it never interrupts mid-flow.

### F2 — A persistent "you committed to this" reflection of the day's one thing (P1, P3)
Once locked in, the hero card stops being a generic todo and becomes a *commitment mirror*: "Your one thing today → [item]." This is the soft social contract made visual ([ADDA](https://add.org/the-body-double/)) — the page is the quiet co-worker who remembers what you said. Subtle, ambient, no animation; it just stays present (P1, and respects E4's calm-periphery rules).

### F3 — Avoidance-aware gentle nudge, one at a time, named kindly (P4, P6)
The dashboard knows the six avoidance categories (`user_adhd_profile.md:15-22`). When an item in one of these categories ages past a threshold, the page can *choose* to surface it as the gentle push of the moment — but ONE, with a tiny first step and supportive copy. Example copy register: "The vendor follow-up's been sitting 6 days. Want me to open a Claude session and draft the first email so you just have to send it?" Never "OVERDUE." The nudge offers the three actions with the tiny-step framing baked in (P6). Confidence: high on the pattern; depends on the todo source carrying *category + age* metadata, which is the load-bearing data gap (see open questions / handoff to data lane).

### F4 — The three actions, framed as a coach hands off work (P6, P8)
Each item's three required actions, ranked and worded as an accountability partner would:
- **Ask Claude (primary, the start gesture):** opens a NEW Claude session pre-loaded with a query about this item. For avoidance items, pre-load it as "draft the first version of X" so the dread becomes a review. This pays the initiation cost ([task-initiation research](https://saskadhd.com/adhd-task-initiation-evidence-based-strategies-that-actually-work/)). This reuses the app's existing tab/session-create path (confirm the exact IPC with the integration lane).
- **Open PowerShell tab (secondary):** spawns a PS7 shell at the item's `cwd` (`src/shared/types.ts:13`) for server actions he must run himself (e.g. the CADDC02 follow-ups). The app already supports shell tabs + `Ctrl+Shift+P` PowerShell (`AGENTS.md`).
- **Copy text (secondary):** copies the paste-ready command / the `blocked_on` note he forwards to Danielle (delegation, avoidance area #3) or a vendor. This directly serves two avoidance areas (delegation, financial confrontation) by making the dreaded message one tap from sent.

### F5 — "Claude is waiting on you" as a tracked, gently-escalating loop (P7, C9)
A session in `requires_response` (`src/shared/types.ts:1`, fed by `src/hooks/on-notification.js` / `on-stop.js`) that has been unanswered past a short threshold surfaces a single quiet line near the hero: "Your cad-portal session has been waiting ~10 min." Clicking jumps to that tab (reuse existing click-to-switch). This is completing-the-loop accountability (avoidance #4) and the digital version of the chime he used to listen for. Escalate specificity over time (10 min → 30 min → "still waiting since 9:14"), never volume or guilt (P4, C3). Confidence: high; verify with the hooks/status lane that `requires_response` fires reliably.

### F6 — An evening "close the day" review (P2, P10)
At the evening cue (~8:30pm per `user_adhd_profile.md:12`, but cue-bound and dismissible), the home page offers a short, optional review: "Done today: [the things that closed]. Carrying to tomorrow: [the one thing, if not done]." This gives the session an *end* ([Focusmate](https://www.focusmate.com/)), feeds the implementation-intention setup for tomorrow ("when you start tomorrow, then ..."), and rewards *showing up to the review*, not clearing everything (P10). It is also where the day's avoidance push can be honestly acknowledged without shame ("the documentation step is still open — want it teed up for the morning?").

### F7 — Optional "work alongside me" body-double mode (P1) (Confidence: medium)
A one-tap mode that makes the presence explicit: start a focus block on the current one-thing, the dashboard shows a calm "we're on this together, [time] in" presence indicator (no countdown-bomb, no spinner — calm per E4). At the end it does the body-double check-in: "How'd that go? Done / more time / switch." This is the literal Focusmate session structure ([Focusmate](https://www.focusmate.com/)) collapsed into the app, with Claude (in a pre-loaded session) as the partner doing parallel work. Confidence: medium — strong evidence the *pattern* works, but the exact UI needs prototyping and must not become a gimmick.

### F8 — Coaching copy voice, centralized and human (P4, P8, C8)
All accountability copy goes through one place and obeys the writing standard (no em dashes, no AI-slop, direct, light warmth — `CLAUDE.md`, `feedback_communication_style.md`). Buttons lead with the verb ("Start this", "Draft it with Claude", "Send it to Danielle"). Nudges name the thing plainly and offer the tiny step. No hollow praise (C8), no "Great! Here's your dashboard." The voice is a competent partner who has your back, occasionally dry when you're stalling.

### F9 — One-tap, judgment-free "not now" everywhere (C4)
Every nudge and the morning intake must be dismissible in one tap with no explanation demanded (C4). A dismissed item recedes quietly and may resurface later in a *different* form (C3), but the dashboard never asks "why." This keeps the user opening the app, which is the precondition for any accountability at all.

### F10 — Make accountability legible and controllable (C11, P10)
The user can see what the dashboard is tracking about him (which items it considers "avoided," what the check-in streak counts) and can turn the coaching layer down to pure status board. Consensual, visible accountability preserves the soft-contract trust; covert scoring breaks it.

---

## 6. How this lane interacts with E4 (overwhelm) and E5 (dopamine)

To avoid contradiction with the sibling lanes, the boundaries:

- **E4 owns calm / progressive disclosure / where things sit visually.** This lane's nudges and check-ins must obey E4's rules: no uninvited pop-ups that yank the eye, one hero, periphery stays quiet, predictable layout. The morning intake (F1) is the one sanctioned "center" moment, and it is cue-bound and dismissible, which satisfies E4's "user chooses when to engage."
- **E5 owns reward / momentum / streaks mechanics.** This lane defers the *reward implementation* to E5 and only adds the coaching framing: reward the *relationship and the showing-up*, keep it shame-free, no hard chains. Where E5 says "escalate salience not guilt," this lane supplies the avoidance-area targeting and the actual nudge copy.
- **The shared throughline all three lanes reach independently:** one thing at a time, decide for the user, never shame the avoided items. This lane's unique contribution is the *accountability relationship* — presence (body double), the check-in ritual (open/close the day), and the gentle, specific, cue-bound push against the six named avoidance areas.

---

## 7. Open questions / cross-lane handoffs

- **Todo source must carry category + age (load-bearing).** F3 (avoidance-aware nudges) needs each item tagged to one of the six avoidance categories AND an age/last-touched timestamp. The program-board `state.json` (per Lane G) already carries `age_color`, `last_touched`, `tags`, `blocked_on` — but its closed tag set is `needs-CADDC02 / needs-your-decision / time-sensitive`, NOT the six personal avoidance areas. Either the avoidance categories get mapped onto existing tags, or a separate lightweight todo source supplies them. This is a real data gap for the coaching features; flag to the data/integration lane. Confidence: this is a genuine gap.
- **`requires_response` reliability (F5/F7).** The "Claude is waiting" accountability loop assumes `requires_response` fires accurately from the hooks (`src/hooks/on-notification.js`, `on-stop.js`). Confirm with the status/hooks lane before building escalation on it.
- **Cue-binding mechanism (F1/F6).** Tying the morning intake / evening review to "first open of the workday" and "evening" needs an app-level clock + last-open timestamp. Confirm where app-launch / session-start lifecycle is observable in the renderer (the hook `on-session-start.js` and main-process lifecycle in `index.ts` are candidates).
- **Pattern-interrupt trigger (P9).** What signal reliably means "he's oscillating"? Repeat home-page opens without action is a candidate but could misfire. Needs instrumentation before it drives UI.
- **Streak appetite (P10).** Does the user want *any* streak, even a soft show-up one, given the loss-aversion risk? Default to none or a gentle "checked in N days," and confirm. Defer mechanics to E5.
- **Telegram/Todoist as the off-app accountability arm.** When the user is away from the terminal (most of the day, per Lane G), the only reach is Telegram (phone) and Todoist (push). A genuine accountability partner follows up *when you're not at the desk*. Should an aged avoidance item escalate to a single batched Telegram nudge rather than waiting silently for the next app open? This bridges the in-app body double to real-world reach, but risks notification fatigue and overlaps the existing Telegram-batching rule. Flag to the integration lane; do not build a competing notifier. Confidence: medium that this is worth it; high that it must be gentle and batched if done.

---

## 8. Sources

ADHD body doubling (mechanism, soft social contract, passive presence):
- <https://add.org/the-body-double/>
- <https://www.focusmate.com/blog/adhd-body-double-productivity-accountability/>
- <https://www.getinflow.io/post/adhd-body-doubling>
- <https://hallowelltodaro.com/blog-raw-feed/what-is-body-doubling>
- <https://en.wikipedia.org/wiki/Body_doubling>

Virtual body doubling / session structure (declare goal, check in at end):
- <https://www.focusmate.com/>
- <https://www.focusmate.com/faq/>
- <https://flown.com/blog/adhd/best-body-doubling-apps>

External accountability / accountability partners (research + components):
- <https://www.slothzero.com/blog/external-accountability-a-key-to-overcoming-adhd>
- <https://www.deepwrk.io/accountability-partner-app>
- <https://www.deepwrk.io/blog/adhd-accountability-buddy>
- <https://www.getinflow.io/post/adhd-accountability-partners-executive-dysfunction>
- <https://blog.cohorty.app/adhd-and-group-accountability-why-silent-support-works/>
- <https://www.ericahurley.com/blog/e7psxx1qauf7dw7rmajpyrkky5hutx>

Gentle / shame-free coaching, avoidance as protective resistance:
- <https://adhdcoachnearyou.com/adhd-friendly-hacks-to-stop-procrastinating/>
- <https://hapday.app/en/mindfulness-coaching-for-tackling-adhd-induced-procrastination/>
- <https://add.org/adhd-procrastination/>
- <https://www.additudemag.com/avoidance-procrastination-how-to-stop-procrastinating-procrastivity-adhd/>
- <https://www.additudemag.com/how-to-stop-procrastinating-adhd-avoidant-thoughts/>

Implementation intentions / commitment / external systems:
- <https://www.lilianaturecki.com/post/implementation-intention-plans-a-productivity-hack-for-adhd-brains>
- <https://pmc.ncbi.nlm.nih.gov/articles/PMC4500900/>
- <https://apsard.org/managing-adhd-what-is-your-implementation-plan/>
- <https://www.scienceworkshealth.com/post/external-systems-for-adhd-at-work>

Daily check-in / morning + evening review ritual:
- <https://chadd.org/for-adults/time-management-planner/>
- <https://lifeskillsadvocate.com/blog/morning-routines-for-people-with-adhd/>
- <https://www.routinery.app/blog/adhd-evening-routine>

Reminder fatigue / escalation (shared with E5):
- <https://www.sproutapp.tech/blog/adhd-reminder-app>
- <https://affine.pro/blog/setting-effective-reminders-adhd>

Decision paralysis / one-recommendation (shared with E4):
- <https://www.relationalpsych.group/articles/adhd-and-decision-paralysis-why-small-choices-can-feel-overwhelming>
- <https://forget.work/blog/from-overwhelm-to-action-combatting-decision-paralysis-adhd>

Streak / loss-aversion anti-pattern (defer mechanics to E5):
- <https://nerdsip.com/blog/gamification-gone-wrong-when-streaks-become-the-point>

Code / project context (file:line):
- `src/shared/types.ts:1` (`TabStatus`, incl. `requires_response`), `:13` (`Tab.cwd`)
- `src/renderer/components/` (`StatusBar.tsx`, `ProjectSidebar.tsx`, `TabBar.tsx` — existing surfaces; home page is new)
- `src/hooks/on-notification.js`, `on-stop.js`, `on-session-start.js` (session lifecycle / "needs you" feed)
- `AGENTS.md` (stack, tab/shell types, status flow, PowerShell `Ctrl+Shift+P`)

User model (memory, not online):
- `~/.claude/.../memory/user_adhd_profile.md:9-29` (J.O.T., escalating reminders, six avoidance areas, working rules)
- `~/.claude/.../memory/feedback_communication_style.md` (direct, light snark, no chatbot artifacts)
