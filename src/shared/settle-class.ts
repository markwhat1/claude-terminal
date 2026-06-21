/**
 * settle-class: the pure settle-tier classifier for Home dashboard cards
 * (M8b-i, 1.5 / M13).
 *
 * Extracted from HomeView so production and tests share ONE implementation.
 * It has no DOM or Electron dependency: callers (HomeView, tests) read
 * prefers-reduced-motion themselves and pass the boolean in. That keeps this
 * module pure and trivially unit-testable, and lets HomeView call its existing
 * matchMedia helper at render time.
 *
 * Three tiers (highest precedence first):
 *   settle-avoidance: M13 overlay, the card had an avoidance category (the
 *                     louder, still-motion-safe beat).
 *   settle-decided:   Phase-1 louder tier, a decided-and-worked close.
 *   settle-ordinary:  Phase-1 ordinary settle.
 *
 * Returns null when there is no close record for the id, or when reduced motion
 * is active (the close-count still ticks; only the animation is suppressed).
 */
import type { ClosedRecord } from './program-board-state';

export type SettleClass =
  | 'settle-ordinary'
  | 'settle-decided'
  | 'settle-avoidance'
  | null;

/**
 * Classify the settle tier for a single item id against the recent-close list.
 *
 * @param id            The dashboard item id to look up.
 * @param recentCloses  The recent-close records (the same list HomeView holds).
 * @param reducedMotion True when prefers-reduced-motion is active; suppresses
 *                      the animation tier (returns null).
 */
export function settleClassForId(
  id: string,
  recentCloses: ClosedRecord[],
  reducedMotion: boolean,
): SettleClass {
  const rec = recentCloses.find((r) => r.id === id);
  if (!rec) return null;
  if (reducedMotion) return null;
  if (rec.avoidanceClose === true) return 'settle-avoidance';
  return rec.decidedAndWorked ? 'settle-decided' : 'settle-ordinary';
}
