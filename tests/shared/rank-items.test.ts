/**
 * M6: Tests for the tiered hero-ranking engine, src/shared/rank-items.ts.
 *
 * Covers the PLAN.md 5.6 Phase-2 subset (the falsifiable DoD for M6):
 *   - Tier 1 beats Tier 2 beats Tier 3 beats Tier 4.
 *   - The BOTH-CONDITIONS card (time-sensitive within 5 days AND dodAlmost) is
 *     the hero AS the Tier-1 time-sensitive branch, so a dodAlmost-first impl
 *     would fail.
 *   - idleNeedsYou beats a green needs-you card.
 *   - requiresResponse boosts within Tier 2, but a non-requiresResponse long-idle
 *     tab still ranks above a Tier 3 item.
 *   - dodAlmost (including a single-item DoD, total:1) beats a generic Tier 4.
 *   - a sub-floor idle tab is NOT in Tier 2 (idleNeedsYou:false).
 *   - Tier-4 recency direction matches the producer (newest gitAgeDays first).
 *   - an avoidance-slug card outranks a non-avoidance card when all prior Tier-4
 *     keys tie (5.4 step 4).
 *   - identical inputs produce identical output (purity / stability).
 *   - the id tie-break resolves two otherwise-equal items.
 *
 * The clock is injected (the `now` param), never Date.now in the pure fn.
 */

import { describe, it, expect } from 'vitest';
import { rankItems } from '@shared/rank-items';
import type { DashboardItem } from '@shared/program-board-state';

// A fixed clock for every test. Producer dates are plain "YYYY-MM-DD".
const NOW = new Date(2026, 5, 21, 9, 0, 0); // 2026-06-21 09:00 local

/** Builds a minimal DashboardItem; every field is overridable. */
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
    horizon: null,
    avoidanceCategory: null,
    actions: {},
    ...overrides,
  };
}

/** A Tier-1 time-sensitive program card (due within 5 days). */
function tier1(overrides: Partial<DashboardItem> = {}): DashboardItem {
  return makeItem({
    id: 'pb:t1',
    slug: 't1',
    needsYou: true,
    timeSensitive: '2026-06-23', // 2 days out
    ...overrides,
  });
}

/** A Tier-2 live waiting tab past the idle floor. */
function tier2(overrides: Partial<DashboardItem> = {}): DashboardItem {
  return makeItem({
    id: 'tab:t2',
    slug: 't2',
    source: 'live-tab',
    needsYou: true,
    idleNeedsYou: true,
    ...overrides,
  });
}

/** A Tier-3 dodAlmost program card. */
function tier3(overrides: Partial<DashboardItem> = {}): DashboardItem {
  return makeItem({
    id: 'pb:t3',
    slug: 't3',
    needsYou: true,
    dodMet: 2,
    dodTotal: 3,
    dodAlmost: true,
    dodGap: 'last step',
    ...overrides,
  });
}

/** A Tier-4 generic needs-you program card. */
function tier4(overrides: Partial<DashboardItem> = {}): DashboardItem {
  return makeItem({
    id: 'pb:t4',
    slug: 't4',
    needsYou: true,
    ...overrides,
  });
}

describe('rankItems -- tier precedence (5.3 / 5.6)', () => {
  it('Tier 1 beats Tier 2 beats Tier 3 beats Tier 4', () => {
    const items = [tier4(), tier3(), tier2(), tier1()];
    const ranked = rankItems(items, NOW);
    expect(ranked.map((i) => i.id)).toEqual(['pb:t1', 'tab:t2', 'pb:t3', 'pb:t4']);
  });

  it('Tier 2 beats Tier 3 beats Tier 4 when no Tier 1 present', () => {
    const ranked = rankItems([tier4(), tier3(), tier2()], NOW);
    expect(ranked[0].id).toBe('tab:t2');
    expect(ranked[1].id).toBe('pb:t3');
    expect(ranked[2].id).toBe('pb:t4');
  });

  it('the BOTH-CONDITIONS card (time-sensitive within 5d AND dodAlmost) is the Tier-1 hero', () => {
    // One card that is both. A dodAlmost-first impl would route it to Tier 3 and
    // place the pure Tier-2 tab above it; the time-sensitive branch must win.
    const both = makeItem({
      id: 'pb:both',
      slug: 'both',
      needsYou: true,
      timeSensitive: '2026-06-22', // 1 day out, within window
      dodMet: 0,
      dodTotal: 1,
      dodAlmost: true,
      dodGap: 'ship it',
    });
    const ranked = rankItems([tier2(), both], NOW);
    expect(ranked[0].id).toBe('pb:both');
  });
});

describe('rankItems -- Tier 2 spine (5.2 / 5.6)', () => {
  it('idleNeedsYou beats a green needs-you card', () => {
    const greenNeedsYou = tier4({ id: 'pb:green', slug: 'green', ageColor: 'green' });
    const idle = tier2({ id: 'tab:idle', slug: 'idle' });
    const ranked = rankItems([greenNeedsYou, idle], NOW);
    expect(ranked[0].id).toBe('tab:idle');
  });

  it('requiresResponse boosts within Tier 2', () => {
    const plain = tier2({ id: 'tab:a', slug: 'a', requiresResponse: false });
    const responding = tier2({ id: 'tab:b', slug: 'b', requiresResponse: true });
    const ranked = rankItems([plain, responding], NOW);
    expect(ranked[0].id).toBe('tab:b');
  });

  it('a non-requiresResponse long-idle tab still ranks above a Tier 3 item', () => {
    const idleNoResp = tier2({ id: 'tab:idle', slug: 'idle', requiresResponse: false });
    const almost = tier3({ id: 'pb:almost', slug: 'almost' });
    const ranked = rankItems([almost, idleNoResp], NOW);
    expect(ranked[0].id).toBe('tab:idle');
    expect(ranked[1].id).toBe('pb:almost');
  });

  it('a sub-floor idle tab is NOT in Tier 2 (idleNeedsYou:false)', () => {
    // A sub-floor tab arrives with idleNeedsYou:false (the mapper gates the
    // floor). It must NOT outrank a Tier 3 dodAlmost card.
    const subFloor = makeItem({
      id: 'tab:sub',
      slug: 'sub',
      source: 'live-tab',
      needsYou: false,
      idleNeedsYou: false,
    });
    const almost = tier3({ id: 'pb:almost', slug: 'almost' });
    const ranked = rankItems([subFloor, almost], NOW);
    expect(ranked[0].id).toBe('pb:almost');
    // The sub-floor tab is not hero-eligible needs-you, so it sinks to Tier 6.
    expect(ranked[0].id).not.toBe('tab:sub');
  });
});

describe('rankItems -- Tier 3 (5.3 / 5.6)', () => {
  it('dodAlmost beats a generic Tier 4 card', () => {
    const almost = tier3({ id: 'pb:almost', slug: 'almost' });
    const generic = tier4({ id: 'pb:generic', slug: 'generic' });
    const ranked = rankItems([generic, almost], NOW);
    expect(ranked[0].id).toBe('pb:almost');
  });

  it('a single-item dodAlmost (total:1) beats a generic Tier 4 card', () => {
    const single = tier3({
      id: 'pb:single',
      slug: 'single',
      dodMet: 0,
      dodTotal: 1,
      dodAlmost: true,
      dodGap: 'one and done',
    });
    const generic = tier4({ id: 'pb:generic', slug: 'generic' });
    const ranked = rankItems([generic, single], NOW);
    expect(ranked[0].id).toBe('pb:single');
  });
});

describe('rankItems -- Tier 4 ordering (5.4 / 5.6)', () => {
  it('hotter ageColor sorts first within Tier 4', () => {
    const green = tier4({ id: 'pb:green', slug: 'green', ageColor: 'green' });
    const red = tier4({ id: 'pb:red', slug: 'red', ageColor: 'red' });
    const orange = tier4({ id: 'pb:orange', slug: 'orange', ageColor: 'orange' });
    const ranked = rankItems([green, orange, red], NOW);
    expect(ranked.map((i) => i.id)).toEqual(['pb:red', 'pb:orange', 'pb:green']);
  });

  it('Tier-4 recency direction matches the producer (newest gitAgeDays first)', () => {
    // Same ageColor, same requiresResponse: smaller gitAgeDays (newer commit)
    // sorts first, mirroring the producer (git.age_days ascending).
    const old = tier4({ id: 'pb:old', slug: 'old', gitAgeDays: 10 });
    const fresh = tier4({ id: 'pb:fresh', slug: 'fresh', gitAgeDays: 1 });
    const ranked = rankItems([old, fresh], NOW);
    expect(ranked[0].id).toBe('pb:fresh');
    expect(ranked[1].id).toBe('pb:old');
  });

  it('an avoidance-slug card outranks a non-avoidance card when all prior Tier-4 keys tie (5.4 step 4)', () => {
    // Same ageColor, same requiresResponse, same gitAgeDays: the avoidance
    // slug/name match breaks the tie ABOVE the non-avoidance card. The plain
    // card has a lexically-smaller id so an id-only tie-break would pick it,
    // proving the avoidance key fires before id.
    const plain = tier4({ id: 'pb:aaa', slug: 'aaa', ageColor: 'orange', gitAgeDays: 5 });
    const avoidance = tier4({
      id: 'pb:zzz',
      slug: 'marketing-roi',
      ageColor: 'orange',
      gitAgeDays: 5,
    });
    const ranked = rankItems([plain, avoidance], NOW);
    expect(ranked[0].id).toBe('pb:zzz');
    expect(ranked[1].id).toBe('pb:aaa');
  });

  it('the avoidance tie-break does not re-order cards that differ on a prior key', () => {
    // The avoidance card is OLDER (orange) and the plain card is HOTTER (red).
    // The hotter ageColor (prior key) wins; avoidance does not jump it.
    const hotterPlain = tier4({ id: 'pb:plain', slug: 'plain', ageColor: 'red', gitAgeDays: 5 });
    const avoidance = tier4({
      id: 'pb:avoid',
      slug: 'marketing-roi',
      ageColor: 'orange',
      gitAgeDays: 5,
    });
    const ranked = rankItems([avoidance, hotterPlain], NOW);
    expect(ranked[0].id).toBe('pb:plain');
  });
});

describe('rankItems -- stability and determinism (5.5 / 5.6)', () => {
  it('identical inputs produce identical output', () => {
    const items = [tier4({ id: 'pb:b', slug: 'b' }), tier1(), tier3(), tier2()];
    const a = rankItems(items, NOW).map((i) => i.id);
    const b = rankItems(items, NOW).map((i) => i.id);
    expect(a).toEqual(b);
  });

  it('the id tie-break resolves two otherwise-equal items', () => {
    // Two identical Tier-4 cards differing only by id: lexical id order decides.
    const z = tier4({ id: 'pb:zebra', slug: 'one', ageColor: 'yellow', gitAgeDays: 3 });
    const a = tier4({ id: 'pb:apple', slug: 'two', ageColor: 'yellow', gitAgeDays: 3 });
    const ranked = rankItems([z, a], NOW);
    expect(ranked[0].id).toBe('pb:apple');
    expect(ranked[1].id).toBe('pb:zebra');
  });

  it('does not mutate the input array', () => {
    const items = [tier4(), tier1(), tier2()];
    const before = items.map((i) => i.id);
    rankItems(items, NOW);
    expect(items.map((i) => i.id)).toEqual(before);
  });

  it('a time-sensitive card OUTSIDE the 5-day window is not Tier 1', () => {
    const far = tier1({ id: 'pb:far', slug: 'far', timeSensitive: '2026-07-30' });
    const idle = tier2({ id: 'tab:idle', slug: 'idle' });
    const ranked = rankItems([far, idle], NOW);
    // The far card drops to Tier 4 (still needs-you); the live tab leads.
    expect(ranked[0].id).toBe('tab:idle');
  });

  it('paused needs-you cards are not hero-eligible (sink below active needs-you)', () => {
    const paused = tier4({ id: 'pb:paused', slug: 'paused', paused: true, ageColor: 'red' });
    const active = tier4({ id: 'pb:active', slug: 'active', paused: false, ageColor: 'green' });
    const ranked = rankItems([paused, active], NOW);
    expect(ranked[0].id).toBe('pb:active');
  });
});
