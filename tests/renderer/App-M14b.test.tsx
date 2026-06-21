/**
 * M14b: resolveStartupActiveId helper + App.tsx wiring.
 *
 * Covers:
 * 1. Unit tests for the pure resolveStartupActiveId helper.
 * 2. App-level: startupView:'home' selects the Home id at the renderer-reload
 *    path (which returns early, never reaching the fresh-start path).
 * 3. App-level: startupView:'home' selects the Home id at the fresh-start path.
 * 4. App-level: startupView:'home' selects the Home id via the onTabSwitched
 *    listener.
 * 5. R-10 Option A: startupView:'home' + a last-session dir present -> the
 *    dir is resolved for context (workspaceDir set, startSession called) AND
 *    Home is the landed surface (no modal) AND the saved terminal tabs are NOT
 *    auto-restored (getSavedTabs not called / createTab not called for saved tabs).
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';
import { HOME_TAB_ID } from '@shared/types';
import { resolveStartupActiveId } from '@shared/startup-view';

// ---------------------------------------------------------------------------
// Mock heavy components
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
import { claudeTerminalMock } from '../fixtures/dashboard/claudeTerminalMock';
import type { ClaudeTerminalApi } from '../../src/preload';
import type { Tab } from '@shared/types';

function makeTab(id: string): Tab {
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
  const mock: ClaudeTerminalApi = { ...claudeTerminalMock, ...overrides };
  (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal = mock;
  return () => {
    (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal = original;
  };
}

// ---------------------------------------------------------------------------
// 1. Unit tests for resolveStartupActiveId
// ---------------------------------------------------------------------------

describe('M14b: resolveStartupActiveId helper', () => {
  it('returns homeId when startupView is home, regardless of activeId', () => {
    expect(resolveStartupActiveId('home', HOME_TAB_ID, 'tab-abc')).toBe(HOME_TAB_ID);
  });

  it('returns homeId when startupView is home and activeId is null', () => {
    expect(resolveStartupActiveId('home', HOME_TAB_ID, null)).toBe(HOME_TAB_ID);
  });

  it('returns activeId when startupView is lastSession', () => {
    expect(resolveStartupActiveId('lastSession', HOME_TAB_ID, 'tab-xyz')).toBe('tab-xyz');
  });

  it('returns null when startupView is lastSession and activeId is null', () => {
    expect(resolveStartupActiveId('lastSession', HOME_TAB_ID, null)).toBeNull();
  });

  it('returns homeId when startupView is lastSession and activeId is already homeId', () => {
    expect(resolveStartupActiveId('lastSession', HOME_TAB_ID, HOME_TAB_ID)).toBe(HOME_TAB_ID);
  });
});

// ---------------------------------------------------------------------------
// 2. Renderer-reload path: startupView:'home' lands on Home (returns early)
// ---------------------------------------------------------------------------

describe('M14b: renderer-reload path with startupView:home', () => {
  let restore: () => void;
  afterEach(() => restore?.());

  it('lands on Home when existingTabs is non-empty and startupView is home', async () => {
    // The renderer-reload path fires when getTabs() returns non-empty tabs.
    // With startupView:'home', activeId should be resolved to HOME_TAB_ID.
    restore = installMock({
      getCliStartDir: () => Promise.resolve('/mock/repo'),
      startSession: () => Promise.resolve({ projectId: 'proj-mock' }),
      getTabs: () => Promise.resolve([makeTab('existing-tab-1'), makeTab('existing-tab-2')]),
      getActiveTabId: () => Promise.resolve('existing-tab-1'),
      getStartupView: () => Promise.resolve('home'),
      getSavedTabs: vi.fn().mockResolvedValue([]),
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('home-view')).toBeTruthy();
    });

    // Home is active, not the existing tabs.
    expect(screen.queryByTestId('terminal')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Fresh-start path: startupView:'home' lands on Home
// ---------------------------------------------------------------------------

describe('M14b: fresh-start path with startupView:home', () => {
  let restore: () => void;
  afterEach(() => restore?.());

  it('lands on Home when no existingTabs and startupView is home', async () => {
    // The fresh-start path fires when getTabs() returns [].
    // With startupView:'home', the resolved activeId is HOME_TAB_ID and
    // getSavedTabs is NOT called (R-10 Option A: skip tab restoration).
    const getSavedTabsMock = vi.fn().mockResolvedValue([]);

    restore = installMock({
      getCliStartDir: () => Promise.resolve('/mock/repo'),
      startSession: () => Promise.resolve({ projectId: 'proj-mock' }),
      getTabs: () => Promise.resolve([]),
      getActiveTabId: () => Promise.resolve(null),
      getStartupView: () => Promise.resolve('home'),
      getSavedTabs: getSavedTabsMock,
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('home-view')).toBeTruthy();
    });

    // Saved tabs are NOT restored when startupView is home (R-10 Option A).
    expect(getSavedTabsMock).not.toHaveBeenCalled();
  });

  it('lastSession path still restores saved tabs when startupView is lastSession', async () => {
    const getSavedTabsMock = vi.fn().mockResolvedValue([
      { worktree: null, sessionId: 'sid-1', name: 'Tab 1' },
    ]);
    const createTabMock = vi.fn().mockResolvedValue(makeTab('restored-tab'));

    restore = installMock({
      getCliStartDir: () => Promise.resolve('/mock/repo'),
      startSession: () => Promise.resolve({ projectId: 'proj-mock' }),
      getTabs: vi.fn()
        .mockResolvedValueOnce([]) // first call: no existing tabs
        .mockResolvedValueOnce([makeTab('restored-tab')]), // second call: after restoration
      getActiveTabId: () => Promise.resolve('restored-tab'),
      getStartupView: () => Promise.resolve('lastSession'),
      getSavedTabs: getSavedTabsMock,
      createTab: createTabMock,
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(getSavedTabsMock).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// 4. onTabSwitched listener: startupView:'home' maps incoming tabId to Home
// ---------------------------------------------------------------------------

describe('M14b: onTabSwitched with startupView:home', () => {
  let restore: () => void;
  let tabSwitchedCb: ((tabId: string) => void) | null = null;
  afterEach(() => restore?.());

  it('maps any tabId from onTabSwitched to HOME when startupView is home', async () => {
    restore = installMock({
      getCliStartDir: () => Promise.resolve('/mock/repo'),
      startSession: () => Promise.resolve({ projectId: 'proj-mock' }),
      getTabs: () => Promise.resolve([makeTab('tab-a')]),
      getActiveTabId: () => Promise.resolve('tab-a'),
      getStartupView: () => Promise.resolve('home'),
      onTabSwitched: (cb: (tabId: string) => void) => {
        tabSwitchedCb = cb;
        return () => { tabSwitchedCb = null; };
      },
    });

    await act(async () => {
      render(<App />);
    });

    // Home is the initial surface.
    await waitFor(() => {
      expect(screen.getByTestId('home-view')).toBeTruthy();
    });

    // Simulate a tab:switched event from main.
    await act(async () => {
      tabSwitchedCb?.('tab-a');
    });

    // Home stays active; the tab:switched id is mapped to HOME.
    expect(screen.getByTestId('home-view')).toBeTruthy();
    expect(screen.queryByTestId('terminal')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. R-10 Option A: startupView:'home' + last-session dir resolves dir for
//    context, lands on Home, does NOT auto-restore terminal tabs.
// ---------------------------------------------------------------------------

describe('M14b R-10 Option A: home + last-session dir', () => {
  let restore: () => void;
  afterEach(() => restore?.());

  it('calls startSession (dir resolved for context) but skips getSavedTabs and createTab for saved tabs', async () => {
    const startSessionMock = vi.fn().mockResolvedValue({ projectId: 'proj-mock' });
    const getSavedTabsMock = vi.fn().mockResolvedValue([
      { worktree: null, sessionId: 'sid-1', name: 'Tab 1' },
    ]);
    const createTabMock = vi.fn().mockResolvedValue(makeTab('new-tab'));

    restore = installMock({
      getCliStartDir: () => Promise.resolve('/mock/repo'),
      startSession: startSessionMock,
      getTabs: () => Promise.resolve([]),
      getActiveTabId: () => Promise.resolve(null),
      getStartupView: () => Promise.resolve('home'),
      getSavedTabs: getSavedTabsMock,
      createTab: createTabMock,
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('home-view')).toBeTruthy();
    });

    // The dir IS resolved (startSession called for project context).
    expect(startSessionMock).toHaveBeenCalledWith('/mock/repo', expect.any(String));

    // The saved tabs are NOT fetched or restored.
    expect(getSavedTabsMock).not.toHaveBeenCalled();

    // createTab is NOT called for restoring saved tabs.
    // (It may be called for an initial empty-tabs case in lastSession mode,
    // but for home mode we skip the whole restoration block.)
    expect(createTabMock).not.toHaveBeenCalled();

    // Home is the landed surface, no modal precedes it.
    expect(screen.queryByTestId('startup-dialog')).toBeNull();
    expect(screen.getByTestId('home-view')).toBeTruthy();
  });

  it('Home is the landed surface; no StartupDialog is shown', async () => {
    restore = installMock({
      getCliStartDir: () => Promise.resolve('/mock/repo'),
      startSession: () => Promise.resolve({ projectId: 'proj-mock' }),
      getTabs: () => Promise.resolve([]),
      getActiveTabId: () => Promise.resolve(null),
      getStartupView: () => Promise.resolve('home'),
      getSavedTabs: vi.fn().mockResolvedValue([]),
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('home-view')).toBeTruthy();
    });

    // No startup dialog modal precedes it.
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
