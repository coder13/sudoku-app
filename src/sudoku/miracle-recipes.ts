import type { CustomDifficulty, CustomRule } from './custom-modes.ts'
import type { VariantPuzzle, VariantRule } from './engine.ts'
import { reflectVariant } from './variant-generation.ts'

// Each position names the direction into the grid and its one-based row or column.
// The construction audit found these zero-given layouts by removing X-Sum clues.
const diagonalXSums: Partial<Record<CustomDifficulty, { solution: string; positions: string }>> = {
  'hard': { solution: '942187356853246197761935842284351679397864215615792438439528761126479583578613924',
    positions: 'W5 E5 S7 N7 N5 S5 W9 E9 S2 N2 W8 E8 E7 W7 N8 S8 E4 W4 E1 W1 E3 W3 W2 E2' },
  'very-hard': { solution: '143975826279816354856432179387549261625187493914623785538264917792351648461798532',
    positions: 'W4 E4 W6 S6 N6 W2 E2 S1 N9 S9 W9 N8 S8 N2 S2 S5' },
  'expert': { solution: '942187356853246197761935842284351679397864215615792438439528761126479583578613924',
    positions: 'W5 S7 N5 E9 S2 W8 E8 E7 W7 S8 E4 W4 W1 E3 W2 E2' },
  'master': { solution: '539178426468532719271496538685721943912643857743859261156287394327964185894315672',
    positions: 'S2 N1 E5 E2 E6 W6 N6 N7 S7 E4 W4 N5 S5 S9 N9' },
  'extreme': { solution: '365291478478635219921748563614589327852367941739412685146973852283154796597826134',
    positions: 'E2 W2 E4 W4 S5 N5 W5 N8 W7 N4 S3 W8 S7 N7 E9 N2' },
  'impossible': { solution: '942187356853246197761935842284351679397864215615792438439528761126479583578613924',
    positions: 'W5 S7 N5 E9 W8 E8 E7 W7 S8 E4 W4 W1 E3 W2 E2' },
}

export function checkedMiracleLayouts(rules: ReadonlySet<CustomRule>, difficulty: CustomDifficulty): VariantPuzzle[] {
  if (rules.size !== 2 || !rules.has('x-sum') || !rules.has('diagonal-main') && !rules.has('diagonal-anti')) return []
  const recipe = diagonalXSums[difficulty]
  if (!recipe) return []
  const directions: Record<string, Extract<VariantRule, { type: 'x-sum' }>['direction']> = { N: 'north', E: 'east', S: 'south', W: 'west' }
  const clues: VariantRule[] = [{ type: 'diagonal', diagonal: 'main' }]
  for (const position of recipe.positions.split(' ')) {
    const direction = directions[position[0]]
    const index = Number(position[1]) - 1
    const horizontal = direction === 'east' || direction === 'west'
    const cells = Array.from({ length: 9 }, (_, offset) => horizontal ? 9 * index + offset : 9 * offset + index)
    if (direction === 'north' || direction === 'west') cells.reverse()
    const prefix = cells.slice(0, Number(recipe.solution[cells[0]]))
    const sum = prefix.reduce((total, cell) => total + Number(recipe.solution[cell]), 0)
    clues.push({ type: 'x-sum', direction, cells, sum })
  }
  const template: VariantPuzzle = { version: 1, extendedLogic: true, givens: recipe.solution, rules: clues }
  return rules.has('diagonal-main') ? [template] : [2, 4, 3, 5].map(flip => reflectVariant(template, flip))
}
