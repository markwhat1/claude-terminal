/**
 * M10d: Hero primary Claude injection + three-affordance budget.
 *
 * Verifies:
 *   1. The hero primary for a decision/draft item invokes onOpenClaudeWithQuery
 *      with the composed ClaudeQueryLine.
 *   2. Copy writes to the mocked clipboard via onCopy.
 *   3. For an openPowerShell item (needs-CADDC02), the primary stays as the
 *      PowerShell opener (not Claude injection).
 *   4. The hero respects the three-affordance budget: at most one full-weight
 *      button (bg-attention) per hero card.
 *   5. resolvePreferredPowershell prefers 'pwsh' when present (re-asserted at
 *      the wiring, per M10d spec line 1010).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import HomeView from '@/components/HomeView';
import type { HomeViewProps } from '@/components/HomeView';
import type { ProgramBoardState } from '@shared/program-board-state';
import { parseState } from '@shared/program-board-state';
import { ACTION_LABELS, composeClaudeQuery } from '@shared/home-copy';
import { resolvePreferredPowershell } from '@shared/dashboard-ui-helpers';

const FIX_DIR = path.resolve(__dirname, '../fixtures/dashboard');

function loadState(name: string): ProgramBoardState {
  const raw = readFileSync(path.join(FIX_DIR, name), 'utf-8');
  const parsed = parseState(raw);
  if (!parsed) throw new Error(`fixture ${name} failed to parse`);
  return parsed;
}

const NOW = new Date(2026, 5, 21, 1, 1, 0);

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
    onOpenClaudeWithQuery: vi.fn(),
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
// resolvePreferredPowershell re-assertion (M10d spec line 1010)
// ---------------------------------------------------------------------------

describe('M10d: resolvePreferredPowershell prefers pwsh when present', () => {
  it('returns pwsh when hasPwsh is true', () => {
    expect(resolvePreferredPowershell(true)).toBe('pwsh');
  });

  it('falls back to powershell when hasPwsh is false', () => {
    expect(resolvePreferredPowershell(false)).toBe('powershell');
  });
});

// ---------------------------------------------------------------------------
// Hero primary: Claude injection for decision/draft items
// ---------------------------------------------------------------------------

describe('M10d: hero primary for decision/draft items invokes onOpenClaudeWithQuery', () => {
  it('a draftFirstVersion item (blocker kind, no special tags) invokes onOpenClaudeWithQuery with the composed ClaudeQueryLine', () => {
    // time-sensitive.json: lane=blocked -> kind='blocker', tags=['time-sensitive']
    // pickPrimaryAction -> draftFirstVersion (not needs-your-decision, not needs-CADDC02)
    const onOpenClaudeWithQuery = vi.fn();
    renderReady('time-sensitive.json', { onOpenClaudeWithQuery });
    const primary = screen.getByTestId('home-hero-primary');
    fireEvent.click(primary);
    expect(onOpenClaudeWithQuery).toHaveBeenCalledOnce();
    // The argument must be a ClaudeQueryLine (branded string).
    const arg = onOpenClaudeWithQuery.mock.calls[0][0] as string;
    // The composed query for draftFirstVersion contains the program name or slug.
    const expected = composeClaudeQuery({
      action: 'draftFirstVersion',
      programSlug: 'practice-reports',
      programName: 'Practice Reports',
      kind: 'blocker',
    });
    expect(arg).toBe(expected);
  });

  it('an openToDecide item (needs-your-decision tag) invokes onOpenClaudeWithQuery', () => {
    const state = loadState('both-collision.json');
    const onOpenClaudeWithQuery = vi.fn();
    render(
      <HomeView
        {...baseProps({
          programBoardState: state,
          loadStatus: 'ready',
          onOpenClaudeWithQuery,
        })}
      />,
    );
    const primary = screen.getByTestId('home-hero-primary');
    fireEvent.click(primary);
    expect(onOpenClaudeWithQuery).toHaveBeenCalledOnce();
    const arg = onOpenClaudeWithQuery.mock.calls[0][0] as string;
    // openToDecide produces the canned "pending decision" query.
    expect(arg).toBe('Open this repo so I can make the pending decision.');
  });
});

// ---------------------------------------------------------------------------
// Hero primary: openPowerShell stays as PowerShell for needs-CADDC02 items
// ---------------------------------------------------------------------------

describe('M10d: openPowerShell items keep the PowerShell primary', () => {
  it('a needs-CADDC02 item does NOT invoke onOpenClaudeWithQuery on primary click', () => {
    // fresh-with-needs-you.json: tags=['needs-CADDC02'] -> pickPrimaryAction -> openPowerShell
    const onOpenClaudeWithQuery = vi.fn();
    const onOpenPowerShell = vi.fn();
    renderReady('fresh-with-needs-you.json', {
      onOpenClaudeWithQuery,
      onOpenPowerShell,
    });
    const primary = screen.getByTestId('home-hero-primary');
    fireEvent.click(primary);
    expect(onOpenClaudeWithQuery).not.toHaveBeenCalled();
    expect(onOpenPowerShell).toHaveBeenCalledWith('cad-portal');
  });

  it('the primary button for a needs-CADDC02 item shows the openPowerShell label', () => {
    renderReady('fresh-with-needs-you.json');
    const primary = screen.getByTestId('home-hero-primary');
    expect(primary.textContent).toBe(ACTION_LABELS.openPowerShell);
  });
});

// ---------------------------------------------------------------------------
// The PowerShell affordance is present as a sub-dominant action for
// Claude-primary items (not removed, just demoted)
// ---------------------------------------------------------------------------

describe('M10d: PowerShell affordance exists as secondary for Claude-primary items', () => {
  it('a draftFirstVersion item shows a secondary PowerShell button', () => {
    renderReady('time-sensitive.json');
    // The secondary PowerShell button is still rendered (sub-dominant).
    expect(screen.getByTestId('home-hero-powershell')).toBeTruthy();
  });

  it('the secondary PowerShell button invokes onOpenPowerShell with the hero repo', () => {
    const onOpenPowerShell = vi.fn();
    renderReady('time-sensitive.json', { onOpenPowerShell });
    fireEvent.click(screen.getByTestId('home-hero-powershell'));
    expect(onOpenPowerShell).toHaveBeenCalledWith('practice-analytics');
  });
});

// ---------------------------------------------------------------------------
// Copy writes to clipboard via onCopy
// ---------------------------------------------------------------------------

describe('M10d: copy writes to the mocked clipboard', () => {
  it('clicking the copy button invokes onCopy with a non-empty payload', () => {
    const onCopy = vi.fn();
    renderReady('time-sensitive.json', { onCopy });
    fireEvent.click(screen.getByTestId('home-hero-copy'));
    expect(onCopy).toHaveBeenCalledOnce();
    const payload = onCopy.mock.calls[0][0] as string;
    expect(payload.length).toBeGreaterThan(0);
    expect(payload).toContain('Practice Reports');
  });
});

// ---------------------------------------------------------------------------
// Three-affordance budget: at most ONE full-weight (bg-attention) button
// ---------------------------------------------------------------------------

describe('M10d: three-affordance budget (at most one full-weight button, 6.3)', () => {
  it('a Claude-primary item renders exactly one bg-attention button', () => {
    // draftFirstVersion (time-sensitive.json): 3 buttons rendered but only
    // the primary is bg-attention.
    const { container } = renderReady('time-sensitive.json');
    const accents = container.querySelectorAll('.bg-attention');
    expect(accents.length).toBe(1);
  });

  it('an openPowerShell item also renders exactly one bg-attention button', () => {
    // needs-CADDC02 (fresh-with-needs-you.json): 2 buttons, only primary is bg-attention.
    const { container } = renderReady('fresh-with-needs-you.json');
    const accents = container.querySelectorAll('.bg-attention');
    expect(accents.length).toBe(1);
  });

  it('a Claude-primary item has 3 affordances: claude primary + powershell secondary + copy ghost', () => {
    renderReady('time-sensitive.json');
    // All three are present.
    expect(screen.getByTestId('home-hero-primary')).toBeTruthy();
    expect(screen.getByTestId('home-hero-powershell')).toBeTruthy();
    expect(screen.getByTestId('home-hero-copy')).toBeTruthy();
  });
});
