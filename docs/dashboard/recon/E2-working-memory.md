# Recon E2 — Working-Memory Externalization & Open-Loop Capture

Lane: ADHD design research, single lens. The question this lane answers: how should the
ClaudeTerminal in-app home page **offload what the user is holding in their head**? Not "organize
tasks well" in the abstract, but specifically: reduce the working-memory tax, close open loops, and
make capture cheap enough that nothing gets dropped.

Scope: read-only investigation. Web claims cite URLs; codebase claims cite `file:line`. Confidence
marked per claim. Personal ADHD-model details below come from the user's documented profile (J.O.T.,
avoidance areas, the one-recommendation rule) and are NOT web-sourced.

---

## 1. The axioms of this lane

Working deductively from first principles. What must be true for the home page to actually offload
working memory?

1. **An ADHD working-memory store is unreliable as a control source.** Internal cues are weak; the
   thing that drives behavior is an *external cue visible at the moment of performance*. This is the
   whole reason the externalization exists. (high)
2. **An uncaptured thought costs energy every second it stays uncaptured.** The Zeigarnik effect:
   the brain runs a background process per open loop, "constantly checking whether it needs
   attention." Dozens of loops compound into decision fatigue, ambient anxiety, lost focus. (high)
3. **Capture must be near-free or it won't happen.** If capture forces a decision (which project?
   what due date? what priority?), the user only captures when a thought feels "important enough,"
   and most loops never get captured at all. The thought is lost in ~2 seconds. (high)
4. **Out of sight is out of mind.** ADHD "object permanence": a task not currently visible
   effectively stops existing. An *always-on* surface is therefore not a nicety; it is the
   mechanism. (high)
5. **Externalization has a cost too.** Offloading reduces internal encoding and can breed
   dependence. The design must not pretend that's free; it must earn trust (reliable surfacing) to
   justify the user handing over their loops. (medium)

Every design principle below traces to one of these five.

---

## 2. What the research says (lens: offloading + open loops)

### 2.1 Cognitive offloading is the core mechanism, and it genuinely works

Cognitive offloading is "delegating part of a cognitive task to an external element to reduce mental
load." For executive-function differences specifically, externalizing information into physical/visible
form is *the* highest-leverage move, because "internal information is a weak source of control for an
ADHD brain, while external cues visible at the moment of performance are far stronger."
([scienceworkshealth.com](https://www.scienceworkshealth.com/post/external-systems-for-adhd-at-work),
[ot4adhd.com](https://ot4adhd.com/2022/09/05/working-memory-the-key-to-unlocking-potential-in-learners-with-adhd/)).
Writing things down measurably improves memory-task performance and lowers mental fatigue
([clothandpaper.com](https://www.clothandpaper.com/blogs/news/adhd-brain-hack-cognitive-offloading)).
Confidence: high.

### 2.2 Open loops are the thing being offloaded — and they drain "psychic RAM"

In GTD terms an open loop is "anything that has your attention but hasn't been captured, clarified, or
resolved." David Allen's frame: open loops consume "psychic RAM," mental energy that should be stored
externally ([thegoodspace.uk](https://thegoodspace.uk/open-loops-adhd/),
[super-productivity.com](https://super-productivity.com/blog/gtd-inbox-capture-system/)). The Zeigarnik
effect explains why: interrupted/unfinished tasks are remembered roughly twice as actively as completed
ones, so "unfinished tasks literally take up more space in our brains than completed ones." For ADHD
this is worse, because the urgent loop "is pulling attention away from the important"
([imbusybeingawesome.com](https://imbusybeingawesome.com/zeigarnik-effect-adhd-unfinished-tasks/)).
Confidence: high.

### 2.3 You can close a loop **without finishing the task**

The single most actionable finding for this home page. "You don't actually have to finish the task to
close the loop... The brain doesn't require completion. It just requires clarity about next steps and
containment." Concretely: writing a breadcrumb (next step + when you'll return) "reduces its cognitive
burden" even though nothing got done
([imbusybeingawesome.com](https://imbusybeingawesome.com/zeigarnik-effect-adhd-unfinished-tasks/),
[super-productivity.com](https://super-productivity.com/blog/gtd-inbox-capture-system/)). Implication:
the home page's job is not "make the user complete things." It is "let the user *park* things with a
visible next-step so the brain stops looping." Confidence: high.

### 2.4 Frictionless capture: speed beats structure, every time

Capture has to happen in seconds or the thought is gone. The hard rules from the sources:

- **Under ~2-5 seconds, zero required fields.** "The app should capture thoughts in under two seconds
  or the thought is lost forever." The capture interaction "should take under five seconds"
  ([wtcsb.org](https://www.wtcsb.org/adhd-apps-that-help-you-function-features-that-actually-matter/),
  [super-productivity.com](https://super-productivity.com/blog/gtd-inbox-capture-system/)).
- **No categorization at capture.** A good inbox lets you "drop a thought in ten seconds without titles
  or classification" ([saner.ai](https://www.saner.ai/blogs/best-adhd-task-management-apps)).
- **One inbox, not many.** Multiple capture points fragment the system and destroy trust
  ([super-productivity.com](https://super-productivity.com/blog/gtd-inbox-capture-system/)).
- **Every extra tap/decision is a barrier.** "Every additional tap or decision represents a potential
  barrier" to a brain that struggles with initiation
  ([wtcsb.org](https://www.wtcsb.org/adhd-apps-that-help-you-function-features-that-actually-matter/)).

Confidence: high.

### 2.5 Capture and processing are different jobs — never fuse them

"Capture should be frictionless and fast. The moment you start making decisions about an item, you've
added friction." Mixing capture with clarify "breaks both": hesitation rises, less gets captured, loops
persist longer ([super-productivity.com](https://super-productivity.com/blog/gtd-inbox-capture-system/)).
The inbox is a waystation; sorting/triage is a *separate, later* act. Confidence: high.

### 2.6 A capture system only helps if it is **trusted**

"Capture only works if you believe your system will surface the item at the right time." Trust requires
both reliable capture AND reliable resurfacing; otherwise the inbox becomes "a graveyard" and the brain
goes back to looping because it no longer believes the externalization
([super-productivity.com](https://super-productivity.com/blog/gtd-inbox-capture-system/)). This is the
hinge: if the home page captures but never resurfaces, it is worse than useless because the user paid
the offload cost and still has to remember. Confidence: high.

### 2.7 Object permanence: the surface must be **always-on and passive**

ADHD "object permanence" is shorthand for working-memory/attention barriers: tasks not currently in
view effectively cease to exist, which is why people "forget to pay bills... if they get distracted or
don't do them right away." The countermeasure is persistent passive visual cues: "a whiteboard...
where you can pin tasks... in plain sight," "leaving the bills on the counter... a constant, passive
reminder" ([simplypsychology.org](https://www.simplypsychology.org/object-permanence-and-adhd.html),
[rula.com](https://www.rula.com/blog/adhd-object-permanence/)). A home page that you have to *navigate
to* fails this; one that is the default landing surface passes. Confidence: high.

### 2.8 The downside: offloading erodes internal memory and breeds dependence

Honest counterweight. Offloading "reduces our reliance on memory recall leading to weaker memory
skills"; saving externally produces "decreased internal memory for both item-specific and relational
information" and "a cycle of dependence"
([medium.com/@afoster1](https://medium.com/@afoster1_29667/offloading-information-loading-risk-the-consequences-of-cognitive-offloading-60c217b41750),
[NCBI/PMC6838677](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6838677/),
[ScienceDirect S0010027719301076](https://www.sciencedirect.com/science/article/abs/pii/S0010027719301076)).
For an *ADHD* user this is the right trade (internal memory was the weak link anyway), but it raises the
bar on trust and on not over-stuffing the surface. Confidence: medium. The design consequence is not
"offload less" but "offload to a surface reliable enough to be worth the dependence."

### 2.9 The display itself must not re-create the overwhelm

Externalizing is pointless if the externalized pile is itself overwhelming. The UX literature is blunt:
a to-do list of 1000 items "with no idea where to start" is the failure mode, and "a dashboard that
shows only what matters today fixes that." Rules that recur: "one screen, one task"; progressive
disclosure ("show only necessary information up front and reveal more as needed"); cap simultaneous
choices ("not more than 7 choices"); one obvious primary call-to-action; stable/predictable layout;
limit animation and clutter
([din-studio.com](https://din-studio.com/ui-ux-for-adhd-designing-interfaces-that-actually-help-students/),
[producingparadise.com](https://www.producingparadise.com/articles/tools/how-to-create-an-adhd-friendly-task-dashboard-in-notion),
[welcomingweb.com](https://welcomingweb.com/learn/designing-for-neurodiversity-adhd-ux)). Confidence: high.

---

## 3. The user's documented ADHD model (not web-sourced)

These come from the user's profile and override generic advice where they conflict.

- **J.O.T. — "Just One Thing."** Surface ONE actionable item at a time. Horizon labels:
  `@now` (this week), `@next` (this month), `@later` (backlog). The home page hero is a single item,
  not a list.
- **Escalating reminders.** A parked item that goes stale should escalate, not sit silently.
- **Pattern-interrupts** to break decision oscillation. When the user is stuck looping, the surface
  should interrupt the oscillation, not present more options to weigh.
- **Documented avoidance areas:** financial confrontation, system documentation, delegation,
  completing-the-loop, personal health, marketing homework. The home page should *expect* items in
  these buckets to rot and treat that as signal, not noise.
- **"Offer 1 recommendation, not 10 options. Batch related work so the initiation cost is paid once."**
  This is the user's own statement of the choice-paralysis and initiation-cost findings above. It is
  the single strongest design constraint in this lane: the home page recommends a next action; it does
  not present a menu.

The convergence is striking: the user's personal model (J.O.T., one-recommendation, batch-to-pay-
initiation-once) is the *exact* prescription the independent ADHD UX literature arrives at (one-screen-
one-task, cap choices, reduce taps-to-action). Designing for the documented model and designing for the
research are the same design here.

---

## 4. Design principles (prioritized)

P1 is non-negotiable; lower numbers = higher leverage.

**P1 — Surface ONE recommended next action as the hero.** Not the todo list. One item, chosen by the
system, with its next-step text and one obvious action button. Everything else is secondary. Traces to:
J.O.T., one-recommendation rule, "one screen one task," choice-paralysis research (§2.9, §3).

**P2 — Capture is a single always-visible field, zero required fields, sub-2-second.** One keystroke
from anywhere lands a raw thought in one inbox. No project picker, no due date, no priority at capture.
Traces to §2.4, §2.5.

**P3 — The surface is the default landing view and is always-on.** Not behind a tab the user has to
remember to open. Passive, persistent, glanceable. Traces to §2.7 (object permanence).

**P4 — Let the user CLOSE a loop without finishing it.** A "park" action that captures a one-line
next-step + a return marker (`@now/@next/@later`) and removes the item from the hero. The point is to
quiet the loop, not to complete the task. Traces to §2.3, §3 horizon labels.

**P5 — Resurface reliably, or don't bother.** Parked/`@now` items must come back at the right time, and
stale items in avoidance buckets must escalate visibly. Trust is the whole game; an inbox that becomes a
graveyard is a net negative. Traces to §2.6, §2.8, escalating-reminders.

**P6 — Triage is a separate mode, off the hero.** Processing the inbox (assigning horizons, turning a
raw thought into a session query) happens in a deliberate, batched review surface, never inline during
capture or on the hero. Traces to §2.5; pairs with "batch related work."

**P7 — Sessions are SECONDARY and glanceable, but `requires_response` is a first-class open loop.** A
Claude session waiting on the user IS an open loop in the Zeigarnik sense. The existing
`requires_response` status (`src/shared/types.ts:1`) should feed the same "needs you" stream as todos,
not live only in the tab bar. The session *list* stays secondary; a session *needing a decision* can be
promoted into the primary stream. Traces to §2.2, §2.7.

**P8 — Three actions per item, no more.** Per the brief: jump to a new PowerShell tab, copy text, or
open a new Claude session pre-loaded with a query. Three is under the 7-choice ceiling and maps cleanly
to "do it in the shell / hold it / hand it to Claude." Keep it at three. Traces to §2.9.

**P9 — Visual restraint.** Stable layout, minimal color, one focal point, no auto-animation, contrast
that meets WCAG AA on the primary action. Traces to §2.9.

---

## 5. Anti-patterns (explicit "do NOT")

- **Do NOT make the home page a wall of every todo.** That re-creates the "1000 tasks, no idea where to
  start" overwhelm the externalization was supposed to fix (§2.9). The hero is ONE item.
- **Do NOT require any field at capture.** No mandatory project/due-date/priority/title. Each required
  field is a barrier that means the thought is lost (§2.4, §2.5).
- **Do NOT fuse capture and triage.** No "quick add" that pops a categorization modal. Capture lands
  raw; sorting is a separate batched act (§2.5).
- **Do NOT present 5-10 options where one recommendation belongs.** Directly violates the user's
  one-recommendation rule and the choice-paralysis research (§3, §2.9).
- **Do NOT hide the surface behind navigation.** If the user must remember to open it, object
  permanence guarantees they won't (§2.7).
- **Do NOT let parked/captured items silently rot.** An inbox that never resurfaces breaks trust and
  the brain reverts to looping (§2.6). Stale items in avoidance buckets must escalate (§3).
- **Do NOT make the live-session list the hero.** Sessions are status, not the primary work. Only a
  session that *needs a response* gets promoted into the primary stream (§2.7, brief).
- **Do NOT add carousels, auto-rotating panels, or animated counters.** Motion fragments ADHD
  attention and competes with the single focal point (§2.9).
- **Do NOT over-stuff to look "comprehensive."** More on screen = more internal-memory atrophy with no
  benefit, plus overwhelm. Show today; tuck the rest behind progressive disclosure (§2.8, §2.9).
- **Do NOT use ambiguous icon-only actions for the three item actions.** Label them; an ADHD user
  shouldn't have to decode what a glyph does at the moment of action (§2.9).

---

## 6. Specific feature implications for this home page

Concrete, tied to the existing codebase where possible.

1. **A "Needs You" primary stream (the hero region).** One item shown large at a time: the top
   `@now` todo OR a session in `requires_response`, whichever the ranking picks. Includes the
   next-step breadcrumb text and the three actions (P8). A small "and 4 more" affordance reveals the
   rest on demand (progressive disclosure), but the default is ONE.

2. **A persistent global capture bar.** Always visible on the home surface; a global shortcut focuses
   it from anywhere in the app. Enter = saved to one inbox, raw, no modal. This is the open-loop
   relief valve. Reuse the keybinding registry (`src/renderer/keybindings.ts` per AGENTS.md) and
   respect the "challenge new shortcuts against terminal meaning" rule (prefer `Ctrl+Shift+*`).

3. **A "Park" action on the hero item.** Captures a one-line next-step + assigns `@now/@next/@later`
   and clears the item from the hero so the loop is closed without completion (P4). This is distinct
   from "Done."

4. **Horizon buckets `@now / @next / @later` as the only categorization.** Three bins, applied during
   triage, never at capture. Matches the user's J.O.T. labels exactly (§3) and stays under the
   7-choice ceiling.

5. **Sessions list as a secondary glanceable strip.** Reuse the existing per-project status counts the
   app already computes (`idle / working / requires_response / total`, see `src/renderer/App.tsx:88`,
   `:90`, `:98`) rather than inventing a new aggregation. The strip is read-only status; clicking a
   session focuses its tab. Confidence on reuse: high (the counts already exist and already include
   `requires_response`).

6. **Promote `requires_response` into the primary stream.** The hook system already drives the
   `new -> working <-> idle / requires_response` state machine (`src/shared/types.ts:1`; status flow
   documented in `AGENTS.md` Common Patterns). A session entering `requires_response` is an open loop
   and should be eligible for the hero, not just a tab-bar dot.

7. **The three item actions map to the brief verbatim:** (a) jump to a new PowerShell tab — there's an
   existing `Ctrl+Shift+P` PowerShell path (`keybindings.ts`); (b) copy text to clipboard; (c) open a
   NEW Claude session pre-loaded with a query — the app already spawns Claude tabs via PTY
   (`src/main/pty-manager.ts`, `tab-manager.ts`), so "pre-loaded query" = create-tab + initial input.
   Confidence: medium that initial-input injection exists today; it may need a small addition. Worth a
   build-time check.

8. **Escalation for stale items.** Items past their horizon (especially in the documented avoidance
   buckets) move up the ranking and gain a visible "this has been waiting N days" marker. This is the
   user's escalating-reminders model and the trust-resurfacing requirement (§2.6, §3) made concrete.
   Keep escalation visual/passive on the always-on surface; tie loud/push escalation to the user's
   existing reminder channel rather than reinventing it.

9. **A batched triage/review mode, separate from the hero.** Where raw inbox items get a horizon and
   optionally become a session query. Batching honors "pay the initiation cost once" (§3). This is the
   *only* place categorization decisions happen.

10. **Ranking is the system's job, not the user's.** The user should never be asked "which of these 10
    is most important?" The home page picks the one next action. A transparent, simple ranking
    (requires_response > escalated-stale > top `@now`) keeps it predictable (§2.9 consistency) and
    honors the one-recommendation rule.

---

## 7. Open questions for the planning phase

1. Does the app today support injecting an initial prompt/query into a freshly spawned Claude tab, or
   is that net-new plumbing? (Feature implication #7.) Needs a code check of `pty-manager.ts` /
   `tab-manager.ts` / `ipc-handlers.ts`.
2. Where do todos/open loops *persist*? There's no existing todo store in the codebase; this lane
   assumes a new JSON store following the app's `fs.readFileSync/writeFileSync` pattern (AGENTS.md
   "No electron-store"). Who owns that store, and is it per-workspace or global?
3. Escalation delivery: passive on-surface only, or also push? The user has an existing reminder
   channel (Todoist per the workspace standard). Does the dashboard reach into it, or stay self-
   contained? This is a cross-lane decision (capture/notification lanes).
4. How does a parked item with a return marker actually resurface (time-based, on next launch, on
   review)? Resurfacing reliability is the trust hinge (§2.6); the mechanism needs to be specified,
   not left implicit.
5. Should raw captures auto-suggest a horizon (lightweight ML/heuristic) during triage, or stay fully
   manual? Auto-suggest lowers triage friction but risks wrong defaults that erode trust.

---

## 8. Confidence summary

- High: the offloading/open-loop/Zeigarnik mechanism, frictionless-capture rules, capture/process
  separation, trusted-resurfacing requirement, object-permanence/always-on requirement, one-thing/
  choice-cap UX rules, and the convergence with the user's documented model. Multiple independent
  sources plus the user profile all point the same way.
- Medium: the offloading-downside literature (real, but the ADHD trade-off makes it acceptable rather
  than disqualifying); and the codebase reuse claims for pre-loaded-query session spawn (the spawn
  path exists; initial-input injection needs verification).
- The single highest-leverage, lowest-risk move: **hero = one recommended next action + an always-on
  zero-friction capture bar.** It satisfies the most axioms at once and matches the user's own rule.

---

### Sources

- https://www.scienceworkshealth.com/post/external-systems-for-adhd-at-work
- https://ot4adhd.com/2022/09/05/working-memory-the-key-to-unlocking-potential-in-learners-with-adhd/
- https://www.clothandpaper.com/blogs/news/adhd-brain-hack-cognitive-offloading
- https://thegoodspace.uk/open-loops-adhd/
- https://super-productivity.com/blog/gtd-inbox-capture-system/
- https://imbusybeingawesome.com/zeigarnik-effect-adhd-unfinished-tasks/
- https://www.wtcsb.org/adhd-apps-that-help-you-function-features-that-actually-matter/
- https://www.saner.ai/blogs/best-adhd-task-management-apps
- https://medium.com/@afoster1_29667/offloading-information-loading-risk-the-consequences-of-cognitive-offloading-60c217b41750
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6838677/
- https://www.sciencedirect.com/science/article/abs/pii/S0010027719301076
- https://din-studio.com/ui-ux-for-adhd-designing-interfaces-that-actually-help-students/
- https://www.producingparadise.com/articles/tools/how-to-create-an-adhd-friendly-task-dashboard-in-notion
- https://welcomingweb.com/learn/designing-for-neurodiversity-adhd-ux
- https://www.simplypsychology.org/object-permanence-and-adhd.html
- https://www.rula.com/blog/adhd-object-permanence/
