/**
 * SessionStrip: subordinate live-session strip (PLAN M9, 6.4).
 *
 * Compact read-and-jump-only rows from real tabs. No close, rename, or drag.
 * Grouped by attention with quiet text-xs text-muted-foreground group
 * mini-headers that are LABELS not counts ("Working", not "N working").
 * Idle rows fold into "... N more" at threshold 5, default-collapsed.
 *
 * Two distinct time computations (1.2 / 6.4):
 *   - working rows:  count-UP elapsed since statusSince (minute-coarsened).
 *   - idle/waiting rows: human-waiting duration since waitingSince.
 *
 * Sparse update: a row's time cell only re-renders when its coarsened-minute
 * value changes, so a poll tick never flips every row at once.
 *
 * Project hue: each row sets --project-hue inline (low-saturation border only,
 * never a fill). Mirroring App.tsx:191 and StatusBar / Tab border patterns.
 *
 * justResolved: a one-shot motion-safe fade class when the row transitions to
 * the resolved state. Under prefers-reduced-motion, the class is NOT applied
 * (no transition, count still ticks).
 *
 * IDLE_AGE_FLOOR_MS (60s): sub-floor idle tabs stay in the strip but are NOT
 * counted in the needs-you header (5.2 / M8b-iii). The strip is subordinate.
 */

import { memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import TabIndicator from './TabIndicator';
import { formatRelative } from '@shared/dashboard-ui-helpers';
import type { Tab } from '@shared/types';
import { PROJECT_COLORS } from '@shared/types';
import { IDLE_AGE_FLOOR_MS } from './HomeView';
import { HOME_COPY } from '@shared/home-copy';
import type { ProjectConfig } from '@shared/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of idle rows visible before the tail fold triggers. */
const IDLE_FOLD_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SessionStripProps {
  /** All live session tabs (cross-project). */
  tabs: Tab[];
  /** Wall-clock epoch ms (injectable for deterministic tests). */
  now: number;
  /** The Home-aware tab-select handler from App. */
  handleSelectTab: (tabId: string) => void;
  /** Set of tab ids that just resolved (one-shot fade, 1.5 / M9). */
  justResolvedTabIds: Set<string>;
  /** The project registry so per-row hues can be resolved (6.4). */
  projects: ProjectConfig[];
}

// ---------------------------------------------------------------------------
// prefers-reduced-motion helper
// ---------------------------------------------------------------------------

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/** Groups the five real tab statuses into three attention buckets. */
type AttentionGroup = 'needs-you' | 'working' | 'idle';

function attentionGroupOf(tab: Tab, now: number): AttentionGroup {
  if (
    (tab.status === 'idle' || tab.status === 'requires_response') &&
    tab.firstActivityAt !== null &&
    tab.waitingSince !== null &&
    now - tab.waitingSince >= IDLE_AGE_FLOOR_MS
  ) {
    return 'needs-you';
  }
  if (tab.status === 'working') return 'working';
  return 'idle';
}

// ---------------------------------------------------------------------------
// Hue resolver
// ---------------------------------------------------------------------------

function projectHue(tab: Tab, projects: ProjectConfig[]): number {
  const proj = projects.find((p) => p.id === tab.projectId);
  if (!proj) return PROJECT_COLORS[0].hue;
  return PROJECT_COLORS[proj.colorIndex % PROJECT_COLORS.length].hue;
}

// ---------------------------------------------------------------------------
// Coarsened-minute computation (sparse update key)
// ---------------------------------------------------------------------------

/**
 * Coarsens an epoch-ms anchor to the minute it represents (integer minutes
 * since epoch). Used as a cache key so a row only re-renders when its minute
 * actually changes (the sparse-update rule, 6.4).
 */
function coarsenedMinute(anchor: number | null, now: number): number | null {
  if (anchor === null) return null;
  const elapsed = now - anchor;
  if (elapsed < 0) return null;
  return Math.floor(elapsed / 60_000);
}

// ---------------------------------------------------------------------------
// Time cell: memo-gated on coarsened minute
// ---------------------------------------------------------------------------

interface TimeCellProps {
  tabId: string;
  status: Tab['status'];
  statusSince: number | null;
  waitingSince: number | null;
  now: number;
}

/**
 * The time string for one strip row.
 *
 * Working rows: count-UP elapsed since statusSince ("2m", "12m").
 * All other rows (including waiting idle): waiting-duration from waitingSince.
 *
 * Memo-gated by the COARSENED MINUTE of the relevant anchor so this cell
 * only re-renders when the displayed minute actually changes, not on every
 * poll tick (the sparse-update rule, 6.4).
 */
const TimeCell = memo(
  function TimeCell({ tabId, status, statusSince, waitingSince, now }: TimeCellProps) {
    let timeStr: string;
    if (status === 'working') {
      timeStr = formatRelative(statusSince, now, 'working');
    } else {
      timeStr = formatRelative(waitingSince, now, 'waiting');
    }

    return (
      <span
        className="ml-auto text-xs text-muted-foreground shrink-0"
        data-testid={`strip-row-time-${tabId}`}
      >
        {timeStr}
      </span>
    );
  },
  (prev, next) => {
    // Only re-render when the coarsened minute of the relevant anchor changed.
    if (prev.status !== next.status) return false;
    if (prev.tabId !== next.tabId) return false;
    const anchor = prev.status === 'working' ? prev.statusSince : prev.waitingSince;
    const nextAnchor = next.status === 'working' ? next.statusSince : next.waitingSince;
    if (anchor !== nextAnchor) return false;
    const prevMinute = coarsenedMinute(anchor, prev.now);
    const nextMinute = coarsenedMinute(nextAnchor, next.now);
    return prevMinute === nextMinute;
  },
);

// ---------------------------------------------------------------------------
// Single strip row
// ---------------------------------------------------------------------------

interface StripRowProps {
  tab: Tab;
  now: number;
  hue: number;
  justResolved: boolean;
  onSelectTab: (id: string) => void;
}

function StripRow({ tab, now, hue, justResolved, onSelectTab }: StripRowProps) {
  const handleClick = useCallback(() => {
    onSelectTab(tab.id);
  }, [onSelectTab, tab.id]);

  const reducedMotion = prefersReducedMotion();

  // One-shot fade on justResolved. Motion-safe: no class under reduced-motion.
  const fadeClass =
    justResolved && !reducedMotion ? 'strip-just-resolved' : undefined;

  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-2 w-full text-left px-2 py-1',
        'text-xs text-muted-foreground',
        'border-l-2',
        // The low-saturation project-hue left border. The CSS var is set inline
        // so each row carries its own hue, mirroring the Tab.tsx pattern.
        'border-[hsl(var(--project-hue)_30%_35%)]',
        'hover:text-foreground',
        fadeClass,
      )}
      style={{ '--project-hue': String(hue) } as React.CSSProperties}
      data-testid="strip-row"
      data-tab-id={tab.id}
      data-project-hue={hue}
      data-just-resolved={justResolved ? 'true' : undefined}
      onClick={handleClick}
    >
      {/* Status icon (reuses TabIndicator exactly, 6.4). */}
      <span
        className="shrink-0"
        data-testid={`strip-icon-${tab.status}`}
      >
        <TabIndicator status={tab.status} />
      </span>

      {/* Tab name. */}
      <span className="truncate min-w-0 flex-1">{tab.name}</span>

      {/* Time cell: sparse update via memo. */}
      <TimeCell
        tabId={tab.id}
        status={tab.status}
        statusSince={tab.statusSince}
        waitingSince={tab.waitingSince}
        now={now}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Group section
// ---------------------------------------------------------------------------

interface GroupSectionProps {
  label: string;
  groupKey: AttentionGroup;
  rows: React.ReactNode[];
}

function GroupSection({ label, groupKey, rows }: GroupSectionProps) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div
        className="text-xs text-muted-foreground px-2 pt-2 pb-0.5"
        data-testid={`strip-group-header-${groupKey}`}
      >
        {label}
      </div>
      {rows}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionStrip
// ---------------------------------------------------------------------------

export default function SessionStrip({
  tabs,
  now,
  handleSelectTab,
  justResolvedTabIds,
  projects,
}: SessionStripProps) {
  if (tabs.length === 0) {
    return (
      <div
        className="text-xs text-muted-foreground px-2 py-1"
        data-testid="home-strip"
      >
        <span data-testid="strip-empty">{HOME_COPY.noActiveSessions}</span>
      </div>
    );
  }

  // Assign attention group and project hue per tab.
  const annotated = tabs.map((tab) => ({
    tab,
    group: attentionGroupOf(tab, now),
    hue: projectHue(tab, projects),
    justResolved: justResolvedTabIds.has(tab.id),
  }));

  // Partition into groups.
  const needsYouTabs = annotated.filter((a) => a.group === 'needs-you');
  const workingTabs = annotated.filter((a) => a.group === 'working');
  const idleTabs = annotated.filter((a) => a.group === 'idle');

  // Build needs-you rows.
  const needsYouRows = needsYouTabs.map((a) => (
    <StripRow
      key={a.tab.id}
      tab={a.tab}
      now={now}
      hue={a.hue}
      justResolved={a.justResolved}
      onSelectTab={handleSelectTab}
    />
  ));

  // Build working rows.
  const workingRows = workingTabs.map((a) => (
    <StripRow
      key={a.tab.id}
      tab={a.tab}
      now={now}
      hue={a.hue}
      justResolved={a.justResolved}
      onSelectTab={handleSelectTab}
    />
  ));

  // Build idle rows with tail fold at threshold.
  const visibleIdle = idleTabs.slice(0, IDLE_FOLD_THRESHOLD);
  const tailIdle = idleTabs.slice(IDLE_FOLD_THRESHOLD);

  const idleRows = visibleIdle.map((a) => (
    <StripRow
      key={a.tab.id}
      tab={a.tab}
      now={now}
      hue={a.hue}
      justResolved={a.justResolved}
      onSelectTab={handleSelectTab}
    />
  ));

  return (
    <div data-testid="home-strip" className="flex flex-col text-muted-foreground">
      <GroupSection label="Needs you" groupKey="needs-you" rows={needsYouRows} />
      <GroupSection label="Working" groupKey="working" rows={workingRows} />

      {idleTabs.length > 0 && (
        <div>
          <div
            className="text-xs text-muted-foreground px-2 pt-2 pb-0.5"
            data-testid="strip-group-header-idle"
          >
            Idle
          </div>
          {idleRows}
          {tailIdle.length > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground px-2 py-1 text-left w-fit"
              data-testid="strip-fold-control"
            >
              ... {tailIdle.length} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
