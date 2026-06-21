/**
 * HomeView: minimal placeholder component for the dashboard Home surface.
 *
 * This component is replaced with the real implementation in M8a.
 * It exists now to satisfy the render seam (M3a-ii): the data-terminal-area
 * container renders <HomeView/> as a sibling AFTER tabs.map, never inside it.
 *
 * The component carries a data-testid so the smoke test can assert exactly
 * one instance is mounted when Home is active and zero Terminal instances
 * are visible.
 */

export default function HomeView() {
  return (
    <div
      className="flex-1 flex items-center justify-center text-muted-foreground text-sm"
      data-testid="home-view"
    >
      Dashboard coming soon.
    </div>
  );
}
