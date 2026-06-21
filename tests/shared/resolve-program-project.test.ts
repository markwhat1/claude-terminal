/**
 * Tests for resolveProgramProject (M10b).
 *
 * Spec (PLAN.md:993-995):
 *   - Returns a matching open project id when a project at that dir is already open.
 *   - Routes through the explicitCwd path (returns 'explicitCwd' signal) when the
 *     repo is non-empty but no matching project is open.
 *   - Returns null when the repo slug is empty or falsy (no open project, no
 *     explicitCwd fallback possible) -> Copy-only.
 *   - A multi-repo fixture (two programs sharing 'practice-analytics') selects
 *     the hero's own repos[0] deterministically.
 *   - The action targets repos[0] cwd, NOT the active project (the wrong-tree
 *     assertion).
 */
import { describe, it, expect } from 'vitest';
import { resolveProgramProject, type ResolveProgramProjectResult } from '@shared/resolve-program-project';
import type { ProjectConfig } from '@shared/types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeProject(id: string, dir: string): ProjectConfig {
  return { id, dir, colorIndex: 0 };
}

// ---------------------------------------------------------------------------
// matching open project
// ---------------------------------------------------------------------------

describe('resolveProgramProject - matching open project', () => {
  it('returns the project id when the repos[0] slug matches a project dir basename', () => {
    const projects: ProjectConfig[] = [
      makeProject('proj-portal', 'C:\\Users\\Mark\\Claude-Code\\cad-portal'),
      makeProject('proj-analytics', 'C:\\Users\\Mark\\Claude-Code\\practice-analytics'),
    ];

    const result = resolveProgramProject('cad-portal', projects);
    expect(result).toEqual<ResolveProgramProjectResult>({ kind: 'openProject', projectId: 'proj-portal' });
  });

  it('returns the project id for a nested slug with path separator', () => {
    const projects: ProjectConfig[] = [
      makeProject('proj-runner', 'C:\\Users\\Mark\\Claude-Code\\infrastructure\\cad-runner'),
    ];

    const result = resolveProgramProject('infrastructure/cad-runner', projects);
    expect(result).toEqual<ResolveProgramProjectResult>({ kind: 'openProject', projectId: 'proj-runner' });
  });

  it('handles POSIX forward-slash separators in project dirs', () => {
    const projects: ProjectConfig[] = [
      makeProject('proj-portal', '/home/mark/claude-code/cad-portal'),
    ];

    const result = resolveProgramProject('cad-portal', projects);
    expect(result).toEqual<ResolveProgramProjectResult>({ kind: 'openProject', projectId: 'proj-portal' });
  });
});

// ---------------------------------------------------------------------------
// explicitCwd route (repo non-empty, no matching project)
// ---------------------------------------------------------------------------

describe('resolveProgramProject - explicitCwd route', () => {
  it('returns explicitCwd when the repo is non-empty but no project matches', () => {
    const projects: ProjectConfig[] = [
      makeProject('proj-portal', 'C:\\Users\\Mark\\Claude-Code\\cad-portal'),
    ];

    const result = resolveProgramProject('open-dental', projects);
    expect(result).toEqual<ResolveProgramProjectResult>({ kind: 'explicitCwd' });
  });

  it('returns explicitCwd when the projects list is empty', () => {
    const result = resolveProgramProject('cad-portal', []);
    expect(result).toEqual<ResolveProgramProjectResult>({ kind: 'explicitCwd' });
  });
});

// ---------------------------------------------------------------------------
// null -> Copy-only
// ---------------------------------------------------------------------------

describe('resolveProgramProject - null (Copy-only)', () => {
  it('returns null when repos[0] is an empty string', () => {
    const projects: ProjectConfig[] = [
      makeProject('proj-portal', 'C:\\Users\\Mark\\Claude-Code\\cad-portal'),
    ];

    const result = resolveProgramProject('', projects);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// multi-repo fixture: two programs sharing practice-analytics
// ---------------------------------------------------------------------------

describe('resolveProgramProject - multi-repo determinism', () => {
  /**
   * practice-reports and marketing-roi BOTH have repos=['practice-analytics'].
   * The hero is practice-reports. Its repos[0] is 'practice-analytics'.
   * resolveProgramProject must return the same result regardless of which
   * program owns the hero: it resolves repos[0] deterministically, not the
   * hero program itself.
   *
   * PLAN.md 3.1: "The target-resolution helper picks deterministically (the
   * hero's own repos[0]), and a multi-repo fixture test asserts deterministic
   * selection."
   */
  it('deterministically resolves practice-analytics regardless of which program is hero', () => {
    const projects: ProjectConfig[] = [
      makeProject('proj-analytics', 'C:\\Users\\Mark\\Claude-Code\\practice-analytics'),
      makeProject('proj-portal', 'C:\\Users\\Mark\\Claude-Code\\cad-portal'),
    ];

    // practice-reports hero
    const resultForPracticeReports = resolveProgramProject('practice-analytics', projects);
    // marketing-roi hero (same repos[0], both should resolve the same)
    const resultForMarketingRoi = resolveProgramProject('practice-analytics', projects);

    expect(resultForPracticeReports).toEqual<ResolveProgramProjectResult>({
      kind: 'openProject',
      projectId: 'proj-analytics',
    });
    expect(resultForMarketingRoi).toEqual<ResolveProgramProjectResult>({
      kind: 'openProject',
      projectId: 'proj-analytics',
    });
    // Both heroes sharing repos[0] pick the same project: deterministic.
    expect(resultForPracticeReports).toEqual(resultForMarketingRoi);
  });

  it('does NOT return the active project when it does not match repos[0]', () => {
    // The "wrong-tree assertion": the active project is cad-portal, but repos[0]
    // is 'practice-analytics'. resolveProgramProject ignores which project is
    // "active" and resolves only from repos[0].
    const projects: ProjectConfig[] = [
      makeProject('proj-analytics', 'C:\\Users\\Mark\\Claude-Code\\practice-analytics'),
      makeProject('proj-portal', 'C:\\Users\\Mark\\Claude-Code\\cad-portal'), // active
    ];
    const activeProjectId = 'proj-portal'; // the "wrong" active project

    const result = resolveProgramProject('practice-analytics', projects);

    // Must NOT return the active project
    expect(result).not.toEqual({ kind: 'openProject', projectId: activeProjectId });
    // Must return the correct repo project
    expect(result).toEqual<ResolveProgramProjectResult>({
      kind: 'openProject',
      projectId: 'proj-analytics',
    });
  });
});
