import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron Notification
vi.mock('electron', () => ({
  Notification: Object.assign(
    vi.fn(function () {
      return {
        on: vi.fn(),
        show: vi.fn(),
      };
    }),
    { isSupported: vi.fn(() => true) },
  ),
}));

// Mock logger (depends on Electron)
vi.mock('@main/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { Notification } from 'electron';
import { createHookRouter } from '@main/hook-router';
import type { TabManager } from '@main/tab-manager';
import type { IpcMessage } from '@shared/types';

function makeMockDeps() {
  const tabManager = {
    getTab: vi.fn(),
    getActiveTabId: vi.fn(() => 'active-tab'),
    updateStatus: vi.fn(),
    rename: vi.fn(),
    resetName: vi.fn(),
    setSessionId: vi.fn(),
    setActiveTab: vi.fn(),
  } as unknown as TabManager;

  return {
    tabManager,
    sendToRenderer: vi.fn(),
    persistSessions: vi.fn(),
    generateTabName: vi.fn(),
    generateResumeTabName: vi.fn(async () => {}),
    cleanupNamingFlag: vi.fn(),
    getMainWindow: vi.fn(() => ({ show: vi.fn(), focus: vi.fn() })),
    hookEngine: null,
    getProjectName: vi.fn(() => undefined),
  };
}

describe('hook-router', () => {
  let deps: ReturnType<typeof makeMockDeps>;
  let handleHookMessage: (msg: IpcMessage) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeMockDeps();
    ({ handleHookMessage } = createHookRouter(deps));
  });

  it('ignores messages for unknown tabs', () => {
    (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    handleHookMessage({ tabId: 'no-such-tab', event: 'tab:status:working', data: null });

    expect(deps.tabManager.updateStatus).not.toHaveBeenCalled();
    expect(deps.sendToRenderer).not.toHaveBeenCalled();
  });

  describe('tab:ready', () => {
    it('sets status to idle and stores sessionId', () => {
      const tab = { id: 'tab-1', name: 'Tab 1' };
      (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);

      const data = JSON.stringify({ sessionId: 'sess-abc', source: 'startup' });
      handleHookMessage({ tabId: 'tab-1', event: 'tab:ready', data });

      expect(deps.tabManager.setSessionId).toHaveBeenCalledWith('tab-1', 'sess-abc');
      expect(deps.tabManager.updateStatus).toHaveBeenCalledWith('tab-1', 'idle');
      expect(deps.persistSessions).toHaveBeenCalled();
      expect(deps.sendToRenderer).toHaveBeenCalledWith('tab:updated', tab);
    });

    it('resets name on /clear', () => {
      const tab = { id: 'tab-1', name: 'Old Name' };
      (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);

      const data = JSON.stringify({ sessionId: 'sess-new', source: 'clear' });
      handleHookMessage({ tabId: 'tab-1', event: 'tab:ready', data });

      expect(deps.tabManager.resetName).toHaveBeenCalledWith('tab-1');
      expect(deps.cleanupNamingFlag).toHaveBeenCalledWith('tab-1');
    });

    it('handles legacy data (plain sessionId string)', () => {
      const tab = { id: 'tab-1', name: 'Tab 1' };
      (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);

      handleHookMessage({ tabId: 'tab-1', event: 'tab:ready', data: 'sess-legacy' });

      expect(deps.tabManager.setSessionId).toHaveBeenCalledWith('tab-1', 'sess-legacy');
    });
  });

  describe('status events', () => {
    it('tab:status:working sets working status', () => {
      const tab = { id: 'tab-1', name: 'Tab 1' };
      (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);

      handleHookMessage({ tabId: 'tab-1', event: 'tab:status:working', data: null });

      expect(deps.tabManager.updateStatus).toHaveBeenCalledWith('tab-1', 'working');
      expect(deps.sendToRenderer).toHaveBeenCalledWith('tab:updated', tab);
    });

    it('tab:status:idle sets idle status', () => {
      const tab = { id: 'tab-1', name: 'Tab 1' };
      (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      (deps.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('tab-1');

      handleHookMessage({ tabId: 'tab-1', event: 'tab:status:idle', data: null });

      expect(deps.tabManager.updateStatus).toHaveBeenCalledWith('tab-1', 'idle');
    });

    it('tab:status:input sets requires_response status', () => {
      const tab = { id: 'tab-1', name: 'Tab 1' };
      (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      (deps.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('tab-1');

      handleHookMessage({ tabId: 'tab-1', event: 'tab:status:input', data: null });

      expect(deps.tabManager.updateStatus).toHaveBeenCalledWith('tab-1', 'requires_response');
    });
  });

  it('tab:closed is a no-op (waits for onExit)', () => {
    const tab = { id: 'tab-1', name: 'Tab 1' };
    (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);

    handleHookMessage({ tabId: 'tab-1', event: 'tab:closed', data: null });

    expect(deps.sendToRenderer).not.toHaveBeenCalled();
  });

  it('tab:name renames and persists', () => {
    const tab = { id: 'tab-1', name: 'New Name' };
    (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);

    handleHookMessage({ tabId: 'tab-1', event: 'tab:name', data: 'New Name' });

    expect(deps.tabManager.rename).toHaveBeenCalledWith('tab-1', 'New Name');
    expect(deps.persistSessions).toHaveBeenCalled();
    expect(deps.sendToRenderer).toHaveBeenCalledWith('tab:updated', tab);
  });

  it('tab:generate-name delegates to generateTabName', () => {
    const tab = { id: 'tab-1', name: 'Tab 1' };
    (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);

    handleHookMessage({ tabId: 'tab-1', event: 'tab:generate-name', data: 'Fix the auth' });

    expect(deps.generateTabName).toHaveBeenCalledWith('tab-1', 'Fix the auth');
    // Should NOT broadcast tab:updated (async call will do it later)
    expect(deps.sendToRenderer).not.toHaveBeenCalled();
  });

  it('unknown events are ignored', () => {
    const tab = { id: 'tab-1', name: 'Tab 1' };
    (deps.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);

    handleHookMessage({ tabId: 'tab-1', event: 'unknown:event', data: null });

    expect(deps.sendToRenderer).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // M10c: the injection idle gate + post-turn toast suppression
  // -------------------------------------------------------------------------

  describe('M10c injection idle gate', () => {
    function makeInjectionDeps() {
      const base = makeMockDeps();
      const onIdle = vi.fn();
      const consumeNotifySuppression = vi.fn(() => false);
      return {
        ...base,
        // The hook-router calls these injected callbacks. onIdle is the gate
        // (PLAN 3.1 step 4); consumeNotifySuppression is the post-turn toast
        // suppression check (PLAN 3.1 step 4b).
        onInjectionIdle: onIdle,
        consumeInjectionNotifySuppression: consumeNotifySuppression,
      };
    }

    it('calls onInjectionIdle when a REAL tab:ready first-idle arrives (the :104 case)', () => {
      const d = makeInjectionDeps();
      // The real TabManager.updateStatus mutates the tab; the mock returns the
      // post-update tab, so getTab reports status 'idle' at the convergence point.
      const tab = { id: 'tab-1', name: 'Tab 1', status: 'idle' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      const { handleHookMessage: handle } = createHookRouter(d);

      // tab:ready with a session id reaches updateStatus(tabId,'idle') at :104.
      const data = JSON.stringify({ sessionId: 'sess-abc', source: 'startup' });
      handle({ tabId: 'tab-1', event: 'tab:ready', data });

      // The gate fired at the convergence point with the first idle.
      expect(d.onInjectionIdle).toHaveBeenCalledWith('tab-1');
    });

    it('calls onInjectionIdle on the later tab:status:idle (the :126 convergence point)', () => {
      const d = makeInjectionDeps();
      const tab = { id: 'tab-1', name: 'Tab 1', status: 'idle' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      (d.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('tab-1');
      const { handleHookMessage: handle } = createHookRouter(d);

      handle({ tabId: 'tab-1', event: 'tab:status:idle', data: null });

      expect(d.onInjectionIdle).toHaveBeenCalledWith('tab-1');
    });

    it('does NOT call onInjectionIdle on a working transition (only on idle)', () => {
      const d = makeInjectionDeps();
      const tab = { id: 'tab-1', name: 'Tab 1' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      const { handleHookMessage: handle } = createHookRouter(d);

      handle({ tabId: 'tab-1', event: 'tab:status:working', data: null });

      expect(d.onInjectionIdle).not.toHaveBeenCalled();
    });

    it('does NOT call onInjectionIdle when tab:ready carries no sessionId (status -> new, not idle)', () => {
      const d = makeInjectionDeps();
      const tab = { id: 'tab-1', name: 'Tab 1' };
      // updateStatus is a no-op spy, so getTab after the switch still returns the
      // same tab. The gate must only fire when the resulting status is 'idle'.
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue({ ...tab, status: 'new' });
      const { handleHookMessage: handle } = createHookRouter(d);

      const data = JSON.stringify({ sessionId: '', source: 'startup' });
      handle({ tabId: 'tab-1', event: 'tab:ready', data });

      expect(d.onInjectionIdle).not.toHaveBeenCalled();
    });

    it('suppresses the post-turn toast for an injected, non-active tab when the flag is set', () => {
      const d = makeInjectionDeps();
      d.consumeInjectionNotifySuppression = vi.fn(() => true); // flag is set
      const tab = { id: 'tab-1', name: 'Tab 1', projectId: '' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      // The injected tab is NOT renderer-active in this case (the divergence
      // PLAN 3.1 step 4b describes), so the normal path would fire a toast.
      (d.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('some-other-tab');
      const { handleHookMessage: handle } = createHookRouter(d);

      handle({ tabId: 'tab-1', event: 'tab:status:idle', data: null });

      // No Notification was constructed (the toast is suppressed).
      expect(Notification).not.toHaveBeenCalled();
      expect(d.consumeInjectionNotifySuppression).toHaveBeenCalledWith('tab-1');
    });

    it('still fires the post-turn toast for a non-injected non-active tab (suppression flag absent)', () => {
      const d = makeInjectionDeps();
      d.consumeInjectionNotifySuppression = vi.fn(() => false); // not an injected tab
      const tab = { id: 'tab-1', name: 'Tab 1', projectId: '' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      (d.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('some-other-tab');
      const { handleHookMessage: handle } = createHookRouter(d);

      handle({ tabId: 'tab-1', event: 'tab:status:idle', data: null });

      expect(Notification).toHaveBeenCalled();
    });

    it('still preserves the requires_response toast even for an injected tab (the chime is not demoted)', () => {
      const d = makeInjectionDeps();
      d.consumeInjectionNotifySuppression = vi.fn(() => true);
      const tab = { id: 'tab-1', name: 'Tab 1', projectId: '' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      (d.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('some-other-tab');
      const { handleHookMessage: handle } = createHookRouter(d);

      handle({ tabId: 'tab-1', event: 'tab:status:input', data: null });

      // The needs-you chime is preserved: a Notification IS constructed and the
      // injection suppression flag is NOT consumed by the input event.
      expect(Notification).toHaveBeenCalled();
    });

    it('works without injection callbacks wired (backward compatible)', () => {
      const d = makeMockDeps(); // no onInjectionIdle / consume callbacks
      const tab = { id: 'tab-1', name: 'Tab 1' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      const { handleHookMessage: handle } = createHookRouter(d);

      // Must not throw when the optional injection deps are absent.
      expect(() =>
        handle({ tabId: 'tab-1', event: 'tab:status:idle', data: null }),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // M14d: notifyOnIdle demotion (notifyOnIdle:false default)
  // -------------------------------------------------------------------------

  describe('M14d shouldNotify predicate', () => {
    function makeNotifyDeps(notifyOnIdle: boolean, firstRunShown = true) {
      const base = makeMockDeps();
      return {
        ...base,
        getNotifyOnIdle: vi.fn(() => notifyOnIdle),
        showFirstRunNote: vi.fn(),
        isFirstRunNoteShown: vi.fn(() => firstRunShown),
      };
    }

    it('at the DEFAULT (notifyOnIdle:false) an idle event does NOT fire the toast', () => {
      // The behavioral assertion: a bare store-value check cannot pass this because
      // we wire getNotifyOnIdle to return false and assert Notification is not called.
      const d = makeNotifyDeps(false);
      const tab = { id: 'tab-1', name: 'Tab 1', projectId: '' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      (d.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('other-tab');
      const { handleHookMessage: handle } = createHookRouter(d);

      handle({ tabId: 'tab-1', event: 'tab:status:idle', data: null });

      expect(Notification).not.toHaveBeenCalled();
    });

    it('at the DEFAULT (notifyOnIdle:false) a requires_response event STILL fires the toast', () => {
      // The chime for "needs your input" is preserved regardless of notifyOnIdle.
      const d = makeNotifyDeps(false);
      const tab = { id: 'tab-1', name: 'Tab 1', projectId: '' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      (d.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('other-tab');
      const { handleHookMessage: handle } = createHookRouter(d);

      handle({ tabId: 'tab-1', event: 'tab:status:input', data: null });

      expect(Notification).toHaveBeenCalled();
    });

    it('with notifyOnIdle:true an idle event fires the toast (opt-back-in path is intact)', () => {
      const d = makeNotifyDeps(true);
      const tab = { id: 'tab-1', name: 'Tab 1', projectId: '' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      (d.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('other-tab');
      const { handleHookMessage: handle } = createHookRouter(d);

      handle({ tabId: 'tab-1', event: 'tab:status:idle', data: null });

      expect(Notification).toHaveBeenCalled();
    });

    it('with notifyOnIdle:true a requires_response event fires the toast', () => {
      const d = makeNotifyDeps(true);
      const tab = { id: 'tab-1', name: 'Tab 1', projectId: '' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      (d.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('other-tab');
      const { handleHookMessage: handle } = createHookRouter(d);

      handle({ tabId: 'tab-1', event: 'tab:status:input', data: null });

      expect(Notification).toHaveBeenCalled();
    });

    it('the first-run note fires on the first idle when notifyOnIdle:false and not yet shown', () => {
      // firstRunShown:false means the note has not been displayed yet.
      const d = makeNotifyDeps(false, false);
      const tab = { id: 'tab-1', name: 'Tab 1', projectId: '' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      (d.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('other-tab');
      const { handleHookMessage: handle } = createHookRouter(d);

      handle({ tabId: 'tab-1', event: 'tab:status:idle', data: null });

      expect(d.showFirstRunNote).toHaveBeenCalledTimes(1);
    });

    it('the first-run note does NOT fire again once shown', () => {
      // firstRunShown:true means it was already displayed; do not call showFirstRunNote again.
      const d = makeNotifyDeps(false, true);
      const tab = { id: 'tab-1', name: 'Tab 1', projectId: '' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      (d.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('other-tab');
      const { handleHookMessage: handle } = createHookRouter(d);

      handle({ tabId: 'tab-1', event: 'tab:status:idle', data: null });
      handle({ tabId: 'tab-1', event: 'tab:status:idle', data: null });

      expect(d.showFirstRunNote).not.toHaveBeenCalled();
    });

    it('the first-run note does NOT fire when notifyOnIdle:true (only relevant when idle toasts are off)', () => {
      const d = makeNotifyDeps(true, false);
      const tab = { id: 'tab-1', name: 'Tab 1', projectId: '' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      (d.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('other-tab');
      const { handleHookMessage: handle } = createHookRouter(d);

      handle({ tabId: 'tab-1', event: 'tab:status:idle', data: null });

      expect(d.showFirstRunNote).not.toHaveBeenCalled();
    });

    it('works without notifyOnIdle callbacks (backward compatible: defaults to old notify-all behavior)', () => {
      // When getNotifyOnIdle is absent the router falls back to notifying on idle (old behavior).
      const d = makeMockDeps();
      const tab = { id: 'tab-1', name: 'Tab 1', projectId: '' };
      (d.tabManager.getTab as ReturnType<typeof vi.fn>).mockReturnValue(tab);
      (d.tabManager.getActiveTabId as ReturnType<typeof vi.fn>).mockReturnValue('other-tab');
      const { handleHookMessage: handle } = createHookRouter(d);

      expect(() => handle({ tabId: 'tab-1', event: 'tab:status:idle', data: null })).not.toThrow();
      // Old behavior: toast fires (no opt-out dep wired).
      expect(Notification).toHaveBeenCalled();
    });
  });
});
