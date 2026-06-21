/**
 * M19: the off-app batched nudge (PLAN-PHASE-2-3.md line 79, PLAN.md R-12).
 *
 * A Phase-3 coaching feature, so it ships DEFAULT OFF and fires ONLY when it is
 * SEPARATELY scheduled and confirmed. Two independent conditions, not one
 * toggle: a user must both turn the setting on AND have a confirmed schedule
 * window. The inherited notification engine toasts on every idle and every
 * input; this is the opposite shape, a single batched digest, off until earned.
 *
 * Pure: no DOM, no Electron, no Notification. The caller (a future scheduler
 * milestone) supplies the gate state and the counts; this module decides whether
 * to send and composes the one digest line. The copy carries the Phase-3 voice
 * guards: no guilt, no time-since, no streak / chain / "in a row" / "N days"
 * language, no em dash (PLAN.md 1.4 / 6.6).
 */

// ---------------------------------------------------------------------------
// Default-OFF (the Phase-3 rule, mirroring notifyOnIdle)
// ---------------------------------------------------------------------------

/**
 * The shipped default for the off-app-nudge setting. False: the nudge is OFF
 * until a user explicitly opts in AND a schedule is confirmed.
 */
export const OFF_APP_NUDGE_DEFAULT_ENABLED = false;

// ---------------------------------------------------------------------------
// The send gate
// ---------------------------------------------------------------------------

export interface OffAppNudgeGate {
  /** The persisted opt-in setting (default OFF). */
  settingEnabled: boolean;
  /**
   * Whether a SEPARATE schedule window has fired and been confirmed. This is the
   * second independent condition: the nudge never sends on the setting alone, so
   * a user who flips the toggle but never sets up a schedule gets no surprise
   * off-app push.
   */
  scheduledConfirmed: boolean;
}

/**
 * Decides whether the off-app batched nudge may be sent.
 *
 * Returns true ONLY when BOTH the opt-in setting is on AND a scheduled window is
 * confirmed. Either alone returns false, so the feature is both default-OFF and
 * never fires off a single toggle (PLAN-PHASE-2-3.md line 79).
 */
export function shouldSendOffAppNudge(gate: OffAppNudgeGate): boolean {
  return gate.settingEnabled === true && gate.scheduledConfirmed === true;
}

// ---------------------------------------------------------------------------
// The digest copy (Phase-3 voice guards)
// ---------------------------------------------------------------------------

/**
 * Composes the single batched digest line for the off-app nudge.
 *
 * One line, never one-toast-per-event. When nothing needs you it is a calm,
 * forward landing, never a bare "0 things waiting". When something needs you it
 * names the count plainly. No guilt, no time-since, no streak / chain / "in a
 * row" / "N days" language, and no em dash (PLAN.md 1.4 / 6.6).
 */
export function composeOffAppNudge(needCount: number, closedCount: number): string {
  if (needCount <= 0) {
    // Forward, calm. No bare-zero fraction, no "nothing waiting" guilt framing.
    return 'The board is clear. Pick it up whenever you are ready.';
  }
  if (closedCount > 0) {
    return `${needCount} need you on the board, and ${closedCount} closed already. One small move when you open up.`;
  }
  return `${needCount} need you on the board. One small move when you open up.`;
}
