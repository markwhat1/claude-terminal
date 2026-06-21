/**
 * stall-interrupt: the stall pattern-interrupt hook for the Home dashboard
 * (M16, PLAN-PHASE-2-3.md line 76, PLAN.md 1.8).
 *
 * DEFAULT OFF. Only activates when enabled:true. The caller (HomeView) reads
 * the stallInterrupt store flag and passes it in.
 *
 * Motion arbitration rules (one motion source at a time):
 *   - A non-null settleClass (a pending justResolved settle) DEFERS the stall
 *     timer. The timer does not start while a settle is in progress; it starts
 *     fresh once settleClass returns to null.
 *   - Interaction events (pointerdown, keydown) reset the timer by calling
 *     notify(). The caller wires notify() to the Home region's event listeners.
 *
 * In-place only: active:true is a signal to apply an opacity/pulse class to
 * the hero primary button and a dim class to the periphery. NOTHING moves
 * position. The component is responsible for translating active into CSS
 * classes; this hook emits only the boolean.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SettleClass } from './settle-class';

/** Time a user must be inactive before the stall pulse fires (ms). */
export const STALL_THRESHOLD_MS = 90_000; // 90 seconds

export interface UseStallInterruptOptions {
  /** Whether the feature is enabled (the store flag, default OFF). */
  enabled: boolean;
  /**
   * The current settle class on the hero card. A non-null value means a
   * justResolved settle is in progress; the stall timer must not run
   * concurrently (one motion source at a time).
   */
  settleClass: SettleClass | null;
}

export interface UseStallInterruptResult {
  /**
   * True when the stall threshold has elapsed with no interaction and no
   * pending settle. The caller applies stall-pulse to the hero primary button
   * and stall-dim to the periphery.
   */
  active: boolean;
  /**
   * Call this when the user interacts (pointerdown, keydown, etc.). Resets
   * the stall timer and clears the active state.
   */
  notify: () => void;
}

export function useStallInterrupt(
  options: UseStallInterruptOptions,
): UseStallInterruptResult {
  const { enabled, settleClass } = options;

  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we are currently deferred by a settle so we know when to
  // (re)start the timer after the settle clears.
  const settleActiveRef = useRef<boolean>(settleClass !== null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      setActive(true);
    }, STALL_THRESHOLD_MS);
  }, [clearTimer]);

  // The public notify function: an interaction resets the clock and clears active.
  const notify = useCallback(() => {
    if (!enabled) return;
    setActive(false);
    // Only (re)start the timer if there is no pending settle.
    if (!settleActiveRef.current) {
      startTimer();
    }
  }, [enabled, startTimer]);

  // Start or cancel the timer based on enabled + settleClass changes.
  useEffect(() => {
    if (!enabled) {
      clearTimer();
      setActive(false);
      settleActiveRef.current = settleClass !== null;
      return;
    }

    const settleNow = settleClass !== null;
    const wasSettling = settleActiveRef.current;
    settleActiveRef.current = settleNow;

    if (settleNow) {
      // A settle just started (or is ongoing): defer the stall timer.
      clearTimer();
      setActive(false);
    } else if (wasSettling && !settleNow) {
      // The settle just cleared: start the stall timer fresh from this point.
      startTimer();
    } else if (!settleNow && timerRef.current === null && !active) {
      // Enabled just turned on (or component mounted) with no settle active
      // and no running timer: start the clock.
      startTimer();
    }

    return clearTimer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, settleClass]);

  // Cleanup on unmount.
  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  return { active, notify };
}
