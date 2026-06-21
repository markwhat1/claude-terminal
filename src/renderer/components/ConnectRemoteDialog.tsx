import { useState } from 'react';
import { normalizeHostUrl } from '../../web-client/url';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ConnectRemoteDialogProps {
  defaultUrl?: string;
  onConnect: (url: string, code: string, remember: boolean) => void;
  onCancel: () => void;
  /** Forget the remembered host. Shown only when defaultUrl is set. */
  onForget?: () => void;
}

export default function ConnectRemoteDialog({ defaultUrl, onConnect, onCancel, onForget }: ConnectRemoteDialogProps) {
  const [url, setUrl] = useState(defaultUrl ?? '');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || !url.trim()) return;
    let normalized: string;
    try {
      normalized = normalizeHostUrl(url);
    } catch {
      setError('Enter a valid host, e.g. https://cad-doctor.your-tailnet.ts.net');
      return;
    }
    onConnect(normalized, code, remember);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="p-6">
        <DialogHeader>
          <DialogTitle className="text-lg">Connect to a remote session</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Host URL
            </Label>
            <Input
              type="text"
              autoComplete="off"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(null); }}
              placeholder="https://cad-doctor.your-tailnet.ts.net"
              autoFocus
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Access Code
            </Label>
            <Input
              type="text"
              autoComplete="off"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              className="mt-1.5 text-center tracking-[0.3em] text-xl"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember this host and auto-connect on launch
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {onForget && defaultUrl && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline self-start"
              onClick={onForget}
            >
              Forget this host
            </button>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={code.length !== 6 || !url.trim()}>Connect</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
