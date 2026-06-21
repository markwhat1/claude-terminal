/**
 * M0b-ii: isAllowedExternalScheme — pure predicate, shared module.
 *
 * Tests:
 *  1. http: and https: are allowed.
 *  2. file:, javascript:, vscode:, and other non-http(s) schemes are rejected.
 *  3. Asymmetry: a dev-server / file:// app URL is NOT allowed (the will-navigate
 *     passthrough is handled upstream; the predicate itself says no to file://).
 *  4. An external https: URL IS allowed.
 */

import { describe, it, expect } from 'vitest';
import { isAllowedExternalScheme } from '@shared/url-scheme';

describe('isAllowedExternalScheme', () => {
  it('allows http: URLs', () => {
    expect(isAllowedExternalScheme('http://example.com')).toBe(true);
  });

  it('allows https: URLs', () => {
    expect(isAllowedExternalScheme('https://example.com/path?q=1')).toBe(true);
  });

  it('rejects file: URLs', () => {
    expect(isAllowedExternalScheme('file:///C:/Users/Mark/app.html')).toBe(false);
  });

  it('rejects file:// (the dev-server passthrough prefix)', () => {
    // The will-navigate passthrough for file:// happens BEFORE this check;
    // the predicate itself still rejects file: so it never reaches openExternal.
    expect(isAllowedExternalScheme('file://')).toBe(false);
  });

  it('rejects javascript: URLs', () => {
    expect(isAllowedExternalScheme('javascript:alert(1)')).toBe(false);
  });

  it('rejects vscode: URLs', () => {
    expect(isAllowedExternalScheme('vscode://extension/foo')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isAllowedExternalScheme('data:text/html,<h1>hi</h1>')).toBe(false);
  });

  it('rejects blob: URLs', () => {
    expect(isAllowedExternalScheme('blob:https://example.com/uuid')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isAllowedExternalScheme('')).toBe(false);
  });

  it('rejects a plain path with no scheme', () => {
    expect(isAllowedExternalScheme('/local/path/to/file')).toBe(false);
  });
});

describe('isAllowedExternalScheme — nav-sink asymmetry', () => {
  it('external https: IS sent to openExternal', () => {
    // This is the "external https: IS sent" half of the asymmetry assertion.
    expect(isAllowedExternalScheme('https://docs.anthropic.com')).toBe(true);
  });

  it('dev-server-style file:// is NOT sent to openExternal (predicate rejects it)', () => {
    // The will-navigate handler passes file:// URLs through without calling
    // openExternal or preventDefault — that passthrough is BEFORE the scheme
    // check. The predicate still returns false so an app-url never reaches
    // openExternal accidentally via setWindowOpenHandler.
    expect(isAllowedExternalScheme('file://localhost/index.html')).toBe(false);
  });

  it('vscode: scheme is rejected at both nav sinks and the IPC handler', () => {
    expect(isAllowedExternalScheme('vscode://file/src/foo.ts')).toBe(false);
  });
});
