/**
 * M19 / R-14: the tab-namer gate (PLAN.md 3.4 line 455, R-14 line 1117,
 * PLAN-PHASE-2-3.md line 79).
 *
 * The tab-namer (src/main/tab-namer.ts) ships prompt.substring(0,500) to Haiku
 * for EVERY auto-named tab, far more free text than composeClaudeQuery carries,
 * and the dashboard spawns a fresh auto-named tab per injection. Today's
 * dashboard injections are canned, PHI-free queries, so the spawned tab name is
 * safe. But if the free-text opt-in (free-text-query.ts) is ever enabled, the
 * dod.gaps[0] specificity it would inject would reach Haiku at 500 chars with
 * zero scrub the moment it ships. That contradicts the PHI-minimization rule.
 *
 * The gate (R-14): the SAME diff that enables the free-text opt-in MUST also gate
 * the tab-namer for dashboard-injected tabs, either by SUPPRESSING auto-naming
 * for those tabs (no Haiku call) or by running the namer prompt through
 * scrubFreeText first. This module decides which, given the tab origin and the
 * opt-in state.
 *
 * Pure: no DOM, no Electron, no child_process. The caller (tab-namer.ts via the
 * hook-router) supplies the raw prompt, whether the tab is dashboard-injected,
 * and the current opt-in state, and acts on the returned decision.
 */

import { scrubFreeText } from './scrub-free-text';

export interface TabNamerGateInput {
  /** The first-prompt text the namer would otherwise send to Haiku. */
  rawPrompt: string;
  /**
   * Whether this tab was spawned by the dashboard injection path
   * (claude:injectQuery). Only dashboard-injected tabs are in scope for the gate;
   * an ordinary user-opened tab is governed by the existing namer behavior.
   */
  isDashboardInjected: boolean;
  /**
   * Whether the free-text query opt-in is enabled. The gate is ARMED only by this
   * flag, so removing the opt-in restores the prior, safe behavior for
   * dashboard-injected tabs (their canned query is PHI-free).
   */
  freeTextOptInEnabled: boolean;
}

export interface TabNamerGateDecision {
  /**
   * When true, the caller MUST NOT call Haiku for this tab at all (the strongest
   * R-14 guard: zero free text reaches the LLM for a dashboard-injected tab once
   * the opt-in is on).
   */
  suppress: boolean;
  /**
   * The prompt the caller should send to Haiku when suppress is false. Null when
   * suppressed. For an ungated path this is the raw prompt unchanged.
   */
  prompt: string | null;
  /**
   * The scrubbed prompt, always provided so a caller that prefers SCRUB over
   * SUPPRESS (the other R-14-approved option) can use it. PHI-free for the
   * patterns scrubFreeText covers.
   */
  scrubbedPrompt: string;
}

/**
 * Decides how the tab-namer should treat a tab's first-prompt text.
 *
 * Rules:
 *   - A non-dashboard tab is never gated: prompt passes through unchanged. The
 *     dashboard's PHI seam does not own ordinary tabs.
 *   - A dashboard-injected tab with the free-text opt-in OFF is also not gated:
 *     the only thing the dashboard injects is a canned, PHI-free query, so the
 *     namer can run as it does today.
 *   - A dashboard-injected tab with the free-text opt-in ON is SUPPRESSED: no
 *     Haiku call, so the injected free text never reaches the LLM. The scrubbed
 *     prompt is still returned for a caller that would rather scrub than suppress.
 */
export function resolveDashboardTabNamerPrompt(
  input: TabNamerGateInput,
): TabNamerGateDecision {
  const scrubbedPrompt = scrubFreeText(input.rawPrompt);

  const gated = input.isDashboardInjected && input.freeTextOptInEnabled;
  if (gated) {
    return { suppress: true, prompt: null, scrubbedPrompt };
  }

  return { suppress: false, prompt: input.rawPrompt, scrubbedPrompt };
}
