# F1 Recon — IDE/Editor Home Screens & Developer Command-Center Dashboards

Lane F1 of the ClaudeTerminal in-app Dashboard / Home page planning. Read-only prior-art study. The goal of the home page being designed: surface the user's todos / problems / in-progress items as the PRIMARY content, show live sessions as a SECONDARY glanceable list (not the hero), and let a click (a) open a new PowerShell tab, (b) copy text, or (c) open a NEW Claude session pre-loaded with a query.

This document extracts reusable layout and information-architecture (IA) patterns from shipping editors and dashboards, and maps them onto that goal. Every code claim cites `file:line`; every external claim cites a URL. Confidence is marked per claim.

---

## TL;DR — the patterns worth stealing

1. **The single biggest lesson is VS Code's own:** a welcome/home tab that is a passive "splash" gets ignored. It earns its default-tab slot only when it surfaces the few high-frequency actions a user actually wants on open. VS Code's research found the Getting-Started cards drove engagement, and bolting the old file/folder/recent panel back on *lowered* engagement. Translation for us: do not build a logo-and-links splash; build a working surface. (Confidence: high — VS Code GitHub issues #63152, #122702.)
2. **New users and returning users want different things from the same screen.** VS Code research: new users sought language packs / shortcut extensions; returning users wanted recent projects / open folder. A home page must serve both without making either hunt. (Confidence: high — issue #63152.)
3. **F/Z scan order dictates real estate.** Top-left is premium. Put the most important, most actionable content there; secondary glanceable content goes right and down. (Confidence: high — Pencil & Paper.)
4. **The actionable-feed model (Linear/GitHub/SignalBox) is the right spine for "todos / problems / in-progress as primary."** Summary count -> filterable list -> act inline (assign/triage/jump) without leaving the surface. This is exactly the "click an item to jump/copy/launch" interaction the home page needs. (Confidence: high — Linear changelog, SignalBox.)
5. **Sessions = a glanceable status list, not the hero.** JetBrains recent-projects management (search, group, pin, custom icon) and Warp's session navigation/restoration are the reference for the SECONDARY list. Status counts per group (idle/working/needs-you) is already a pattern this app computes for the sidebar — reuse it. (Confidence: high — JetBrains docs; Warp docs; `App.tsx:87-102`.)
6. **Card template + grouped layout + semantic color + threshold judgments** are the load-bearing dashboard primitives. Pick a uniform card and apply it everywhere; group by meaning with whitespace/dividers; let color carry good/bad/needs-action. (Confidence: high — Dashboard Design Patterns catalog; Pencil & Paper.)

---

## 1. VS Code — Welcome / Get Started / Walkthroughs

### What it is
The Welcome page opens by default on launch (controlled by `workbench.startupEditor`; set to `none` to disable). It is the canonical "default editor tab" prior art and the closest analog to what ClaudeTerminal wants. ([code.visualstudio.com tips](https://code.visualstudio.com/docs/getstarted/tips-and-tricks), [Help > Welcome notes](https://renenyffenegger.ch/notes/development/editors/Visual-Studio-Code/GUI/menu/Help/Welcome)) (Confidence: high)

### Layout / IA
Three-ish regions, classically:
- **Start** — primary action buttons (New File, Open Folder, Clone Repository). Removable as a block. (Confidence: high — [issue #179844 referenced](https://github.com/microsoft/vscode/issues/179844), search result.)
- **Recent** — recently opened folders/workspaces list. (Confidence: high — same.)
- **Walkthroughs / Get Started** — large cards for multi-step, progress-tracked onboarding checklists. ([UX Guidelines: Walkthroughs](https://code.visualstudio.com/api/ux-guidelines/overview), [getting-started tutorial](https://code.visualstudio.com/docs/getstarted/getting-started)) (Confidence: high)

### The "dead splash" lesson (most important finding in this lane)
VS Code's own UX research, captured in the long-running design issues:
- The first Getting-Started page (v1.54) with large walkthrough cards had **the highest engagement**. When they re-added the well-known file/folder/recent Welcome panel, **engagement dropped significantly**. ([issue #122702](https://github.com/microsoft/vscode/issues/122702), via search summary) (Confidence: medium — paraphrased from issue discussion, not a primary metrics doc.)
- The Welcome page was explicitly criticized as a "dead splash" that failed to engage; the fix direction was surfacing high-frequency actions in the primary hierarchy, not adding more links. ([issue #63152](https://github.com/microsoft/vscode/issues/63152)) (Confidence: high)
- **New vs returning divergence:** new users wanted language packs + keyboard-shortcut extensions; returning users wanted recent projects / open folder. The layout must anticipate both goals and rank by intent. ([issue #63152](https://github.com/microsoft/vscode/issues/63152)) (Confidence: high)
- Walkthroughs track progress and are useful beyond first-run — returning users open them to tweak setup and deepen skills. ([issue #122702](https://github.com/microsoft/vscode/issues/122702)) (Confidence: medium)

### Companion pain points (what users asked for)
Remove non-existent recent items; pin/favorite projects; control browser-launch behavior. ([issue #63152](https://github.com/microsoft/vscode/issues/63152)) (Confidence: high)

### Lessons for ClaudeTerminal
- Do NOT replicate a logo + link grid. The home tab must DO something on open.
- Rank content by what the user does most on open. For this app that is: deal with the items that need me, then glance at sessions, then start something new.
- Make the recent/sessions list manageable (pin, remove stale, search) — it rots otherwise.
- A walkthrough/checklist region is optional polish, not the hero, and only earns space if it tracks progress.

---

## 2. JetBrains (IntelliJ / WebStorm) — Welcome Screen & Recent Projects

### What it is
A full Welcome screen shown when no project is open, dominated by a **Recent Projects** list. ([Open/move/close projects](https://www.jetbrains.com/help/idea/open-close-and-move-projects.html), [New UI](https://www.jetbrains.com/help/idea/new-ui.html)) (Confidence: high)

### Recent-projects management (the reusable bit for our SECONDARY sessions list)
For users with many projects, the welcome screen provides: a **search bar** to filter the list, the ability to **group** several recent projects, and **custom per-project icons**. ([Open/move/close projects](https://www.jetbrains.com/help/idea/open-close-and-move-projects.html)) (Confidence: high)

### New UI principles (relevant to the whole home design)
The New UI was built to "reduce visual complexity, provide easy access to essential features, and progressively disclose complex functionality as needed." Compact Mode reduces toolbar/header heights, spacings, icon sizes for a denser look. On macOS, project tabs sit under the main toolbar for switching between open projects. ([New UI](https://www.jetbrains.com/help/idea/new-ui.html), [2023.1 enhancements](https://blog.jetbrains.com/idea/2023/03/new-ui-enhancements-in-intellij-idea-2023-1/)) (Confidence: high)

### Lessons for ClaudeTerminal
- Searchable + groupable + pin-able session/project list is the proven answer to list rot. ClaudeTerminal already has per-project grouping in the sidebar (`ProjectSidebar`, status counts at `App.tsx:87-102`); the home page should present sessions grouped by project the same way.
- Progressive disclosure is a stated JetBrains design axiom — keep the home dense-but-calm; reveal detail on click/hover.
- Custom icons / color tints aid scanning. This app already tints per-project via `--project-hue` (`App.tsx:104-111`); carry that into home-page session cards for instant project identification.

---

## 3. Cursor 2.0 — Agent/Plan Interface (closest modern analog)

### What it is
Cursor 2.0 reframes the editor around a **multi-agent management view**: a **sidebar for your agents and plans**, with the editor reorganized so agents (not files) are the primary objects. ([Cursor 2.0 changelog](https://cursor.com/changelog/2-0)) (Confidence: high)

### IA / behavior
- Run **up to eight agents in parallel** on a single prompt, each isolated via **git worktrees or remote machines**. ([changelog 2-0](https://cursor.com/changelog/2-0)) (Confidence: high)
- **Plan mode**: create a plan with one model, build with another; run plans **foreground or background**, or plan with parallel agents. ([changelog 2-0](https://cursor.com/changelog/2-0)) (Confidence: high)
- **Background / Cloud agents**: async agents in sandboxed cloud VMs with their own repo checkout; can turn a GitHub issue or Slack message into a draft PR. Monitored from a web dashboard at cursor.com/agents. ([Background agents guide](https://aitechfy.com/blog/cursor-background-agents/), [DeployHQ Cursor guide](https://www.deployhq.com/guides/cursor), [docs dashboard](https://docs.cursor.com/account/dashboard)) (Confidence: high)
- **"Background Tasks: start bug fixes, code reviews, or analysis jobs while you multitask. Get notified when they finish."** ([changelog 0-50](https://cursor.com/changelog/0-50)) (Confidence: high)
- Cleaner prompt input: agent self-gathers context; files/dirs render as inline **pills**. ([changelog 2-0](https://cursor.com/changelog/2-0)) (Confidence: high)

### Lessons for ClaudeTerminal
- Cursor validates the exact thesis of this home page: **the home of an agentic tool is a list of work/agents, not a file tree or a splash.** ClaudeTerminal sessions ARE agents (each tab is a Claude Code process — `AGENTS.md` overview). Treat them that way.
- "Get notified when they finish" + a glanceable status list is the secondary-sessions pattern. ClaudeTerminal already has session status (`new`/`working`/`idle`/`requires_response`, see `App.tsx:96-99`) plus a notification hook (`src/hooks/on-notification.js`). The home page should render `requires_response` as a top-of-list "needs you" item.
- Inline **pills** for files/dirs/queries are a clean way to render the "open a new Claude session pre-loaded with a query" affordance without a heavy form.
- Foreground/background distinction maps to ClaudeTerminal's idle-vs-working sessions; the home list can sort working-but-quiet sessions below ones that need a human.

---

## 4. Zed — No-Workspace / Welcome Experience

### What it is
When Zed opens **without a folder**, the main editor area shows a welcome page with quick actions: **open a folder, clone a repository, view documentation**. First-run onboarding offers keymap-from-other-editor and settings import. ([Getting Started](https://zed.dev/docs/getting-started), [Andrew Lock walkthrough](https://andrewlock.net/trying-out-the-zed-editor-on-windows-for-dotnet-and-markdown/)) (Confidence: high)

### Active design direction
There is an open discussion to **"Improve the No-Workspace Experience with a Welcome Page,"** and a merged 2025 onboarding design PR adding editor icons and button styling. Onboarding banners are toggleable via `show_onboarding_banner`. ([discussion #43158](https://github.com/zed-industries/zed/discussions/43158), [PR #35480](https://github.com/zed-industries/zed/pull/35480), [discussion #10894](https://github.com/zed-industries/zed/discussions/10894)) (Confidence: high)

### Lessons for ClaudeTerminal
- The "no active work" state is a first-class design target, not an afterthought. ClaudeTerminal's home page needs a strong **empty state** (no todos, no sessions): show the 2-3 primary actions (new PowerShell tab, new Claude session, open project) prominently, mirroring Zed's open-folder/clone/docs trio.
- Migration-style onboarding (import keymap/settings) is a nice-to-have but off the critical path here.

---

## 5. Linear — Dashboards + Triage Inbox (the actionable-feed spine)

### Dashboards
Three content types: **charts** (trends), **tables** (detail), **single-number metrics** (KPIs). Modular customizable **grid**, filterable by team/scope, shareable at workspace/team/personal scope. ([Linear dashboards changelog](https://linear.app/changelog/2025-07-24-dashboards)) (Confidence: high)

### The drill-to-action model (steal this exactly)
Explore -> Examine -> Act: drill into an insight to see the underlying issues, examine outliers, then **"take action — assign work, update statuses, or triage directly from the issue list."** Actions happen inline, without navigating away. ([Linear dashboards changelog](https://linear.app/changelog/2025-07-24-dashboards)) (Confidence: high)

### Triage inbox
Triage is the team's shared inbox for new issues; recommended practice is to review it daily, assign owners, set priorities, label, before items reach the backlog. Designed so important feedback is never forgotten. ([Linear](https://linear.app/), [Linear guide](https://www.morgen.so/blog-posts/linear-project-management)) (Confidence: high)

### Lessons for ClaudeTerminal
- **This is the IA backbone for the PRIMARY content.** Render todos/problems/in-progress as a triage-style list where each row is actionable in place: jump to a tab, copy text, or open a pre-loaded Claude session — the three affordances the spec calls for map 1:1 onto Linear's "act directly from the list."
- Layered disclosure: count badge -> filterable list -> detail/action. Keep context (which project/session an item belongs to) attached as the user drills.
- A single-number metric ("3 need you", "2 working") at the top gives the glance value; the list below gives the action.

## 5b. GitHub / SignalBox — notification triage as a home

SignalBox centralizes GitHub/Vercel/Linear notifications into a realtime **Dashboard + Kanban triage + reports**, explicitly to "triage workflows, pull requests, issues, and deployments **without inbox noise**." ([SignalBox](https://www.signalbox.sh/)) (Confidence: high)

Lesson: the winning developer-home framing is **"what needs my attention, dedup'd and ranked,"** not a metrics wall. The ClaudeTerminal home is closer to a focused notification/triage surface than a BI dashboard.

---

## 6. Warp — Terminal session/blocks model (terminal-native prior art)

- **Blocks**: every command+output is a discrete, selectable, **copyable**, shareable, bookmarkable unit with exit code, duration, timestamp. ([Warp blocks guide](https://aiproductivity.ai/guides/warp-terminal-guide/), [Small but mighty](https://www.warp.dev/blog/small-but-mighty-new-features-in-warp)) (Confidence: high)
- **Launch Configurations**: save a set of windows/tabs/panes per project and reopen them quickly (in-app or via YAML). ([Launch Configurations](https://docs.warp.dev/terminal/sessions/launch-configurations/)) (Confidence: high)
- **Session Navigation + Session Restoration**: quick-switch active sessions; restore windows/tabs/panes across restarts. ([Sessions](https://docs.warp.dev/features/sessions), [Sessions overview](https://docs.warp.dev/terminal/sessions/)) (Confidence: high)

### Lessons for ClaudeTerminal
- The "copy text" affordance has direct terminal precedent: Warp blocks are first-class copyable units. A home-page item that copies a command/query is idiomatic.
- Launch-configurations + session restoration validate ClaudeTerminal's existing per-directory session persistence (`docs/session-persistence.md`, restore logic at `App.tsx:318-344`). The home page can offer "restore/resume" entries for saved sessions as a secondary action group.
- Quick session-switch is expected; the secondary sessions list on home should switch tabs on click (already wired: `handleSelectTab` / `switchTab`, `App.tsx:113-121`).

---

## 7. Generic dashboard design patterns (catalog + best practices)

### Layout patterns ([Dashboard Design Patterns catalog](https://dashboarddesignpatterns.github.io/patterns.html)) (Confidence: high)
- **Stratified layout** — high-level info at top, detail below. (Use this: counts on top, item list below.)
- **Grouped layout** — cluster related widgets with dividers/whitespace/shaded regions. (Group items by status or project.)
- **Table layout** — rows/columns for comparison. (The item list itself.)
- **Open layout** — free-form widget sizes. (Avoid for v1; it scatters attention.)

### Data + visual patterns (same catalog)
- **Individual values** and **Numbers** — large prominent figures for key values needing immediate attention.
- **Thresholds** — make an explicit good/bad/neutral judgment about a data point (drive color/sort).
- **Trend arrows / gauges / sparklines** — compact status; optional, lower priority here.

### Color / interaction (same catalog)
- **Semantic color** — green=good, red=alert, for instant comprehension. Map to session status (idle/working/needs-you) and item severity.
- **Filter and focus**, **navigation (tabs/buttons/links)**, **detail-on-demand** — the drill-down toolkit.

### Best-practice rules ([Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards), [Justinmind](https://www.justinmind.com/ui-design/dashboard-design-best-practices-ux), [UXPin](https://www.uxpin.com/studio/blog/dashboard-design-principles/)) (Confidence: high)
- **F/Z scan order** — critical/actionable content top-left; secondary right and down; actionable anchors on the left.
- **Uniform card template** — fix where title/legend/controls live; apply across all cards to cut cognitive load.
- **Progressive disclosure** — don't show #allthethings; reveal detail via hover/drawer/drill.
- **Empty + loading + error states are mandatory** — omitting them reads as unfinished.
- **Action priority by visual weight** — most important action most noticeable; warnings demand immediate visibility.
- **Only include what serves a documented task** — map the user's daily workflow; cut vanity metrics. A glanceable dashboard is "clean, structured, lets users find key insights fast, without distractions."

---

## 8. Synthesis — recommended IA for the ClaudeTerminal Home tab

A concrete structure deduced from the prior art above and the stated goal.

```
+--------------------------------------------------------------+
|  HEADER STRIP (stratified, top)                              |
|   [ 3 need you ]  [ 2 working ]  [ 5 idle ]   <- big numbers |  <- glance value, semantic color
+--------------------------------------------------------------+
|  PRIMARY: "Needs you / Todos / Problems"  (top-left, F-scan) |
|   Linear-triage-style list. Each row is actionable inline:  |
|   - [ open shell ]  - [ copy ]  - [ ask Claude ... ]        |  <- the three required affordances
|   Sorted: requires_response -> problems -> in-progress      |
|   Severity/threshold color on the left edge of each row.    |
+--------------------------------------------------------------+
|  SECONDARY (right column or below): "Live Sessions"         |
|   Glanceable list, grouped by project (reuse tabCounts),    |
|   per-project hue tint, status dot, click = switch tab.     |  <- NOT the hero
|   Searchable + pinnable (JetBrains pattern) when list grows.|
+--------------------------------------------------------------+
|  TERTIARY / FOOTER: "Start something"                       |
|   [ New PowerShell tab ]  [ New Claude session ]  [ Open... ]|  <- VS Code Start / Zed no-workspace trio
+--------------------------------------------------------------+
```

Design rules carried from the research:
1. **Working surface, not splash** (VS Code) — the home tab must let the user act on the first item without leaving it.
2. **Rank by intent, serve new + returning** (VS Code) — needs-you first; start-actions always reachable but not dominant.
3. **Triage spine for primary content** (Linear/SignalBox) — count -> list -> inline action; the click affordances (jump / copy / ask-Claude) live on each row.
4. **Sessions are a glanceable secondary list** (JetBrains/Warp) — grouped, tinted, searchable, click-to-switch; never the hero.
5. **Uniform card + grouped + stratified layout, semantic color, F/Z order** (dashboard patterns) — one card template, group by status/project, big numbers up top, color = status/severity.
6. **First-class empty/loading/error states** (Zed/Pencil & Paper) — empty home = show the three start actions prominently.
7. **Progressive disclosure + manageable lists** (JetBrains) — pin/remove/search to prevent rot; reveal detail on hover/click.

### Hooks into existing code (where the data already lives)
- Session status + per-project counts: `src/renderer/App.tsx:87-102` (`tabCounts`: idle/working/requires_response/total).
- `requires_response` status -> "needs you" rows: status flow in `AGENTS.md` ("`new` -> `working` <-> `idle` / `requires_response`").
- Per-project color tint for session cards: `src/renderer/App.tsx:104-111` (`--project-hue`).
- Switch-tab on click: `src/renderer/App.tsx:113-121` (`handleSelectTab` -> `switchTab`).
- New shell (PowerShell) tab: `src/renderer/App.tsx:174-197` (`handleNewShellTab` / `handleNewDefaultShellTab`).
- New Claude session: `src/renderer/App.tsx:168-172` (`handleNewTabWithoutWorktree` -> `createTab`).
- Saved-session restore (Warp launch-config analog): `src/renderer/App.tsx:318-344`.
- Notifications (Cursor "notify when done" analog): `src/hooks/on-notification.js`.

---

## Open questions for downstream lanes
1. **Where do "todos / problems" come from?** The prior art assumes a backing data source (issues, notifications). ClaudeTerminal has session status + a notification hook, but no todo/problem store yet. A separate lane must define the data model for the PRIMARY content (parse from hooks? a per-project todo file? external task source?).
2. **Is the home a real tab or a special view?** VS Code/Zed make it an editor tab; this app's tab model is PTY-backed. The home page is non-PTY, so it needs a tab type that renders React, not a terminal (architecture decision for an implementation lane).
3. **Default-on behavior + escape hatch.** VS Code makes the welcome default-on but disable-able (`workbench.startupEditor`). Decide the equivalent setting and whether home replaces or supplements the StartupDialog (`App.tsx:530-538`).
4. **"Ask Claude with a pre-loaded query" mechanics.** Does this create a Claude tab and inject the prompt into the PTY, or pass it as a CLI arg? Needs an IPC-contract lane (the app already mangles backslashes in CLI args per `AGENTS.md`, so prompt injection path matters).

---

## Sources
- [VS Code tips and tricks](https://code.visualstudio.com/docs/getstarted/tips-and-tricks)
- [VS Code Getting Started tutorial](https://code.visualstudio.com/docs/getstarted/getting-started)
- [VS Code Extension UX Guidelines (Walkthroughs)](https://code.visualstudio.com/api/ux-guidelines/overview)
- [VS Code Help > Welcome notes](https://renenyffenegger.ch/notes/development/editors/Visual-Studio-Code/GUI/menu/Help/Welcome)
- [VS Code issue #63152 — Explore improving UX for Welcome Page](https://github.com/microsoft/vscode/issues/63152)
- [VS Code issue #122702 — More prominent walkthroughs](https://github.com/microsoft/vscode/issues/122702)
- [Visual Studio (17.6) Welcome Experience blog](https://devblogs.microsoft.com/visualstudio/welcome-experience/)
- [JetBrains New UI](https://www.jetbrains.com/help/idea/new-ui.html)
- [JetBrains Open, move, close projects](https://www.jetbrains.com/help/idea/open-close-and-move-projects.html)
- [JetBrains New UI Enhancements 2023.1](https://blog.jetbrains.com/idea/2023/03/new-ui-enhancements-in-intellij-idea-2023-1/)
- [Cursor 2.0 changelog](https://cursor.com/changelog/2-0)
- [Cursor 0.50 changelog (Background Agent)](https://cursor.com/changelog/0-50)
- [Cursor docs dashboard](https://docs.cursor.com/account/dashboard)
- [Cursor Background Agents guide (aitechfy)](https://aitechfy.com/blog/cursor-background-agents/)
- [DeployHQ Cursor 2026 guide](https://www.deployhq.com/guides/cursor)
- [Zed Getting Started](https://zed.dev/docs/getting-started)
- [Zed onboarding design PR #35480](https://github.com/zed-industries/zed/pull/35480)
- [Zed discussion #43158 — Improve No-Workspace Experience](https://github.com/zed-industries/zed/discussions/43158)
- [Zed discussion #10894 — Welcome page toggle](https://github.com/zed-industries/zed/discussions/10894)
- [Andrew Lock — Trying out Zed on Windows](https://andrewlock.net/trying-out-the-zed-editor-on-windows-for-dotnet-and-markdown/)
- [Linear dashboards changelog](https://linear.app/changelog/2025-07-24-dashboards)
- [Linear](https://linear.app/)
- [Linear setup/best-practices guide (Morgen)](https://www.morgen.so/blog-posts/linear-project-management)
- [SignalBox — GitHub/Vercel/Linear notification triage](https://www.signalbox.sh/)
- [Warp Launch Configurations](https://docs.warp.dev/terminal/sessions/launch-configurations/)
- [Warp Session Management](https://docs.warp.dev/features/sessions)
- [Warp Sessions overview](https://docs.warp.dev/terminal/sessions/)
- [Warp blocks guide (aiproductivity)](https://aiproductivity.ai/guides/warp-terminal-guide/)
- [Warp — Small but mighty new features](https://www.warp.dev/blog/small-but-mighty-new-features-in-warp)
- [Dashboard Design Patterns catalog](https://dashboarddesignpatterns.github.io/patterns.html)
- [Pencil & Paper — Data Dashboard UX patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
- [Justinmind — Dashboard design best practices](https://www.justinmind.com/ui-design/dashboard-design-best-practices-ux)
- [UXPin — Dashboard design principles](https://www.uxpin.com/studio/blog/dashboard-design-principles/)
