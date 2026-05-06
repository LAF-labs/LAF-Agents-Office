/**
 * Format an agent slug for display.
 *
 * Short role abbreviations (api, ux — up to 3 chars)
 * render UPPERCASE: matches how the LAF-Office app treats short agent identifiers.
 *
 * Longer slugs (architect, builder, reviewer, eng-1) render Title Case:
 * "Operator", "Planner", "Eng-1".
 *
 * Example:
 *   formatAgentName('architect') -> 'Architect'
 *   formatAgentName('builder')   -> 'Builder'
 *   formatAgentName('eng-1')    -> 'Eng-1'
 */
export function formatAgentName(slug: string): string {
  if (!slug) return "";
  if (slug.length <= 3) return slug.toUpperCase();
  return slug
    .split("-")
    .map((part) =>
      part.length === 0
        ? part
        : part[0].toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join("-");
}
