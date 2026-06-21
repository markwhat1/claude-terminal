// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from('E::' + s, 'utf-8')),
    decryptString: vi.fn((b: Buffer) => b.toString('utf-8').replace(/^E::/, '')),
  },
}));

import { safeStorage } from 'electron';
import { encryptField, decryptField } from '@main/secure-store';

describe('secure-store', () => {
  it('round-trips an encrypted field without exposing the plaintext', () => {
    const stored = encryptField('ABC234');
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(stored).not.toContain('ABC234');
    expect(decryptField(stored)).toBe('ABC234');
  });

  it('falls back to tagged plaintext when encryption is unavailable', () => {
    (safeStorage.isEncryptionAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const stored = encryptField('XYZ789');
    expect(stored).toBe('plain:v1:XYZ789');
    expect(decryptField(stored)).toBe('XYZ789');
  });

  it('returns empty string for unrecognized input', () => {
    expect(decryptField('garbage')).toBe('');
  });
});
