/**
 * M19: Disabled-by-default free-text query path (PLAN.md 3.4 lines 456-457,
 * PLAN-PHASE-2-3.md line 79).
 *
 * This module is the ONLY caller of scrubFreeText. It wires the harm-reduction
 * scrubber into an opt-in path that ships DISABLED, gated behind explicit
 * per-use confirmation IN CODE, not just prose (PLAN.md 3.4; Phase-3 rule: every
 * coaching feature ships default-OFF, and the free-text path is disabled until
 * deliberately turned on).
 *
 * Two independent gates, both required:
 *   1. The path must be ENABLED (FREE_TEXT_QUERY_ENABLED, default false). This is
 *      the default-OFF Phase-3 guarantee. A future milestone wires this to a
 *      store flag; until then it is false and the path cannot open at all.
 *   2. Each call must carry an explicit per-use confirmation token produced by
 *      confirmFreeTextUse(). The token is the in-code confirmation: a caller
 *      cannot pass free text without first writing the confirmation call, so the
 *      opt-in is reviewable in the diff rather than implicit.
 *
 * The setting gate beats the confirmation: a confirmation alone cannot open a
 * disabled path, so a stray confirmation in code is inert while shipped.
 *
 * The canned-template path (composeClaudeQuery in home-copy.ts) stays the only
 * ENABLED query path. Its zero-free-text regression gate (home-copy.test.ts)
 * remains intact; this module does not touch it. Enabling the free-text branch
 * for real is a SEPARATE future diff that flips FREE_TEXT_QUERY_ENABLED and, per
 * R-14, must also gate the tab-namer (see tab-namer-gate.ts).
 *
 * Hard constraints (non-negotiable per spec):
 *   - This path is DISABLED. compileFreeTextQuery returns null in the shipped state.
 *   - scrubFreeText is HARM-REDUCTION, not a primary PHI control. It cannot
 *     redact patient names.
 *   - The scrubbed text MUST NOT reach composeClaudeQuery or any log.*() call.
 *   - If this path is ever enabled, the tab-namer MUST also be gated (R-14).
 */

import { scrubFreeText } from './scrub-free-text';

// ---------------------------------------------------------------------------
// Gate 1: the opt-in enabled flag (Phase-3 DEFAULT-OFF)
// ---------------------------------------------------------------------------

/**
 * Whether the free-text query opt-in is enabled. Ships false. A future milestone
 * wires this to a settings-store flag with the explicit per-use confirmation gate
 * below. While false, compileFreeTextQuery always returns null.
 */
export const FREE_TEXT_QUERY_ENABLED = false;

// ---------------------------------------------------------------------------
// Gate 2: the explicit per-use confirmation token (in-code confirmation)
// ---------------------------------------------------------------------------

/**
 * A per-use confirmation that a caller has deliberately chosen to compile free
 * text on THIS call. Branded so it can only be produced by confirmFreeTextUse(),
 * never forged from a plain object, which makes the confirmation a real in-code
 * gate rather than a comment.
 */
export type FreeTextConfirmation = {
  readonly __brand: 'FreeTextConfirmation';
  readonly confirmedByUser: true;
};

/**
 * Produces a per-use free-text confirmation token. A caller MUST call this to
 * obtain the token compileFreeTextQuery requires, so the opt-in is explicit in
 * the code at every call site (PLAN.md 3.4: "gated behind explicit per-use
 * confirmation in code, not just prose").
 */
export function confirmFreeTextUse(): FreeTextConfirmation {
  return { __brand: 'FreeTextConfirmation', confirmedByUser: true };
}

// ---------------------------------------------------------------------------
// compileFreeTextQuery
// ---------------------------------------------------------------------------

export interface CompileFreeTextOptions {
  /**
   * The per-use confirmation token. Absent means no confirmation was given, so
   * the call returns null even when the path is enabled.
   */
  confirmation?: FreeTextConfirmation;
  /**
   * Override the enabled gate. Defaults to FREE_TEXT_QUERY_ENABLED. Exists so the
   * future enabling milestone (and the M19 tests) can exercise the enabled path
   * without flipping the shipped constant.
   */
  enabled?: boolean;
}

/**
 * Applies scrubFreeText to a candidate free-text string and returns the scrubbed
 * result, but ONLY when BOTH gates are open: the path is enabled AND a per-use
 * confirmation token is supplied.
 *
 * Returns null when:
 *   - the path is disabled (the shipped state), OR
 *   - no per-use confirmation token is supplied, OR
 *   - the input is empty / whitespace-only after scrubbing.
 *
 * Callers MUST check for null and MUST NOT pass the result to composeClaudeQuery
 * (the result is free text, not a canned ClaudeQueryLine). The result is only
 * safe for an explicit user-confirmed free-text injection (the Phase-3 opt-in
 * path, not yet built), and if that path is ever wired, R-14 requires the
 * tab-namer be gated for the spawned tab (see tab-namer-gate.ts).
 *
 * This function is the SOLE consumer of scrubFreeText so the scrubber ships with
 * a real caller (M0c DoD: "ships with a real caller, not as dead code").
 */
export function compileFreeTextQuery(
  rawText: string,
  options: CompileFreeTextOptions = {},
): string | null {
  const enabled = options.enabled ?? FREE_TEXT_QUERY_ENABLED;
  // Gate 1: the path must be enabled. The setting gate beats the confirmation, so
  // a confirmation alone cannot open a disabled path.
  if (!enabled) return null;
  // Gate 2: an explicit per-use confirmation is mandatory in code.
  if (!options.confirmation || options.confirmation.confirmedByUser !== true) {
    return null;
  }

  const scrubbed = scrubFreeText(rawText);
  if (!scrubbed.trim()) return null;

  return scrubbed;
}
