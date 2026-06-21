/**
 * HomeView: the always-on dashboard Home surface (PLAN M8a, Phase 0 read-only).
 *
 * PURE presentational component. It takes ALL data and handlers as props and
 * NEVER references the host IPC bridge (a grep guard enforces this, 2.6).
 * App.tsx owns the IPC read, the subscription, and the mapper; this component
 * only renders and calls the handlers it is given.
 *
 * The Phase-0 hero PRIMARY action opens a PowerShell into the hero repo so one
 * keystroke starts work (3.2). Copy is the quiet secondary (3.3). The heavier
 * Claude injection lands in M10c.
 *
 * Layout fills data-terminal-area and owns its internal scroll (6.1). Three
 * dominance levels bound to concrete classes (6.2). One bg-attention accent on
 * the whole surface (1.2): the hero primary button.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { ProgramBoardState, DashboardItem } from '@shared/program-board-state';
import {
  mapCardToItem,
  defaultNeedsYouList,
} from '@shared/program-board-state';
import type { AgeColor } from '@shared/dashboard-ui-helpers';
import {
  selectHero,
  pickPrimaryAction,
  heroHeadline,
  composeCopy,
  ACTION_LABELS,
  HOME_COPY,
  needsYouLine,
  closedRecentLine,
  overflowLabel,
  pausedLabel,
  degradedLine,
  ageBandLabel,
  NEEDS_YOU_ROW_CAP,
  type KnownActionId,
} from '@shared/home-copy';

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
  /** Open a PowerShell into a repo (the Phase-0 hero primary action). */
  onOpenPowerShell: (repo: string | null) => void;
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

/** The hero min-height, shared by the skeleton and the live hero so loading-to-
 *  content has zero hero-region layout shift (4.5/1.13). */
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
  onCopy: (text: string) => void;
  onOpenExternal: (url: string) => void;
}

function HeroCard({ hero, primaryRef, onOpenPowerShell, onCopy, onOpenExternal }: HeroProps) {
  const action: KnownActionId = pickPrimaryAction(hero);
  const headline = heroHeadline(hero, action);
  const repo = hero.project; // repos[0], the cwd target.
  // The Phase-0 primary always opens a shell in the hero repo (3.2). The action
  // id selects only the LABEL; the behavior is the shell start.
  const label = ACTION_LABELS[action];
  // A primary is constructible only when there is a resolvable repo (6.3).
  const hasPrimary = repo !== null && repo !== '';
  const copyText = composeCopy(hero);

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
      className={cn('border-l-4 gap-4 py-6', bandClass)}
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
        {hasPrimary ? (
          <Button
            ref={primaryRef}
            className="bg-attention text-attention-foreground hover:bg-attention/90"
            data-testid="home-hero-primary"
            onClick={() => onOpenPowerShell(repo)}
          >
            {label}
          </Button>
        ) : (
          // No-action fallback (6.3): a Copy-only hero, NEVER a disabled primary
          // in the most dominant pixel.
          <Button
            ref={primaryRef}
            variant="secondary"
            data-testid="home-hero-copy-only"
            onClick={() => onCopy(copyText)}
          >
            Copy
          </Button>
        )}
        {hasPrimary && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="home-hero-copy"
            onClick={() => onCopy(copyText)}
          >
            Copy
          </Button>
        )}
      </CardFooter>
      {hasPrimary && (
        <p
          className="px-6 text-xs text-muted-foreground"
          data-testid="home-hero-helper"
        >
          Open a shell in {repo}
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
// The session strip (subordinate, 6.4) -- Phase-0 placeholder line only.
// SessionStrip rows are M9; M8a renders the subordinate region so the layout
// and the muted-foreground dominance level are testable.
// ---------------------------------------------------------------------------

function SessionStrip() {
  return (
    <div
      className="text-xs text-muted-foreground px-2 py-1"
      data-testid="home-strip"
    >
      {HOME_COPY.noActiveSessions}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HomeView root
// ---------------------------------------------------------------------------

export default function HomeView({
  programBoardState,
  loadStatus,
  resolvedPath,
  now,
  onOpenPowerShell,
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

  // Map cards to items once per state change.
  const items: DashboardItem[] = useMemo(() => {
    if (!programBoardState) return [];
    return programBoardState.programs.map(mapCardToItem);
  }, [programBoardState]);

  const hero = useMemo(() => selectHero(items, now), [items, now]);
  const needsYouRows = useMemo(() => {
    const list = defaultNeedsYouList(items);
    // The hero is the first row; the sub-dominant list is the rest.
    if (!hero) return list;
    return list.filter((i) => i.id !== hero.id);
  }, [items, hero]);

  const pausedCount = useMemo(
    () => items.filter((i) => i.paused && i.needsYou).length,
    [items],
  );

  const workingCount = 0; // Live-tab working count is wired in M8b-iii / M9.
  const needCount = (hero ? 1 : 0) + needsYouRows.length;

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

    // 4. Polled, nothing matched.
    if (state.programs.length === 0) {
      return (
        <div className="p-6" data-testid="home-no-programs">
          <p className="text-sm text-muted-foreground">{HOME_COPY.noProgramsTracked}</p>
        </div>
      );
    }

    // 5. Caught up: no card needs you (paused excluded). Default is headline +
    //    count only, nothing to dismiss; the pull-forward is M8b-ii (opt-in).
    if (!hero) {
      return (
        <div className="flex flex-col gap-2 p-6" data-testid="home-caught-up">
          <p className="text-base text-foreground">{HOME_COPY.caughtUp}</p>
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

    // 6. The normal board.
    return (
      <div className="flex flex-col gap-4 p-6 overflow-y-auto" data-testid="home-board">
        {/* needs-you header (6.3 fixed priority: count, closed, degraded) */}
        <div className="flex items-center gap-3 flex-nowrap" data-testid="home-needs-header">
          <span className="text-sm text-foreground" data-testid="home-need-count">
            {needsYouLine(needCount, workingCount)}
          </span>
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
          onCopy={onCopy}
          onOpenExternal={onOpenExternal}
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
      <SessionStrip />
    </div>
  );
}
