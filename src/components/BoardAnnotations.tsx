import { useId } from 'react'
import { boardLinkEndpoints, type BoardPoint } from '../sudoku/board-link-geometry'
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

export function BoardLinks({ links, region }: { links: readonly BoardLink[]; region?: BoardRegion }) {
  const id = useId()
  const viewBox = region ? `${region.column * CELL} ${region.row * CELL} ${region.columns * CELL} ${region.rows * CELL}` : '0 0 90 90'
  return (
    <svg aria-hidden="true" className="board-links" viewBox={viewBox}>
      {links.map(({ from, to, color, dashed, arrow }, index) => {
        const endpoints = boardLinkEndpoints(from, to)
        if (!endpoints) return null
        const { start, end } = endpoints
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
