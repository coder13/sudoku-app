type Point = { x: number; y: number }
type Segment = { start: Point; end: Point; trimStart: boolean; trimEnd: boolean }
const LINK_LANE_SPACING = 3.6

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

function trim(start: Point, end: Point): Point {
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const fraction = length ? Math.min(1.4 / length, .25) : 0
  return { x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction }
}

function overlaps([start, end]: Point[], [otherStart, otherEnd]: Point[]) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (!length) return false
  const project = ({ x, y }: Point) => ({
    along: (dx * (x - start.x) + dy * (y - start.y)) / length,
    across: (dx * (y - start.y) - dy * (x - start.x)) / length,
  })
  const a = project(otherStart)
  const b = project(otherEnd)
  return Math.abs(a.across) < .01 && Math.abs(b.across) < .01
    && Math.min(length, Math.max(a.along, b.along)) - Math.max(0, Math.min(a.along, b.along)) > .9
}

function laneOffsets(segments: Segment[]) {
  const straight = segments.map(segment => route(segment, 0))
  const conflicts = straight.map((segment, index) => straight.flatMap((other, i) =>
    i !== index && overlaps(segment, other) ? [i] : []))
  const lanes = segments.map(() => -1)
  const offsets = new Map<Segment, number>()
  for (const [index] of segments.entries()) {
    if (lanes[index] >= 0) continue
    const group = [index]
    lanes[index] = 0
    let lastLane = 0
    for (const member of group) {
      for (const neighbor of conflicts[member]) {
        if (lanes[neighbor] >= 0) continue
        const occupied = new Set(conflicts[neighbor].map(i => lanes[i]))
        let lane = 0
        while (occupied.has(lane)) lane++
        lanes[neighbor] = lane
        lastLane = Math.max(lastLane, lane)
        group.push(neighbor)
      }
    }
    for (const member of group) {
      offsets.set(segments[member], (lanes[member] - lastLane / 2) * LINK_LANE_SPACING)
    }
  }
  return offsets
}

function route({ start, end, trimStart, trimEnd }: Segment, lane: number): Point[] {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (!lane || !length) return [trimStart ? trim(start, end) : start, trimEnd ? trim(end, start) : end]
  const lead = Math.min(3, length / 4)
  const offset = (dx < 0 || (dx === 0 && dy < 0) ? -lane : lane) / length
  const startBend = { x: start.x + dx / length * lead - dy * offset, y: start.y + dy / length * lead + dx * offset }
  const endBend = { x: end.x - dx / length * lead - dy * offset, y: end.y - dy / length * lead + dx * offset }
  return [trimStart ? trim(start, startBend) : start, startBend, endBend, trimEnd ? trim(end, endBend) : end]
}

export function boardLinkRoutes(links: readonly { from: BoardPoint; to: BoardPoint }[]): Point[][] {
  const segments = links.map(({ from, to }) => {
    const endpoints = boardLinkEndpoints(from, to)
    if (!endpoints || (endpoints.start.x === endpoints.end.x && endpoints.start.y === endpoints.end.y)) return undefined
    return { ...endpoints, trimStart: true, trimEnd: true }
  })
  const valid = segments.filter((segment): segment is Segment => Boolean(segment))
  const offsets = laneOffsets(valid)
  return segments.map(segment => segment ? route(segment, offsets.get(segment) ?? 0) : [])
}
