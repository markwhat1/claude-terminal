/**
 * QueryInjector: the MAIN-owned pending-injection state for the dashboard hero's
 * "open Claude with a canned query" action (M10c, PLAN 3.1 / 1.5b).
 *
 * Constructed once in index.ts and injected into BOTH:
 *   - IpcHandlerDeps: the claude:injectQuery handler ARMS a pending entry plus
 *     the mandatory 30s timeout BEFORE it resolves with the new tab id (the
 *     arm-before-resolve property: a renderer reload after the awaited round-trip
 *     cannot orphan the query, because the intent + timer live in MAIN).
 *   - HookRouterDeps: the idle gate CLEARS it via ONE injected onIdle callback,
 *     called at the convergence point where a tracked tab first reaches idle.
 *
 * The once-flag, the timer, and the do-not-notify flag all live here in MAIN, so
 * a renderer reload during the multi-second CLI boot cannot wipe the Map or
 * cancel the timer.
 *
 * Failed-start retry is NOT a same-tab re-arm. A failed start means the
 * session-start hook never fired (no tab:ready, so the idle gate never runs) or
 * the PTY is gone; re-arming the same tab would just time out again or re-fail on
 * the same dead PTY. So the renderer's retry spawns a FRESH tab via
 * claude:injectQuery (a new PTY + a fresh hook install) and closes the prior
 * failed tab. This class therefore owns no retry method; it only remembers which
 * tabs it injected (injectedTabs) for the R-14 tab-namer gate (PLAN 3.1 step 7).
 *
 * The write uses CR (\r), never CRLF: a trailing \r\n can register as two
 * submissions in a ConPTY TUI (PLAN 3.1 step 5).
 */

import type { ClaudeQueryLine } from '@shared/home-copy';
import {
  CLAUDE_INJECT_STATUS_CHANNEL,
  INJECT_TIMEOUT_MS,
  INJECT_TIMEOUT_REASON,
  INJECT_PTY_GONE_REASON,
  type InjectStatus,
} from '@shared/injection';
import { log } from './logger';

interface PendingEntry {
  query: ClaudeQueryLine;
  /** Once-flag: the canned query is written on the FIRST idle only. */
  injected: boolean;
  /** The mandatory fail-safe timer handle. */
  timer: ReturnType<typeof setTimeout> | null;
  /**
   * The do-not-notify flag. Stays true through at least the first post-injection
   * Stop idle so the post-turn toast (hook-router :130) fires no OS notification
   * for the watched injected tab (PLAN 3.1 step 4b). Consumed once by the
   * hook-router's tab:status:idle notify branch.
   */
  suppressNotify: boolean;
}

/** The PTY surface the injector needs: write plus a liveness probe. */
export interface QueryInjectorPty {
  write(tabId: string, data: string): void;
  hasPty(tabId: string): boolean;
}

export interface QueryInjectorDeps {
  ptyManager: QueryInjectorPty;
  /** Sends an injectStatus broadcast to the renderer (MAIN -> renderer). */
  sendStatus: (channel: string, status: InjectStatus) => void;
  /** Override for tests; defaults to the mandatory 30s window. */
  timeoutMs?: number;
}

export class QueryInjector {
  private readonly pending = new Map<string, PendingEntry>();
  private readonly ptyManager: QueryInjectorPty;
  private readonly sendStatus: (channel: string, status: InjectStatus) => void;
  private readonly timeoutMs: number;

  constructor(deps: QueryInjectorDeps) {
    this.ptyManager = deps.ptyManager;
    this.sendStatus = deps.sendStatus;
    this.timeoutMs = deps.timeoutMs ?? INJECT_TIMEOUT_MS;
  }

  /**
   * Arms a pending injection for a freshly created tab: stores the query, starts
   * the 30s fail-safe timer, and emits a pending status. Called by the
   * claude:injectQuery handler BEFORE it resolves (arm-before-resolve).
   */
  arm(tabId: string, query: ClaudeQueryLine): void {
    // Cancel any prior timer for this tab id (re-arm replaces cleanly).
    this.cancelTimer(tabId);

    const timer = setTimeout(() => this.onTimeout(tabId), this.timeoutMs);
    this.pending.set(tabId, {
      query,
      injected: false,
      timer,
      suppressNotify: true,
    });
    // Record this as a dashboard-injected tab so the R-14 tab-namer gate
    // (isDashboardInjected) still recognizes it after the pending entry is
    // cleared. Membership is durable on purpose; it outlives the write.
    this.injectedTabs.add(tabId);
    log.info('[inject] armed', tabId);
    this.sendStatus(CLAUDE_INJECT_STATUS_CHANNEL, { tabId, kind: 'pending' });
  }

  /** True while a pending entry exists for the tab. */
  isArmed(tabId: string): boolean {
    return this.pending.has(tabId);
  }

  /**
   * M19 / R-14: true when this tab was spawned by the dashboard injection path,
   * i.e. it has ever been armed. Stays true after the pending entry is cleared
   * (the injectedTabs membership outlives the write) so a tab:generate-name event
   * that fires AFTER the canned query is written is still recognized as a
   * dashboard-injected tab and gated. The dashboard auto-names a fresh tab per
   * injection, so this is the durable "is this a dashboard tab" signal the
   * tab-namer needs to apply the R-14 gate.
   */
  isDashboardInjected(tabId: string): boolean {
    return this.pending.has(tabId) || this.injectedTabs.has(tabId);
  }

  /**
   * The idle gate. Called by the hook-router at the convergence point (the
   * tab:updated emission where updated.status === 'idle', covering BOTH the
   * tab:ready first idle and the later tab:status:idle). On the FIRST idle for a
   * tracked, not-yet-injected tab, verifies the PTY is live and writes the canned
   * query with a trailing CR; every later idle is ignored.
   */
  onIdle(tabId: string): void {
    const entry = this.pending.get(tabId);
    if (!entry || entry.injected) return;

    // Verify the PTY is live before write: pty-manager.write is a silent no-op on
    // a dead PTY, so an absent PTY surfaces a failure rather than vanishing.
    if (!this.ptyManager.hasPty(tabId)) {
      log.warn('[inject] PTY gone at write time', tabId);
      this.cancelTimer(tabId);
      this.pending.delete(tabId);
      this.sendStatus(CLAUDE_INJECT_STATUS_CHANNEL, {
        tabId,
        kind: 'failure',
        reason: INJECT_PTY_GONE_REASON,
      });
      return;
    }

    // CR, never CRLF. Normalize any embedded newline to a bare CR (PLAN 3.1 §5).
    const line = entry.query.replace(/\r?\n/g, '\r') + '\r';
    this.ptyManager.write(tabId, line);
    entry.injected = true;
    this.cancelTimer(tabId);
    log.info('[inject] query written', tabId);
    this.sendStatus(CLAUDE_INJECT_STATUS_CHANNEL, { tabId, kind: 'success' });
  }

  /**
   * Whether the post-turn idle toast should be suppressed for this tab, AND
   * consumes the suppression so only the FIRST post-injection Stop idle is
   * silenced. Called by the hook-router's tab:status:idle notify branch. Returns
   * false for an untracked tab or once the flag has been consumed.
   */
  consumeNotifySuppression(tabId: string): boolean {
    const entry = this.pending.get(tabId);
    if (!entry || !entry.suppressNotify) return false;
    entry.suppressNotify = false;
    return true;
  }

  /**
   * Cleanup on tab:closed / tab:removed: cancels the timer and drops the entry so
   * a dead tab cannot hold a stale write and the Map cannot grow unbounded.
   */
  clear(tabId: string): void {
    this.cancelTimer(tabId);
    this.pending.delete(tabId);
  }

  // -- internals ------------------------------------------------------------

  /**
   * The durable set of tab ids ever armed by the dashboard injection path. Used
   * only by isDashboardInjected (the R-14 tab-namer gate); it deliberately
   * outlives the pending entry and is never a retry source (a failed start cannot
   * recover on the same tab, so retry spawns a fresh tab via claude:injectQuery;
   * see the header note).
   */
  private readonly injectedTabs = new Set<string>();

  private onTimeout(tabId: string): void {
    const entry = this.pending.get(tabId);
    if (!entry || entry.injected) return;
    log.warn('[inject] fail-safe timeout fired', tabId);
    this.pending.delete(tabId);
    this.sendStatus(CLAUDE_INJECT_STATUS_CHANNEL, {
      tabId,
      kind: 'failure',
      reason: INJECT_TIMEOUT_REASON,
    });
  }

  private cancelTimer(tabId: string): void {
    const entry = this.pending.get(tabId);
    if (entry?.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
  }
}
