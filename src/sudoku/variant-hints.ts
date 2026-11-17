import type { HintChoice, LogicalSolution, SolvePosition, VariantDeduction, VariantPuzzle, VariantTrace } from './engine'
import { cellReference, type CellReferenceOptions } from './hints.ts'
import { hasMarkedPair, variantHouseCells, variantHouseMasks, variantHouseName } from './variants.ts'

export function variantHintChoice(deduction: VariantDeduction, puzzle: VariantPuzzle, options: CellReferenceOptions = {}): HintChoice {
  const { actions, evidence, technique } = deduction
  const nameCell = (cell: number) => cellReference(cell, options.cellReferenceStyle ?? 'concise', options.difficulty)
  const focus = actions.map((action) => 'place' in action ? action.place : action.eliminate)
  if (evidence.type === 'classic') return {
    actions, technique, evidence: evidence.proof,
    pattern: { houses: [], cells: [...new Set(focus.map(({ cell }) => cell))], candidates: focus },
  }
  let cells: readonly number[]
  let description: string
  let reason = ''
  switch (evidence.type) {
    case 'single': {
      const { candidate, house } = evidence
      const location = nameCell(candidate.cell)
      cells = house ? variantHouseCells(house, puzzle) : [candidate.cell]
      if (!house) {
        description = `Only ${candidate.digit} remains in ${location}.`
      } else {
        const name = variantHouseName(house, puzzle)
        description = technique === 'full-house'
          ? `Digit ${candidate.digit} is missing from the ${name}, which has one empty cell.`
          : `${location} is the only cell in the ${name} that can contain ${candidate.digit}.`
      }
      break
    }
    case 'intersection': {
      cells = evidence.cells
      const source = variantHouseName(evidence.source, puzzle)
      const target = variantHouseName(evidence.target, puzzle)
      description = `In the ${source}, digit ${evidence.digit} can only go in cells shared with the ${target}.`
      reason = `The other cells in ${target} cannot contain ${evidence.digit}.`
      break
    }
    case 'locked-digit': {
      cells = evidence.clue.cells
      const printed = evidence.clue.rules.flatMap(index => {
        const rule = puzzle.rules?.[index]
        return rule?.type === 'quadruple' ? rule.digits : []
      })
      const target = variantHouseName(evidence.target, puzzle)
      description = `The Quadruple circle (${printed.join(', ')}) requires ${evidence.digit} somewhere in ${target}.`
      reason = `The other cells in ${target} cannot contain ${evidence.digit}.`
      break
    }
    case 'cage-sum': {
      cells = evidence.cells
      if (evidence.house) {
        description = `The digits in the ${variantHouseName(evidence.house, puzzle)} add to 45. Comparing this with the cage totals gives a sum of ${evidence.sum} for the highlighted cells.`
      } else {
        description = `The highlighted cage needs distinct digits that add to ${evidence.sum}.`
      }
      reason = 'No valid combination for that sum includes a crossed-out candidate.'
      break
    }
    case 'constraint': {
      cells = evidence.cells
      switch (technique) {
        case 'parity': {
          const rule = evidence.rules.map(index => puzzle.rules?.[index]).find(rule => rule?.type === 'parity')
          if (rule?.type === 'parity') {
            const location = nameCell(cells[0])
            description = rule.parity === 'odd'
              ? `${location} has an odd circle, so it can contain only 1, 3, 5, 7, or 9.`
              : `${location} has an even square, so it can contain only 2, 4, 6, or 8.`
            reason = `Remove ${focus.map(({ digit }) => digit).join(', ')} from ${location}; ${rule.parity === 'odd' ? 'even' : 'odd'} digits cannot satisfy this marker.`
          } else description = 'The odd or even marker restricts the highlighted cell.'
          break
        }
        case 'quadruple': {
          const printed = evidence.rules.flatMap(index => {
            const rule = puzzle.rules?.[index]
            return rule?.type === 'quadruple' ? rule.digits : []
          })
          description = `The circle requires ${printed.join(', ')} in its four surrounding cells. Each repeated digit needs a separate cell.`
          break
        }
        case 'anti-knight':
          description = 'The highlighted cells are a chess knight’s move apart, so they must contain different digits.'
          break
        case 'anti-king': {
          const name = nameCell
          description = `${cells.map(name).join(' and ')} touch at a corner. Anti-King requires different digits in these cells.`
          reason = focus.map(({ cell, digit }) => `${digit} cannot go in ${name(cell)}; ${name(cells.find(other => other !== cell)!)} is restricted to ${digit}.`).join(' ')
          break
        }
        case 'thermometer':
          description = 'Digits along the highlighted thermometer must increase from the bulb toward the tip.'
          break
        case 'arrow':
          description = 'The digits on the highlighted arrow must add to the digit in its circle.'
          break
        case 'kropki': {
          const [a, b] = cells
          const rules = evidence.rules.map((index) => puzzle.rules?.[index]).filter((rule) => rule?.type === 'kropki')
          const ratio = rules.some((rule) => hasMarkedPair(rule.ratioTwo?.pairs, a, b))
          const consecutive = rules.some((rule) => hasMarkedPair(rule.consecutive?.pairs, a, b))
          const noConsecutive = rules.some(rule => rule.consecutive?.negative && !hasMarkedPair(rule.consecutive.pairs, a, b))
          const noRatio = rules.some(rule => rule.ratioTwo?.negative && !hasMarkedPair(rule.ratioTwo.pairs, a, b))
          description = ratio && consecutive ? 'The two dots require consecutive digits with one double the other, so the pair must be 1 and 2.' : [
            consecutive && 'The white dot requires these two digits to be consecutive.',
            ratio && 'The black dot requires one of these digits to be double the other.',
            noConsecutive && 'There is no white dot between these cells, so their digits cannot be consecutive.',
            noRatio && 'There is no black dot between these cells, so neither digit can be double the other.',
          ].filter(Boolean).join(' ') || 'The Kropki rules restrict the highlighted cells.'
          break
        }
        default: description = 'The marked rule restricts the highlighted cells.'
      }
      reason ||= 'None of the valid digit combinations for these cells can use the crossed-out candidates.'
      break
    }
  }
  return {
    technique, actions,
    evidence: { variant: { description, reason, source: { deduction, puzzle } } },
    pattern: { houses: [], cells: [...cells], candidates: focus },
  }
}

export function variantSolutionPath(trace: VariantTrace): LogicalSolution {
  const puzzle = trace.start.puzzle
  const { givens } = puzzle
  const entries = [...trace.start.entries]
  const eliminations = [...trace.start.eliminations]
  const positions: SolvePosition[] = []
  const steps = trace.steps.map((deduction) => {
    const hint = variantHintChoice(deduction, puzzle)
    const joined = entries.join('')
    const values = [...givens].map((given, cell) => given === '0' ? entries[cell] : given).join('')
    positions.push({
      givens, entries: joined, eliminations: [...eliminations],
      candidates: variantHouseMasks(puzzle, values, eliminations), pattern: hint.pattern,
    })
    for (const action of deduction.actions) {
      if ('place' in action) entries[action.place.cell] = String(action.place.digit)
      else eliminations[action.eliminate.cell] |= 1 << (action.eliminate.digit - 1)
    }
    return hint
  })
  const board = [...givens].map((digit, cell) => digit === '0' ? entries[cell] : digit).join('')
  positions.push({
    givens, entries: entries.join(''), eliminations, candidates: variantHouseMasks(puzzle, board, eliminations),
  })
  const { points, counts, hardest, status, scoringVersion, techniqueOrder } = trace.rating
  return { board, steps, positions, rating: { score: { points, counts, hardest }, status, scoringVersion, techniqueOrder } }
}
