import { describe, it, expect } from 'vitest';
import { WebSocketBridge } from '../../src/web-client/ws-bridge';
import type { ClaudeTerminalApi } from '../../src/preload';

/**
 * AGENTS.md Remote / Local Parity: the web client's WebSocketBridge must stub
 * any new preload API method, even if it throws or no-ops. M12 added two preload
 * methods (appendCapture, getCaptureCount) that the Phase-2 bridge diff missed.
 * These tests pin the stubs so the bridge keeps satisfying the full
 * ClaudeTerminalApi shape (the get api() return is an untyped object literal, so
 * a missing method is silent at compile time without a runtime guard).
 */
describe('WebSocketBridge capture parity (M12)', () => {
  it('exposes appendCapture as a function', () => {
    const bridge = new WebSocketBridge();
    expect(typeof bridge.api.appendCapture).toBe('function');
  });

  it('exposes getCaptureCount as a function', () => {
    const bridge = new WebSocketBridge();
    expect(typeof bridge.api.getCaptureCount).toBe('function');
  });

  it('appendCapture is an inert no-op that resolves to the API result shape', async () => {
    const bridge = new WebSocketBridge();
    const result = await bridge.api.appendCapture('some captured text');
    expect(result).toEqual({ ok: false, count: null });
  });

  it('getCaptureCount resolves to 0 from the remote client (no host store)', async () => {
    const bridge = new WebSocketBridge();
    await expect(bridge.api.getCaptureCount()).resolves.toBe(0);
  });

  it('matches the ClaudeTerminalApi capture signatures (compile-time guard)', () => {
    const bridge = new WebSocketBridge();
    // Pin the capture surface to the canonical preload types. This Pick keeps
    // the guard scoped to the two M12 methods while still failing tsc if their
    // signatures drift from the preload contract. The M13 inject parity below
    // pins injectQuery / onInjectStatus separately.
    const captureApi: Pick<ClaudeTerminalApi, 'appendCapture' | 'getCaptureCount'> = bridge.api;
    expect(captureApi.appendCapture).toBeDefined();
    expect(captureApi.getCaptureCount).toBeDefined();
  });
});

/**
 * AGENTS.md Remote / Local Parity: M10c added the Claude-injection channel pair
 * (injectQuery, onInjectStatus) to the preload and wired App.tsx to it, but the
 * Phase-2 bridge diff missed both. injectQuery is DESKTOP-ONLY (Home is
 * desktop-only in Phase 1), so its stub THROWS so a missed disabled-state fails
 * loudly rather than silently no-oping (mirroring createShellTab). onInjectStatus
 * is a listener registration, stubbed as a no-op cleanup (mirroring the on*
 * stubs). These tests pin both stubs to the full ClaudeTerminalApi shape.
 */
describe('WebSocketBridge inject parity (M13)', () => {
  it('exposes injectQuery as a function', () => {
    const bridge = new WebSocketBridge();
    expect(typeof bridge.api.injectQuery).toBe('function');
  });

  it('exposes onInjectStatus as a function', () => {
    const bridge = new WebSocketBridge();
    expect(typeof bridge.api.onInjectStatus).toBe('function');
  });

  it('injectQuery rejects (local-only: not available over remote)', async () => {
    const bridge = new WebSocketBridge();
    await expect(
      bridge.api.injectQuery({ query: 'open Claude here' as never, projectId: null }),
    ).rejects.toThrow(/not available over remote/);
  });

  it('onInjectStatus returns a callable cleanup function', () => {
    const bridge = new WebSocketBridge();
    const cleanup = bridge.api.onInjectStatus(() => undefined);
    expect(typeof cleanup).toBe('function');
    // Calling the cleanup is inert and must not throw (no listener was added).
    expect(() => cleanup()).not.toThrow();
  });

  it('matches the ClaudeTerminalApi inject signatures (compile-time guard)', () => {
    const bridge = new WebSocketBridge();
    // Pin the inject surface to the canonical preload types so tsc fails if the
    // stub signatures drift from the injectQuery / onInjectStatus contract.
    const injectApi: Pick<ClaudeTerminalApi, 'injectQuery' | 'onInjectStatus'> = bridge.api;
    expect(injectApi.injectQuery).toBeDefined();
    expect(injectApi.onInjectStatus).toBeDefined();
  });
});
