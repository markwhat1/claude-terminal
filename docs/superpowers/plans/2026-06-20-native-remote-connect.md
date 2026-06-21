# Native Remote Connect Mode Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the ClaudeTerminal desktop app connect natively to another machine's sessions, take over the current window, and auto-reconnect to a remembered host on launch.

**Architecture:** Reuse the existing `WebSocketBridge` + shared UI components. A remote connection swaps `window.claudeTerminal` for a socket-backed bridge pointed at a remote URL; the swap is reversible and re-binds the global PTY listener. The host persists a stable, encrypted access token so the client can save `{url, token}` and reconnect. Client and host ship together because auto-reconnect depends on the stable token.

**Tech Stack:** Electron 40 (incl. `safeStorage`), React 19, TypeScript 5.7, ws, Vitest + @testing-library, Tailwind v4 / shadcn.

> **v2 note:** revised after an advisor+adversarial plan review. The review's 5 must-fixes and the should-fixes are folded into the tasks below; the most important are the Terminal global-listener re-bind (Task 6/7), restoring `window.claudeTerminal` on disconnect (Task 7), the awaited token save (Task 2), the connect timeout (Task 1), and serialized regenerate via in-place token rotation (Task 3).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-20-native-remote-connect-design.md`.
- Writing standard: no em dashes, no AI-slop, in code comments and docs.
- New IPC channels require: main handler + preload method + type via `ClaudeTerminalApi` + assertion in `tests/main/ipc-handlers.test.ts`; local-only channels stubbed in `ws-bridge.ts` with the exact same method name.
- The browser web client must keep working unchanged in behavior; verify the disconnect/reconnect path, not just initial connect.
- `crypto.timingSafeEqual` for token comparison stays.
- Capture the live test baseline at the start (`pnpm test` count) and require: net-new tests only add; none regress.
- Settings persistence pattern: in-memory `StoreData` + `DEFAULTS` + async `save()` (JSON). Credentials (host token, client token) are encrypted at rest via `safeStorage` (Task 0b).
- Token charset and generator live once in `src/shared/token.ts` (Task 0a).
- `RemoteAccessInfo` carries `token`; never pass it to `log.*`/`console.*` with the token populated (Task 9 redaction check).

## File Structure

- `src/shared/token.ts` (new) — `genToken()` + charset (shared by host + settings).
- `src/main/secure-store.ts` (new) — `encryptField()`/`decryptField()` over Electron `safeStorage`, plaintext fallback when unavailable.
- `src/web-client/url.ts` (new) — pure `resolveWsUrl(location, targetUrl?)` + `normalizeHostUrl()`.
- `src/web-client/ws-bridge.ts` — `connect(token, targetUrl?)` with timeout; new client-only stubs.
- `src/shared/types.ts` — `RemoteConnection` interface.
- `src/main/settings-store.ts` — host `getOrCreateRemoteAccessToken()` (async) + `regenerateRemoteAccessToken()`; client `remoteConnection` get/set/clear; both credential fields encrypted.
- `src/main/web-remote-server.ts` — accept injected token; add `setToken(token)` that rotates + force-closes clients.
- `src/main/index.ts` — pass persisted token in; `regenerateRemoteCode()`; serialize remote ops with a lock.
- `src/main/ipc-handlers.ts` — new channels.
- `src/preload.ts` — expose new methods.
- `src/renderer/components/terminalCache.ts` — add `destroyAllTerminals()`.
- `src/renderer/components/Terminal.tsx` — export `resetGlobalPtyListener()`.
- `src/renderer/remote-swap.ts` (new) — `enterRemote(bridgeApi)` / `restoreLocal()`: capture/restore `window.claudeTerminal` and re-bind listeners.
- `src/renderer/RemoteSession.tsx` (new) — shared connect-and-render flow (bridge threaded through all inner components).
- `src/web-client/main.tsx` — thin browser entry rendering `RemoteSession`.
- `src/renderer/App.tsx` — remote state machine, bootstrap precedence, auto-reconnect, disconnect-to-local.
- `src/renderer/components/ConnectRemoteDialog.tsx` (new) — URL + code + "remember this host" checkbox.
- `src/renderer/components/StartupDialog.tsx` — "Connect to a remote session" entry.
- `src/renderer/components/TabBar.tsx` — `onConnectRemote` + `onRegenerateRemoteCode` props threaded to children.
- `src/renderer/components/RemoteAccessButton.tsx` — "Regenerate code" (host mode only).
- `tests/web-client/api-parity.test.ts` (new) — preload api keys subset of bridge api keys.
- `docs/remote-access.md`, `docs/ipc.md`, `AGENTS.md` — docs + stale test count.

---

### Task 0a: Shared token generator

**Files:** Create `src/shared/token.ts`; Test `tests/shared/token.test.ts`.

**Produces:** `genToken(): string` (6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).

- [ ] **Step 1: Failing test** — `genToken()` returns `/^[A-Z0-9]{6}$/` and 100 calls yield no ambiguous chars (`0/O/1/I`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** using `crypto.randomInt`. Export `TOKEN_CHARS` + `genToken`.
- [ ] **Step 4: Refactor** `web-remote-server.ts` constructor to import `genToken` instead of its inline charset (no behavior change).
- [ ] **Step 5: Run** full suite green.
- [ ] **Step 6: Commit** — `refactor(remote): shared token generator`.

### Task 0b: Encrypted-field helper

**Files:** Create `src/main/secure-store.ts`; Test `tests/main/secure-store.test.ts`.

**Produces:**
- `encryptField(plain: string): string` — returns `safeStorage.encryptString` base64, or `plain` prefixed with a sentinel when encryption is unavailable.
- `decryptField(stored: string): string` — inverse.
- `isFieldEncryptionAvailable(): boolean`.

- [ ] **Step 1: Failing test** — round-trip `decryptField(encryptField('ABC234')) === 'ABC234'`. Mock `electron.safeStorage` (`isEncryptionAvailable: () => true`, `encryptString: (s)=>Buffer.from('e:'+s)`, `decryptString: (b)=>b.toString().slice(2)`); add a second test with `isEncryptionAvailable: () => false` asserting the plaintext-fallback sentinel round-trips.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the wrapper. Use a tagged format: `enc:v1:<base64>` when encrypted, `plain:v1:<value>` when not, so reads can tell which path produced the stored value (handles a machine that gains/loses encryption).
- [ ] **Step 4: Run** PASS; full suite green.
- [ ] **Step 5: Commit** — `feat(remote): safeStorage-backed encrypted field helper`.

---

### Task 1: WebSocketBridge targets an explicit URL, with a connect timeout

**Files:** Create `src/web-client/url.ts`, `tests/web-client/url.test.ts`; Modify `src/web-client/ws-bridge.ts`.

**Interfaces:**
- `normalizeHostUrl(input: string): string` — trims; if no `scheme://`, prepends `https://`; throws on input still unparseable by `new URL`.
- `resolveWsUrl(location: {protocol,host}, targetUrl?: string): string` — `https`->`wss`, `http`->`ws`; with `targetUrl`, normalize it first then use its host.
- `WebSocketBridge.connect(token, targetUrl?, opts?: { timeoutMs?: number })` — rejects after `timeoutMs` (default 12000) if it never settles; closes the socket on timeout.

- [ ] **Step 1: Failing tests** (`url.test.ts`):

```typescript
import { resolveWsUrl, normalizeHostUrl } from '../../src/web-client/url';
it('same-origin https -> wss', () => expect(resolveWsUrl({protocol:'https:',host:'h.ts.net'})).toBe('wss://h.ts.net'));
it('same-origin http -> ws', () => expect(resolveWsUrl({protocol:'http:',host:'localhost:5173'})).toBe('ws://localhost:5173'));
it('explicit https target -> wss', () => expect(resolveWsUrl({protocol:'http:',host:'x'},'https://cad-doctor.crested-ruler.ts.net')).toBe('wss://cad-doctor.crested-ruler.ts.net'));
it('scheme-less host defaults to https -> wss', () => expect(resolveWsUrl({protocol:'http:',host:'x'},'cad-doctor.crested-ruler.ts.net')).toBe('wss://cad-doctor.crested-ruler.ts.net'));
it('host:port without scheme defaults to https', () => expect(normalizeHostUrl('100.120.160.3:8473')).toBe('https://100.120.160.3:8473'));
it('throws on unparseable input', () => expect(() => normalizeHostUrl('http://')).toThrow());
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `url.ts`:

```typescript
export function normalizeHostUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const u = new URL(withScheme); // throws if still invalid
  if (!u.host) throw new Error('Invalid host URL');
  return withScheme;
}
export function resolveWsUrl(location: { protocol: string; host: string }, targetUrl?: string): string {
  if (targetUrl) {
    const u = new URL(normalizeHostUrl(targetUrl));
    return `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`;
  }
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
}
```

- [ ] **Step 4: Add a connect-timeout test** in a new `tests/web-client/ws-bridge.test.ts` using a fake `WebSocket` (assign `global.WebSocket` to a stub that opens but never sends `auth:ok`); assert `connect(token, 'https://h.ts.net', { timeoutMs: 50 })` rejects within ~100ms.
- [ ] **Step 5: Run** → FAIL.
- [ ] **Step 6: Wire `connect`** — build URL via `resolveWsUrl(window.location, targetUrl)`; wrap the existing settle logic in `Promise.race` with a timer that, on fire, `ws.close()` and rejects `new Error('Connection timed out')`. Clear the timer in `settle`.
- [ ] **Step 7: Run** PASS; full suite green.
- [ ] **Step 8: Commit** — `feat(remote): bridge targets explicit URL with a connect timeout`.

---

### Task 2: Host persists a stable, encrypted access token (awaited)

**Files:** Modify `src/main/settings-store.ts`, `src/main/web-remote-server.ts`, `src/main/index.ts`, `tests/main/settings-store.test.ts`, `tests/main/web-remote-server.test.ts`.

**Interfaces:**
- `SettingsStore.getOrCreateRemoteAccessToken(): Promise<string>` — **async**; mints + awaits `save()` on first call; returns the stable token thereafter. Stored encrypted (`encryptField`).
- `SettingsStore.regenerateRemoteAccessToken(): Promise<string>`.
- `WebRemoteServerDeps.token?: string` — constructor uses it if present, else `genToken()`.

- [ ] **Step 1: Failing tests** (settings-store): stable across calls (await), persists across reload, regenerate differs; and that the on-disk JSON value does not contain the raw token (asserts the field is tagged `enc:`/`plain:`, not the 6 chars). Mock `electron` to provide `app.getPath` AND `safeStorage` (reuse Task 0b mock shape).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** in settings-store: add `remoteAccessToken: string | null` to `StoreData` (stored via `encryptField`, read via `decryptField`); async `getOrCreateRemoteAccessToken` that `await this.save()`; `regenerateRemoteAccessToken` already async. Use `genToken` from Task 0a.
- [ ] **Step 4: Inject token** — add `token?: string` to `WebRemoteServerDeps`; constructor: `this.token = deps.token ?? genToken();` (make `token` mutable: change `private readonly token` to `private token`). Update `makeMockDeps`/the deps used in `web-remote-server.test.ts` if its type now requires acknowledging the field (optional, so likely no change) and **run `pnpm test -- web-remote-server` to confirm**.
- [ ] **Step 5: Await in index** — in `activateRemoteAccess`, `const token = await settings.getOrCreateRemoteAccessToken();` then pass `token` into `new WebRemoteServer({...})`.
- [ ] **Step 6: Run** PASS; full suite green.
- [ ] **Step 7: Commit** — `feat(remote): stable encrypted host access token, awaited on activate`.

---

### Task 3: Regenerate code via in-place rotation, with a remote-op lock

**Files:** Modify `src/main/web-remote-server.ts`, `src/main/index.ts`, `src/main/ipc-handlers.ts`, `src/preload.ts`, `src/web-client/ws-bridge.ts`; Test `tests/main/web-remote-server.test.ts`, `tests/main/ipc-handlers.test.ts`.

**Interfaces:**
- `WebRemoteServer.setToken(token: string): void` — updates the token and closes all connected clients (they must re-auth with the new code). No tunnel restart.
- `index.regenerateRemoteCode(): Promise<RemoteAccessInfo>` — under the remote-op lock: `await settings.regenerateRemoteAccessToken()`; if `webRemoteServer`, `webRemoteServer.setToken(newToken)`; return `getRemoteAccessInfo()`. The transport (tunnel/tailscale) is untouched, so the URL does not change.
- A `withRemoteLock(fn)` mutex in index.ts serializing `activateRemoteAccess`/`deactivateRemoteAccess`/`regenerateRemoteCode`.

- [ ] **Step 1: Failing test** (web-remote-server): construct server, add a fake client to its `clients` set, call `setToken('NEW234')`, assert `accessToken === 'NEW234'` and the client's `ws.close` was called.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `setToken` (set `this.token`, iterate `this.clients` calling `client.ws.close()`, clear the set).
- [ ] **Step 4: Failing test** (ipc-handlers): `'remote:regenerateCode'` registered + delegates to `deps.regenerateRemoteCode`; add the mock + the `IpcHandlerDeps` field.
- [ ] **Step 5: Implement lock + regenerate** in index.ts:

```typescript
let remoteLock: Promise<unknown> = Promise.resolve();
function withRemoteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = remoteLock.then(fn, fn);
  remoteLock = run.catch(() => {});
  return run;
}
async function regenerateRemoteCode(): Promise<RemoteAccessInfo> {
  return withRemoteLock(async () => {
    const token = await settings.regenerateRemoteAccessToken();
    webRemoteServer?.setToken(token);
    return getRemoteAccessInfo();
  });
}
```
Wrap the bodies of `activateRemoteAccess` and `deactivateRemoteAccess` in `withRemoteLock` too. Register `remote:regenerateCode` in ipc-handlers; add `regenerateRemoteCode` to `IpcHandlerDeps` and to the `registerIpcHandlers({...})` call site in index.ts.
- [ ] **Step 6: Preload + stub** — `regenerateRemoteCode: () => ipcRenderer.invoke('remote:regenerateCode')`; ws-bridge stub returns inactive info.
- [ ] **Step 7: Run** PASS; full suite green.
- [ ] **Step 8: Commit** — `feat(remote): regenerate code via in-place rotation under a remote-op lock`.

---

### Task 4: Client persists the remembered connection (encrypted token)

**Files:** Modify `src/shared/types.ts`, `src/main/settings-store.ts`, `src/main/ipc-handlers.ts`, `src/preload.ts`, `src/web-client/ws-bridge.ts`; Test `tests/main/settings-store.test.ts`, `tests/main/ipc-handlers.test.ts`.

**Interfaces:**
- `RemoteConnection { url: string; token: string; autoConnect: boolean }`.
- `SettingsStore.getRemoteConnection(): RemoteConnection | null` / `setRemoteConnection(c)` / `clearRemoteConnection()` — `token` encrypted at rest via `encryptField`.
- Channels `settings:getRemoteConnection`/`setRemoteConnection`/`clearRemoteConnection`; preload methods same camelCase; ws-bridge stubs: `getRemoteConnection: async () => null`, `setRemoteConnection: async () => {}`, `clearRemoteConnection: async () => {}`.

- [ ] **Step 1: Failing tests** (settings): round-trip + clear + persistence across reload + raw token absent from disk JSON. (ipc-handlers): three channels registered + set/clear delegate.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** type + `remoteConnection` field (encrypt only `token`) + accessors + channels + preload + the three concrete stubs above.
- [ ] **Step 4: Run** PASS; full suite green.
- [ ] **Step 5: Commit** — `feat(remote): persist remembered remote connection (client, encrypted)`.

---

### Task 5: Extract shared RemoteSession (bridge fully threaded)

**Files:** Create `src/renderer/RemoteSession.tsx`, `tests/renderer/RemoteSession.test.tsx`; Modify `src/web-client/main.tsx`.

**Interfaces:**
```typescript
interface RemoteSessionProps {
  bridge: WebSocketBridge;
  targetUrl?: string;            // required in desktop mode; omitted (same-origin) in browser
  initialToken?: string;         // auto-connect without showing the token screen
  persistToken: (t: string) => void;
  loadSavedToken: () => string | null;
  onRetry?: () => void;          // desktop: re-enter the connect flow; browser: window.location.reload
  onExit?: () => void;           // desktop disconnect-to-local; hidden in browser
  embedded?: boolean;            // true in desktop: suppress this component's own keyboard effect
}
```

- [ ] **Step 1: Failing tests** (`RemoteSession.test.tsx`) with a fake bridge `{ connect: vi.fn().mockResolvedValue({tabs:[],activeTabId:null,termSizes:{}}), api: { onTabUpdate:()=>()=>{}, onTabRemoved:()=>()=>{}, onDisconnect:(cb)=>{savedDisconnect=cb; return ()=>{}}, onPtyResized:()=>()=>{}, onTabSwitched:()=>()=>{}, switchTab:vi.fn(), renameTab:vi.fn(), getCurrentBranch:vi.fn(), createTab:vi.fn() } }`:
  - mounts the connected view after `initialToken` (assert `[data-web-tabbar]` present) AND that `bridge.connect` was called with `(initialToken, targetUrl)` and the global was swapped (`window.claudeTerminal === bridge.api`).
  - firing the saved `onDisconnect` callback shows the disconnected screen.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Move** `TokenScreen`/`RemoteApp`/`DisconnectedScreen`/`MobileNavMenu`/`groupTabsByProject`/two-screen flow into `RemoteSession.tsx`, and:
  - delete the module-level `const bridge`; thread `props.bridge` into **RemoteApp and DisconnectedScreen** (replace every `bridge.api.onDisconnect/onPtyResized/onTabSwitched`).
  - `connectWithToken` calls `props.bridge.connect(token, props.targetUrl)`, then `props.persistToken(token)`, then `window.claudeTerminal = props.bridge.api` **before** rendering RemoteApp.
  - token auto-load uses `props.loadSavedToken()`; DisconnectedScreen's reconnect loop reads via `props.loadSavedToken()` (not sessionStorage).
  - replace `window.location.reload()` in DisconnectedScreen's "Try Again" with `props.onRetry?.()`.
  - when `props.embedded`, do not attach RemoteApp's own keydown effect (App owns shortcuts).
  - RemoteApp shows a "Disconnect" control calling `props.onExit` only when `onExit` is provided.
- [ ] **Step 4: Thin browser entry** `web-client/main.tsx`:

```typescript
const bridge = new WebSocketBridge();
const TOKEN_KEY = 'claude-remote-token';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RemoteSession
      bridge={bridge}
      persistToken={(t) => sessionStorage.setItem(TOKEN_KEY, t)}
      loadSavedToken={() => sessionStorage.getItem(TOKEN_KEY)}
      onRetry={() => window.location.reload()}
    />
  </StrictMode>,
);
```

- [ ] **Step 5: Run** `pnpm test` PASS; `pnpm run build:web` builds; manually load the browser client AND force a disconnect (kill the host server) to confirm the disconnected->reconnect path still works.
- [ ] **Step 6: Commit** — `refactor(remote): extract bridge-threaded RemoteSession`.

---

### Task 6: API/listener swap utility + desktop connect entry points

**Files:** Create `src/renderer/remote-swap.ts`, `src/renderer/components/ConnectRemoteDialog.tsx`, `tests/renderer/ConnectRemoteDialog.test.tsx`, `tests/renderer/remote-swap.test.ts`; Modify `src/renderer/components/terminalCache.ts`, `src/renderer/components/Terminal.tsx`, `src/renderer/components/StartupDialog.tsx`, `src/renderer/components/TabBar.tsx`, `src/renderer/App.tsx`.

**Interfaces:**
- `terminalCache.destroyAllTerminals(): void` — destroy every cached terminal.
- `Terminal.resetGlobalPtyListener(): void` — `window.__cleanupPtyListener?.()`, `window.__cleanupWorktreeProgressListener?.()`, set `ptyListenerRegistered = false`, `destroyAllTerminals()`.
- `remote-swap.ts`: `captureLocalApi()` (once, at module load: `const localApi = window.claudeTerminal`), `enterRemote(api)` (`resetGlobalPtyListener()`, `window.claudeTerminal = api`), `restoreLocal()` (`resetGlobalPtyListener()`, `window.claudeTerminal = localApi`).
- `ConnectRemoteDialog` props `{ defaultUrl?: string; onConnect: (url: string, code: string, remember: boolean) => void; onCancel: () => void }`; validates a parseable URL (via `normalizeHostUrl`, surfacing the error) and a 6-char code; has a "Remember this host (auto-connect on launch)" checkbox, default checked.
- `TabBar` gains `onConnectRemote?: () => void` and `onRegenerateRemoteCode?: () => void`.

- [ ] **Step 1: Failing tests** — `remote-swap.test.ts`: `enterRemote(api)` sets `window.claudeTerminal === api` and calls reset (spy `window.__cleanupPtyListener`); `restoreLocal()` puts back the original. `ConnectRemoteDialog.test.tsx`: URL prefilled, Connect disabled until code length 6, invalid URL shows an error, `onConnect(url, code, remember)` fired with normalized url.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `destroyAllTerminals`, export `resetGlobalPtyListener` (move the `ptyListenerRegistered` guard reset into it), `remote-swap.ts`, and `ConnectRemoteDialog`.
- [ ] **Step 4: Entry points** — StartupDialog: a "Connect to a remote session" button opening `ConnectRemoteDialog` (prefill `getRemoteConnection()?.url`). TabBar: add an icon button after `RemoteAccessButton` wired to `onConnectRemote`; thread the prop from App. Confirm both the connect button and the regenerate button never render in browser mode (they live in the desktop App path; the web client's RemoteApp passes neither).
- [ ] **Step 5: App remote state** — extend the App state machine; rename `running` handling carefully (Step 6). On connect: `normalizeHostUrl`, `setRemoteConnection({url, token: code, autoConnect: remember})`, hold `bridgeRef.current = new WebSocketBridge()`, `enterRemote` happens inside RemoteSession's connect, render `<RemoteSession embedded bridge={bridgeRef.current} targetUrl={url} initialToken={code} .../>` in the current window.
- [ ] **Step 6: Enumerate state checks** — change `type AppState` to include `'remote-connecting' | 'remote'`; update every `appState === 'running'` / `!== 'running'` site (the keyboard guard at App.tsx:~449 and the early-return branches at ~530-538) to treat remote states correctly: keyboard guard becomes `if (appState !== 'running' && appState !== 'remote') return` only if App owns shortcuts in remote; since RemoteSession is `embedded` and App owns shortcuts, keep App's handler active in `remote` and suppress RemoteApp's (via `embedded`). Document each changed line in the commit body.
- [ ] **Step 7: Run** tests PASS; build dev app; manually: from a running local window, Connect to remote -> enter the tailnet URL + code -> the SAME window shows work-PC sessions AND live output keeps flowing (type a command, see output) — this exercises the Terminal re-bind fix.
- [ ] **Step 8: Commit** — `feat(remote): native connect-to-remote with listener re-bind (takes over window)`.

---

### Task 7: Auto-reconnect on launch, disconnect-to-local, forget host

**Files:** Modify `src/renderer/App.tsx`, `src/renderer/components/StartupDialog.tsx`; Test `tests/renderer/App.remote.test.tsx`.

**Interfaces / behavior:**
- Single bootstrap effect with a `bootstrappedRef` guard that runs once and chooses exactly one path: **CLI start dir wins over auto-reconnect** (if `getCliStartDir()` returns a dir, skip auto-reconnect). Else if `getRemoteConnection()?.autoConnect`, go `remote-connecting` and attempt a **single** connect with the bridge's 12s timeout; on success render RemoteSession; on failure `restoreLocal()` + go to local startup with a non-blocking "couldn't reach <host> - retry / forget" affordance. Never hang in `remote-connecting`.
- Disconnect (`onExit`): `restoreLocal()`, set `remoteConnection.autoConnect = false` (keep host), close the bridge socket, clear `bridgeRef`, go to startup/local in the same window.
- Forget host: `clearRemoteConnection()`.

- [ ] **Step 1: Failing tests** (stub settings IPC + a fake bridge):
  - autoConnect saved -> renders remote view.
  - saved connect that rejects (timeout) -> ends in StartupDialog (asserts `restoreLocal` ran: `window.claudeTerminal === localApi`).
  - cliStartDir set AND autoConnect saved -> local path runs, remote skipped.
  - disconnect -> `setRemoteConnection` called with `autoConnect:false`, StartupDialog shown, `window.claudeTerminal` restored.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the single bootstrap effect (merge/guard with the existing CLI-start-dir effect at App.tsx:~282-350 using `bootstrappedRef`), the disconnect path, and Forget host.
- [ ] **Step 4: Run** PASS; full suite green.
- [ ] **Step 5: Manual** — save a connection, relaunch -> connects straight to host; stop the host, relaunch -> graceful fallback to local with retry; Disconnect -> local works (start a local session, confirm it actually spawns), next launch is local.
- [ ] **Step 6: Commit** — `feat(remote): auto-reconnect on launch, disconnect-to-local, forget host`.

---

### Task 8: Regenerate-code UI (host mode)

**Files:** Modify `src/renderer/components/RemoteAccessButton.tsx`, `src/renderer/components/TabBar.tsx`, `src/renderer/App.tsx`.

- [ ] **Step 1:** Add a small "Regenerate code" button in RemoteAccessButton's active block calling a new prop `onRegenerate`. Thread `onRegenerateRemoteCode` App -> TabBar -> RemoteAccessButton. App wires it to `window.claudeTerminal.regenerateRemoteCode()` then `setRemoteInfo`. The button only shows in host mode (the desktop App that activated remote access); the browser RemoteApp passes no `onRegenerate`.
- [ ] **Step 2:** Manual check: activate remote access, click Regenerate, confirm the displayed code changes and an already-connected client is dropped and must re-enter.
- [ ] **Step 3: Commit** — `feat(remote): host can regenerate the access code`.

---

### Task 9: Parity test, redaction check, docs

**Files:** Create `tests/web-client/api-parity.test.ts`; Modify `docs/remote-access.md`, `docs/ipc.md`, `AGENTS.md`.

- [ ] **Step 1: Parity test** — import the preload `api` shape and `new WebSocketBridge().api`; assert every key of the preload api exists on the bridge api (so a future preload method without a stub fails here instead of crashing the web client). (If importing preload directly pulls electron, assert against the documented method-name list instead.)
- [ ] **Step 2: Redaction check** — grep test or assertion ensuring `RemoteAccessInfo` is never logged with a populated token; confirm the new regenerate handler does not log the returned info.
- [ ] **Step 3: Docs** — `remote-access.md`: add "Native Client Mode" (connect from the app, stable encrypted host token, auto-reconnect, take-over-window, revocation via Forget host / Regenerate code, the at-rest-encryption + opt-in autoConnect decisions). `ipc.md`: add `remote:regenerateCode` + the three `settings:*RemoteConnection` channels + the `RemoteConnection` type. `AGENTS.md`: replace the stale "40 tests" with the captured baseline.
- [ ] **Step 4: Commit** — `docs(remote): native client mode, new channels, test-count fix`.

---

## Self-Review (v2)

- **All 5 must-fixes mapped:** Terminal re-bind (T6 swap utility + T6 Step 7 manual), restore local api on disconnect (T6 `restoreLocal` + T7 Step 1 assertion), awaited token save (T2), connect timeout (T1 Steps 4-6), serialized regenerate via in-place rotation (T3 lock + `setToken`).
- **Should-fixes mapped:** bridge threaded into RemoteApp/DisconnectedScreen (T5 Step 3 + tests), reload/sessionStorage abstracted (T5 props), keyboard ownership (T6 Step 6 + `embedded`), CLI-vs-autoconnect precedence (T7 bootstrap ref), URL normalize/validate (T1 + ConnectRemoteDialog), autoConnect opt-in (ConnectRemoteDialog checkbox, no silent default).
- **Nice-to-haves taken:** shared `genToken` (T0a), `safeStorage` encryption (T0b + T2/T4), parity test (T9), TabBar prop chains named (T6/T8), concrete stub bodies (T4), redaction (T9), AGENTS.md count (T9).
- **Type consistency:** `RemoteConnection {url,token,autoConnect}`, `connect(token,targetUrl?,opts?)`, `enterRemote/restoreLocal`, `setToken`, `resetGlobalPtyListener` used consistently across tasks.
