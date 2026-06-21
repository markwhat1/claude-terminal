/**
 * M14e: gate instrument for the Home-first bet.
 *
 * Appends one `{date, landedOnHome}` entry to `<userDataDir>/home-opens.json`
 * per launch. The append is the ONLY write operation; reads come from the
 * phase-gate script (`docs/dashboard/PHASE-GATE.md`), not from the running app.
 *
 * Rules (from the spec):
 * - One entry per launch (the caller is responsible for calling once).
 * - File lives under `userDataDir`, never in the workspace git tree.
 * - Read/write errors are silent (best-effort; a missing log degrades the gate
 *   to self-report, which was the pre-M14e state, not a broken app).
 */

import fs from 'node:fs';
import path from 'node:path';
import { log } from './logger';

/**
 * A single launch record. The `date` field is an ISO 8601 string so the
 * gate script can parse it without a dependency on the app's runtime.
 */
export interface HomeOpenEntry {
  date: string;
  landedOnHome: boolean;
}

/**
 * Appends one entry to `<userDataDir>/home-opens.json`.
 *
 * The file is treated as an append-only JSON array:
 *   - If it does not exist, it is created with a single-element array.
 *   - If it exists and is valid JSON, the entry is pushed and the file is
 *     rewritten.
 *   - If the file is corrupt (parse error, not an array), it is replaced with
 *     a single-element array rather than blocking the launch.
 *
 * Called once per process lifetime from the `settings:getStartupView` IPC
 * handler, which the renderer invokes exactly once at startup.
 */
export function appendHomeOpen(userDataDir: string, landedOnHome: boolean): void {
  const filePath = path.join(userDataDir, 'home-opens.json');
  const entry: HomeOpenEntry = {
    date: new Date().toISOString(),
    landedOnHome,
  };

  let entries: HomeOpenEntry[] = [];

  // Load existing entries; tolerate a missing or corrupt file.
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        entries = parsed as HomeOpenEntry[];
      }
      // Non-array content is treated as corrupt: start fresh.
    } catch {
      // Missing or unreadable file: start fresh. Path only in log (no PHI).
      log.warn('[home-opens] could not read %s; starting fresh', filePath);
    }
  }

  entries.push(entry);

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(entries), 'utf-8');
  } catch {
    // A write failure is non-fatal. Path only in log.
    log.warn('[home-opens] could not write %s', filePath);
  }
}
