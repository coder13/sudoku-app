import type { HintChoice, LogicalSolution, SolvePosition, VariantDeduction, VariantPuzzle, VariantTrace } from './engine'
import { cellReference } from './hints.ts'
import { hasMarkedPair, variantHouseCells, variantHouseMasks, variantHouseName } from './variants.ts'

export function variantHintChoice(deduction: VariantDeduction, puzzle: VariantPuzzle): HintChoice {
  const { actions, evidence, technique } = deduction
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
      const location = cellReference(candidate.cell, 'concise')
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
      reason = `The other cells in the ${target} cannot contain ${evidence.digit}.`
      break
    }
    case 'cage-sum': {
      cells = evidence.cells
      if (evidence.house) {
        description = `The digits in the ${variantHouseName(evidence.house, puzzle)} add to 45. Comparing this with the cage totals gives a sum of ${evidence.sum} for the highlighted cells.`
      } else {
        description = `The highlighted cage needs distinct digits that add to ${evidence.sum}.`
      }
      reason = 'The crossed-out candidates cannot take part in any valid combination for that sum.'
      break
    }
    case 'constraint': {
      cells = evidence.cells
      switch (technique) {
        case 'anti-knight':
          description = 'The highlighted cells are a chess knight’s move apart, so they must contain different digits.'
          break
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
          description = ratio && consecutive ? 'The two dots require consecutive digits with one double the other, so the pair must be 1 and 2.'
            : ratio ? 'The black dot requires one of these digits to be double the other.'
              : 'The white dot requires these two digits to be consecutive.'
          break
        }
        default: description = 'The marked rule restricts the highlighted cells.'
      }
      reason = 'None of the valid digit combinations for these cells can use the crossed-out candidates.'
      break
    }
  }
  return {
    technique, actions,
    evidence: { variant: { description, reason } },
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
