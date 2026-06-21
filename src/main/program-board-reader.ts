/**
 * ProgramBoardReader: polls dashboard/state.json, retries on transient
 * failures, and retains the last-good parse.
 *
 * Design:
 *   - Resolves and validates the state.json path with isStateJsonPathSafe.
 *   - Does an IMMEDIATE first read on construction (not waiting a poll tick).
 *   - Polls every ~pollIntervalMs (default ~20s).
 *   - On ENOENT / EBUSY / JSON.parse failure: waits ~retryDelayMs, retries up
 *     to ~maxRetries times, then gives up for this tick (last-good is retained).
 *   - last-good is NEVER cleared on a transient error; only a successful parse
 *     updates it.
 *   - If the path fails isStateJsonPathSafe, all reads return the not-running
 *     sentinel immediately.
 *
 * This module must NOT import anything Electron-specific (app, ipcMain, etc.)
 * so it is testable under vitest/jsdom without mocking Electron.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import {
  parseState,
  parseOffsetAware,
  isStateJsonPathSafe,
  NOT_RUNNING_STATE,
  type ProgramBoardState,
  type ProgramCard,
  type ClosedRecord,
} from '@shared/program-board-state';
import path from 'path';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ProgramBoardReaderOptions {
  /** How often to poll in ms. Default: 20_000 (~20s). */
  pollIntervalMs?: number;
  /** Delay between retries in ms. Default: 100. */
  retryDelayMs?: number;
  /** Max retries per poll cycle. Default: 3. */
  maxRetries?: number;
  /**
   * Called after every successful parse with the newly-parsed state.
   * Use this in index.ts to broadcast via sendToRenderer without coupling
   * this Electron-free module to the Electron broadcast path.
   */
  onStateUpdated?: (state: ProgramBoardState) => void;
  /**
   * The userData directory under which closed.json is written
   * (app.getPath('userData')). index.ts passes the real Electron value; tests
   * pass a temp dir. closed.json lives at <userDataDir>/dashboard/closed.json,
   * NEVER in the workspace git tree (1.5 / 3.6). When omitted, the done-lane
   * resolved set is disabled (no persistence, no crossing detection).
   */
  userDataDir?: string;
  /**
   * Clock injection for the within-~1-day decided-and-worked window and the 24h
   * prune boundary. Tests freeze it; production uses the default () => new Date().
   */
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// Done-lane resolved-set constants (M4b, 1.5)
// ---------------------------------------------------------------------------

/** The rolling window for closedRecent. Entries older than this are pruned. */
const CLOSED_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

/** The "fresh commit" window for the decided-and-worked predicate (~1 day). */
const DECIDED_AND_WORKED_COMMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // ~1 day

/** The needs-your-decision reason/tag marker that gates the louder tier. */
const NEEDS_DECISION_MARKER = 'needs-your-decision';

/**
 * The per-card snapshot the reader retains across polls so it can detect a
 * progress-guarded crossing out of the needs-you set.
 */
interface NeedsYouSnapshot {
  dodMet: number;
  lane: string;
  lastCommitIso: string | null;
  hadDecisionMarker: boolean;
  timeSensitive: string | null;
}

// ---------------------------------------------------------------------------
// ProgramBoardReader
// ---------------------------------------------------------------------------

export class ProgramBoardReader {
  private readonly stateFilePath: string;
  private readonly root: string;
  private readonly pollIntervalMs: number;
  private readonly retryDelayMs: number;
  private readonly maxRetries: number;
  private readonly pathSafe: boolean;
  private readonly onStateUpdated: ((state: ProgramBoardState) => void) | undefined;

  // --- M4b done-lane resolved-set ---
  private readonly closedFilePath: string | null;
  private now: () => Date;
  /** Prior-poll needs-you snapshots, keyed by DashboardItem id ("pb:<slug>"). */
  private prevNeedsYou = new Map<string, NeedsYouSnapshot>();
  /** The persisted rolling last-24h resolved set (in-memory mirror of closed.json). */
  private closedSet: ClosedRecord[] = [];
  /** Have we ever populated prevNeedsYou? Distinguishes first poll from later. */
  private seenAnyState = false;
  /** Reconstruct-from-closed.json runs ONCE per process (the _initialized guard). */
  private _initialized = false;
  /** Loss-aversion guard: the displayed count is frozen to its session-high. */
  private closedRecentDisplayHigh = 0;

  private lastGoodState: ProgramBoardState;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  /**
   * @param stateFilePath - Absolute path to state.json (already resolved).
   * @param root - Workspace root used for path-safety validation.
   * @param options - Tunable poll/retry settings.
   */
  constructor(
    stateFilePath: string,
    root: string,
    options: ProgramBoardReaderOptions = {},
  ) {
    this.stateFilePath = stateFilePath;
    this.root = root;
    this.pollIntervalMs = options.pollIntervalMs ?? 20_000;
    this.retryDelayMs = options.retryDelayMs ?? 100;
    this.maxRetries = options.maxRetries ?? 3;
    this.onStateUpdated = options.onStateUpdated;
    this.now = options.now ?? (() => new Date());

    // The done-lane resolved set persists to <userDataDir>/dashboard/closed.json
    // (NEVER the workspace git tree). When userDataDir is omitted the resolved
    // set is disabled entirely (closedFilePath null).
    this.closedFilePath = options.userDataDir
      ? path.join(options.userDataDir, 'dashboard', 'closed.json')
      : null;

    // Validate the path once at construction time.
    this.pathSafe = isStateJsonPathSafe(stateFilePath, root);

    // Initialize last-good to the not-running sentinel.
    this.lastGoodState = NOT_RUNNING_STATE;

    // Reconstruct the resolved set from closed.json ONCE per process so a
    // renderer reload (or a second project open mid-session) never erases the
    // day's payoff (1.5). The _initialized guard makes this idempotent.
    this.reconstructClosedSetOnce();

    // Immediate first read (not waiting a poll tick).
    // We use setImmediate so construction returns synchronously and callers
    // can attach event handlers before the first read completes.
    setImmediate(() => {
      if (!this.stopped) {
        this.poll().then(() => {
          if (!this.stopped) {
            this.schedulePoll();
          }
        });
      }
    });
  }

  /**
   * Returns the most recently successfully parsed state.
   * Returns the not-running sentinel if no successful parse has occurred yet.
   */
  getLastGoodState(): ProgramBoardState {
    return this.lastGoodState;
  }

  /**
   * Alias for getLastGoodState(). The ipc-handlers.ts program-board:getState
   * handler calls reader.getState(), so this method must exist.
   */
  getState(): ProgramBoardState {
    return this.lastGoodState;
  }

  // -------------------------------------------------------------------------
  // M4b done-lane resolved-set accessors
  // -------------------------------------------------------------------------

  /**
   * The displayed count of closes in the rolling last-24h window, FROZEN to its
   * session-high so 24h pruning never decrements it mid-session (the loss
   * aversion guard, 1.5). Named closedRecent, NOT closedToday: the window is a
   * rolling last-24h list, so "today" would be a lie a time-blind brain catches.
   */
  getClosedRecent(): number {
    return this.closedRecentDisplayHigh;
  }

  /**
   * The current rolling resolved set (already pruned past 24h). Each entry
   * carries the per-close decidedAndWorked flag for the louder Phase-1 settle
   * tier and the reserved-null avoidanceClose. Returned as a copy.
   */
  getRecentCloses(): ClosedRecord[] {
    return this.closedSet.map((c) => ({ ...c }));
  }

  /** The resolved closed.json path (under userData), or null when disabled. */
  getClosedFilePath(): string | null {
    return this.closedFilePath;
  }

  /**
   * Test-only clock override so a suite can advance past the 24h prune boundary
   * or the ~1-day commit window without sleeping.
   */
  setNowForTest(fn: Date | (() => Date)): void {
    this.now = typeof fn === 'function' ? fn : () => fn;
  }

  /**
   * Performs one poll cycle: reads state.json with retry, updates last-good
   * on a successful parse.
   *
   * Public so tests can drive it manually.
   */
  async poll(): Promise<void> {
    if (!this.pathSafe) {
      // Path is unsafe; keep returning the not-running sentinel.
      return;
    }

    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (this.stopped) return;
      if (attempt > 0) {
        await delay(this.retryDelayMs);
      }
      try {
        const raw = readFileSync(this.stateFilePath, 'utf-8');
        const parsed = parseState(raw);
        if (parsed !== null) {
          // Detect progress-guarded closes against the prior poll's snapshot,
          // persist any qualifying close, prune the rolling window. Runs before
          // lastGoodState is swapped so detection compares prev vs current.
          this.detectAndRecordCloses(parsed);
          this.lastGoodState = parsed;
          this.onStateUpdated?.(parsed);
          return;
        }
        // Unparseable JSON; treat like a transient failure and retry.
        lastErr = new Error('JSON parse failed');
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'EBUSY') {
          lastErr = err;
          // Continue to retry.
        } else {
          // Unknown error; do not retry.
          lastErr = err;
          break;
        }
      }
    }

    // All retries exhausted; last-good is retained (not cleared).
    // Log path + error type only, never raw content (no PHI in logs).
    // Using a simple console-error here because logger.ts is Electron-coupled
    // and this module is Electron-free. M5 will route this through the IPC
    // channel; for now the error is silent to the user.
    void lastErr; // suppress unused-variable lint
  }

  /** Stops polling. Call when the reader is no longer needed. */
  stop(): void {
    this.stopped = true;
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private schedulePoll(): void {
    if (this.stopped) return;
    this.pollTimer = setTimeout(() => {
      this.poll().then(() => {
        this.schedulePoll();
      });
    }, this.pollIntervalMs);
  }

  // -------------------------------------------------------------------------
  // M4b done-lane resolved-set internals
  // -------------------------------------------------------------------------

  /**
   * Reconstructs the resolved set from closed.json ONCE per process.
   *
   * The _initialized guard makes this idempotent so a second project-open
   * mid-session does not re-wipe the day's set (1.5). Prunes entries past 24h
   * relative to now, then seeds the displayed session-high from the surviving
   * count so a morning glance reflects yesterday evening's wins.
   */
  private reconstructClosedSetOnce(): void {
    if (this._initialized) return;
    this._initialized = true;
    if (this.closedFilePath === null) return;

    const loaded = this.loadClosedFile();
    this.closedSet = this.pruneClosed(loaded);
    this.closedRecentDisplayHigh = this.closedSet.length;
  }

  /**
   * Detects progress-guarded closes between the prior poll's needs-you snapshot
   * and the current parsed state, records any qualifying close, then refreshes
   * the prior-poll snapshot for the next tick.
   *
   * A close is counted when a card LEAVES the needs-you set AND a progress
   * signal advanced in the same window (1.5):
   *   - dod.met increased, OR
   *   - lane became 'done', OR
   *   - last_commit.iso advanced, OR
   *   - the DECIDED-AND-WORKED close: a needs-your-decision marker clearing when
   *     last_commit.iso is within ~1 day AND the card is NOT a simultaneously
   *     lapsing time_sensitive.
   *
   * A lapsed deadline, a tag edited out with no commit, and an aged-out stalled
   * reason all pay NOTHING.
   */
  private detectAndRecordCloses(state: ProgramBoardState): void {
    if (this.closedFilePath === null) {
      // Resolved set disabled; nothing to track.
      return;
    }

    const now = this.now();
    let changed = false;

    // Only evaluate crossings once we have a prior snapshot to compare against.
    // The very first parse just seeds prevNeedsYou (a card present on the first
    // read has no "before" to have left, so it cannot be a crossing).
    if (this.seenAnyState) {
      const currentIds = new Set<string>();
      for (const card of state.programs) {
        currentIds.add(this.cardId(card));
      }

      for (const [id, prev] of this.prevNeedsYou) {
        // Find the card's current state (it may have been dropped entirely).
        const currentCard = state.programs.find((c) => this.cardId(c) === id);
        const stillNeedsYou = currentCard ? currentCard.needs_you : false;
        if (stillNeedsYou) continue; // did not leave the set

        // The card LEFT needs-you. Did a progress signal advance?
        if (this.isQualifyingClose(prev, currentCard, now)) {
          const decidedAndWorked = this.isDecidedAndWorked(prev, currentCard, now);
          this.closedSet.push({
            id,
            closedAt: now.toISOString(),
            decidedAndWorked,
            // avoidanceClose is RESERVED-NULL in Phase 1; M4b NEVER sets it.
            avoidanceClose: null,
          });
          changed = true;
        }
      }
    }

    // Refresh the prior-poll snapshot for the next tick.
    this.prevNeedsYou = this.snapshotNeedsYou(state);
    this.seenAnyState = true;

    // Prune the rolling window and persist if anything changed.
    const beforePrune = this.closedSet.length;
    this.closedSet = this.pruneClosed(this.closedSet);
    if (this.closedSet.length !== beforePrune) {
      changed = true;
    }

    // The DISPLAYED count is frozen to its session-high: 24h pruning affects the
    // persisted set + the next-day baseline, never a live decrement (1.5).
    if (this.closedSet.length > this.closedRecentDisplayHigh) {
      this.closedRecentDisplayHigh = this.closedSet.length;
    }

    if (changed) {
      this.persistClosedFile();
    }
  }

  /**
   * True when a card that LEFT needs-you also advanced a progress signal, so a
   * close is counted. currentCard may be undefined (the card was dropped from
   * the board entirely).
   */
  private isQualifyingClose(
    prev: NeedsYouSnapshot,
    currentCard: ProgramCard | undefined,
    now: Date,
  ): boolean {
    if (currentCard) {
      // dod.met increased
      if (currentCard.dod.met > prev.dodMet) return true;
      // lane became 'done'
      if (currentCard.lane === 'done' && prev.lane !== 'done') return true;
      // last_commit.iso advanced
      if (this.commitAdvanced(prev.lastCommitIso, currentCard.git?.last_commit?.iso ?? null)) {
        return true;
      }
    }
    // The decided-and-worked close (the Phase-1 default louder tier).
    return this.isDecidedAndWorked(prev, currentCard, now);
  }

  /**
   * The decided-and-worked predicate (1.5): the prior snapshot carried a
   * needs-your-decision marker that has now cleared, the last commit is within
   * ~1 day of now, AND the card is NOT a simultaneously-lapsing time_sensitive.
   *
   * This separates "decided and worked" (a parked decision resolved with real
   * commit activity) from a silently-deleted tag (no commit / stale commit) and
   * from a deadline lapsing.
   */
  private isDecidedAndWorked(
    prev: NeedsYouSnapshot,
    currentCard: ProgramCard | undefined,
    now: Date,
  ): boolean {
    // The decision marker must have been present before and gone now.
    if (!prev.hadDecisionMarker) return false;
    const stillHasMarker = currentCard ? this.cardHasDecisionMarker(currentCard) : false;
    if (stillHasMarker) return false;

    // The card must NOT be a simultaneously-lapsing time_sensitive. If the card
    // still carries a time_sensitive date, treat the crossing as a deadline
    // event, not a decision-and-worked close (the lapse-never-pays guard).
    const timeSensitive = currentCard ? currentCard.time_sensitive : prev.timeSensitive;
    if (timeSensitive) return false;

    // last_commit.iso must be within ~1 day of now.
    const commitIso = currentCard ? (currentCard.git?.last_commit?.iso ?? null) : prev.lastCommitIso;
    if (!commitIso) return false;
    const commitDate = parseOffsetAware(commitIso) ?? null;
    if (!commitDate) return false;
    const ageMs = now.getTime() - commitDate.getTime();
    if (ageMs < 0 || ageMs > DECIDED_AND_WORKED_COMMIT_WINDOW_MS) return false;

    return true;
  }

  /** True when the new commit iso is strictly newer than the prior commit iso. */
  private commitAdvanced(prevIso: string | null, currentIso: string | null): boolean {
    if (!currentIso) return false;
    if (!prevIso) return true; // gained a commit where there was none
    const a = parseOffsetAware(prevIso);
    const b = parseOffsetAware(currentIso);
    if (!a || !b) return false;
    return b.getTime() > a.getTime();
  }

  /** A card carries the needs-your-decision marker via its tags or reasons. */
  private cardHasDecisionMarker(card: ProgramCard): boolean {
    if (card.tags.some((t) => t === NEEDS_DECISION_MARKER)) return true;
    if (card.needs_you_reasons.some((r) => r.includes(NEEDS_DECISION_MARKER))) return true;
    return false;
  }

  /** Builds the needs-you snapshot map for the current state (only needs-you cards). */
  private snapshotNeedsYou(state: ProgramBoardState): Map<string, NeedsYouSnapshot> {
    const map = new Map<string, NeedsYouSnapshot>();
    for (const card of state.programs) {
      if (!card.needs_you) continue;
      map.set(this.cardId(card), {
        dodMet: card.dod.met,
        lane: card.lane,
        lastCommitIso: card.git?.last_commit?.iso ?? null,
        hadDecisionMarker: this.cardHasDecisionMarker(card),
        timeSensitive: card.time_sensitive,
      });
    }
    return map;
  }

  /** The source-prefixed DashboardItem id for a card, matching mapCardToItem. */
  private cardId(card: ProgramCard): string {
    return `pb:${card.slug}`;
  }

  /** Drops closed-set entries older than the 24h rolling window. */
  private pruneClosed(records: ClosedRecord[]): ClosedRecord[] {
    const cutoff = this.now().getTime() - CLOSED_WINDOW_MS;
    return records.filter((r) => {
      const t = Date.parse(r.closedAt);
      if (Number.isNaN(t)) return false;
      return t >= cutoff;
    });
  }

  /** Reads + validates closed.json, returning [] on any read/parse failure. */
  private loadClosedFile(): ClosedRecord[] {
    if (this.closedFilePath === null) return [];
    try {
      const raw = readFileSync(this.closedFilePath, 'utf-8');
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) return [];
      const out: ClosedRecord[] = [];
      for (const e of arr) {
        if (!e || typeof e !== 'object') continue;
        const rec = e as Record<string, unknown>;
        if (typeof rec.id !== 'string' || typeof rec.closedAt !== 'string') continue;
        out.push({
          id: rec.id,
          closedAt: rec.closedAt,
          decidedAndWorked: rec.decidedAndWorked === true,
          avoidanceClose: null, // reserved-null in Phase 1, normalized on load
        });
      }
      return out;
    } catch {
      // Missing / unparseable file: start with an empty set (no last-good here;
      // a corrupt closed.json should not block the board). Path + type only,
      // never the raw buffer (no PHI in logs, 3.6); kept silent for now.
      return [];
    }
  }

  /** Flushes the in-memory resolved set to closed.json (mkdir -p the dir). */
  private persistClosedFile(): void {
    if (this.closedFilePath === null) return;
    try {
      const dir = path.dirname(this.closedFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.closedFilePath, JSON.stringify(this.closedSet), 'utf-8');
    } catch {
      // A failed flush keeps the in-memory set authoritative for the session;
      // path + type only on failure, never raw content. Kept silent for now.
    }
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Path resolver (used by the caller in src/main/index.ts)
// ---------------------------------------------------------------------------

/**
 * Resolves the state.json path from the PROGRAM_BOARD_WORKSPACE env var
 * (fallback: C:/Users/Mark/Claude-Code) joined with "dashboard/state.json".
 */
export function resolveProgramBoardStatePath(): { stateFilePath: string; root: string } {
  const workspace =
    process.env.PROGRAM_BOARD_WORKSPACE ?? 'C:\\Users\\Mark\\Claude-Code';
  const stateFilePath = path.join(workspace, 'dashboard', 'state.json');
  return { stateFilePath, root: workspace };
}
