/** Draw odd circles or even squares in a grid-sized SVG. Label each cell separately. */
export function ParityClue({ parity, cells, size = 9 }: {
  parity: 'odd' | 'even'
  cells: readonly number[]
  size?: number
}) {
  return <g className={`variant-parity variant-parity-${parity}`}>
    {[...new Set(cells)].map(cell => {
      const x = cell % size
      const y = Math.floor(cell / size)
      return parity === 'odd'
        ? <circle key={cell} cx={x + .5} cy={y + .5} r=".36" />
        : <rect key={cell} x={x + .14} y={y + .14} width=".72" height=".72" />
    })}
  </g>
}
