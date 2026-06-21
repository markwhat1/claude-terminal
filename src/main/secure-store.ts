import { safeStorage } from 'electron';

// Tagged formats so a read can tell how the stored value was produced, which
// matters if a machine gains or loses OS encryption between writes and reads.
const ENC_PREFIX = 'enc:v1:';
const PLAIN_PREFIX = 'plain:v1:';

/** Whether the OS keychain (DPAPI on Windows) is available to encrypt fields. */
export function isFieldEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * Encrypt a credential for at-rest storage in the settings JSON. Falls back to
 * a tagged plaintext form when OS encryption is unavailable, so the value still
 * round-trips. Never returns the bare input.
 */
export function encryptField(plain: string): string {
  if (isFieldEncryptionAvailable()) {
    return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64');
  }
  return PLAIN_PREFIX + plain;
}

/** Inverse of encryptField. Returns '' for unrecognized or undecryptable input. */
export function decryptField(stored: string): string {
  try {
    if (stored.startsWith(ENC_PREFIX)) {
      return safeStorage.decryptString(Buffer.from(stored.slice(ENC_PREFIX.length), 'base64'));
    }
  } catch {
    return '';
  }
  if (stored.startsWith(PLAIN_PREFIX)) {
    return stored.slice(PLAIN_PREFIX.length);
  }
  return '';
}
