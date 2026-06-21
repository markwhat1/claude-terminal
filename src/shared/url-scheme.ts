/**
 * Pure URL scheme allowlist for external navigation.
 *
 * Only http: and https: are allowed through to shell.openExternal.
 * All other schemes (file:, javascript:, vscode:, data:, blob:, etc.) are
 * rejected to prevent privilege escalation and unintended local file access.
 *
 * Note on the will-navigate asymmetry: the app-url passthrough
 * (MAIN_WINDOW_VITE_DEV_SERVER_URL || 'file://') is checked BEFORE this
 * predicate in the will-navigate handler, so hot-reload traffic is never
 * intercepted. This predicate itself still returns false for file: URLs,
 * which is correct — they should not reach openExternal.
 */
export function isAllowedExternalScheme(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    // URL constructor throws on non-absolute or malformed URLs.
    return false;
  }
}
