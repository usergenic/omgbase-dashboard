/**
 * View-transition hooks for feed items. The live-feed script swaps panel HTML
 * inside `document.startViewTransition`, and the browser animates any element
 * whose `view-transition-name` exists on both sides (a move) or on one side
 * only (an insert / removal). Names must be unique per page and valid CSS
 * identifiers, so each panel prefixes its own and keys are sanitized.
 */
export function vtName(prefix: string, key: string): string {
  return `${prefix}-${key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** Inline style for a feed item: a unique name plus the shared `feed-item` class. */
export function vtStyle(prefix: string, key: string): string {
  return `view-transition-name: ${vtName(prefix, key)}; view-transition-class: feed-item;`;
}
