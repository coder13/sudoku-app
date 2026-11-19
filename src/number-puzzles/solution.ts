type Placement = { cell: number; value: number }

type SolutionBoard<Hint extends Placement> = {
  hints: (values: readonly number[], limit?: number) => readonly Hint[]
  check: (values: readonly number[]) => { complete: boolean }
  solve: () => readonly number[] | null
}

/** Record each position before its move, followed by the final position. */
export function numberSolution<Hint extends Placement>(board: SolutionBoard<Hint>, editable: readonly boolean[]) {
  const positions: (readonly number[])[] = [editable.map(() => 0)]
  const steps: (Hint | null)[] = []
  let values = positions[0]
  let complete = board.check(values).complete
  while (!complete) {
    const hint = board.hints(values, 1)[0]
    if (!hint || !editable[hint.cell] || values[hint.cell] || !hint.value) break
    values = values.map((value, cell) => cell === hint.cell ? hint.value : value)
    steps.push(hint)
    positions.push(values)
    complete = board.check(values).complete
  }
  if (!complete) {
    const solved = board.solve()
    if (solved && board.check(solved).complete) {
      steps.push(null)
      positions.push(solved)
      complete = true
    }
  }
  return { positions, steps, complete }
}
