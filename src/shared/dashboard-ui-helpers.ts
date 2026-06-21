/**
 * Pure shared helpers for the dashboard render seam.
 *
 * No Electron, no DOM. Importable by src/renderer, src/main, and
 * src/web-client (the @shared alias covers all three environments).
 *
 * M7 contents:
 *   - generateId(prefix)
 *   - formatRelative(anchor, now, mode)
 *   - ageColorClass(color)
 *   - consolidateAttention(colors)
 *   - resolvePreferredPowershell(shellExists)
 */

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------

/**
 * Generates a prefix-labeled, collision-resistant id string.
 *
 * Extracted from the two unexported duplicates in:
 *   - src/main/tab-manager.ts (inline, prefix "tab")
 *   - src/renderer/components/HookManagerDialog.tsx (no prefix)
 *
 * Both call sites now import this function so there is no third copy.
 *
 * The id format is: `<prefix>-<timestamp-base36>-<random-6-chars>`.
 * An empty prefix produces `-<timestamp>-<random>` (still unique).
 */
export function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return prefix ? `${prefix}-${ts}-${rand}` : `${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// formatRelative
// ---------------------------------------------------------------------------

/** The calling context for formatRelative. */
export type FormatRelativeMode =
  /** Working count-up from statusSince. Shows elapsed time. */
  | 'working'
  /** Waiting duration from waitingSince in the subordinate strip. No cap. */
  | 'waiting'
  /**
   * Promoted waiting string. Caps to a non-numeric band past ~30 minutes
   * so an unbounded climbing count does not attach an accusation to the
   * most accountability-loaded string in the UI (6.4).
   */
  | 'waiting-promoted';

/**
 * Stable placeholder returned when the anchor is null.
 *
 * Null anchors occur on restored tabs before the first status event lands.
 * Returning NaN, Infinity, or a ~56-year count from `Date.now() - null`
 * would break the attention spine (2.2 / 5.2). This placeholder is short,
 * displayable, and clearly not a real elapsed time.
 */
const NULL_ANCHOR_PLACEHOLDER = '--';

/** Threshold in ms beyond which a promoted waiting string buckets to a
 *  non-numeric band (6.4). ~30 minutes. */
const PROMOTED_WAITING_THRESHOLD_MS = 30 * 60 * 1000;

/** Calm non-numeric band copy for a promoted waiting duration past the threshold. */
const PROMOTED_WAITING_BAND = 'waiting a while';

/**
 * Formats a time anchor (epoch ms or null) as a human-readable relative
 * string at minute resolution.
 *
 * Modes:
 *   'working'          -> count-up elapsed since statusSince ("12m", "40s", "3 d")
 *   'waiting'          -> human-waiting duration since waitingSince ("6m")
 *   'waiting-promoted' -> same, but caps to a calm band past ~30m
 *
 * Returns NULL_ANCHOR_PLACEHOLDER when anchor is null (never NaN/Infinity).
 */
export function formatRelative(
  anchor: number | null,
  now: number,
  mode: FormatRelativeMode,
): string {
  if (anchor === null) {
    return NULL_ANCHOR_PLACEHOLDER;
  }

  const deltaMs = now - anchor;

  // Guard against a future anchor producing a negative delta.
  if (deltaMs < 0) {
    return NULL_ANCHOR_PLACEHOLDER;
  }

  const deltaSec = Math.floor(deltaMs / 1000);
  const deltaMin = Math.floor(deltaMs / (60 * 1000));
  const deltaDay = Math.floor(deltaMs / (24 * 60 * 60 * 1000));

  if (mode === 'waiting-promoted') {
    if (deltaMs >= PROMOTED_WAITING_THRESHOLD_MS) {
      return PROMOTED_WAITING_BAND;
    }
    // Below the threshold: fall through to the normal minute-coarsened format.
  }

  if (deltaDay >= 1) {
    return `${deltaDay} d`;
  }
  if (deltaMin >= 1) {
    return `${deltaMin}m`;
  }
  return `${deltaSec}s`;
}

// ---------------------------------------------------------------------------
// ageColorClass
// ---------------------------------------------------------------------------

/**
 * Verbatim producer age-color values (src/program_board/status.py:22-29).
 * Bands (off-by-one noted in 4.3):
 *   green  age_days < 3   (0, 1, 2)
 *   yellow 3 <= age_days < 7  (3-6)   -- day 3 is yellow
 *   orange 7 <= age_days < 14 (7-13)  -- day 7 is orange
 *   red    age_days >= 14     (14+)   -- day 14 is red
 */
export type AgeColor = 'green' | 'yellow' | 'orange' | 'red';

/**
 * Maps a verbatim producer age-color to the corresponding Tailwind token
 * class prefix so callers can compose `text-<cls>` or `border-<cls>`.
 *
 * orange -> "age-orange"  (the M7b muted token; NEVER "attention")
 * green  -> "success"
 * yellow -> "warning"
 * red    -> "destructive"
 *
 * The return value is the bare token name (not the full class), so callers
 * can prepend the desired variant: e.g. `text-${ageColorClass(color)}`.
 */
export function ageColorClass(color: AgeColor): string {
  switch (color) {
    case 'green':
      return 'success';
    case 'yellow':
      return 'warning';
    case 'orange':
      return 'age-orange';
    case 'red':
      return 'destructive';
  }
}

// ---------------------------------------------------------------------------
// consolidateAttention
// ---------------------------------------------------------------------------

/**
 * Collapses an array of age-color values to the single highest-ranking one.
 *
 * Ranking (highest first): red > orange > yellow > green.
 *
 * Used by the Home nav badge to show one aggregate attention signal rather
 * than badge soup (6.4). Returns null for an empty input.
 */
export function consolidateAttention(colors: AgeColor[]): AgeColor | null {
  if (colors.length === 0) return null;

  const rank: Record<AgeColor, number> = {
    red: 3,
    orange: 2,
    yellow: 1,
    green: 0,
  };

  let best: AgeColor = 'green';
  for (const color of colors) {
    if (rank[color] > rank[best]) {
      best = color;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// resolvePreferredPowershell
// ---------------------------------------------------------------------------

/**
 * Returns the preferred PowerShell shell id for the Open-PowerShell action
 * (2.5, M8a Phase-0 hero action).
 *
 * Prefers 'pwsh' (PowerShell 7) when pwsh.exe is present on this machine;
 * falls back to 'powershell' (5.1). The caller supplies the existence result
 * so this function is unit-testable without the filesystem.
 *
 * Verified live: pwsh.exe is at C:\Program Files\PowerShell\7\pwsh.exe.
 */
export function resolvePreferredPowershell(
  shellExists: boolean,
): 'pwsh' | 'powershell' {
  return shellExists ? 'pwsh' : 'powershell';
}
