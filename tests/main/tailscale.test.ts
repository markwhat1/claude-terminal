// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// tailscale.ts imports the logger, which imports electron at module load.
vi.mock('electron', () => ({ BrowserWindow: class {} }));
vi.mock('@main/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { parseTailnetUrl } from '@main/tailscale';

describe('parseTailnetUrl', () => {
  it('builds an https URL from Self.DNSName, stripping the trailing dot', () => {
    const json = JSON.stringify({ Self: { DNSName: 'cad-doctor.tail1234.ts.net.' } });
    expect(parseTailnetUrl(json)).toBe('https://cad-doctor.tail1234.ts.net');
  });

  it('handles a DNSName without a trailing dot', () => {
    const json = JSON.stringify({ Self: { DNSName: 'cad-doctor.tail1234.ts.net' } });
    expect(parseTailnetUrl(json)).toBe('https://cad-doctor.tail1234.ts.net');
  });

  it('returns null when DNSName is missing', () => {
    expect(parseTailnetUrl(JSON.stringify({ Self: {} }))).toBeNull();
  });

  it('returns null when Self is missing', () => {
    expect(parseTailnetUrl(JSON.stringify({ Peer: {} }))).toBeNull();
  });

  it('returns null on an empty DNSName', () => {
    expect(parseTailnetUrl(JSON.stringify({ Self: { DNSName: '' } }))).toBeNull();
  });

  it('returns null on invalid JSON', () => {
    expect(parseTailnetUrl('{not valid json')).toBeNull();
  });
});
