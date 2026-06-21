# 00 — Consolidated Reconnaissance Brief: ClaudeTerminal In-App Dashboard / Home Page

**Date:** 2026-06-20
**Synthesizes:** A (integration surface), B (program-board portability), C (data sources + item model), D (action routing), E1-E7 (ADHD design lenses), F1-F3 (IDE-home prior art, information hierarchy, multi-session UX), G (user context).
**For:** the planning team designing the always-on Home view inside ClaudeTerminal (Electron 40 + React 19 + TS + Vite + node-pty + shadcn/Tailwind v4).
**The product, in one line:** a personal command center whose hero is "what's stuck / what needs me" (todos, problems, 90%-done dev work), with live Claude/PTY sessions as a quiet secondary strip, and every item one click from (a) a PowerShell tab, (b) copied text, or (c) a new Claude session pre-loaded with a query.

Read-only recon, no code changed. Code claims carry `file:line` from the lane docs; confidence is called out where the underlying lanes hedged.

---

## 1. Verified integration surface

The lanes that read the app source (A, C, D) agree: the app already has every primitive the Home page needs except one small addition for prompt injection. Confidence: high across these, read directly from source.

### 1.1 Mounting the Home view

**Decision: a pinned, renderer-only `TabType: 'home'` tab, synthesized in the renderer, default-active on launch (Strategy H1, Lane A §1, §8).** Rationale:

- The renderer renders one `<Terminal>` per tab unconditionally (`App.tsx:577-583`). Branch on `tab.type === 'home'` to render `<HomeView/>` instead, so xterm is never instantiated and the main process never spawns a PTY for it.
- Add `'home'` to `TabType` (`types.ts:3`). Leave the `Tab` shape unchanged (Home uses `pid:null`, `sessionId:null`, `shellType:null`).
- Persistence is free: `doPersistSessions` already filters to `type === 'claude'` (`index.ts:119`, `:141`), so a `'home'` tab is auto-excluded from `sessions.json`. Synthesize Home in the renderer after restore in all three start paths (`App.tsx:333-344`, `:514-527`, and the reload path `App.tsx:303-316`), prepend at index 0, set it active.
- **Critical guard (Lane A §9 risk #2, high impact):** the `allTabs.length === 0 -> createTab` fallbacks (`App.tsx:341-344`, `:524-527`) and the per-project "no tabs -> createTab" branch (`App.tsx:142-145`) must count only real (claude/shell) tabs, or a phantom Claude tab spawns behind Home.
- State to pass HomeView as props (no external state lib exists; all state is local in `App.tsx`): `tabs` (unfiltered, for cross-project), `projects`, `tabCounts` (`App.tsx:87-102`), `activeProjectId`, and handlers `handleSelectTab`, `handleNewShellTab`/`handleNewDefaultShellTab`, `createTab`, `writeToPty`, plus a new `openClaudeWithPrompt` helper.

The IDE prior-art lanes (F1) independently reach the same conclusion: the home of an agentic tool must be a working surface, not a logo-and-links splash (VS Code's documented "dead splash" lesson, issues #63152, #122702). And F1's open question #2 ("real tab or special view?") is answered by Lane A: a non-PTY tab type that renders React.

### 1.2 Creating tabs (PowerShell + Claude)

- **PowerShell tab:** reuse `tab:createShell` as-is (`preload.ts:34` -> `ipc-handlers.ts:515`). It takes `(shellType, afterTabId?, explicitCwd?)`; `explicitCwd` wins (`:531-535`) and the new tab auto-activates (`alwaysActivate:true`, `:545`). Pass `'powershell'` as the shell id (`platform.ts:15`). No new IPC.
- **Claude tab:** reuse `tab:create` (`preload.ts:30` -> `ipc-handlers.ts:336`). Inherits permission flags, optional worktree, optional resume.

### 1.3 Injecting a query into a new Claude session (the one real gap)

Lane D verified the CLI directly (claude 2.1.183): `claude [options] [prompt]` starts an **interactive** session and **auto-submits** the positional prompt; `-p/--print` is non-interactive and wrong here; there is no flag to prefill-without-submit (GitHub issue #11476, closed not-planned). Two mechanisms, with a decided primary (see §3.3 for the cross-lane reconciliation):

- **Primary (Lane D):** thread an optional `initialPrompt` into a Claude-spawn channel and append it as the **final positional argv** after all flags. Pair with a **native-binary spawn** fix: resolve `C:/Users/Mark/.local/bin/claude` (a native binary, not a `.cmd` shim) instead of `cmd.exe /c claude`, which removes cmd.exe quoting hazards for prompts with `&`, `"`, `%`, etc. (Lane D Action 3). Confidence: high that positional auto-submits; medium on cmd.exe special-char quoting, which the native-binary path eliminates.
- **Fallback (Lanes A, C, D):** `createTab`, then on the tab's first `new -> idle` transition (the `tab:ready` SessionStart hook -> `hook-router.ts:104/106` -> `tab:updated` -> renderer `onTabUpdate` `App.tsx:354-364`), `writeToPty(tabId, query + '\r')`. Submit with **CR (`\r`), never `\r\n`** (Ctrl+Enter precedent `keybindings.ts:66`). Gate on the FIRST transition to avoid the `--resume` double-SessionStart double-send (`hook-router.ts:108-112`). Confidence: high that the write submits; medium on ready-timing.

New-channel checklist if `initialPrompt`/`tab:createWithPrompt` is added (AGENTS.md): main handler + preload + `global.d.ts` (auto via `typeof api`) + registration-test assertion (`tests/main/ipc-handlers.test.ts:184-209`) + explicit remote-parity decision + `docs/ipc.md` update.

### 1.4 Copy to clipboard

Renderer-only `navigator.clipboard.writeText(text)`. No IPC exists or is needed; established pattern in `RemoteAccessButton.tsx:64` and `Terminal.tsx:260`, with a "Copied!" -> revert beat. Optional Electron-main `clipboard` fallback only if focus-related failures appear (Lane D Action 2).

### 1.5 Open external links

`openExternal(url)` exists (`preload.ts:112` -> `shell:openExternal`) for Todoist/GitHub deep links (Lane C §3).

### 1.6 Persistence

Two tiers already exist (Lane A §4): global settings (`claude-terminal-settings.json` in userData) and per-directory `sessions.json` (`<projectDir>/.claude-terminal/`). Home needs no persistence (renderer-synthesized). A new todo/capture store, if built, should follow the app's `fs.readFileSync/writeFileSync` JSON pattern (AGENTS.md "No electron-store") — ownership and scope (per-workspace vs global) is an open question (E2 §7, E5 §6).

### 1.7 Remote/local parity (decide explicitly per AGENTS.md)

`tab:createShell` is local-only (no web-remote handler, `web-remote-server.ts`); `tab:create`/`pty:write` exist remotely. Recommended: Home is local-desktop UX; if any preload method is added, stub it in `ws-bridge.ts` and document local-only. A remote dashboard "open shell" click would otherwise silently no-op (Lane D edge cases, Lane A §9 risk #4).

---

## 2. Unified data model + recommended feeds

### 2.1 The user's task surfaces (Lane G §2) — what "todos/problems/in-progress" actually are

Mark thinks in **programs, not tasks**, and his work lives across four surfaces the Home page unifies:

- **Surface A — Programs (dominant, the PRIMARY hero content).** ~25 programs across ~15 repos, a program can span multiple repos. Already modeled in `dashboard/state.json`.
- **Surface B — Live Claude/PTY sessions (the SECONDARY glanceable strip).** The app's own data; "which session needs me" is the chime made visual.
- **Surface C — Reminders/decisions (Todoist push, Telegram async).** Cross-session memory; READ these, never become a 4th competing todo store (`feedback_task_hygiene.md`).
- **Surface D — Practice-operational realities (context, not a feed).** Keep OUT of the dev home page except where one already exists as a `time-sensitive` program card (e.g. a dated PHI-send watch).

### 2.2 The unified item schema (Lane C §2)

One shape every feed normalizes into; `actions` is denormalized so the click handler never re-queries a source. Key fields: `id` (source-prefixed for stable dedup/React keys), `source`, `kind` (`todo | in_progress | problem | blocker`), `title`, `detail`, `project`, `badges[]`, `urgency` (0-3), `recencyIso`, `ageColor` (reuse program-board bands), `url`, and `actions: { powershell?, copy?, claudeQuery?, focusTab? }`. **Kind drives the icon/section; urgency drives sort order** (a todo can be urgent, a problem can be low). The temporal lane (E3) adds a hard prerequisite: `Tab` carries **no timestamps** today (`types.ts:7-21`); add `statusSince` (stamped in `TabManager.updateStatus`, `tab-manager.ts:55-58`) and `lastActivityAt` so the strip can say "idle 4 min" vs "idle 2 h" (completely different signals). This new field touches IPC/remote parity (the `Tab` type is broadcast).

### 2.3 Feed inventory (Lane C §1) and MVP vs later

Eight reachable feeds (C1 live tabs, C2 Todoist, C3 GitHub issues, C4 program-board `state.json`, C5 learnings recency, C6 cad-portal `/diag`, C7 Open Dental tasks, C8 memory "suggested").

**MVP (ship first), all low-cost and already reachable:**

1. **C1 live tabs** — in-process, real-time, free, the literal subject of the app. `requires_response` tabs are the highest-signal "needs you" items at zero cost. Drives all four item kinds' in-progress/blocker side via the hook -> named-pipe -> `hook-router.ts` -> `tab:updated` pipe (Lane A §6).
2. **C3 GitHub issues** — `gh` authenticated, fast per repo; cad-portal already carries 5 open issues (3 high-severity). Drive the repo list from `repos.conf`.
3. **C2 Todoist** — one authenticated HTTPS call returns Mark's real todos; `today | overdue` for the urgent band.

**Strong MVP+ (highest leverage single add): C4 program-board `state.json`.** Reading this one file folds in C5 (recency), C6 (diag), C8 (suggested), and a program-level rollup of C3 with needs-you scoring already computed. Treat as best-effort: if missing/stale, the three MVP feeds still stand; show a "board last updated Nm ago" stamp from `generated_at`.

**Later / gated:**

- **C6 diag standalone** — only if not already arriving via C4; 15s-timeout HTTP, keep off the hot path, cache like the board (300s).
- **C7 Open Dental tasks — GATE BEHIND EXPLICIT OPT-IN, recommend leaving out of v1 entirely.** This is the only PHI feed; OD tasks name patients. If ever surfaced: off by default, scrubbed/initials only, never auto-populate `claudeQuery.prompt` with raw task text, never feed `openExternal`/web. Most of its value is already captured non-PHI via `/cad:od-referral-review`.

**Refresh cadence:** C1 event-driven (no poll); C2+C3 poll 60-120s + on window focus, render last-good with a "refreshing" hint (office fiber times out, `feedback_office_internet`); C4 on the same 60s tick (already debounced by the board).

---

## 3. Action-routing mechanics (the three click-actions)

Decided mechanics, reconciled across Lanes A, C, D.

### 3.1 Open a PowerShell tab — READY, reuse

`createShellTab('powershell', activeTabId, cwd)`. Pass the item's repo dir (`WORKSPACE_ROOT` + repo path from program `repos[]`) as `cwd`. Note two flagged gaps (out of scope, file issues): (1) `tab:createShell` does not validate `explicitCwd` before `pty.spawn` (`ipc-handlers.ts:531`), a bad path throws — add an `fs.existsSync && isDirectory` guard falling back to `workDir`; (2) the option spawns `powershell.exe` (5.1), not `pwsh.exe` (7), while the workspace convention is PS7 — a `pwsh` shell option may be wanted (`platform.ts:15`).

### 3.2 Copy text — READY, renderer-only

`navigator.clipboard.writeText(actions.copy.text)` + a per-card "Copied!" beat. The copy payload composes from already-plain-string fields: `blocked_on`, `needs_you_reasons`, DoD gap labels (Lane B §3.1), or a paste-ready PowerShell command (Mark wants paste-ready PS for CADDC02 work; never SSH, he uses RDP — `feedback_no_ssh_to_caddc02.md`).

### 3.3 New Claude session pre-loaded with a query — small addition (see §1.3)

**Reconciliation of the contradiction between lanes:** Lane D (which verified the CLI live) recommends the **positional-prompt spawn + native-binary** path as primary; Lanes A and C lean on the **write-after-ready (`tab:ready`-gated `writeToPty`)** path because it needs no spawn change. Both are valid; the planning team should treat **positional-prompt as primary and write-after-ready as the documented fallback** (Lane D's own recommendation), and run a build-time spike on cmd.exe special-char quoting before committing. The query composes from card fields: e.g. `"Unblock <name>: <blocked_on>. Remaining DoD: <gaps>"` or, for `needs-your-decision` items, the decision context (Lane B §3.1, Lane G §3.6). For avoidance/blank-page items, frame as "draft the first version of X" so a dreaded create-task becomes a tolerable review-task (E5 P6, E7 F4) — this is the single highest-leverage action.

**Per-item action hierarchy (all ADHD lanes agree):** ONE primary button, the rest demoted to small/quiet secondary icons. Never a row of equal-weight buttons (E1 AP4, E2 P8, E4 A8, E5 anti-pattern 7, E6 P10, F2 anti-pattern). Primary is usually the pre-loaded Claude session (it pays the whole initiation cost in one click); copy and PowerShell are subordinate.

### 3.4 PHI / security guardrails (Lane D, Lane C, Lane G)

Never put patient data in spawn argv or logs (args appear in process listings + `logger`). Keep injected queries generic. cwd values come from trusted sources (`repos.conf`/git/override YAMLs), not free text, validated against known project roots. Practice items stay general (a date + label, never a name).

---

## 4. program-board: bring in vs consume from `:5173`

Lane B's verdict, reinforced by G: **adopt the value-computation MODEL wholesale as the Home page's information architecture; consume the DATA from the server/file; do not re-derive git/gh/diag in Electron.**

### 4.1 Adopt as the IA spec (the rules are the product)

- **NEEDS-YOU band as the primary hero region.** `status.needs_you` + `needs_you_reasons[]` map one-to-one onto "todos/problems/in-progress as PRIMARY"; each reason is already a clickable, human-readable one-liner (`status.py:55-73`).
- **The five-lane lifecycle** (backlog/active/blocked/done/paused) with strict precedence (`status.compute_lane`, `status.py:32-42`) as the secondary structure under the hero. Reuse verbatim so the two boards never disagree.
- **Age-as-color** (green <3d, yellow 3-6, orange 7-13, red >=14d; `status.py:22-29`) as the at-a-glance staleness cue. `age_days` is freshened by session activity, so today's touch reads green even with no commit.
- **The DoD `gaps[]`-by-name** as the "what's the last 10%" line, and **`almost done: <gap>`** (all-but-one DoD met) as the 90%-killer needs-you reason. This is the project's whole reason to exist (Lane G req #5).
- **The closed tag set** `{needs-CADDC02, needs-your-decision, time-sensitive}` — do not invent new ones; `waiting-on-external` was deliberately rejected (if the ball is in someone else's court it stays a quiet `blocked_on` note, not a scream). Lanes E7/E3 note the six personal avoidance categories are NOT in this set — see Contradictions §10.
- **`blocked_on` free text** as the richest "what's stuck and why" actionable prose.
- **needs-you-first, oldest-first sort** (`poller.py:115`). The board is already ordered for "what should I look at."

### 4.2 Consume, never re-derive

Git polling (`gitinfo.py`, every 60s), network enrichment (`gh run list`, `gh issue list`, `connections/diag.py`, 300s cache, fail-safe), triangulation (repos.conf + continuity H3 + `project_*.md`), and the per-program YAML store all stay on the server. Re-running 19+ `git` fans from Electron would duplicate work and could collide with the user's own git ops.

### 4.3 How to read it (Lane B §3.3)

**Primary: read `C:/Users/Mark/Claude-Code/dashboard/state.json` from disk with `fs.watch`** (atomically written via temp + `os.replace`, so no half-reads; near-instant on each 60s write; survives the Flask port being down). **Fallback: `GET http://127.0.0.1:5173/api/state`.** Ignore the HTMX `/partials/board` (HTML, useless to React). This makes the dashboard resilient to the service being down and avoids hard coupling to `:5173`.

### 4.4 What program-board structurally cannot provide

- **No live-session awareness.** It tracks programs/repos, not running PTY/Claude tabs. The SECONDARY session strip is the Electron app's own data.
- **No HTTP push** (HTMX-polled, no SSE/websocket). Poll the endpoint or watch the file.
- **`suggested[]` is noisy** (35 entries, many stale/done). If shown at all, filter heavily or treat as a low-priority "untracked" drawer, never primary.
- **Brief two-file inconsistency** (state.json DoD gaps vs enrichment.json ci): treat `gaps` as authoritative-at-poll-time; re-poll resolves it.

### 4.5 Division of responsibility (Lane B §4)

Server owns: git facts, gh/diag enrichment, triangulation, YAML resolution, value-rule computation. Electron owns: reading state into the app (fs.watch + HTTP fallback, push to renderer via IPC), rendering the Home page, the three click actions, and the live-session secondary strip. If full decoupling is ever wanted, `status.py` is ~70 lines, trivially portable to TS with `state.json`'s raw fields as inputs.

---

## 5. ADHD design principles — prioritized, de-duplicated, with anti-patterns

Seven lanes (E1-E7) converge hard. The single most-repeated finding, stated by every lane and by Mark's own documented model (J.O.T., "1 recommendation not 10," "batch so initiation is paid once"): **surface ONE recommended next action as the hero; everything else is calm and secondary.** The convergence of the independent UX research with the user's personal model is the strongest signal in the recon.

### Tier 1 — Non-negotiable (every lane)

- **PRINCIPLE 1: One hero, and the hero is a TODO/needs-you item, not the session grid.** A single large card owns the hero zone (J.O.T. "Just One Thing"). Make it win by **turning the volume down on everything else**, not by inflating it (E4 P1-P2, E1 P1, E2 P1, E3 P1, E5 P1, F2 §1). Limit loud elements to a max of two. Dominance has exactly three levels (dominant / sub-dominant / subordinate; a fourth destroys the contrast — Smashing/IxDF, F2 §1).
- **PRINCIPLE 2: Pre-load the action; clicking an item must never drop the user at a blank prompt.** The "open a new Claude session pre-loaded with a query" action embodies "pay the initiation cost once." The work of figuring out *what to ask* is done at capture/item time and replayed on click (E1 P3, E2, E3 P8, E5, G req #6).
- **PRINCIPLE 3: One primary action per item, secondary actions demoted.** Three actions max, one obviously primary (E1 P2/AP4, E2 P8, E4 P8, E5 #7, E6 P10).
- **PRINCIPLE 4: Always-on default landing surface; visible = exists.** The Home page IS external working memory and a body double; an item not on screen does not exist to an ADHD brain (object permanence). It must be the default tab, reachable in one keystroke (E1 P5, E2 P3, E7 P1).
- **PRINCIPLE 5: Calm by default; reserve saturated color/motion for "needs you" only.** Muted secondary, generous whitespace around the hero, color as signal not decoration, update-in-place, no auto-reflow/auto-expand/auto-scroll on poll, respect `prefers-reduced-motion` (E4 P4-P7/P9, E6 P8, F2 Lever 3-4, F3 status-color rules).

### Tier 2 — High leverage

- **PRINCIPLE 6: `requires_response` is the single highest-leverage signal.** A session waiting on the user is an open loop with near-zero cost to act (the next step is already decided); promote it INTO the primary zone, it can outrank the `@now` todo (E1 §4.4, E2 P7, E6 F1, E7 P7). It is already computed per-project (`App.tsx:88-98`) with a `text-attention` color (`StatusBar.tsx:15`).
- **PRINCIPLE 7: Frictionless capture, sub-2-second, zero required fields, one inbox.** A persistent global capture bar; Enter saves raw; no project/due/priority/title at capture. Capture and triage are separate jobs, never fused (E2 P2/P5/P6). Triage (assign `@now/@next/@later`, turn a thought into a query) is a separate batched mode off the hero.
- **PRINCIPLE 8: Every time value is relative and color-coded, never a raw timestamp.** "running 38 min", "idle 2 h", "stalled 3 d", "due in 2 d" — never force a subtraction. Prefer count-up over countdown for active work (countdowns induce anxiety). Anchor nudges to events, not clock-times (E3 P2/P7/P8, F3 row anatomy). Requires the `statusSince`/`lastActivityAt` fields (§2.2).
- **PRINCIPLE 9: Progressive disclosure; `@now` visible, `@next`/`@later` collapsed behind one "+N more."** Never three equal columns (that rebuilds the wall). Backlog is findable, not visible (E2, E3 P3, E4 P3/F5, F1, F2 §3).
- **PRINCIPLE 10: Escalate salience, never guilt; vary the form to beat habituation.** Stale/deferred items get MORE visible (color drift -> badge -> bubble to hero), never a red "OVERDUE/FAILED" stamp. Avoidance items + self-esteem sensitivity mean shame fuels avoidance. Escalation is visual-on-surface first; a single batched push is the last resort, never repeating identical toasts (E1 P5/AP6, E3 P6, E4 F6/A9, E5 P7, E6 P9/F6, E7 P4/C2/C3).

### Tier 3 — Refinement / polish

- **PRINCIPLE 11: Immediate, restrained completion feedback.** On finish, the row settles/checks and the next `@now` item slides into the hero; tick a small "N done today / left this week" count. Reward the REAL state change, scaled to achievement; no confetti for trivia, no app-milestone celebration, no hard streaks (loss aversion) — if any streak exists, reward *showing up* with grace days, not output (E1 P6, E4 P9/F7, E5 P2/P3/P5/P9, E7 P10).
- **PRINCIPLE 12: Pull over push; protect hyperfocus; batch interruptions.** The dashboard holds state silently so the user chooses when to glance (an involuntary switch costs ~23 min). Split "finished" (quiet) from "needs you" (may push); coalesce bursts into one summary; a Focus state that mutes non-blocking signals (auto when the active tab is `working`); defer to natural breakpoints; no notification center (the dashboard IS the state) (E6 P1-P9/F1-F9).
- **PRINCIPLE 13: The dashboard as body double + check-in ritual.** Present, aware, non-chattering. A morning "commit to one thing" intake (cue-bound to first-open, not a fixed alarm) and an optional evening "what closed / what carries" review give the day a beginning and an end. The hero becomes a commitment mirror ("your one thing today"). One-tap, judgment-free "not now" everywhere; accountability legible and user-controllable; coaching copy through one place, verb-first, no hollow praise (E7 F1-F10).
- **PRINCIPLE 14: Pattern-interrupt the oscillation.** On detected stall (home focused N seconds with no action, or the same item repeatedly skipped), collapse to just the one card / pulse the primary / offer "5 minutes on this?" / shrink to a binary. Fire only on detected stall so it is a feature, not nagging (E1 P8, E5 P8, E7 P9). Trigger heuristic needs tuning (open question).

### Anti-patterns (consolidated, the "do NOT" list)

- **AP-A: The wall of cards / flat scrollable backlog as the hero.** Equal-weight everything = freeze. (E1 AP1, E2, E3, E4 A1, E5 #1)
- **AP-B: Session grid/board/tiled-layout as the hero.** The obvious-but-wrong default for a "session manager"; sessions are status, not the primary work. Use a dense list/strip, not a kanban or tiled grid (those make sessions the hero). (E1 AP9, E4 A1, E7, F2 AP1, F3 §"NOT to do", G req #2)
- **AP-C: Blank-slate launch.** Clicking an item -> empty prompt/fresh shell throws the initiation cost back at the worst moment. (E1 AP2)
- **AP-D: Setup gauntlet.** Asking project/mode/dir/branch before the user can act. Pick defaults, act, let them adjust after. (E1 AP3)
- **AP-E: Equal-weight action rows / menu of equal options when stuck.** Reimposes choice paralysis per item. (E1 AP4, E4 A8, E5 #7, E7 C7)
- **AP-F: Silent decay.** Letting a deferred item drift to the bottom and vanish = deletion for an ADHD brain. (E1 AP5, E2, E3, E7 C9)
- **AP-G: Punitive/red-everywhere urgency, guilt/shame framing.** Hammering avoided items with shame increases avoidance. (E1 AP6, E5 #6, E7 C2)
- **AP-H: Three equal J.O.T. columns.** Three full lists = three walls. Collapse `@next`/`@later`. (E4 A2, F2 #6)
- **AP-I: Badge soup / count everywhere; per-session color in the rail.** Spends the color budget so the rare needs-you accent can't spike; default to dots, reserve counts for one aggregate. (E4 A3-A4, F2 #4-#5, F3 status rules)
- **AP-J: Auto-expand / auto-reorder / auto-scroll on poll; carousels; spinners per row.** Uninvited motion is a self-inflicted interruption; update in place. (E2, E4 A5-A7, E6 A2, F2 #7)
- **AP-K: Toast per event / no quiet-hours / no focus respect / notification center as a second inbox.** Each push is a 23-min risk; bursts compound; an alert log creates a new completion loop to chase. (E6 A1/A4/A6, E4 A9)
- **AP-L: Gamification as decoration; confetti for everything; hard streaks; over-celebration; fake/inflated progress.** Hollow rewards add load and burn the dopamine response; loss aversion produces shame spirals. (E1 AP8, E4 A10, E5 #2-#5)
- **AP-M: Status by color alone.** Pair color with icon/shape (accessibility + colorblindness; the app already has 8 project hues — fine as quiet identity tags, dangerous at full saturation). (F3 §7, E4 A4)
- **AP-N: Nagging/chatty/surveillance coaching; demanding an explanation to dismiss; empty-state that reads as failure.** (E7 C1/C4/C8/C11, E4 A12)

---

## 6. UX / information hierarchy (sessions secondary)

The layout lanes (F1, F2, F3) plus the ADHD lanes give a concrete, opinionated structure. The hard inversion: this is a *session manager* whose home does NOT lead with sessions. The mature move (GitHub demotes repos to a rail and leads with a feed; Linear leads with a work list and mutes the sidebar; email's workhorse is the message list, not the folder nav) is to make the **actionable list the workhorse pane and the session list the cold edge** (F2 §4).

### 6.1 Three dominance levels (F2 §1, F1 §8)

| Level | Content | Treatment |
|---|---|---|
| **Dominant (hero)** | The one `@now` / top needs-you item | Largest, highest-contrast, isolated by whitespace, top-left/above-fold, the page's one accent on its primary button. A card. |
| **Sub-dominant** | The rest of the actionable list (next few todos/programs), `@next`/`@later` collapsed | One step down in scale/contrast; scannable list, not cards. |
| **Subordinate** | The live-sessions rail + ambient status | Smallest, lowest-contrast, dense, peripheral; quiet until one row earns the accent. |

Levers (F2 §2): SIZE (hero card >> list row >> session row), POSITION (hero top-left golden-triangle; sessions on the cold right edge or bottom strip), CONTRAST (muted field, one saturated accent reserved for hero CTA + the single needs-you dot), WHITESPACE (airy hero, tight rail — density contrast itself signals hierarchy), DENSITY/FORM (card for hero, compact list for rail). Practitioner ratios as starting points: ~40/30/20/10 space rule; rail 240-280px.

### 6.2 The PRIMARY content (triage spine, F1 §5)

Render todos/problems/in-progress as a Linear/SignalBox-style triage list: a single-number glance metric on top ("3 need you / 2 working"), then a filterable list where each row is actionable inline (the three affordances live on the row). Sort: `requires_response` -> problems/blockers -> in-progress -> the rest. Severity/age color on the left edge.

### 6.3 The SECONDARY session strip (Agent View model, F3)

Claude Code's own Agent View (`claude agents`, May 2026) is the reference implementation. Copy scaled down to a strip:

- **One compact row per session:** `[status dot/glyph] [name] [one-line activity] [right edge: relative time + optional artifact/PR badge]`.
- **Group by attention, not recency:** needs-you on top, working in the middle, completed/idle fold into "… N more."
- **Two-axis glyph:** color = state (yellow needs-input, green done, red failed, dimmed idle, animated working), shape/animation = liveness. Always pair color with icon (never color alone).
- **Group by project/repo** with collapsible headers when long; reuse the app's per-project grouping + `--project-hue` tint (as a thin desaturated identity tag, not a fill).
- **One aggregate needs-you badge** on the Home/nav item, colored by highest attention.
- **Layout:** a dense right rail (Warp vertical tabs) or a single collapsible bottom strip; responsive (rail when wide, strip when narrow). NOT a board, NOT a tiled grid.
- **Click = jump** (reuse `handleSelectTab`/`switchTab`, `App.tsx:113-121`); keyboard-first traversal; cheap per-row summary (last tool call / last non-empty line) by default, LLM summary deferred for cost.

### 6.4 Mandatory states + the "working surface" rule (F1)

Empty/loading/error states are mandatory (omitting reads as unfinished). The empty state reads as momentum ("you're clear — here's your next thing" / the program-board's verbatim **"Clear. Keep working."** copy, `board.html:13`), never "No sessions. Nothing here." The home must DO something on open (VS Code's dead-splash lesson). Default-on with an escape hatch (VS Code's `workbench.startupEditor` analog); a Focus-mode toggle collapses to only the hero (E4 F8).

### 6.5 Illustrative Monday-morning shape (Lane G §4)

A NEEDS-YOU band of ~4 items, each with the single missing step + one-gesture action (time-sensitive PHI-send watch first because it has a clock; two `needs-your-decision` items offering a pre-loaded Claude session; a red 14-day-stalled doc-pipeline card); an ACTIVE and a BLOCKED/PAUSED secondary group; a quiet LIVE SESSIONS strip at the bottom with the "idle / your turn" flag replacing the chime; a one-line backlog + done-this-week footer.

---

## 7. User-specific requirements (Lane G §3, plus cross-lane)

1. **Mark Whatcott, DDS** — solo dentist + heavy solo developer (~25 programs, ~15 repos, all via Claude Code), MST. The dashboard serves the dev hat; practice realities leak in only via existing time-sensitive program cards.
2. **ADHD (the load-bearing fact).** Core failure mode the dashboard exists to kill: work left "90% done," last 10% stalls invisibly. Honor J.O.T., one-recommendation, batch-to-pay-initiation-once.
3. **Programs are PRIMARY, sessions SECONDARY** (req #2). Do not make the session grid the hero.
4. **Reuse `dashboard/state.json`**; do not re-derive git/CI/diag; the two boards never disagree (req #3, §4).
5. **Honor the closed tag set + lane names verbatim** (req #4). No new taxonomy.
6. **The 90%-done all-but-one-DoD item must be impossible to lose**, rendered by name with the single missing check (req #5).
7. **Three click-actions matching how he unblocks** (req #6): Open PowerShell tab (for `needs-CADDC02` server actions, PS7, cd'd to the repo); Copy text (paste-ready PowerShell / decision text / Danielle-forward notes; never SSH to CADDC02, RDP only); New Claude session pre-loaded with a query (for `needs-your-decision`, seeded with context).
8. **Single recommended next action, not a wall** (req #7).
9. **Direct, voice-y, em-dash-free copy** (req #8). Verb-first buttons. No "Great! Here's your dashboard." No AI-slop words. (`CLAUDE.md`, `feedback_communication_style.md`)
10. **PowerShell 7 is the shell** — the open-terminal action spawns PowerShell, not bash.
11. **Away-from-keyboard most of the day; batches decisions.** Async reach is Telegram (phone) + Todoist (push) only. Any escalation that leaves the in-app surface must be a single batched Telegram/Todoist nudge, never a competing notifier (E7 §7, G).
12. **Loopback / single-user / no PHI.** Work PC only, never CADDC02; no patient data ever rendered or sent; practice items general (date + label, never a name).
13. **Surface avoidance-pattern items even with no git activity** (req #11). A financial follow-up or Danielle delegation has zero commits to age it, so it stays pinned by tag, not recency. The six avoidance areas: financial confrontation, system documentation, delegation to Danielle, completing-the-loop, personal health, marketing homework.
14. **Staleness visible at a glance via age color** (req #10), because invisible staleness is the failure being solved.

---

## 8. Decisions already supported by the recon (low-risk to lock in)

- Mount Home as a pinned, renderer-only `TabType:'home'`, default-active, with the fallback-spawn guards fixed.
- Reuse `tab:createShell` (PowerShell) and `navigator.clipboard` (copy) as-is; add one Claude-with-prompt path (positional-prompt primary, write-after-ready fallback).
- Consume `dashboard/state.json` via `fs.watch` (HTTP `/api/state` fallback); adopt program-board's needs-you/lane/age-color/DoD model as the IA; never re-derive git/gh/diag.
- MVP feeds: C1 live tabs + C3 GitHub issues + C2 Todoist; C4 program-board as the high-leverage MVP+ add; C7 Open Dental excluded from v1.
- Hero = one needs-you/`@now` item; sessions = a dense Agent-View-style secondary strip (color+icon, group-by-attention, fold the tail); three dominance levels; progressive disclosure of `@next`/`@later`.
- Add `statusSince`/`lastActivityAt` to the session model + a relative-time formatter as the prerequisite for time-aware signals.

---

## 9. Unknowns (planning must resolve)

1. **Todo/capture store ownership + schema.** No todo store exists in the app. If a capture inbox (E2) / J.O.T. horizons / avoidance categories + age are wanted, who owns the store, per-workspace or global, what schema? Several ADHD features (capture bar, avoidance nudges, completion/done lane, triage mode) depend on this. (E2, E4, E5, E7)
2. **cmd.exe special-char quoting for the positional prompt.** Needs a build-time spike; the native-binary spawn path is expected to remove it but must be verified.
3. **`tab:ready` propagation to the renderer** for the write-after-ready fallback timing (Lane D flagged medium confidence on the exact propagation; verify in `ipc-server.ts`).
4. **Is the program-board service actually running here, and is `state.json` at workspace-root `dashboard/state.json`?** Confirm path/uptime before wiring C4.
5. **Hero-selection (the "one thing") logic.** Who picks it — auto-rank (requires_response > escalated-stale > top `@now`), hand-pinned, or both? Linear's "Focus" auto-orders; this is a product-logic decision. (E1, E2, E4, E5, F2)
6. **Threshold tuning** for the session-scale color ramp and idle/stall promotion (E3's session-scale numbers are extrapolated from the program-board day-scale and need a real-usage pass).
7. **Notification policy changes to shipped behavior:** does Mark want the "Claude finished" (idle) toast at all? Splitting it from `requires_response` is a behavior change to `hook-router.ts:125-141` and should be a setting. Coalescing-window length, escalation thresholds, OS Focus-Assist interaction. (E6 §7)
8. **Pattern-interrupt + stall-detection trigger heuristics** (repeat home opens without action is a candidate but could misfire; needs instrumentation). (E1, E5, E7)
9. **Remote/web-client parity** for Home, its actions, Focus state, and notification policy — an explicit AGENTS.md decision per channel.
10. **Streak appetite** — does Mark want any streak even a soft "checked in N days," given loss-aversion risk? Default to none/soft, confirm. (E5, E7)
11. **Resurfacing mechanism** for parked items (time-based, on launch, on review) — the trust hinge for the capture system; must be specified, not implicit. (E2)
12. **Right rail vs bottom strip vs responsive** for the session list — needs a render test at real window widths. (F2, F3)

---

## 10. Contradictions / tensions between sources

1. **Prompt-injection mechanism (Lane D vs Lanes A/C).** D (verified the live CLI) prefers the positional-prompt + native-binary spawn as primary; A and C lean on write-after-ready (`tab:ready`-gated `writeToPty`) because it needs no spawn change. Resolution: treat positional-prompt as primary with write-after-ready as the documented fallback (D's own recommendation), gated on a build-time quoting spike. Not a true conflict, but the two sets of lanes recommend different defaults.
2. **The avoidance-category gap (E7/E3 vs program-board's closed tag set).** E7 (and E3, E4 F6) want nudges targeted to Mark's six personal avoidance areas (financial, documentation, delegation, completing-the-loop, health, marketing), but the program-board's closed tag set is `{needs-CADDC02, needs-your-decision, time-sensitive}` and Lane G req #4/#5 says honor it verbatim, invent no new taxonomy. Resolution path (planning must choose): either map avoidance categories onto a separate lightweight todo source (not program tags), or accept that avoidance-targeted nudges degrade to "surface oldest" for program cards. This is a real data gap, not a wording quibble.
3. **Pattern-interrupt vs interruption-protection (E1/E5/E7 vs E6).** A pattern-interrupt is a deliberate interruption to break a stuck loop; E6's whole thesis is to minimize interruptions and protect hyperfocus. E6 reconciles it: pattern-interrupts must be user-pulled or breakpoint-timed, never a surprise push. Planning should encode that constraint so the two intents don't collide.
4. **Reminder/escalation reach (E7 §7 vs `feedback_telegram_workflows.md`).** E7 floats escalating an aged avoidance item to a Telegram nudge when Mark is away; the workspace rule retired scheduled briefings and wants Telegram batched, with no competing notifier. Resolution: any off-app escalation is a single batched Todoist/Telegram message via existing channels, opt-in, never a new notifier. (E7 flags this itself; confidence medium it's even worth it.)
5. **"Idle/finished" toast policy is a change to shipped behavior (E6 F3).** Demoting the existing `idle` "Claude finished" OS toast to a quiet dashboard update is a behavior change some users rely on; must be a setting with an explicit default, not a silent removal. Flagged as needing a user decision, not a contradiction between lanes but between the recon recommendation and current shipped code.
6. **Minor data-quirk (Lane B §3.4).** Live `state.json` showed cad-staff-portal DoD gaps `[merged, deployed, ci]` while `enrichment.json` reported cad-portal `ci:true` — a transient cross-file inconsistency at poll boundaries. Consume `gaps` as authoritative-at-poll-time; re-poll resolves. Not a design conflict, a consumption note.

---

## Appendix: source artifacts

All under `C:/Users/Mark/Claude-Code/infrastructure/claude-terminal-dashboard/docs/dashboard/recon/`:
A-claude-terminal-integration.md, B-program-board.md, C-data-sources.md, D-action-routing.md, E1-exec-function.md, E2-working-memory.md, E3-time-blindness.md, E4-overwhelm.md, E5-dopamine.md, E6-interruption.md, E7-coaching.md, F1-ide-home.md, F2-hierarchy.md, F3-multisession.md, G-user-context.md.

Key external references for the data backbone: program-board source at `infrastructure/program-board/src/program_board/` (esp. `status.py`, `poller.py`), outputs `dashboard/state.json` + `dashboard/enrichment.json`, inputs `repos.conf` + `dashboard/programs/*.yml`. App source at `infrastructure/claude-terminal/src/` (esp. `App.tsx`, `shared/types.ts`, `main/ipc-handlers.ts`, `main/hook-router.ts`, `preload.ts`).
