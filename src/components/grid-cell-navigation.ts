export type GridDirectionKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
export type GridEdgeBehavior = 'clamp' | 'stop'

const directions: Record<GridDirectionKey, readonly [row: number, column: number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

export function isGridDirectionKey(key: string): key is GridDirectionKey {
  return Object.hasOwn(directions, key)
}

/** Return the adjacent grid cell, clamping at edges or stopping at the boundary. */
export function gridCellInDirection(cell: number, size: number, key: string, edgeBehavior: GridEdgeBehavior = 'clamp') {
  if (!Object.hasOwn(directions, key) || !Number.isInteger(size) || size < 1) return undefined
  const direction = directions[key as GridDirectionKey]
  const [rowOffset, columnOffset] = direction
  const row = Math.floor(cell / size) + rowOffset
  const column = (cell % size) + columnOffset
  if (edgeBehavior === 'stop' && (row < 0 || row >= size || column < 0 || column >= size)) return undefined
  return Math.min(size - 1, Math.max(0, row)) * size + Math.min(size - 1, Math.max(0, column))
}

/** Focus a rendered grid cell without requiring its specific button or input type. */
export function focusGridCell(root: ParentNode | null, cell: number, preventScroll = false) {
  const target = root?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)
  target?.focus({ preventScroll })
  return target ?? null
}
