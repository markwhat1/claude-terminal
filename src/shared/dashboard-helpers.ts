/**
 * Pure helpers for the dashboard render seam.
 *
 * These are shared (no renderer imports) so they are unit-testable
 * without mounting App or crossing IPC.
 */

import type { Tab } from './types';
import { HOME_TAB_ID } from './types';

/**
 * Determines which view to display given the current active tab id.
 *
 * Returns 'home' when activeTabId matches homeId, or when no real tab
 * is active. Returns the real tab id otherwise.
 *
 * The indirection through homeId (rather than importing HOME_TAB_ID
 * directly) lets callers supply the sentinel they own, keeping the
 * helper testable with any sentinel string.
 */
export function selectActiveView(
  activeTabId: string | null,
  homeId: string,
  tabs: Tab[],
): 'home' | string {
  if (activeTabId === homeId) return 'home';
  if (activeTabId !== null && tabs.some((t) => t.id === activeTabId)) {
    return activeTabId;
  }
  return 'home';
}

/**
 * Computes per-project tab counts from a tabs array.
 *
 * Home is never in the tabs array (it lives in a separate synthetic slot),
 * so this function is inherently Home-free. The explicit type filter is a
 * belt-and-suspenders guard: any tab whose type is 'home' is skipped so
 * a future caller mistake cannot pollute the count.
 */
export function computeTabCounts(
  tabs: Tab[],
): Record<string, { idle: number; working: number; requires_response: number; total: number }> {
  const counts: Record<string, { idle: number; working: number; requires_response: number; total: number }> = {};
  for (const tab of tabs) {
    // Guard: Home tabs must never enter this count.
    if (tab.type === 'home' || tab.id === HOME_TAB_ID) continue;
    if (!counts[tab.projectId]) {
      counts[tab.projectId] = { idle: 0, working: 0, requires_response: 0, total: 0 };
    }
    const c = counts[tab.projectId];
    c.total++;
    if (tab.status === 'idle') c.idle++;
    else if (tab.status === 'working') c.working++;
    else if (tab.status === 'requires_response') c.requires_response++;
  }
  return counts;
}
