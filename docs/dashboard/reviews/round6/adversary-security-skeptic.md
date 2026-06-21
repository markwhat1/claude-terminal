# Adversary review: Security / privacy skeptic (round 6)

Lens: hunt PHI/secret leak paths (argv, logger, DevTools mirror, remote client), remote
exposure, and any place the "scrub" is policy not control. Build target: worktree
`C:/Users/Mark/Claude-Code/infrastructure/claude-terminal-dashboard`, branch `dashboard`,
HEAD `ce2e9e0`. All code citations verified against this checkout. Live `state.json` read at
`C:\Users\Mark\Claude-Code\dashboard\state.json` (`generated_at 2026-06-20T23:21`).

## Verdict

The plan is the most security-hardened of the rounds. It has already absorbed most of the
obvious skeptic findings: the `composeClaudeQuery`/`composeCopy` branded-type choke points,
the M0b logger-out-of-git-tree move with idempotent init, the warn/error mirror gate honestly
labeled "dev-noise not control", the shared `isAllowedExternalScheme` predicate at both
asymmetric nav sinks plus the IPC handler, write-after-ready over positional argv, the
`state.json` path validator, and a long residual register (R-9..R-15) that names the standing
remote PHI paths instead of burying them. Credit where due: the controls-as-tests framing (the
"zero interpolated free text" regression test, the mapper assertion that `detail`/`blocked_on`/
`dod.gaps` never reach the sinks) is the right instinct, and the canned-template default is a
real floor, not a regex hope.

It still misses concrete leak paths and over-credits two controls. The findings below are
defects in THIS plan: things the plan's own enumerations should have caught and did not, or
controls the plan claims that the code does not actually deliver.

---

## DEFECTS

### D1 (HIGH) — tab-namer error logs dump Haiku stdout/stderr at `log.error`, the exact level M0b leaves mirrored, and M0b never redacts them

The plan's M0b redacts the two prompt-PREFIX log lines (`hook-router.ts:56`,
`tab-namer.ts:74`) to id-only and gates the DevTools mirror to warn/error. But the tab-namer's
FAILURE path logs the model subprocess streams verbatim at `log.error`:

```
src/main/tab-namer.ts:38  log.error('[callHaikuForName] FAILED:', err.message);
src/main/tab-namer.ts:39  log.error('[callHaikuForName] stderr:', stderr);
src/main/tab-namer.ts:40  log.error('[callHaikuForName] stdout:', stdout);
```

The Haiku call is fed the first user prompt via stdin (`tab-namer.ts:68`, prompt =
`prompt.substring(0,500)`, `:75`), which for this practice is routinely a patient name or case
detail. On a non-zero exit, timeout, or rate-limit (the 30s `execFile` timeout at `:36` makes
this not rare), `stderr`/`stdout` can echo the input context or a partial completion, and they
go to BOTH `writeToFile` (disk, unconditional) AND `executeJavaScript` (the DevTools mirror).
`log.error` is precisely the level M0b keeps mirrored, so the M0b gate gives no protection
here, and M0b's "no PHI in `log.*`" assertion is scoped to `composeClaudeQuery` / the item
mapper / HomeView, NOT to the tab-namer's own error path. The plan's redaction list is one line
short of the actual leak set: it fixes `:74` and ignores `:38-40`.

This is on the headline path. The dashboard spawns a fresh auto-named tab per "ask" click
(R-14), so every dashboard-driven Claude session runs the namer; a single failed naming call on
a dashboard tab whose first prompt happens to carry a name (the Phase-2/3 opt-in, or a future
non-canned query) writes it to disk and the production console.

Minimal fix: M0b redacts `tab-namer.ts:38-40` the same way it redacts `:74` — log the tab id
and `err.message` only, NEVER `stderr`/`stdout` raw (or truncate+`scrubFreeText` if a sample is
wanted for diagnosis). Also drop or id-only the success-path `log.debug('[callHaikuForName]
stdout:', JSON.stringify(stdout))` at `:51` (the generated name is a PHI summary; lower risk
because it is debug-disk-only after the gate, but it still hits disk). Add these two lines to
M0b's change-list and to the M0b "no raw prompt/model output in `log.*`" assertion.

### D2 (HIGH) — the filed remote-security issue enumerates pty:write / tab:rename / tab:create but OMITS the worst remote write sink: `tab:createWithWorktree` path-traversal + arbitrary-location Claude spawn

The plan's R-9 / R-11 / 3.6 carefully list the remote write sinks an authed client can reach
(`pty:write` `:272`, `tab:rename` `:297`, `tab:create` `:316`) and fold them into the filed
remote-security issue. The remote `handleMessage` has a fourth spawn-capable case the plan never
mentions anywhere:

```
src/main/web-remote-server.ts:352  case 'tab:createWithWorktree':
src/main/web-remote-server.ts:358    const worktreeName = msg.name;          // attacker-controlled
src/main/web-remote-server.ts:359    if (typeof worktreeName !== 'string' || !worktreeName) break;  // only a truthiness check
src/main/web-remote-server.ts:367    const cwd = path.join(state.workspaceDir, '.claude', 'worktrees', worktreeName);
src/main/web-remote-server.ts:368    const tab = tabManager.createTab(cwd, worktreeName, 'claude');
...spawns claude at :429 with PERMISSION_FLAGS[state.permissionMode] (commonly bypassPermissions)
```

`worktreeName` is the raw remote `msg.name` with no `..`/separator/normalization check.
`worktree-manager.ts:62` joins it again (`path.join(rootDir, '.claude', 'worktrees', name)`)
and passes it to `git worktree add <path> -b <name>` (`:68`) with no sanitization. So an authed
remote client over the public Cloudflare tunnel can send
`{type:'tab:createWithWorktree', name:'..\\..\\..\\..\\some\\target'}` to escape the worktrees
dir, create a git worktree at an attacker-chosen path, and spawn a `--dangerously-skip-
permissions` Claude agent rooted there. This is strictly worse than the `tab:create`-at-
workspace-root path the plan DID flag (R-9), because it adds path traversal and arbitrary branch
creation on top of the bypass-mode spawn.

AGENTS.md's own Security rule is explicit: "Validate path parameters before `path.join()` —
reject `..` and absolute paths." This sink violates the project's stated rule and the plan's
remote-sink inventory is incomplete because of it.

Minimal fix: add `tab:createWithWorktree` to the filed remote-security issue's sink list (3.6 /
R-11), with the recommendation to reject `worktreeName` containing `..`, path separators, or
drive/UNC prefixes before any `path.join` (validate in BOTH the remote handler and the local
`ipc-handlers.ts:413` handler / `worktree-manager` so the local path is covered too), or disable
`tab:createWithWorktree` remotely. One predicate (`isSafeWorktreeName`) in `src/shared/`, tested,
mirrors the `isAllowedExternalScheme` discipline the plan already uses.

### D3 (MEDIUM) — `blocked_on` is rendered verbatim in the hero card and the live data contains a secret name + PHI-adjacent operational detail; the plan guards the copy/PTY/log sinks but not the on-screen render

The plan brands and guards every PROGRAMMATIC sink for `detail` (= `blocked_on`): it cannot
reach `composeClaudeQuery`, `composeCopy`, `writeToPty`, `clipboard`, or `log.*` (3.3, 3.6).
Good. But `DashboardItem.detail` is still rendered as visible hero/card text (4.1: "`detail`:
... rendered in the hero"), and the live `blocked_on` values are not innocuous dev strings:

```
cad-staff-portal: "Set STAFF_DEFAULT_TEMP_PASSWORD in the CADDC02 .env, then run the staff
                   account sync..."          (names a secret env var)
marketing-roi:    "MediaNV login credentials and a Mango webhook hosting decision..."  (credentials)
practice-reports: "Watch the first live PHI sends... check the CADDC02 logs."  (PHI-process detail)
incomplete-notes: "Claude Max-plan BAA question (compliance). ... real JPR recordings."
```

For Phase 1 this is contained to the LOCAL desktop (Home is desktop-only, 2.9; the
`program-board:state` broadcast is renderer-only and M5 proves it is not remote-forwarded), so
the exposure is screen-only: a screen-share, a screenshot pasted to Telegram, or a shoulder-surf
shows secret-var names and compliance detail in the always-on hero. That is a real if modest
widening: the program-board's own web board already renders this, but the plan's whole thesis is
to make this surface always-on and front-and-center on the work PC.

The sharper latent risk is the moment a future remote Home ships (2.9 names it as an optional
Phase-3 milestone): `detail` would then ride to the remote DOM unless someone remembers it is
sensitive. The plan brands `detail` against programmatic sinks but documents NOTHING about its
render-surface sensitivity, so the remote-Home builder has no flag telling them `detail` must be
withheld or truncated remotely.

Minimal fix: add a one-line residual (R-16) stating `blocked_on`/`detail` is operator-sensitive
free text (may name secrets/PHI-adjacent process detail), is render-only and local-only in
Phase 1, and MUST NOT be rendered on a future remote Home without the same withhold/truncate
treatment R-9b recommends for `tab.name`/`cwd`. Optionally, render only the first ~N chars of
`detail` in the hero with a click-to-expand, so a casual screenshot does not capture a full
secret-var line.

### D4 (MEDIUM) — R-15's "validate path not content" gap is named but assigned no Phase-1 control; slug/name flow to four sinks and the only proposed fix is an external repo's cooperation

R-15 honestly states the canned-query "zero PHI surface" guarantee is CONDITIONAL on
`program.slug`/`program.name` being non-PHI dev identifiers, that these come from an untrusted
read source (per-program YAMLs via the producer), and that a patient-named program flows verbatim
into `composeClaudeQuery` -> the PTY write -> the spawned tab's Haiku auto-name (500 chars,
R-14) -> the remote-broadcast `tab.name`. That is the correct threat statement. But the assigned
mitigation is entirely policy, not control: "the precondition is STATED" plus "a producer-side
contract (program names must be dev identifiers), recommended to the program-board repo." There
is no Phase-1 code control on the dashboard side, and the durable fix lives in a different repo
that this plan cannot enforce or test. This is exactly the "scrub is policy not control" pattern
the lens targets, applied to the one input the canned-template floor depends on.

The dashboard already validates the state.json PATH with a tested pure function
(`isStateJsonPathSafe`, M4). The symmetric control for CONTENT is cheap and local: a tested
`isSafeProgramIdentifier(slug|name)` that bounds length and rejects the obvious PHI shapes
(digit runs, the `scrubFreeText` patterns) before slug/name are allowed to reach
`composeClaudeQuery` or the spawned-tab name. On a hit, fall back to slug-only or Copy-only and
surface nothing to the LLM. This keeps the guarantee on the dashboard side instead of betting it
on an external contract.

Minimal fix: add a Phase-1 `isSafeProgramIdentifier` predicate (mirror `isStateJsonPathSafe`,
unit-tested in M4/M0b) gating slug/name before the compose + spawn-name path; keep the
producer-contract recommendation as the durable upstream fix, but do not let it be the ONLY
control. If the team declines the predicate, R-15 must at least say plainly that Phase 1 ships
with NO content control on this input (accepted risk), so it is a decision, not a gap hidden
behind a "stated precondition."

### D5 (LOW) — the `program-board:state` payload itself is a clinical/financial work digest, but M0b/M5's "no PHI in log.*" assertions don't cover a main-process error path stringifying the state object

The `ProgramBoardReader` (M4) parses the full `state.json` (18 programs, all `blocked_on`
strings) into a `ProgramBoardState` held in MAIN and pushed over `program-board:state`. M5's
hard gate proves the channel is not remote-forwarded, and M0b asserts `composeClaudeQuery` / the
mapper / HomeView never pass `detail` to `log.*`. Neither assertion covers the reader's own error
handling: a generic `log.error('[program-board] parse failed', raw)` or `..., state)` in M4
would stringify `blocked_on` to disk + the warn/error mirror, the same class as D1. The plan's
verification log notes other `log.error(... String(err))` sites are string-only today, but M4 is
NET-NEW code and the assertion set doesn't fence its error path.

Minimal fix: extend M0b/M4's "no PHI in `log.*`" assertion to the `ProgramBoardReader` error
paths — on a parse/read failure log the path + error TYPE only, never the raw buffer or the
parsed state. One assertion, same shape as the existing mapper assertion.

---

## Controls correctly credited (no defect, recorded so they are not re-litigated)

- Logger out-of-git-tree move + idempotent `init` (`_initialized` guard) — verified the leak is
  real (`logger.ts:60-69` writes inside `<dir>/.claude-terminal/logs`, wipe at `:67-69` is
  unconditional, `init` called per-project-add at `ipc-handlers.ts:205,284`). M0b's fix is right.
- Mirror gate honestly labeled dev-noise-not-control, redaction named as the real control —
  correct framing; `logger.ts:42-51` mirrors all levels today.
- `isAllowedExternalScheme` at both nav sinks + IPC handler with the `will-navigate` app-url
  passthrough preserved — verified `index.ts:294-297` (always) vs `:299-305` (non-app only);
  the asymmetry handling is correct and the `<a href>` bypass is real.
- Write-after-ready over positional argv; "no free-text prompt in argv" added to the spike
  acceptance — correct; the argv/Sysmon/EDR exposure on a PHI-adjacent box is a real reason.
- `crypto.timingSafeEqual` with the length pre-check (`web-remote-server.ts:226-227`) is correct
  (timingSafeEqual throws on length mismatch; the pre-check is necessary, not a timing leak). The
  6-char/31^6 weakness and the missing reconnect throttle are already in R-9.

---

## Summary

Five defects. D1 and D2 are the load-bearing ones: D1 is a concrete PHI-to-disk-and-console leak
on the headline path that M0b's redaction list misses by one file, and D2 is a remote
path-traversal + bypass-mode spawn that the plan's own remote-sink inventory omits. D3/D4/D5 are
the "scrub is policy not control" and "named but uncontrolled" cases the lens exists to catch.
None require re-architecting; each is a named predicate, an extended assertion, or an added line
in the filed remote-security issue.
