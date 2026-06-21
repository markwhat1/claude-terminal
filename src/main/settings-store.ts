import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { PermissionMode, RemoteTransport, SavedTab } from '@shared/types';
import { genToken } from '@shared/token';
import { encryptField, decryptField } from './secure-store';
import { log } from './logger';

const MAX_RECENT_DIRS = 10;
const SESSIONS_DIR = '.claude-terminal';
const SESSIONS_FILE = 'sessions.json';

interface StoreData {
  recentDirs: string[];
  permissionMode: PermissionMode;
  defaultShell: string | null;
  remoteTransport: RemoteTransport;
  /** Encrypted-at-rest host access token (enc:/plain: tagged). */
  remoteAccessToken: string | null;
}

const DEFAULTS: StoreData = {
  recentDirs: [],
  permissionMode: 'bypassPermissions',
  defaultShell: null,
  remoteTransport: 'tailscale',
  remoteAccessToken: null,
};

export class SettingsStore {
  private filePath: string;
  private data: StoreData;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(app.getPath('userData'), 'claude-terminal-settings.json');
    // Sync load at startup is acceptable (one-time cost)
    this.data = this.loadSync();
  }

  private loadSync(): StoreData {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  getRecentDirs(): string[] {
    return this.data.recentDirs;
  }

  async addRecentDir(dir: string): Promise<void> {
    this.data.recentDirs = this.data.recentDirs.filter(d => d !== dir);
    this.data.recentDirs.unshift(dir);
    this.data.recentDirs = this.data.recentDirs.slice(0, MAX_RECENT_DIRS);
    await this.save();
  }

  async removeRecentDir(dir: string): Promise<void> {
    this.data.recentDirs = this.data.recentDirs.filter(d => d !== dir);
    await this.save();
  }

  getPermissionMode(): PermissionMode {
    return this.data.permissionMode;
  }

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.data.permissionMode = mode;
    await this.save();
  }

  getDefaultShell(): string | null {
    return this.data.defaultShell;
  }

  async setDefaultShell(shellId: string | null): Promise<void> {
    this.data.defaultShell = shellId;
    await this.save();
  }

  getRemoteTransport(): RemoteTransport {
    return this.data.remoteTransport;
  }

  async setRemoteTransport(transport: RemoteTransport): Promise<void> {
    this.data.remoteTransport = transport;
    await this.save();
  }

  /**
   * Return the stable host access token, minting and persisting one on first
   * use. Async so the first-mint write is observable: callers await this before
   * serving, so a saved client token is never invalidated by a lost write.
   */
  async getOrCreateRemoteAccessToken(): Promise<string> {
    if (this.data.remoteAccessToken) {
      const decrypted = decryptField(this.data.remoteAccessToken);
      if (decrypted) return decrypted;
    }
    const token = genToken();
    this.data.remoteAccessToken = encryptField(token);
    await this.save();
    return token;
  }

  /** Rotate and persist a new host access token (revokes saved client tokens). */
  async regenerateRemoteAccessToken(): Promise<string> {
    const token = genToken();
    this.data.remoteAccessToken = encryptField(token);
    await this.save();
    return token;
  }

  // --- Per-directory session persistence (stored in <dir>/.claude-terminal/sessions.json) ---

  private sessionsPath(dir: string): string {
    return path.join(dir, SESSIONS_DIR, SESSIONS_FILE);
  }

  async getSessions(dir: string): Promise<SavedTab[]> {
    const filePath = this.sessionsPath(dir);
    try {
      const raw = await fsp.readFile(filePath, 'utf-8');
      const tabs = JSON.parse(raw) as SavedTab[];
      log.info('[sessions] loaded', tabs.length, 'saved tabs from', filePath);
      return tabs;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        log.info('[sessions] no saved sessions at', filePath);
      } else {
        log.warn('[sessions] failed to read sessions from', filePath, String(err));
      }
      return [];
    }
  }

  async saveSessions(dir: string, tabs: SavedTab[]): Promise<void> {
    const filePath = this.sessionsPath(dir);
    try {
      const sessDir = path.join(dir, SESSIONS_DIR);
      await fsp.mkdir(sessDir, { recursive: true });
      await fsp.writeFile(filePath, JSON.stringify(tabs, null, 2), 'utf-8');
      log.debug('[sessions] persisted', tabs.length, 'tabs to', filePath);
    } catch (err) {
      log.error('[sessions] failed to save sessions to', filePath, String(err));
    }
  }
}
