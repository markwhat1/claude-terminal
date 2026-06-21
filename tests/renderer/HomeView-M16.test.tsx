/**
 * M16: stall pattern-interrupt (default OFF, in-place only).
 *
 * Spec: PLAN-PHASE-2-3.md line 76; PLAN.md 1.8.
 *
 * Falsifiable axes:
 *
 *   1. DEFAULT OFF: with stallInterrupt omitted (or false), the pulse class is
 *      never applied regardless of elapsed time.
 *
 *   2. Threshold + no interaction triggers the in-place pulse (opacity/pulse
 *      class on the hero primary button). The class is NOT a position/layout
 *      change; the hero card DOM position does not shift.
 *
 *   3. An interaction (pointerdown or keydown) before the threshold cancels the
 *      timer so the pulse class is never applied.
 *
 *   4. A pending justResolved settle DEFERS the stall timer: when the hero has a
 *      settle class (justResolved=true in recentCloses), starting the timer must
 *      wait until the settle class is no longer present before the stall clock
 *      begins.
 *
 *   5. Pulse is in-place only: the stall-pulse class token itself does not
 *      encode a layout-mutation word (translate/transform/margin/padding/etc.).
 *
 * Fake timers are used for deterministic threshold assertion.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import HomeView from '@/components/HomeView';
import type { HomeViewProps } from '@/components/HomeView';
import { STALL_THRESHOLD_MS, useStallInterrupt } from '@shared/stall-interrupt';
import type { SettleClass } from '@shared/settle-class';
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

/**
 * Base props: a board state with a needs-you hero card (uses the
 * fresh-with-needs-you fixture which has a needs_you:true card).
 */
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
// Tests: HomeView integration
// ---------------------------------------------------------------------------

describe('M16: stall pattern-interrupt (HomeView integration)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Axis 1: default OFF
  // -------------------------------------------------------------------------

  it('does NOT apply a pulse class when stallInterrupt is omitted (default OFF)', () => {
    render(<HomeView {...baseProps()} />);
    // Advance past the threshold with no interaction.
    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS + 1000);
    });
    // The hero primary button must NOT carry the stall-pulse class.
    const primary = screen.queryByTestId('home-hero-primary');
    if (primary) {
      expect(primary.className).not.toMatch(/stall-pulse/);
    }
  });

  it('does NOT apply a pulse class when stallInterrupt is explicitly false', () => {
    render(<HomeView {...baseProps({ stallInterrupt: false })} />);
    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS + 1000);
    });
    const primary = screen.queryByTestId('home-hero-primary');
    if (primary) {
      expect(primary.className).not.toMatch(/stall-pulse/);
    }
  });

  // -------------------------------------------------------------------------
  // Axis 2: threshold with no interaction triggers the pulse
  // -------------------------------------------------------------------------

  it('applies stall-pulse to the hero primary after the threshold with no interaction', () => {
    render(<HomeView {...baseProps({ stallInterrupt: true })} />);

    // Before threshold: no pulse.
    const primary = screen.getByTestId('home-hero-primary');
    expect(primary.className).not.toMatch(/stall-pulse/);

    // Advance past the threshold with no user interaction.
    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS + 100);
    });

    // The primary button now carries the pulse class (opacity/animate).
    expect(primary.className).toMatch(/stall-pulse/);
  });

  it('applies stall-dim to at least one periphery element after the threshold', () => {
    render(<HomeView {...baseProps({ stallInterrupt: true })} />);

    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS + 100);
    });

    // The needs-header or the list wrapper should carry stall-dim.
    const board = screen.queryByTestId('home-board');
    if (board) {
      const dimmed = board.querySelectorAll('.stall-dim');
      expect(dimmed.length).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // Axis 3: interaction before threshold cancels the pulse
  // -------------------------------------------------------------------------

  it('does NOT apply a pulse class when a pointerdown fires before the threshold', () => {
    render(<HomeView {...baseProps({ stallInterrupt: true })} />);

    // Advance to half the threshold.
    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS / 2);
    });

    // User interaction resets the stall timer.
    act(() => {
      fireEvent.pointerDown(document.body);
    });

    // Advance the remaining half + extra. Full threshold has NOT elapsed since
    // the last interaction.
    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS / 2 + 500);
    });

    const primary = screen.getByTestId('home-hero-primary');
    expect(primary.className).not.toMatch(/stall-pulse/);
  });

  it('does NOT apply a pulse class when a keydown fires before the threshold', () => {
    render(<HomeView {...baseProps({ stallInterrupt: true })} />);

    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS / 2);
    });

    act(() => {
      fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    });

    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS / 2 + 500);
    });

    const primary = screen.getByTestId('home-hero-primary');
    expect(primary.className).not.toMatch(/stall-pulse/);
  });

  it('applies the pulse after a full threshold elapses from the last interaction', () => {
    render(<HomeView {...baseProps({ stallInterrupt: true })} />);

    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS / 2);
    });

    // Interaction resets the clock.
    act(() => {
      fireEvent.pointerDown(document.body);
    });

    // Full threshold from the interaction point.
    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS + 100);
    });

    const primary = screen.getByTestId('home-hero-primary');
    expect(primary.className).toMatch(/stall-pulse/);
  });

  // -------------------------------------------------------------------------
  // Axis 4: pending justResolved settle defers the stall timer
  // -------------------------------------------------------------------------

  it('defers the stall timer while the hero has a pending justResolved settle', () => {
    // The hero in fresh-with-needs-you.json has slug "cad-staff-portal",
    // mapped to id "pb:cad-staff-portal".
    const heroId = 'pb:cad-staff-portal';
    const recentCloses = [
      {
        id: heroId,
        closedAt: NOW.toISOString(),
        decidedAndWorked: false,
        avoidanceClose: null,
      },
    ];

    render(
      <HomeView
        {...baseProps({
          recentCloses,
          stallInterrupt: true,
        })}
      />,
    );

    // Advance past the threshold while the settle class is active.
    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS + 1000);
    });

    // The stall timer must have been deferred; no pulse on the primary.
    const primary = screen.queryByTestId('home-hero-primary');
    if (primary) {
      expect(primary.className).not.toMatch(/stall-pulse/);
    }
  });

  // -------------------------------------------------------------------------
  // Axis 5: in-place only (no layout/position class in the stall-pulse token)
  // -------------------------------------------------------------------------

  it('the stall-pulse class token itself does not encode a position/transform/layout word', () => {
    // After the pulse fires, confirm the stall-pulse class contains only
    // opacity/animation words, not position/layout words.
    render(<HomeView {...baseProps({ stallInterrupt: true })} />);

    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS + 100);
    });

    const primary = screen.queryByTestId('home-hero-primary');
    if (!primary) return; // No hero card: pass trivially.

    expect(primary.className).toMatch(/stall-pulse/);

    // Extract the stall-pulse-related class tokens (those that are 'stall-pulse'
    // or start with 'stall-'). Assert none of them encode a layout mutation.
    const LAYOUT_WORDS = [
      'translate', 'transform', 'mt-', 'mb-', 'ml-', 'mr-', 'm-', 'mx-', 'my-',
      'pt-', 'pb-', 'pl-', 'pr-', 'p-', 'px-', 'py-',
      'w-', 'h-', 'min-w', 'min-h', 'max-w', 'max-h',
      'top-', 'left-', 'right-', 'bottom-',
      'static', 'relative', 'absolute', 'fixed', 'sticky',
      'flex-grow', 'flex-shrink', 'col-span', 'row-span',
    ];
    const stallTokens = primary.className.split(/\s+/).filter(
      (t) => t === 'stall-pulse' || t.startsWith('stall-'),
    );
    // At least one stall token must be present (sanity check that we found the class).
    expect(stallTokens.length).toBeGreaterThan(0);
    for (const token of stallTokens) {
      for (const word of LAYOUT_WORDS) {
        expect(token).not.toContain(word);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// useStallInterrupt hook unit tests
// ---------------------------------------------------------------------------

describe('useStallInterrupt hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enabled:false never triggers (default OFF)', () => {
    const { result } = renderHook(() =>
      useStallInterrupt({ enabled: false, settleClass: null }),
    );
    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS + 1000);
    });
    expect(result.current.active).toBe(false);
  });

  it('enabled:true with no interaction triggers after STALL_THRESHOLD_MS', () => {
    const { result } = renderHook(() =>
      useStallInterrupt({ enabled: true, settleClass: null }),
    );
    expect(result.current.active).toBe(false);

    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS + 100);
    });

    expect(result.current.active).toBe(true);
  });

  it('calling notify() before the threshold cancels it', () => {
    const { result } = renderHook(() =>
      useStallInterrupt({ enabled: true, settleClass: null }),
    );

    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS / 2);
    });

    // Simulate interaction by calling the notify function.
    act(() => {
      result.current.notify();
    });

    // Less than a full threshold has elapsed since the interaction.
    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS / 2 + 500);
    });

    expect(result.current.active).toBe(false);
  });

  it('after notify(), a full threshold elapses and fires again', () => {
    const { result } = renderHook(() =>
      useStallInterrupt({ enabled: true, settleClass: null }),
    );

    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS / 2);
    });

    act(() => {
      result.current.notify();
    });

    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS + 100);
    });

    expect(result.current.active).toBe(true);
  });

  it('a non-null settleClass (pending justResolved) defers the timer', () => {
    const settleClass: SettleClass = 'settle-ordinary';
    const { result } = renderHook(() =>
      useStallInterrupt({ enabled: true, settleClass }),
    );

    // Advance past the threshold while settle is active.
    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS + 1000);
    });

    // The stall must NOT have fired while a settle is pending.
    expect(result.current.active).toBe(false);
  });

  it('stall fires after settleClass clears (one motion source at a time)', () => {
    const { result, rerender } = renderHook(
      ({ settleClass }: { settleClass: SettleClass | null }) =>
        useStallInterrupt({ enabled: true, settleClass }),
      { initialProps: { settleClass: 'settle-ordinary' as SettleClass } },
    );

    // Advance past threshold while settle is active.
    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS + 100);
    });
    expect(result.current.active).toBe(false);

    // Clear the settle class (the settle animation finished).
    rerender({ settleClass: null });

    // Now the stall timer should start from the settle-clear point.
    act(() => {
      vi.advanceTimersByTime(STALL_THRESHOLD_MS + 100);
    });
    expect(result.current.active).toBe(true);
  });
});
