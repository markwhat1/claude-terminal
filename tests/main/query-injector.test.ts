/**
 * M10c: QueryInjector tests (the coupled core, PLAN 3.1 / 1.5b).
 *
 * The QueryInjector owns the pending-injection Map, the once-flag, the mandatory
 * 30s timeout, the idle gate (one injected callback the hook-router calls at the
 * convergence point), the dead-PTY check, and the do-not-notify flag.
 *
 * Tests:
 *   - arm sets pending + a 30s timeout (the arm step the handler runs before it
 *     resolves, so the renderer round-trip cannot orphan the query).
 *   - onIdle on a tracked tab writes the query ONCE with a trailing \r and emits
 *     a success injectStatus; subsequent idles are idempotent (no second write).
 *   - clear (tab:closed) cancels the timer; a later idle does NOT write.
 *   - a dead PTY at onIdle time emits a failure injectStatus, not a silent drop.
 *   - the 30s timeout fires and emits a failure injectStatus with the timeout
 *     reason; the pending entry is cleared.
 *   - shouldSuppressNotify is true for a tracked tab and persists through the
 *     first post-injection idle, then a SECOND post-turn idle is still suppressed
 *     for at least one beat (the do-not-notify flag persists past first Stop).
 *   - the CR rule: the write uses \r, never \r\n, even for a multi-line query.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@main/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn(), init: vi.fn() },
}));

import { QueryInjector } from '@main/query-injector';
import {
  CLAUDE_INJECT_STATUS_CHANNEL,
  INJECT_TIMEOUT_MS,
  INJECT_TIMEOUT_REASON,
  INJECT_PTY_GONE_REASON,
  type InjectStatus,
} from '@shared/injection';
import type { ClaudeQueryLine } from '@shared/home-copy';

function makeDeps() {
  const writes: Array<{ tabId: string; data: string }> = [];
  const statuses: InjectStatus[] = [];
  const liveTabs = new Set<string>(['tab-1']);

  const ptyManager = {
    write: vi.fn((tabId: string, data: string) => {
      writes.push({ tabId, data });
    }),
    hasPty: vi.fn((tabId: string) => liveTabs.has(tabId)),
  };

  const sendStatus = vi.fn((channel: string, status: InjectStatus) => {
    expect(channel).toBe(CLAUDE_INJECT_STATUS_CHANNEL);
    statuses.push(status);
  });

  return { ptyManager, sendStatus, writes, statuses, liveTabs };
}

const QUERY = 'Open this repo so I can make the pending decision.' as ClaudeQueryLine;

describe('QueryInjector', () => {
  let deps: ReturnType<typeof makeDeps>;
  let injector: QueryInjector;

  beforeEach(() => {
    vi.useFakeTimers();
    deps = makeDeps();
    injector = new QueryInjector({
      ptyManager: deps.ptyManager as any,
      sendStatus: deps.sendStatus,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // arm-before-resolve building block
  // -------------------------------------------------------------------------

  it('arm tracks the tab and emits a pending status', () => {
    injector.arm('tab-1', QUERY);

    expect(injector.isArmed('tab-1')).toBe(true);
    expect(deps.statuses).toContainEqual({ tabId: 'tab-1', kind: 'pending' });
    // No write yet: the write only happens on the first idle.
    expect(deps.writes).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // M19 / R-14: isDashboardInjected outlives the pending entry
  // -------------------------------------------------------------------------

  it('isDashboardInjected is false for a tab that was never armed', () => {
    expect(injector.isDashboardInjected('tab-never')).toBe(false);
  });

  it('isDashboardInjected is true once a tab is armed', () => {
    injector.arm('tab-1', QUERY);
    expect(injector.isDashboardInjected('tab-1')).toBe(true);
  });

  it('isDashboardInjected stays true AFTER the query is written (lastQuery remembrance)', () => {
    injector.arm('tab-1', QUERY);
    injector.onIdle('tab-1'); // writes + cancels the pending timer
    // The pending entry no longer drives a write, but the tab is still a
    // dashboard-injected tab for the namer gate (the name event fires later).
    expect(injector.isDashboardInjected('tab-1')).toBe(true);
  });

  it('isDashboardInjected stays true after clear (so a late name event is still gated)', () => {
    injector.arm('tab-1', QUERY);
    injector.clear('tab-1');
    expect(injector.isDashboardInjected('tab-1')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // the idle gate: exactly one write with a trailing \r
  // -------------------------------------------------------------------------

  it('onIdle on a tracked tab writes the query once with a trailing CR', () => {
    injector.arm('tab-1', QUERY);
    injector.onIdle('tab-1');

    expect(deps.writes).toHaveLength(1);
    expect(deps.writes[0].tabId).toBe('tab-1');
    expect(deps.writes[0].data).toBe(`${QUERY}\r`);
    // CRLF must never appear.
    expect(deps.writes[0].data).not.toContain('\r\n');
    expect(deps.statuses).toContainEqual({ tabId: 'tab-1', kind: 'success' });
  });

  it('a multi-line query is normalized to CR, never CRLF', () => {
    const multi = 'line one\nline two' as ClaudeQueryLine;
    injector.arm('tab-1', multi);
    injector.onIdle('tab-1');

    expect(deps.writes[0].data).toBe('line one\rline two\r');
    expect(deps.writes[0].data).not.toContain('\n');
  });

  it('a second idle does NOT write again (idempotent once-flag)', () => {
    injector.arm('tab-1', QUERY);
    injector.onIdle('tab-1'); // first idle -> write
    injector.onIdle('tab-1'); // resume / clear / post-turn idle -> ignored
    injector.onIdle('tab-1');

    expect(deps.writes).toHaveLength(1);
  });

  it('onIdle for an UNTRACKED tab does nothing', () => {
    injector.onIdle('tab-other');
    expect(deps.writes).toHaveLength(0);
    expect(deps.statuses).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // tab:closed clears the timer
  // -------------------------------------------------------------------------

  it('clear cancels the timer and a later idle does not write', () => {
    injector.arm('tab-1', QUERY);
    injector.clear('tab-1');

    injector.onIdle('tab-1');
    expect(deps.writes).toHaveLength(0);

    // The timeout must NOT fire after clear.
    vi.advanceTimersByTime(INJECT_TIMEOUT_MS + 1000);
    const failures = deps.statuses.filter((s) => s.kind === 'failure');
    expect(failures).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // dead PTY at write time -> failure, not silent drop
  // -------------------------------------------------------------------------

  it('onIdle when the PTY is dead emits a failure, not a silent drop', () => {
    injector.arm('tab-1', QUERY);
    deps.liveTabs.delete('tab-1'); // PTY died in the narrow window

    injector.onIdle('tab-1');

    expect(deps.writes).toHaveLength(0);
    expect(deps.statuses).toContainEqual(
      expect.objectContaining({ tabId: 'tab-1', kind: 'failure', reason: INJECT_PTY_GONE_REASON }),
    );
    // The tab is no longer armed after a terminal failure.
    expect(injector.isArmed('tab-1')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // the mandatory 30s timeout
  // -------------------------------------------------------------------------

  it('the 30s timeout fires a failure status when no idle ever arrives', () => {
    injector.arm('tab-1', QUERY);

    vi.advanceTimersByTime(INJECT_TIMEOUT_MS);

    expect(deps.writes).toHaveLength(0);
    expect(deps.statuses).toContainEqual(
      expect.objectContaining({ tabId: 'tab-1', kind: 'failure', reason: INJECT_TIMEOUT_REASON }),
    );
    expect(injector.isArmed('tab-1')).toBe(false);
  });

  it('an idle BEFORE the timeout cancels the timeout (no failure fires)', () => {
    injector.arm('tab-1', QUERY);
    injector.onIdle('tab-1');

    vi.advanceTimersByTime(INJECT_TIMEOUT_MS + 1000);

    const failures = deps.statuses.filter((s) => s.kind === 'failure');
    expect(failures).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // the do-not-notify flag (persists through the post-injection idle)
  // -------------------------------------------------------------------------

  it('consumeNotifySuppression suppresses the first post-injection Stop idle, then yields', () => {
    injector.arm('tab-1', QUERY);

    // First idle -> the query is written. The injected tab is MAIN-active in the
    // common path, but the do-not-notify flag is the belt-and-suspenders guard
    // for the case where the renderer-only Home diverges from MAIN's active id.
    injector.onIdle('tab-1');

    // The first POST-TURN idle (the Stop-hook idle) is suppressed: the toast does
    // not fire for the watched injected tab.
    expect(injector.consumeNotifySuppression('tab-1')).toBe(true);

    // After the first post-injection Stop idle is consumed, later idles notify
    // normally (the flag is one-shot past the first post-turn idle).
    expect(injector.consumeNotifySuppression('tab-1')).toBe(false);
  });

  it('consumeNotifySuppression is false for a tab that was never armed', () => {
    expect(injector.consumeNotifySuppression('tab-unknown')).toBe(false);
  });
});
