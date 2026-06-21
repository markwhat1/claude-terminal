/**
 * M3b: Tests for nextActiveOnRemove
 *
 * Verifies the three cases:
 *   1. Zero remaining tabs -> Home id
 *   2. No same-project successor (cross-project) -> Home id
 *   3. Same-project successor exists -> that tab's id
 */

import { describe, it, expect } from 'vitest';
import { nextActiveOnRemove } from '@shared/dashboard-helpers';
import type { Tab } from '@shared/types';
import { HOME_TAB_ID } from '@shared/types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTab(id: string, projectId: string): Tab {
  return {
    id,
    type: 'claude',
    name: id,
    defaultName: id,
    status: 'idle',
    worktree: null,
    sourceBranch: null,
    cwd: '/test',
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

// ---------------------------------------------------------------------------
// nextActiveOnRemove tests
// ---------------------------------------------------------------------------

describe('nextActiveOnRemove', () => {
  it('returns Home id when no tabs remain after removal (zero-tabs case)', () => {
    // The closing tab was the only one; remaining is empty.
    const closingTab = makeTab('tab-a', 'proj-1');
    const remaining: Tab[] = [];
    const result = nextActiveOnRemove(closingTab, remaining, HOME_TAB_ID);
    expect(result).toBe(HOME_TAB_ID);
  });

  it('returns Home id when other tabs exist but none share the closing tab project (cross-project case)', () => {
    // Closing tab belongs to proj-1, but only proj-2 tabs remain.
    const closingTab = makeTab('tab-a', 'proj-1');
    const remaining: Tab[] = [
      makeTab('tab-b', 'proj-2'),
      makeTab('tab-c', 'proj-2'),
    ];
    const result = nextActiveOnRemove(closingTab, remaining, HOME_TAB_ID);
    expect(result).toBe(HOME_TAB_ID);
  });

  it('returns the first same-project tab id when a same-project successor exists', () => {
    // Closing tab belongs to proj-1; a proj-1 sibling remains.
    const closingTab = makeTab('tab-a', 'proj-1');
    const remaining: Tab[] = [
      makeTab('tab-b', 'proj-1'),
      makeTab('tab-c', 'proj-2'),
    ];
    const result = nextActiveOnRemove(closingTab, remaining, HOME_TAB_ID);
    expect(result).toBe('tab-b');
  });
});
