/**
 * M6: Tests for the manual re-roll + per-day parked-hero-id slot.
 *
 * The deterministic ranker can pin a long-avoided item as the hero every poll
 * (PLAN.md 1.6). The "Not now, show me another" control parks the current hero
 * id for the rest of the day and surfaces ranked[1].
 *
 * Pure module, src/shared/hero-reroll.ts. The clock is injected (now param).
 * Persistence is a plain serializable slot { day, parkedId }; the renderer/store
 * writes it. The two persistence properties (same-day survives reload, new day
 * clears) are tested against the pure resolver, since "reload" is just re-reading
 * the same serialized slot.
 *
 * Covers (PLAN.md 1.6 / PLAN-PHASE-2-3.md M6):
 *   - re-roll parks the current hero id and surfaces ranked[1].
 *   - a parked hero id survives a simulated same-day reload.
 *   - a parked hero id CLEARS on a new day.
 *   - the re-roll window default is until end of day (the day key).
 */

import { describe, it, expect } from 'vitest';
import {
  dayKey,
  parkHero,
  resolveParkedId,
  applyReroll,
  type ParkedHeroSlot,
} from '@shared/hero-reroll';
import type { DashboardItem } from '@shared/program-board-state';

function makeItem(overrides: Partial<DashboardItem> = {}): DashboardItem {
  return {
    id: 'pb:base',
    slug: 'base',
    source: 'program-board',
    kind: 'in_progress',
    title: 'Base',
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

const MONDAY = new Date(2026, 5, 21, 9, 0, 0); // 2026-06-21
const MONDAY_LATER = new Date(2026, 5, 21, 23, 30, 0); // same day, late
const TUESDAY = new Date(2026, 5, 22, 7, 0, 0); // next day

describe('dayKey', () => {
  it('returns a YYYY-MM-DD local key', () => {
    expect(dayKey(MONDAY)).toBe('2026-06-21');
  });

  it('is stable across the same calendar day regardless of hour', () => {
    expect(dayKey(MONDAY)).toBe(dayKey(MONDAY_LATER));
  });

  it('changes on a new day', () => {
    expect(dayKey(MONDAY)).not.toBe(dayKey(TUESDAY));
  });
});

describe('parkHero', () => {
  it('records the hero id against the current day key', () => {
    const slot = parkHero('pb:dreaded', MONDAY);
    expect(slot.parkedId).toBe('pb:dreaded');
    expect(slot.day).toBe('2026-06-21');
  });
});

describe('resolveParkedId -- per-day persistence (1.6)', () => {
  it('returns the parked id on the same day (survives a simulated reload)', () => {
    // Park it, serialize, "reload" (re-parse), resolve at a later same-day time.
    const slot = parkHero('pb:dreaded', MONDAY);
    const reloaded = JSON.parse(JSON.stringify(slot)) as ParkedHeroSlot;
    expect(resolveParkedId(reloaded, MONDAY_LATER)).toBe('pb:dreaded');
  });

  it('clears on a new day', () => {
    const slot = parkHero('pb:dreaded', MONDAY);
    const reloaded = JSON.parse(JSON.stringify(slot)) as ParkedHeroSlot;
    expect(resolveParkedId(reloaded, TUESDAY)).toBeNull();
  });

  it('returns null for a null slot', () => {
    expect(resolveParkedId(null, MONDAY)).toBeNull();
  });

  it('returns null when the slot has no parked id', () => {
    const empty: ParkedHeroSlot = { day: '2026-06-21', parkedId: null };
    expect(resolveParkedId(empty, MONDAY)).toBeNull();
  });
});

describe('applyReroll -- surfaces ranked[1] (1.6)', () => {
  const a = makeItem({ id: 'pb:a', slug: 'a' });
  const b = makeItem({ id: 'pb:b', slug: 'b' });
  const c = makeItem({ id: 'pb:c', slug: 'c' });

  it('with no parked id, the ranked head stays the hero', () => {
    const result = applyReroll([a, b, c], null, MONDAY);
    expect(result[0].id).toBe('pb:a');
  });

  it('parking the current hero surfaces ranked[1]', () => {
    const slot = parkHero('pb:a', MONDAY);
    const result = applyReroll([a, b, c], slot, MONDAY);
    expect(result[0].id).toBe('pb:b');
  });

  it('the parked hero is removed from the surfaced order, not just demoted to second', () => {
    const slot = parkHero('pb:a', MONDAY);
    const result = applyReroll([a, b, c], slot, MONDAY);
    expect(result.map((i) => i.id)).not.toContain('pb:a');
    expect(result.map((i) => i.id)).toEqual(['pb:b', 'pb:c']);
  });

  it('a parked id from a previous day is ignored (the hero returns)', () => {
    const slot = parkHero('pb:a', MONDAY);
    const result = applyReroll([a, b, c], slot, TUESDAY);
    expect(result[0].id).toBe('pb:a');
  });

  it('a parked id no longer present in the ranked list is a no-op', () => {
    const slot = parkHero('pb:gone', MONDAY);
    const result = applyReroll([a, b, c], slot, MONDAY);
    expect(result[0].id).toBe('pb:a');
  });

  it('does not mutate the input array', () => {
    const slot = parkHero('pb:a', MONDAY);
    const items = [a, b, c];
    applyReroll(items, slot, MONDAY);
    expect(items.map((i) => i.id)).toEqual(['pb:a', 'pb:b', 'pb:c']);
  });

  it('returns an empty list unchanged', () => {
    expect(applyReroll([], parkHero('pb:a', MONDAY), MONDAY)).toEqual([]);
  });
});
