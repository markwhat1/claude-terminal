import { Notification } from 'electron';
import type { IpcMessage } from '@shared/types';
import type { TabManager } from './tab-manager';
import { log } from './logger';

export interface HookRouterDeps {
  tabManager: TabManager;
  sendToRenderer: (channel: string, ...args: unknown[]) => void;
  persistSessions: () => void;
  generateTabName: (tabId: string, prompt: string) => void;
  generateResumeTabName: (tabId: string, cwd: string, sessionId: string) => Promise<void>;
  cleanupNamingFlag: (tabId: string) => void;
  getMainWindow: () => { show: () => void; focus: () => void } | null;
  hookEngine: { emit: (event: string, context: Record<string, string>) => Promise<void> } | null;
  getProjectName: (projectId: string) => string | undefined;
  /**
   * M10c: the injection idle gate (PLAN 3.1 step 4). Called at the CONVERGENCE
   * point (where a tab first reaches 'idle', covering both the tab:ready first
   * idle and the later tab:status:idle). The QueryInjector decides whether the
   * tab is tracked and writes the canned query on the first idle only. Optional
   * so the router stays constructable in tests that do not exercise injection.
   */
  onInjectionIdle?: (tabId: string) => void;
  /**
   * M10c: the post-turn toast suppression (PLAN 3.1 step 4b). Returns true (and
   * consumes the flag) when the injected tab's first post-injection Stop idle
   * should fire NO OS notification, so a watched injected tab that is not
   * MAIN-active does not toast on the turn it finishes. Optional.
   */
  consumeInjectionNotifySuppression?: (tabId: string) => boolean;
  /**
   * M14d: returns the current notifyOnIdle setting. When false (the default),
   * idle ("finished working") toasts are suppressed; requires_response toasts
   * are always preserved. Optional: absent means old behavior (notify on idle).
   */
  getNotifyOnIdle?: () => boolean;
  /**
   * M14d: returns true when the one-time first-run note has already been shown.
   * Optional: absent means the note is never shown (backward compatible).
   */
  isFirstRunNoteShown?: () => boolean;
  /**
   * M14d: called the first time an idle event fires with notifyOnIdle:false and
   * the first-run note has not yet been shown. The caller persists the shown
   * state so it fires exactly once. Optional.
   */
  showFirstRunNote?: () => void;
}

/**
 * M14d: shouldNotify predicate.
 *
 * kind 'idle'              - the "finished working" toast. Suppressed when
 *                            notifyOnIdle is false (the default).
 * kind 'requires_response' - the "needs your input" chime. Always preserved,
 *                            regardless of notifyOnIdle.
 *
 * When getNotifyOnIdle is absent (old callers) the predicate falls back to
 * true for both kinds, preserving the pre-M14d behavior.
 */
export function shouldNotify(
  kind: 'idle' | 'requires_response',
  getNotifyOnIdle?: () => boolean,
): boolean {
  if (kind === 'requires_response') return true;
  // kind === 'idle': use the flag value, default true when dep is absent.
  return getNotifyOnIdle ? getNotifyOnIdle() : true;
}

export function createHookRouter(deps: HookRouterDeps) {
  // Track tabs that already have a pending notification so we don't show
  // duplicates (e.g. tab:status:idle followed immediately by tab:status:input).
  const pendingNotifications = new Set<string>();

  function notifyTabActivity(tabId: string, title: string, body: string) {
    if (!Notification.isSupported()) return;
    if (pendingNotifications.has(tabId)) return;
    pendingNotifications.add(tabId);

    const notification = new Notification({ title, body });
    notification.on('click', () => {
      pendingNotifications.delete(tabId);
      const win = deps.getMainWindow();
      if (win) {
        win.show();
        win.focus();
      }
      deps.tabManager.setActiveTab(tabId);
      const tab = deps.tabManager.getTab(tabId);
      if (tab) {
        // Switch to the tab's project first, then to the tab itself
        if (tab.projectId) {
          deps.sendToRenderer('tab:projectSwitch', tab.projectId);
        }
        deps.sendToRenderer('tab:switched', tabId);
        deps.sendToRenderer('tab:updated', tab);
      }
    });
    notification.show();
  }

  function clearPendingNotification(tabId: string) {
    pendingNotifications.delete(tabId);
  }

  function handleHookMessage(msg: IpcMessage) {
    const { tabId, event, data } = msg;
    log.debug('[hook]', event, tabId);
    const tab = deps.tabManager.getTab(tabId);
    if (!tab) return;

    const isActive = deps.tabManager.getActiveTabId() === tabId;

    switch (event) {
      case 'tab:ready': {
        // data is JSON: { sessionId, source } where source is "startup"|"resume"|"clear"
        let sessionId = '';
        let source = '';
        try {
          const parsed = JSON.parse(data ?? '');
          sessionId = parsed.sessionId || '';
          source = parsed.source || '';
        } catch {
          // Legacy fallback: data was just the sessionId string
          sessionId = data ?? '';
        }
        log.info('[tab:ready]', tabId, 'sessionId:', sessionId, 'source:', source);

        const previousSessionId = tab.sessionId;

        // Only reset tab name on /clear (source === "clear").
        // Don't check tab.sessionId — that also triggers on --resume
        // (which fires two SessionStart events: "startup" then "resume").
        if (source === 'clear') {
          log.info('[tab:ready] /clear detected for', tabId, '— resetting name');
          deps.tabManager.resetName(tabId);
          deps.cleanupNamingFlag(tabId);
          // Generate a name from the previous session's history. This handles
          // "clear context and run plan" in plan mode, where UserPromptSubmit
          // never fires (plan mode tools are invisible to the hooks system —
          // see https://github.com/Mr8BitHK/claude-terminal/issues/9).
          // For a regular /clear, this name gets overwritten by the next
          // UserPromptSubmit anyway, so the only cost is one extra Haiku call.
          if (previousSessionId) {
            log.info('[tab:ready] generating name from previous session after clear', tabId);
            deps.generateResumeTabName(tabId, tab.cwd, previousSessionId);
          }
        }

        if (sessionId) {
          deps.tabManager.setSessionId(tabId, sessionId);
          // Session has started and CLI is waiting for input → 'idle'.
          // Using 'new' here would cause the tab to be excluded from
          // persistence (doPersistSessions filters out status === 'new'),
          // so a resumed-but-idle session would be lost on next restart.
          deps.tabManager.updateStatus(tabId, 'idle');
        } else {
          deps.tabManager.updateStatus(tabId, 'new');
        }

        // On resume with a different session, generate a name from the session history
        if (source === 'resume' && sessionId && sessionId !== previousSessionId) {
          log.info('[tab:ready] resume with new session for', tabId, '— generating name from history');
          deps.generateResumeTabName(tabId, tab.cwd, sessionId);
        }
        deps.persistSessions();
        if (deps.hookEngine && sessionId) {
          deps.hookEngine.emit('session:started', { contextRoot: tab.cwd, tabId, sessionId });
        }
        break;
      }

      case 'tab:status:working':
        deps.tabManager.updateStatus(tabId, 'working');
        break;

      case 'tab:status:idle': {
        deps.tabManager.updateStatus(tabId, 'idle');
        // M10c step 4b: the post-turn "finished working" toast is suppressed for
        // an injected tab whose do-not-notify flag is still set, regardless of
        // active state. consumeInjectionNotifySuppression consumes the flag so
        // only the FIRST post-injection Stop idle is silenced.
        const suppressInjectionToast =
          deps.consumeInjectionNotifySuppression?.(tabId) ?? false;
        // M14d: suppress the idle toast when notifyOnIdle is false. The
        // requires_response toast is never demoted (shouldNotify returns true
        // unconditionally for that kind).
        const idleNotifyAllowed = shouldNotify('idle', deps.getNotifyOnIdle);
        if (!isActive && tab && !suppressInjectionToast && idleNotifyAllowed) {
          const projectName = tab.projectId ? deps.getProjectName(tab.projectId) : undefined;
          const title = projectName ? `${projectName} - ${tab.name}` : tab.name;
          notifyTabActivity(tabId, title, 'Claude has finished working');
        }
        // M14d first-run note: fires exactly once, on the first idle when
        // notifyOnIdle is false and the note has not been shown before.
        if (!idleNotifyAllowed && deps.showFirstRunNote && deps.isFirstRunNoteShown) {
          if (!deps.isFirstRunNoteShown()) {
            deps.showFirstRunNote();
          }
        }
        break;
      }

      case 'tab:status:input':
        deps.tabManager.updateStatus(tabId, 'requires_response');
        if (!isActive && tab) {
          const projectName = tab.projectId ? deps.getProjectName(tab.projectId) : undefined;
          const title = projectName ? `${projectName} - ${tab.name}` : tab.name;
          notifyTabActivity(tabId, title, 'Claude needs your input');
        }
        break;

      case 'tab:closed':
        // SessionEnd fires on both /clear and real exit. We don't act on it —
        // proc.onExit() (wired in ipc-handlers.ts) is the definitive signal
        // for real exits, and /clear is handled by the follow-up tab:ready.
        log.debug('[tab:closed] SessionEnd for', tabId, '(waiting for onExit or tab:ready)');
        return;

      case 'tab:name':
        if (data) {
          deps.tabManager.rename(tabId, data);
          deps.persistSessions();
        }
        break;

      case 'tab:generate-name':
        if (data) {
          deps.generateTabName(tabId, data);
        }
        return;

      default:
        return;
    }

    const updated = deps.tabManager.getTab(tabId);
    if (updated) {
      // M10c step 4: the injection idle gate is pinned to the CONVERGENCE point,
      // the tab:updated emission where the resulting status is 'idle'. This
      // covers BOTH the tab:ready first idle (:104) and the later tab:status:idle
      // (:126), which is why gating only the tab:status:idle case would miss the
      // FIRST idle the freshly spawned tab reaches and the query would never type
      // in. The QueryInjector's once-flag makes every later idle a no-op.
      if (updated.status === 'idle') {
        deps.onInjectionIdle?.(tabId);
      }
      deps.sendToRenderer('tab:updated', updated);
    }
  }

  return { handleHookMessage, clearPendingNotification };
}
