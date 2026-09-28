/**
 * Pagination (P2). Defaults are generous (200, cap 500) so existing clients
 * that fetch whole lists keep working; large consumers pass ?limit=&offset=.
 */
export const DEFAULT_LIMIT = 200;
export const MAX_LIMIT = 500;

export function getPage(query: any): { limit: number; offset: number } {
  const rawLimit = Number(query?.limit);
  const rawOffset = Number(query?.offset);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

/** Appends LIMIT/OFFSET placeholders; returns updated vals + clause. */
export function pageClause(vals: any[], limit: number, offset: number): string {
  vals.push(limit, offset);
  return `LIMIT $${vals.length - 1} OFFSET $${vals.length}`;
}
