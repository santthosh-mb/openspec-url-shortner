// Keep this list in sync with any new top-level routes added under app/.
// A reserved slug can never be issued by the shortener and is short-circuited
// to 404 by the [slug] redirect handler.
export const RESERVED_SLUGS = ["api", "dashboard", "admin", "_next"] as const;

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug);
}
