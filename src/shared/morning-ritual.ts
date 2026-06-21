/**
 * M18: resurfacing/parking + the morning-ritual pure helpers.
 *
 * Spec: PLAN-PHASE-2-3.md lines 63-71, 78; PLAN.md 1.5 / 1.10.
 *
 * Pure: no DOM, no Electron, no Date.now. The clock arrives as a `now` argument
 * so every result is deterministic and unit-testable. Importable by renderer,
 * main, and the web client.
 *
 * What lives here:
 *   - parkDurations(now): the small one-tap park duration set (today / this week
 *     / next week), each a future epoch ms. Parking is "not now", never delete.
 *   - isParked(item, now): an item with parkedUntil > now is HIDDEN (silent decay
 *     is the AP-F anti-pattern, so it is hidden, never dropped). An item whose
 *     parkedUntil <= now has RESURFACED.
 *   - resurfacedNowTodos(todos, now): the open @now todos that are visible right
 *     now (not currently parked). On each Home open and the ~20s poll tick, an
 *     item whose parkedUntil <= now reappears in this set (the renderer re-derives
 *     it from the advancing clock).
 *   - todoToDashboardItem(todo): maps an @now todo to the Tier-5 DashboardItem
 *     shape the ranker already understands (source:'todo', horizon:'now').
 *   - morningClosedCount(todos, now): a ROLLING last-24h count of doneAt
 *     completions, NOT a fresh-at-midnight reset, so the morning cue opens on
 *     momentum (PLAN.md 1.5 closedRecent model applied to todos).
 *   - morningCountLine(count): the honest completion-surface copy. Suppressed
 *     when zero (forward framing, never a bare-zero fraction), rolling 24h (never
 *     "today"), and carries no streak / chain / "in a row" / "N days" language
 *     (PLAN.md 1.4 / 6.6; the morning surface fires at the most fragile moment of
 *     the day, so the honesty guards are non-negotiable here).
 *
 * Captured todo text is DISPLAY-ONLY (PLAN.md 1.7 / 3.3): nothing here feeds it
 * to an LLM, a PTY, or a logger.
 */

import type { TodoItem } from './capture';
import type { DashboardItem } from './program-board-state';

// ---------------------------------------------------------------------------
// Parking duration set (today / this week / next week)
// ---------------------------------------------------------------------------

/** Milliseconds in one day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The three park durations, all FUTURE epoch ms, in ascending order. */
export interface ParkDurations {
  /** Until later today (a short defer). */
  today: number;
  /** Until one week out. */
  thisWeek: number;
  /** Until two weeks out (the longest defer in the small set). */
  nextWeek: number;
}

/**
 * Returns the small one-tap park duration set anchored at `now`.
 *
 * "today" is a short same-day defer (a few hours out) so the item comes back the
 * same day rather than vanishing. "this week" is a week out; "next week" is two
 * weeks out. All three are strictly in the future and strictly ascending, which
 * the renderer relies on to label the buttons in order.
 */
export function parkDurations(now: Date): ParkDurations {
  const base = now.getTime();
  return {
    today: base + 4 * 60 * 60 * 1000, // ~4 hours out, still today
    thisWeek: base + 7 * DAY_MS,
    nextWeek: base + 14 * DAY_MS,
  };
}

// ---------------------------------------------------------------------------
// Parking / resurfacing predicates
// ---------------------------------------------------------------------------

/**
 * True when an item is currently parked (parkedUntil strictly in the future).
 *
 * An item with parkedUntil <= now has RESURFACED and is no longer parked. A null
 * parkedUntil is never parked. The boundary (parkedUntil === now) resurfaces, so
 * the exact-tick case never hides an item that is due.
 */
export function isParked(item: TodoItem, now: Date): boolean {
  if (item.parkedUntil === null) return false;
  return item.parkedUntil > now.getTime();
}

/**
 * The open @now todos visible at `now`: horizon === 'now', not done, and not
 * currently parked. A parked @now todo is hidden from this set but stays in the
 * source array (never deleted). When its parkedUntil crosses `now` on a later
 * open or poll tick, it reappears here (the renderer re-derives this set against
 * the advancing clock).
 *
 * The input array is not mutated.
 */
export function resurfacedNowTodos(todos: TodoItem[], now: Date): TodoItem[] {
  return todos.filter(
    (t) => t.horizon === 'now' && t.doneAt === null && !isParked(t, now),
  );
}

// ---------------------------------------------------------------------------
// todoToDashboardItem (Tier-5 mapper)
// ---------------------------------------------------------------------------

/**
 * Maps an @now todo to a DashboardItem so the ranker's Tier-5 branch
 * (source:'todo' + horizon:'now') can place it. A captured todo is DISPLAY-ONLY:
 * it carries no needs-you program flag and no actions, so it can never become a
 * Claude-injection hero (its only action is Copy / Done / park in the renderer).
 *
 * The id is "todo:<todoId>" so it never collides with a board card ("pb:") or a
 * live tab ("tab:"), and so the renderer can route a row back to its todo id.
 */
export function todoToDashboardItem(todo: TodoItem): DashboardItem {
  return {
    id: `todo:${todo.id}`,
    slug: todo.id,
    source: 'todo',
    kind: 'todo',
    title: todo.text,
    detail: '',
    project: todo.project,
    badges: [],
    ageColor: 'green',
    recencyIso: null,
    gitAgeDays: null,
    url: null,
    needsYou: false,
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
    horizon: 'now',
    avoidanceCategory: null,
    actions: {},
  };
}

// ---------------------------------------------------------------------------
// Rolling last-24h completion count (the closedRecent model for todos)
// ---------------------------------------------------------------------------

/** The rolling window for the morning completion count (PLAN.md 1.5). */
export const MORNING_CLOSED_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Counts todos completed within the rolling last-24h window ending at `now`.
 *
 * Rolling, NOT a fresh-at-midnight reset (PLAN.md 1.5): a completion at 18:00
 * yesterday still counts at a 09:00 open today, so the morning cue opens on
 * momentum rather than a bare zero. A completion older than 24h does not count.
 */
export function morningClosedCount(todos: TodoItem[], now: Date): number {
  const cutoff = now.getTime() - MORNING_CLOSED_WINDOW_MS;
  let count = 0;
  for (const t of todos) {
    if (t.doneAt !== null && t.doneAt > cutoff && t.doneAt <= now.getTime()) {
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Morning completion-surface copy (the three honesty guards live here)
// ---------------------------------------------------------------------------

/**
 * The morning completion-surface line.
 *
 * Guard 1 (SUPPRESSED-WHEN-ZERO, PLAN.md 1.5 / 1.10): a zero count returns
 * forward / goal framing, never a bare-zero "0 done" fraction. The morning cue
 * fires at the start of the day when a fresh count is 0, the most fragile moment,
 * so a blank-zero is never shown.
 *
 * Guard 2 (ROLLING not midnight, PLAN.md 1.5): a non-zero count reads "last 24h",
 * never "today" (a 24h window labelled "today" at 9am is a lie a time-blind brain
 * catches and stops trusting).
 *
 * Guard 3 (NO streak language, PLAN.md 1.4 / 6.6): no "in a row" / "streak" /
 * "N days" / "chain", and no bare-zero fraction, ever. No em dashes, no slop.
 */
export function morningCountLine(count: number): string {
  if (count <= 0) {
    // Forward framing, never a bare-zero fraction. A fresh, calm landing.
    return 'A fresh start. Pick the one thing to move first.';
  }
  return `${count} finished, last 24h`;
}
