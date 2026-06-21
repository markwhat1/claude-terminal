import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useShellOptions } from '../shell-context';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  defaultShell: string | null;
  onDefaultShellChange: (shellId: string) => void;
  startupView: 'lastSession' | 'home';
  onStartupViewChange: (view: 'lastSession' | 'home') => void;
  // Phase-3 coaching flags, all default OFF (PLAN-PHASE-2-3 lines 76-78). They
  // are optional so older callers (and tests) keep working; an unset flag reads
  // as off and its toggle stays unchecked.
  stallInterrupt?: boolean;
  onStallInterruptChange?: (value: boolean) => void;
  commitmentMirror?: boolean;
  onCommitmentMirrorChange?: (value: boolean) => void;
  morningRitual?: boolean;
  onMorningRitualChange?: (value: boolean) => void;
}

export default function SettingsDialog({
  open,
  onClose,
  defaultShell,
  onDefaultShellChange,
  startupView,
  onStartupViewChange,
  stallInterrupt = false,
  onStallInterruptChange,
  commitmentMirror = false,
  onCommitmentMirrorChange,
  morningRitual = false,
  onMorningRitualChange,
}: SettingsDialogProps) {
  const shellOptions = useShellOptions();

  // Resolve the effective value: saved preference, or first available shell
  const effectiveShell = defaultShell && shellOptions.some(s => s.id === defaultShell)
    ? defaultShell
    : shellOptions[0]?.id ?? '';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Default terminal</div>
              <div className="text-xs text-muted-foreground">Opened with Ctrl+`</div>
            </div>
            <Select value={effectiveShell} onValueChange={onDefaultShellChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {shellOptions.map((shell) => (
                  <SelectItem key={shell.id} value={shell.id}>
                    {shell.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* M14c: startup view picker */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">When ClaudeTerminal opens</div>
            </div>
            <select
              data-testid="startup-view-select"
              className="w-[160px] rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={startupView}
              onChange={(e) => onStartupViewChange(e.target.value as 'lastSession' | 'home')}
            >
              <option value="lastSession">Last session</option>
              <option value="home">Home</option>
            </select>
          </div>

          {/* Phase-3 coaching toggles. All default OFF (PLAN-PHASE-2-3). The
              copy is plain and calm: it states what the feature does, with no
              guilt, no streak framing, and no time-since language. */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Gentle nudge when a task sits</div>
              <div className="text-xs text-muted-foreground">A soft pulse on the focused task. No relayout.</div>
            </div>
            <input
              type="checkbox"
              data-testid="stall-interrupt-toggle"
              className="h-4 w-4 rounded border-input"
              checked={stallInterrupt}
              onChange={(e) => onStallInterruptChange?.(e.target.checked)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Name the one thing on open</div>
              <div className="text-xs text-muted-foreground">Pick one focus when Home opens. Skip anytime.</div>
            </div>
            <input
              type="checkbox"
              data-testid="commitment-mirror-toggle"
              className="h-4 w-4 rounded border-input"
              checked={commitmentMirror}
              onChange={(e) => onCommitmentMirrorChange?.(e.target.checked)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Morning review on first open</div>
              <div className="text-xs text-muted-foreground">Bring parked items back and retriage them.</div>
            </div>
            <input
              type="checkbox"
              data-testid="morning-ritual-toggle"
              className="h-4 w-4 rounded border-input"
              checked={morningRitual}
              onChange={(e) => onMorningRitualChange?.(e.target.checked)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
