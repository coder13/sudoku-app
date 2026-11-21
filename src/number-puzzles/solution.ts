type Placement = { cell: number; value: number }

type SolutionBoard<Hint extends Placement> = {
  // Each hint in the list follows from the position and the hints before it.
  solutionHints?: (values: readonly number[]) => readonly Hint[]
  hints: (values: readonly number[], limit?: number) => readonly Hint[]
  check: (values: readonly number[], mode: 'solution') => { complete: boolean }
  solve: () => readonly number[] | null
}

/** Record each position before its move, followed by the final position. */
export function numberSolution<Hint extends Placement>(board: SolutionBoard<Hint>, editable: readonly boolean[]) {
  const positions: (readonly number[])[] = [editable.map(() => 0)]
  const steps: (Hint | null)[] = []
  let values = positions[0]
  let complete = board.check(values, 'solution').complete
  while (!complete) {
    const hints = board.solutionHints?.(values) ?? board.hints(values, 1)
    const before = steps.length
    for (const hint of hints) {
      if (!editable[hint.cell] || values[hint.cell] || !hint.value) break
      values = values.map((value, cell) => cell === hint.cell ? hint.value : value)
      steps.push(hint)
      positions.push(values)
      if (!board.solutionHints) break
    }
    if (steps.length === before) break
    complete = board.check(values, 'solution').complete
  }
  if (!complete) {
    const solved = board.solve()
    if (solved && board.check(solved, 'solution').complete) {
      steps.push(null)
      positions.push(solved)
      complete = true
    }
  }
  return { positions, steps, complete }
}
