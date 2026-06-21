// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { genToken } from '@shared/token';

describe('genToken', () => {
  it('returns a 6-char uppercase alphanumeric code', () => {
    expect(genToken()).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('excludes ambiguous characters (0 O 1 I) across many draws', () => {
    for (let i = 0; i < 200; i++) {
      expect(genToken()).not.toMatch(/[0O1I]/);
    }
  });
});
