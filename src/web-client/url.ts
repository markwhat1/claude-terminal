/**
 * Trim input and ensure a parseable absolute URL. A scheme-less host (e.g. a
 * bare tailnet name or `host:port`) defaults to https. Throws if the result is
 * still not a valid URL, so callers can surface a clear error instead of a
 * later opaque failure.
 */
export function normalizeHostUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const u = new URL(withScheme); // throws on invalid input
  if (!u.host) throw new Error('Invalid host URL');
  return withScheme;
}

/**
 * Build the WebSocket URL for the remote bridge. With `targetUrl`, derive the
 * scheme and host from it (https/wss -> wss, http/ws -> ws); otherwise use the
 * page's own location (same-origin, for the browser web client).
 */
export function resolveWsUrl(
  location: { protocol: string; host: string },
  targetUrl?: string,
): string {
  if (targetUrl) {
    const u = new URL(normalizeHostUrl(targetUrl));
    const secure = u.protocol === 'https:' || u.protocol === 'wss:';
    return `${secure ? 'wss:' : 'ws:'}//${u.host}`;
  }
  const secure = location.protocol === 'https:';
  return `${secure ? 'wss:' : 'ws:'}//${location.host}`;
}
