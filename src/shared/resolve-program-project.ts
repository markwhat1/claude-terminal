/**
 * resolveProgramProject (M10b, PLAN.md 3.1 / 993-995)
 *
 * Resolves the tab-create target for a dashboard hero action.
 *
 * Given a repos[0] slug (a RELATIVE path slug from the program-board state, e.g.
 * 'cad-portal' or 'infrastructure/cad-runner') and the list of currently-open
 * projects, it returns:
 *
 *   { kind: 'openProject', projectId }
 *     -- a project whose dir ends with the slug is already open; use it.
 *
 *   { kind: 'explicitCwd' }
 *     -- no matching project is open; use the tab:create explicitCwd param with
 *        WORKSPACE_ROOT + repos[0] (the caller computes the absolute path).
 *
 *   null
 *     -- repos[0] is empty or falsy; no cwd can be derived; fall back to
 *        Copy-only (the hero shows no action button that would spawn a tab).
 *
 * The function is PURE: no Electron, no DOM, no filesystem access. It resolves
 * only from the open project list the renderer already has in memory.
 *
 * The active project is NOT consulted (PLAN.md 3.1 "wrong-tree assertion"):
 * the hero program's repos[0] must drive the cwd, not whatever project the
 * user last opened. This prevents a canned LLM query running against the
 * wrong, possibly more sensitive, tree.
 *
 * Matching rule: a project matches when its dir ends with the slug, using the
 * platform separator. Both forward-slash and backslash slugs are normalised
 * before comparison so 'infrastructure/cad-runner' resolves on Windows.
 */

import type { ProjectConfig } from './types';

/** Discriminated union returned by resolveProgramProject. */
export type ResolveProgramProjectResult =
  | { kind: 'openProject'; projectId: string }
  | { kind: 'explicitCwd' };

/**
 * Normalises a path fragment so forward-slash and backslash comparisons
 * produce the same result on all platforms.
 */
function normSep(s: string): string {
  return s.replace(/\\/g, '/');
}

/**
 * Returns true when the project dir ends with the given slug.
 *
 * The slug is a relative path fragment ('cad-portal', 'infrastructure/cad-runner').
 * We check both a trailing-separator match and an exact-dir match so we do not
 * accidentally match 'cad-portal-legacy' when looking for 'cad-portal'.
 */
function dirMatchesSlug(dir: string, slug: string): boolean {
  const normDir = normSep(dir);
  const normSlug = normSep(slug);
  // Exact match (slug is the entire dir; rare but valid)
  if (normDir === normSlug) return true;
  // Ends with /slug (requires a separator boundary so partial names don't collide)
  return normDir.endsWith('/' + normSlug);
}

/**
 * Resolves the tab-create target for a hero action from repos[0].
 *
 * See module-level JSDoc for the three return cases.
 */
export function resolveProgramProject(
  repo: string,
  projects: ProjectConfig[],
): ResolveProgramProjectResult | null {
  // Null case: no slug -> Copy-only.
  if (!repo) return null;

  // Scan for a matching open project (active project is NOT given preference).
  const match = projects.find((p) => dirMatchesSlug(p.dir, repo));
  if (match) {
    return { kind: 'openProject', projectId: match.id };
  }

  // No matching project open: use the explicitCwd param with WORKSPACE_ROOT + repo.
  return { kind: 'explicitCwd' };
}
