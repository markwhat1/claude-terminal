// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const { resetSpy } = vi.hoisted(() => ({ resetSpy: vi.fn() }));
vi.mock('@/components/Terminal', () => ({ resetGlobalPtyListener: resetSpy }));

import { enterRemote, restoreLocal } from '../../src/renderer/remote-swap';

describe('remote-swap', () => {
  it('captures local, swaps to remote, then restores local; each swap re-binds listeners', () => {
    const localApi = { tag: 'local' } as unknown as Window['claudeTerminal'];
    const remoteApi = { tag: 'remote' } as unknown as Window['claudeTerminal'];
    window.claudeTerminal = localApi;

    enterRemote(remoteApi);
    expect(window.claudeTerminal).toBe(remoteApi);
    expect(resetSpy).toHaveBeenCalledTimes(1);

    restoreLocal();
    expect(window.claudeTerminal).toBe(localApi);
    expect(resetSpy).toHaveBeenCalledTimes(2);
  });
});
