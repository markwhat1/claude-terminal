/**
 * M4: Tests for ProgramBoardReader in src/main/
 *
 * Covers:
 *   - immediate first read on construction (not waiting a poll tick)
 *   - last-good returned on a transient read failure
 *   - isStateJsonPathSafe rejection: reader returns not-running empty state
 *   - read-with-retry via real temp file
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The module under test is in src/main/; we import it here.
// Note: ProgramBoardReader must be Electron-free so it can be imported in the
// jsdom test environment without crashing.
import { ProgramBoardReader } from '@main/program-board-reader';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_STATE = JSON.stringify({
  generated_at: '2026-06-21T01:00:00',
  programs: [
    {
      slug: 'cad-staff-portal',
      name: 'CAD Staff Portal',
      repos: ['cad-portal'],
      sources: ['override'],
      tags: ['needs-CADDC02'],
      time_sensitive: null,
      blocked_on: 'Set the temp password env var.',
      paused: false,
      git: {
        last_commit: { sha: 'abc', iso: '2026-06-20T13:58:10-06:00', msg: 'feat', repo: 'cad-portal' },
        age_days: 0,
        uncommitted: false,
        unmerged_branch: null,
      },
      dod: { met: 0, total: 3, gaps: ['merged', 'deployed', 'ci'] },
      last_touched: '2026-06-20T13:58:10-06:00',
      lane: 'blocked',
      age_color: 'green',
      needs_you: true,
      needs_you_reasons: ['needs-CADDC02'],
    },
  ],
  suggested: [],
});

const VALID_STATE_2 = JSON.stringify({
  generated_at: '2026-06-21T02:00:00',
  programs: [],
  suggested: [],
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ProgramBoardReader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'pb-reader-test-'));
  });

  afterEach(() => {
    // Clean up any temp files
    try {
      unlinkSync(path.join(tmpDir, 'state.json'));
    } catch {
      // ignore
    }
  });

  it('does an immediate first read on construction without waiting a poll tick', async () => {
    const stateFile = path.join(tmpDir, 'state.json');
    writeFileSync(stateFile, VALID_STATE, 'utf-8');

    // Pass a very long poll interval (e.g. 1 hour) so the test does not depend
    // on a timer firing; only the immediate read on construction should produce data.
    const reader = new ProgramBoardReader(stateFile, tmpDir, { pollIntervalMs: 3_600_000 });

    // The immediate read is async, so we wait a moment.
    await new Promise((r) => setImmediate(r));

    const state = reader.getLastGoodState();
    expect(state).not.toBeNull();
    expect(state!.generated_at).toBe('2026-06-21T01:00:00');
    reader.stop();
  });

  it('returns last-good state on a transient read failure', async () => {
    const stateFile = path.join(tmpDir, 'state.json');
    writeFileSync(stateFile, VALID_STATE, 'utf-8');

    const reader = new ProgramBoardReader(stateFile, tmpDir, { pollIntervalMs: 3_600_000 });
    await new Promise((r) => setImmediate(r));

    // Confirm last-good is set.
    expect(reader.getLastGoodState()).not.toBeNull();

    // Now remove the file to simulate a transient ENOENT.
    unlinkSync(stateFile);

    // Trigger a manual poll.
    await reader.poll();

    // Last-good should still be the previously parsed state.
    const state = reader.getLastGoodState();
    expect(state).not.toBeNull();
    expect(state!.generated_at).toBe('2026-06-21T01:00:00');

    // Restore the file with new content.
    writeFileSync(stateFile, VALID_STATE_2, 'utf-8');
    await reader.poll();

    // Now the last-good should update to the new state.
    const updated = reader.getLastGoodState();
    expect(updated).not.toBeNull();
    expect(updated!.generated_at).toBe('2026-06-21T02:00:00');

    reader.stop();
  });

  it('returns the not-running empty state when the path is outside the root', async () => {
    // Build a path that escapes the root.
    const escapedPath = path.join(tmpDir, '..', '..', 'evil.json');
    const reader = new ProgramBoardReader(escapedPath, tmpDir, { pollIntervalMs: 3_600_000 });
    await new Promise((r) => setImmediate(r));

    // getLastGoodState should return the not-running sentinel (generated_at:null).
    const state = reader.getLastGoodState();
    expect(state).not.toBeNull();
    expect(state!.generated_at).toBeNull();
    expect(state!.programs).toHaveLength(0);

    reader.stop();
  });

  it('returns the not-running empty state for a UNC path', async () => {
    const uncPath = '\\\\server\\share\\state.json';
    const reader = new ProgramBoardReader(uncPath, tmpDir, { pollIntervalMs: 3_600_000 });
    await new Promise((r) => setImmediate(r));

    const state = reader.getLastGoodState();
    expect(state!.generated_at).toBeNull();

    reader.stop();
  });

  it('retries on JSON.parse failure and returns last-good', async () => {
    const stateFile = path.join(tmpDir, 'state.json');
    // Write broken JSON.
    writeFileSync(stateFile, '{broken json', 'utf-8');

    const reader = new ProgramBoardReader(stateFile, tmpDir, { pollIntervalMs: 3_600_000, retryDelayMs: 1 });
    await new Promise((r) => setTimeout(r, 50));

    // No good parse yet; getLastGoodState returns the not-running sentinel.
    const state = reader.getLastGoodState();
    expect(state!.generated_at).toBeNull();

    // Now fix the file.
    writeFileSync(stateFile, VALID_STATE, 'utf-8');
    await reader.poll();

    expect(reader.getLastGoodState()!.generated_at).toBe('2026-06-21T01:00:00');
    reader.stop();
  });
});
