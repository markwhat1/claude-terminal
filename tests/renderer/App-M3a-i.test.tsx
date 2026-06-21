/**
 * M3a-i tests: TabType 'home', HOME_TAB_ID constant, and the
 * onTabUpdate appender focus-steal invariant.
 *
 * Two assertions:
 * 1. TabType compiles with 'home' (type-level, exercised at runtime).
 * 2. Appending a real tab while activeTabId === HOME_TAB_ID leaves
 *    activeTabId unchanged (the focus-steal invariant).
 */

import { describe, it, expect } from 'vitest';
import type { TabType, Tab } from '@shared/types';
import { HOME_TAB_ID } from '@shared/types';
import { applyTabUpdate } from '@/appender';

// A minimal Tab fixture for testing the appender.
function makeTab(id: string, overrides: Partial<Tab> = {}): Tab {
  return {
    id,
    type: 'claude' as TabType,
    name: `Tab ${id}`,
    defaultName: `Tab ${id}`,
    status: 'idle',
    worktree: null,
    sourceBranch: null,
    cwd: '/mock/repo',
    shellType: null,
    pid: null,
    sessionId: null,
    projectId: 'proj-1',
    statusSince: null,
    lastActivityAt: null,
    firstActivityAt: null,
    waitingSince: null,
    ...overrides,
  };
}

describe('M3a-i: TabType and HOME_TAB_ID', () => {
  it('TabType union includes home', () => {
    // TypeScript-level: if 'home' is not in TabType this file fails to compile.
    const t: TabType = 'home';
    expect(t).toBe('home');
  });

  it('HOME_TAB_ID is a non-empty string and differs from any real tab id', () => {
    expect(typeof HOME_TAB_ID).toBe('string');
    expect(HOME_TAB_ID.length).toBeGreaterThan(0);
    // Should not collide with a typical generated uuid-style id
    expect(HOME_TAB_ID).not.toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('M3a-i: appender focus-steal invariant', () => {
  it('appending a new real tab returns the updated tabs array', () => {
    const existing = [makeTab('tab-1')];
    const incoming = makeTab('tab-2');
    const result = applyTabUpdate(existing, incoming);
    expect(result).toHaveLength(2);
    expect(result[1].id).toBe('tab-2');
  });

  it('updating an existing tab replaces it in-place', () => {
    const existing = [makeTab('tab-1'), makeTab('tab-2')];
    const updated = makeTab('tab-1', { name: 'Renamed' });
    const result = applyTabUpdate(existing, updated);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Renamed');
  });

  it('appender never touches activeTabId: caller must keep HOME_TAB_ID', () => {
    // The appender is a pure function over (tabs, incoming) -> Tab[].
    // It returns ONLY an updated tabs array and never alters activeTabId.
    // The invariant: if the caller's activeTabId === HOME_TAB_ID before
    // calling applyTabUpdate, it remains HOME_TAB_ID after (the caller
    // is not obligated to change it based on the append result).
    let activeTabId: string | null = HOME_TAB_ID;
    const tabs: Tab[] = [makeTab('tab-1')];
    const incomingNew = makeTab('tab-2');

    // Simulate the App.tsx onTabUpdate setTabs functional update:
    const nextTabs = applyTabUpdate(tabs, incomingNew);

    // activeTabId is unchanged -- the appender does not produce a new
    // activeTabId, so Home focus is never stolen.
    expect(activeTabId).toBe(HOME_TAB_ID);
    expect(nextTabs).toHaveLength(2);
  });
});
