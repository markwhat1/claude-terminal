/**
 * The tiered hero-ranking engine (PLAN.md Section 5).
 *
 * Pure: no DOM, no Electron, no Date.now. The clock arrives as the `now`
 * argument so every ordering is deterministic and unit-testable. Importable by
 * renderer, main, and the web client.
 *
 * rankItems(items, now) takes the unified DashboardItem set (program-board cards
 * plus past-floor live tabs, already mapped) and returns an ordered copy. The
 * hero is ranked[0] (subject to the per-day pinned/parked-hero-id and the re-roll
 * applied ON TOP in the renderer, see hero-reroll.ts). The input array is never
 * mutated.
 *
 * Tiers (highest first, 5.3):
 *   Tier 1: time-sensitive due now or soon (within the 5-day producer window).
 *           A hard external deadline beats everything.
 *   Tier 2: live session waiting on you, past the idle-age floor (idleNeedsYou).
 *   Tier 3: the 90%-killer (dodAlmost).
 *   Tier 4: generic needs-you program cards (not paused).
 *   Tier 6: everything else (not hero-eligible).
 *
 * The BOTH-CONDITIONS rule (5.6): a card that is BOTH time-sensitive within the
 * window AND dodAlmost is Tier 1, not Tier 3. The window check runs before the
 * dodAlmost check in classifyTier, so a dodAlmost-first implementation fails.
 *
 * Tie-breaks within a tier (5.4, applied in order): hotter ageColor, then
 * requiresResponse, then gitAgeDays ascending (newest-committed first, mirroring
 * the producer), then the read-only avoidance slug/name tie-break (5.4 step 4),
 * then stable id lexical order (5.5 anti-flicker).
 */

import type { DashboardItem } from './program-board-state';

// The producer's needs-you window for time-sensitive cards, in days (4.4).
const TIME_SENSITIVE_WINDOW_DAYS = 5;

/** Tier labels, lower number = higher priority. Tier 5 is built with its
 *  producer (M12/M13); only the live-producer tiers exist here. */
type TierNumber = 1 | 2 | 3 | 4 | 6;

// ---------------------------------------------------------------------------
// Read-only avoidance slug/name tie-break key set (5.4 step 4)
// ---------------------------------------------------------------------------

/**
 * The avoidance keyword set for the Tier-4 tie-break ONLY (5.4 step 4).
 *
 * This is a single slug/name keyword check. It is NOT the M13 classifier (which
 * reads blocked_on / needs_you text and pins by category). It never reads
 * blocked_on, is never logged, and never reaches composeClaudeQuery. The
 * keywords mirror the Phase-2/3 avoidance-category vocabulary (the JSON schema
 * in PLAN-PHASE-2-3.md: financial, documentation, delegation, completing-the-loop,
 * health, marketing) plus the one known live avoidance slug (marketing-roi).
 */
const AVOIDANCE_KEYWORDS: readonly string[] = [
  'marketing',
  'financial',
  'documentation',
  'delegation',
  'completing-the-loop',
  'health',
];

/**
 * Returns true when an item's slug or name matches the avoidance keyword set.
 *
 * Read-only: matches against slug and title (the human-readable name) only,
 * lowercased substring. Never touches detail/blocked_on, never logs.
 */
function isAvoidanceItem(item: DashboardItem): boolean {
  const slug = item.slug.toLowerCase();
  const name = item.title.toLowerCase();
  return AVOIDANCE_KEYWORDS.some((kw) => slug.includes(kw) || name.includes(kw));
}

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

/** Parses a plain "YYYY-MM-DD" producer date and returns whole days until it. */
function daysUntil(dateStr: string, now: Date): number | null {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const target = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
  );
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * Assigns a tier to an item (5.3). The time-sensitive window is checked BEFORE
 * dodAlmost so the BOTH-CONDITIONS card lands in Tier 1 (5.6).
 *
 * Paused cards are never hero-eligible (1.11 / 4.4): a paused needs-you card
 * drops to Tier 6 rather than Tier 4, so a deliberately parked item cannot be
 * the hero.
 */
function classifyTier(item: DashboardItem, now: Date): TierNumber {
  if (item.paused) return 6;

  // Tier 1: a hard external deadline within the producer window.
  if (item.timeSensitive !== null) {
    const d = daysUntil(item.timeSensitive, now);
    if (d !== null && d <= TIME_SENSITIVE_WINDOW_DAYS) return 1;
  }

  // Tier 2: live session waiting on you, past the idle-age floor.
  if (item.idleNeedsYou) return 2;

  // Tier 3: the 90%-killer.
  if (item.dodAlmost) return 3;

  // Tier 4: generic needs-you program card.
  if (item.needsYou) return 4;

  // Tier 6: not hero-eligible.
  return 6;
}

// ---------------------------------------------------------------------------
// Within-tier comparators
// ---------------------------------------------------------------------------

const AGE_COLOR_RANK: Record<DashboardItem['ageColor'], number> = {
  red: 3,
  orange: 2,
  yellow: 1,
  green: 0,
};

/** Final deterministic tie-break: stable id lexical order (5.4 step 5 / 5.5). */
function byId(a: DashboardItem, b: DashboardItem): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Tier-1 ordering: soonest deadline first (the hardest external constraint),
 * then the shared tie-breaks, then id.
 */
function compareTier1(a: DashboardItem, b: DashboardItem, now: Date): number {
  const da = a.timeSensitive ? daysUntil(a.timeSensitive, now) ?? Infinity : Infinity;
  const db = b.timeSensitive ? daysUntil(b.timeSensitive, now) ?? Infinity : Infinity;
  if (da !== db) return da - db;
  return byId(a, b);
}

/**
 * Tier-2 ordering: requiresResponse before non-requiresResponse (5.2 overlay
 * boost), then id. The "longer-waiting first" sub-key (5.2) is not applied here
 * because DashboardItem does not carry waitingSince after mapping; the waiting
 * duration lives on the live Tab in the subordinate strip, not on the ranked
 * item. The M6 surface (5.6) tests only the requiresResponse boost.
 */
function compareTier2(a: DashboardItem, b: DashboardItem): number {
  if (a.requiresResponse !== b.requiresResponse) {
    return a.requiresResponse ? -1 : 1;
  }
  return byId(a, b);
}

/** Tier-3 ordering: fewest remaining steps first, then the shared keys, then id. */
function compareTier3(a: DashboardItem, b: DashboardItem): number {
  const ra = a.dodTotal - a.dodMet;
  const rb = b.dodTotal - b.dodMet;
  if (ra !== rb) return ra - rb;
  return compareTier4(a, b);
}

/**
 * Tier-4 ordering (5.4): hotter ageColor, then requiresResponse, then gitAgeDays
 * ascending (newest-committed first, mirroring the producer's
 * (not needs_you, git.age_days) ascending), then the read-only avoidance
 * slug/name tie-break (step 4), then id (step 5).
 */
function compareTier4(a: DashboardItem, b: DashboardItem): number {
  // Step 1: hotter ageColor.
  const ageDelta = AGE_COLOR_RANK[b.ageColor] - AGE_COLOR_RANK[a.ageColor];
  if (ageDelta !== 0) return ageDelta;

  // Step 2: requiresResponse before non-requiresResponse.
  if (a.requiresResponse !== b.requiresResponse) {
    return a.requiresResponse ? -1 : 1;
  }

  // Step 3: gitAgeDays ascending (newest first). Null ages sort last.
  const ga = a.gitAgeDays ?? Infinity;
  const gb = b.gitAgeDays ?? Infinity;
  if (ga !== gb) return ga - gb;

  // Step 4: read-only avoidance slug/name tie-break. An avoidance item sorts
  // ABOVE a non-avoidance card when all prior keys tie.
  const avoidA = isAvoidanceItem(a);
  const avoidB = isAvoidanceItem(b);
  if (avoidA !== avoidB) return avoidA ? -1 : 1;

  // Step 5: stable id lexical order.
  return byId(a, b);
}

function compareWithinTier(
  tier: TierNumber,
  a: DashboardItem,
  b: DashboardItem,
  now: Date,
): number {
  switch (tier) {
    case 1:
      return compareTier1(a, b, now);
    case 2:
      return compareTier2(a, b);
    case 3:
      return compareTier3(a, b);
    case 4:
      return compareTier4(a, b);
    case 6:
      return byId(a, b);
  }
}

// ---------------------------------------------------------------------------
// rankItems
// ---------------------------------------------------------------------------

/**
 * Ranks the unified DashboardItem set into hero-first order (5.3 / 5.4 / 5.5).
 *
 * Pure and deterministic for a given (items, now): identical inputs yield
 * identical output, and the id tie-break means a re-poll that changes no input
 * does not reorder the hero (anti-flicker, 5.5). The input array is not mutated.
 */
export function rankItems(items: DashboardItem[], now: Date): DashboardItem[] {
  const tierOf = new Map<DashboardItem, TierNumber>();
  for (const item of items) {
    tierOf.set(item, classifyTier(item, now));
  }

  // Stable copy, sorted by tier then within-tier comparator.
  return [...items].sort((a, b) => {
    const ta = tierOf.get(a) as TierNumber;
    const tb = tierOf.get(b) as TierNumber;
    if (ta !== tb) return ta - tb;
    return compareWithinTier(ta, a, b, now);
  });
}
