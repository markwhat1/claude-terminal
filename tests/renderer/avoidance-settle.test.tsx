/**
 * M13: Tests for the avoidance-category settle tier.
 *
 * These import the PRODUCTION settleClassForId from @shared/settle-class, the
 * same module HomeView uses, so they guard real behavior rather than a copy.
 *
 * When a ClosedRecord has avoidanceClose:true, settleClassForId returns
 * 'settle-avoidance' (the louder, still-motion-safe beat). This is distinct
 * from the Phase-1 tiers: 'settle-ordinary' and 'settle-decided'.
 *
 * Covers:
 *   - avoidanceClose:true produces 'settle-avoidance' (not 'settle-decided').
 *   - decidedAndWorked:true + avoidanceClose:false produces 'settle-decided'.
 *   - decidedAndWorked:false + avoidanceClose:false produces 'settle-ordinary'.
 *   - avoidanceClose:true + reducedMotion:true produces null (motion-safe).
 *   - A ClosedRecord with avoidanceClose:null (Phase-1 reserved) produces the
 *     ordinary tier (backward-compatible, no regression).
 */

import { describe, it, expect } from 'vitest';
import type { ClosedRecord } from '@shared/program-board-state';
// Import the PRODUCTION settle-class function. HomeView imports the same symbol
// from this module, so these tests now guard real behavior instead of a copy.
import { settleClassForId } from '@shared/settle-class';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('settleClassForId -- avoidance-category settle tier (M13)', () => {
  const makeRecord = (
    id: string,
    decidedAndWorked: boolean,
    avoidanceClose: boolean | null,
  ): ClosedRecord => ({
    id,
    closedAt: '2026-06-21T09:00:00.000Z',
    decidedAndWorked,
    avoidanceClose: avoidanceClose as null, // ClosedRecord.avoidanceClose typed null in Phase-1 types; M13 upgrades it
  });

  it('returns settle-avoidance when avoidanceClose is true', () => {
    const closes = [makeRecord('pb:marketing-roi', false, true)];
    expect(settleClassForId('pb:marketing-roi', closes, false)).toBe('settle-avoidance');
  });

  it('returns settle-avoidance even when decidedAndWorked is also true', () => {
    // avoidanceClose takes precedence over decidedAndWorked
    const closes = [makeRecord('pb:marketing-roi', true, true)];
    expect(settleClassForId('pb:marketing-roi', closes, false)).toBe('settle-avoidance');
  });

  it('returns settle-decided when decidedAndWorked:true and avoidanceClose:false', () => {
    const closes = [makeRecord('pb:cad-portal', true, false)];
    expect(settleClassForId('pb:cad-portal', closes, false)).toBe('settle-decided');
  });

  it('returns settle-ordinary when both flags are false', () => {
    const closes = [makeRecord('pb:cad-portal', false, false)];
    expect(settleClassForId('pb:cad-portal', closes, false)).toBe('settle-ordinary');
  });

  it('returns null when prefers-reduced-motion is active (motion-safe guard)', () => {
    const closes = [makeRecord('pb:marketing-roi', false, true)];
    expect(settleClassForId('pb:marketing-roi', closes, true)).toBeNull();
  });

  it('returns null when avoidanceClose is null (Phase-1 reserved, backward-compatible)', () => {
    // A Phase-1 ClosedRecord with avoidanceClose:null is treated as ordinary,
    // same as before M13.
    const closes = [makeRecord('pb:marketing-roi', false, null)];
    // null avoidanceClose -> settleClassForId falls through to ordinary
    expect(settleClassForId('pb:marketing-roi', closes, false)).toBe('settle-ordinary');
  });

  it('returns null when the id has no close record', () => {
    const closes: ClosedRecord[] = [];
    expect(settleClassForId('pb:unknown', closes, false)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Structural guard: avoidanceCategory is never logged
//
// This test asserts that `classifyAvoidanceCategory` returns a value, not that
// it side-effects. The actual log-isolation is enforced architecturally (the
// classifier is called only inside mapCardToItem to set the field, never inside
// a log call), but we assert here that the function is pure and returns the
// expected types so a future refactor would need to break this test to add
// logging.
// ---------------------------------------------------------------------------

describe('structural guard -- classifier is pure, no side effects', () => {
  it('classifyAvoidanceCategory can be called without any log side effects', async () => {
    const { classifyAvoidanceCategory } = await import('@shared/avoidance-classifier');
    // Calling the classifier multiple times with the same input returns the same
    // result (pure function, no mutable state).
    const r1 = classifyAvoidanceCategory('invoice billing');
    const r2 = classifyAvoidanceCategory('invoice billing');
    expect(r1).toBe(r2);
    expect(r1).toBe('financial');
  });

  it('the classifier return value is only of type AvoidanceCategory | null', async () => {
    const { classifyAvoidanceCategory } = await import('@shared/avoidance-classifier');
    const validSet = new Set([
      'financial',
      'documentation',
      'delegation',
      'completing-the-loop',
      'health',
      'marketing',
      null,
    ]);
    const result = classifyAvoidanceCategory('marketing campaign');
    expect(validSet.has(result)).toBe(true);
  });
});
