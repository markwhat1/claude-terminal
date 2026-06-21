/**
 * M12: one-gesture capture, the HomeView-level matrix.
 *
 * Falsifiable axes from the spec (PLAN-PHASE-2-3 lines 51-61):
 *   - Ctrl+Shift+K (key:'K', ctrlKey, shiftKey) OPENS the capture bar.
 *   - the sub-2s focus axis: document.activeElement === the input in the SAME
 *     TICK as the keydown (no await, no setTimeout).
 *   - Enter persists with only text set (the onCapture handler receives the raw
 *     text; it is the inert capture payload).
 *   - the quiet Inbox(N) glance number renders as a calm number, NEVER a red
 *     badge (no destructive/bg-red classes on the glance element).
 *   - a source:'todo' item routes ONLY to Copy of inert text: it is not eligible
 *     for draftFirstVersion / claudeQuery.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

import HomeView from '@/components/HomeView';
import type { HomeViewProps } from '@/components/HomeView';
import { pickPrimaryAction } from '@shared/home-copy';
import type { DashboardItem } from '@shared/program-board-state';

const NOW = new Date(2026, 5, 21, 1, 1, 0);

function baseProps(overrides: Partial<HomeViewProps> = {}): HomeViewProps {
  return {
    programBoardState: { generated_at: '2026-06-21T01:00:00', programs: [], suggested: [] },
    loadStatus: 'ready',
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

// Dispatch the exact chord the spec mandates: key:'K' (uppercase, because Shift
// is held), ctrlKey, shiftKey. A lowercase 'k' would never fire (matchKeybinding
// is case-sensitive).
function dispatchCaptureChord() {
  const evt = new KeyboardEvent('keydown', {
    key: 'K',
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(evt);
}

describe('M12: capture bar opening + synchronous focus', () => {
  it('Ctrl+Shift+K (key:"K", ctrlKey, shiftKey) opens the capture bar', () => {
    render(<HomeView {...baseProps()} />);
    expect(screen.queryByTestId('home-capture-bar-open')).toBeNull();

    act(() => {
      dispatchCaptureChord();
    });

    expect(screen.getByTestId('home-capture-bar-open')).toBeTruthy();
  });

  it('a lowercase Ctrl+Shift+k does NOT open the bar (case-sensitive match)', () => {
    render(<HomeView {...baseProps()} />);
    act(() => {
      const evt = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(evt);
    });
    expect(screen.queryByTestId('home-capture-bar-open')).toBeNull();
  });

  it('focuses the input in the SAME TICK as the keydown (no await, no setTimeout)', () => {
    render(<HomeView {...baseProps()} />);

    // The capture input is always mounted (so the ref is stable for synchronous
    // focus). The keydown handler must focus it WITHOUT any async hop.
    act(() => {
      dispatchCaptureChord();
    });

    const input = screen.getByTestId('home-capture-input') as HTMLInputElement;
    // Asserted with NO await between the dispatch and this check: the activeElement
    // is the input synchronously. If focus were deferred to a setTimeout/await,
    // this would fail.
    expect(document.activeElement).toBe(input);
  });
});

describe('M12: Enter persists with only text set', () => {
  it('Enter calls onCapture with the typed text only (inert payload)', () => {
    const onCapture = vi.fn();
    render(<HomeView {...baseProps({ onCapture })} />);

    act(() => {
      dispatchCaptureChord();
    });

    const input = screen.getByTestId('home-capture-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'call the lab about the crown' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCapture).toHaveBeenCalledTimes(1);
    // Only the raw text is passed; capture sets no horizon/category/etc. The
    // single argument IS the captured text (the only required field at M12).
    expect(onCapture).toHaveBeenCalledWith('call the lab about the crown');
  });

  it('Enter on an empty input does not call onCapture', () => {
    const onCapture = vi.fn();
    render(<HomeView {...baseProps({ onCapture })} />);
    act(() => {
      dispatchCaptureChord();
    });
    const input = screen.getByTestId('home-capture-input') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('Escape closes the bar without capturing', () => {
    const onCapture = vi.fn();
    render(<HomeView {...baseProps({ onCapture })} />);
    act(() => {
      dispatchCaptureChord();
    });
    expect(screen.getByTestId('home-capture-bar-open')).toBeTruthy();
    const input = screen.getByTestId('home-capture-input') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('home-capture-bar-open')).toBeNull();
    expect(onCapture).not.toHaveBeenCalled();
  });
});

describe('M12: the quiet Inbox(N) glance number (never a red badge)', () => {
  it('renders the inbox count as a calm number, not a red/destructive badge', () => {
    render(<HomeView {...baseProps({ inboxCount: 3 })} />);
    const glance = screen.getByTestId('home-inbox-count');
    expect(glance.textContent).toContain('3');
    // NEVER a red badge: no destructive / bg-red heat classes on the glance.
    expect(glance.className).not.toContain('destructive');
    expect(glance.className).not.toContain('bg-red');
    expect(glance.className).not.toContain('bg-attention');
    // It reads as a muted glance, not an alert.
    expect(glance.className).toContain('text-muted-foreground');
  });

  it('still renders the glance when the inbox is zero (a calm 0, not hidden as an alert)', () => {
    render(<HomeView {...baseProps({ inboxCount: 0 })} />);
    const glance = screen.getByTestId('home-inbox-count');
    expect(glance.textContent).toContain('0');
    expect(glance.className).not.toContain('destructive');
  });
});

describe('M12: a source:"todo" item routes only to Copy of inert text', () => {
  function todoItem(): DashboardItem {
    return {
      id: 'todo-1',
      slug: 'todo-1',
      source: 'todo',
      kind: 'todo',
      title: 'call the lab about the crown',
      detail: '',
      project: null,
      badges: [],
      ageColor: 'green',
      recencyIso: null,
      gitAgeDays: null,
      url: null,
      needsYou: true,
      needsYouReasons: [],
      paused: false,
      timeSensitive: null,
      dodMet: 0,
      dodTotal: 0,
      dodAlmost: false,
      dodGap: null,
      requiresResponse: false,
      idleNeedsYou: false,
      justResolved: false,
      decidedAndWorked: false,
      horizon: null,
      avoidanceCategory: null,
      actions: {},
    };
  }

  it('pickPrimaryAction never returns draftFirstVersion for a source:"todo" item', () => {
    // A phone-captured raw string must never become a hero whose action re-touches
    // the PHI choke point (PLAN.md 1.7). Its only action is Copy of inert text.
    const action = pickPrimaryAction(todoItem());
    expect(action).not.toBe('draftFirstVersion');
    expect(action).not.toBe('openToDecide');
    expect(action).not.toBe('reviewTodos');
    expect(action).not.toBe('summarizeChanges');
    // The single permitted action for a captured todo is the inert Copy.
    expect(action).toBe('copyOnly');
  });
});
