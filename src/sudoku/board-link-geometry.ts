export type BoardPoint = { cell: number; digit?: number } | { cells: readonly number[]; digit: number }
  | { candidates: readonly { cell: number; digit: number }[] }

function positions(point: BoardPoint): { x: number; y: number }[] {
  if ('cells' in point) return point.cells.flatMap(cell => positions({ cell, digit: point.digit }))
  if ('candidates' in point) return point.candidates.flatMap(positions)
  const offset = (slot: number) => .07 + ((slot + .5) / 3) * .86
  return [{
    x: (point.cell % 9 + (point.digit ? offset((point.digit - 1) % 3) : .5)) * 10,
    y: (Math.floor(point.cell / 9) + (point.digit ? offset(Math.floor((point.digit - 1) / 3)) : .5)) * 10,
  }]
}

export function boardLinkEndpoints(from: BoardPoint, to: BoardPoint) {
  const starts = positions(from), ends = positions(to)
  if (!starts.length || !ends.length) return undefined
  let start = starts[0], end = ends[0], shortest = Infinity
  // A group is still one logical endpoint. Attach to its nearest member so
  // the line does not cross another member on its way out of the group.
  for (const a of starts) for (const b of ends) {
    const distance = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    if (distance < shortest) { start = a; end = b; shortest = distance }
  }
  return { start, end }
}
