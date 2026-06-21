// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => os.tmpdir()) },
}));

import { SettingsStore } from '@main/settings-store';

describe('SettingsStore', () => {
  let store: SettingsStore;
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `claude-terminal-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    store = new SettingsStore(tmpFile);
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  });

  it('returns empty recent dirs by default', () => {
    expect(store.getRecentDirs()).toEqual([]);
  });

  it('adds a recent directory', async () => {
    await store.addRecentDir('D:\\dev\\MyApp');
    expect(store.getRecentDirs()).toContain('D:\\dev\\MyApp');
  });

  it('moves duplicate to front', async () => {
    await store.addRecentDir('D:\\dev\\A');
    await store.addRecentDir('D:\\dev\\B');
    await store.addRecentDir('D:\\dev\\A');
    const dirs = store.getRecentDirs();
    expect(dirs[0]).toBe('D:\\dev\\A');
    expect(dirs).toHaveLength(2);
  });

  it('limits to 10 recent dirs', async () => {
    for (let i = 0; i < 15; i++) {
      await store.addRecentDir(`D:\\dev\\project${i}`);
    }
    expect(store.getRecentDirs()).toHaveLength(10);
  });

  it('returns bypassPermissions as default permission mode', () => {
    expect(store.getPermissionMode()).toBe('bypassPermissions');
  });

  it('saves and retrieves permission mode', async () => {
    await store.setPermissionMode('plan');
    expect(store.getPermissionMode()).toBe('plan');
  });

  it('persists to disk and reloads', async () => {
    await store.addRecentDir('D:\\dev\\Persist');
    const store2 = new SettingsStore(tmpFile);
    expect(store2.getRecentDirs()).toContain('D:\\dev\\Persist');
  });

  // M14a: startupView getter/setter
  it('returns lastSession as default startupView', () => {
    expect(store.getStartupView()).toBe('lastSession');
  });

  it('round-trips startupView home', async () => {
    await store.setStartupView('home');
    expect(store.getStartupView()).toBe('home');
  });

  it('persists startupView to disk and reloads', async () => {
    await store.setStartupView('home');
    const store2 = new SettingsStore(tmpFile);
    expect(store2.getStartupView()).toBe('home');
  });

  it('tolerates a missing startupView key via DEFAULTS merge', async () => {
    // Write a store file that has no startupView key
    const fs2 = await import('fs/promises');
    await fs2.writeFile(tmpFile, JSON.stringify({ recentDirs: [], permissionMode: 'bypassPermissions', defaultShell: null }), 'utf-8');
    const store2 = new SettingsStore(tmpFile);
    expect(store2.getStartupView()).toBe('lastSession');
  });

  // M14d: notifyOnIdle flag
  it('returns false as default notifyOnIdle', () => {
    expect(store.getNotifyOnIdle()).toBe(false);
  });

  it('round-trips notifyOnIdle true', async () => {
    await store.setNotifyOnIdle(true);
    expect(store.getNotifyOnIdle()).toBe(true);
  });

  it('round-trips notifyOnIdle false after true', async () => {
    await store.setNotifyOnIdle(true);
    await store.setNotifyOnIdle(false);
    expect(store.getNotifyOnIdle()).toBe(false);
  });

  it('persists notifyOnIdle to disk and reloads', async () => {
    await store.setNotifyOnIdle(true);
    const store2 = new SettingsStore(tmpFile);
    expect(store2.getNotifyOnIdle()).toBe(true);
  });

  it('tolerates a missing notifyOnIdle key via DEFAULTS merge (defaults to false)', async () => {
    const fs2 = await import('fs/promises');
    await fs2.writeFile(tmpFile, JSON.stringify({ recentDirs: [], permissionMode: 'bypassPermissions', defaultShell: null }), 'utf-8');
    const store2 = new SettingsStore(tmpFile);
    expect(store2.getNotifyOnIdle()).toBe(false);
  });

  // M14d: notifyOnIdleFirstRunShown flag
  it('returns false as default notifyOnIdleFirstRunShown', () => {
    expect(store.getNotifyOnIdleFirstRunShown()).toBe(false);
  });

  it('round-trips notifyOnIdleFirstRunShown true', async () => {
    await store.setNotifyOnIdleFirstRunShown(true);
    expect(store.getNotifyOnIdleFirstRunShown()).toBe(true);
  });

  it('persists notifyOnIdleFirstRunShown to disk and reloads', async () => {
    await store.setNotifyOnIdleFirstRunShown(true);
    const store2 = new SettingsStore(tmpFile);
    expect(store2.getNotifyOnIdleFirstRunShown()).toBe(true);
  });

  // M16: stallInterrupt flag
  it('returns false as default stallInterrupt', () => {
    expect(store.getStallInterrupt()).toBe(false);
  });

  it('round-trips stallInterrupt true', async () => {
    await store.setStallInterrupt(true);
    expect(store.getStallInterrupt()).toBe(true);
  });

  it('round-trips stallInterrupt false after true', async () => {
    await store.setStallInterrupt(true);
    await store.setStallInterrupt(false);
    expect(store.getStallInterrupt()).toBe(false);
  });

  it('persists stallInterrupt to disk and reloads', async () => {
    await store.setStallInterrupt(true);
    const store2 = new SettingsStore(tmpFile);
    expect(store2.getStallInterrupt()).toBe(true);
  });

  it('tolerates a missing stallInterrupt key via DEFAULTS merge (defaults to false)', async () => {
    const fs2 = await import('fs/promises');
    await fs2.writeFile(tmpFile, JSON.stringify({ recentDirs: [], permissionMode: 'bypassPermissions', defaultShell: null }), 'utf-8');
    const store2 = new SettingsStore(tmpFile);
    expect(store2.getStallInterrupt()).toBe(false);
  });

  // M17: commitmentMirror flag
  it('returns false as default commitmentMirror', () => {
    expect(store.getCommitmentMirror()).toBe(false);
  });

  it('round-trips commitmentMirror true', async () => {
    await store.setCommitmentMirror(true);
    expect(store.getCommitmentMirror()).toBe(true);
  });

  it('round-trips commitmentMirror false after true', async () => {
    await store.setCommitmentMirror(true);
    await store.setCommitmentMirror(false);
    expect(store.getCommitmentMirror()).toBe(false);
  });

  it('persists commitmentMirror to disk and reloads', async () => {
    await store.setCommitmentMirror(true);
    const store2 = new SettingsStore(tmpFile);
    expect(store2.getCommitmentMirror()).toBe(true);
  });

  it('tolerates a missing commitmentMirror key via DEFAULTS merge (defaults to false)', async () => {
    const fs2 = await import('fs/promises');
    await fs2.writeFile(tmpFile, JSON.stringify({ recentDirs: [], permissionMode: 'bypassPermissions', defaultShell: null }), 'utf-8');
    const store2 = new SettingsStore(tmpFile);
    expect(store2.getCommitmentMirror()).toBe(false);
  });

  // M18: morningRitual flag (default OFF, cue-bound to first open)
  it('returns false as default morningRitual', () => {
    expect(store.getMorningRitual()).toBe(false);
  });

  it('round-trips morningRitual true', async () => {
    await store.setMorningRitual(true);
    expect(store.getMorningRitual()).toBe(true);
  });

  it('round-trips morningRitual false after true', async () => {
    await store.setMorningRitual(true);
    await store.setMorningRitual(false);
    expect(store.getMorningRitual()).toBe(false);
  });

  it('persists morningRitual to disk and reloads', async () => {
    await store.setMorningRitual(true);
    const store2 = new SettingsStore(tmpFile);
    expect(store2.getMorningRitual()).toBe(true);
  });

  it('tolerates a missing morningRitual key via DEFAULTS merge (defaults to false)', async () => {
    const fs2 = await import('fs/promises');
    await fs2.writeFile(tmpFile, JSON.stringify({ recentDirs: [], permissionMode: 'bypassPermissions', defaultShell: null }), 'utf-8');
    const store2 = new SettingsStore(tmpFile);
    expect(store2.getMorningRitual()).toBe(false);
  });
});

describe('SettingsStore sessions', () => {
  let store: SettingsStore;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-test-'));
    store = new SettingsStore(path.join(tmpDir, 'settings.json'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getSessions returns empty array when no file exists', async () => {
    const result = await store.getSessions(tmpDir);
    expect(result).toEqual([]);
  });

  it('saveSessions writes and getSessions reads back', async () => {
    const tabs = [{ name: 'Tab 1', cwd: '/tmp', worktree: null, sessionId: 'abc-123' }];
    await store.saveSessions(tmpDir, tabs);
    const result = await store.getSessions(tmpDir);
    expect(result).toEqual(tabs);
  });

  it('saveSessions overwrites previous sessions', async () => {
    const tabs1 = [{ name: 'Tab 1', cwd: '/tmp', worktree: null, sessionId: 'abc' }];
    const tabs2 = [{ name: 'Tab 2', cwd: '/tmp', worktree: null, sessionId: 'def' }];
    await store.saveSessions(tmpDir, tabs1);
    await store.saveSessions(tmpDir, tabs2);
    const result = await store.getSessions(tmpDir);
    expect(result).toEqual(tabs2);
  });

  it('getSessions returns empty array on corrupted JSON', async () => {
    const sessDir = path.join(tmpDir, '.claude-terminal');
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(path.join(sessDir, 'sessions.json'), '{corrupt', 'utf-8');
    const result = await store.getSessions(tmpDir);
    expect(result).toEqual([]);
  });

  it('saveSessions does not throw on bad directory', async () => {
    // Create a file where saveSessions expects a directory — forces ENOTDIR
    const blockingFile = path.join(tmpDir, 'blocker');
    fs.writeFileSync(blockingFile, '');
    const badDir = path.join(blockingFile, 'sessions');
    await expect(store.saveSessions(badDir, [{ name: 'x', cwd: '/', worktree: null, sessionId: 'z' }])).resolves.not.toThrow();
  });
});
