/**
 * M8b-iii: unified hero / glance count (consolidated honesty test, 4.6).
 *
 * The ONE adversarial scenario: programs:[] + a past-floor idleNeedsYou tab +
 * a paused needs-you card + nonzero closedRecent.
 *
 * Expected result:
 *   - The header reads "1 need you" (the waiting tab), NOT "0 need you".
 *   - The header also reads "N closed, last 24h", NEVER "today".
 *   - That waiting tab IS the hero (its name appears as the hero title).
 *   - The paused card is NOT the hero and NOT in the default needs-you list.
 *
 * Structural requirements tested:
 *   - IDLE_AGE_FLOOR_MS = 60_000: a tab with waitingSince below the floor is
 *     NOT an idleNeedsYou hero candidate.
 *   - firstActivityAt:null / waitingSince:null tabs are NOT idleNeedsYou
 *     (guard null: the spec's exact wording).
 *   - The unified set feeds BOTH the hero AND the "N need you" header (the 4.6
 *     invariant: the count equals exactly what the hero set contains).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import HomeView from '@/components/HomeView';
import type { HomeViewProps } from '@/components/HomeView';
import type { Tab } from '@shared/types';
import { IDLE_AGE_FLOOR_MS } from '@/components/HomeView';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date(2026, 5, 21, 10, 0, 0); // 2026-06-21T10:00:00 local
const NOW_MS = NOW.getTime();

function makeTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: 'tab-1',
    type: 'claude',
    name: 'My Waiting Session',
    defaultName: 'My Waiting Session',
    status: 'idle',
    worktree: null,
    sourceBranch: null,
    cwd: '/some/repo',
    shellType: null,
    pid: 1234,
    sessionId: 'sess-1',
    projectId: 'proj-1',
    statusSince: NOW_MS - 90_000,
    lastActivityAt: NOW_MS - 90_000,
    firstActivityAt: NOW_MS - 200_000,
    waitingSince: NOW_MS - 90_000,  // 90s ago: past the 60s floor
    ...overrides,
  };
}

/** An empty-programs board state (programs:[]) but with a non-null generated_at
 *  so it passes the "not running" guard and reaches the board logic. */
function emptyProgramsState() {
  return {
    generated_at: '2026-06-21T10:00:00',
    programs: [] as import('@shared/program-board-state').ProgramCard[],
    suggested: [],
  };
}

function baseProps(overrides: Partial<HomeViewProps> = {}): HomeViewProps {
  return {
    programBoardState: null,
    loadStatus: 'loading',
    resolvedPath: 'C:\\test\\state.json',
    now: NOW,
    closedRecent: 0,
    recentCloses: [],
    tabs: [],
    onOpenPowerShell: vi.fn(),
    onCopy: vi.fn(),
    onOpenExternal: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. The exported constant IDLE_AGE_FLOOR_MS exists and equals 60000
// ---------------------------------------------------------------------------

describe('M8b-iii: IDLE_AGE_FLOOR_MS constant', () => {
  it('IDLE_AGE_FLOOR_MS is exported from HomeView and equals 60000', () => {
    expect(IDLE_AGE_FLOOR_MS).toBe(60_000);
  });
});

// ---------------------------------------------------------------------------
// 2. Null guard: firstActivityAt:null or waitingSince:null tabs are NOT
//    idleNeedsYou regardless of elapsed time (spec: "guard null").
// ---------------------------------------------------------------------------

describe('M8b-iii: null guard on idle tabs', () => {
  it('a tab with waitingSince:null is NOT the hero even when firstActivityAt is set', () => {
    const tab = makeTab({ waitingSince: null, firstActivityAt: NOW_MS - 200_000 });
    render(
      <HomeView
        {...baseProps({
          programBoardState: emptyProgramsState(),
          loadStatus: 'ready',
          tabs: [tab],
          closedRecent: 1,
        })}
      />,
    );
    // Should show "no programs" / no hero (the tab is not idleNeedsYou).
    expect(screen.queryByTestId('home-hero')).toBeNull();
  });

  it('a tab with firstActivityAt:null is NOT the hero', () => {
    const tab = makeTab({ firstActivityAt: null, waitingSince: NOW_MS - 90_000 });
    render(
      <HomeView
        {...baseProps({
          programBoardState: emptyProgramsState(),
          loadStatus: 'ready',
          tabs: [tab],
          closedRecent: 1,
        })}
      />,
    );
    expect(screen.queryByTestId('home-hero')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Below-floor guard: a tab whose waitingSince is below IDLE_AGE_FLOOR_MS
//    is NOT an idleNeedsYou candidate.
// ---------------------------------------------------------------------------

describe('M8b-iii: below-floor tab is not hero', () => {
  it('a tab waiting only 30s (below the 60s floor) is not the hero when programs:[]', () => {
    const tab = makeTab({
      waitingSince: NOW_MS - 30_000, // 30s: below the 60s floor
      firstActivityAt: NOW_MS - 120_000,
    });
    render(
      <HomeView
        {...baseProps({
          programBoardState: emptyProgramsState(),
          loadStatus: 'ready',
          tabs: [tab],
          closedRecent: 1,
        })}
      />,
    );
    // Below-floor tab does not satisfy idleNeedsYou, so no hero.
    expect(screen.queryByTestId('home-hero')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. The consolidated honesty test (4.6): the ONE adversarial scenario.
//
//    Setup:
//      - programs: [] (empty board, not "not running")
//      - 1 past-floor idleNeedsYou tab ("My Waiting Session")
//      - 1 paused needs-you board card (would add to count if not excluded)
//      - closedRecent: 2
//
//    Assertions:
//      - The header reads "1 need you", never "0"
//      - The header reads "2 closed, last 24h", never "today"
//      - The waiting tab IS the hero (its name is the hero title)
//      - The paused card is NOT the hero
// ---------------------------------------------------------------------------

describe('M8b-iii: consolidated honesty test (4.6)', () => {
  // A paused needs-you board card. Even though needs_you:true, paused:true
  // means it must NOT enter the unified set.
  const pausedCard: import('@shared/program-board-state').ProgramCard = {
    slug: 'paused-decider',
    name: 'Paused Decision',
    repos: ['some-repo'],
    sources: [],
    tags: ['needs-your-decision'],
    time_sensitive: null,
    blocked_on: 'waiting for input',
    paused: true,
    git: { last_commit: null, age_days: 2, uncommitted: false, unmerged_branch: null },
    dod: { met: 0, total: 0, gaps: [] },
    last_touched: null,
    lane: 'active',
    age_color: 'yellow',
    needs_you: true,
    needs_you_reasons: ['needs-your-decision'],
  };

  const pastFloorTab = makeTab({
    id: 'tab-waiting',
    name: 'My Waiting Session',
    waitingSince: NOW_MS - 90_000, // 90s: past the 60s floor
    firstActivityAt: NOW_MS - 200_000,
    status: 'idle',
  });

  const boardStateWithPausedCard = {
    generated_at: '2026-06-21T10:00:00',
    programs: [pausedCard],
    suggested: [],
  };

  it('header reads "1 need you" not "0 need you" when programs:[] has a past-floor idle tab', () => {
    // Use empty programs (no board cards), the idle tab is the only candidate.
    render(
      <HomeView
        {...baseProps({
          programBoardState: emptyProgramsState(),
          loadStatus: 'ready',
          tabs: [pastFloorTab],
          closedRecent: 2,
        })}
      />,
    );
    const countEl = screen.getByTestId('home-need-count');
    expect(countEl.textContent).toContain('1');
    expect(countEl.textContent).not.toContain('0 need');
  });

  it('header reads "N closed, last 24h" never "today" in the unified scenario', () => {
    render(
      <HomeView
        {...baseProps({
          programBoardState: emptyProgramsState(),
          loadStatus: 'ready',
          tabs: [pastFloorTab],
          closedRecent: 2,
        })}
      />,
    );
    const closedEl = screen.getByTestId('home-closed-count');
    expect(closedEl.textContent).toContain('2');
    expect(closedEl.textContent).toContain('last 24h');
    expect(closedEl.textContent?.toLowerCase()).not.toContain('today');
  });

  it('the waiting tab IS the hero (its name is the hero title)', () => {
    render(
      <HomeView
        {...baseProps({
          programBoardState: emptyProgramsState(),
          loadStatus: 'ready',
          tabs: [pastFloorTab],
          closedRecent: 2,
        })}
      />,
    );
    const title = screen.getByTestId('home-hero-title');
    expect(title.textContent).toBe('My Waiting Session');
  });

  it('with paused board card + idle tab: only the idle tab is "need you" (paused excluded)', () => {
    // Board has a paused needs-you card. Tab is past-floor idle. Only the tab
    // enters the unified set.
    render(
      <HomeView
        {...baseProps({
          programBoardState: boardStateWithPausedCard,
          loadStatus: 'ready',
          tabs: [pastFloorTab],
          closedRecent: 2,
        })}
      />,
    );
    const countEl = screen.getByTestId('home-need-count');
    // The count is 1 (only the idle tab), not 2 (which would include the paused card).
    expect(countEl.textContent).toContain('1');
    expect(countEl.textContent).not.toContain('2 need');

    // The hero is the idle tab, not the paused board card.
    const title = screen.getByTestId('home-hero-title');
    expect(title.textContent).toBe('My Waiting Session');
    expect(title.textContent).not.toBe('Paused Decision');
  });

  it('with paused board card + idle tab: the full spec combo test (the 4.6 invariant)', () => {
    // The complete scenario from the spec:
    //   programs:[] + past-floor idleNeedsYou tab + paused needs-you card
    //   + nonzero closedRecent
    // Note: "paused needs-you card" in the spec means a board card that is
    // paused:true but needs_you:true, which would normally add to the count
    // if not excluded. We test with boardStateWithPausedCard (has the paused
    // card) + the idle tab.
    render(
      <HomeView
        {...baseProps({
          programBoardState: boardStateWithPausedCard,
          loadStatus: 'ready',
          tabs: [pastFloorTab],
          closedRecent: 3,
        })}
      />,
    );

    // 1. Header reads "1 need you", never "0".
    const countEl = screen.getByTestId('home-need-count');
    expect(countEl.textContent).toContain('1');
    expect(countEl.textContent).not.toMatch(/\b0 need/);

    // 2. "N closed, last 24h", never "today".
    const closedEl = screen.getByTestId('home-closed-count');
    expect(closedEl.textContent).toContain('3');
    expect(closedEl.textContent).toContain('last 24h');
    expect(closedEl.textContent?.toLowerCase()).not.toContain('today');

    // 3. The waiting tab IS the hero.
    expect(screen.getByTestId('home-hero-title').textContent).toBe('My Waiting Session');
  });
});

// ---------------------------------------------------------------------------
// 5. The glance count equals the hero set (the 4.6 invariant): the number
//    rendered in "N need you" must match the unified candidate count, which
//    includes the hero.
// ---------------------------------------------------------------------------

describe('M8b-iii: glance count == unified set size (4.6 invariant)', () => {
  it('with one past-floor idle tab, the count is 1 and the hero is that tab', () => {
    const tab = makeTab({ name: 'Single Tab', waitingSince: NOW_MS - 120_000, firstActivityAt: NOW_MS - 300_000 });
    render(
      <HomeView
        {...baseProps({
          programBoardState: emptyProgramsState(),
          loadStatus: 'ready',
          tabs: [tab],
          closedRecent: 0,
        })}
      />,
    );
    const countEl = screen.getByTestId('home-need-count');
    expect(countEl.textContent).toContain('1');
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Single Tab');
  });

  it('a tab that is not idle (working) is NOT counted in need-you even if past the floor', () => {
    const workingTab = makeTab({
      status: 'working',
      waitingSince: NOW_MS - 120_000,
      firstActivityAt: NOW_MS - 300_000,
    });
    render(
      <HomeView
        {...baseProps({
          programBoardState: emptyProgramsState(),
          loadStatus: 'ready',
          tabs: [workingTab],
          closedRecent: 0,
        })}
      />,
    );
    // Working tab is not idleNeedsYou, so no hero from it.
    expect(screen.queryByTestId('home-hero')).toBeNull();
  });
});
