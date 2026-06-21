# Lane C — Actionable Data Sources + Unified Item Model

Recon for the always-on in-app dashboard / home page inside ClaudeTerminal (Electron + React 19 + TS + node-pty + shadcn/Tailwind). The home page makes the user's todos / problems / in-progress items the PRIMARY content, shows live sessions as a SECONDARY glanceable list, and lets a click route to (a) a new PowerShell tab, (b) copy text, or (c) a NEW Claude session pre-loaded with a query.

Read-only investigation. Confidence is marked per claim. No patient data is reproduced here; PHI sensitivity is called out per source.

Date: 2026-06-20. App repo of record for code citations: `infrastructure/claude-terminal/` (the dashboard build target `infrastructure/claude-terminal-dashboard/` is a file-identical clone at recon time).

---

## 1. Feed inventory

Every reachable source of "todo / problem / in-progress" items for this user, with how to read it, what it costs, latency, and PHI sensitivity.

| # | Source | Item kinds it yields | How to read it | Auth / refresh cost | Latency | PHI sensitivity | Confidence |
|---|---|---|---|---|---|---|---|
| C1 | **Live ClaudeTerminal sessions/tabs** (in-process) | `in_progress` (working tab), `problem`/`blocker` (`requires_response` tab waiting on the user) | In-memory: `TabManager.getAllTabs()` in main; renderer already mirrors via `getTabs()` + `onTabUpdate`/`onTabRemoved` events | Free, in-process. No network. Already wired | Real-time (hook-driven push) | None (tab names are user-authored; could *contain* a PHI string but the dashboard renders them, doesn't transmit) | High |
| C2 | **Todoist** | `todo` (active tasks), urgency via priority/due | `connections/todoist.py list-tasks [--filter "today \| overdue"]`, JSON out | `TODOIST_API_TOKEN` in `connections/.env`; one HTTPS call to api.todoist.com | ~0.3–2s per call; office fiber can time out | Low. Tasks are Mark's own; a task title *could* name a patient. Keep titles off any web search | High |
| C3 | **GitHub issues** (per repo) | `problem` (bug-labeled), `todo` (enhancement), `blocker` (high/critical) | `gh issue list --repo <slug> --state open --json number,title,labels,state,updatedAt,url` | `gh` CLI 2.95.0, already authenticated as `markwhat1`. One subprocess per repo | ~0.5–1.5s per repo; 60s+ for all repos serially | None (public-ish issue metadata; these repos are private but issues carry no PHI by policy) | High |
| C4 | **program-board `state.json`** (derived rollup) | `in_progress`/`blocker`/`problem` at the *program* level: lane, age_color, needs_you + reasons, DoD gaps, rolled-up open issues | Read one JSON file the board already writes every 60s: `dashboard/state.json` at workspace root | Free file read IF the program-board service runs; else stale/absent | 60s (git poll) / 300s (enrichment) staleness by design | None (deliberately non-PHI; it is git + gh + diag metadata only) | High |
| C5 | **Session activity / learnings** (recency signal) | recency enrichment for `in_progress` (a repo touched without a commit still reads active) | Read `~/.claude/learnings/*.jsonl`, fold `cwd` -> latest `timestamp` (program-board already does this) | Free file read; 90 jsonl files present at recon | Per-session append; minutes | None (paths + timestamps only) | High |
| C6 | **cad-portal `/diag`** | `problem`/`blocker`: deployed-SHA drift, unhealthy `/health`, scrubbed error-log tails | `connections/diag.py --section deployed\|health\|errors`, JSON out | `DIAG_TOKEN` in `.env`; HTTPS to portal (LAN/tailnet). 404 when feature off | ~1–15s (HTTP timeout 15s default) | None by contract: endpoint returns ONLY non-PHI, non-secret data (`connections/docs/diag.md:5`) | High |
| C7 | **Open Dental tasks** (`task`/`tasklist` tables) | `todo`/`problem`: OD tasks as staff-communication logs; specialist referral-letter review queue | Raw SELECT via `connections/opendental.py query "..."` (no task-specific helper exists) | `OD_DB_*` (reporting user, SELECT-only) in `.env`; MariaDB at 192.168.0.5 | ~0.5–3s on LAN; retries built in | **HIGH.** OD tasks routinely name patients. This is PHI. Must NOT be a default feed; see MVP gating below | Med (table use confirmed via memory `huddle-task-referral-workflow`; exact columns not re-verified this pass) |
| C8 | **Workspace memory / CLAUDE.md "suggested"** | `todo` candidates: projects mentioned in continuity notes / memory but with no live repo card | program-board already derives `suggested[]` in `state.json` from continuity + memory filenames (`poller.py:110`) | Free (rides C4) | Same as C4 | None (project names only) | High |

### Notes that shape the design

- **C1 is the only true real-time, zero-cost feed and it is already in the app.** Tab status flows hook -> named pipe -> `hook-router.ts` -> `TabManager.updateStatus` -> `tab:updated` broadcast. Statuses are `new | working | idle | requires_response | shell` (`src/shared/types.ts:1`). The dashboard maps `working` -> `in_progress` and, importantly, `requires_response` -> a `problem`/`blocker` ("Claude needs your input") which belongs in the PRIMARY list, not the secondary session strip. The full live-tab list (`working`, `idle`, `shell`) is the SECONDARY glanceable strip.
- **C4 is a force multiplier.** The program-board already fuses git + gh issues (C3) + diag (C6) + learnings (C5) + memory (C8) into one file with lane/urgency/needs-you already computed. Consuming `state.json` gets the dashboard five sources for the cost of one file read, and avoids re-implementing the 60s/300s refresh, the `gh`/`diag` best-effort error handling, and the needs-you scoring (`status.py:55`). The catch: it is a separate nssm service writing to a path on the same PC. If the dashboard wants independence, it can shell `gh`/`diag` itself, but that duplicates work the board already does.
- **No clipboard API exists in the preload bridge** (verified: no `clipboard`/`copy` in `src/preload.ts` or `ipc-handlers.ts`). The copy action uses the renderer's `navigator.clipboard.writeText()` directly; no new IPC needed.
- **There is no "spawn Claude pre-loaded with a query" IPC today.** `tab:create` spawns `claude` with permission/worktree/resume flags only (`ipc-handlers.ts:390`), no initial prompt. Two viable routes, see section 3 actions.

---

## 2. The unified dashboard-item schema

One shape every feed normalizes into. The renderer sorts/filters/groups on the common fields; the `actions` payload carries everything the three buttons need so the click handler stays dumb. PowerShell/JSON form below; this is a data contract, not committed code.

```ts
/** One actionable item on the dashboard home page. */
interface DashboardItem {
  // --- identity ---
  id: string;            // stable, source-prefixed: "todoist:8012345678",
                         // "gh:cad-portal#19", "tab:tab-1718...-ab12",
                         // "program:program-board", "od-task:<hash>", "diag:cad-portal:deploy"
  source: ItemSource;    // "tab" | "todoist" | "github" | "program-board" | "diag" | "od-task"
  kind: ItemKind;        // "todo" | "in_progress" | "problem" | "blocker"

  // --- display ---
  title: string;         // one line, already human-readable
  detail?: string;       // optional second line (due date, label, needs-you reason, log snippet)
  project?: string;      // workspace project / repo slug, e.g. "cad-portal". Drives grouping
  badges?: string[];     // small chips: ["high"], ["overdue"], ["needs input"], ["blocked"]

  // --- ranking (dashboard sorts by these) ---
  urgency: 0 | 1 | 2 | 3;        // 3=critical/blocker, 2=high/needs-you, 1=normal, 0=ambient
  recencyIso: string | null;     // last-touched / updated / due ISO8601; null = unknown
  ageColor?: "green" | "yellow" | "orange" | "red";  // reuse program-board age bands

  // --- provenance / dedup ---
  url?: string;          // canonical external link (todoist task, gh issue) for "open in browser"
  raw?: unknown;         // original source object, untouched, for debugging / future fields

  // --- routing: everything the three buttons need, no source lookups at click time ---
  actions: ItemActions;
}

type ItemSource = "tab" | "todoist" | "github" | "program-board" | "diag" | "od-task";
type ItemKind   = "todo" | "in_progress" | "problem" | "blocker";

interface ItemActions {
  /** (a) Jump to / open a PowerShell tab. */
  powershell?: {
    cwd?: string;               // workspace-relative or absolute dir to open the shell in
    // If the item already maps to a live shell/claude tab, prefer focusing it:
    focusTabId?: string;        // existing tab to switch to instead of spawning
  };

  /** (b) Copy text to clipboard (navigator.clipboard.writeText in the renderer). */
  copy?: {
    text: string;               // exact text to copy (issue URL, task title, a ready command)
    label?: string;             // toast label, e.g. "Copied issue link"
  };

  /** (c) Open a NEW Claude session pre-loaded with a query. */
  claudeQuery?: {
    projectId?: string;         // target project; omit to use the item's `project`
    cwd?: string;               // dir to start the session in (repo root or worktree)
    prompt: string;             // the query to inject as the first user turn
    permissionMode?: "default" | "plan" | "acceptEdits" | "bypassPermissions";
  };

  /** Optional: focus the live session this item represents (used by C1 in-progress items). */
  focusTab?: { tabId: string };
}
```

### Why these fields

- **`id` is source-prefixed** so dedup across feeds is a string compare and React keys are stable across refreshes.
- **`kind` vs `urgency` are separate.** Kind drives the icon/section ("todo" vs "problem"); urgency drives sort order. A `todo` can be urgent (overdue) and a `problem` can be low. Mapping rules:
  - tab `requires_response` -> kind `blocker`/`problem`, urgency 3.
  - tab `working` -> kind `in_progress`, urgency 1 (secondary strip unless it has been working a long time).
  - gh issue with `high`/`critical` label -> kind `problem`, urgency 3; bug -> `problem` urgency 2; else `todo` urgency 1. (Priority labels match the program-board set `{high, critical}`, `enrich.py:1`.)
  - todoist priority 4 or overdue -> urgency 3/2; else 1.
  - program-board `needs_you === true` -> urgency 2–3 with `detail` = first `needs_you_reasons` entry (`status.py:55`).
  - diag deploy-drift / unhealthy -> kind `blocker`, urgency 3.
- **`ageColor` reuses the program-board bands** (green <3d, yellow <7d, orange <14d, red >=14d; `status.py:22`) so the home page and the program-board read consistently.
- **`actions` is denormalized on purpose.** The click handler never re-queries a source; it reads `actions.claudeQuery.prompt` and calls the IPC. This is what keeps the secondary "click to route" interaction one function deep.

### Per-source population cheat sheet

| Source | id | kind | urgency seed | url | actions emphasis |
|---|---|---|---|---|---|
| tab (`requires_response`) | `tab:<tab.id>` | blocker | 3 | — | `focusTab` + `powershell.focusTabId` |
| tab (`working`) | `tab:<tab.id>` | in_progress | 1 | — | `focusTab` |
| todoist | `todoist:<task.id>` | todo | from priority/due | `task.url` | `copy`(title), `claudeQuery`(task as prompt), `openExternal(url)` |
| github | `gh:<repo>#<n>` | problem/todo | from labels | `issue.url` | `claudeQuery`("Fix issue #n: <title>"), `copy`(url), `openExternal` |
| program-board | `program:<slug>` | in_progress/blocker | from needs_you | — | `claudeQuery`(resume program), `powershell.cwd`=repo |
| diag | `diag:cad-portal:<sig>` | blocker | 3 | — | `claudeQuery`("Investigate portal: <snippet>"), `copy` |
| od-task | `od-task:<hash>` | todo/problem | from OD priority | — | `copy`(scrubbed), `powershell` — NEVER `claudeQuery` by default (PHI) |

---

## 3. Routing actions — how each button reaches the app

The dashboard is a renderer surface, so it calls the existing `window.claudeTerminal` preload API (`src/preload.ts`). Gaps are flagged.

### (a) Jump to a new PowerShell tab — READY
`createShellTab('powershell', afterTabId?, cwd?)` exists (`preload.ts:34` -> `tab:createShell` `ipc-handlers.ts:515`). Pass `actions.powershell.cwd` as the third arg to open the shell in the item's repo. To *focus an existing* tab instead, use `switchTab(tabId)` (`preload.ts:38`).
- Caveat: `tab:createShell` always activates the new tab (`alwaysActivate: true`, `ipc-handlers.ts:545`). Good for this use.

### (b) Copy text — READY (renderer-side)
No preload method; the dashboard component calls `navigator.clipboard.writeText(actions.copy.text)` directly. Electron renderer with `contextIsolation` still has `navigator.clipboard` for the focused window. Confirmed there is no existing clipboard IPC to reuse or conflict with.

### (c) New Claude session pre-loaded with a query — NEEDS A SMALL ADDITION
No current IPC injects an initial prompt. `tab:create` only sets CLI flags (`ipc-handlers.ts:390`). Two implementation routes for the build lane (not built here):

1. **Write-after-ready (no main-process change to spawn):** call `createTab(projectId, ...)`, then on the next `tab:ready`/`idle` for that tab id, `writeToPty(tabId, prompt + "\r")`. Pro: uses only existing IPC. Con: timing/ordering against the hook that flips status to idle; the renderer must correlate the returned `tab.id` with a later `onTabUpdate`. Fragile but zero new surface.
2. **New IPC `tab:createWithPrompt(projectId, prompt, opts)` (recommended):** mirror `tab:create`, then once the PTY is wired, queue the prompt to be written after the CLI signals ready. This is the clean path and matches the existing `noun:action` IPC convention (AGENTS.md). It needs the full new-channel checklist from AGENTS.md (handler + preload + `global.d.ts` + registration test + a remote-parity decision in `ws-bridge.ts`).
   - Open question for the build lane: does `claude` accept an initial prompt as a positional arg / `-p`? If so the prompt can be a spawn arg instead of a PTY write, which is more robust than either route above. Verify against the installed CLI before choosing (per workspace rule: inspect the real interface, don't assume).

### Opening external links (todoist/github) — READY
`openExternal(url)` exists (`preload.ts:112` -> `shell:openExternal`). Also supports `todoist://` deep links if desired.

---

## 4. Recommended MVP feed set vs later

### MVP (ship first) — three feeds, all low-cost and already reachable

1. **C1 live tabs** — it is in-process, real-time, free, and it is the literal subject of the app. `requires_response` tabs are the highest-signal "needs you" items and cost nothing. This alone justifies the home page.
2. **C3 GitHub issues** — `gh` is authenticated and fast per repo; cad-portal already carries 5 open issues including 3 high-severity bugs, so the feed has real content on day one. Drive the repo list from `repos.conf` at the workspace root (`repos.py`).
3. **C2 Todoist** — one authenticated HTTPS call returns Mark's actual todos. This is the "todo" pillar of the page. Use the `today | overdue` filter for the urgent band and a plain `list-tasks` for the rest.

These three cover all four item kinds (todo from Todoist/issues, in_progress + blocker from tabs, problem from issues) with no PHI exposure and no new long-running infrastructure.

### Strong MVP+ (add as soon as the three work): **C4 program-board `state.json`**
If the program-board service is running, reading its one JSON file folds in C5 (session recency), C6 (diag deploy/health), C8 (suggested projects), and a *program-level* rollup of C3 with needs-you scoring already done. It is the single highest-leverage add. Treat it as optional/best-effort: if the file is missing or stale, the three MVP feeds still stand. Show a subtle "board last updated 4m ago" stamp from `generated_at`.

### Later / gated

- **C6 diag standalone** — only if not already getting it through C4. Useful for a dedicated "portal health" tile, but it is a 15s-timeout HTTP call; keep it off the hot path and cache like the board does (300s).
- **C7 Open Dental tasks — GATE BEHIND AN EXPLICIT OPT-IN.** This is the one PHI feed. OD tasks name patients. Per the workspace PHI posture (minimize what the LLM/dashboard *renders*, never send patient names to a web search or a Claude query), if this is ever surfaced it must: (1) be off by default, (2) render only scrubbed/initials text, (3) never auto-populate `actions.claudeQuery.prompt` with raw task text, (4) never feed `openExternal`/web. Most of the OD-task value is already captured non-PHI-ly through the existing `/cad:od-referral-review` workflow and OD itself. Recommendation: leave C7 out of the dashboard entirely for v1.

### Refresh cadence (MVP)
- C1: event-driven, no polling.
- C2 + C3: poll on an interval (start at 60–120s) and on window focus. Both can time out on office fiber; render last-good and a "refreshing" hint rather than blocking.
- C4: read the file on the same 60s tick (it is already debounced by the board's own poller).

---

## 5. Risks, open questions, integration points

### Risks
- **program-board coupling.** Depending on `state.json` couples the dashboard to a separate nssm service and a workspace-root path. If the board is down, the dashboard must degrade gracefully (MVP three feeds are independent, so this is contained).
- **PHI leak via C7 or via tab/task titles.** OD tasks are PHI; even a tab name or a Todoist title could contain a patient name. The `claudeQuery` and `openExternal` actions are the leak vectors. Never auto-route raw text from a PHI-capable field to a web search or external link without scrubbing.
- **`claudeQuery` reliability.** Until the spawn-with-prompt path is verified against the real CLI, the write-after-ready fallback can mis-time and drop or duplicate the prompt. Verify the CLI interface before committing the UX to it.
- **Office network timeouts.** Todoist + diag + gh all hit the network; the office ~100Mbps fiber congests (memory `feedback_office_internet`). Treat every network feed as best-effort with last-good rendering.
- **Repo fan-out latency for C3.** Serial `gh issue list` across ~12 repos can exceed 60s. Parallelize, or piggyback on C4 which already aggregates issues per program.

### Open questions (for the build lane)
1. Does the installed `claude` CLI accept an initial prompt as a positional arg or `-p`? That decides whether `claudeQuery` is a clean spawn arg vs a PTY write.
2. Is the program-board service actually running on this PC, and is `state.json` written to workspace-root `dashboard/state.json` here? (The path is configured in `program_board/config.py` — confirm before wiring C4.)
3. Should the dashboard be a new in-app route/view in the renderer, or the startup view that replaces the StartupDialog landing? (Affects how C1's live `getTabs()` is bootstrapped.)
4. Remote-parity: should the web-remote client (`ws-bridge.ts`) see the dashboard and its actions, or is it local-only? AGENTS.md requires an explicit decision per new channel.

### Integration points / data points (concrete)
- Live tabs: `TabManager.getAllTabs()` (`src/main/tab-manager.ts:51`); statuses `src/shared/types.ts:1`; status flow `src/main/hook-router.ts:121-141`; renderer access `getTabs()`/`onTabUpdate` (`src/preload.ts:42,159`).
- PowerShell action: `createShellTab` (`src/preload.ts:34`, handler `ipc-handlers.ts:515`).
- Claude-session action: `createTab` (`src/preload.ts:30`, handler `ipc-handlers.ts:336`); no prompt injection today.
- External links: `openExternal` (`src/preload.ts:112`).
- Todoist: `connections/todoist.py list-tasks --filter` (`connections/docs/todoist.md:61`).
- GitHub: `gh issue list --json number,title,labels,state,updatedAt,url` (shape confirmed live against cad-portal).
- program-board state: `state.json` shape `{generated_at, programs[], suggested[]}` (`program_board/state.py:17`, assembled `poller.py:78-116`); per-program fields lane/age_color/needs_you/needs_you_reasons/dod/issues (`poller.py:63-72`).
- diag: `connections/diag.py --section deployed|health|errors` (`connections/docs/diag.md`).
- Repo list source: `repos.conf` at workspace root (`infrastructure/program-board/src/program_board/repos.py`).
- Session recency: `~/.claude/learnings/*.jsonl` (90 files present), folded by `program_board/learnings.py`.
