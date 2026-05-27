/**
 * Event-type pattern matching.
 *
 * Patterns are dotted strings with `*` segment wildcards:
 *
 *   "warehouse.stock.*"    matches "warehouse.stock.received" but not
 *                          "warehouse.stock.received.cancelled"
 *   "warehouse.*.received" matches "warehouse.stock.received" but not
 *                          "warehouse.stock.batch.received"
 *   "warehouse.**"         matches every event under "warehouse" recursively
 *
 * A `*` matches exactly one segment. A `**` matches one or more trailing
 * segments. We intentionally do not support intra-segment wildcards (e.g.
 * `stock.r*`) — module authors who need that have a naming problem.
 */

export const matches = (pattern: string, type: string): boolean => {
  const pSeg = pattern.split('.');
  const tSeg = type.split('.');
  return matchSegments(pSeg, 0, tSeg, 0);
};

const matchSegments = (
  p: readonly string[],
  pi: number,
  t: readonly string[],
  ti: number
): boolean => {
  while (pi < p.length && ti < t.length) {
    const pp = p[pi];
    if (pp === undefined) return false;
    if (pp === '**') {
      // `**` must consume at least one segment and may consume any number.
      // Try every split point.
      if (pi !== p.length - 1) {
        // `**` is only meaningful as the trailing segment.
        return false;
      }
      return t.length - ti >= 1;
    }
    if (pp !== '*' && pp !== t[ti]) return false;
    pi += 1;
    ti += 1;
  }
  return pi === p.length && ti === t.length;
};
