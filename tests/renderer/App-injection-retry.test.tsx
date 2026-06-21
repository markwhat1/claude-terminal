/**
 * M10c: App-level failed-start retry (the fresh-tab + cleanup glue).
 *
 * QueryInjector owns NO same-tab retry: a failed start cannot recover on the same
 * tab (the session-start hook never fired, so the idle gate never runs again, or
 * the PTY is gone). So App's handleRetryInjection spawns a FRESH tab via
 * injectQuery, CLOSES the prior failed tab so it does not orphan, and activates
 * the replacement.
 *
 * This drives the real glue end to end: click the hero (injectQuery #1 + remember
 * the payload), surface a failure over claude:injectStatus, click the failed-start
 * retry, and assert injectQuery #2 reuses the same canned payload, the failed tab
 * is closed, and the new tab is switched to.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Mock heavy components (mirrors App-M14b): the Terminal becomes a marker so the
// active-view switch is observable without xterm/WebGL.
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
import { parseState } from '@shared/program-board-state';
import type { InjectStatus } from '@shared/injection';

const FIX_DIR = path.resolve(__dirname, '../fixtures/dashboard');

function broadcastFixture(name: string) {
  const boardState = parseState(readFileSync(path.join(FIX_DIR, name), 'utf-8'));
  if (!boardState) throw new Error(`fixture ${name} failed to parse`);
  return { boardState, closedRecent: 0, recentCloses: [] };
}

function installMock(overrides: Partial<ClaudeTerminalApi>): () => void {
  const original = (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal;
  const mock: ClaudeTerminalApi = { ...claudeTerminalMock, ...overrides };
  (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal = mock;
  return () => {
    (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal = original;
  };
}

describe('M10c: App failed-start retry spawns a fresh tab and closes the failed one', () => {
  let restore: () => void;
  afterEach(() => restore?.());

  it('retry reuses the canned payload, closes the failed tab, and activates the replacement', async () => {
    let statusCb: ((s: InjectStatus) => void) | null = null;

    // Two distinct tab ids so the close target and the new active tab are
    // unambiguous: the hero spawns inj-tab-1, the retry spawns inj-tab-2.
    const injectQuery = vi
      .fn()
      .mockResolvedValueOnce('inj-tab-1')
      .mockResolvedValueOnce('inj-tab-2');
    const closeTab = vi.fn(async () => undefined);
    const switchTab = vi.fn(async () => undefined);

    restore = installMock({
      // Reach the running + Home surface (same recipe as App-M14b fresh-start).
      getCliStartDir: () => Promise.resolve('/mock/repo'),
      startSession: () => Promise.resolve({ projectId: 'proj-mock' }),
      getTabs: () => Promise.resolve([]),
      getActiveTabId: () => Promise.resolve(null),
      getStartupView: () => Promise.resolve('home'),
      // A time-sensitive blocked program -> a draftFirstVersion Claude hero.
      getProgramBoardState: () => Promise.resolve(broadcastFixture('time-sensitive.json')),
      injectQuery: injectQuery as unknown as ClaudeTerminalApi['injectQuery'],
      closeTab: closeTab as unknown as ClaudeTerminalApi['closeTab'],
      switchTab: switchTab as unknown as ClaudeTerminalApi['switchTab'],
      onInjectStatus: (cb: (s: InjectStatus) => void) => {
        statusCb = cb;
        return () => { statusCb = null; };
      },
    });

    await act(async () => {
      render(<App />);
    });

    // The hero's primary is the Claude-injection action.
    const primary = await screen.findByTestId('home-hero-primary');

    // 1) Click the hero: injectQuery #1, and the payload is remembered.
    await act(async () => {
      fireEvent.click(primary);
    });
    await waitFor(() => expect(injectQuery).toHaveBeenCalledTimes(1));

    // 2) The spawn fails (the MAIN 30s timeout / dead-PTY surfaces a failure for
    // the now-active spawning tab).
    await act(async () => {
      statusCb?.({ tabId: 'inj-tab-1', kind: 'failure', reason: 'timeout' });
    });

    // The failed-start overlay shows its one-click retry for the failed tab.
    const retry = await screen.findByRole('button', { name: /retry/i });

    // 3) Click retry: a fresh spawn + cleanup of the failed tab.
    await act(async () => {
      fireEvent.click(retry);
    });
    await waitFor(() => expect(injectQuery).toHaveBeenCalledTimes(2));

    // The same canned payload is re-run (not a new/empty intent).
    const first = injectQuery.mock.calls[0][0];
    const second = injectQuery.mock.calls[1][0];
    expect(second).toEqual(first);
    expect((second as { query: string }).query.length).toBeGreaterThan(0);

    // The prior failed tab is closed (no orphan) and the replacement is activated.
    expect(closeTab).toHaveBeenCalledWith('inj-tab-1');
    expect(closeTab).toHaveBeenCalledTimes(1);
    expect(switchTab).toHaveBeenLastCalledWith('inj-tab-2');
  });

  it('a failure status alone is inert (retry is user-initiated, not automatic)', async () => {
    // Guard against a future auto-retry-on-failure regression: surfacing a
    // failure must not, by itself, spawn a replacement tab or close anything.
    // Recovery only happens when the user clicks the failed-start retry.
    let statusCb: ((s: InjectStatus) => void) | null = null;
    const injectQuery = vi.fn().mockResolvedValue('inj-tab-x');
    const closeTab = vi.fn(async () => undefined);

    restore = installMock({
      getCliStartDir: () => Promise.resolve('/mock/repo'),
      startSession: () => Promise.resolve({ projectId: 'proj-mock' }),
      getTabs: () => Promise.resolve([]),
      getActiveTabId: () => Promise.resolve(null),
      getStartupView: () => Promise.resolve('home'),
      getProgramBoardState: () => Promise.resolve(broadcastFixture('time-sensitive.json')),
      injectQuery: injectQuery as unknown as ClaudeTerminalApi['injectQuery'],
      closeTab: closeTab as unknown as ClaudeTerminalApi['closeTab'],
      onInjectStatus: (cb: (s: InjectStatus) => void) => {
        statusCb = cb;
        return () => { statusCb = null; };
      },
    });

    await act(async () => {
      render(<App />);
    });
    await screen.findByTestId('home-hero-primary');

    // A failure arrives for a tab the app never injected.
    await act(async () => {
      statusCb?.({ tabId: 'never-injected', kind: 'failure', reason: 'timeout' });
    });

    // The failure event by itself spawns and closes nothing.
    expect(injectQuery).not.toHaveBeenCalled();
    expect(closeTab).not.toHaveBeenCalled();
  });
});
