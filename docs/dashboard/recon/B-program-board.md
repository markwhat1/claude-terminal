# Lane B Recon: program-board Portability into the ClaudeTerminal In-App Dashboard

**Date:** 2026-06-20
**Scope:** Read-only investigation of `C:/Users/Mark/Claude-Code/infrastructure/program-board` to extract its data model, value-computation rules, and decide what to bring INTO the ClaudeTerminal Electron home page vs what to consume from the running program-board server (`:5173`).
**Target consumer:** an always-on in-app home page inside ClaudeTerminal (React 19 + TS + Vite + node-pty + shadcn/Tailwind), where todos/problems/in-progress are the PRIMARY content, live sessions are a SECONDARY glanceable list, and clicking an item can (a) open a new PowerShell tab, (b) copy text, or (c) open a NEW Claude session pre-loaded with a query.

A note up front on doc location: the two plan docs named in the task brief do NOT live inside the program-board repo. They live at the **workspace** level: `C:/Users/Mark/Claude-Code/docs/plans/2026-06-20-program-dashboard-design.md`, `.../2026-06-20-program-board-implementation.md`, and a third `.../2026-06-20-program-board-phase2.md`. Cited accordingly below.

---

## 0. What program-board actually is (verified)

A single Python service (`uv` + Flask + waitress + PyYAML), nssm-managed on the work PC (`cad-doctor`), loopback `127.0.0.1:5173`, read-only. Two cooperating loops in one process:

- A **60s git poller** (`__main__._poll_loop`, `__main__.py:94-100`) builds `dashboard/state.json` from `repos.conf` + per-program YAML + `git` + session learnings + a cached enrichment layer.
- A **Flask board** (`web.py:22-37`) renders `state.json` as HTML and self-refreshes via HTMX `every 10s` (`templates/board.html:10`).
- A **300s enrichment cache** (`__main__.get_enrichment`, `__main__.py:54-72`) runs the expensive network calls (`gh run list`, `gh issue list`, `connections/diag.py`) decoupled from the git poll, written to `dashboard/enrichment.json`.

Build status: Phase 1 + Phase 2 shipped, 13 test modules, last commit `5f296eb`. Confirmed against the live `dashboard/state.json` (19 program cards) and `dashboard/enrichment.json` (real `gh`/`diag` data present).

The whole thing is ~450 lines of pure-ish Python across 11 modules. That matters for the portability call: this is small enough to re-derive in TypeScript if we want to, but it is also already-built and already-correct.

---

## 1. The exact data model + `state.json` schema

### 1.1 `repos.conf` (input) — `C:/Users/Mark/Claude-Code/repos.conf`

Tab-separated `local-folder-path<TAB>github-clone-url`, paths silo-relative to the workspace root. Blank lines and `#` comments skipped. Lines without a tab skipped (`repos.py:5-13`). Live file has 19 active repos plus the skip-listed `practice-analytics/KPI reports`.

```
branded-docs	https://github.com/markwhat1/branded-docs.git
cad-portal	https://github.com/markwhat1/cad-portal.git
open-dental/od-updater	https://github.com/markwhat1/OD.git
...
```

`repos.py:16-19` filters out `config.SKIP_REPOS` (`{"practice-analytics/KPI reports"}`, `config.py:18`).

### 1.2 Per-program override YAML (input) — `C:/Users/Mark/Claude-Code/dashboard/programs/<slug>.yml`

Optional. Lives at the **workspace root** (`config.PROGRAMS_DIR = WORKSPACE_ROOT / "dashboard" / "programs"`, `config.py:15`), NOT inside the service repo. Loaded by `overrides.load_overrides` (`overrides.py:17-30`), keyed by slug, defaults filled for any missing key (`overrides.py:7-14`: `tags=[]`, `time_sensitive=None`, `blocked_on=""`, `paused=False`, `dod=[]`, `repos=[]`).

Real example (`dashboard/programs/cad-staff-portal.yml`):
```yaml
name: CAD Staff Portal
repos: [cad-portal]
tags: [needs-CADDC02]
blocked_on: "Set STAFF_DEFAULT_TEMP_PASSWORD in the CADDC02 .env, then run the staff account sync so accounts go live."
dod:
  - merged
  - deployed
  - ci
```

`dod` items are EITHER a bare string (an auto-key: `merged`, `deployed`, `ci`) OR a dict `{check: "...", done: false}` for a manual human checkbox (`dashboard/programs/incomplete-notes.yml:5-6`). There are 7 seeded YAMLs today: cad-staff-portal, cad-document-pipeline, practice-reports, marketing-roi, incomplete-notes, od-query-consolidation, program-board.

### 1.3 `state.json` (the output the Electron app would consume) — `C:/Users/Mark/Claude-Code/dashboard/state.json`

Top-level shape (`poller.build_state` return, `poller.py:116`):
```json
{
  "generated_at": "2026-06-20T19:32:43",
  "programs": [ <Program>, ... ],
  "suggested": [ "string", ... ]
}
```

Each **Program** card (verified against the live file, `state.json:4-46`):
```jsonc
{
  "slug": "cad-staff-portal",                 // unique key; slugify(name)
  "name": "CAD Staff Portal",                 // display name (override) or repo path (default card)
  "repos": ["cad-portal"],                    // one or many; grouping is the point
  "sources": ["override"],                    // or ["repo"] for an auto-detected default card
  "tags": ["needs-CADDC02"],                  // subset of closed set
  "time_sensitive": null,                     // or ISO date "2026-06-22"
  "blocked_on": "Set STAFF_DEFAULT_TEMP_PASSWORD ...",  // free text (the "what's stuck" prose)
  "paused": false,
  "git": {
    "last_commit": {
      "sha": "f83a232",
      "iso": "2026-06-20T13:58:10-06:00",
      "msg": "docs: session SUMMARY ...",
      "repo": "cad-portal"                    // which repo the newest commit came from
    },
    "age_days": 0,                            // drives age_color and the active/backlog boundary
    "uncommitted": true,
    "unmerged_branch": "feat/ultracode-cad-portal"  // null if clean; non-null => merged=false
  },
  "dod": {                                    // computed, replaces the raw list
    "met": 0,
    "total": 3,
    "gaps": ["merged", "deployed", "ci"]      // the un-met items by label; this is the 90%-done signal
  },
  "last_touched": "2026-06-20T13:58:10-06:00", // max(commit iso, session-touch iso)
  "lane": "blocked",                          // backlog | active | blocked | done | paused
  "age_color": "green",                       // green | yellow | orange | red
  "needs_you": true,
  "needs_you_reasons": ["needs-CADDC02"]      // human-readable reasons
}
```

When Phase 2 enrichment is present, a Program may also carry `"issues": [{"number", "title", "labels":[...]}, ...]` (`poller.py:94,107`; `enrich.open_issue_list`, `enrich.py:22-32`). In the current live `state.json` the cards from override YAMLs do not all show `issues` because the override `repos` did not all match an enriched repo; cad-portal-backed cards would carry them.

The `suggested` array is free-text program names triangulated from continuity.md H3 headings and `project_*.md` memory filenames that have NO card yet (`poller.py:110-113`). It is a "you might want to add an override" list, not actionable cards. In the live file it is noisy (35 entries, many stale/done), which is a known weakness (see Risks).

### 1.4 `enrichment.json` (intermediate cache) — `C:/Users/Mark/Claude-Code/dashboard/enrichment.json`

```jsonc
{
  "generated_at": "2026-06-20T17:19:54",
  "data": {
    "cad-portal": {
      "ci": true,
      "deployed": false,
      "issues": [ {"number": 19, "title": "...", "labels": ["bug","portal-review","high"]}, ... ]
    },
    "branded-docs": { "ci": true, "deployed": null, "issues": [] },
    ...
  }
}
```
Keyed by repo path. `ci`/`deployed` are tri-state: `true` / `false` / `null` (unknown). `null` never counts as done. Confirmed live: cad-portal has 5 open `high`-labeled issues.

---

## 2. The value-computation rules (the part worth stealing)

All of this is pure functions in `status.py` plus `poller._finish`. This is the actual product: the rules that turn raw git facts into "what needs you."

### 2.1 Age color (`status.age_color`, `status.py:22-29`)
Driven by `git.age_days` (days since the newest of last-commit / last-session-touch):
- `< 3` days -> **green**
- `3-6` -> **yellow**
- `7-13` -> **orange**
- `>= 14` -> **red**

Free, always on, no tagging. This is the "90% done is rotting" visual. Note: `age_days` is freshened by session activity, so a repo touched in a session today reads green even with no commit (`poller._finish:59-62`).

### 2.2 Lane (`status.compute_lane`, `status.py:32-42`) — strict precedence
1. **done** if `dod.total > 0 and dod.met == dod.total` (a card with NO DoD can never be "done").
2. else **paused** if `paused`.
3. else **blocked** if any tag in `{needs-CADDC02, needs-your-decision}` (`BLOCKER_TAGS`, `status.py:3`) OR `blocked_on` is non-empty.
4. else **active** if `git.age_days < 14` (`ACTIVE_MAX_DAYS`, `status.py:4`).
5. else **backlog**.

Key design choice: `time-sensitive` is NOT a blocker tag (so a time-sensitive card still flows through the normal lanes), but it DOES drive needs-you. And `blocked_on` free text alone forces the Blocked lane even with no tag.

### 2.3 Definition-of-Done (`status.evaluate_dod`, `status.py:8-19`)
Each DoD item resolves to met/unmet:
- bare string -> looked up in the `auto` dict: `merged`, `deployed`, `ci` (`poller._finish:63-67`).
  - `merged` = `git.unmerged_branch is None` (no local feature branch ahead of default).
  - `deployed` = `bool(_deployed)` from enrichment (cad-portal only today; `null`/unknown -> False -> stays a gap).
  - `ci` = `bool(_ci)` from enrichment.
- dict `{check, done}` -> `done` boolean (manual human checkbox).

Returns `{met, total, gaps:[labels]}`. The **gaps list, by name**, is the highest-value output: it names exactly what is left. `bool(None)` is False, so an unknown auto-key is always a visible gap, never a false "done."

### 2.4 NEEDS-YOU band (`status.needs_you`, `status.py:55-73`) — the hero signal
Returns `(flag, reasons[])`. A card is in the band if ANY of:
- a tag in `{needs-CADDC02, needs-your-decision}` -> reason is the tag (`status.py:58-60`).
- `time_sensitive` date is within `near_days=5` of today (or past) -> reason `time-sensitive <date>` (`status.py:61-62`, `_time_sensitive_near:45-52`).
- lane is `active` AND `git.age_days >= 7` (`STALL_DAYS`) -> reason `stalled Nd` (`status.py:63-64`).
- **the 90%-killer:** `dod.total > 0 and dod.total - dod.met == 1` -> reason `almost done: <the one remaining gap>` (`status.py:65-67`).
- any open issue with a `high`/`critical` label -> reason `open issue #N` (`status.py:68-72`).

This is the single most portable concept: it is exactly the "todos / problems / in-progress" PRIMARY content the ClaudeTerminal home page is supposed to lead with. The `reasons[]` are already human-readable one-liners.

### 2.5 Sort order (`poller.py:115`)
`programs.sort(key=lambda p: (not p["needs_you"], p["git"]["age_days"]))` — needs-you first, then oldest-first within each group. The board is already ordered for "what should I look at."

### 2.6 Session-activity recency (Phase 2-A, `learnings.py` + `poller._finish:55-62`)
Reads `~/.claude/learnings/*.jsonl`, maps each record's `cwd` to a workspace-relative repo path, keeps the newest timestamp per path (`learnings.latest_touch_by_path:16-27`). A touch on a subdir (`clinical-knowledge/consults`) counts for its parent repo (`poller._session_iso_for:42-49`). `last_touched = max(commit, session)`; if the session touch is newer, `age_days` is recomputed from it. This is what makes "I worked on it today but did not commit" still read as live.

### 2.7 Enrichment aggregation across a multi-repo program (`poller._agg_enrichment`, `poller.py:26-39`)
- `ci` = `all()` of the known per-repo ci values (None if none known).
- `deployed` = `any()` of known deployed values.
- `issues` = concatenation of all repos' issue lists.

---

## 3. Portability assessment

### 3.1 Bring INTO the ClaudeTerminal in-app dashboard (as its backbone)

These are concepts/logic, not necessarily code. The verdict: **adopt the value-computation MODEL wholesale, consume the DATA from the server.** Re-implementing the value rules in TS only if we cannot reach the server.

**Adopt as the dashboard's information architecture (this IS the spec for the home page):**
- **NEEDS-YOU band as the primary content region.** `status.needs_you` + `needs_you_reasons[]` map one-to-one onto "todos / problems / in-progress as PRIMARY." Each reason is already a clickable line. (`status.py:55-73`) — HIGH value, directly reusable as the page's hero.
- **The five-lane lifecycle model** (backlog/active/blocked/done/paused) and the strict precedence (`status.compute_lane`). This is the secondary structure under the hero. (`status.py:32-42`)
- **Age-as-color** (green/yellow/orange/red off `age_days`) as the at-a-glance staleness cue on every card. (`status.py:22-29`)
- **The DoD `gaps[]`-by-name** as the "what's the last 10%" line on a card, and **`almost done: <gap>`** as a needs-you reason. (`status.py:8-19`, `status.py:65-67`)
- **The closed tag set** `{needs-CADDC02, needs-your-decision, time-sensitive}`. Do not invent new ones in the Electron app; keep parity so the two surfaces agree. (`status.py:3`, design doc `2026-06-20-program-dashboard-design.md` decision #5)
- **`blocked_on` free text as the actionable prose.** This is the single richest "what's stuck and why" field and it is exactly what the user wants surfaced. (`state.json:17,61,103,145,188,231`)
- **The needs-you-first, oldest-first sort.** (`poller.py:115`)

**The action affordances map cleanly onto the existing data:**
- "copy text" -> `blocked_on`, `needs_you_reasons`, the DoD gap labels are all already plain strings.
- "open a NEW Claude session pre-loaded with a query" -> compose from `name` + `blocked_on` + `gaps[]` (e.g. "Unblock <name>: <blocked_on>. Remaining DoD: <gaps>"). All fields exist in `state.json`.
- "jump to a new PowerShell tab" -> `repos[]` gives the folder(s); `WORKSPACE_ROOT` + repo path = the `cd` target. The Electron app already owns node-pty, so this is the app's job, not the server's.

### 3.2 Keep ON the program-board server (`:5173`) and consume, do NOT re-derive

- **The git polling itself** (`gitinfo.repo_git_facts` shelling `git log`/`status`/`branch`, `gitinfo.py:6-50`). It is already running every 60s on the work PC. Re-running 19+ `git` subprocess fans from inside Electron would duplicate work and could collide with the user's own git operations. Consume `state.json`.
- **The network enrichment** (`gh run list`, `gh issue list`, `connections/diag.py`, `enrich.py:68-93`). This is rate-limit-sensitive, slow (300s cadence, fail-safe), and depends on the workspace's `connections/` venv + `gh` auth. Absolutely consume, never re-run from Electron. (`__main__.build_enrichment:36-51`)
- **The triangulation/auto-detection** (`repos.conf` + continuity H3 + `project_*.md` scan, `poller.py:110-113`, `programs.py`). It depends on workspace files the server already watches. Consume the resulting `programs[]` + `suggested[]`.
- **The per-program YAML store** (`dashboard/programs/*.yml`). The server owns reading these; the design explicitly says only humans/Claude edit them, the service never writes (`2026-06-20-program-board-implementation.md` Global Constraints). The Electron app should READ the resolved cards from `state.json`, not parse YAML itself. (If the app ever wants to let the user toggle a manual DoD checkbox, that is a write to the YAML and should be a deliberate, separate feature, likely still routed through a file write the server picks up on its next poll.)

### 3.3 How the Electron app should READ it (three options, ranked)

1. **HTTP `GET http://127.0.0.1:5173/api/state`** (`web.py:33-35`). Cleanest. Returns the full `state.json` as JSON. The Electron main process polls this every ~10s (mirroring the board's own cadence) and pushes to the renderer over IPC. Zero new server code. Requires the program-board service to be running. **Recommended.**
2. **Read `C:/Users/Mark/Claude-Code/dashboard/state.json` from disk directly.** The file is atomically written (`state.py:6-11`, temp + `os.replace`), so a reader never sees a half-written file. Works even if the Flask port is down, as long as the poller wrote at least once. Good fallback / good for a watch via `fs.watch`. The Electron app already has filesystem access. **Recommended as the fallback or even the primary**, since it removes the HTTP dependency and `fs.watch` gives near-instant updates on each 60s write.
3. The HTMX partial (`GET /partials/board`, `web.py:29-31`) returns HTML — NOT useful for a React renderer. Ignore.

Practical recommendation: **read the file with `fs.watch` as primary, fall back to `GET /api/state` if the file is missing/stale.** That makes the Electron dashboard resilient to the service being down and avoids a hard runtime coupling to `:5173`.

### 3.4 What does NOT port / gaps to be aware of

- **No HTTP push.** The server is HTMX-polled (`templates/board.html:10`, `every 10s`); there is no SSE/websocket (P2-C deferred, `2026-06-20-program-board-phase2.md` "Deferred"). The Electron app must poll the endpoint or watch the file; it cannot subscribe.
- **No live-session awareness.** program-board tracks *programs/repos*, not running Claude/PTY sessions. The SECONDARY "all live sessions" list the ClaudeTerminal home page needs is NOT in `state.json` at all — that is the Electron app's own data (it owns the node-pty sessions). program-board contributes the PRIMARY (todos/problems) half only. The `last_touched`/session-recency it computes is from `learnings/*.jsonl` (past sessions), not the app's current live tabs.
- **`suggested[]` is noisy.** The live file has 35 entries, many already done or stale (e.g. "Reports cutover -- COMPLETE", emoji-prefixed continuity bullets). If the Electron app shows this list at all, it needs filtering, or treat it as a low-priority "untracked" drawer, not primary content.
- **Naming/casing assumption.** `learnings._rel_path` assumes consistent path casing (`learnings.py:5-7`); fine on one machine, but a note if the app ever derives repo paths itself.
- **Observed live-data quirk (low confidence, worth a follow-up):** in the current `state.json`, the cad-staff-portal card shows `dod.gaps: [merged, deployed, ci]` all unmet, while `enrichment.json` reports cad-portal `ci: true`. This is likely because the override's `repos: [cad-portal]` is enriched but the poll that wrote this `state.json` either pre-dated the enrichment refresh or the merged-branch state dominated. Not a portability blocker, but if the Electron app consumes DoD, it should treat `gaps` as authoritative-at-poll-time and not be surprised by brief inconsistency between the two files. Re-poll resolves it.

---

## 4. Recommended division of responsibility

| Concern | Owner | Why |
|---|---|---|
| Git facts per repo (commit, age, uncommitted, unmerged branch) | **program-board server** | Already polling every 60s; avoid duplicate `git` fans and collisions. Consume via `git` block in each card. |
| `gh` CI / open issues / `/diag` deployed | **program-board server** | Rate-limited, slow, needs `connections` venv + gh auth; cached at 300s, fail-safe. Never run from Electron. |
| Program triangulation (repos.conf + continuity + memory) | **program-board server** | Depends on workspace files the server reads. Consume `programs[]` + `suggested[]`. |
| Per-program YAML (`dashboard/programs/*.yml`) read | **program-board server** | Service resolves overrides into cards; app reads resolved cards. |
| Value rules (lane, age color, DoD, needs-you, reasons) | **program-board server computes; ClaudeTerminal ADOPTS the model** | Server emits the computed fields in `state.json`. App renders them. App may re-derive in TS only as an offline fallback, keeping rule parity (`status.py` is the reference). |
| Reading state into the app | **ClaudeTerminal (Electron main)** | `fs.watch` on `dashboard/state.json` (primary) + `GET /api/state` fallback; push to renderer via IPC. |
| Rendering the home page (NEEDS-YOU hero, lanes, cards, age color) | **ClaudeTerminal (renderer)** | React/shadcn/Tailwind. Use program-board's IA as the spec. |
| The three click actions (new PowerShell tab / copy / new Claude session w/ query) | **ClaudeTerminal** | App owns node-pty + Claude session spawning. Compose queries from card fields (`name`, `blocked_on`, `gaps`). |
| SECONDARY "live sessions" glanceable list | **ClaudeTerminal (its own data)** | Not in `state.json`; the app owns its PTY/Claude tabs. |
| Manual DoD checkbox toggling (if ever added) | **ClaudeTerminal writes YAML -> server re-polls** | Keep the server's "service never writes state" invariant; YAML is the human-editable layer. Deliberate, separate feature. |

### Bottom line
program-board is a **value-computation engine + data store** that already models exactly the PRIMARY half of the ClaudeTerminal home page (what's stuck, what needs you, what's 90% done). The right move is: **consume `state.json` as the backbone for the todos/problems/in-progress content (read the file, fall back to `/api/state`), adopt its lane/age-color/needs-you/DoD MODEL as the home-page information architecture, and add the two things program-board structurally cannot provide: the live-session secondary list (the app's own PTY data) and the three click-to-act affordances (the app owns terminals and Claude spawning).** Do not re-derive git/gh/diag in Electron; do not duplicate the poller. If full decoupling from the running service is later wanted, the entire `status.py` rule set is ~70 lines and trivially portable to TypeScript, with `state.json`'s `git`/`issues`/`tags`/`dod`/`blocked_on` raw fields as the inputs.

---

## Appendix: file index (all under `C:/Users/Mark/Claude-Code/`)

- Design: `docs/plans/2026-06-20-program-dashboard-design.md`
- Phase 1 plan: `docs/plans/2026-06-20-program-board-implementation.md`
- Phase 2 plan: `docs/plans/2026-06-20-program-board-phase2.md`
- Inputs: `repos.conf`, `dashboard/programs/*.yml`
- Outputs: `dashboard/state.json`, `dashboard/enrichment.json`
- Source: `infrastructure/program-board/src/program_board/{config,repos,programs,gitinfo,overrides,status,poller,state,web,learnings,enrich,__main__}.py`
- View: `infrastructure/program-board/src/program_board/templates/board.html`, `static/board.css`
- README: `infrastructure/program-board/README.md`
