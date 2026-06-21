/**
 * M13: Tests for the avoidanceClose settle flag.
 *
 * When a needs-you card carrying an avoidance category closes with a progress
 * signal, the ClosedRecord.avoidanceClose flag is set to true (not null).
 *
 * Covers:
 *   - A card with avoidanceCategory set that closes with a commit advances
 *     produces avoidanceClose:true.
 *   - A card WITHOUT an avoidance category that closes with a commit produces
 *     avoidanceClose:false (not true).
 *   - A card with avoidance category that closes via a lapsed deadline produces
 *     avoidanceClose:false (lapse-never-pays guard still holds).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProgramBoardReader } from '@main/program-board-reader';
import type { ProgramBoardState } from '@shared/program-board-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Writes a state.json file and returns the reader pointed at it. */
function writeState(dir: string, state: ProgramBoardState): void {
  const stateFile = path.join(dir, 'dashboard', 'state.json');
  writeFileSync(stateFile, JSON.stringify(state));
}

function makeState(programs: ProgramBoardState['programs']): ProgramBoardState {
  return {
    generated_at: new Date().toISOString().replace('T', ' ').split('.')[0],
    programs,
    suggested: [],
  };
}

/** A card that needs-you with avoidance text in blocked_on. */
function avoidanceCard(overrides: Partial<ProgramBoardState['programs'][0]> = {}): ProgramBoardState['programs'][0] {
  const NOW_ISO = '2026-06-21T09:00:00-06:00';
  return {
    slug: 'marketing-roi',
    name: 'Marketing ROI',
    repos: ['practice-analytics'],
    sources: [],
    tags: [],
    time_sensitive: null,
    blocked_on: 'draft the marketing campaign copy',
    paused: false,
    git: {
      last_commit: {
        sha: 'abc123',
        iso: NOW_ISO,
        msg: 'wip',
        repo: 'practice-analytics',
      },
      age_days: 0,
      uncommitted: false,
      unmerged_branch: null,
    },
    dod: { met: 0, total: 0, gaps: [] },
    last_touched: null,
    lane: 'active',
    age_color: 'red',
    needs_you: true,
    needs_you_reasons: ['needs-your-decision'],
    ...overrides,
  };
}

/** A card that needs-you with no avoidance text. */
function normalCard(overrides: Partial<ProgramBoardState['programs'][0]> = {}): ProgramBoardState['programs'][0] {
  const NOW_ISO = '2026-06-21T09:00:00-06:00';
  return {
    slug: 'cad-portal',
    name: 'CAD Portal',
    repos: ['cad-portal'],
    sources: [],
    tags: [],
    time_sensitive: null,
    blocked_on: 'fix the tests',
    paused: false,
    git: {
      last_commit: {
        sha: 'def456',
        iso: NOW_ISO,
        msg: 'fix tests',
        repo: 'cad-portal',
      },
      age_days: 0,
      uncommitted: false,
      unmerged_branch: null,
    },
    dod: { met: 0, total: 0, gaps: [] },
    last_touched: null,
    lane: 'active',
    age_color: 'green',
    needs_you: true,
    needs_you_reasons: ['needs-your-decision'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test setup/teardown
// ---------------------------------------------------------------------------

let tmpDir: string;
let stateFilePath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'avoidance-close-test-'));
  mkdirSync(path.join(tmpDir, 'dashboard'), { recursive: true });
  stateFilePath = path.join(tmpDir, 'dashboard', 'state.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// avoidanceClose on qualifying closes
// ---------------------------------------------------------------------------

describe('ProgramBoardReader avoidanceClose flag (M13)', () => {
  it('sets avoidanceClose:true when an avoidance-category card closes with a commit', async () => {
    const CLOSE_ISO = '2026-06-21T09:00:00-06:00';
    const now = new Date('2026-06-21T09:30:00-06:00');

    // First state: the avoidance card needs-you
    const state1 = makeState([avoidanceCard({ needs_you: true })]);
    writeState(tmpDir, state1);

    const reader = new ProgramBoardReader(stateFilePath, path.dirname(path.dirname(stateFilePath)), {
      pollIntervalMs: 100_000,
      retryDelayMs: 0,
      maxRetries: 0,
      userDataDir: tmpDir,
      now: () => now,
    });
    await reader.poll();

    // Second state: the card left needs-you, decision marker cleared, commit advanced.
    const state2 = makeState([
      avoidanceCard({
        needs_you: false,
        // Decision marker cleared (the "decided and worked" predicate).
        needs_you_reasons: [],
        tags: [],
        git: {
          last_commit: {
            sha: 'newer999',
            iso: CLOSE_ISO,
            msg: 'done',
            repo: 'practice-analytics',
          },
          age_days: 0,
          uncommitted: false,
          unmerged_branch: null,
        },
      }),
    ]);
    writeState(tmpDir, state2);
    await reader.poll();

    const closes = reader.getRecentCloses();
    expect(closes.length).toBeGreaterThan(0);
    const marketingClose = closes.find((c) => c.id === 'pb:marketing-roi');
    expect(marketingClose).toBeDefined();
    expect(marketingClose!.avoidanceClose).toBe(true);

    reader.stop();
  });

  it('sets avoidanceClose:false when a non-avoidance card closes with a commit', async () => {
    // Use a newer commit to trigger commitAdvanced (prev ISO must be strictly older).
    const PREV_COMMIT_ISO = '2026-06-20T08:00:00-06:00';
    const CLOSE_ISO = '2026-06-21T09:00:00-06:00';
    const now = new Date('2026-06-21T09:30:00-06:00');

    const state1 = makeState([
      normalCard({
        needs_you: true,
        needs_you_reasons: [],
        tags: [],
        git: {
          last_commit: {
            sha: 'old111',
            iso: PREV_COMMIT_ISO,
            msg: 'earlier work',
            repo: 'cad-portal',
          },
          age_days: 1,
          uncommitted: false,
          unmerged_branch: null,
        },
      }),
    ]);
    writeState(tmpDir, state1);

    const reader = new ProgramBoardReader(stateFilePath, path.dirname(path.dirname(stateFilePath)), {
      pollIntervalMs: 100_000,
      retryDelayMs: 0,
      maxRetries: 0,
      userDataDir: tmpDir,
      now: () => now,
    });
    await reader.poll();

    const state2 = makeState([
      normalCard({
        needs_you: false,
        needs_you_reasons: [],
        tags: [],
        git: {
          last_commit: {
            sha: 'newer999',
            iso: CLOSE_ISO,
            msg: 'done',
            repo: 'cad-portal',
          },
          age_days: 0,
          uncommitted: false,
          unmerged_branch: null,
        },
      }),
    ]);
    writeState(tmpDir, state2);
    await reader.poll();

    const closes = reader.getRecentCloses();
    const portalClose = closes.find((c) => c.id === 'pb:cad-portal');
    expect(portalClose).toBeDefined();
    // avoidanceClose should be false (not null, not true) for a non-avoidance card
    expect(portalClose!.avoidanceClose).toBe(false);

    reader.stop();
  });

  it('does NOT set avoidanceClose:true for a lapsed-deadline crossing (lapse-never-pays)', async () => {
    // A card with time_sensitive in the past that leaves needs-you with NO commit
    // advance should pay nothing, including no avoidanceClose.
    const YESTERDAY_DATE = '2026-06-20';
    const now = new Date('2026-06-21T09:30:00-06:00');
    const OLD_COMMIT_ISO = '2026-06-15T09:00:00-06:00'; // old commit, 6 days ago

    const state1 = makeState([
      avoidanceCard({
        needs_you: true,
        time_sensitive: YESTERDAY_DATE,
        git: {
          last_commit: {
            sha: 'old123',
            iso: OLD_COMMIT_ISO,
            msg: 'old work',
            repo: 'practice-analytics',
          },
          age_days: 6,
          uncommitted: false,
          unmerged_branch: null,
        },
      }),
    ]);
    writeState(tmpDir, state1);

    const reader = new ProgramBoardReader(stateFilePath, path.dirname(path.dirname(stateFilePath)), {
      pollIntervalMs: 100_000,
      retryDelayMs: 0,
      maxRetries: 0,
      userDataDir: tmpDir,
      now: () => now,
    });
    await reader.poll();

    // Card leaves needs-you with NO new commit (same old commit, deadline just lapsed)
    const state2 = makeState([
      avoidanceCard({
        needs_you: false,
        time_sensitive: YESTERDAY_DATE,
        git: {
          last_commit: {
            sha: 'old123', // same commit
            iso: OLD_COMMIT_ISO,
            msg: 'old work',
            repo: 'practice-analytics',
          },
          age_days: 6,
          uncommitted: false,
          unmerged_branch: null,
        },
        needs_you_reasons: [],
        tags: [],
      }),
    ]);
    writeState(tmpDir, state2);
    await reader.poll();

    // No qualifying close: lapse-never-pays guard
    const closes = reader.getRecentCloses();
    expect(closes.find((c) => c.id === 'pb:marketing-roi')).toBeUndefined();

    reader.stop();
  });
});
