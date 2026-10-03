/** The list after moving the entry at `index` one step up (-1) or down (+1); unchanged at the ends. */
export function moveId<T>(ids: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/**
 * The complete order after reordering one group: `all` is every id in display order, `groupOrder`
 * the new order of the ids that belong to the group. The group's entries keep the slots they had.
 */
export function mergeGroupOrder(all: number[], groupOrder: number[]): number[] {
  const members = new Set(groupOrder);
  let next = 0;
  return all.map((id) => (members.has(id) ? groupOrder[next++]! : id));
}
