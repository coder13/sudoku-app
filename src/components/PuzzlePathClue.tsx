import type { LatinPathClue } from '../latin/path-clues'

/** Draw a Thermometer, Palindrome Line, Consecutive Line, or Entropic Line at the active grid size. */
export function PuzzlePathClue({ line, size = 9 }: { line: LatinPathClue; size?: number }) {
  if (line.type === 'thermometer') {
    const bulb = line.cells[0]
    return <g className="variant-thermometer">
      <polyline points={line.cells.map(cell => cellCenter(cell, size)).join(' ')} />
      <circle cx={bulb % size + .5} cy={Math.floor(bulb / size) + .5} r=".32" />
    </g>
  }
  return <g className={`variant-${line.type}`}>
    {(line.segments ?? [line.cells]).map((path, index) => {
      const points = path.map(cell => cellCenter(cell, size)).join(' ')
      if (path.length === 1) return <circle key={index} cx={path[0] % size + .5} cy={Math.floor(path[0] / size) + .5} r={line.type === 'entropic' ? .12 : .1} />
      return <polyline key={index} points={points} />
    })}
  </g>
}

function cellCenter(cell: number, size: number) {
  return `${cell % size + .5},${Math.floor(cell / size) + .5}`
}
