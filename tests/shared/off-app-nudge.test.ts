/**
 * M19: Tests for the off-app batched nudge (PLAN-PHASE-2-3.md line 79, PLAN.md
 * 1.13 / R-12 notification policy).
 *
 * TDD: tests written FIRST; the module lives in src/shared/off-app-nudge.ts.
 *
 * The off-app nudge is a Phase-3 coaching feature, so it ships DEFAULT OFF, and
 * it fires ONLY when it is separately scheduled and confirmed (two independent
 * conditions, not one toggle). These tests pin:
 *   - The default-OFF constant.
 *   - shouldSendOffAppNudge requires BOTH the setting and the schedule/confirm.
 *   - composeOffAppNudge produces a batched digest line with no guilt, no
 *     time-since, no streak / chain / "in a row" / "N days" language, no em dash.
 */

import { describe, it, expect } from 'vitest';
import {
  OFF_APP_NUDGE_DEFAULT_ENABLED,
  shouldSendOffAppNudge,
  composeOffAppNudge,
} from '@shared/off-app-nudge';

// ---------------------------------------------------------------------------
// Default-OFF (the Phase-3 rule)
// ---------------------------------------------------------------------------

describe('off-app nudge -- default OFF', () => {
  it('the default-enabled constant is false', () => {
    expect(OFF_APP_NUDGE_DEFAULT_ENABLED).toBe(false);
  });

  it('does not send when the setting is off, even if a schedule fired', () => {
    expect(
      shouldSendOffAppNudge({ settingEnabled: false, scheduledConfirmed: true }),
    ).toBe(false);
  });

  it('does not send when the setting is the default (off) and nothing is scheduled', () => {
    expect(
      shouldSendOffAppNudge({
        settingEnabled: OFF_APP_NUDGE_DEFAULT_ENABLED,
        scheduledConfirmed: false,
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Opt-in requires BOTH conditions: separately scheduled AND confirmed
// ---------------------------------------------------------------------------

describe('off-app nudge -- opt-in requires both the setting and the schedule', () => {
  it('does not send when enabled but not separately scheduled/confirmed', () => {
    expect(
      shouldSendOffAppNudge({ settingEnabled: true, scheduledConfirmed: false }),
    ).toBe(false);
  });

  it('sends only when the setting is on AND a scheduled window is confirmed', () => {
    expect(
      shouldSendOffAppNudge({ settingEnabled: true, scheduledConfirmed: true }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Copy: batched digest, no guilt / streak / time-since language
// ---------------------------------------------------------------------------

describe('off-app nudge -- copy voice', () => {
  const lines = [
    composeOffAppNudge(0, 0),
    composeOffAppNudge(2, 1),
    composeOffAppNudge(5, 0),
  ];

  it('produces a non-empty string for each case', () => {
    for (const line of lines) {
      expect(typeof line).toBe('string');
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('contains no em dash (neither the long-dash char nor a double hyphen)', () => {
    for (const line of lines) {
      expect(line).not.toContain('—');
      expect(line).not.toContain('--');
    }
  });

  it('carries no streak / chain / time-since / guilt language', () => {
    const banned = [
      'streak',
      'chain',
      'in a row',
      'days',
      'still',
      'since',
      'ago',
      'behind',
      'fell off',
      'broke',
    ];
    for (const line of lines) {
      const lower = line.toLowerCase();
      for (const word of banned) {
        expect(lower).not.toContain(word);
      }
    }
  });

  it('reads as a batched digest, not a per-event ping (mentions the need-count when non-zero)', () => {
    expect(composeOffAppNudge(3, 0)).toContain('3');
  });

  it('uses calm forward framing when nothing needs you', () => {
    const line = composeOffAppNudge(0, 0);
    // The zero case is a clean, non-guilt landing, never "0 things waiting".
    expect(line.toLowerCase()).not.toContain('0 ');
  });
});
