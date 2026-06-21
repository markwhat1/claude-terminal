/**
 * M12: tests for the MAIN-owned capture store (todos.json).
 *
 * Covers:
 *   - the resolved path is under userData/dashboard, NOT the workspace git tree.
 *   - append persists a v2 file with only-text item, and bumps the count.
 *   - over-length / non-string / control-byte / empty captures are REJECTED
 *     server-side (the store never writes them).
 *   - the item-count cap rejects an append at capacity.
 *   - countOpenTodos returns the open-item count for the Inbox(N) glance number.
 *   - a crash-safe atomic write leaves a valid file.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('@main/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn(), init: vi.fn() },
}));

import {
  appendTodo,
  countOpenTodos,
  readTodosFile,
  resolveTodosPath,
} from '@main/todo-store';
import { MAX_CAPTURE_TEXT_LENGTH, MAX_CAPTURE_ITEMS, type TodosFile } from '@shared/capture';

describe('todo-store', () => {
  let userDataDir: string;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-store-'));
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  function readRaw(): TodosFile {
    return JSON.parse(fs.readFileSync(resolveTodosPath(userDataDir), 'utf-8')) as TodosFile;
  }

  it('resolves todos.json under userData/dashboard, NOT the workspace git tree', () => {
    const resolved = resolveTodosPath(userDataDir);
    expect(resolved).toBe(path.join(userDataDir, 'dashboard', 'todos.json'));
    // It is under the temp userData dir, which is outside the repo working tree.
    const workspaceRoot = path.resolve(path.join(__dirname, '..', '..'));
    expect(resolved.startsWith(workspaceRoot)).toBe(false);
  });

  it('appends a v2 item with only text set and returns the new count', () => {
    const r = appendTodo(userDataDir, 'call the lab about the crown', 1718900000000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item.text).toBe('call the lab about the crown');
    expect(r.item.createdAt).toBe(1718900000000);
    expect(r.item.horizon).toBeNull();
    expect(r.item.category).toBeNull();
    expect(r.count).toBe(1);

    const onDisk = readRaw();
    expect(onDisk.version).toBe(2);
    expect(onDisk.items).toHaveLength(1);
    expect(onDisk.items[0].text).toBe('call the lab about the crown');
  });

  it('is append-only: a second capture keeps the first', () => {
    appendTodo(userDataDir, 'first');
    const r = appendTodo(userDataDir, 'second');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.count).toBe(2);
    const onDisk = readRaw();
    expect(onDisk.items.map((i) => i.text)).toEqual(['first', 'second']);
  });

  it('REJECTS a non-string capture server-side (never writes)', () => {
    const r = appendTodo(userDataDir, 42 as unknown as string);
    expect(r).toEqual({ ok: false, reason: 'not-string' });
    expect(fs.existsSync(resolveTodosPath(userDataDir))).toBe(false);
  });

  it('REJECTS an over-length capture server-side (never writes)', () => {
    const r = appendTodo(userDataDir, 'a'.repeat(MAX_CAPTURE_TEXT_LENGTH + 1));
    expect(r).toEqual({ ok: false, reason: 'too-long' });
    expect(fs.existsSync(resolveTodosPath(userDataDir))).toBe(false);
  });

  it('REJECTS a control-byte capture server-side (never writes)', () => {
    const r = appendTodo(userDataDir, 'inject\x1b[2J this');
    expect(r).toEqual({ ok: false, reason: 'control-bytes' });
    expect(fs.existsSync(resolveTodosPath(userDataDir))).toBe(false);
  });

  it('REJECTS an empty/whitespace capture server-side (never writes)', () => {
    expect(appendTodo(userDataDir, '   ')).toEqual({ ok: false, reason: 'empty' });
    expect(fs.existsSync(resolveTodosPath(userDataDir))).toBe(false);
  });

  it('REJECTS an append when the store is at the item-count capacity', () => {
    // Seed a file at the cap directly so the test does not append 5000 times.
    const items = Array.from({ length: MAX_CAPTURE_ITEMS }, (_, i) => ({
      id: `todo-seed-${i}`,
      text: `seed ${i}`,
      createdAt: i,
      horizon: null,
      category: null,
      project: null,
      parkedUntil: null,
      doneAt: null,
    }));
    fs.mkdirSync(path.dirname(resolveTodosPath(userDataDir)), { recursive: true });
    fs.writeFileSync(resolveTodosPath(userDataDir), JSON.stringify({ version: 2, items }), 'utf-8');

    const r = appendTodo(userDataDir, 'one too many');
    expect(r).toEqual({ ok: false, reason: 'at-capacity' });
    // The store is unchanged (still at the cap, the new text was not added).
    expect(readRaw().items).toHaveLength(MAX_CAPTURE_ITEMS);
  });

  it('countOpenTodos reflects the open-item count', () => {
    expect(countOpenTodos(userDataDir)).toBe(0);
    appendTodo(userDataDir, 'a');
    appendTodo(userDataDir, 'b');
    expect(countOpenTodos(userDataDir)).toBe(2);
  });

  it('tolerates a corrupt store file (degrades to empty, append still works)', () => {
    fs.mkdirSync(path.dirname(resolveTodosPath(userDataDir)), { recursive: true });
    fs.writeFileSync(resolveTodosPath(userDataDir), 'not json at all', 'utf-8');
    expect(readTodosFile(userDataDir).items).toEqual([]);
    const r = appendTodo(userDataDir, 'recovered');
    expect(r.ok).toBe(true);
    expect(readRaw().items.map((i) => i.text)).toEqual(['recovered']);
  });

  it('leaves a valid file after a write (no .tmp residue on success)', () => {
    appendTodo(userDataDir, 'durable');
    const dir = path.dirname(resolveTodosPath(userDataDir));
    const residue = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    expect(residue).toEqual([]);
  });
});
