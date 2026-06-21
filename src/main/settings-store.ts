import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { PermissionMode, RemoteConnection, RemoteTransport, SavedTab } from '@shared/types';
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
  startupView: 'lastSession' | 'home';
  /** M14d: suppress idle ("finished working") OS toasts. Default false (calm). */
  notifyOnIdle: boolean;
  /** M14d: tracks whether the one-time first-run note has been shown. */
  notifyOnIdleFirstRunShown: boolean;
  /** M16: stall pattern-interrupt (in-place pulse, default OFF). */
  stallInterrupt: boolean;
  /** M17: commitment-mirror intake (first-open intake only, default OFF). */
  commitmentMirror: boolean;
  /** M18: morning ritual + parking (cue-bound to first open, default OFF). */
  morningRitual: boolean;
  /** M19: off-app batched nudge (opt-in, default OFF; sends only when also scheduled). */
  offAppNudge: boolean;
  remoteTransport: RemoteTransport;
  /** Encrypted-at-rest host access token (enc:/plain: tagged). */
  remoteAccessToken: string | null;
  /** Remembered remote host for the client (its token field is encrypted at rest). */
  remoteConnection: RemoteConnection | null;
  /** When true, the host auto-activates remote access on app launch (per-machine opt-in). */
  remoteAutoStart: boolean;
}

const DEFAULTS: StoreData = {
  recentDirs: [],
  permissionMode: 'bypassPermissions',
  defaultShell: null,
  startupView: 'lastSession',
  notifyOnIdle: false,
  notifyOnIdleFirstRunShown: false,
  stallInterrupt: false,
  commitmentMirror: false,
  morningRitual: false,
  offAppNudge: false,
  remoteTransport: 'tailscale',
  remoteAccessToken: null,
  remoteConnection: null,
  remoteAutoStart: false,
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

  getStartupView(): 'lastSession' | 'home' {
    return this.data.startupView;
  }

  async setStartupView(view: 'lastSession' | 'home'): Promise<void> {
    this.data.startupView = view;
    await this.save();
  }

  // M14d: idle notification flag
  getNotifyOnIdle(): boolean {
    return this.data.notifyOnIdle;
  }

  async setNotifyOnIdle(value: boolean): Promise<void> {
    this.data.notifyOnIdle = value;
    await this.save();
  }

  // M14d: one-time first-run note state
  getNotifyOnIdleFirstRunShown(): boolean {
    return this.data.notifyOnIdleFirstRunShown;
  }

  async setNotifyOnIdleFirstRunShown(value: boolean): Promise<void> {
    this.data.notifyOnIdleFirstRunShown = value;
    await this.save();
  }

  // M16: stall pattern-interrupt flag
  getStallInterrupt(): boolean {
    return this.data.stallInterrupt;
  }

  async setStallInterrupt(value: boolean): Promise<void> {
    this.data.stallInterrupt = value;
    await this.save();
  }

  // M17: commitment-mirror intake flag
  getCommitmentMirror(): boolean {
    return this.data.commitmentMirror;
  }

  async setCommitmentMirror(value: boolean): Promise<void> {
    this.data.commitmentMirror = value;
    await this.save();
  }

  // M18: morning ritual + parking flag
  getMorningRitual(): boolean {
    return this.data.morningRitual;
  }

  async setMorningRitual(value: boolean): Promise<void> {
    this.data.morningRitual = value;
    await this.save();
  }

  // M19: off-app batched nudge flag (opt-in; sends only when also scheduled)
  getOffAppNudge(): boolean {
    return this.data.offAppNudge;
  }

  async setOffAppNudge(value: boolean): Promise<void> {
    this.data.offAppNudge = value;
    await this.save();
  }

  getRemoteTransport(): RemoteTransport {
    return this.data.remoteTransport;
  }

  async setRemoteTransport(transport: RemoteTransport): Promise<void> {
    this.data.remoteTransport = transport;
    await this.save();
  }

  getRemoteAutoStart(): boolean {
    return this.data.remoteAutoStart;
  }

  async setRemoteAutoStart(enabled: boolean): Promise<void> {
    this.data.remoteAutoStart = enabled;
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

  /** The remembered remote connection, with its token decrypted (null if none). */
  getRemoteConnection(): RemoteConnection | null {
    const c = this.data.remoteConnection;
    if (!c) return null;
    return { url: c.url, token: decryptField(c.token), autoConnect: c.autoConnect };
  }

  /** Persist the remembered remote connection, encrypting the token at rest. */
  async setRemoteConnection(conn: RemoteConnection): Promise<void> {
    this.data.remoteConnection = {
      url: conn.url,
      token: encryptField(conn.token),
      autoConnect: conn.autoConnect,
    };
    await this.save();
  }

  /** Forget the remembered remote connection entirely. */
  async clearRemoteConnection(): Promise<void> {
    this.data.remoteConnection = null;
    await this.save();
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
