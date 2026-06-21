/**
 * M4b: done-lane resolved-set (progress-guarded close detection + closed.json
 * persistence) on ProgramBoardReader.
 *
 * A close is counted when a card LEAVES the needs-you set across polls AND a
 * progress signal advanced in the same window:
 *   - dod.met increased, OR
 *   - lane became 'done', OR
 *   - last_commit.iso advanced, OR
 *   - the DECIDED-AND-WORKED close: a needs-your-decision tag clearing when
 *     last_commit.iso is within ~1 day AND the card is NOT a simultaneously
 *     lapsing time_sensitive.
 *
 * A lapsed deadline / a tag edited out with no commit / an aged-out stalled
 * reason pays NOTHING.
 *
 * The resolved set is appended to app.getPath('userData')/dashboard/closed.json
 * (here: an injected temp dir), pruned past 24h, surfaced as closedRecent
 * (frozen to its session-high so 24h pruning never decrements it mid-session),
 * and reconstructed ONCE at construction (an _initialized guard so a second
 * project-open does not re-wipe).
 *
 * avoidanceClose is RESERVED-NULL in Phase 1 and never set by M4b.
 *
 * All tests use a real temp closed.json file.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ProgramBoardReader } from '@main/program-board-reader';

// ---------------------------------------------------------------------------
// Card / state builders
// ---------------------------------------------------------------------------

interface BuildCardOpts {
  slug?: string;
  name?: string;
  tags?: string[];
  timeSensitive?: string | null;
  paused?: boolean;
  lane?: string;
  dodMet?: number;
  dodTotal?: number;
  lastCommitIso?: string | null;
  needsYou?: boolean;
  needsYouReasons?: string[];
}

function buildCard(opts: BuildCardOpts = {}): Record<string, unknown> {
  const slug = opts.slug ?? 'demo-program';
  return {
    slug,
    name: opts.name ?? 'Demo Program',
    repos: ['demo-repo'],
    sources: ['override'],
    tags: opts.tags ?? [],
    time_sensitive: opts.timeSensitive ?? null,
    blocked_on: '',
    paused: opts.paused ?? false,
    git: {
      last_commit:
        opts.lastCommitIso === null
          ? null
          : {
              sha: 'abc1234',
              iso: opts.lastCommitIso ?? '2026-06-20T12:00:00-06:00',
              msg: 'work',
              repo: 'demo-repo',
            },
      age_days: 0,
      uncommitted: false,
      unmerged_branch: null,
    },
    dod: {
      met: opts.dodMet ?? 0,
      total: opts.dodTotal ?? 3,
      gaps: ['gap-a', 'gap-b', 'gap-c'],
    },
    last_touched: opts.lastCommitIso ?? '2026-06-20T12:00:00-06:00',
    lane: opts.lane ?? 'active',
    age_color: 'green',
    needs_you: opts.needsYou ?? true,
    needs_you_reasons: opts.needsYouReasons ?? ['needs-your-decision'],
  };
}

function buildState(programs: Record<string, unknown>[], generatedAt = '2026-06-21T01:00:00'): string {
  return JSON.stringify({
    generated_at: generatedAt,
    programs,
    suggested: [],
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ProgramBoardReader M4b resolved-set', () => {
  let tmpDir: string;
  let stateFile: string;
  let userDataDir: string;
  let closedFile: string;

  // A fixed "now" we feed the reader so the within-1-day window is deterministic.
  // NOW is anchored to an explicit UTC instant (the trailing Z) so the
  // within-~1-day commit window is independent of the test machine's timezone.
  const NOW = new Date('2026-06-21T07:00:00Z');
  const nowFn = () => NOW;

  // A commit 5h before NOW: comfortably inside the ~1-day decided-and-worked
  // window. Offset-bearing (Z) so parseOffsetAware reads it as an absolute time.
  const FRESH_COMMIT = new Date(NOW.getTime() - 5 * 60 * 60 * 1000).toISOString();
  // A commit 11 days before NOW: well outside the ~1-day window (a stale commit).
  const STALE_COMMIT = new Date(NOW.getTime() - 11 * 24 * 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'pb-m4b-state-'));
    stateFile = path.join(tmpDir, 'state.json');
    userDataDir = mkdtempSync(path.join(tmpdir(), 'pb-m4b-userdata-'));
    closedFile = path.join(userDataDir, 'dashboard', 'closed.json');
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function makeReader() {
    return new ProgramBoardReader(stateFile, tmpDir, {
      pollIntervalMs: 3_600_000,
      retryDelayMs: 1,
      userDataDir,
      now: nowFn,
    });
  }

  // -------------------------------------------------------------------------
  // (1) dod.met increase + leaving needs-you increments closedRecent
  // -------------------------------------------------------------------------

  it('increments closedRecent when a card leaves needs-you WITH a dod.met increase', async () => {
    // Poll 1: card needs you, dod.met = 1.
    writeFileSync(
      stateFile,
      buildState([
        buildCard({ dodMet: 1, dodTotal: 3, needsYou: true, needsYouReasons: ['recent-commit'] }),
      ]),
      'utf-8',
    );
    const reader = makeReader();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 10));
    expect(reader.getClosedRecent()).toBe(0);

    // Poll 2: card no longer needs you, dod.met increased to 2.
    writeFileSync(
      stateFile,
      buildState([
        buildCard({ dodMet: 2, dodTotal: 3, needsYou: false, needsYouReasons: [] }),
      ]),
      'utf-8',
    );
    await reader.poll();

    expect(reader.getClosedRecent()).toBe(1);
    reader.stop();
  });

  // -------------------------------------------------------------------------
  // (2) decided-and-worked: needs-your-decision clears WITH a fresh commit
  // -------------------------------------------------------------------------

  it('increments closedRecent AND sets decidedAndWorked when a needs-your-decision card clears with a fresh commit (within ~1 day, not a lapsing deadline)', async () => {
    // Commit within ~1 day of NOW (see FRESH_COMMIT, 5h before NOW).
    const freshCommit = FRESH_COMMIT;

    // Poll 1: needs-your-decision, no time_sensitive.
    writeFileSync(
      stateFile,
      buildState([
        buildCard({
          needsYou: true,
          needsYouReasons: ['needs-your-decision'],
          tags: ['needs-your-decision'],
          lastCommitIso: freshCommit,
          dodMet: 0,
          dodTotal: 0,
          lane: 'active',
        }),
      ]),
      'utf-8',
    );
    const reader = makeReader();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 10));
    expect(reader.getClosedRecent()).toBe(0);

    // Poll 2: decision tag removed, card no longer needs you, SAME commit
    // (the tag cleared but no NEW commit -> only the decided-and-worked branch
    //  can pay, and it pays because the commit is fresh within ~1 day).
    writeFileSync(
      stateFile,
      buildState([
        buildCard({
          needsYou: false,
          needsYouReasons: [],
          tags: [],
          lastCommitIso: freshCommit,
          dodMet: 0,
          dodTotal: 0,
          lane: 'active',
        }),
      ]),
      'utf-8',
    );
    await reader.poll();

    expect(reader.getClosedRecent()).toBe(1);
    const recent = reader.getRecentCloses();
    expect(recent).toHaveLength(1);
    expect(recent[0].decidedAndWorked).toBe(true);
    reader.stop();
  });

  // -------------------------------------------------------------------------
  // (3) a time_sensitive merely expiring does NOT increment (over-fire fixture)
  // -------------------------------------------------------------------------

  it('does NOT increment when a time_sensitive card merely expires (no dod change, no new commit)', async () => {
    const staleCommit = STALE_COMMIT; // > 1 day before NOW

    // Poll 1: time-sensitive, needs you.
    writeFileSync(
      stateFile,
      buildState([
        buildCard({
          needsYou: true,
          needsYouReasons: ['time-sensitive 2026-06-20'],
          tags: ['time-sensitive'],
          timeSensitive: '2026-06-20',
          lastCommitIso: staleCommit,
          dodMet: 0,
          dodTotal: 2,
          lane: 'blocked',
        }),
      ]),
      'utf-8',
    );
    const reader = makeReader();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 10));
    expect(reader.getClosedRecent()).toBe(0);

    // Poll 2: deadline passed, card no longer needs you, SAME stale commit,
    // SAME dod.met. The work was undone -> pays nothing.
    writeFileSync(
      stateFile,
      buildState([
        buildCard({
          needsYou: false,
          needsYouReasons: [],
          tags: ['time-sensitive'],
          timeSensitive: '2026-06-20',
          lastCommitIso: staleCommit,
          dodMet: 0,
          dodTotal: 2,
          lane: 'blocked',
        }),
      ]),
      'utf-8',
    );
    await reader.poll();

    expect(reader.getClosedRecent()).toBe(0);
    reader.stop();
  });

  // -------------------------------------------------------------------------
  // (4) bare tag deletion (no commit) does NOT increment (bare-tag-deletion fixture)
  // -------------------------------------------------------------------------

  it('does NOT increment when a needs-your-decision card clears via a removed tag with NO commit in the same poll', async () => {
    const staleCommit = STALE_COMMIT; // > 1 day before NOW

    // Poll 1: needs-your-decision, stale commit.
    writeFileSync(
      stateFile,
      buildState([
        buildCard({
          needsYou: true,
          needsYouReasons: ['needs-your-decision'],
          tags: ['needs-your-decision'],
          lastCommitIso: staleCommit,
          dodMet: 0,
          dodTotal: 0,
          lane: 'active',
        }),
      ]),
      'utf-8',
    );
    const reader = makeReader();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 10));
    expect(reader.getClosedRecent()).toBe(0);

    // Poll 2: tag silently deleted, no new commit (commit stays stale, > 1 day),
    // no dod tick, no lane->done. The guard must separate this from a real close.
    writeFileSync(
      stateFile,
      buildState([
        buildCard({
          needsYou: false,
          needsYouReasons: [],
          tags: [],
          lastCommitIso: staleCommit,
          dodMet: 0,
          dodTotal: 0,
          lane: 'active',
        }),
      ]),
      'utf-8',
    );
    await reader.poll();

    expect(reader.getClosedRecent()).toBe(0);
    reader.stop();
  });

  // -------------------------------------------------------------------------
  // (5) displayed closedRecent does NOT decrease within a session from pruning
  // -------------------------------------------------------------------------

  it('freezes the displayed closedRecent to its session-high so 24h pruning never decrements it mid-session', async () => {
    // Seed closed.json with TWO entries: one recent, one about to prune past 24h.
    const recentClose = {
      id: 'pb:recent-one',
      closedAt: new Date('2026-06-21T00:30:00').toISOString(), // within 24h of NOW
      decidedAndWorked: false,
      avoidanceClose: null,
    };
    const oldClose = {
      id: 'pb:old-one',
      // 23h59m before NOW -> counted at construction, will prune on a later poll.
      closedAt: new Date('2026-06-20T01:01:00').toISOString(),
      decidedAndWorked: false,
      avoidanceClose: null,
    };
    writeSeededClosed([recentClose, oldClose]);

    // State with no qualifying crossings so no NEW closes are added.
    writeFileSync(stateFile, buildState([buildCard({ needsYou: true })]), 'utf-8');

    const reader = makeReader();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 10));

    // At construction both seeded entries are within 24h -> displayed 2.
    expect(reader.getClosedRecent()).toBe(2);

    // A later poll prunes the old entry (now older than 24h relative to NOW since
    // NOW is fixed and oldClose is 23h59m old; we simulate by advancing the
    // reader's clock past the prune boundary).
    reader.setNowForTest(new Date('2026-06-21T01:30:00')); // oldClose now > 24h old
    await reader.poll();

    // The PERSISTED/pruned set drops the old entry, but the DISPLAYED count is
    // frozen to its session-high of 2 and never ticks down mid-session.
    expect(reader.getClosedRecent()).toBe(2);
    reader.stop();
  });

  // -------------------------------------------------------------------------
  // (6) avoidanceClose is false for a non-avoidance close (M13 update)
  //
  // M4b reserved this field as null. M13 now sets it to boolean: true when
  // the closed card carried an avoidance category, false otherwise.
  // A plain needs-your-decision card with empty blocked_on produces false.
  // -------------------------------------------------------------------------

  it('sets avoidanceClose:false for a non-avoidance close (M13)', async () => {
    const freshCommit = FRESH_COMMIT;

    writeFileSync(
      stateFile,
      buildState([
        buildCard({
          needsYou: true,
          needsYouReasons: ['needs-your-decision'],
          tags: ['needs-your-decision'],
          lastCommitIso: freshCommit,
          dodMet: 0,
          dodTotal: 0,
        }),
      ]),
      'utf-8',
    );
    const reader = makeReader();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 10));

    writeFileSync(
      stateFile,
      buildState([
        buildCard({
          needsYou: false,
          needsYouReasons: [],
          tags: [],
          lastCommitIso: freshCommit,
          dodMet: 0,
          dodTotal: 0,
        }),
      ]),
      'utf-8',
    );
    await reader.poll();

    const recent = reader.getRecentCloses();
    expect(recent).toHaveLength(1);
    // M13: non-avoidance card gets avoidanceClose:false (not null).
    expect(recent[0].avoidanceClose).toBe(false);

    // Also assert it survives the persist round-trip as false.
    const persisted = JSON.parse(readFileSync(closedFile, 'utf-8')) as Array<Record<string, unknown>>;
    expect(persisted[0].avoidanceClose).toBe(false);
    reader.stop();
  });

  // -------------------------------------------------------------------------
  // (7) reconstruct-once + prune >24h
  // -------------------------------------------------------------------------

  it('reconstructs the set from a seeded closed.json ONCE at construction and prunes >24h entries', async () => {
    const within = {
      id: 'pb:within-24h',
      closedAt: new Date('2026-06-21T00:00:00').toISOString(), // 1h before NOW
      decidedAndWorked: true,
      avoidanceClose: null,
    };
    const expired = {
      id: 'pb:older-than-24h',
      closedAt: new Date('2026-06-19T00:00:00').toISOString(), // ~49h before NOW
      decidedAndWorked: false,
      avoidanceClose: null,
    };
    writeSeededClosed([within, expired]);

    writeFileSync(stateFile, buildState([buildCard({ needsYou: true })]), 'utf-8');

    const reader = makeReader();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 10));

    // The expired entry is pruned at construction; only the within-24h entry counts.
    expect(reader.getClosedRecent()).toBe(1);
    const recent = reader.getRecentCloses();
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe('pb:within-24h');
    reader.stop();
  });

  it('does NOT re-wipe the reconstructed set on a second construction (reconstruct-once / _initialized guard)', async () => {
    // Reader 1 reconstructs and adds a fresh close.
    const seeded = {
      id: 'pb:seeded',
      closedAt: new Date('2026-06-21T00:00:00').toISOString(),
      decidedAndWorked: false,
      avoidanceClose: null,
    };
    writeSeededClosed([seeded]);

    const freshCommit = FRESH_COMMIT;
    writeFileSync(
      stateFile,
      buildState([
        buildCard({ slug: 'other', needsYou: true, needsYouReasons: ['needs-your-decision'], tags: ['needs-your-decision'], lastCommitIso: freshCommit, dodMet: 0, dodTotal: 0 }),
      ]),
      'utf-8',
    );
    const reader1 = makeReader();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 10));
    expect(reader1.getClosedRecent()).toBe(1); // the seeded entry

    // Drive a real close on reader1.
    writeFileSync(
      stateFile,
      buildState([
        buildCard({ slug: 'other', needsYou: false, needsYouReasons: [], tags: [], lastCommitIso: freshCommit, dodMet: 0, dodTotal: 0 }),
      ]),
      'utf-8',
    );
    await reader1.poll();
    expect(reader1.getClosedRecent()).toBe(2); // seeded + new close
    reader1.stop();

    // closed.json now holds 2 entries. A SECOND construction (a second project
    // open mid-session) reconstructs from disk and must NOT re-wipe.
    const reader2 = makeReader();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 10));
    expect(reader2.getClosedRecent()).toBe(2);
    reader2.stop();

    // The on-disk file still holds both entries after reader2 construction.
    const persisted = JSON.parse(readFileSync(closedFile, 'utf-8')) as unknown[];
    expect(persisted).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // (8) the resolved path is under userData, not the workspace dashboard tree
  // -------------------------------------------------------------------------

  it('writes closed.json under userData/dashboard, never the workspace dashboard tree', async () => {
    const freshCommit = FRESH_COMMIT;
    writeFileSync(
      stateFile,
      buildState([
        buildCard({ needsYou: true, needsYouReasons: ['needs-your-decision'], tags: ['needs-your-decision'], lastCommitIso: freshCommit, dodMet: 0, dodTotal: 0 }),
      ]),
      'utf-8',
    );
    const reader = makeReader();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 10));

    writeFileSync(
      stateFile,
      buildState([
        buildCard({ needsYou: false, needsYouReasons: [], tags: [], lastCommitIso: freshCommit, dodMet: 0, dodTotal: 0 }),
      ]),
      'utf-8',
    );
    await reader.poll();

    // closed.json exists under userData/dashboard.
    expect(existsSync(closedFile)).toBe(true);
    // The resolver path begins with the injected userData dir.
    const resolvedClosedPath = reader.getClosedFilePath();
    expect(resolvedClosedPath).not.toBeNull();
    expect(resolvedClosedPath!.startsWith(userDataDir)).toBe(true);
    // It is NOT in the workspace state tree (tmpDir holds state.json).
    expect(resolvedClosedPath!.startsWith(tmpDir)).toBe(false);
    // No closed.json was written into the workspace dashboard dir.
    expect(existsSync(path.join(tmpDir, 'dashboard', 'closed.json'))).toBe(false);
    reader.stop();
  });

  // -------------------------------------------------------------------------
  // (9) lane became 'done' is a qualifying progress signal
  // -------------------------------------------------------------------------

  it('increments closedRecent when a card leaves needs-you AND its lane becomes done', async () => {
    writeFileSync(
      stateFile,
      buildState([buildCard({ lane: 'active', needsYou: true, needsYouReasons: ['recent-commit'], dodMet: 1, dodTotal: 3 })]),
      'utf-8',
    );
    const reader = makeReader();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 10));

    writeFileSync(
      stateFile,
      buildState([buildCard({ lane: 'done', needsYou: false, needsYouReasons: [], dodMet: 1, dodTotal: 3 })]),
      'utf-8',
    );
    await reader.poll();

    expect(reader.getClosedRecent()).toBe(1);
    reader.stop();
  });

  // -------------------------------------------------------------------------
  // Helper: seed a closed.json on disk before constructing the reader
  // -------------------------------------------------------------------------

  function writeSeededClosed(entries: unknown[]) {
    const dir = path.dirname(closedFile);
    if (!existsSync(dir)) {
      // mkdir -p
      const { mkdirSync } = require('node:fs');
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(closedFile, JSON.stringify(entries), 'utf-8');
  }
});
