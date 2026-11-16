export function rectangleSelection(start: number, end: number): number[] {
  const [top, bottom] = [Math.floor(start / 9), Math.floor(end / 9)].sort((a, b) => a - b)
  const [left, right] = [start % 9, end % 9].sort((a, b) => a - b)
  const result = []
  for (let row = top; row <= bottom; row++) {
    for (let column = left; column <= right; column++) result.push(row * 9 + column)
  }
  return result
}
