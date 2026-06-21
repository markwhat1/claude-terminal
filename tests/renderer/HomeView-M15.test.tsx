/**
 * M15: horizons + triage-one-at-a-time.
 *
 * Falsifiable axes from PLAN-PHASE-2-3.md lines 43-45, 75:
 *
 *   1. Triage panel shows exactly ONE untriaged item at a time (J.O.T. applied to
 *      triage). The untriaged item is the first item whose horizon is null and
 *      whose doneAt is null.
 *
 *   2. One-tap horizon assign: clicking a horizon button calls onUpdateTodo with
 *      the correct id and horizon.
 *
 *   3. One-tap park/not-now: clicking the park button calls onUpdateTodo with the
 *      correct id and a future parkedUntil timestamp (> now).
 *
 *   4. An @now todo (horizon='now') is Tier-5 hero-eligible (ranked above Tier-6
 *      items that lack horizon). Verified via rankItems directly.
 *
 *   5. @next/@later todos collapse behind one "+N more" control, never three
 *      equal columns.
 *
 *   6. The untriaged count renders as a quiet muted number (the Inbox(N) from M12),
 *      NOT a red badge / bg-red / bg-attention class.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import HomeView from '@/components/HomeView';
import type { HomeViewProps } from '@/components/HomeView';
import type { DashboardItem } from '@shared/program-board-state';
import { rankItems } from '@shared/rank-items';
import type { TodoItem } from '@shared/capture';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date(2026, 5, 21, 9, 0, 0); // 2026-06-21 09:00

function baseProps(overrides: Partial<HomeViewProps> = {}): HomeViewProps {
  return {
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

function makeTodoItem(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 'todo-test-1',
    text: 'review the lab case',
    createdAt: 1718900000000,
    horizon: null,
    category: null,
    project: null,
    parkedUntil: null,
    doneAt: null,
    ...overrides,
  };
}

function makeDashboardItem(overrides: Partial<DashboardItem> = {}): DashboardItem {
  return {
    id: 'pb:base',
    slug: 'base',
    source: 'program-board',
    kind: 'in_progress',
    title: 'Base item',
    detail: '',
    project: null,
    badges: [],
    ageColor: 'green',
    recencyIso: null,
    gitAgeDays: 0,
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Axis 1: triage panel shows exactly ONE untriaged item at a time
// ---------------------------------------------------------------------------

describe('M15: triage panel shows exactly one item at a time', () => {
  it('renders one triage item when todos contain untriaged items', () => {
    const todos: TodoItem[] = [
      makeTodoItem({ id: 'todo-1', text: 'first task' }),
      makeTodoItem({ id: 'todo-2', text: 'second task' }),
      makeTodoItem({ id: 'todo-3', text: 'third task' }),
    ];

    render(<HomeView {...baseProps({ todos, onUpdateTodo: vi.fn() })} />);

    const panel = screen.getByTestId('home-triage-panel');
    expect(panel).toBeTruthy();

    // Exactly one triage item text is visible (the first untriaged item).
    const items = screen.getAllByTestId('home-triage-item-text');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe('first task');
  });

  it('does not show the triage panel when there are no untriaged items', () => {
    const todos: TodoItem[] = [
      makeTodoItem({ id: 'todo-1', text: 'done task', doneAt: 1718900001000 }),
      makeTodoItem({ id: 'todo-2', text: 'horizoned task', horizon: 'now' }),
    ];

    render(<HomeView {...baseProps({ todos, onUpdateTodo: vi.fn() })} />);

    expect(screen.queryByTestId('home-triage-panel')).toBeNull();
  });

  it('skips done items and parked items when selecting the next untriaged item', () => {
    const todos: TodoItem[] = [
      makeTodoItem({ id: 'todo-skip-done', text: 'already done', doneAt: 1718900001000 }),
      makeTodoItem({
        id: 'todo-skip-parked',
        text: 'parked away',
        parkedUntil: NOW.getTime() + 1_000_000,
      }),
      makeTodoItem({ id: 'todo-visible', text: 'visible for triage' }),
    ];

    render(<HomeView {...baseProps({ todos, onUpdateTodo: vi.fn() })} />);

    const items = screen.getAllByTestId('home-triage-item-text');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe('visible for triage');
  });
});

// ---------------------------------------------------------------------------
// Axis 2: one-tap horizon assign calls onUpdateTodo
// ---------------------------------------------------------------------------

describe('M15: one-tap horizon assign', () => {
  it('clicking @now assigns horizon:now via onUpdateTodo', () => {
    const onUpdateTodo = vi.fn();
    const todos: TodoItem[] = [makeTodoItem({ id: 'todo-triage-1', text: 'call the lab' })];

    render(<HomeView {...baseProps({ todos, onUpdateTodo })} />);

    fireEvent.click(screen.getByTestId('home-triage-assign-now'));

    expect(onUpdateTodo).toHaveBeenCalledTimes(1);
    const [id, updates] = onUpdateTodo.mock.calls[0];
    expect(id).toBe('todo-triage-1');
    expect(updates).toMatchObject({ horizon: 'now' });
  });

  it('clicking @next assigns horizon:next via onUpdateTodo', () => {
    const onUpdateTodo = vi.fn();
    const todos: TodoItem[] = [makeTodoItem({ id: 'todo-triage-2', text: 'write the note' })];

    render(<HomeView {...baseProps({ todos, onUpdateTodo })} />);

    fireEvent.click(screen.getByTestId('home-triage-assign-next'));

    expect(onUpdateTodo).toHaveBeenCalledTimes(1);
    const [id, updates] = onUpdateTodo.mock.calls[0];
    expect(id).toBe('todo-triage-2');
    expect(updates).toMatchObject({ horizon: 'next' });
  });

  it('clicking @later assigns horizon:later via onUpdateTodo', () => {
    const onUpdateTodo = vi.fn();
    const todos: TodoItem[] = [makeTodoItem({ id: 'todo-triage-3', text: 'eventually fix this' })];

    render(<HomeView {...baseProps({ todos, onUpdateTodo })} />);

    fireEvent.click(screen.getByTestId('home-triage-assign-later'));

    expect(onUpdateTodo).toHaveBeenCalledTimes(1);
    const [id, updates] = onUpdateTodo.mock.calls[0];
    expect(id).toBe('todo-triage-3');
    expect(updates).toMatchObject({ horizon: 'later' });
  });
});

// ---------------------------------------------------------------------------
// Axis 3: one-tap park/not-now calls onUpdateTodo with a future parkedUntil
// ---------------------------------------------------------------------------

describe('M15: one-tap park (not-now)', () => {
  it('clicking not-now calls onUpdateTodo with parkedUntil > now', () => {
    const onUpdateTodo = vi.fn();
    const todos: TodoItem[] = [makeTodoItem({ id: 'todo-park-1', text: 'check the schedule' })];

    render(<HomeView {...baseProps({ todos, onUpdateTodo })} />);

    fireEvent.click(screen.getByTestId('home-triage-park'));

    expect(onUpdateTodo).toHaveBeenCalledTimes(1);
    const [id, updates] = onUpdateTodo.mock.calls[0];
    expect(id).toBe('todo-park-1');
    expect(typeof updates.parkedUntil).toBe('number');
    expect(updates.parkedUntil).toBeGreaterThan(NOW.getTime());
  });
});

// ---------------------------------------------------------------------------
// Axis 4: an @now todo is Tier-5 hero-eligible (ranks above Tier-6 items)
// ---------------------------------------------------------------------------

describe('M15: @now todo is Tier-5 hero-eligible', () => {
  it('an @now todo ranks above a generic Tier-6 non-todo item', () => {
    const nowTodo = makeDashboardItem({
      id: 'todo:now-1',
      source: 'todo',
      kind: 'todo',
      title: '@now task',
      horizon: 'now',
      needsYou: true,
    });

    const tier6Item = makeDashboardItem({
      id: 'pb:generic',
      source: 'program-board',
      kind: 'in_progress',
      title: 'generic card',
      needsYou: false, // not in any needs-you tier, so Tier 6
    });

    const ranked = rankItems([tier6Item, nowTodo], NOW);

    // The @now todo must be first (Tier 5 beats Tier 6).
    expect(ranked[0].id).toBe('todo:now-1');
    expect(ranked[1].id).toBe('pb:generic');
  });

  it('an @now todo ranks BELOW a Tier-4 needs-you program card', () => {
    // Tier 5 is between Tier 4 and Tier 6 per the plan. A Tier-4 needs-you card
    // beats a Tier-5 @now todo.
    const nowTodo = makeDashboardItem({
      id: 'todo:now-2',
      source: 'todo',
      kind: 'todo',
      title: '@now task',
      horizon: 'now',
      needsYou: true,
    });

    const tier4Card = makeDashboardItem({
      id: 'pb:needs-you',
      source: 'program-board',
      kind: 'in_progress',
      title: 'needs you card',
      needsYou: true,
    });

    const ranked = rankItems([nowTodo, tier4Card], NOW);

    // Tier-4 needs-you card beats Tier-5 @now todo.
    expect(ranked[0].id).toBe('pb:needs-you');
    expect(ranked[1].id).toBe('todo:now-2');
  });

  it('an @next todo is NOT Tier-5: it is not hero-eligible (ranks as Tier 6)', () => {
    const nextTodo = makeDashboardItem({
      id: 'todo:next-1',
      source: 'todo',
      kind: 'todo',
      title: '@next task',
      horizon: 'next',
      needsYou: false,
    });

    const tier4Card = makeDashboardItem({
      id: 'pb:needs-you',
      source: 'program-board',
      kind: 'in_progress',
      title: 'needs-you',
      needsYou: true,
    });

    const ranked = rankItems([nextTodo, tier4Card], NOW);

    // Tier-4 beats a @next todo (which is not hero-eligible).
    expect(ranked[0].id).toBe('pb:needs-you');
  });
});

// ---------------------------------------------------------------------------
// Axis 5: @next/@later todos collapse behind one "+N more" control
// ---------------------------------------------------------------------------

describe('M15: @next/@later collapse behind one "+N more"', () => {
  it('renders a single collapse control for @next and @later todos combined', () => {
    const todos: TodoItem[] = [
      makeTodoItem({ id: 'todo-next-1', text: 'next month task A', horizon: 'next' }),
      makeTodoItem({ id: 'todo-next-2', text: 'next month task B', horizon: 'next' }),
      makeTodoItem({ id: 'todo-later-1', text: 'backlog task', horizon: 'later' }),
    ];

    render(<HomeView {...baseProps({ todos, onUpdateTodo: vi.fn() })} />);

    // One collapse control, not three equal columns.
    const collapseControls = screen.getAllByTestId('home-todo-collapse-control');
    expect(collapseControls).toHaveLength(1);

    // The control text includes the total count (3 items).
    expect(collapseControls[0].textContent).toMatch(/3/);
  });

  it('collapsed @next/@later items are not rendered individually', () => {
    const todos: TodoItem[] = [
      makeTodoItem({ id: 'todo-next-1', text: 'next month task', horizon: 'next' }),
      makeTodoItem({ id: 'todo-later-1', text: 'later task', horizon: 'later' }),
    ];

    render(<HomeView {...baseProps({ todos, onUpdateTodo: vi.fn() })} />);

    // The individual texts should not be visible when collapsed.
    expect(screen.queryByText('next month task')).toBeNull();
    expect(screen.queryByText('later task')).toBeNull();
  });

  it('does not render a collapse control when there are no @next/@later todos', () => {
    const todos: TodoItem[] = [
      makeTodoItem({ id: 'todo-now-1', text: '@now task', horizon: 'now' }),
    ];

    render(<HomeView {...baseProps({ todos, onUpdateTodo: vi.fn() })} />);

    expect(screen.queryByTestId('home-todo-collapse-control')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Axis 6: the untriaged count is a quiet number, never a red badge
// ---------------------------------------------------------------------------

describe('M15: untriaged count is a quiet number, not a red badge', () => {
  it('the Inbox(N) count has muted text classes and no destructive/badge classes', () => {
    // The M12 inbox count is the combined count; its styling is tested here
    // to confirm M15 does not introduce a red badge variant.
    render(<HomeView {...baseProps({ inboxCount: 5, onUpdateTodo: vi.fn() })} />);

    const glance = screen.getByTestId('home-inbox-count');
    expect(glance.textContent).toContain('5');
    expect(glance.className).not.toContain('destructive');
    expect(glance.className).not.toContain('bg-red');
    expect(glance.className).not.toContain('bg-attention');
    expect(glance.className).toContain('text-muted-foreground');
  });

  it('the triage panel itself carries no red/destructive visual treatment', () => {
    const todos: TodoItem[] = [makeTodoItem({ id: 'todo-1', text: 'triage me' })];

    render(<HomeView {...baseProps({ todos, onUpdateTodo: vi.fn() })} />);

    const panel = screen.getByTestId('home-triage-panel');
    expect(panel.className).not.toContain('destructive');
    expect(panel.className).not.toContain('bg-red');
    expect(panel.className).not.toContain('bg-attention');
  });
});
