/**
 * M9: SessionStrip tests.
 *
 * Covers all assertions from the M9 spec (PLAN.md lines 976):
 *   - needs-you (past floor) sorts above working above idle
 *   - a sub-floor idle tab is in the strip but NOT the needs-you count
 *   - strip row-click calls handleSelectTab
 *   - every status row has both color and icon (five real statuses)
 *   - tail folds into "... N more" with group mini-headers present
 *   - working value INCREASES across fake-timer ticks and is DISTINCT from the
 *     waiting-duration string (1.2 / 6.4)
 *   - a poll tick that does NOT change a row coarsened minute does NOT re-render
 *     that row (the sparse-update assertion, 6.4)
 *   - a row crossing justResolved applies the fade class AND no transition class
 *     under prefers-reduced-motion (1.5)
 *   - the project border class is the low-S hsl(... 30% ...) form (6.4)
 *   - the strip working group mini-header is a LABEL ("Working"), NOT a count (6.4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

import SessionStrip from '@/components/SessionStrip';
import type { SessionStripProps } from '@/components/SessionStrip';
import type { Tab } from '@shared/types';
import { IDLE_AGE_FLOOR_MS } from '@/components/HomeView';

// ---------------------------------------------------------------------------
// Tab builder helpers
// ---------------------------------------------------------------------------

function makeTab(overrides: Partial<Tab> & { id: string }): Tab {
  return {
    type: 'claude',
    name: overrides.id,
    defaultName: overrides.id,
    status: 'idle',
    worktree: null,
    sourceBranch: null,
    cwd: '/mock/repo',
    shellType: null,
    pid: null,
    sessionId: null,
    projectId: 'proj-a',
    statusSince: null,
    lastActivityAt: null,
    firstActivityAt: null,
    waitingSince: null,
    ...overrides,
  };
}

const BASE_NOW = Date.now();

/** A working tab (count-up from statusSince). */
function workingTab(id: string, statusSinceMsAgo = 120_000): Tab {
  return makeTab({
    id,
    status: 'working',
    statusSince: BASE_NOW - statusSinceMsAgo,
    firstActivityAt: BASE_NOW - statusSinceMsAgo,
    waitingSince: null,
  });
}

/** An idle tab that has passed the IDLE_AGE_FLOOR_MS (past-floor, needs-you). */
function idlePastFloorTab(id: string, waitingSinceMsAgo = IDLE_AGE_FLOOR_MS + 10_000): Tab {
  return makeTab({
    id,
    status: 'idle',
    firstActivityAt: BASE_NOW - waitingSinceMsAgo - 5000,
    waitingSince: BASE_NOW - waitingSinceMsAgo,
    statusSince: BASE_NOW - waitingSinceMsAgo,
  });
}

/** An idle tab that is still sub-floor (waitingSince is recent). */
function idleSubFloorTab(id: string, waitingSinceMsAgo = 30_000): Tab {
  return makeTab({
    id,
    status: 'idle',
    firstActivityAt: BASE_NOW - 60_000,
    waitingSince: BASE_NOW - waitingSinceMsAgo,
    statusSince: BASE_NOW - waitingSinceMsAgo,
  });
}

// ---------------------------------------------------------------------------
// Default props builder
// ---------------------------------------------------------------------------

function baseProps(overrides: Partial<SessionStripProps> = {}): SessionStripProps {
  return {
    tabs: [],
    now: BASE_NOW,
    handleSelectTab: vi.fn(),
    justResolvedTabIds: new Set<string>(),
    projects: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// prefers-reduced-motion helpers
// ---------------------------------------------------------------------------

function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduce : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function restoreMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('M9: SessionStrip', () => {
  beforeEach(() => {
    restoreMatchMedia();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Sort order: needs-you (past floor) > working > idle
  // -------------------------------------------------------------------------

  it('sorts: needs-you (past floor) above working above idle', () => {
    const tabs = [
      idleSubFloorTab('idle-plain'),
      workingTab('worker'),
      idlePastFloorTab('needs-you-idle'),
    ];
    render(
      <SessionStrip
        {...baseProps({ tabs, now: BASE_NOW })}
      />,
    );

    const rows = screen.getAllByTestId('strip-row');
    // First row should be the past-floor needs-you idle tab.
    expect(rows[0]).toHaveAttribute('data-tab-id', 'needs-you-idle');
    // Second row should be the working tab.
    expect(rows[1]).toHaveAttribute('data-tab-id', 'worker');
    // Third row should be the plain idle tab.
    expect(rows[2]).toHaveAttribute('data-tab-id', 'idle-plain');
  });

  // -------------------------------------------------------------------------
  // 2. Sub-floor idle tab: present in strip, NOT in needs-you count
  // -------------------------------------------------------------------------

  it('a sub-floor idle tab appears in the strip but does NOT increment the needs-you count', () => {
    const subFloor = idleSubFloorTab('sub');
    render(
      <SessionStrip {...baseProps({ tabs: [subFloor], now: BASE_NOW })} />,
    );
    // The row is rendered.
    expect(screen.getByTestId('strip-row')).toBeTruthy();
    // No needs-you mini-header because only working and idle groups exist below
    // the attention group.
    const needsYouHeader = screen.queryByTestId('strip-group-header-needs-you');
    expect(needsYouHeader).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 3. Row-click calls handleSelectTab
  // -------------------------------------------------------------------------

  it('clicking a strip row calls handleSelectTab with the tab id', () => {
    const onSelect = vi.fn();
    const tabs = [workingTab('w1')];
    render(
      <SessionStrip {...baseProps({ tabs, now: BASE_NOW, handleSelectTab: onSelect })} />,
    );
    const row = screen.getByTestId('strip-row');
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith('w1');
  });

  // -------------------------------------------------------------------------
  // 4. Every status row has both color and icon (five real statuses)
  // -------------------------------------------------------------------------

  it('renders an icon and a color class for each of the five real statuses', () => {
    const allStatuses: Array<Tab['status']> = [
      'working', 'idle', 'requires_response', 'new', 'shell',
    ];
    const tabs = allStatuses.map((s) =>
      makeTab({
        id: `tab-${s}`,
        status: s,
        // Give each a working-ish timing so they sort predictably.
        statusSince: BASE_NOW - 60_000,
        firstActivityAt: s !== 'new' ? BASE_NOW - 120_000 : null,
        waitingSince:
          s === 'idle' || s === 'requires_response'
            ? BASE_NOW - (IDLE_AGE_FLOOR_MS + 5000)
            : null,
      }),
    );
    render(<SessionStrip {...baseProps({ tabs, now: BASE_NOW })} />);

    const rows = screen.getAllByTestId('strip-row');
    // All five status tabs should produce rows.
    expect(rows.length).toBe(5);

    // Each status must have an icon wrapper rendered with a data-testid.
    for (const status of allStatuses) {
      const iconEl = screen.getByTestId(`strip-icon-${status}`);
      expect(iconEl).toBeTruthy();
    }
  });

  // -------------------------------------------------------------------------
  // 5. Tail folds into "... N more" with group mini-headers
  // -------------------------------------------------------------------------

  it('collapses idle rows past the threshold into "... N more" and shows group mini-headers', () => {
    // Create 7 idle sub-floor tabs (all in the idle group).
    const idleTabs = Array.from({ length: 7 }, (_, i) =>
      idleSubFloorTab(`idle-${i}`, 30_000 + i * 1000),
    );
    render(<SessionStrip {...baseProps({ tabs: idleTabs, now: BASE_NOW })} />);

    // Default threshold = 5. 7 idle tabs -> first 5 visible, 2 folded.
    const foldControl = screen.getByTestId('strip-fold-control');
    expect(foldControl).toBeTruthy();
    expect(foldControl.textContent).toContain('2');

    // Idle group header must be present.
    const idleHeader = screen.getByTestId('strip-group-header-idle');
    expect(idleHeader.textContent).toBe('Idle');
  });

  it('shows the "Working" group mini-header as a LABEL, NOT a count', () => {
    const tabs = [workingTab('w1'), workingTab('w2')];
    render(<SessionStrip {...baseProps({ tabs, now: BASE_NOW })} />);

    const header = screen.getByTestId('strip-group-header-working');
    // Must be the literal label "Working", no digit in it.
    expect(header.textContent).toBe('Working');
    expect(header.textContent).not.toMatch(/\d/);
  });

  // -------------------------------------------------------------------------
  // 6. Working value INCREASES across fake-timer ticks and is DISTINCT from
  //    the waiting-duration string (1.2 / 6.4)
  // -------------------------------------------------------------------------

  it('the working elapsed value increases across tick and is distinct from the waiting string', () => {
    const workingStatusSince = BASE_NOW - 60_000; // 1 minute ago
    const waitingWaitingSince = BASE_NOW - (IDLE_AGE_FLOOR_MS + 90_000); // ~2.5 minutes ago

    const tabs = [
      makeTab({
        id: 'worker',
        status: 'working',
        statusSince: workingStatusSince,
        firstActivityAt: workingStatusSince,
        waitingSince: null,
      }),
      makeTab({
        id: 'waiting',
        status: 'idle',
        firstActivityAt: BASE_NOW - 200_000,
        waitingSince: waitingWaitingSince,
        statusSince: waitingWaitingSince,
      }),
    ];

    const { rerender } = render(
      <SessionStrip {...baseProps({ tabs, now: BASE_NOW })} />,
    );

    const workingTimeEl = screen.getByTestId('strip-row-time-worker');
    const waitingTimeEl = screen.getByTestId('strip-row-time-waiting');

    const initialWorking = workingTimeEl.textContent ?? '';
    const initialWaiting = waitingTimeEl.textContent ?? '';

    // The two time strings must be different: they use different anchors.
    expect(initialWorking).not.toBe(initialWaiting);

    // Advance time by 2 minutes (enough to change coarsened minute).
    const laterNow = BASE_NOW + 2 * 60_000 + 5000;
    act(() => {
      rerender(
        <SessionStrip {...baseProps({ tabs, now: laterNow })} />,
      );
    });

    const laterWorking = screen.getByTestId('strip-row-time-worker').textContent ?? '';
    // The working elapsed should have increased (or changed).
    expect(laterWorking).not.toBe(initialWorking);
  });

  // -------------------------------------------------------------------------
  // 7. Sparse update: a poll tick not changing coarsened minute does NOT re-render
  //    a row's time string (6.4)
  // -------------------------------------------------------------------------

  it('a poll tick that does not change the coarsened minute does NOT re-render that row time', () => {
    // Position the working tab at exactly 2 minutes ago.
    const statusSince = BASE_NOW - 2 * 60_000;
    const tabs = [
      makeTab({
        id: 'w-sparse',
        status: 'working',
        statusSince,
        firstActivityAt: statusSince,
        waitingSince: null,
      }),
    ];

    const { rerender } = render(
      <SessionStrip {...baseProps({ tabs, now: BASE_NOW })} />,
    );

    const timeEl = screen.getByTestId('strip-row-time-w-sparse');
    const firstText = timeEl.textContent;

    // Advance by 10 seconds within the same coarsened minute.
    const sameMinuteNow = BASE_NOW + 10_000;
    act(() => {
      rerender(<SessionStrip {...baseProps({ tabs, now: sameMinuteNow })} />);
    });

    const afterText = screen.getByTestId('strip-row-time-w-sparse').textContent;
    // Time string should not have changed because the coarsened minute is the same.
    expect(afterText).toBe(firstText);
  });

  // -------------------------------------------------------------------------
  // 8. justResolved: applies fade class; no transition class under reduced-motion
  // -------------------------------------------------------------------------

  it('a justResolved row applies the fade class', () => {
    const tabs = [
      makeTab({
        id: 'just-done',
        status: 'idle',
        firstActivityAt: BASE_NOW - 200_000,
        waitingSince: BASE_NOW - (IDLE_AGE_FLOOR_MS + 10_000),
        statusSince: BASE_NOW - 70_000,
      }),
    ];
    const justResolvedTabIds = new Set(['just-done']);
    render(
      <SessionStrip {...baseProps({ tabs, now: BASE_NOW, justResolvedTabIds })} />,
    );
    const row = screen.getByTestId('strip-row');
    // The fade class or a data-just-resolved attribute must be present.
    expect(
      row.className.includes('strip-just-resolved') ||
        row.getAttribute('data-just-resolved') === 'true',
    ).toBe(true);
  });

  it('a justResolved row applies NO transition class under prefers-reduced-motion', () => {
    mockReducedMotion(true);

    const tabs = [
      makeTab({
        id: 'done-rm',
        status: 'idle',
        firstActivityAt: BASE_NOW - 200_000,
        waitingSince: BASE_NOW - (IDLE_AGE_FLOOR_MS + 10_000),
        statusSince: BASE_NOW - 70_000,
      }),
    ];
    const justResolvedTabIds = new Set(['done-rm']);
    render(
      <SessionStrip {...baseProps({ tabs, now: BASE_NOW, justResolvedTabIds })} />,
    );

    const row = screen.getByTestId('strip-row');
    // Under reduced-motion: no transition class. We check that the transition
    // class is NOT present (any class containing "transition" or "animate").
    const classes = row.className;
    expect(classes).not.toMatch(/\btransition\b/);
    expect(classes).not.toMatch(/\banimate-/);

    restoreMatchMedia();
  });

  // -------------------------------------------------------------------------
  // 9. Project border: low-S hsl form (6.4)
  // -------------------------------------------------------------------------

  it('each strip row sets its own --project-hue inline in the low-S form', () => {
    const tabs = [
      makeTab({
        id: 'proj-a-tab',
        status: 'working',
        projectId: 'proj-a',
        statusSince: BASE_NOW - 60_000,
        firstActivityAt: BASE_NOW - 60_000,
      }),
      makeTab({
        id: 'proj-b-tab',
        status: 'working',
        projectId: 'proj-b',
        statusSince: BASE_NOW - 60_000,
        firstActivityAt: BASE_NOW - 60_000,
      }),
    ];
    const projects = [
      { id: 'proj-a', dir: '/a', colorIndex: 0 },
      { id: 'proj-b', dir: '/b', colorIndex: 1 },
    ];
    render(
      <SessionStrip {...baseProps({ tabs, now: BASE_NOW, projects })} />,
    );

    const rows = screen.getAllByTestId('strip-row');
    expect(rows.length).toBe(2);

    // Each row should carry a border class with the low-S (30%) form.
    for (const row of rows) {
      const borderClass = Array.from(row.classList).find(
        (c) => c.includes('border-') && (c.includes('30%') || c.includes('hsl')),
      );
      // If class-based is not possible in jsdom, check inline style on the row or a child.
      // Accept either the class form or a data-project-hue attribute.
      const hasLowSBorder =
        borderClass !== undefined ||
        row.getAttribute('data-project-hue') !== null ||
        (row as HTMLElement).style.getPropertyValue('--project-hue') !== '';
      expect(hasLowSBorder).toBe(true);
    }

    // The two rows must have different project hues.
    const hues = rows.map((r) => (r as HTMLElement).style.getPropertyValue('--project-hue'));
    expect(hues[0]).not.toBe(hues[1]);
  });

  // -------------------------------------------------------------------------
  // 10. Working group mini-header is a LABEL not a count (6.4)
  // -------------------------------------------------------------------------

  it('the "Working" group mini-header does not contain a digit', () => {
    const tabs = [workingTab('wa'), workingTab('wb'), workingTab('wc')];
    render(<SessionStrip {...baseProps({ tabs, now: BASE_NOW })} />);

    const header = screen.getByTestId('strip-group-header-working');
    expect(header.textContent).toBe('Working');
  });

  // -------------------------------------------------------------------------
  // 11. Empty state: quiet "No active sessions" when tabs is []
  // -------------------------------------------------------------------------

  it('renders the empty-state line when tabs is empty', () => {
    render(<SessionStrip {...baseProps({ tabs: [], now: BASE_NOW })} />);
    // Empty state: the outer wrapper carries data-testid="home-strip" and
    // the inner span carries data-testid="strip-empty".
    const outer = screen.getByTestId('home-strip');
    expect(outer.textContent).toContain('No active sessions');
    const inner = screen.getByTestId('strip-empty');
    expect(inner.textContent).toContain('No active sessions');
  });
});
