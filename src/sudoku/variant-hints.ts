import type { HintChoice, LogicalSolution, SolvePosition, VariantDeduction, VariantHouse, VariantPuzzle, VariantTrace } from './engine'
import { DIGITS, onlyCandidate } from './game.ts'
import { cellReference, type CellReferenceOptions } from './hints.ts'
import { hasMarkedPair, variantHouseCells, variantHouseMasks, variantHouseName } from './variants.ts'

type ConstraintEvidence = Extract<VariantDeduction['evidence'], { type: 'constraint' }>
const alternatives = new Intl.ListFormat('en', { type: 'disjunction' })

function constraintClue(evidence: ConstraintEvidence, puzzle: VariantPuzzle, at: (cell: number) => string) {
  const { cells, domains } = evidence
  const rules = evidence.rules.map(index => puzzle.rules?.[index])
  const rule = rules[0]
  const [a, b] = cells
  const pair = b === undefined ? at(a) : `${at(a)} and ${at(b)}`
  switch (rule?.type) {
    case 'quadruple':
      return { description: `The circle requires ${rule.digits.join(', ')} among its four surrounding cells.`,
        reason: 'Each printed digit needs a separate cell. No arrangement that uses a crossed-out candidate can fit all the printed digits.' }
    case 'anti-knight':
    case 'anti-king': {
      const step = rule.type === 'anti-knight' ? 'a knight’s move apart' : 'diagonal neighbors'
      const known = domains.findIndex(mask => onlyCandidate(mask) !== null)
      const reason = known < 0 ? 'These cells must contain different digits.'
        : `${at(cells[known])} must be ${onlyCandidate(domains[known])}. Remove that digit from ${at(cells[1 - known])}.`
      return { description: `${pair} are ${step}.`, reason }
    }
    case 'parity':
      return { description: `${at(a)} must be ${rule.parity}.`, reason: rule.parity === 'odd'
        ? 'Only 1, 3, 5, 7, and 9 fit an odd cell.' : 'Only 2, 4, 6, and 8 fit an even cell.' }
    case 'non-consecutive':
      return { description: `${pair} share an edge. Their digits cannot differ by one.`,
        reason: 'A crossed-out digit has no possible partner across that edge.' }
    case 'inequality': {
      const smaller = DIGITS.filter(d => domains[cells.indexOf(rule.less)] & (1 << (d - 1)))
      const larger = DIGITS.filter(d => domains[cells.indexOf(rule.greater)] & (1 << (d - 1)))
      return { description: `${at(rule.less)} must be smaller than ${at(rule.greater)}.`,
        reason: `The smallest possible digit in ${at(rule.less)} is ${smaller[0]}. The largest in ${at(rule.greater)} is ${larger.at(-1)}. Each candidate needs a partner on the correct side of the sign.` }
    }
    case 'clone':
      return { description: 'The highlighted clone cells must contain the same digit.',
        reason: 'A digit missing from one cell cannot go in any of its copies.' }
    case 'kropki': {
      const dots = rules.filter(r => r?.type === 'kropki')
      const white = dots.some(r => hasMarkedPair(r.consecutive?.pairs, a, b))
      const black = dots.some(r => hasMarkedPair(r.ratioTwo?.pairs, a, b))
      let description: string
      if (white && black) description = 'Both dots apply. Only 1 and 2 differ by one with one digit double the other.'
      else if (white) description = `The white dot between ${pair} requires digits that differ by one.`
      else if (black) description = `The black dot between ${pair} requires one digit to be twice the other.`
      else {
        const missing = []
        if (dots.some(r => r.consecutive?.negative)) missing.push('There is no white dot, so these digits cannot differ by one.')
        if (dots.some(r => r.ratioTwo?.negative)) missing.push('There is no black dot, so neither digit can be twice the other.')
        description = missing.join(' ')
      }
      const fixed = domains.findIndex(mask => onlyCandidate(mask) !== null)
      if ((white || black) && fixed >= 0) {
        const digit = onlyCandidate(domains[fixed])!
        const partners = DIGITS.filter(other => (!white || Math.abs(digit - other) === 1)
          && (!black || digit === 2 * other || other === 2 * digit))
        const choices = new Intl.ListFormat('en', { type: 'disjunction' }).format(partners.map(String))
        return { description, reason: `${at(cells[fixed])} must be ${digit}. Across the dot, only ${choices} can match it.` }
      }
      return { description, reason: 'Each crossed-out digit has no partner in the other cell that fits the dot rules.' }
    }
    case 'xv': {
      const marks = rules.filter(r => r?.type === 'xv')
      const v = marks.some(r => hasMarkedPair(r.five?.pairs, a, b))
      const x = marks.some(r => hasMarkedPair(r.ten?.pairs, a, b))
      const excluded = [marks.some(r => r.five?.negative) ? '5' : '', marks.some(r => r.ten?.negative) ? '10' : ''].filter(Boolean)
      const description = v || x ? `The ${v ? 'V' : 'X'} between ${pair} gives a total of ${v ? 5 : 10}.`
        : `This edge has no mark. The puzzle gives all relevant marks, so these cells cannot add to ${excluded.join(' or ')}.`
      return { description, reason: 'A crossed-out digit has no partner in the other cell that gives an allowed sum.' }
    }
    case 'thermometer':
      return { description: `The thermometer rises from ${at(a)} to ${at(cells[cells.length - 1])}.`,
        reason: 'Each digit must exceed the one before it. No increasing sequence through these cells includes the crossed-out candidates.' }
    case 'palindrome':
      return { description: `Match the cells inward from ${at(a)} and ${at(cells[cells.length - 1])}.`,
        reason: 'Cells the same distance from opposite ends must match. A digit missing from one cannot go in its partner.' }
    case 'between': {
      const last = cells.length - 1
      const firstDigit = onlyCandidate(domains[0])
      const lastDigit = onlyCandidate(domains[last])
      if (firstDigit !== null && lastDigit !== null) {
        const inside = DIGITS.filter(digit => digit > Math.min(firstDigit, lastDigit) && digit < Math.max(firstDigit, lastDigit))
        const choices = new Intl.ListFormat('en', { type: 'disjunction' }).format(inside.map(String))
        return { description: `The endpoints are ${firstDigit} in ${at(a)} and ${lastDigit} in ${at(cells[last])}.`,
          reason: `Each cell between them must contain ${choices}.` }
      }
      return { description: `The endpoints are ${at(a)} and ${at(cells[last])}.`,
        reason: 'For each possible pair, check that every cell inside can hold a digit between the two values. Remove any candidate that fits no pair.' }
    }
    case 'whispers':
      return { description: `Neighbors on this line must differ by at least ${rule.minDifference}.`,
        reason: 'A crossed-out digit leaves no way to keep that difference along the line.' }
    case 'arrow':
      return { description: `The ${rule.cells.length === 1 ? 'digit on the arrow equals' : 'digits on the arrow add to'} the digit in ${at(rule.circle)}.`,
        reason: 'With the current candidates, no matching sum uses a crossed-out digit in its marked cell.' }
    case 'renban':
      return { description: `This line needs ${cells.length} different consecutive digits, in any order.`,
        reason: 'No consecutive set can fill every line cell with a crossed-out digit in its marked position.' }
    case 'region-sum':
      return { description: rule.groupByRegion ? 'Add all visits to the same region together. Each region needs the same total.'
        : 'Split the line at each region boundary. All parts must have the same sum.',
        reason: 'With a crossed-out digit in place, the parts have no total they can all reach.' }
    case 'little-killer':
      return { description: `The diagonal from ${at(a)} to ${at(cells[cells.length - 1])} must add to ${rule.sum}.`,
        reason: 'No choice of digits in the other cells completes that sum with a crossed-out candidate.' }
    case 'skyscrapers':
      return { description: `Look from ${at(a)}. The clue requires ${rule.count} visible ${rule.count === 1 ? 'building' : 'buildings'}.`,
        reason: 'Count the first building and each new tallest building. No order with a crossed-out digit in its cell gives the required count.' }
    case 'sandwich':
      return { description: `Only the digits between 1 and 9 count toward the clue of ${rule.sum}.`,
        reason: 'No pair of endpoint positions allows that sum with a crossed-out candidate in its cell.' }
    case 'x-sum':
      return { description: `The digit in ${at(a)} tells how many cells to add, including itself. The sum must be ${rule.sum}.`,
        reason: 'No possible starting length and set of digits gives that sum with a crossed-out candidate in its cell.' }
    default:
      return { description: 'Compare the candidates in the highlighted cells with their clue.',
        reason: 'No allowed combination uses a crossed-out digit in its marked cell.' }
  }
}

export function variantHintChoice(deduction: VariantDeduction, puzzle: VariantPuzzle, options: CellReferenceOptions = {}): HintChoice {
  const { actions, evidence, technique } = deduction
  const nameCell = (cell: number) => cellReference(cell, options.cellReferenceStyle ?? 'concise', options.difficulty)
  const focus = actions.map((action) => 'place' in action ? action.place : action.eliminate)
  if (evidence.type === 'classic') return {
    actions, technique, evidence: evidence.proof,
    pattern: { houses: [], cells: [...new Set(focus.map(({ cell }) => cell))], candidates: focus },
  }
  const houseLabel = (house: VariantHouse) =>
    ('diagonal' in house || 'extra' in house ? 'the ' : '') + variantHouseName(house, puzzle)
  let cells: readonly number[]
  let description: string
  let reason: string
  switch (evidence.type) {
    case 'single': {
      const { candidate: { cell, digit }, house } = evidence
      cells = house ? variantHouseCells(house, puzzle) : [cell]
      if (!house) {
        description = `Only ${digit} remains in ${nameCell(cell)}.`
        reason = 'Every other digit is already ruled out.'
      } else {
        const label = houseLabel(house)
        description = technique === 'full-house'
          ? `${nameCell(cell)} is the last empty cell in ${label}.`
          : `Only ${nameCell(cell)} can hold ${digit} in ${label}.`
        reason = technique === 'full-house' ? `The eight filled cells contain every digit except ${digit}.`
          : `That house needs one ${digit}.`
      }
      break
    }
    case 'intersection': {
      cells = evidence.cells
      description = `Every possible ${evidence.digit} in ${houseLabel(evidence.source)} lies in ${houseLabel(evidence.target)}.`
      reason = `One shared cell must hold ${evidence.digit}. Remove it from the rest of ${houseLabel(evidence.target)}.`
      break
    }
    case 'locked-digit': {
      cells = evidence.clue.cells
      const printed = evidence.clue.rules.flatMap(index => {
        const rule = puzzle.rules?.[index]
        return rule?.type === 'quadruple' ? rule.digits : []
      })
      const target = houseLabel(evidence.target)
      description = `The Quadruple circle (${printed.join(', ')}) requires ${evidence.digit} somewhere in ${target}.`
      reason = `The other cells in ${target} cannot contain ${evidence.digit}.`
      break
    }
    case 'cage-sum': {
      cells = evidence.cells
      if (evidence.house) {
        const name = houseLabel(evidence.house)
        const cageTotal = evidence.cages.reduce((total, [ruleIndex, cageIndex]) => {
          const rule = puzzle.rules?.[ruleIndex]
          return total + (rule?.type === 'killer-cages' ? rule.cages[cageIndex].sum : 0)
        }, 0)
        const inside = variantHouseCells(evidence.house, puzzle).includes(cells[0])
        const sum = inside ? `45 − ${cageTotal}` : `${cageTotal} − 45`
        description = `The digits in ${name} add to 45. The cages total ${cageTotal}. The highlighted cells must add to ${sum} = ${evidence.sum}.`
      } else {
        description = `This cage must add to ${evidence.sum} using different digits.`
      }
      reason = 'No assignment that puts a crossed-out digit in its marked cell reaches the required sum.'
      break
    }
    case 'constraint': {
      cells = evidence.cells
      const clue = constraintClue(evidence, puzzle, nameCell)
      description = clue.description
      reason = clue.reason
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
        case 'anti-king': {
          const name = nameCell
          description = `${cells.map(name).join(' and ')} touch at a corner. Anti-King requires different digits in these cells.`
          reason = focus.map(({ cell, digit }) => `${digit} cannot go in ${name(cell)}; ${name(cells.find(other => other !== cell)!)} is restricted to ${digit}.`).join(' ')
          break
        }
        case 'non-consecutive': {
          description = `${cells.map(nameCell).join(' and ')} share an edge. Non-Consecutive requires their digits not to differ by 1.`
          reason = focus.map(({ cell, digit }) => {
            const other = cells.findIndex(candidate => candidate !== cell)
            const choices = Array.from({ length: 9 }, (_, index) => index + 1)
              .filter(candidate => evidence.domains[other] & 1 << (candidate - 1))
            return `${digit} cannot go in ${nameCell(cell)}; ${nameCell(cells[other])} can contain only ${alternatives.format(choices.map(String))}. Every choice would differ from ${digit} by 1.`
          }).join(' ')
          break
        }
      }
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
