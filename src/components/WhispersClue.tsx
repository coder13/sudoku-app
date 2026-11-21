import type { WhisperLine } from '../latin/whispers'

const center = (cell: number, size: number) => [cell % size + .5, Math.floor(cell / size) + .5] as const

/** Draw a Whispers path inside a grid-sized SVG. */
export function WhispersLineClue({ line, size = 9 }: { line: WhisperLine; size?: number }) {
  const points = line.cells.map(cell => center(cell, size).join(',')).join(' ')
  return <g className="variant-whispers" data-min-difference={line.minDifference}>
    <polyline points={points} />
  </g>
}

/** Label the minimum difference. Move the label aside on a marked edge. */
export function WhispersLineLabel({ line, markedEdges, size = 9 }: {
  line: WhisperLine; markedEdges: ReadonlySet<number>; size?: number
}) {
  const key = (a: number, b: number) => Math.min(a, b) * size ** 2 + Math.max(a, b)
  const edges = line.cells.slice(1).map((b, index) => [line.cells[index], b] as const)
  const [a, b] = edges.find(([a, b]) => !markedEdges.has(key(a, b))) ?? edges[0]
  const marked = markedEdges.has(key(a, b))
  const [ax, ay] = center(a, size), [bx, by] = center(b, size)
  const cx = (ax + bx) / 2, cy = (ay + by) / 2
  const [lx, ly] = marked ? gapLabelPoint(size, cx, cy, bx - ax, by - ay) : [cx, cy]
  return <g className="variant-whispers-label">
    {marked && <line className="variant-whispers-label-leader" x1={cx} y1={cy} x2={lx} y2={ly} />}
    <text className="variant-whispers-gap-halo" x={lx} y={ly}>≥{line.minDifference}</text>
    <text className="variant-whispers-gap" x={lx} y={ly}>≥{line.minDifference}</text>
  </g>
}

function gapLabelPoint(size: number, cx: number, cy: number, dx: number, dy: number) {
  const length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length
  // Move beside the marked edge, then move along the edge to clear the clue.
  const candidates = [1, -1].map(side => [cx - uy * .5 * side + ux * .3, cy + ux * .5 * side + uy * .3] as const)
  return candidates.find(([x, y]) => x >= .25 && x <= size - .25 && y >= .15 && y <= size - .15)
    ?? [Math.max(.25, Math.min(size - .25, candidates[0][0])), Math.max(.15, Math.min(size - .15, candidates[0][1]))] as const
}
