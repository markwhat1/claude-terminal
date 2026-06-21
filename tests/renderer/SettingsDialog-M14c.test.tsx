/**
 * M14c: "When ClaudeTerminal opens" picker in SettingsDialog.
 *
 * The store getter/setter (getStartupView/setStartupView) already ship from
 * Phase 1 (M14a). This test verifies that the picker UI:
 *   1. Renders with the section label and the correct selected value.
 *   2. Calls onStartupViewChange with 'home' when the user selects Home.
 *   3. Calls onStartupViewChange with 'lastSession' when the user selects Last session.
 *   4. Full round-trip: starting at 'lastSession', selecting 'home' fires the callback;
 *      the parent re-renders with 'home' and the picker reflects that value.
 *
 * The picker uses a native <select> so that fireEvent.change works reliably in jsdom.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import SettingsDialog from '@/components/SettingsDialog';

// Minimal shell context — SettingsDialog needs useShellOptions.
vi.mock('@/shell-context', () => ({
  useShellOptions: () => [{ id: 'pwsh', label: 'PowerShell' }],
}));

describe('M14c: SettingsDialog startup-view picker', () => {
  it('renders the startup-view section label', () => {
    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        defaultShell={null}
        onDefaultShellChange={vi.fn()}
        startupView="lastSession"
        onStartupViewChange={vi.fn()}
      />,
    );
    expect(screen.getByText('When ClaudeTerminal opens')).toBeTruthy();
  });

  it('shows Last session as the selected option when startupView is lastSession', () => {
    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        defaultShell={null}
        onDefaultShellChange={vi.fn()}
        startupView="lastSession"
        onStartupViewChange={vi.fn()}
      />,
    );
    const select = screen.getByTestId('startup-view-select') as HTMLSelectElement;
    expect(select.value).toBe('lastSession');
  });

  it('shows Home as the selected option when startupView is home', () => {
    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        defaultShell={null}
        onDefaultShellChange={vi.fn()}
        startupView="home"
        onStartupViewChange={vi.fn()}
      />,
    );
    const select = screen.getByTestId('startup-view-select') as HTMLSelectElement;
    expect(select.value).toBe('home');
  });

  it('calls onStartupViewChange with home when the user selects Home', () => {
    const onStartupViewChange = vi.fn();
    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        defaultShell={null}
        onDefaultShellChange={vi.fn()}
        startupView="lastSession"
        onStartupViewChange={onStartupViewChange}
      />,
    );
    const select = screen.getByTestId('startup-view-select');
    fireEvent.change(select, { target: { value: 'home' } });
    expect(onStartupViewChange).toHaveBeenCalledWith('home');
  });

  it('calls onStartupViewChange with lastSession when the user selects Last session', () => {
    const onStartupViewChange = vi.fn();
    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        defaultShell={null}
        onDefaultShellChange={vi.fn()}
        startupView="home"
        onStartupViewChange={onStartupViewChange}
      />,
    );
    const select = screen.getByTestId('startup-view-select');
    fireEvent.change(select, { target: { value: 'lastSession' } });
    expect(onStartupViewChange).toHaveBeenCalledWith('lastSession');
  });

  it('round-trip: getter value reflected in picker; change fires setter; re-render shows new value', () => {
    // Simulates the full round-trip through the store getter/setter pair:
    // - Component renders with the getter value ('lastSession').
    // - User changes the picker; onStartupViewChange is called (the setter side).
    // - Parent re-renders with the new value; picker reflects 'home'.
    let currentView: 'lastSession' | 'home' = 'lastSession';
    const onStartupViewChange = vi.fn((v: 'lastSession' | 'home') => {
      currentView = v;
    });

    const { rerender } = render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        defaultShell={null}
        onDefaultShellChange={vi.fn()}
        startupView={currentView}
        onStartupViewChange={onStartupViewChange}
      />,
    );

    const select = screen.getByTestId('startup-view-select') as HTMLSelectElement;
    expect(select.value).toBe('lastSession');

    fireEvent.change(select, { target: { value: 'home' } });
    expect(onStartupViewChange).toHaveBeenCalledWith('home');
    expect(currentView).toBe('home');

    // Simulate parent re-render after the setter updated state.
    rerender(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        defaultShell={null}
        onDefaultShellChange={vi.fn()}
        startupView={currentView}
        onStartupViewChange={onStartupViewChange}
      />,
    );

    const updated = screen.getByTestId('startup-view-select') as HTMLSelectElement;
    expect(updated.value).toBe('home');
  });
});
