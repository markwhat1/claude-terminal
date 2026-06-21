/**
 * M8b-i: done-lane payoff tests.
 *
 * Tests cover:
 *   - "N closed, last 24h" header line, suppressed when zero, present in both
 *     board and caught-up states.
 *   - justResolved ordinary settle class (no decidedAndWorked flag).
 *   - decidedAndWorked settle class (slightly longer).
 *   - Both tiers apply NO transition class under a prefers-reduced-motion mock
 *     (count still ticks regardless of motion preference).
 *   - Count absent (not "0") when closedRecent is zero.
 *   - Displayed count does NOT decrease within a session from 24h pruning.
 *   - "last 24h" framing, never "today".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import HomeView from '@/components/HomeView';
import type { HomeViewProps } from '@/components/HomeView';
import type { ProgramBoardState } from '@shared/program-board-state';
import { parseState } from '@shared/program-board-state';
import { closedRecentLine } from '@shared/home-copy';

// ---------------------------------------------------------------------------
// Fixture loader
// ---------------------------------------------------------------------------

const FIX_DIR = path.resolve(__dirname, '../fixtures/dashboard');

function loadState(name: string): ProgramBoardState {
  const raw = readFileSync(path.join(FIX_DIR, name), 'utf-8');
  const parsed = parseState(raw);
  if (!parsed) throw new Error(`fixture ${name} failed to parse`);
  return parsed;
}

const NOW = new Date(2026, 5, 21, 1, 1, 0); // 2026-06-21T01:01:00 local

function baseProps(overrides: Partial<HomeViewProps> = {}): HomeViewProps {
  return {
    programBoardState: null,
    loadStatus: 'loading',
    resolvedPath: 'C:\\Users\\Mark\\Claude-Code\\dashboard\\state.json',
    now: NOW,
    closedRecent: 0,
    recentCloses: [],
    onOpenPowerShell: vi.fn(),
    onCopy: vi.fn(),
    onOpenExternal: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

function renderReady(name: string, overrides: Partial<HomeViewProps> = {}) {
  const state = loadState(name);
  return render(
    <HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready', ...overrides })} />,
  );
}

// Build a caught-up state (no needs-you cards, not empty programs).
function caughtUpState(): ProgramBoardState {
  return {
    generated_at: '2026-06-21T01:00:00',
    programs: [
      {
        slug: 'done-prog',
        name: 'Done Program',
        repos: ['repo-x'],
        sources: [],
        tags: [],
        time_sensitive: null,
        blocked_on: '',
        paused: false,
        git: { last_commit: null, age_days: 0, uncommitted: false, unmerged_branch: null },
        dod: { met: 3, total: 3, gaps: [] },
        last_touched: null,
        lane: 'done',
        age_color: 'green',
        needs_you: false,
        needs_you_reasons: [],
      },
    ],
    suggested: [],
  };
}

// ---------------------------------------------------------------------------
// prefers-reduced-motion mock helpers
// ---------------------------------------------------------------------------

/** Mock window.matchMedia to report prefers-reduced-motion: reduce. */
function mockReducedMotion() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
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

/** Restore window.matchMedia to report no reduced-motion preference. */
function mockNoReducedMotion() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
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
// 1. closedRecentLine helper: always "last 24h", never "today"
// ---------------------------------------------------------------------------

describe('M8b-i: closedRecentLine copy', () => {
  it('reads "N closed, last 24h" and never contains "today"', () => {
    const line = closedRecentLine(3);
    expect(line).toContain('last 24h');
    expect(line.toLowerCase()).not.toContain('today');
    expect(line).toContain('3');
  });

  it('the copy module exports closedRecentLine', () => {
    // Verifies the function is exported (a missing export would fail the import above).
    expect(typeof closedRecentLine).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// 2. "N closed, last 24h" header line suppressed when zero
// ---------------------------------------------------------------------------

describe('M8b-i: closed count absent when zero', () => {
  it('no closed-count element when closedRecent is 0 (board state)', () => {
    renderReady('time-sensitive.json', { closedRecent: 0, recentCloses: [] });
    expect(screen.queryByTestId('home-closed-count')).toBeNull();
  });

  it('no closed-count element showing "0" in any form when closedRecent is 0', () => {
    const { container } = renderReady('time-sensitive.json', { closedRecent: 0 });
    // There should be no element with text matching "0 closed" anywhere.
    const text = container.textContent ?? '';
    expect(text).not.toContain('0 closed');
  });

  it('no closed-count element when closedRecent is 0 (caught-up state)', () => {
    const state = caughtUpState();
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready', closedRecent: 0 })} />);
    expect(screen.queryByTestId('home-closed-count')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. "N closed, last 24h" header line present when nonzero
// ---------------------------------------------------------------------------

describe('M8b-i: closed count displayed when nonzero', () => {
  it('renders "N closed, last 24h" in the board header when closedRecent > 0', () => {
    renderReady('time-sensitive.json', { closedRecent: 2, recentCloses: [] });
    const el = screen.getByTestId('home-closed-count');
    expect(el.textContent).toContain('2');
    expect(el.textContent).toContain('last 24h');
    expect(el.textContent?.toLowerCase()).not.toContain('today');
  });

  it('renders "N closed, last 24h" in the caught-up state when closedRecent > 0', () => {
    const state = caughtUpState();
    render(
      <HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready', closedRecent: 3 })} />,
    );
    const el = screen.getByTestId('home-closed-count');
    expect(el.textContent).toContain('3');
    expect(el.textContent).toContain('last 24h');
    expect(el.textContent?.toLowerCase()).not.toContain('today');
  });

  it('the closed count reads as a goal reached when nonzero in caught-up (not a blank reset)', () => {
    const state = caughtUpState();
    render(
      <HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready', closedRecent: 1 })} />,
    );
    // The caught-up acknowledgment AND the count are both present.
    expect(screen.getByTestId('home-caught-up').textContent).toContain('Clear. Keep working.');
    expect(screen.getByTestId('home-closed-count')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 4. justResolved ordinary settle class (no decidedAndWorked)
// ---------------------------------------------------------------------------

describe('M8b-i: justResolved ordinary settle beat', () => {
  beforeEach(() => {
    mockNoReducedMotion();
  });

  it('a justResolved card applies the ordinary settle class (not the longer class)', () => {
    const state = loadState('time-sensitive.json');
    // The hero card is pb:practice-reports (time-sensitive.json slug).
    // Passing its id in recentCloses with decidedAndWorked:false triggers the
    // ordinary settle class.
    const heroId = `pb:${state.programs[0].slug}`;
    render(
      <HomeView
        {...baseProps({
          programBoardState: state,
          loadStatus: 'ready',
          closedRecent: 1,
          recentCloses: [{ id: heroId, closedAt: NOW.toISOString(), decidedAndWorked: false, avoidanceClose: null }],
        })}
      />,
    );
    const hero = screen.getByTestId('home-hero');
    expect(hero.className).toContain('settle-ordinary');
    expect(hero.className).not.toContain('settle-decided');
  });
});

// ---------------------------------------------------------------------------
// 5. decidedAndWorked settle class (slightly longer)
// ---------------------------------------------------------------------------

describe('M8b-i: decidedAndWorked settle beat', () => {
  beforeEach(() => {
    mockNoReducedMotion();
  });

  it('a decidedAndWorked justResolved card applies the longer settle class', () => {
    const state = loadState('time-sensitive.json');
    const heroId = `pb:${state.programs[0].slug}`;
    // Passing decidedAndWorked:true triggers the longer settle class.
    render(
      <HomeView
        {...baseProps({
          programBoardState: state,
          loadStatus: 'ready',
          closedRecent: 1,
          recentCloses: [{ id: heroId, closedAt: NOW.toISOString(), decidedAndWorked: true, avoidanceClose: null }],
        })}
      />,
    );
    const hero = screen.getByTestId('home-hero');
    expect(hero.className).toContain('settle-decided');
    expect(hero.className).not.toContain('settle-ordinary');
  });
});

// ---------------------------------------------------------------------------
// 6. Both tiers apply NO transition class under prefers-reduced-motion
//    (count still ticks regardless)
// ---------------------------------------------------------------------------

describe('M8b-i: prefers-reduced-motion suppresses transitions, not count', () => {
  beforeEach(() => {
    mockReducedMotion();
  });

  afterEach(() => {
    mockNoReducedMotion();
  });

  it('ordinary settle: no transition class under reduced-motion, count still renders', () => {
    const state = loadState('time-sensitive.json');
    const heroId = `pb:${state.programs[0].slug}`;
    render(
      <HomeView
        {...baseProps({
          programBoardState: state,
          loadStatus: 'ready',
          closedRecent: 2,
          recentCloses: [{ id: heroId, closedAt: NOW.toISOString(), decidedAndWorked: false, avoidanceClose: null }],
        })}
      />,
    );
    const hero = screen.getByTestId('home-hero');
    // Under reduced motion neither settle class must carry an active transition.
    // The component suppresses the motion-safe transition class variant.
    expect(hero.className).not.toContain('transition');
    // The count still ticks (the element is still present).
    expect(screen.getByTestId('home-closed-count').textContent).toContain('2');
  });

  it('decidedAndWorked settle: no transition class under reduced-motion, count still renders', () => {
    const state = loadState('time-sensitive.json');
    const heroId = `pb:${state.programs[0].slug}`;
    render(
      <HomeView
        {...baseProps({
          programBoardState: state,
          loadStatus: 'ready',
          closedRecent: 1,
          recentCloses: [{ id: heroId, closedAt: NOW.toISOString(), decidedAndWorked: true, avoidanceClose: null }],
        })}
      />,
    );
    const hero = screen.getByTestId('home-hero');
    expect(hero.className).not.toContain('transition');
    // Count ticks.
    expect(screen.getByTestId('home-closed-count').textContent).toContain('1');
  });
});

// ---------------------------------------------------------------------------
// 7. Displayed count does NOT decrease within a session from 24h pruning
//    (the loss-aversion fixture: render with high count, then low count;
//     the displayed value uses the session-high, not the pruned set size)
// ---------------------------------------------------------------------------

describe('M8b-i: loss-aversion: count does not decrease from pruning', () => {
  it('re-rendering with a lower closedRecent does not shrink the displayed count below the session-high', () => {
    // First render: closedRecent = 3 (session high is set).
    const state = loadState('time-sensitive.json');
    const { rerender } = render(
      <HomeView
        {...baseProps({ programBoardState: state, loadStatus: 'ready', closedRecent: 3 })}
      />,
    );
    expect(screen.getByTestId('home-closed-count').textContent).toContain('3');

    // Second render: closedRecent drops to 1 (24h pruning scenario). The
    // displayed count must remain at 3 (the session-high), not drop to 1.
    rerender(
      <HomeView
        {...baseProps({ programBoardState: state, loadStatus: 'ready', closedRecent: 1 })}
      />,
    );
    const countEl = screen.getByTestId('home-closed-count');
    // Must still show 3, not 1.
    expect(countEl.textContent).toContain('3');
    expect(countEl.textContent).not.toContain('1 closed');
  });

  it('count starts from the initial closedRecent and only increases', () => {
    const state = loadState('time-sensitive.json');
    const { rerender } = render(
      <HomeView
        {...baseProps({ programBoardState: state, loadStatus: 'ready', closedRecent: 2 })}
      />,
    );
    // Goes up.
    rerender(
      <HomeView
        {...baseProps({ programBoardState: state, loadStatus: 'ready', closedRecent: 5 })}
      />,
    );
    expect(screen.getByTestId('home-closed-count').textContent).toContain('5');

    // Goes down (pruning): must stay at 5.
    rerender(
      <HomeView
        {...baseProps({ programBoardState: state, loadStatus: 'ready', closedRecent: 2 })}
      />,
    );
    expect(screen.getByTestId('home-closed-count').textContent).toContain('5');
  });
});

// ---------------------------------------------------------------------------
// 8. Saturation-capped hero band (already present in M8a, verified here)
//    The band is border-l-4 + an ageColorClass on the Card root (1.4).
// ---------------------------------------------------------------------------

describe('M8b-i: saturation-capped hero band', () => {
  it('the hero card carries a thin left-edge age-band border, not a fill', () => {
    renderReady('time-sensitive.json', { closedRecent: 0 });
    const hero = screen.getByTestId('home-hero');
    // border-l-4 is the thin band; the hero is never a filled colored card.
    expect(hero.className).toContain('border-l-4');
    // The band resolves to one of the four border-* tokens, never a bg-* color.
    const cls = hero.className;
    const hasBorderColor =
      cls.includes('border-success') ||
      cls.includes('border-warning') ||
      cls.includes('border-age-orange') ||
      cls.includes('border-destructive');
    expect(hasBorderColor).toBe(true);
  });

  it('the hero body carries no age-color fill class', () => {
    renderReady('time-sensitive.json', { closedRecent: 0 });
    const hero = screen.getByTestId('home-hero');
    const cls = hero.className;
    // None of the age-color tokens appear as a bg- utility on the hero.
    expect(cls).not.toContain('bg-success');
    expect(cls).not.toContain('bg-warning');
    expect(cls).not.toContain('bg-age-orange');
    expect(cls).not.toContain('bg-destructive');
  });
});
