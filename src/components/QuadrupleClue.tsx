import type { Quadruple } from '../sudoku/quadruple'

/** Draw a Quadruple at its four-cell intersection in a grid-sized SVG. */
export function QuadrupleClue({ topLeft, digits, size = 9 }: Quadruple & { size?: number }) {
  const cx = topLeft % size + 1
  const cy = Math.floor(topLeft / size) + 1
  const count = digits.length
  return <g className="variant-quadruple">
    <circle cx={cx} cy={cy} r=".265" />
    {digits.map((digit, index) => <text key={index}
      x={cx + (count === 1 || count === 3 && index === 2 ? 0 : index % 2 ? .105 : -.105)}
      y={cy + (count <= 2 ? 0 : Math.floor(index / 2) ? .105 : -.105)}>{digit}</text>)}
  </g>
}
