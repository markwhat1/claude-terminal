/**
 * M11: HomeView uses rankItems(...)[0] as the hero, with the per-day
 * parked-hero-id applied on top via applyReroll.
 *
 * Covers (PLAN-PHASE-2-3.md line 13 / PLAN.md 1.11 / 5.4):
 *
 *   1. Hero is rankItems(...)[0] with golden fixtures:
 *      - time-sensitive card beats a generic needs-you card (Tier 1 > Tier 4).
 *      - dodAlmost card beats a generic needs-you card (Tier 3 > Tier 4).
 *
 *   2. Remaining needs-you list mirrors PRODUCER BOARD ORDER, not rankItems order.
 *      A Phase-2 builder must NOT re-sort the sub-dominant rows.
 *
 *   3. Re-roll control:
 *      - The "Not now" button is present on the hero (the 1.1 "not now" slot,
 *        intentionally empty in Phase 0/1, now filled).
 *      - Clicking it parks the current hero id and surfaces ranked[1] as the
 *        new hero.
 *      - The formerly parked item no longer appears as the hero.
 *
 *   4. Parked id clears on a new day:
 *      - When the clock advances to the next calendar day, the originally-parked
 *        hero returns (applyReroll returns it because the day key no longer matches).
 *
 * The pure re-roll persistence (same-day reload surviving in the serialized slot)
 * is already covered by tests/shared/hero-reroll.test.ts, which tests the pure
 * functions directly. The renderer test focuses on the component wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import HomeView from '@/components/HomeView';
import type { HomeViewProps } from '@/components/HomeView';
import type { ProgramBoardState, DashboardItem } from '@shared/program-board-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fixed clock where 2026-06-23 is within the 5-day time-sensitive window. */
const NOW = new Date(2026, 5, 21, 9, 0, 0); // 2026-06-21 09:00 local
const NEXT_DAY = new Date(2026, 5, 22, 9, 0, 0); // 2026-06-22 09:00 local

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

/** Builds a minimal ProgramCard shape for inline fixtures. */
function makeCard(slug: string, overrides: Partial<ProgramBoardState['programs'][number]> = {}): ProgramBoardState['programs'][number] {
  return {
    slug,
    name: slug.replace(/-/g, ' '),
    repos: [slug],
    sources: [],
    tags: [],
    time_sensitive: null,
    blocked_on: '',
    paused: false,
    git: {
      last_commit: {
        sha: 'abc',
        iso: '2026-06-20T10:00:00-06:00',
        msg: 'work',
        repo: slug,
      },
      age_days: 0,
      uncommitted: false,
      unmerged_branch: null,
    },
    dod: { met: 0, total: 0, gaps: [] },
    last_touched: '2026-06-20T10:00:00-06:00',
    lane: 'blocked',
    age_color: 'green',
    needs_you: true,
    needs_you_reasons: ['needs you'],
    ...overrides,
  };
}

function makeState(cards: ProgramBoardState['programs']): ProgramBoardState {
  return {
    generated_at: '2026-06-21T09:00:00',
    programs: cards,
    suggested: [],
  };
}

function renderReady(state: ProgramBoardState, overrides: Partial<HomeViewProps> = {}) {
  return render(
    <HomeView
      {...baseProps({
        programBoardState: state,
        loadStatus: 'ready',
        ...overrides,
      })}
    />,
  );
}

// ---------------------------------------------------------------------------
// Suppress matchMedia (not relevant here)
// ---------------------------------------------------------------------------

beforeEach(() => {
  if (typeof window !== 'undefined') {
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
    // Start each test with a clean localStorage (no leftover parked slots)
    localStorage.clear();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  if (typeof window !== 'undefined') {
    localStorage.clear();
  }
});

// ---------------------------------------------------------------------------
// 1. Hero = rankItems(...)[0] on golden fixtures
// ---------------------------------------------------------------------------

describe('M11: hero is rankItems[0] (golden fixtures)', () => {
  it('time-sensitive card beats a generic needs-you card (Tier 1 > Tier 4)', () => {
    // Board order: generic card first, then time-sensitive. rankItems puts
    // the time-sensitive card at [0], which must be the hero.
    const state = makeState([
      makeCard('generic-task', {
        name: 'Generic Task',
        time_sensitive: null,
        needs_you: true,
      }),
      makeCard('practice-reports', {
        name: 'Practice Reports',
        time_sensitive: '2026-06-23', // 2 days out, within 5-day window
        needs_you: true,
      }),
    ]);
    renderReady(state);
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Practice Reports');
  });

  it('dodAlmost card beats a generic needs-you card (Tier 3 > Tier 4)', () => {
    // Board order: generic card first, then dodAlmost. rankItems puts the
    // dodAlmost card at [0] as the hero.
    const state = makeState([
      makeCard('generic-task', {
        name: 'Generic Task',
        time_sensitive: null,
        needs_you: true,
      }),
      makeCard('incomplete-notes', {
        name: 'Incomplete Notes',
        time_sensitive: null,
        needs_you: true,
        dod: { met: 0, total: 1, gaps: ['portal live end to end'] }, // dodAlmost: total>0 && total-met===1
      }),
    ]);
    renderReady(state);
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Incomplete Notes');
  });

  it('time-sensitive beats dodAlmost (Tier 1 > Tier 3, BOTH-CONDITIONS golden case)', () => {
    // A card that is both time-sensitive AND dodAlmost is Tier 1 (not Tier 3).
    // Board order: dodAlmost-only first, then the time-sensitive+dodAlmost.
    const state = makeState([
      makeCard('almost-only', {
        name: 'Almost Only',
        time_sensitive: null,
        needs_you: true,
        dod: { met: 0, total: 1, gaps: ['last step'] },
      }),
      makeCard('practice-reports', {
        name: 'Practice Reports',
        time_sensitive: '2026-06-23',
        needs_you: true,
        dod: { met: 1, total: 2, gaps: ['confirm send'] }, // also dodAlmost
      }),
    ]);
    renderReady(state);
    // Hero must be the time-sensitive card, not the non-time-sensitive dodAlmost.
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Practice Reports');
  });
});

// ---------------------------------------------------------------------------
// 2. Remaining list mirrors PRODUCER BOARD ORDER (not rankItems order)
// ---------------------------------------------------------------------------

describe('M11: remaining list mirrors producer board order', () => {
  it('sub-dominant rows appear in producer board order, not rankItems order', () => {
    // Three needs-you cards. Board order: A (generic), B (dodAlmost), C (generic).
    // rankItems puts B first (Tier 3), then A, then C (both Tier 4).
    // The hero should be B (ranked[0]).
    // The sub-dominant rows should be A then C (producer board order, minus the hero).
    const state = makeState([
      makeCard('card-a', {
        name: 'Card A',
        needs_you: true,
        time_sensitive: null,
        git: { last_commit: { sha: 'a', iso: '2026-06-19T10:00:00-06:00', msg: 'a', repo: 'card-a' }, age_days: 2, uncommitted: false, unmerged_branch: null },
      }),
      makeCard('card-b', {
        name: 'Card B',
        needs_you: true,
        time_sensitive: null,
        dod: { met: 0, total: 1, gaps: ['last step'] }, // dodAlmost
      }),
      makeCard('card-c', {
        name: 'Card C',
        needs_you: true,
        time_sensitive: null,
        git: { last_commit: { sha: 'c', iso: '2026-06-18T10:00:00-06:00', msg: 'c', repo: 'card-c' }, age_days: 3, uncommitted: false, unmerged_branch: null },
      }),
    ]);

    renderReady(state);

    // Hero: Card B (dodAlmost, Tier 3)
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Card B');

    // Sub-dominant rows: producer board order with hero removed.
    // Producer order: A, B, C. Minus hero (B) = [A, C].
    const rows = screen.getAllByTestId('home-needs-you-row');
    expect(rows[0].textContent).toBe('Card A');
    expect(rows[1].textContent).toBe('Card C');
    // Card B must NOT appear in the sub-dominant rows (it is the hero).
    expect(rows.map((r) => r.textContent)).not.toContain('Card B');
  });

  it('when rankItems changes the hero but NOT its producer position, the remaining rows still reflect producer order', () => {
    // Board order: A (generic age_days:5, yellow), B (generic age_days:0, green).
    // rankItems Tier 4: hotter ageColor first, so A (yellow) > B (green).
    // Hero = A. Remaining = [B] in producer order. Nothing to re-sort with only one remaining.
    const state = makeState([
      makeCard('card-a', {
        name: 'Card A',
        needs_you: true,
        age_color: 'yellow',
        git: { last_commit: { sha: 'a', iso: '2026-06-16T10:00:00-06:00', msg: 'a', repo: 'card-a' }, age_days: 5, uncommitted: false, unmerged_branch: null },
      }),
      makeCard('card-b', {
        name: 'Card B',
        needs_you: true,
        age_color: 'green',
        git: { last_commit: { sha: 'b', iso: '2026-06-21T10:00:00-06:00', msg: 'b', repo: 'card-b' }, age_days: 0, uncommitted: false, unmerged_branch: null },
      }),
    ]);

    renderReady(state);
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Card A');
    const rows = screen.getAllByTestId('home-needs-you-row');
    expect(rows[0].textContent).toBe('Card B');
  });
});

// ---------------------------------------------------------------------------
// 3. Re-roll: "Not now" button parks the hero and surfaces ranked[1]
// ---------------------------------------------------------------------------

describe('M11: re-roll control', () => {
  it('"Not now" button is present on the hero card', () => {
    const state = makeState([
      makeCard('card-a', { name: 'Card A', needs_you: true }),
      makeCard('card-b', { name: 'Card B', needs_you: true }),
    ]);
    renderReady(state);
    expect(screen.getByTestId('home-hero-reroll')).toBeTruthy();
  });

  it('clicking "Not now" surfaces ranked[1] as the new hero', () => {
    // Two generic cards, same age/color, id tie-break picks card-a first.
    const state = makeState([
      makeCard('card-a', {
        name: 'Card A',
        needs_you: true,
        git: { last_commit: { sha: 'x', iso: '2026-06-20T10:00:00-06:00', msg: 'x', repo: 'card-a' }, age_days: 0, uncommitted: false, unmerged_branch: null },
      }),
      makeCard('card-b', {
        name: 'Card B',
        needs_you: true,
        git: { last_commit: { sha: 'y', iso: '2026-06-20T10:00:00-06:00', msg: 'y', repo: 'card-b' }, age_days: 0, uncommitted: false, unmerged_branch: null },
      }),
    ]);

    renderReady(state);
    // Initial hero: ranked[0]. Both are Tier 4, same ageColor, same gitAgeDays.
    // id tie-break: 'pb:card-a' < 'pb:card-b', so card-a is hero.
    const initialTitle = screen.getByTestId('home-hero-title').textContent;
    expect(initialTitle).toBe('Card A');

    // Click "Not now"
    fireEvent.click(screen.getByTestId('home-hero-reroll'));

    // Ranked[1] (card-b) is now the hero
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Card B');
    // The formerly parked card must not be the hero
    expect(screen.getByTestId('home-hero-title').textContent).not.toBe('Card A');
  });

  it('the re-rolled hero stays replaced across re-renders with the same `now`', () => {
    const state = makeState([
      makeCard('card-a', { name: 'Card A', needs_you: true }),
      makeCard('card-b', { name: 'Card B', needs_you: true }),
    ]);

    const { rerender } = renderReady(state);

    // Park card-a
    fireEvent.click(screen.getByTestId('home-hero-reroll'));
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Card B');

    // Re-render with same props (simulates a poll tick on the same day)
    rerender(
      <HomeView
        {...baseProps({
          programBoardState: state,
          loadStatus: 'ready',
          now: NOW,
        })}
      />,
    );

    // card-b must still be the hero (the park persists within the session)
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Card B');
  });

  it('the parked id clears on a new day: the original hero returns', () => {
    const state = makeState([
      makeCard('card-a', { name: 'Card A', needs_you: true }),
      makeCard('card-b', { name: 'Card B', needs_you: true }),
    ]);

    const { rerender } = renderReady(state);

    // Park card-a today
    fireEvent.click(screen.getByTestId('home-hero-reroll'));
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Card B');

    // Advance to the next calendar day
    rerender(
      <HomeView
        {...baseProps({
          programBoardState: state,
          loadStatus: 'ready',
          now: NEXT_DAY,
        })}
      />,
    );

    // The park is from the previous day: card-a returns as the hero
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Card A');
  });

  it('"Not now" is NOT present when only one needs-you card exists (nothing to surface)', () => {
    // With a single card, ranked[1] does not exist. The re-roll control
    // must be absent so the user is not shown a dead affordance.
    const state = makeState([
      makeCard('solo', { name: 'Solo Card', needs_you: true }),
    ]);
    renderReady(state);
    expect(screen.queryByTestId('home-hero-reroll')).toBeNull();
  });
});
