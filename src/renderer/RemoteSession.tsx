import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Tab, RemoteAccessInfo } from '../shared/types';
import type { WebSocketBridge } from '../web-client/ws-bridge';
import TabBar from './components/TabBar';
import Terminal from './components/Terminal';
import StatusBar from './components/StatusBar';
import TabIndicator from './components/TabIndicator';
import WorktreeNameDialog from './components/WorktreeNameDialog';
import { destroyTerminal } from './components/terminalCache';
import { enterRemote } from './remote-swap';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Menu, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

type TermSizes = Record<string, { cols: number; rows: number }>;
type OnConnected = (tabs: Tab[], activeTabId: string | null, termSizes: TermSizes) => void;

export interface RemoteSessionProps {
  /** The bridge to connect with. Caller owns its lifetime. */
  bridge: WebSocketBridge;
  /** Remote host URL. Omit for the browser client (same-origin). */
  targetUrl?: string;
  /** Connect immediately with this code, skipping the token form. */
  initialToken?: string;
  /** Persist the code after a successful connect (sessionStorage / settings). */
  persistToken: (token: string) => void;
  /** Load a previously-saved code for auto-reconnect. */
  loadSavedToken: () => string | null;
  /** "Try Again" from the disconnected screen. Browser reloads; desktop re-opens connect. */
  onRetry?: () => void;
  /** Disconnect back to local (desktop only). When set, a Disconnect control shows. */
  onExit?: () => void;
  /** Initial connect failed. Desktop uses this to fall back to local instead of showing the form. */
  onConnectError?: (err: Error) => void;
  /** When true, the host (App.tsx) owns keyboard shortcuts; suppress the internal handler. */
  embedded?: boolean;
}

async function connectWithToken(
  bridge: WebSocketBridge,
  token: string,
  targetUrl: string | undefined,
  persistToken: (t: string) => void,
  onConnected: OnConnected,
): Promise<void> {
  const result = await bridge.connect(token, targetUrl);
  persistToken(token);
  // Swap window.claudeTerminal to the bridge and re-bind PTY listeners before
  // the connected UI mounts any Terminal.
  enterRemote(bridge.api);
  onConnected(result.tabs, result.activeTabId, result.termSizes);
}

// ---------------------------------------------------------------------------
// TokenScreen — shown before authentication (browser); auto-connects when given
// an initialToken (desktop).
// ---------------------------------------------------------------------------

function TokenScreen({ bridge, targetUrl, initialToken, persistToken, loadSavedToken, onConnected, onConnectError }: {
  bridge: WebSocketBridge;
  targetUrl?: string;
  initialToken?: string;
  persistToken: (t: string) => void;
  loadSavedToken: () => string | null;
  onConnected: OnConnected;
  onConnectError?: (err: Error) => void;
}) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Auto-connect with an explicit initial token or a previously-saved one.
  useEffect(() => {
    const saved = initialToken ?? loadSavedToken();
    if (!saved) return;
    setConnecting(true);
    connectWithToken(bridge, saved, targetUrl, persistToken, onConnected).catch((err: Error) => {
      if (onConnectError) { onConnectError(err); return; }
      setError(err.message || 'Connection failed');
      setConnecting(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (token.length !== 6 || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      await connectWithToken(bridge, token, targetUrl, persistToken, onConnected);
    } catch (err) {
      setError((err as Error).message || 'Connection failed');
      setConnecting(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-dvh">
      <Dialog open>
        <DialogContent showCloseButton={false} className="p-8">
          <DialogHeader className="text-center pb-2">
            <DialogTitle className="text-xl">Claude Terminal Remote</DialogTitle>
          </DialogHeader>
          {connecting ? (
            <p className="text-muted-foreground text-center py-4">Connecting...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Access Code
                </Label>
                <Input
                  type="text"
                  autoComplete="off"
                  maxLength={6}
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6))}
                  placeholder="ABC123"
                  autoFocus
                  disabled={connecting}
                  className="text-center tracking-[0.3em] text-2xl mt-1.5"
                />
                {error && <p className="text-xs text-destructive mt-1">{error}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={token.length !== 6 || connecting}>
                Connect
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobileNavMenu — hamburger menu for project/tab navigation on small screens
// ---------------------------------------------------------------------------

interface ProjectGroup {
  projectId: string;
  label: string;
  tabs: Tab[];
}

function groupTabsByProject(tabs: Tab[]): ProjectGroup[] {
  const map = new Map<string, Tab[]>();
  for (const tab of tabs) {
    const key = tab.projectId;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tab);
  }
  return Array.from(map.entries()).map(([projectId, projectTabs]) => {
    const cwd = projectTabs[0].cwd;
    const label = cwd.split(/[\\/]/).filter(Boolean).pop() || cwd;
    return { projectId, label, tabs: projectTabs };
  });
}

function MobileNavMenu({ tabs, activeTabId, onSelectTab }: {
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupTabsByProject(tabs), [tabs]);
  const multiProject = groups.length > 1;

  const handleSelect = (tabId: string) => {
    onSelectTab(tabId);
    setOpen(false);
  };

  return (
    <div className="mobile-nav-menu">
      <button
        className="text-muted-foreground hover:text-foreground p-2"
        onClick={() => setOpen(!open)}
        title="Navigate tabs"
      >
        <Menu size={20} />
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div
            className="fixed left-0 right-0 bg-[hsl(var(--project-hue)_30%_14%)] border-b border-border max-h-[60vh] overflow-y-auto shadow-lg"
            style={{ top: '36px', zIndex: 9999 }}
          >
            {groups.map((group) => (
              <div key={group.projectId}>
                {multiProject && (
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50">
                    {group.label}
                  </div>
                )}
                {group.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent/50 transition-colors',
                      tab.id === activeTabId && 'bg-accent text-accent-foreground',
                    )}
                    onClick={() => handleSelect(tab.id)}
                  >
                    <TabIndicator status={tab.status} />
                    <span className="truncate">{tab.name || tab.defaultName}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RemoteApp — shown after successful authentication
// ---------------------------------------------------------------------------

function RemoteApp({ bridge, embedded, onExit, initialTabs, initialActiveTabId, initialTermSizes, onDisconnected }: {
  bridge: WebSocketBridge;
  embedded?: boolean;
  onExit?: () => void;
  initialTabs: Tab[];
  initialActiveTabId: string | null;
  initialTermSizes: TermSizes;
  onDisconnected: () => void;
}) {
  const [tabs, setTabs] = useState<Tab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(initialActiveTabId);
  const [termSizes, setTermSizes] = useState(initialTermSizes);
  const [showWorktreeDialog, setShowWorktreeDialog] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const tryShowWorktreeDialog = useCallback(async () => {
    try {
      await window.claudeTerminal.getCurrentBranch();
      setShowWorktreeDialog(true);
    } catch {
      setAlertMessage('Cannot create a worktree: this workspace is not a Git repository, or the repository has no commits yet.');
    }
  }, []);

  const handleNewClaudeTab = useCallback(async () => {
    try {
      const tab = await window.claudeTerminal.createTab('', null);
      setActiveTabId(tab.id);
    } catch (err) {
      console.error('Failed to create tab:', err);
    }
  }, []);

  const handleNewWorktreeTab = useCallback(async (name: string) => {
    try {
      const tab = await window.claudeTerminal.createTabWithWorktree('', name);
      setActiveTabId(tab.id);
      setShowWorktreeDialog(false);
    } catch (err) {
      console.error('Failed to create worktree tab:', err);
    }
  }, []);

  // Host remote-access controls are not meaningful from a remote client.
  const remoteInfo: RemoteAccessInfo = { status: 'inactive', tunnelUrl: null, token: null, error: null };

  const handleSelectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    window.claudeTerminal.switchTab(tabId);
  }, []);

  const handleRenameTab = useCallback((tabId: string, name: string) => {
    window.claudeTerminal.renameTab(tabId, name);
  }, []);

  useEffect(() => {
    const cleanupUpdate = window.claudeTerminal.onTabUpdate((tab) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tab.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = tab;
          return next;
        }
        return [...prev, tab];
      });
    });

    const cleanupRemoved = window.claudeTerminal.onTabRemoved((tabId) => {
      destroyTerminal(tabId);
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== tabId);
        setActiveTabId((prevActive) => (prevActive === tabId ? (remaining[0]?.id ?? null) : prevActive));
        return remaining;
      });
    });

    const cleanupDisconnect = bridge.api.onDisconnect(onDisconnected);
    const cleanupResized = bridge.api.onPtyResized((tabId, cols, rows) => {
      setTermSizes((prev) => ({ ...prev, [tabId]: { cols, rows } }));
    });
    const cleanupSwitched = bridge.api.onTabSwitched((tabId) => setActiveTabId(tabId));

    return () => {
      cleanupUpdate();
      cleanupRemoved();
      cleanupDisconnect();
      cleanupResized();
      cleanupSwitched();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts — suppressed when embedded (App.tsx owns them in desktop).
  useEffect(() => {
    if (embedded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        if (tabs.length <= 1) return;
        const currentIdx = tabs.findIndex((t) => t.id === activeTabId);
        const nextIdx = e.shiftKey
          ? (currentIdx <= 0 ? tabs.length - 1 : currentIdx - 1)
          : (currentIdx >= tabs.length - 1 ? 0 : currentIdx + 1);
        handleSelectTab(tabs[nextIdx].id);
        return;
      }
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx < tabs.length) handleSelectTab(tabs[idx].id);
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        if (activeTabId) {
          window.dispatchEvent(new CustomEvent('tab:startRename', { detail: { tabId: activeTabId } }));
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [embedded, tabs, activeTabId, handleSelectTab]);

  const noop = () => {};

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <div className="flex items-center bg-[hsl(var(--project-hue)_30%_18%)] border-b border-border" data-web-tabbar>
        <MobileNavMenu tabs={tabs} activeTabId={activeTabId} onSelectTab={handleSelectTab} />
        <div className="flex-1 min-w-0 desktop-tabbar">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            renamingTabId={null}
            defaultShell={null}
            onSelectTab={handleSelectTab}
            onCloseTab={noop}
            onRenameTab={handleRenameTab}
            onRenameHandled={noop}
            onNewClaudeTab={handleNewClaudeTab}
            onNewWorktreeTab={tryShowWorktreeDialog}
            onNewShellTab={noop}
            onReorderTabs={noop}
            onRefreshTab={noop}
            onManageWorktrees={noop}
            onManageHooks={noop}
            onOpenSettings={noop}
            remoteInfo={remoteInfo}
            onActivateRemote={noop}
            onDeactivateRemote={noop}
          />
        </div>
        {onExit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 mr-1 text-muted-foreground hover:text-foreground"
            title="Disconnect from remote"
            onClick={() => onExit()}
          >
            <LogOut size={16} />
          </Button>
        )}
      </div>
      <div className="flex-1 relative overflow-auto [-webkit-overflow-scrolling:touch] min-h-0" data-web-terminal>
        {tabs.map((tab) => (
          <Terminal
            key={tab.id}
            tabId={tab.id}
            isVisible={tab.id === activeTabId}
            fixedCols={termSizes[tab.id]?.cols}
            fixedRows={termSizes[tab.id]?.rows}
          />
        ))}
      </div>
      <div data-web-statusbar>
        <StatusBar tabs={tabs} />
      </div>
      {showWorktreeDialog && (
        <WorktreeNameDialog
          onCreateWithWorktree={handleNewWorktreeTab}
          onCancel={() => setShowWorktreeDialog(false)}
        />
      )}
      <Dialog open={!!alertMessage} onOpenChange={() => setAlertMessage(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Error</DialogTitle></DialogHeader>
          <DialogDescription>{alertMessage}</DialogDescription>
          <DialogFooter>
            <Button autoFocus onClick={() => setAlertMessage(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DisconnectedScreen — connection dropped; auto-retry with backoff
// ---------------------------------------------------------------------------

function DisconnectedScreen({ bridge, targetUrl, persistToken, loadSavedToken, onReconnected, onRetry }: {
  bridge: WebSocketBridge;
  targetUrl?: string;
  persistToken: (t: string) => void;
  loadSavedToken: () => string | null;
  onReconnected: OnConnected;
  onRetry?: () => void;
}) {
  const [status, setStatus] = useState<'reconnecting' | 'failed'>('reconnecting');

  useEffect(() => {
    const saved = loadSavedToken();
    if (!saved) { setStatus('failed'); return; }

    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 20;
    const baseDelay = 1000;

    const tryReconnect = () => {
      if (cancelled) return;
      attempt++;
      connectWithToken(bridge, saved, targetUrl, persistToken, onReconnected).catch(() => {
        if (cancelled) return;
        if (attempt >= maxAttempts) {
          setStatus('failed');
        } else {
          const delay = Math.min(baseDelay * Math.pow(1.5, attempt - 1), 10000);
          setTimeout(tryReconnect, delay);
        }
      });
    };

    setTimeout(tryReconnect, 1000);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-dvh">
      <Dialog open>
        <DialogContent className="text-center" showCloseButton={false}>
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl">Disconnected</DialogTitle>
          </DialogHeader>
          {status === 'reconnecting' ? (
            <p className="text-muted-foreground mb-5">Reconnecting...</p>
          ) : (
            <>
              <p className="text-muted-foreground mb-5">Could not reconnect to the remote session.</p>
              <Button className="w-full" onClick={() => onRetry?.()}>Try Again</Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RemoteSession — the two-screen flow, usable by the browser entry and desktop App
// ---------------------------------------------------------------------------

type Screen = 'token' | 'connected' | 'disconnected';

export default function RemoteSession(props: RemoteSessionProps) {
  const [screen, setScreen] = useState<Screen>('token');
  const [initialTabs, setInitialTabs] = useState<Tab[]>([]);
  const [initialActiveTabId, setInitialActiveTabId] = useState<string | null>(null);
  const [initialTermSizes, setInitialTermSizes] = useState<TermSizes>({});

  const handleConnected: OnConnected = (tabs, activeTabId, termSizes) => {
    setInitialTabs(tabs);
    setInitialActiveTabId(activeTabId);
    setInitialTermSizes(termSizes);
    setScreen('connected');
  };

  const handleDisconnected = useCallback(() => setScreen('disconnected'), []);

  if (screen === 'token') {
    return (
      <TokenScreen
        bridge={props.bridge}
        targetUrl={props.targetUrl}
        initialToken={props.initialToken}
        persistToken={props.persistToken}
        loadSavedToken={props.loadSavedToken}
        onConnected={handleConnected}
        onConnectError={props.onConnectError}
      />
    );
  }

  if (screen === 'disconnected') {
    return (
      <DisconnectedScreen
        bridge={props.bridge}
        targetUrl={props.targetUrl}
        persistToken={props.persistToken}
        loadSavedToken={props.loadSavedToken}
        onReconnected={handleConnected}
        onRetry={props.onRetry}
      />
    );
  }

  return (
    <RemoteApp
      bridge={props.bridge}
      embedded={props.embedded}
      onExit={props.onExit}
      initialTabs={initialTabs}
      initialActiveTabId={initialActiveTabId}
      initialTermSizes={initialTermSizes}
      onDisconnected={handleDisconnected}
    />
  );
}
