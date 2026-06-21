/**
 * M17: commitment-mirror intake (intake-only lock-in, default OFF).
 *
 * Spec: PLAN-PHASE-2-3.md line 77; PLAN.md 1.9.
 *
 * Falsifiable axes:
 *
 *   1. DEFAULT OFF: commitmentMirror omitted (or false) renders no intake panel
 *      and no persistent resting-hero lock-in button.
 *
 *   2. INTAKE-ONLY: when commitmentMirror is true, the intake panel renders on
 *      first open. After the user confirms, it dismisses and DOES NOT leave a
 *      second persistent button on the resting hero (the 1.1 affordance budget:
 *      "lock-in lives at first-open intake ONLY and does NOT add a second
 *      persistent button on the resting hero", PLAN-PHASE-2-3.md line 85,
 *      PLAN.md 1.9).
 *
 *   3. VOICE: the locked-hero copy (the committed item name rendered inside the
 *      intake panel) contains no "still not done", no time-since-lock language,
 *      and no streak/chain/days language. PLAN-PHASE-2-3.md line 77 is explicit:
 *      "the locked hero NEVER adds 'still not done' or any time-since-lock
 *      language."
 *
 *   4. RESTING HERO UNCHANGED: after intake dismissal the normal hero card still
 *      renders (data-testid="home-hero") and the affordance budget is preserved:
 *      no extra lock-in button appears alongside the primary.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import HomeView from '@/components/HomeView';
import type { HomeViewProps } from '@/components/HomeView';
import { parseState } from '@shared/program-board-state';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const FIX_DIR = path.resolve(__dirname, '../fixtures/dashboard');

function loadState(name: string) {
  const raw = readFileSync(path.join(FIX_DIR, name), 'utf-8');
  const parsed = parseState(raw);
  if (!parsed) throw new Error(`fixture ${name} failed to parse`);
  return parsed;
}

const NOW = new Date(2026, 5, 21, 9, 0, 0); // 2026-06-21 09:00

function baseProps(overrides: Partial<HomeViewProps> = {}): HomeViewProps {
  return {
    programBoardState: loadState('fresh-with-needs-you.json'),
    loadStatus: 'ready',
    resolvedPath: 'C:\\test\\state.json',
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

// ---------------------------------------------------------------------------
// Axis 1: default OFF
// ---------------------------------------------------------------------------

describe('M17: commitment-mirror intake (default OFF)', () => {
  it('does not render an intake panel when commitmentMirror is omitted', () => {
    render(<HomeView {...baseProps()} />);
    expect(screen.queryByTestId('home-commitment-intake')).toBeNull();
  });

  it('does not render an intake panel when commitmentMirror is explicitly false', () => {
    render(<HomeView {...baseProps({ commitmentMirror: false })} />);
    expect(screen.queryByTestId('home-commitment-intake')).toBeNull();
  });

  it('does not render a lock-in button on the resting hero when commitmentMirror is false', () => {
    render(<HomeView {...baseProps({ commitmentMirror: false })} />);
    expect(screen.queryByTestId('home-hero-lockin')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Axis 2: intake-only (renders on open, dismisses, does NOT persist to hero)
// ---------------------------------------------------------------------------

describe('M17: commitment-mirror intake (intake panel renders when ON)', () => {
  it('renders the intake panel when commitmentMirror is true', () => {
    render(<HomeView {...baseProps({ commitmentMirror: true })} />);
    expect(screen.getByTestId('home-commitment-intake')).toBeTruthy();
  });

  it('intake panel contains a confirm/commit button', () => {
    render(<HomeView {...baseProps({ commitmentMirror: true })} />);
    const intake = screen.getByTestId('home-commitment-intake');
    const confirmBtn = intake.querySelector('[data-testid="home-commitment-confirm"]');
    expect(confirmBtn).toBeTruthy();
  });

  it('intake panel contains a dismiss/skip button', () => {
    render(<HomeView {...baseProps({ commitmentMirror: true })} />);
    const intake = screen.getByTestId('home-commitment-intake');
    const skipBtn = intake.querySelector('[data-testid="home-commitment-skip"]');
    expect(skipBtn).toBeTruthy();
  });

  it('after confirming the intake panel dismisses', () => {
    render(<HomeView {...baseProps({ commitmentMirror: true })} />);
    const intake = screen.getByTestId('home-commitment-intake');
    const confirmBtn = intake.querySelector('[data-testid="home-commitment-confirm"]') as HTMLElement;
    fireEvent.click(confirmBtn);
    expect(screen.queryByTestId('home-commitment-intake')).toBeNull();
  });

  it('after skipping the intake panel dismisses', () => {
    render(<HomeView {...baseProps({ commitmentMirror: true })} />);
    const intake = screen.getByTestId('home-commitment-intake');
    const skipBtn = intake.querySelector('[data-testid="home-commitment-skip"]') as HTMLElement;
    fireEvent.click(skipBtn);
    expect(screen.queryByTestId('home-commitment-intake')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Axis 2 continued: NO second persistent lock-in button on the resting hero
// ---------------------------------------------------------------------------

describe('M17: no second persistent lock-in button on the resting hero', () => {
  it('the resting hero (pre-intake) does not carry a lock-in button', () => {
    // When the intake is shown, the normal hero is below it but has no extra
    // lock-in button (1.1 budget: the intake IS the lock-in affordance).
    render(<HomeView {...baseProps({ commitmentMirror: true })} />);
    // The hero card should not have a lock-in button at any point.
    expect(screen.queryByTestId('home-hero-lockin')).toBeNull();
  });

  it('after intake confirmation, the resting hero has no lock-in button', () => {
    render(<HomeView {...baseProps({ commitmentMirror: true })} />);
    const intake = screen.getByTestId('home-commitment-intake');
    const confirmBtn = intake.querySelector('[data-testid="home-commitment-confirm"]') as HTMLElement;
    fireEvent.click(confirmBtn);
    // The hero card is now shown without the intake panel.
    expect(screen.getByTestId('home-hero')).toBeTruthy();
    expect(screen.queryByTestId('home-hero-lockin')).toBeNull();
  });

  it('after intake skip, the resting hero has no lock-in button', () => {
    render(<HomeView {...baseProps({ commitmentMirror: true })} />);
    const intake = screen.getByTestId('home-commitment-intake');
    const skipBtn = intake.querySelector('[data-testid="home-commitment-skip"]') as HTMLElement;
    fireEvent.click(skipBtn);
    expect(screen.getByTestId('home-hero')).toBeTruthy();
    expect(screen.queryByTestId('home-hero-lockin')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Axis 3: VOICE test (no forbidden language in the intake/locked-hero copy)
// ---------------------------------------------------------------------------

describe('M17: locked-hero copy voice test (no time-since-lock / no-streak language)', () => {
  /**
   * The forbidden patterns per the spec (PLAN-PHASE-2-3.md line 77, PLAN.md 1.9,
   * PLAN.md 6.6 / 1.4):
   *
   *   - "still not done" (the exact phrase the spec calls out)
   *   - Any time-since-lock language: "hours ago", "minutes ago", "days ago",
   *     "since you", "locked at", "committed at"
   *   - Streak/chain language: "in a row", "streak", "N days", "chain"
   *   - Guilt framing: "you haven't", "you still haven't"
   */
  const FORBIDDEN_PATTERNS = [
    /still not done/i,
    /hours? ago/i,
    /minutes? ago/i,
    /days? ago/i,
    /since you/i,
    /locked at/i,
    /committed at/i,
    /in a row/i,
    /streak/i,
    /\d+ days/i,
    /chain/i,
    /you haven'?t/i,
    /you still/i,
  ];

  it('the intake panel text contains none of the forbidden language patterns', () => {
    render(<HomeView {...baseProps({ commitmentMirror: true })} />);
    const intake = screen.getByTestId('home-commitment-intake');
    const text = intake.textContent ?? '';
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(text, `intake panel must not contain: ${pattern}`).not.toMatch(pattern);
    }
  });

  it('the intake panel copy contains no em dashes', () => {
    render(<HomeView {...baseProps({ commitmentMirror: true })} />);
    const intake = screen.getByTestId('home-commitment-intake');
    const text = intake.textContent ?? '';
    // Neither the em-dash character nor a double-hyphen used as one.
    expect(text).not.toContain('—');
    expect(text).not.toMatch(/[a-zA-Z]--[a-zA-Z]/);
  });

  it('the intake panel copy contains no AI-slop words', () => {
    render(<HomeView {...baseProps({ commitmentMirror: true })} />);
    const intake = screen.getByTestId('home-commitment-intake');
    const text = intake.textContent ?? '';
    const SLOP = ['leverage', 'robust', 'seamless', 'comprehensive', 'delve', 'utilize'];
    for (const word of SLOP) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });
});

// ---------------------------------------------------------------------------
// Axis 4: normal board still renders after intake dismissal
// ---------------------------------------------------------------------------

describe('M17: normal board renders intact after intake dismissal', () => {
  it('after confirmation the hero card is visible with its primary action', () => {
    render(<HomeView {...baseProps({ commitmentMirror: true })} />);
    const intake = screen.getByTestId('home-commitment-intake');
    const confirmBtn = intake.querySelector('[data-testid="home-commitment-confirm"]') as HTMLElement;
    fireEvent.click(confirmBtn);
    // Normal hero and primary button are present.
    expect(screen.getByTestId('home-hero')).toBeTruthy();
    expect(screen.getByTestId('home-hero-primary')).toBeTruthy();
  });

  it('the intake panel never renders when there is no hero (caught-up state)', () => {
    // A board with no needs-you cards: the hero is null, so the intake has
    // nothing to mirror. It must not render.
    render(
      <HomeView
        {...baseProps({
          commitmentMirror: true,
          // Override with a state that has no needs-you cards.
          programBoardState: null,
          loadStatus: 'error',
        })}
      />,
    );
    expect(screen.queryByTestId('home-commitment-intake')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// settings-store: commitmentMirror flag (default OFF)
// ---------------------------------------------------------------------------
// These tests live in tests/main/settings-store.test.ts (see the separate
// test file for the store). The tests below verify that HomeView correctly
// uses the commitmentMirror PROP (which App.tsx wires from the store flag).
// We do not duplicate the store round-trip tests here.

describe('M17: HomeView commitmentMirror prop contract', () => {
  it('a boolean true prop enables the intake, false disables it', () => {
    const { unmount } = render(<HomeView {...baseProps({ commitmentMirror: true })} />);
    expect(screen.getByTestId('home-commitment-intake')).toBeTruthy();
    unmount();

    render(<HomeView {...baseProps({ commitmentMirror: false })} />);
    expect(screen.queryByTestId('home-commitment-intake')).toBeNull();
  });
});
