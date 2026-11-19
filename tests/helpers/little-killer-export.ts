import type { VariantPuzzle } from '../../src/sudoku/engine.ts'
import { coachCode } from './coach-code.ts'

/** Convert checked native/PDF definitions into the official typed Coach schema; not an original publisher export. */
export function littleKillerCoach(puzzle: VariantPuzzle) {
  const constraints = []
  for (const rule of puzzle.rules ?? []) {
    if (rule.type === 'little-killer') {
      const dr = rule.direction.startsWith('north') ? -1 : 1,
        dc = rule.direction.endsWith('east') ? 1 : -1
      constraints.push({
        type: 'littleKiller',
        segments: [
          {
            cells: [[(rule.cells[0] % 9) - dc, Math.floor(rule.cells[0] / 9) - dr]],
            parameters: { positive: dr * dc < 0, value: rule.sum },
          },
        ],
        settings: {},
      })
    } else if (rule.type === 'sandwich') {
      const side =
        rule.direction === 'east'
          ? 'left'
          : rule.direction === 'west'
            ? 'right'
            : rule.direction === 'south'
              ? 'top'
              : 'bottom'
      constraints.push({
        type: 'sandwich',
        segments: [
          {
            cells: [],
            parameters: {
              side,
              index: side === 'top' || side === 'bottom' ? rule.cells[0] % 9 : Math.floor(rule.cells[0] / 9),
              value: rule.sum,
            },
          },
        ],
        settings: {},
      })
    } else if (rule.type === 'renban')
      constraints.push({ type: 'renban', segments: [{ cells: rule.cells, parameters: {} }], settings: {} })
    else throw new Error('The converted Coach control does not implement ' + rule.type)
  }
  const regions =
    puzzle.regions?.type === 'jigsaw'
      ? Array.from({ length: 81 }, (_, cell) =>
          puzzle.regions!.type === 'jigsaw' ? puzzle.regions!.regions.findIndex((cells) => cells.includes(cell)) : 0,
        )
      : undefined
  return coachCode({ givenDigits: puzzle.givens, ...(regions && { regions }), givenConstraints: constraints })
}
