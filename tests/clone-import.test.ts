import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { cloneLayout } from '../src/sudoku/clone.ts'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { isPlayablePuzzle, variantDigitExclusions, variantPeers, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { cloneFPuzzles } from './helpers/clone-export.ts'
import lzString from 'lz-string'

const empty = '0'.repeat(81), bit = (digit: number) => 1 << (digit - 1)
const sources = ['murphy', 'newman'].map(name => JSON.parse(readFileSync(new URL('./fixtures/clone-' + name + '.json', import.meta.url), 'utf8')) as { title: string; puzzle: VariantPuzzle; solution: string; originalOnlineUrl: string; originalOnlineCode: string })
const linked: VariantPuzzle = { version: 1, givens: empty, rules: [
  { type: 'clone', groups: [[0, 40]] }, { type: 'clone', groups: [[80, 40, 16]] },
] }

test('both complete published Clone controls match independently unique printed completions and need Clone', async () => {
  for (const source of sources) {
    const code = '#variant=' + encodeURIComponent(JSON.stringify({ id: 'clone', puzzle: source.puzzle }))
    const imported = await detectPuzzle(code)
    assert.deepEqual(imported.variant, { id: 'clone', puzzle: source.puzzle })
    assertVariantCompletion(source.puzzle, source.solution)
    const counted = countLineSolutions(source.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, source.solution)
    assert.equal(countLineSolutions({ ...source.puzzle, rules: [] }).count, 2)
    assert.equal(conflictsOf(source.solution, source.puzzle).size, 0)
    assert.match(variantRuleDescriptions(source.puzzle).join(' '), /Different letters can contain the same digit/)
    for (const set of cloneLayout(source.puzzle.rules).sets) for (const cell of set.cells) {
      assert.ok(variantRuleDescriptions(source.puzzle).some(text => text.includes('Clone ' + set.label + ':') && text.includes('R' + (Math.floor(cell / 9) + 1) + 'C' + (cell % 9 + 1))))
    }
  }
})

test('Clone validation permits overlapping and unequal-sized equality sets and rejects unknown or malformed semantics', () => {
  assert.ok(isPlayablePuzzle('clone', linked))
  for (const groups of [[], [[]], [[0]], [[0, 0]], [[0, 81]], [[0, -1]], [[0, 1.5]], null, '0,40']) {
    assert.equal(isPlayablePuzzle('clone', { version: 1, givens: empty, rules: [{ type: 'clone', groups }] }), false)
  }
  for (const extra of [{ distinct: true }, { shapes: [[0, 40]] }, { groups: undefined }]) {
    assert.equal(isPlayablePuzzle('clone', { version: 1, givens: empty, rules: [{ type: 'clone', groups: [[0, 40]], ...extra }] }), false)
  }
})

test('typed f-puzzles Clone fields preserve explicit positional matches in raw, compressed and SudokuPad exports', async () => {
  for (const source of sources) {
    const json = JSON.stringify(cloneFPuzzles(source.puzzle)), code = lzString.compressToBase64(json)
    for (const input of [json, code, 'https://f-puzzles.com/?load=' + encodeURIComponent(code), 'https://sudokupad.app/fpuz' + encodeURIComponent(code)]) {
      assert.deepEqual((await detectPuzzle(input)).variant?.puzzle, source.puzzle)
    }
  }
  const payload = { ...cloneFPuzzles(sources[0].puzzle), clone: [{ cells: ['R2C8', 'R1C1'], cloneCells: ['R9C9', 'R5C5'] }] }
  assert.deepEqual((await detectPuzzle(JSON.stringify(payload))).variant!.puzzle.rules, [{ type: 'clone', groups: [[16,80], [0,40]] }])
})

function onlineDefinition(source: typeof sources[number]) {
  const bytes = decodeURIComponent(source.originalOnlineCode).slice(4)
  return JSON.parse(lzString.decompressFromBase64(bytes)!)
}

test('both original colored exports retain their complete corresponding shapes, palette, and givens', async () => {
  for (const [index, source] of sources.entries()) {
    const definition = onlineDefinition(source)
    const fullColors = Object.fromEntries(definition.grid.flat().flatMap((cell: { c?: string }, index: number) =>
      cell.c ? [[index, [cell.c.toLowerCase()]]] : []))
    assert.equal(Object.keys(fullColors).length, index === 0 ? 24 : 28)
    for (const input of [
      JSON.stringify(definition), source.originalOnlineCode,
      'https://f-puzzles.com/?load=' + encodeURIComponent(decodeURIComponent(source.originalOnlineCode).slice(4)),
      'https://sudokupad.app/' + source.originalOnlineCode,
    ]) {
      const imported = await detectPuzzle(input)
      assert.equal(imported.title, definition.title)
      assert.deepEqual(imported.variant, { id: 'clone', puzzle: source.puzzle })
      assert.deepEqual(imported.givenCellColors, fullColors)
    }
  }
})

test('published Clone SudokuPad links resolve the root and author-namespaced exports', async ({ mock }) => {
  const requests: string[] = []
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const path = String(input)
    requests.push(path)
    const source = sources.find(({ originalOnlineUrl }) => {
      const id = originalOnlineUrl!.replace('https://sudokupad.app/', '')
      return path === '/api/v1/import/sudokupad/' + id
    })
    return source ? Response.json({ code: source.originalOnlineCode }) : new Response(null, { status: 404 })
  })

  for (const source of sources) {
    const imported = await detectPuzzle(source.originalOnlineUrl!)
    assert.ok(imported.title?.toLowerCase().includes(source.title.toLowerCase()))
    assert.deepEqual(imported.variant?.puzzle, source.puzzle)
  }
  assert.deepEqual(requests, sources.map(({ originalOnlineUrl }) => {
    const id = originalOnlineUrl!.replace('https://sudokupad.app/', '')
    return '/api/v1/import/sudokupad/' + id
  }))
})

test('colored Clone clues reject mismatched copies, outlines, palettes, and additional rules', async () => {
  const candidate = onlineDefinition(sources[1])
  const parse = (data: unknown) => detectPuzzle(JSON.stringify(data))
  await assert.rejects(parse({ ...candidate, ruleset: candidate.ruleset + '\nAll shaded digits are odd.' }), /custom rules text/)
  const extraOutline = { ...candidate, killercage: [...candidate.killercage, { cells: ['R1C1'] }] }
  await assert.rejects(parse(extraOutline), /Killer cage without a valid sum/)
  candidate.grid[0][0].cArray = ['#00ff00']
  await assert.rejects(parse(candidate), /conflicting cell colors/)
  delete candidate.grid[0][0].cArray
  delete candidate.grid[0][0].c
  await assert.rejects(parse(candidate), /without a matching copy/)

  const murphy = onlineDefinition(sources[0])
  const realCage = { cells: ['R1C1', 'R2C1'], value: String(Number(sources[0].solution[0]) + Number(sources[0].solution[9])) }
  assert.deepEqual((await parse({ ...murphy, killercage: [realCage] })).variant?.puzzle.rules, [
    ...sources[0].puzzle.rules!, { type: 'killer-cages', cages: [{ cells: [0, 9], sum: 7 }] },
  ])
})

test('f-puzzles Clone import rejects missing copies, invalid references and unreadable custom rules', async () => {
  const base = cloneFPuzzles(sources[0].puzzle)
  for (const clone of [false, {}, [{ cells: ['R1C1'] }], [{ cells: [], cloneCells: [] }],
    [{ cells: ['R1C1'], cloneCells: ['R5C5', 'R9C9'] }], [{ cells: ['R1C1'], cloneCells: ['R10C1'] }],
    [{ cells: ['R1C1', 'R1C1'], cloneCells: ['R5C5', 'R9C9'] }], [{ cells: ['R1C1'], cloneCells: ['R5C5'], distinct: true }]]) {
    await assert.rejects(detectPuzzle(JSON.stringify({ ...base, clone })), /invalid Clone|invalid cell reference/)
  }
  await assert.rejects(detectPuzzle(JSON.stringify({ ...base, ruleset: 'Clone digits must also be odd.' })), /custom rules text/)
})

test('transitive Clone restrictions agree with direct complete equality assignments for all partial four-cell states', () => {
  const cells = [0, 40, 80, 16], complete = Array.from({ length: 9 }, (_, i) => Array<number>(4).fill(i + 1))
  for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) for (let c = 0; c <= 9; c++) for (let d = 0; d <= 9; d++) {
    const partial = [a, b, c, d], values = [...empty]
    cells.forEach((cell, i) => { values[cell] = String(partial[i]) })
    const matches = complete.filter(tuple => partial.every((digit, i) => !digit || digit === tuple[i]))
    const expected = matches.reduce((mask, tuple) => mask | bit(tuple[0]), 0)
    for (const cell of cells) {
      const mask = cells.reduce((mask, from, i) => partial[i] ? mask & ~variantDigitExclusions(linked, from, cell, partial[i]) : mask, 511)
      assert.equal(mask, expected, JSON.stringify(partial))
    }
    assert.deepEqual([...conflictsOf(values.join(''), linked)].sort((a, b) => a - b), matches.length ? [] : cells.filter((_, i) => partial[i]).sort((a, b) => a - b))
  }
  assert.equal(variantPeers(linked, 0, 80), false)
  assert.equal(variantDigitExclusions(linked, 0, 79, 4), 0)
})

test('different Clone letters may repeat digits and both Pencil modes retain only the matching digit through reversible individual and bulk input', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'clone', groups: [[0, 40], [16, 80]] }] }
  const values = [...empty]; for (const cell of [0, 40, 16, 80]) values[cell] = '4'
  assert.equal(conflictsOf(values.join(''), puzzle).size, 0)
  const game = { ...makeGame('clone-input', 'Clone', empty, 'imported'), variant: { id: 'clone' as const, puzzle: linked, solution: sources[0].solution } }
  game.position.center = game.position.corner = Array<number>(81).fill(511)
  for (const changed of [enter(game, [0], 'value', 4), fillEntries(game, '4' + empty.slice(1))]) {
    for (const mode of ['center', 'corner'] as const) for (const cell of [40, 80, 16]) assert.equal(changed.position[mode][cell], bit(4))
    assert.equal(changed.position.center[79], 511) // Matching copies are not automatically placed.
    assert.equal(changed.position.center[1], 511 & ~bit(4))
    assert.deepEqual(undo(changed).position, game.position)
    assert.deepEqual(redo(undo(changed)).position, changed.position)
  }
})

test('all eight transforms preserve literal equality coordinates and do not mutate the source', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [{ type: 'clone', groups: [[0, 16, 40, 80]] }] }
  const expected = [[0,16,40,80],[0,64,40,80],[72,70,40,8],[72,10,40,8],[8,10,40,72],[8,70,40,72],[80,64,40,0],[80,16,40,0]]
  for (let symmetry = 0; symmetry < 8; symmetry++) assert.deepEqual(reflectVariant(puzzle, symmetry).rules, [{ type: 'clone', groups: [expected[symmetry]] }])
  assert.deepEqual((puzzle.rules![0] as Extract<VariantRule, { type: 'clone' }>).groups, [[0,16,40,80]])
})
