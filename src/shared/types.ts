export type TabStatus = 'new' | 'working' | 'idle' | 'requires_response' | 'shell';

export type TabType = 'claude' | 'shell' | 'home';

/** Sentinel id for the synthetic Home view. Never enters TabManager or IPC. */
export const HOME_TAB_ID = '__home__' as const;

export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions';

export interface Tab {
  id: string;
  type: TabType;
  name: string;
  defaultName: string;
  status: TabStatus;
  worktree: string | null;
  /** The branch this worktree was created from (e.g. "main", "gcai"). */
  sourceBranch: string | null;
  cwd: string;
  shellType: string | null;
  pid: number | null;
  sessionId: string | null;
  projectId: string;
  /** Epoch ms when the current status was last entered. Null until the first updateStatus call. */
  statusSince: number | null;
  /** Epoch ms of the most recent updateStatus call, regardless of whether the status changed. */
  lastActivityAt: number | null;
  /** Epoch ms when this tab first entered 'working'. Null for tabs that have never started a turn. */
  firstActivityAt: number | null;
  /** Epoch ms when the human-waiting span began. Set on the first human-waiting status after activity;
   *  not reset by an idle -> requires_response overlay within the same span. Cleared when 'working' resumes. */
  waitingSince: number | null;
}

export interface SavedTab {
  name: string;
  cwd: string;
  worktree: string | null;
  sourceBranch: string | null;
  sessionId: string;
}

export interface IpcMessage {
  tabId: string;
  event: string;
  data: string | null;
}

export interface AppSettings {
  recentDirs: string[];
  lastPermissionMode: PermissionMode;
}

// --- Multi-project workspaces ---

export const PROJECT_COLORS = [
  { name: 'blue',   hue: 210 },
  { name: 'green',  hue: 140 },
  { name: 'orange', hue: 30  },
  { name: 'purple', hue: 270 },
  { name: 'teal',   hue: 180 },
  { name: 'red',    hue: 0   },
  { name: 'pink',   hue: 330 },
  { name: 'yellow', hue: 55  },
] as const;

export interface ProjectConfig {
  id: string;
  dir: string;
  colorIndex: number;
  displayName?: string;
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  projects: ProjectConfig[];
  activeProjectId: string;
  geometry: { x: number; y: number; width: number; height: number };
}

export const PERMISSION_FLAGS: Record<PermissionMode, string[]> = {
  default: [],
  plan: ['--plan'],
  acceptEdits: ['--allowedTools', 'Edit,Write,NotebookEdit'],
  bypassPermissions: ['--dangerously-skip-permissions'],
};

// Remote access
export type RemoteAccessStatus = 'inactive' | 'installing' | 'connecting' | 'active' | 'error';

/**
 * Transport used to reach the local web-remote server from another machine.
 * - `cloudflare`: ephemeral public Cloudflare quick tunnel (cloudflared).
 * - `tailscale`: no public tunnel; the loopback server is reached over the
 *   private tailnet via `tailscale serve` (or any local reverse proxy).
 */
export type RemoteTransport = 'cloudflare' | 'tailscale';

export interface RemoteAccessInfo {
  status: RemoteAccessStatus;
  tunnelUrl: string | null;
  token: string | null;
  error: string | null;
  /** Download progress 0–100 (only meaningful when status === 'installing'). */
  progress?: number;
  /** Which transport produced this state (set once active). */
  transport?: RemoteTransport;
}

/** A remembered remote host the desktop client can auto-reconnect to. */
export interface RemoteConnection {
  url: string;
  token: string;
  autoConnect: boolean;
}

// --- Repository hooks ---

export const HOOK_EVENTS = [
  'worktree:created',
  'worktree:removed',
  'tab:created',
  'tab:closed',
  'session:started',
  'app:started',
  'branch:changed',
] as const;

export type HookEvent = typeof HOOK_EVENTS[number];

export interface HookCommand {
  path: string;
  command: string;
}

export interface RepoHook {
  id: string;
  name: string;
  event: HookEvent;
  commands: HookCommand[];
  enabled: boolean;
}

export interface RepoHookConfig {
  hooks: RepoHook[];
}

// IPC status events for hook execution
export interface HookExecutionStatus {
  hookId: string;
  hookName: string;
  event: HookEvent;
  commandIndex: number;
  totalCommands: number;
  command?: string;
  path?: string;
  status: 'running' | 'done' | 'failed';
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}
