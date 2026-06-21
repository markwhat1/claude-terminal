import { useCallback, useRef, useState } from 'react';
import type { Tab as TabType, RemoteAccessInfo } from '../../shared/types';
import { useShellOptions } from '../shell-context';
import Tab from './Tab';
import HamburgerMenu from './HamburgerMenu';
import RemoteAccessButton from './RemoteAccessButton';
import UpdateButton from './UpdateButton';
import { Button } from '@/components/ui/button';
import { Plug } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface TabBarProps {
  tabs: TabType[];
  activeTabId: string | null;
  renamingTabId: string | null;
  defaultShell: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, name: string) => void;
  onRenameHandled: () => void;
  onNewClaudeTab: () => void;
  onNewWorktreeTab: () => void;
  onNewShellTab: (shellType: string, afterTabId?: string) => void;
  onReorderTabs: (tabs: TabType[]) => void;
  onRefreshTab: (tabId: string) => void;
  onManageWorktrees: () => void;
  onManageHooks: () => void;
  onOpenSettings: () => void;
  remoteInfo: RemoteAccessInfo;
  onActivateRemote: () => void;
  onDeactivateRemote: () => void;
  /**
   * Activate the synthetic Home view. The pill is NOT a member of tabs.
   * Optional: the remote web client (Home is desktop-only) omits it, so the
   * pill is not rendered there.
   */
  onSelectHome?: () => void;
  /** Whether Home is the active surface (highlights the pill). */
  isHomeActive?: boolean;
  /** Desktop only: open the connect-to-remote dialog. */
  onConnectRemote?: () => void;
  /** Desktop host only: rotate the remote access code. */
  onRegenerateRemoteCode?: () => void;
}

export default function TabBar({
  tabs,
  activeTabId,
  renamingTabId,
  defaultShell,
  onSelectTab,
  onCloseTab,
  onRenameTab,
  onRenameHandled,
  onNewClaudeTab,
  onNewWorktreeTab,
  onNewShellTab,
  onReorderTabs,
  onRefreshTab,
  onManageWorktrees,
  onManageHooks,
  onOpenSettings,
  remoteInfo,
  onActivateRemote,
  onDeactivateRemote,
  onSelectHome,
  isHomeActive,
  onConnectRemote,
  onRegenerateRemoteCode,
}: TabBarProps) {
  const shellOptions = useShellOptions();
  const dragTabId = useRef<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    dragTabId.current = tabId;
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
    document.body.classList.add('tab-dragging');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragTabId.current && dragTabId.current !== tabId) {
      setDragOverTabId(tabId);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    setDragOverTabId(null);
    const fromId = dragTabId.current;
    if (!fromId || fromId === tabId) return;
    const currentTabs = tabsRef.current;
    const fromIdx = currentTabs.findIndex((t) => t.id === fromId);
    const toIdx = currentTabs.findIndex((t) => t.id === tabId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...currentTabs];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    onReorderTabs(reordered);
  }, [onReorderTabs]);

  const handleDragEnd = useCallback(() => {
    dragTabId.current = null;
    setDragOverTabId(null);
    setIsDragging(false);
    document.body.classList.remove('tab-dragging');
  }, []);

  return (
    <div className={cn(
      'flex bg-[hsl(var(--project-hue)_30%_18%)] border-b border-border min-h-[36px] items-center px-1 [-webkit-app-region:drag]',
      isDragging && '[-webkit-app-region:no-drag]'
    )}>
      {/* Home entry pill: a NON-TAB affordance at the LEFT of the bar. It is
          not a member of `tabs`, has no status glyph / close / rename / drag,
          and carries ZERO keybinding (6.4). Desktop-only: the remote client
          omits onSelectHome so the pill is not rendered. */}
      {onSelectHome && (
        <button
          type="button"
          className={cn(
            'px-3 py-1 text-xs rounded-sm mr-1 [-webkit-app-region:no-drag] shrink-0',
            isHomeActive
              ? 'text-foreground bg-[hsl(var(--project-hue)_30%_25%)]'
              : 'text-muted-foreground hover:text-foreground',
          )}
          data-testid="home-entry-pill"
          title="Home"
          onClick={onSelectHome}
        >
          Home
        </button>
      )}
      <div className="flex flex-1 min-w-0 overflow-hidden items-center">
        {tabs.map((tab, index) => (
          <Tab
            key={tab.id}
            tab={tab}
            index={index}
            isActive={tab.id === activeTabId}
            isRenaming={tab.id === renamingTabId}
            onSelect={onSelectTab}
            onClose={onCloseTab}
            onRename={onRenameTab}
            onRenameHandled={onRenameHandled}
            onOpenShell={tab.type === 'claude' ? onNewShellTab : undefined}
            onRefresh={onRefreshTab}
            isDragOver={dragOverTabId === tab.id}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground text-xl px-3 py-1 [-webkit-app-region:no-drag]" title="New tab">
            +
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={onNewClaudeTab}>
            <span>Claude Tab</span>
            <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+T</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onNewWorktreeTab}>
            <span>Claude Worktree</span>
            <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+W</span>
          </DropdownMenuItem>
          {shellOptions.length > 0 && <DropdownMenuSeparator />}
          {shellOptions.map((shell) => {
            const isDefault = defaultShell ? shell.id === defaultShell : shell.id === shellOptions[0]?.id;
            return (
              <DropdownMenuItem key={shell.id} onClick={() => onNewShellTab(shell.id, activeTabId ?? undefined)}>
                <span>{shell.label}</span>
                {isDefault && (
                  <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+`</span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex items-center ml-auto [-webkit-app-region:no-drag]">
        <UpdateButton />
        {onConnectRemote && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Connect to a remote ClaudeTerminal"
            onClick={onConnectRemote}
          >
            <Plug size={16} />
          </Button>
        )}
        <RemoteAccessButton
          remoteInfo={remoteInfo}
          onActivate={onActivateRemote}
          onDeactivate={onDeactivateRemote}
          onRegenerate={onRegenerateRemoteCode}
        />
        <HamburgerMenu onManageWorktrees={onManageWorktrees} onManageHooks={onManageHooks} onOpenSettings={onOpenSettings} />
      </div>
    </div>
  );
}
