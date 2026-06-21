/**
 * HomeView: the always-on dashboard Home surface (PLAN M8a / M10d).
 *
 * PURE presentational component. It takes ALL data and handlers as props and
 * NEVER references the host IPC bridge (a grep guard enforces this, 2.6).
 * App.tsx owns the IPC read, the subscription, and the mapper; this component
 * only renders and calls the handlers it is given.
 *
 * M10d hero PRIMARY action: Claude injection (via onOpenClaudeWithQuery) for
 * decision/draft items (draftFirstVersion, openToDecide, reviewTodos,
 * summarizeChanges). The onOpenPowerShell affordance stays as a sub-dominant
 * secondary for those items. For openPowerShell items (needs-CADDC02), the
 * PowerShell opener remains the full-weight primary.
 *
 * Three-affordance budget (1.1): Claude-primary items have 3 buttons (claude,
 * powershell, copy); openPowerShell items have 2 (powershell, copy). Only one
 * button carries bg-attention per card (6.3).
 *
 * Layout fills data-terminal-area and owns its internal scroll (6.1). Three
 * dominance levels bound to concrete classes (6.2). One bg-attention accent on
 * the whole surface (1.2): the hero primary button.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { Tab, ProjectConfig } from '@shared/types';
import type { ProgramBoardState, DashboardItem, ClosedRecord } from '@shared/program-board-state';
import type { TodoItem, TodoUpdatePatch } from '@shared/capture';
import SessionStrip from './SessionStrip';
import {
  mapCardToItem,
} from '@shared/program-board-state';
import type { AgeColor } from '@shared/dashboard-ui-helpers';
import {
  pickPrimaryAction,
  heroHeadline,
  composeCopy,
  composeClaudeQuery,
  ACTION_LABELS,
  HOME_COPY,
  needsYouLine,
  closedRecentLine,
  overflowLabel,
  pausedLabel,
  degradedLine,
  ageBandLabel,
  pullForwardCandidate,
  NEEDS_YOU_ROW_CAP,
  type KnownActionId,
  type ClaudeQueryLine,
} from '@shared/home-copy';
import { rankItems } from '@shared/rank-items';
import { settleClassForId as computeSettleClass } from '@shared/settle-class';
import {
  applyReroll,
  parkHero,
  type ParkedHeroSlot,
} from '@shared/hero-reroll';
import { matchKeybinding } from '@/keybindings';
import { useStallInterrupt } from '@shared/stall-interrupt';
import {
  parkDurations,
  resurfacedNowTodos,
  todoToDashboardItem,
  morningClosedCount,
  morningCountLine,
} from '@shared/morning-ritual';

// ---------------------------------------------------------------------------
// Idle-floor constant (M8b-iii, 5.2)
// ---------------------------------------------------------------------------

/**
 * Minimum elapsed waiting time (ms) before an idle tab is considered
 * "idleNeedsYou" and enters the unified hero/glance candidate set.
 *
 * Tabs with waitingSince less than this threshold ago stay in the subordinate
 * strip (M9) but are NOT surfaced in the needs-you header count or as the hero.
 * 60 seconds: short enough to surface genuine waits, long enough to skip the
 * first-idle blip after a very fast turn.
 *
 * Guard: a tab with firstActivityAt:null or waitingSince:null is NEVER
 * idleNeedsYou regardless of this threshold.
 */
export const IDLE_AGE_FLOOR_MS = 60_000;

/**
 * Returns true when a tab qualifies as past-floor idleNeedsYou.
 *
 * A tab is idleNeedsYou when:
 *   1. Its status is 'idle' or 'requires_response' (human-waiting states).
 *   2. firstActivityAt is not null (it has had at least one working turn).
 *   3. waitingSince is not null (the human-waiting span has a start).
 *   4. The elapsed time since waitingSince is >= IDLE_AGE_FLOOR_MS.
 */
function isIdleNeedsYou(tab: Tab, now: Date): boolean {
  if (tab.status !== 'idle' && tab.status !== 'requires_response') return false;
  if (tab.firstActivityAt === null) return false;
  if (tab.waitingSince === null) return false;
  const elapsedMs = now.getTime() - tab.waitingSince;
  return elapsedMs >= IDLE_AGE_FLOOR_MS;
}

/**
 * Converts a past-floor idle tab into a DashboardItem for the unified hero set.
 *
 * Source is 'live-tab'. The item is NOT paused and idleNeedsYou:true.
 * ageColor is 'green' (the live-tab attention signal comes from the strip, not
 * the age band; the hero age band is inherited from the board card when the
 * hero is a board card).
 */
function tabToItem(tab: Tab): DashboardItem {
  return {
    id: `tab:${tab.id}`,
    slug: tab.id,
    source: 'live-tab',
    kind: 'in_progress',
    title: tab.name,
    detail: '',
    project: tab.cwd ?? null,
    badges: [],
    ageColor: 'green',
    recencyIso: null,
    gitAgeDays: null,
    url: null,
    needsYou: true,
    needsYouReasons: [],
    paused: false,
    timeSensitive: null,
    dodMet: 0,
    dodTotal: 0,
    dodAlmost: false,
    dodGap: null,
    requiresResponse: tab.status === 'requires_response',
    idleNeedsYou: true,
    justResolved: false,
    decidedAndWorked: false,
    horizon: null,
    avoidanceCategory: null,
    actions: {},
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** The load lifecycle for the program-board region (4.3 timeline, 4.5 states). */
export type HomeLoadStatus =
  /** Holding the skeleton until the first read or timeout resolves. */
  | 'loading'
  /** A successful read landed (state is present and usable). */
  | 'ready'
  /** A hard read/parse failure with no prior data. Shows path + retry. */
  | 'error';

export interface HomeViewProps {
  /** The parsed program-board state, or null while still loading. */
  programBoardState: ProgramBoardState | null;
  /** The load lifecycle state (drives skeleton vs content vs error). */
  loadStatus: HomeLoadStatus;
  /** The resolved state.json path, shown in the not-running and error states. */
  resolvedPath: string;
  /** Wall-clock now (injectable for deterministic tests). */
  now: Date;
  /**
   * The displayed count of closes in the rolling last-24h window, already
   * frozen to its session-high by the reader (loss-aversion guard, 1.5).
   * Named closedRecent, never closedToday.
   */
  closedRecent: number;
  /**
   * The recent resolved-set entries from the reader. Used to annotate items
   * with settle classes (justResolved + decidedAndWorked, 1.5/M8b-i).
   * Passed as a snapshot; HomeView does NOT mutate it.
   */
  recentCloses: ClosedRecord[];
  /**
   * Live session tabs from the App. Used to compute past-floor idleNeedsYou
   * items for the unified hero/glance candidate set (M8b-iii, 4.6) and to
   * drive the subordinate SessionStrip (M9).
   *
   * Optional for backward compatibility with existing tests that do not pass
   * tabs; defaults to []. Tabs with waitingSince:null or firstActivityAt:null
   * are never idleNeedsYou (null guard, spec explicit).
   */
  tabs?: Tab[];
  /**
   * The project registry for per-row strip hues (M9 / 6.4).
   * Optional for backward compatibility; defaults to [].
   */
  projects?: ProjectConfig[];
  /**
   * The Home-aware tab-select handler from App (M9 / 6.4).
   * Passed to SessionStrip so row-clicks jump to the right tab.
   * Optional for backward compatibility; defaults to a no-op.
   */
  handleSelectTab?: (tabId: string) => void;
  /**
   * Open a PowerShell into a repo (secondary affordance for Claude-primary
   * items; remains the primary for openPowerShell/needs-CADDC02 items, 3.2).
   */
  onOpenPowerShell: (repo: string | null) => void;
  /**
   * Open a Claude session with the composed canned query (M10d primary for
   * decision/draft items). The query argument is a branded ClaudeQueryLine so
   * the PHI boundary is enforced at the type level (3.4). The repo argument is
   * the hero program's repos[0] slug; App.tsx resolves the absolute cwd from
   * workspaceDir + repo.
   */
  onOpenClaudeWithQuery?: (query: ClaudeQueryLine, repo: string | null) => void;
  /** Copy an inert display string to the clipboard. */
  onCopy: (text: string) => void;
  /** Open a feed url externally (routed to the host openExternal in App). */
  onOpenExternal: (url: string) => void;
  /** Retry the program-board read after a hard error. */
  onRetry: () => void;
  /**
   * M12: persist one captured todo. App.tsx wires this to the capture:append
   * IPC (which validates + persists server-side). The single argument is the
   * raw captured text, the only field set at capture time (PLAN-PHASE-2-3 line
   * 53). The text is DISPLAY-ONLY and is never an action payload. Optional for
   * backward compatibility; when omitted the bar still opens but Enter no-ops.
   */
  onCapture?: (text: string) => void;
  /**
   * M12: the quiet Inbox(N) glance number, the open-todo count from the store.
   * Rendered as a calm muted number, NEVER a red badge (PLAN-PHASE-2-3 line 45).
   * Optional; defaults to 0.
   */
  inboxCount?: number;
  /**
   * M15: the todo items from the capture store. Used to drive the triage panel
   * (one untriaged item at a time) and the @now/@next/@later horizon bands.
   * Optional for backward compatibility; defaults to [].
   */
  todos?: TodoItem[];
  /**
   * M15: persist a horizon assign, park, or done mutation. App.tsx wires this
   * to the todo:update IPC (LOCAL-ONLY). The patch contains only structured
   * fields; the item text is never modified. Optional for backward compat.
   */
  onUpdateTodo?: (id: string, patch: TodoUpdatePatch) => void;
  /**
   * M16: stall pattern-interrupt. When true, an in-place pulse is applied to
   * the hero primary button and the periphery is dimmed after STALL_THRESHOLD_MS
   * of inactivity. Default OFF (false). Mirror of the notifyOnIdle store flag
   * pattern (PLAN-PHASE-2-3.md line 76, PLAN.md 1.8).
   */
  stallInterrupt?: boolean;
  /**
   * M17: commitment-mirror intake. When true, a first-open intake panel renders
   * above the hero at the start of the session. The user can commit to the hero
   * item or skip. The intake IS the lock-in affordance (PLAN.md 1.9, 1.1): it
   * lives at first-open ONLY and does NOT add a second persistent button on the
   * resting hero. Default OFF (false).
   */
  commitmentMirror?: boolean;
  /**
   * M18: morning ritual + parking. When true, a first-open morning-ritual surface
   * renders where parked-and-resurfaced @now items get retriaged and the rolling
   * last-24h completion count shows momentum. CUE-BOUND to first-open (the same
   * app-open cue Phase 1 uses), DEFAULT OFF (PLAN-PHASE-2-3.md line 78, PLAN.md
   * 1.5 / 1.10). The completion surface carries the three Phase-1 honesty guards
   * (suppressed-when-zero, rolling-24h not midnight-reset, no streak language).
   */
  morningRitual?: boolean;
  /**
   * M18: the ids of todos that were just completed this session, used to render
   * the motion-safe completion settle row (the row settles, the next Tier-5 item
   * slides up, the count ticks). App owns this transient list; HomeView only
   * renders the settle beat. Optional; defaults to []. No confetti, no streaks.
   */
  recentTodoCloses?: string[];
}

// ---------------------------------------------------------------------------
// Freshness helper for the degraded marker (4.3)
// ---------------------------------------------------------------------------

const FRESH_THRESHOLD_MS = 150_000; // ~2.5 minutes (matches computeFreshness)

function parseNaiveLocalMinutesAgo(generatedAt: string | null, now: Date): number | null {
  if (!generatedAt) return null;
  const m = generatedAt.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?$/,
  );
  if (!m) return null;
  const d = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    m[4] !== undefined ? parseInt(m[4], 10) : 0,
    m[5] !== undefined ? parseInt(m[5], 10) : 0,
    m[6] !== undefined ? parseInt(m[6], 10) : 0,
  );
  const ageMs = now.getTime() - d.getTime();
  if (ageMs < FRESH_THRESHOLD_MS) return null; // fresh: no marker
  return Math.floor(ageMs / 60_000);
}

// ---------------------------------------------------------------------------
// Skeleton (4.5: hero block at hero min-height + N row blocks, zero reflow)
// ---------------------------------------------------------------------------

/** The hero min-height, carried by BOTH the skeleton hero and the live HeroCard
 *  root so loading-to-content has zero hero-region layout shift (4.5/1.13). A
 *  short hero (one-line title, no badges, url null) still reserves this height. */
const HERO_MIN_HEIGHT = 'min-h-[180px]';

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6" data-testid="home-skeleton">
      <Skeleton
        data-testid="home-skeleton-hero"
        className={cn('w-full rounded-xl', HERO_MIN_HEIGHT)}
      />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton
          key={i}
          data-testid="home-skeleton-row"
          className="w-full h-9"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The hero card (6.3)
// ---------------------------------------------------------------------------

interface HeroProps {
  hero: DashboardItem;
  now: Date;
  primaryRef: React.RefObject<HTMLButtonElement | null>;
  onOpenPowerShell: (repo: string | null) => void;
  onOpenClaudeWithQuery?: (query: ClaudeQueryLine, repo: string | null) => void;
  onCopy: (text: string) => void;
  onOpenExternal: (url: string) => void;
  /**
   * The settle class to apply to the hero card root (M8b-i / M13).
   * One of 'settle-ordinary' | 'settle-decided' | 'settle-avoidance' | null.
   * null when the hero has no justResolved record or when reduced-motion is
   * active (count still ticks in both cases, 1.5).
   *
   * settle-avoidance (M13): the louder, still-motion-safe beat for an
   * avoidance-category close. Still calm, still no confetti (1.4).
   */
  settleClass: 'settle-ordinary' | 'settle-decided' | 'settle-avoidance' | null;
  /**
   * The re-roll "Not now" handler (M11 / 1.6). When provided, a quiet
   * "Not now" button renders in the footer (the 1.1 budget "not now" slot,
   * intentionally empty in Phase 0/1, now filled). When null or undefined,
   * the slot stays empty (e.g. when ranked.length < 2, nothing to surface).
   */
  onReroll?: (() => void) | null;
  /**
   * M16: when true, apply the stall-pulse class to the hero primary button.
   * The class is an opacity/animate-pulse change ONLY; no position or layout
   * change (in-place only, PLAN-PHASE-2-3.md line 76 / PLAN.md 1.8).
   */
  stallActive?: boolean;
}

/**
 * Returns true when the given action should route to Claude injection (M10d).
 *
 * All actions EXCEPT openPowerShell are Claude-appropriate: they involve
 * reading/writing files in the repo and are well-suited to a Claude session.
 * openPowerShell is reserved for needs-CADDC02 items that genuinely require
 * a live shell (not a Claude session).
 */
function isClaudePrimaryAction(action: KnownActionId): boolean {
  // openPowerShell is shell-routed; copyOnly (a captured todo) is Copy-only and
  // must NEVER reach the Claude-injection path (PLAN.md 1.7 / M12).
  return action !== 'openPowerShell' && action !== 'copyOnly';
}

function HeroCard({ hero, primaryRef, onOpenPowerShell, onOpenClaudeWithQuery, onCopy, onOpenExternal, settleClass, onReroll, stallActive = false }: HeroProps) {
  const action: KnownActionId = pickPrimaryAction(hero);
  const headline = heroHeadline(hero, action);
  const repo = hero.project; // repos[0], the cwd target.
  const label = ACTION_LABELS[action];
  // A primary is constructible only when there is a resolvable repo (6.3).
  const hasPrimary = repo !== null && repo !== '';
  const copyText = composeCopy(hero);
  // Claude injection is the primary for decision/draft items (M10d). The
  // openPowerShell action stays as the primary only for needs-CADDC02 items.
  const useClaudePrimary = hasPrimary && isClaudePrimaryAction(action) && !!onOpenClaudeWithQuery;

  // Build the Claude query once for this render (branded string, no PHI).
  const claudeQuery: ClaudeQueryLine | null = useClaudePrimary
    ? composeClaudeQuery({
        action,
        programSlug: hero.slug,
        programName: hero.title,
        kind: hero.kind,
      })
    : null;

  // Static map so Tailwind's JIT sees the literal band classes (4.3). The
  // capped age band is the ONLY heat signal on the hero (1.4).
  const HERO_BAND_CLASS: Record<AgeColor, string> = {
    green: 'border-success',
    yellow: 'border-warning',
    orange: 'border-age-orange',
    red: 'border-destructive',
  };
  const bandClass = HERO_BAND_CLASS[hero.ageColor];

  return (
    <Card
      className={cn('border-l-4 gap-4 py-6', HERO_MIN_HEIGHT, bandClass, settleClass)}
      data-testid="home-hero"
    >
      <CardHeader>
        <CardTitle
          className="text-xl font-semibold text-foreground"
          data-testid="home-hero-title"
        >
          {hero.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-foreground" data-testid="home-hero-headline">
          {headline}
        </p>
        {hero.badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hero.badges.map((b) => (
              <span
                key={b}
                className="text-xs text-muted-foreground rounded-sm bg-muted px-1.5 py-0.5"
              >
                {b}
              </span>
            ))}
          </div>
        )}
        {hero.url && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline w-fit text-left"
            data-testid="home-hero-feed-link"
            onClick={() => onOpenExternal(hero.url as string)}
          >
            {hero.url}
          </button>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        {!hasPrimary ? (
          // No-action fallback (6.3): a Copy-only hero, NEVER a disabled primary
          // in the most dominant pixel.
          <>
            <Button
              ref={primaryRef}
              variant="secondary"
              data-testid="home-hero-copy-only"
              onClick={() => onCopy(copyText)}
            >
              Copy
            </Button>
            {onReroll && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="home-hero-reroll"
                onClick={onReroll}
              >
                Not now
              </Button>
            )}
          </>
        ) : useClaudePrimary ? (
          // Claude-primary: full-weight Claude injection button (M10d, 1.1).
          <>
            <Button
              ref={primaryRef}
              className={cn(
                'bg-attention text-attention-foreground hover:bg-attention/90',
                // M16: stall-pulse is an opacity/animation class only (in-place).
                stallActive && 'stall-pulse',
              )}
              data-testid="home-hero-primary"
              onClick={() => onOpenClaudeWithQuery!(claudeQuery!, repo)}
            >
              {label}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="home-hero-powershell"
              onClick={() => onOpenPowerShell(repo)}
            >
              Open shell
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="home-hero-copy"
              onClick={() => onCopy(copyText)}
            >
              Copy
            </Button>
            {onReroll && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="home-hero-reroll"
                onClick={onReroll}
              >
                Not now
              </Button>
            )}
          </>
        ) : (
          // openPowerShell primary: shell is the right affordance for this item.
          <>
            <Button
              ref={primaryRef}
              className={cn(
                'bg-attention text-attention-foreground hover:bg-attention/90',
                // M16: stall-pulse is an opacity/animation class only (in-place).
                stallActive && 'stall-pulse',
              )}
              data-testid="home-hero-primary"
              onClick={() => onOpenPowerShell(repo)}
            >
              {label}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="home-hero-copy"
              onClick={() => onCopy(copyText)}
            >
              Copy
            </Button>
            {onReroll && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="home-hero-reroll"
                onClick={onReroll}
              >
                Not now
              </Button>
            )}
          </>
        )}
      </CardFooter>
      {hasPrimary && (
        <p
          className="px-6 text-xs text-muted-foreground"
          data-testid="home-hero-helper"
        >
          {useClaudePrimary
            ? `Open Claude in ${repo}`
            : `Open a shell in ${repo}`}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The needs-you list (sub-dominant rows, capped, with overflow + paused, 6.2/4.6)
// ---------------------------------------------------------------------------

interface NeedsYouListProps {
  rows: DashboardItem[];
  pausedCount: number;
  now: Date;
}

function NeedsYouList({ rows, pausedCount }: NeedsYouListProps) {
  const [overflowExpanded, setOverflowExpanded] = useState(false);
  const [pausedExpanded, setPausedExpanded] = useState(false);
  const overflowControlRef = useRef<HTMLButtonElement | null>(null);

  const visible = rows.slice(0, NEEDS_YOU_ROW_CAP);
  const overflow = rows.slice(NEEDS_YOU_ROW_CAP);

  // Group the expanded overflow by age band, freshest first (4.6).
  const bandOrder: DashboardItem['ageColor'][] = ['green', 'yellow', 'orange', 'red'];
  const grouped = bandOrder
    .map((color) => ({ color, items: overflow.filter((i) => i.ageColor === color) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col" data-testid="home-needs-you-list">
      {visible.map((item) => (
        <NeedsYouRow key={item.id} item={item} />
      ))}

      {overflow.length > 0 && (
        <button
          type="button"
          ref={overflowControlRef}
          className="text-xs text-muted-foreground px-3 py-2 text-left w-fit hover:text-foreground"
          data-testid="home-overflow-control"
          onClick={() => setOverflowExpanded((v) => !v)}
        >
          {overflowLabel(overflow.length)}
        </button>
      )}

      {overflowExpanded && overflow.length > 0 && (
        <div data-testid="home-overflow-expanded">
          {grouped.map((g) => (
            <div key={g.color}>
              <div
                className="text-xs text-muted-foreground px-3 pt-2"
                data-testid="home-overflow-band-header"
              >
                {ageBandLabel(g.color)}
              </div>
              {g.items.map((item) => (
                <NeedsYouRow key={item.id} item={item} />
              ))}
            </div>
          ))}
        </div>
      )}

      {pausedCount > 0 && (
        <button
          type="button"
          className="text-xs text-muted-foreground px-3 py-2 text-left w-fit hover:text-foreground"
          data-testid="home-paused-control"
          onClick={() => setPausedExpanded((v) => !v)}
        >
          {pausedLabel(pausedCount)}
        </button>
      )}
    </div>
  );
}

function NeedsYouRow({ item }: { item: DashboardItem }) {
  return (
    <div
      className="text-sm text-foreground px-3 py-2"
      data-testid="home-needs-you-row"
    >
      {item.title}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Caught-up surface (M8b-ii / 4.6 / 6.3)
// ---------------------------------------------------------------------------

interface CaughtUpSurfaceProps {
  displayedClosed: number;
  items: DashboardItem[];
  pausedCount: number;
  onOpenPowerShell: (repo: string | null) => void;
  onOpenClaudeWithQuery?: (query: ClaudeQueryLine, repo: string | null) => void;
  onCopy: (text: string) => void;
  onOpenExternal: (url: string) => void;
}

/**
 * The caught-up state: "Clear. Keep working." + suppressed-when-zero closed
 * count, then the opt-in pull-forward behind a quiet "Want another?" button.
 *
 * Default: headline + count only, nothing to dismiss (4.6/6.3).
 * The pull-forward card is ONLY visible after activating "Want another?".
 * The affordance is a quiet link/button, NEVER bg-attention (6.3/1.2).
 * Candidate set for pull-forward EXCLUDES paused cards (4.6).
 */
function CaughtUpSurface({
  displayedClosed,
  items,
  pausedCount,
  onOpenPowerShell,
  onOpenClaudeWithQuery,
  onCopy,
  onOpenExternal,
}: CaughtUpSurfaceProps) {
  const [pullActive, setPullActive] = useState(false);

  // Single calmest non-paused active card for the opt-in pull-forward (4.6).
  // Computed once from items; a null candidate hides the affordance entirely.
  const pullCandidate = useMemo(() => pullForwardCandidate(items), [items]);
  // A fake primaryRef needed by HeroCard (no auto-focus here).
  const pullPrimaryRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="flex flex-col gap-2 p-6" data-testid="home-caught-up">
      {/* Headline: the calm acknowledgment (6.3). */}
      <p className="text-base text-foreground">{HOME_COPY.caughtUp}</p>

      {/* Closed count: suppressed when zero (1.5 / M8b-i). NEVER "today". */}
      {displayedClosed > 0 && (
        <span
          className="text-sm text-muted-foreground"
          data-testid="home-closed-count"
        >
          {closedRecentLine(displayedClosed)}
        </span>
      )}

      {/* "Want another?" opt-in affordance: only shown when there is an
          eligible non-paused candidate. Quiet link/button, NOT bg-attention
          so no second saturated accent appears on the all-clear surface (6.3). */}
      {pullCandidate && !pullActive && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline w-fit text-left hover:text-foreground"
          data-testid="home-want-another"
          onClick={() => setPullActive(true)}
        >
          Want another?
        </button>
      )}

      {/* Pull-forward card: reveals the calmest non-paused active card.
          Shown only after activation, NOT auto-rendered at the dopamine
          peak (4.6/6.3). */}
      {pullCandidate && pullActive && (
        <div data-testid="home-pull-forward" className="mt-2">
          <p className="text-xs text-muted-foreground mb-2">Pull one forward?</p>
          <div data-testid="home-pull-forward-card">
            <HeroCard
              hero={pullCandidate}
              now={new Date()}
              primaryRef={pullPrimaryRef}
              onOpenPowerShell={onOpenPowerShell}
              onOpenClaudeWithQuery={onOpenClaudeWithQuery}
              onCopy={onCopy}
              onOpenExternal={onOpenExternal}
              settleClass={null}
            />
          </div>
        </div>
      )}

      {/* Paused disclosure: its own quiet fold, never nested inside
          pull-forward (4.6/6.3). */}
      {pausedCount > 0 && (
        <button
          type="button"
          className="text-xs text-muted-foreground text-left w-fit"
          data-testid="home-paused-control"
        >
          {pausedLabel(pausedCount)}
        </button>
      )}
    </div>
  );
}

// SessionStrip is now the real component imported from ./SessionStrip (M9).
// The Phase-0 placeholder is removed.

// ---------------------------------------------------------------------------
// HomeView root
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// prefers-reduced-motion helper (1.5 / M8b-i)
// ---------------------------------------------------------------------------

/**
 * Returns true when the user has opted into reduced motion. Calls matchMedia
 * at render time so tests can override window.matchMedia and get the right
 * result without React lifecycle complications.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// CaptureBar (M12, one-gesture capture)
// ---------------------------------------------------------------------------

interface CaptureBarProps {
  /** Whether the bar is open (visible). The input is ALWAYS mounted so the ref
   *  is stable for synchronous focus; this only toggles visibility. */
  open: boolean;
  /** A ref to the input, focused SYNCHRONOUSLY by the keydown handler. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Persist the typed text (App wires this to capture:append). */
  onCapture?: (text: string) => void;
  /** Close the bar (Escape, or after a successful capture). */
  onClose: () => void;
}

/**
 * The capture bar input. ALWAYS mounted (so inputRef is stable for the
 * synchronous focus the keydown handler performs); hidden via a class when
 * closed so the ref exists before the bar is opened.
 *
 * Enter persists with ONLY text set (PLAN-PHASE-2-3 line 53). The captured text
 * is inert: it is handed to onCapture verbatim and is never an action payload.
 * Escape closes without capturing.
 */
function CaptureBar({ open, inputRef, onCapture, onClose }: CaptureBarProps) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const text = inputRef.current?.value ?? '';
      const trimmed = text.trim();
      if (trimmed.length === 0) return; // nothing to capture
      onCapture?.(trimmed);
      if (inputRef.current) inputRef.current.value = '';
      onClose();
    } else if (e.key === 'Escape') {
      if (inputRef.current) inputRef.current.value = '';
      onClose();
    }
  };

  return (
    <div
      data-testid={open ? 'home-capture-bar-open' : 'home-capture-bar-closed'}
      className={cn(
        'px-6 pt-4',
        // Always mounted; visually hidden when closed so the input ref is stable
        // for synchronous focus before the bar is first opened.
        open ? 'block' : 'hidden',
      )}
    >
      <input
        ref={inputRef}
        type="text"
        data-testid="home-capture-input"
        placeholder="Capture a thought, then Enter"
        aria-label="Capture a thought"
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// M15: triage panel (one item at a time, J.O.T. applied to triage)
// ---------------------------------------------------------------------------

/**
 * Returns the next item eligible for triage (horizon:null, doneAt:null, not
 * currently parked). Only one item is surfaced at a time. The first such item
 * in insertion order is used (FIFO, consistent with J.O.T.).
 */
function nextUntriaged(todos: TodoItem[], now: Date): TodoItem | null {
  const nowMs = now.getTime();
  for (const item of todos) {
    if (item.doneAt !== null) continue;
    if (item.horizon !== null) continue;
    if (item.parkedUntil !== null && item.parkedUntil > nowMs) continue;
    return item;
  }
  return null;
}

interface TriagePanelProps {
  item: TodoItem;
  onAssign: (id: string, horizon: 'now' | 'next' | 'later') => void;
  onPark: (id: string) => void;
  now: Date;
}

/**
 * The triage panel surfaces exactly ONE untriaged item at a time.
 *
 * Three horizon buttons (@now, @next, @later) plus a one-tap park/not-now
 * action. No full inbox list, no red badge. The panel carries no
 * destructive/bg-red/bg-attention styling (PLAN-PHASE-2-3 line 45).
 */
function TriagePanel({ item, onAssign, onPark }: TriagePanelProps) {
  return (
    <div
      className="px-6 pt-3 pb-1"
      data-testid="home-triage-panel"
    >
      <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
        <span
          className="text-sm text-foreground"
          data-testid="home-triage-item-text"
        >
          {item.text}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            data-testid="home-triage-assign-now"
            onClick={() => onAssign(item.id, 'now')}
          >
            @now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="home-triage-assign-next"
            onClick={() => onAssign(item.id, 'next')}
          >
            @next
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="home-triage-assign-later"
            onClick={() => onAssign(item.id, 'later')}
          >
            @later
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            data-testid="home-triage-park"
            onClick={() => onPark(item.id)}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// M15: @next/@later horizon collapse
// ---------------------------------------------------------------------------

interface HorizonCollapseProps {
  /** All todos with horizon 'next' or 'later' (open, not parked past now). */
  items: TodoItem[];
}

/**
 * Collapses @next and @later todos behind one "+N more" control.
 * Never renders three equal columns; always a single control.
 * The collapsed items are not rendered individually when collapsed.
 */
function HorizonCollapse({ items }: HorizonCollapseProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="px-6 pb-2" data-testid="home-horizon-collapse">
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground"
        data-testid="home-todo-collapse-control"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? `Hide @next/@later (${items.length})` : `+${items.length} more (@next/@later)`}
      </button>
      {expanded && (
        <div className="mt-1 flex flex-col gap-1" data-testid="home-horizon-expanded">
          {items.map((item) => (
            <div
              key={item.id}
              className="text-sm text-muted-foreground px-2 py-1"
              data-testid="home-horizon-expanded-item"
            >
              {item.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// M17: commitment-mirror intake (first-open intake, default OFF, PLAN.md 1.9)
// ---------------------------------------------------------------------------

interface CommitmentMirrorIntakeProps {
  /** The current hero item to commit to. */
  hero: DashboardItem;
  /** Called when the user confirms commitment to the hero item. */
  onConfirm: () => void;
  /** Called when the user skips the intake for this session. */
  onSkip: () => void;
}

/**
 * The commitment-mirror intake panel.
 *
 * Shown ONCE per session at first open when the flag is on (PLAN.md 1.9).
 * The user can commit ("I'll work on this") or skip ("Not today").
 *
 * Hard constraints (from the spec):
 *   - This IS the lock-in affordance. It lives at first-open ONLY.
 *   - It does NOT add a second persistent button on the resting hero (1.1 budget).
 *   - The locked hero NEVER uses "still not done" or any time-since-lock language.
 *   - No streak / chain / "N days" copy anywhere in this component (1.4 / 6.6).
 *   - No em dashes. No AI-slop words.
 *
 * Copy is calm and forward-looking, not a guilt prompt.
 */
function CommitmentMirrorIntake({ hero, onConfirm, onSkip }: CommitmentMirrorIntakeProps) {
  return (
    <div
      className="px-6 pt-4 pb-2"
      data-testid="home-commitment-intake"
    >
      <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
        <p className="text-sm text-foreground">
          What do you want to move forward today?
        </p>
        <p
          className="text-sm font-medium text-foreground"
          data-testid="home-commitment-hero-name"
        >
          {hero.title}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            data-testid="home-commitment-confirm"
            onClick={onConfirm}
          >
            Yes, pick this up
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            data-testid="home-commitment-skip"
            onClick={onSkip}
          >
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// M18: the captured @now todo hero (Tier-5 surface, PLAN-PHASE-2-3.md 63-71)
// ---------------------------------------------------------------------------

interface TodoHeroProps {
  /** The Tier-5 todo DashboardItem (item.slug is the todo id). */
  item: DashboardItem;
  /** The small park duration set (today / this week / next week), all future. */
  durations: { today: number; thisWeek: number; nextWeek: number };
  /** Mark the todo done (sets doneAt). The next Tier-5 item then slides up. */
  onDone: (id: string) => void;
  /** Park the todo to a future timestamp (hidden, not deleted). */
  onPark: (id: string, parkedUntil: number) => void;
  /** Copy the inert display text. */
  onCopy: (text: string) => void;
}

/**
 * The captured @now todo as the hero. A captured todo is DISPLAY-ONLY (PLAN.md
 * 1.7): no Claude-injection primary, no shell opener. Its affordances are Done
 * (completion), a one-tap park duration set ("not now"), and Copy.
 *
 * Park is one-tap with a small set (today / this week / next week). The set is
 * disclosed behind a single "not now" control so the resting hero stays calm
 * (1.1 affordance budget), then collapses after a choice.
 *
 * No confetti, no streaks. The completion settle beat is rendered separately by
 * HomeView from recentTodoCloses so the row can fade after doneAt is persisted.
 */
function TodoHero({ item, durations, onDone, onPark, onCopy }: TodoHeroProps) {
  const todoId = item.slug;
  const [parkOpen, setParkOpen] = useState(false);

  return (
    <Card className={cn('border-l-4 gap-4 py-6', HERO_MIN_HEIGHT, 'border-success')} data-testid="home-todo-hero">
      <CardHeader>
        <CardTitle className="text-xl font-semibold text-foreground" data-testid="home-todo-hero-title">
          {item.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">One thing you captured. Pick it up, or set it aside.</p>
      </CardContent>
      <CardFooter className="gap-2 flex-wrap">
        <Button
          className="bg-attention text-attention-foreground hover:bg-attention/90"
          data-testid="home-todo-done"
          onClick={() => onDone(todoId)}
        >
          Done
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          data-testid="home-todo-park-open"
          onClick={() => setParkOpen((v) => !v)}
        >
          Not now
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="home-todo-copy"
          onClick={() => onCopy(item.title)}
        >
          Copy
        </Button>
        {parkOpen && (
          <div className="flex items-center gap-2 flex-wrap" data-testid="home-todo-park-set">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              data-testid="home-todo-park-today"
              onClick={() => onPark(todoId, durations.today)}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              data-testid="home-todo-park-this-week"
              onClick={() => onPark(todoId, durations.thisWeek)}
            >
              This week
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              data-testid="home-todo-park-next-week"
              onClick={() => onPark(todoId, durations.nextWeek)}
            >
              Next week
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// M18: the completion settle row (the row settles, motion-safe, no confetti)
// ---------------------------------------------------------------------------

interface TodoSettleRowProps {
  /** The just-completed todo text to acknowledge in the settle beat. */
  text: string;
  /** True when prefers-reduced-motion is active; suppresses the animation class. */
  reducedMotion: boolean;
}

/**
 * The motion-safe settle row for a just-completed todo. The class is the same
 * opacity-only settle-ordinary ease the done-lane uses (no layout mutation, no
 * confetti, no streak). Under reduced motion the class is dropped (the row still
 * renders; only the animation is suppressed).
 */
function TodoSettleRow({ text, reducedMotion }: TodoSettleRowProps) {
  return (
    <div
      className={cn('px-6 py-1 text-sm text-muted-foreground', !reducedMotion && 'settle-ordinary')}
      data-testid="home-todo-settle"
    >
      {`Finished: ${text}`}
    </div>
  );
}

// ---------------------------------------------------------------------------
// M18: the morning ritual (cue-bound to first-open, default OFF)
// ---------------------------------------------------------------------------

interface MorningRitualProps {
  /** The rolling last-24h completion count for the honest momentum line. */
  closedCount: number;
  /** The next item to retriage this morning (a resurfaced/parked or untriaged
   *  todo), or null when there is nothing to retriage. */
  retriageItem: TodoItem | null;
  /** Assign a horizon to the retriage item. */
  onAssign: (id: string, horizon: 'now' | 'next' | 'later') => void;
  /** Park the retriage item (one-tap, this-week default). */
  onPark: (id: string) => void;
  /** Finish the ritual for this session (it dismisses, cue-bound not persistent). */
  onDone: () => void;
}

/**
 * The morning ritual surface (PLAN-PHASE-2-3.md line 78, PLAN.md 1.9 expanded).
 *
 * Cue-bound to first-open (the same app-open cue Phase 1 uses), default OFF. It
 * is where parked-and-resurfaced items get retriaged, and it carries the rolling
 * last-24h completion count.
 *
 * The three honesty guards (PLAN-PHASE-2-3.md lines 69-71) live in this surface:
 *   1. SUPPRESSED-WHEN-ZERO: morningCountLine returns forward framing at zero,
 *      never a bare "0 done" fraction.
 *   2. ROLLING last-24h, NOT a midnight reset: the line reads "last 24h" so the
 *      cue opens on momentum, never "today" at 9am over a 24h window.
 *   3. NO streak / chain / "in a row" / "N days" language, and no bare-zero
 *      fraction. No em dashes, no AI-slop words.
 */
function MorningRitual({ closedCount, retriageItem, onAssign, onPark, onDone }: MorningRitualProps) {
  return (
    <div className="px-6 pt-4 pb-2" data-testid="home-morning-ritual">
      <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
        <p className="text-sm text-foreground">Good to see you. Here is where things stand.</p>
        <span className="text-sm text-muted-foreground" data-testid="home-morning-closed-count">
          {morningCountLine(closedCount)}
        </span>

        {retriageItem && (
          <div className="flex flex-col gap-2" data-testid="home-morning-retriage">
            <span className="text-sm text-foreground" data-testid="home-morning-retriage-text">
              {retriageItem.text}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                data-testid="home-morning-assign-now"
                onClick={() => onAssign(retriageItem.id, 'now')}
              >
                @now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="home-morning-assign-next"
                onClick={() => onAssign(retriageItem.id, 'next')}
              >
                @next
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="home-morning-assign-later"
                onClick={() => onAssign(retriageItem.id, 'later')}
              >
                @later
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                data-testid="home-morning-park"
                onClick={() => onPark(retriageItem.id)}
              >
                Not now
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            data-testid="home-morning-ritual-done"
            onClick={onDone}
          >
            Start the day
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function HomeView({
  programBoardState,
  loadStatus,
  resolvedPath,
  now,
  closedRecent,
  recentCloses,
  tabs = [],
  projects = [],
  handleSelectTab = () => undefined,
  onOpenPowerShell,
  onOpenClaudeWithQuery,
  onCopy,
  onOpenExternal,
  onRetry,
  onCapture,
  inboxCount = 0,
  todos = [],
  onUpdateTodo,
  stallInterrupt = false,
  commitmentMirror = false,
  morningRitual = false,
  recentTodoCloses = [],
}: HomeViewProps) {
  const regionRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  // The Home REGION (not the button) is focused on mount (1.1 keyboard floor).
  useEffect(() => {
    regionRef.current?.focus();
  }, []);

  // -------------------------------------------------------------------------
  // M12: one-gesture capture bar.
  //
  // The input is ALWAYS mounted (captureInputRef is stable); the bar toggles
  // visibility only. The chord handler opens the bar AND focuses the input
  // SYNCHRONOUSLY in the same keydown tick (no await, no setTimeout), so the
  // sub-2s activation axis is falsifiable: document.activeElement === input in
  // the same tick as the keydown.
  //
  // HomeView owns the listener (rather than App.tsx routing through a prop) so
  // the focus happens with no cross-component state round-trip. matchKeybinding
  // is the shared, case-sensitive matcher: the registry entry is
  // { mod:'ctrl+shift', key:'K' }, so a lowercase 'k' never opens the bar.
  // -------------------------------------------------------------------------
  const [captureOpen, setCaptureOpen] = useState(false);
  const captureInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const kb = matchKeybinding(e);
      if (kb?.mod === 'ctrl+shift' && kb.key === 'K') {
        e.preventDefault();
        // Open AND focus synchronously in this same tick. setCaptureOpen schedules
        // a re-render, but the input is already mounted, so focus() lands now.
        setCaptureOpen(true);
        captureInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const closeCapture = useCallback(() => setCaptureOpen(false), []);

  // -------------------------------------------------------------------------
  // M18: the resurfacing clock.
  //
  // Parking hides a todo while parkedUntil > now; it resurfaces when
  // parkedUntil <= now. Resurfacing must happen on each Home OPEN and on the
  // ~20s poll tick (PLAN-PHASE-2-3.md line 65), so a parked item comes back
  // without the user touching anything. The `now` PROP is fixed at the parent's
  // render, so HomeView keeps its own clock that advances every ~20s. The
  // effective clock used for resurfacing is the later of the prop clock and the
  // internal tick clock, so a parent re-render that supplies a newer `now` never
  // moves the clock backward.
  // -------------------------------------------------------------------------
  const RESURFACE_TICK_MS = 20_000;
  const [tickNow, setTickNow] = useState<number>(now.getTime());
  useEffect(() => {
    const id = setInterval(() => setTickNow(Date.now()), RESURFACE_TICK_MS);
    return () => clearInterval(id);
  }, []);
  // The effective resurfacing clock: never older than the prop clock.
  const resurfaceNow = useMemo(
    () => new Date(Math.max(now.getTime(), tickNow)),
    [now, tickNow],
  );

  // Loss-aversion guard (1.5): the displayed closedRecent is frozen to the
  // session-high so 24h pruning never decrements it mid-session. The reader
  // already provides a frozen value, but we add a second layer here so
  // stale-prop rerenders (e.g. from a parent that re-reads the reader before
  // the session-high has settled) also cannot cause a visible decrement.
  const [displayedClosed, setDisplayedClosed] = useState(closedRecent);
  useEffect(() => {
    if (closedRecent > displayedClosed) {
      setDisplayedClosed(closedRecent);
    }
  }, [closedRecent, displayedClosed]);

  // Compute the settle class for a given item id (M8b-i, 1.5 / M13). The tier
  // logic lives in the pure @shared/settle-class module so production and tests
  // share one implementation; HomeView only supplies the recent-close list and
  // the matchMedia-derived reduced-motion flag at call time.
  const settleClassForId = useCallback(
    (id: string) => computeSettleClass(id, recentCloses, prefersReducedMotion()),
    [recentCloses],
  );

  // Map board cards to items once per state change.
  const boardItems: DashboardItem[] = useMemo(() => {
    if (!programBoardState) return [];
    return programBoardState.programs.map(mapCardToItem);
  }, [programBoardState]);

  // Past-floor idleNeedsYou tab items for the unified hero/glance set (M8b-iii).
  // Guard null: tabs with firstActivityAt:null or waitingSince:null are excluded.
  const idleTabItems: DashboardItem[] = useMemo(
    () => tabs.filter((t) => isIdleNeedsYou(t, now)).map(tabToItem),
    [tabs, now],
  );

  // The unified candidate set: board needs-you (non-paused) + past-floor idle
  // tabs. Paused board cards are excluded here (they fold into "N paused").
  // idleNeedsYou tabs are never paused (tabToItem sets paused:false).
  // This set feeds BOTH the hero and the "N need you" count (4.6 invariant).
  // Captured @now todos are NOT in this set: they are Tier-5 hero candidates but
  // never inflate the program-board "N need you" glance count (4.6).
  const unifiedCandidates: DashboardItem[] = useMemo(() => {
    const boardNeedsYou = boardItems.filter((i) => i.needsYou && !i.paused);
    return [...boardNeedsYou, ...idleTabItems];
  }, [boardItems, idleTabItems]);

  // M18: the resurfaced @now todo candidates (Tier 5). resurfacedNowTodos hides
  // a still-parked todo and surfaces one whose parkedUntil has crossed the
  // resurfacing clock, so a parked item comes back on the next open / tick
  // (PLAN-PHASE-2-3.md lines 63-65). These map to Tier-5 DashboardItems the
  // ranker already understands.
  const todoCandidates: DashboardItem[] = useMemo(
    () => resurfacedNowTodos(todos, resurfaceNow).map(todoToDashboardItem),
    [todos, resurfaceNow],
  );

  // items is still needed for paused count and pull-forward candidate (both
  // consume the full board list, not the unified set).
  const items = boardItems;

  // ---------------------------------------------------------------------------
  // M11: Per-day parked-hero-id slot (1.6 / PLAN-PHASE-2-3.md M6).
  //
  // The parked slot is held in React state so re-rolls persist within the
  // session. On mount we check localStorage for a slot from a prior session on
  // the same day; a new day clears the park automatically (via dayKey compare
  // inside resolveParkedId, which returns null for a stale day).
  //
  // The slot is renderer-owned (no IPC channel; it is display state, not
  // server state). The "Not now" handler writes the slot back to localStorage
  // so a same-day reload still honors the park.
  // ---------------------------------------------------------------------------

  const PARKED_SLOT_KEY = 'home-hero-parked-slot';

  const [parkedSlot, setParkedSlot] = useState<ParkedHeroSlot | null>(() => {
    try {
      const raw = typeof localStorage !== 'undefined'
        ? localStorage.getItem(PARKED_SLOT_KEY)
        : null;
      if (!raw) return null;
      return JSON.parse(raw) as ParkedHeroSlot;
    } catch {
      return null;
    }
  });

  // The deterministic ranked list for this poll tick. Paused items already land
  // in Tier 6 inside rankItems, so they do not appear as the hero. M18: the
  // resurfaced @now todo candidates join the ranking input so a Tier-5 todo can
  // become the hero when no higher-tier program card is waiting.
  const rankedItems = useMemo(
    () => rankItems([...unifiedCandidates, ...todoCandidates], now),
    [unifiedCandidates, todoCandidates, now],
  );

  // Apply the per-day re-roll on top of the deterministic order (1.6 / M11).
  // applyReroll removes the parked id from the surfaced order so ranked[1]
  // becomes the hero. Returns the original order when nothing is parked or the
  // park is from a previous day.
  const effectiveRanked = useMemo(
    () => applyReroll(rankedItems, parkedSlot, now),
    [rankedItems, parkedSlot, now],
  );

  const hero = effectiveRanked.length > 0 ? effectiveRanked[0] : null;

  // The "Not now" handler parks the current hero for the rest of today and
  // persists the slot to localStorage so a same-day reload still honors it.
  // Only provided when there IS a ranked[1] to surface (otherwise the button
  // would park to nothing, which is a dead affordance).
  const handleReroll = useCallback(() => {
    if (!hero) return;
    const slot = parkHero(hero.id, now);
    setParkedSlot(slot);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PARKED_SLOT_KEY, JSON.stringify(slot));
      }
    } catch {
      // localStorage unavailable (tests or sandboxed renderer): in-memory state
      // already holds the slot, so the re-roll still works for the session.
    }
  }, [hero, now]);

  // Only surface the re-roll control when there is a ranked[1] to show after
  // parking the current hero (a single-card board has nowhere to go, 1.1).
  const canReroll = effectiveRanked.length > 1;

  const needsYouRows = useMemo(() => {
    // The sub-dominant list MIRRORS PRODUCER BOARD ORDER (PLAN.md 1.11 / 5.4).
    // A Phase-2 builder must NOT re-sort this list. We take unifiedCandidates
    // (which is already in producer board order: boardNeedsYou + idleTabItems)
    // and filter out only the hero. rankItems order is used ONLY for the hero
    // slot; the remaining rows stay in producer order.
    if (!hero) return unifiedCandidates;
    return unifiedCandidates.filter((i) => i.id !== hero.id);
  }, [unifiedCandidates, hero]);

  const pausedCount = useMemo(
    () => items.filter((i) => i.paused && i.needsYou).length,
    [items],
  );

  // Live working count from the real tabs (M9). Counts ALL working tabs
  // cross-project, matching the strip's cross-project scope.
  const workingCount = useMemo(
    () => tabs.filter((t) => t.status === 'working').length,
    [tabs],
  );

  // Set of tab ids that just resolved (one-shot fade for the strip, M9 / 1.5).
  // Derived from the recentCloses by matching against tab ids (source:'live-tab'
  // records have ids prefixed with 'tab:'; board cards have 'pb:').
  const justResolvedTabIds = useMemo(() => {
    const s = new Set<string>();
    for (const rec of recentCloses) {
      // live-tab items have ids like "tab:<tabId>", board cards "pb:<slug>".
      if (rec.id.startsWith('tab:')) {
        s.add(rec.id.slice(4));
      }
    }
    return s;
  }, [recentCloses]);

  // The glance count is the unified set size: hero + the rest (4.6 invariant).
  const needCount = unifiedCandidates.length;

  const minutesAgo = programBoardState
    ? parseNaiveLocalMinutesAgo(programBoardState.generated_at, now)
    : null;

  // -------------------------------------------------------------------------
  // M15: triage panel derivations
  //
  // The triage panel surfaces ONE untriaged item at a time (J.O.T. applied to
  // triage). "Untriaged" means horizon:null + doneAt:null + not currently
  // parked (parkedUntil <= now or null). The panel is separate from and never
  // auto-promoted to the hero (PLAN-PHASE-2-3 line 45).
  // -------------------------------------------------------------------------

  const triageItem = useMemo(
    () => nextUntriaged(todos, now),
    [todos, now],
  );

  // Park for "this week" from the current time. The spec requires the
  // parkedUntil is > now; a 7-day window is the first slot in the small
  // duration set (PLAN-PHASE-2-3 line 65).
  const PARK_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  const handleTriageAssign = useCallback(
    (id: string, horizon: 'now' | 'next' | 'later') => {
      onUpdateTodo?.(id, { horizon });
    },
    [onUpdateTodo],
  );

  const handleTriagePark = useCallback(
    (id: string) => {
      onUpdateTodo?.(id, { parkedUntil: now.getTime() + PARK_DURATION_MS });
    },
    [onUpdateTodo, now],
  );

  // -------------------------------------------------------------------------
  // M18: hero-todo completion + parking handlers.
  //
  // Done sets doneAt (the completion mutation, via the existing todo:update
  // channel). The next Tier-5 todo then slides up because resurfacedNowTodos
  // drops doneAt-set items, so the parent's next state no longer ranks it.
  //
  // Park is one-tap with a small duration set (today / this week / next week,
  // PLAN-PHASE-2-3.md line 65). Parking sets a FUTURE parkedUntil; the item is
  // hidden until the resurfacing clock crosses it, never deleted.
  // -------------------------------------------------------------------------
  const handleTodoDone = useCallback(
    (id: string) => {
      onUpdateTodo?.(id, { doneAt: now.getTime() });
    },
    [onUpdateTodo, now],
  );

  const handleTodoPark = useCallback(
    (id: string, parkedUntil: number) => {
      onUpdateTodo?.(id, { parkedUntil });
    },
    [onUpdateTodo],
  );

  // M18: the small park duration set, anchored at the resurfacing clock.
  const todoParkDurations = useMemo(() => parkDurations(resurfaceNow), [resurfaceNow]);

  // @next/@later collapse: open, non-parked todos with horizon 'next' or 'later'.
  const collapsedHorizonItems = useMemo(
    () => {
      const nowMs = now.getTime();
      return todos.filter(
        (t) =>
          t.doneAt === null &&
          (t.horizon === 'next' || t.horizon === 'later') &&
          (t.parkedUntil === null || t.parkedUntil <= nowMs),
      );
    },
    [todos, now],
  );

  // -------------------------------------------------------------------------
  // M16: stall pattern-interrupt (default OFF, in-place only).
  //
  // The hero settle class is the "pending justResolved" motion source that
  // defers the stall timer (one motion source at a time). Compute it here,
  // outside the body IIFE, so the hook can read it at the top level.
  //
  // Motion arbitration:
  //   - settleClass != null  => a settle is in progress; stall timer deferred.
  //   - user pointerdown/keydown on the Home region => notify() resets the clock.
  //
  // The hook is enabled only when stallInterrupt is true (default OFF). When
  // disabled, it never fires (active is always false).
  // -------------------------------------------------------------------------

  const heroSettleForStall = hero ? settleClassForId(hero.id) : null;

  const { active: stallActive, notify: stallNotify } = useStallInterrupt({
    enabled: stallInterrupt,
    settleClass: heroSettleForStall,
  });

  // Wire interaction events to the stall notifier so any user action resets
  // the clock. The Home region container is the target because it is the scope
  // of the in-place pulse (all interactions within the dashboard count).
  useEffect(() => {
    if (!stallInterrupt) return;
    const onInteract = () => stallNotify();
    window.addEventListener('pointerdown', onInteract);
    window.addEventListener('keydown', onInteract);
    return () => {
      window.removeEventListener('pointerdown', onInteract);
      window.removeEventListener('keydown', onInteract);
    };
  }, [stallInterrupt, stallNotify]);

  // -------------------------------------------------------------------------
  // M17: commitment-mirror intake state (default OFF, intake-only, PLAN.md 1.9).
  //
  // The intake renders at first open when the flag is on and there is a hero.
  // Once the user confirms or skips, intakeDismissed flips to true for the
  // lifetime of this render tree. The dismissal is session-only (not persisted):
  // the flag itself (commitmentMirror) controls whether it fires at all on the
  // next app open. No second persistent button on the resting hero (1.1 budget).
  // -------------------------------------------------------------------------

  const [intakeDismissed, setIntakeDismissed] = useState(false);

  // The intake is visible only when the flag is on, there is a hero, and the
  // user has not yet confirmed or skipped this session.
  const showIntake = commitmentMirror && !!hero && !intakeDismissed;

  const handleIntakeConfirm = useCallback(() => {
    setIntakeDismissed(true);
  }, []);

  const handleIntakeSkip = useCallback(() => {
    setIntakeDismissed(true);
  }, []);

  // -------------------------------------------------------------------------
  // M18: morning ritual state (default OFF, cue-bound to first open).
  //
  // The ritual renders ONCE at first open when the flag is on. Finishing it
  // flips ritualDismissed for this render tree (session-only; the morningRitual
  // flag controls whether it fires at all on the next app open, the same cue
  // Phase 1's Home-on-open uses). Where parked-and-resurfaced items get
  // retriaged: the retriage item is the next untriaged todo. The completion
  // surface carries the rolling last-24h count via morningClosedCount.
  // -------------------------------------------------------------------------

  const [ritualDismissed, setRitualDismissed] = useState(false);
  const showMorningRitual = morningRitual && !ritualDismissed;

  // The rolling last-24h completion count (the closedRecent model applied to
  // todo doneAt timestamps). Non-zero at a morning open when yesterday-evening
  // work is inside the window, so the cue opens on momentum (1.5).
  const morningClosed = useMemo(
    () => morningClosedCount(todos, resurfaceNow),
    [todos, resurfaceNow],
  );

  const handleRitualDone = useCallback(() => setRitualDismissed(true), []);

  // -------------------------------------------------------------------------
  // M18: the just-completed todo settle rows.
  //
  // recentTodoCloses is the transient set of todo ids completed this session.
  // For each id still present in the todos array we render a motion-safe settle
  // row acknowledging the finish (the row settles; no confetti, no streak).
  // -------------------------------------------------------------------------
  const settleRows = useMemo(() => {
    if (recentTodoCloses.length === 0) return [];
    return recentTodoCloses
      .map((id) => todos.find((t) => t.id === id))
      .filter((t): t is TodoItem => t !== undefined);
  }, [recentTodoCloses, todos]);

  // -------------------------------------------------------------------------
  // State selection (4.3 timeline / 4.5 last-good preference)
  // -------------------------------------------------------------------------

  const body = (() => {
    // 1. Loading: hold the skeleton until the first read resolves.
    if (loadStatus === 'loading') {
      return <HomeSkeleton />;
    }

    // 2. Hard error with no usable state: path + retry, NOT a skeleton (4.5).
    if (loadStatus === 'error' && !programBoardState) {
      return (
        <div className="flex flex-col gap-3 p-6" data-testid="home-error">
          <p className="text-sm text-destructive">
            Could not read the program board.
          </p>
          <p className="text-xs text-muted-foreground" data-testid="home-error-path">
            {resolvedPath}
          </p>
          <Button
            variant="secondary"
            size="sm"
            data-testid="home-error-retry"
            onClick={onRetry}
          >
            {HOME_COPY.errorRetry}
          </Button>
        </div>
      );
    }

    // From here a state object exists (last-good is preferred over empty, 4.5).
    const state = programBoardState;

    // 3. Not running: generated_at is null (the service never polled).
    if (!state || state.generated_at === null) {
      return (
        <div className="flex flex-col gap-2 p-6" data-testid="home-not-running">
          <p className="text-sm text-foreground">{HOME_COPY.notRunning}</p>
          <p className="text-xs text-muted-foreground" data-testid="home-not-running-path">
            {resolvedPath}
          </p>
        </div>
      );
    }

    // 4. Polled, nothing matched AND no live-tab candidates.
    // When programs:[] but there are past-floor idleNeedsYou tabs, skip this
    // state and fall through to the board/caught-up logic (M8b-iii). M18: a
    // resurfaced @now todo (Tier-5 candidate) also keeps the board surface alive
    // so the todo can be the hero on an otherwise-empty program board.
    if (
      state.programs.length === 0 &&
      idleTabItems.length === 0 &&
      todoCandidates.length === 0
    ) {
      return (
        <div className="p-6" data-testid="home-no-programs">
          <p className="text-sm text-muted-foreground">{HOME_COPY.noProgramsTracked}</p>
        </div>
      );
    }

    // 5. Caught up: no card needs you (paused excluded). Default is headline +
    //    count only, nothing to dismiss; the pull-forward is opt-in behind a
    //    quiet "Want another?" affordance (M8b-ii / 4.6 / 6.3). When
    //    closedRecent > 0 the count reads as a goal reached (1.10), rendered
    //    below the acknowledgment. NEVER shows "0 closed" (1.5).
    if (!hero) {
      return (
        <CaughtUpSurface
          displayedClosed={displayedClosed}
          items={items}
          pausedCount={pausedCount}
          onOpenPowerShell={onOpenPowerShell}
          onOpenClaudeWithQuery={onOpenClaudeWithQuery}
          onCopy={onCopy}
          onOpenExternal={onOpenExternal}
        />
      );
    }

    // 6. The normal board.
    // heroSettle is computed at the top level (heroSettleForStall) for the
    // stall hook; reuse it here so the settle-class lookup runs only once.
    const heroSettle = heroSettleForStall;
    return (
      <div className="flex flex-col gap-4 p-6 overflow-y-auto" data-testid="home-board">
        {/* needs-you header (6.3 fixed priority: count, closed, degraded).
            M16: stall-dim applied to periphery when the stall interrupt fires. */}
        <div
          className={cn('flex items-center gap-3 flex-nowrap', stallActive && 'stall-dim')}
          data-testid="home-needs-header"
        >
          <span className="text-sm text-foreground" data-testid="home-need-count">
            {needsYouLine(needCount, workingCount)}
          </span>
          {/* "N closed, last 24h" (1.5/M8b-i): suppressed when zero. NEVER "today". */}
          {displayedClosed > 0 && (
            <span
              className="text-xs text-muted-foreground"
              data-testid="home-closed-count"
            >
              {closedRecentLine(displayedClosed)}
            </span>
          )}
          {minutesAgo !== null && (
            <span
              className="ml-auto text-xs text-muted-foreground truncate"
              data-testid="home-degraded-marker"
            >
              {degradedLine(minutesAgo)}
            </span>
          )}
        </div>

        {/* M18: a Tier-5 captured @now todo renders its own hero surface with
            Done + a one-tap park duration set. A program/live-tab hero keeps
            the HeroCard. A captured todo is DISPLAY-ONLY, so its hero never
            carries a Claude-injection primary (PLAN.md 1.7). */}
        {hero.source === 'todo' ? (
          <TodoHero
            item={hero}
            durations={todoParkDurations}
            onDone={handleTodoDone}
            onPark={handleTodoPark}
            onCopy={onCopy}
          />
        ) : (
          <HeroCard
            hero={hero}
            now={now}
            primaryRef={primaryRef}
            onOpenPowerShell={onOpenPowerShell}
            onOpenClaudeWithQuery={onOpenClaudeWithQuery}
            onCopy={onCopy}
            onOpenExternal={onOpenExternal}
            settleClass={heroSettle}
            onReroll={canReroll ? handleReroll : null}
            stallActive={stallActive}
          />
        )}

        {/* M16: stall-dim on the sub-dominant list when the stall fires. */}
        <div className={cn(stallActive && 'stall-dim')}>
          <NeedsYouList rows={needsYouRows} pausedCount={pausedCount} now={now} />
        </div>
      </div>
    );
  })();

  return (
    <div
      ref={regionRef}
      tabIndex={-1}
      role="region"
      aria-label="Home dashboard"
      data-testid="home-view"
      className="absolute inset-0 h-full w-full overflow-y-auto outline-none @container"
    >
      {/* M12: the quiet Inbox(N) glance number. A calm muted count, NEVER a red
          badge (PLAN-PHASE-2-3 line 45). It is a glance, not an alert. */}
      <div className="flex justify-end px-6 pt-3">
        <span
          className="text-xs text-muted-foreground"
          data-testid="home-inbox-count"
          title="Captured items waiting to triage"
        >
          {`Inbox(${inboxCount})`}
        </span>
      </div>

      {/* M12: the capture bar. Always mounted (the input ref is stable for the
          synchronous focus the chord handler performs); visibility toggles. */}
      <CaptureBar
        open={captureOpen}
        inputRef={captureInputRef}
        onCapture={onCapture}
        onClose={closeCapture}
      />

      {/* M15: triage panel. One untriaged item at a time; never a full inbox
          list. The panel appears when there is an untriaged item and an
          onUpdateTodo handler is wired in. No red badge, no bg-attention. */}
      {triageItem && onUpdateTodo && (
        <TriagePanel
          item={triageItem}
          onAssign={handleTriageAssign}
          onPark={handleTriagePark}
          now={now}
        />
      )}

      {/* M15: @next/@later collapse. One "+N more" control, never three equal
          columns (PLAN-PHASE-2-3 line 45). */}
      {collapsedHorizonItems.length > 0 && (
        <HorizonCollapse items={collapsedHorizonItems} />
      )}

      {/* M17: commitment-mirror intake. Renders at first open when the flag is
          on and a hero exists. Dismisses after confirm or skip. Does NOT add a
          second persistent button on the resting hero (1.1 budget). */}
      {showIntake && hero && (
        <CommitmentMirrorIntake
          hero={hero}
          onConfirm={handleIntakeConfirm}
          onSkip={handleIntakeSkip}
        />
      )}

      {/* M18: the morning ritual. Cue-bound to first open, default OFF. Where
          parked-and-resurfaced items get retriaged; the completion surface
          carries the rolling last-24h count with the three honesty guards. */}
      {showMorningRitual && (
        <MorningRitual
          closedCount={morningClosed}
          retriageItem={triageItem}
          onAssign={handleTriageAssign}
          onPark={handleTriagePark}
          onDone={handleRitualDone}
        />
      )}

      {/* M18: the just-completed todo settle rows (the row settles, motion-safe,
          no confetti, no streak). */}
      {settleRows.map((t) => (
        <TodoSettleRow key={t.id} text={t.text} reducedMotion={prefersReducedMotion()} />
      ))}

      {body}
      {/* The subordinate strip lives below the board content (6.4). */}
      <SessionStrip
        tabs={tabs}
        now={now.getTime()}
        handleSelectTab={handleSelectTab}
        justResolvedTabIds={justResolvedTabIds}
        projects={projects}
      />
    </div>
  );
}
