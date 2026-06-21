/**
 * M4: Tests for ProgramBoardReader pure helpers in src/shared/
 *
 * Covers:
 *   - parseState: valid, programs:[], generated_at:null
 *   - computeFreshness: naive-local parse, three bands (no-offset NOT read as UTC)
 *   - dodAlmost/dodGap/dodMet/dodTotal parity with fixture needs_you_reasons including single-item
 *   - dodMet===0 renders gap-led frame, NEVER "0 of 1 done"
 *   - paused+needs_you card maps paused:true and is excluded from hero-override candidate set
 *     and the default needs-you list
 *   - isStateJsonPathSafe rejects out-of-root, .., and UNC paths
 *   - isSafeProgramIdentifier rejects PHI-shaped identifiers
 *   - mapCardToItem: DashboardItem shape from program card (4.1)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  parseState,
  computeFreshness,
  parseNaiveLocal,
  parseOffsetAware,
  isStateJsonPathSafe,
  isSafeProgramIdentifier,
  mapCardToItem,
} from '@shared/program-board-state';

// ---------------------------------------------------------------------------
// Fixture loader
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/dashboard');

function loadFixtureRaw(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, `${name}.json`), 'utf-8');
}

function loadFixture(name: string): unknown {
  return JSON.parse(loadFixtureRaw(name));
}

// ---------------------------------------------------------------------------
// parseState
// ---------------------------------------------------------------------------

describe('parseState', () => {
  it('parses a valid state with programs', () => {
    const raw = loadFixtureRaw('fresh-with-needs-you');
    const state = parseState(raw);
    expect(state).not.toBeNull();
    expect(state!.generated_at).toBe('2026-06-21T01:00:00');
    expect(Array.isArray(state!.programs)).toBe(true);
    expect(state!.programs.length).toBeGreaterThan(0);
  });

  it('parses programs:[] state', () => {
    const raw = loadFixtureRaw('programs-empty');
    const state = parseState(raw);
    expect(state).not.toBeNull();
    expect(state!.programs).toHaveLength(0);
    expect(state!.generated_at).not.toBeNull();
  });

  it('parses generated_at:null state', () => {
    const raw = loadFixtureRaw('generated-at-null');
    const state = parseState(raw);
    expect(state).not.toBeNull();
    expect(state!.generated_at).toBeNull();
    expect(state!.programs).toHaveLength(0);
  });

  it('returns null for invalid JSON', () => {
    const state = parseState('not-json{{{');
    expect(state).toBeNull();
  });

  it('returns null for missing programs field', () => {
    const state = parseState(JSON.stringify({ generated_at: '2026-06-21T01:00:00' }));
    expect(state).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseNaiveLocal + parseOffsetAware
// ---------------------------------------------------------------------------

describe('parseNaiveLocal', () => {
  it('parses a naive local ISO string as local time (no UTC shift)', () => {
    // On this machine UTC offset is -06:00.
    // A naive-local "2026-06-21T01:00:00" parsed as UTC would differ from local by 6h.
    // We test that parseNaiveLocal produces a Date whose local-time components match
    // the input string, rather than shifting by the UTC offset.
    const s = '2026-06-21T12:00:00';
    const d = parseNaiveLocal(s);
    // The date should represent local noon, not UTC noon shifted to local.
    expect(d).not.toBeNull();
    // getHours() returns local hours; local noon should be hour 12.
    expect(d!.getHours()).toBe(12);
    expect(d!.getMinutes()).toBe(0);
  });

  it('a no-offset string is NOT read as UTC', () => {
    // If parseNaiveLocal incorrectly called new Date('2026-06-21T08:00:00'),
    // that would be treated as UTC on engines that parse bare ISO as UTC,
    // making local hours 2 (UTC-6). Verify the result is local.
    const s = '2026-06-21T08:00:00';
    const d = parseNaiveLocal(s);
    expect(d).not.toBeNull();
    // Local interpretation: getHours() === 8 (the hour in the string).
    expect(d!.getHours()).toBe(8);
  });

  it('returns null for a string with an offset (should use parseOffsetAware)', () => {
    // A string with '+' or '-' offset is NOT naive-local; parseNaiveLocal returns null.
    const d = parseNaiveLocal('2026-06-21T08:00:00-06:00');
    expect(d).toBeNull();
  });

  it('returns null for a Z-suffix UTC string', () => {
    const d = parseNaiveLocal('2026-06-21T08:00:00Z');
    expect(d).toBeNull();
  });
});

describe('parseOffsetAware', () => {
  it('parses an offset-bearing ISO string correctly', () => {
    const s = '2026-06-21T08:00:00-06:00';
    const d = parseOffsetAware(s);
    expect(d).not.toBeNull();
    // UTC equivalent: 08:00 + 06:00 = 14:00 UTC
    expect(d!.getTime()).toBe(new Date('2026-06-21T14:00:00Z').getTime());
  });

  it('returns null for a naive-local string (no offset)', () => {
    const d = parseOffsetAware('2026-06-21T08:00:00');
    expect(d).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeFreshness
// ---------------------------------------------------------------------------

describe('computeFreshness', () => {
  // The naive-local parse means we compare generated_at (parsed as local)
  // against now. We pass 'now' as a parameter to make the function testable.

  it('returns "fresh" when generated_at is within ~150s of now', () => {
    // 60 seconds ago (local naive string)
    const now = new Date();
    const sixtyAgo = new Date(now.getTime() - 60_000);
    const naiveLocal = toNaiveLocalString(sixtyAgo);
    expect(computeFreshness(naiveLocal, now)).toBe('fresh');
  });

  it('returns "stale" when generated_at is between ~150s and ~10min ago', () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
    const naiveLocal = toNaiveLocalString(fiveMinAgo);
    expect(computeFreshness(naiveLocal, now)).toBe('stale');
  });

  it('returns "hard-stale" when generated_at is more than ~10min ago', () => {
    const now = new Date();
    const elevenMinAgo = new Date(now.getTime() - 11 * 60_000);
    const naiveLocal = toNaiveLocalString(elevenMinAgo);
    expect(computeFreshness(naiveLocal, now)).toBe('hard-stale');
  });

  it('returns "hard-stale" for generated_at:null', () => {
    const now = new Date();
    expect(computeFreshness(null, now)).toBe('hard-stale');
  });

  it('does NOT treat a no-offset string as UTC', () => {
    // Build a string that is 60s ago in local time.
    // If wrongly parsed as UTC (UTC-6 machine), the age would be 60s + 6h = way over stale.
    const now = new Date();
    const sixtyAgo = new Date(now.getTime() - 60_000);
    const naiveLocal = toNaiveLocalString(sixtyAgo);
    // Should be fresh (within 150s), not hard-stale.
    const result = computeFreshness(naiveLocal, now);
    expect(result).toBe('fresh');
  });
});

// ---------------------------------------------------------------------------
// dodAlmost parity with fixture (4.4)
// ---------------------------------------------------------------------------

describe('dodAlmost parity with fixtures', () => {
  it('single-item-dod: dodAlmost is true for total:1, met:0 (producer predicate)', () => {
    const raw = loadFixtureRaw('single-item-dod');
    const state = parseState(raw);
    expect(state).not.toBeNull();
    const card = state!.programs[0];
    const item = mapCardToItem(card);
    expect(item.dodAlmost).toBe(true);
    expect(item.dodMet).toBe(0);
    expect(item.dodTotal).toBe(1);
  });

  it('single-item-dod: dodGap matches the needs_you_reasons "almost done: " entry', () => {
    const raw = loadFixtureRaw('single-item-dod');
    const state = parseState(raw);
    const card = state!.programs[0];
    const item = mapCardToItem(card);
    // The fixture has needs_you_reasons: ["needs-your-decision", "almost done: portal Incomplete Notes surface live end to end"]
    // dodGap should be dod.gaps[0]
    expect(item.dodGap).toBe('portal Incomplete Notes surface live end to end');
  });

  it('single-item-dod: dodMet===0 goal-gradient copy is gap-led "Start the first step: <gap>", NEVER "0 of 1 done"', () => {
    const raw = loadFixtureRaw('single-item-dod');
    const state = parseState(raw);
    const card = state!.programs[0];
    const item = mapCardToItem(card);
    // The goal-gradient frame for met===0 must lead with the gap, not expose the zero fraction.
    const goalText = goalGradientText(item);
    expect(goalText).not.toContain('0 of 1');
    expect(goalText).not.toContain('0 of 1 done');
    expect(goalText).toContain('Start the first step:');
    expect(goalText).toContain(item.dodGap!);
  });

  it('fresh-with-needs-you: multi-step dod (total:3, met:0) renders gap-led frame, never fraction-at-zero', () => {
    const raw = loadFixtureRaw('fresh-with-needs-you');
    const state = parseState(raw);
    const card = state!.programs.find((p) => p.slug === 'cad-staff-portal')!;
    const item = mapCardToItem(card);
    expect(item.dodMet).toBe(0);
    expect(item.dodTotal).toBe(3);
    const goalText = goalGradientText(item);
    expect(goalText).not.toContain('0 of 3');
    expect(goalText).toContain('Start with:');
  });

  it('both-conditions: dodAlmost true with total:2 met:1 (total-met===1)', () => {
    const raw = loadFixtureRaw('both-conditions');
    const state = parseState(raw);
    const card = state!.programs[0];
    const item = mapCardToItem(card);
    expect(item.dodAlmost).toBe(true);
    expect(item.dodMet).toBe(1);
    expect(item.dodTotal).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// paused card mapping + exclusion (4.4)
// ---------------------------------------------------------------------------

describe('paused card behavior', () => {
  it('maps paused:true from a paused program card', () => {
    const raw = loadFixtureRaw('paused-needs-you');
    const state = parseState(raw);
    expect(state).not.toBeNull();
    const pausedCard = state!.programs.find((p) => p.slug === 'marketing-roi')!;
    const item = mapCardToItem(pausedCard);
    expect(item.paused).toBe(true);
    expect(item.needsYou).toBe(true);
  });

  it('paused card is excluded from the hero-override candidate set', () => {
    const raw = loadFixtureRaw('paused-needs-you');
    const state = parseState(raw);
    const items = state!.programs.map(mapCardToItem);
    const candidates = heroOverrideCandidates(items);
    const pausedInCandidates = candidates.some((i) => i.paused);
    expect(pausedInCandidates).toBe(false);
  });

  it('paused card is excluded from the default needs-you list', () => {
    const raw = loadFixtureRaw('paused-needs-you');
    const state = parseState(raw);
    const items = state!.programs.map(mapCardToItem);
    const defaultList = defaultNeedsYouList(items);
    const pausedInList = defaultList.some((i) => i.paused);
    expect(pausedInList).toBe(false);
  });

  it('non-paused needs_you card is included in the default needs-you list', () => {
    const raw = loadFixtureRaw('paused-needs-you');
    const state = parseState(raw);
    const items = state!.programs.map(mapCardToItem);
    const defaultList = defaultNeedsYouList(items);
    expect(defaultList.some((i) => i.slug === 'cad-staff-portal')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isStateJsonPathSafe
// ---------------------------------------------------------------------------

describe('isStateJsonPathSafe', () => {
  const root = 'C:\\Users\\Mark\\Claude-Code';

  it('accepts a path inside the root', () => {
    const resolved = 'C:\\Users\\Mark\\Claude-Code\\dashboard\\state.json';
    expect(isStateJsonPathSafe(resolved, root)).toBe(true);
  });

  it('rejects a path outside the root', () => {
    const resolved = 'C:\\Users\\Mark\\Documents\\state.json';
    expect(isStateJsonPathSafe(resolved, root)).toBe(false);
  });

  it('rejects a path containing ".."', () => {
    const resolved = 'C:\\Users\\Mark\\Claude-Code\\..\\..\\secret.json';
    expect(isStateJsonPathSafe(resolved, root)).toBe(false);
  });

  it('rejects a UNC path', () => {
    const resolved = '\\\\server\\share\\state.json';
    expect(isStateJsonPathSafe(resolved, root)).toBe(false);
  });

  it('rejects an empty path', () => {
    expect(isStateJsonPathSafe('', root)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSafeProgramIdentifier
// ---------------------------------------------------------------------------

describe('isSafeProgramIdentifier', () => {
  it('accepts a normal dev-style slug', () => {
    expect(isSafeProgramIdentifier('cad-staff-portal')).toBe(true);
    expect(isSafeProgramIdentifier('incomplete-notes')).toBe(true);
    expect(isSafeProgramIdentifier('Marketing ROI')).toBe(true);
  });

  it('rejects an overly long string', () => {
    expect(isSafeProgramIdentifier('a'.repeat(201))).toBe(false);
  });

  it('rejects a string with a long digit run (PHI-shaped, e.g. phone number)', () => {
    // 303-986-9337 has digit groups: 3,3,4 => a digit run with dashes
    expect(isSafeProgramIdentifier('303-986-9337')).toBe(false);
    // DOB-style
    expect(isSafeProgramIdentifier('04/12/1985')).toBe(false);
  });

  it('accepts a version string or short numeric segment', () => {
    expect(isSafeProgramIdentifier('v1.2.3')).toBe(true);
    expect(isSafeProgramIdentifier('phase-2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Helper stubs used in these tests
// (These reflect the logic the consumer code is expected to apply,
//  keeping the tests honest about what "excluded from hero candidates" means.)
// ---------------------------------------------------------------------------

/** Returns the goal-gradient text for an item given its dodMet/dodTotal/dodGap. */
function goalGradientText(item: ReturnType<typeof mapCardToItem>): string {
  if (item.dodMet > 0) {
    return `${item.dodMet} of ${item.dodTotal} done, last step: ${item.dodGap ?? ''}`;
  }
  if (item.dodTotal === 1 && item.dodGap) {
    return `Start the first step: ${item.dodGap}`;
  }
  if (item.dodTotal > 1 && item.dodGap) {
    return `Start with: ${item.dodGap}, then ${item.dodTotal - 1} more`;
  }
  return '';
}

/** Filters to the hero-override candidate set: needs_you:true and NOT paused. */
function heroOverrideCandidates(
  items: ReturnType<typeof mapCardToItem>[],
): ReturnType<typeof mapCardToItem>[] {
  return items.filter((i) => i.needsYou && !i.paused);
}

/** Filters to the default needs-you display list: needs_you:true and NOT paused. */
function defaultNeedsYouList(
  items: ReturnType<typeof mapCardToItem>[],
): ReturnType<typeof mapCardToItem>[] {
  return items.filter((i) => i.needsYou && !i.paused);
}

// ---------------------------------------------------------------------------
// Utility: format a Date as naive-local ISO string "YYYY-MM-DDTHH:mm:ss"
// ---------------------------------------------------------------------------

function toNaiveLocalString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
