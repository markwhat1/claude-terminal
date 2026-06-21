# Native Remote Connect Mode

## Summary

Let the ClaudeTerminal desktop app connect to another machine's ClaudeTerminal sessions natively (not just via a browser), and have it remember and auto-reconnect to that host on launch. The home PC's app becomes a first-class client of the work PC's sessions.

## Goals

- From the desktop app, connect to a remote host's sessions and drive them with full interactive control (same tab/terminal UI).
- The connection **takes over the current window** (no second window).
- The app **remembers the host and auto-reconnects on launch** ("just launch it").
- Provide clean revocation: "Forget host" on the client, "Regenerate code" on the host.

## Non-goals (YAGNI)

- Mixed local + remote tabs in one window (former approach C).
- Host auto-discovery / browsing the tailnet.
- Multiple simultaneous remote hosts.

## Background: the reuse mechanism

The browser web client already implements a complete remote client. `src/web-client/main.tsx` connects a `WebSocketBridge`, then does `window.claudeTerminal = bridge.api`. Every shared component (`TabBar`, `Terminal`, `StatusBar`) reads `window.claudeTerminal`, so the same UI drives either local Electron IPC or a remote socket. The desktop renderer uses the same global in 75 places. Native remote mode reuses this: point a `WebSocketBridge` at a remote URL, swap the global, render the same UI.

Two facts that make this safe:
- The server already accepts interactive input remotely (`pty:write` is wired both ways); the "read-only" README line is stale.
- In native remote mode only the **WebSocket** goes to the remote host. The UI assets are the local renderer's, so there is no cross-origin asset/CSP concern.

## Design

### Client changes (the connecting app)

1. **`WebSocketBridge.connect(token, url?)`** — today it derives the socket URL from `window.location`. Add an optional explicit target URL so the desktop can dial `wss://<host>`. Web client passes nothing and is unchanged (backward compatible). ws/wss is derived from the URL scheme.

2. **Shared `RemoteSession` component** — extract the connect-and-render flow (TokenScreen / RemoteApp / DisconnectedScreen) out of `web-client/main.tsx` into a component importable by both the browser entry and the desktop renderer. One implementation, two entry points. This is a targeted cleanup of `main.tsx`, which currently fuses entry and UI.

3. **Renderer state machine** — the desktop renderer (`App.tsx`) gains remote states alongside its current `startup`/running flow:
   - `startup` → existing StartupDialog, plus a new "Connect to a remote session" choice.
   - `remote-connecting` → attempting connect (spinner).
   - `remote` → connected; render `RemoteSession`, with `window.claudeTerminal` pointed at the remote bridge.
   - `remote-disconnected` → socket dropped; auto-retry with backoff (the web client already has this), then a manual retry / "go local".
   - **Disconnect** returns the window to `startup`/local. The current window is reused throughout (no new window).

4. **Connect entry points** (both, because session restore can skip the startup screen):
   - StartupDialog: "Connect to a remote session".
   - Running window: a "Connect to remote" control (placement finalized in the plan; not the host-side cloud icon).
   - The dialog collects **host URL + 6-char code**, with the URL prefilled from the remembered host.

5. **Persistence + auto-reconnect** — store the last remote connection in client settings:
   ```
   remoteConnection: { url: string, token: string, autoConnect: boolean } | null
   ```
   - On launch: if `autoConnect` and a connection is saved, go straight to `remote-connecting`. On success, show the remote session. On failure (host down / token rejected), fall back to the local startup flow with a non-blocking "couldn't reach <host>, retry?" affordance. Auto-reconnect must never trap the user in a dead remote state.
   - **Disconnect** returns to local and sets `autoConnect = false` but keeps the remembered host for one-click reconnect.
   - **Forget host** clears `remoteConnection` entirely.

### Host changes (the machine being connected to)

6. **Stable access token** — the host currently generates a random token in the `WebRemoteServer` constructor on every activation, which would break a saved client token. Persist the token in host settings (`remoteAccessToken`) and reuse it across activations. Generate once on first use.

7. **Regenerate code** — add a host-side action (in `RemoteAccessButton`) to rotate the token, which revokes any saved client credentials. This is the revocation lever.

### Connection lifecycle (data flow)

```
launch (client)
  -> read remoteConnection from settings
  -> if autoConnect: state = remote-connecting
       WebSocketBridge.connect(token, url)   // wss to host
       window.claudeTerminal = bridge.api
       state = remote, render RemoteSession   // drives host PTYs over the socket
     else: state = startup (local)
  on socket drop -> remote-disconnected -> backoff retry -> remote | manual fallback
  on Disconnect -> autoConnect=false -> state = startup/local (same window)
```

## Persistence & security

- The client stores the access token on disk (settings JSON). It is a long-lived credential granting full terminal control of the host. Acceptable here because both ends are the user's machines on a private, ACL'd tailnet, and the host listens only on loopback (reached via `tailscale serve`). Revocation: client "Forget host", host "Regenerate code".
- The token is never placed in a URL or log.
- Token comparison on the host stays `crypto.timingSafeEqual` (unchanged).

## Testing

- **`WebSocketBridge`**: unit-test URL/scheme handling (explicit target overrides `window.location`; `https` -> `wss`, `http` -> `ws`).
- **Settings (client)**: `remoteConnection` get/set/clear + persistence, mirroring existing settings-store tests.
- **Settings (host)**: stable `remoteAccessToken` persisted and reused across activations.
- **Renderer**: connect dialog renders/validates (6-char code, URL prefill); `RemoteSession` mounts and swaps the bridge; auto-reconnect-on-launch chooses remote vs local correctly (with a stubbed bridge). Matches existing `@testing-library` renderer tests.
- Existing 177 tests stay green; the web client keeps working with the refactored `RemoteSession`.

## Out of scope

Mixed local+remote tabs, host discovery, multiple hosts, persisting codes anywhere they would appear in a URL.

## Risks / open questions

- **Auto-reconnect dead-ends**: must always offer an escape to local if the host is unreachable. Covered by the fallback path; verify in tests.
- **Token rotation UX**: after "Regenerate code", the client silently fails auth and must prompt for the new code rather than loop. Covered by the disconnected/fallback path.
- **Extraction risk**: pulling `RemoteSession` out of `web-client/main.tsx` must not regress the existing browser client. Covered by keeping the browser entry thin and re-testing it.
