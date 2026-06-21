/**
 * AGENTS.md Remote / Local Parity: M15 adds the todo:update preload method.
 *
 * todo:update is LOCAL-ONLY (Home is desktop-only, PLAN.md 2.9). Its stub in
 * WebSocketBridge must throw (not silently no-op) so a missed disabled-state
 * fails loudly, matching the pattern for createShellTab and injectQuery.
 */
import { describe, it, expect } from 'vitest';
import { WebSocketBridge } from '../../src/web-client/ws-bridge';
import type { ClaudeTerminalApi } from '../../src/preload';

describe('WebSocketBridge todo:update parity (M15)', () => {
  it('exposes updateTodo as a function', () => {
    const bridge = new WebSocketBridge();
    expect(typeof bridge.api.updateTodo).toBe('function');
  });

  it('updateTodo rejects (local-only: not available over remote)', async () => {
    const bridge = new WebSocketBridge();
    await expect(
      bridge.api.updateTodo('todo-1', { horizon: 'now' }),
    ).rejects.toThrow(/not available over remote/);
  });

  it('matches the ClaudeTerminalApi updateTodo signature (compile-time guard)', () => {
    const bridge = new WebSocketBridge();
    const api: Pick<ClaudeTerminalApi, 'updateTodo'> = bridge.api;
    expect(api.updateTodo).toBeDefined();
  });
});
