# Lane G — User Context (ClaudeTerminal in-app Dashboard / Home Page)

Recon for the always-on home page inside ClaudeTerminal. The home page surfaces Mark's
todos / problems / in-progress items as the PRIMARY content, live sessions as a SECONDARY
glanceable list, and lets a click (a) open a PowerShell tab, (b) copy text, or (c) open a
NEW Claude session pre-loaded with a query.

This lane answers: who is the user, how does he actually work day to day, what do
"tasks / problems / in-progress" mean concretely in his world, and what SHOULD show up on
his personal command-center on a Monday morning.

Sources read: `C:/Users/Mark/Claude-Code/CLAUDE.md`; `~/.claude/.../memory/MEMORY.md` and
the `user_*`, `feedback_*`, `project_*` files; the workspace `continuity.md` (1010 lines);
the program-board design spec + the per-program override YAMLs + the live `state.json`.

---

## 1. Who the user is

- **Mark Whatcott, DDS** (LSU 2018). Owner of Colorado Advanced Dentistry (CAD), first day
  as owner 2026-anchor 11/1/2022. Solo-provider dental practice in turnaround. Timezone MST
  (America/Denver). (`user_background.md:7-13`)
- **Wears two hats at once:** a working dentist (chairside most of the day, away from the
  terminal) AND a heavy solo developer running ~25 active programs across ~15 git repos, all
  driven through Claude Code. The dashboard serves the dev hat primarily, but the dev work is
  in service of the practice, so practice realities (cash, staff, time-sensitive sends) leak
  into what "needs him." (`docs/plans/2026-06-20-program-dashboard-design.md:8-24`)
- **ADHD (diagnosed 2014).** This is the single most load-bearing fact for a home-page design.
  Superpower: hyperfocus, rapid context switching. Challenge: initiation difficulty, decision
  fatigue, and "tasks falling into voids." (`user_adhd_profile.md:7`)
- **Self-describes the core failure mode the dashboard exists to kill:** work gets left
  "90% done," and the last 10% (a decision, a server action, a deploy) stalls *invisibly*.
  "For an ADHD brain this is the exact load that should not be manual."
  (`docs/plans/2026-06-20-program-dashboard-design.md:11-15`)

### Working/communication style (governs tone + density of the UI copy)

- **Direct, no corporate polish.** Lead with the answer/action, not reasoning. Light snark
  welcome when he's procrastinating. (`feedback_communication_style.md:7-18`)
- **J.O.T. — "Just One Thing."** Present ONE actionable thing at a time, not a 10-item wall.
  Labels `@now` (this week) / `@next` (this month) / `@later` (backlog). The home page should
  have a clear single "do this next," not an undifferentiated list.
  (`user_adhd_profile.md:9-13`)
- **Do-first, report-after.** He wants results, not a queue of permission prompts. Only
  money / external comms / legal-personnel / irreversible changes need his sign-off.
  (`feedback_proactive_autonomy.md:12-26`)
- **No em dashes, no AI-slop words, structural variety** in any prose the UI renders.
  (`CLAUDE.md:145-154`)
- **PowerShell 7 is the shell** on both PCs; the "open a terminal tab" action must spawn
  PowerShell, not bash. (`CLAUDE.md:107`, `feedback_shell_environment.md`)
- **Away-from-keyboard most of the day; batches decisions.** Async reach is via Telegram
  (he reads it on his phone) and Todoist (real push notifications). Claude has no other way
  to reach him between sessions. (`feedback_telegram_workflows.md:22-28`,
  `feedback_reminders_via_todoist.md:7-11`)

### Known avoidance patterns (proactively surface these; he procrastinates here)

From `user_adhd_profile.md:16-23`: financial confrontation (BLOC/LOC follow-ups, disputes,
vendor negotiation), system documentation, delegation to Danielle (office manager),
"completing the loop" (look-up / follow-up tasks that die), his own health appointments,
marketing homework from vendors. A home page that quietly lets these slide is failing him;
these are exactly the items that should NOT be allowed to drop off the NEEDS-YOU band.

---

## 2. What "tasks / problems / in-progress" mean concretely

There is no single todo list. His work lives in four distinct "task surfaces," and the home
page's value is unifying them. Each maps to a different data source.

### Surface A — Programs (the dominant unit). 90%-done dev work across repos.

This is THE primary content. He thinks in **programs**, not tasks. A program can span
multiple repos (incomplete-notes spans `clinical-notes` + `cad-runner` + `cad-portal`).
The workspace already models this exactly, and it is the single highest-value integration
point for this dashboard:

- **`dashboard/state.json`** (workspace root, written by the program-board poller every 60s)
  already contains 18 program cards with the fields a hero list needs:
  `slug, name, repos, tags, time_sensitive, blocked_on, paused, git{last_commit,age_days,
  uncommitted,unmerged_branch}, dod{met,total,gaps[]}, last_touched, lane, age_color,
  needs_you, needs_you_reasons[]`. (verified live, `state.json`)
- **`dashboard/programs/*.yml`** are the human-authored per-program overrides (8 today) that
  carry `blocked_on` free-text, `tags`, `time_sensitive`, `paused`, and `dod` checklists.
  These are the literal "what's stuck and why" text. (`dashboard/programs/`)

The **lane** taxonomy is already settled and should be reused verbatim so the two boards
agree: `Done` (all DoD met) > `Paused` > `Blocked` (a blocker tag or `blocked_on` set) >
`Active` (touched recently) > `Backlog`.
(`docs/plans/2026-06-20-program-dashboard-design.md:108-118`)

The **NEEDS-YOU** band (the ADHD hero zone) collects: any card tagged `needs-CADDC02` or
`needs-your-decision`; any `time-sensitive` card whose date is near/past; any `Active` card
aged past the stall threshold (orange/red); and the 90%-killer — any card with **all-but-one
DoD item met** (near-done and stalled), named explicitly.
(`docs/plans/2026-06-20-program-dashboard-design.md:112-118`)

The **closed tag set** (do not invent new ones): `needs-CADDC02`, `needs-your-decision`,
`time-sensitive`. `waiting-on-external` was deliberately rejected — if the ball is in
someone else's court it should NOT scream at Mark; it stays a quiet `blocked_on` note.
(`docs/plans/2026-06-20-program-dashboard-design.md:49`)

**Age color** (computed, no tagging): neutral < 3d, yellow 3-7, orange 7-14, red 14+. This
is the staleness clock that makes "90% done" visible.
(`docs/plans/2026-06-20-program-dashboard-design.md:118`)

Concrete real program blockers in the YAMLs today (these are exactly what the home page
should render as clickable items):

- **CAD Staff Portal** — `needs-CADDC02`: "Set `STAFF_DEFAULT_TEMP_PASSWORD` in the CADDC02
  .env, then run the staff account sync." (`dashboard/programs/cad-staff-portal.yml`)
- **CAD Document Pipeline** — `needs-your-decision` + `needs-CADDC02`: "Bespoke-token
  promote/rename decision gates Phase 4. Then the interactive CAD-Docs share sync ships the
  52 instrumented docs." (`dashboard/programs/cad-document-pipeline.yml`)
- **OD Query Consolidation** — `needs-your-decision`: "Three open decisions: earned-only
  income view, the Sep/Oct case-acceptance residual, the write-off provider whitelist."
  (`dashboard/programs/od-query-consolidation.yml`)
- **Incomplete Notes** — `needs-your-decision`: "Claude Max-plan BAA question (compliance).
  Retro-dictation fixtures need real JPR recordings." (`dashboard/programs/incomplete-notes.yml`)
- **Marketing ROI** — `paused`, `needs-your-decision`: "MediaNV login credentials and a Mango
  webhook hosting decision." (`dashboard/programs/marketing-roi.yml`)
- **Practice Reports** — `time-sensitive: 2026-06-22`: "Watch the first live PHI sends:
  unscheduled Mon 2026-06-22, attrition 2026-07-01." (`dashboard/programs/practice-reports.yml`)

### Surface B — Live Claude Code / terminal sessions (the SECONDARY glanceable list)

ClaudeTerminal runs 4-8 parallel Claude Code sessions in tabs (the long-stated need:
"manage 4-8 parallel Claude Code sessions... a unified dashboard, names, project paths,
per-session status... replaces tiling many terminals + listening for a chime").
(`project_multi_session_manager.md:12`) The home page's job for sessions is **glance + jump**,
not hero. The signal he most wants is "which session needs me" (the chime, made visual). The
fork already has tab indicator icons / window-title status / hooks that emit session activity
(`infrastructure/claude-terminal/docs/plans/2026-02-28-tab-indicator-icons*.md`,
`...-window-title-status*.md`, `docs/hooks.md`), so per-session "needs-you / working / idle"
state already exists to feed a secondary list.

### Surface C — Reminders / time-based todos (Todoist) and async decisions (Telegram)

These are his cross-session memory. When he asks to "remind me," it becomes a Todoist task
with a timed reminder; that is the bridge across sessions. (`feedback_reminders_via_todoist.md`)
Batched non-urgent decisions go out as ONE consolidated Telegram message.
(`feedback_telegram_workflows.md:22-26`) A home page could surface "open decisions Claude is
waiting on you for" without re-inventing a task store — but note the existing rule that a
single global task list is the anti-pattern; durable tasks are per-repo TaskCreate buckets,
ephemeral ones are TodoWrite. (`feedback_task_hygiene.md:13-18`) The dashboard should READ
these, never become a 4th competing todo store.

### Surface D — Practice-operational realities (context, not a task feed)

Not dev tasks, but they are "problems" that color urgency and that he carries in his head:
cash-flow turnaround (collections lag production ~$1,286/day), case acceptance 38-47%,
single-provider dependency (Mark produces ~81% of revenue), staffing (first permanent DA
Danny starts 2026-06-22; zero permanent DAs before that), and a live exit-vs-rebuild
decision with checkpoints through Nov 2026. (`project_cad_emergency_cashflow.md:12-16`,
`practice_financial.md:21-24`, `practice_staff.md:14-18`,
`project_practice_exit_pathways.md`) These should NOT clutter the dev home page, but a single
"time-sensitive practice watch" (e.g. the 6/22 PHI send) belongs in NEEDS-YOU because it
already lives as a program card.

---

## 3. User-specific requirements for the home page

1. **NEEDS-YOU band on top, calm everything-else below.** Mirror the program-board's hero
   zone. The ADHD-UX research already cited for that board (red "NEEDS YOU" zone at top,
   calm interface, explicit time signals, external memory for delegated work) governs here
   too. (`docs/plans/2026-06-20-program-dashboard-design.md:166-170`)

2. **Programs are PRIMARY; sessions are SECONDARY.** Do not make the live-session grid the
   hero (that is the obvious-but-wrong default for a "session manager"). The hero is "what's
   stuck / what needs me," sourced from program state. Sessions are a glanceable strip.

3. **Reuse, don't reinvent, the data model.** Read `dashboard/state.json` (already computed:
   lane, needs_you, needs_you_reasons, age_color, dod gaps, blocked_on). The in-app dashboard
   should consume that file (or the program-board's `:5173` endpoint) rather than re-derive
   git/CI/diag state. The two boards then never disagree. This is the cheapest path to a rich
   home page. (verified `state.json` shape)

4. **Honor the closed tag set and lane names verbatim.** `needs-CADDC02`,
   `needs-your-decision`, `time-sensitive`; lanes Backlog/Active/Blocked/Paused/Done. No new
   taxonomy. (`docs/plans/2026-06-20-program-dashboard-design.md:49,108-118`)

5. **The "90%-done, all-but-one-DoD" item must be impossible to lose.** Render it by name
   with the single missing check, in NEEDS-YOU. This is the project's whole reason to exist.
   (`docs/plans/2026-06-20-program-dashboard-design.md:116`)

6. **Three click-actions per item, matching how he unblocks:**
   - **Open PowerShell tab** — for `needs-CADDC02` server actions he must run himself
     (e.g. set the temp password, run the share sync). Spawn PS7, ideally `cd`'d to the
     program's repo. (`CLAUDE.md:107`)
   - **Copy text** — for paste-ready commands / decision text / the `blocked_on` note he
     forwards to Danielle or a vendor. He explicitly wants "paste-ready PowerShell" handed
     to him for CADDC02 work (never SSH to CADDC02; he uses RDP).
     (`feedback_no_ssh_to_caddc02.md`)
   - **Open a NEW Claude session pre-loaded with a query** — for `needs-your-decision`
     items, launch a session in the right repo seeded with the decision context so he
     resolves it in one gesture. This is the J.O.T. "one thing" made executable.

7. **Single recommended next action, not a wall.** Per J.O.T., surface the top one or two
   NEEDS-YOU items prominently; let the rest collapse. Decision fatigue is the enemy.
   (`user_adhd_profile.md:9-13,24-29`)

8. **Direct, voice-y, em-dash-free copy.** Buttons and summaries lead with the verb. No
   "Great! Here's your dashboard." (`feedback_communication_style.md:7-18`, `CLAUDE.md:145-154`)

9. **Loopback / single-user / no PHI.** Same constraints as the program-board: work PC only,
   never CADDC02, no patient data ever rendered or sent. Practice items stay general (a date
   and "PHI send," never a name). (`docs/plans/2026-06-20-program-dashboard-design.md:37-39`,
   `feedback_phi_minimize_to_llm_not_caddc02.md`)

10. **Staleness must be visible at a glance** via age color, because invisible staleness is
    the failure being solved. (`docs/plans/2026-06-20-program-dashboard-design.md:118`)

11. **Surface the avoidance-pattern items even when no git activity exists.** A `blocked_on`
    that is a financial follow-up or a Danielle delegation has zero commits to age it, so it
    must stay pinned by its tag, not by recency. (`user_adhd_profile.md:16-23`)

---

## 4. Realistic Monday-morning view (illustrative, drawn from real workspace state)

Anchored to Monday 2026-06-22, the actual next workday, using real blockers from the YAMLs +
continuity.md. (No PHI; the practice item is generalized to a date + label.)

```
ClaudeTerminal — Home                                          Mon 2026-06-22, 7:58 AM MT

┌─ NEEDS YOU (4) ──────────────────────────────────────────────────────────────┐
│                                                                                │
│ ⏰ Practice Reports — TIME-SENSITIVE today                                     │
│    First live PHI report send fires this morning (~6:30-7:00). Confirm it      │
│    landed; if it misfired it failed closed, check the CADDC02 logs.            │
│    [Open PS tab]  [Copy log-check command]  [Ask Claude to verify the send]    │
│                                                                                │
│ 🖥 CAD Staff Portal — needs-CADDC02   (blocked, near-done)                     │
│    Set STAFF_DEFAULT_TEMP_PASSWORD in the CADDC02 .env, then run the staff     │
│    account sync. DoD 0/3 — this is the only thing between you and live logins. │
│    [Open PS tab]  [Copy paste-ready PowerShell]  [New Claude session here]     │
│                                                                                │
│ 🧠 OD Query Consolidation — needs-your-decision  (3 decisions stalled)         │
│    earned-only income view? · Sep/Oct case-acceptance residual accept-as-is?   │
│    · write-off provider whitelist?                                             │
│    [Copy the 3 questions]  [New Claude session pre-loaded with the decisions]  │
│                                                                                │
│ 🧠 CAD Document Pipeline — needs-your-decision  (Phase 4 gated 14+ days 🔴)    │
│    Bespoke-token promote/rename decision blocks the share sync of 52 docs.     │
│    Review PHASE-3-HOLDS.md first.                                              │
│    [Open the holds doc]  [New Claude session to decide the token]              │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────┘

┌─ ACTIVE (touched recently) ─────────────────┐  ┌─ BLOCKED / PAUSED ──────────┐
│ Marketing Cockpit   committed today  🟢      │  │ Marketing ROI   paused      │
│ Memory Audit        first live run Sun 6/21  │  │   MediaNV login + Mango     │
│ Program Board       service live, dogfooding │  │   webhook decision          │
│ Incomplete Notes    Phase 1 done; BAA Q open │  │ Doc Pipeline    (above)     │
└─────────────────────────────────────────────┘  └─────────────────────────────┘

┌─ LIVE SESSIONS (secondary, glance + jump) ──────────────────────────────────┐
│ ● cad-portal        feat/ultracode…   ⏳ working                              │
│ ● clinical-notes    main              ✅ idle (your turn?)                    │
│ ● connections       master            ✅ idle                                │
│ + New session…                                                               │
└──────────────────────────────────────────────────────────────────────────────┘

Backlog: 8 programs ·  Done this week: Reports cutover, consults unification
```

Why this shape fits him: one glance answers "what needs me today" (top band, 4 items, each
with the single missing step and a one-gesture way to act on it); the time-sensitive PHI send
is first because it has a clock; the two `needs-your-decision` items offer a pre-loaded Claude
session so resolving them is one click, not a context-rebuild; the red age color on the doc
pipeline screams the 14-day stall he'd otherwise never see; live sessions sit quietly at the
bottom as a strip, with the "idle / your turn" flag replacing the chime he used to listen for.

---

## 5. Open questions for downstream lanes

- **Data source for the home page:** read `dashboard/state.json` directly off disk, or call
  the running program-board service at `http://localhost:5173`? Disk read is simplest and
  decouples from that service's uptime; the file is atomically written every 60s. (Confirm
  the program-board exposes a JSON endpoint or settle on the file.)
- **Live-session state feed:** confirm the fork's existing tab-status / hooks emit a
  machine-readable "needs-you / working / idle" per session that the home page can read
  (the tab-indicator + window-title-status features suggest yes; verify the IPC shape).
- **"New Claude session pre-loaded with a query":** does the fork's tab-create IPC accept an
  initial prompt + cwd? (`docs/plans/2026-03-01-remote-create-tab.md` + the create-tab IPC
  are the likely hooks; a code lane should confirm.)
- **Practice-operational items:** keep them OUT of the dev home page except where they
  already exist as a `time-sensitive` program card? (Recommended: yes, to avoid clutter.)
- **Todoist / decision-queue surfacing:** show "decisions Claude is waiting on" inline, or
  leave that to Telegram batching? Risk of becoming a 4th competing todo store
  (`feedback_task_hygiene.md`).
```
```
