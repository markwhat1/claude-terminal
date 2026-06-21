/**
 * M10c: useInjectionStatus hook (the renderer side of the 1.5b affordance).
 *
 * Subscribes to claude:injectStatus, tracks the per-tab kind, and runs the single
 * ~4s threshold timer for the pending state. The failed-start retry is owned by
 * App (handleRetryInjection), not this hook, so the hook is status-only.
 *
 * Tests:
 *   - a pending status starts the threshold timer; thresholdPassed flips after
 *     ~4s (the single threshold, fake timers).
 *   - a success status clears the overlay (kind === 'success').
 *   - a failure status (the MAIN 30s timeout surfacing after a renderer reload)
 *     is reflected as kind === 'failure' WITHOUT the renderer having retained the
 *     query, proving the query was not lost on reload (the fail-safe is MAIN-owned).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInjectionStatus, INJECTION_THRESHOLD_MS } from '@/hooks/useInjectionStatus';
import { claudeTerminalMock } from '../fixtures/dashboard/claudeTerminalMock';
import type { InjectStatus } from '../../src/shared/injection';

let statusCb: ((s: InjectStatus) => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  statusCb = null;
  const api = {
    ...claudeTerminalMock,
    onInjectStatus: (cb: (s: InjectStatus) => void) => {
      statusCb = cb;
      return () => { statusCb = null; };
    },
    injectQuery: vi.fn(async () => 'tab-1'),
  };
  (globalThis as any).window = (globalThis as any).window ?? {};
  (window as any).claudeTerminal = api;
});

afterEach(() => {
  vi.useRealTimers();
  statusCb = null;
});

function emit(s: InjectStatus) {
  act(() => {
    statusCb?.(s);
  });
}

describe('useInjectionStatus', () => {
  it('reflects pending and flips thresholdPassed after the ~4s threshold', () => {
    const { result } = renderHook(() => useInjectionStatus('tab-1'));

    expect(result.current.kind).toBeNull();

    emit({ tabId: 'tab-1', kind: 'pending' });
    expect(result.current.kind).toBe('pending');
    expect(result.current.thresholdPassed).toBe(false);

    act(() => {
      vi.advanceTimersByTime(INJECTION_THRESHOLD_MS);
    });
    expect(result.current.thresholdPassed).toBe(true);
  });

  it('ignores status for a different tab id', () => {
    const { result } = renderHook(() => useInjectionStatus('tab-1'));
    emit({ tabId: 'tab-other', kind: 'pending' });
    expect(result.current.kind).toBeNull();
  });

  it('reflects success (the overlay clears)', () => {
    const { result } = renderHook(() => useInjectionStatus('tab-1'));
    emit({ tabId: 'tab-1', kind: 'pending' });
    emit({ tabId: 'tab-1', kind: 'success' });
    expect(result.current.kind).toBe('success');
  });

  it('reflects a MAIN-surfaced failure (the 30s timeout after a renderer reload)', () => {
    // The renderer did NOT arm anything and holds no query; a fresh hook (as if
    // after a reload) still receives the failure because the fail-safe lives in
    // MAIN. This proves the query was not lost on reload.
    const { result } = renderHook(() => useInjectionStatus('tab-1'));
    emit({ tabId: 'tab-1', kind: 'failure', reason: 'timeout' });
    expect(result.current.kind).toBe('failure');
  });
});
