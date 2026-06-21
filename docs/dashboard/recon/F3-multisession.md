# F3 — Multi-session overview UX in terminals and agent managers

Recon lane for the ClaudeTerminal in-app dashboard / home page. The home page surfaces the user's todos/problems/in-progress items as the PRIMARY content, and shows all live sessions as a SECONDARY glanceable list. This lane studies how existing terminals and Claude-Code session managers present many concurrent sessions at a glance, signal per-session status, and let the user jump in fast. The goal is to steal the proven "see all sessions as a secondary glanceable list" treatment, not the hero treatment.

Read-only web research. Confidence is marked per claim. URLs cited inline.

---

## TL;DR — what to copy for the secondary session list

The single most relevant prior art is **Claude Code's own Agent View** (`claude agents`, shipped May 2026). It is the reference implementation for "many sessions in one list, grouped by what needs you, jump in fast." Copy its model almost wholesale, scaled down to a secondary list:

1. **One compact row per session.** Each row = a state icon + a name + a one-line auto-summary of what the session is doing/needs/produced + a relative timestamp ("3m", "2h"). [High]
2. **Group by attention, not by recency.** Sessions that need you float to the top; "Working" and "Completed" sink below. Concretely, Agent View orders `Needs input` / `Ready for review` above `Working` above `Completed`. [High]
3. **Encode state in BOTH color AND icon shape**, never color alone (accessibility + glanceability). Agent View: color = state (yellow=needs input, green=done, red=failed, dimmed=idle, grey=stopped), shape/animation = process liveness (animated=working, `∙`=process exited, `✢`=loop sleeping). [High]
4. **A one-line summary beats raw output.** Agent View generates the per-row summary with a cheap Haiku-class model so the row tells you what's happening without opening the transcript. For our local app the cheap equivalent is the last meaningful line / last tool call. [High]
5. **Fold the long tail.** Older completed rows collapse into a `… N more` line; failures and anything needing review stay pinned visible. Keeps a secondary list short. [High]
6. **Surface the waiting count where it's passively visible.** Agent View writes the awaiting-input count into the terminal tab title (`2 awaiting input · claude agents`). Our analog: a badge on the home/dashboard nav item. [High]
7. **One click/keypress to jump in.** Row → attach (full session) or peek (inline preview without leaving the list). Number keys / arrow keys for keyboard-first traversal. [High]

For ClaudeTerminal specifically: the session list is SECONDARY, so render it as a **dense sidebar or a single collapsible strip of status rows**, not a kanban board and not a tiled grid. The kanban and tiled-grid patterns below are what you get when sessions are the hero; we explicitly do not want that here.

---

## 1. Claude Code Agent View — the primary reference

`claude agents` opens a full-terminal list of every background session: what's running, what needs input, what's done. This is the closest existing thing to our requirement and the richest documented status model.
Source: https://code.claude.com/docs/en/agent-view

### Row anatomy

From the documented example block:

```
Pinned
  ✽ clawd walk cycle          Write assets/sprites/clawd-walk.png           3m

Ready for review
  ∙ jump physics              Opened PR with collision fix              PR #2048  2h

Needs input
  ✻ power-up design           needs input: double jump or wall climb?       1m

Working
  ✽ collision detection       Edit src/physics/CollisionSystem.ts           2m
  ✢ playtest level 3          run 12 · all checkpoints cleared           in 4m

Completed
  ✻ title screen              result: menu, options, and credits done       9m
  ∙ sound effects             result: 14 SFX exported to assets/audio       4h
  … 6 more
```

Each row = `[state icon] [session name] [one-line summary] [optional PR label] [relative time]`. "Each row shows the session's name, current activity, and how long ago it last changed." [High] (https://code.claude.com/docs/en/agent-view)

### State model (color)

| State | Icon shows as | Meaning |
| :-- | :-- | :-- |
| Working | Animated | Actively running tools / generating |
| Needs input | Yellow | Waiting on a question or permission decision |
| Idle | Dimmed | Nothing to do, ready for next prompt |
| Completed | Green | Finished successfully |
| Failed | Red | Ended with an error |
| Stopped | Grey | Stopped with Ctrl+X / `claude stop` |

[High] (https://code.claude.com/docs/en/agent-view)

### Process-liveness (icon shape, orthogonal to state)

- `✻` or animated `✽` = process alive, replies immediately.
- `∙` = process exited; you can still peek/reply/attach and it restarts where it left off.
- `✢` = a `/loop` session sleeping between iterations; the row shows run count + a countdown.

[High] Key design insight: **state and liveness are two independent axes encoded on the same glyph** (color + shape). That doubles the information per row without adding width. (https://code.claude.com/docs/en/agent-view)

### Grouping and ordering

"Agent view groups sessions so the ones that need input are at the top, with `Ready for review` and `Needs input` above `Working` and `Completed`." Group names don't map 1:1 to states: `Ready for review` = has an open PR; `Completed` collects finished + failed + stopped together. `Ctrl+S` toggles grouping by directory instead of by state, and the choice persists. [High]

Long-tail folding: "Older completed sessions fold into a `… N more` row to keep the list short. Failures and sessions with an open pull request always stay visible." [High] This is exactly the discipline a SECONDARY list needs.

### Per-row summary generation

"The one-line summary in each row is generated by a Haiku-class model so the row can tell you what the session is doing, what it needs, or what it produced without opening the transcript. While a session is actively working, the summary refreshes at most once every 15 seconds, plus once when each turn ends." From v2.1.161, a `done/total` count like `2/5` prefixes the summary when there are parallel work items. [High]
Implication for us: an always-on LLM summary per row is real prior art, but it costs tokens and refresh latency. For a SECONDARY list, the cheaper local fallback (last tool name + target, or last non-empty output line) is fine; reserve LLM summaries for the primary todo content.

### Jump-in interactions

- `↑`/`↓` move between rows; `Space` opens a **peek panel** (most recent output or the pending question) without leaving the list; type a reply + `Enter` to answer inline. [High]
- `Enter` or `→` **attaches** (row becomes the full interactive session). `←` on an empty prompt detaches back to the list. [High]
- `Alt+1`..`Alt+9` attach to sessions 1–9 directly. [High]
- Pressing `←` from any session backgrounds it and opens the list with that row selected — switch sessions without leaving the terminal. [High]
- Filtering by typing in the dispatch input: `s:working`, `s:blocked` (everything waiting on you), `a:<agentname>`, `#<prNumber>`. [High]

### Passive awareness

"The terminal tab title shows the awaiting-input count while agent view is open: `2 awaiting input · claude agents` when sessions need input, or `claude agents` when none do." [High] Cheap, high-value: a count that follows you even when you're not looking at the list.

### PR status as a secondary signal

A `PR #1234` label sits at the right edge of a row, colored by PR status (yellow=checks/review pending, green=passed, purple=merged, grey=draft/closed); multiple PRs collapse to `3 PRs` colored by the one most needing attention. [High] Pattern worth stealing for any row that has an external artifact (a PR, a deploy, a failing check).

---

## 2. Warp — vertical tabs sidebar + tab groups

Warp's terminology: a window holds tabs, a tab holds panes, a pane holds blocks. Tabs and split panes are each independent terminal sessions. [High]
Sources: https://docs.warp.dev/terminal/windows/ , https://docs.warp.dev/terminal/windows/tabs/ , https://docs.warp.dev/terminal/windows/vertical-tabs/

### Vertical tabs (the sidebar) — directly relevant

The vertical tabs panel "is a sidebar that replaces the traditional horizontal tab bar with a richer, more powerful tab management surface. Instead of a single row of tab titles, the panel displays every tab and pane with contextual metadata — **Git branch, working directory, agent conversation status, diff stats**, and more." [High]

"Vertical tabs are especially useful when running multiple coding agents side by side, giving you a clear overview of each session's state without switching tabs." [High] (https://docs.warp.dev/terminal/windows/vertical-tabs/)

This is the canonical "secondary glanceable list as a sidebar" pattern: a left rail where each row carries enough metadata (branch + dir + agent status + diff stats) to know the session's state at a glance, and clicking jumps to it. For ClaudeTerminal, this is the layout to emulate for the live-sessions list.

### Tab groups

"The tab groups feature lets you cluster related tabs under named, collapsible group headers" — e.g. frontend server, backend API, db shell, test runner under one labeled bucket instead of a flat list. [High] (https://docs.warp.dev/terminal/windows/, AlphaSignal coverage: https://alphasignal.ai/news/warp-ships-tab-groups-to-tame-chaotic-multi-agent-terminal-sessions — page returned 403 to the fetcher; cited from search-result summary)

Takeaway: when the list grows, collapsible named groups (by project/repo) keep it scannable. Mirrors Agent View's `Ctrl+S` group-by-directory.

### Sessions overview

Warp documents "Session Navigation helps you quickly switch between active sessions" plus "Session Restoration preserves your windows, tabs, and panes across restarts." [Medium] (https://docs.warp.dev/terminal/sessions/ — page returned 429 to the fetcher; cited from search-result summary)

---

## 3. Wave Terminal — blocks + saved tiled layouts

Wave replaces linear scrollback with **blocks**: every command, AI chat, file preview, and browser embed is a discrete block on a tiled workspace. Blocks can be dragged, resized, grouped, and saved as named layouts. [High]
Sources: https://github.com/wavetermdev/waveterm , https://docs.waveterm.dev/workspaces , review: https://moltamp.com/blog/wave-terminal-review-2026/

- Workspaces are ephemeral by default and deleted on window close unless saved (last window is preserved). [Medium] (https://docs.waveterm.dev/workspaces)
- Scope-switching for command/history search across "current session, other local or remote sessions, or all sessions." [Medium] (https://github.com/wavetermdev/waveterm)
- `wsh` lets you store variables/files and access them across sessions on local and remote machines. [Medium]

Relevance: Wave's model is the **tiled-grid / spatial** approach to many sessions (sessions as the hero). That's the opposite of what our home page wants for the secondary list, but the "save a named layout you return to" idea maps to a saved/pinned set of sessions on the dashboard. Note for the negative space: do NOT make the secondary list a tiled grid; it costs too much screen real estate for a glance.

---

## 4. Maestro — keyboard-first agent fleet, sidebar list

Maestro is a cross-platform desktop app for orchestrating a fleet of AI agents/projects, supporting Claude Code, Codex, OpenCode, Factory Droid, Copilot-CLI. [High]
Source: https://github.com/RunMaestro/Maestro

- **Sidebar-based, keyboard-first.** `Cmd/Ctrl+N` new agent, `Cmd/Ctrl+[` / `]` prev/next agent, `Cmd/Ctrl+B` toggle sidebar. Cmd+K quick actions, rapid agent switching, focus management. [High]
- Per-session: conversation history, isolated context, **real-time token usage and cost tracking per session and globally**, draft auto-save/restore per session. [Medium]
- **At-a-glance / passive awareness:** "Speakable Notifications" — audio alerts with text-to-speech when agents complete tasks. [Medium]
- Auto-discovers and imports existing sessions from all supported providers; browse, search, star, rename, resume any session. [Medium]
- "Aggregated statistics with multiple time ranges, agent performance comparisons, activity distribution analysis, and real-time updates with configurable colorblind-friendly palettes." [Medium]
- Message queueing: queue messages while the agent is busy; sent automatically when it becomes ready — implies a busy/ready state indicator per row. [Medium]

Takeaways for us: (a) **per-session cost/token readouts** are a metadata column other managers find worth showing; (b) **star/pin + rename** are table-stakes list affordances; (c) audio/TTS completion alerts are a low-cost passive-awareness channel; (d) colorblind-friendly palettes reinforce the don't-rely-on-color-alone rule.

---

## 5. Kanban-board orchestrators — Crystal, Conductor, Vibe Kanban, Nimbalyst

A whole class of Claude-Code managers present sessions as **cards flowing across columns**, where cards move automatically on real activity signals.
Sources: https://nimbalyst.com/blog/claude-code-session-kanban-organize-ai-agents/ , https://github.com/BloopAI/vibe-kanban , https://vibekanban.com/ , https://www.augmentcode.com/tools/open-source-agent-orchestrators

### The auto-flow status model (very relevant even if we don't use a board)

Nimbalyst's columns: **Backlog → In Progress → Waiting → Review → Done**. Cards move on behavior:
- "When an agent starts running, the card moves to 'In Progress.'"
- "When it asks a question, it moves to 'Waiting.'"
- "When it finishes, it moves to 'Review.'"
[High] (https://nimbalyst.com/blog/claude-code-session-kanban-organize-ai-agents/)

Another phrasing of the same auto-signal model: "When Claude starts working, the card jumps to In Progress. When it stops and needs input, it moves to Waiting and **sends you a push notification**. When a PR opens, it shifts to In Review." [High] (search summary of nimbalyst)

Card contents: "session name, project, agent type, last activity." Click a card → full conversation, file changes, visual diff; review/approve/merge from the board. "color-coding indicates status at a glance." [High/Medium]

### Crystal / Conductor

- **Crystal** — Electron app for multiple Claude Code sessions in parallel git worktrees: persistent conversation tracking, built-in git ops, change visualization, **desktop notifications**. [Medium] (Augment Code list)
- **Conductor** — macOS app, run many Claude Code/Codex agents in parallel, each in its own worktree; "see what each agent is working on and review or merge their pull requests from a central dashboard." [Medium]

### Vibe Kanban

Kanban CLI + web UI; "switch between 10+ coding agents" from a central view; each workspace gives an agent a branch, a terminal, and a dev server; review diffs, leave inline comments, open PRs from the UI. Bloop wound down the hosted service early 2026; project continues open-source. [Medium] (https://github.com/BloopAI/vibe-kanban)

**Why this matters for us even though we want a list, not a board:** the *state machine* is the reusable part. Backlog/InProgress/Waiting/Review/Done with auto-transitions on activity signals is the same taxonomy as Agent View's groups, just laid out horizontally. Our secondary list should derive each row's state from the same signals (running / waiting-on-input / done / has-PR-or-artifact / failed) and reflect it as the row's group + color + icon. The push-notification-on-Waiting is the cross-cutting "needs you" channel.

---

## 6. tmux, Windows Terminal, Tabby — the classic terminals

These are the baseline. They give you *spatial* multi-session (panes/tabs) but weak *status-at-a-glance* — useful mostly as a list of what NOT to rely on, plus a couple of cheap signals.

### tmux

- Multiplexer: many sessions/windows/panes in one view; `Ctrl+B w` opens a window/session chooser tree across all sessions. [High] (https://github.com/tmux/tmux/wiki/Getting-Started , https://tmuxcheatsheet.com/)
- DIY dashboards: scripts auto-tile one pane per session for monitoring; the status bar can be customized to show session/window state. [Medium] (https://medium.com/@droid.tang/... , https://www.nebulacentre.net/articles/server_dash/server_dash.html)
- The `Ctrl+B w` chooser is the closest native analog to a glanceable list: a navigable tree of sessions/windows you arrow through and Enter to jump. Low-fi but proven. [High]

### Windows Terminal

- Tabs + split panes; **color-coded profile icons + customizable tab titles so you "spot the right one at a glance."** [Medium] (https://learn.microsoft.com/en-us/windows/terminal/panes , https://www.howtogeek.com/673729/...)
- **Broadcast input** to all panes via Command Palette (`Ctrl+Shift+P` → "Toggle broadcast input to all panes"). [High] Relevant only if we ever want "send this to N sessions at once."
- No built-in per-session activity/status beyond bell/title; status-at-a-glance is left to the shell prompt.

### Tabby

- Profiles get names, icons, and colors; grouped by function/location; freely rearrangeable split panes savable as a profile. [High] (https://tabby.sh/about/features)
- Remembers open tabs and restores full terminal state. [Medium]
- Can dock to the side and place tabs on the bottom — i.e. it supports a side rail of sessions, but again no live status metadata in that rail. [Medium]

**Takeaway:** the classic terminals prove that **color + icon + name on each tab** is enough to *identify* a session at a glance, but none of them surface *activity/attention* in the tab strip. That gap is exactly what Agent View, Warp vertical tabs, and the kanban tools fill — and exactly what our secondary list must fill.

---

## 7. Status-indicator design principles (design-system grounding)

For implementing the per-row status cleanly in React/Tailwind/shadcn.
Sources: https://carbondesignsystem.com/patterns/status-indicator-pattern/ , https://mobbin.com/glossary/status-dot , https://createui.co/components/status-badge

- **Never encode status by color alone.** Pair color with an icon and/or text label for accessibility and to survive grayscale/colorblindness. (Carbon status-indicator pattern; reinforced by Agent View's color+shape and Maestro's "colorblind-friendly palettes.") [High]
- **A status dot is a single colored dot, no label**, that pairs naturally with avatars, list items, cards, and data tables — i.e. cheap to drop at the left edge of a session row. Match the variant to meaning (success=online/done, away=idle, danger=error). [High] (https://createui.co/components/status-badge , https://mobbin.com/glossary/status-dot)
- **Consolidate to the highest-attention color.** "When multiple statuses are consolidated, use the highest-attention color to represent the group — if statuses are green, yellow, and red, the consolidated indicator should be red." [High] Directly applicable to the nav-badge that summarizes the whole session list: if any session needs you, the badge is the "needs-you" color. Mirrors Agent View's multi-PR label "colored by the open pull request that most needs attention."
- **Spinners for short indeterminate work; progress bars for measurable work.** A working session = animated/indeterminate (a spinner glyph), matching Agent View's animated `✽`. A session with `done/total` counts can show a determinate mini-progress. [Medium] (https://www.smashingmagazine.com/2016/12/best-practices-for-animated-progress-indicators/)

---

## 8. Concrete recommendation for ClaudeTerminal's secondary session list

A synthesis tuned to "secondary, glanceable, click to jump." Each is traceable to prior art above.

1. **Layout: a dense left/right sidebar rail or a single collapsible "Live sessions" strip below the primary todo content.** Not a board, not a tiled grid. (Warp vertical tabs = the layout; Wave tiled grid + kanban boards = explicitly rejected because they make sessions the hero.) [High]
2. **Row = `[status dot/glyph] [name] [one-line activity] [right-edge: relative time + optional artifact badge]`.** (Agent View row anatomy.) [High]
3. **Two-axis glyph: color = state, shape/animation = liveness.** Yellow needs-you, green done, red failed, dimmed idle, animated working. Always pair with an icon, never color alone. (Agent View + Carbon.) [High]
4. **Sort by attention.** Needs-you and has-result rows on top; working in the middle; completed/idle fold into `… N more`. (Agent View grouping + long-tail fold.) [High]
5. **Group by project/repo when the list is long** (collapsible headers). (Warp tab groups; Agent View `Ctrl+S`.) [High]
6. **A single summary badge on the dashboard/home nav item** = count of sessions needing you, colored by highest attention. (Agent View tab-title count + Carbon consolidate-to-highest.) [High]
7. **Click/keypress behaviors map to the prompt's three actions:**
   - Click a row → jump to that live session (Agent View attach; per the prompt, "jump to a new PowerShell tab" if the row is a problem/todo). [High]
   - Hover/secondary action → copy the row's text (the activity line / the question it's waiting on). (Maps to prompt's "copy text"; Agent View peek shows the same text.) [High]
   - A row's "open new Claude session pre-loaded with a query" → equivalent to Agent View dispatch from the list input; pre-seed the prompt from the todo/problem text. [High]
8. **Keyboard-first traversal**: arrow keys move selection; Enter jumps in; number keys (1–9) jump to the first N; a key to toggle the list collapsed. (Agent View + Maestro.) [High]
9. **Passive completion/needs-you alert** via OS notification (Electron `Notification`) when a session flips to Waiting or Done — cheap, and every kanban tool + Crystal/Maestro does it. [High]
10. **Cheap per-row summary first; LLM summary optional.** Use last tool call / last non-empty line as the activity text by default. (Agent View uses Haiku per row, but that's a token cost we can defer for a secondary surface.) [High]

### What to deliberately NOT do
- Don't make the session list the visual hero (the prompt forbids it; Wave/kanban tiled layouts are the anti-pattern). [High]
- Don't encode status by color only. [High]
- Don't show full transcripts in the list; one line + peek-on-demand. (Agent View.) [High]
- Don't let completed sessions accumulate unbounded; fold them. (Agent View.) [High]

---

## Open questions / gaps for downstream lanes

1. **Data source for session state in a local Electron app.** Agent View reads `~/.claude/jobs/<id>/state.json` and exposes `claude agents --json` (entries with `cwd`, `kind`, `startedAt`, `id`, `state` ∈ working/blocked/done/failed/stopped, plus `waitingFor`). If ClaudeTerminal sessions are node-pty PowerShell tabs (not `claude --bg` background jobs), we have no equivalent state file — we must derive state from PTY output heuristics or our own session model. Needs a dedicated lane. [High] (https://code.claude.com/docs/en/agent-view)
2. **What counts as a "session" here.** The prompt frames live sessions as PowerShell tabs in the app. Agent View / Warp / Maestro sessions are richer (agent conversation status, diff stats, PR). Decide how much of that metadata applies to a plain PowerShell tab vs a Claude session tab.
3. **Summary generation cost.** Per-row LLM summaries (Agent View's Haiku approach) vs cheap last-line heuristic — decide given the local/offline constraint and token budget.
4. **Two pages I could not fully fetch** (cited from search-result summaries only, marked [Medium]): Warp vertical-tabs doc (429) and AlphaSignal tab-groups (403). The core claims (sidebar with branch/dir/agent-status/diff-stats metadata; collapsible named tab groups) appear in multiple sources, so confidence stays usable, but a downstream pass with an authenticated fetcher could confirm exact metadata fields.

---

## Sources

- Claude Code Agent View (primary): https://code.claude.com/docs/en/agent-view
- Claude Code run agents in parallel: https://code.claude.com/docs/en/agents
- Warp windows/tabs: https://docs.warp.dev/terminal/windows/
- Warp tabs: https://docs.warp.dev/terminal/windows/tabs/
- Warp vertical tabs: https://docs.warp.dev/terminal/windows/vertical-tabs/
- Warp sessions: https://docs.warp.dev/terminal/sessions/
- Warp tab groups (multi-agent): https://alphasignal.ai/news/warp-ships-tab-groups-to-tame-chaotic-multi-agent-terminal-sessions
- Wave Terminal: https://github.com/wavetermdev/waveterm
- Wave workspaces: https://docs.waveterm.dev/workspaces
- Wave review: https://moltamp.com/blog/wave-terminal-review-2026/
- Maestro: https://github.com/RunMaestro/Maestro
- Nimbalyst Claude Code kanban: https://nimbalyst.com/blog/claude-code-session-kanban-organize-ai-agents/
- Nimbalyst session managers compared: https://nimbalyst.com/blog/best-session-managers-for-claude-code-and-codex/
- Vibe Kanban: https://github.com/BloopAI/vibe-kanban , https://vibekanban.com/
- Open-source agent orchestrators (Crystal, Conductor, etc.): https://www.augmentcode.com/tools/open-source-agent-orchestrators
- tmux getting started: https://github.com/tmux/tmux/wiki/Getting-Started
- tmux cheat sheet: https://tmuxcheatsheet.com/
- tmux monitoring dashboard: https://medium.com/@droid.tang/a-bash-script-creates-tmux-split-windows-monitoring-multiple-tmux-sessions-on-server-side-a1fd3115a0bd
- Windows Terminal panes: https://learn.microsoft.com/en-us/windows/terminal/panes
- Windows Terminal overview: https://www.howtogeek.com/673729/heres-why-the-new-windows-10-terminal-is-amazing/
- Tabby features: https://tabby.sh/about/features
- Carbon status indicator pattern: https://carbondesignsystem.com/patterns/status-indicator-pattern/
- Mobbin status dot: https://mobbin.com/glossary/status-dot
- Create UI status badge: https://createui.co/components/status-badge
- Smashing Magazine progress indicators: https://www.smashingmagazine.com/2016/12/best-practices-for-animated-progress-indicators/
