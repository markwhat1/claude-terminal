/**
 * M7: Tests for pure shared helpers:
 *   - formatRelative
 *   - ageColorClass
 *   - consolidateAttention
 *   - resolvePreferredPowershell
 *   - generateId
 *
 * All helpers live in src/shared/; no DOM, no Electron.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  formatRelative,
  ageColorClass,
  consolidateAttention,
  resolvePreferredPowershell,
  generateId,
} from '@shared/dashboard-ui-helpers';

// ---------------------------------------------------------------------------
// formatRelative
// ---------------------------------------------------------------------------

describe('formatRelative', () => {
  const NOW = 1_000_000_000_000; // arbitrary epoch ms anchor

  // Working count-up from statusSince (mode: 'working')
  it('returns "12m" for a 12-minute working session', () => {
    const statusSince = NOW - 12 * 60 * 1000;
    expect(formatRelative(statusSince, NOW, 'working')).toBe('12m');
  });

  it('returns "1m" for a 90-second working session (floor to minute)', () => {
    const statusSince = NOW - 90 * 1000;
    expect(formatRelative(statusSince, NOW, 'working')).toBe('1m');
  });

  it('returns "40s" for a 40-second working session', () => {
    const statusSince = NOW - 40 * 1000;
    expect(formatRelative(statusSince, NOW, 'working')).toBe('40s');
  });

  it('returns "3 d" for a 3-day working session', () => {
    const statusSince = NOW - 3 * 24 * 60 * 60 * 1000;
    expect(formatRelative(statusSince, NOW, 'working')).toBe('3 d');
  });

  // Waiting duration from waitingSince (mode: 'waiting')
  it('returns "6m" for a 6-minute waiting duration', () => {
    const waitingSince = NOW - 6 * 60 * 1000;
    expect(formatRelative(waitingSince, NOW, 'waiting')).toBe('6m');
  });

  // Promoted waiting string caps past ~30 minutes
  it('returns a non-numeric band string when promoted waiting exceeds ~30 minutes', () => {
    const waitingSince = NOW - 35 * 60 * 1000; // 35 minutes
    const result = formatRelative(waitingSince, NOW, 'waiting-promoted');
    // Must not be a raw climbing minute number
    expect(result).not.toMatch(/^\d+m$/);
    // Must be a human string (non-empty)
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not return a raw minute count above the promoted threshold', () => {
    const waitingSince = NOW - 60 * 60 * 1000; // 1 hour
    const result = formatRelative(waitingSince, NOW, 'waiting-promoted');
    expect(result).not.toMatch(/^\d+m$/);
  });

  // Below threshold the promoted string still shows a minute
  it('returns a minute string when promoted waiting is below the threshold', () => {
    const waitingSince = NOW - 10 * 60 * 1000; // 10 minutes
    const result = formatRelative(waitingSince, NOW, 'waiting-promoted');
    expect(result).toMatch(/^\d+m$/);
  });

  // Null anchor: must not produce NaN, Infinity, or a 56-year count
  it('returns a stable placeholder (not NaN/Infinity/a large number) when anchor is null for working mode', () => {
    const result = formatRelative(null, NOW, 'working');
    expect(result).not.toContain('NaN');
    expect(result).not.toContain('Infinity');
    expect(result.length).toBeGreaterThan(0);
    // A 56-year-ish count would be ">= 1y" or a huge day count; the placeholder must be short
    expect(result).not.toMatch(/^\d{4,}/); // no 4+ digit number
  });

  it('returns a stable placeholder (not NaN/Infinity) when anchor is null for waiting mode', () => {
    const result = formatRelative(null, NOW, 'waiting');
    expect(result).not.toContain('NaN');
    expect(result).not.toContain('Infinity');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a stable placeholder when anchor is null for waiting-promoted mode', () => {
    const result = formatRelative(null, NOW, 'waiting-promoted');
    expect(result).not.toContain('NaN');
    expect(result).not.toContain('Infinity');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ageColorClass
// ---------------------------------------------------------------------------

describe('ageColorClass', () => {
  // Boundary: day 3 is yellow (< 7, >= 3)
  it('maps green (age_days < 3) to the success token class', () => {
    expect(ageColorClass('green')).toContain('success');
  });

  it('maps yellow (day 3) to the warning token class', () => {
    expect(ageColorClass('yellow')).toContain('warning');
  });

  it('maps orange to the age-orange token class, not the attention token', () => {
    const cls = ageColorClass('orange');
    expect(cls).toContain('age-orange');
    expect(cls).not.toContain('attention');
  });

  it('maps red to the destructive token class', () => {
    expect(ageColorClass('red')).toContain('destructive');
  });

  // off-by-one boundary: day 7 is orange (< 14, >= 7)
  it('orange maps to age-orange, never to success/warning/destructive', () => {
    const cls = ageColorClass('orange');
    expect(cls).not.toContain('success');
    expect(cls).not.toContain('warning');
    expect(cls).not.toContain('destructive');
  });

  // day 14 is red (>= 14)
  it('red maps to destructive, never to age-orange/warning/success', () => {
    const cls = ageColorClass('red');
    expect(cls).not.toContain('age-orange');
    expect(cls).not.toContain('warning');
    expect(cls).not.toContain('success');
  });

  // green must not bleed into the attention class
  it('green maps to success, never to attention', () => {
    const cls = ageColorClass('green');
    expect(cls).not.toContain('attention');
  });
});

// ---------------------------------------------------------------------------
// consolidateAttention
// ---------------------------------------------------------------------------

describe('consolidateAttention', () => {
  it('returns red when any item is red, regardless of others', () => {
    const result = consolidateAttention(['green', 'yellow', 'red', 'orange']);
    expect(result).toBe('red');
  });

  it('returns orange when highest is orange (red absent)', () => {
    const result = consolidateAttention(['green', 'orange', 'yellow']);
    expect(result).toBe('orange');
  });

  it('returns yellow when highest is yellow (red/orange absent)', () => {
    const result = consolidateAttention(['green', 'yellow']);
    expect(result).toBe('yellow');
  });

  it('returns green when all items are green', () => {
    const result = consolidateAttention(['green', 'green', 'green']);
    expect(result).toBe('green');
  });

  it('returns null for an empty list', () => {
    expect(consolidateAttention([])).toBeNull();
  });

  it('orange ranks between red and yellow', () => {
    // orange beats yellow
    expect(consolidateAttention(['yellow', 'orange'])).toBe('orange');
    // red beats orange
    expect(consolidateAttention(['orange', 'red'])).toBe('red');
  });
});

// ---------------------------------------------------------------------------
// resolvePreferredPowershell
// ---------------------------------------------------------------------------

describe('resolvePreferredPowershell', () => {
  it('returns "pwsh" when shellExists is true', () => {
    expect(resolvePreferredPowershell(true)).toBe('pwsh');
  });

  it('returns "powershell" when shellExists is false', () => {
    expect(resolvePreferredPowershell(false)).toBe('powershell');
  });
});

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------

describe('generateId', () => {
  it('generates an id that starts with the given prefix', () => {
    const id = generateId('dash');
    expect(id).toMatch(/^dash-/);
  });

  it('generates an id that starts with a different given prefix', () => {
    const id = generateId('todo');
    expect(id).toMatch(/^todo-/);
  });

  it('generates collision-resistant ids (two calls differ)', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateId('test')));
    // 200 calls should all be unique
    expect(ids.size).toBe(200);
  });

  it('generates an id even with an empty prefix string', () => {
    const id = generateId('');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// platform.ts: pwsh ShellOption in win32 list
// ---------------------------------------------------------------------------

describe('getAllShellOptions win32 pwsh', () => {
  it('includes a pwsh ShellOption with command pwsh.exe in the win32 list', async () => {
    const { getAllShellOptions } = await import('@shared/platform');
    const options = getAllShellOptions('win32');
    const pwsh = options.find((o) => o.id === 'pwsh');
    expect(pwsh).toBeDefined();
    expect(pwsh?.command).toBe('pwsh.exe');
  });
});

// ---------------------------------------------------------------------------
// @shared/* resolves under the web-client vite config (2.7)
// ---------------------------------------------------------------------------

describe('@shared alias in web-client vite config', () => {
  it('web-client vite config declares @shared alias pointing at src/shared', () => {
    const configText = readFileSync(
      path.resolve(__dirname, '../../vite.web.config.mjs'),
      'utf-8',
    );
    expect(configText).toContain('@shared');
    expect(configText).toContain('src/shared');
  });
});
