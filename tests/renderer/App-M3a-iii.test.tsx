/**
 * M3a-iii tests: KeybindingContext consumer hardening.
 *
 * The hardening lives in the ctx closures that App.tsx builds before
 * dispatching keybinding actions. Four assertion groups:
 *
 * 1. Ctrl+F4 does NOT call closeTab when activeTabId === HOME_TAB_ID.
 *    The guard: ctx.closeTab no-ops when tabId === homeTabId.
 * 2. Ctrl+` calls newDefaultShellTab(undefined) when Home is active.
 *    The guard: ctx.newDefaultShellTab converts homeTabId -> undefined.
 * 3. Ctrl+Tab cycleTab lands on tabs[0] when Home is active (correct
 *    behavior, asserted as-is, not changed).
 * 4. App-mount no-crash with HOME_TAB_ID active and a non-empty tabs array.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor, screen } from '@testing-library/react';
import React from 'react';
import type { Tab } from '@shared/types';
import { HOME_TAB_ID } from '@shared/types';
import { keybindings } from '@/keybindings';
import type { KeybindingContext } from '@/keybindings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTab(id: string, projectId = 'proj-1'): Tab {
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
    projectId,
    statusSince: null,
    lastActivityAt: null,
    firstActivityAt: null,
    waitingSince: null,
  };
}

/** Find the keybinding action for a given mod+key combo. */
function findAction(mod: string | undefined, key: string) {
  const kb = keybindings.find((b) => b.mod === mod && b.key === key);
  if (!kb || !kb.action) throw new Error(`No action for ${mod ?? '(none)'}+${key}`);
  return kb.action;
}

/**
 * Build a ctx where closeTab and newDefaultShellTab carry the same guards
 * that App.tsx applies before dispatching keybinding actions. The spy
 * represents the underlying IPC call (handleCloseTab / handleNewDefaultShellTab).
 *
 * This replicates the App.tsx wrapping so the unit tests exercise the
 * guard logic without mounting the full component.
 */
function makeHardenedCtx(
  activeTabIdValue: string | null,
  tabList: Tab[],
  closeTabSpy: ReturnType<typeof vi.fn>,
  newDefaultShellTabSpy: ReturnType<typeof vi.fn>,
): KeybindingContext {
  const homeTabId = HOME_TAB_ID;

  return {
    activeTabId: () => activeTabIdValue,
    tabs: () => tabList,
    projects: () => [],
    activeProjectId: () => null,
    addProject: vi.fn(),
    newTab: vi.fn(),
    newWorktreeTab: vi.fn(),
    // Guard: convert homeTabId to undefined before forwarding.
    newDefaultShellTab: (afterTabId) =>
      newDefaultShellTabSpy(afterTabId === homeTabId ? undefined : afterTabId),
    // Guard: no-op when the id is the Home sentinel.
    closeTab: (tabId) => {
      if (tabId === homeTabId) return;
      closeTabSpy(tabId);
    },
    selectTab: vi.fn(),
    selectProject: vi.fn(),
    renameTab: vi.fn(),
    openProjectSwitcher: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// 1. Ctrl+F4 does NOT call closeTab when Home is active
// ---------------------------------------------------------------------------

describe('M3a-iii: Ctrl+F4 no-ops when Home is active', () => {
  it('does not call closeTab when activeTabId === HOME_TAB_ID', () => {
    const closeTabSpy = vi.fn();
    const ctx = makeHardenedCtx(HOME_TAB_ID, [], closeTabSpy, vi.fn());
    const action = findAction('ctrl', 'F4');
    action(ctx);
    expect(closeTabSpy).not.toHaveBeenCalled();
  });

  it('calls closeTab for a real tab id', () => {
    const closeTabSpy = vi.fn();
    const ctx = makeHardenedCtx('real-tab-1', [], closeTabSpy, vi.fn());
    const action = findAction('ctrl', 'F4');
    action(ctx);
    expect(closeTabSpy).toHaveBeenCalledWith('real-tab-1');
  });

  it('does not call closeTab when activeTabId is null', () => {
    const closeTabSpy = vi.fn();
    const ctx = makeHardenedCtx(null, [], closeTabSpy, vi.fn());
    const action = findAction('ctrl', 'F4');
    action(ctx);
    expect(closeTabSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Ctrl+` passes undefined when Home is active
// ---------------------------------------------------------------------------

describe('M3a-iii: Ctrl+backtick passes undefined when Home is active', () => {
  it('calls newDefaultShellTab(undefined) when activeTabId === HOME_TAB_ID', () => {
    const newDefaultShellTabSpy = vi.fn();
    const ctx = makeHardenedCtx(HOME_TAB_ID, [], vi.fn(), newDefaultShellTabSpy);
    const action = findAction('ctrl', '`');
    action(ctx);
    expect(newDefaultShellTabSpy).toHaveBeenCalledWith(undefined);
  });

  it('calls newDefaultShellTab(tabId) for a real tab id', () => {
    const newDefaultShellTabSpy = vi.fn();
    const ctx = makeHardenedCtx('real-tab-42', [], vi.fn(), newDefaultShellTabSpy);
    const action = findAction('ctrl', '`');
    action(ctx);
    expect(newDefaultShellTabSpy).toHaveBeenCalledWith('real-tab-42');
  });

  it('calls newDefaultShellTab(undefined) when activeTabId is null', () => {
    const newDefaultShellTabSpy = vi.fn();
    const ctx = makeHardenedCtx(null, [], vi.fn(), newDefaultShellTabSpy);
    const action = findAction('ctrl', '`');
    action(ctx);
    expect(newDefaultShellTabSpy).toHaveBeenCalledWith(undefined);
  });
});

// ---------------------------------------------------------------------------
// 3. Ctrl+Tab cycleTab lands on tabs[0] when Home is active
//
// cycleTab: findIndex returns -1 (HOME_TAB_ID not in tabs[]).
// (-1 + 1 + tabs.length) % tabs.length = (0 + N) % N = 0.
// So selectTab is called with tabs[0].id. This is correct behavior;
// the test pins it rather than changing it.
// ---------------------------------------------------------------------------

describe('M3a-iii: Ctrl+Tab cycleTab lands on tabs[0] when Home is active', () => {
  it('cycles to tabs[0] when activeTabId === HOME_TAB_ID and tabs has items', () => {
    const selectTab = vi.fn();
    const tabList = [makeTab('tab-a'), makeTab('tab-b'), makeTab('tab-c')];
    const ctx: KeybindingContext = {
      activeTabId: () => HOME_TAB_ID,
      tabs: () => tabList,
      projects: () => [],
      activeProjectId: () => null,
      addProject: vi.fn(),
      newTab: vi.fn(),
      newWorktreeTab: vi.fn(),
      newDefaultShellTab: vi.fn(),
      closeTab: vi.fn(),
      selectTab,
      selectProject: vi.fn(),
      renameTab: vi.fn(),
      openProjectSwitcher: vi.fn(),
    };
    const action = findAction('ctrl', 'Tab');
    action(ctx);
    expect(selectTab).toHaveBeenCalledWith('tab-a');
  });

  it('does not cycle when tabs is empty', () => {
    const selectTab = vi.fn();
    const ctx: KeybindingContext = {
      activeTabId: () => HOME_TAB_ID,
      tabs: () => [],
      projects: () => [],
      activeProjectId: () => null,
      addProject: vi.fn(),
      newTab: vi.fn(),
      newWorktreeTab: vi.fn(),
      newDefaultShellTab: vi.fn(),
      closeTab: vi.fn(),
      selectTab,
      selectProject: vi.fn(),
      renameTab: vi.fn(),
      openProjectSwitcher: vi.fn(),
    };
    const action = findAction('ctrl', 'Tab');
    action(ctx);
    expect(selectTab).not.toHaveBeenCalled();
  });

  it('cycles normally from a real tab id (existing behavior unchanged)', () => {
    const selectTab = vi.fn();
    const tabList = [makeTab('tab-a'), makeTab('tab-b'), makeTab('tab-c')];
    const ctx: KeybindingContext = {
      activeTabId: () => 'tab-a',
      tabs: () => tabList,
      projects: () => [],
      activeProjectId: () => null,
      addProject: vi.fn(),
      newTab: vi.fn(),
      newWorktreeTab: vi.fn(),
      newDefaultShellTab: vi.fn(),
      closeTab: vi.fn(),
      selectTab,
      selectProject: vi.fn(),
      renameTab: vi.fn(),
      openProjectSwitcher: vi.fn(),
    };
    const action = findAction('ctrl', 'Tab');
    action(ctx);
    expect(selectTab).toHaveBeenCalledWith('tab-b');
  });
});

// ---------------------------------------------------------------------------
// 4. App-mount no-crash with Home active and non-empty tabs array
//
// The dispatch loop (the keydown handler in App.tsx) must not crash when
// activeTabId === HOME_TAB_ID and the tabs array has real entries. Mounts
// App, waits for 'running', and verifies that the app renders without
// crashing and that the underlying closeTab IPC call is never made with
// HOME_TAB_ID or any unexpected argument during mount.
// ---------------------------------------------------------------------------

// Mock Terminal to avoid xterm.js in jsdom.
vi.mock('@/components/Terminal', () => ({
  default: ({ tabId, isVisible }: { tabId: string; isVisible: boolean }) => {
    if (!isVisible) return null;
    return <div data-testid="terminal" data-tab-id={tabId} />;
  },
}));

vi.mock('@/components/WorktreeNameDialog', () => ({ default: () => null }));
vi.mock('@/components/WorktreeManagerDialog', () => ({ default: () => null }));
vi.mock('@/components/WorktreeCloseDialog', () => ({ default: () => null }));
vi.mock('@/components/HookManagerDialog', () => ({ default: () => null }));
vi.mock('@/components/SettingsDialog', () => ({ default: () => null }));

import App from '@/App';
import { claudeTerminalMock } from '../fixtures/dashboard/claudeTerminalMock';
import type { ClaudeTerminalApi } from '../../src/preload';

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

describe('M3a-iii: App-mount no-crash with Home active and non-empty tabs', () => {
  let originalCT: typeof window.claudeTerminal;

  beforeEach(() => {
    originalCT = (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal;

    const closeTabIpc = vi.fn().mockResolvedValue(undefined);

    const mock: ClaudeTerminalApi = {
      ...claudeTerminalMock,
      getCliStartDir: () => Promise.resolve('/mock/repo'),
      startSession: () => Promise.resolve({ projectId: 'proj-mock' }),
      // Two real tabs; Home is the active id.
      getTabs: () => Promise.resolve([makeMockTab('real-tab-1'), makeMockTab('real-tab-2')]),
      getActiveTabId: () => Promise.resolve(HOME_TAB_ID),
      switchTab: vi.fn().mockResolvedValue(undefined),
      closeTab: closeTabIpc,
    };

    (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal = mock;
  });

  afterEach(() => {
    (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal = originalCT;
  });

  it('mounts without crashing when Home is active and tabs array is non-empty', async () => {
    await act(async () => {
      render(<App />);
    });

    // App reaches 'running' state and renders HomeView.
    await waitFor(
      () => {
        expect(screen.queryAllByTestId('home-view').length).toBe(1);
      },
      { timeout: 3000 },
    );

    // Exactly one HomeView, no Terminals (all tab PTYs are hidden when Home active).
    expect(screen.queryAllByTestId('home-view').length).toBe(1);
    expect(screen.queryAllByTestId('terminal').length).toBe(0);

    // The IPC closeTab must not have been called with HOME_TAB_ID during mount.
    const mock = (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal;
    const calls = (mock.closeTab as ReturnType<typeof vi.fn>).mock.calls;
    const homeTabCalls = calls.filter(([id]) => id === HOME_TAB_ID);
    expect(homeTabCalls.length).toBe(0);
  });
});
