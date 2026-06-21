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
import { heroOverrideCandidates, goalGradientText, isSafeProgramIdentifier } from './program-board-state';

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
  | 'openPowerShell'
  // M12: a captured (source:'todo') item is DISPLAY-ONLY. It is NEVER eligible
  // for a free-text-slot claudeQuery; its only action is Copy of inert text
  // (PLAN.md 1.7 / 3.3). copyOnly is the route pickPrimaryAction returns for it,
  // and it is excluded from the Claude-injection path (isClaudePrimaryAction).
  | 'copyOnly';

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
  // A captured todo's only action is Copy of inert text.
  copyOnly: 'Copy',
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
  // M12: a captured todo (source:'todo') is DISPLAY-ONLY. It is routed to
  // copyOnly BEFORE any other branch so a phone-captured raw string can never
  // become a hero whose action re-touches the PHI choke point (PLAN.md 1.7).
  // Note this keys off SOURCE, not kind: a program-board card with kind:'todo'
  // is still a real card and keeps its draftFirstVersion route below.
  if (item.source === 'todo') return 'copyOnly';
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
 * For draftFirstVersion, the deliverable slot is filled from the program NAME
 * when isSafeProgramIdentifier(programName) passes, then from programSlug as a
 * fallback, then from a generic placeholder when both fail. detail/blocked_on/
 * dod.gaps NEVER reach this body regardless of the guard outcome.
 *
 * All other actions are entirely canned: no interpolation of any field.
 */
export function composeClaudeQuery(args: ComposeClaudeQueryArgs): ClaudeQueryLine {
  switch (args.action) {
    case 'draftFirstVersion': {
      // Guard applied before slug/name reach the template (3.4).
      // Falls back to slug-only, then to a no-identifier placeholder.
      let deliverable: string;
      if (isSafeProgramIdentifier(args.programName)) {
        deliverable = args.programName;
      } else if (isSafeProgramIdentifier(args.programSlug)) {
        deliverable = args.programSlug;
      } else {
        deliverable = 'this program';
      }
      return `Draft the first version of ${deliverable} so I can review and send it.` as ClaudeQueryLine;
    }
    case 'openToDecide':
      return `Open this repo so I can make the pending decision.` as ClaudeQueryLine;
    case 'reviewTodos':
      return `Review the open TODOs in this repo.` as ClaudeQueryLine;
    case 'summarizeChanges':
      return `Summarize what changed on this branch.` as ClaudeQueryLine;
    case 'openPowerShell':
      return `Open a shell to start.` as ClaudeQueryLine;
    case 'copyOnly':
      // Unreachable by contract: a copyOnly (source:'todo') item is never an
      // action payload and must never reach this composer (PLAN.md 1.7 / 3.4).
      // Throwing makes a future misuse loud rather than silently composing a
      // query from captured text.
      throw new Error('composeClaudeQuery must not be called for a copyOnly (captured todo) item');
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

// ---------------------------------------------------------------------------
// Injection pending affordance copy (1.5b / M10c)
// ---------------------------------------------------------------------------

/**
 * The calm starting line on the spawning tab while the injection is armed. No
 * working vocabulary, no spinner: it reassures without reading as "Claude is
 * working" on an empty pane (1.5b).
 */
export const INJECTION_STARTING_COPY =
  'Starting your session. The first step will be typed in for you.';

/**
 * The single ~4s threshold copy change (1.5b). A coarse, honest, non-metronome
 * cue: one step at one threshold so a time-blind brain reads "still going, not
 * hung" and does not disengage at second 6.
 */
export const INJECTION_THRESHOLD_COPY =
  'Still starting, this can take a few seconds.';

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
// Pull-forward candidate (M8b-ii, 4.6)
// ---------------------------------------------------------------------------

/**
 * Selects the single calmest non-paused active card to surface in the opt-in
 * pull-forward affordance ("Want another?", 4.6/6.3).
 *
 * Candidate set: items where paused===false AND the lane is not 'done' (an
 * ACTIVE card in the program-board sense: it still has work to do, but does
 * not currently need-you, so it was not surfaced as the hero).
 *
 * "Calmest" in Phase 1 (without the full rankItems engine): the last card in
 * producer board order, since the producer places the most urgent items first.
 * Returns null when no eligible non-paused active card exists.
 */
export function pullForwardCandidate(
  items: DashboardItem[],
): DashboardItem | null {
  // Exclude paused and done cards (4.6: "ACTIVE card", lane!=='paused', and we
  // also skip lane==='done' since a done card is not a forward-pull candidate).
  const eligible = items.filter((i) => !i.paused && i.slug !== '' && !isLaneDone(i));
  if (eligible.length === 0) return null;
  // Calmest = last in producer order (producer sorts most-urgent first).
  return eligible[eligible.length - 1];
}

/**
 * Returns true when an item's underlying lane is 'done'. We check the kind
 * field (mapped from the producer's lane) rather than the raw lane string since
 * DashboardItem is already mapped. A 'done' card has dod.met === dod.total when
 * total > 0. We use a conservative check: if the item is not paused and has a
 * positive dod total with all steps met, treat it as done.
 *
 * In Phase 1 the producer also emits a `lane` field on ProgramCard, but
 * DashboardItem does not carry it after mapping. We approximate done-ness from
 * the DoD numbers, which is sufficient for the pull-forward gate.
 */
function isLaneDone(item: DashboardItem): boolean {
  return item.dodTotal > 0 && item.dodMet === item.dodTotal;
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
