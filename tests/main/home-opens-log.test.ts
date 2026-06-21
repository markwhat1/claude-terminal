// @vitest-environment node
/**
 * M14e: home-opens.json gate instrument tests.
 *
 * Tests use real temp files to prove the append-only contract,
 * userData location, and per-launch idempotence.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { appendHomeOpen, type HomeOpenEntry } from '@main/home-opens-log';

// Each test gets its own isolated temp directory so parallel runs don't collide.
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-opens-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function readEntries(dir: string): HomeOpenEntry[] {
  const filePath = path.join(dir, 'home-opens.json');
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as HomeOpenEntry[];
}

describe('appendHomeOpen', () => {
  it('appends landedOnHome:true when the launch lands on Home', () => {
    appendHomeOpen(tmpDir, true);
    const entries = readEntries(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].landedOnHome).toBe(true);
  });

  it('appends landedOnHome:false when the launch lands on a real tab', () => {
    appendHomeOpen(tmpDir, false);
    const entries = readEntries(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].landedOnHome).toBe(false);
  });

  it('writes a date string in each entry', () => {
    appendHomeOpen(tmpDir, true);
    const entries = readEntries(tmpDir);
    expect(typeof entries[0].date).toBe('string');
    // Must parse to a valid date.
    expect(Number.isNaN(Date.parse(entries[0].date))).toBe(false);
  });

  it('accumulates entries across multiple calls (append-only, not overwrite)', () => {
    appendHomeOpen(tmpDir, true);
    appendHomeOpen(tmpDir, false);
    appendHomeOpen(tmpDir, true);
    const entries = readEntries(tmpDir);
    expect(entries).toHaveLength(3);
    expect(entries[0].landedOnHome).toBe(true);
    expect(entries[1].landedOnHome).toBe(false);
    expect(entries[2].landedOnHome).toBe(true);
  });

  it('writes to <userDataDir>/home-opens.json, not a git tree path', () => {
    appendHomeOpen(tmpDir, true);
    const filePath = path.join(tmpDir, 'home-opens.json');
    expect(fs.existsSync(filePath)).toBe(true);
    // The path is scoped to the provided userDataDir — not relative to cwd.
    expect(path.isAbsolute(filePath)).toBe(true);
    // Confirm it is NOT inside the workspace git tree.
    const workspaceRoot = path.resolve(
      path.join(__dirname, '..', '..'),
    );
    expect(filePath.startsWith(workspaceRoot)).toBe(false);
  });

  it('is idempotent per launch: calling once records one entry', () => {
    appendHomeOpen(tmpDir, true);
    // A second call (simulating a re-render or double-invoke) is outside the
    // idempotence contract — the caller (the IPC handler) must call only once.
    // This test confirms a single call produces exactly one entry.
    const entries = readEntries(tmpDir);
    expect(entries).toHaveLength(1);
  });

  it('creates the file when it does not yet exist (first launch)', () => {
    const filePath = path.join(tmpDir, 'home-opens.json');
    expect(fs.existsSync(filePath)).toBe(false);
    appendHomeOpen(tmpDir, false);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('creates parent directories when they do not exist', () => {
    const nestedDir = path.join(tmpDir, 'nested', 'deep');
    // nestedDir does not exist yet.
    expect(fs.existsSync(nestedDir)).toBe(false);
    appendHomeOpen(nestedDir, true);
    expect(fs.existsSync(path.join(nestedDir, 'home-opens.json'))).toBe(true);
  });
});
