import type { MarkerRule } from './custom-modes.ts'

type Pair = readonly [number, number]

/** Find a second classic completion that gives the same complete marker layout.
 * A companion clue can then distinguish the two completions. */
export function markerTrade(solution: string, negative: ReadonlySet<MarkerRule>, edges: readonly Pair[], random: () => number) {
  const digits = Array.from(solution, Number)
  const rectangles: number[][] = []
  for (let a = 0; a < 81; a++) {
    const row = Math.floor(a / 9), col = a % 9
    for (let r = row + 1; r < 9; r++) for (let c = col + 1; c < 9; c++) {
      // Swapping a pair in two rows and columns also preserves both boxes.
      if ((Math.floor(row / 3) === Math.floor(r / 3)) === (Math.floor(col / 3) === Math.floor(c / 3))) continue
      const b = row * 9 + c, d = r * 9 + col, e = r * 9 + c
      if (digits[a] === digits[e] && digits[b] === digits[d]) rectangles.push([a, b, d, e])
    }
  }
  if (!rectangles.length) return
  const relations = Array.from({ length: 10 }, (_, a) => Array.from({ length: 10 }, (_, b) => {
    let marks = 0
    if (negative.has('kropki-white') && Math.abs(a - b) === 1) marks |= 1
    if (negative.has('kropki-black') && Math.max(a, b) === 2 * Math.min(a, b)) marks |= 2
    if (negative.has('xv-five') && a + b === 5) marks |= 4
    if (negative.has('xv-ten') && a + b === 10) marks |= 8
    return marks
  }))
  const start = Math.floor(random() * rectangles.length)
  for (let i = 0; i < rectangles.length; i++) {
    const corners = rectangles[(start + i) % rectangles.length]
    const incident = edges.filter(([a, b]) => corners.includes(a) || corners.includes(b))
    const alternative = [...digits]
    const [a, b, d, e] = corners
    alternative[a] = alternative[e] = digits[b]
    alternative[b] = alternative[d] = digits[a]
    for (let attempt = 0; attempt < 32; attempt++) {
      const labels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      for (let k = 9; k > 1; k--) {
        const j = 1 + Math.floor(random() * k)
        const value = labels[k]
        labels[k] = labels[j]
        labels[j] = value
      }
      const sameMarks = incident.every(([x, y]) =>
        relations[labels[digits[x]]][labels[digits[y]]] === relations[labels[alternative[x]]][labels[alternative[y]]])
      if (sameMarks) return { solution: digits.map(digit => labels[digit]).join(''), alternative: alternative.map(digit => labels[digit]) }
    }
  }
}
