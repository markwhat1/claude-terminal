/**
 * IPC channel for the program-board state broadcast (main -> renderer).
 *
 * Renderer-only: this channel is never forwarded to remote WebSocket clients.
 * Both the main-process send and the preload on() must reference this constant
 * so a rename cannot silently break the subscription.
 */
export const PROGRAM_BOARD_STATE_CHANNEL = 'program-board:state';

/**
 * Pure helpers for consuming program-board state.json.
 *
 * All functions here are Electron-free and DOM-free so they work in both
 * the main process and any test environment.
 *
 * Key design choices (per PLAN.md section 4.3 and 2.8):
 *   - generated_at is a naive-local ISO string (no Z, no offset).
 *     Parse it with parseNaiveLocal, never as UTC.
 *   - last_commit.iso and last_touched carry an offset (e.g. -06:00).
 *     Parse them with parseOffsetAware.
 *   - Freshness bands: fresh <150s, stale 150s-10min, hard-stale >=10min.
 *   - dodAlmost uses the producer's exact predicate: total>0 && total-met===1.
 *   - paused cards are excluded from the hero-override candidate set and the
 *     default needs-you list.
 *   - isStateJsonPathSafe guards the path before any file read.
 *   - isSafeProgramIdentifier guards slug/name before they reach composeClaudeQuery.
 */

import path from 'path';

// ---------------------------------------------------------------------------
// Schema types (mirrors the program-board producer output)
// ---------------------------------------------------------------------------

export interface ProgramCard {
  slug: string;
  name: string;
  repos: string[];
  sources: string[];
  tags: string[];
  time_sensitive: string | null;
  blocked_on: string;
  paused: boolean;
  git: {
    last_commit: {
      sha: string;
      iso: string;
      msg: string;
      repo: string;
    } | null;
    age_days: number;
    uncommitted: boolean;
    unmerged_branch: string | null;
  };
  dod: {
    met: number;
    total: number;
    gaps: string[];
  };
  last_touched: string | null;
  lane: string;
  age_color: string;
  needs_you: boolean;
  needs_you_reasons: string[];
  issues?: unknown[];
}

export interface ProgramBoardState {
  generated_at: string | null;
  programs: ProgramCard[];
  suggested: unknown[];
}

/** The not-running sentinel returned when the board is down or the path is unsafe. */
export const NOT_RUNNING_STATE: ProgramBoardState = {
  generated_at: null,
  programs: [],
  suggested: [],
};

// ---------------------------------------------------------------------------
// DashboardItem (unified item shape, 4.1)
// ---------------------------------------------------------------------------

export interface DashboardItem {
  /** source-prefixed stable React key ("pb:cad-staff-portal") */
  id: string;
  slug: string;
  source: 'program-board' | 'live-tab' | 'todo';
  kind: 'todo' | 'in_progress' | 'problem' | 'blocker';
  title: string;
  /** blocked_on text. NEVER fed to composeClaudeQuery. NEVER logged. */
  detail: string;
  project: string | null;
  badges: string[];
  /** verbatim from card.age_color, never re-derived */
  ageColor: 'green' | 'yellow' | 'orange' | 'red';
  recencyIso: string | null;
  gitAgeDays: number | null;
  url: string | null;
  needsYou: boolean;
  needsYouReasons: string[];
  paused: boolean;
  timeSensitive: string | null;
  dodMet: number;
  dodTotal: number;
  /** Producer predicate: total>0 && total-met===1 */
  dodAlmost: boolean;
  dodGap: string | null;
  requiresResponse: boolean;
  idleNeedsYou: boolean;
  justResolved: boolean;
  horizon: 'now' | 'next' | 'later' | null;
  avoidanceCategory: string | null;
  actions: {
    copy?: { text: string };
    powershell?: { cwd: string };
    claudeQuery?: { action: string; programSlug: string; programName: string; kind: string; repo: string };
    focusTab?: { tabId: string };
  };
}

// ---------------------------------------------------------------------------
// parseState
// ---------------------------------------------------------------------------

/**
 * Parses raw JSON text into a ProgramBoardState.
 *
 * Returns null on any parse error so the caller can fall back to last-good.
 * Validates the minimum required schema shape.
 */
export function parseState(raw: string): ProgramBoardState | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj !== 'object' || obj === null) return null;
    if (!Array.isArray(obj.programs)) return null;
    if (!Array.isArray(obj.suggested)) return null;
    if (obj.generated_at !== null && typeof obj.generated_at !== 'string') return null;

    const programs = obj.programs as ProgramCard[];
    return {
      generated_at: (obj.generated_at as string | null) ?? null,
      programs,
      suggested: obj.suggested as unknown[],
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Two named timezone parsers (PLAN.md 2.8)
// ---------------------------------------------------------------------------

/**
 * Parses a naive-local ISO string (no Z, no offset) as LOCAL time.
 *
 * The program-board poller emits generated_at as `datetime.now().isoformat()`,
 * which produces a string like "2026-06-21T01:00:00" with no offset.
 * The JS `new Date('2026-06-21T01:00:00')` spec is engine-dependent
 * (some engines treat bare ISO as UTC, others as local).
 * This function always parses as local by splitting the components.
 *
 * Returns null if the string looks like it has an offset or Z suffix.
 */
export function parseNaiveLocal(s: string): Date | null {
  if (!s) return null;
  // Reject strings that carry an explicit offset (Z, +HH:MM, -HH:MM)
  if (/Z$/i.test(s)) return null;
  if (/[+-]\d{2}:\d{2}$/.test(s)) return null;

  // Expect "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DD"
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?$/,
  );
  if (!m) return null;

  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1; // 0-indexed
  const day = parseInt(m[3], 10);
  const hour = m[4] !== undefined ? parseInt(m[4], 10) : 0;
  const minute = m[5] !== undefined ? parseInt(m[5], 10) : 0;
  const second = m[6] !== undefined ? parseInt(m[6], 10) : 0;

  return new Date(year, month, day, hour, minute, second);
}

/**
 * Parses an offset-bearing ISO string (e.g. "2026-06-21T08:00:00-06:00").
 *
 * Returns null if the string does not have an explicit offset or Z suffix.
 */
export function parseOffsetAware(s: string): Date | null {
  if (!s) return null;
  // Must have Z or ±HH:MM
  if (!/Z$/i.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

// ---------------------------------------------------------------------------
// computeFreshness
// ---------------------------------------------------------------------------

export type Freshness = 'fresh' | 'stale' | 'hard-stale';

const FRESH_THRESHOLD_MS = 150_000;   // ~2.5 minutes
const HARD_STALE_THRESHOLD_MS = 600_000; // 10 minutes

/**
 * Computes the freshness band for a generated_at value.
 *
 * generated_at is a naive-local ISO string or null. Uses parseNaiveLocal
 * to avoid the UTC-shift trap (a naive string parsed as UTC on a UTC-6
 * machine would appear 6 hours older than it is).
 *
 * Bands:
 *   fresh:      age < ~150s
 *   stale:      ~150s <= age < ~10min
 *   hard-stale: age >= ~10min, or generated_at is null
 */
export function computeFreshness(
  generated_at: string | null,
  now: Date,
): Freshness {
  if (generated_at === null) return 'hard-stale';
  const parsed = parseNaiveLocal(generated_at);
  if (!parsed) return 'hard-stale';
  const ageMs = now.getTime() - parsed.getTime();
  if (ageMs < FRESH_THRESHOLD_MS) return 'fresh';
  if (ageMs < HARD_STALE_THRESHOLD_MS) return 'stale';
  return 'hard-stale';
}

// ---------------------------------------------------------------------------
// isStateJsonPathSafe (3.6)
// ---------------------------------------------------------------------------

/**
 * Validates that the resolved state.json path is safe to read.
 *
 * Rejects:
 *   - empty paths
 *   - UNC paths (\\server\share or //server/share)
 *   - paths containing ".." components (after normalization)
 *   - paths outside the expected workspace root
 *
 * The root parameter should be the resolved workspace root
 * (e.g. "C:\\Users\\Mark\\Claude-Code").
 */
export function isStateJsonPathSafe(resolved: string, root: string): boolean {
  if (!resolved) return false;

  // Reject UNC paths (Windows \\... or POSIX //...)
  if (resolved.startsWith('\\\\') || resolved.startsWith('//')) return false;

  // Normalize to remove any ".." components.
  const normalized = path.resolve(resolved);

  // Reject if ".." appears in the RAW resolved string (belt and suspenders
  // before normalization changes the shape).
  if (resolved.includes('..')) return false;

  // The normalized path must start with the normalized root.
  const normalizedRoot = path.resolve(root);
  if (!normalized.startsWith(normalizedRoot + path.sep) && normalized !== normalizedRoot) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// isSafeProgramIdentifier (3.6, section 3.4)
// ---------------------------------------------------------------------------

// A long digit run pattern that catches phone numbers, DOBs, and similar PHI.
// Matches 7 or more consecutive digit/separator characters containing at least
// 7 digits total, on their own (not a version string like v1.2.3).
// We check for sequences of 7+ digits possibly separated by - / . (space).
const PHI_DIGIT_PATTERN = /\b\d[\d\s.\-/]{5,}\d\b/;

/**
 * Returns true if the slug/name is a safe dev-style identifier.
 *
 * Rejects:
 *   - strings longer than 200 characters
 *   - strings matching a PHI digit pattern (phone numbers, DOBs, etc.)
 */
export function isSafeProgramIdentifier(s: string): boolean {
  if (!s) return false;
  if (s.length > 200) return false;
  if (PHI_DIGIT_PATTERN.test(s)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// mapCardToItem (DashboardItem mapper, 4.1)
// ---------------------------------------------------------------------------

type AgeColor = 'green' | 'yellow' | 'orange' | 'red';

const VALID_AGE_COLORS = new Set<string>(['green', 'yellow', 'orange', 'red']);

function safeAgeColor(s: string): AgeColor {
  if (VALID_AGE_COLORS.has(s)) return s as AgeColor;
  return 'green';
}

function cardKind(card: ProgramCard): DashboardItem['kind'] {
  if (card.lane === 'blocked') return 'blocker';
  if (card.lane === 'active') return 'in_progress';
  return 'todo';
}

/**
 * Maps a ProgramCard into a DashboardItem.
 *
 * Consumes producer fields verbatim per 4.1 and 4.4:
 *   - age_color verbatim (never re-derived)
 *   - dodAlmost: total>0 && total-met===1 (producer's exact predicate)
 *   - dodGap: dod.gaps[0]
 *   - paused: card.paused verbatim
 *   - detail: blocked_on verbatim (NEVER logged, NEVER fed to composeClaudeQuery)
 */
export function mapCardToItem(card: ProgramCard): DashboardItem {
  const dodAlmost =
    card.dod.total > 0 && card.dod.total - card.dod.met === 1;
  const dodGap = card.dod.gaps.length > 0 ? card.dod.gaps[0] : null;

  return {
    id: `pb:${card.slug}`,
    slug: card.slug,
    source: 'program-board',
    kind: cardKind(card),
    title: card.name,
    detail: card.blocked_on,
    project: card.repos.length > 0 ? card.repos[0] : null,
    badges: [...card.tags],
    ageColor: safeAgeColor(card.age_color),
    recencyIso: card.git?.last_commit?.iso ?? null,
    gitAgeDays: card.git?.age_days ?? null,
    url: null,
    needsYou: card.needs_you,
    needsYouReasons: [...card.needs_you_reasons],
    paused: card.paused,
    timeSensitive: card.time_sensitive,
    dodMet: card.dod.met,
    dodTotal: card.dod.total,
    dodAlmost,
    dodGap,
    requiresResponse: false,
    idleNeedsYou: false,
    justResolved: false,
    horizon: null,
    avoidanceCategory: null,
    actions: {},
  };
}
