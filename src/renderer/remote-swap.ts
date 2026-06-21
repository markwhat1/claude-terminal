import { resetGlobalPtyListener } from '@/components/Terminal';

// The shared UI reads window.claudeTerminal everywhere. Remote mode swaps that
// global for the WebSocket bridge api; this module owns the swap so it is always
// paired with a PTY-listener re-bind, and so the original local api can be
// restored on disconnect (otherwise local sessions would drive the dead bridge).

let localApi: Window['claudeTerminal'];
let captured = false;

/** Swap window.claudeTerminal to a remote bridge api, capturing the local api
 *  on first use and re-binding the global PTY listener. */
export function enterRemote(api: Window['claudeTerminal']): void {
  if (!captured) {
    localApi = window.claudeTerminal;
    captured = true;
  }
  // Assign before re-binding so any Terminal mounting between these two
  // synchronous statements registers against the already-swapped api.
  window.claudeTerminal = api;
  resetGlobalPtyListener();
}

/** Restore the original local Electron api and re-bind the PTY listener. No-op
 *  if enterRemote was never called. */
export function restoreLocal(): void {
  if (!captured) return;
  window.claudeTerminal = localApi;
  resetGlobalPtyListener();
}
