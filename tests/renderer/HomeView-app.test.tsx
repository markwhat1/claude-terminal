/**
 * M8a App-level + voice + props-guard assertions for the Home dashboard.
 *
 * Separated from HomeView.test.tsx (which renders the pure component) because
 * these mount App or read source files:
 *   - the Home entry pill (not in activeProjectTabs, activates Home)
 *   - the StatusBar status-count suppression while Home is active
 *   - the first-open state timeline with fake timers
 *   - the HomeView props-only grep guard (zero window.claudeTerminal refs)
 *   - the copy-voice audit over the single copy module
 *   - the mapper PHI boundary (detail/blocked_on/dod.gaps never reach copy.text)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Tab } from '@shared/types';
import { HOME_TAB_ID } from '@shared/types';

// ---------------------------------------------------------------------------
// Mock heavy components (xterm, dialogs) before App import.
// ---------------------------------------------------------------------------

vi.mock('@/components/Terminal', () => ({
  default: ({ isVisible, tabId }: { isVisible: boolean; tabId: string }) =>
    isVisible ? <div data-testid="terminal" data-tab-id={tabId} /> : null,
}));
vi.mock('@/components/WorktreeNameDialog', () => ({ default: () => null }));
vi.mock('@/components/WorktreeManagerDialog', () => ({ default: () => null }));
vi.mock('@/components/WorktreeCloseDialog', () => ({ default: () => null }));
vi.mock('@/components/HookManagerDialog', () => ({ default: () => null }));
vi.mock('@/components/SettingsDialog', () => ({ default: () => null }));

import App from '@/App';
import HomeView from '@/components/HomeView';
import { claudeTerminalMock } from '../fixtures/dashboard/claudeTerminalMock';
import type { ClaudeTerminalApi } from '../../src/preload';
import { parseState } from '@shared/program-board-state';
import type { ProgramBoardState as ProgramBoardStateT } from '@shared/program-board-state';

const FIX_DIR = path.resolve(__dirname, '../fixtures/dashboard');
function loadRaw(name: string): string {
  return readFileSync(path.join(FIX_DIR, name), 'utf-8');
}

function makeMockTab(id: string): Tab {
  return {
    id,
    type: 'claude',
    name: `Tab ${id}`,
    defaultName: `Tab ${id}`,
    status: 'idle',
    worktree: null,
    sourceBranch: null,
    cwd: '/mock/repo',
    shellType: null,
    pid: null,
    sessionId: null,
    projectId: 'proj-mock',
    statusSince: null,
    lastActivityAt: null,
    firstActivityAt: null,
    waitingSince: null,
  };
}

function installMock(overrides: Partial<ClaudeTerminalApi>): () => void {
  const original = (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal;
  const mock: ClaudeTerminalApi = {
    ...claudeTerminalMock,
    getCliStartDir: () => Promise.resolve('/mock/repo'),
    startSession: () => Promise.resolve({ projectId: 'proj-mock' }),
    getTabs: () => Promise.resolve([makeMockTab('real-tab-1'), makeMockTab('real-tab-2')]),
    getActiveTabId: () => Promise.resolve(HOME_TAB_ID),
    switchTab: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal = mock;
  return () => {
    (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal = original;
  };
}

// ---------------------------------------------------------------------------
// 1. Home entry pill
// ---------------------------------------------------------------------------

describe('M8a: Home entry pill (App-level)', () => {
  let restore: () => void;
  afterEach(() => restore?.());

  it('renders the pill, it is not a tab, and activating it lands on Home', async () => {
    restore = installMock({
      // Start on a real tab so we can click the pill to go Home.
      getActiveTabId: () => Promise.resolve('real-tab-1'),
      getProgramBoardState: () => Promise.resolve({ boardState: parseState(loadRaw('time-sensitive.json')), closedRecent: 0, recentCloses: [] }),
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('home-entry-pill')).toBeTruthy();
    });

    // The pill is not rendered as a Tab (Tab components carry a different
    // structure); there is exactly one pill.
    expect(screen.getAllByTestId('home-entry-pill').length).toBe(1);

    // Click it: Home becomes active (HomeView mounts).
    await act(async () => {
      fireEvent.click(screen.getByTestId('home-entry-pill'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('home-view')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. StatusBar suppresses status counts while Home is active
// ---------------------------------------------------------------------------

describe('M8a: StatusBar suppression on Home', () => {
  let restore: () => void;
  afterEach(() => restore?.());

  it('status counts are not rendered while Home is active', async () => {
    restore = installMock({
      getActiveTabId: () => Promise.resolve(HOME_TAB_ID),
      // Give the tabs non-trivial statuses so counts would render off Home.
      getTabs: () => Promise.resolve([
        { ...makeMockTab('t1'), status: 'working' },
        { ...makeMockTab('t2'), status: 'idle' },
      ]),
      getProgramBoardState: () => Promise.resolve({ boardState: parseState(loadRaw('time-sensitive.json')), closedRecent: 0, recentCloses: [] }),
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('home-view')).toBeTruthy();
    });

    // No status-count chips while Home is active.
    expect(screen.queryAllByTestId('statusbar-count').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. First-open state timeline with fake timers
// ---------------------------------------------------------------------------

describe('M8a: first-open timeline (fake timers)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // A controller that mirrors App's program-board lifecycle: it starts in
  // 'loading' with no state, resolves a pending read on a timer, then commits a
  // state. HomeView is the strobe-prevention surface, so the timeline property
  // (skeleton holds; not-running only after resolve; no second skeleton) is
  // asserted against HomeView driven through these prop transitions.
  function TimelineHarness({ resolveAfterMs }: { resolveAfterMs: number }) {
    const [state, setState] = React.useState<ProgramBoardStateT | null>(null);
    const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');
    const [secondState, setSecondState] = React.useState<ProgramBoardStateT | null>(null);

    React.useEffect(() => {
      // First read resolves to a not-running (generated_at null) state.
      const t1 = setTimeout(() => {
        setState(parseState(loadRaw('generated-at-null.json')) as ProgramBoardStateT);
        setStatus('ready');
      }, resolveAfterMs);
      // A later successful poll lands real cards.
      const t2 = setTimeout(() => {
        setSecondState(parseState(loadRaw('time-sensitive.json')) as ProgramBoardStateT);
      }, resolveAfterMs * 2);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }, [resolveAfterMs]);

    return (
      <HomeView
        programBoardState={secondState ?? state}
        loadStatus={status}
        resolvedPath="C:\\state.json"
        now={new Date(2026, 5, 21, 1, 1, 0)}
        closedRecent={0}
        recentCloses={[]}
        onOpenPowerShell={() => {}}
        onCopy={() => {}}
        onOpenExternal={() => {}}
        onRetry={() => {}}
      />
    );
  }

  it('skeleton holds across a pending read; not-running only after resolve; no second skeleton', () => {
    vi.useFakeTimers();
    render(<TimelineHarness resolveAfterMs={1000} />);

    // Before the read resolves, the skeleton holds and no empty state shows.
    expect(screen.getByTestId('home-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('home-not-running')).toBeNull();

    // Advance past the first read: not-running commits, skeleton gone.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('home-not-running')).toBeTruthy();
    expect(screen.queryByTestId('home-skeleton')).toBeNull();

    // A later successful poll replaces it in place with NO second skeleton.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('home-hero')).toBeTruthy();
    expect(screen.queryByTestId('home-skeleton')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. HomeView props-only grep guard
// ---------------------------------------------------------------------------

describe('M8a: HomeView is props-only (no window.claudeTerminal)', () => {
  it('HomeView.tsx source contains zero window.claudeTerminal references', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../../src/renderer/components/HomeView.tsx'),
      'utf-8',
    );
    expect(src).not.toContain('window.claudeTerminal');
    expect(src).not.toContain('claudeTerminal');
  });
});

// ---------------------------------------------------------------------------
// 5. Copy voice audit (6.6) over the single copy module
// ---------------------------------------------------------------------------

import {
  ACTION_LABELS,
  HOME_COPY,
  closedRecentLine,
  needsYouLine,
  overflowLabel,
  pausedLabel,
  degradedLine,
  ageBandLabel,
  heroHeadline,
  composeClaudeQuery,
  goalGradientText,
  type KnownActionId,
} from '@shared/home-copy';
import type { DashboardItem } from '@shared/program-board-state';

describe('M8a: copy voice (6.6)', () => {
  // Build the full set of RENDERED strings the copy module emits, exercising
  // every template across a range of inputs. The audit runs on these runtime
  // strings, not source text, so code comments are never falsely flagged.

  function fakeItem(p: Partial<DashboardItem>): DashboardItem {
    return {
      id: 'pb:x', slug: 'x', source: 'program-board', kind: 'blocker',
      title: 'X', detail: '', project: 'repo', badges: [], ageColor: 'green',
      recencyIso: null, gitAgeDays: 0, url: null, needsYou: true,
      needsYouReasons: [], paused: false, timeSensitive: null,
      dodMet: 0, dodTotal: 0, dodAlmost: false, dodGap: null,
      requiresResponse: false, idleNeedsYou: false, justResolved: false,
      decidedAndWorked: false,
      horizon: null, avoidanceCategory: null, actions: {}, ...p,
    };
  }

  const allActions: KnownActionId[] = [
    'draftFirstVersion', 'openToDecide', 'reviewTodos', 'summarizeChanges', 'openPowerShell',
  ];

  const rendered: string[] = [
    ...Object.values(ACTION_LABELS),
    ...Object.values(HOME_COPY),
    closedRecentLine(3),
    needsYouLine(4, 2),
    overflowLabel(3),
    overflowLabel(20),
    pausedLabel(1),
    degradedLine(11),
    ageBandLabel('green'), ageBandLabel('yellow'), ageBandLabel('orange'), ageBandLabel('red'),
    // Headlines for each action + a few DoD shapes.
    ...allActions.map((a) => heroHeadline(fakeItem({ badges: a === 'openToDecide' ? ['needs-your-decision'] : [] }), a)),
    heroHeadline(fakeItem({ dodMet: 1, dodTotal: 2, dodGap: 'last gap' }), 'reviewTodos'),
    heroHeadline(fakeItem({ dodMet: 0, dodTotal: 1, dodGap: 'the only step', dodAlmost: true }), 'reviewTodos'),
    goalGradientText(fakeItem({ dodMet: 0, dodTotal: 1, dodGap: 'the only step' })),
    goalGradientText(fakeItem({ dodMet: 0, dodTotal: 3, dodGap: 'first thing' })),
    goalGradientText(fakeItem({ dodMet: 2, dodTotal: 3, dodGap: 'last thing' })),
    // Composed queries (canned).
    ...allActions.map((a) => composeClaudeQuery({ action: a, programSlug: 'slug', programName: 'Program Name', kind: 'blocker' }) as string),
  ];

  const blob = rendered.join('\n');
  const lower = blob.toLowerCase();

  it('contains no em dashes (long dash or double hyphen)', () => {
    expect(blob).not.toContain('—');
    expect(blob).not.toMatch(/\w--\w/);
  });

  it('contains no AI-slop words', () => {
    const slop = ['delve', 'leverage', 'robust', 'seamless', 'comprehensive', 'utilize', 'tapestry'];
    for (const w of slop) {
      expect(lower).not.toContain(w);
    }
  });

  it('each canned button label is present', () => {
    expect(blob).toContain('Draft the first version');
    expect(blob).toContain('Open the repo to decide');
    expect(blob).toContain('Look at the open TODOs');
    expect(blob).toContain('See what changed');
    expect(blob).toContain('Open a shell to start');
  });

  it('contains no streak / chain language', () => {
    expect(lower).not.toContain('streak');
    expect(lower).not.toContain('in a row');
    expect(lower).not.toContain('consecutive');
  });

  it('the closed-count copy reads "last 24h", never "closed today"', () => {
    expect(blob).toContain('last 24h');
    expect(lower).not.toContain('closed today');
  });

  it('no "0 of N" goal-at-zero fraction appears in any template', () => {
    expect(blob).not.toMatch(/0 of \d/);
  });

  it('no near-finish language tied to a zero state', () => {
    expect(lower).not.toContain('almost done');
    expect(lower).not.toContain('near finish');
  });
});

// ---------------------------------------------------------------------------
// 6. Mapper PHI boundary: detail/blocked_on/dod.gaps never reach copy.text
// ---------------------------------------------------------------------------

import { mapCardToItem } from '@shared/program-board-state';
import { composeCopy } from '@shared/home-copy';

describe('M8a: copy.text PHI boundary (3.3)', () => {
  it('composeCopy never includes detail/blocked_on/dod.gaps', () => {
    const state = parseState(loadRaw('fresh-with-needs-you.json'));
    if (!state) throw new Error('fixture failed to parse');
    const item = mapCardToItem(state.programs[0]);
    const copy = composeCopy(item);
    // blocked_on / detail
    expect(copy).not.toContain(item.detail);
    expect(copy).not.toContain('temp password');
    // dod.gaps
    for (const gap of state.programs[0].dod.gaps) {
      expect(copy).not.toContain(gap);
    }
    // needs_you_reasons
    for (const reason of item.needsYouReasons) {
      expect(copy).not.toContain(reason);
    }
    // Positive: it does contain the program name (usefulness).
    expect(copy).toContain(item.title);
  });
});
