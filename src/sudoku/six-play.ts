import { EngineError, runEngine, type HintChoice, type House, type SixGrid, type SizedConstraintStep } from './engine.ts'
import { hintEliminations } from './game.ts'
import { MINI_TECHNIQUES, miniHintChoice, type MiniSolutionTrace } from './mini-play.ts'
import { sixDiagonalCells } from './grid.ts'
import { sixPosition, type SixGame } from './six-game.ts'

export const SIX_TECHNIQUES = [...MINI_TECHNIQUES, 'sized-diagonal', 'sized-parity', 'sized-thermometer', 'sized-renban', 'sized-contradiction'] as const

function sixHintChoice({ rules }: SixGame, step: SizedConstraintStep): HintChoice {
  if (step.type === 'house') return miniHintChoice(step.proof)
  if (step.type === 'contradiction') return contradictionHint(rules, step)
  const { actions, rule: index } = step
  const rule = rules[index]
  const cells = rule.type === 'diagonal' ? sixDiagonalCells(rule.diagonal) : [...rule.cells]
  const candidates = actions.map(action => 'place' in action ? action.place : action.eliminate)
  let description: string
  let reason: string
  if (rule.type === 'diagonal') {
    const direction = rule.diagonal === 'main' ? 'top-left to bottom-right' : 'top-right to bottom-left'
    description = `Every digit from 1 to 6 appears once on the ${direction} diagonal.`
    const action = actions[0]
    reason = 'place' in action
      ? `This is the only cell on the diagonal where ${action.place.digit} can go.`
      : 'A placed digit rules out the same candidate in the other cells on this diagonal.'
  } else if (rule.type === 'parity') {
    description = rule.parity === 'odd' ? 'A circle marks an odd digit.' : 'A square marks an even digit.'
    reason = rule.parity === 'odd' ? 'The marked cells can only contain 1, 3, or 5.' : 'The marked cells can only contain 2, 4, or 6.'
  } else if (rule.type === 'renban') {
    description = `The ${rule.cells.length} cells on this line contain different consecutive digits in any order.`
    reason = 'Remove each candidate that cannot be used in its cell in any consecutive set that fits the line.'
  } else {
    description = 'The digits strictly increase along this thermometer, from the bulb to the tip.'
    reason = 'Each remaining candidate fits in at least one increasing sequence using the candidates along the thermometer. Remove the candidates that fit in none.'
  }
  return {
    actions, technique: `sized-${rule.type}`, evidence: { variant: { description, reason } },
    pattern: { houses: [], cells, candidates },
  }
}

function contradictionHint(rules: SixGame['rules'], { assumption, placements, failure }: Extract<SizedConstraintStep, { type: 'contradiction' }>): HintChoice {
  const reference = (cell: number) => `R${Math.floor(cell / 6) + 1}C${cell % 6 + 1}`
  const houseName = (house: House) => 'row' in house ? `row ${house.row + 1}`
    : 'column' in house ? `column ${house.column + 1}`
    : 'box' in house ? `box ${house.box + 1}` : 'the extra house'
  const locations = [assumption.cell]
  let conflict: string
  if (failure.type === 'cell') {
    locations.push(failure.cell)
    conflict = `${reference(failure.cell)} has no candidate left.`
  } else if (failure.type === 'rule') {
    const rule = rules[failure.rule]
    if (rule.type === 'diagonal') {
      locations.push(...sixDiagonalCells(rule.diagonal))
      conflict = `The ${rule.diagonal === 'main' ? 'top-left to bottom-right' : 'top-right to bottom-left'} diagonal cannot contain every digit once.`
    } else {
      locations.push(...rule.cells)
      conflict = rule.type === 'parity' ? 'A marked cell has no digit of the required parity.'
        : rule.type === 'renban' ? 'No set of different consecutive digits fits the Renban line.'
          : 'The thermometer has no strictly increasing sequence from bulb to tip.'
    }
  } else {
    const house = houseName(failure.house)
    conflict = failure.type === 'missing-digit' ? `There is nowhere for ${failure.digit} in ${house}.`
      : `Two placements of ${failure.digit} share ${house}.`
  }
  const first = placements.slice(0, 3).map(({ cell, digit }) => `${reference(cell)} is ${digit}`)
  const followed = first.length ? `The next placements are ${first.join(', ')}.` : ''
  const more = placements.length - first.length
  const intermediate = more > 0 ? `A further ${more} ${more === 1 ? 'placement follows' : 'placements follow'}.` : ''
  return {
    actions: [{ eliminate: assumption }], technique: 'sized-contradiction',
    evidence: { variant: {
      description: [`If ${reference(assumption.cell)} is ${assumption.digit}, follow the rules and the forced moves.`, followed, intermediate].filter(Boolean).join(' '),
      reason: `${conflict} Remove ${assumption.digit} from ${reference(assumption.cell)}.`,
    } },
    pattern: { houses: 'house' in failure ? [failure.house] : [], cells: [...new Set(locations)], candidates: [assumption] },
  }
}

function checkSixHintPosition({ solution }: SixGame, values: string, eliminations?: readonly number[]) {
  if (Array.from(values).some((digit, cell) => digit !== '0' && digit !== solution[cell])) {
    throw new EngineError('The placed digits conflict with this puzzle’s solution.', 'conflict')
  }
  if (eliminations?.some((mask, cell) => values[cell] === '0' && (mask & (1 << (Number(solution[cell]) - 1))))) {
    throw new EngineError('A required candidate is missing.', 'invalid-eliminations')
  }
}

export async function sixCandidates(game: SixGame, grid: SixGrid, values: string, eliminations?: readonly number[]) {
  const candidates = await runEngine({ type: 'sized-variant', position: sixPosition(grid, game, values), operation: 'candidates' })
  return candidates?.map((mask, cell) => mask & ~(eliminations?.[cell] ?? 0)) ?? null
}

export async function sixHintChoices(game: SixGame, grid: SixGrid, values: string, eliminations?: readonly number[], run = runEngine) {
  checkSixHintPosition(game, values, eliminations)
  const result = await run({ type: 'sized-variant', position: sixPosition(grid, game, values), operation: 'hints', eliminations, limit: 1024 })
  return result && { choices: result.choices.map(step => sixHintChoice(game, step)), candidates: result.candidates }
}

export async function sixSolutionTrace(game: SixGame, grid: SixGrid, givens: string): Promise<MiniSolutionTrace> {
  const trace = await runEngine({ type: 'sized-variant', position: sixPosition(grid, game, givens), operation: 'trace' })
  if (!trace?.length) throw new EngineError('The puzzle contains conflicting givens or rules.', 'conflict')
  const steps: HintChoice[] = []
  const positions = trace.map(({ digits, eliminations, candidates, deduction }) => {
    const choice = deduction && sixHintChoice(game, deduction)
    if (choice) steps.push(choice)
    return {
      givens, entries: digits.map((digit, cell) => givens[cell] === '0' ? digit : 0).join(''),
      eliminations, candidates, pattern: choice?.pattern,
    }
  })
  const board = trace.at(-1)!.digits.join('')
  return { board, steps, positions, status: board === game.solution ? 'solved' : 'stalled' }
}

export async function sixSingles(game: SixGame, grid: SixGrid, values: string, eliminations?: readonly number[], displayedCandidates?: readonly number[]) {
  const removed = hintEliminations(values, displayedCandidates ?? null, eliminations, grid.size)
  checkSixHintPosition(game, values, removed)
  const trace = await runEngine({
    type: 'sized-variant', position: sixPosition(grid, game, values), operation: 'trace', eliminations: removed, singlesOnly: true,
  })
  return trace?.at(-1)?.digits.join('') ?? values
}
