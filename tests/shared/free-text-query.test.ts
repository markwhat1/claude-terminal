/**
 * M19: Tests for the disabled-by-default free-text query path
 * (PLAN-PHASE-2-3.md line 79, PLAN.md 3.4 lines 456-457).
 *
 * TDD: tests written FIRST; the module lives in src/shared/free-text-query.ts.
 *
 * The free-text branch ships DISABLED. The canned-template path
 * (composeClaudeQuery, tested in home-copy.test.ts) is the only ENABLED path.
 * Enabling the free-text branch requires explicit per-use confirmation IN CODE
 * (a typed confirmation token, not just prose). These tests pin:
 *   - compileFreeTextQuery returns null by default (the path is disabled).
 *   - It returns null even WITH a per-use confirmation while disabled (the
 *     setting gate beats the confirmation, so a stray confirmation cannot
 *     open the path).
 *   - When the path is force-enabled FOR THE TEST, a call still returns null
 *     unless an explicit per-use confirmation token is passed (so enabling the
 *     opt-in requires per-use confirmation in code).
 *   - When force-enabled AND confirmed, the result is the scrubFreeText output
 *     (the harm-reduction scrubber runs on the free text before it can be used).
 */

import { describe, it, expect } from 'vitest';
import {
  FREE_TEXT_QUERY_ENABLED,
  compileFreeTextQuery,
  confirmFreeTextUse,
} from '@shared/free-text-query';
import { scrubFreeText } from '@shared/scrub-free-text';

// ---------------------------------------------------------------------------
// Disabled by default; canned is the only enabled path
// ---------------------------------------------------------------------------

describe('free-text query -- DISABLED by default', () => {
  it('the enabled constant is false (the canned path is the only enabled one)', () => {
    expect(FREE_TEXT_QUERY_ENABLED).toBe(false);
  });

  it('returns null when called with no confirmation (the shipped state)', () => {
    expect(compileFreeTextQuery('draft the thing for John Doe')).toBeNull();
  });

  it('returns null even WITH a per-use confirmation while the path is disabled', () => {
    // The setting gate beats the confirmation: a confirmation token alone cannot
    // open a disabled path. enabled=false is the default-OFF Phase-3 guarantee.
    const confirmation = confirmFreeTextUse();
    expect(
      compileFreeTextQuery('draft the thing', { confirmation, enabled: false }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Enabling requires explicit per-use confirmation IN CODE
// ---------------------------------------------------------------------------

describe('free-text query -- enabling requires explicit per-use confirmation', () => {
  it('returns null when force-enabled but NO per-use confirmation is supplied', () => {
    // Even with the path enabled, the absence of a per-use confirmation token
    // means the free text never compiles. The confirmation is mandatory IN CODE.
    expect(compileFreeTextQuery('draft the thing', { enabled: true })).toBeNull();
  });

  it('returns a scrubbed string only when force-enabled AND a confirmation is passed', () => {
    const confirmation = confirmFreeTextUse();
    const out = compileFreeTextQuery('draft the thing', {
      confirmation,
      enabled: true,
    });
    expect(out).not.toBeNull();
    expect(typeof out).toBe('string');
  });

  it('runs scrubFreeText on the free text before returning it (harm reduction)', () => {
    const raw = 'draft postop note, call 303-986-9337 to confirm DOB 04/12/1985';
    const confirmation = confirmFreeTextUse();
    const out = compileFreeTextQuery(raw, { confirmation, enabled: true });
    expect(out).not.toBeNull();
    // The scrubber must have removed the phone number and DOB.
    expect(out as string).not.toContain('303-986-9337');
    expect(out as string).not.toContain('04/12/1985');
    // And the result must equal the scrubber's output for that input.
    expect(out).toBe(scrubFreeText(raw));
  });

  it('returns null for empty / whitespace-only input even when enabled and confirmed', () => {
    const confirmation = confirmFreeTextUse();
    expect(
      compileFreeTextQuery('   ', { confirmation, enabled: true }),
    ).toBeNull();
  });
});
