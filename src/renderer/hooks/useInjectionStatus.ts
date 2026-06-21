/**
 * useInjectionStatus: the renderer side of the 1.5b success-pending affordance
 * (M10c). Subscribes to claude:injectStatus for ONE spawning tab, tracks the
 * per-tab kind, and runs the single ~4s threshold timer for the pending state.
 *
 * The 30s fail-safe is MAIN-owned (QueryInjector), so this hook does NOT hold a
 * timeout: a renderer reload mid-flight cannot orphan the query, and the failure
 * still arrives over injectStatus from MAIN. The failed-start RETRY is owned by
 * App (handleRetryInjection), which spawns a fresh tab via injectQuery and closes
 * the failed one; this hook is status-only.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InjectStatusKind, InjectStatus } from '@shared/injection';
import type { ClaudeQueryLine } from '@shared/home-copy';

/** The single ~4s threshold for the one copy change (1.5b). */
export const INJECTION_THRESHOLD_MS = 4_000;

export interface InjectionRetryPayload {
  explicitCwd?: string;
  query: ClaudeQueryLine;
  projectId?: string | null;
}

export interface UseInjectionStatusResult {
  /** The current status kind for the tab, or null before any status arrives. */
  kind: InjectStatusKind | null;
  /** Whether the ~4s threshold has elapsed during the pending state. */
  thresholdPassed: boolean;
}

export function useInjectionStatus(
  tabId: string | null,
): UseInjectionStatusResult {
  const [kind, setKind] = useState<InjectStatusKind | null>(null);
  const [thresholdPassed, setThresholdPassed] = useState(false);
  const thresholdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearThreshold = useCallback(() => {
    if (thresholdTimer.current) {
      clearTimeout(thresholdTimer.current);
      thresholdTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!tabId) return;
    const cleanup = window.claudeTerminal.onInjectStatus((status: InjectStatus) => {
      if (status.tabId !== tabId) return;
      setKind(status.kind);
      if (status.kind === 'pending') {
        // Start the single threshold timer; reset on a fresh pending (retry).
        setThresholdPassed(false);
        clearThreshold();
        thresholdTimer.current = setTimeout(
          () => setThresholdPassed(true),
          INJECTION_THRESHOLD_MS,
        );
      } else {
        // success or failure ends the pending window.
        clearThreshold();
      }
    });
    return () => {
      cleanup();
      clearThreshold();
    };
  }, [tabId, clearThreshold]);

  return { kind, thresholdPassed };
}
