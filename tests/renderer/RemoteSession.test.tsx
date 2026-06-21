// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// Avoid pulling xterm into the test; with zero initial tabs no Terminal mounts
// anyway, but mocking keeps the import graph light and deterministic.
vi.mock('@/components/Terminal', () => ({ default: () => null, resetGlobalPtyListener: vi.fn() }));
vi.mock('@/components/terminalCache', () => ({ destroyTerminal: vi.fn(), destroyAllTerminals: vi.fn() }));

import RemoteSession from '../../src/renderer/RemoteSession';

function makeFakeBridge() {
  const api = {
    onTabUpdate: () => () => {},
    onTabRemoved: () => () => {},
    onDisconnect: (_cb: () => void) => () => {},
    onPtyResized: () => () => {},
    onTabSwitched: () => () => {},
    switchTab: vi.fn(),
    renameTab: vi.fn(),
    // Methods the shared TabBar children call on mount:
    getUpdateInfo: () => Promise.resolve(null),
    onUpdateAvailable: () => () => {},
    getRemoteTransport: () => Promise.resolve('tailscale'),
  };
  return {
    api,
    connect: vi.fn().mockResolvedValue({ tabs: [], activeTabId: null, termSizes: {} }),
  } as unknown as import('../../src/web-client/ws-bridge').WebSocketBridge & {
    connect: ReturnType<typeof vi.fn>;
    api: typeof api & { onDisconnect: (cb: () => void) => () => void };
  };
}

describe('RemoteSession', () => {
  it('auto-connects with initialToken/targetUrl and swaps the global to the bridge api', async () => {
    const bridge = makeFakeBridge();
    const { container } = render(
      <RemoteSession
        bridge={bridge}
        targetUrl="https://h.ts.net"
        initialToken="ABC234"
        persistToken={vi.fn()}
        loadSavedToken={() => null}
        embedded
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-web-tabbar]')).toBeTruthy();
    });
    expect(bridge.connect).toHaveBeenCalledWith('ABC234', 'https://h.ts.net');
    expect(window.claudeTerminal).toBe(bridge.api);
  });

  it('shows the disconnected screen when the socket drops', async () => {
    let disconnectCb: (() => void) | null = null;
    const bridge = makeFakeBridge();
    bridge.api.onDisconnect = (cb: () => void) => { disconnectCb = cb; return () => {}; };

    const { container, findByText } = render(
      <RemoteSession
        bridge={bridge}
        targetUrl="https://h.ts.net"
        initialToken="ABC234"
        persistToken={vi.fn()}
        loadSavedToken={() => null}
        embedded
      />,
    );

    await waitFor(() => expect(container.querySelector('[data-web-tabbar]')).toBeTruthy());
    disconnectCb?.();
    expect(await findByText('Disconnected')).toBeTruthy();
  });
});
