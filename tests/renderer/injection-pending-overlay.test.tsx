/**
 * M10c: InjectionPendingOverlay (the 1.5b success-pending affordance).
 *
 * Renders on the spawning tab's data-terminal-area off claude:injectStatus.
 * Sub-dominant (text-muted-foreground), NO working-spinner glyph, the single
 * ~4s threshold copy change, reduced-motion static, and a failed-start surface
 * with one-click retry.
 *
 * Tests:
 *   - while pending and BEFORE the threshold, shows the calm starting line and
 *     NOT the threshold line.
 *   - after the threshold, shows the "...still starting" line.
 *   - applies NO transition class under a reduced-motion mock.
 *   - the failure surface shows the failed-start copy + a retry button that
 *     calls onRetry.
 *   - nothing renders once the status is success (cleared on idle).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { InjectionPendingOverlay } from '@/components/InjectionPendingOverlay';
import {
  INJECTION_STARTING_COPY,
  INJECTION_THRESHOLD_COPY,
} from '@shared/home-copy';
import { INJECT_FAILED_START_COPY } from '@shared/injection';

afterEach(() => cleanup());

describe('InjectionPendingOverlay', () => {
  it('shows the calm starting line before the threshold and not the threshold line', () => {
    render(
      <InjectionPendingOverlay
        kind="pending"
        thresholdPassed={false}
        reducedMotion={false}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(INJECTION_STARTING_COPY)).toBeTruthy();
    expect(screen.queryByText(INJECTION_THRESHOLD_COPY)).toBeNull();
  });

  it('shows the threshold line after the ~4s threshold passes', () => {
    render(
      <InjectionPendingOverlay
        kind="pending"
        thresholdPassed={true}
        reducedMotion={false}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(INJECTION_THRESHOLD_COPY)).toBeTruthy();
  });

  it('applies NO transition class under reduced motion', () => {
    const { container } = render(
      <InjectionPendingOverlay
        kind="pending"
        thresholdPassed={true}
        reducedMotion={true}
        onRetry={vi.fn()}
      />,
    );

    // The motion-safe fade class is opt-in; under reduced motion it is absent.
    const withTransition = container.querySelector('[class*="transition"]');
    expect(withTransition).toBeNull();
    const withAnimate = container.querySelector('[class*="animate"]');
    expect(withAnimate).toBeNull();
  });

  it('does NOT render the Loader2 working spinner (not a "Claude is working" surface)', () => {
    const { container } = render(
      <InjectionPendingOverlay
        kind="pending"
        thresholdPassed={false}
        reducedMotion={false}
        onRetry={vi.fn()}
      />,
    );
    // The strip's working spinner uses the lucide Loader2 with the spin class;
    // the pending overlay must not use it on an empty pane.
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('shows the failed-start copy and a retry button on failure', () => {
    const onRetry = vi.fn();
    render(
      <InjectionPendingOverlay
        kind="failure"
        thresholdPassed={true}
        reducedMotion={false}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText(INJECT_FAILED_START_COPY)).toBeTruthy();
    const retry = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders nothing once the injection succeeds', () => {
    const { container } = render(
      <InjectionPendingOverlay
        kind="success"
        thresholdPassed={false}
        reducedMotion={false}
        onRetry={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
