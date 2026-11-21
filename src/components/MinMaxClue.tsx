import { minMaxNeighbors, type LatinMinMax } from '../latin/min-max'

/** Draw inward arrows for a Minimum and outward arrows for a Maximum. */
export function MinMaxClue({ cells, maximum, size }: LatinMinMax & { size: number }) {
  const group = new Set(cells)
  return <g className={`variant-min-max ${maximum ? 'variant-maximum' : 'variant-minimum'}`}>
    {cells.map(cell => {
      const col = cell % size, row = Math.floor(cell / size)
      const cx = col + .5, cy = row + .5
      const tip = maximum ? .44 : .33, tail = maximum ? .33 : .44
      const across = .105
      return <g key={cell} data-min-max-cell={cell}>
        <rect x={cx - .44} y={cy - .44} width=".88" height=".88" rx=".1" />
        {minMaxNeighbors(size, cell, group).map(neighbor => {
          const dx = neighbor % size - col, dy = Math.floor(neighbor / size) - row
          const points = [
            [cx + tail * dx + across * dy, cy + tail * dy - across * dx],
            [cx + tip * dx, cy + tip * dy],
            [cx + tail * dx - across * dy, cy + tail * dy + across * dx],
          ]
          return <polyline key={neighbor} points={points.map(point => point.join(',')).join(' ')} />
        })}
      </g>
    })}
  </g>
}
