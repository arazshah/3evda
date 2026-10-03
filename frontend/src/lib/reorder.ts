/** The list after moving the entry at `index` one step up (-1) or down (+1); unchanged at the ends. */
export function moveId<T>(ids: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
