import { cornerKropkiAllows, cornerKropkiKinds, cornerPairs, validCornerKropki } from './corner-kropki.ts'
import { sizedQuadrupleState, validSizedQuadruple } from './sized-quadruple.ts'
import { PUZZLE_VARIANTS } from './variants.ts'
import { isSizedSumEnd, linkedDoubleArrowConflicts, sizedSumEndKey } from './sized-linked-double-arrow.ts'
import { nonogramState, validNonogramRule } from './sized-nonogram.ts'
import { skyscrapersState, validSizedSkyscrapersRule } from './sized-skyscrapers.ts'
import { runEngine, type EngineRunner, type MarkedPairs, type SizedConstraintPosition, type SizedConstraintRule } from './engine.ts'
import { conflictsOf } from './game.ts'
import { isGridText, gridCellsShareEdge, gridDiagonalCells, kropkiDigitExclusions, rowColumnSumTotal, sizedClassicPosition, type SizedGrid } from './grid.ts'
import { sizedRegionSumParts } from './region-sum.ts'
import { sizedKillerState, validSizedKillerRule } from './sized-killer.ts'
import { validation } from './puzzle-validation.ts'
import { validRowEquation } from './row-equation.ts'
import { FRACTIONAL_REGIONS_DESCRIPTION, validFractionalRegions } from './fractional-regions.ts'

export type SizedRuleDefinition = { grid: SizedGrid; givens: string; rules: readonly SizedConstraintRule[]; author?: string; authoredSolution?: string; authoredSolutionOnly?: true }
export type SizedRuleGame = Pick<SizedRuleDefinition, 'rules' | 'author'> & { solution: string }

export function isSizedRuleAuthor(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 72
}

function validSizedSandwich(rule: Record<string, unknown>, size: number) {
  if (Object.keys(rule).some(key => !['type', 'cells', 'direction', 'sum'].includes(key)) || Object.keys(rule).length !== 4 ||
    !['north', 'east', 'south', 'west'].includes(String(rule.direction)) ||
    !Array.isArray(rule.cells) || rule.cells.length !== size ||
    rule.cells.some(cell => !Number.isInteger(cell) || Number(cell) < 0 || Number(cell) >= size ** 2) ||
    new Set(rule.cells).size !== size || !Number.isInteger(rule.sum) || Number(rule.sum) < 0 ||
    Number(rule.sum) > size * (size + 1) / 2 - size - 1) return false
  const cells = rule.cells as number[]
  const first = cells[0]
  const direction = rule.direction
  return direction === 'north' ? Math.floor(first / size) === size - 1 && cells.every((cell, index) => cell === first - index * size)
    : direction === 'south' ? Math.floor(first / size) === 0 && cells.every((cell, index) => cell === first + index * size)
      : direction === 'east' ? first % size === 0 && cells.every((cell, index) => cell === first + index)
        : first % size === size - 1 && cells.every((cell, index) => cell === first - index)
}

function validKropkiMarks(value: unknown, size: number): value is MarkedPairs {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => key !== 'pairs' && key !== 'negative')) return false
  const { negative, pairs } = value as MarkedPairs
  return (negative === undefined || typeof negative === 'boolean') &&
    (pairs === undefined || Array.isArray(pairs) && pairs.length <= 2 * size * (size - 1) &&
      pairs.every(pair => Array.isArray(pair) && pair.length === 2 &&
        pair.every(cell => Number.isInteger(cell) && cell >= 0 && cell < size ** 2) &&
        gridCellsShareEdge(pair[0], pair[1], size)))
}

export function isSizedRuleList(value: unknown, grid: SizedGrid): value is SizedRuleDefinition['rules'] {
  const { size } = grid
  if (!Array.isArray(value) || value.length > 128) return false
  const occupiedCages = new Set<number>()
  return value.every(rule => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false
    if (rule.type === 'fractional-regions') return Object.keys(rule).length === 2 &&
      'noRegions' in grid && validFractionalRegions(rule.pieces, size, 0)
    if (rule.type === 'little-killer') {
      const cells = Array.isArray(rule.cells) ? rule.cells as number[] : []
      const direction = rule.direction
      if (Object.keys(rule).length !== 4 || typeof direction !== 'string' || !['north-east', 'south-east', 'south-west', 'north-west'].includes(direction) ||
        cells.length < 1 || cells.length > size ||
        cells.some((cell: number) => !Number.isInteger(cell) || cell < 0 || cell >= size ** 2) ||
        new Set(cells).size !== cells.length || !Number.isInteger(rule.sum) || Number(rule.sum) < cells.length || Number(rule.sum) > size * cells.length) return false
      const [dr, dc] = direction === 'north-east' ? [-1, 1] : direction === 'south-east' ? [1, 1]
        : direction === 'south-west' ? [1, -1] : [-1, -1]
      const first = cells[0]
      const row = Math.floor(first / size), column = first % size
      if (row - dr >= 0 && row - dr < size && column - dc >= 0 && column - dc < size) return false
      return cells.every((cell: number, index: number) => cell === (row + dr * index) * size + column + dc * index) &&
        (row + dr * rule.cells.length < 0 || row + dr * rule.cells.length >= size ||
          column + dc * rule.cells.length < 0 || column + dc * rule.cells.length >= size)
    }
    if (rule.type === 'crust') {
      if (Object.keys(rule).some(key => !['type', 'clues', 'sharedRegion', 'fixedEdges'].includes(key)) ||
        !Array.isArray(rule.clues) || rule.clues.length === 0 ||
        rule.clues.length > 4 * size || !('noRegions' in grid)) return false
      const validEdgePair = (value: unknown): value is readonly [number, number] => Array.isArray(value) && value.length === 2 &&
        value.every(cell => Number.isInteger(cell) && cell >= 0 && cell < size ** 2) && value[0] !== value[1] &&
        gridCellsShareEdge(value[0], value[1], size)
      if (rule.sharedRegion !== undefined && (!Array.isArray(rule.sharedRegion) || rule.sharedRegion.length !== 2 ||
        rule.sharedRegion.some((cell: unknown) => !Number.isInteger(cell) || typeof cell !== 'number' || cell < 0 || cell >= size ** 2) ||
        rule.sharedRegion[0] === rule.sharedRegion[1])) return false
      if (rule.fixedEdges !== undefined && (!Array.isArray(rule.fixedEdges) || rule.fixedEdges.length > 2 * size * (size - 1) ||
        !rule.fixedEdges.every(validEdgePair) ||
        new Set(rule.fixedEdges.map(([a, b]: [number, number]) => `${Math.min(a, b)}:${Math.max(a, b)}`)).size !== rule.fixedEdges.length)) return false
      const seen = new Set<string>()
      return rule.clues.every((clue: unknown) => {
        if (!clue || typeof clue !== 'object' || Array.isArray(clue)) return false
        const item = clue as Record<string, unknown>
        if (Object.keys(item).some(key => !['direction', 'cells', 'sum', 'crossed'].includes(key)) ||
          !['north', 'east', 'south', 'west'].includes(String(item.direction)) ||
          !Array.isArray(item.cells) || item.cells.length !== size ||
          item.cells.some(cell => !Number.isInteger(cell) || Number(cell) < 0 || Number(cell) >= size ** 2) ||
          !Number.isInteger(item.sum) || Number(item.sum) < 1 || Number(item.sum) > size * (size + 1) / 2 ||
          item.crossed !== undefined && (!Number.isInteger(item.crossed) || Number(item.crossed) < 0 || Number(item.crossed) >= size)) return false
        const cells = item.cells as number[]
        const direction = item.direction
        const first = cells[0]
        const valid = direction === 'north' ? Math.floor(first / size) === size - 1 && cells.every((cell, i) => cell === first - i * size)
          : direction === 'south' ? Math.floor(first / size) === 0 && cells.every((cell, i) => cell === first + i * size)
            : direction === 'east' ? first % size === 0 && cells.every((cell, i) => cell === first + i)
              : first % size === size - 1 && cells.every((cell, i) => cell === first - i)
        const key = `${direction}:${first}`
        if (!valid || seen.has(key)) return false
        seen.add(key)
        return true
      })
    }
    if (rule.type === 'anti-king') return Object.keys(rule).length === 1
    if (rule.type === 'entropic') {
      if (Object.keys(rule).some(key => !['type', 'cells', 'groups'].includes(key)) ||
        !Array.isArray(rule.cells) || rule.cells.length < 3 || rule.cells.length > size ** 2 + 1 ||
        rule.cells.some((cell: unknown) => !Number.isInteger(cell) || Number(cell) < 0 || Number(cell) >= size ** 2) ||
        !Array.isArray(rule.groups) || rule.groups.length !== 3 ||
        !rule.groups.every((group: unknown) => Array.isArray(group) && group.length > 0 &&
          group.every((digit: unknown) => Number.isInteger(digit) && Number(digit) >= 1 && Number(digit) <= size))) return false
      const digits = rule.groups.flat() as number[]
      return digits.length === size && new Set(digits).size === size
    }
    if (rule.type === 'killer-cages') return validSizedKillerRule(rule, size, occupiedCages)
    if (rule.type === 'quadruple') return validSizedQuadruple(rule, size)
    if (rule.type === 'nonogram') return validNonogramRule(rule, size)
    if (rule.type === 'skyscrapers') return validSizedSkyscrapersRule(rule, size)
    if (rule.type === 'diagonal') {
      return Object.keys(rule).length === 2 && (rule.diagonal === 'main' || rule.diagonal === 'anti')
    }
    if (rule.type === 'global-entropy') {
      if (Object.keys(rule).some(key => key !== 'type' && key !== 'groups')) return false
      if (rule.groups === undefined) return size === 9
      if (!Array.isArray(rule.groups) || rule.groups.length !== 3 ||
        !rule.groups.every((group: unknown) => Array.isArray(group) && group.length > 0 &&
          group.every((digit: unknown) => Number.isInteger(digit) && Number(digit) >= 1 && Number(digit) <= size))) return false
      const digits = rule.groups.flat() as number[]
      return digits.length === size && new Set(digits).size === size &&
        digits.every(digit => Number.isInteger(digit) && digit >= 1 && digit <= size)
    }
    if (rule.type === 'non-consecutive') {
      return Object.keys(rule).every(key => key === 'type' || key === 'except') &&
        (rule.except === undefined || Array.isArray(rule.except) && rule.except.length <= 2 * size * (size - 1) &&
          rule.except.every((pair: unknown) => Array.isArray(pair) && pair.length === 2 &&
            pair.every(cell => Number.isInteger(cell) && cell >= 0 && cell < size ** 2) && gridCellsShareEdge(pair[0], pair[1], size)) &&
          new Set(rule.except.map(([a, b]: [number, number]) => Math.min(a, b) * size ** 2 + Math.max(a, b))).size === rule.except.length)
    }
    if (rule.type === 'inequality') return Object.keys(rule).length === 3 &&
      Number.isInteger(rule.less) && rule.less >= 0 && rule.less < size ** 2 &&
      Number.isInteger(rule.greater) && rule.greater >= 0 && rule.greater < size ** 2 && rule.less !== rule.greater &&
      gridCellsShareEdge(rule.less, rule.greater, size)
    if (rule.type === 'anti-sum') {
      return Object.keys(rule).length === 2 && Number.isInteger(rule.sum) && rule.sum >= 2 && rule.sum <= 2 * size
    }
    if (rule.type === 'row-column-sum') {
      return Object.keys(rule).every(key => key === 'type' || key === 'pairs' || key === 'requireUnmarked') &&
        (rule.requireUnmarked === undefined || typeof rule.requireUnmarked === 'boolean') &&
        Array.isArray(rule.pairs) && rule.pairs.length <= 2 * size * (size - 1) &&
        (rule.pairs.length > 0 || rule.requireUnmarked === true) &&
        rule.pairs.every((pair: unknown) => Array.isArray(pair) && pair.length === 2 &&
          pair.every(cell => Number.isInteger(cell) && cell >= 0 && cell < size ** 2) && gridCellsShareEdge(pair[0], pair[1], size)) &&
        new Set(rule.pairs.map(([a, b]: [number, number]) => Math.min(a, b) * size ** 2 + Math.max(a, b))).size === rule.pairs.length
    }
    if (rule.type === 'row-equation') return validRowEquation(rule, size)
    if (rule.type === 'kropki') {
      return Object.keys(rule).every(key => ['type', 'consecutive', 'ratioTwo'].includes(key)) &&
        [rule.consecutive, rule.ratioTwo].every(marks => marks === undefined || validKropkiMarks(marks, size))
    }
    if (rule.type === 'corner-kropki') return validCornerKropki(rule, size)
    if (rule.type === 'xv') {
      if (Object.keys(rule).some(key => !['type', 'five', 'ten'].includes(key)) ||
        rule.five !== undefined && !validKropkiMarks(rule.five, size) ||
        rule.ten !== undefined && !validKropkiMarks(rule.ten, size) ||
        ![rule.five, rule.ten].some(marks => (marks as MarkedPairs | undefined)?.pairs?.length ||
          (marks as MarkedPairs | undefined)?.negative)) return false
      const marks = [rule.five, rule.ten].flatMap(value => (value as MarkedPairs | undefined)?.pairs ?? [])
      return new Set(marks.map(([a, b]) => Math.min(a, b) * size ** 2 + Math.max(a, b))).size === marks.length
    }
    if (rule.type === 'whispers') {
      const cells: unknown[] = Array.isArray(rule.cells) ? rule.cells : []
      return Object.keys(rule).length === 3 && Number.isInteger(rule.minDifference) &&
        Number(rule.minDifference) >= 1 && Number(rule.minDifference) < size && Array.isArray(rule.cells) &&
        cells.length >= 2 && cells.length <= size ** 2 &&
        cells.every(cell => typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < size ** 2) &&
        cells.every((cell, index) => index === 0 || cell !== cells[index - 1])
    }
    if (rule.type === 'sandwich') return validSizedSandwich(rule as Record<string, unknown>, size)
    if (rule.type === 'labeled-dots') {
      const ratio = rule.relation === 'ratio'
      return Object.keys(rule).every(key => ['type', 'relation', 'marks', 'negative'].includes(key)) &&
        (ratio || rule.relation === 'difference') &&
        (rule.negative === undefined || typeof rule.negative === 'boolean') &&
        Array.isArray(rule.marks) && rule.marks.length <= 2 * size * (size - 1) &&
        (rule.marks.length > 0 || rule.negative === true) && rule.marks.every((mark: { cells?: unknown; value?: unknown }) =>
          mark && typeof mark === 'object' && Object.keys(mark).length === 2 &&
          Array.isArray(mark.cells) && mark.cells.length === 2 &&
          mark.cells.every((cell: unknown) => typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < size ** 2) &&
          gridCellsShareEdge(mark.cells[0], mark.cells[1], size) &&
          typeof mark.value === 'number' && Number.isInteger(mark.value) && (ratio ? mark.value >= 2 && mark.value <= size : mark.value >= 1 && mark.value < size))
    }
    const cells: unknown = rule.cells
    if (!Array.isArray(cells) || cells.length > size ** 2 ||
      !cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < size ** 2)) return false
    if (rule.type === 'arrow') {
      return Object.keys(rule).length === 3 && cells.length >= 1 && cells.length <= size &&
        Number.isInteger(rule.circle) && rule.circle >= 0 && rule.circle < size ** 2 &&
        !cells.includes(rule.circle) && new Set(cells).size === cells.length
    }
    if (rule.type === 'modular') return size === 6 && Object.keys(rule).length === 2 && cells.length >= 3 && cells.length <= size ** 2
    if (rule.type === 'linked-double-arrow') {
      const ends: unknown = rule.ends
      return Object.keys(rule).length === 3 && cells.length >= 1 && new Set(cells).size === cells.length &&
        Array.isArray(ends) && ends.length === 2 && ends.every(end => isSizedSumEnd(end, size)) &&
        ends.some(end => typeof end !== 'number') && sizedSumEndKey(ends[0]) !== sizedSumEndKey(ends[1]) &&
        ends.every(end => typeof end !== 'number' || !cells.includes(end))
    }
    if (rule.type === 'double-arrow') {
      return Object.keys(rule).length === 3 && cells.length >= 1 && cells.length <= 2 * size &&
        Array.isArray(rule.ends) && rule.ends.length === 2 &&
        rule.ends.every((end: unknown) => typeof end === 'number' && Number.isInteger(end) && end >= 0 && end < size ** 2) &&
        new Set([...rule.ends, ...cells]).size === cells.length + 2
    }
    if (rule.type === 'difference') {
      return Object.keys(rule).length === 3 && cells.length === 2 && gridCellsShareEdge(cells[0], cells[1], size) &&
        Number.isInteger(rule.difference) && rule.difference >= 1 && rule.difference < size
    }
    if (rule.type === 'between') return Object.keys(rule).length === 2 && cells.length >= 3 &&
      cells.length <= size ** 2 && new Set(cells).size === cells.length
    if (rule.type === 'extra-house') return Object.keys(rule).length === 2 && cells.length === size && new Set(cells).size === size
    if (rule.type === 'parity') {
      return Object.keys(rule).length === 3 && cells.length > 0 && (rule.parity === 'even' || rule.parity === 'odd')
    }
    if (!cells.length || new Set(cells).size !== cells.length || (rule.type !== 'region-sum' && cells.length > size)) return false
    if (rule.type === 'thermometer' || rule.type === 'slow-thermometer') return Object.keys(rule).length === 2 && cells.length >= 2
    if (rule.type === 'region-sum') {
      if (Object.keys(rule).some(key => !['type', 'cells', 'segments', 'groupByRegion'].includes(key)) ||
        (rule.groupByRegion !== undefined && typeof rule.groupByRegion !== 'boolean') ||
        'noRegions' in grid || sizedRegionSumParts(rule, grid).length < 2) return false
    } else if (rule.type !== 'renban' || Object.keys(rule).some(key => !['type', 'cells', 'segments'].includes(key))) return false
    if (rule.segments === undefined) return true
    const segments: unknown = rule.segments
    if (!Array.isArray(segments) || segments.length === 0 || segments.length > 128 ||
      segments.some(part => !Array.isArray(part) || part.length === 0 || part.length > 128 ||
        part.some(cell => !cells.includes(cell)))) return false
    return new Set(segments.flat()).size === cells.length
  })
}

export function sizedRulePosition(grid: SizedGrid, { rules }: Pick<SizedRuleGame, 'rules'>, values: string): SizedConstraintPosition {
  return { ...sizedClassicPosition(grid, values), grid, rules }
}

export async function verifySizedRulePuzzle({ grid, givens, rules, author, authoredSolution, authoredSolutionOnly }: SizedRuleDefinition, run: EngineRunner = runEngine): Promise<SizedRuleGame> {
  if (!isSizedRuleList(rules, grid)) throw new Error('This grid has invalid or unsupported rules.')
  if (authoredSolutionOnly && authoredSolution !== undefined) {
    if (!isGridText(authoredSolution, grid) || authoredSolution.includes('0') ||
      Array.from(givens).some((digit, cell) => digit !== '0' && digit !== authoredSolution[cell])) {
      throw new Error('The authored solution conflicts with the puzzle’s rules.')
    }
    const completion = await run({ type: 'sized-variant', operation: 'analyze', position:
      sizedRulePosition(grid, { rules }, authoredSolution) })
    if (completion !== 'unique') throw new Error('The authored solution conflicts with the puzzle’s rules.')
    return { rules, solution: authoredSolution, ...(isSizedRuleAuthor(author) && { author }) }
  }
  const position = sizedRulePosition(grid, { rules }, givens)
  const result = await run({ type: 'sized-variant', operation: 'solve-unique', position })
  if (result.status === 'conflict') throw new Error('This puzzle has conflicting givens or rules.')
  if (result.status !== 'unique') throw new Error(validation[result.status].text)
  const solution = result.solution.digits.join('')
  if (authoredSolution !== undefined && solution !== authoredSolution) {
    throw new Error('The authored solution conflicts with the puzzle’s rules.')
  }
  return { rules, solution, ...(isSizedRuleAuthor(author) && { author }) }
}

export function restoreSizedRuleGame({ rules, solution, author }: SizedRuleGame, grid: SizedGrid, givens: string): SizedRuleGame | undefined {
  if (!isSizedRuleList(rules, grid) || (grid.size === 4 && !('regions' in grid) && !rules.length) || !isGridText(solution, grid) || solution.includes('0') ||
    Array.from(givens).some((digit, cell) => digit !== '0' && digit !== solution[cell]) ||
    conflictsOf(solution, undefined, grid).size) return
  for (const rule of rules) {
    if (rule.type === 'corner-kropki') {
      for (const kind of cornerKropkiKinds) for (const corner of rule[kind] ?? []) {
        if (cornerPairs(corner, grid.size).some(([a, b]) =>
          !cornerKropkiAllows(Number(solution[a]), Number(solution[b]), kind))) return
      }
    } else if (rule.type === 'diagonal') {
      if (new Set(gridDiagonalCells(grid.size, rule.diagonal).map(cell => solution[cell])).size !== grid.size) return
    } else if (rule.type === 'extra-house') {
      if (new Set(rule.cells.map(cell => solution[cell])).size !== grid.size) return
    } else if (rule.type === 'parity') {
      if (rule.cells.some(cell => Number(solution[cell]) % 2 !== (rule.parity === 'odd' ? 1 : 0))) return
    } else if (rule.type === 'renban') {
      const digits = rule.cells.map(cell => Number(solution[cell]))
      if (new Set(digits).size !== digits.length || Math.max(...digits) - Math.min(...digits) !== digits.length - 1) return
    } else if (rule.type === 'region-sum') {
      const totals = sizedRegionSumParts(rule, grid).map(part => part.reduce((total, cell) => total + Number(solution[cell]), 0))
      if (new Set(totals).size !== 1) return
    } else if (rule.type === 'linked-double-arrow') {
      if (linkedDoubleArrowConflicts(rule, solution, grid.size)) return
    } else if (rule.type === 'arrow' || rule.type === 'double-arrow') {
      const ends = rule.type === 'arrow' ? [rule.circle] : rule.ends
      const total = (cells: readonly number[]) => cells.reduce((sum, cell) => sum + Number(solution[cell]), 0)
      if (total(rule.cells) !== total(ends)) return
    } else if (rule.type === 'anti-sum') {
      const { size } = grid
      for (let cell = 0; cell < size ** 2; cell++) {
        const digit = Number(solution[cell])
        if (cell % size < size - 1 && digit + Number(solution[cell + 1]) === rule.sum ||
          cell < size * (size - 1) && digit + Number(solution[cell + size]) === rule.sum) return
      }
    } else if (rule.type === 'row-column-sum') {
      const { size } = grid
      const matches = (pair: readonly [number, number]) => Number(solution[pair[0]]) + Number(solution[pair[1]]) === rowColumnSumTotal(pair, size)
      if (!rule.pairs.every(matches)) return
      if (rule.requireUnmarked) {
        const marked = new Set(rules.flatMap(layer => layer.type === 'row-column-sum'
          ? layer.pairs.map(([a, b]) => Math.min(a, b) * size ** 2 + Math.max(a, b)) : []))
        const qualifies = (a: number, b: number) => !marked.has(a * size ** 2 + b) && matches([a, b])
        if (![...solution].some((_, cell) => (cell % size < size - 1 && qualifies(cell, cell + 1)) ||
          (cell < size * (size - 1) && qualifies(cell, cell + size)))) return
      }
    } else if (rule.type === 'difference') {
      const [a, b] = rule.cells
      if (Math.abs(Number(solution[a]) - Number(solution[b])) !== rule.difference) return
    } else if (rule.type === 'thermometer' && rule.cells.some((cell, index) => index > 0 && solution[cell] <= solution[rule.cells[index - 1]])) return
    else if (rule.type === 'slow-thermometer' && rule.cells.some((cell, index) => index > 0 && solution[cell] < solution[rule.cells[index - 1]])) return
    else if (rule.type === 'between' && rule.cells.slice(1, -1).some(cell => {
      const digit = Number(solution[cell])
      const first = Number(solution[rule.cells[0]]), last = Number(solution[rule.cells.at(-1)!])
      return digit <= Math.min(first, last) || digit >= Math.max(first, last)
    })) return
    else if (rule.type === 'whispers' && rule.cells.some((cell, index) => index > 0 &&
      Math.abs(Number(solution[cell]) - Number(solution[rule.cells[index - 1]])) < rule.minDifference)) return
    else if (rule.type === 'xv' || rule.type === 'sandwich') {
      if (rule.type === 'xv') {
        const invalid = (pairs: MarkedPairs | undefined, total: number) => pairs?.pairs?.some(([a, b]) => Number(solution[a]) + Number(solution[b]) !== total)
        if (invalid(rule.five, 5) || invalid(rule.ten, 10)) return
        if (rule.five?.negative || rule.ten?.negative) {
          const markedFive = new Set(rule.five?.pairs?.map(([a, b]) => Math.min(a, b) * grid.size ** 2 + Math.max(a, b)) ?? [])
          const markedTen = new Set(rule.ten?.pairs?.map(([a, b]) => Math.min(a, b) * grid.size ** 2 + Math.max(a, b)) ?? [])
          for (let cell = 0; cell < grid.size ** 2; cell++) {
            const neighbors = [cell % grid.size < grid.size - 1 ? cell + 1 : -1, cell + grid.size < grid.size ** 2 ? cell + grid.size : -1]
            for (const other of neighbors.filter(value => value >= 0)) {
              const key = cell * grid.size ** 2 + other
              const sum = Number(solution[cell]) + Number(solution[other])
              if (rule.five?.negative && !markedFive.has(key) && sum === 5 || rule.ten?.negative && !markedTen.has(key) && sum === 10) return
            }
          }
        }
      } else {
        const one = rule.cells.findIndex(cell => solution[cell] === '1')
        const high = rule.cells.findIndex(cell => Number(solution[cell]) === grid.size)
        if (one < 0 || high < 0 || rule.cells.slice(Math.min(one, high) + 1, Math.max(one, high))
          .reduce((sum, cell) => sum + Number(solution[cell]), 0) !== rule.sum) return
      }
    }
  }
  if (nonogramState(rules, solution, grid.size)?.conflicts.size) return
  if (skyscrapersState(rules, solution, grid.size)?.conflicts.size) return
  if (sizedKillerState(rules, solution, grid.size)?.conflicts.size || sizedQuadrupleState(rules, solution, grid.size)?.conflicts.size) return
  if (rules.some(rule => rule.type === 'kropki' || rule.type === 'labeled-dots')) {
    const { size } = grid
    for (let cell = 0; cell < size ** 2; cell++) {
      const digit = Number(solution[cell])
      const neighbors = [cell + 1, cell + size]
      if (neighbors.some(other => other < size ** 2 &&
        kropkiDigitExclusions(rules, cell, other, digit, size) & 1 << (Number(solution[other]) - 1))) return
    }
  }
  return { rules, solution, ...(isSizedRuleAuthor(author) && { author }) }
}

export function sizedRuleDescriptions(grid: SizedGrid, rules: SizedRuleGame['rules']) {
  const group = 'regions' in grid ? 'region' : 'box'
  const clues = new Set<string>()
  for (const rule of rules) {
    if (rule.type === 'diagonal') clues.add(`Place each digit from 1 to ${grid.size} once on the ${rule.diagonal === 'main' ? 'top-left to bottom-right' : 'top-right to bottom-left'} diagonal.`)
    else if (rule.type === 'extra-house') clues.add(`Place each digit from 1 to ${grid.size} once in each marked extra region.`)
    else if (rule.type === 'killer-cages') clues.add('Digits in a cage add to its printed total and cannot repeat.')
    else if (rule.type === 'quadruple') clues.add(PUZZLE_VARIANTS.quadruple.rule)
    else if (rule.type === 'parity') clues.add(rule.parity === 'odd' ? 'A circle marks an odd digit.' : 'A square marks an even digit.')
    else if (rule.type === 'renban') clues.add('The cells on each Renban line contain different consecutive digits in any order.')
    else if (rule.type === 'region-sum') clues.add(rule.groupByRegion
      ? `The digits on a Region Sum line have the same total in each ${group}. All cells in the same ${group} count together.`
      : `${group === 'region' ? 'Region' : 'Box'} borders split a Region Sum line into segments with the same total. If the line returns to a ${group}, that visit is a separate segment.`)
    else if (rule.type === 'linked-double-arrow') {
      clues.add('The digits on each Double Arrow line add up to the two end-circle values.')
      clues.add('An outside end circle is an X-Sum. The first digit tells how many cells to add from that end, including the first cell.')
    }
    else if (rule.type === 'double-arrow') clues.add('The digits along each Double Arrow add up to the sum of the digits in its two end circles.')
    else if (rule.type === 'arrow') clues.add('The digits along each arrow add up to the digit in its bulb. The same digit can appear more than once along an arrow if the other rules allow it.')
    else if (rule.type === 'row-column-sum') {
      clues.add('Across a horizontal diamond, the digits add to their row number. Across a vertical diamond, they add to their column number.')
      if (rule.requireUnmarked) clues.add('At least one edge without a diamond must also have digits that add to its row or column number.')
    }
    else if (rule.type === 'anti-sum') clues.add(`Digits in cells that share an edge cannot add to ${rule.sum}.`)
    else if (rule.type === 'crust') clues.add('Each row and column forms part of one inferred region. Outside totals add digits up to the first region boundary; an edge count gives how many region boundaries the line crosses before its total ends.')
    else if (rule.type === 'difference') clues.add('The number on each Difference marker gives the exact difference between its two digits.')
    else if (rule.type === 'labeled-dots') {
      if (rule.marks.length) clues.add(rule.relation === 'ratio'
        ? 'The number on a black dot gives the ratio between its two digits.'
        : 'The number on a white dot gives the exact difference between its two digits.')
      if (rule.negative) clues.add(rule.relation === 'ratio'
        ? 'An edge without a labeled black dot cannot have one digit double the other.'
        : 'An edge without a labeled white dot cannot separate consecutive digits.')
    }
    else if (rule.type === 'thermometer') clues.add('Digits strictly increase from the bulb to the tip of each thermometer.')
    else if (rule.type === 'slow-thermometer') clues.add('Digits increase or stay the same from the bulb to the tip of each slow thermometer.')
    else if (rule.type === 'whispers') clues.add(`Neighboring digits on each Whispers line differ by at least ${rule.minDifference}.`)
    else if (rule.type === 'sandwich') clues.add(`The digits between 1 and ${grid.size} in the marked ${rule.direction === 'north' || rule.direction === 'south' ? 'column' : 'row'} add to the outside clue.`)
    else if (rule.type === 'nonogram') {
      const otherDigits = Array.from({ length: grid.size }, (_, index) => index + 1).filter(digit => !rule.digits.includes(digit))
      clues.add(`The outside clue lists the lengths of consecutive runs of selected digits (${rule.digits.join(', ')}) in its row or column. Separate two runs with at least one digit outside that set (${otherDigits.join(', ')}).`)
    }
    else if (rule.type === 'row-equation') clues.add('Each marked row equation must be true. Multiplication and division come before addition and subtraction; evaluate operations of equal precedence from left to right. Adjacent digits joined without an operator form one multi-digit number.')
    else if (rule.type === 'fractional-regions') clues.add(FRACTIONAL_REGIONS_DESCRIPTION)
    else if (rule.type === 'skyscrapers') clues.add('Each outside clue shows how many buildings are visible from that side of its row or column. A digit is visible when it is taller than every digit between it and that side.')
    else if (rule.type === 'xv') clues.add('Digits joined by V add to 5. Digits joined by X add to 10.')
    else if (rule.type === 'between') clues.add('Each interior digit on a Between line lies strictly between the digits at its two endpoints.')
    else if (rule.type === 'kropki') {
      if (rule.consecutive?.pairs?.length) clues.add('Digits separated by a white dot are consecutive.')
      if (rule.ratioTwo?.pairs?.length) clues.add('Across a black dot, one digit is double the other.')
      if (rule.consecutive?.negative) clues.add('An unmarked edge cannot separate consecutive digits.')
      if (rule.ratioTwo?.negative) clues.add('An unmarked edge cannot have one digit double the other.')
    }
  }
  const houses = 'noRegions' in grid ? 'row and column'
    : `row, column, and ${'regions' in grid ? 'region' : `${grid.boxRows} × ${grid.boxColumns} box`}`
  return [`Place each digit from 1 to ${grid.size} once in every ${houses}.`, ...clues]
}
