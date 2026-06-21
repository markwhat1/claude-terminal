import { exec } from 'node:child_process';
import { log } from './logger';

/**
 * Parse the output of `tailscale status --json` into this node's HTTPS tailnet
 * URL (e.g. `https://cad-doctor.tailXXXX.ts.net`). The MagicDNS name in
 * `Self.DNSName` carries a trailing dot, which is stripped. Returns null if the
 * output is unparseable or has no usable DNS name.
 */
export function parseTailnetUrl(statusJson: string): string | null {
  try {
    const parsed = JSON.parse(statusJson) as { Self?: { DNSName?: string } };
    const dns = parsed.Self?.DNSName?.replace(/\.$/, '').trim();
    if (!dns) return null;
    return `https://${dns}`;
  } catch {
    return null;
  }
}

/**
 * Resolve this machine's tailnet HTTPS URL by shelling out to the tailscale
 * CLI. Returns null if tailscale is not installed, not running, or the command
 * fails. Never throws.
 */
export function getTailnetUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    exec('tailscale status --json', { timeout: 5000, windowsHide: true }, (err, stdout) => {
      if (err) {
        log.warn('[tailscale] could not read status:', err.message);
        resolve(null);
        return;
      }
      resolve(parseTailnetUrl(stdout));
    });
  });
}
