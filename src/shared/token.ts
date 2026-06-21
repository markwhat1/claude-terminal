import crypto from 'node:crypto';

/** Unambiguous uppercase alphanumerics (no 0/O/1/I) for human-typed access codes. */
export const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Generate a 6-character access code from the unambiguous character set. */
export function genToken(): string {
  return Array.from(
    { length: 6 },
    () => TOKEN_CHARS[crypto.randomInt(0, TOKEN_CHARS.length)],
  ).join('');
}
