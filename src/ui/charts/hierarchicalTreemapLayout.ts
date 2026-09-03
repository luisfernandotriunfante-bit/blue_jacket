export type TreemapBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TreemapItem<T> = {
  id: string;
  value: number;
  data: T;
};

export type TreemapRect<T> = TreemapBounds & {
  id: string;
  value: number;
  data: T;
};

const positive = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

/**
 * Deterministic binary treemap. It keeps each rectangle proportional to its
 * value while repeatedly splitting along the longest available side, which
 * produces compact blocks without inventing a ranking or a grouping.
 */
export function buildHierarchicalTreemap<T>(items: TreemapItem<T>[], bounds: TreemapBounds) {
  const output = new Map<string, TreemapRect<T>>();
  const sorted = items
    .map(item => ({ ...item, value: positive(item.value) }))
    .filter(item => item.value > 0)
    .sort((left, right) => right.value - left.value || left.id.localeCompare(right.id));

  const place = (nodes: TreemapItem<T>[], rect: TreemapBounds): void => {
    if (!nodes.length || rect.width <= 0 || rect.height <= 0) return;
    if (nodes.length === 1) {
      const node = nodes[0]!;
      output.set(node.id, { ...rect, id: node.id, value: node.value, data: node.data });
      return;
    }

    const total = nodes.reduce((sum, node) => sum + node.value, 0);
    if (!(total > 0)) return;

    let splitAt = 1;
    let accumulated = nodes[0]!.value;
    let bestDistance = Math.abs(total / 2 - accumulated);
    for (let index = 1; index < nodes.length - 1; index += 1) {
      accumulated += nodes[index]!.value;
      const distance = Math.abs(total / 2 - accumulated);
      if (distance <= bestDistance) {
        bestDistance = distance;
        splitAt = index + 1;
      }
    }

    const first = nodes.slice(0, splitAt);
    const second = nodes.slice(splitAt);
    const firstValue = first.reduce((sum, node) => sum + node.value, 0);
    const ratio = firstValue / total;

    if (rect.width >= rect.height) {
      const firstWidth = rect.width * ratio;
      place(first, { x: rect.x, y: rect.y, width: firstWidth, height: rect.height });
      place(second, { x: rect.x + firstWidth, y: rect.y, width: rect.width - firstWidth, height: rect.height });
    } else {
      const firstHeight = rect.height * ratio;
      place(first, { x: rect.x, y: rect.y, width: rect.width, height: firstHeight });
      place(second, { x: rect.x, y: rect.y + firstHeight, width: rect.width, height: rect.height - firstHeight });
    }
  };

  place(sorted, bounds);
  return output;
}

export function insetTreemapBounds(bounds: TreemapBounds, inset: number): TreemapBounds {
  const safeInset = Math.max(0, Math.min(inset, bounds.width / 2, bounds.height / 2));
  return {
    x: bounds.x + safeInset,
    y: bounds.y + safeInset,
    width: Math.max(0, bounds.width - safeInset * 2),
    height: Math.max(0, bounds.height - safeInset * 2),
  };
}
