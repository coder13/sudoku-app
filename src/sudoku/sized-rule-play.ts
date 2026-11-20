import { EngineError, runEngine, type HintChoice, type House, type SizedConstraintStep, type SizedKropkiPair } from './engine.ts'
import { hintEliminations } from './game.ts'
import { MINI_TECHNIQUES, miniHintChoice, type MiniSolutionTrace } from './mini-play.ts'
import { gridDiagonalCells, type SizedGrid } from './grid.ts'
import { sizedRulePosition, type SizedRuleGame } from './sized-rule-game.ts'

export const SIZED_RULE_TECHNIQUES = [...MINI_TECHNIQUES, 'sized-diagonal', 'sized-parity', 'sized-thermometer', 'sized-renban', 'sized-kropki', 'sized-difference', 'sized-contradiction'] as const

function kropkiPairRule({ relation, negative }: SizedKropkiPair) {
  const white = relation === 'consecutive'
  if (negative) return white ? 'The digits on this unmarked edge cannot be consecutive.'
    : 'The digits on this unmarked edge cannot have a 1:2 ratio.'
  return white ? 'Digits separated by a white dot are consecutive.'
    : 'Across a black dot, one digit is double the other.'
}

function sizedRuleHintChoice({ rules }: SizedRuleGame, step: SizedConstraintStep, size: number): HintChoice {
  if (step.type === 'house') return miniHintChoice(step.proof)
  if (step.type === 'contradiction') return contradictionHint(rules, step, size)
  if (step.type === 'kropki') return {
    actions: step.actions, technique: 'sized-kropki',
    evidence: { variant: { description: kropkiPairRule(step.pair),
      reason: 'Remove the candidates that cannot be paired with a digit in the neighboring cell under this rule.' } },
    pattern: { houses: [], cells: [...step.pair.cells],
      candidates: step.actions.map(action => 'eliminate' in action ? action.eliminate : action.place) },
  }
  const { actions, rule: index } = step
  const rule = rules[index]
  const cells = rule.type === 'diagonal' ? gridDiagonalCells(size, rule.diagonal) : 'cells' in rule ? [...rule.cells] : []
  const candidates = actions.map(action => 'place' in action ? action.place : action.eliminate)
  let description: string
  let reason: string
  if (rule.type === 'diagonal') {
    const direction = rule.diagonal === 'main' ? 'top-left to bottom-right' : 'top-right to bottom-left'
    description = `Every digit from 1 to ${size} appears once on the ${direction} diagonal.`
    const action = actions[0]
    reason = 'place' in action
      ? `This is the only cell on the diagonal where ${action.place.digit} can go.`
      : 'A placed digit rules out the same candidate in the other cells on this diagonal.'
  } else if (rule.type === 'parity') {
    description = rule.parity === 'odd' ? 'A circle marks an odd digit.' : 'A square marks an even digit.'
    reason = `Remove the ${rule.parity === 'odd' ? 'even' : 'odd'} candidates from each marked cell.`
  } else if (rule.type === 'renban') {
    description = `The ${rule.cells.length} cells on this line contain different consecutive digits in any order.`
    reason = 'Remove each candidate that cannot be used in its cell in any consecutive set that fits the line.'
  } else if (rule.type === 'difference') {
    description = `The digits across this numbered marker differ by exactly ${rule.difference}.`
    reason = 'Remove the candidates that have no partner at that difference in the neighboring cell.'
  } else {
    description = 'The digits strictly increase along this thermometer, from the bulb to the tip.'
    reason = 'Each remaining candidate fits in at least one increasing sequence using the candidates along the thermometer. Remove the candidates that fit in none.'
  }
  return {
    actions, technique: `sized-${rule.type}`, evidence: { variant: { description, reason } },
    pattern: { houses: [], cells, candidates },
  }
}

function contradictionHint(rules: SizedRuleGame['rules'], { assumption, placements, failure }: Extract<SizedConstraintStep, { type: 'contradiction' }>, size: number): HintChoice {
  const reference = (cell: number) => `R${Math.floor(cell / size) + 1}C${cell % size + 1}`
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
      locations.push(...gridDiagonalCells(size, rule.diagonal))
      conflict = `The ${rule.diagonal === 'main' ? 'top-left to bottom-right' : 'top-right to bottom-left'} diagonal cannot contain every digit once.`
    } else if ('cells' in rule) {
      locations.push(...rule.cells)
      conflict = rule.type === 'parity' ? 'A marked cell has no digit of the required parity.'
        : rule.type === 'renban' ? 'No set of different consecutive digits fits the Renban line.'
          : rule.type === 'difference' ? `No pair of digits differs by exactly ${rule.difference} across the marker.`
            : 'The thermometer has no strictly increasing sequence from bulb to tip.'
    } else conflict = 'A Kropki clue has no valid pair of digits.'
  } else if (failure.type === 'kropki') {
    locations.push(...failure.pair.cells)
    conflict = `${kropkiPairRule(failure.pair)} The two cells have no candidates that fit the rule.`
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

function checkSizedRuleHintPosition({ solution }: SizedRuleGame, values: string, eliminations?: readonly number[]) {
  if (Array.from(values).some((digit, cell) => digit !== '0' && digit !== solution[cell])) {
    throw new EngineError('The placed digits conflict with this puzzle’s solution.', 'conflict')
  }
  if (eliminations?.some((mask, cell) => values[cell] === '0' && (mask & (1 << (Number(solution[cell]) - 1))))) {
    throw new EngineError('A required candidate is missing.', 'invalid-eliminations')
  }
}

export async function sizedRuleCandidates(game: SizedRuleGame, grid: SizedGrid, values: string, eliminations?: readonly number[]) {
  const candidates = await runEngine({ type: 'sized-variant', position: sizedRulePosition(grid, game, values), operation: 'candidates' })
  return candidates?.map((mask, cell) => mask & ~(eliminations?.[cell] ?? 0)) ?? null
}

export async function sizedRuleHintChoices(game: SizedRuleGame, grid: SizedGrid, values: string, eliminations?: readonly number[], run = runEngine) {
  checkSizedRuleHintPosition(game, values, eliminations)
  const result = await run({ type: 'sized-variant', position: sizedRulePosition(grid, game, values), operation: 'hints', eliminations, limit: 1024 })
  return result && { choices: result.choices.map(step => sizedRuleHintChoice(game, step, grid.size)), candidates: result.candidates }
}

export async function sizedRuleSolutionTrace(game: SizedRuleGame, grid: SizedGrid, givens: string): Promise<MiniSolutionTrace> {
  const trace = await runEngine({ type: 'sized-variant', position: sizedRulePosition(grid, game, givens), operation: 'trace' })
  if (!trace?.length) throw new EngineError('The puzzle contains conflicting givens or rules.', 'conflict')
  const steps: HintChoice[] = []
  const positions = trace.map(({ digits, eliminations, candidates, deduction }) => {
    const choice = deduction && sizedRuleHintChoice(game, deduction, grid.size)
    if (choice) steps.push(choice)
    return {
      givens, entries: digits.map((digit, cell) => givens[cell] === '0' ? digit : 0).join(''),
      eliminations, candidates, pattern: choice?.pattern,
    }
  })
  const board = trace.at(-1)!.digits.join('')
  return { board, steps, positions, status: board === game.solution ? 'solved' : 'stalled' }
}

export async function sizedRuleSingles(game: SizedRuleGame, grid: SizedGrid, values: string, eliminations?: readonly number[], displayedCandidates?: readonly number[]) {
  const removed = hintEliminations(values, displayedCandidates ?? null, eliminations, grid.size)
  checkSizedRuleHintPosition(game, values, removed)
  const trace = await runEngine({
    type: 'sized-variant', position: sizedRulePosition(grid, game, values), operation: 'trace', eliminations: removed, singlesOnly: true,
  })
  return trace?.at(-1)?.digits.join('') ?? values
}
