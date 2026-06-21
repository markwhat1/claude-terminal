/**
 * Pure helper for the onTabUpdate IPC listener.
 *
 * Given the current tabs array and an incoming Tab from main, returns a new
 * array with the tab updated in-place (if it already exists) or appended (if
 * it is new). This function is the entire state transform for the appender,
 * isolated here so it is unit-testable without mounting App.
 *
 * Focus-steal invariant: this function returns ONLY the updated Tab array.
 * It never produces a new activeTabId value, so callers that hold Home as
 * the active view are never displaced by an incoming tab update.
 */

import type { Tab } from '../shared/types';

export function applyTabUpdate(prev: Tab[], incoming: Tab): Tab[] {
  const idx = prev.findIndex((t) => t.id === incoming.id);
  if (idx >= 0) {
    const next = [...prev];
    next[idx] = incoming;
    return next;
  }
  return [...prev, incoming];
}
