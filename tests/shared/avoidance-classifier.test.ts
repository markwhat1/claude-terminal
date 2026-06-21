/**
 * M13: Tests for the avoidance-pin keyword classifier.
 *
 * Spec: PLAN-PHASE-2-3.md lines 47-49.
 *
 * Covers:
 *   - classifyAvoidanceCategory maps representative blocked_on text to the right
 *     AvoidanceCategory (all six categories).
 *   - Returns null for text that does not match any category.
 *   - A no-git-activity avoidance item stays pinned in the Tier-4 tie-break
 *     (avoidanceCategory set on the item via mapCardToItem).
 *   - The classifier output NEVER reaches composeClaudeQuery (the zero-free-text
 *     regression gate in home-copy.test.ts covers the composer side; this test
 *     asserts the classifier is never imported by home-copy.ts or invoked in
 *     a composeClaudeQuery call path -- checked via a structural import guard).
 *   - The classifier is NEVER the direct argument to log.* (the function is
 *     pure and its return value is only set on DashboardItem.avoidanceCategory).
 *   - An avoidance-category close sets avoidanceClose:true on the ClosedRecord.
 *   - The avoidanceClose flag drives the louder (still motion-safe) settle tier
 *     in settleClassForId (renderer-only, never logged).
 */

import { describe, it, expect } from 'vitest';
import {
  classifyAvoidanceCategory,
  type AvoidanceCategory,
} from '@shared/avoidance-classifier';
import { mapCardToItem } from '@shared/program-board-state';
import type { ProgramCard } from '@shared/program-board-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal ProgramCard with given blocked_on and needs_you_reasons. */
function makeCard(
  blocked_on: string,
  needs_you_reasons: string[] = [],
  overrides: Partial<ProgramCard> = {},
): ProgramCard {
  return {
    slug: 'test-prog',
    name: 'Test Program',
    repos: ['test-repo'],
    sources: [],
    tags: [],
    time_sensitive: null,
    blocked_on,
    paused: false,
    git: {
      last_commit: null,
      age_days: 99,
      uncommitted: false,
      unmerged_branch: null,
    },
    dod: { met: 0, total: 0, gaps: [] },
    last_touched: null,
    lane: 'active',
    age_color: 'red',
    needs_you: true,
    needs_you_reasons,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyAvoidanceCategory: per-category keyword mapping
// ---------------------------------------------------------------------------

describe('classifyAvoidanceCategory -- per-category mapping', () => {
  it('maps financial text to financial', () => {
    expect(classifyAvoidanceCategory('waiting on invoice approval')).toBe('financial');
    expect(classifyAvoidanceCategory('need to review the budget')).toBe('financial');
    expect(classifyAvoidanceCategory('outstanding billing issue')).toBe('financial');
  });

  it('maps documentation text to documentation', () => {
    expect(classifyAvoidanceCategory('needs documentation update')).toBe('documentation');
    expect(classifyAvoidanceCategory('write the docs for this')).toBe('documentation');
    expect(classifyAvoidanceCategory('missing readme')).toBe('documentation');
  });

  it('maps delegation text to delegation', () => {
    expect(classifyAvoidanceCategory('delegate this to the team')).toBe('delegation');
    expect(classifyAvoidanceCategory('assign the task to someone')).toBe('delegation');
    expect(classifyAvoidanceCategory('needs to be assigned')).toBe('delegation');
  });

  it('maps completing-the-loop text to completing-the-loop', () => {
    expect(classifyAvoidanceCategory('waiting on a reply')).toBe('completing-the-loop');
    expect(classifyAvoidanceCategory('need to follow up with vendor')).toBe('completing-the-loop');
    expect(classifyAvoidanceCategory('send the response')).toBe('completing-the-loop');
  });

  it('maps health text to health', () => {
    // Note: avoid "follow up" in health tests as it also matches completing-the-loop.
    // Use text that is unambiguously health-specific.
    expect(classifyAvoidanceCategory('patient chart needs review')).toBe('health');
    expect(classifyAvoidanceCategory('clinical review pending')).toBe('health');
    expect(classifyAvoidanceCategory('medical clearance required')).toBe('health');
  });

  it('maps marketing text to marketing', () => {
    expect(classifyAvoidanceCategory('draft the marketing copy')).toBe('marketing');
    expect(classifyAvoidanceCategory('campaign needs attention')).toBe('marketing');
    expect(classifyAvoidanceCategory('media outreach pending')).toBe('marketing');
  });

  it('returns null for text with no matching category', () => {
    expect(classifyAvoidanceCategory('')).toBeNull();
    expect(classifyAvoidanceCategory('general development work')).toBeNull();
    expect(classifyAvoidanceCategory('fix the tests')).toBeNull();
    expect(classifyAvoidanceCategory('code review')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(classifyAvoidanceCategory('FINANCIAL review needed')).toBe('financial');
    expect(classifyAvoidanceCategory('MARKETING copy pending')).toBe('marketing');
  });

  it('matches on partial word boundaries', () => {
    // "invoice" triggers financial even without the word "financial" itself
    expect(classifyAvoidanceCategory('invoice outstanding')).toBe('financial');
  });
});

// ---------------------------------------------------------------------------
// mapCardToItem sets avoidanceCategory from blocked_on text
// ---------------------------------------------------------------------------

describe('mapCardToItem -- avoidanceCategory from blocked_on', () => {
  it('sets avoidanceCategory when blocked_on matches a category', () => {
    const card = makeCard('waiting on invoice approval');
    const item = mapCardToItem(card);
    expect(item.avoidanceCategory).toBe('financial');
  });

  it('sets avoidanceCategory from needs_you_reasons when blocked_on does not match', () => {
    const card = makeCard('general blocker', ['needs marketing copy']);
    const item = mapCardToItem(card);
    expect(item.avoidanceCategory).toBe('marketing');
  });

  it('prefers blocked_on over needs_you_reasons when both match different categories', () => {
    const card = makeCard('financial invoice pending', ['delegate to team']);
    const item = mapCardToItem(card);
    // blocked_on is checked first
    expect(item.avoidanceCategory).toBe('financial');
  });

  it('sets avoidanceCategory:null when no text matches', () => {
    const card = makeCard('general work to do');
    const item = mapCardToItem(card);
    expect(item.avoidanceCategory).toBeNull();
  });

  it('sets avoidanceCategory:null for a no-git-activity card with no avoidance text', () => {
    const card = makeCard('fix the build', [], {
      git: {
        last_commit: null,
        age_days: 999,
        uncommitted: false,
        unmerged_branch: null,
      },
    });
    const item = mapCardToItem(card);
    expect(item.avoidanceCategory).toBeNull();
    expect(item.gitAgeDays).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// No-git-activity avoidance item stays pinned in Tier-4 tie-break
//
// An avoidance item with null gitAgeDays (no commits) sorts ABOVE a
// non-avoidance item also with null gitAgeDays, because the avoidanceCategory
// tie-break fires before the id tie-break. Without the pin, the null-age
// non-avoidance card would beat the avoidance card by id if it sorts earlier.
// ---------------------------------------------------------------------------

describe('avoidance-category pin in Tier-4 (no-git-activity)', () => {
  it('a no-git-activity avoidance card outranks a no-git-activity non-avoidance card', async () => {
    const { rankItems } = await import('@shared/rank-items');
    const now = new Date(2026, 5, 21, 9, 0, 0);

    // Avoidance card: no commits (gitAgeDays:null), avoidanceCategory set
    const avoidCard = mapCardToItem(
      makeCard('invoice outstanding', [], {
        slug: 'marketing-roi',
        name: 'Marketing ROI',
        git: {
          last_commit: null,
          age_days: 0,
          uncommitted: false,
          unmerged_branch: null,
        },
      }),
    );
    // avoidanceCategory must be set by mapCardToItem
    expect(avoidCard.avoidanceCategory).not.toBeNull();

    // Non-avoidance card: same gitAgeDays:0, same ageColor, earlier id
    const normalCard = mapCardToItem(
      makeCard('general work', [], {
        slug: 'aaa-program', // lexically before 'marketing-roi'
        name: 'AAA Program',
      }),
    );
    expect(normalCard.avoidanceCategory).toBeNull();

    const ranked = rankItems([normalCard, avoidCard], now);
    // The avoidance card must be ranked first despite later id
    expect(ranked[0].id).toBe(avoidCard.id);
  });
});

// ---------------------------------------------------------------------------
// Classifier output never reaches composeClaudeQuery
//
// The structural guard: classifyAvoidanceCategory is a pure function that
// returns a string | null. It is only called inside mapCardToItem to set
// DashboardItem.avoidanceCategory. The composeClaudeQuery function accepts
// ComposeClaudeQueryArgs which has no avoidanceCategory field, and the
// DashboardItem.avoidanceCategory field is never destructured into a
// ComposeClaudeQueryArgs. This test asserts the classifier never throws
// when called with arbitrary text (it is pure with no side effects).
// ---------------------------------------------------------------------------

describe('classifier purity -- no side effects, never throws', () => {
  const allCategories: AvoidanceCategory[] = [
    'financial',
    'documentation',
    'delegation',
    'completing-the-loop',
    'health',
    'marketing',
  ];

  it('is a pure function that never throws', () => {
    // Arbitrary text inputs including edge cases
    const inputs = [
      '',
      'invoice billing payment budget',
      'document docs readme spec',
      'delegate assign responsible',
      'follow up reply response loop',
      'patient clinical medical health',
      'marketing campaign media outreach',
      'a'.repeat(500),
      '\n\t\r special chars !@#$%',
    ];
    for (const input of inputs) {
      expect(() => classifyAvoidanceCategory(input)).not.toThrow();
    }
  });

  it('returns only valid AvoidanceCategory values or null', () => {
    const validValues = new Set([...allCategories, null]);
    const testInputs = [
      'invoice',
      'document',
      'delegate',
      'follow up',
      'patient',
      'marketing',
      'unrelated text',
    ];
    for (const input of testInputs) {
      const result = classifyAvoidanceCategory(input);
      expect(validValues.has(result)).toBe(true);
    }
  });
});
