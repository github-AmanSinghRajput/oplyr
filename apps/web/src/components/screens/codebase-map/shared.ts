// Small shared helpers/constants for both codebase-map views (Tree = ELK, Force = d3), so the
// edge-routing logic and styling live in one place.

export const EDGE_HOT = '#68dbff';
export const EDGE_IDLE = 'color-mix(in srgb, var(--color-border, #3a4150), transparent 5%)';

/**
 * The visible node that stands in for a file given which folders are currently *hidden* (i.e. not
 * showing their children): the file itself if every ancestor folder is open, otherwise the topmost
 * hidden ancestor folder. `isHidden` lets each view pass its own state — the Tree view tracks
 * `collapsed` folders, the Force view tracks `expanded` folders (so it passes `id => !expanded.has(id)`).
 */
export function representativeOf(fileId: string, isHidden: (folderId: string) => boolean): string {
  const segments = fileId.split('/');
  let prefix = '';
  for (let i = 0; i < segments.length - 1; i += 1) {
    prefix = prefix ? `${prefix}/${segments[i]}` : segments[i];
    if (isHidden(prefix)) return prefix;
  }
  return fileId;
}
