/**
 * M18: resurfacing/parking + the full morning ritual (cue-bound to app-open).
 *
 * Spec: PLAN-PHASE-2-3.md lines 63-71, 78; PLAN.md 1.5 / 1.10.
 *
 * Falsifiable axes:
 *
 *   1. A parked @now todo (parkedUntil > now) is HIDDEN from the hero/needs-you
 *      band but NOT deleted (no onUpdateTodo delete call; the item is simply not
 *      rendered as a Tier-5 hero candidate).
 *
 *   2. RESURFACE on tick: a todo whose parkedUntil crosses now during the ~20s
 *      poll tick (advanced via fake timers) resurfaces into the Tier-5 set and
 *      becomes hero-eligible.
 *
 *   3. One-tap park with a duration SET (today / this week / next week): a hero
 *      todo carries a "not now" control that opens a small duration set; clicking
 *      a duration calls onUpdateTodo with a future parkedUntil.
 *
 *   4. doneAt completion: clicking "Done" on a hero todo calls onUpdateTodo with
 *      a doneAt timestamp; after the parent removes/marks the item, the next
 *      Tier-5 item slides up (the new hero) and the completion row carries the
 *      motion-safe settle class.
 *
 *   5. The morning ritual is cue-bound to first-open AND default OFF: with the
 *      flag omitted (or false) there is no ritual surface; with the flag on it
 *      renders once at first open.
 *
 *   6. The three honesty guards hold on the morning-ritual completion surface:
 *      (a) SUPPRESSED-WHEN-ZERO (no "0 done today"); (b) ROLLING last-24h not a
 *      midnight reset; (c) NO streak / chain / "in a row" / "N days" language and
 *      no bare-zero fraction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

import HomeView from '@/components/HomeView';
import type { HomeViewProps } from '@/components/HomeView';
import type { TodoItem } from '@shared/capture';

const NOW = new Date(2026, 5, 21, 9, 0, 0); // 2026-06-21 09:00
const NOW_MS = NOW.getTime();

function baseProps(overrides: Partial<HomeViewProps> = {}): HomeViewProps {
  return {
    // An empty program board so the only hero candidates are @now todos (Tier 5).
    programBoardState: {
      generated_at: '2026-06-21T09:00:00',
      programs: [],
      suggested: [],
    },
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

function makeTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 'todo-1',
    text: 'call the lab',
    createdAt: NOW_MS - 60_000,
    horizon: null,
    category: null,
    project: null,
    parkedUntil: null,
    doneAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Axis 1: a parked @now todo is hidden but not deleted
// ---------------------------------------------------------------------------

describe('M18: a parked @now todo is hidden but not deleted', () => {
  it('does not surface a parked @now todo as the hero', () => {
    const parked = makeTodo({
      id: 'todo-parked',
      text: 'parked away',
      horizon: 'now',
      parkedUntil: NOW_MS + 1_000_000,
    });

    render(<HomeView {...baseProps({ todos: [parked], onUpdateTodo: vi.fn() })} />);

    // The parked todo text is not visible anywhere as a hero todo.
    expect(screen.queryByTestId('home-todo-hero')).toBeNull();
  });

  it('never calls onUpdateTodo to delete the parked item (it stays in the store)', () => {
    const onUpdateTodo = vi.fn();
    const parked = makeTodo({
      id: 'todo-parked',
      horizon: 'now',
      parkedUntil: NOW_MS + 1_000_000,
    });

    render(<HomeView {...baseProps({ todos: [parked], onUpdateTodo })} />);

    // No mutation fired just from rendering a parked item.
    expect(onUpdateTodo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Axis 2: resurfacing on the ~20s poll tick (fake timers)
// ---------------------------------------------------------------------------

describe('M18: a parked todo resurfaces into Tier 5 when parkedUntil <= now on tick', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resurfaces a @now todo as the hero once its parkedUntil crosses the tick clock', () => {
    // Parked 10s into the future; the internal ~20s tick advances the clock past
    // it, so on the next tick the todo resurfaces into the Tier-5 hero slot.
    const parkedUntil = NOW_MS + 10_000;
    const todo = makeTodo({
      id: 'todo-resurface',
      text: 'resurfaced task',
      horizon: 'now',
      parkedUntil,
    });

    render(<HomeView {...baseProps({ now: NOW, todos: [todo], onUpdateTodo: vi.fn() })} />);

    // Before resurfacing: not a hero todo.
    expect(screen.queryByTestId('home-todo-hero')).toBeNull();

    // Advance past the park window AND a poll tick (the internal clock advances).
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    // The todo has resurfaced and is now the hero.
    const heroTodo = screen.getByTestId('home-todo-hero');
    expect(heroTodo.textContent).toContain('resurfaced task');
  });
});

// ---------------------------------------------------------------------------
// Axis 3: one-tap park with a duration set (today / this week / next week)
// ---------------------------------------------------------------------------

describe('M18: one-tap park with a small duration set', () => {
  it('the hero todo "not now" control opens a duration set and a click parks it', () => {
    const onUpdateTodo = vi.fn();
    const todo = makeTodo({ id: 'todo-hero', text: 'do the thing', horizon: 'now' });

    render(<HomeView {...baseProps({ todos: [todo], onUpdateTodo })} />);

    // Open the "not now" duration set.
    fireEvent.click(screen.getByTestId('home-todo-park-open'));

    // The three duration options are present.
    expect(screen.getByTestId('home-todo-park-today')).toBeTruthy();
    expect(screen.getByTestId('home-todo-park-this-week')).toBeTruthy();
    expect(screen.getByTestId('home-todo-park-next-week')).toBeTruthy();

    // Click "this week".
    fireEvent.click(screen.getByTestId('home-todo-park-this-week'));

    expect(onUpdateTodo).toHaveBeenCalledTimes(1);
    const [id, patch] = onUpdateTodo.mock.calls[0];
    expect(id).toBe('todo-hero');
    expect(typeof patch.parkedUntil).toBe('number');
    expect(patch.parkedUntil).toBeGreaterThan(NOW_MS);
  });

  it('each duration option parks to a strictly later time than the previous', () => {
    const todayFn = vi.fn();
    const weekFn = vi.fn();
    const nextWeekFn = vi.fn();

    // Render three times, click a different duration each time.
    const todo = makeTodo({ id: 'todo-hero', horizon: 'now' });

    const { unmount: u1 } = render(
      <HomeView {...baseProps({ todos: [todo], onUpdateTodo: todayFn })} />,
    );
    fireEvent.click(screen.getByTestId('home-todo-park-open'));
    fireEvent.click(screen.getByTestId('home-todo-park-today'));
    u1();

    const { unmount: u2 } = render(
      <HomeView {...baseProps({ todos: [todo], onUpdateTodo: weekFn })} />,
    );
    fireEvent.click(screen.getByTestId('home-todo-park-open'));
    fireEvent.click(screen.getByTestId('home-todo-park-this-week'));
    u2();

    render(<HomeView {...baseProps({ todos: [todo], onUpdateTodo: nextWeekFn })} />);
    fireEvent.click(screen.getByTestId('home-todo-park-open'));
    fireEvent.click(screen.getByTestId('home-todo-park-next-week'));

    const todayUntil = todayFn.mock.calls[0][1].parkedUntil as number;
    const weekUntil = weekFn.mock.calls[0][1].parkedUntil as number;
    const nextWeekUntil = nextWeekFn.mock.calls[0][1].parkedUntil as number;

    expect(todayUntil).toBeLessThan(weekUntil);
    expect(weekUntil).toBeLessThan(nextWeekUntil);
  });
});

// ---------------------------------------------------------------------------
// Axis 4: doneAt completion settles the row, ticks the count, slides next up
// ---------------------------------------------------------------------------

describe('M18: doneAt completion', () => {
  it('clicking Done on the hero todo calls onUpdateTodo with a doneAt timestamp', () => {
    const onUpdateTodo = vi.fn();
    const todo = makeTodo({ id: 'todo-finish', text: 'finish me', horizon: 'now' });

    render(<HomeView {...baseProps({ todos: [todo], onUpdateTodo })} />);

    fireEvent.click(screen.getByTestId('home-todo-done'));

    expect(onUpdateTodo).toHaveBeenCalledTimes(1);
    const [id, patch] = onUpdateTodo.mock.calls[0];
    expect(id).toBe('todo-finish');
    expect(typeof patch.doneAt).toBe('number');
    expect(patch.doneAt).toBeGreaterThan(0);
  });

  it('the next Tier-5 todo slides up to the hero slot after the first is marked done', () => {
    // Two @now todos; the first is already done, so the second is the hero.
    const todos = [
      makeTodo({ id: 'todo-first', text: 'first task', horizon: 'now', doneAt: NOW_MS - 1000 }),
      makeTodo({ id: 'todo-second', text: 'second task', horizon: 'now' }),
    ];

    render(<HomeView {...baseProps({ todos, onUpdateTodo: vi.fn() })} />);

    const heroTodo = screen.getByTestId('home-todo-hero');
    expect(heroTodo.textContent).toContain('second task');
    expect(heroTodo.textContent).not.toContain('first task');
  });

  it('a just-completed todo row carries a motion-safe settle class', () => {
    // recentTodoCloses identifies a just-finished todo id for the settle beat.
    const todos = [makeTodo({ id: 'todo-just-done', text: 'just finished', horizon: 'now' })];

    render(
      <HomeView
        {...baseProps({
          todos,
          onUpdateTodo: vi.fn(),
          recentTodoCloses: ['todo-just-done'],
        })}
      />,
    );

    const settled = screen.getByTestId('home-todo-settle');
    // The settle class is a fade/opacity class, NOT a layout-mutation token.
    expect(settled.className).toMatch(/settle-/);
    const LAYOUT_WORDS = ['translate', 'transform', 'mt-', 'mb-', 'top-', 'absolute', 'fixed'];
    for (const w of LAYOUT_WORDS) {
      expect(settled.className).not.toContain(w);
    }
  });
});

// ---------------------------------------------------------------------------
// Axis 5: the morning ritual is cue-bound to first-open AND default OFF
// ---------------------------------------------------------------------------

describe('M18: morning ritual is default OFF and cue-bound to first open', () => {
  it('does not render the morning ritual when the flag is omitted (default OFF)', () => {
    render(<HomeView {...baseProps({ todos: [makeTodo({ horizon: 'now' })], onUpdateTodo: vi.fn() })} />);
    expect(screen.queryByTestId('home-morning-ritual')).toBeNull();
  });

  it('does not render the morning ritual when the flag is explicitly false', () => {
    render(
      <HomeView
        {...baseProps({
          morningRitual: false,
          todos: [makeTodo({ horizon: 'now' })],
          onUpdateTodo: vi.fn(),
        })}
      />,
    );
    expect(screen.queryByTestId('home-morning-ritual')).toBeNull();
  });

  it('renders the morning ritual once at first open when the flag is on', () => {
    render(
      <HomeView
        {...baseProps({
          morningRitual: true,
          todos: [makeTodo({ horizon: 'now' })],
          onUpdateTodo: vi.fn(),
        })}
      />,
    );
    expect(screen.getByTestId('home-morning-ritual')).toBeTruthy();
  });

  it('the morning ritual dismisses after the user finishes it (cue-bound, not persistent)', () => {
    render(
      <HomeView
        {...baseProps({
          morningRitual: true,
          todos: [makeTodo({ horizon: 'now' })],
          onUpdateTodo: vi.fn(),
        })}
      />,
    );
    const ritual = screen.getByTestId('home-morning-ritual');
    const doneBtn = ritual.querySelector('[data-testid="home-morning-ritual-done"]') as HTMLElement;
    fireEvent.click(doneBtn);
    expect(screen.queryByTestId('home-morning-ritual')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Axis 6: the three honesty guards on the morning-ritual completion surface
// ---------------------------------------------------------------------------

describe('M18: morning-ritual completion surface honesty guards', () => {
  it('SUPPRESSED-WHEN-ZERO: at a bare-zero morning open shows no "0 done" fraction', () => {
    render(
      <HomeView
        {...baseProps({
          morningRitual: true,
          todos: [makeTodo({ horizon: 'now', doneAt: null })], // nothing done
          onUpdateTodo: vi.fn(),
        })}
      />,
    );
    const ritual = screen.getByTestId('home-morning-ritual');
    const text = ritual.textContent ?? '';
    expect(text.toLowerCase()).not.toContain('0 done');
    expect(text.toLowerCase()).not.toContain('0 closed');
    expect(text.toLowerCase()).not.toContain('0 of');
  });

  it('ROLLING last-24h, not midnight reset: a yesterday-evening completion shows non-zero momentum', () => {
    // A completion 15h ago (yesterday evening) is inside the rolling 24h window,
    // so a 9am morning open surfaces a non-zero count, never a fresh-at-midnight 0.
    const todos = [
      makeTodo({ id: 'done-yest', doneAt: NOW_MS - 15 * 60 * 60 * 1000 }),
      makeTodo({ id: 'open-now', horizon: 'now' }),
    ];
    render(
      <HomeView
        {...baseProps({ morningRitual: true, todos, onUpdateTodo: vi.fn() })}
      />,
    );
    const surface = screen.getByTestId('home-morning-closed-count');
    expect(surface.textContent).toContain('1');
    expect(surface.textContent?.toLowerCase()).toContain('last 24h');
    expect(surface.textContent?.toLowerCase()).not.toContain('today');
  });

  it('NO streak / chain / "in a row" / "N days" language and no bare-zero fraction', () => {
    const todos = [
      makeTodo({ id: 'done-1', doneAt: NOW_MS - 1000 }),
      makeTodo({ id: 'open-now', horizon: 'now' }),
    ];
    render(
      <HomeView
        {...baseProps({ morningRitual: true, todos, onUpdateTodo: vi.fn() })}
      />,
    );
    const ritual = screen.getByTestId('home-morning-ritual');
    const text = ritual.textContent ?? '';
    const banned = [/in a row/i, /streak/i, /chain/i, /\d+\s*days?/i];
    for (const pattern of banned) {
      expect(text, `morning ritual must not contain ${pattern}`).not.toMatch(pattern);
    }
  });

  it('no em dashes and no AI-slop words in the morning ritual copy', () => {
    render(
      <HomeView
        {...baseProps({
          morningRitual: true,
          todos: [makeTodo({ horizon: 'now' })],
          onUpdateTodo: vi.fn(),
        })}
      />,
    );
    const ritual = screen.getByTestId('home-morning-ritual');
    const text = ritual.textContent ?? '';
    expect(text).not.toContain('—');
    expect(text).not.toMatch(/[a-zA-Z]--[a-zA-Z]/);
    const slop = ['leverage', 'robust', 'seamless', 'comprehensive', 'delve', 'utilize'];
    for (const word of slop) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });
});
