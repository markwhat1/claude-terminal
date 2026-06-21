// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveWsUrl, normalizeHostUrl } from '../../src/web-client/url';

describe('resolveWsUrl', () => {
  it('uses same-origin location, https -> wss', () => {
    expect(resolveWsUrl({ protocol: 'https:', host: 'h.ts.net' })).toBe('wss://h.ts.net');
  });
  it('uses same-origin location, http -> ws', () => {
    expect(resolveWsUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173');
  });
  it('derives scheme and host from an explicit https target', () => {
    expect(resolveWsUrl({ protocol: 'http:', host: 'ignored' }, 'https://cad-doctor.crested-ruler.ts.net'))
      .toBe('wss://cad-doctor.crested-ruler.ts.net');
  });
  it('defaults a scheme-less host to https -> wss', () => {
    expect(resolveWsUrl({ protocol: 'http:', host: 'ignored' }, 'cad-doctor.crested-ruler.ts.net'))
      .toBe('wss://cad-doctor.crested-ruler.ts.net');
  });
  it('handles an explicit http host:port -> ws', () => {
    expect(resolveWsUrl({ protocol: 'https:', host: 'ignored' }, 'http://100.120.160.3:8473'))
      .toBe('ws://100.120.160.3:8473');
  });
});

describe('normalizeHostUrl', () => {
  it('prepends https to a scheme-less host:port', () => {
    expect(normalizeHostUrl('100.120.160.3:8473')).toBe('https://100.120.160.3:8473');
  });
  it('leaves an explicit scheme intact', () => {
    expect(normalizeHostUrl('https://h.ts.net')).toBe('https://h.ts.net');
  });
  it('throws on unparseable input', () => {
    expect(() => normalizeHostUrl('http://')).toThrow();
  });
});
