/**
 * InjectionOverlayHost: wires the claude:injectStatus feed (via useInjectionStatus)
 * to the InjectionPendingOverlay for the currently active (spawning) tab (M10c).
 *
 * It subscribes for the active tab id, computes the reduced-motion preference at
 * render time (so a test can override window.matchMedia), and renders the calm
 * pending overlay only while a pending/failure status is live for that tab. On
 * success (the injection landed) or when no status exists, it renders nothing,
 * so it never covers a normal terminal.
 *
 * The retry is delegated up to App, which remembers the per-tab injection payload
 * so the failed-start surface re-runs the SAME canned query into the SAME tab.
 */

import { useCallback } from 'react';
import { InjectionPendingOverlay } from './InjectionPendingOverlay';
import { useInjectionStatus } from '@/hooks/useInjectionStatus';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface InjectionOverlayHostProps {
  activeTabId: string | null;
  /** Re-run the canned query into the same tab (failed-start retry). */
  onRetry: (tabId: string) => void;
}

export function InjectionOverlayHost({ activeTabId, onRetry }: InjectionOverlayHostProps) {
  const { kind, thresholdPassed } = useInjectionStatus(activeTabId);

  const handleRetry = useCallback(() => {
    if (activeTabId) onRetry(activeTabId);
  }, [activeTabId, onRetry]);

  // Only paint while the injection is in flight or has failed for this tab.
  if (kind !== 'pending' && kind !== 'failure') return null;

  return (
    <InjectionPendingOverlay
      kind={kind}
      thresholdPassed={thresholdPassed}
      reducedMotion={prefersReducedMotion()}
      onRetry={handleRetry}
    />
  );
}
