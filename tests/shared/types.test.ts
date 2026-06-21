import { TabStatus, Tab, IpcMessage, PermissionMode, HOOK_EVENTS, PROJECT_COLORS } from '@shared/types';
import type { RepoHookConfig, RepoHook, HookCommand, HookEvent, ProjectConfig, WorkspaceConfig } from '@shared/types';

describe('shared types', () => {
  it('TabStatus has all expected values', () => {
    const statuses: TabStatus[] = ['new', 'working', 'idle', 'requires_response', 'shell'];
    expect(statuses).toHaveLength(5);
  });

  it('Tab has required fields', () => {
    const tab: Tab = {
      id: 'tab-1',
      type: 'claude',
      name: 'Tab 1',
      defaultName: 'Tab 1',
      status: 'new',
      worktree: null,
      sourceBranch: null,
      cwd: '/some/path',
      shellType: null,
      pid: null,
      sessionId: null,
      projectId: 'proj-1',
      statusSince: null,
      lastActivityAt: null,
      firstActivityAt: null,
      waitingSince: null,
    };
    expect(tab.id).toBe('tab-1');
    expect(tab.worktree).toBeNull();
    expect(tab.projectId).toBe('proj-1');
    // M1: four timing fields present and typed as number | null
    expect(tab.statusSince).toBeNull();
    expect(tab.lastActivityAt).toBeNull();
    expect(tab.firstActivityAt).toBeNull();
    expect(tab.waitingSince).toBeNull();
  });

  // M1: type-compile check -- Tab used as Tab[] (mirrors web-client/main.tsx usage)
  // and no 'closed' field exists on Tab (the render check)
  it('M1 type-compile: Tab[] array assignment compiles and has no closed field', () => {
    const tabs: Tab[] = [
      {
        id: 'tab-1',
        type: 'claude',
        name: 'Test',
        defaultName: 'Test',
        status: 'idle',
        worktree: null,
        sourceBranch: null,
        cwd: '/test',
        shellType: null,
        pid: null,
        sessionId: null,
        projectId: 'p1',
        statusSince: 1000,
        lastActivityAt: 2000,
        firstActivityAt: 500,
        waitingSince: 1000,
      },
    ];
    // Verify the shape is correct at runtime
    expect(tabs[0].statusSince).toBe(1000);
    expect(tabs[0].lastActivityAt).toBe(2000);
    expect(tabs[0].firstActivityAt).toBe(500);
    expect(tabs[0].waitingSince).toBe(1000);
    // No 'closed' field on Tab (the no-closed-field render check)
    expect('closed' in tabs[0]).toBe(false);
  });

  it('IpcMessage has required structure', () => {
    const msg: IpcMessage = {
      tabId: 'tab-1',
      event: 'tab:status:working',
      data: null,
    };
    expect(msg.event).toBe('tab:status:working');
  });

  it('PermissionMode has expected values', () => {
    const modes: PermissionMode[] = ['default', 'plan', 'acceptEdits', 'bypassPermissions'];
    expect(modes).toHaveLength(4);
  });
});

describe('RepoHook types', () => {
  it('HOOK_EVENTS contains all supported events', () => {
    expect(HOOK_EVENTS).toContain('worktree:created');
    expect(HOOK_EVENTS).toContain('worktree:removed');
    expect(HOOK_EVENTS).toContain('tab:created');
    expect(HOOK_EVENTS).toContain('tab:closed');
    expect(HOOK_EVENTS).toContain('session:started');
    expect(HOOK_EVENTS).toContain('app:started');
    expect(HOOK_EVENTS).toContain('branch:changed');
    expect(HOOK_EVENTS.length).toBe(7);
  });

  it('RepoHookConfig shape is valid', () => {
    const config: RepoHookConfig = {
      hooks: [
        {
          id: 'test',
          name: 'Test hook',
          event: 'worktree:created',
          commands: [{ path: '.', command: 'echo hello' }],
          enabled: true,
        },
      ],
    };
    expect(config.hooks).toHaveLength(1);
    expect(config.hooks[0].commands[0].path).toBe('.');
  });
});

describe('Project types', () => {
  it('PROJECT_COLORS has at least 8 colors', () => {
    expect(PROJECT_COLORS.length).toBeGreaterThanOrEqual(8);
  });

  it('ProjectConfig has required fields', () => {
    const config: ProjectConfig = { id: 'p1', dir: '/test/repo', colorIndex: 0 };
    expect(config.id).toBe('p1');
    expect(config.dir).toBe('/test/repo');
    expect(config.colorIndex).toBe(0);
  });

  it('WorkspaceConfig has required fields', () => {
    const ws: WorkspaceConfig = {
      id: 'ws-1',
      name: 'My Workspace',
      projects: [{ id: 'p1', dir: '/test/repo', colorIndex: 0 }],
      activeProjectId: 'p1',
      geometry: { x: 0, y: 0, width: 1200, height: 800 },
    };
    expect(ws.projects).toHaveLength(1);
    expect(ws.activeProjectId).toBe('p1');
  });
});
