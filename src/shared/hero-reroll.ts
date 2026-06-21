/**
 * The manual re-roll + the per-day pinned/parked-hero-id slot (PLAN.md 1.6,
 * PLAN-PHASE-2-3.md M6).
 *
 * The deterministic ranker can pin a long-avoided item as the hero every poll, a
 * guilt billboard the brain learns to not-look-at. The hero's single "not now"
 * affordance ("Not now, show me another") PARKS the current hero id for the rest
 * of the day and surfaces ranked[1].
 *
 * Pure: no DOM, no Electron, no Date.now. The clock arrives as the `now`
 * argument. Persistence is a plain serializable slot { day, parkedId }; the
 * renderer/store writes and re-reads it. The two persistence properties (a
 * same-day reload still parks, a new day clears) follow from the day key alone,
 * so a "reload" is just re-parsing the same serialized slot.
 *
 * The re-roll window default is until end of day: a parked id is honored only
 * while resolveParkedId sees the same calendar day, and clears on the next day.
 */

import type { DashboardItem } from './program-board-state';

/**
 * The persisted per-day parked-hero-id slot.
 *
 *   - day:      the YYYY-MM-DD local day key the park was made on.
 *   - parkedId: the DashboardItem id parked out of the hero slot, or null when
 *               nothing is parked.
 */
export interface ParkedHeroSlot {
  day: string;
  parkedId: string | null;
}

/**
 * Returns the local YYYY-MM-DD day key for a clock value.
 *
 * Local, not UTC: the re-roll window is "the rest of MY day", and a UTC key
 * would roll the parked hero back at a local-evening boundary on a UTC-negative
 * offset. Matches the producer's naive-local convention.
 */
export function dayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parks a hero id against the current day. The returned slot is plain JSON, ready
 * to persist (the caller writes it; this function does no I/O).
 */
export function parkHero(heroId: string, now: Date): ParkedHeroSlot {
  return { day: dayKey(now), parkedId: heroId };
}

/**
 * Resolves the parked hero id that is still in effect at `now`.
 *
 * Returns the parked id only when the slot's day matches the current day key
 * (same-day, so a same-day reload still parks). Returns null on a new day (the
 * window has lapsed), on a null slot, or on a slot with no parked id.
 */
export function resolveParkedId(slot: ParkedHeroSlot | null, now: Date): string | null {
  if (slot === null) return null;
  if (slot.parkedId === null) return null;
  if (slot.day !== dayKey(now)) return null;
  return slot.parkedId;
}

/**
 * Applies the re-roll to a ranked list: when an in-effect parked id matches an
 * item, that item is removed from the surfaced order so ranked[1] becomes the
 * hero (1.6). The input array is not mutated.
 *
 * No-ops (returns a copy in the original order) when there is no in-effect
 * parked id, the parked id is from a previous day, or the parked id is no longer
 * present in the ranked list.
 */
export function applyReroll(
  ranked: DashboardItem[],
  slot: ParkedHeroSlot | null,
  now: Date,
): DashboardItem[] {
  const parkedId = resolveParkedId(slot, now);
  if (parkedId === null) return [...ranked];
  return ranked.filter((item) => item.id !== parkedId);
}
