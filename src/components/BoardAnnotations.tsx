import { useId, useMemo } from 'react'
import { boardGroupKey, boardGroupOutline, boardLinkRoutes, boardPointCandidates, type BoardPoint, type CandidateInsets } from '../sudoku/board-link-geometry'
import type { Candidate } from '../sudoku/engine'
import { BoardMarks, type BoardMark } from './BoardMarks'

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
export type BoardGroup = { point: BoardPoint; color: string; opacity?: number; label?: string }

export type BoardAnnotations = {
  cells?: ReadonlyMap<number, CellAnnotation>
  candidates?: ReadonlyMap<number, ReadonlyMap<number, CandidateAnnotation>>
  links?: readonly BoardLink[]
  groups?: readonly BoardGroup[]
}

const CELL = 10
const NO_LINKS: readonly BoardLink[] = []
const NO_GROUPS: readonly BoardGroup[] = []

export function boardGroups(links: readonly BoardLink[] = NO_LINKS, groups: readonly BoardGroup[] = NO_GROUPS) {
  const byKey = new Map<string, BoardGroup>()
  for (const { from, to, color, opacity } of links) for (const point of [from, to]) {
    const key = boardGroupKey(point)
    if (!key) continue
    const previous = byKey.get(key)
    if (!previous || (opacity ?? 1) > (previous.opacity ?? 1)) byKey.set(key, { point, color, opacity })
  }
  for (const group of groups) {
    const key = boardGroupKey(group.point)
    if (key) byKey.set(key, group)
  }
  return [...byKey.entries()]
}

export function boardGroupDescription(point: BoardPoint) {
  return boardPointCandidates(point).map(({ cell, digit }) => `${digit} in row ${Math.floor(cell / 9) + 1}, column ${cell % 9 + 1}`).join(' or ')
}

/** Draw links and outlines around their grouped endpoints. Explicit groups also support endpoint-only hints and group selection. */
export function BoardLinks({ links = NO_LINKS, groups = NO_GROUPS, region, candidateInsets, onSelect }: {
  links?: readonly BoardLink[]; groups?: readonly BoardGroup[]; region?: BoardRegion; candidateInsets?: CandidateInsets; onSelect?: (candidate: Candidate) => void
}) {
  const id = useId()
  const viewBox = region ? `${region.column * CELL} ${region.row * CELL} ${region.columns * CELL} ${region.rows * CELL}` : '0 0 90 90'
  const routes = useMemo(() => boardLinkRoutes(links, candidateInsets), [links, candidateInsets])
  const grouped = useMemo(() => boardGroups(links, groups), [links, groups])
  const items = useMemo(() => {
    const counts = new Map<string, number>()
    const marks: BoardMark[] = grouped.map(([key, { point, color, opacity, label }]) => {
      const points = boardGroupOutline(point, candidateInsets).map(({ x, y }) => `${x},${y}`).join(' ')
      return <g key={`group-${key}`} className="board-chain-group" data-chain-group={key} opacity={opacity}>
        <title>{label ?? `Candidate group: ${boardGroupDescription(point)}`}</title>
        <polygon points={points} fill={color} fillOpacity=".07" stroke={color} strokeWidth=".3" strokeLinejoin="round" />
      </g>
    })
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
  }, [links, routes, grouped, candidateInsets, id, onSelect])
  const group = useMemo(() => <svg aria-hidden="true" className="board-links" viewBox={viewBox} />, [viewBox])
  return <BoardMarks items={items} group={group} />
}
