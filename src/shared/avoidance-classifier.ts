/**
 * M13: Renderer-side pure keyword classifier for avoidance categories.
 *
 * Maps program-board blocked_on / needs_you text to the six AvoidanceCategory
 * values so a no-git-activity avoidance item stays pinned in the needs-you band
 * by category. Items with no commits have no recency to age them; without the
 * pin the exact avoidance items most likely to rot are the ones the board cannot
 * escalate (PLAN-PHASE-2-3.md lines 47-49).
 *
 * Hard constraints (non-negotiable per spec):
 *   - PURE: no side effects, no imports of log/electron/DOM.
 *   - NEVER fed to composeClaudeQuery.
 *   - NEVER logged.
 *   - These are NOT program-board tags; the real BLOCKER_TAGS set
 *     ({needs-CADDC02, needs-your-decision}) is untouched.
 */

// ---------------------------------------------------------------------------
// AvoidanceCategory type (PLAN-PHASE-2-3.md line 48)
// ---------------------------------------------------------------------------

export type AvoidanceCategory =
  | 'financial'
  | 'documentation'
  | 'delegation'
  | 'completing-the-loop'
  | 'health'
  | 'marketing';

// ---------------------------------------------------------------------------
// Keyword tables per category
//
// Each entry is a lowercase substring. classifyAvoidanceCategory lowercases
// the input and checks for any match, returning the FIRST category whose
// keywords match, in declaration order. If two categories overlap on the same
// text, the first one in the table wins (callers that need priority control
// should pass the most specific text first).
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: readonly [AvoidanceCategory, readonly string[]][] = [
  [
    'financial',
    [
      'invoice',
      'billing',
      'payment',
      'budget',
      'financial',
      'revenue',
      'expense',
      'cost',
      'fee',
      'accounting',
      'payroll',
      'tax',
      'charge',
    ],
  ],
  [
    'documentation',
    [
      'document',
      'docs',
      'readme',
      'spec',
      'write up',
      'writeup',
      'note',
      'wiki',
      'guide',
      'manual',
    ],
  ],
  [
    'delegation',
    [
      'delegate',
      'assign',
      'responsible',
      'hand off',
      'handoff',
      'pass to',
      'pass off',
      'someone else',
      'team member',
    ],
  ],
  [
    'completing-the-loop',
    [
      'follow up',
      'followup',
      'follow-up',
      'reply',
      'response',
      'respond',
      'send the',
      'waiting on a reply',
      'waiting for reply',
      'loop',
    ],
  ],
  [
    'health',
    [
      'patient',
      'clinical',
      'medical',
      'health',
      'clearance',
      'referral',
      'dental',
      'diagnosis',
      'treatment',
    ],
  ],
  [
    'marketing',
    [
      'marketing',
      'campaign',
      'media',
      'outreach',
      'advertis',
      'promotion',
      'brand',
      'content',
    ],
  ],
];

// ---------------------------------------------------------------------------
// classifyAvoidanceCategory
// ---------------------------------------------------------------------------

/**
 * Maps program-board blocked_on / needs_you text to an AvoidanceCategory.
 *
 * Returns the first matching category (declaration order above), or null when
 * no keyword matches.
 *
 * Pure: no side effects, no logging, no external calls.
 * MUST NEVER be called inside composeClaudeQuery or any log.*() call.
 */
export function classifyAvoidanceCategory(text: string): AvoidanceCategory | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return category;
    }
  }
  return null;
}

/**
 * Combines blocked_on and needs_you_reasons into a single classification.
 *
 * blocked_on is checked first; if it produces a category that is returned
 * immediately. Otherwise the reasons are joined and checked. This matches the
 * mapCardToItem preference order (PLAN-PHASE-2-3.md M13).
 */
export function classifyCardAvoidance(
  blocked_on: string,
  needs_you_reasons: string[],
): AvoidanceCategory | null {
  const fromBlockedOn = classifyAvoidanceCategory(blocked_on);
  if (fromBlockedOn !== null) return fromBlockedOn;
  if (needs_you_reasons.length > 0) {
    return classifyAvoidanceCategory(needs_you_reasons.join(' '));
  }
  return null;
}
