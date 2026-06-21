/**
 * M12: tests for the shared capture schema + server-side validation.
 *
 * Covers:
 *   - validateCaptureText rejects non-string, over-length, control-byte, and
 *     empty/whitespace-only payloads, and accepts a trimmed normal string.
 *   - makeTodoItem sets ONLY text (id/createdAt minted), with the Phase-3 fields
 *     defaulting null (Enter persists with only text set, PLAN-PHASE-2-3 line 53).
 *   - the id is minted via the SHARED generateId('todo') minter, with one
 *     collision test (PLAN-PHASE-2-3 line 41).
 */

import { describe, it, expect } from 'vitest';
import {
  validateCaptureText,
  makeTodoItem,
  emptyTodosFile,
  MAX_CAPTURE_TEXT_LENGTH,
  TODOS_SCHEMA_VERSION,
} from '@shared/capture';
import { generateId } from '@shared/dashboard-ui-helpers';

describe('validateCaptureText (server-side validation)', () => {
  it('accepts a normal string and returns it trimmed', () => {
    const r = validateCaptureText('  call the lab about the crown  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe('call the lab about the crown');
  });

  it('accepts a string at exactly the length cap', () => {
    const r = validateCaptureText('a'.repeat(MAX_CAPTURE_TEXT_LENGTH));
    expect(r.ok).toBe(true);
  });

  it('rejects a non-string payload (typeof guard)', () => {
    // The remote handler must require typeof msg.text === 'string'.
    expect(validateCaptureText(undefined)).toEqual({ ok: false, reason: 'not-string' });
    expect(validateCaptureText(null)).toEqual({ ok: false, reason: 'not-string' });
    expect(validateCaptureText(42)).toEqual({ ok: false, reason: 'not-string' });
    expect(validateCaptureText({ text: 'x' })).toEqual({ ok: false, reason: 'not-string' });
    expect(validateCaptureText(['x'])).toEqual({ ok: false, reason: 'not-string' });
  });

  it('rejects an over-length string (length cap)', () => {
    const tooLong = 'a'.repeat(MAX_CAPTURE_TEXT_LENGTH + 1);
    expect(validateCaptureText(tooLong)).toEqual({ ok: false, reason: 'too-long' });
  });

  it('rejects an over-length string of whitespace BEFORE trimming (no padding past the bound)', () => {
    const tooLongSpaces = ' '.repeat(MAX_CAPTURE_TEXT_LENGTH + 1);
    expect(validateCaptureText(tooLongSpaces)).toEqual({ ok: false, reason: 'too-long' });
  });

  it('rejects control bytes (NUL, ESC, BEL, CR, DEL, C1)', () => {
    expect(validateCaptureText('a\x00b')).toEqual({ ok: false, reason: 'control-bytes' });
    expect(validateCaptureText('a\x1bb')).toEqual({ ok: false, reason: 'control-bytes' }); // ESC
    expect(validateCaptureText('a\x07b')).toEqual({ ok: false, reason: 'control-bytes' }); // BEL
    expect(validateCaptureText('a\rb')).toEqual({ ok: false, reason: 'control-bytes' }); // lone CR
    expect(validateCaptureText('a\x7fb')).toEqual({ ok: false, reason: 'control-bytes' }); // DEL
    expect(validateCaptureText('a\x85b')).toEqual({ ok: false, reason: 'control-bytes' }); // C1 NEL
  });

  it('allows TAB and LINE FEED (a multi-line paste is not control-rejected)', () => {
    const r = validateCaptureText('line one\n\tindented line two');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe('line one\n\tindented line two');
  });

  it('rejects an empty or whitespace-only string', () => {
    expect(validateCaptureText('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateCaptureText('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(validateCaptureText('\n\t  \n')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('makeTodoItem', () => {
  it('sets ONLY text (Phase-3 fields default null), with id + createdAt minted', () => {
    const item = makeTodoItem('draft the MediaNV follow-up', 1718900000000);
    expect(item.text).toBe('draft the MediaNV follow-up');
    expect(item.createdAt).toBe(1718900000000);
    expect(typeof item.id).toBe('string');
    expect(item.id.startsWith('todo-')).toBe(true);
    // Enter persists with only text set: every triage field is null at M12.
    expect(item.horizon).toBeNull();
    expect(item.category).toBeNull();
    expect(item.project).toBeNull();
    expect(item.parkedUntil).toBeNull();
    expect(item.doneAt).toBeNull();
  });

  it('mints the id via the SHARED generateId minter (todo prefix)', () => {
    // The id format matches generateId('todo'): "todo-<base36 ts>-<6 random>".
    const item = makeTodoItem('x');
    const fromMinter = generateId('todo');
    const shape = /^todo-[a-z0-9]+-[a-z0-9]{1,6}$/;
    expect(item.id).toMatch(shape);
    expect(fromMinter).toMatch(shape);
  });

  it('mints unique ids across many captures (one collision test)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      ids.add(makeTodoItem(`item ${i}`).id);
    }
    expect(ids.size).toBe(2000);
  });
});

describe('emptyTodosFile', () => {
  it('is a version 2 file with an empty items array', () => {
    expect(emptyTodosFile()).toEqual({ version: TODOS_SCHEMA_VERSION, items: [] });
    expect(TODOS_SCHEMA_VERSION).toBe(2);
  });
});
