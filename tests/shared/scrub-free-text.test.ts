/**
 * M0c: Tests for scrubFreeText (PLAN.md lines 854-861, section 3.4).
 *
 * TDD: tests written FIRST; the function lives in src/shared/scrub-free-text.ts.
 *
 * The scrubber is harm-reduction, not a primary PHI control. These tests pin the
 * refined regex set (word-boundary / min-length tightened) so it:
 *   - POSITIVE: redacts phone numbers, DOBs, emails, and Bearer tokens.
 *   - NEGATIVE: leaves a clean repo path with a numeric segment, an ISO date,
 *     127.0.0.1, and a :line-line citation untouched.
 *
 * The function ships WITH a real caller (M19's opt-in free-text path).
 * It MUST NOT be fed to composeClaudeQuery or any log.*() call.
 */

import { describe, it, expect } from 'vitest';
import { scrubFreeText } from '@shared/scrub-free-text';

// ---------------------------------------------------------------------------
// POSITIVE cases: text that MUST be redacted
// ---------------------------------------------------------------------------

describe('scrubFreeText -- positive cases (must be redacted)', () => {
  it('redacts a US phone number with separating dashes (303-986-9337)', () => {
    const result = scrubFreeText('call me at 303-986-9337 please');
    expect(result).not.toContain('303-986-9337');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts a US phone number with dots (303.986.9337)', () => {
    const result = scrubFreeText('number: 303.986.9337');
    expect(result).not.toContain('303.986.9337');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts a date-of-birth in MM/DD/YYYY format (04/12/1985)', () => {
    const result = scrubFreeText('DOB 04/12/1985 on record');
    expect(result).not.toContain('04/12/1985');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts a date-of-birth in MM-DD-YYYY format (04-12-1985)', () => {
    const result = scrubFreeText('patient born 04-12-1985');
    expect(result).not.toContain('04-12-1985');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts an email address', () => {
    const result = scrubFreeText('send to drmark@cadentistry.net today');
    expect(result).not.toContain('drmark@cadentistry.net');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts a Bearer token', () => {
    const result = scrubFreeText('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def');
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9.abc.def');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts a token= value', () => {
    const result = scrubFreeText('token=sk-abc123defgh456 in config');
    expect(result).not.toContain('sk-abc123defgh456');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts multiple sensitive patterns in one string', () => {
    const result = scrubFreeText(
      'patient DOB 04/12/1985 called 303-986-9337 email drmark@cadentistry.net',
    );
    expect(result).not.toContain('04/12/1985');
    expect(result).not.toContain('303-986-9337');
    expect(result).not.toContain('drmark@cadentistry.net');
  });
});

// ---------------------------------------------------------------------------
// NEGATIVE cases: text that MUST be left unchanged
// ---------------------------------------------------------------------------

describe('scrubFreeText -- negative cases (must be unchanged)', () => {
  it('leaves a clean repo path with a numeric segment unchanged', () => {
    const input = 'src/shared/capture.ts:42';
    expect(scrubFreeText(input)).toBe(input);
  });

  it('leaves an ISO date (2026-06-22) unchanged', () => {
    const input = 'deployed on 2026-06-22';
    expect(scrubFreeText(input)).toBe(input);
  });

  it('leaves a loopback address (127.0.0.1) unchanged', () => {
    const input = 'server at 127.0.0.1:3000';
    expect(scrubFreeText(input)).toBe(input);
  });

  it('leaves a :line-line citation unchanged', () => {
    const input = 'see tab-manager.ts:55-58 for the stamping logic';
    expect(scrubFreeText(input)).toBe(input);
  });

  it('leaves an ISO date with no separating context unchanged (2026-06-22)', () => {
    // ISO dates have 4-digit year, unlike DOB which has 2-digit year fields
    const input = '2026-06-22';
    expect(scrubFreeText(input)).toBe(input);
  });

  it('leaves a version string (v1.2.3) unchanged', () => {
    const input = 'electron v1.2.3 is required';
    expect(scrubFreeText(input)).toBe(input);
  });

  it('leaves a short port number in a URL (localhost:5173) unchanged', () => {
    const input = 'open http://localhost:5173';
    expect(scrubFreeText(input)).toBe(input);
  });

  it('leaves a path numeric segment like /api/v2/items unchanged', () => {
    const input = '/api/v2/items/20 returns the list';
    expect(scrubFreeText(input)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// Pure function contract
// ---------------------------------------------------------------------------

describe('scrubFreeText -- pure function contract', () => {
  it('returns a string for all inputs', () => {
    expect(typeof scrubFreeText('')).toBe('string');
    expect(typeof scrubFreeText('hello')).toBe('string');
    expect(typeof scrubFreeText('303-986-9337')).toBe('string');
  });

  it('never throws on arbitrary input', () => {
    const inputs = [
      '',
      'plain text',
      '303-986-9337',
      '2026-06-22',
      '127.0.0.1',
      'src/main/tab-manager.ts:22-55',
      'a'.repeat(2000),
      '\n\t special chars !@#$%',
    ];
    for (const input of inputs) {
      expect(() => scrubFreeText(input)).not.toThrow();
    }
  });

  it('returns the input unchanged when no patterns match', () => {
    const input = 'a normal development note about the ranker fix';
    expect(scrubFreeText(input)).toBe(input);
  });
});
