/**
 * M14b: startup-view helpers.
 *
 * A single pure helper for resolving which tab to land on at startup. Keeping
 * it in shared/ means both App.tsx and future renderer tests can import it
 * without pulling in any main-process or DOM dependencies.
 */

/**
 * Resolves the active tab id to use at startup.
 *
 * When startupView is 'home', ALWAYS returns homeId regardless of the
 * activeId supplied by main. This is the choke-point that prevents the three
 * setActiveTabId sites in App.tsx from drifting independently.
 *
 * When startupView is 'lastSession', passes activeId through unchanged.
 */
export function resolveStartupActiveId(
  startupView: 'lastSession' | 'home',
  homeId: string,
  activeId: string | null,
): string | null {
  if (startupView === 'home') {
    return homeId;
  }
  return activeId;
}
