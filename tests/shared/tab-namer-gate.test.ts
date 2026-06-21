/**
 * M19 / R-14: Tests for the tab-namer gate (PLAN-PHASE-2-3.md line 79,
 * PLAN.md 3.4 line 455, R-14 line 1117).
 *
 * TDD: tests written FIRST; the module lives in src/shared/tab-namer-gate.ts.
 *
 * The tab-namer (src/main/tab-namer.ts) ships prompt.substring(0,500) to Haiku
 * for every auto-named tab. The dashboard spawns a fresh auto-named tab per
 * injection. Today's canned queries are PHI-free, so the dashboard-spawned name
 * is safe. But if the free-text opt-in ever enables dod.gaps[0] into the query
 * slot, that specificity would reach Haiku at 500 chars with zero scrub.
 *
 * The gate (R-14): when the free-text opt-in is enabled, a dashboard-injected
 * tab's namer prompt MUST be suppressed (no Haiku call) OR run through
 * scrubFreeText before it reaches Haiku. These tests pin both behaviors.
 */

import { describe, it, expect } from 'vitest';
import { resolveDashboardTabNamerPrompt } from '@shared/tab-namer-gate';
import { scrubFreeText } from '@shared/scrub-free-text';

const RAW = 'Draft the portal note for patient 303-986-9337 DOB 04/12/1985';

// ---------------------------------------------------------------------------
// Non-dashboard tabs are untouched (the namer behaves exactly as before)
// ---------------------------------------------------------------------------

describe('tab-namer gate -- ordinary (non-dashboard) tabs are unaffected', () => {
  it('passes the raw prompt through for a non-dashboard tab, opt-in off', () => {
    const r = resolveDashboardTabNamerPrompt({
      rawPrompt: RAW,
      isDashboardInjected: false,
      freeTextOptInEnabled: false,
    });
    expect(r.suppress).toBe(false);
    expect(r.prompt).toBe(RAW);
  });

  it('passes the raw prompt through for a non-dashboard tab even when opt-in is on', () => {
    // The gate only governs DASHBOARD-injected tabs. An ordinary tab's namer is
    // out of scope for the dashboard's PHI seam; its existing behavior stands.
    const r = resolveDashboardTabNamerPrompt({
      rawPrompt: RAW,
      isDashboardInjected: false,
      freeTextOptInEnabled: true,
    });
    expect(r.suppress).toBe(false);
    expect(r.prompt).toBe(RAW);
  });
});

// ---------------------------------------------------------------------------
// Dashboard-injected tabs WITH the free-text opt-in ON are GATED
// ---------------------------------------------------------------------------

describe('tab-namer gate -- dashboard-injected + free-text opt-in ON is gated', () => {
  it('suppresses auto-naming for a dashboard-injected tab when the opt-in is enabled', () => {
    const r = resolveDashboardTabNamerPrompt({
      rawPrompt: RAW,
      isDashboardInjected: true,
      freeTextOptInEnabled: true,
    });
    // Suppression: no prompt reaches Haiku at all.
    expect(r.suppress).toBe(true);
    expect(r.prompt).toBeNull();
  });

  it('the scrubbed fallback removes the phone/DOB so nothing leaks if naming is not suppressed', () => {
    // The module exposes the scrubbed prompt for callers that prefer scrub over
    // suppress. Either path satisfies R-14; the scrubbed text must be PHI-free.
    const r = resolveDashboardTabNamerPrompt({
      rawPrompt: RAW,
      isDashboardInjected: true,
      freeTextOptInEnabled: true,
    });
    expect(r.scrubbedPrompt).toBe(scrubFreeText(RAW));
    expect(r.scrubbedPrompt).not.toContain('303-986-9337');
    expect(r.scrubbedPrompt).not.toContain('04/12/1985');
  });
});

// ---------------------------------------------------------------------------
// Dashboard-injected tabs with the opt-in OFF keep today's safe behavior
// ---------------------------------------------------------------------------

describe('tab-namer gate -- dashboard-injected + opt-in OFF (the shipped state)', () => {
  it('does not suppress when the free-text opt-in is off (canned queries are PHI-free)', () => {
    // With the opt-in off, the only thing the dashboard injects is a canned,
    // PHI-free query, so the namer can run as it does today. The gate is armed
    // only by the opt-in, so removing the opt-in restores the prior behavior.
    const r = resolveDashboardTabNamerPrompt({
      rawPrompt: 'Review the open TODOs in this repo.',
      isDashboardInjected: true,
      freeTextOptInEnabled: false,
    });
    expect(r.suppress).toBe(false);
    expect(r.prompt).toBe('Review the open TODOs in this repo.');
  });
});
