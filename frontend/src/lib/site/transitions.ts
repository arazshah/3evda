import type { CSSProperties } from "react";

/**
 * A `view-transition-name` for the cross-document view transition (see globals.css): the tile of a project and the
 * hero of its page share a name, so the browser morphs one into the other. Browsers without support ignore it.
 */
export function vtName(name: string): CSSProperties {
  // Names must be valid identifiers: slugs may hold anything the owner typed, so keep only safe characters.
  return { viewTransitionName: name.replace(/[^a-zA-Z0-9_-]/g, "_") };
}
