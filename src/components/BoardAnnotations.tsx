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

function coordinates(point: BoardPoint): { x: number; y: number } {
  if ('cells' in point || 'candidates' in point) {
    const candidates = 'cells' in point ? point.cells.map(cell => ({ cell, digit: point.digit })) : point.candidates
    const positions = candidates.map(coordinates)
    return {
      x: positions.reduce((sum, item) => sum + item.x, 0) / positions.length,
      y: positions.reduce((sum, item) => sum + item.y, 0) / positions.length,
    }
  }
  const { cell, digit } = point
  const offset = (slot: number) => CANDIDATE_INSET + ((slot + .5) / 3) * (1 - CANDIDATE_INSET * 2)
  return {
    x: (cell % 9 + (digit ? offset((digit - 1) % 3) : .5)) * CELL,
    y: (Math.floor(cell / 9) + (digit ? offset(Math.floor((digit - 1) / 3)) : .5)) * CELL,
  }
}

export function BoardLinks({ links, region }: { links: readonly BoardLink[]; region?: BoardRegion }) {
  const id = useId()
  const viewBox = region ? `${region.column * CELL} ${region.row * CELL} ${region.columns * CELL} ${region.rows * CELL}` : '0 0 90 90'
  return (
    <svg aria-hidden="true" className="board-links" viewBox={viewBox}>
      {links.map(({ from, to, color, dashed, arrow }, index) => {
        const start = coordinates(from)
        const end = coordinates(to)
        const length = Math.hypot(end.x - start.x, end.y - start.y)
        if (length === 0) return null
        const dx = (end.x - start.x) / length
        const dy = (end.y - start.y) / length
        const gap = Math.min(1.4, length / 4)
        const marker = `${id}-arrow-${index}`
        return (
          <g key={index}>
            {arrow && <marker id={marker} markerWidth="2.5" markerHeight="2.5" refX="2.3" refY="1.25"
              markerUnits="userSpaceOnUse" orient="auto">
              <path d="M 0 0 L 2.5 1.25 L 0 2.5 Z" fill={color} />
            </marker>}
            <line x1={start.x + dx * gap} y1={start.y + dy * gap}
              x2={end.x - dx * gap} y2={end.y - dy * gap}
              stroke={color} strokeWidth=".45" strokeLinecap="round"
              strokeDasharray={dashed ? '1 .9' : undefined} markerEnd={arrow ? `url(#${marker})` : undefined} />
          </g>
        )
      })}
    </svg>
  )
}
