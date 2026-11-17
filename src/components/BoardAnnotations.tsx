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
type Point = { x: number; y: number }

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

export function BoardLinks({ links, region }: { links: readonly BoardLink[]; region?: BoardRegion }) {
  const id = useId()
  const viewBox = region ? `${region.column * CELL} ${region.row * CELL} ${region.columns * CELL} ${region.rows * CELL}` : '0 0 90 90'
  return (
    <svg aria-hidden="true" className="board-links" viewBox={viewBox}>
      {links.map(({ from, to, color, dashed, arrow }, index) => {
        const source = endpoint(from)
        const target = endpoint(to)
        if (!source.members.length || !target.members.length) return null
        const groupedSource = source.members.length > 1
        const groupedTarget = target.members.length > 1
        const dx = target.center.x - source.center.x
        const dy = target.center.y - source.center.y
        const length = Math.hypot(dx, dy)
        if (!length && !groupedSource && !groupedTarget) return null
        // Keep solid and dashed links on opposite sides even when the loop reverses direction.
        const side = (dx < 0 || (dx === 0 && dy < 0) ? -1 : 1) * (dashed ? -1 : 1)
        const offset = length ? { x: -dy / length * 2.5 * side, y: dx / length * 2.5 * side } : { x: 0, y: 2.5 * side }
        const sourceHub = groupedSource ? { x: source.center.x + offset.x, y: source.center.y + offset.y } : source.center
        const targetHub = groupedTarget ? { x: target.center.x + offset.x, y: target.center.y + offset.y } : target.center
        const start = groupedSource ? sourceHub : trim(sourceHub, targetHub)
        const end = groupedTarget ? targetHub : trim(targetHub, sourceHub)
        const branches = [
          ...(groupedSource ? source.members.map(member => ({ hub: sourceHub, member })) : []),
          ...(groupedTarget ? target.members.map(member => ({ hub: targetHub, member })) : []),
        ]
        const marker = `${id}-arrow-${index}`
        return (
          <g key={index} stroke={color} strokeWidth=".45" strokeLinecap="round" strokeDasharray={dashed ? '1 .9' : undefined}>
            {arrow && <marker id={marker} markerWidth="2.5" markerHeight="2.5" refX="2.3" refY="1.25"
              markerUnits="userSpaceOnUse" orient="auto">
              <path d="M 0 0 L 2.5 1.25 L 0 2.5 Z" fill={color} stroke="none" />
            </marker>}
            <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} markerEnd={arrow ? `url(#${marker})` : undefined} />
            {branches.map(({ hub, member }, branch) => {
              const tip = trim(member, hub)
              return <line key={branch} x1={hub.x} y1={hub.y} x2={tip.x} y2={tip.y} />
            })}
          </g>
        )
      })}
    </svg>
  )
}
