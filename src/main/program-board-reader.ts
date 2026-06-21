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

import { readFileSync } from 'node:fs';
import {
  parseState,
  isStateJsonPathSafe,
  NOT_RUNNING_STATE,
  type ProgramBoardState,
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

    // Validate the path once at construction time.
    this.pathSafe = isStateJsonPathSafe(stateFilePath, root);

    // Initialize last-good to the not-running sentinel.
    this.lastGoodState = NOT_RUNNING_STATE;

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
          this.lastGoodState = parsed;
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
