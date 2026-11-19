import { useId } from 'react'
import { boardLinkRoutes, type BoardPoint, type CandidateInsets } from '../sudoku/board-link-geometry'
import { BoardMarks, type BoardMark } from './BoardMarks'

export type BoardRegion = { row: number; column: number; rows: number; columns: number }

export type BoardLink = {
  from: BoardPoint
  to: BoardPoint
  color: string
  muted?: boolean
  dashed?: boolean
  colorBreak?: boolean
  arrow?: boolean
}

export type CellAnnotation = { fill?: string; ink?: string; label?: string }
export type CandidateAnnotation = { color: string; mark?: 'ring' | 'strike'; label?: string }

export type BoardAnnotations = {
  cells?: ReadonlyMap<number, CellAnnotation>
  candidates?: ReadonlyMap<number, ReadonlyMap<number, CandidateAnnotation>>
  links?: readonly BoardLink[]
}

const CELL = 10

export function BoardLinks({ links, region, candidateInsets }: { links?: readonly BoardLink[]; region?: BoardRegion; candidateInsets?: CandidateInsets }) {
  const id = useId()
  const viewBox = region ? `${region.column * CELL} ${region.row * CELL} ${region.columns * CELL} ${region.rows * CELL}` : '0 0 90 90'
  const counts = new Map<string, number>()
  const items: BoardMark[] = []
  const routes = boardLinkRoutes(links ?? [], candidateInsets)
  for (const [index, { color, dashed, arrow, muted, colorBreak }] of (links ?? []).entries()) {
    const points = routes[index]
    if (points.length < 2) continue
    const [start, end] = [points[0], points[points.length - 1]]
    const shape = [start.x, start.y, end.x, end.y, Number(Boolean(dashed)), Number(Boolean(arrow))].join('_')
    const count = counts.get(shape) ?? 0
    counts.set(shape, count + 1)
    const key = `${shape}_${count}`
    const marker = `${id}-arrow-${key}`
    const middle = Math.floor(points.length / 2)
    const [before, after] = [points[middle - 1], points[middle]]
    items.push(<g key={key}>
      {arrow && <marker id={marker} markerWidth="2.5" markerHeight="2.5" refX="2.3" refY="1.25"
        markerUnits="userSpaceOnUse" orient="auto">
        <path d="M 0 0 L 2.5 1.25 L 0 2.5 Z" fill={color} />
      </marker>}
      <polyline points={points.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none"
        stroke={color} strokeWidth={muted ? ".3" : ".45"} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={dashed ? '1 .9' : undefined} markerEnd={arrow ? `url(#${marker})` : undefined} />
      {colorBreak && <circle className="chain-color-break" cx={(before.x + after.x) / 2} cy={(before.y + after.y) / 2}
        r=".9" fill="var(--board-bg)" stroke={color} strokeWidth=".42" />}
    </g>)
  }
  return <BoardMarks items={items} group={<svg aria-hidden="true" className="board-links" viewBox={viewBox} />} />
}
