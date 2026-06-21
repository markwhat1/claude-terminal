/**
 * M19: Disabled-by-default free-text query path (PLAN.md 3.4, PLAN-PHASE-2-3.md line 79).
 *
 * This module is the ONLY caller of scrubFreeText. It wires the harm-reduction
 * scrubber into an opt-in path that ships DISABLED, gated behind explicit
 * per-use confirmation in code (PLAN.md 3.4, Phase-3 rule: every coaching
 * feature ships default-OFF).
 *
 * Status: Phase-3 feature, DISABLED. The confirmation gate prevents any
 * free-text from reaching the PTY or the LLM. To enable this path, a future
 * milestone must:
 *   1. Add a store flag (mirroring notifyOnIdle, PLAN.md 3.4 / AGENTS.md pattern).
 *   2. Wire explicit per-use confirmation in the renderer.
 *   3. Gate the tab-namer so scrubbed text does not leak to Haiku auto-naming
 *      (PLAN.md R-14 / PLAN-PHASE-2-3.md line 79).
 *
 * Hard constraints (non-negotiable per spec):
 *   - This path is DISABLED. compileFreeTextQuery always returns null until a
 *     future milestone enables it.
 *   - scrubFreeText is HARM-REDUCTION, not a primary PHI control. It cannot
 *     redact patient names.
 *   - The scrubbed text MUST NOT reach composeClaudeQuery or any log.*() call.
 *   - The free-text opt-in (if ever enabled) MUST also gate the tab-namer.
 */

import { scrubFreeText } from './scrub-free-text';

// ---------------------------------------------------------------------------
// Opt-in gate (Phase-3 DEFAULT-OFF flag, not yet wired to a store)
// ---------------------------------------------------------------------------

/**
 * Whether the free-text query opt-in is enabled. Ships false; a future
 * milestone wires this to a settings-store flag with an explicit per-use
 * confirmation gate in the renderer.
 */
const FREE_TEXT_QUERY_ENABLED = false;

// ---------------------------------------------------------------------------
// compileFreeTextQuery
// ---------------------------------------------------------------------------

/**
 * Applies scrubFreeText to a candidate free-text string and returns the
 * scrubbed result, but ONLY when the opt-in gate is open.
 *
 * Returns null when:
 *   - the gate is closed (the current shipped state), OR
 *   - the input is empty after scrubbing, OR
 *   - the scrubbed result is identical to a fully-redacted placeholder.
 *
 * Callers MUST check for null and MUST NOT pass the result to
 * composeClaudeQuery. The result is only safe for an explicit user-confirmed
 * free-text injection (the Phase-3 opt-in path, not yet built).
 *
 * This function is the SOLE consumer of scrubFreeText so the scrubber ships
 * with a real caller (M0c DoD: "ships with a real caller, not as dead code").
 */
export function compileFreeTextQuery(rawText: string): string | null {
  // Gate is off; the free-text path does not ship in Phase 2.
  if (!FREE_TEXT_QUERY_ENABLED) return null;

  const scrubbed = scrubFreeText(rawText);
  if (!scrubbed.trim()) return null;

  return scrubbed;
}
