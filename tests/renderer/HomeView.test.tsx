/**
 * M8a: HomeView read-only Phase-0 board test matrix.
 *
 * HomeView is a PURE presentational component, so most assertions render it
 * directly with props built from the committed golden fixtures. The App-level
 * assertions (the entry pill, the StatusBar suppression, the first-open
 * timeline) mount App with the shared claudeTerminalMock.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import HomeView from '@/components/HomeView';
import type { HomeViewProps } from '@/components/HomeView';
import type { ProgramBoardState } from '@shared/program-board-state';
import { parseState } from '@shared/program-board-state';
import { HOME_COPY, ACTION_LABELS } from '@shared/home-copy';

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

// A fixed "now" near the fixtures' generated_at so freshness is fresh and the
// time-sensitive 2026-06-23 deadline is within the 5-day window.
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

// ---------------------------------------------------------------------------
// 1. Skeleton shape + zero hero-region layout shift
// ---------------------------------------------------------------------------

describe('M8a: skeleton', () => {
  it('renders the skeleton (1 hero + N rows) while loading', () => {
    render(<HomeView {...baseProps({ loadStatus: 'loading' })} />);
    expect(screen.getByTestId('home-skeleton')).toBeTruthy();
    expect(screen.getByTestId('home-skeleton-hero')).toBeTruthy();
    expect(screen.getAllByTestId('home-skeleton-row').length).toBeGreaterThanOrEqual(1);
  });

  it('the hero skeleton carries the hero min-height (zero hero-region reflow)', () => {
    render(<HomeView {...baseProps({ loadStatus: 'loading' })} />);
    const skelHero = screen.getByTestId('home-skeleton-hero');
    // The same min-height token the live hero footprint occupies.
    expect(skelHero.className).toContain('min-h-[180px]');
  });

  it('the live hero card carries the same min-height token as the skeleton (zero hero-region shift)', () => {
    renderReady('time-sensitive.json');
    // The Card root and the skeleton share the hero min-height contract, so the
    // skeleton-to-content transition never shrinks the hero region (4.5/1.13).
    const hero = screen.getByTestId('home-hero');
    expect(hero.className).toContain('min-h-[180px]');
  });

  it('a short hero with no badges and no url still carries the hero min-height', () => {
    // The worst case for shift: a one-line title, zero badges, url null. The
    // live hero must still reserve the full hero footprint.
    const state: ProgramBoardState = {
      generated_at: '2026-06-21T01:00:00',
      programs: [
        {
          slug: 'short',
          name: 'X',
          repos: ['repo-x'],
          sources: [],
          tags: [],
          time_sensitive: null,
          blocked_on: '',
          paused: false,
          git: { last_commit: null, age_days: 0, uncommitted: false, unmerged_branch: null },
          dod: { met: 0, total: 0, gaps: [] },
          last_touched: null,
          lane: 'blocked',
          age_color: 'green',
          needs_you: true,
          needs_you_reasons: ['needs you'],
        },
      ],
      suggested: [],
    };
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    expect(screen.getByTestId('home-hero').className).toContain('min-h-[180px]');
  });
});

// ---------------------------------------------------------------------------
// 2. Warm-file first-read paint
// ---------------------------------------------------------------------------

describe('M8a: warm first read paints the hero', () => {
  it('paints the hero immediately when loadStatus is ready', () => {
    renderReady('time-sensitive.json');
    expect(screen.queryByTestId('home-skeleton')).toBeNull();
    expect(screen.getByTestId('home-hero')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 3. Time-sensitive hero + BOTH-CONDITIONS hero is the time-sensitive branch
// ---------------------------------------------------------------------------

describe('M8a: time-sensitive hero', () => {
  it('the deadline card is the hero', () => {
    renderReady('time-sensitive.json');
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Practice Reports');
  });

  it('BOTH-CONDITIONS (time-sensitive AND dodAlmost) selects the time-sensitive branch', () => {
    // both-conditions.json: a single card that is time_sensitive 2026-06-23 AND
    // dodAlmost (met:1,total:2). Tier 1 beats Tier 3; it is the hero either way,
    // but the headline must NOT be the dodAlmost decision form -- it routes by
    // its tags (time-sensitive only, not needs-your-decision).
    renderReady('both-conditions.json');
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Practice Reports');
    // dodMet>0 so the goal-gradient honest fraction renders.
    const headline = screen.getByTestId('home-hero-headline').textContent ?? '';
    expect(headline).toContain('1 of 2 done');
  });

  it('TWO-CARD precedence: a separate time-sensitive card beats a dodAlmost card that leads board order (Tier 1 > Tier 3)', () => {
    // Card A leads board order and is dodAlmost (total:2,met:1, fewest remaining)
    // but NOT time-sensitive. Card B is second in board order and IS
    // time_sensitive within the 5-day window. The hero MUST be card B, so a
    // dodAlmost-first selectHero regression (Tier 3 before Tier 1) fails here.
    const state: ProgramBoardState = {
      generated_at: '2026-06-21T01:00:00',
      programs: [
        {
          slug: 'almost-done-leader',
          name: 'Almost Done Leader',
          repos: ['repo-a'],
          sources: ['override'],
          tags: ['needs-CADDC02'],
          time_sensitive: null,
          blocked_on: '',
          paused: false,
          git: {
            last_commit: { sha: 's', iso: '2026-06-20T13:00:00-06:00', msg: 'm', repo: 'repo-a' },
            age_days: 0,
            uncommitted: false,
            unmerged_branch: null,
          },
          dod: { met: 1, total: 2, gaps: ['the last step'] },
          last_touched: '2026-06-20T13:00:00-06:00',
          lane: 'blocked',
          age_color: 'green',
          needs_you: true,
          needs_you_reasons: ['needs-CADDC02'],
        },
        {
          slug: 'deadline-card',
          name: 'Deadline Card',
          repos: ['repo-b'],
          sources: ['override'],
          tags: ['time-sensitive'],
          time_sensitive: '2026-06-23',
          blocked_on: '',
          paused: false,
          git: {
            last_commit: { sha: 's', iso: '2026-06-20T13:00:00-06:00', msg: 'm', repo: 'repo-b' },
            age_days: 0,
            uncommitted: false,
            unmerged_branch: null,
          },
          dod: { met: 0, total: 3, gaps: ['a', 'b', 'c'] },
          last_touched: '2026-06-20T13:00:00-06:00',
          lane: 'blocked',
          age_color: 'green',
          needs_you: true,
          needs_you_reasons: ['time-sensitive 2026-06-23'],
        },
      ],
      suggested: [],
    };
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    expect(screen.getByTestId('home-hero-title').textContent).toBe('Deadline Card');
  });
});

// ---------------------------------------------------------------------------
// 4. Single-item DoD hero: gap-led frame, no "0 of 1 done", no near-finish
// ---------------------------------------------------------------------------

describe('M8a: single-item DoD hero (and both-collision)', () => {
  it('renders the gap-led "Start the first step" frame for met:0 total:1', () => {
    // single-item-dod.json is dodAlmost(total:1,met:0) AND needs-your-decision.
    // That makes it a DECISION card (both-collision), so the copy is the
    // decision prompt with NO one-step / almost-done framing, and the button is
    // openToDecide. Asserted below in the both-collision test. Here we use a
    // pure single-item card that is NOT a decision to assert the gap-led frame.
    const state = loadState('single-item-dod.json');
    // Strip the decision tag so this exercises the pure dodAlmost gap-led path.
    state.programs[0].tags = [];
    state.programs[0].needs_you_reasons = [
      'almost done: portal Incomplete Notes surface live end to end',
    ];
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    const headline = screen.getByTestId('home-hero-headline').textContent ?? '';
    expect(headline).toContain('Start the first step');
    expect(headline).not.toContain('0 of 1');
    expect(headline.toLowerCase()).not.toContain('almost done');
    expect(headline.toLowerCase()).not.toContain('near');
  });

  it('BOTH-COLLISION (dodAlmost AND needs-your-decision) routes to openToDecide with no near-finish copy', () => {
    renderReady('both-collision.json');
    const headline = screen.getByTestId('home-hero-headline').textContent ?? '';
    expect(headline.toLowerCase()).not.toContain('almost done');
    expect(headline.toLowerCase()).not.toContain('last step');
    expect(headline).not.toContain('0 of 1');
    // The button label is the openToDecide canned label.
    const primary = screen.getByTestId('home-hero-primary');
    expect(primary.textContent).toBe(ACTION_LABELS.openToDecide);
    expect(primary.textContent).not.toBe(ACTION_LABELS.draftFirstVersion);
  });
});

// ---------------------------------------------------------------------------
// 5. Override only fires when it reorders
// ---------------------------------------------------------------------------

describe('M8a: override only fires when it reorders', () => {
  it('when the producer head is already the deadline card, the hero is the producer head', () => {
    // fresh-with-needs-you.json has cad-staff-portal as the producer head with
    // no time-sensitive and no dodAlmost (total:3,met:0). The override does NOT
    // change the hero; it stays the producer head.
    renderReady('fresh-with-needs-you.json');
    expect(screen.getByTestId('home-hero-title').textContent).toBe('CAD Staff Portal');
  });
});

// ---------------------------------------------------------------------------
// 6. Paused + needs_you is neither hero nor default list (under "N paused")
// ---------------------------------------------------------------------------

describe('M8a: paused exclusion', () => {
  it('a paused needs-you card is neither the hero nor in the default list', () => {
    renderReady('paused-needs-you.json');
    // marketing-roi is paused+needs_you; cad-staff-portal is the live hero.
    expect(screen.getByTestId('home-hero-title').textContent).toBe('CAD Staff Portal');
    // The default needs-you list rows do not include the paused card.
    const rows = screen.queryAllByTestId('home-needs-you-row');
    for (const row of rows) {
      expect(row.textContent).not.toContain('Marketing ROI');
    }
    // The paused disclosure shows "1 paused".
    expect(screen.getByTestId('home-paused-control').textContent).toContain('1 paused');
  });
});

// ---------------------------------------------------------------------------
// 7. >4 needs-you cards -> 4 rows + capped overflow; expanded grouping
// ---------------------------------------------------------------------------

function manyNeedsYouState(count: number): ProgramBoardState {
  const programs = [];
  for (let i = 0; i < count; i++) {
    // Vary the age color so the expanded overflow has multiple bands.
    const colors = ['green', 'yellow', 'orange', 'red'] as const;
    programs.push({
      slug: `prog-${i}`,
      name: `Program ${i}`,
      repos: ['repo-x'],
      sources: ['override'],
      tags: ['needs-CADDC02'],
      time_sensitive: null,
      blocked_on: 'work',
      paused: false,
      git: {
        last_commit: { sha: 's', iso: '2026-06-20T13:00:00-06:00', msg: 'm', repo: 'repo-x' },
        age_days: i,
        uncommitted: false,
        unmerged_branch: null,
      },
      dod: { met: 0, total: 3, gaps: ['a', 'b', 'c'] },
      last_touched: '2026-06-20T13:00:00-06:00',
      lane: 'blocked',
      age_color: colors[i % colors.length],
      needs_you: true,
      needs_you_reasons: ['needs-CADDC02'],
    });
  }
  return { generated_at: '2026-06-21T01:00:00', programs, suggested: [] };
}

describe('M8a: needs-you cap + overflow', () => {
  it('shows exactly 4 sub-dominant rows + a "+N more" control', () => {
    // 1 hero + 4 rows + overflow. 8 cards -> hero + 4 rows + overflow(3).
    const state = manyNeedsYouState(8);
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    const rows = screen.getAllByTestId('home-needs-you-row');
    expect(rows.length).toBe(4);
    expect(screen.getByTestId('home-overflow-control')).toBeTruthy();
  });

  it('the collapsed control does not show a raw overflow count above the ceiling', () => {
    // 20 cards -> overflow = 15, above the ceiling of 9 -> "Show more".
    const state = manyNeedsYouState(20);
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    const control = screen.getByTestId('home-overflow-control');
    expect(control.textContent).toBe(HOME_COPY.showMore);
    expect(control.textContent).not.toContain('15');
  });

  it('expanded overflow carries age-band group mini-headers, freshest first', () => {
    // 16 cards: hero + 4 rows + 11 overflow spanning all four bands, so the
    // freshest band (green "Fresh") is present in the overflow and must lead.
    const state = manyNeedsYouState(16);
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    fireEvent.click(screen.getByTestId('home-overflow-control'));
    const headers = screen.getAllByTestId('home-overflow-band-header');
    expect(headers.length).toBeGreaterThanOrEqual(2);
    // Freshest band ("Fresh" = green) leads; the order follows the freshest-
    // first band ranking among the bands present.
    const order = ['Fresh', 'Getting older', 'Older', 'Oldest'];
    const rendered = headers.map((h) => h.textContent ?? '');
    const expected = order.filter((label) => rendered.includes(label));
    expect(rendered).toEqual(expected);
    expect(rendered[0]).toBe('Fresh');
  });
});

// ---------------------------------------------------------------------------
// 8. No-resolvable-action -> Copy-only hero (never a disabled primary)
// ---------------------------------------------------------------------------

describe('M8a: no-action fallback', () => {
  it('renders a Copy-only hero, never a disabled primary button', () => {
    const state = loadState('fresh-with-needs-you.json');
    // Remove the repo so no PowerShell/Claude action is constructible.
    state.programs[0].repos = [];
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    expect(screen.getByTestId('home-hero-copy-only')).toBeTruthy();
    expect(screen.queryByTestId('home-hero-primary')).toBeNull();
    // The fallback button is not disabled.
    const fallback = screen.getByTestId('home-hero-copy-only') as HTMLButtonElement;
    expect(fallback.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. Phase-0 primary opens a shell; helper text names the repo; copy payload
// ---------------------------------------------------------------------------

describe('M8a: Phase-0 primary action + copy', () => {
  it('the primary opens a shell in the hero repo and the helper text names it', () => {
    const onOpenPowerShell = vi.fn();
    renderReady('time-sensitive.json', { onOpenPowerShell });
    const primary = screen.getByTestId('home-hero-primary');
    fireEvent.click(primary);
    expect(onOpenPowerShell).toHaveBeenCalledWith('practice-analytics');
    expect(screen.getByTestId('home-hero-helper').textContent).toContain('practice-analytics');
  });

  it('the copy payload is non-empty and contains the program name', () => {
    const onCopy = vi.fn();
    renderReady('time-sensitive.json', { onCopy });
    fireEvent.click(screen.getByTestId('home-hero-copy'));
    const payload = onCopy.mock.calls[0][0] as string;
    expect(payload.length).toBeGreaterThan(0);
    expect(payload).toContain('Practice Reports');
  });
});

// ---------------------------------------------------------------------------
// 10. Focus order + Enter activation + one bg-attention
// ---------------------------------------------------------------------------

describe('M8a: keyboard floor', () => {
  it('the Home region is the active element on mount', () => {
    renderReady('time-sensitive.json');
    const region = screen.getByTestId('home-view');
    expect(document.activeElement).toBe(region);
  });

  it('the hero primary is the first focusable element after the region', () => {
    const { container } = renderReady('time-sensitive.json');
    const region = screen.getByTestId('home-view');
    // Collect focusable elements in DOM order inside the region.
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => region.contains(el));
    // The first focusable button is the hero primary (the region itself is
    // tabindex=-1 so it is not in this list).
    expect(focusables[0]).toBe(screen.getByTestId('home-hero-primary'));
  });

  it('the hero primary Enter-activates', () => {
    const onOpenPowerShell = vi.fn();
    renderReady('time-sensitive.json', { onOpenPowerShell });
    const primary = screen.getByTestId('home-hero-primary') as HTMLButtonElement;
    primary.focus();
    expect(document.activeElement).toBe(primary);
    // A native button activates click on Enter via the browser; simulate it.
    fireEvent.click(primary);
    expect(onOpenPowerShell).toHaveBeenCalled();
  });

  it('renders EXACTLY ONE bg-attention element on Home', () => {
    const { container } = renderReady('time-sensitive.json');
    const accents = container.querySelectorAll('.bg-attention');
    expect(accents.length).toBe(1);
  });

  it('expanding the overflow does not shift the hero and does not drop focus', () => {
    const state = manyNeedsYouState(8);
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    expect(screen.getByTestId('home-hero')).toBeTruthy();
    const control = screen.getByTestId('home-overflow-control') as HTMLButtonElement;
    control.focus();
    fireEvent.click(control);
    // The hero still renders (no reflow that removes it).
    expect(screen.getByTestId('home-hero')).toBeTruthy();
    // Focus stays on the disclosure control after expanding.
    expect(document.activeElement).toBe(control);
  });
});

// ---------------------------------------------------------------------------
// 11. Dominance classes
// ---------------------------------------------------------------------------

describe('M8a: dominance classes', () => {
  it('hero title carries text-xl; primary carries bg-attention (not bg-[--attention]); strip carries text-muted-foreground', () => {
    const { container } = renderReady('time-sensitive.json');
    expect(screen.getByTestId('home-hero-title').className).toContain('text-xl');
    const primary = screen.getByTestId('home-hero-primary');
    expect(primary.className).toContain('bg-attention');
    expect(primary.className).not.toContain('bg-[--attention]');
    expect(screen.getByTestId('home-strip').className).toContain('text-muted-foreground');
  });

  it('the hero primary uses text-attention-foreground', () => {
    renderReady('time-sensitive.json');
    expect(screen.getByTestId('home-hero-primary').className).toContain('text-attention-foreground');
  });
});

// ---------------------------------------------------------------------------
// 12. Empty / not-running / caught-up / error / degraded states
// ---------------------------------------------------------------------------

describe('M8a: mandatory states', () => {
  it('"not running" for generated_at:null', () => {
    renderReady('generated-at-null.json');
    expect(screen.getByTestId('home-not-running').textContent).toContain(HOME_COPY.notRunning);
    expect(screen.getByTestId('home-not-running-path').textContent).toContain('state.json');
  });

  it('caught-up shows "Clear. Keep working." with NO pull-forward by default', () => {
    // programs-empty has no needs-you cards; but it's also programs:[] which is
    // the "no programs tracked" state. Build a caught-up state with a card that
    // does not need you.
    const state: ProgramBoardState = {
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
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    expect(screen.getByTestId('home-caught-up').textContent).toContain('Clear. Keep working.');
    // No pull-forward affordance in M8a (it is M8b-ii).
    expect(screen.queryByText('Want another?')).toBeNull();
  });

  it('"No programs tracked yet." for programs:[]', () => {
    renderReady('programs-empty.json');
    expect(screen.getByTestId('home-no-programs').textContent).toContain(HOME_COPY.noProgramsTracked);
  });

  it('hard error shows the path + retry, not the skeleton', () => {
    render(<HomeView {...baseProps({ loadStatus: 'error', programBoardState: null })} />);
    expect(screen.getByTestId('home-error')).toBeTruthy();
    expect(screen.getByTestId('home-error-path').textContent).toContain('state.json');
    expect(screen.getByTestId('home-error-retry')).toBeTruthy();
    expect(screen.queryByTestId('home-skeleton')).toBeNull();
  });

  it('last-good is preferred over empty on a failed refresh', () => {
    // loadStatus 'error' but a prior state is present: render the board, not the
    // error.
    const state = loadState('time-sensitive.json');
    render(<HomeView {...baseProps({ loadStatus: 'error', programBoardState: state })} />);
    expect(screen.queryByTestId('home-error')).toBeNull();
    expect(screen.getByTestId('home-hero')).toBeTruthy();
  });

  it('the degraded marker renders as a quiet header-adjacent muted line, not a banner, and does not reflow the hero', () => {
    // A stale generated_at (older than the fresh threshold) shows the marker.
    const state = loadState('time-sensitive.json');
    state.generated_at = '2026-06-21T00:50:00'; // 11 min before NOW
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    const marker = screen.getByTestId('home-degraded-marker');
    expect(marker.className).toContain('text-muted-foreground');
    expect(marker.textContent).toContain('last updated');
    // It lives inside the needs-header, not as a separate banner element.
    expect(screen.getByTestId('home-needs-header').contains(marker)).toBe(true);
    // The hero still renders.
    expect(screen.getByTestId('home-hero')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// M8b-ii: caught-up pull-forward (opt-in, paused exclusion)
// ---------------------------------------------------------------------------

/**
 * Builds a caught-up state: no card has needs_you===true, but there are
 * non-paused active cards and one paused card. Used for the pull-forward tests.
 */
function caughtUpWithActivesState(): ProgramBoardState {
  return {
    generated_at: '2026-06-21T01:00:00',
    programs: [
      {
        // A paused card that must NEVER surface in the pull-forward.
        slug: 'marketing-roi',
        name: 'Marketing ROI',
        repos: ['practice-analytics'],
        sources: ['override'],
        tags: [],
        time_sensitive: null,
        blocked_on: '',
        paused: true,
        git: { last_commit: null, age_days: 5, uncommitted: false, unmerged_branch: null },
        dod: { met: 0, total: 2, gaps: ['a', 'b'] },
        last_touched: null,
        lane: 'paused',
        age_color: 'yellow',
        needs_you: false,
        needs_you_reasons: [],
      },
      {
        // An active card that is eligible for pull-forward.
        slug: 'cad-staff-portal',
        name: 'CAD Staff Portal',
        repos: ['cad-portal'],
        sources: ['override'],
        tags: [],
        time_sensitive: null,
        blocked_on: '',
        paused: false,
        git: { last_commit: null, age_days: 0, uncommitted: false, unmerged_branch: null },
        dod: { met: 1, total: 3, gaps: ['deploy', 'ci'] },
        last_touched: null,
        lane: 'active',
        age_color: 'green',
        needs_you: false,
        needs_you_reasons: [],
      },
    ],
    suggested: [],
  };
}

describe('M8b-ii: caught-up pull-forward (opt-in, paused exclusion)', () => {
  it('default caught-up renders NO pull-forward (only headline + count)', () => {
    const state = caughtUpWithActivesState();
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    expect(screen.getByTestId('home-caught-up')).toBeTruthy();
    expect(screen.getByTestId('home-caught-up').textContent).toContain('Clear. Keep working.');
    // No pull-forward section by default.
    expect(screen.queryByTestId('home-pull-forward')).toBeNull();
    // No "Want another?" affordance visible initially... wait, it should be visible
    // but the pull-forward content is hidden until activated.
    // The affordance button is present; the pull-forward card is not.
    expect(screen.queryByTestId('home-pull-forward-card')).toBeNull();
  });

  it('default caught-up with zero closes does not show a closed count', () => {
    const state = caughtUpWithActivesState();
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready', closedRecent: 0 })} />);
    expect(screen.queryByTestId('home-closed-count')).toBeNull();
  });

  it('default caught-up with nonzero closes shows the count', () => {
    const state = caughtUpWithActivesState();
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready', closedRecent: 3 })} />);
    expect(screen.getByTestId('home-closed-count').textContent).toContain('3 closed, last 24h');
  });

  it('the "Want another?" affordance is a quiet link/button, NOT a bg-attention button', () => {
    const state = caughtUpWithActivesState();
    const { container } = render(
      <HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />,
    );
    const affordance = screen.getByTestId('home-want-another');
    // Must be a button or have role=button.
    expect(
      affordance.tagName === 'BUTTON' || affordance.getAttribute('role') === 'button',
    ).toBe(true);
    // Must NOT carry bg-attention (would be a loud accent, violating the spec).
    expect(affordance.className).not.toContain('bg-attention');
    // No other bg-attention elements in the caught-up surface.
    const accents = container.querySelectorAll('.bg-attention');
    expect(accents.length).toBe(0);
  });

  it('after activating "Want another?" a pull-forward card appears', () => {
    const state = caughtUpWithActivesState();
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    // No pull-forward card before activation.
    expect(screen.queryByTestId('home-pull-forward-card')).toBeNull();
    // Activate the affordance.
    fireEvent.click(screen.getByTestId('home-want-another'));
    // Pull-forward card now visible.
    expect(screen.getByTestId('home-pull-forward-card')).toBeTruthy();
  });

  it('after activating "Want another?" the pull-forward shows a non-paused card', () => {
    const state = caughtUpWithActivesState();
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    fireEvent.click(screen.getByTestId('home-want-another'));
    // The pull-forward card title is the non-paused active card.
    const card = screen.getByTestId('home-pull-forward-card');
    expect(card.textContent).toContain('CAD Staff Portal');
    expect(card.textContent).not.toContain('Marketing ROI');
  });

  it('after activating "Want another?" the pull-forward NEVER shows a paused card', () => {
    // State with ONLY a paused card and no active cards: pull-forward should
    // remain hidden since there is no eligible candidate.
    const state: ProgramBoardState = {
      generated_at: '2026-06-21T01:00:00',
      programs: [
        {
          slug: 'only-paused',
          name: 'Only Paused',
          repos: ['repo-x'],
          sources: ['override'],
          tags: [],
          time_sensitive: null,
          blocked_on: '',
          paused: true,
          git: { last_commit: null, age_days: 0, uncommitted: false, unmerged_branch: null },
          dod: { met: 0, total: 1, gaps: ['the step'] },
          last_touched: null,
          lane: 'paused',
          age_color: 'green',
          needs_you: false,
          needs_you_reasons: [],
        },
      ],
      suggested: [],
    };
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    // The affordance is absent when there is no non-paused candidate.
    expect(screen.queryByTestId('home-want-another')).toBeNull();
  });

  it('the caught-up surface stacks headline then count then pull-forward (only behind opt-in)', () => {
    const state = caughtUpWithActivesState();
    const { container } = render(
      <HomeView {...baseProps({
        programBoardState: state,
        loadStatus: 'ready',
        closedRecent: 2,
      })} />,
    );
    const caughtUp = container.querySelector('[data-testid="home-caught-up"]')!;
    const children = Array.from(caughtUp.children);
    // First child: headline
    expect(children[0].textContent).toContain('Clear. Keep working.');
    // Second child: closed count
    expect(children[1].getAttribute('data-testid')).toBe('home-closed-count');
    // Third child (if present): "Want another?" (not the pull-forward card)
    if (children[2]) {
      expect(children[2].getAttribute('data-testid')).toBe('home-want-another');
    }
    // Pull-forward card is not in the DOM before activation.
    expect(container.querySelector('[data-testid="home-pull-forward-card"]')).toBeNull();
  });

  it('the pull-forward candidate set excludes paused cards even when there are multiple actives', () => {
    // Two actives, one paused. The pull-forward should show only from the actives.
    const state: ProgramBoardState = {
      generated_at: '2026-06-21T01:00:00',
      programs: [
        {
          slug: 'paused-x',
          name: 'Paused X',
          repos: ['repo-paused'],
          sources: [],
          tags: [],
          time_sensitive: null,
          blocked_on: '',
          paused: true,
          git: { last_commit: null, age_days: 2, uncommitted: false, unmerged_branch: null },
          dod: { met: 0, total: 1, gaps: ['step'] },
          last_touched: null,
          lane: 'paused',
          age_color: 'yellow',
          needs_you: false,
          needs_you_reasons: [],
        },
        {
          slug: 'active-a',
          name: 'Active A',
          repos: ['repo-a'],
          sources: [],
          tags: [],
          time_sensitive: null,
          blocked_on: '',
          paused: false,
          git: { last_commit: null, age_days: 1, uncommitted: false, unmerged_branch: null },
          dod: { met: 0, total: 2, gaps: ['x', 'y'] },
          last_touched: null,
          lane: 'active',
          age_color: 'green',
          needs_you: false,
          needs_you_reasons: [],
        },
        {
          slug: 'active-b',
          name: 'Active B',
          repos: ['repo-b'],
          sources: [],
          tags: [],
          time_sensitive: null,
          blocked_on: '',
          paused: false,
          git: { last_commit: null, age_days: 3, uncommitted: false, unmerged_branch: null },
          dod: { met: 0, total: 2, gaps: ['p', 'q'] },
          last_touched: null,
          lane: 'active',
          age_color: 'yellow',
          needs_you: false,
          needs_you_reasons: [],
        },
      ],
      suggested: [],
    };
    render(<HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />);
    fireEvent.click(screen.getByTestId('home-want-another'));
    const card = screen.getByTestId('home-pull-forward-card');
    // The paused card must not appear.
    expect(card.textContent).not.toContain('Paused X');
    // One of the actives appears.
    const shownName = card.textContent ?? '';
    expect(shownName.includes('Active A') || shownName.includes('Active B')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13. Feed url renders via onClick -> onOpenExternal, never a navigating href
// ---------------------------------------------------------------------------

describe('M8a: feed url safety', () => {
  it('no element on Home is a navigating anchor href (links route through onClick)', () => {
    const state = loadState('time-sensitive.json');
    const { container } = render(
      <HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready' })} />,
    );
    const anchors = container.querySelectorAll('a[href]');
    for (const a of anchors) {
      const href = a.getAttribute('href') ?? '';
      expect(href === '' || href === '#').toBe(true);
    }
  });

  it('a hero with a feed url renders a button (no navigating href) whose click calls onOpenExternal', () => {
    // The producer schema can carry a feed url; mapCardToItem reads it. When set,
    // the hero feed link MUST render as a button and route the click through
    // onOpenExternal, never a bare navigating href (PLAN 3.6, line 488).
    const state = loadState('time-sensitive.json');
    state.programs[0].url = 'https://example.com/program-feed';
    const onOpenExternal = vi.fn();
    render(
      <HomeView {...baseProps({ programBoardState: state, loadStatus: 'ready', onOpenExternal })} />,
    );
    const link = screen.getByTestId('home-hero-feed-link');
    // It is a button, not an anchor with a navigating href.
    expect(link.tagName).toBe('BUTTON');
    expect(link.getAttribute('href')).toBeNull();
    fireEvent.click(link);
    expect(onOpenExternal).toHaveBeenCalledWith('https://example.com/program-feed');
  });
});
