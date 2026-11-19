import type { HintChoice, LogicalSolution, SolvePosition, VariantDeduction, VariantHouse, VariantPuzzle, VariantTrace } from './engine'
import { DIGITS, onlyCandidate } from './game.ts'
import { lineGroups } from './line-groups.ts'
import { regionSumParts } from './region-sum.ts'
import { cloneLayout } from './clone.ts'
import { cellReference, type CellReferenceOptions } from './hints.ts'
import { hasMarkedPair, variantHouseCells, variantHouseMasks, variantHouseName } from './variants.ts'

type ConstraintEvidence = Extract<VariantDeduction['evidence'], { type: 'constraint' }>
const alternatives = new Intl.ListFormat('en', { type: 'disjunction' })

function constraintClue(evidence: ConstraintEvidence, puzzle: VariantPuzzle, at: (cell: number) => string, focus: readonly { cell: number; digit: number }[]) {
  const { cells, domains } = evidence
  const rules = evidence.rules.map(index => puzzle.rules?.[index])
  const rule = rules[0]
  const [a, b] = cells
  const pair = b === undefined ? at(a) : `${at(a)} and ${at(b)}`
  switch (rule?.type) {
    case 'global-entropy': {
      const names = ['low (1–3)', 'medium (4–6)', 'high (7–9)']
      const groups = [7, 56, 448]
      const locks: string[] = []
      for (let subset = 1; subset < 7; subset++) {
        const selected = groups.flatMap((mask, group) => subset & (1 << group) ? [{ mask, group }] : [])
        const mask = selected.reduce((mask, item) => mask | item.mask, 0)
        const sites = cells.filter((_, i) => domains[i] & mask)
        if (sites.length !== selected.length || !focus.some(candidate => sites.includes(candidate.cell)
          && !(mask & (1 << (candidate.digit - 1))))) continue
        const locations = new Intl.ListFormat('en', { type: 'conjunction' }).format(sites.map(at))
        const required = new Intl.ListFormat('en', { type: 'conjunction' }).format(selected.map(item => names[item.group]))
        locks.push(selected.length === 1 ? `Only ${locations} can supply a ${required} digit.`
          : `Only ${locations} can supply ${required} digits. These two cells must supply one from each group.`)
      }
      return { description: `The 2 × 2 area from ${at(cells[0])} to ${at(cells[3])} needs a low, a medium and a high digit.`,
        reason: locks.length ? `${locks.join(' ')} Remove candidates from other groups in those cells.`
          : 'Each group needs a separate cell. A crossed-out candidate leaves no way to fit all three groups in these four cells.' }
    }
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
      return { description: `Clone ${cloneLayout(puzzle.rules).at[a]!.label} links ${new Intl.ListFormat('en', { type: 'conjunction' }).format(cells.map(at))}. These cells must contain the same digit.`,
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
    case 'adjacent-total': {
      const description = `The clue between ${pair} gives a total of ${rule.sum}.`
      const fixed = domains.findIndex(mask => onlyCandidate(mask) !== null)
      if (fixed >= 0) {
        const digit = onlyCandidate(domains[fixed])!
        return { description, reason: `${at(cells[fixed])} must be ${digit}. Subtract ${digit} from ${rule.sum}: its partner must be ${rule.sum - digit}.` }
      }
      if (rule.sum % 2 === 0 && focus.some(candidate => candidate.digit === rule.sum / 2)) {
        const house = Math.floor(a / 9) === Math.floor(b / 9) ? `row ${Math.floor(a / 9) + 1}` : `column ${a % 9 + 1}`
        return { description, reason: `Two ${rule.sum / 2}s would give this total, but these cells share ${house}. Neither cell can be ${rule.sum / 2}.${focus.some(candidate => candidate.digit !== rule.sum / 2) ? ' Other crossed-out candidates have no allowed partner.' : ''}` }
      }
      return { description, reason: 'Subtract each candidate from the total. Remove it if the required partner is outside 1–9 or cannot go in the other cell.' }
    }
    case 'xv': {
      const marks = rules.filter(r => r?.type === 'xv')
      const v = marks.some(r => hasMarkedPair(r.five?.pairs, a, b))
      const x = marks.some(r => hasMarkedPair(r.ten?.pairs, a, b))
      const excluded = [marks.some(r => r.five?.negative) ? '5' : '', marks.some(r => r.ten?.negative) ? '10' : ''].filter(Boolean)
      const description = v || x ? `The ${v ? 'V' : 'X'} between ${pair} gives a total of ${v ? 5 : 10}.`
        : `This edge has no mark. The puzzle gives all relevant marks, so these cells cannot add to ${excluded.join(' or ')}.`
      const fixed = domains.findIndex(mask => onlyCandidate(mask) !== null)
      if ((v || x) && fixed >= 0) {
        const digit = onlyCandidate(domains[fixed])!
        return { description, reason: `${at(cells[fixed])} must be ${digit}. Its partner across the ${v ? 'V' : 'X'} must be ${(v ? 5 : 10) - digit}.` }
      }
      if (x && focus.some(candidate => candidate.digit === 5)) {
        const house = Math.floor(a / 9) === Math.floor(b / 9) ? `row ${Math.floor(a / 9) + 1}` : `column ${a % 9 + 1}`
        return { description, reason: `Across an X, 5 needs another 5. These cells share ${house}, so neither cell can be 5.${focus.some(candidate => candidate.digit !== 5) ? ' Other crossed-out candidates also lack an allowed partner.' : ''}` }
      }
      return { description, reason: 'A crossed-out digit has no partner in the other cell that gives an allowed sum.' }
    }
    case 'thermometer':
      return { description: `The thermometer rises from ${at(a)} to ${at(cells[cells.length - 1])}.`,
        reason: 'Each digit must exceed the one before it. No increasing sequence through these cells includes the crossed-out candidates.' }
    case 'palindrome': {
      const pairs = rule.cells.slice(0, Math.floor(rule.cells.length / 2))
        .map((left, i) => [left, rule.cells[rule.cells.length - 1 - i]] as const)
      const affected = pairs.filter(pair => focus.some(({ cell }) => pair.includes(cell)))
      return { description: `On this Palindrome, ${new Intl.ListFormat('en', { type: 'conjunction' }).format(
        (affected.length ? affected : pairs).map(([left, right]) => `${at(left)} and ${at(right)} must match`))}.`,
        reason: 'Cells the same distance from opposite ends must match. A digit missing from one cannot go in its partner.' }
    }
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
    case 'entropic': case 'modular': {
      const { masks, names } = lineGroups[rule.type]
      const group = (mask: number) => masks.map((bits, i) => mask & bits ? i : -1).filter(i => i >= 0)
      const known = cells.flatMap((cell, i) => group(domains[i]).length === 1 ? [`${at(cell)} is ${names[group(domains[i])[0]]}`] : [])
      const description = rule.type === 'entropic'
        ? rule.cells.length === 2 ? 'These two positions must use different low, medium or high groups.'
          : 'Every three successive positions on this Entropic line need one low, one medium and one high digit.'
        : rule.cells.length === 2 ? 'These two positions must use different remainder groups: {1, 4, 7}, {2, 5, 8} or {3, 6, 9}.'
          : 'Every three successive positions on this Modular line need one digit from each group: {1, 4, 7}, {2, 5, 8} and {3, 6, 9}.'
      return { description,
        reason: `${known.length ? 'Along this line, ' + known.slice(0, 3).join(' and ') + '. ' : ''}The groups repeat every three positions. A crossed-out candidate fits no group order allowed by every highlighted cell. Cells three positions apart share a group, not necessarily a digit.` }
    }
    case 'renban':
      return { description: `This line needs ${cells.length} different consecutive digits, in any order.`,
        reason: 'No consecutive set can fill every line cell with a crossed-out digit in its marked position.' }
    case 'consecutive-line':
      return { description: 'The digits increase by 1 from one end of this line to the other.',
        reason: 'A crossed-out digit fits no increasing or decreasing run through these cells.' }
    case 'region-sum':
      return { description: rule.segments ? `These parts have equal totals: ${regionSumParts(rule, puzzle.regions)
        .map(part => part.map(at).join(' + ')).join(' = ')}.`
        : rule.groupByRegion ? 'Add all visits to the same region together. Each region needs the same total.'
        : 'Split the line at each region boundary. All parts must have the same sum.',
        reason: 'With a crossed-out digit in place, the parts have no total they can all reach.' }
    case 'little-killer':
      return { description: `The diagonal from ${at(a)} to ${at(cells[cells.length - 1])} must add to ${rule.sum}.`,
        reason: 'No choice of digits in the other cells completes that sum with a crossed-out candidate.' }
    case 'skyscrapers':
      return { description: `Look from ${at(a)}. The clue requires ${rule.count} visible ${rule.count === 1 ? 'building' : 'buildings'}.`,
        reason: rule.count === 1 ? `Only a 9 in ${at(a)} can hide every later building. Other first digits would leave the 9 visible behind them.`
          : rule.count === 9 ? 'To see all nine buildings, the heights must rise at every cell. Read 1, 2, 3, 4, 5, 6, 7, 8, 9 from the clue.'
          : 'Count the first building and each new tallest building. No order with a crossed-out digit in its cell gives the required count.' }
    case 'sandwich':
      return { description: `The Sandwich clue of ${rule.sum} covers ${at(a)} to ${at(cells[cells.length - 1])}. Only the digits strictly between 1 and 9 count; exclude both endpoints.${rule.sum === 0 ? ' A zero total means 1 and 9 are next to each other.' : ''}`,
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
  let candidates = focus
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
    case 'exclusion': {
      const { premise } = evidence
      const cases = premise.type === 'cell'
        ? Array.from({ length: 9 }, (_, index) => index + 1)
          .filter(digit => premise.domain & 1 << (digit - 1)).map(digit => ({ cell: premise.cell, digit }))
        : premise.cells.map(cell => ({ cell, digit: premise.digit }))
      const sourceCells = premise.type === 'cell' ? [premise.cell] : premise.cells
      cells = [...new Set([...sourceCells, ...focus.map(candidate => candidate.cell)])]
      candidates = [...cases, ...focus]
      const alternativesText = cases.map(candidate => premise.type === 'cell' ? String(candidate.digit) : nameCell(candidate.cell))
      description = premise.type === 'cell'
        ? `${nameCell(premise.cell)} can contain only ${alternatives.format(alternativesText)}.`
        : `In ${houseLabel(premise.house)}, ${premise.digit} can go only in ${alternatives.format(alternativesText)}.`
      reason = focus.map(target => {
        const reasons = cases.map(source => {
          if (source.cell === target.cell) return `${nameCell(source.cell)} would already contain ${target.digit}, so it could not contain ${source.digit}`
          if (source.digit === target.digit) {
            const house = evidence.houses.find(house => {
              const sites = variantHouseCells(house, puzzle)
              return sites.includes(source.cell) && sites.includes(target.cell)
            })!
            return `${source.digit} in ${nameCell(source.cell)} would repeat ${target.digit} in ${houseLabel(house)}`
          }
          return `Non-Consecutive forbids ${source.digit} in ${nameCell(source.cell)} next to ${target.digit}; they differ by 1 across their shared edge`
        })
        return `Remove ${target.digit} from ${nameCell(target.cell)}. If ${nameCell(target.cell)} were ${target.digit}, every alternative would fail: ${reasons.join('; ')}.`
      }).join(' ')
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
    case 'line-houses': {
      cells = evidence.cells
      const gap = evidence.rules.map(index => puzzle.rules?.[index]).find(rule => rule?.type === 'whispers')
      const minimum = gap?.type === 'whispers' ? gap.minDifference : 5
      description = `Neighbors on this line must differ by at least ${minimum}. Its cells must also use different digits where they share ${new Intl.ListFormat('en', { type: 'conjunction' }).format(evidence.houses.map(houseLabel))}.`
      reason = `Check the line assignments against both rules. ${evidence.assignments} ${evidence.assignments === 1 ? 'assignment fits' : 'assignments fit'}, and none uses the crossed-out candidates.`
      candidates = evidence.domains.flatMap((mask, i) => DIGITS.filter(digit => mask & 1 << (digit - 1))
        .map(digit => ({ cell: cells[i], digit })))
      break
    }
    case 'constraint': {
      cells = evidence.cells
      const clue = constraintClue(evidence, puzzle, nameCell, focus)
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
    pattern: { houses: [], cells: [...cells], candidates },
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
