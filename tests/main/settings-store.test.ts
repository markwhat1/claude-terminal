// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => os.tmpdir()) },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from('E::' + s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8').replace(/^E::/, ''),
  },
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

  it('returns tailscale as the default remote transport', () => {
    expect(store.getRemoteTransport()).toBe('tailscale');
  });

  it('saves and retrieves the remote transport', async () => {
    await store.setRemoteTransport('cloudflare');
    expect(store.getRemoteTransport()).toBe('cloudflare');
  });

  it('persists the remote transport to disk and reloads', async () => {
    await store.setRemoteTransport('cloudflare');
    const store2 = new SettingsStore(tmpFile);
    expect(store2.getRemoteTransport()).toBe('cloudflare');
  });

  it('mints a stable host access token and returns it across calls', async () => {
    const t1 = await store.getOrCreateRemoteAccessToken();
    expect(t1).toMatch(/^[A-Z0-9]{6}$/);
    expect(await store.getOrCreateRemoteAccessToken()).toBe(t1);
  });

  it('persists the host access token across reloads', async () => {
    const t1 = await store.getOrCreateRemoteAccessToken();
    const store2 = new SettingsStore(tmpFile);
    expect(await store2.getOrCreateRemoteAccessToken()).toBe(t1);
  });

  it('stores the host token encrypted, not as raw text', async () => {
    const t1 = await store.getOrCreateRemoteAccessToken();
    const raw = fs.readFileSync(tmpFile, 'utf-8');
    expect(raw).not.toContain(t1);
    expect(raw).toContain('enc:v1:');
  });

  it('regenerateRemoteAccessToken returns a different token and persists it', async () => {
    const t1 = await store.getOrCreateRemoteAccessToken();
    const t2 = await store.regenerateRemoteAccessToken();
    expect(t2).not.toBe(t1);
    expect(await store.getOrCreateRemoteAccessToken()).toBe(t2);
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
