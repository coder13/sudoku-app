import { useId } from 'react'

type BoardPoint = { cell: number; digit?: number } | { cells: readonly number[]; digit: number }
  | { candidates: readonly { cell: number; digit: number }[] }
export type BoardRegion = { row: number; column: number; rows: number; columns: number }

export type BoardLink = {
  from: BoardPoint
  to: BoardPoint
  color: string
  dashed?: boolean
  arrow?: boolean
}

export type CellAnnotation = { fill?: string; outline?: string; ink?: string; label?: string }
export type CandidateAnnotation = { color: string; mark?: 'ring' | 'strike'; label?: string }

export type BoardAnnotations = {
  cells?: ReadonlyMap<number, CellAnnotation>
  candidates?: ReadonlyMap<number, ReadonlyMap<number, CandidateAnnotation>>
  links?: readonly BoardLink[]
}

const CELL = 10
const CANDIDATE_INSET = 0.07
const LINK_LANE_SPACING = 3.6
type Point = { x: number; y: number }
type Segment = { start: Point; end: Point; trimStart: boolean; trimEnd: boolean }

function coordinates({ cell, digit }: { cell: number; digit?: number }): Point {
  const offset = (slot: number) => CANDIDATE_INSET + ((slot + .5) / 3) * (1 - CANDIDATE_INSET * 2)
  return {
    x: (cell % 9 + (digit ? offset((digit - 1) % 3) : .5)) * CELL,
    y: (Math.floor(cell / 9) + (digit ? offset(Math.floor((digit - 1) / 3)) : .5)) * CELL,
  }
}

function endpoint(point: BoardPoint) {
  const members = 'cells' in point ? point.cells.map(cell => coordinates({ cell, digit: point.digit }))
    : 'candidates' in point ? point.candidates.map(coordinates) : [coordinates(point)]
  const center = {
    x: members.reduce((sum, member) => sum + member.x, 0) / members.length,
    y: members.reduce((sum, member) => sum + member.y, 0) / members.length,
  }
  return { center, members }
}

function trim(start: Point, end: Point): Point {
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const fraction = length ? Math.min(1.4 / length, .25) : 0
  return { x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction }
}

function linkSegments({ from, to, dashed }: BoardLink): Segment[] {
  const source = endpoint(from)
  const target = endpoint(to)
  if (!source.members.length || !target.members.length) return []
  const groupedSource = source.members.length > 1
  const groupedTarget = target.members.length > 1
  const dx = target.center.x - source.center.x
  const dy = target.center.y - source.center.y
  const length = Math.hypot(dx, dy)
  if (!length && !groupedSource && !groupedTarget) return []
  // Keep solid and dashed group links on opposite sides when the loop reverses direction.
  const side = (dx < 0 || (dx === 0 && dy < 0) ? -1 : 1) * (dashed ? -1 : 1)
  const offset = length ? { x: -dy / length * 2.5 * side, y: dx / length * 2.5 * side } : { x: 0, y: 2.5 * side }
  const start = groupedSource ? { x: source.center.x + offset.x, y: source.center.y + offset.y } : source.center
  const end = groupedTarget ? { x: target.center.x + offset.x, y: target.center.y + offset.y } : target.center
  return [
    { start, end, trimStart: !groupedSource, trimEnd: !groupedTarget },
    ...(groupedSource ? source.members.map(member => ({ start, end: member, trimStart: false, trimEnd: true })) : []),
    ...(groupedTarget ? target.members.map(member => ({ start: end, end: member, trimStart: false, trimEnd: true })) : []),
  ]
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

export function BoardLinks({ links, region }: { links: readonly BoardLink[]; region?: BoardRegion }) {
  const id = useId()
  const viewBox = region ? `${region.column * CELL} ${region.row * CELL} ${region.columns * CELL} ${region.rows * CELL}` : '0 0 90 90'
  const segments = links.map(linkSegments)
  const offsets = laneOffsets(segments.flat())
  return (
    <svg aria-hidden="true" className="board-links" viewBox={viewBox}>
      {links.map(({ color, dashed, arrow }, index) => {
        if (!segments[index].length) return null
        const marker = `${id}-arrow-${index}`
        return (
          <g key={index} stroke={color} strokeWidth=".45" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? '1 .9' : undefined}>
            {arrow && <marker id={marker} markerWidth="2.5" markerHeight="2.5" refX="2.3" refY="1.25"
              markerUnits="userSpaceOnUse" orient="auto">
              <path d="M 0 0 L 2.5 1.25 L 0 2.5 Z" fill={color} stroke="none" />
            </marker>}
            {segments[index].map((segment, part) => {
              const points = route(segment, offsets.get(segment) ?? 0)
              const markerEnd = arrow && part === 0 ? `url(#${marker})` : undefined
              if (points.length > 2) {
                return <polyline key={part} points={points.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" markerEnd={markerEnd} />
              }
              const [start, end] = points
              return <line key={part} x1={start.x} y1={start.y} x2={end.x} y2={end.y} markerEnd={markerEnd} />
            })}
          </g>
        )
      })}
    </svg>
  )
}
