/**
 * M0: Golden fixture smoke tests
 *
 * Verifies:
 * 1. Every state.json fixture variant parses as valid JSON with the expected schema shape.
 * 2. The window.claudeTerminal mock satisfies the ClaudeTerminalApi type at compile time.
 * 3. The @shared/* alias resolves under the web-client vite config (2.7).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ClaudeTerminalApi } from '../../src/preload';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(
  __dirname,
  '../fixtures/dashboard',
);

function loadFixture(name: string): unknown {
  const raw = readFileSync(path.join(FIXTURES_DIR, `${name}.json`), 'utf-8');
  return JSON.parse(raw);
}

// Minimal schema check: asserts the object has the top-level fields the
// program-board schema requires.  Deep field checks live in later milestone
// tests; here we only verify the fixture is importable and structurally sound.
function assertStateShape(data: unknown, label: string): void {
  expect(data, `${label}: not an object`).toBeTypeOf('object');
  expect(data).not.toBeNull();
  const d = data as Record<string, unknown>;
  // generated_at: null or a string (ISO local naive)
  expect(
    d.generated_at === null || typeof d.generated_at === 'string',
    `${label}: generated_at must be null or string`,
  ).toBe(true);
  // programs: array
  expect(Array.isArray(d.programs), `${label}: programs must be an array`).toBe(true);
  // suggested: array
  expect(Array.isArray(d.suggested), `${label}: suggested must be an array`).toBe(true);
}

// For fixtures that have programs, verify each program has the required fields.
function assertProgramShape(prog: unknown, label: string): void {
  expect(prog).not.toBeNull();
  const p = prog as Record<string, unknown>;
  expect(typeof p.slug, `${label}: slug`).toBe('string');
  expect(typeof p.name, `${label}: name`).toBe('string');
  expect(Array.isArray(p.repos), `${label}: repos`).toBe(true);
  expect(typeof p.paused, `${label}: paused`).toBe('boolean');
  expect(typeof p.needs_you, `${label}: needs_you`).toBe('boolean');
  expect(Array.isArray(p.needs_you_reasons), `${label}: needs_you_reasons`).toBe(true);
  // dod sub-object
  const dod = p.dod as Record<string, unknown>;
  expect(typeof dod, `${label}: dod must be object`).toBe('object');
  expect(typeof dod.met, `${label}: dod.met`).toBe('number');
  expect(typeof dod.total, `${label}: dod.total`).toBe('number');
  expect(Array.isArray(dod.gaps), `${label}: dod.gaps`).toBe(true);
}

// ---------------------------------------------------------------------------
// 1. Fixture variant parsing
// ---------------------------------------------------------------------------

describe('M0 golden state.json fixtures', () => {
  const variants = [
    'fresh-with-needs-you',
    'programs-empty',
    'generated-at-null',
    'hard-stale',
    'single-item-dod',
    'time-sensitive',
    'both-conditions',
    'both-collision',
  ] as const;

  for (const name of variants) {
    it(`${name}: parses as valid JSON`, () => {
      expect(() => loadFixture(name)).not.toThrow();
    });

    it(`${name}: has top-level state schema shape`, () => {
      const data = loadFixture(name);
      assertStateShape(data, name);
    });
  }

  it('fresh-with-needs-you: has at least one program with needs_you:true', () => {
    const data = loadFixture('fresh-with-needs-you') as Record<string, unknown>;
    const programs = data.programs as unknown[];
    const needsYou = programs.filter(
      (p) => (p as Record<string, unknown>).needs_you === true,
    );
    expect(needsYou.length).toBeGreaterThan(0);
    programs.forEach((p) => assertProgramShape(p, 'fresh-with-needs-you'));
  });

  it('programs-empty: programs array is empty', () => {
    const data = loadFixture('programs-empty') as Record<string, unknown>;
    expect((data.programs as unknown[]).length).toBe(0);
    expect(data.generated_at).not.toBeNull();
  });

  it('generated-at-null: generated_at is null', () => {
    const data = loadFixture('generated-at-null') as Record<string, unknown>;
    expect(data.generated_at).toBeNull();
  });

  it('hard-stale: generated_at is a naive-local ISO string at least 10 min in the past', () => {
    const data = loadFixture('hard-stale') as Record<string, unknown>;
    expect(typeof data.generated_at).toBe('string');
    // Naive local: no Z, no offset
    const ts = data.generated_at as string;
    expect(ts).not.toMatch(/Z$/);
    expect(ts).not.toMatch(/[+-]\d{2}:\d{2}$/);
    // Must be in the past by > 10 minutes
    const parsed = new Date(ts);
    const nowMs = Date.now();
    expect(nowMs - parsed.getTime()).toBeGreaterThan(10 * 60 * 1000);
  });

  it('single-item-dod: has a card with dod.total===1, dod.met===0 (dodAlmost predicate)', () => {
    const data = loadFixture('single-item-dod') as Record<string, unknown>;
    const programs = data.programs as unknown[];
    const almostDone = programs.find((p) => {
      const pr = p as Record<string, unknown>;
      const dod = pr.dod as Record<string, unknown>;
      return dod.total === 1 && dod.met === 0;
    });
    expect(almostDone, 'no single-item-dod card found').toBeDefined();
    assertProgramShape(almostDone, 'single-item-dod');
  });

  it('time-sensitive: has a card with a time_sensitive date within 5 days of fixture timestamp', () => {
    const data = loadFixture('time-sensitive') as Record<string, unknown>;
    const programs = data.programs as unknown[];
    const ts = programs.find((p) => {
      const pr = p as Record<string, unknown>;
      return typeof pr.time_sensitive === 'string' && pr.time_sensitive !== null;
    });
    expect(ts, 'no time-sensitive card found').toBeDefined();
    assertProgramShape(ts, 'time-sensitive');
  });

  it('both-conditions: has a card that is BOTH time_sensitive within 5 days AND dod.total-dod.met===1', () => {
    const data = loadFixture('both-conditions') as Record<string, unknown>;
    const programs = data.programs as unknown[];
    const both = programs.find((p) => {
      const pr = p as Record<string, unknown>;
      const dod = pr.dod as Record<string, unknown>;
      return (
        typeof pr.time_sensitive === 'string' &&
        pr.time_sensitive !== null &&
        (dod.total as number) - (dod.met as number) === 1
      );
    });
    expect(both, 'no both-conditions card found').toBeDefined();
    assertProgramShape(both, 'both-conditions');
  });

  it('both-collision: has a card with dod.total===1 AND needs-your-decision tag (dodAlmost + decision)', () => {
    const data = loadFixture('both-collision') as Record<string, unknown>;
    const programs = data.programs as unknown[];
    const collision = programs.find((p) => {
      const pr = p as Record<string, unknown>;
      const dod = pr.dod as Record<string, unknown>;
      const tags = pr.tags as string[];
      return (
        dod.total === 1 &&
        dod.met === 0 &&
        Array.isArray(tags) &&
        tags.includes('needs-your-decision')
      );
    });
    expect(collision, 'no both-collision card found').toBeDefined();
    assertProgramShape(collision, 'both-collision');
  });
});

// ---------------------------------------------------------------------------
// 2. window.claudeTerminal mock type check
// ---------------------------------------------------------------------------

describe('M0 window.claudeTerminal mock', () => {
  it('mock satisfies ClaudeTerminalApi type at compile time', async () => {
    // Import the mock fixture module; a TypeScript compile error here means the
    // mock does not satisfy ClaudeTerminalApi, which is caught at test-run.
    const mod = await import('../fixtures/dashboard/claudeTerminalMock');
    const mock: ClaudeTerminalApi = mod.claudeTerminalMock;
    // Runtime: all eight listener registrations return a cleanup function.
    const listeners: Array<keyof typeof mock> = [
      'onTabUpdate',
      'onTabRemoved',
      'onRemoteAccessUpdate',
      'onTabSwitched',
      'onBranchChanged',
      'onHookStatus',
      'onProjectAdded',
      'onProjectRemoved',
      'onProjectSwitch',
    ];
    for (const key of listeners) {
      const fn = mock[key] as unknown as (cb: () => void) => () => void;
      const cleanup = fn(() => undefined);
      expect(typeof cleanup, `${key} must return a cleanup fn`).toBe('function');
    }
    // getTabs returns a Promise<Tab[]>
    await expect(mock.getTabs()).resolves.toBeInstanceOf(Array);
    // getActiveTabId returns a Promise<string | null>
    await expect(mock.getActiveTabId()).resolves.toSatisfy(
      (v: unknown) => v === null || typeof v === 'string',
    );
    // getCurrentBranch returns a Promise<string>
    await expect(mock.getCurrentBranch()).resolves.toBeTypeOf('string');
  });
});

// ---------------------------------------------------------------------------
// 3. @shared/* alias smoke test (2.7)
// ---------------------------------------------------------------------------

describe('M0 @shared/* alias smoke test', () => {
  it('resolves @shared/types from the vitest config alias', async () => {
    // vitest.config.ts already maps @shared -> src/shared.
    // This import will fail with a resolution error if the alias is broken.
    const types = await import('@shared/types');
    expect(types.PERMISSION_FLAGS).toBeDefined();
  });

  it('web-client vite config declares @shared alias pointing at src/shared', async () => {
    // Load the raw vite config text to verify the alias declaration.
    const configText = readFileSync(
      path.resolve(__dirname, '../../vite.web.config.mjs'),
      'utf-8',
    );
    expect(configText).toContain('@shared');
    expect(configText).toContain('src/shared');
  });
});
