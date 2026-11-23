import { readReviewedCoachArtwork, reviewedCoachFillTitle } from '../authored-artwork.ts'
import { coachConnectedLines, coachConsecutiveRuns } from '../coach-lines.ts'
import { readCoachColouredLines } from '../coach-coloured-lines.ts'
import { isCoachWhispersGuide } from '../coach-whispers-guide.ts'
import type { SizedDifferenceRule, SizedLabeledDotsRule, VariantPuzzle, VariantRule } from '../engine.ts'
import { isFogDefinition, type FogDefinition } from '../fog.ts'
import { normalizeGivens } from '../formats.ts'
import { EMPTY } from '../game.ts'
import { gridRegionIndex, isGridText, isJigsawGrid, isJigsawSize, isRectangularSize, MINI_GRID, rectangularGridFromRegions, regionsFromMembership, SEVEN_BOXLESS_GRID, type SizedGrid } from '../grid.ts'
import { isHexColor, isImportedColor, validImportedCellColors, type CandidateColors, type ImportedCellColors } from '../imported-colors.ts'
import { readCoachQuickDraw } from '../imported-drawings.ts'
import { insideGridColumns, validInsideGridRows } from '../inside-grid.ts'
import { validLetteredQuadruples } from '../lettered-quadruples.ts'
import { decodeLegacyCoach, type LegacyCoachVersion } from '../legacy-coach.ts'
import type { OutsideSide } from '../outside-clues.ts'
import { closedRegionSumCells, regionIndex } from '../region-sum.ts'
import { isSizedRuleList } from '../sized-rule-game.ts'
import { cellsShareEdge } from '../variants.ts'
import { fetchPublishedExport } from './published-link.ts'
import { MAX_DECODED_LENGTH, MAX_IMPORT_LENGTH, hasData, hasMiniBoxes, jigsawLayoutError, makeImportedPuzzle, parseJSON, readRegions, record } from './shared.ts'
import type { ImportResult, PuzzleImporter } from './types.ts'

const BASE32HEX = '0123456789abcdefghijklmnopqrstuv'
const COACH_BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const COACH_CODE = /^SCv([0-9]+)_([0-9]+)_/i
const LEGACY_COACH_CODE = /^SCv([3-6])_/i
const COACH_COLLECTION_LINK = /^\/(?:[a-z]{2}\/)?collections\/((?:[a-z0-9-]{1,64}\/){0,3}[a-z0-9-]{1,64})\/s\/([A-Za-z0-9]{1,16})\/?$/
const COACH_FIELDS = new Set([
  'gridSize', 'givenDigits', 'regions', 'givenConstraints', 'meta', 'metaSolver', 'colours',
  'constructorPreviewDigits', 'constructorConstructionParameters', 'quickDrawLineSegments', 'quickDrawSymbols', 'cells', 'acid', 'givenColours',
])
const COACH_DRAWINGS = ['quickDrawLineSegments', 'quickDrawSymbols', 'cells']
const COACH_AUTHORED_MARKINGS = [...COACH_DRAWINGS, 'givenColours', 'colours']

const CLUE_STYLING = new Set(['opacity', 'colour', 'shapeSize', 'borderColour', 'borderThickness'])
const LINE_STYLING = new Set(['colour', 'colourSync', 'lineThickness', 'lineEndOffset', 'borderColour', 'borderThickness', 'opacity'])
const BULB_STYLING = new Set(['bulbSize', 'bulbBorderThickness', 'bulbBorderColour', 'bulbFillColour'])
function unsupportedClueStyling(settings: unknown) {
  return hasData(settings) && (!record(settings) || Object.keys(settings).some(key => !CLUE_STYLING.has(key)))
}

function readCoachDigitRestrictions(constraint: Record<string, unknown>): VariantRule[] {
  const invalid = new Error('This Sudoku Coach shape layer has unsupported or invalid digit restrictions.')
  const settings = constraint.settings
  if (Object.keys(constraint).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
    hasData(settings) && !record(settings) ||
    record(settings) && (settings.gridSnapToCorners === true || settings.gridSnapToEdges === true ||
      Object.keys(settings).some(key => !['gridSnapToCentres', 'gridSnapToCorners', 'gridSnapToEdges', 'shapeSize', 'opacity', 'colour', 'borderColour', 'borderThickness'].includes(key))) ||
    !Array.isArray(constraint.segments) || !constraint.segments.length) throw invalid
  const groups = new Map<'circle' | 'cross' | 'square', number[]>([['circle', []], ['cross', []], ['square', []]])
  for (const segment of constraint.segments) {
    if (!record(segment) || Object.keys(segment).some(key => !['cells', 'parameters'].includes(key)) ||
      !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
      !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 || !record(segment.parameters) ||
      Object.keys(segment.parameters).some(key => key !== 'shape') ||
      !['circle', 'cross', 'square'].includes(String(segment.parameters.shape))) throw invalid
    const [column, row] = segment.cells[0]
    if (typeof column !== 'number' || typeof row !== 'number' ||
      ![column, row].every(value => Number.isInteger(value - .5) && value >= .5 && value <= 8.5)) throw invalid
    groups.get(segment.parameters.shape as 'circle' | 'cross' | 'square')!.push((row - .5) * 9 + column - .5)
  }
  const cells = [...groups.values()].flat()
  if (new Set(cells).size !== cells.length || [...groups.values()].some(group => !group.length)) throw invalid
  return [...groups].map(([shape, cells]) => ({ type: 'digit-restriction', shape, cells,
    digits: shape === 'circle' ? [1, 2, 3] : shape === 'cross' ? [4, 5, 6, 7] : [8, 9] }))
}

function decodeBase32Hex(text: string) {
  const bytes = new Uint8Array(Math.floor(text.length * 5 / 8))
  let bits = 0
  let buffer = 0
  let offset = 0
  for (const letter of text.toLowerCase()) {
    const value = BASE32HEX.indexOf(letter)
    if (value < 0) throw new Error('This Sudoku Coach code contains an invalid character.')
    buffer = (buffer << 5) | value
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes[offset++] = (buffer >>> bits) & 255
    }
  }
  if (bits >= 5 || (buffer & ((1 << bits) - 1))) throw new Error('This Sudoku Coach code is incomplete.')
  return bytes
}

async function inflate(bytes: Uint8Array<ArrayBuffer>) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const chunks: string[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_DECODED_LENGTH) throw new Error('This Sudoku Coach puzzle is too large.')
      chunks.push(decoder.decode(value, { stream: true }))
    }
    return chunks.join('') + decoder.decode()
  } finally {
    await reader.cancel().catch(() => {})
  }
}

async function decodeCoach(code: string): Promise<Record<string, unknown>> {
  if (code.length > MAX_IMPORT_LENGTH) throw new Error('Paste one puzzle at a time.')
  const legacy = LEGACY_COACH_CODE.exec(code)
  if (legacy) return decodeLegacyCoach(code.slice(legacy[0].length), legacy[1] as LegacyCoachVersion, MAX_DECODED_LENGTH)
  const prefix = COACH_CODE.exec(code)
  if (!prefix || prefix[1] !== '7' || prefix[2] !== '32') {
    throw new Error('This Sudoku Coach code uses an unsupported format. Copy the puzzle from Sudoku Coach and try again.')
  }
  const bytes = decodeBase32Hex(code.slice(prefix[0].length))
  let text: string
  try {
    text = await inflate(bytes)
  } catch {
    throw new Error('This Sudoku Coach code could not be opened. Copy the full puzzle code and try again.')
  }
  const data = parseJSON(text, 'Sudoku Coach')
  if (!record(data)) throw new Error('This Sudoku Coach puzzle is unreadable.')
  for (const [key, value] of Object.entries(data)) {
    if (!COACH_FIELDS.has(key) && !key.startsWith('user') && hasData(value)) {
      throw new Error(`This Sudoku Coach puzzle uses an unsupported field (${key}).`)
    }
  }
  return data
}

type CoachTypedDeclaration = { globalEntropy: true; adjacentTotals: readonly [7, 13] }
  | { cageTotals: readonly [number, number] }
type CoachPublication = {
  hasAuthorInstructions: boolean
  title?: string
  authoredRule?: 'x-sum' | 'all-black-dots' | 'line-colours' | 'mirrored-renban' | 'quad-arrows' | 'partial-regions' | 'inside-grid' | 'lettered-quadruples'
  declaredRules?: CoachTypedDeclaration
  whispersGuide?: true
}

function isCoachTypedDeclaration(value: unknown): value is CoachTypedDeclaration {
  if (!record(value)) return false
  if (Object.keys(value).length === 1 && Array.isArray(value.cageTotals) && value.cageTotals.length === 2) {
    const [first, second] = value.cageTotals
    return [first, second].every(sum => Number.isInteger(sum) && sum >= 1 && sum <= 45) && first !== second
  }
  return Object.keys(value).length === 2 && value.globalEntropy === true &&
    Array.isArray(value.adjacentTotals) && value.adjacentTotals.length === 2 &&
    value.adjacentTotals[0] === 7 && value.adjacentTotals[1] === 13
}

function readCoachCandidateMasks(value: unknown): number[] {
  if (value === undefined || value === '') return Array(81).fill(0)
  const masks = typeof value === 'string' ? value.split('-') : []
  if (masks.length !== 81 || masks.some(mask => !/^\d{1,4}$/.test(mask) || Number(mask) > 1022 || Number(mask) % 2)) {
    throw new Error('This Sudoku Coach progress has invalid candidate marks.')
  }
  // Coach stores digit d at bit d. Play stores digit d at bit d - 1.
  return masks.map(mask => Number(mask) >>> 1)
}

function readCoachColorNames(cells: readonly string[], palette: readonly unknown[]): ImportedCellColors | undefined {
  const colors: ImportedCellColors = {}
  for (const [cell, shades] of cells.entries()) {
    if (!shades) continue
    const names = [...shades].map(shade => palette[COACH_BASE62.indexOf(shade)])
    if (!names.every(isImportedColor) || new Set(names).size !== names.length) return
    colors[cell] = names.sort()
  }
  return colors
}

function readCoachPlayerColors(data: Record<string, unknown>): ImportedCellColors | undefined {
  const cells = readCoachColourCells(data.colours, data.userColours)
  if (!cells) throw new Error('This Sudoku Coach progress has invalid cell colors.')
  if (!cells.length) return
  const colors = readCoachColorNames(cells, data.colours as unknown[])
  if (!colors) throw new Error('This Sudoku Coach progress has invalid or unsupported cell colors.')
  return colors
}

function readCoachCandidateColors(palette: unknown, encoded: unknown): CandidateColors<string> | undefined {
  if (encoded === undefined || encoded === '') return
  const marks = typeof encoded === 'string' ? encoded.split('-') : []
  const invalid = () => new Error('This Sudoku Coach progress has invalid or unsupported candidate colors.')
  if (!marks.length || marks.length > 81 * 9 || !Array.isArray(palette) || palette.length > COACH_BASE62.length) throw invalid()
  const colors: CandidateColors<string> = {}
  for (const mark of marks) {
    // Coach stores one color for each cell and digit, using a base62 palette index.
    const match = /^([1-7]\d|80|\d)\+([1-9])\+([0-9A-Za-z])$/.exec(mark)
    if (!match) throw invalid()
    const cell = Number(match[1]), digit = Number(match[2]), shade = palette[COACH_BASE62.indexOf(match[3])]
    if (!isImportedColor(shade) || colors[cell]?.[digit] !== undefined) throw invalid()
    const cellColors = colors[cell] ??= {}
    cellColors[digit] = shade
  }
  return colors
}

function readCoachProgress(data: Record<string, unknown>, givens: string): ImportResult['progress'] {
  const importedDrawings = readCoachQuickDraw(data)
  if (!importedDrawings && ![data.userDigits, data.userCellCandidates, data.userBoxCandidates, data.userColours, data.userCellCandidatesColours].some(hasData)) return
  const importedCellColors = readCoachPlayerColors(data)
  const importedCandidateColors = readCoachCandidateColors(data.colours, data.userCellCandidatesColours)
  const digits = data.userDigits === undefined || data.userDigits === '' ? EMPTY : data.userDigits
  if (typeof digits !== 'string' || !/^[0-9]{81}$/.test(digits)) {
    throw new Error('This Sudoku Coach progress has invalid placed digits.')
  }
  if ([...digits].some((digit, cell) => digit !== '0' && givens[cell] !== '0' && digit !== givens[cell])) {
    throw new Error('The Sudoku Coach progress has a placed digit that replaces a given.')
  }
  const entries = [...digits].map((digit, cell) => givens[cell] === '0' ? digit : '0').join('')
  const center = readCoachCandidateMasks(data.userCellCandidates).map((mask, cell) => givens[cell] === '0' ? mask : 0)
  const corner = readCoachCandidateMasks(data.userBoxCandidates).map((mask, cell) => givens[cell] === '0' ? mask : 0)
  if (entries !== EMPTY || center.some(Boolean) || corner.some(Boolean) || importedCellColors || importedCandidateColors || importedDrawings) {
    return { entries, center, corner, ...(importedCellColors && { importedCellColors }),
      ...(importedCandidateColors && { importedCandidateColors }), ...(importedDrawings && { importedDrawings }) }
  }
}

function readCoachColourCells(colours: unknown, value: unknown): string[] | undefined {
  if (value === undefined || value === '') return []
  if (typeof value !== 'string') return
  const cellColours = value.split(',')
  if (cellColours.length !== 81) return
  if (!cellColours.some(Boolean)) return []
  if (!Array.isArray(colours) || !colours.length || colours.length > COACH_BASE62.length ||
    !colours.every(colour => typeof colour === 'string' && colour.length > 0)) return
  const palette = COACH_BASE62.slice(0, colours.length)
  if (cellColours.some(shades =>
    new Set(shades).size !== shades.length || [...shades].some(shade => !palette.includes(shade)))) return
  return cellColours
}

function coachColoursWithoutExtraHouses(cellColours: string[], rules: readonly VariantRule[]): string[] {
  if (!cellColours.length) return cellColours
  const groups = new Map<string, number[]>()
  for (const [cell, shades] of cellColours.entries()) {
    for (const shade of shades) {
      const group = groups.get(shade)
      if (group) group.push(cell)
      else groups.set(shade, [cell])
    }
  }
  // The built-in region drawing already shows a colour group with this exact membership.
  const houses = rules.filter(rule => rule.type === 'extra-house')
  const covered = new Set<string>()
  for (const [shade, group] of groups) {
    if (group.length === 9 && houses.some(house => house.cells.length === group.length &&
      group.every(cell => house.cells.includes(cell)))) covered.add(shade)
  }
  return covered.size ? cellColours.map(shades => [...shades].filter(shade => !covered.has(shade)).join('')) : cellColours
}

function coachMirroredRenbansMatch(cellColours: readonly string[], rules: readonly VariantRule[], allPalindromes: boolean): boolean {
  const cellSetKey = (cells: readonly number[]) => [...cells].sort((a, b) => a - b).join(',')
  const renbans = new Set(rules.filter(rule => rule.type === 'renban').map(rule => cellSetKey(rule.cells)))
  const palindromes = rules.filter(rule => rule.type === 'palindrome')
  if (!palindromes.length) return false

  const mirrorPairs = new Set<string>()
  for (const { cells } of palindromes) {
    // A Renban on either half applies to both halves through the mirrored digits.
    // Both halves include the middle cell of an odd-length Palindrome.
    const half = Math.ceil(cells.length / 2)
    if (!renbans.has(cellSetKey(cells.slice(0, half))) && !renbans.has(cellSetKey(cells.slice(-half)))) {
      if (allPalindromes) return false
      continue
    }
    for (let index = 0; index < Math.floor(cells.length / 2); index++) {
      mirrorPairs.add(cellSetKey([cells[index], cells[cells.length - 1 - index]]))
    }
  }

  // The same pair of colours selects the two mirrored cells. Individual colours
  // are reused on several pairs, so compare the whole combination on each cell.
  const groups = new Map<string, number[]>()
  for (const [cell, shades] of cellColours.entries()) {
    if (!shades) continue
    const combination = [...shades].sort().join('')
    const group = groups.get(combination)
    if (group) group.push(cell)
    else groups.set(combination, [cell])
  }
  return [...groups.values()].every(cells => mirrorPairs.has(cellSetKey(cells)))
}

function readCoachFog(layers: readonly Record<string, unknown>[]): FogDefinition | undefined {
  if (!layers.length) return
  const visible = new Set<number>()
  const emptyObject = (value: unknown) => value === undefined || record(value) && !Object.keys(value).length
  for (const layer of layers) {
    const { segments, settings } = layer
    const segment = Array.isArray(segments) && segments.length === 1 ? segments[0] : undefined
    const fog = { initialCells: record(segment) ? segment.cells : undefined }
    if (!emptyObject(settings) || Object.keys(layer).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
      !record(segment) || !emptyObject(segment.parameters) || Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters') ||
      !isFogDefinition(fog)) {
      throw new Error('This Sudoku Coach Fog of War layer has invalid or unsupported reveal settings.')
    }
    for (const cell of fog.initialCells) visible.add(cell)
  }
  return { initialCells: [...visible].sort((a, b) => a - b) }
}

function readCoachFogCellColors(fog: FogDefinition, cellColours: readonly string[], palette: readonly unknown[]) {
  const initial = new Set(fog.initialCells)
  const colors: ImportedCellColors = {}
  for (const [cell, codes] of cellColours.entries()) {
    const shades = [...codes].map(code => palette[COACH_BASE62.indexOf(code)])
    // This Jigsaw Fog export paints the entire starting reveal gray. Covered
    // colors become visible as ordinary cell backgrounds when the fog clears.
    if (!shades.every(isImportedColor) ||
      (initial.has(cell) ? shades.length !== 1 || shades[0] !== 'grey' : shades.includes('grey'))) return
    if (shades.length) colors[cell] = shades
  }
  return validImportedCellColors(colors) ? colors : undefined
}

async function coachExportHash(code: string) {
  if (!globalThis.crypto?.subtle) return
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Coach leaves this rule out of a pasted Quad-Arrows export.
const quadArrowsExport = '081de6e0d36d53b949aa2fcb8c18ab5cc7a89acab4729d3ba41baddefdd2dd43'
const codeCrackerExport = 'a297ab70f94568f356c282821f9566ad8ac1e2ba287781737615518c306bab3c'
const sandwichRollExport = 'a5222a3faefbf42cdaab3c8b81958d14e5a709e89d28e45d8611fbf64a325653'

// The Rainbow colors repeat the region map. Revival's yellow pattern adds no
// rule. Match the reviewed exports in full because other colors can encode clues.
const reviewedCoachColorExports = new Map([
  ['1be837174e67a43133a677d6f504da74724c35ece725b203f822d299954a91c1', 'Entro Quad Rainbow Jigsaw'],
  ['2ec5b5abab8e4c9e045a35d0d3a4244213e47e37462c9b598798ee53ba07f28d', 'Revival'],
])

function readCoachInsideGrid(constraints: readonly unknown[]): VariantRule[] {
  const invalid = new Error('The export does not match its published Inside Grid and Consecutive Thermometers.')
  const layers = constraints.filter(record)
  if (layers.length !== constraints.length) throw invalid
  const ofType = (type: string) => layers.filter(layer => layer.type === type)
  const regions = readCoachRules(ofType('region'), {})
  const groups = regions.map(region => region.type === 'distinct-cells' ? region.cells : [])
  const size = groups[0]?.length ?? 0
  const rows = groups.slice(0, size)
  const sameCells = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every(cell => b.includes(cell))
  if (!validInsideGridRows(rows) || groups.length !== 2 * size ||
    !insideGridColumns(rows).every(column => groups.slice(size).some(group => sameCells(group, column)))) throw invalid

  const [shape] = ofType('cosmeticShape')
  const diamonds = Array.isArray(shape?.segments) ? shape.segments.map(segment => {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
      !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 ||
      !record(segment.parameters) || segment.parameters.shape !== 'rect') throw invalid
    const [x, y] = segment.cells[0]
    if (typeof x !== 'number' || typeof y !== 'number' ||
      ![x, y].every(coordinate => Number.isInteger(coordinate - .5) && coordinate >= .5 && coordinate <= 8.5)) throw invalid
    return (y - .5) * 9 + x - .5
  }) : []
  if (!sameCells(rows.flat(), diamonds) || new Set(diamonds).size !== size * size) throw invalid

  const renbans = readCoachRules(ofType('renban'), {}).filter(rule => rule.type === 'renban')
  const runs = ofType('thermometer').flatMap(layer => {
    const color = record(layer.settings) ? layer.settings.colour : undefined
    if (color !== undefined && !isHexColor(color)) throw invalid
    return readCoachRules([layer], {}).map((rule): VariantRule => {
      if (rule.type !== 'thermometer') throw invalid
      const index = renbans.findIndex(line => sameCells(rule.cells, line.cells))
      if (index < 0) throw invalid
      renbans.splice(index, 1)
      return { type: 'consecutive-run', cells: rule.cells, fromBulb: true, ...(color && { color }) }
    })
  })
  if (renbans.length || !runs.length) throw invalid
  const other = layers.filter(layer => !['region', 'cosmeticShape', 'thermometer', 'renban'].includes(String(layer.type)))
  return [{ type: 'inside-grid', rows }, ...runs, ...readCoachRules(other, {})]
}

function readCoachLetteredQuadruples(constraints: readonly unknown[]): VariantRule[] {
  const invalid = new Error('The export does not match its published lettered Quadruples.')
  const layers = constraints.filter(record)
  if (layers.length !== constraints.length) throw invalid
  const captions = layers.find(layer => layer.type === 'cosmeticText' && record(layer.settings) &&
    layer.settings.gridSnapToCentres === false && layer.settings.gridSnapToEdges === false)
  const circles = layers.find(layer => layer.type === 'cosmeticShape' && record(layer.settings) &&
    layer.settings.gridSnapToCorners === true)
  const corner = (segment: unknown) => {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
      !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2) throw invalid
    const [x, y] = segment.cells[0]
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || x > 8 || y < 1 || y > 8) throw invalid
    return (y - 1) * 9 + x - 1
  }
  if (!Array.isArray(captions?.segments) || !Array.isArray(circles?.segments)) throw invalid
  const clues = captions.segments.map(segment => ({
    topLeft: corner(segment),
    letters: record(segment) && record(segment.parameters) ? segment.parameters.text : undefined,
  }))
  if (!validLetteredQuadruples(clues)) throw invalid
  const drawn = new Set(circles.segments.map(segment => {
    if (!record(segment) || !record(segment.parameters) || segment.parameters.shape !== 'circle') throw invalid
    return corner(segment)
  }))
  if (drawn.size !== clues.length || clues.some(clue => !drawn.has(clue.topLeft))) throw invalid
  // The original also carries transparent answer letters and decorative
  // text and shapes. Only the paired circles and their visible labels are clues.
  const typed = layers.filter(layer => !['cosmeticText', 'cosmeticShape', 'cosmeticLine'].includes(String(layer.type)))
  return [...readCoachRules(typed, {}), { type: 'lettered-quadruples', clues }]
}

async function fromCoach(code: string, publication?: CoachPublication | null, fromCollection = false): Promise<ImportResult> {
  const data: Record<string, unknown> = /^[0-9]{81}$/.test(code) ? { gridSize: 9, givenDigits: code } : await decodeCoach(code)
  if (data.gridSize === 4 || isRectangularSize(data.gridSize) || isJigsawSize(data.gridSize)) {
    if (fromCollection && (!publication || publication.hasAuthorInstructions)) {
      throw new Error('This puzzle has author instructions. Open it in Sudoku Coach to play with all its rules.')
    }
    const { givens, grid, rules } = readCoachSized(data)
    if (publication?.hasAuthorInstructions && rules.some(rule => rule.type === 'quadruple')) {
      throw new Error('This puzzle has author instructions. Open it in Sudoku Coach to play with all its rules.')
    }
    return { givens, grid, ...(grid.size !== 4 || rules.length ? { sizedRules: rules } : {}),
      ...(publication?.title && { title: publication.title }) }
  }
  if (data.gridSize !== 9) {
    throw new Error('Import supports 4 × 4, 5 × 5 Jigsaw, 6 × 6, 7 × 7 Jigsaw, 8 × 8, and 9 × 9 Sudoku Coach grids.')
  }
  if (publication === null) throw new Error('Open this short link in Sudoku Coach, then use Copy → Puzzle.')
  if (publication?.hasAuthorInstructions && !publication.authoredRule && !publication.declaredRules && !publication.whispersGuide) {
    throw new Error('This puzzle has author instructions. Open it in Sudoku Coach to play with all its rules.')
  }
  const givens = data.givenDigits === undefined ? EMPTY : data.givenDigits
  if (typeof givens !== 'string' || !/^[0-9]{81}$/.test(givens)) throw new Error('This Sudoku Coach puzzle has invalid givens.')
  const encodedLayers = data.givenConstraints ?? []
  if (!Array.isArray(encodedLayers)) throw new Error('This Sudoku Coach puzzle has invalid rules.')
  const isFogLayer = (layer: unknown): layer is Record<string, unknown> => record(layer) && layer.type === 'fog'
  let fog = readCoachFog(encodedLayers.filter(isFogLayer))
  const constraints = fog ? encodedLayers.filter(layer => !isFogLayer(layer)) : encodedLayers
  const artwork = await readReviewedCoachArtwork(code, constraints)
  let regions: VariantPuzzle['regions'] = Array.isArray(data.regions) && data.regions.length === 0
    ? { type: 'partial', regions: [] } : readRegions(data.regions)
  if (publication?.authoredRule === 'partial-regions' && !artwork?.partialRegions) {
    throw new Error('The export does not match its published region outlines.')
  }
  const guideLayers = constraints.every(layer => record(layer) &&
    ['whisper', 'cosmeticShape', 'cosmeticText'].includes(String(layer.type))) &&
    constraints.some(layer => layer.type === 'whisper') && constraints.some(layer => layer.type === 'cosmeticShape')
    ? constraints.filter(layer => layer.type !== 'whisper') : []
  const encodedRules = guideLayers.length ? constraints.filter(layer => layer.type === 'whisper')
    : artwork ? constraints.filter(layer => layer !== artwork.layer) : constraints
  const cellColours = readCoachColourCells(data.colours, data.givenColours)
  const hasQuadruples = encodedRules.some(layer => record(layer) && layer.type === 'quadruple')
  const declaredInsideGrid = publication?.authoredRule === 'inside-grid'
  const declaredLettered = publication?.authoredRule === 'lettered-quadruples'
  const exportHash = (!publication && hasQuadruples || declaredInsideGrid || declaredLettered || !fog && cellColours?.some(Boolean))
    ? await coachExportHash(code) : undefined
  const insideGrid = exportHash === codeCrackerExport && (!publication || declaredInsideGrid)
  const lettered = exportHash === sandwichRollExport && (!publication || declaredLettered)
  if (declaredLettered && !lettered) throw new Error('The export does not match its published lettered Quadruples.')
  if (declaredInsideGrid && !insideGrid) throw new Error('The export does not match its published Inside Grid.')
  const rawQuadArrows = !publication && exportHash === quadArrowsExport
  const reviewedColorTitle = !fog && !publication?.hasAuthorInstructions && exportHash
    ? reviewedCoachColorExports.get(exportHash) : undefined
  const authoredRule = rawQuadArrows ? 'quad-arrows' : publication?.authoredRule
  let rules = lettered ? readCoachLetteredQuadruples(encodedRules)
    : insideGrid ? readCoachInsideGrid(encodedRules) : readCoachRules(encodedRules, { regions, authoredRule })
  if (artwork?.partialRegions) {
    const marked = rules.filter(rule => rule.type === 'extra-house')
    if (regions?.type !== 'partial' || !marked.length) throw new Error('The Bento puzzle is missing its marked regions.')
    regions = { type: 'partial', regions: marked.map(rule => [...rule.cells].sort((a, b) => a - b)) }
    rules = rules.filter(rule => rule.type !== 'extra-house')
  }
  if (authoredRule === 'quad-arrows' && !rules.some(rule => rule.type === 'quadruple-sum')) {
    throw new Error('This Sudoku Coach Quad-Arrows export is missing its circles.')
  }
  const palette = Array.isArray(data.colours) ? data.colours : []
  const whispersGuide = guideLayers.length > 0 && cellColours !== undefined && isCoachWhispersGuide(
    cellColours.map(shade => shade === '' ? '' : shade.length === 1 ? palette[COACH_BASE62.indexOf(shade)] : undefined),
    guideLayers, { version: 1, givens, regions, rules },
  )
  if (guideLayers.length > 0 && !whispersGuide || publication?.whispersGuide && !whispersGuide) {
    throw new Error('This Sudoku Coach puzzle has an unsupported Whispers guide.')
  }
  const declaredMirroredRenban = publication?.authoredRule === 'mirrored-renban'
  if (declaredMirroredRenban && (!cellColours || !coachMirroredRenbansMatch(cellColours, rules, true))) {
    throw new Error('The Sudoku Coach export does not match its published mirrored Renban rules and markings.')
  }
  const unsupportedDrawings = publication && COACH_DRAWINGS.some(key => hasData(data[key]))
  if (unsupportedDrawings || !cellColours) throw new Error('This Sudoku Coach puzzle has unsupported authored markings.')
  let givenCellColors: ImportedCellColors | undefined
  let fillTitle: string | undefined
  if (!whispersGuide && !declaredMirroredRenban) {
    const remaining = coachColoursWithoutExtraHouses(cellColours, rules)
    if (remaining.some(Boolean) && !coachMirroredRenbansMatch(remaining, rules, false)) {
      if (!fog && !publication?.hasAuthorInstructions) {
        const plainCollectionArtwork = !rules.length && (!regions || regions.type === 'boxes') &&
          (fromCollection || LEGACY_COACH_CODE.test(code))
        const fills = readCoachColorNames(remaining, palette)
        if (fills && !plainCollectionArtwork) fillTitle = reviewedColorTitle ?? await reviewedCoachFillTitle(data, fills)
        if (plainCollectionArtwork || fillTitle) givenCellColors = fills
      }
      if (!givenCellColors) {
        const cellColors = fog && regions?.type === 'jigsaw' && !publication?.hasAuthorInstructions
          ? readCoachFogCellColors(fog, cellColours, palette) : undefined
        if (!fog || !cellColors) throw new Error('This Sudoku Coach puzzle has unsupported authored markings.')
        fog = { ...fog, cellColors }
      }
    }
  }
  if (publication?.authoredRule === 'all-black-dots') {
    const black = rules.find(rule => rule.type === 'kropki' && rule.ratioTwo !== undefined)
    if (black?.type !== 'kropki' || !black.ratioTwo) {
      throw new Error('The Sudoku Coach export is missing the black Kropki dot layer from the published rules.')
    }
    // Native negative Kropki exempts edges with either color of dot. The
    // author's complete black-dot rule exempts only the black dots.
    if (rules.some(rule => rule.type === 'kropki' && rule.consecutive?.pairs?.length)) {
      throw new Error('This Sudoku Coach puzzle uses white dots with an authored complete black-dot rule.')
    }
    black.ratioTwo = { ...black.ratioTwo, negative: true }
  }
  const declaration = publication?.declaredRules
  if (declaration && 'cageTotals' in declaration) {
    const cages = rules.flatMap(rule => rule.type === 'killer-cages' ? rule.cages : [])
    if (!cages.length || cages.some(cage => !declaration.cageTotals.includes(cage.sum))) {
      throw new Error('The Sudoku Coach cage totals do not match the published description.')
    }
  } else if (declaration && (!rules.some(rule => rule.type === 'global-entropy') ||
    !declaration.adjacentTotals.every(sum => rules.some(rule => rule.type === 'adjacent-total' && rule.sum === sum)))) {
    throw new Error('The Sudoku Coach export is missing rules from the published description.')
  }
  const imported = makeImportedPuzzle(givens, rules, regions, fog)
  const progress = readCoachProgress(data, givens)
  const title = publication?.title ?? artwork?.title ?? fillTitle ?? (rawQuadArrows ? 'Quad-Arrows' : insideGrid ? 'Code Cracker' : lettered ? 'Sandwich Roll ;)' : undefined)
  return { ...imported, ...(title && { title }), ...(progress && { progress }),
    ...(artwork && { authoredArtwork: artwork.artwork }),
    ...(whispersGuide && { whispersGuide: true }), ...(givenCellColors && { givenCellColors }) }
}

function readCoachPairMarkers(constraint: Record<string, unknown>, kind: 'difference' | 'ratio') {
  const { settings, segments } = constraint
  if (hasData(settings) && (!record(settings) ||
    Object.keys(settings).some(key => key !== 'negativeConstraint') ||
    settings.negativeConstraint !== undefined && typeof settings.negativeConstraint !== 'boolean')) {
    throw new Error(`This Sudoku Coach puzzle uses unsupported settings for ${kind}.`)
  }
  if (!Array.isArray(segments)) throw new Error(`This Sudoku Coach puzzle has invalid ${kind} markers.`)
  const markers = segments.map(segment => {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 2 ||
      !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== kind)) {
      throw new Error(`This Sudoku Coach puzzle has an invalid ${kind} marker.`)
    }
    const amount = segment.parameters[kind]
    return { cells: segment.cells as [number, number], amount: amount === undefined ? (kind === 'difference' ? 1 : 2) : amount }
  })
  return { markers, negative: record(settings) && settings.negativeConstraint === true }
}

function coachOutsideRay(side: OutsideSide, index: number) {
  const direction = side === 'top' ? 'south' : side === 'bottom' ? 'north' : side === 'left' ? 'east' : 'west'
  const cells = Array.from({ length: 9 }, (_, i) => side === 'top' ? i * 9 + index : side === 'bottom' ? (8 - i) * 9 + index
    : side === 'left' ? index * 9 + i : index * 9 + 8 - i)
  return { direction, cells } as const
}

function readCoachXSums(constraint: Record<string, unknown>, segments: readonly unknown[]) {
  const { settings } = constraint
  if (settings !== undefined && (!record(settings) || Object.keys(settings).some(key =>
    !['gridZoomOut', 'gridSnapToCorners', 'gridSnapToEdges', 'textSize'].includes(key)) ||
    (settings.gridZoomOut !== undefined && settings.gridZoomOut !== 1) ||
    (settings.gridSnapToCorners !== undefined && settings.gridSnapToCorners !== false) ||
    (settings.gridSnapToEdges !== undefined && settings.gridSnapToEdges !== false) ||
    (settings.textSize !== undefined && !(typeof settings.textSize === 'number' && Number.isFinite(settings.textSize) && settings.textSize > 0)))) {
    throw new Error('This Sudoku Coach X-Sums layer uses unsupported settings.')
  }
  const clues: Extract<VariantRule, { type: 'x-sum' }>[] = []
  const cellCenter = (coordinate: number) => coordinate >= 0.5 && coordinate <= 8.5 && Number.isInteger(coordinate - 0.5)
  for (const segment of segments) {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
      !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 ||
      !segment.cells[0].every(Number.isFinite) || !record(segment.parameters) ||
      Object.keys(segment.parameters).length !== 1 || typeof segment.parameters.text !== 'string') {
      throw new Error('This Sudoku Coach puzzle has an invalid X-Sum label.')
    }
    const { text } = segment.parameters
    if (!text) continue
    const [x, y] = segment.cells[0] as [number, number]
    const side = cellCenter(x) && y === -0.5 ? 'top' : cellCenter(x) && y === 9.5 ? 'bottom'
      : cellCenter(y) && x === -0.5 ? 'left' : cellCenter(y) && x === 9.5 ? 'right' : undefined
    const sum = Number(text)
    if (!side || !/^[1-9][0-9]?$/.test(text) || sum > 45) {
      throw new Error('This Sudoku Coach X-Sum needs a total from 1 through 45 beside a row or column.')
    }
    clues.push({ type: 'x-sum', ...coachOutsideRay(side, (side === 'top' || side === 'bottom' ? x : y) - 0.5), sum })
  }
  return clues
}

function readCoachRules(constraints: unknown, { regions, grid, authoredRule }: {
  regions?: VariantPuzzle['regions']; grid?: SizedGrid; authoredRule?: CoachPublication['authoredRule']
} = {}): VariantRule[] {
  if (!Array.isArray(constraints)) throw new Error('This Sudoku Coach puzzle has invalid rules.')
  const rules: VariantRule[] = []
  const numbered = new Set(constraints.flatMap(constraint => {
    if (!record(constraint) || constraint.type !== 'ratio' && constraint.type !== 'difference') return []
    const { type } = constraint
    const defaultValue = type === 'ratio' ? 2 : 1
    return readCoachPairMarkers(constraint, type).markers.some(mark => mark.amount !== defaultValue) ? [type] : []
  }))
  const drawnLines: Record<string, unknown>[] = []
  for (const constraint of constraints) {
    if (!record(constraint) || !Array.isArray(constraint.segments) || typeof constraint.type !== 'string') {
      throw new Error('This Sudoku Coach puzzle has invalid rules.')
    }
    // These layers contribute nothing when the export contains no paths or labels.
    if ((constraint.type === 'consecutiveLine' || !grid && constraint.type === 'cosmeticText') && constraint.segments.length === 0 &&
      (constraint.settings === undefined || record(constraint.settings) && Object.keys(constraint.settings).length === 0) &&
      Object.keys(constraint).every(key => ['id', 'type', 'segments', 'settings'].includes(key))) continue
    if (constraint.type === 'cosmeticText' && authoredRule === 'x-sum') {
      rules.push(...readCoachXSums(constraint, constraint.segments))
      continue
    }
    if (constraint.type === 'cosmeticLine' && authoredRule === 'line-colours') {
      drawnLines.push(constraint)
      continue
    }
    if (!['region', 'consecutiveLine', 'difference', 'ratio', 'odd', 'even', 'whisper', 'thermometer', 'arrow', 'pillArrow', 'betweenLine', 'lockoutLine', 'regionSumLine', 'palindromeLine', 'renban', 'entropicLine', 'modularLine', 'sandwich', 'littleKiller', 'cage', 'cosmeticShape'].includes(constraint.type) && hasData(constraint.settings)) throw new Error(`This Sudoku Coach puzzle uses unsupported settings for ${constraint.type}.`)
    if (constraint.type === 'cosmeticShape') {
      rules.push(...readCoachDigitRestrictions(constraint))
    } else if (constraint.type === 'minimum' || constraint.type === 'maximum') {
      const { type, segments } = constraint
      if (Object.keys(constraint).some(key => !['id', 'type', 'segments', 'settings'].includes(key))) {
        throw new Error(`This Sudoku Coach puzzle has an invalid ${type} layer.`)
      }
      const cells = segments.map(segment => {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 || hasData(segment.parameters)) {
          throw new Error(`This Sudoku Coach puzzle has an invalid ${type} cell.`)
        }
        return segment.cells[0]
      })
      if (cells.length) rules.push({ type, cells, ignoreMarkedNeighbors: true })
    } else if (constraint.type === 'odd' || constraint.type === 'even') {
      if (unsupportedClueStyling(constraint.settings)) throw new Error('This Sudoku Coach Odd/Even clue uses unsupported settings.')
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no Odd/Even cells.')
      const cells: number[] = []
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 || hasData(segment.parameters)) {
          throw new Error('This Sudoku Coach puzzle has an invalid Odd/Even cell.')
        }
        cells.push(segment.cells[0])
      }
      rules.push({ type: 'parity', cells, parity: constraint.type })
    } else if (constraint.type === 'littleKiller') {
      if (hasData(constraint.settings) && (!record(constraint.settings) || Object.keys(constraint.settings).some(key => key !== 'colour'))) {
        throw new Error('This Sudoku Coach Little Killer clue uses unsupported settings.')
      }
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no Little Killer clues.')
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 || !Array.isArray(segment.cells[0]) ||
          segment.cells[0].length !== 2 || !segment.cells[0].every(value => Number.isInteger(value) && value >= -1 && value <= 9) ||
          !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== 'positive' && key !== 'value') ||
          typeof segment.parameters.positive !== 'boolean' || !Number.isInteger(segment.parameters.value) || Number(segment.parameters.value) < 1) {
          throw new Error('This Sudoku Coach puzzle has an invalid or cosmetic Little Killer clue.')
        }
        const [x, y] = segment.cells[0] as number[]
        const inside = (row: number, column: number) => row >= 0 && row < 9 && column >= 0 && column < 9
        if (inside(y, x)) throw new Error('This Sudoku Coach Little Killer clue must start outside the grid.')
        let dr = segment.parameters.positive ? -1 : 1, dc = 1
        if (!inside(y + dr, x + dc)) { dr = -dr; dc = -dc }
        if (!inside(y + dr, x + dc)) throw new Error('This Sudoku Coach Little Killer arrow misses the grid.')
        const cells: number[] = []
        for (let row = y + dr, column = x + dc; inside(row, column); row += dr, column += dc) cells.push(row * 9 + column)
        const direction = dr < 0 ? dc < 0 ? 'north-west' : 'north-east' : dc < 0 ? 'south-west' : 'south-east'
        rules.push({ type: 'little-killer', direction, cells, sum: Number(segment.parameters.value) })
      }
    } else if (constraint.type === 'sandwich') {
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key => key !== 'outsideLevel' && key !== 'textColour') ||
        settings.outsideLevel !== undefined && settings.outsideLevel !== 1)) {
        throw new Error('This Sudoku Coach Sandwich clue uses unsupported settings.')
      }
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no Sandwich clues.')
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length || !record(segment.parameters) ||
          Object.keys(segment.parameters).some(key => !['side', 'index', 'value'].includes(key))) {
          throw new Error('This Sudoku Coach puzzle has an invalid Sandwich clue.')
        }
        const { side, index, value } = segment.parameters
        if (typeof side !== 'string' || !['top', 'right', 'bottom', 'left'].includes(side) || !Number.isInteger(index) || Number(index) < 0 || Number(index) > 8 ||
          !Number.isInteger(value) || Number(value) < 0 || Number(value) > 35) throw new Error('This Sudoku Coach puzzle has an invalid Sandwich clue.')
        rules.push({ type: 'sandwich', ...coachOutsideRay(side as OutsideSide, Number(index)), sum: Number(value) })
      }
    } else if (constraint.type === 'quadruple') {
      if (grid && !constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no Quadruple clues.')
      const size = grid?.size ?? 9
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
          !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== 'digits') ||
          typeof segment.parameters.digits !== 'string' || !/^[1-9]{1,4}$/.test(segment.parameters.digits) ||
          [...segment.parameters.digits].some(digit => Number(digit) > size)) {
          throw new Error('This Sudoku Coach puzzle has an invalid Quadruple clue.')
        }
        rules.push({ type: authoredRule === 'quad-arrows' ? 'quadruple-sum' : 'quadruple',
          topLeft: segment.cells[0], digits: [...segment.parameters.digits].map(Number) })
      }
    } else if (constraint.type === 'cage') {
      const { settings } = constraint
      if (hasData(settings) && (grid || !record(settings) || Object.keys(settings).some(key => key !== 'horizontalOffset') ||
        typeof settings.horizontalOffset !== 'number' || !Number.isFinite(settings.horizontalOffset) ||
        settings.horizontalOffset < 0 || settings.horizontalOffset > 100)) {
        throw new Error('This Sudoku Coach puzzle uses unsupported settings for cage.')
      }
      const cages = constraint.segments.map((segment: unknown) => {
        if (!record(segment) || !Array.isArray(segment.cells) || !record(segment.parameters) ||
          Object.keys(segment.parameters).length !== 1 || typeof segment.parameters.sum !== 'number') {
          throw new Error('This Sudoku Coach puzzle has an invalid Killer cage.')
        }
        return { cells: segment.cells, sum: segment.parameters.sum }
      })
      if (!cages.length) throw new Error('This Sudoku Coach puzzle has no Killer cages.')
      rules.push({ type: 'killer-cages', cages })
    } else if (constraint.type === 'diagonalPositive' || constraint.type === 'diagonalNegative' || constraint.type === 'antiKnight' || constraint.type === 'antiKing' || constraint.type === 'nonconsecutive' || constraint.type === 'globalEntropy') {
      if (constraint.segments.length) throw new Error(`This Sudoku Coach puzzle uses unsupported cells for ${constraint.type}.`)
      if (constraint.type === 'globalEntropy') rules.push({ type: 'global-entropy' })
      else if (constraint.type === 'antiKnight') rules.push({ type: 'anti-knight' })
      else if (constraint.type === 'antiKing') rules.push({ type: 'anti-king' })
      else if (constraint.type === 'nonconsecutive') rules.push({ type: 'non-consecutive' })
      else rules.push({ type: 'diagonal', diagonal: constraint.type === 'diagonalNegative' ? 'main' : 'anti' })
    } else if (constraint.type === 'twoCellSum') {
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no two-cell sum clues.')
      const five: [number, number][] = [], ten: [number, number][] = []
      const totals: Extract<VariantRule, { type: 'adjacent-total' }>[] = []
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 2 ||
          !record(segment.parameters) || Object.keys(segment.parameters).some(key => key !== 'sum')) {
          throw new Error('This Sudoku Coach puzzle has an invalid two-cell sum clue.')
        }
        const sum = segment.parameters.sum
        if (typeof sum !== 'number' || !Number.isInteger(sum) || sum < 3 || sum > 17) throw new Error('This Sudoku Coach two-cell sum must be an integer from 3 through 17.')
        if (sum === 5) five.push(segment.cells as [number, number])
        else if (sum === 10) ten.push(segment.cells as [number, number])
        else totals.push({ type: 'adjacent-total', cells: segment.cells as [number, number], sum })
      }
      if (five.length || ten.length) rules.push({ type: 'xv', ...(five.length > 0 && { five: { pairs: five } }), ...(ten.length > 0 && { ten: { pairs: ten } }) })
      rules.push(...totals)
    } else if (constraint.type === 'greaterLess') {
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no inequality signs.')
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 2 || hasData(segment.parameters)) {
          throw new Error('This Sudoku Coach puzzle has an invalid inequality sign.')
        }
        rules.push({ type: 'inequality', less: segment.cells[0], greater: segment.cells[1] })
      }
    } else if (constraint.type === 'difference' || constraint.type === 'ratio') {
      const kind = constraint.type
      const { markers, negative } = readCoachPairMarkers(constraint, kind)
      if (numbered.has(kind)) {
        const size = grid?.size ?? 9
        const min = kind === 'ratio' ? 2 : 1
        const max = kind === 'ratio' ? size : size - 1
        const marks = markers.map(({ cells, amount }) => {
          if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < min || amount > max) {
            throw new Error(`A ${kind} marker must be a whole number between ${min} and ${max}.`)
          }
          return { cells, value: amount }
        })
        if (marks.length || negative) rules.push({ type: 'labeled-dots', relation: kind, marks, ...(negative && { negative }) })
      } else {
        const marks = { pairs: markers.map(({ cells }) => cells), negative }
        rules.push(kind === 'difference'
          ? { type: 'kropki', consecutive: marks }
          : { type: 'kropki', ratioTwo: marks })
      }
    } else if (constraint.type === 'region') {
      const settings = constraint.settings
      if (unsupportedClueStyling(settings)) {
        throw new Error('This Sudoku Coach extra region uses unsupported settings.')
      }
      if (!constraint.segments.length) throw new Error('This Sudoku Coach puzzle has no extra regions.')
      const color = record(settings) ? settings.colour : undefined
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || hasData(segment.parameters)) {
          throw new Error('This Sudoku Coach puzzle has an invalid extra region.')
        }
        if (grid || segment.cells.length === 9) {
          rules.push({ type: 'extra-house', cells: segment.cells })
        } else {
          if (color !== undefined && !isHexColor(color)) throw new Error('This Sudoku Coach shaded group uses an unsupported color.')
          rules.push({ type: 'distinct-cells', cells: segment.cells, ...(color && { color }) })
        }
      }
    } else if (constraint.type === 'consecutiveLine') {
      const settings = constraint.settings
      const color = record(settings) ? settings.colour : undefined
      if (Object.keys(constraint).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
        hasData(settings) && (!record(settings) || Object.keys(settings).some(key => !LINE_STYLING.has(key))) ||
        color !== undefined && !isHexColor(color)) {
        throw new Error('This Sudoku Coach Consecutive Line uses unsupported settings.')
      }
      const size = grid?.size ?? 9
      const paths = constraint.segments.map((segment: unknown) => {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length < 2 || hasData(segment.parameters) ||
          segment.cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= size ** 2)) {
          throw new Error('This Sudoku Coach puzzle has an invalid Consecutive Line segment.')
        }
        return segment.cells as number[]
      })
      for (const cells of coachConsecutiveRuns(paths, size)) rules.push({ type: 'consecutive-run', cells, ...(color && { color }) })
    } else if (constraint.type === 'palindromeLine' || constraint.type === 'renban' || constraint.type === 'regionSumLine') {
      const name = constraint.type === 'renban' ? 'Renban' : constraint.type === 'regionSumLine' ? 'Region Sum' : 'Palindrome'
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key => !LINE_STYLING.has(key)))) {
        throw new Error(`This Sudoku Coach ${name} line uses unsupported settings.`)
      }
      if (!constraint.segments.length) throw new Error(`This Sudoku Coach puzzle has no ${name} cells.`)
      const paths = constraint.segments.map((segment: unknown) => {
        if (!record(segment) || !Array.isArray(segment.cells) || !segment.cells.length || hasData(segment.parameters) ||
          segment.cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= 81)) {
          throw new Error(`This Sudoku Coach puzzle has an invalid ${name} segment.`)
        }
        return segment.cells as number[]
      })
      for (const line of coachConnectedLines(paths)) {
        if (constraint.type !== 'regionSumLine') {
          rules.push({ type: constraint.type === 'renban' ? 'renban' : 'palindrome', ...line })
          continue
        }
        const drawing = line.segments ?? [line.cells]
        const cells = closedRegionSumCells(line.cells, drawing, cell => grid
          ? gridRegionIndex(grid, cell) : regionIndex(cell, regions))
        rules.push({ type: 'region-sum', cells, groupByRegion: false,
          ...(line.segments || cells !== line.cells ? { segments: drawing } : {}) })
      }
    } else if (constraint.type === 'entropicLine' || constraint.type === 'modularLine') {
      const name = constraint.type === 'entropicLine' ? 'Entropic' : 'Modular'
      if (hasData(constraint.settings) && (!record(constraint.settings) || Object.keys(constraint.settings).some(key => !LINE_STYLING.has(key)))) {
        throw new Error(`This Sudoku Coach ${name} line uses unsupported settings.`)
      }
      if (!constraint.segments.length) throw new Error(`This Sudoku Coach puzzle has no ${name} cells.`)
      // Coach jX1r7/jX1r8 compile each segment independently. Touching paths
      // must not use the connected-component grouping of Renban/Palindrome.
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || !segment.cells.length || hasData(segment.parameters) ||
          segment.cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= 81)) {
          throw new Error(`This Sudoku Coach puzzle has an invalid ${name} path.`)
        }
        rules.push({ type: constraint.type === 'entropicLine' ? 'entropic' : 'modular', cells: segment.cells })
      }
    } else if (constraint.type === 'betweenLine' || constraint.type === 'lockoutLine') {
      const lockout = constraint.type === 'lockoutLine'
      const name = lockout ? 'Lockout' : 'Between'
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key =>
        !LINE_STYLING.has(key) && !BULB_STYLING.has(key)))) {
        throw new Error(`This Sudoku Coach ${name} line uses unsupported settings.`)
      }
      if (!constraint.segments.length && !lockout) throw new Error('This Sudoku Coach puzzle has no Between lines.')
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length < (lockout ? 2 : 3) || hasData(segment.parameters)) {
          throw new Error(`This Sudoku Coach puzzle has an invalid ${name} line.`)
        }
        rules.push({ type: lockout ? 'lockout' : 'between', cells: segment.cells })
      }
    } else if (constraint.type === 'whisper') {
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key => key !== 'difference' && !LINE_STYLING.has(key)))) {
        throw new Error('This Sudoku Coach Whispers line uses unsupported settings.')
      }
      const difference = record(settings) ? settings.difference ?? 5 : 5
      if (!Number.isInteger(difference) || Number(difference) < 1 || Number(difference) > 8 || !constraint.segments.length) {
        throw new Error('This Sudoku Coach Whispers line has an unsupported minimum difference or no cells.')
      }
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || hasData(segment.parameters)) {
          throw new Error('This Sudoku Coach puzzle has an unsupported Whispers line.')
        }
        rules.push({ type: 'whispers', cells: segment.cells, minDifference: Number(difference) })
      }
    } else if (constraint.type === 'pillArrow') {
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key => !LINE_STYLING.has(key) && !BULB_STYLING.has(key) && key !== 'arrowHeadLength'))) {
        throw new Error('This Sudoku Coach Pill Arrow uses unsupported settings.')
      }
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length < 3 || hasData(segment.parameters)) {
          throw new Error('This Sudoku Coach puzzle has an invalid Pill Arrow.')
        }
        const [first, start, ...cells] = segment.cells
        // Coach reads its two pill digits in row-major order even when drawn in reverse.
        const fromTens = start < first
        rules.push({ type: 'pill-arrow', pill: fromTens ? [start, first] : [first, start], cells, ...(fromTens && { fromTens }) })
      }
    } else if (constraint.type === 'thermometer' || constraint.type === 'arrow') {
      const settings = constraint.settings
      if (hasData(settings) && (!record(settings) || Object.keys(settings).some(key =>
        !LINE_STYLING.has(key) && (constraint.type === 'thermometer'
          ? key !== 'bulbSize' : !BULB_STYLING.has(key) && key !== 'arrowHeadLength')))) {
        throw new Error(`This Sudoku Coach ${constraint.type} uses unsupported settings.`)
      }
      if (!constraint.segments.length) throw new Error(`This Sudoku Coach puzzle has no cells for ${constraint.type}.`)
      for (const segment of constraint.segments) {
        if (!record(segment) || !Array.isArray(segment.cells) || hasData(segment.parameters)) {
          throw new Error(`This Sudoku Coach puzzle has an unsupported ${constraint.type}.`)
        }
        if (constraint.type === 'thermometer') rules.push({ type: 'thermometer', cells: segment.cells })
        else {
          const [circle, ...cells] = segment.cells
          rules.push({ type: 'arrow', circle, cells })
        }
      }
    } else {
      throw new Error(`This Sudoku Coach rule is not supported yet (${constraint.type}).`)
    }
  }
  if (authoredRule === 'line-colours') {
    if (!(['entropic', 'modular', 'region-sum'] as const).every(type => rules.some(rule => rule.type === type))) {
      throw new Error('This Sudoku Coach export is missing a rule from its published line legend.')
    }
    rules.push(...readCoachColouredLines(drawnLines, regions))
  } else if (authoredRule === 'x-sum') {
    const clues = rules.filter(rule => rule.type === 'x-sum')
    if (!clues.length) throw new Error('This Sudoku Coach X-Sums puzzle has no outside totals.')
    if (new Set(clues.map(rule => `${rule.direction}:${rule.cells[0]}`)).size !== clues.length) {
      throw new Error('This Sudoku Coach puzzle has multiple X-Sums for the same side of a row or column.')
    }
  }
  // Coach exempts white-dot edges from its global Non-Consecutive rule.
  const whiteDots = rules.flatMap(rule => rule.type === 'kropki' ? rule.consecutive?.pairs ?? []
    : rule.type === 'labeled-dots' && rule.relation === 'difference' ? rule.marks.map(mark => mark.cells) : [])
  const exceptions = [...new Map(whiteDots.filter(([a, b]) => cellsShareEdge(a, b)).map(([a, b]) => {
    const pair = [Math.min(a, b), Math.max(a, b)] as const
    return [pair.join(','), pair] as const
  })).values()]
  if (exceptions.length) for (const [index, rule] of rules.entries()) {
    if (rule.type === 'non-consecutive') rules[index] = { ...rule, except: exceptions }
  }
  return rules
}

/** Decode a six-by-six Coach export without dropping active rules. */
export async function decodeCoachSix(code: string) {
  const data = await decodeCoach(code)
  if (data.gridSize !== 6) throw new Error('This Sudoku Coach puzzle does not have a 6 × 6 grid.')
  return readCoachSized(data)
}

function readCoachSized(data: Record<string, unknown>) {
  const { gridSize: size, regions } = data
  const labels = Array.isArray(regions) && regions.every(label => Number.isInteger(label) && label >= 0) ? regions : undefined
  const distinct = isJigsawSize(size) && labels ? [...new Set<number>(labels)] : []
  const explicit = isJigsawSize(size) && labels?.length === size ** 2 && distinct.length === size
    ? { size, regions: regionsFromMembership(labels.map(label => distinct.indexOf(label)), size) } : undefined
  const grid = isJigsawSize(size) ? size === 7 && labels?.length === 0 ? SEVEN_BOXLESS_GRID : isJigsawGrid(explicit) ? explicit : undefined
    : isRectangularSize(size) ? labels && rectangularGridFromRegions(size, labels)
      : regions === undefined || hasMiniBoxes(regions) ? MINI_GRID : undefined
  if (!grid) throw new Error(size === 4 ? 'Mini Sudoku import requires four 2 × 2 boxes.'
    : isJigsawSize(size) ? jigsawLayoutError(size)
      : size === 8 ? 'Import requires eight rectangular boxes of 2 × 4 or 4 × 2 cells.'
        : 'Import requires six rectangular boxes of 2 × 3 or 3 × 2 cells.')
  const givenDigits = grid.size === 6 ? data.givenDigits ?? undefined : data.givenDigits
  const givens = givenDigits === undefined ? '0'.repeat(grid.size ** 2) : givenDigits
  if (!isGridText(givens, grid)) throw new Error('This Sudoku Coach puzzle has invalid givens.')
  if (COACH_AUTHORED_MARKINGS.some(key => hasData(data[key]))) {
    throw new Error('This Sudoku Coach puzzle has unsupported authored markings.')
  }
  const constraints = grid.size === 6 ? data.givenConstraints ?? [] :
    data.givenConstraints === undefined ? [] : data.givenConstraints
  if (!Array.isArray(constraints)) throw new Error('This Sudoku Coach puzzle has invalid rules.')
  const active = constraints.filter(rule => !(record(rule) &&
    ['odd', 'even', 'thermometer', 'palindromeLine', 'renban'].includes(String(rule.type)) &&
    Array.isArray(rule.segments) && rule.segments.length === 0 && !hasData(rule.settings)))
  const supported = ['diagonalNegative', 'diagonalPositive', 'cage', 'region', 'odd', 'even', 'thermometer', 'renban', 'difference', 'ratio', 'arrow', 'regionSumLine', 'quadruple']
  if (active.some(rule => !record(rule) || !supported.includes(String(rule.type)))) {
    throw new Error(`This ${grid.size} × ${grid.size} Sudoku Coach export includes an unsupported active rule.`)
  }
  const rules = active.flatMap((constraint): (VariantRule | SizedDifferenceRule | SizedLabeledDotsRule)[] => {
    if (!record(constraint) || constraint.type !== 'difference' && constraint.type !== 'ratio') return readCoachRules([constraint], { grid })
    const relation = constraint.type
    const { markers, negative } = readCoachPairMarkers(constraint, relation)
    const ratio = relation === 'ratio'
    if (markers.every(({ amount }) => amount === (ratio ? 2 : 1))) {
      const layer = { pairs: markers.map(({ cells }) => cells), negative }
      return [ratio ? { type: 'kropki', ratioTwo: layer } : { type: 'kropki', consecutive: layer }]
    }
    const minimum = ratio ? 2 : 1, maximum = ratio ? grid.size : grid.size - 1
    const marks = markers.map(({ cells, amount }) => {
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < minimum || amount > maximum) {
        throw new Error(`A ${ratio ? 'Ratio' : 'Difference'} marker on this grid must be a whole number between ${minimum} and ${maximum}.`)
      }
      return { cells, value: amount }
    })
    return ratio || negative ? [{ type: 'labeled-dots', relation, marks, negative }]
      : marks.map(({ cells, value }) => ({ type: 'difference', cells, difference: value }))
  })
  if (!isSizedRuleList(rules, grid)) throw new Error('This Sudoku Coach export contains invalid rules.')
  return { version: 2 as const, grid, givens, rules }
}

function readPublication(coach: unknown): CoachPublication | null {
  return record(coach) && typeof coach.hasAuthorInstructions === 'boolean'
    ? { hasAuthorInstructions: coach.hasAuthorInstructions,
      ...((coach.authoredRule === 'x-sum' || coach.authoredRule === 'all-black-dots' ||
        coach.authoredRule === 'line-colours' || coach.authoredRule === 'mirrored-renban' || coach.authoredRule === 'quad-arrows' || coach.authoredRule === 'partial-regions' || coach.authoredRule === 'inside-grid' || coach.authoredRule === 'lettered-quadruples') && { authoredRule: coach.authoredRule }),
      ...(isCoachTypedDeclaration(coach.declaredRules) && { declaredRules: coach.declaredRules }),
      ...(coach.whispersGuide === true && { whispersGuide: true }),
      title: typeof coach.title === 'string' ? coach.title.trim().slice(0, 72) : undefined }
    : null
}

export const sudokuCoach = {
  format: 'Sudoku Coach',
  links: {
    domains: ['sudoku.coach'],
    async read(url) {
      const collection = COACH_COLLECTION_LINK.exec(url.pathname)
      if (collection) {
        const [, path, id] = collection
        const { code, coach } = await fetchPublishedExport('sudoku-coach', `collections/${path}/${id}`)
        return fromCoach(code, readPublication(coach), true)
      }
      const id = url.pathname.match(/^\/(?:[a-z]{2}\/)?s\/([A-Za-z0-9]{1,16})\/?$/i)?.[1]
      if (id) {
        const { code, coach } = await fetchPublishedExport('sudoku-coach', id)
        return fromCoach(code, readPublication(coach))
      }
      const code = url.pathname.match(/^\/(?:[a-z]{2}\/)?(?:play|solver|construct)\/([^/]+)\/?$/i)?.[1] ?? ''
      if (code.toLowerCase().startsWith('scv')) return fromCoach(decodeURIComponent(code))
      if (/^[0-4.]{16}$/.test(code)) return { givens: code.replaceAll('.', '0'), grid: MINI_GRID }
      if (/^[0-9.]{81}$/.test(code)) return { givens: normalizeGivens(code) }
      throw new Error('This Sudoku Coach link does not contain a puzzle code. Open it and use Copy → Puzzle.')
    },
  },
  readText(text) {
    if (text.toLowerCase().startsWith('scv')) return fromCoach(text)
  },
} as const satisfies PuzzleImporter
