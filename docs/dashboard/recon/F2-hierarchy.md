# Lane F2 — Information Hierarchy: Actionable Hero vs Glanceable Secondary Rail

Recon for the always-on in-app home page inside the ClaudeTerminal Electron app. This lens: **how do mature dashboards make ONE zone the hero and ANOTHER a glanceable secondary list?** Concretely, what size / position / density / contrast / progressive-disclosure moves turn "todos/problems/in-progress" into the primary content while the all-sessions list sits quietly as a peripheral rail (not the hero).

The target layout is unusual on purpose: a *tabbed session manager* whose home page does NOT lead with the sessions. The sessions are the thing the app is "about," so the gravitational pull is to make them the hero. This lane's job is to show, with concrete patterns and real examples, how to invert that pull. It pairs tightly with Lane E4 (overwhelm / progressive disclosure / calm-by-default) and Lane D (action routing); F2 is the layout-mechanics half of E4's principles.

Web sources cited inline. Codebase claims cite `file:line`. Confidence marked per claim.

---

## 1. The one rule the whole lane hangs on

A dashboard should establish **exactly three levels of dominance**, not more: a single **dominant** focal point, a **sub-dominant** layer with secondary emphasis, and a **subordinate** background layer with minimal visual weight ([Smashing Magazine, "Design Principles: Dominance, Focal Points And Hierarchy"](https://www.smashingmagazine.com/2015/02/design-principles-dominance-focal-points-hierarchy/); [IxDF, Visual Hierarchy](https://ixdf.org/literature/topics/visual-hierarchy)). Three is the ceiling because "people can perceive three levels of dominance," and adding a fourth "reduces the contrast between neighboring levels" so nothing reads as clearly primary ([Smashing](https://www.smashingmagazine.com/2015/02/design-principles-dominance-focal-points-hierarchy/)). (Confidence: high)

For this home page that maps to:

| Dominance level | What lives there | Treatment |
|---|---|---|
| **Dominant** | The current `@now` todo / problem / in-progress item (the J.O.T. "one thing") | Largest, highest-contrast, isolated by whitespace, top-left/above-the-fold, owns the most space |
| **Sub-dominant** | The rest of the actionable list (next few todos, batches) | One step down in scale and contrast; scannable but visibly subordinate |
| **Subordinate** | The all-sessions rail + ambient status | Smallest, lowest-contrast, dense, pushed to the periphery; quiet until one row earns attention |

The cardinal mistake to avoid: making the todo win by **inflating it** (giant font, bright color). The mature move is the opposite — **turn the volume down on everything else.** "Secondary elements should live one step down in scale and contrast, creating a clear instructional pathway: anchor first, explain second, invite action third" ([IxDF via search synthesis](https://ixdf.org/literature/topics/visual-hierarchy)). Lower the volume on the sessions rail and the todo gets louder without changing a pixel of the todo. (Confidence: high)

---

## 2. The five levers, concretely

Mature dashboards establish hero-vs-secondary with five interacting levers. Each is independently tunable; you do not need to max all five.

### Lever 1 — SIZE (the strongest, cheapest signal)

"Larger elements dominate and catch eyes first." Make the core element "meaningfully larger than everything around it" on a consistent scale so there's "a clear visual path from the big idea to the helpful details" ([search synthesis on focal points](https://ixdf.org/literature/topics/visual-hierarchy); [Canva, Visual Hierarchy](https://www.canva.com/learn/visual-hierarchy/)). (Confidence: high)

Concrete space-budget heuristics from dashboard practitioners (treat as starting ratios, not law):
- **40-30-20-10 space rule**: ~40% of the space to the single most important thing, ~30% to 2-3 secondary items, ~20% to supporting context, ~10% to nav/filters ([IGC, Dashboard Layout](https://www.intelligentgraphicandcode.com/design/dashboard-design/dashboard-layout)). (Confidence: medium — it's a rule of thumb, repeated across blogs, not empirical.)
- **Hero tile spans 4-6 of a 12-column grid over 2 rows; secondary cards span 2-3 columns over 1 row**, 16px gutters ([Smart-interface / dashboard-pattern synthesis](https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/)). (Confidence: medium)

For ClaudeTerminal: the hero `@now` card should physically dwarf a single session row. A session row is one line; the hero is a card with title, context, and a primary button.

### Lever 2 — POSITION (where the eye lands first)

Eye-tracking shows users scan in an **F-pattern** for content-heavy screens (across the top, down the left) and a **Z-pattern** when the screen is simple and CTA-driven ([NN/g-adjacent synthesis](https://99designs.com/blog/tips/visual-hierarchy-landing-page-designs/); [Medium, F vs Z](https://medium.com/design-bootcamp/f-patterns-vs-z-patterns-228104ec2be1)). Both converge on one fact: **the top-left is seen first and most** ("golden triangle"), so the most important content and the primary CTA belong there ([99designs](https://99designs.com/blog/tips/visual-hierarchy-landing-page-designs/)). (Confidence: high)

Practitioner placement convention for dashboards: **primary metric top-left, secondary context top-right, supporting detail / breakdowns in the bottom half**, with users spending the bulk of viewing time above the fold ([IGC](https://www.intelligentgraphicandcode.com/design/dashboard-design/dashboard-layout); Lane E4's Eleken cite on ~80% above-fold). (Confidence: high for the principle, medium for the exact 80%.)

For ClaudeTerminal: hero todo top-left and above the fold; the sessions rail to the right edge or along the bottom — present but on the cold side of the F. This is also the email-client three-pane logic inverted: in Outlook the message **list** is the workhorse and the folder nav is the cold rail ([Microsoft, Reading Pane](https://support.microsoft.com/en-us/office/use-and-configure-the-reading-pane-to-preview-messages-in-outlook-2fd687ed-7fc4-4ae3-8eab-9f9b8c6d53f0)). We want the **todo list** as the workhorse pane and the **session list** as the cold rail.

### Lever 3 — CONTRAST & COLOR (reserve saturation for the hero and for alerts)

"Bright colors catch eyes ahead of muted ones; stark differences draw eyes to the brighter element" ([search synthesis](https://ixdf.org/literature/topics/visual-hierarchy)). The discipline that makes a hero read as the hero: **bold accent on an otherwise muted field.** "A call-to-action could feature a highly saturated hue that strongly contrasts with an otherwise muted palette" ([Smashing / synthesis](https://www.smashingmagazine.com/2015/02/design-principles-dominance-focal-points-hierarchy/)). Use the bright, contrasting color **sparingly** — only for the primary CTA, alerts, and critical changes ([Lazarev, Dashboard UX](https://www.lazarev.agency/articles/dashboard-ux-design)). (Confidence: high)

Two-part implication for the sessions rail:
1. The rail is **desaturated by default** — grays, low contrast, no per-session color. It carries no accent so it cannot compete with the hero's accent.
2. Color in the rail becomes **meaningful precisely because it is rare**: when one session flips to "needs you," that single row gets the one accent on the page, and the eye snaps to it. This is the calm-tech "periphery informs without overburdening" idea rendered as color budget ([calmtech.com](https://calmtech.com/); see Lever 5).

### Lever 4 — WHITESPACE & ISOLATION (the quiet hero-maker)

"Including whitespace around elements singles them out as separate groups of information... leverage white space to isolate the task at hand and prevent competing visuals from shouting at the same volume" ([search synthesis on focal points](https://ixdf.org/literature/topics/visual-hierarchy)). Isolation alone can create a focal point: an element with lots of room around it reads as important even at the same size ([Smashing, "local whitespace" as a weight variable](https://www.smashingmagazine.com/2015/02/design-principles-dominance-focal-points-hierarchy/)). (Confidence: high)

This is the cheapest way to make the hero dominant **without** size-inflation or a loud color (the move E4 prefers for the ADHD brain). Generous padding around the hero card; the sessions rail packed tight. The density contrast itself signals hierarchy: airy = important, dense = reference.

### Lever 5 — DENSITY & FORM (card for the hero, compact list for the rail)

The form factor encodes the hierarchy. Three display patterns, each with a native job ([UX Patterns for Developers, "Table vs List vs Cards"](https://uxpatterns.dev/pattern-guide/table-vs-list-vs-cards); [Smart Interface Design Patterns, "Cards vs Lists vs Tables"](https://smart-interface-design-patterns.com/articles/cards-vs-lists-vs-tables-vs-data-grids/)):

- **Cards** — "when visual browsing matters more than strict side-by-side comparison." Rich, spacious, one-thing-per-card. → the hero.
- **List view** — "when users mainly read down a single stream and only a few key attributes matter per item." Dense, scannable, one line each. → the sessions rail, and the secondary todo list.
- **Table** — for column-comparison / sort / scan. Probably overkill here.

A well-designed metric card "answers one question at a glance" and the rule is **restraint: show 5-7 priority items by default, layer the rest behind expandable sections** ([dashboard-card synthesis](https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/)). (Confidence: medium)

Concrete dimensions practitioners cite: **sidebar/secondary nav 240-280px wide**, KPI strip of 4-6 items, content grid via CSS Grid ([dashboard-pattern synthesis](https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/)). A right- or bottom-docked session rail in that 240-280px band is a well-trodden width. (Confidence: medium)

---

## 3. Progressive disclosure: how the secondary stays small without losing anything

Progressive disclosure (Nielsen, 1995) "defers advanced or rarely used features to a secondary screen... surface only what's relevant to the user's current step and make the rest available on demand" ([NN/g, Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)). It is the mechanism that lets the home page be sparse by default while the full backlog and full session detail are one click deep. (Confidence: high)

The pattern that fits this page best is **summary-to-detail / "peek then expand"**: show a short summary first, reveal layers on demand (the "How was this calculated?" → summary → factors → full-detail ladder) ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/); [UXPin, Progressive Disclosure](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/)). Applied:

- **Hero**: full detail (it's the one thing).
- **Secondary todo list**: title + one-line context per item; click to expand. The J.O.T. buckets `@next` / `@later` stay **collapsed behind a single "X more later" affordance**, not laid out as three equal columns (three equal columns rebuild the "wall"; see E4 §2 P3).
- **Sessions rail**: one line per session (name + status dot); hover/click reveals last-activity, cwd, the actions. Counts, logs, and per-session history live one level deeper.

The expandable-card pattern is the standard implementation: collapsed = summary, expanded = detail, in place ([Design for Ducks, Expandable Card UI](https://designforducks.com/expandable-card-ui-best-practice-and-examples/)). Important constraint from E4 §2 P6: expansion must be **user-invited**, never auto-expand on a poll tick.

---

## 4. Real examples (and what to copy vs avoid)

### GitHub personal dashboard — caution, partial fit
GitHub's main dashboard has two activity feeds ("Following" and "For you") as the primary column, with the **repo list demoted to the left sidebar** ("top repositories... automatically generated") and "Discover repositories" relocated under Explore — i.e., the navigation/repos are deliberately **de-emphasized to a rail** so the personalized feed is the hero ([GitHub Docs, Personal Dashboard](https://docs.github.com/en/account-and-profile/get-started/personal-dashboard-quickstart); [GitHub Blog, Dashboard UI refresh](https://github.blog/news-insights/product-news/dashboard-ui-refresh/)). The transferable move: **the thing the app is "about" (repos) is NOT the hero; a curated actionable/relevant stream is.** That is exactly our inversion (sessions → rail, todos → hero). (Confidence: high)

Caveat: GitHub's hero is a *discovery feed*, which is the wrong content model for us (we want action, not browse), and the feed has drawn user pushback for being noisy ([community discussion #177902](https://github.com/orgs/community/discussions/177902)). Copy the **hierarchy decision**, not the feed content. The newer **repository dashboard** (GA Feb 2026) shows GitHub also building a focused "find and act on your work" surface ([GitHub Changelog, repository dashboard GA](https://github.blog/changelog/2026-02-24-repository-dashboard-is-now-generally-available/)). (Confidence: medium)

### Linear — closest spiritual match
Linear leads with a **work list** ("My Issues") as the primary surface and keeps the **sidebar as quiet navigation** ("show the projects and views you check daily, hide everything else"). Its **Focus** grouping auto-orders "issues assigned to you in order of what you'd want to work on first" — a built-in "one thing next" ([Linear Docs, Display options](https://linear.app/docs/display-options); [Linear, redesign part II](https://linear.app/now/how-we-redesigned-the-linear-ui)). The stated design philosophy is the lane in one sentence: panels and sidebars are "adjusted to reduce visual noise... increase the hierarchy and density of navigation elements" so the work list dominates and nav recedes ([Linear redesign](https://linear.app/now/how-we-redesigned-the-linear-ui)). **This is the model to emulate**: actionable list = hero, navigation/secondary = muted dense rail, plus an auto-prioritized "Focus" that picks the hero todo for you. (Confidence: high)

### VS Code — the rail/strip vocabulary
VS Code formalizes a peripheral-status grammar worth borrowing directly:
- **Status Bar** splits items into **Primary (left) = workspace-wide** and **Secondary (right) = contextual** ([VS Code, Status Bar UX](https://code.visualstudio.com/api/ux-guidelines/status-bar)).
- **Activity Bar** carries "context-specific indicators, like the number of outgoing changes" — small ambient counts, not content ([VS Code, Activity Bar UX](https://code.visualstudio.com/api/ux-guidelines/activity-bar)).
- The editor (the work) is the hero; bars and side bars are peripheral by construction.

For us: a session rail can adopt this "small ambient indicator on the periphery" treatment — a status dot per session, an optional count, nothing louder. (Confidence: high)

### Email three-pane — the inversion warning
Classic three-pane mail = folder nav (cold rail) + message list (workhorse) + reading pane. The list, not the nav, is the workhorse ([Microsoft, Reading Pane](https://support.microsoft.com/en-us/office/use-and-configure-the-reading-pane-to-preview-messages-in-outlook-2fd687ed-7fc4-4ae3-8eab-9f9b8c6d53f0)). The lesson: **the workhorse pane earns the center; the navigational/contextual list earns the edge.** Make sure the *todo list* is the workhorse pane and the *session list* is the edge. (Confidence: high)

### macOS / Apple HIG widgets — glanceable-by-design
Apple's HIG frames widgets as "quick access to essential information... glanceable, without opening the app," built on the principle of **deference** (the UI defers to content) ([Apple HIG, Widgets](https://developer.apple.com/design/human-interface-guidelines/widgets/)). A session rail is conceptually a row of tiny glanceable widgets: each says one thing (state) at a glance, none demands interaction. "Deference" is the right north star for the whole secondary zone. (Confidence: high)

---

## 5. Peripheral status cues: dot vs count (the rail's one expressive bit)

The rail needs to signal "this session needs you" without becoming loud. The badge literature is precise here:
- A **dot badge** = "something new/active, exact number unknown or irrelevant"; it is "the quietest notification you can ship: it pulls attention without blocking anything" and is the calm-tech-aligned default ([Setproduct, Badge UI Design](https://www.setproduct.com/blog/badge-ui-design)).
- A **numbered badge** = use only "when the exact count matters to the user" ([Setproduct](https://www.setproduct.com/blog/badge-ui-design); [Mobbin, Status Dot](https://mobbin.com/glossary/status-dot)).

Calm-technology guidance: "design for the periphery — use ambient cues, status bars and glanceable summaries before modal dialogs or forced flows" ([Designerly, Calm Technology](https://designerly.com/calm-technologies/)). (Confidence: high)

For ClaudeTerminal: default each session row to a **dot** (idle = gray/none, working = subtle, **needs-you = the page's one accent color**). Reserve counts for an aggregate ("2 sessions need you") that itself can collapse. This keeps the rail subordinate 95% of the time and lets it spike to sub-dominant for exactly the one row that earns it — without ever out-shouting the hero todo. (Confidence: high)

---

## 6. Recommended layout for ClaudeTerminal (synthesis)

A concrete, opinionated starting layout that applies all five levers + progressive disclosure:

```
┌───────────────────────────────────────────────┬───────────────┐
│  HERO  (dominant)                              │ SESSIONS RAIL │
│  ┌─────────────────────────────────────────┐  │ (subordinate) │
│  │  @now: <the one thing>                   │  │  ● repo-a  …  │  <- 240-280px
│  │  short context line                      │  │  ○ repo-b  …  │     dense list
│  │  [ Start in new PS tab ]  copy  ⋯        │  │  ● repo-c  ⬤  │     dot status
│  └─────────────────────────────────────────┘  │  ○ repo-d  …  │     one accent
│   (generous whitespace isolates the card)      │  …            │     only on the
│                                                │               │     "needs you"
│  SECONDARY LIST (sub-dominant)                 │               │     row
│   ▸ next todo                    copy ⋯        │               │
│   ▸ next todo                    copy ⋯        │   ▸ N more     │
│   ▸ X more later  (collapsed)                  │               │
└───────────────────────────────────────────────┴───────────────┘
```

Mapping back to the levers:
- **Size**: hero card >> list rows >> session rows.
- **Position**: hero top-left (golden triangle); session rail on the cold right edge (or docked bottom strip on narrow windows).
- **Contrast/color**: muted everywhere; the one accent is the hero's primary button, plus the single "needs-you" session dot.
- **Whitespace**: airy around the hero; tight in the rail (density contrast = hierarchy).
- **Density/form**: card for the hero, compact lists for both the secondary todos and the sessions.
- **Progressive disclosure**: `@next`/`@later` collapsed behind "X more later"; session detail/actions on hover/click; nothing auto-expands.

Open layout choice to resolve in design: **right rail vs bottom strip.** Right rail (Linear/VS-Code-like) keeps it in peripheral vision continuously; a bottom strip frees full width for the hero and reads even colder. Given an always-on window that may be narrow, a **responsive rule** (right rail when wide, collapse to a single-line bottom strip when narrow) is the safe call. (Confidence: medium — needs a render test against real window sizes.)

---

## 7. Anti-patterns specific to this hierarchy

| # | Anti-pattern | Why it breaks the hierarchy | Confidence |
|---|---|---|---|
| 1 | Session **card grid** as the home page | Cards are the hero treatment; a grid of session cards makes sessions the hero and rebuilds the "wall." Use a list. | high |
| 2 | **Four+ dominance levels** (hero + 2 todo tiers + session tiers all styled distinctly) | "Reduces contrast between neighboring levels"; nothing reads as primary ([Smashing](https://www.smashingmagazine.com/2015/02/design-principles-dominance-focal-points-hierarchy/)). Collapse to 3. | high |
| 3 | Making the todo win by **size/color inflation** instead of muting the rest | Adds stimulus/noise (bad for ADHD per E4); the durable move is lowering everyone else. | high |
| 4 | **Per-session color** in the rail | Spends the color budget so the rare "needs-you" accent can't spike. Desaturate the rail. | high |
| 5 | **Numbered badge on every session row** | Counts read as "important detail"; promotes the rail toward sub-dominant permanently. Default to dots. | medium |
| 6 | Three **equal columns** for `@now`/`@next`/`@later` | Equal columns = equal weight = no hero; it's the wall again ([E4 §2 P3](./E4-overwhelm.md)). Collapse `@next`/`@later`. | high |
| 7 | **Auto-expanding** session detail / auto-reordering zones on poll | Uninvited interruption; relocates the eye (E4 §2 P6-P7). Update in place, expand only on user action. | high |
| 8 | A **discovery feed** as the hero (GitHub-style) | Wrong content model: we want action, not browse; feeds invite scrolling and drew user pushback. | medium |

---

## 8. Open questions for the design phase

1. **Right rail vs bottom strip vs responsive** for the sessions list — needs a render test at real ClaudeTerminal window widths. (Lever 2/5.)
2. **Who picks the hero todo?** Linear's "Focus" auto-orders; do we hand-pick `@now`, auto-rank, or both? (Ties to Lane C data sources + E1 exec-function.)
3. **How many secondary todos show before "X more later"?** The 5-7 restraint heuristic is a starting point, not validated for this user.
4. **Does the rail ever need a count, or only dots + an aggregate?** Resolve against how many sessions the user typically runs (rail length affects whether a numbered "needs-you" total earns its keep).
5. **Density of the secondary todo list vs the session rail** — are they the same list style, or is the session rail even denser/colder to keep todos clearly sub-dominant above sessions? (Lever 4/5.)

---

## Sources

- [Smashing Magazine — Design Principles: Dominance, Focal Points And Hierarchy](https://www.smashingmagazine.com/2015/02/design-principles-dominance-focal-points-hierarchy/)
- [NN/g — Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
- [UXPin — What Is Progressive Disclosure in UX?](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/)
- [Interaction Design Foundation — Visual Hierarchy](https://ixdf.org/literature/topics/visual-hierarchy)
- [Canva — The Ultimate Guide to Visual Hierarchy](https://www.canva.com/learn/visual-hierarchy/)
- [Lazarev.agency — Dashboard UX Design](https://www.lazarev.agency/articles/dashboard-ux-design)
- [Intelligent Graphic and Code — Dashboard Layout: Visual Hierarchy & Structure](https://www.intelligentgraphicandcode.com/design/dashboard-design/dashboard-layout)
- [UX Patterns for Developers — Table vs List View vs Card Grid](https://uxpatterns.dev/pattern-guide/table-vs-list-vs-cards)
- [Smart Interface Design Patterns — Cards vs Lists vs Tables vs Data Grids](https://smart-interface-design-patterns.com/articles/cards-vs-lists-vs-tables-vs-data-grids/)
- [Art of Styleframe — Dashboard Design Patterns for Modern Web Apps 2026](https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/)
- [Design for Ducks — Expandable Card UI: Best Practice and Examples](https://designforducks.com/expandable-card-ui-best-practice-and-examples/)
- [99designs — Using F and Z Patterns to Create Visual Hierarchy](https://99designs.com/blog/tips/visual-hierarchy-landing-page-designs/)
- [Medium (Bootcamp) — F Patterns vs Z Patterns](https://medium.com/design-bootcamp/f-patterns-vs-z-patterns-228104ec2be1)
- [GitHub Docs — Personal Dashboard Quickstart](https://docs.github.com/en/account-and-profile/get-started/personal-dashboard-quickstart)
- [GitHub Blog — Dashboard UI Refresh](https://github.blog/news-insights/product-news/dashboard-ui-refresh/)
- [GitHub Changelog — Repository Dashboard is now GA (Feb 2026)](https://github.blog/changelog/2026-02-24-repository-dashboard-is-now-generally-available/)
- [GitHub Community — Home dashboard update feedback (Discussion #177902)](https://github.com/orgs/community/discussions/177902)
- [Linear Docs — Display Options](https://linear.app/docs/display-options)
- [Linear — How We Redesigned the Linear UI (part II)](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [VS Code — Status Bar UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/status-bar)
- [VS Code — Activity Bar UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/activity-bar)
- [Microsoft Support — Use and Configure the Reading Pane in Outlook](https://support.microsoft.com/en-us/office/use-and-configure-the-reading-pane-to-preview-messages-in-outlook-2fd687ed-7fc4-4ae3-8eab-9f9b8c6d53f0)
- [Apple Developer — Human Interface Guidelines: Widgets](https://developer.apple.com/design/human-interface-guidelines/widgets/)
- [Setproduct — Badge UI Design: Notification, Count, and Status Patterns](https://www.setproduct.com/blog/badge-ui-design)
- [Mobbin — Status Dot UI Design](https://mobbin.com/glossary/status-dot)
- [Designerly — The Calm Technology Movement](https://designerly.com/calm-technologies/)
- [calmtech.com — Calm Technology](https://calmtech.com/)
