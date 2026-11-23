const renbanColors = ['#cf419c', '#8353be', '#d26878', '#aa48bf']

export function renbanClueColor(number: number) {
  return renbanColors[(number - 1) % renbanColors.length]
}

/** Draw each authored segment of a connected Renban line. */
export function RenbanClue({ cells, segments, number, size = 9 }: {
  cells: readonly number[]; segments?: readonly (readonly number[])[]; number: number; size?: number
}) {
  const color = renbanClueColor(number)
  const x = (cell: number) => cell % size + .5
  const y = (cell: number) => Math.floor(cell / size) + .5
  return <g className="variant-renban" data-renban={number} stroke={color} fill={color}>
    {(segments ?? [cells]).map((path, part) => path.length === 1
      ? <circle key={part} cx={x(path[0])} cy={y(path[0])} r=".12" />
      : <polyline key={part} points={path.map(cell => `${x(cell)},${y(cell)}`).join(' ')} />)}
  </g>
}
