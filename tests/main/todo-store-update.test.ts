/**
 * M15: tests for the updateTodo mutation in the MAIN-owned capture store.
 *
 * Covers:
 *   - updateTodo patches horizon on an existing item and persists the result.
 *   - updateTodo with parkedUntil persists the timestamp.
 *   - updateTodo with doneAt marks the item done.
 *   - updateTodo on a missing id returns ok:false with reason 'not-found'.
 *   - updateTodo rejects a non-string id (server-side validation).
 *   - partial updates leave other fields unchanged.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('@main/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn(), init: vi.fn() },
}));

import { appendTodo, updateTodo, readTodosFile, resolveTodosPath } from '@main/todo-store';
import type { TodosFile } from '@shared/capture';

describe('todo-store: updateTodo (M15)', () => {
  let userDataDir: string;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-store-update-'));
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  function readRaw(): TodosFile {
    return JSON.parse(
      fs.readFileSync(resolveTodosPath(userDataDir), 'utf-8'),
    ) as TodosFile;
  }

  it('assigns horizon:now to an existing item and persists it', () => {
    const appendResult = appendTodo(userDataDir, 'call the lab', 1718900000000);
    expect(appendResult.ok).toBe(true);
    if (!appendResult.ok) return;
    const id = appendResult.item.id;

    const r = updateTodo(userDataDir, id, { horizon: 'now' });
    expect(r.ok).toBe(true);

    const onDisk = readRaw();
    const item = onDisk.items.find((i) => i.id === id);
    expect(item).toBeDefined();
    expect(item!.horizon).toBe('now');
    // Other fields must be unchanged.
    expect(item!.text).toBe('call the lab');
    expect(item!.createdAt).toBe(1718900000000);
    expect(item!.doneAt).toBeNull();
  });

  it('assigns parkedUntil and persists it', () => {
    const appendResult = appendTodo(userDataDir, 'park this one', 1718900000000);
    expect(appendResult.ok).toBe(true);
    if (!appendResult.ok) return;
    const id = appendResult.item.id;

    const parkTime = 1718900000000 + 7 * 24 * 60 * 60 * 1000; // 1 week later
    const r = updateTodo(userDataDir, id, { parkedUntil: parkTime });
    expect(r.ok).toBe(true);

    const onDisk = readRaw();
    const item = onDisk.items.find((i) => i.id === id);
    expect(item!.parkedUntil).toBe(parkTime);
    expect(item!.horizon).toBeNull(); // not changed
  });

  it('sets doneAt and marks the item done', () => {
    const appendResult = appendTodo(userDataDir, 'finish this', 1718900000000);
    expect(appendResult.ok).toBe(true);
    if (!appendResult.ok) return;
    const id = appendResult.item.id;

    const doneTime = 1718900005000;
    const r = updateTodo(userDataDir, id, { doneAt: doneTime });
    expect(r.ok).toBe(true);

    const onDisk = readRaw();
    const item = onDisk.items.find((i) => i.id === id);
    expect(item!.doneAt).toBe(doneTime);
  });

  it('partial update does not touch fields not included in the patch', () => {
    const appendResult = appendTodo(userDataDir, 'partial patch test', 1718900000000);
    expect(appendResult.ok).toBe(true);
    if (!appendResult.ok) return;
    const id = appendResult.item.id;

    // First set horizon and category together.
    updateTodo(userDataDir, id, { horizon: 'next', category: 'financial' });

    // Now update only the horizon; category must survive.
    const r = updateTodo(userDataDir, id, { horizon: 'now' });
    expect(r.ok).toBe(true);

    const onDisk = readRaw();
    const item = onDisk.items.find((i) => i.id === id);
    expect(item!.horizon).toBe('now');
    expect(item!.category).toBe('financial');
  });

  it('returns ok:false with reason "not-found" for an unknown id', () => {
    // Ensure the file exists so the store is initialized.
    appendTodo(userDataDir, 'seed', 1718900000000);

    const r = updateTodo(userDataDir, 'todo-does-not-exist', { horizon: 'now' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('not-found');
  });

  it('rejects a non-string id', () => {
    appendTodo(userDataDir, 'seed', 1718900000000);

    const r = updateTodo(userDataDir, 42 as unknown as string, { horizon: 'now' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('invalid-id');
  });

  it('multiple items: only the targeted item changes', () => {
    const r1 = appendTodo(userDataDir, 'item one', 1718900000001);
    const r2 = appendTodo(userDataDir, 'item two', 1718900000002);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    updateTodo(userDataDir, r1.item.id, { horizon: 'now' });

    const onDisk = readRaw();
    const one = onDisk.items.find((i) => i.id === r1.item.id);
    const two = onDisk.items.find((i) => i.id === r2.item.id);
    expect(one!.horizon).toBe('now');
    expect(two!.horizon).toBeNull(); // untouched
  });
});
