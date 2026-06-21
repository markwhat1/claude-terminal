/**
 * The single Phase-0 copy + composer module for the Home dashboard (PLAN 6.6).
 *
 * Every user-facing Home string lives here: the canned smallest-first-move
 * button labels (1.7), the empty/error/loading/degraded copy, the goal-gradient
 * and gap-led templates (1.10), and the caught-up line. One module so the voice
 * test (6.6) can audit all of it for em dashes, slop, and the banned patterns.
 *
 * It also owns the PHI choke point composers:
 *   - composeClaudeQuery: canned query body, zero free-text interpolation (3.4).
 *   - composeCopy: inert display string, never detail/blocked_on/dod.gaps (3.3).
 *   - pickPrimaryAction: routes an item kind to a KnownActionId (1.7).
 *   - selectHero: the single-field hero override over paused-filtered cards (1.11).
 *
 * Pure: no DOM, no Electron, no window. Importable by renderer, main, web-client.
 */

import type { DashboardItem } from './program-board-state';
import { heroOverrideCandidates, goalGradientText } from './program-board-state';

// ---------------------------------------------------------------------------
// Branded inert string for the clipboard sink (3.3)
// ---------------------------------------------------------------------------

/**
 * A clipboard payload produced ONLY by composeCopy. Branding makes the sink
 * compile-time-guarded the same way ClaudeQueryLine guards the PTY write, so a
 * future caller cannot pass raw detail/blocked_on to the clipboard.
 */
export type InertDisplayString = string & { readonly __brand: 'InertDisplayString' };

// ---------------------------------------------------------------------------
// Known canned actions (1.7)
// ---------------------------------------------------------------------------

export type KnownActionId =
  | 'draftFirstVersion'
  | 'openToDecide'
  | 'reviewTodos'
  | 'summarizeChanges'
  | 'openPowerShell';

/**
 * The canned smallest-first-move button labels (1.7 table).
 *
 * Each label is the SMALLEST CONCRETE FIRST MOVE, not the task goal, so the
 * label does not reload the dread. Zero interpolation, so zero PHI surface.
 */
export const ACTION_LABELS: Record<KnownActionId, string> = {
  draftFirstVersion: 'Draft the first version',
  openToDecide: 'Open the repo to decide',
  reviewTodos: 'Look at the open TODOs',
  summarizeChanges: 'See what changed',
  openPowerShell: 'Open a shell to start',
};

// The producer's two blocker tags (src/program_board/status.py:3).
const NEEDS_DECISION_TAG = 'needs-your-decision';
const NEEDS_CADDC02_TAG = 'needs-CADDC02';

// ---------------------------------------------------------------------------
// pickPrimaryAction (1.7)
// ---------------------------------------------------------------------------

/**
 * Routes a DashboardItem to its canned primary action id.
 *
 * BOTH-CONDITIONS precedence (1.7): a card that is BOTH dodAlmost AND
 * needs-your-decision is a DECISION task regardless of DoD count, so it routes
 * to openToDecide and NEVER draftFirstVersion. The decision split is checked
 * first so the dodAlmost door never produces a one-step-from-done plus go-decide
 * card.
 */
export function pickPrimaryAction(item: DashboardItem): KnownActionId {
  const tags = item.badges;
  if (tags.includes(NEEDS_DECISION_TAG)) return 'openToDecide';
  if (tags.includes(NEEDS_CADDC02_TAG)) return 'openPowerShell';
  if (item.kind === 'blocker' || item.kind === 'todo') return 'draftFirstVersion';
  return 'reviewTodos';
}

// ---------------------------------------------------------------------------
// composeClaudeQuery (3.4) -- canned only, kept here for the M10c handler.
// ---------------------------------------------------------------------------

/**
 * Branded query line, the SOLE producer of an injected query string (3.4).
 * Phase 0 does not inject (the hero primary opens a shell), but the brand and
 * composer ship now so the M10c injection has a tested choke point to call.
 */
export type ClaudeQueryLine = string & { readonly __brand: 'ClaudeQueryLine' };

export interface ComposeClaudeQueryArgs {
  action: KnownActionId;
  programSlug: string;
  programName: string;
  kind: string;
}

/**
 * Composes a canned query body with ZERO free-text interpolation (3.4).
 *
 * The only interpolated value is the program NAME for draftFirstVersion, which
 * is a producer-computed dev identifier guarded by isSafeProgramIdentifier
 * upstream. detail/blocked_on/dod.gaps NEVER reach this body.
 */
export function composeClaudeQuery(args: ComposeClaudeQueryArgs): ClaudeQueryLine {
  switch (args.action) {
    case 'draftFirstVersion':
      return `Draft the first version of ${args.programName} so I can review and send it.` as ClaudeQueryLine;
    case 'openToDecide':
      return `Open this repo so I can make the pending decision.` as ClaudeQueryLine;
    case 'reviewTodos':
      return `Review the open TODOs in this repo.` as ClaudeQueryLine;
    case 'summarizeChanges':
      return `Summarize what changed on this branch.` as ClaudeQueryLine;
    case 'openPowerShell':
      return `Open a shell to start.` as ClaudeQueryLine;
  }
}

// ---------------------------------------------------------------------------
// composeCopy (3.3) -- inert display string, whitelist fields only.
// ---------------------------------------------------------------------------

/**
 * Produces the clipboard payload from already-plain producer fields ONLY.
 *
 * Whitelist: program name + slug. detail/blocked_on/needs_you_reasons/dod.gaps
 * are NEVER read here, so a PHI-bearing free-text field cannot reach the
 * clipboard sink (3.3). The payload is non-empty and contains the program name
 * (the positive usefulness assertion, M8a).
 */
export function composeCopy(item: DashboardItem): InertDisplayString {
  return `${item.title} (${item.slug})` as InertDisplayString;
}

// ---------------------------------------------------------------------------
// Goal-gradient / gap-led copy (1.10) -- single source re-exported.
// ---------------------------------------------------------------------------

export { goalGradientText };

// ---------------------------------------------------------------------------
// Hero copy headline (1.10 / 1.11)
// ---------------------------------------------------------------------------

/**
 * The hero one-line headline beneath the title.
 *
 * Decision cards (openToDecide) render a decision prompt with NO almost-done /
 * last-step / near-finish framing, even when the card is also dodAlmost
 * (1.7 both-conditions, 1.11). Other cards render the goal-gradient / gap-led
 * frame, which already forbids the "0 of N" zero fraction and never says
 * "almost done" when dodMet === 0 (1.10/1.11).
 */
export function heroHeadline(item: DashboardItem, action: KnownActionId): string {
  if (action === 'openToDecide') {
    return 'A decision is waiting. Open the repo to make the call.';
  }
  const gradient = goalGradientText(item);
  if (gradient) return gradient;
  // No DoD gap to lead with: fall back to a neutral, non-near-finish line.
  return 'Pick this up next.';
}

// ---------------------------------------------------------------------------
// Empty / loading / error / degraded / caught-up copy (4.3, 6.5, 6.6)
// ---------------------------------------------------------------------------

export const HOME_COPY = {
  /** Caught-up acknowledgment, verbatim from the producer board (1.4/4.3). */
  caughtUp: 'Clear. Keep working.',
  /** No programs matched yet (file exists, programs: []). */
  noProgramsTracked: 'No programs tracked yet.',
  /** generated_at is null: the service never polled. The resolved path is appended at the call site. */
  notRunning: 'Program board not running, start the program-board service.',
  /** Hard error (read/parse failure with no prior data). The path + retry render alongside. */
  errorRetry: 'Retry',
  /** The strip empty line (6.4). */
  noActiveSessions: 'No active sessions',
  /** The collapsed overflow control above the ceiling renders this calm framing (4.6). */
  showMore: 'Show more',
} as const;

/** The closed-count line (1.5). Always "last 24h", NEVER "today". */
export function closedRecentLine(count: number): string {
  return `${count} closed, last 24h`;
}

/** The needs-you glance line (4.6/6.2). */
export function needsYouLine(needCount: number, workingCount: number): string {
  return `${needCount} need you / ${workingCount} working`;
}

/** The collapsed "+N more" control label, capped past the ceiling (4.6). */
export const OVERFLOW_CEILING = 9;
export function overflowLabel(remaining: number): string {
  if (remaining > OVERFLOW_CEILING) return HOME_COPY.showMore;
  return `+${remaining} more`;
}

/** The paused disclosure label (4.4/6.3). */
export function pausedLabel(count: number): string {
  return `${count} paused`;
}

/** The degraded "last updated Nm ago" muted marker (4.3). */
export function degradedLine(minutesAgo: number): string {
  return `last updated ${minutesAgo}m ago`;
}

/** Age-band mini-header label for the expanded overflow (4.6/6.4). */
const AGE_BAND_LABEL: Record<DashboardItem['ageColor'], string> = {
  green: 'Fresh',
  yellow: 'Getting older',
  orange: 'Older',
  red: 'Oldest',
};
export function ageBandLabel(color: DashboardItem['ageColor']): string {
  return AGE_BAND_LABEL[color];
}

// ---------------------------------------------------------------------------
// The single-field hero override (1.11)
// ---------------------------------------------------------------------------

/** Producer needs-you window for time-sensitive cards, in days (4.4). */
export const TIME_SENSITIVE_WINDOW_DAYS = 5;

/** The capped visible needs-you row count under the hero (4.6). */
export const NEEDS_YOU_ROW_CAP = 4;

function daysUntil(dateStr: string, now: Date): number | null {
  // dateStr is a plain "YYYY-MM-DD" producer field.
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const target = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
  );
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * Selects the hero from the producer's needs-you list with the single-field
 * override (1.11), over the PAUSED-FILTERED candidate set:
 *
 *   1. If any candidate is time_sensitive within the 5-day window, the
 *      soonest-dated one is the hero (Tier 1, beats dodAlmost).
 *   2. Else if any candidate is dodAlmost, the one with the fewest remaining
 *      steps is the hero.
 *   3. Else the producer's needs-you head in board order.
 *
 * The override only ELEVATES (1.1): when the override would pick the SAME card
 * the producer head already is, the result is the producer head, so the
 * "only-when-reorders" property holds. Returns null when there is no candidate.
 *
 * `items` must already be in producer board order. Paused cards are filtered here.
 */
export function selectHero(
  items: DashboardItem[],
  now: Date,
): DashboardItem | null {
  const candidates = heroOverrideCandidates(items);
  if (candidates.length === 0) return null;

  const producerHead = candidates[0];

  // Tier 1: soonest time-sensitive within the window.
  const timeSensitive = candidates
    .filter((c) => {
      if (!c.timeSensitive) return false;
      const d = daysUntil(c.timeSensitive, now);
      return d !== null && d <= TIME_SENSITIVE_WINDOW_DAYS;
    })
    .sort((a, b) => {
      const da = daysUntil(a.timeSensitive as string, now) ?? Infinity;
      const db = daysUntil(b.timeSensitive as string, now) ?? Infinity;
      return da - db;
    });
  if (timeSensitive.length > 0) {
    // Elevates only when it reorders; if it picks the producer head, that is
    // still correct (the head is the soonest deadline anyway).
    return timeSensitive[0];
  }

  // Tier 3: dodAlmost with the fewest remaining steps.
  const almost = candidates
    .filter((c) => c.dodAlmost)
    .sort(
      (a, b) =>
        (a.dodTotal - a.dodMet) - (b.dodTotal - b.dodMet),
    );
  if (almost.length > 0) {
    return almost[0];
  }

  // Else the producer head.
  return producerHead;
}
