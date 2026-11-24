import { quadrupleCells } from './variants.ts'
import { linkedDoubleArrowCells } from './sized-linked-double-arrow.ts'
import { EngineError, runEngine, type HintChoice, type House, type SizedConstraintStep, type SizedKropkiPair } from './engine.ts'
import { hintEliminations } from './game.ts'
import { MINI_TECHNIQUES, miniHintChoice, type MiniSolutionTrace } from './mini-play.ts'
import { gridDiagonalCells, rowColumnSumTotal, type SizedGrid } from './grid.ts'
import { sizedRulePosition, type SizedRuleGame } from './sized-rule-game.ts'

export const SIZED_RULE_TECHNIQUES = [...MINI_TECHNIQUES, 'sized-diagonal', 'sized-parity', 'sized-thermometer', 'sized-slow-thermometer', 'sized-whispers', 'sized-xv', 'sized-sandwich', 'sized-extra-house', 'sized-killer-cages', 'sized-quadruple', 'sized-renban', 'sized-kropki', 'sized-labeled-dots', 'sized-difference', 'sized-anti-sum', 'sized-row-column-sum', 'sized-arrow', 'sized-double-arrow', 'sized-region-sum', 'sized-contradiction'] as const

function kropkiPairRule({ relation, negative, value }: SizedKropkiPair) {
  const white = relation === 'consecutive'
  if (negative) return white ? 'The digits on this unmarked edge cannot be consecutive.'
    : 'The digits on this unmarked edge cannot have a 1:2 ratio.'
  if (value !== undefined) return white ? `The digits across this white dot differ by exactly ${value}.`
    : `Across this black dot, one digit is ${value} times the other.`
  return white ? 'Digits separated by a white dot are consecutive.'
    : 'Across a black dot, one digit is double the other.'
}

function sizedRuleHintChoice({ rules }: SizedRuleGame, step: SizedConstraintStep, grid: SizedGrid): HintChoice {
  const { size } = grid
  if (step.type === 'house') return miniHintChoice(step.proof)
  if (step.type === 'contradiction') return contradictionHint(rules, step, size)
  if (step.type === 'kropki') return {
    actions: step.actions, technique: step.pair.value === undefined ? 'sized-kropki' : 'sized-labeled-dots',
    evidence: { variant: { description: kropkiPairRule(step.pair),
      reason: 'Remove the candidates that cannot be paired with a digit in the neighboring cell under this rule.' } },
    pattern: { houses: [], cells: [...step.pair.cells],
      candidates: step.actions.map(action => 'eliminate' in action ? action.eliminate : action.place) },
  }
  if (step.type === 'quadruple-overlap') {
    const [first, second] = step.rules.map(index => rules[index])
    if (first?.type !== 'quadruple' || (second?.type !== 'quadruple' && second?.type !== 'region-sum')) {
      throw new Error('Invalid overlapping Quadruple hint.')
    }
    const at = (cell: number) => `R${Math.floor(cell / size) + 1}C${cell % size + 1}`
    const list = new Intl.ListFormat('en')
    const circle = (clue: typeof first) => {
      const [start, , , end] = quadrupleCells(clue.topLeft, size)
      return `the ${list.format(clue.digits.map(String))} circle covering ${at(start)} through ${at(end)}`
    }
    const other = second.type === 'quadruple' ? circle(second)
      : `the Region Sum line from ${at(second.cells[0])} to ${at(second.cells.at(-1)!)}`
    const otherCells = second.type === 'quadruple' ? quadrupleCells(second.topLeft, size) : second.cells
    const shared = quadrupleCells(first.topLeft, size).filter(cell => otherCells.includes(cell))
    const lineRule = second.type !== 'region-sum' ? '' : second.groupByRegion
      ? ' The line cells in each region must have the same total.'
      : ' The line segments between region borders must have the same total.'
    const houses = ['rows', 'columns']
    if (!('noRegions' in grid)) houses.push('regions' in grid ? 'regions' : 'boxes')
    if (rules.some(rule => rule.type === 'diagonal')) houses.push('marked diagonals')
    if (rules.some(rule => rule.type === 'extra-house')) houses.push('extra regions')
    return {
      actions: step.actions, technique: 'sized-quadruple',
      evidence: { variant: {
        description: `Compare ${circle(first)} with ${other}. Both clues must use the same digits in ${list.format(shared.map(at))}.`,
        reason: `Fit each printed digit in a separate cell.${lineRule} Keep digits distinct in shared ${list.format(houses)}. Remove each candidate that fits no arrangement of both clues.`,
      } },
      pattern: { houses: [], cells: step.cells,
        candidates: step.actions.map(action => 'eliminate' in action ? action.eliminate : action.place) },
    }
  }
  const { actions, rule: index } = step
  const rule = rules[index]
  const cage = rule.type === 'killer-cages' ? rule.cages.find(({ cells }) => actions.every(action =>
    cells.includes(('eliminate' in action ? action.eliminate : action.place).cell))) : undefined
  const cells = step.type === 'anti-sum' || step.type === 'row-column-sum' ? step.cells : cage ? [...cage.cells] : rule.type === 'diagonal' ? gridDiagonalCells(size, rule.diagonal)
    : rule.type === 'quadruple' ? [...quadrupleCells(rule.topLeft, size)]
    : rule.type === 'arrow' ? [rule.circle, ...rule.cells]
      : rule.type === 'double-arrow' ? [rule.ends[0], ...rule.cells, rule.ends[1]]
        : rule.type === 'linked-double-arrow' ? linkedDoubleArrowCells(rule, size)
          : rule.type === 'xv' ? [...(rule.five?.pairs ?? []), ...(rule.ten?.pairs ?? [])].flat()
        : 'cells' in rule ? [...rule.cells] : []
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
  } else if (rule.type === 'quadruple') {
    description = `The four cells around the circle must include ${new Intl.ListFormat('en').format(rule.digits.map(String))}.`
    reason = 'Remove each candidate that leaves no way to fit the printed digits in separate cells while avoiding repeats in shared houses.'
  } else if (rule.type === 'killer-cages') {
    description = cage ? `The digits in this cage add up to ${cage.sum} and cannot repeat.` : 'Digits in a cage add to its total and cannot repeat.'
    reason = 'Remove the candidates that cannot be part of a set of different digits with this total.'
  } else if (rule.type === 'extra-house') {
    description = `Every digit from 1 to ${size} appears once in this extra region.`
    reason = 'Remove candidates that cannot appear in an assignment of different digits across this region.'
  } else if (rule.type === 'parity') {
    description = rule.parity === 'odd' ? 'A circle marks an odd digit.' : 'A square marks an even digit.'
    reason = `Remove the ${rule.parity === 'odd' ? 'even' : 'odd'} candidates from each marked cell.`
  } else if (rule.type === 'renban') {
    description = `The ${rule.cells.length} cells on this line contain different consecutive digits in any order.`
    reason = 'Remove each candidate that cannot be used in its cell in any consecutive set that fits the line.'
  } else if (rule.type === 'region-sum') {
    const irregular = 'regions' in grid
    description = rule.groupByRegion
      ? `The cells on this line have the same total in each ${irregular ? 'region' : 'box'}.`
      : `${irregular ? 'Region' : 'Box'} borders split this line into segments with the same total.`
    reason = 'Remove the candidates that cannot contribute to a total shared by every part of the line.'
  } else if (rule.type === 'arrow') {
    description = 'The digits along this arrow add up to the digit in its bulb.'
    reason = 'Remove the candidates that cannot appear in an arrow sum that fits the bulb.'
  } else if (rule.type === 'linked-double-arrow') {
    description = 'The Double Arrow line and its two end circles have the same total. Each X-Sum adds the first X digits from its end.'
    reason = 'Remove candidates that cannot fit both totals with the correct X-Sum lengths.'
  } else if (rule.type === 'double-arrow') {
    description = 'The digits along this Double Arrow add up to the sum of the digits in its two end circles.'
    reason = 'Remove candidates that cannot contribute to a shared total while keeping different digits in cells that share a house.'
  } else if (step.type === 'row-column-sum') {
    const [a, b] = step.cells
    const unit = b - a === 1 ? 'row' : 'column'
    const total = rowColumnSumTotal(step.cells, size)
    description = step.unmarked
      ? `This is the only edge without a diamond that can still meet the required ${unit} sum of ${total}.`
      : `Across this diamond, the two digits add to ${unit} number ${total}.`
    reason = 'Remove each candidate that has no different partner with that sum.'
  } else if (rule.type === 'anti-sum') {
    const [first, second] = cells
    const shared = second - first === 1 ? `row ${Math.floor(first / size) + 1}` : `column ${first % size + 1}`
    description = `These cells share ${shared}, so their digits must differ. Anti-Sum also rules out pairs that add to ${rule.sum}.`
    reason = 'Remove each candidate that has no partner in the neighboring cell under both rules.'
  } else if (rule.type === 'difference') {
    description = `The digits across this numbered marker differ by exactly ${rule.difference}.`
    reason = 'Remove the candidates that have no partner at that difference in the neighboring cell.'
  } else if (rule.type === 'slow-thermometer') {
    description = 'Digits stay the same or increase from the bulb to the tip of this slow thermometer.'
    reason = 'Remove each candidate that cannot fit in a non-decreasing sequence along the line.'
  } else if (rule.type === 'whispers') {
    description = `Neighboring digits on this Whispers line differ by at least ${rule.minDifference}.`
    reason = 'Remove each candidate that cannot pair with a digit in the next cell at the required difference.'
  } else if (rule.type === 'xv') {
    description = 'Digits joined by V add to 5. Digits joined by X add to 10.'
    reason = 'Remove each candidate that cannot fit the total shown by the marker.'
  } else if (rule.type === 'sandwich') {
    description = `The digits between 1 and ${size} in this ${rule.direction === 'north' || rule.direction === 'south' ? 'column' : 'row'} add to ${rule.sum}.`
    reason = 'Remove each candidate that cannot fit a row or column arrangement with the printed sandwich total.'
  } else {
    description = 'The digits strictly increase along this thermometer, from the bulb to the tip.'
    reason = 'Each remaining candidate fits in at least one increasing sequence using the candidates along the thermometer. Remove the candidates that fit in none.'
  }
  return {
    actions, technique: rule.type === 'linked-double-arrow' ? 'sized-double-arrow' : `sized-${rule.type}`, evidence: { variant: { description, reason } },
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
    } else if (rule.type === 'arrow') {
      locations.push(rule.circle, ...rule.cells)
      conflict = 'No set of digits along the arrow can add up to a digit in the bulb.'
    } else if (rule.type === 'linked-double-arrow') {
      locations.push(...linkedDoubleArrowCells(rule, size))
      conflict = 'No total fits the Double Arrow line and its two end circles with the correct X-Sum lengths.'
    } else if (rule.type === 'double-arrow') {
      locations.push(rule.ends[0], ...rule.cells, rule.ends[1])
      conflict = 'No total fits the Double Arrow line and its two end circles with different digits in each shared house.'
    } else if (rule.type === 'quadruple') {
      locations.push(...quadrupleCells(rule.topLeft, size))
      conflict = 'There is no way to place all the digits in the circle in separate surrounding cells.'
    } else if (rule.type === 'killer-cages') {
      conflict = 'A cage cannot reach its total with different digits.'
    } else if (rule.type === 'xv') {
      locations.push(...(rule.five?.pairs ?? []).flat(), ...(rule.ten?.pairs ?? []).flat())
      conflict = 'An X or V marker has no pair of digits with its required total.'
    } else if ('cells' in rule) {
      locations.push(...rule.cells)
      conflict = rule.type === 'parity' ? 'A marked cell has no digit of the required parity.'
        : rule.type === 'extra-house' ? 'The extra region cannot contain each digit once.'
        : rule.type === 'renban' ? 'No set of different consecutive digits fits the Renban line.'
          : rule.type === 'difference' ? `No pair of digits differs by exactly ${rule.difference} across the marker.`
            : rule.type === 'region-sum' ? 'No total fits every part of this Region Sum line.'
              : rule.type === 'whispers' ? 'No neighboring digits meet the minimum difference on this Whispers line.'
                : rule.type === 'sandwich' ? `The row or column cannot fit the sandwich total of ${rule.sum}.`
                  : rule.type === 'slow-thermometer' ? 'The slow thermometer has no non-decreasing sequence from bulb to tip.'
                    : 'The thermometer has no strictly increasing sequence from bulb to tip.'
    } else conflict = 'A Kropki clue has no valid pair of digits.'
  } else if (failure.type === 'killer-cage') {
    const rule = rules[failure.rule]
    const cage = rule.type === 'killer-cages' ? rule.cages[failure.cage] : undefined
    if (cage) locations.push(...cage.cells)
    conflict = cage ? `The cage at ${reference(Math.min(...cage.cells))} cannot reach ${cage.sum} with different digits.`
      : 'A cage cannot reach its total with different digits.'
  } else if (failure.type === 'row-column-sum') {
    if (failure.cells) {
      locations.push(...failure.cells)
      const total = rowColumnSumTotal(failure.cells, size)
      conflict = `No pair of different digits across the diamond at ${reference(failure.cells[0])} and ${reference(failure.cells[1])} can add to ${total}.`
    } else {
      conflict = 'No unmarked edge can reach its row or column sum.'
    }
  } else if (failure.type === 'anti-sum') {
    const rule = rules[failure.rule]
    locations.push(...failure.cells)
    conflict = rule.type === 'anti-sum'
      ? `No pair of different digits in ${reference(failure.cells[0])} and ${reference(failure.cells[1])} can avoid a sum of ${rule.sum}.`
      : 'The neighboring cells have no pair of digits that fits the rule.'
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

export async function sizedRuleCandidates(game: SizedRuleGame, grid: SizedGrid, values: string, eliminations?: readonly number[], run = runEngine) {
  const candidates = await run({ type: 'sized-variant', position: sizedRulePosition(grid, game, values), operation: 'candidates' })
  return candidates?.map((mask, cell) => mask & ~(eliminations?.[cell] ?? 0)) ?? null
}

export async function sizedRuleHintChoices(game: SizedRuleGame, grid: SizedGrid, values: string, eliminations?: readonly number[], run = runEngine) {
  checkSizedRuleHintPosition(game, values, eliminations)
  const result = await run({ type: 'sized-variant', position: sizedRulePosition(grid, game, values), operation: 'hints', eliminations, limit: 1024 })
  return result && { choices: result.choices.map(step => sizedRuleHintChoice(game, step, grid)), candidates: result.candidates }
}

export async function sizedRuleSolutionTrace(game: SizedRuleGame, grid: SizedGrid, givens: string, run = runEngine): Promise<MiniSolutionTrace> {
  const trace = await run({ type: 'sized-variant', position: sizedRulePosition(grid, game, givens), operation: 'trace' })
  if (!trace?.length) throw new EngineError('The puzzle contains conflicting givens or rules.', 'conflict')
  const steps: HintChoice[] = []
  const positions = trace.map(({ digits, eliminations, candidates, deduction }) => {
    const choice = deduction && sizedRuleHintChoice(game, deduction, grid)
    if (choice) steps.push(choice)
    return {
      givens, entries: digits.map((digit, cell) => givens[cell] === '0' ? digit : 0).join(''),
      eliminations, candidates, pattern: choice?.pattern,
    }
  })
  const board = trace.at(-1)!.digits.join('')
  return { board, steps, positions, status: board === game.solution ? 'solved' : 'stalled' }
}

export async function sizedRuleSingles(game: SizedRuleGame, grid: SizedGrid, values: string, eliminations?: readonly number[], displayedCandidates?: readonly number[], run = runEngine) {
  const removed = hintEliminations(values, displayedCandidates ?? null, eliminations, grid.size)
  checkSizedRuleHintPosition(game, values, removed)
  const trace = await run({
    type: 'sized-variant', position: sizedRulePosition(grid, game, values), operation: 'trace', eliminations: removed, singlesOnly: true,
  })
  return trace?.at(-1)?.digits.join('') ?? values
}
