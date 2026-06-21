/**
 * Phase-3 wiring: App.tsx feeds the HomeView coaching subsystem.
 *
 * The Phase-3 features (M15 triage, M16 stall interrupt, M17 commitment mirror,
 * M18 parking / morning ritual, Tier-5 @now todos) are built and unit-tested at
 * the HomeView level, but they are only reachable when App.tsx actually passes
 * them down. This test mounts App, captures the props handed to HomeView, and
 * asserts:
 *   1. The three coaching flags reach HomeView from the store getters
 *      (getStallInterrupt / getCommitmentMirror / getMorningRitual).
 *   2. The captured todo list reaches HomeView via the new capture:list channel
 *      (listTodos), so the triage / parking / Tier-5 surfaces have data.
 *   3. An onUpdateTodo handler is wired so triage / park / done mutate the store.
 *
 * HomeView is mocked to a prop-capturing stub; the real component is exercised
 * by the HomeView-M15/M16/M17/M18 suites.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import React from 'react';
import { HOME_TAB_ID } from '@shared/types';
import type { Tab } from '@shared/types';
import type { TodoItem } from '@shared/capture';

// Capture the props HomeView is mounted with.
let capturedHomeProps: Record<string, unknown> | null = null;

vi.mock('@/components/Terminal', () => ({
  default: ({ isVisible, tabId }: { isVisible: boolean; tabId: string }) =>
    isVisible ? <div data-testid="terminal" data-tab-id={tabId} /> : null,
}));
vi.mock('@/components/WorktreeNameDialog', () => ({ default: () => null }));
vi.mock('@/components/WorktreeManagerDialog', () => ({ default: () => null }));
vi.mock('@/components/WorktreeCloseDialog', () => ({ default: () => null }));
vi.mock('@/components/HookManagerDialog', () => ({ default: () => null }));
vi.mock('@/components/SettingsDialog', () => ({ default: () => null }));
vi.mock('@/components/HomeView', () => ({
  default: (props: Record<string, unknown>) => {
    capturedHomeProps = props;
    return <div data-testid="home-view" />;
  },
}));

import App from '@/App';
import { claudeTerminalMock } from '../fixtures/dashboard/claudeTerminalMock';
import type { ClaudeTerminalApi } from '../../src/preload';

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

function makeTodo(id: string, text: string): TodoItem {
  return {
    id,
    text,
    createdAt: 1718900000000,
    horizon: 'now',
    category: null,
    project: null,
    parkedUntil: null,
    doneAt: null,
  };
}

function installMock(overrides: Partial<ClaudeTerminalApi>): () => void {
  const original = (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal;
  const mock: ClaudeTerminalApi = {
    ...claudeTerminalMock,
    getCliStartDir: () => Promise.resolve('/mock/repo'),
    startSession: () => Promise.resolve({ projectId: 'proj-mock' }),
    getTabs: () => Promise.resolve([makeTab('real-tab-1')]),
    getActiveTabId: () => Promise.resolve(HOME_TAB_ID),
    getStartupView: () => Promise.resolve('home'),
    switchTab: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal = mock;
  return () => {
    (window as unknown as { claudeTerminal: ClaudeTerminalApi }).claudeTerminal = original;
  };
}

describe('Phase-3 wiring: App feeds HomeView the coaching subsystem', () => {
  let restore: () => void;

  beforeEach(() => {
    capturedHomeProps = null;
  });
  afterEach(() => restore?.());

  it('passes the three coaching flags from the store getters to HomeView', async () => {
    restore = installMock({
      getStallInterrupt: () => Promise.resolve(true),
      getCommitmentMirror: () => Promise.resolve(true),
      getMorningRitual: () => Promise.resolve(true),
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(capturedHomeProps).not.toBeNull();
      expect(capturedHomeProps!.stallInterrupt).toBe(true);
      expect(capturedHomeProps!.commitmentMirror).toBe(true);
      expect(capturedHomeProps!.morningRitual).toBe(true);
    });
  });

  it('defaults the coaching flags OFF when the store getters return false', async () => {
    restore = installMock({
      getStallInterrupt: () => Promise.resolve(false),
      getCommitmentMirror: () => Promise.resolve(false),
      getMorningRitual: () => Promise.resolve(false),
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(capturedHomeProps).not.toBeNull();
    });
    expect(capturedHomeProps!.stallInterrupt).toBe(false);
    expect(capturedHomeProps!.commitmentMirror).toBe(false);
    expect(capturedHomeProps!.morningRitual).toBe(false);
  });

  it('passes the captured todo list from listTodos to HomeView', async () => {
    const items = [makeTodo('todo-1', 'call the lab'), makeTodo('todo-2', 'review the slip')];
    restore = installMock({
      listTodos: () => Promise.resolve(items),
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(capturedHomeProps).not.toBeNull();
      expect((capturedHomeProps!.todos as TodoItem[]).map((t) => t.id)).toEqual(['todo-1', 'todo-2']);
    });
  });

  it('wires an onUpdateTodo handler that calls the updateTodo channel', async () => {
    const updateTodo = vi.fn().mockResolvedValue({ ok: true });
    restore = installMock({
      listTodos: () => Promise.resolve([makeTodo('todo-1', 'call the lab')]),
      updateTodo,
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(capturedHomeProps).not.toBeNull();
      expect(typeof capturedHomeProps!.onUpdateTodo).toBe('function');
    });

    await act(async () => {
      (capturedHomeProps!.onUpdateTodo as (id: string, patch: unknown) => void)('todo-1', { horizon: 'next' });
    });

    expect(updateTodo).toHaveBeenCalledWith('todo-1', { horizon: 'next' });
  });
});
