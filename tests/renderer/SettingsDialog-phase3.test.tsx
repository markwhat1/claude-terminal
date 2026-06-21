/**
 * Phase-3 wiring: the coaching-feature toggles in SettingsDialog.
 *
 * The three Phase-3 coaching flags (stallInterrupt, commitmentMirror,
 * morningRitual) ship DEFAULT-OFF (PLAN-PHASE-2-3 lines 76-78). Until a user can
 * flip them, the whole subsystem is unreachable in the running app. This test
 * verifies the Settings surface:
 *   1. Renders a labeled toggle for each of the three flags.
 *   2. Reflects the passed-in flag values as the checkbox state.
 *   3. Fires the matching change callback with the negated value on toggle.
 *
 * Each toggle is a native checkbox so fireEvent.click works reliably in jsdom.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import SettingsDialog from '@/components/SettingsDialog';

// Minimal shell context — SettingsDialog needs useShellOptions.
vi.mock('@/shell-context', () => ({
  useShellOptions: () => [{ id: 'pwsh', label: 'PowerShell' }],
}));

function baseProps() {
  return {
    open: true,
    onClose: vi.fn(),
    defaultShell: null,
    onDefaultShellChange: vi.fn(),
    startupView: 'home' as const,
    onStartupViewChange: vi.fn(),
    stallInterrupt: false,
    onStallInterruptChange: vi.fn(),
    commitmentMirror: false,
    onCommitmentMirrorChange: vi.fn(),
    morningRitual: false,
    onMorningRitualChange: vi.fn(),
  };
}

describe('Phase-3 wiring: SettingsDialog coaching toggles', () => {
  it('renders a toggle for each of the three coaching flags', () => {
    render(<SettingsDialog {...baseProps()} />);
    expect(screen.getByTestId('stall-interrupt-toggle')).toBeTruthy();
    expect(screen.getByTestId('commitment-mirror-toggle')).toBeTruthy();
    expect(screen.getByTestId('morning-ritual-toggle')).toBeTruthy();
  });

  it('reflects each flag value as the checkbox state', () => {
    render(
      <SettingsDialog
        {...baseProps()}
        stallInterrupt={true}
        commitmentMirror={false}
        morningRitual={true}
      />,
    );
    expect((screen.getByTestId('stall-interrupt-toggle') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('commitment-mirror-toggle') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('morning-ritual-toggle') as HTMLInputElement).checked).toBe(true);
  });

  it('fires onStallInterruptChange with the negated value when toggled', () => {
    const onStallInterruptChange = vi.fn();
    render(<SettingsDialog {...baseProps()} stallInterrupt={false} onStallInterruptChange={onStallInterruptChange} />);
    fireEvent.click(screen.getByTestId('stall-interrupt-toggle'));
    expect(onStallInterruptChange).toHaveBeenCalledWith(true);
  });

  it('fires onCommitmentMirrorChange with the negated value when toggled', () => {
    const onCommitmentMirrorChange = vi.fn();
    render(<SettingsDialog {...baseProps()} commitmentMirror={true} onCommitmentMirrorChange={onCommitmentMirrorChange} />);
    fireEvent.click(screen.getByTestId('commitment-mirror-toggle'));
    expect(onCommitmentMirrorChange).toHaveBeenCalledWith(false);
  });

  it('fires onMorningRitualChange with the negated value when toggled', () => {
    const onMorningRitualChange = vi.fn();
    render(<SettingsDialog {...baseProps()} morningRitual={false} onMorningRitualChange={onMorningRitualChange} />);
    fireEvent.click(screen.getByTestId('morning-ritual-toggle'));
    expect(onMorningRitualChange).toHaveBeenCalledWith(true);
  });

  it('the coaching-toggle copy carries no guilt / streak / time-since language', () => {
    const { container } = render(<SettingsDialog {...baseProps()} />);
    const text = container.textContent ?? '';
    // The Phase-3 voice guard (PLAN-PHASE-2-3 line 71): no streak/chain framing,
    // no guilt, no em dashes in any rendered copy.
    for (const banned of ['streak', 'chain', 'in a row', 'days in', 'still not', 'don’t break', 'guilt']) {
      expect(text.toLowerCase().includes(banned.toLowerCase())).toBe(false);
    }
    expect(text.includes('—')).toBe(false); // em dash
    expect(/[^-]--[^-]/.test(text)).toBe(false); // double-hyphen as a dash
  });
});
