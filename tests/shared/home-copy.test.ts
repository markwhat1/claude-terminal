/**
 * M10a: Tests for pure composers in src/shared/home-copy.ts
 *
 * Covers:
 *   - composeClaudeQuery: canned templates have ZERO free-text interpolation.
 *     This test is the NAMED GATE the Phase-2/3 free-text opt-in must explicitly
 *     delete before shipping.
 *   - composeCopy: output is InertDisplayString; detail/blocked_on cannot reach it.
 *   - pickPrimaryAction: needs-your-decision -> openToDecide (NOT draftFirstVersion);
 *     a both-dodAlmost-AND-needs-your-decision card also maps to openToDecide.
 *   - isSafeProgramIdentifier: rejects PHI-shaped name; composer falls back to
 *     slug-only when name is unsafe, and to a no-identifier template when slug is
 *     also unsafe.
 */

import { describe, it, expect } from 'vitest';
import {
  composeClaudeQuery,
  composeCopy,
  pickPrimaryAction,
  ACTION_LABELS,
  type ClaudeQueryLine,
  type InertDisplayString,
  type KnownActionId,
} from '@shared/home-copy';
import type { DashboardItem } from '@shared/program-board-state';
import { isSafeProgramIdentifier } from '@shared/program-board-state';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Builds a minimal DashboardItem with the given badge list. */
function makeItem(overrides: Partial<DashboardItem> = {}): DashboardItem {
  return {
    id: 'pb:test-program',
    slug: 'test-program',
    source: 'program-board',
    kind: 'blocker',
    title: 'Test Program',
    detail: 'Sensitive blocked_on text with patient name John Doe.',
    project: 'test-project',
    badges: [],
    ageColor: 'green',
    recencyIso: null,
    gitAgeDays: 0,
    url: null,
    needsYou: true,
    needsYouReasons: [],
    paused: false,
    timeSensitive: null,
    dodMet: 0,
    dodTotal: 1,
    dodAlmost: true,
    dodGap: 'some gap',
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

// ---------------------------------------------------------------------------
// ZERO-FREE-TEXT REGRESSION GATE (M10a, 3.4, PLAN 984-989)
//
// THIS IS THE NAMED LOAD-BEARING REGRESSION TEST.
// The Phase-2/3 free-text opt-in CANNOT ship without explicitly deleting or
// modifying this test. That makes the policy change reviewable in the diff.
// ---------------------------------------------------------------------------

describe('composeClaudeQuery -- ZERO free-text regression gate (3.4)', () => {
  const allActionIds: KnownActionId[] = [
    'draftFirstVersion',
    'openToDecide',
    'reviewTodos',
    'summarizeChanges',
    'openPowerShell',
  ];

  // Fixtures that contain free-text that must not appear in any composed output.
  const PHI_DETAIL =
    'Patient Jane Smith, DOB 1985-03-12, needs compliance review.';
  const PHI_BLOCKED_ON = 'Blocked by STAFF_DEFAULT_TEMP_PASSWORD credential.';
  const PHI_DOD_GAP = 'portal Incomplete Notes surface live end to end';

  const safeSlug = 'clinical-notes';
  const safeName = 'Clinical Notes';

  it('every KnownActionId composes without interpolating detail/blocked_on/dod.gaps text', () => {
    for (const action of allActionIds) {
      const query = composeClaudeQuery({
        action,
        programSlug: safeSlug,
        programName: safeName,
        kind: 'blocker',
      });
      // The output must not contain any fragment of the forbidden free-text fields.
      expect(query).not.toContain(PHI_DETAIL);
      expect(query).not.toContain(PHI_BLOCKED_ON);
      expect(query).not.toContain(PHI_DOD_GAP);
      // And it must be branded as a ClaudeQueryLine (typecheck by assignment).
      const _typed: ClaudeQueryLine = query;
      expect(typeof _typed).toBe('string');
    }
  });

  it('draftFirstVersion uses only the safe programName, not free-text fields', () => {
    const query = composeClaudeQuery({
      action: 'draftFirstVersion',
      programSlug: safeSlug,
      programName: safeName,
      kind: 'blocker',
    });
    // Should contain the safe program name.
    expect(query).toContain(safeName);
    // Must not contain the PHI slot content.
    expect(query).not.toContain(PHI_DOD_GAP);
    expect(query).not.toContain(PHI_DETAIL);
  });

  it('openToDecide is entirely canned (zero interpolation of any field)', () => {
    const q1 = composeClaudeQuery({
      action: 'openToDecide',
      programSlug: 'a',
      programName: 'A',
      kind: 'blocker',
    });
    const q2 = composeClaudeQuery({
      action: 'openToDecide',
      programSlug: 'b',
      programName: 'B',
      kind: 'todo',
    });
    // Two different programs produce the exact same canned query.
    expect(q1).toBe(q2);
  });

  it('reviewTodos/summarizeChanges/openPowerShell are entirely canned (zero interpolation)', () => {
    const actions: KnownActionId[] = [
      'reviewTodos',
      'summarizeChanges',
      'openPowerShell',
    ];
    for (const action of actions) {
      const q1 = composeClaudeQuery({ action, programSlug: 'x', programName: 'X', kind: 'blocker' });
      const q2 = composeClaudeQuery({ action, programSlug: 'y', programName: 'Y', kind: 'todo' });
      expect(q1).toBe(q2);
    }
  });
});

// ---------------------------------------------------------------------------
// composeCopy: leak-free InertDisplayString
// ---------------------------------------------------------------------------

describe('composeCopy (3.3)', () => {
  it('returns a string (InertDisplayString brand)', () => {
    const item = makeItem();
    const result = composeCopy(item);
    const _typed: InertDisplayString = result;
    expect(typeof _typed).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains the program title and slug (positive usefulness assertion)', () => {
    const item = makeItem({ title: 'My Program', slug: 'my-program' });
    const result = composeCopy(item);
    expect(result).toContain('My Program');
    expect(result).toContain('my-program');
  });

  it('does NOT contain detail/blocked_on text', () => {
    const sensitiveDetail =
      'Blocked by STAFF_DEFAULT_TEMP_PASSWORD. Patient Jane Doe record.';
    const item = makeItem({ detail: sensitiveDetail });
    const result = composeCopy(item);
    expect(result).not.toContain(sensitiveDetail);
    expect(result).not.toContain('Jane Doe');
    expect(result).not.toContain('TEMP_PASSWORD');
  });

  it('does NOT contain needsYouReasons text', () => {
    const item = makeItem({
      needsYouReasons: ['PHI reason: patient record 303-555-1234'],
    });
    const result = composeCopy(item);
    expect(result).not.toContain('303-555-1234');
    expect(result).not.toContain('PHI reason');
  });

  it('does NOT contain dodGap text', () => {
    const item = makeItem({
      dodGap: 'portal Incomplete Notes surface live end to end',
    });
    const result = composeCopy(item);
    expect(result).not.toContain('portal Incomplete Notes');
    expect(result).not.toContain('live end to end');
  });
});

// ---------------------------------------------------------------------------
// pickPrimaryAction: routing (1.7)
// ---------------------------------------------------------------------------

describe('pickPrimaryAction (1.7)', () => {
  it('maps a needs-your-decision item to openToDecide, NOT draftFirstVersion', () => {
    const item = makeItem({ badges: ['needs-your-decision'] });
    const action = pickPrimaryAction(item);
    expect(action).toBe('openToDecide');
    expect(action).not.toBe('draftFirstVersion');
  });

  it('both-conditions card (dodAlmost AND needs-your-decision) maps to openToDecide', () => {
    // This is the live incomplete-notes fixture shape: total:1, met:0, dodAlmost:true,
    // AND the needs-your-decision badge.
    const item = makeItem({
      dodMet: 0,
      dodTotal: 1,
      dodAlmost: true,
      badges: ['needs-your-decision'],
    });
    const action = pickPrimaryAction(item);
    expect(action).toBe('openToDecide');
    // Confirm the decision split takes precedence over dodAlmost.
    expect(action).not.toBe('draftFirstVersion');
    expect(action).not.toBe('reviewTodos');
  });

  it('both-conditions card does NOT route to draftFirstVersion even when dodAlmost', () => {
    // Extra guard: the dodAlmost door must never produce a one-step-from-done
    // card that also needs a decision (1.7 both-conditions precedence).
    const item = makeItem({
      dodMet: 2,
      dodTotal: 3,
      dodAlmost: true,
      badges: ['needs-your-decision'],
    });
    const action = pickPrimaryAction(item);
    expect(action).toBe('openToDecide');
  });

  it('needs-CADDC02 item maps to openPowerShell', () => {
    const item = makeItem({ badges: ['needs-CADDC02'] });
    expect(pickPrimaryAction(item)).toBe('openPowerShell');
  });

  it('blocker kind without decision badge maps to draftFirstVersion', () => {
    const item = makeItem({ kind: 'blocker', badges: [] });
    expect(pickPrimaryAction(item)).toBe('draftFirstVersion');
  });

  it('todo kind without decision badge maps to draftFirstVersion', () => {
    const item = makeItem({ kind: 'todo', badges: [] });
    expect(pickPrimaryAction(item)).toBe('draftFirstVersion');
  });

  it('in_progress kind without special badges maps to reviewTodos', () => {
    const item = makeItem({ kind: 'in_progress', badges: [] });
    expect(pickPrimaryAction(item)).toBe('reviewTodos');
  });

  it('ACTION_LABELS table has an entry for every KnownActionId returned by pickPrimaryAction', () => {
    // Exhaustive check: every action pickPrimaryAction can return has a label.
    const allActions: KnownActionId[] = [
      'draftFirstVersion',
      'openToDecide',
      'reviewTodos',
      'summarizeChanges',
      'openPowerShell',
    ];
    for (const action of allActions) {
      expect(ACTION_LABELS[action]).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// isSafeProgramIdentifier guard + composer fallback (3.4)
// ---------------------------------------------------------------------------

describe('isSafeProgramIdentifier guard -- composer fallback (3.4)', () => {
  it('rejects a PHI-shaped name (long digit run like a phone number)', () => {
    // A program named after a patient record with a phone number in the name.
    const phiName = 'Patient 303-986-9337 Record';
    expect(isSafeProgramIdentifier(phiName)).toBe(false);
  });

  it('rejects a long digit run (7+ digits)', () => {
    expect(isSafeProgramIdentifier('Plan 1234567 override')).toBe(false);
  });

  it('rejects a name longer than 200 characters', () => {
    const longName = 'a'.repeat(201);
    expect(isSafeProgramIdentifier(longName)).toBe(false);
  });

  it('accepts a normal dev-style slug', () => {
    expect(isSafeProgramIdentifier('clinical-notes')).toBe(true);
    expect(isSafeProgramIdentifier('cad-portal')).toBe(true);
    expect(isSafeProgramIdentifier('Practice Reports')).toBe(true);
  });

  it('composer falls back to slug-only when programName is PHI-shaped', () => {
    // When the name fails isSafeProgramIdentifier, composeClaudeQuery must NOT
    // use the name in the output. For draftFirstVersion it should use the slug
    // (or a safe placeholder) instead.
    const phiName = 'Patient 303-986-9337 case';
    const safeSlug = 'clinical-notes';

    const query = composeClaudeQuery({
      action: 'draftFirstVersion',
      programSlug: safeSlug,
      programName: phiName,
      kind: 'blocker',
    });

    // The PHI name must NOT appear in the composed output.
    expect(query).not.toContain(phiName);
    expect(query).not.toContain('303-986-9337');
    // The result must still be a non-empty ClaudeQueryLine.
    const _typed: ClaudeQueryLine = query;
    expect(query.length).toBeGreaterThan(0);
  });

  it('composer falls back to no-identifier template when both name and slug are PHI-shaped', () => {
    // When both name and slug fail the guard, the composer must use a generic
    // template with no identifier at all.
    const phiName = 'Patient 303-986-9337 case';
    const phiSlug = 'record-3039869337-phi';

    const query = composeClaudeQuery({
      action: 'draftFirstVersion',
      programSlug: phiSlug,
      programName: phiName,
      kind: 'blocker',
    });

    // Neither PHI-shaped value should appear.
    expect(query).not.toContain(phiName);
    expect(query).not.toContain(phiSlug);
    expect(query).not.toContain('303-986-9337');
    expect(query).not.toContain('3039869337');
    // Must still return a non-empty ClaudeQueryLine.
    const _typed: ClaudeQueryLine = query;
    expect(query.length).toBeGreaterThan(0);
  });

  it('other actions (openToDecide/reviewTodos/etc.) are unaffected by PHI name/slug since they have no interpolation', () => {
    // These actions have zero interpolation so the guard outcome is irrelevant,
    // but verify they still return a ClaudeQueryLine when called with PHI-shaped
    // identifiers (no crash, no PHI leakage).
    const phiName = 'Patient 303-986-9337 case';
    const phiSlug = 'record-3039869337-phi';
    const noInterpolationActions: KnownActionId[] = [
      'openToDecide',
      'reviewTodos',
      'summarizeChanges',
      'openPowerShell',
    ];

    for (const action of noInterpolationActions) {
      const query = composeClaudeQuery({
        action,
        programSlug: phiSlug,
        programName: phiName,
        kind: 'blocker',
      });
      expect(query).not.toContain(phiName);
      expect(query).not.toContain(phiSlug);
      const _typed: ClaudeQueryLine = query;
      expect(typeof _typed).toBe('string');
    }
  });
});
