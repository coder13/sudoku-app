import lzString from 'lz-string'
import type { SizedConstraintRule, VariantRule } from '../engine.ts'
import { gridRegionIndex, isJigsawGrid, isJigsawSize, MINI_GRID, rectangularGridFromRegions, regionsFromMembership } from '../grid.ts'
import { isSizedRuleList } from '../sized-rule-game.ts'
import { hasData, hasMiniBoxes, jigsawLayoutError, makeImportedPuzzle, parseJSON, readRegions, record, standardRegion } from './shared.ts'
import { cloneCellColor, coloredCloneShapes, hasColoredCloneRuleset } from './f-puzzles-clone.ts'
import type { ImportResult, PuzzleImporter } from './types.ts'

export const FP_CODE = /^fpuz(?:zles)?/i
const FPUZZLES_BASE_FIELDS = ['size', 'grid', 'title', 'author', 'ruleset', 'solution', 'successMessage']
const FPUZZLES_FIELDS = new Set([...FPUZZLES_BASE_FIELDS, 'killercage', 'clone', 'diagonal+', 'diagonal-'])
const FPUZZLES_SIX_FIELDS = new Set([...FPUZZLES_FIELDS, 'antiknight', 'arrow'])
const FPUZZLES_EIGHT_FIELDS = new Set([...FPUZZLES_BASE_FIELDS, 'killercage', 'clone', 'diagonal+', 'diagonal-'])
const FPUZZLES_JIGSAW_FIELDS = new Set([...FPUZZLES_BASE_FIELDS, 'clone', 'thermometer', 'difference', 'ratio', 'negative', 'xv', 'cage', 'highlightConflicts', 'rectangle'])
const PLAIN_RULES = /^\s*(?:(?:normal|standard) (?:classic )?sudoku rules apply[.!]?)?\s*$/i
const FP_JIGSAW_BASE = /^(?:normal|standard) irregular(?: ([34567])\s*[×x]\s*\1)? sudoku rules apply(?:[.:]\s*fill each row, column and region with the digits 1[-–]([34567])\.|[.!])$/i
const FP_FORTRESS_DESCRIPTION = /^Fortress rules apply: Digits in gr[ae]y cells have to be larger than digits in neighboring white cells\.$/i
const FP_JIGSAW_THERMOMETER = /^(?:Digits along a thermometer must strictly increase from the bulb to the end|Thermometers: Digits along a thermometer must increase starting at the bulb)\.$/i
const FP_ANTI_SUM = /^Anti-Sum(?: \((\d{1,2})\))?: Digits in orthogonally (?:adjacent|connected) cells may not sum to (\d{1,2})\.$/i
const FP_JIGSAW_DOTS = /^A white dot with a number in it implies the difference between two cells\. A black dot with a number in it implies the ratio relationship between two cells\.$/i
const FP_ROW_COLUMN_SUM = /^Diamond-Sum: Digits in cells horizontally connected by a diamond sum to their row index\. Digits in cells vertically connected by a diamond sum to their column index\.(?: (Not all diamonds are given\.))?$/i
const PLAIN_EIGHT_RULES = /^\s*(?:normal|standard) 8\s*[×x]\s*8 sudoku rules apply[.!]?\s*$/i
const PLAIN_MINI_RULES = /^\s*(?:normal|standard) 4\s*[×x]\s*4 sudoku rules apply[.!]?\s*$/i

function fpCellIndex(value: unknown, size = 9) {
  const match = typeof value === 'string' ? /^R([1-9])C([1-9])$/i.exec(value) : null
  if (!match || Number(match[1]) > size || Number(match[2]) > size) {
    throw new Error('This f-puzzles export contains an invalid cell reference.')
  }
  return (Number(match[1]) - 1) * size + Number(match[2]) - 1
}

function fpCloneRules(data: Record<string, unknown>, size: number): Extract<VariantRule, { type: 'clone' }>[] {
  if (data.clone === undefined) return []
  if (!Array.isArray(data.clone)) throw new Error('This f-puzzles export has invalid Clone clues.')
  return data.clone.map(clue => {
    if (!record(clue) || Object.keys(clue).some(key => key !== 'cells' && key !== 'cloneCells') ||
      !Array.isArray(clue.cells) || !clue.cells.length || !Array.isArray(clue.cloneCells) || clue.cells.length !== clue.cloneCells.length) {
      throw new Error('This f-puzzles export has invalid Clone clues.')
    }
    const copies = clue.cloneCells.map(cell => fpCellIndex(cell, size))
    const original = clue.cells.map(cell => fpCellIndex(cell, size))
    if (new Set(original).size !== original.length || new Set(copies).size !== copies.length ||
      original.some((cell, index) => cell === copies[index])) throw new Error('This f-puzzles export has invalid Clone clues.')
    return { type: 'clone', groups: original.map((cell, index) => [cell, copies[index]]) }
  })
}

function antiSumFromClause(clause: string, size: number) {
  const match = FP_ANTI_SUM.exec(clause.trim())
  if (!match) return
  const sum = Number(match[2])
  if (sum >= 2 && sum <= 2 * size && (match[1] === undefined || Number(match[1]) === sum)) return sum
}

function fpFortressCells(data: Record<string, unknown>, size: number): number[] | undefined {
  const fortress = jigsawRuleClauses(data.ruleset).slice(1).filter(clause => FP_FORTRESS_DESCRIPTION.test(clause))
  if (!fortress.length) return
  if (fortress.length !== 1 || !Array.isArray(data.maximum) || !data.maximum.length) {
    throw new Error('This Fortress puzzle needs Maximum cells.')
  }
  const cells = new Set<number>()
  for (const clue of data.maximum) {
    if (!record(clue) || Object.keys(clue).length !== 1 || !Object.hasOwn(clue, 'cell')) {
      throw new Error('This Fortress puzzle has an invalid Maximum clue.')
    }
    const cell = fpCellIndex(clue.cell, size)
    if (cells.has(cell)) throw new Error('This Fortress puzzle repeats a Maximum clue.')
    cells.add(cell)
  }
  return [...cells]
}

function fpJigsawMetadata(data: Record<string, unknown>, hasAntiSum: boolean) {
  if (data.highlightConflicts !== undefined && typeof data.highlightConflicts !== 'boolean') return false
  if (hasData(data.xv)) return false
  if (hasData(data.negative)) {
    const flags = data.negative
    if (!(hasAntiSum && Array.isArray(data.xv) && Array.isArray(flags) && flags.length === 1 && flags[0] === 'xv')) return false
  }
  if (!hasData(data.cage)) return true
  return typeof data.successMessage === 'string' && Array.isArray(data.cage) && data.cage.every(cage =>
    record(cage) && Object.keys(cage).length === 4 && cage.value === `msgcorrect: ${data.successMessage}` &&
    cage.outlineC === '#ffffff00' && cage.fontC === '#ffffff00' &&
    Array.isArray(cage.cells) && cage.cells.length === 1 && cage.cells[0] === 'R1C1')
}

function fpRowColumnSum(data: Record<string, unknown>, clauses: readonly string[], size: number): SizedConstraintRule | undefined {
  const statements = clauses.map(clause => FP_ROW_COLUMN_SUM.exec(clause)).filter(match => match !== null)
  if (statements.length === 0 && !hasData(data.rectangle)) return
  if (statements.length !== 1 || data.rectangle !== undefined && !Array.isArray(data.rectangle)) {
    throw new Error('This f-puzzles export has unsupported rectangles or diamond rules.')
  }
  const rectangles = Array.isArray(data.rectangle) ? data.rectangle : []
  const pairs = rectangles.map(mark => {
    if (!record(mark) || Object.keys(mark).length !== 7 || !Array.isArray(mark.cells) || mark.cells.length !== 2 ||
      mark.width !== 0.25 || mark.height !== 0.25 || mark.angle !== 45 ||
      mark.baseC !== '#000000' || mark.outlineC !== '#000000' || mark.fontC !== '#000000') {
      throw new Error('This f-puzzles export has a rectangle that the app cannot read as a diamond.')
    }
    return [fpCellIndex(mark.cells[0], size), fpCellIndex(mark.cells[1], size)] as const
  })
  return { type: 'row-column-sum', pairs, ...(statements[0][1] && { requireUnmarked: true }) }
}

function fromFPuzzlesSixBySix(data: Record<string, unknown>, givens: string): ImportResult | undefined {
  const ruleset = typeof data.ruleset === 'string' ? /^Normal 6x6(?: (.*?))? Sudoku rules apply\.$/i.exec(data.ruleset.trim()) : null
  if (!ruleset || !Array.isArray(data.grid) || data.grid.flat().some(cell => record(cell) && cell.region !== undefined)) return

  const declarations = (ruleset[1] ?? '')
    .replace(/Grey regions are clones, and must contain the same digits in the same relative positions\.?/ig, 'clone')
    .toLowerCase().split(/ and /).filter(Boolean)
  if (declarations.some((rule, index) => !['arrows', 'anti-knight', 'clone'].includes(rule) || declarations.indexOf(rule) !== index)) {
    throw new Error('This f-puzzles export contains custom rules text. Import requires rules the app can read from the board.')
  }
  if (data.antiknight !== undefined && typeof data.antiknight !== 'boolean') throw new Error('This f-puzzles export has an invalid Anti-Knight flag.')
  const hasAntiKnight = data.antiknight === true
  const hasArrows = hasData(data.arrow)
  if (hasAntiKnight !== declarations.includes('anti-knight') || hasArrows !== declarations.includes('arrows') ||
    declarations.includes('clone') && !hasData(data.clone)) {
    throw new Error('This f-puzzles export has rule metadata that does not match its ruleset.')
  }

  const rules: SizedConstraintRule[] = fpCloneRules(data, 6)
  if (hasAntiKnight) rules.push({ type: 'anti-knight' })
  if (hasArrows) {
    if (!Array.isArray(data.arrow) || data.arrow.length > 128) throw new Error('This f-puzzles export has invalid Arrows.')
    for (const arrow of data.arrow) {
      if (!record(arrow) || Object.keys(arrow).some(key => key !== 'lines' && key !== 'cells') ||
        !Array.isArray(arrow.cells) || arrow.cells.length !== 1 || !Array.isArray(arrow.lines) || arrow.lines.length !== 1 ||
        !Array.isArray(arrow.lines[0]) || arrow.lines[0].length < 2 || arrow.lines[0].length > 36) {
        throw new Error('This f-puzzles export has an invalid Arrow.')
      }
      const circle = fpCellIndex(arrow.cells[0], 6)
      const path = arrow.lines[0].map(cell => fpCellIndex(cell, 6))
      const directedPath = path[0] === circle ? path : path[path.length - 1] === circle ? path.slice().reverse() : undefined
      if (!directedPath || directedPath.slice(1).includes(circle) || new Set(directedPath).size !== directedPath.length ||
        directedPath.some((cell, index) => index > 0 &&
          Math.max(Math.abs(Math.floor(cell / 6) - Math.floor(directedPath[index - 1] / 6)), Math.abs(cell % 6 - directedPath[index - 1] % 6)) !== 1)) {
        throw new Error('This f-puzzles export has an invalid Arrow path.')
      }
      rules.push({ type: 'arrow', circle, cells: directedPath.slice(1) })
    }
  }

  const grid = { size: 6, boxRows: 2, boxColumns: 3 } as const
  if (!isSizedRuleList(rules, grid)) throw new Error('This f-puzzles export has invalid sized rules.')
  const solution = Array.isArray(data.solution) && data.solution.length === 36 &&
    data.solution.every(digit => /^(?:[1-6])$/.test(String(digit)))
    ? data.solution.map(String).join('') : undefined
  return { givens, grid, sizedRules: rules,
    ...(typeof data.title === 'string' && data.title.trim() && { title: data.title.trim().slice(0, 72) }),
    ...(typeof data.author === 'string' && data.author.trim() && { sizedAuthor: data.author.trim().slice(0, 72) }),
    ...(solution && { authoredSolution: solution }) }
}

function fromFPuzzlesJigsaw(data: Record<string, unknown>, size: 3 | 4 | 5 | 6 | 7, labels: readonly unknown[], givens: string): ImportResult {
  const regions: number[][] = Array.from({ length: size }, () => [])
  for (const [cell, label] of labels.entries()) {
    if (typeof label !== 'number' || !Number.isInteger(label) || label < 0 || label >= size) {
      throw new Error('This f-puzzles export has invalid region labels.')
    }
    regions[label].push(cell)
  }
  const grid = { size, regions }
  if (!isJigsawGrid(grid)) throw new Error(jigsawLayoutError(size))
  const rules: SizedConstraintRule[] = []
  const fortressCells = fpFortressCells(data, size)
  if (fortressCells) rules.push({ type: 'maximum', cells: fortressCells, ignoreMarkedNeighbors: true, shaded: true })
  rules.push(...fpCloneRules(data, size))
  if (hasData(data.thermometer)) {
    if (!Array.isArray(data.thermometer)) throw new Error('This f-puzzles export has invalid thermometers.')
    for (const clue of data.thermometer) {
      if (!record(clue) || Object.keys(clue).some(key => key !== 'lines') || !Array.isArray(clue.lines) || !clue.lines.length) {
        throw new Error('This f-puzzles export has invalid thermometers.')
      }
      for (const path of clue.lines) {
        if (!Array.isArray(path)) throw new Error('This f-puzzles export has an invalid thermometer path.')
        rules.push({ type: 'thermometer', cells: path.map(cell => fpCellIndex(cell, size)) })
      }
    }
  }
  for (const relation of ['difference', 'ratio'] as const) {
    const layer = data[relation]
    if (!hasData(layer)) continue
    if (!Array.isArray(layer)) throw new Error('This f-puzzles export has invalid labeled dots.')
    const marks = layer.map(clue => {
      if (!record(clue) || Object.keys(clue).length !== 2 ||
        !Array.isArray(clue.cells) || clue.cells.length !== 2 || !/^[1-9]$/.test(String(clue.value))) {
        throw new Error('This f-puzzles export has an invalid labeled dot.')
      }
      const cells = [fpCellIndex(clue.cells[0], size), fpCellIndex(clue.cells[1], size)] as const
      return { cells, value: Number(clue.value) }
    })
    rules.push({ type: 'labeled-dots', relation, marks })
  }
  const [, ...clauses] = jigsawRuleClauses(data.ruleset)
  const antiSums = clauses.map(clause => antiSumFromClause(clause, size)).filter(sum => sum !== undefined)
  if (!fpJigsawMetadata(data, antiSums.length > 0)) throw new Error('This f-puzzles export includes unsupported XV rules or cages.')
  const diamonds = fpRowColumnSum(data, clauses, size)
  if (diamonds) rules.push(diamonds)
  for (const sum of new Set(antiSums)) rules.push({ type: 'anti-sum', sum })
  if (clauses.some(clause => FP_JIGSAW_THERMOMETER.test(clause)) && !rules.some(rule => rule.type === 'thermometer') ||
    clauses.some(clause => FP_JIGSAW_DOTS.test(clause)) && !rules.some(rule => rule.type === 'labeled-dots') ||
    !isSizedRuleList(rules, grid)) {
    throw new Error('This f-puzzles export has missing or invalid clues.')
  }
  const title = typeof data.title === 'string' ? data.title.trim().slice(0, 72) : ''
  const author = typeof data.author === 'string' ? data.author.trim().slice(0, 72) : ''
  const authoredSolution = Array.isArray(data.solution) && data.solution.every(digit => Number.isInteger(digit) && digit >= 1 && digit <= size)
    ? data.solution.join('') : undefined
  return { givens, grid, sizedRules: rules, ...(title && { title }), ...(author && { sizedAuthor: author }),
    ...(authoredSolution?.length === size ** 2 && { authoredSolution }) }
}

function jigsawRuleClauses(text: unknown) {
  return typeof text === 'string' ? text.trim().split(/\n\s*\n|\n(?=\s*-\s)/)
    .map(line => line.trim().replace(/^-\s+/, '').replace(/\s+/g, ' ')) : []
}

function knownJigsawRuleset(text: string, size: number) {
  const [base, ...clauses] = jigsawRuleClauses(text)
  const match = FP_JIGSAW_BASE.exec(base)
  const sizes = match?.slice(1).filter(value => value !== undefined)
  return !!sizes?.length && sizes.every(value => Number(value) === size) && clauses.every(clause =>
    FP_JIGSAW_THERMOMETER.test(clause) || FP_JIGSAW_DOTS.test(clause) || FP_ROW_COLUMN_SUM.test(clause) ||
    FP_FORTRESS_DESCRIPTION.test(clause) || antiSumFromClause(clause, size) !== undefined)
}

export function decodeFPuzzlesPayload(input: string, format: 'f-puzzles' | 'SudokuPad' = 'f-puzzles'): unknown {
  if (input.startsWith('{')) return parseJSON(input, format)
  let code = ''
  try { code = decodeURIComponent(input).replaceAll(' ', '+') } catch { /* The code was not valid URI text. */ }
  // f-puzzles uses LZ-String Base64. Limit compressed input before decoding it.
  const decoded = /^[A-Za-z0-9+/=]{1,10000}$/.test(code) ? lzString.decompressFromBase64(code) : ''
  return parseJSON(decoded, format)
}

export function fromFPuzzles(input: string, format: 'f-puzzles' | 'SudokuPad'): ImportResult {
  return fromFPuzzlesData(decodeFPuzzlesPayload(input, format))
}

function fromFPuzzlesData(data: unknown): ImportResult {
  if (!record(data) || !isJigsawSize(data.size) && data.size !== 8 && data.size !== 9 || !Array.isArray(data.grid) || data.grid.length !== data.size) {
    throw new Error('Import supports 3 × 3 through 7 × 7 Jigsaw, plus 8 × 8 and 9 × 9 f-puzzles grids.')
  }
  const size = data.size
  const mini = size === MINI_GRID.size
  const miniLabels = mini ? data.grid.flatMap((row, rowIndex) => Array.isArray(row) ? row.map((cell, columnIndex) =>
    record(cell) && cell.region !== undefined ? cell.region : Math.floor(rowIndex / 2) * 2 + Math.floor(columnIndex / 2)) : []) : []
  const regularSix = size === 6 && typeof data.ruleset === 'string' &&
    /^Normal 6x6(?: [\s\S]+)? Sudoku rules apply\.$/i.test(data.ruleset.trim()) &&
    !data.grid.flat().some(cell => record(cell) && cell.region !== undefined)
  const fortressCells = isJigsawSize(size) ? fpFortressCells(data, size) : undefined
  const defaultRowRegions = size === 3 || size === 5 || size === 7
  const jigsaw = defaultRowRegions || Boolean(fortressCells) || isJigsawSize(size) && (size !== 4 || !hasMiniBoxes(miniLabels)) && !regularSix
  const eight = size === 8
  const fields = fortressCells
    ? new Set([...FPUZZLES_JIGSAW_FIELDS, 'maximum', 'disabledlogic'])
    : regularSix ? FPUZZLES_SIX_FIELDS : jigsaw ? FPUZZLES_JIGSAW_FIELDS : eight ? FPUZZLES_EIGHT_FIELDS : FPUZZLES_FIELDS
  for (const [key, value] of Object.entries(data)) {
    if (fortressCells && key === 'disabledlogic' && Array.isArray(value) && value.every(option => option === 'contradictions')) continue
    if (!fields.has(key) && hasData(value)) throw new Error(`This f-puzzles rule is not supported yet (${key}).`)
  }
  const coloredClone = size === 9 && hasColoredCloneRuleset(data.ruleset)
  if (!coloredClone && hasData(data.ruleset) && (typeof data.ruleset !== 'string' ||
    !PLAIN_RULES.test(data.ruleset) && !regularSix && !(mini && PLAIN_MINI_RULES.test(data.ruleset)) &&
    !(eight && PLAIN_EIGHT_RULES.test(data.ruleset)) && !(jigsaw && knownJigsawRuleset(data.ruleset, size)))) {
    throw new Error('This f-puzzles export contains custom rules text. Import requires rules the app can read from the board.')
  }
  const labels: unknown[] = []
  const digits: string[] = []
  const coloredCells = coloredClone ? new Map<number, string>() : undefined
  const fortressShaded = new Set<number>()
  for (const row of data.grid) {
    if (!Array.isArray(row) || row.length !== size) throw new Error('This f-puzzles export has an invalid grid.')
    for (const cell of row) {
      if (!record(cell) || cell.given && (!/^[1-9]$/.test(String(cell.value)) || Number(cell.value) > size)) {
        throw new Error('This f-puzzles export has invalid givens.')
      }
      const index = digits.length
      if (coloredCells) {
        const shade = cloneCellColor(cell)
        if (shade) coloredCells.set(index, shade)
      }
      for (const [key, value] of Object.entries(cell)) {
        if (coloredClone && (key === 'c' || key === 'cArray')) continue
        if (key === 'c' && fortressCells && typeof value === 'string') {
          if (/^#a8a8a8$/i.test(value)) fortressShaded.add(index)
          else if (!/^#ffffff$/i.test(value)) throw new Error('This Fortress puzzle has an unsupported cell color.')
          continue
        }
        if (!['value', 'given', 'region', 'centerPencilMarks', 'cornerPencilMarks'].includes(key) && hasData(value)) {
          throw new Error(`This f-puzzles cell clue is not supported yet (${key}).`)
        }
      }
      // On these Jigsaw grids, f-puzzles omits labels for the default row regions.
      const region = defaultRowRegions ? Math.floor(index / size)
        : mini ? Math.floor(index / 8) * 2 + Math.floor(index % 4 / 2)
          : size === 6 ? gridRegionIndex({ size, boxRows: 2, boxColumns: 3 }, index)
            : jigsaw ? Math.floor(index / size) : eight ? undefined : standardRegion(index)
      labels.push(cell.region === undefined ? region : cell.region)
      digits.push(cell.given ? String(cell.value) : '0')
    }
  }
  if (fortressCells && (fortressShaded.size !== fortressCells.length || fortressCells.some(cell => !fortressShaded.has(cell)))) {
    throw new Error('This Fortress puzzle has gray cells that do not match its Maximum clues.')
  }
  if (size === 6) {
    const regular = fromFPuzzlesSixBySix(data, digits.join(''))
    if (regular) return regular
  }
  if (jigsaw && isJigsawSize(size)) return fromFPuzzlesJigsaw(data, size, labels, digits.join(''))
  if (mini) {
    if (!hasMiniBoxes(labels)) throw new Error('Mini Sudoku import requires four 2 × 2 boxes.')
    if (['killercage', 'diagonal+', 'diagonal-'].some(key => hasData(data[key]))) {
      throw new Error('This 4 × 4 f-puzzles grid has rules that Mini Sudoku cannot import yet.')
    }
    const clones = fpCloneRules(data, size)
    if (clones.length && !isSizedRuleList(clones, MINI_GRID)) throw new Error('This 4 × 4 f-puzzles grid has invalid Clone clues.')
    if (clones.length) return { givens: digits.join(''), grid: MINI_GRID, sizedRules: clones }
    return { givens: digits.join(''), grid: MINI_GRID }
  }
  const rules: VariantRule[] = []
  rules.push(...fpCloneRules(data, size))
  for (const key of ['diagonal+', 'diagonal-']) {
    if (data[key] !== undefined && typeof data[key] !== 'boolean') throw new Error('This f-puzzles export has an invalid diagonal.')
  }
  if (data['diagonal+'] === true) rules.push({ type: 'diagonal', diagonal: 'anti' })
  if (data['diagonal-'] === true) rules.push({ type: 'diagonal', diagonal: 'main' })
  const authoredClone = coloredCells && coloredCloneShapes(coloredCells)
  if (authoredClone) rules.push(...authoredClone.rules)
  if (hasData(data.killercage)) {
    if (!Array.isArray(data.killercage)) throw new Error('This f-puzzles export has invalid Killer cages.')
    const cages = data.killercage.flatMap((cage: unknown) => {
      if (!record(cage) || !Array.isArray(cage.cells)) throw new Error('This f-puzzles export has an invalid Killer cage.')
      const cells = cage.cells.map(cell => fpCellIndex(cell, size))
      // These publications use unsummed outlines around the colored Clone cells.
      if (authoredClone && Object.keys(cage).length === 1 &&
        authoredClone.outlines.delete([...cells].sort((a, b) => a - b).join(','))) return []
      if (!/^[0-9]{1,2}$/.test(String(cage.value))) {
        throw new Error('This f-puzzles export has a Killer cage without a valid sum.')
      }
      return [{ cells, sum: Number(cage.value) }]
    })
    if (cages.length) rules.push({ type: 'killer-cages', cages })
  }
  if (eight) {
    const grid = labels.every((label): label is number => typeof label === 'number' && Number.isInteger(label) && label >= 0)
      ? rectangularGridFromRegions(8, labels) : undefined
    if (!grid) throw new Error('This 8 × 8 puzzle needs explicit 2 × 4 or 4 × 2 boxes.')
    if (!isSizedRuleList(rules, grid)) throw new Error('This 8 × 8 f-puzzles puzzle contains invalid rules.')
    const title = typeof data.title === 'string' ? data.title.trim().slice(0, 72) : ''
    const author = typeof data.author === 'string' ? data.author.trim().slice(0, 72) : ''
    return { givens: digits.join(''), grid, sizedRules: rules, ...(title && { title }), ...(author && { sizedAuthor: author }) }
  }
  const imported = makeImportedPuzzle(digits.join(''), rules, readRegions(labels))
  if (!authoredClone) return imported
  const title = typeof data.title === 'string' ? data.title.trim().slice(0, 72) : ''
  return { ...imported, givenCellColors: authoredClone.givenCellColors, ...(title && { title }) }
}

export const fPuzzles = {
  format: 'f-puzzles',
  links: {
    domains: ['f-puzzles.com'],
    read: url => fromFPuzzles(url.searchParams.get('load') ?? '', 'f-puzzles'),
  },
  readText(text) {
    if (FP_CODE.test(text)) return fromFPuzzles(text.replace(FP_CODE, ''), 'f-puzzles')
  },
  readUnmarkedText(text) {
    if (/^N4[A-Za-z0-9+/=]+$/.test(text)) return fromFPuzzles(text, 'f-puzzles')
    if (!text.startsWith('{')) return
    let data: unknown
    try { data = JSON.parse(text) } catch { return }
    if (record(data) && 'size' in data && 'grid' in data) return fromFPuzzlesData(data)
  },
} as const satisfies PuzzleImporter
