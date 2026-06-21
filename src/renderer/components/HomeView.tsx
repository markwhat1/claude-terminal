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
import {
  applyReroll,
  parkHero,
  type ParkedHeroSlot,
} from '@shared/hero-reroll';

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
   * The settle class to apply to the hero card root (M8b-i).
   * One of 'settle-ordinary' | 'settle-decided' | null.
   * null when the hero has no justResolved record or when reduced-motion is
   * active (count still ticks in both cases, 1.5).
   */
  settleClass: 'settle-ordinary' | 'settle-decided' | null;
  /**
   * The re-roll "Not now" handler (M11 / 1.6). When provided, a quiet
   * "Not now" button renders in the footer (the 1.1 budget "not now" slot,
   * intentionally empty in Phase 0/1, now filled). When null or undefined,
   * the slot stays empty (e.g. when ranked.length < 2, nothing to surface).
   */
  onReroll?: (() => void) | null;
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
  return action !== 'openPowerShell';
}

function HeroCard({ hero, primaryRef, onOpenPowerShell, onOpenClaudeWithQuery, onCopy, onOpenExternal, settleClass, onReroll }: HeroProps) {
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
              className="bg-attention text-attention-foreground hover:bg-attention/90"
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
              className="bg-attention text-attention-foreground hover:bg-attention/90"
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
}: HomeViewProps) {
  const regionRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  // The Home REGION (not the button) is focused on mount (1.1 keyboard floor).
  useEffect(() => {
    regionRef.current?.focus();
  }, []);

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

  // Build a lookup of recent-close records by item id so we can annotate
  // items with settle classes in O(1). The lookup is rebuilt whenever
  // recentCloses changes.
  const recentCloseMap = useMemo(() => {
    const map = new Map<string, ClosedRecord>();
    for (const rec of recentCloses) {
      map.set(rec.id, rec);
    }
    return map;
  }, [recentCloses]);

  // Compute the settle class for a given item id (M8b-i, 1.5).
  // Returns null when prefers-reduced-motion is active (count still ticks).
  const settleClassForId = useCallback(
    (id: string): 'settle-ordinary' | 'settle-decided' | null => {
      const rec = recentCloseMap.get(id);
      if (!rec) return null;
      if (prefersReducedMotion()) return null;
      return rec.decidedAndWorked ? 'settle-decided' : 'settle-ordinary';
    },
    [recentCloseMap],
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
  const unifiedCandidates: DashboardItem[] = useMemo(() => {
    const boardNeedsYou = boardItems.filter((i) => i.needsYou && !i.paused);
    return [...boardNeedsYou, ...idleTabItems];
  }, [boardItems, idleTabItems]);

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
  // in Tier 6 inside rankItems, so they do not appear as the hero.
  const rankedItems = useMemo(
    () => rankItems(unifiedCandidates, now),
    [unifiedCandidates, now],
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
    // state and fall through to the board/caught-up logic (M8b-iii).
    if (state.programs.length === 0 && idleTabItems.length === 0) {
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
    const heroSettle = settleClassForId(hero.id);
    return (
      <div className="flex flex-col gap-4 p-6 overflow-y-auto" data-testid="home-board">
        {/* needs-you header (6.3 fixed priority: count, closed, degraded) */}
        <div className="flex items-center gap-3 flex-nowrap" data-testid="home-needs-header">
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
        />

        <NeedsYouList rows={needsYouRows} pausedCount={pausedCount} now={now} />
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
