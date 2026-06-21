// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketBridge } from '../../src/web-client/ws-bridge';

// A WebSocket that opens but never completes auth, to exercise the connect timeout.
class SilentWS {
  onopen: ((this: unknown, ev?: unknown) => void) | null = null;
  onmessage: ((this: unknown, ev: unknown) => void) | null = null;
  onerror: ((this: unknown, ev?: unknown) => void) | null = null;
  onclose: ((this: unknown, ev: { code: number; reason: string }) => void) | null = null;
  readyState = 0;
  constructor(public url: string) {
    setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0);
  }
  send(): void { /* swallow auth; never reply */ }
  close(): void { this.readyState = 3; this.onclose?.({ code: 1000, reason: '' }); }
}

describe('WebSocketBridge.connect timeout', () => {
  beforeEach(() => { vi.stubGlobal('WebSocket', SilentWS as unknown as typeof WebSocket); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('rejects with a timeout when the host never completes auth', async () => {
    const bridge = new WebSocketBridge();
    await expect(
      bridge.connect('ABC234', 'https://h.ts.net', { timeoutMs: 50 }),
    ).rejects.toThrow(/timed out/i);
  });
});
