import type { HintChoice, LogicalSolution, SolvePosition, VariantDeduction, VariantHouse, VariantPuzzle, VariantTrace } from './engine'
import { candidateCount, DIGITS, onlyCandidate } from './game.ts'
import { lineGroupMask, lineGroups } from './line-groups.ts'
import { regionSumParts } from './region-sum.ts'
import { cloneLayout } from './clone.ts'
import { cellReference, type CellReferenceOptions } from './hints.ts'
import { hasMarkedPair, variantHouseCells, variantHouseMasks, variantHouseName } from './variants.ts'

type ConstraintEvidence = Extract<VariantDeduction['evidence'], { type: 'constraint' }>
const alternatives = new Intl.ListFormat('en', { type: 'disjunction' })
const conjunction = new Intl.ListFormat('en', { type: 'conjunction' })

function constraintClue(evidence: ConstraintEvidence, puzzle: VariantPuzzle, at: (cell: number) => string, focus: readonly { cell: number; digit: number }[]) {
  const { cells, domains } = evidence
  const rules = evidence.rules.map(index => puzzle.rules?.[index])
  const rule = rules[0]
  const [a, b] = cells
  const pair = b === undefined ? at(a) : `${at(a)} and ${at(b)}`
  switch (rule?.type) {
    case 'lettered-quadruples': {
      const target = focus[0].cell
      const remaining = DIGITS.filter(digit => (domains[cells.indexOf(target)] & (1 << (digit - 1))) &&
        !focus.some(candidate => candidate.digit === digit))
      return {
        description: 'Each letter stands for the same digit throughout the puzzle. Different letters stand for different digits.',
        reason: `Match the letters in the circles against the rows, columns, regions and current candidates. The digit for each letter must appear around every circle that lists it. The possible keys leave ${alternatives.format(remaining.map(String))} in ${at(target)}.`,
      }
    }
    case 'inside-grid':
      return {
        description: `Every row and column of the rotated ${rule.rows.length} × ${rule.rows.length} grid uses the same set of different digits.`,
        reason: 'Test each set that can fill every inside row and column. Remove candidates that cannot be placed in their cell with any of those sets.',
      }
    case 'consecutive-run':
      if (rule.fromBulb) return {
        description: `Digits increase by one at each step from the bulb at ${at(a)} to the tip at ${at(cells.at(-1)!)}.`,
        reason: 'Check which starting digits fit every cell along the thermometer. Remove candidates that occur in none of those runs.',
      }
      return { description: `Digits increase by one from one end of the Consecutive Line to the other, between ${at(a)} and ${at(cells.at(-1)!)}.`,
        reason: 'Check both directions. No run that uses a crossed-out candidate fits the other cells on the line.' }
    case 'distinct-cells': {
      const candidate = focus.length === 1 ? focus[0] : undefined
      const fixed = candidate && cells.find((cell, i) => cell !== candidate.cell && onlyCandidate(domains[i]) === candidate.digit)
      const locations = new Intl.ListFormat('en', { type: 'conjunction' }).format(cells.map(at))
      return { description: `The shaded group at ${locations} needs a different digit in each cell.`,
        reason: candidate && fixed !== undefined
          ? `${at(fixed)} must contain ${candidate.digit}. Remove it from ${at(candidate.cell)} in the same shaded group.`
          : 'No assignment with a crossed-out candidate gives every cell in this group a different digit.' }
    }
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
    case 'quadruple-sum':
      return {
        description: `The Quad-Arrows circle requires ${rule.digits.join(', ')}. The largest digit equals the sum of the other three.`,
        reason: 'Remove candidates that cannot fit the sum and every printed digit.',
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
    case 'minimum': case 'maximum': {
      const marked = rule.type === 'minimum' ? a : b
      const other = rule.type === 'minimum' ? b : a
      const minimum = rule.type === 'minimum'
      return {
        description: `The ${minimum ? 'Minimum' : 'Maximum'} clue in ${at(marked)} requires a ${minimum ? 'smaller' : 'larger'} digit than in ${at(other)}.`,
        reason: `Remove candidates in either cell that have no partner with ${at(a)} smaller than ${at(b)}.`,
      }
    }
    case 'inequality': {
      const smaller = DIGITS.filter(d => domains[cells.indexOf(rule.less)] & (1 << (d - 1)))
      const larger = DIGITS.filter(d => domains[cells.indexOf(rule.greater)] & (1 << (d - 1)))
      return { description: `${at(rule.less)} must be smaller than ${at(rule.greater)}.`,
        reason: `The smallest possible digit in ${at(rule.less)} is ${smaller[0]}. The largest in ${at(rule.greater)} is ${larger.at(-1)}. Each candidate needs a partner that fits the comparison.` }
    }
    case 'clone':
      return { description: `Clone ${cloneLayout(puzzle.rules).at[a]!.label} links ${new Intl.ListFormat('en', { type: 'conjunction' }).format(cells.map(at))}. These cells must contain the same digit.`,
        reason: 'A digit missing from one cell cannot go in any of its copies.' }
    case 'labeled-dots': {
      const mark = rule.marks.find(mark => mark.cells.includes(a) && mark.cells.includes(b))
      const relation = rule.relation === 'ratio' ? 'black' : 'white'
      if (!mark) return {
        description: `There is no ${relation} dot between ${pair}.`,
        reason: rule.relation === 'ratio' ? 'Neither digit can be twice the other.' : 'The two digits cannot be consecutive.',
      }
      return {
        description: rule.relation === 'ratio'
          ? `The black dot between ${pair} means the larger digit is ${mark.value} times the smaller one.`
          : `The white dot between ${pair} means the digits differ by ${mark.value}.`,
        reason: 'Remove a candidate if no digit in the other cell fits the dot rule with it.',
      }
    }
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
    case 'lockout':
      return { description: `The diamonds at ${at(a)} and ${at(cells.at(-1)!)} need digits at least 4 apart. Interior digits must lie outside their range.`,
        reason: 'A crossed-out digit fits no pair of endpoints that works for the whole line.' }
    case 'arrow':
      return { description: `The ${rule.cells.length === 1 ? 'digit on the arrow equals' : 'digits on the arrow add to'} the digit in ${at(rule.circle)}.`,
        reason: 'With the current candidates, no matching sum uses a crossed-out digit in its marked cell.' }
    case 'pill-arrow':
      return { description: `The arrow adds to the two-digit number with tens in ${at(a)} and ones in ${at(b)}.`,
        reason: 'A crossed-out candidate fits no arrow sum that matches the pill.' }
    case 'entropic': case 'modular': {
      const sumRule = rules[1]
      const sum = sumRule?.type === 'adjacent-total' ? sumRule.sum : sumRule?.type === 'xv'
        ? (hasMarkedPair(sumRule.five?.pairs, a, b) ? 5 : hasMarkedPair(sumRule.ten?.pairs, a, b) ? 10 : undefined)
        : undefined
      if (rule.type === 'modular' && sum !== undefined) {
        const group = `{${DIGITS.filter(digit => digit % 3 === (2 * sum) % 3).join(', ')}}`
        const sameGroup = (rule.cells.indexOf(a) - rule.cells.indexOf(b)) % 3 === 0
        const description = `${pair} add to ${sum}. On this Modular Line, they use ${sameGroup ? 'the same remainder group' : 'different remainder groups'}.`
        const reason = sameGroup
          ? `Only ${group} can supply two digits from the same group that add to ${sum}. This group repeats every three positions and is ruled out of the other positions.`
          : `If either cell used a digit from ${group}, the sum would force both cells into that group.${rule.cells.length > 2 ? ' This group belongs to the remaining position in each set of three.' : ''}`
        return { description, reason }
      }
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

type GroupOrderEvidence = Extract<VariantDeduction['evidence'], { type: 'group-order' }>
type GroupOrderCheck = GroupOrderEvidence['rejected'][number]['conflict']

function explainGroupOrder(
  evidence: GroupOrderEvidence,
  puzzle: VariantPuzzle,
  at: (cell: number) => string,
  houseLabel: (house: VariantHouse) => string,
) {
  const shown = new Set(evidence.cells.slice(0, 3))
  const digits = (mask: number) => DIGITS.filter(digit => mask & 1 << (digit - 1)).join(', ')
  const order = (groups: number[]) => groups.map(mask => `{${digits(mask)}}`).join(', then ')
  const family = (rule: number) => puzzle.rules?.[rule]?.type === 'modular' ? 'Modular' : 'Entropic'
  const pairRule = ({ scope, cells, domains }: GroupOrderCheck) =>
    scope.type === 'pair' ? constraintClue({ type: 'constraint', rules: scope.rules, cells, domains }, puzzle, at, []).description : ''
  const name = (check: GroupOrderCheck) => {
    const { scope, cells } = check
    switch (scope.type) {
      case 'house': return houseLabel(scope.house)
      case 'line': return `the ${family(scope.rule)} line starting at ${at(cells[0])}`
      case 'pair': return `the clue between ${at(cells[0])} and ${at(cells[1])}`
    }
  }
  const cases = evidence.rejected.map(({ groups, checks, conflict, houseConflict }) => {
    const steps = checks.map((check, index) => {
      const following = new Set([...checks.slice(index + 1), conflict].flatMap(step => step.cells))
      const narrowed = check.cells.flatMap((cell, i) =>
        check.domains[i] !== check.supported[i] ? [{ cell, mask: check.supported[i] }] : [])
      const relevant = narrowed.filter(({ cell }) => following.has(cell))
      const detail = relevant.length ? relevant : narrowed.slice(0, 1)
      for (const { cell } of detail) shown.add(cell)
      const restrictions = conjunction.format(detail.map(({ cell, mask }) => `${at(cell)} can use only ${digits(mask)}`))
      return check.scope.type === 'pair'
        ? `${pairRule(check)} Across that clue, ${restrictions}.`
        : `With ${name(check)}, ${restrictions}.`
    })
    const { scope, cells, domains } = conflict
    if (scope.type === 'pair') {
      for (const cell of cells) shown.add(cell)
      const limits = conjunction.format(cells.map((cell, i) => `${at(cell)} can use only ${digits(domains[i])}`))
      steps.push(`${pairRule(conflict)} ${limits}. No pair fits the clue.`)
    } else if (scope.type === 'line') {
      const line = puzzle.rules?.[scope.rule]
      if (line?.type === 'entropic' || line?.type === 'modular') {
        const masks = new Map(cells.map((cell, i) => [cell, domains[i]]))
        for (let i = 0; i + 2 < line.cells.length; i++) {
          const window = line.cells.slice(i, i + 3)
          const missing = lineGroups[line.type].masks.find(mask => window.every(cell => !(masks.get(cell)! & mask)))
          if (!missing) continue
          for (const cell of window) shown.add(cell)
          steps.push(`The three successive cells ${conjunction.format(window.map(at))} have no candidate in {${digits(missing)}}.`)
          break
        }
      }
      steps.push(`No order of the three groups fits the remaining candidates on ${name(conflict)}.`)
    } else if (houseConflict) {
      const locations = conjunction.format(houseConflict.cells.map(at))
      const required = digits(houseConflict.digits)
      for (const cell of houseConflict.cells) shown.add(cell)
      const count = DIGITS.filter(digit => houseConflict.digits & 1 << (digit - 1)).length
      const shortage = !locations ? `there is no place for ${required}`
        : houseConflict.cells.length < count ? `only ${locations} can use ${required}`
          : `${locations} can use only ${required}`
      steps.push(`In ${name(conflict)}, ${shortage}. Each digit needs its own cell.`)
    }
    return `Try ${order(groups)}. ${steps.join(' ')}`
  })
  const remaining = evidence.remaining.map(order)
  const conclusion = remaining.length === 1
    ? `The line must start with ${remaining[0]}. Remove candidates outside the corresponding groups.`
    : `Remove candidates that fit none of the remaining group orders.`
  return {
    cells: [...shown],
    description: `Check the order of the repeating groups on the ${family(evidence.rule)} line starting at ${at(evidence.cells[0])}.`,
    reason: [...cases, conclusion].join(' '),
  }
}

function explainLinkedClue(
  evidence: Extract<VariantDeduction['evidence'], { type: 'linked-clue' }>,
  puzzle: VariantPuzzle,
  at: (cell: number) => string,
  houseLabel: (house: VariantHouse) => string,
) {
  const { assumption, checks, conflict, houseConflict } = evidence
  const shown = new Set([assumption.cell])
  const digits = (mask: number) => alternatives.format(DIGITS.filter(digit => mask & 1 << (digit - 1)).map(String))
  const name = (check: typeof conflict) => {
    switch (check.scope.type) {
      case 'pair': return `the clue between ${at(check.cells[0])} and ${at(check.cells[1])}`
      case 'line': return `the Between Line from ${at(check.cells[0])} to ${at(check.cells.at(-1)!)}`
      case 'house': return houseLabel(check.scope.house)
    }
  }
  const pairRule = (check: typeof conflict) => {
    if (check.scope.type !== 'pair') return ''
    const rule = puzzle.rules?.[check.scope.rules[0]]
    if (rule?.type === 'palindrome' || rule?.type === 'clone') {
      const [a, b] = check.cells.map(at)
      return `${a} and ${b} must match under the ${rule.type === 'palindrome' ? 'Palindrome' : 'Clone'} rule. `
    }
    return constraintClue({
      type: 'constraint', rules: check.scope.rules, cells: check.cells, domains: check.domains,
    }, puzzle, at, []).description + ' '
  }
  const steps = checks.map((check, index) => {
    const later = new Set([...checks.slice(index + 1), conflict].flatMap(step => step.cells))
    const updates = check.cells.flatMap((cell, i) => check.domains[i] === check.supported[i]
      ? [] : [{ cell, mask: check.supported[i] }])
    const relevant = updates.filter(({ cell }) => later.has(cell))
    const detail = relevant.length ? relevant : updates.slice(0, 1)
    for (const { cell } of detail) shown.add(cell)
    const remaining = conjunction.format(detail.map(({ cell, mask }) => `${at(cell)} can use only ${digits(mask)}`))
    return `${pairRule(check)}With ${name(check)}, ${remaining}.`
  })
  if (houseConflict) {
    const required = conjunction.format(DIGITS.filter(digit => houseConflict.digits & 1 << (digit - 1)).map(String))
    const places = conjunction.format(houseConflict.cells.map(at))
    for (const cell of houseConflict.cells) shown.add(cell)
    const count = candidateCount(houseConflict.digits)
    const shortage = !places ? `there is no cell for ${required}`
      : houseConflict.cells.length < count ? `only ${places} can use ${required}`
        : `${places} can use only ${required}`
    steps.push(`In ${name(conflict)}, ${shortage}. Each digit needs its own cell.`)
  } else {
    for (const cell of conflict.cells) shown.add(cell)
    steps.push(`${pairRule(conflict)}No assignment fits ${name(conflict)}.`)
  }
  steps.push(`Remove ${assumption.digit} from ${at(assumption.cell)}.`)
  return { cells: [...shown], description: `Start by assuming ${at(assumption.cell)} is ${assumption.digit}.`, steps }
}

function dotHouseConflict(proof: Extract<VariantDeduction['evidence'], { type: 'kropki-house' }>) {
  const remaining = proof.cells.flatMap((cell, i) => proof.pair.includes(cell) ? [] : [{ cell, domain: proof.domains[i] }])
  let shortest: { used: number; blocked: number[]; digits: number } | undefined
  for (const used of proof.rejected) {
    for (let subset = 1; subset < 1 << remaining.length; subset++) {
      const size = candidateCount(subset)
      if (shortest && size >= shortest.blocked.length) continue
      const cells = remaining.filter((_, i) => subset & (1 << i))
      const digits = cells.reduce((union, { domain }) => union | (domain & ~used), 0)
      if (candidateCount(digits) < size) {
        shortest = { used, blocked: cells.map(({ cell }) => cell), digits }
        if (size === 1) return shortest
      }
    }
  }
  return shortest
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
  let reasonSteps: string[] | undefined
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
      const target = houseLabel(evidence.target)
      if (technique === 'renban-locked-digit') {
        const { digit } = evidence
        const length = evidence.clue.cells.length
        const commonToAll = digit >= 10 - length && digit <= length
        description = commonToAll
          ? `Every set of ${length} consecutive digits includes ${digit}. All positions for ${digit} on the Renban lie in ${target}.`
          : `Every consecutive set that fits the Renban includes ${digit}. All positions for ${digit} on the line lie in ${target}.`
        reason = `One of the highlighted positions must hold ${digit}. Remove ${digit} from the other cells in ${target}.`
        candidates = [...focus, ...evidence.cells.map(cell => ({ cell, digit }))]
        break
      }
      const rules = evidence.clue.rules.map(index => puzzle.rules?.[index])
      const printed = rules.flatMap(rule =>
        rule?.type === 'quadruple' || rule?.type === 'quadruple-sum' ? rule.digits : [])
      const sum = rules.some(rule => rule?.type === 'quadruple-sum')
      description = `The ${sum ? 'Quad-Arrows' : 'Quadruple'} circle (${printed.join(', ')}) requires ${evidence.digit} somewhere in ${target}.`
      reason = sum
        ? `Every placement that fits the printed digits and the sum puts ${evidence.digit} in ${target}. Remove it from the other cells in ${target}.`
        : `The other cells in ${target} cannot contain ${evidence.digit}.`
      break
    }
    case 'rule-forcing': {
      const { assumption, contradiction } = evidence
      const location = nameCell(assumption.cell)
      candidates = [assumption]
      description = `If ${location} is ${assumption.digit}, follow the puzzle's visible clues to update the candidates.`
      if (contradiction.type === 'empty-cell') {
        cells = [assumption.cell, contradiction.cell]
        reason = `That leaves ${nameCell(contradiction.cell)} without a candidate. Remove ${assumption.digit} from ${location}.`
      } else {
        cells = [...new Set([assumption.cell, ...variantHouseCells(contradiction.house, puzzle)])]
        reason = `${contradiction.digit} has no possible cell in ${houseLabel(contradiction.house)}. Remove ${assumption.digit} from ${location}.`
      }
      break
    }
    case 'quadruple-lock': {
      const { clues, sites, digit } = evidence
      cells = [...new Set(clues.flatMap(clue => clue.cells))]
      candidates = sites.flat().map(cell => ({ cell, digit }))
      const houses = new Intl.ListFormat('en', { type: 'conjunction' }).format(evidence.houses.map(houseLabel))
      description = `Each highlighted Quadruple needs its own ${digit}. Its possible locations are highlighted in ${houses}.`
      reason = `The two placements must use one cell in each house. Remove ${digit} from the other cells in ${houses}.`
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
    case 'sum-pair': {
      const { cells: [anchor, partner, otherAnchor, otherPartner], totals: [left, right], domains } = evidence
      const house = houseLabel(evidence.house)
      description = `${nameCell(anchor)} and ${nameCell(partner)} add to ${left}. ${nameCell(otherAnchor)} and ${nameCell(otherPartner)} add to ${right}.`
      const locked = [...new Set(focus.map(({ digit }) => digit))]
      const exclusions = locked.map(digit => {
        const repeated = DIGITS.find(value => {
          const other = left - value
          return other !== digit && other !== value && DIGITS.includes(other) &&
            (domains[0] & (1 << (value - 1))) && (domains[1] & (1 << (other - 1)))
        })
        return `If neither ${nameCell(partner)} nor ${nameCell(otherPartner)} used ${digit}, ${nameCell(anchor)} and ${nameCell(otherAnchor)} would both be ${repeated}. That repeats ${repeated} in ${house}.`
      })
      const targets = [...new Set(focus.map(({ cell }) => cell))]
      const sites = evidence.houses.map(house => ({ house, cells: variantHouseCells(house, puzzle) }))
      const connection = (from: number, to: number) => houseLabel(sites.find(({ cells }) =>
        cells.includes(from) && cells.includes(to))!.house)
      const conjunction = new Intl.ListFormat('en', { type: 'conjunction' })
      const cell = targets[0]
      const digits = conjunction.format(focus.filter(candidate => candidate.cell === cell).map(({ digit }) => String(digit)))
      reason = exclusions.join(' ') +
        ` ${nameCell(cell)} shares ${connection(cell, partner)} with ${nameCell(partner)} and ${connection(cell, otherPartner)} with ${nameCell(otherPartner)}. Remove ${digits} from ${nameCell(cell)}.`
      if (targets.length > 1) reason += ' The other marked cells also share houses with both sum partners.'
      cells = [...evidence.cells, ...targets]
      candidates = [
        ...domains.flatMap((mask, i) => DIGITS.filter(digit => mask & (1 << (digit - 1)))
          .map(digit => ({ cell: evidence.cells[i], digit }))),
        ...focus,
      ]
      break
    }
    case 'group-line-phase-sum': {
      const { cells: [endpoint, partner, other, fixed], domains, total } = evidence
      const kind = technique === 'entropic' ? 'entropic' : 'modular'
      const line = kind === 'entropic' ? 'Entropic' : 'Modular'
      const groups = lineGroups[kind].masks
      const names = (mask: number) => DIGITS.filter(digit => mask & (1 << (digit - 1))).join(', ')
      const fixedMask = groups.find(group => domains[3] & group)!
      description = `${nameCell(fixed)} uses the group {${names(fixedMask)}} on this ${line} Line. ${nameCell(endpoint)} and ${nameCell(other)} use the other two groups. ${nameCell(endpoint)} and ${nameCell(partner)} add to ${total}.`
      const house = houseLabel(evidence.house)
      const examples = focus.filter(candidate => candidate.cell === endpoint)
      reason = examples.map(({ digit }) => {
        const sumPartner = total - digit
        const own = lineGroupMask(kind, digit)
        const remaining = groups.find(group => group !== own && group !== fixedMask)!
        return `If ${nameCell(endpoint)} were ${digit}, the sum would make ${nameCell(partner)} ${sumPartner}. The group {${names(remaining)}} would also force ${nameCell(other)} to be ${sumPartner}, repeating ${sumPartner} in ${house}.`
      }).join(' ')
      if (!reason) {
        reason = `Check both orders of the remaining groups against the sum. A crossed-out candidate would repeat the same digit in ${nameCell(partner)} and ${nameCell(other)}, which share ${house}.`
      }
      cells = evidence.cells
      candidates = domains.flatMap((mask, i) => DIGITS.filter(digit => mask & (1 << (digit - 1)))
        .map(digit => ({ cell: evidence.cells[i], digit })))
      break
    }
    case 'group-sum-implication': {
      const { assumption, links, conflict } = evidence
      const start = nameCell(assumption.cell)
      const sums = links.filter(({ source }) => source.type === 'sum').length === 1 ? 'a sum' : 'two sums'
      description = `If ${start} were ${assumption.digit}, two group lines and ${sums} would force a repeat in ${houseLabel(conflict)}.`
      let previous = assumption
      reason = links.map(({ candidate, domain, source }) => {
        const from = nameCell(previous.cell), to = nameCell(candidate.cell)
        let sentence: string
        if (source.type === 'sum') {
          sentence = `The ${source.total} sum with ${from} makes ${to} ${candidate.digit}.`
        } else if (source.type === 'house') {
          sentence = `${to} shares ${houseLabel(source.house)} with ${from}, so it must use ${candidate.digit}.`
        } else {
          const rule = puzzle.rules?.[source.rule]
          const line = rule?.type === 'entropic' ? 'Entropic' : 'Modular'
          if (source.anchor) {
            const [anchor, mask] = source.anchor
            const digits = DIGITS.filter(digit => mask & (1 << (digit - 1))).join(', ')
            sentence = `${nameCell(anchor)} (${digits}) and ${from} fix two groups on the ${line} Line. The remaining group makes ${to} ${candidate.digit}.`
          } else {
            sentence = `${to} must use the same group as ${from} on the ${line} Line. That makes it ${candidate.digit}.`
          }
        }
        previous = candidate
        return sentence
      }).join(' ')
      reason += ` That repeats ${assumption.digit} in ${houseLabel(conflict)}. Remove ${assumption.digit} from ${start}.`
      const anchors = links.flatMap(({ source }) => source.type === 'line' && source.anchor ? [source.anchor[0]] : [])
      cells = [...new Set([assumption.cell, ...links.map(link => link.candidate.cell), ...anchors])]
      candidates = [assumption, ...links.flatMap(({ candidate, domain }) =>
        DIGITS.filter(digit => domain & (1 << (digit - 1))).map(digit => ({ cell: candidate.cell, digit })))]
      break
    }
    case 'group-line-house-triplet': {
      cells = evidence.cells
      const [target, first, second, other] = evidence.cells
      const kind = technique === 'entropic' ? 'entropic' : 'modular'
      const line = kind === 'entropic' ? 'Entropic' : 'Modular'
      const group = kind === 'entropic' ? 'digit groups' : 'remainder groups'
      const house = houseLabel(evidence.house)
      const groupMask = lineGroupMask(kind, focus[0].digit)
      const example = focus.filter(({ digit }) => groupMask & (1 << (digit - 1)))
      const guesses = alternatives.format(example.map(({ digit }) => String(digit)))
      const blocked = DIGITS.filter(digit => evidence.domains[3] & (1 << (digit - 1)))
      const pair = `${nameCell(first)} and ${nameCell(second)}`
      const occupied = blocked.length === 1 ? `one of those cells would have to use ${blocked[0]}`
        : `those cells would have to use ${blocked.join(' and ')}`
      description = `${nameCell(target)}, ${nameCell(first)}, and ${nameCell(second)} use different ${group} on this ${line} Line. ${pair} share ${house} with ${nameCell(other)}.`
      reason = `If ${nameCell(target)} were ${guesses}, ${pair} would need the other two ${group}. With their current candidates, ${occupied}. That leaves ${nameCell(other)} with no candidate in ${house}.`
      if (example.length < focus.length) reason += ' Apply the same check to the other crossed-out digits.'
      candidates = evidence.domains.flatMap((mask, i) => DIGITS.filter(digit => mask & (1 << (digit - 1)))
        .map(digit => ({ cell: cells[i], digit })))
      break
    }
    case 'group-line-disjoint-sum': {
      cells = evidence.cells
      const kind = technique === 'entropic' ? 'entropic' : 'modular'
      const line = kind === 'entropic' ? 'Entropic' : 'Modular'
      const groupName = kind === 'entropic' ? 'digit group' : 'remainder group'
      const { cells: [first, second, left, right], domains, houses, total } = evidence
      const { cell: target, digit } = focus[0]
      const targetIndex = target === first ? 0 : 1
      const partnerIndex = 1 - targetIndex
      const partner = evidence.cells[partnerIndex]
      const sites = houses.map(house => variantHouseCells(house, puzzle))
      const sharedHouse = (a: number, b: number) => sites.findIndex(group => group.includes(a) && group.includes(b))
      const hasDigit = (i: number, value: number) => Boolean(domains[i] & (1 << (value - 1)))
      const group = lineGroupMask(kind, digit)
      const choices = DIGITS.filter(value => hasDigit(partnerIndex, value) &&
        (group & (1 << (value - 1))) && (value !== digit || sharedHouse(first, second) < 0))
      const failures: string[] = []
      for (const value of choices) for (const a of DIGITS) {
        const b = total - a
        if (a === b || !hasDigit(2, a) || b < 1 || b > 9 || !hasDigit(3, b)) continue
        const lineDigits = targetIndex === 0 ? [digit, value] : [value, digit]
        const conflict = [[0, a, left], [0, b, right], [1, a, left], [1, b, right]]
          .find(([i, sumDigit, sumCell]) => lineDigits[i] === sumDigit && sharedHouse(evidence.cells[i], sumCell) >= 0)
        if (!conflict) continue
        const [i, repeated, sumCell] = conflict
        const name = houseLabel(houses[sharedHouse(evidence.cells[i], sumCell)])
        const assumption = choices.length === 1 ? '' : `${nameCell(partner)} is ${value} and `
        failures.push(`If ${assumption}${nameCell(left)} is ${a} and ${nameCell(right)} is ${b}, ${repeated} repeats in ${name}.`)
      }
      description = `${nameCell(first)} and ${nameCell(second)} must use the same ${groupName} on this ${line} Line. ${nameCell(left)} and ${nameCell(right)} add to ${total}.`
      const lead = `If ${nameCell(target)} were ${digit}, ${nameCell(partner)} could only be ${alternatives.format(choices.map(String))}.`
      const detail = failures.length <= 4 ? failures.join(' ') : 'Every order of the sum would repeat a digit in a shared house.'
      reason = `${lead} ${detail}`
      if (focus.length > 1) reason += ' The same check rules out the other crossed-out candidates.'
      candidates = domains.flatMap((mask, i) => DIGITS.filter(value => mask & (1 << (value - 1)))
        .map(value => ({ cell: cells[i], digit: value })))
      break
    }
    case 'group-line-sum-chain': {
      const { cells: [start, middle, end, partner], domains, supported, locked, totals: [left, right] } = evidence
      const kind = technique === 'entropic' ? 'entropic' : 'modular'
      const line = kind === 'entropic' ? 'Entropic' : 'Modular'
      const group = kind === 'entropic' ? 'digit group' : 'remainder group'
      const house = evidence.house && houseLabel(evidence.house)
      const [lower, higher] = right > left ? [start, end] : [end, start]
      description = `${nameCell(start)} and ${nameCell(middle)} add to ${left}. ${nameCell(middle)} and ${nameCell(end)} add to ${right}.`
      description += left === right
        ? ` That forces ${nameCell(start)} and ${nameCell(end)} to use the same digit.`
        : ` That makes ${nameCell(higher)} ${Math.abs(right - left)} more than ${nameCell(lower)}.`
      reason = `${nameCell(start)} and ${nameCell(partner)} must use the same ${group} on this ${line} Line.`
      if (house) {
        reason += ` All four cells must use different digits in ${house}.`
        const example = focus.find(({ cell }) => cell === start)
        if (example) {
          const second = left - example.digit
          reason += ` If ${nameCell(start)} were ${example.digit}, the sums would put ${second} in ${nameCell(middle)} and ${right - second} in ${nameCell(end)}. That leaves no candidate from the same ${group} in ${nameCell(partner)}.`
        }
      } else {
        const houses = (evidence.houses ?? []).map(house => ({ house, sites: variantHouseCells(house, puzzle) }))
        const shared = (a: number, b: number) =>
          houses.find(({ sites }) => sites.includes(a) && sites.includes(b))?.house
        const named = new Intl.ListFormat('en', { type: 'conjunction' }).format(houses.map(({ house }) => houseLabel(house)))
        reason += ` Check the two sums together and exclude repeated digits in ${named}.`
        const triples = DIGITS.flatMap(first => {
          const second = left - first
          const third = right - second
          const digits = [first, second, third]
          if (first === second || second === third || first === third && shared(start, end) ||
            !digits.every((digit, i) => DIGITS.includes(digit) && domains[i] & (1 << (digit - 1)))) return []
          return [digits]
        })
        const repeats = evidence.cells.slice(0, 3).map(cell => shared(cell, partner))
        for (const { cell, digit } of focus) {
          if (cell !== partner) continue
          const groupMask = lineGroupMask(kind, digit)
          const matching = triples.filter(([first]) => groupMask & (1 << (first - 1)))
          if (matching.length === 0) {
            reason += ` If ${nameCell(partner)} were ${digit}, no starting digit in the same ${group} could satisfy both sums.`
            continue
          }
          const startingDigits = alternatives.format(matching.map(([first]) => String(first)))
          reason += ` If ${nameCell(partner)} were ${digit}, ${nameCell(start)} would have to be ${startingDigits}.`
          for (const triple of matching) {
            const [first, second, third] = triple
            const repeat = repeats.find((house, i) => house && triple[i] === digit)
            if (!repeat) continue
            const prefix = matching.length === 1 ? 'The' : `With ${first} in ${nameCell(start)}, the`
            reason += ` ${prefix} sums would put ${second} in ${nameCell(middle)} and ${third} in ${nameCell(end)}. That repeats ${digit} in ${houseLabel(repeat)}.`
          }
        }
      }
      const names = (mask: number) => alternatives.format(DIGITS.filter(digit => mask & (1 << (digit - 1))).map(String))
      reason += ` ${nameCell(start)} can only be ${names(supported[0])}, and ${nameCell(partner)} can only be ${names(supported[3])}.`
      if (house && focus.some(({ cell }) => !evidence.cells.includes(cell))) {
        const digits = DIGITS.filter(digit => locked & (1 << (digit - 1)))
        const text = new Intl.ListFormat('en', { type: 'conjunction' }).format(digits.map(String))
        reason += ` These four cells always use ${text}. Remove ${digits.length === 1 ? 'it' : 'those digits'} from the other cells in ${house}.`
      }
      cells = [...new Set([...evidence.cells, ...focus.map(({ cell }) => cell)])]
      candidates = [
        ...domains.flatMap((mask, i) => DIGITS.filter(value => mask & (1 << (value - 1)))
          .map(digit => ({ cell: evidence.cells[i], digit }))),
        ...focus.filter(({ cell }) => !evidence.cells.includes(cell)),
      ]
      break
    }
    case 'group-line-sum-house': {
      cells = evidence.cells
      const kind = technique === 'entropic' ? 'entropic' : 'modular'
      const line = kind === 'entropic' ? 'Entropic' : 'Modular'
      const groupName = kind === 'entropic' ? 'digit group' : 'remainder group'
      const [target, endpoint, partner] = evidence.cells
      const { total } = evidence
      description = `${nameCell(target)} and ${nameCell(endpoint)} must use the same ${groupName} on this ${line} Line. ${nameCell(endpoint)} and ${nameCell(partner)} add to ${total}.`
      const { digit } = focus[0]
      const group = DIGITS.filter(value => lineGroupMask(kind, digit) & (1 << (value - 1)))
      const otherDigit = total - digit
      const repeatsAtEndpoint = variantHouseCells(evidence.house, puzzle).includes(endpoint) &&
        (evidence.domains[1] & (1 << (digit - 1))) && (evidence.domains[2] & (1 << (otherDigit - 1)))
      const house = houseLabel(evidence.house)
      const endpointReason = repeatsAtEndpoint ? ` It cannot use ${digit}, which would repeat in ${house}.` : ''
      const example = `If ${nameCell(target)} were ${digit}, ${nameCell(endpoint)} would need a digit from {${group.join(', ')}}.${endpointReason} Only ${otherDigit} in that group can complete the sum, so ${nameCell(partner)} would also be ${digit}. That repeats ${digit} in ${house}.`
      reason = focus.length === 1 ? example : `Each crossed-out candidate forces a repeated digit. ${example}`
      candidates = evidence.domains.flatMap((mask, i) => DIGITS.filter(value => mask & (1 << (value - 1)))
        .map(value => ({ cell: cells[i], digit: value })))
      break
    }
    case 'group-line-house': {
      cells = evidence.cells
      const kind = technique === 'entropic' ? 'entropic' : 'modular'
      const line = kind === 'entropic' ? 'Entropic' : 'Modular'
      const group = kind === 'entropic' ? 'digit group' : 'remainder group'
      const [first, second] = evidence.cells
      description = `${nameCell(first)} and ${nameCell(second)} are a multiple of three positions apart on a ${line} Line. They must use the same ${group} and different digits in ${houseLabel(evidence.house)}.`
      const { cell, digit } = focus[0]
      const partner = cell === first ? second : first
      const groupDigits = DIGITS.filter(value => lineGroupMask(kind, digit) & 1 << (value - 1))
      const example = `If ${nameCell(cell)} were ${digit}, ${nameCell(partner)} would need a digit from {${groupDigits.join(', ')}}. Its only candidate in that group is ${digit}, which would repeat in ${houseLabel(evidence.house)}.`
      reason = focus.length === 1 ? example : `Each crossed-out digit would force the same digit in the other cell. ${example}`
      candidates = evidence.domains.flatMap((mask, i) => DIGITS.filter(digit => mask & 1 << (digit - 1))
        .map(digit => ({ cell: cells[i], digit })))
      break
    }
    case 'group-line-house-support': {
      cells = evidence.cells
      const rule = puzzle.rules?.[evidence.rule]
      const family = rule?.type === 'modular' ? 'Modular' : 'Entropic'
      const list = new Intl.ListFormat('en', { type: 'conjunction' })
      const group = (mask: number) => DIGITS.filter(digit => mask & 1 << (digit - 1))
      const phaseOrder = (groups: number[]) => groups.map(mask => group(mask).join(', ')).join(' / ')
      const failed = evidence.cases.flatMap(({ groups, conflict }) => {
        if (!conflict) return []
        const digits = group(conflict.digits)
        const placeNames = list.format(conflict.cells.map(nameCell))
        const digitNames = list.format(digits.map(String))
        const limit = !conflict.cells.length ? `there is no place for ${digitNames}`
          : !digits.length ? `${placeNames} would have no candidate`
          : conflict.cells.length < digits.length ? `${digitNames} could go only in ${placeNames}`
            : `${placeNames} could use only ${digitNames}`
        return [`With groups ${phaseOrder(groups)}, ${limit}.`]
      })
      const house = houseLabel(evidence.house)
      description = `The ${family} line starts at ${nameCell(evidence.lineCells[0])} and repeats three groups. Fit its highlighted cells into ${house} without repeating a digit.`
      const remaining = evidence.cases.filter(example => !example.conflict)
      const choices = remaining.map(({ groups }) => phaseOrder(groups))
      const surviving = choices.length <= 3 ? `Only these group orders fit ${house}. ${alternatives.format(choices)}.` : ''
      reason = [...failed.slice(0, 2), surviving,
        'Check the candidates in the house for the group orders that fit. None of the full assignments uses the crossed-out digits.'].filter(Boolean).join(' ')
      break
    }
    case 'kropki-house': {
      const house = houseLabel(evidence.house)
      const [a, b] = evidence.pair
      const rules = evidence.rules.map(index => puzzle.rules?.[index]).filter(rule => rule?.type === 'kropki')
      const white = rules.some(rule => hasMarkedPair(rule.consecutive?.pairs, a, b))
      const black = rules.some(rule => hasMarkedPair(rule.ratioTwo?.pairs, a, b))
      const dot = white && black ? 'The white and black dots' : white ? 'The white dot' : 'The black dot'
      const rule = white && black ? 'The two digits must be 1 and 2.'
        : white ? 'The two digits must be consecutive.' : 'One digit must be double the other.'
      description = `${dot} join${white && black ? '' : 's'} ${nameCell(a)} and ${nameCell(b)} in ${house}. ${rule}`
      cells = evidence.cells
      const pairDigits = (mask: number) => new Intl.ListFormat('en').format(DIGITS
        .filter(digit => mask & (1 << (digit - 1))).map(String))
      const conflict = dotHouseConflict(evidence)
      if (conflict) {
        const shortage = conflict.blocked.length === 1
          ? `${nameCell(conflict.blocked[0])} has no digit left`
          : `${new Intl.ListFormat('en').format(conflict.blocked.map(nameCell))} can only use ${pairDigits(conflict.digits)}`
        reason = `If the dot uses ${pairDigits(conflict.used)}, ${shortage}. Check the other pairs in ${house} to rule out the crossed-out candidates.`
      } else if (focus.every(({ cell, digit }) => !evidence.pair.includes(cell) && evidence.locked & (1 << (digit - 1)))) {
        const named = pairDigits(evidence.locked)
        reason = `Every assignment that fills ${house} uses ${named} on the dot. Remove those candidates from the other cells in ${house}.`
      } else {
        reason = `Try each pair that fits the dot. The other cells in ${house} must use the digits it leaves. None of the complete assignments uses the crossed-out candidates.`
      }
      break
    }
    case 'thermometer-house': {
      const house = houseLabel(evidence.house)
      const shared = evidence.lineCells.filter(cell => evidence.cells.includes(cell))
      cells = [...new Set([...evidence.cells, ...evidence.lineCells])]
      description = `Read the Thermometer cells in ${house} from ${nameCell(shared[0])} to ${nameCell(shared[shared.length - 1])}. Fit the remaining digits into ${house}.`
      const blocked = evidence.rejected.slice(0, 2).map(mask => Array.from({ length: 9 }, (_, i) => i + 1)
        .filter(digit => mask & (1 << (digit - 1))).join('–'))
      reason = [blocked.length
        ? `The sequence${blocked.length === 1 ? '' : 's'} ${alternatives.format(blocked)} leave${blocked.length === 1 ? 's' : ''} too few places for the remaining digits in ${house}.`
        : `Check where the remaining digits can go for each set on the Thermometer.`,
      `None of the assignments that fill ${house} uses the crossed-out candidates.`].join(' ')
      break
    }
    case 'region-sum-house': {
      const region = houseLabel(evidence.house)
      const inRegion = evidence.lines.flatMap(line => line.parts[line.inRegion].cells)
      cells = [...new Set([...inRegion, ...evidence.remainder, ...focus.map(({ cell }) => cell)])]
      description = evidence.remainder.length
        ? `The marked Region Sum parts and the other cells in ${region} must share the digits 1 to 9 without repeats.`
        : `The marked Region Sum parts fill ${region}. Their totals must add up to 45, using every digit once.`
      const narrowed = evidence.lines.filter(line => line.remainingTotals.length < line.commonTotals.length)
      const totals = narrowed.map(line => {
        const cell = nameCell(line.parts[line.inRegion].cells[0])
        return `The part starting at ${cell} can now total only ${alternatives.format(line.remainingTotals.map(String))}.`
      })
      reason = [`Match each part’s total to the other parts of its line, then check which digit sets fit together in ${region}.`,
        ...totals, 'The crossed-out candidates cannot fit any of the remaining assignments.'].join(' ')
      break
    }
    case 'region-sum-distinct': {
      cells = evidence.parts.flatMap(part => part.cells)
      const shared = alternatives.format(evidence.commonTotals.map(String))
      const smallest = [...evidence.parts].sort((a, b) => a.totals.length - b.totals.length).slice(0, 2)
      const examples = smallest.map(part => {
        const totals = alternatives.format(part.totals.map(String))
        return `The part starting at ${nameCell(part.cells[0])} can total ${totals} with distinct digits.`
      })
      const rule = puzzle.rules?.[evidence.rule]
      const start = rule?.type === 'region-sum' ? rule.cells[0] : cells[0]
      description = `The Region Sum line starts at ${nameCell(start)}. Each part has the same total, and its cells share a region, so its digits must be distinct.`
      reason = `${examples.join(' ')} All parts can reach only ${shared}. None of the assignments for those totals uses the crossed-out candidates.`
      break
    }
    case 'linked-clue': {
      const explanation = explainLinkedClue(evidence, puzzle, nameCell, houseLabel)
      cells = explanation.cells
      description = explanation.description
      reasonSteps = explanation.steps
      reason = reasonSteps.join(' ')
      break
    }
    case 'group-order': {
      const explanation = explainGroupOrder(evidence, puzzle, nameCell, houseLabel)
      cells = [...new Set([...explanation.cells, ...focus.map(({ cell }) => cell)])]
      description = explanation.description
      reason = explanation.reason
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
    case 'entropy-areas': {
      cells = evidence.cells
      const ruleDescriptions = evidence.rules.flatMap(index => {
        const rule = puzzle.rules?.[index]
        if (rule?.type !== 'quadruple' && rule?.type !== 'quadruple-sum') return []
        const window = evidence.windows.find(window => window[0] === rule.topLeft)
        if (!window) return []
        const sum = rule.type === 'quadruple-sum' ? ' Its largest digit equals the sum of the other three.' : ''
        return [`The circle in the area from ${nameCell(window[0])} to ${nameCell(window[3])} requires ${rule.digits.join(', ')}.${sum}`]
      })
      const areas = evidence.windows.map(window => `${nameCell(window[0])} to ${nameCell(window[3])}`)
      const groups = areas.length === 1 ? 'This area needs' : `Both areas (${areas.join(' and ')}) need`
      description = [...ruleDescriptions, `${groups} a low digit (1–3), a medium digit (4–6), and a high digit (7–9).`].join(' ')
      const restrictions = new Intl.ListFormat('en', { type: 'conjunction' }).format(evidence.houses.map(houseLabel))
      const removals = new Intl.ListFormat('en', { type: 'conjunction' }).format(focus.map(({ cell, digit }) => `${digit} in ${nameCell(cell)}`))
      const shared = evidence.windows.length === 2 ? ' Both areas must use the same digits in their shared cells.' : ''
      const required = ruleDescriptions.length ? 'the printed digits and the three groups' : 'the three groups in each area'
      reason = `Fit ${required} without repeating a digit in ${restrictions}.${shared} Every assignment that fits rules out ${removals}.`
      candidates = evidence.domains.flatMap((mask, i) => DIGITS.filter(digit => mask & 1 << (digit - 1))
        .map(digit => ({ cell: cells[i], digit })))
      break
    }
    case 'ray-houses': {
      cells = evidence.cells
      const ray = evidence.rules.map(index => puzzle.rules?.[index]).find(rule => rule?.type === 'little-killer')
      const houseNames = new Intl.ListFormat('en', { type: 'conjunction' }).format(evidence.houses.map(houseLabel))
      const total = ray ? `The Little Killer diagonal from ${nameCell(cells[0])} to ${nameCell(cells[cells.length - 1])} must add to ${ray.sum}.`
        : 'Follow the highlighted Little Killer diagonal.'
      const renban = technique === 'renban-sum-ray-houses'
      description = `${total} Two cells on the diagonal need different digits when both lie in the same house. Check ${houseNames}.`
      if (renban) description += ' The Renban on the diagonal needs its own consecutive set of digits.'
      reason = renban
        ? 'Fit the Renban set and the other digits into the diagonal sum. Check each of the named houses for repeats. For each crossed-out candidate, every assignment containing it fails one of these checks.'
        : 'Fit the digits into the diagonal sum. Check each of the named houses for repeats. For each crossed-out candidate, every assignment containing it fails one of these checks.'
      break
    }
    case 'renban-group-counts': {
      const { assumption, initial, placement, subsequent, conflict } = evidence
      const list = new Intl.ListFormat('en', { type: 'conjunction' })
      const groupName = (mask: number) => mask & 1 ? '1–4' : '6–9'
      const placementConflicts = placement?.rejected.map(([, conflict]) => conflict) ?? []
      const projections = [...initial, ...subsequent]
      const showLine = (projection: (typeof projections)[number], group: typeof conflict) => {
        const positions = projection.cells.filter((cell, index) =>
          group.cells.includes(cell) && (projection.supported[index] & ~group.digits) === 0)
        if (!positions.length) return ''
        const names = list.format(positions.map(nameCell))
        return `The Renban through ${nameCell(projection.cells[0])} confines ${names} to digits ${groupName(group.digits)}.`
      }
      cells = [...new Set([assumption.cell, ...projections.flatMap(line => line.cells), ...conflict.cells,
        ...placementConflicts.flatMap(group => group.cells), ...(placement?.line.cells ?? [])])]
      description = `Try ${assumption.digit} in ${nameCell(assumption.cell)}. Check which digits the Renban lines would use.`
      const initialGroups = placementConflicts.length ? [...placementConflicts, conflict] : [conflict]
      const first = [...new Set(initial.flatMap(line => initialGroups.map(group => showLine(line, group))))].filter(Boolean)
      const bridge = placement ? placement.rejected.map(([start, group]) => {
        const end = start + placement.line.cells.length - 1
        return `If the Renban through ${nameCell(placement.line.cells[0])} were to use ${start}–${end}, five cells in ${houseLabel(group.house)} would have to use digits ${groupName(group.digits)}.`
      }).join(' ') + ` The remaining sets force ${nameCell(placement.candidate.cell)} to be ${placement.candidate.digit}.` : ''
      const last = subsequent.map(line => showLine(line, conflict)).filter(Boolean)
      const outcome = `${list.format(conflict.cells.map(nameCell))} are all in ${houseLabel(conflict.house)} and would need five distinct digits from ${groupName(conflict.digits)}. Remove ${assumption.digit} from ${nameCell(assumption.cell)}.`
      reason = [...first, bridge, ...last, outcome].filter(Boolean).join(' ')
      break
    }
    case 'renban-house-support': {
      cells = evidence.cells
      const length = evidence.lineLength
      const house = houseLabel(evidence.house)
      const set = (mask: number) => DIGITS.filter(digit => mask & 1 << (digit - 1))
      const viable = set(evidence.starts).map(first => `${first}–${first + length - 1}`)
      description = `All ${length} Renban cells lie in ${house}. They need a consecutive set. The other cells in the house must use the remaining digits.`
      reason = `Check each consecutive set against the candidates on and off the line. The line can use ${alternatives.format(viable)}. The crossed-out candidates have no place in any complete assignment.`
      const paired = evidence.pairedCell
      if (paired !== null) {
        const pair = set(evidence.domains[cells.indexOf(paired)])
        const target = focus[0].cell
        cells = [...cells.slice(0, length), paired, target]
        candidates = [...focus, ...pair.map(digit => ({ cell: paired, digit }))]
        description = `${nameCell(paired)} can contain only ${alternatives.format(pair.map(String))}. It shares ${house} with ${nameCell(target)} and the entire Renban.`
        const assumptions = alternatives.format(focus.map(({ digit }) => String(digit)))
        const removals = new Intl.ListFormat('en', { type: 'conjunction' }).format(focus.map(({ digit }) => String(digit)))
        reason = `If ${nameCell(target)} is ${assumptions}, these two cells use both ${pair[0]} and ${pair[1]}. Every consecutive set that fits the Renban needs at least one of those digits. Remove ${removals} from ${nameCell(target)}.`
      }
      break
    }
    case 'renban-sum': {
      cells = evidence.cells
      const renban = puzzle.rules?.[evidence.rules[0]]
      const ray = puzzle.rules?.[evidence.rules[1]]
      description = 'The highlighted Renban lies entirely on the Little Killer diagonal.'
      reason = 'Each crossed-out candidate has no assignment that fits both clues.'
      if (renban?.type === 'renban' && ray?.type === 'little-killer') {
        const length = renban.cells.length
        description = `The Little Killer diagonal from ${nameCell(cells[0])} to ${nameCell(cells[cells.length - 1])} totals ${ray.sum}. It includes all ${length} cells of the Renban.`
        const remaining = cells.filter(cell => !renban.cells.includes(cell))
        const ranges = DIGITS.filter(digit => evidence.starts & 1 << (digit - 1)).map(first => {
          const end = first + length - 1
          const sum = length * (first + end) / 2
          return remaining.length
            ? `The set from ${first} to ${end} adds to ${sum}, leaving ${ray.sum - sum}.`
            : `The set from ${first} to ${end} adds to the full total.`
        })
        const totals = remaining.length === 1
          ? `Check the candidates in ${nameCell(remaining[0])} against what remains.`
          : remaining.length > 1 ? 'Check whether the other cells on the diagonal can add to what remains.' : ''
        reason = `Try consecutive sets of ${length} digits on the Renban. Here are the sets that fit both clues. ${ranges.join(' ')} ${totals ? totals + ' ' : ''}None of these sets gives a complete assignment with a crossed-out candidate.`
      }
      break
    }
    case 'renban-sum-house': {
      cells = evidence.cells
      const ray = puzzle.rules?.[evidence.rules[1]]
      const total = ray?.type === 'little-killer' ? `The diagonal totals ${ray.sum}.` : 'Follow the Little Killer diagonal.'
      const shared = nameCell(evidence.shared)
      const restricted = nameCell(evidence.restricted)
      description = `${total} One Renban lies on the diagonal. The other Renban meets it at ${shared} and shares ${houseLabel(evidence.house)} with ${restricted}.`
      reason = `Try each consecutive set that fits the Renban through ${shared}. All digits in that set are used in the house, so they are unavailable at ${restricted}. Check the remaining candidates against the total and the Renban on the diagonal. None of the assignments that fit all these clues uses a crossed-out candidate.`
      const { witness } = evidence
      const first = puzzle.rules?.[evidence.rules[0]]
      const other = puzzle.rules?.[evidence.rules[2]]
      if (witness && ray?.type === 'little-killer' && first?.type === 'renban' && other?.type === 'renban') {
        const digitList = new Intl.ListFormat('en', { type: 'conjunction' })
        const range = (start: number, length: number) => digitList.format(DIGITS.slice(start - 1, start - 1 + length).map(String))
        const remaining = ray.sum - witness.candidate.digit
        const line = witness.containedStart === null ? ''
          : ` The Renban on the diagonal must use ${range(witness.containedStart, first.cells.length)}.`
        const pivot = witness.candidate.cell === evidence.shared ? ''
          : ` The two clues force ${shared} to be ${witness.sharedDigit}.`
        const limits = digitList.format(DIGITS.filter(digit => witness.restrictedDigits & (1 << (digit - 1))).map(String))
        reason = `If ${nameCell(witness.candidate.cell)} is ${witness.candidate.digit}, the other cells of the diagonal must add to ${remaining}.${line}${pivot} The Renban through ${shared} must then use ${range(witness.otherStart, other.cells.length)}. That uses ${limits} in ${houseLabel(evidence.house)} and leaves no candidate for ${restricted}.`
        if (actions.length > 1) reason += 'Checking the other possibilities also rules out the remaining crossed-out candidates.'
      }
      break
    }
    case 'constraint': {
      cells = evidence.cells
      const clue = constraintClue(evidence, puzzle, nameCell, focus)
      description = clue.description
      reason = clue.reason
      switch (technique) {
        case 'lettered-quadruples':
          cells = [focus[0].cell]
          break
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
    evidence: { variant: { description, reason, ...(reasonSteps && { reasonSteps }), source: { deduction, puzzle } } },
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
