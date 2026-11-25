import { sizedSumEndCells, sizedSumEndLabel } from '../sudoku/sized-linked-double-arrow'
import type { SizedConstraintRule, VariantPuzzle, VariantRule } from '../sudoku/engine'
import { extraRegionName, palindromePartner, quadrupleCells, sumLabel } from '../sudoku/variants'
import { regionSumParts, sizedRegionSumParts } from '../sudoku/region-sum'
import { gridDiagonalCells, rowColumnSumTotal, type SizedGrid } from '../sudoku/grid'
import { cloneLayout } from '../sudoku/clone'

const x = (cell: number, size = 9) => cell % size
const y = (cell: number, size = 9) => Math.floor(cell / size)

export function sizedRuleClueLabels(rules: readonly SizedConstraintRule[], grid: SizedGrid) {
  const { size } = grid
  const labels: Set<string>[] = Array.from({ length: size * size }, () => new Set())
  const at = (cell: number) => `row ${y(cell, size) + 1}, column ${x(cell, size) + 1}`
  let renbanNumber = 0, regionSumNumber = 0, doubleArrowNumber = 0
  for (const rule of rules) {
    if (rule.type === 'diagonal') {
      for (const cell of gridDiagonalCells(size, rule.diagonal)) labels[cell].add(rule.diagonal === 'main' ? 'top-left diagonal' : 'top-right diagonal')
    } else if (rule.type === 'extra-house') {
      for (const cell of rule.cells) labels[cell].add('extra region')
    } else if (rule.type === 'killer-cages') {
      for (const { cells, sum } of rule.cages) for (const cell of cells) labels[cell].add(`cage total ${sum}`)
    } else if (rule.type === 'quadruple') {
      const description = 'Quadruple circle with ' + rule.digits.join(', ')
      for (const cell of quadrupleCells(rule.topLeft, size)) labels[cell].add(description)
    } else if (rule.type === 'parity') {
      const odd = rule.parity === 'odd'
      const digits = Array.from({ length: Math.floor((size + Number(odd)) / 2) }, (_, index) => String(index * 2 + (odd ? 1 : 2)))
      const allowed = new Intl.ListFormat('en', { type: 'disjunction' }).format(digits)
      for (const cell of rule.cells) labels[cell].add(`${odd ? 'odd circle' : 'even square'}, digit must be ${allowed}`)
    } else if (rule.type === 'renban') {
      renbanNumber++
      for (const cell of rule.cells) labels[cell].add(`Renban line ${renbanNumber}, ${rule.cells.length === 1
        ? `one cell, any digit from 1 to ${size}` : `${rule.cells.length} different consecutive digits in any order`}`)
    } else if (rule.type === 'region-sum') {
      regionSumNumber++
      for (const [part, cells] of sizedRegionSumParts(rule, grid).entries()) for (const cell of cells) {
        labels[cell].add(`Region Sum line ${regionSumNumber}, ${rule.groupByRegion ? ('regions' in grid ? 'region group' : 'box group') : 'segment'} ${part + 1}`)
      }
    } else if (rule.type === 'arrow') {
      labels[rule.circle].add(`arrow bulb for ${rule.cells.map(at).join('; ')}`)
      for (const cell of rule.cells) labels[cell].add(`arrow shaft from the bulb at ${at(rule.circle)}`)
    } else if (rule.type === 'linked-double-arrow') {
      doubleArrowNumber++
      for (const cell of rule.cells) labels[cell].add(`Double Arrow ${doubleArrowNumber} line`)
      for (const end of rule.ends) {
        if (typeof end === 'number') labels[end].add(`Double Arrow ${doubleArrowNumber} end circle`)
        else labels[sizedSumEndCells(end, size)[0]].add(`First cell of ${sizedSumEndLabel(end, size)}`)
      }
    } else if (rule.type === 'double-arrow') {
      doubleArrowNumber++
      const [a, b] = rule.ends
      labels[a].add(`Double Arrow ${doubleArrowNumber} end circle paired with ${at(b)}`)
      labels[b].add(`Double Arrow ${doubleArrowNumber} end circle paired with ${at(a)}`)
      for (const cell of rule.cells) labels[cell].add(`Double Arrow ${doubleArrowNumber} line`)
    } else if (rule.type === 'row-column-sum') {
      for (const [a, b] of rule.pairs) {
        const total = rowColumnSumTotal([a, b], size)
        labels[a].add(`sum diamond with ${at(b)}, total ${total}`)
        labels[b].add(`sum diamond with ${at(a)}, total ${total}`)
      }
    } else if (rule.type === 'difference') {
      const [a, b] = rule.cells
      labels[a].add(`difference of ${rule.difference} with ${at(b)}`)
      labels[b].add(`difference of ${rule.difference} with ${at(a)}`)
    } else if (rule.type === 'labeled-dots') {
      for (const { cells: [a, b], value } of rule.marks) {
        const relation = rule.relation === 'ratio' ? `ratio of 1 to ${value}` : `difference of ${value}`
        labels[a].add(`${relation} with ${at(b)}`)
        labels[b].add(`${relation} with ${at(a)}`)
      }
    } else if (rule.type === 'kropki') {
      for (const [marks, color] of [[rule.consecutive, 'white'], [rule.ratioTwo, 'black']] as const) {
        for (const [a, b] of marks?.pairs ?? []) {
          labels[a].add(`${color} dot with ${at(b)}`)
          labels[b].add(`${color} dot with ${at(a)}`)
        }
      }
    } else if (rule.type === 'thermometer') {
      rule.cells.forEach((cell, index) => labels[cell].add(index === 0 ? 'thermometer bulb' : index === rule.cells.length - 1 ? 'thermometer tip' : 'thermometer'))
    } else if (rule.type === 'slow-thermometer') {
      rule.cells.forEach((cell, index) => labels[cell].add(index === 0 ? 'slow thermometer bulb' : index === rule.cells.length - 1 ? 'slow thermometer tip' : 'slow thermometer'))
    } else if (rule.type === 'whispers') {
      for (const cell of rule.cells) labels[cell].add(`Whispers line, neighboring digits differ by at least ${rule.minDifference}`)
    } else if (rule.type === 'xv') {
      for (const [pairs, total, marker] of [[rule.five?.pairs ?? [], 5, 'V'], [rule.ten?.pairs ?? [], 10, 'X']] as const) {
        for (const [a, b] of pairs) {
          labels[a].add(`${marker} marker totals ${total} with ${at(b)}`)
          labels[b].add(`${marker} marker totals ${total} with ${at(a)}`)
        }
      }
    }
  }
  return labels.map(items => [...items].join(', '))
}

const reference = (cell: number) => `row ${y(cell) + 1}, column ${x(cell) + 1}`

export function variantCellLabels(rules: readonly VariantRule[], regions?: VariantPuzzle['regions']) {
  const labels: string[][] = Array.from({ length: 81 }, () => [])
  for (const set of cloneLayout(rules).sets) for (const cell of set.cells) labels[cell].push(
    `Clone ${set.label}, same digit as ${set.cells.filter(other => other !== cell).map(reference).join('; ')}`)
  for (const [index, rule] of rules.entries()) {
    switch (rule.type) {
      case 'minimum': case 'maximum': {
        const minimum = rule.type === 'minimum'
        const label = minimum ? 'Minimum mark, smaller than its compared edge neighbors' : 'Maximum mark, larger than its compared edge neighbors'
        for (const cell of rule.cells) labels[cell].push(label)
        break
      }
      case 'labeled-dots':
        for (const { cells: [a, b], value } of rule.marks) {
          const clue = rule.relation === 'ratio' ? `black dot, ratio ${value} to 1` : `white dot, difference ${value}`
          labels[a].push(`${clue} with ${reference(b)}`)
          labels[b].push(`${clue} with ${reference(a)}`)
        }
        break
      case 'inequality':
        labels[rule.less].push(`inequality, smaller than ${reference(rule.greater)}`)
        labels[rule.greater].push(`inequality, larger than ${reference(rule.less)}`)
        break
      case 'adjacent-total': {
        const [a, b] = rule.cells
        const describe = (cell: number) => `${sumLabel(rule.sum)} clue, sum ${rule.sum} with ${reference(cell)}`
        if (!labels[a].includes(describe(b))) labels[a].push(describe(b))
        if (!labels[b].includes(describe(a))) labels[b].push(describe(a))
        break
      }
      case 'xv':
        for (const [sum, marks] of [[5, rule.five], [10, rule.ten]] as const) for (const [a, b] of marks?.pairs ?? []) {
          const describe = (cell: number) => `${sum === 5 ? 'V' : 'X'} clue, sum ${sum} with ${reference(cell)}`
          if (!labels[a].includes(describe(b))) labels[a].push(describe(b))
          if (!labels[b].includes(describe(a))) labels[b].push(describe(a))
        }
        break
      case 'non-consecutive':
        for (const [a, b] of rule.except ?? []) {
          labels[a].push(`Non-Consecutive exception with ${reference(b)}`)
          labels[b].push(`Non-Consecutive exception with ${reference(a)}`)
        }
        break
      case 'parity':
        for (const cell of rule.cells) labels[cell].push(rule.parity === 'odd'
          ? 'odd circle, digit must be 1, 3, 5, 7, or 9'
          : 'even square, digit must be 2, 4, 6, or 8')
        break
      case 'digit-restriction':
        for (const cell of rule.cells) labels[cell].push(`${rule.shape} shape, only digits ${rule.digits.join(', ')}`)
        break
      case 'entropy-window-group': {
        const [low, high] = rule.group === 'low' ? [1, 3] : rule.group === 'middle' ? [4, 6] : [7, 9]
        for (const cell of rule.cells) labels[cell].push(`Global Entropy 2 by 2 window, digits ${low} to ${high} appear twice`)
        break
      }
      case 'lettered-quadruples':
        for (const { topLeft, letters } of rule.clues) for (const cell of quadrupleCells(topLeft)) {
          labels[cell].push(`Lettered Quadruple ${[...letters].join(', ')}, circle touching ${reference(topLeft)} and its three neighbors`)
        }
        break
      case 'quadruple': case 'quadruple-sum':
        for (const cell of quadrupleCells(rule.topLeft)) labels[cell].push(
          `${rule.type === 'quadruple-sum' ? 'Quad-Arrows' : 'Quadruple'} ${rule.digits.join(', ')}, circle touching ${reference(rule.topLeft)} and its three neighbors; repeated digits need separate cells` +
          (rule.type === 'quadruple-sum' ? '; largest digit equals the sum of the other three' : ''))
        break
      case 'diagonal': {
        const main = rule.diagonal === 'main'
        for (let i = 0; i < 9; i++) {
          labels[main ? i * 10 : i * 8 + 8].push(main ? 'top-left diagonal' : 'top-right diagonal')
        }
        break
      }
      case 'distinct-cells':
        for (const cell of rule.cells) labels[cell].push('Shaded group, all digits differ')
        break
      case 'inside-grid':
        rule.rows.forEach((row, i) => row.forEach((cell, j) =>
          labels[cell].push(`Inside Grid row ${i + 1}, column ${j + 1}`)))
        break
      case 'consecutive-run':
        for (const cell of rule.cells) labels[cell].push(rule.fromBulb
          ? `Consecutive Thermometer from the bulb at ${reference(rule.cells[0])}, digits increase by one at each step`
          : `Consecutive Line from ${reference(rule.cells[0])} to ${reference(rule.cells.at(-1)!)}, digits increase by one from one end to the other`)
        break
      case 'extra-house':
        for (const cell of rule.cells) labels[cell].push(`${extraRegionName(rules, index)}, digits 1–9 once each`)
        break
      case 'killer-cages':
        for (const { cells, sum } of rule.cages) {
          const corner = reference(Math.min(...cells))
          for (const cell of cells) labels[cell].push(`cage totaling ${sum}, starting at ${corner}`)
        }
        break
      case 'whispers':
        for (const cell of new Set(rule.cells)) {
          const neighbors = new Set(rule.cells.flatMap((other, i) => i > 0
            ? other === cell ? [rule.cells[i - 1]] : rule.cells[i - 1] === cell ? [other] : [] : []))
          labels[cell].push(`Whispers line, minimum difference ${rule.minDifference} with ${[...neighbors].map(reference).join(' and ')}`)
        }
        break
      case 'entropic': {
        const number = rules.slice(0, index + 1).filter(rule => rule.type === 'entropic').length
        for (const cell of new Set(rule.cells)) labels[cell].push(`Entropic line ${number}, ${rule.cells.length === 1 ? 'one-cell path, any digit 1–9' : rule.cells.length === 2 ? 'two positions from different low (1–3), medium (4–6) or high (7–9) groups' : 'every three successive positions contain a low (1–3), medium (4–6) and high (7–9) digit'}`)
        break
      }
      case 'modular': {
        const number = rules.slice(0, index + 1).filter(rule => rule.type === 'modular').length
        for (const cell of new Set(rule.cells)) labels[cell].push(`Modular line ${number}, ${rule.cells.length === 1 ? 'one-cell path, any digit 1–9' : rule.cells.length === 2 ? 'two positions from different groups {1, 4, 7}, {2, 5, 8} or {3, 6, 9}' : 'every three successive positions contain one digit from each group {1, 4, 7}, {2, 5, 8} and {3, 6, 9}'}`)
        break
      }
      case 'renban':
        for (const cell of rule.cells) labels[cell].push(`Renban line ${rules.slice(0, index + 1).filter(rule => rule.type === 'renban').length}, ${rule.cells.length === 1 ? 'one-cell set, any digit 1–9' : `${rule.cells.length} different consecutive digits in any order`}`)
        break
      case 'palindrome':
        for (const cell of rule.cells) {
          const partner = palindromePartner(rule.cells, cell)
          labels[cell].push(partner === undefined ? 'Palindrome middle cell, no matching partner'
            : `Palindrome line, same digit as ${reference(partner)}`)
        }
        break
      case 'region-sum': {
        const number = rules.slice(0, index + 1).filter(rule => rule.type === 'region-sum').length
        for (const [part, cells] of regionSumParts(rule, regions).entries()) for (const cell of cells) labels[cell].push(
          `Region Sum line ${number}, part ${part + 1}, same total as the other parts; ${rule.groupByRegion ? 'visits to each region are combined' : 'separate visits stay separate'}`)
        break
      }
      case 'between': {
        const ends = [rule.cells[0], rule.cells[rule.cells.length - 1]]
        const number = rules.slice(0, index + 1).filter(rule => rule.type === 'between').length
        for (const cell of rule.cells) labels[cell].push(ends.includes(cell)
          ? `Between line ${number} endpoint circle, other endpoint at ${reference(ends.find(end => end !== cell)!)}`
          : `Between line ${number} interior, digit strictly between the circles at ${ends.map(reference).join(' and ')}`)
        break
      }
      case 'lockout': {
        const ends = [rule.cells[0], rule.cells.at(-1)!]
        for (const cell of rule.cells) labels[cell].push(ends.includes(cell)
          ? `Lockout diamond, difference of at least 4 with ${reference(ends.find(end => end !== cell)!)}`
          : `Lockout interior, digit below both or above both diamonds at ${ends.map(reference).join(' and ')}`)
        break
      }
      case 'thermometer':
        rule.cells.forEach((cell, index) => {
          labels[cell].push(index === 0 ? 'thermometer bulb' :
            `thermometer cell ${index + 1} of ${rule.cells.length} from the bulb at ${reference(rule.cells[0])}`)
        })
        break
      case 'arrow':
        labels[rule.circle].push(`arrow circle, path through ${rule.cells.map(reference).join('; ')}`)
        for (const cell of rule.cells) labels[cell].push(`arrow path from the circle at ${reference(rule.circle)}`)
        break
      case 'pill-arrow': {
        const [tens, ones] = rule.pill
        labels[tens].push(`Pill Arrow tens digit, ones digit at ${reference(ones)}`)
        labels[ones].push(`Pill Arrow ones digit, tens digit at ${reference(tens)}`)
        for (const cell of rule.cells) labels[cell].push(`Pill Arrow path, sum equals the two-digit number in ${reference(tens)} and ${reference(ones)}`)
        break
      }
      case 'kropki':
        for (const [marks, color] of [[rule.consecutive, 'white'], [rule.ratioTwo, 'black']] as const) {
          for (const [a, b] of marks?.pairs ?? []) {
            labels[a].push(`${color} dot with ${reference(b)}`)
            labels[b].push(`${color} dot with ${reference(a)}`)
          }
        }
        break
      default: break
    }
  }
  return labels
}
