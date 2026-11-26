import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { parseCoachEntropyWindowGroups } from '../src/sudoku/entropy-window-groups.ts'
import { validAuthoredArtwork } from '../src/sudoku/authored-artwork.ts'
import { readReviewedCoachAqre } from '../src/sudoku/puzzle-import/coach-aqre.ts'
import { readReviewedCoachTextClues } from '../src/sudoku/puzzle-import/coach-text-clues.ts'
import { isSolved, makeGame, setAqreShade } from '../src/sudoku/game.ts'
import { variantPosition } from '../src/sudoku/variant-play.ts'
import { puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { syncRequest } from '../src/sudoku/sync-engine.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { isPlayablePuzzle } from '../src/sudoku/variants.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-authored-layers.json', import.meta.url), 'utf8')) as {
  examples: { issue: number; id: string; code: string; sourceDescription?: string }[]
}
const magicSquareFixture = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-magic-square.json', import.meta.url), 'utf8')) as {
  issue: number; code: string; solution: string
}

test('#423 imports the authored Magic Square and unnumbered nine-cell cages', async () => {
  const imported = await detectPuzzle(magicSquareFixture.code)
  const rules = imported.variant?.puzzle.rules
  assert.equal(imported.format, 'Sudoku Coach')
  assert.deepEqual(rules?.find(rule => rule.type === 'magic-square'), {
    type: 'magic-square', cells: [30, 31, 32, 39, 40, 41, 48, 49, 50],
  })
  const cages = rules?.find(rule => rule.type === 'killer-cages')
  assert.equal(cages?.type, 'killer-cages')
  assert.equal(cages?.cages.length, 13)
  assert.deepEqual(cages?.cages.filter(cage => cage.showSum === false), [
    { cells: [6, 7, 15, 24, 25, 26, 33, 35, 42], sum: 45, showSum: false },
    { cells: [48, 49, 50, 59, 68, 77, 78, 79, 80], sum: 45, showSum: false },
    { cells: [27, 28, 29, 30, 31, 32, 36, 37, 38], sum: 45, showSum: false },
    { cells: [0, 1, 2, 3, 9, 12, 19, 20, 21], sum: 45, showSum: false },
  ])
  assert.deepEqual(cages?.cages.filter(cage => cage.showSum === undefined).map(({ cells, sum }) => ({ cells, sum })), [
    { cells: [56, 57, 58, 65, 74], sum: 31 },
    { cells: [62, 71], sum: 10 },
    { cells: [34, 43, 44, 52, 53], sum: 28 },
    { cells: [51, 60], sum: 13 },
    { cells: [16, 17], sum: 6 },
    { cells: [63, 72], sum: 17 },
    { cells: [22, 23], sum: 10 },
    { cells: [45, 54], sum: 5 },
    { cells: [61, 69, 70], sum: 13 },
  ])
  assert.equal(magicSquareFixture.solution.length, 81)
})

test('#544 imports XV Entropy when the authored cosmetic cage is empty', async () => {
  const source = fixture.examples.find(example => example.issue === 544)
  assert.ok(source)

  const imported = await detectPuzzle(source.code)

  assert.equal(imported.format, 'Sudoku Coach')
  assert.equal(imported.givens, '0'.repeat(81))
  assert.deepEqual(imported.variant?.puzzle.rules, [
    { type: 'global-entropy' },
    {
      type: 'xv',
      five: { pairs: [[31, 40], [42, 33], [44, 35], [46, 47], [66, 57], [78, 79], [23, 24], [12, 13], [61, 62]] },
      ten: { pairs: [[30, 39], [74, 73], [59, 68], [37, 46], [80, 79], [0, 1], [7, 8], [19, 20], [22, 13]] },
    },
    { type: 'kropki', consecutive: { pairs: [[37, 38]], negative: false } },
  ])
})

test('#542 imports the shape groups, active rules, and authored RP label', async () => {
  const source = fixture.examples.find(example => example.issue === 542)
  assert.ok(source)

  const data = await decodeSudokuCoachPayload(source.code)
  const layers = (data.givenConstraints as { type?: unknown }[]).filter(layer => layer.type === 'cosmeticShape')
  const groups = parseCoachEntropyWindowGroups(layers)

  assert.deepEqual(groups, [
    { cells: [52, 53, 61, 62], group: 'high' },
    { cells: [68, 69, 77, 78], group: 'high' },
    { cells: [25, 26, 34, 35], group: 'high' },
    { cells: [0, 1, 9, 10], group: 'high' },
    { cells: [30, 31, 39, 40], group: 'high' },
    { cells: [70, 71, 79, 80], group: 'middle' },
    { cells: [63, 64, 72, 73], group: 'middle' },
    { cells: [40, 41, 49, 50], group: 'middle' },
    { cells: [2, 3, 11, 12], group: 'middle' },
    { cells: [7, 8, 16, 17], group: 'low' },
    { cells: [18, 19, 27, 28], group: 'low' },
    { cells: [45, 46, 54, 55], group: 'low' },
    { cells: [65, 66, 74, 75], group: 'low' },
    { cells: [5, 6, 14, 15], group: 'low' },
  ])

  const imported = await detectPuzzle(source.code)
  assert.equal(imported.format, 'Sudoku Coach')
  assert.equal(imported.title, 'Sunny with a chance of Entropy')
  assert.equal(imported.givens, '000000000000000000000400000000000010000705000080000000000003000000000000000000000')
  assert.deepEqual(imported.variant?.puzzle.rules?.reduce<Record<string, number>>((counts, rule) => {
    counts[rule.type] = (counts[rule.type] ?? 0) + 1
    return counts
  }, {}), { 'global-entropy': 1, entropic: 8, 'entropy-window-group': 14 })
  assert.deepEqual(imported.authoredArtwork, [{ type: 'text', text: 'RP', center: [4.5, 4.5], size: .455,
    color: '#ffa852', opacity: 188, outlineColor: '#f77c00', outlineThickness: .01, offsetY: .07 }])

})

test('#547 preserves CS1G authored shape artwork without dropping its active rules', async () => {
  const source = fixture.examples.find(example => example.issue === 547)
  assert.ok(source)

  const imported = await detectPuzzle(source.code)
  const artwork = imported.authoredArtwork

  assert.equal(imported.title, 'Thank RP you')
  assert.ok(artwork)
  assert.equal(artwork.length, 405)
  assert.equal(validAuthoredArtwork(artwork), true)
  assert.deepEqual(artwork.reduce<Record<string, number>>((counts, mark) => {
    if (mark.type === 'tile') counts[mark.color] = (counts[mark.color] ?? 0) + 1
    return counts
  }, {}), { '#be3c04': 81, '#f15d1e': 164, '#2142ff': 160 })
  assert.deepEqual(imported.variant?.puzzle.rules?.reduce<Record<string, number>>((counts, rule) => {
    counts[rule.type] = (counts[rule.type] ?? 0) + 1
    return counts
  }, {}), { palindrome: 5, entropic: 10, kropki: 2 })

  const caseInsensitive = await detectPuzzle(source.code.toUpperCase())
  assert.deepEqual(caseInsensitive.authoredArtwork, artwork)
  assert.deepEqual(caseInsensitive.variant?.puzzle, imported.variant?.puzzle)

  assert.ok(imported.variant)
  const game = {
    ...makeGame('coach-cs1g', imported.title ?? 'Thank RP you', imported.givens, 'imported', 1),
    variant: { ...imported.variant, solution: '123456789'.repeat(9) }, authoredArtwork: artwork,
  }
  assert.deepEqual(readGame(game.id, JSON.stringify(game))?.authoredArtwork, artwork)
  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    const definition = puzzleDefinitionForSharing(game)
    const { id } = await api<{ id: string }>('shares', 'POST', definition)
    assert.deepEqual((await api<{ authoredArtwork: typeof artwork }>(`shares/${id}`)).authoredArtwork, artwork)
  } finally { sqlite.close() }
})

test('#543 and #546 import their Aqre shading, regions, and companion clues', async () => {
  const snake = fixture.examples.find(example => example.issue === 543)
  const aqrePlus = fixture.examples.find(example => example.issue === 546)
  assert.ok(snake && aqrePlus)
  const snakeData = await decodeSudokuCoachPayload(snake.code)
  const plusData = await decodeSudokuCoachPayload(aqrePlus.code)
  const parsedSnake = await readReviewedCoachAqre(snake.code, snakeData)
  const parsedPlus = await readReviewedCoachAqre(aqrePlus.code, plusData)

  assert.ok(parsedSnake && parsedPlus)
  assert.equal(parsedSnake.source.kind, 'aqre-snake')
  assert.equal(parsedSnake.source.givens, snakeData.givenDigits)
  assert.deepEqual(parsedSnake.source.palette, ['orange', 'blue'])
  assert.equal(parsedSnake.source.givenColours.length, 81)
  assert.deepEqual(parsedSnake.source.givenShades.reduce<Record<string, number>>((counts, { color }) => {
    counts[color] = (counts[color] ?? 0) + 1
    return counts
  }, {}), { orange: 9, blue: 7 })
  assert.equal(parsedSnake.source.boundaryPaths.length, 27)
  assert.equal(parsedSnake.source.regions.length, 22)
  assert.deepEqual(parsedSnake.source.regions.flatMap(region => region.count?.type === 'fixed' ? [region.count.value] : []).sort((a, b) => a - b), [0, 0, 0, 0, 2, 4])
  assert.equal(parsedSnake.source.regions.filter(region => region.count?.type === 'digit').length, 15)
  assert.deepEqual(parsedSnake.source.regions.flatMap(region => region.cells).sort((a, b) => a - b), Array.from({ length: 81 }, (_, cell) => cell))
  assert.deepEqual(parsedSnake.source.countLabels.map(({ text }) => text), ['', '4', '0', '2', '0', '0', '0'])
  assert.equal(parsedSnake.source.circleIndicators.length, 15)
  assert.equal(parsedSnake.source.circleIndicators[0].cell, 10)
  assert.deepEqual(parsedSnake.source.otherRules.map(rule =>
    rule && typeof rule === 'object' && 'type' in rule ? String(rule.type) : '').sort(),
  ['difference', 'entropicLine', 'ratio'])
  assert.equal(parsedPlus.source.kind, 'aqre-plus')
  assert.equal(parsedPlus.source.givens, plusData.givenDigits)
  assert.equal(parsedPlus.source.boundaryPaths.length, 18)
  assert.equal(parsedPlus.source.renbanPaths.length, 6)
  assert.equal(parsedPlus.source.regions.length, 16)
  assert.deepEqual(parsedPlus.source.regions.flatMap(region => region.cells).sort((a, b) => a - b), Array.from({ length: 81 }, (_, cell) => cell))
  assert.ok(parsedPlus.source.regions.every(region => region.count?.type === 'digit' && region.cells.includes(region.count.cell)))
  assert.deepEqual(parsedPlus.source.regions.map(region => region.count?.type === 'digit'
    ? Number(parsedPlus.source.givens[region.count.cell]) : 0), [3, 2, 1, 3, 4, 3, 2, 1, 6, 2, 2, 3, 4, 3, 2, 1])
  assert.deepEqual(parsedPlus.source.otherRules, [])
  for (const source of [parsedSnake.source, parsedPlus.source]) {
    const puzzle = {
      version: 1 as const,
      givens: source.givens,
      regions: { type: 'partial' as const, regions: [] },
      rules: [{
        type: 'aqre' as const,
        kind: source.kind === 'aqre-plus' ? 'plus' as const : 'snake' as const,
        regions: source.regions.map(({ cells, count }) => ({
          cells,
          ...(count && { count: count.type === 'digit'
            ? { type: 'digit-cell' as const, cell: count.cell }
            : count }),
        })),
        givenShades: source.givenShades.map(({ cell, color }) => ({ cell, shade: color === 'blue' ? 'shaded' as const : 'unshaded' as const })),
      }],
    }
    assert.equal(isPlayablePuzzle('mixed', puzzle), true)
  }
  const importedSnake = await detectPuzzle(snake.code)
  const importedPlus = await detectPuzzle(aqrePlus.code)
  assert.equal(importedSnake.format, 'Sudoku Coach')
  assert.equal(importedPlus.format, 'Sudoku Coach')
  for (const [imported, kind] of [[importedSnake, 'snake'], [importedPlus, 'plus']] as const) {
    const puzzle = imported.variant?.puzzle
    assert.ok(puzzle)
    const aqreRule = puzzle.rules?.find(rule => rule.type === 'aqre')
    assert.equal(aqreRule?.type, 'aqre')
    if (aqreRule?.type === 'aqre') assert.equal(aqreRule.kind, kind)
    assert.equal(puzzle.regions?.type, 'partial')
    assert.deepEqual(puzzle.regions?.type === 'partial' ? puzzle.regions.regions : undefined, [])
  }
  const importedSnakeRules = importedSnake.variant?.puzzle.rules ?? []
  assert.ok(importedSnakeRules.some(rule => rule.type === 'entropic'))
  const importedDots = importedSnakeRules.filter(rule => rule.type === 'kropki')
  assert.ok(importedDots.some(rule => rule.type === 'kropki' && rule.consecutive?.pairs.length))
  assert.ok(importedDots.some(rule => rule.type === 'kropki' && rule.ratioTwo?.pairs.length))
  const importedPlusRules = importedPlus.variant?.puzzle.rules ?? []
  assert.equal(importedPlusRules.filter(rule => rule.type === 'renban').length, 6)
  const importedSnakeAqre = importedSnakeRules.find(rule => rule.type === 'aqre')
  assert.equal(importedSnakeAqre?.type === 'aqre' ? importedSnakeAqre.givenShades.length : -1, 16)
})

test('Aqre import rejects off-grid artwork coordinates instead of changing its regions', async () => {
  const source = fixture.examples.find(example => example.issue === 543)
  assert.ok(source)
  const lineData = await decodeSudokuCoachPayload(source.code)
  const line = (lineData.givenConstraints as Record<string, unknown>[]).find(layer => layer.type === 'cosmeticLine')
  assert.ok(line && Array.isArray(line.segments))
  const lineSegments = line.segments as { cells: number[][] }[]
  lineSegments[0].cells[0][0] += .5
  assert.equal(await readReviewedCoachAqre(source.code, lineData), undefined)

  const labelData = await decodeSudokuCoachPayload(source.code)
  const text = (labelData.givenConstraints as Record<string, unknown>[]).find(layer => layer.type === 'cosmeticText')
  assert.ok(text && Array.isArray(text.segments))
  const textSegments = text.segments as { cells: number[][] }[]
  textSegments[0].cells[0][0] = 9
  assert.equal(await readReviewedCoachAqre(source.code, labelData), undefined)
})

test('Aqre player shades are stored separately, reversible, and sent to the engine', () => {
  const puzzle = {
    version: 1 as const, givens: '0'.repeat(81), regions: { type: 'partial' as const, regions: [] },
    rules: [{ type: 'aqre' as const, kind: 'snake' as const,
      regions: Array.from({ length: 9 }, (_, row) => ({ cells: Array.from({ length: 9 }, (_, col) => row * 9 + col) })),
      givenShades: [{ cell: 0, shade: 'shaded' as const }] }],
  }
  const base = makeGame('aqre-shades', 'Aqre', puzzle.givens, 'imported', 1)
  const game = { ...base, variant: { id: 'mixed' as const, puzzle, solution: '1'.repeat(81) } }
  assert.equal(variantPosition(game.variant, game.position).shades?.[0], '2')
  const shaded = setAqreShade(game, 1, 'shaded')
  assert.equal(shaded.position.shades?.[1], '2')
  assert.equal(setAqreShade(shaded, 0, 'unshaded'), shaded)
  assert.equal(variantPosition(game.variant, shaded.position).shades?.[1], '2')
  const latinCompletion = Array.from({ length: 81 }, (_, cell) =>
    String((Math.floor(cell / 9) + cell % 9) % 9 + 1)).join('')
  const completedShades = [
    '111011101', '101110111', '011101110', '110111011', '111011101',
    '101110111', '011101110', '110111011', '111011101',
  ].join('').replaceAll('1', '2').replaceAll('0', '1')
  const completedDigits = { ...shaded, position: { ...shaded.position, entries: latinCompletion, shades: completedShades } }
  assert.equal(isSolved(completedDigits), true)
  assert.equal(isSolved({ ...completedDigits, position: { ...completedDigits.position, shades: '0'.repeat(81) } }), false)
  assert.equal(isSolved({ ...completedDigits, position: { ...completedDigits.position, shades: '2'.repeat(81) } }), false)
})

test('#545 imports authored neighbor-match clues with calibrated text positions', async () => {
  const source = fixture.examples.find(example => example.issue === 545)
  assert.ok(source)
  assert.equal(source.sourceDescription, 'Each given clue number indicates that the digit must match at least one of its orthogonal neighbors. Thanks to Raumplaner for introducing my to this constraint!')
  const data = await decodeSudokuCoachPayload(source.code)
  const parsed = await readReviewedCoachTextClues(source.code, data)
  assert.ok(parsed)
  assert.deepEqual(parsed.source.settings, {
    gridResolution: 4, positionVerticalOffset: 8, colour: '#ff8080', textSize: 39,
  })
  assert.equal(parsed.source.givens, '0'.repeat(81))
  assert.equal(parsed.source.clues.length, 17)
  assert.deepEqual(parsed.source.clues[0], { point: [8.125, 3.75], text: '6' })
  assert.deepEqual(parsed.source.clues.at(-1), { point: [5.125, 2.75], text: '8' })
  assert.deepEqual(parsed.source.otherRules.map(rule =>
    rule && typeof rule === 'object' && 'type' in rule ? String(rule.type) : ''), ['entropicLine'])
  assert.deepEqual(parsed.rule.clues[0], { cell: 35, digit: 6 })
  assert.deepEqual(parsed.rule.clues.at(-1), { cell: 23, digit: 8 })
  assert.deepEqual(parsed.artwork[0], {
    type: 'text', center: [8.125, 3.75], text: '6', size: .195, color: '#ff8080', opacity: 255,
    outlineColor: '#ff8080', outlineThickness: 0, offsetY: .08,
  })
  const imported = await detectPuzzle(source.code)
  assert.equal(imported.title, 'Raumploximentroplaner')
  assert.equal(imported.givens, parsed.source.givens)
  assert.equal(imported.authoredArtwork?.length, 17)
  assert.deepEqual(imported.variant?.puzzle.rules.filter(rule => rule.type === 'neighbor-match'), [parsed.rule])
})

test('#542 recognizes case-insensitive Base32hex and rejects changed puzzle data', async () => {
  const source = fixture.examples.find(example => example.issue === 542)
  assert.ok(source)
  const original = await detectPuzzle(source.code)
  const upperCase = await detectPuzzle(source.code.toUpperCase())
  assert.deepEqual(upperCase.variant?.puzzle, original.variant?.puzzle)

  const changed = source.code.slice(0, 10) + (source.code[10] === '0' ? '1' : '0') + source.code.slice(11)
  await assert.rejects(detectPuzzle(changed))
})
