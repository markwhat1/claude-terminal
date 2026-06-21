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
    // Pin only the capture surface to the canonical preload types. A full
    // ClaudeTerminalApi assignment would also surface unrelated M10c stub gaps
    // (injectQuery / onInjectStatus), which are outside this fix; this Pick keeps
    // the guard scoped to the two M12 methods while still failing tsc if their
    // signatures drift from the preload contract.
    const captureApi: Pick<ClaudeTerminalApi, 'appendCapture' | 'getCaptureCount'> = bridge.api;
    expect(captureApi.appendCapture).toBeDefined();
    expect(captureApi.getCaptureCount).toBeDefined();
  });
});
