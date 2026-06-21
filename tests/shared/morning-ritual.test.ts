/**
 * M18: resurfacing/parking + the morning-ritual pure helpers.
 *
 * Spec: PLAN-PHASE-2-3.md lines 63-71, 78; PLAN.md 1.5 / 1.10.
 *
 * These are the pure, DOM-free, Electron-free helpers the HomeView morning
 * ritual + parking flow consume. Falsifiable axes:
 *
 *   1. parking duration set: parkDurations(now) returns three FUTURE timestamps
 *      (today / this week / next week), each strictly greater than now and in
 *      ascending order.
 *
 *   2. a parked item (parkedUntil > now) is HIDDEN from the resurfaced @now set
 *      but NOT deleted (it is still in the input array).
 *
 *   3. resurfacing: an item whose parkedUntil <= now resurfaces into the @now
 *      Tier-5 set; the same item with parkedUntil > now does not.
 *
 *   4. morningClosedCount: a ROLLING last-24h count of doneAt completions, NOT a
 *      fresh-at-midnight reset. A completion 23h ago counts; one 25h ago does not.
 *
 *   5. morningCountLine honesty guards:
 *      - SUPPRESSED-WHEN-ZERO: count 0 returns forward/goal framing, never a
 *        bare "0 done" fraction.
 *      - ROLLING not midnight: a non-zero count never says "today"; it says
 *        "last 24h".
 *      - NO streak language: no "in a row" / "streak" / "N days" / "chain", and
 *        no bare-zero fraction, in any returned string.
 *      - no em dashes, no AI-slop words.
 */

import { describe, it, expect } from 'vitest';
import type { TodoItem } from '@shared/capture';
import {
  parkDurations,
  isParked,
  resurfacedNowTodos,
  todoToDashboardItem,
  morningClosedCount,
  morningCountLine,
  MORNING_CLOSED_WINDOW_MS,
} from '@shared/morning-ritual';

const NOW = new Date(2026, 5, 21, 9, 0, 0); // 2026-06-21 09:00 local
const NOW_MS = NOW.getTime();

function makeTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 'todo-1',
    text: 'review the lab case',
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
// Axis 1: parking duration set (today / this week / next week)
// ---------------------------------------------------------------------------

describe('M18: parkDurations is a small future duration set', () => {
  it('returns today / thisWeek / nextWeek, all strictly in the future', () => {
    const d = parkDurations(NOW);
    expect(d.today).toBeGreaterThan(NOW_MS);
    expect(d.thisWeek).toBeGreaterThan(NOW_MS);
    expect(d.nextWeek).toBeGreaterThan(NOW_MS);
  });

  it('returns the three durations in ascending order (today < thisWeek < nextWeek)', () => {
    const d = parkDurations(NOW);
    expect(d.today).toBeLessThan(d.thisWeek);
    expect(d.thisWeek).toBeLessThan(d.nextWeek);
  });
});

// ---------------------------------------------------------------------------
// Axis 2 + 3: parked items hidden but not deleted; resurface when due
// ---------------------------------------------------------------------------

describe('M18: parking hides without deleting, resurfaces when due', () => {
  it('isParked is true while parkedUntil > now, false once parkedUntil <= now', () => {
    const future = makeTodo({ parkedUntil: NOW_MS + 1000 });
    const due = makeTodo({ parkedUntil: NOW_MS - 1000 });
    const exact = makeTodo({ parkedUntil: NOW_MS });
    const never = makeTodo({ parkedUntil: null });
    expect(isParked(future, NOW)).toBe(true);
    expect(isParked(due, NOW)).toBe(false);
    expect(isParked(exact, NOW)).toBe(false); // <= now resurfaces
    expect(isParked(never, NOW)).toBe(false);
  });

  it('a parked @now todo is hidden from the resurfaced set but still in the input', () => {
    const parked = makeTodo({
      id: 'todo-parked',
      horizon: 'now',
      parkedUntil: NOW_MS + 1_000_000,
    });
    const todos = [parked];

    const surfaced = resurfacedNowTodos(todos, NOW);

    // Hidden from the resurfaced @now set...
    expect(surfaced.find((t) => t.id === 'todo-parked')).toBeUndefined();
    // ...but NOT deleted from the source array (no mutation, still present).
    expect(todos).toHaveLength(1);
    expect(todos[0].id).toBe('todo-parked');
  });

  it('an @now todo whose parkedUntil has passed resurfaces into the @now set', () => {
    const due = makeTodo({
      id: 'todo-due',
      horizon: 'now',
      parkedUntil: NOW_MS - 1000, // passed
    });

    const surfaced = resurfacedNowTodos([due], NOW);

    expect(surfaced.map((t) => t.id)).toContain('todo-due');
  });

  it('only @now open todos are in the resurfaced set (no @next/@later, no done)', () => {
    const todos = [
      makeTodo({ id: 'now-open', horizon: 'now' }),
      makeTodo({ id: 'next-open', horizon: 'next' }),
      makeTodo({ id: 'later-open', horizon: 'later' }),
      makeTodo({ id: 'now-done', horizon: 'now', doneAt: NOW_MS - 5000 }),
      makeTodo({ id: 'untriaged', horizon: null }),
    ];

    const surfaced = resurfacedNowTodos(todos, NOW);

    expect(surfaced.map((t) => t.id)).toEqual(['now-open']);
  });
});

// ---------------------------------------------------------------------------
// todoToDashboardItem: a resurfaced @now todo maps to a Tier-5-eligible item
// ---------------------------------------------------------------------------

describe('M18: todoToDashboardItem maps a @now todo to a Tier-5 candidate', () => {
  it('produces a source:todo, horizon:now DashboardItem (the Tier-5 shape)', () => {
    const todo = makeTodo({ id: 'todo-x', text: 'call the lab', horizon: 'now' });
    const item = todoToDashboardItem(todo);
    expect(item.source).toBe('todo');
    expect(item.horizon).toBe('now');
    expect(item.id).toBe('todo:todo-x');
    expect(item.title).toBe('call the lab');
    // A captured todo is never paused and never carries a needs-you program flag.
    expect(item.paused).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Axis 4: rolling last-24h doneAt count (not a midnight reset)
// ---------------------------------------------------------------------------

describe('M18: morningClosedCount is a rolling last-24h count', () => {
  it('counts a completion 23h ago but not one 25h ago (rolling, not midnight)', () => {
    const todos = [
      makeTodo({ id: 'done-23h', doneAt: NOW_MS - 23 * 60 * 60 * 1000 }),
      makeTodo({ id: 'done-25h', doneAt: NOW_MS - 25 * 60 * 60 * 1000 }),
    ];
    expect(morningClosedCount(todos, NOW)).toBe(1);
  });

  it('counts a completion from yesterday evening at a 9am open (momentum, not zero)', () => {
    // A morning open at 09:00 with a completion at 18:00 the day before (15h ago)
    // is INSIDE the rolling window, so the morning surface opens non-zero. A
    // fresh-at-midnight reset would wrongly show 0 here.
    const yesterdayEvening = NOW_MS - 15 * 60 * 60 * 1000;
    const todos = [makeTodo({ id: 'done-yest', doneAt: yesterdayEvening })];
    expect(morningClosedCount(todos, NOW)).toBe(1);
  });

  it('ignores open (doneAt:null) todos', () => {
    const todos = [makeTodo({ id: 'open', doneAt: null })];
    expect(morningClosedCount(todos, NOW)).toBe(0);
  });

  it('the window constant is 24h', () => {
    expect(MORNING_CLOSED_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// Axis 5: morningCountLine honesty guards
// ---------------------------------------------------------------------------

describe('M18: morningCountLine honesty guards', () => {
  it('SUPPRESSED-WHEN-ZERO: count 0 returns forward/goal framing, never a "0 done" fraction', () => {
    const line = morningCountLine(0);
    expect(line).not.toMatch(/\b0\b/); // no bare zero
    expect(line.toLowerCase()).not.toContain('0 done');
    expect(line.toLowerCase()).not.toContain('0 closed');
    // It is forward-looking, not a blank reset (non-empty).
    expect(line.length).toBeGreaterThan(0);
  });

  it('ROLLING not midnight: a non-zero count says "last 24h", never "today"', () => {
    const line = morningCountLine(3);
    expect(line).toContain('3');
    expect(line.toLowerCase()).toContain('last 24h');
    expect(line.toLowerCase()).not.toContain('today');
  });

  it('NO streak / chain / "in a row" / "N days" language at any count', () => {
    const lines = [morningCountLine(0), morningCountLine(1), morningCountLine(5)];
    const banned = [/in a row/i, /streak/i, /chain/i, /\d+\s*days?/i];
    for (const line of lines) {
      for (const pattern of banned) {
        expect(line, `morningCountLine must not contain ${pattern}: "${line}"`).not.toMatch(
          pattern,
        );
      }
    }
  });

  it('no em dashes and no AI-slop words at any count', () => {
    const lines = [morningCountLine(0), morningCountLine(1), morningCountLine(2)];
    const slop = ['leverage', 'robust', 'seamless', 'comprehensive', 'delve', 'utilize'];
    for (const line of lines) {
      expect(line).not.toContain('—'); // em dash char
      expect(line).not.toMatch(/[a-zA-Z]--[a-zA-Z]/); // double hyphen as em dash
      for (const word of slop) {
        expect(line.toLowerCase()).not.toContain(word);
      }
    }
  });
});
