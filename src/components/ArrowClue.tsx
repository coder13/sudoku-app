import { useId } from 'react'

const center = (cell: number, size: number) => [cell % size + .5, Math.floor(cell / size) + .5] as const

export function ArrowMarker({ id }: { id: string }) {
  return <defs>
    <marker id={id} viewBox="0 0 1 1" refX=".9" refY=".5" markerWidth=".29" markerHeight=".29"
      markerUnits="userSpaceOnUse" orient="auto">
      <path className="variant-arrow-head" d="M.08 .08L.9 .5L.08 .92" />
    </marker>
  </defs>
}

/** Draw an ordinary Arrow in a grid-sized SVG. Pass a shared marker ID when the parent defines one. */
export function ArrowClue({ circle, cells, marker, size = 9 }: { circle: number; cells: readonly number[]; marker?: string; size?: number }) {
  const ownMarker = useId()
  const [cx, cy] = center(circle, size)
  const [nx, ny] = center(cells[0], size)
  const length = Math.hypot(nx - cx, ny - cy)
  const start = [cx + (nx - cx) * .33 / length, cy + (ny - cy) * .33 / length]
  return <>
    {!marker && <ArrowMarker id={ownMarker} />}
    <polyline className="variant-arrow-line" points={`${start.join(',')} ${cells.map(cell => center(cell, size).join(',')).join(' ')}`} markerEnd={`url(#${marker ?? ownMarker})`} />
    <circle className="variant-arrow-circle" cx={cx} cy={cy} r=".33" />
  </>
}

/** Draw a two-cell Pill Arrow. Pass cells in drawing order, with the pill cells first. */
export function PillArrowClue({ cells, size }: { cells: readonly number[]; size: number }) {
  const marker = useId()
  const mask = useId()
  const [first, second, ...shaft] = cells.map(cell => center(cell, size))
  const [x, y] = first
  const dx = second[0] - x, dy = second[1] - y
  const r = .33
  const pill = {
    x: x - r, y: y - r, rx: r,
    width: Math.hypot(dx, dy) + 2 * r, height: 2 * r,
    transform: `rotate(${Math.atan2(dy, dx) * 180 / Math.PI} ${x} ${y})`,
  }
  return <g className="variant-pill-arrow">
    <ArrowMarker id={marker} />
    <defs>
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
        <rect width={size} height={size} fill="white" />
        <rect {...pill} fill="black" />
      </mask>
    </defs>
    <polyline className="variant-arrow-line" points={[second, ...shaft].map(point => point.join(',')).join(' ')}
      markerEnd={`url(#${marker})`} mask={`url(#${mask})`} />
    <rect className="variant-arrow-circle" {...pill} />
  </g>
}
