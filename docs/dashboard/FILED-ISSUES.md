# Dashboard build: filed follow-ups

GitHub issues are disabled on `markwhat1/claude-terminal`, so the two follow-ups the
plan mandates filing (PLAN.md 9.1 and the cut C1 / R-9) are recorded here instead.
Both are pre-existing app bugs, NOT introduced by the dashboard. Neither is fixed in
the dashboard branch. Move these to real issues if issues are ever enabled.

## FU-1: PERMISSION_FLAGS maps `plan` to `--plan`; real CLI flag is `--permission-mode plan`

- Source: PLAN.md 9.1, verified `src/shared/types.ts:70-75` (`PERMISSION_FLAGS.plan = ['--plan']`).
- Consequence: a plan-mode tab can error at startup and never reach `idle`. That wedges
  any feature gated on first idle (including the dashboard's write-after-ready injection,
  M10c). Affects ALL plan-mode tabs, not just the dashboard.
- The dashboard does NOT depend on this fix: the injection tab passes an explicit
  `bypassPermissions` via `permissionModeOverride` (M10c, 3.1 step 8) so its idle gate is
  not wedged by the bug even before it lands.
- Also verify `acceptEdits: ['--allowedTools', ...]` against the installed CLI in the same fix.
- Fix is out of scope for the dashboard branch (it is a user-facing plan-mode bug). Do not
  fix the mapping inline.

## FU-2: Remote-access security hardening (formerly dashboard milestone C1, now cut)

Source: PLAN.md 3.6, Section 9, R-9 / R-9b / R-9c / R-11 / R-14. The dashboard adds NO new
remote broadcast (M5 asserts `program-board:state` is not forwarded), so this is a
pre-existing hole in the already-shipped remote-access feature, exploitable today with zero
dashboard code. Filed separately so it gets its own review, not smuggled into the dashboard
critical path. Recommendations, in priority order:

1. The real exposure is the PUBLIC Cloudflare quick tunnel (`tunnel-manager.ts:25,103`): no
   Access policy, no IP allowlist, public-by-URL, terminating as localhost so the 127.0.0.1
   bind gives no source restriction. Move to a NAMED Cloudflare tunnel + Access policy.
2. Failing that, a one-line Remote Access UI warning that the URL is publicly reachable.
3. A bounded failed-auth / connection-attempt counter in `handleWebSocketConnection`
   (`web-remote-server.ts`), promoted to a do-now one-liner: the 10s unauth timeout
   (`:184-190`) bounds nothing against an attacker who reconnects freely to brute the
   31^6 = 8.87e8 keyspace.
4. Widen the 6-char token (`:57-58`, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) to >=16
   chars from the same alphabet (the client echoes the issued token, so no client change).
5. Remote `tab:create` spawns at workspace root with the host permission mode, commonly
   `bypassPermissions` (`web-remote-server.ts:323-325` + settings-store DEFAULTS): an authed
   remote client gets a `--dangerously-skip-permissions` workspace-root agent it can
   `pty:write` into. Force `'default'` mode + a fixed safe cwd for remote `tab:create`, or
   disable remote `tab:create`.
6. R-9c path traversal: `tab:createWithWorktree` (`web-remote-server.ts:352-368`) takes
   attacker-controlled `msg.name` with only a truthiness check (`:359`), joins it into a
   worktree path with NO `..`-rejection (`:367`, re-joined `worktree-manager.ts:62`), passes
   it to `git worktree add` (`:68`), and spawns claude with the host permission mode (`:429`).
   So `name='..\\..\\..\\target'` escapes the worktrees dir. Add a tested `isSafeWorktreeName`
   predicate (reject `..`, path separators, drive/UNC prefixes) enforced in BOTH the remote
   handler AND the local `ipc-handlers`/`worktree-manager` path, or disable it remotely.
7. R-9b / R-11 / R-14 PHI-to-remote: `tabs:sync` / `tab:updated` broadcast the full `Tab`
   (Haiku-summarized `name`, absolute `cwd`) to any authed client (`web-remote-server.ts:223-251`,
   `index.ts:84-85`). `tab.name` summarizes the first prompt (`tab-namer.ts:57`), so a title
   like "Draft <patient> postop note" goes over the wire verbatim. Send `defaultName` /
   redacted title and `projectId` instead of absolute `cwd` in the broadcast builders. Bound
   the unbounded remote `tab:rename` `msg.name` (`:297-307`) in the same commit.

The dashboard does not wait on any of this.
