/**
 * M0c + M19: scrubFreeText -- harm-reduction scrubber for the Phase-3 opt-in
 * free-text query path (PLAN.md lines 854-861, section 3.4).
 *
 * Hard constraints (non-negotiable, per spec):
 *   - PURE: no side effects, no imports of log/electron/DOM.
 *   - This is HARM-REDUCTION, not a primary PHI control. Patient names are not
 *     enumerable by regex and are NOT handled here.
 *   - Ships WITH its only caller (M19's opt-in path). Not a standalone utility.
 *   - NEVER fed to composeClaudeQuery directly.
 *   - NEVER passed as an argument to log.*() calls.
 *   - The free-text opt-in that calls this ships DISABLED, gated behind explicit
 *     per-use confirmation in code (PLAN.md 3.4).
 *
 * What it redacts (positive cases from the spec, PLAN.md line 859):
 *   - US phone numbers: 3-digit NPA + 3-digit NXX + 4-digit subscriber
 *     (303-986-9337, 303.986.9337, 303 986 9337). Word-boundary anchored.
 *   - DOB in MM/DD/YYYY or MM-DD-YYYY format: 1-2 digit month, 1-2 digit day,
 *     4-digit year. The leading-short-field requirement excludes ISO dates
 *     (YYYY-MM-DD) which start with 4 digits.
 *   - Email addresses: user@domain.tld.
 *   - Bearer tokens and credential keyword=value pairs (token=, key=, secret=,
 *     password=, apikey=).
 *
 * What it must NOT redact (negative cases from the spec, PLAN.md line 859):
 *   - A clean repo path with a numeric segment (src/shared/capture.ts:42).
 *   - An ISO date (2026-06-22) -- year-first, 4-digit year at start.
 *   - 127.0.0.1 -- loopback address with short dot-separated octets.
 *   - A :line-line citation (tab-manager.ts:55-58).
 *   - Version strings (v1.2.3), port numbers (:5173), path segments (/api/v2/items/20).
 *
 * The regex set is refined (word boundaries + min-length) to avoid over-redaction.
 * Tests in tests/shared/scrub-free-text.test.ts cover every positive and negative
 * case explicitly (PLAN.md line 859 requirement).
 */

const REDACTED = '[REDACTED]';

// ---------------------------------------------------------------------------
// Pattern: US phone number
//
// NXX-NXX-XXXX where separators are dash, dot, or space.
// Word-boundary anchored on both sides so "303-986-9337" in prose is caught
// but a run of digits already anchored inside a longer token is not.
//
// Does NOT match 127.0.0.1 (octets are 1-3 digits not 3-3-4) or ISO dates
// (year-first 4-digit field would not satisfy the 3-3-4 structure).
// ---------------------------------------------------------------------------
const PHONE_RE = /\b\d{3}[.\-\s]\d{3}[.\-\s]\d{4}\b/g;

// ---------------------------------------------------------------------------
// Pattern: date of birth in M/D/YYYY or MM/DD/YYYY format (US short-date)
//
// Requires 1-2 digit month, separator, 1-2 digit day, separator, 4-digit year.
// The separator group ([-/]) must be the SAME character on both sides so
// "04/12/1985" and "04-12-1985" match but "04/12-1985" does not.
// Using a backreference (\1) for the second separator.
//
// Does NOT match ISO dates (YYYY-MM-DD) because those start with a 4-digit
// year, not 1-2 digits. Does not match 127.0.0.1 (dot separator, 3 octets,
// not a 4-digit final field). Does not match :55-58 citations (no leading
// digit-separator structure with a 4-digit tail).
//
// Word-boundary anchored on both sides.
// ---------------------------------------------------------------------------
const DOB_RE = /\b(\d{1,2})([-/])\d{1,2}\2\d{4}\b/g;

// ---------------------------------------------------------------------------
// Pattern: email address
//
// Matches user@domain.tld (local part + @ + domain with at least one dot).
// Min-length: local part >= 1 char, domain >= 3 chars (a.b).
// Does not match bare @ or partial fragments.
// ---------------------------------------------------------------------------
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;

// ---------------------------------------------------------------------------
// Pattern: Bearer token
//
// Matches "Bearer " followed by a non-whitespace credential value of at
// least 8 characters. Case-insensitive on "Bearer".
// ---------------------------------------------------------------------------
const BEARER_RE = /\bBearer\s+\S{8,}/gi;

// ---------------------------------------------------------------------------
// Pattern: credential keyword = value pairs
//
// token=, key=, secret=, password=, apikey= followed by a non-whitespace
// value of at least 8 characters. The keyword must start at a word boundary
// or after common separators (space, newline, &, ;) so it does not fire on
// "monkey=banana" but does fire on "token=sk-abc123defgh".
//
// Min value length = 8 to avoid redacting short non-credential strings
// like "token=ok" or "key=1".
// ---------------------------------------------------------------------------
const CREDENTIAL_KV_RE =
  /(?:^|[\s&;,])(?:token|secret|password|apikey|api_key|api-key|access_token|refresh_token)=(\S{8,})/gi;

// ---------------------------------------------------------------------------
// scrubFreeText
// ---------------------------------------------------------------------------

/**
 * Applies the harm-reduction scrubber to a free-text string.
 *
 * Replaces every matched sensitive pattern with "[REDACTED]". The function is
 * PURE: same input always produces the same output, no side effects, no I/O.
 *
 * Called ONLY by M19's opt-in free-text path, which ships DISABLED and gated
 * behind explicit per-use confirmation in code (PLAN.md 3.4). This function
 * MUST NOT be called inside composeClaudeQuery or any log.*() argument.
 */
export function scrubFreeText(text: string): string {
  // Apply each pattern in order. Each replaces its match with [REDACTED].
  // BEARER_RE before CREDENTIAL_KV_RE so a "Bearer token=..." string is
  // handled by the most specific rule first.
  let out = text;
  out = out.replace(PHONE_RE, REDACTED);
  out = out.replace(DOB_RE, REDACTED);
  out = out.replace(EMAIL_RE, REDACTED);
  out = out.replace(BEARER_RE, REDACTED);
  // For credential KV pairs, only the value portion is sensitive; replace
  // the whole match but re-insert any leading separator character so the
  // surrounding text is not disrupted.
  out = out.replace(CREDENTIAL_KV_RE, (match, _value, offset) => {
    // The leading separator (if any) is the first character when the match
    // does not start at position 0 and is not a word character.
    const firstChar = match[0];
    const isLeadingSep = /[\s&;,]/.test(firstChar);
    return isLeadingSep ? firstChar + REDACTED : REDACTED;
  });
  return out;
}
