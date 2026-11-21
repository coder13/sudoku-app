import { memo, useId, useMemo } from 'react'
import { boardLinkRoutes, type BoardPoint, type CandidateInsets } from '../sudoku/board-link-geometry'
import type { Candidate } from '../sudoku/engine'
import { BoardMarks, type BoardMark } from './BoardMarks'
import { importedColorLabel, importedColorValue } from '../sudoku/imported-colors'
import type { ImportedDrawing } from '../sudoku/imported-drawings'

export type BoardRegion = { row: number; column: number; rows: number; columns: number }

export type BoardLink = {
  from: BoardPoint
  to: BoardPoint
  color: string
  opacity?: number
  muted?: boolean
  dashed?: boolean
  colorBreak?: boolean
  arrow?: boolean
  selectFrom?: Candidate
}

export type CellAnnotation = { fill?: string; ink?: string; label?: string }
export type CandidateAnnotation = { color: string; opacity?: number; mark?: 'ring' | 'emphasized' | 'strike'; strike?: boolean; label?: string }

export type BoardAnnotations = {
  cells?: ReadonlyMap<number, CellAnnotation>
  candidates?: ReadonlyMap<number, ReadonlyMap<number, CandidateAnnotation>>
  links?: readonly BoardLink[]
}

const CELL = 10
const NO_LINKS: readonly BoardLink[] = []

export function BoardLinks({ links = NO_LINKS, region, candidateInsets, onSelect }: {
  links?: readonly BoardLink[]; region?: BoardRegion; candidateInsets?: CandidateInsets; onSelect?: (candidate: Candidate) => void
}) {
  const id = useId()
  const viewBox = region ? `${region.column * CELL} ${region.row * CELL} ${region.columns * CELL} ${region.rows * CELL}` : '0 0 90 90'
  const routes = useMemo(() => boardLinkRoutes(links, candidateInsets), [links, candidateInsets])
  const items = useMemo(() => {
    const counts = new Map<string, number>()
    const marks: BoardMark[] = []
    for (const [index, { color, opacity, dashed, arrow, muted, colorBreak, selectFrom }] of links.entries()) {
      const points = routes[index]
      if (points.length < 2) continue
      const [start, end] = [points[0], points[points.length - 1]]
      const shape = [start.x, start.y, end.x, end.y, Number(Boolean(dashed)), Number(Boolean(arrow))].join('_')
      const count = counts.get(shape) ?? 0
      counts.set(shape, count + 1)
      const key = `${shape}_${count}`
      const marker = `${id}-arrow-${key}`
      const vertices = points.map(({ x, y }) => `${x},${y}`).join(' ')
      const middle = Math.floor(points.length / 2)
      const [before, after] = [points[middle - 1], points[middle]]
      marks.push(<g key={key} opacity={opacity}>
        {arrow && <marker id={marker} markerWidth="2.5" markerHeight="2.5" refX="2.3" refY="1.25"
          markerUnits="userSpaceOnUse" orient="auto">
          <path d="M 0 0 L 2.5 1.25 L 0 2.5 Z" fill={color} />
        </marker>}
        <polyline points={vertices} fill="none"
          stroke={color} strokeWidth={muted ? ".3" : ".45"} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={dashed ? '1 .9' : undefined} markerEnd={arrow ? `url(#${marker})` : undefined} />
        {colorBreak && <circle className="chain-color-break" cx={(before.x + after.x) / 2} cy={(before.y + after.y) / 2}
          r=".9" fill="var(--board-bg)" stroke={color} strokeWidth=".42" />}
        {onSelect && selectFrom && <polyline className="board-link-target" points={vertices} fill="none"
          stroke="transparent" strokeWidth="14" vectorEffect="non-scaling-stroke" onClick={() => onSelect(selectFrom)} />}
      </g>)
    }
    return marks
  }, [links, routes, id, onSelect])
  const group = useMemo(() => <svg aria-hidden="true" className="board-links" viewBox={viewBox} />, [viewBox])
  return <BoardMarks items={items} group={group} />
}

function drawingLocation([x, y]: readonly [number, number]): string {
  return x >= 0 && x < 9 && y >= 0 && y < 9 && !Number.isInteger(x) && !Number.isInteger(y)
    ? `row ${y + .5}, column ${x + .5}`
    : `grid coordinates ${x}, ${y}`
}

/** Restore imported marks at their original positions, independently of chain links. */
export const BoardQuickDraw = memo(function BoardQuickDraw({ drawings, region, hidden }: {
  drawings: readonly ImportedDrawing[]
  region?: BoardRegion
  hidden?: boolean
}) {
  const descriptionId = useId()
  const bounds = region ? `${region.column} ${region.row} ${region.columns} ${region.rows}` : '0 0 9 9'
  const descriptions = drawings.map(drawing => {
    const color = importedColorLabel(drawing.color)
    return drawing.shape === 'line'
      ? `${color} line from ${drawingLocation(drawing.from)} to ${drawingLocation(drawing.to)}`
      : `${color} ${drawing.shape} at ${drawingLocation(drawing.at)}`
  })
  return <svg className="board-quick-draw" viewBox={bounds} data-cropped={Boolean(region) || undefined}
    role="img" aria-label="Imported Quick Draw annotations" aria-describedby={descriptionId} aria-hidden={hidden || undefined}>
    <desc id={descriptionId}>{descriptions.join('. ')}</desc>
    {drawings.map((drawing, index) => {
      const stroke = `color-mix(in srgb, ${importedColorValue(drawing.color)} 58%, var(--board-ink))`
      if (drawing.shape === 'line') return <line key={index} x1={drawing.from[0]} y1={drawing.from[1]}
        x2={drawing.to[0]} y2={drawing.to[1]} stroke={stroke} strokeWidth=".1" strokeLinecap="round" />
      const [x, y] = drawing.at
      if (drawing.shape === 'circle') return <circle key={index} cx={x} cy={y} r=".3" stroke={stroke} strokeWidth=".1" fill="none" />
      if (drawing.shape === 'square') return <rect key={index} x={x - .3} y={y - .3} width=".6" height=".6"
        stroke={stroke} strokeWidth=".1" fill="none" />
      const edge = Number.isInteger(x) || Number.isInteger(y)
      const radius = edge ? .1 : .3
      return <path key={index} d={`M ${x - radius} ${y - radius} L ${x + radius} ${y + radius} M ${x - radius} ${y + radius} L ${x + radius} ${y - radius}`}
        stroke={stroke} strokeWidth={edge ? '.05' : '.1'} fill="none" strokeLinecap="round" />
    })}
  </svg>
})
