# R4 Recon: program-board Data Contract for Electron Consumption

**Gap:** R4 (medium) — nail the program-board data contract for Electron consumption.
**Build target (all code citations below):** worktree `C:/Users/Mark/Claude-Code/infrastructure/claude-terminal-dashboard`, git branch `dashboard` (based on master), HEAD `ce2e9e0`. Verified via `git branch --show-current`.
**Producer source (read-only reference):** `C:/Users/Mark/Claude-Code/infrastructure/program-board` (separate repo, branch `dashboard`, HEAD `5f296eb`).
**Method:** read the real files in both checkouts, read the live `state.json`, hit the live HTTP endpoint. No assumptions; confidence marked per claim. PHI kept general; the redacted sample below carries no patient data.

## Branch-citation correction (the thing the gate flagged)

A prior recon round (round 1, Lane B, `docs/dashboard/recon/B-program-board.md`) is substantively correct on schema, paths, and line numbers, and its line refs (`state.py:6-11`, `web.py:33-35`, `gitinfo.py:6-50`, `board.html:13`) all re-resolve against the current checkout. The defect the gate is correcting is the *Electron-side* citations: any path written as `infrastructure/claude-terminal/...` points at a DIFFERENT checkout than the build target. This round's app-side citations all come from the `dashboard`-branch worktree at `infrastructure/claude-terminal-dashboard/...`. Where round 1 cited `infrastructure/claude-terminal/src/...`, re-read the same file under `infrastructure/claude-terminal-dashboard/src/...` before trusting line numbers. (Confidence: high — verified the build-target branch is `dashboard` and that the app source tree lives under `claude-terminal-dashboard/src/`.)

---

## (a) Service status + EXACT state.json location + real schema

### Service is running
- `netstat` shows the loopback listener up: `TCP 127.0.0.1:5173 LISTENING PID 5104` and `TCP [::1]:5173 LISTENING`, with an established client connection on `[::1]:3161 <-> [::1]:5173`. (Confidence: high — live `netstat -ano`.)
- `nssm.exe` + `python.exe` service processes are present (PID 5104 is the live one, ~24 MB RSS). The service is nssm-managed per `infrastructure/program-board/README.md` and `__main__.py:103-107` (`waitress.serve(... host="127.0.0.1", port=5173)`). (Confidence: high.)
- Live HTTP probe: `GET http://127.0.0.1:5173/api/state` returns `200` and the full JSON body. (Confidence: high — `curl` round-trip.)

### EXACT location of state.json
**`C:\Users\Mark\Claude-Code\dashboard\state.json`** — the WORKSPACE-ROOT `dashboard/state.json`. Memory is correct; the gap's alternative ("inside `infrastructure/program-board`") is WRONG.

- Source of truth: `config.py:16` -> `STATE_FILE = WORKSPACE_ROOT / "dashboard" / "state.json"`, where `WORKSPACE_ROOT = Path(os.environ.get("PROGRAM_BOARD_WORKSPACE", r"C:\Users\Mark\Claude-Code"))` (`config.py:4`). The env var is overridable but unset on this box, so the default resolves to `C:\Users\Mark\Claude-Code\dashboard\state.json`. (Confidence: high.)
- Verified on disk: file exists, 20657 bytes, mtime `2026-06-20 19:57` (fresh, matches the 60s poll). (Confidence: high — `ls -la`.)
- Verified absent: `C:\Users\Mark\Claude-Code\infrastructure\program-board\dashboard\` does NOT exist (`ls` -> "No such file or directory"). The producer repo has no `dashboard/` subtree; it writes up into the workspace root. (Confidence: high.)
- Sibling files in the same dir, also workspace-root, also consumable:
  - `C:\Users\Mark\Claude-Code\dashboard\enrichment.json` (`config.py:23`) — cached gh/diag layer, 300s TTL.
  - `C:\Users\Mark\Claude-Code\dashboard\programs\*.yml` (`config.py:15`) — the 7 override inputs; the app should NOT parse these, it reads the resolved cards from `state.json`.

> Implementation note for Electron: do NOT hardcode the absolute path blindly. The producer honors `PROGRAM_BOARD_WORKSPACE`. Resolve the same way: read `process.env.PROGRAM_BOARD_WORKSPACE` (fallback `C:\Users\Mark\Claude-Code`) and join `dashboard/state.json`. This keeps the two in lockstep if the workspace ever moves. (Confidence: high — derived from `config.py:4,16`.)

### Real schema (verified against the live file)

Top-level (`state.json:1-3,683,718`; produced at `poller.py:116`):

```jsonc
{
  "generated_at": "2026-06-20T19:58:41",  // NAIVE local time, no tz offset; isoformat(timespec="seconds")
  "programs": [ /* Program[] */ ],
  "suggested": [ "string", ... ]          // memory/continuity-derived program names not already represented
}
```

Each **Program** object (verified against `state.json:4-46`, built at `poller.py:88-95` and `_finish`, `poller.py:52-75`):

```jsonc
{
  "slug": "cad-staff-portal",            // stable id (slugified). Use as the React key.
  "name": "CAD Staff Portal",            // display name
  "repos": ["cad-portal"],               // 1+ repo paths (relative to workspace root)
  "sources": ["override"],               // ["override"] (from a YAML) or ["repo"] (auto from repos.conf)
  "tags": ["needs-CADDC02"],             // CLOSED set, see (b). May be []
  "time_sensitive": null,                // ISO date string "2026-06-22" or null
  "blocked_on": "Set STAFF_DEFAULT_TEMP_PASSWORD ...",  // free-text "what's stuck", or "" — richest action field
  "paused": false,
  "git": {
    "last_commit": {                     // null if no repo / all missing
      "sha": "f83a232",
      "iso": "2026-06-20T13:58:10-06:00",// commit time WITH tz offset (differs from generated_at!)
      "msg": "docs: session SUMMARY ...",
      "repo": "cad-portal"               // which repo the newest commit came from
    },
    "age_days": 0,                       // int; 999 sentinel when no repo (poller.py:16)
    "uncommitted": true,                 // any tracked repo dirty
    "unmerged_branch": "feat/ultracode-cad-portal" // non-null => DoD "merged" is false; null when clean
  },
  "dod": {                               // resolved Definition-of-Done counts (status.evaluate_dod)
    "met": 0,
    "total": 3,
    "gaps": ["merged", "deployed", "ci"] // unmet item labels (auto-keys or manual "check" text)
  },
  "last_touched": "2026-06-20T13:58:10-06:00", // max(commit_iso, session_iso); tz-aware OR naive depending on source
  "lane": "blocked",                     // one of: done | paused | blocked | active | backlog
  "age_color": "green",                  // green | yellow | orange | red (see (b))
  "needs_you": true,                     // boolean
  "needs_you_reasons": ["needs-CADDC02"] // string[] explaining why
}
```

Optional field present only when enrichment matched the repo: `"issues": [{ "number": 19, "title": "...", "labels": ["bug","high"] }, ...]` (`poller.py:94,107`; shape confirmed in `enrichment.json`). In the current live `state.json` the override cards don't all carry `issues` because the override `repos` didn't all line up with an enriched repo slug. Treat `issues` as optional. (Confidence: high.)

**Redacted sample card** (real shape, sensitive prose generalized):

```json
{
  "slug": "example-program",
  "name": "Example Program",
  "repos": ["example-repo"],
  "sources": ["override"],
  "tags": ["needs-your-decision"],
  "time_sensitive": null,
  "blocked_on": "<short free-text describing the human decision or external step that is blocking>",
  "paused": false,
  "git": {
    "last_commit": { "sha": "0000000", "iso": "2026-06-20T13:00:00-06:00", "msg": "<commit subject>", "repo": "example-repo" },
    "age_days": 0,
    "uncommitted": true,
    "unmerged_branch": "feat/example"
  },
  "dod": { "met": 0, "total": 2, "gaps": ["<gap 1>", "<gap 2>"] },
  "last_touched": "2026-06-20T13:00:00-06:00",
  "lane": "blocked",
  "age_color": "green",
  "needs_you": true,
  "needs_you_reasons": ["needs-your-decision"]
}
```

### `/api/state` returns the RAW schema, not the board's HTML context

Important for the fallback: `web.py:33-35` -> `@app.route("/api/state")` returns `jsonify(read_state(state_path))`, i.e. the **exact `state.json` contents**, byte-for-byte the same object shape as reading the file. The lane-bucketing transform (`needs_you`, `lanes{}`, `paused`, `suggested`) lives only in `_context()` (`web.py:10-19`) and is consumed by the HTML routes `/` and `/partials/board`. So the file path and the HTTP fallback yield an identical schema — the Electron consumer needs ONE parser, not two. Ignore `/partials/board` (it is HTML, useless to React). (Confidence: high — read `web.py` end to end + diffed live HTTP body against the file.)

---

## (b) EXACT age-color day thresholds (correct bands; prior off-by-one corrected)

Source: `status.py:22-29`.

```python
def age_color(age_days: int) -> str:
    if age_days < 3:   return "green"
    if age_days < 7:   return "yellow"
    if age_days < 14:  return "orange"
    return "red"
```

`age_days` is an integer day count (`gitinfo` floors to whole days; `poller.py:62` uses `(now - touch).days` and clamps `>= 0`). The CORRECT inclusive bands are:

| Color | Condition | Inclusive day range |
|-------|-----------|---------------------|
| green | `age_days < 3` | 0, 1, 2 |
| yellow | `3 <= age_days < 7` | 3, 4, 5, 6 |
| orange | `7 <= age_days < 14` | 7, 8, 9, 10, 11, 12, 13 |
| red | `age_days >= 14` | 14+ |

**Off-by-one trap to avoid (this is the lane-1 error to correct):** the boundaries are strict-less-than on the upper edge. Day **3 is yellow** (not green), day **7 is orange** (not yellow), day **14 is red** (not orange). A naive "0-3 green / 3-7 yellow / 7-14 orange" reading double-claims the boundary day and turns out one color too cool. If the Electron app re-implements this in TS for any reason (it should not — see below), use `< 3 / < 7 / < 14 / else`, not `<= 3 / <= 7 / <= 14`. (Confidence: high.)

**Recommendation: do NOT re-derive `age_color` in Electron.** The field is already computed and present on every card (`state.json:41` etc.). Consume `card.age_color` verbatim. The thresholds above are documented only so the renderer's color tokens map correctly and so a future decoupling has the exact spec. Related band, for context: lane assignment uses `ACTIVE_MAX_DAYS = 14` (`status.py:4`) — a program with `age_days < 14` and no blockers is `active`, `>= 14` is `backlog`, deliberately aligned to the red boundary. `STALL_DAYS = 7` drives a "stalled Nd" needs-you reason (`status.py:5,63`). (Confidence: high.)

---

## (c) Windows-safe consumption design

### The core Windows hazard (verified)
program-board writes atomically: temp file + `os.replace` (`state.py:6-11`):

```python
tmp = path.with_suffix(".tmp")   # C:\Users\Mark\Claude-Code\dashboard\state.tmp
tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
os.replace(tmp, path)            # atomic rename over state.json
```

This is good for the reader (never a half-written file) but it is exactly the case where Node's `fs.watch` on Windows misbehaves. On Windows `fs.watch` is backed by `ReadDirectoryChangesW`; when a file is replaced by an atomic rename (rather than written in place), watching the FILE by name frequently drops the event or leaves a stale handle pointed at the now-deleted inode, so the callback never fires for the new content. The app's own codebase already does the risky thing: `fs.watch(gitHeadPath, ...)` in `src/main/ipc-handlers.ts:142` watches a single file. That pattern works for `.git/HEAD` (git writes it in place often enough) but will MISS program-board's `os.replace` swaps. Do not copy it for state.json. (Confidence: high on the atomic-write fact and the existing single-file watcher; medium-high on the Windows miss rate — it is well documented and matches the rename mechanism, exact frequency is environment-dependent.)

### Recommended consumption: watch the DIRECTORY + debounce + re-read, HTTP fallback, staleness + empty states

A layered design. The Electron MAIN process owns reading; it pushes parsed state to the renderer over IPC (mirroring `sendToRenderer` at `src/main/index.ts:75-93`); the renderer never touches the filesystem. Wire a new `program-board:state` broadcast channel through `sendToRenderer` and a matching `ipcRenderer.on('program-board:state', ...)` in `preload.ts` (the bridge pattern at `preload.ts:1,9`), with a `program-board:getState` `invoke` for the initial pull. Per AGENTS.md IPC rules, add the channel to `ipc-handlers.ts`, `preload.ts`, `global.d.ts`, the registration test, and decide remote parity (read-only state -> safe to broadcast to remote, but it is local-data so a `ws-bridge.ts` stub is acceptable). (Confidence: high on the wiring anchors.)

**1. Primary: watch the DIRECTORY, not the file.**
```
fs.watch(path.join(workspaceRoot, 'dashboard'), (eventType, filename) => {
  if (filename === 'state.json' || filename === 'state.tmp') scheduleReread();
});
```
Watching the directory catches the `rename`/`change` events that `os.replace` emits against the parent dir even when the per-file watch is blinded. Filter to the two relevant names. (Confidence: high — this is the standard Windows-atomic-write workaround.)

**2. Debounce + re-read (don't read on the raw event).**
- On any qualifying event, `clearTimeout` + set a ~250-400ms timer, then read once. This collapses the `state.tmp` write + `state.json` rename burst into a single read and avoids reading mid-swap. Mirror the existing debounce idiom (`ipc-handlers.ts:143-144` uses a 1000ms `setTimeout`); 250-400ms is enough here since the swap is atomic and near-instant.
- Read with a tiny retry: if `readFileSync` throws `ENOENT`/`EBUSY` (the rename window) or `JSON.parse` fails, wait ~100ms and retry up to ~3x before declaring a read error. The atomic write makes a successful read always-complete, so a failure means you caught the sub-millisecond gap; a single retry almost always succeeds. (Confidence: high.)

**3. Poll as a safety net (events are best-effort).**
Even directory-watch can miss under load or over some filesystems. Run a low-frequency interval re-read (every ~15-30s) in addition to the watcher. The 60s producer cadence (`config.py:21` `POLL_SECONDS=60`, loop at `__main__.py:94-100`) means a 15-30s poll guarantees the UI is never more than ~one producer cycle behind even if every watch event is dropped. (Confidence: high.)

**4. HTTP GET fallback to `http://127.0.0.1:5173/api/state`.**
- Use when: (i) the workspace `dashboard/state.json` does not exist yet, or (ii) the last N file reads failed, or (iii) optionally as the *primary* if the team prefers zero filesystem coupling. The endpoint returns the identical schema (`web.py:33-35`), so the same parser handles both.
- It requires the Flask/waitress service to be up. Bind expectation: loopback only (`127.0.0.1:5173`, also `[::1]:5173`). Set a short timeout (~2-3s) and treat any non-200/timeout as "service down" -> fall through to file, then to the empty state.
- Suggested precedence: **file-watch primary** (survives the Flask port being down as long as the poller wrote once; gives near-instant updates; no HTTP dependency), **HTTP fallback** for first-run/cold-file. This matches round-1 synthesis (`00-synthesis.md:140`). (Confidence: high.)

**5. Staleness threshold -> "degraded / last updated Nm ago" UI.**
- Compute freshness from `generated_at`. CRITICAL: `generated_at` is **naive local time** (no `Z`, no offset — `poller.py:116` `now.isoformat(timespec="seconds")` where `now = datetime.now()`). Parse it as LOCAL time, not UTC. Parsing it as UTC would skew staleness by the machine's tz offset (here UTC-6, a 6-hour error) and could even show negative ages. Do NOT append `Z` or pass it through `Date.parse` assuming ISO-UTC; construct a local Date from the components or treat the string as local. (`last_commit.iso` and `last_touched`, by contrast, DO carry a tz offset like `-06:00` — different handling. Don't mix them.) (Confidence: high — observed both forms in the live file.)
- Producer cadence is 60s. Recommended bands:
  - Fresh: `age < ~150s` (≈2.5 cycles) -> normal UI, no stamp needed (or a quiet "updated just now").
  - Stale/degraded: `age >= ~150s` and `< ~10min` -> show a "last updated Nm ago" stamp and a subtle degraded marker; data still shown (it is the last good poll).
  - Hard-stale: `age >= ~10min` -> the poller is almost certainly wedged or the service is down; show the degraded banner prominently and start trying the HTTP fallback (which will also fail if the whole service is down, confirming "service down").
  - Tune later (round-1 open question `00-synthesis.md:278`); these are starting points anchored to the 60s cycle. (Confidence: medium on exact numbers, high on the cadence they derive from.)

**6. First-run / "service down / not polled yet" empty state.**
- Distinguish three zero-data conditions so the UI says the right thing:
  - **No file + HTTP fails** = service has never run on this box (or workspace path wrong). Empty state: "Program board not running — start the program-board service" with the resolved path it looked for. This is also the `read_state` no-file branch (`state.py:14-17`) which returns `{generated_at: null, programs: [], suggested: []}`; a `generated_at === null` payload means "never polled."
  - **File exists but `programs: []`** = polled but nothing matched (unlikely given repos.conf). Empty state: neutral "No programs tracked yet."
  - **File fresh but `needs_you` empty across all cards** = caught up. Use the producer's own verbatim copy: **"Clear. Keep working."** (`board.html:13`) for the needs-you hero, so the two boards read identically. Do NOT write "No items / Nothing here" (round-1 §233 flags dead-splash copy as the anti-pattern).
- The home must render something on open even before the first read resolves (loading skeleton -> then real cards or the right empty state). (Confidence: high.)

### Division of labor (recommended)
Server owns: git fans (`gitinfo.py`, already running every 60s — re-running 19+ `git` subprocesses from Electron would duplicate work and could collide with the user's own git ops), gh/diag enrichment, YAML resolution, and all value computation (`lane`, `age_color`, `needs_you`, `dod`). Electron owns: read state into main (dir-watch + debounce + retry, with HTTP + poll fallbacks), push to renderer via IPC, render the home, compute only freshness from `generated_at`. If full decoupling is ever required, `status.py` is ~70 lines and ports to TS trivially with `state.json`'s raw `git`/`tags`/`dod`/`time_sensitive` fields as inputs — but consume, don't re-derive, for v1. (Confidence: high.)

---

## Verification log
- Branch: `git -C infrastructure/claude-terminal-dashboard branch --show-current` -> `dashboard`; HEAD `ce2e9e0`.
- Service: `netstat -ano` -> `127.0.0.1:5173 LISTENING PID 5104`; `curl http://127.0.0.1:5173/api/state` -> HTTP 200 + full JSON.
- Path: `config.py:16`; `ls C:\Users\Mark\Claude-Code\dashboard\state.json` -> exists 20657 bytes; `ls .../infrastructure/program-board/dashboard` -> not found.
- Schema: read full live `state.json` (19 program cards) + `enrichment.json`; cross-checked `/api/state` body.
- Thresholds: `status.py:22-29`.
- Atomic write: `state.py:6-11`. Existing single-file watcher: `ipc-handlers.ts:142`. IPC broadcast anchors: `index.ts:75-93`; preload bridge `preload.ts:1,9`.
- `generated_at` naive-local vs `last_commit.iso` tz-aware: observed both in the live file (`state.json:2` vs `:21`).
