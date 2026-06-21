import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TabManager } from '@main/tab-manager';

describe('TabManager', () => {
  let manager: TabManager;

  beforeEach(() => {
    manager = new TabManager();
  });

  it('creates a tab with correct defaults', () => {
    const tab = manager.createTab('D:\\dev\\MyApp', null);
    expect(tab.status).toBe('new');
    expect(tab.cwd).toBe('D:\\dev\\MyApp');
    expect(tab.worktree).toBeNull();
    expect(tab.name).toBe('New Tab');
  });

  it('uses New Tab as default name for claude tabs', () => {
    manager.createTab('D:\\dev\\MyApp', null);
    const tab2 = manager.createTab('D:\\dev\\MyApp', null);
    expect(tab2.name).toBe('New Tab');
  });

  it('uses worktree name as tab name when provided', () => {
    const tab = manager.createTab('D:\\dev\\MyApp', 'feature/auth');
    expect(tab.name).toBe('feature/auth');
  });

  it('returns all tabs', () => {
    manager.createTab('D:\\dev\\A', null);
    manager.createTab('D:\\dev\\B', null);
    expect(manager.getAllTabs()).toHaveLength(2);
  });

  it('gets tab by id', () => {
    const tab = manager.createTab('D:\\dev\\MyApp', null);
    expect(manager.getTab(tab.id)).toBe(tab);
  });

  it('updates tab status', () => {
    const tab = manager.createTab('D:\\dev\\MyApp', null);
    manager.updateStatus(tab.id, 'working');
    expect(manager.getTab(tab.id)!.status).toBe('working');
  });

  it('renames a tab', () => {
    const tab = manager.createTab('D:\\dev\\MyApp', null);
    manager.rename(tab.id, 'auth refactor');
    expect(manager.getTab(tab.id)!.name).toBe('auth refactor');
  });

  it('removes a tab', () => {
    const tab = manager.createTab('D:\\dev\\MyApp', null);
    manager.removeTab(tab.id);
    expect(manager.getTab(tab.id)).toBeUndefined();
  });

  it('creates a shell tab with correct defaults', () => {
    const isWindows = process.platform === 'win32';
    const isDarwin = process.platform === 'darwin';
    const shellType = isWindows ? 'powershell' : isDarwin ? 'zsh' : 'bash';
    const expectedName = isWindows ? 'PowerShell' : isDarwin ? 'Zsh' : 'Bash';

    const tab = manager.createTab('D:\\dev\\MyApp', null, 'shell', undefined, '', null, shellType);
    expect(tab.type).toBe('shell');
    expect(tab.shellType).toBe(shellType);
    expect(tab.status).toBe('shell');
    expect(tab.name).toBe(expectedName);
  });

  it('shell tabs use shell-specific names', () => {
    const isWindows = process.platform === 'win32';
    const isDarwin = process.platform === 'darwin';
    const shellType = isWindows ? 'powershell' : isDarwin ? 'zsh' : 'bash';
    const expectedName = isWindows ? 'PowerShell' : isDarwin ? 'Zsh' : 'Bash';

    const shell = manager.createTab('D:\\dev\\A', null, 'shell', undefined, '', null, shellType);
    expect(shell.name).toBe(expectedName);
    const claude = manager.createTab('D:\\dev\\B', null);
    expect(claude.name).toBe('New Tab');
  });

  it('inserts tab after the specified tab', () => {
    const tab1 = manager.createTab('D:\\dev\\A', null);
    const tab2 = manager.createTab('D:\\dev\\B', null);
    const tab3 = manager.createTab('D:\\dev\\C', null, 'shell', undefined, '', null, 'bash');
    manager.removeTab(tab3.id);
    manager.insertTabAfter(tab1.id, tab3);
    const ids = manager.getAllTabs().map(t => t.id);
    expect(ids).toEqual([tab1.id, tab3.id, tab2.id]);
  });

  it('insertTabAfter appends when afterTabId not found', () => {
    const tab1 = manager.createTab('D:\\dev\\A', null);
    const tab2 = manager.createTab('D:\\dev\\B', null, 'shell', undefined, '', null, 'bash');
    manager.removeTab(tab2.id);
    manager.insertTabAfter('nonexistent', tab2);
    const ids = manager.getAllTabs().map(t => t.id);
    expect(ids).toEqual([tab1.id, tab2.id]);
  });

  it('tracks active tab', () => {
    const tab1 = manager.createTab('D:\\dev\\A', null);
    const tab2 = manager.createTab('D:\\dev\\B', null);
    expect(manager.getActiveTabId()).toBe(tab1.id);
    manager.setActiveTab(tab2.id);
    expect(manager.getActiveTabId()).toBe(tab2.id);
  });

  describe('project-scoped operations', () => {
    it('createTab assigns projectId', () => {
      const tab = manager.createTab('/test', null, 'claude', undefined, 'proj-1');
      expect(tab.projectId).toBe('proj-1');
    });

    it('getTabsByProject returns only tabs for that project', () => {
      manager.createTab('/a', null, 'claude', undefined, 'proj-1');
      manager.createTab('/b', null, 'claude', undefined, 'proj-2');
      manager.createTab('/c', null, 'claude', undefined, 'proj-1');

      const proj1Tabs = manager.getTabsByProject('proj-1');
      expect(proj1Tabs).toHaveLength(2);
      expect(proj1Tabs.every(t => t.projectId === 'proj-1')).toBe(true);
    });

    it('removeTabsByProject removes all tabs for a project', () => {
      manager.createTab('/a', null, 'claude', undefined, 'proj-1');
      manager.createTab('/b', null, 'claude', undefined, 'proj-2');
      manager.createTab('/c', null, 'claude', undefined, 'proj-1');

      const removed = manager.removeTabsByProject('proj-1');
      expect(removed).toHaveLength(2);
      expect(manager.getAllTabs()).toHaveLength(1);
      expect(manager.getAllTabs()[0].projectId).toBe('proj-2');
    });

    it('removeTabsByProject updates activeTabId if needed', () => {
      const tab1 = manager.createTab('/a', null, 'claude', undefined, 'proj-1');
      const tab2 = manager.createTab('/b', null, 'claude', undefined, 'proj-2');
      manager.setActiveTab(tab1.id);

      manager.removeTabsByProject('proj-1');
      expect(manager.getActiveTabId()).toBe(tab2.id);
    });
  });

  // M1: additive timing fields + transition-guarded updateStatus
  describe('M1 timing fields', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('new tab has all four timing fields defaulting to null', () => {
      const tab = manager.createTab('/dev/proj', null);
      expect(tab.statusSince).toBeNull();
      expect(tab.lastActivityAt).toBeNull();
      expect(tab.firstActivityAt).toBeNull();
      expect(tab.waitingSince).toBeNull();
    });

    it('status change updates statusSince', () => {
      const t0 = 1000;
      vi.spyOn(Date, 'now').mockReturnValue(t0);
      const tab = manager.createTab('/dev/proj', null);
      manager.updateStatus(tab.id, 'working');
      expect(manager.getTab(tab.id)!.statusSince).toBe(t0);
    });

    it('two consecutive idle calls leave statusSince unchanged on the second', () => {
      const t0 = 2000;
      const t1 = 3000;
      // First call: new -> idle (status changes)
      vi.spyOn(Date, 'now').mockReturnValue(t0);
      const tab = manager.createTab('/dev/proj', null);
      manager.updateStatus(tab.id, 'idle');
      expect(manager.getTab(tab.id)!.statusSince).toBe(t0);

      // Second call: idle -> idle (same status, no change)
      vi.spyOn(Date, 'now').mockReturnValue(t1);
      manager.updateStatus(tab.id, 'idle');
      expect(manager.getTab(tab.id)!.statusSince).toBe(t0);
    });

    it('firstActivityAt stamps once on first working and never again', () => {
      const t0 = 4000;
      const t1 = 5000;
      vi.spyOn(Date, 'now').mockReturnValue(t0);
      const tab = manager.createTab('/dev/proj', null);
      manager.updateStatus(tab.id, 'working');
      expect(manager.getTab(tab.id)!.firstActivityAt).toBe(t0);

      // Second working entry must not overwrite firstActivityAt
      manager.updateStatus(tab.id, 'idle');
      vi.spyOn(Date, 'now').mockReturnValue(t1);
      manager.updateStatus(tab.id, 'working');
      expect(manager.getTab(tab.id)!.firstActivityAt).toBe(t0);
    });

    it('tab first seen as idle keeps firstActivityAt null until it next enters working', () => {
      vi.spyOn(Date, 'now').mockReturnValue(9000);
      const tab = manager.createTab('/dev/proj', null);
      manager.updateStatus(tab.id, 'idle');
      // Still null: idle before any working means the tab has not started a turn yet
      expect(manager.getTab(tab.id)!.firstActivityAt).toBeNull();

      // Now it enters working for the first time
      vi.spyOn(Date, 'now').mockReturnValue(10000);
      manager.updateStatus(tab.id, 'working');
      expect(manager.getTab(tab.id)!.firstActivityAt).toBe(10000);
    });

    it('waitingSince is set when entering a human-waiting status', () => {
      const t0 = 6000;
      vi.spyOn(Date, 'now').mockReturnValue(t0);
      const tab = manager.createTab('/dev/proj', null);
      // Prime firstActivityAt so the idle branch qualifies
      manager.updateStatus(tab.id, 'working');
      const t1 = 7000;
      vi.spyOn(Date, 'now').mockReturnValue(t1);
      manager.updateStatus(tab.id, 'idle');
      expect(manager.getTab(tab.id)!.waitingSince).toBe(t1);
    });

    it('waitingSince is not reset by an idle -> requires_response transition within a waiting span', () => {
      const t0 = 8000;
      vi.spyOn(Date, 'now').mockReturnValue(t0);
      const tab = manager.createTab('/dev/proj', null);
      manager.updateStatus(tab.id, 'working');

      const t1 = 9000;
      vi.spyOn(Date, 'now').mockReturnValue(t1);
      manager.updateStatus(tab.id, 'idle');
      expect(manager.getTab(tab.id)!.waitingSince).toBe(t1);

      // The overlay transition must not reset the span-start anchor
      const t2 = 10000;
      vi.spyOn(Date, 'now').mockReturnValue(t2);
      manager.updateStatus(tab.id, 'requires_response');
      expect(manager.getTab(tab.id)!.waitingSince).toBe(t1);
    });

    it('waitingSince clears to null on working (new turn started)', () => {
      const t0 = 11000;
      vi.spyOn(Date, 'now').mockReturnValue(t0);
      const tab = manager.createTab('/dev/proj', null);
      manager.updateStatus(tab.id, 'working');
      manager.updateStatus(tab.id, 'idle');
      expect(manager.getTab(tab.id)!.waitingSince).not.toBeNull();

      vi.spyOn(Date, 'now').mockReturnValue(12000);
      manager.updateStatus(tab.id, 'working');
      expect(manager.getTab(tab.id)!.waitingSince).toBeNull();
    });

    it('lastActivityAt updates on every updateStatus call', () => {
      const t0 = 13000;
      const t1 = 14000;
      vi.spyOn(Date, 'now').mockReturnValue(t0);
      const tab = manager.createTab('/dev/proj', null);
      manager.updateStatus(tab.id, 'working');
      expect(manager.getTab(tab.id)!.lastActivityAt).toBe(t0);

      vi.spyOn(Date, 'now').mockReturnValue(t1);
      // Same status: lastActivityAt still updates
      manager.updateStatus(tab.id, 'working');
      expect(manager.getTab(tab.id)!.lastActivityAt).toBe(t1);
    });
  });
});
