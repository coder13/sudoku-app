import { memo, useId, useMemo } from 'react'
import { boardGroupKey, boardGroupOutline, boardLinkRoutes, boardPointCandidates, type BoardPoint, type CandidateInsets } from '../sudoku/board-link-geometry'
import type { Candidate } from '../sudoku/engine'
import { BoardMarks, type BoardMark } from './BoardMarks'
import { importedColorLabel, importedColorValue } from '../sudoku/imported-colors'
import type { ImportedDrawing } from '../sudoku/imported-drawings'
import type { AuthoredMark } from '../sudoku/authored-artwork'

export type BoardRegion = { row: number; column: number; rows: number; columns: number }

export type BoardLink = {
  from: BoardPoint
  to: BoardPoint
  color: string
  opacity?: number
  muted?: boolean
  dashed?: boolean
  hideGroupOutlines?: boolean
  emphasized?: boolean
  colorBreak?: boolean
  arrow?: boolean
  selectFrom?: Candidate
}

export type CellAnnotation = {
  fill?: string
  fills?: readonly string[]
  setMarkers?: readonly { color: string; label?: string }[]
  ink?: string
  label?: string
  referenceHighlight?: boolean
}
export type CandidateAnnotation = { color?: string; opacity?: number; mark?: 'ring' | 'emphasized' | 'strike'; strike?: boolean; emphasized?: boolean; referenceHighlight?: boolean; label?: string }
export type BoardGroup = { point: BoardPoint; color: string; opacity?: number; emphasized?: boolean; label?: string }

export type BoardAnnotations = {
  cells?: ReadonlyMap<number, CellAnnotation>
  candidates?: ReadonlyMap<number, ReadonlyMap<number, CandidateAnnotation>>
  links?: readonly BoardLink[]
  groups?: readonly BoardGroup[]
}

function mergeCellAnnotations(
  base: BoardAnnotations['cells'],
  overlay: BoardAnnotations['cells'],
): BoardAnnotations['cells'] {
  if (!overlay) return base
  const cells = new Map(base)
  for (const [cell, annotation] of overlay) {
    const current = cells.get(cell)
    const currentFills = current?.fills?.length ? current.fills : current?.fill ? [current.fill] : []
    const nextFills = annotation.fills?.length ? annotation.fills : annotation.fill ? [annotation.fill] : []
    const setMarkers = current?.setMarkers && annotation.setMarkers
      ? [...new Map([...current.setMarkers, ...annotation.setMarkers]
        .map(marker => [`${marker.color}:${marker.label ?? ''}`, marker])).values()]
      : annotation.setMarkers ?? current?.setMarkers
    cells.set(cell, {
      ...current, ...annotation, fills: [...new Set([...currentFills, ...nextFills])],
      ...(setMarkers && { setMarkers }),
      referenceHighlight: current?.referenceHighlight || annotation.referenceHighlight,
    })
  }
  return cells
}

function mergeCandidateAnnotations(
  base: BoardAnnotations['candidates'],
  overlay: BoardAnnotations['candidates'],
): BoardAnnotations['candidates'] {
  if (!overlay) return base
  const candidates = new Map(base)
  for (const [cell, marks] of overlay) {
    const cellMarks = new Map(base?.get(cell))
    for (const [digit, mark] of marks) {
      const current = cellMarks.get(digit)
      cellMarks.set(digit, { ...current, ...mark, referenceHighlight: current?.referenceHighlight || mark.referenceHighlight })
    }
    candidates.set(cell, cellMarks)
  }
  return candidates
}

/** Merge board layers, preserving reference highlights contributed by either layer. */
export function mergeBoardAnnotations(base: BoardAnnotations | undefined, overlay: BoardAnnotations | undefined): BoardAnnotations | undefined {
  if (!overlay) return base
  const cells = mergeCellAnnotations(base?.cells, overlay.cells)
  const candidates = mergeCandidateAnnotations(base?.candidates, overlay.candidates)
  const links = overlay.links ? [...(base?.links ?? []), ...overlay.links] : base?.links
  const groups = overlay.groups ? [...(base?.groups ?? []), ...overlay.groups] : base?.groups
  return {
    ...base,
    ...overlay,
    ...(cells ? { cells } : {}),
    ...(candidates ? { candidates } : {}),
    ...(links ? { links } : {}),
    ...(groups ? { groups } : {}),
  }
}

const CELL = 10
const NO_LINKS: readonly BoardLink[] = []
const NO_GROUPS: readonly BoardGroup[] = []

export function boardGroups(links: readonly BoardLink[] = NO_LINKS, groups: readonly BoardGroup[] = NO_GROUPS) {
  const byKey = new Map<string, BoardGroup>()
  for (const { from, to, color, opacity, emphasized } of links) for (const point of [from, to]) {
    const key = boardGroupKey(point)
    if (!key) continue
    const previous = byKey.get(key)
    if (!previous || (opacity ?? 1) > (previous.opacity ?? 1)) byKey.set(key, { point, color, opacity, emphasized })
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
  const grouped = useMemo(() => boardGroups(links.filter(link => !link.hideGroupOutlines), groups), [links, groups])
  const items = useMemo(() => {
    const counts = new Map<string, number>()
    const marks: BoardMark[] = grouped.map(([key, { point, color, opacity, label, emphasized }]) => {
      const points = boardGroupOutline(point, candidateInsets).map(({ x, y }) => `${x},${y}`).join(' ')
      return <g key={`group-${key}`} className="board-chain-group" data-chain-group={key} data-chain-hover={emphasized || undefined} opacity={opacity}>
        <title>{label ?? `Candidate group: ${boardGroupDescription(point)}`}</title>
        <polygon points={points} fill={color} fillOpacity=".07" stroke={color} strokeWidth=".3" strokeLinejoin="round" />
      </g>
    })
    for (const [index, { color, opacity, dashed, arrow, muted, colorBreak, selectFrom, emphasized }] of links.entries()) {
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
      marks.push(<g key={key} data-chain-hover={emphasized || undefined} opacity={opacity}>
        {arrow && <marker id={marker} markerWidth="2.5" markerHeight="2.5" refX="2.3" refY="1.25"
          markerUnits="userSpaceOnUse" orient="auto">
          <path d="M 0 0 L 2.5 1.25 L 0 2.5 Z" fill={color} />
        </marker>}
        <polyline points={vertices} fill="none"
          stroke={color} strokeWidth={muted ? '.3' : '.45'} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={dashed ? '1 .9' : undefined} markerEnd={arrow ? `url(#${marker})` : undefined} />
        {colorBreak && <circle className="chain-color-break" cx={(before.x + after.x) / 2} cy={(before.y + after.y) / 2}
          r=".9" fill="var(--board-bg)" stroke={color} strokeWidth=".42" />}
        {onSelect && selectFrom && <polyline className="board-link-target" points={vertices} fill="none"
          stroke="transparent" strokeWidth="14" vectorEffect="non-scaling-stroke" onClick={() => onSelect(selectFrom)} />}
      </g>)
    }
    return marks
  }, [links, routes, grouped, candidateInsets, id, onSelect])
  const group = useMemo(() => <svg aria-hidden="true" className="board-links" data-board-links viewBox={viewBox} />, [viewBox])
  return <BoardMarks items={items} group={group} />
}

function drawingLocation([x, y]: readonly [number, number]): string {
  return x >= 0 && x < 9 && y >= 0 && y < 9 && !Number.isInteger(x) && !Number.isInteger(y)
    ? `row ${y + .5}, column ${x + .5}`
    : `grid coordinates ${x}, ${y}`
}

/** Render the artwork saved in the puzzle definition in full-board coordinates. */
export const BoardArtwork = memo(function BoardArtwork({ artwork, region }: {
  artwork: readonly AuthoredMark[]
  region?: BoardRegion
}) {
  const bounds = region ? `${region.column} ${region.row} ${region.columns} ${region.rows}` : '0 0 9 9'
  return <svg className="board-authored-artwork" viewBox={bounds} aria-hidden="true">
    {artwork.map((mark, index) => mark.type === 'cage-caption-offset' ? null : mark.type === 'outline' || mark.type === 'divider'
      ? <polyline key={index} data-authored-divider={mark.type === 'divider' || undefined} points={mark.points.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none" stroke="var(--board-ink)" strokeWidth={mark.thickness} strokeLinejoin="round" />
      : mark.type === 'disc'
        ? <circle key={index} cx={mark.center[0]} cy={mark.center[1]} r={mark.radius}
          fill={`color-mix(in srgb, ${mark.color} 50%, var(--board-ink))`} fillOpacity=".4" />
        : mark.type === 'tile'
          ? <rect key={index} x={mark.center[0] - mark.size / 2} y={mark.center[1] - mark.size / 2}
            width={mark.size} height={mark.size} fill={mark.color === 'board-ink' ? 'var(--board-ink)' : mark.color} fillOpacity={mark.opacity / 255}
            transform={`rotate(${mark.rotation} ${mark.center[0]} ${mark.center[1]})`} />
          : <text key={index} x={mark.center[0]} y={mark.center[1] + mark.offsetY} textAnchor="middle"
            dominantBaseline="central" fontSize={mark.size} fontWeight="700" fill={mark.color === 'board-ink' ? 'var(--board-ink)' : mark.color}
            fillOpacity={mark.opacity / 255} stroke={mark.outlineColor === 'board-ink' ? 'var(--board-ink)' : mark.outlineColor} strokeWidth={mark.outlineThickness}
            paintOrder="stroke" strokeLinejoin="round">{mark.text}</text>)}
  </svg>
})

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
