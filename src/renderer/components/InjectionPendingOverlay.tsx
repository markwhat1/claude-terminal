/**
 * InjectionPendingOverlay: the 1.5b success-pending affordance (M10c).
 *
 * Renders a calm, sub-dominant overlay centered on the spawning tab's
 * data-terminal-area during the multi-second window between the hero click and
 * the injected query landing. It is driven off the claude:injectStatus broadcast
 * (the kind prop). Purely presentational: all timing (the ~4s threshold) and the
 * status subscription live in the caller, so this component is trivially testable.
 *
 * Design constraints (1.5b):
 *   - sub-dominant: text-muted-foreground, no full-weight color.
 *   - NO working-spinner: never the Loader2 / animate-spin glyph the strip uses,
 *     so an empty pane does not read as "Claude is working".
 *   - the single ~4s threshold copy change, NOT a per-second ticker.
 *   - reduced-motion static: no transition/animation class when reducedMotion.
 *   - a failed-start surface with one-click retry on failure.
 *   - renders nothing on success (the injection landed; clear the overlay).
 */

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  INJECTION_STARTING_COPY,
  INJECTION_THRESHOLD_COPY,
  HOME_COPY,
} from '@shared/home-copy';
import { INJECT_FAILED_START_COPY, type InjectStatusKind } from '@shared/injection';

export interface InjectionPendingOverlayProps {
  /** The current injection status for the spawning tab. */
  kind: InjectStatusKind;
  /** Whether the ~4s threshold has elapsed (caller-owned timer). */
  thresholdPassed: boolean;
  /** Whether the user has opted into reduced motion. */
  reducedMotion: boolean;
  /** One-click retry into the same tab on a failed start. */
  onRetry: () => void;
}

export function InjectionPendingOverlay({
  kind,
  thresholdPassed,
  reducedMotion,
  onRetry,
}: InjectionPendingOverlayProps) {
  // The injection landed; nothing to show. The overlay is cleared on idle.
  if (kind === 'success') return null;

  if (kind === 'failure') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{INJECT_FAILED_START_COPY}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {HOME_COPY.errorRetry}
        </Button>
      </div>
    );
  }

  // Pending. Before the threshold: the calm starting line. After: the single
  // threshold copy change, with a one-step fade-in only when motion is allowed.
  const line = thresholdPassed ? INJECTION_THRESHOLD_COPY : INJECTION_STARTING_COPY;
  const fade = thresholdPassed && !reducedMotion ? 'injection-threshold-fade' : undefined;

  return (
    <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
      <p className={cn('text-sm text-muted-foreground', fade)}>{line}</p>
    </div>
  );
}
