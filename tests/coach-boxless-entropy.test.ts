import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { inflateSync } from 'node:zlib'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { checkLatin, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { latinGlobalEntropyRules } from '../src/latin/global-entropy.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const { examples } = JSON.parse(readFileSync(new URL('./fixtures/global-entropy-coach.json', import.meta.url), 'utf8'))
const bento = examples.find((example: { url: string }) => example.url.endsWith('FLAb'))
const bits = [...(bento.code as string).slice('SCv7_32_'.length)]
  .map(character => Number.parseInt(character, 32).toString(2).padStart(5, '0')).join('')
const encoded = Buffer.from(bits.match(/.{8}/g)!.map(byte => Number.parseInt(byte, 2)))
const source = JSON.parse(inflateSync(encoded).toString('utf8'))
const entropyLayer = source.givenConstraints.find((layer: { type: string }) => layer.type === 'globalEntropy')
const regionLayers = source.givenConstraints.filter((layer: { type: string }) => layer.type === 'region')
const open = [37, 39, 46, 48]
const solution = Array.from(bento.solution as string, Number)
const givens = solution.map((digit, cell) => open.includes(cell) ? 0 : digit)
const swapped = solution.map((digit, cell) => open.includes(cell) ? 12 - digit : digit)
const failingArea = [28, 29, 37, 38]

test('the support table agrees with direct band assignments for every four-cell domain pattern', () => {
  const rules = latinGlobalEntropyRules(9, true)
  assert.equal(rules.length, 64)
  assert.deepEqual(rules[0].cells, [0, 1, 9, 10])
  assert.deepEqual(rules[18].cells, [20, 21, 29, 30])
  assert.deepEqual(rules.at(-1)?.cells, [70, 71, 79, 80])
  const rule = rules[0]
  const [a, b, c, d] = rule.cells
  const domains = Array<number>(81).fill(0)
  const rank = [1, 2, 4]
  const digitBands = Array.from({ length: 8 }, (_, groups) => rank.reduce((digits, band, index) =>
    groups & band ? digits + 7 * 8 ** index : digits, 0))
  const groups = rank.flatMap(first => rank.flatMap(second => rank.flatMap(third =>
    rank.map(fourth => [first, second, third, fourth])))).filter(assignment => new Set(assignment).size === 3)
  for (let pattern = 0; pattern < 4096; pattern++) {
    const candidates = [pattern % 8, Math.floor(pattern / 8) % 8, Math.floor(pattern / 64) % 8, Math.floor(pattern / 512)]
    const possible = groups.filter(assignment => assignment.every((group, cell) => candidates[cell] & group))
    const expected = possible.length ? candidates.map((_, cell) => digitBands[possible.reduce((mask, assignment) => mask | assignment[cell], 0)]) : null
    rule.cells.forEach((cell, index) => { domains[cell] = digitBands[candidates[index]] })
    assert.deepEqual(rule.support(domains), expected, 'group pattern ' + pattern)
  }
  domains[a] = 16 | 1
  domains[b] = 256
  domains[c] = 16
  domains[d] = 8
  assert.deepEqual(rule.support(domains), [1, 256, 16, 8])
})

test('the Bento entropy layer distinguishes two boxless completions with the same authored regions', async () => {
  // Isolate Global Entropy in a small regression from the published answer and regions.
  const input = (layers: readonly unknown[]) => coachCode({
    gridSize: 9, regions: [], givenDigits: givens.join(''), givenConstraints: layers,
  })
  const without = (await detectPuzzle(input(regionLayers))).futoshiki!.puzzle
  assert.equal(solveLatin(without).status, 'multiple')
  assert.equal(checkLatin(without, swapped).complete, true)

  const imported = await preparePlayableImport(input([...regionLayers, entropyLayer, entropyLayer]))
  assert.ok('futoshiki' in imported)
  assert.equal(imported.futoshiki.id.match(/\.e1/g)?.length, 1)
  const restored = readImportedFutoshiki(imported.futoshiki.id)!
  assert.deepEqual(restored.puzzle.extraRegions, without.extraRegions)
  assert.equal(restored.puzzle.globalEntropy, true)
  const exact = solveLatin(restored.puzzle)
  assert.equal(exact.status, 'unique')
  assert.deepEqual(exact.solution, solution)
  assert.deepEqual(checkLatin(restored.puzzle, swapped).conflicts.map(rule => rule.cells), [failingArea])

  const hints = findLatinSolutionHints(restored.puzzle, [])
  assert.equal(hints.length, open.length)
  const move = hints.find(hint => hint.cell === 37)
  assert.deepEqual(move?.rules.find(rule => rule.kind === 'global-entropy')?.cells, failingArea)
  const values = Array<number>(81).fill(0)
  for (const { cell, value } of hints) {
    assert.equal(value, solution[cell])
    values[cell] = value
  }
  assert.equal(checkLatin(restored.puzzle, values).complete, true)
  assert.equal(readImportedFutoshiki(restored.id.replace('.e1', '.e0')), undefined)
})

test('the complete Bento export explains its published answer from an empty grid', async () => {
  const imported = await preparePlayableImport(bento.code)
  assert.ok('futoshiki' in imported)
  const restored = readImportedFutoshiki(imported.futoshiki.id)!
  assert.equal(restored.annotations?.authoredPaths?.length, 3)
  assert.equal(restored.initialPosition, undefined)
  const puzzle = restored.puzzle
  assert.equal(puzzle.globalEntropy, true)
  assert.equal(puzzle.extraRegions?.length, 3)
  assert.equal(puzzle.adjacentClues?.marks.length, 24)
  assert.deepEqual(puzzle.pathClues?.map(line => line.type), ['arrow', 'pill-arrow'])
  assert.deepEqual(puzzle.pathClues?.[1].cells, [6, 7, 17, 26, 25, 24])
  assert.equal(puzzle.whispers?.length, 1)
  assert.deepEqual(puzzle.quadruples, [
    { topLeft: 4, digits: [1] }, { topLeft: 3, digits: [2] }, { topLeft: 13, digits: [3] }, { topLeft: 12, digits: [4] },
  ])
  assert.deepEqual(solveLatin(puzzle).solution, solution)

  const values = Array<number>(81).fill(0)
  for (let remaining = values.length; remaining > 0;) {
    const moves = findLatinSolutionHints(puzzle, values)
    assert.ok(moves.length)
    for (const { cell, value } of moves) {
      assert.equal(values[cell], 0)
      assert.equal(value, solution[cell])
      values[cell] = value
      remaining--
    }
  }
  assert.equal(checkLatin(puzzle, values).complete, true)
})

test('Calcudoku combines Global Entropy with arithmetic, source progress and portable play', async () => {
  const userDigits = Array<string>(81).fill('0')
  userDigits[39] = String(solution[39])
  const cage = { type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '8+' } }] }
  const input = coachCode({
    gridSize: 9, regions: [], givenDigits: givens.join(''), userDigits: userDigits.join(''),
    givenConstraints: [cage, regionLayers[0], entropyLayer],
  })
  const imported = await preparePlayableImport(input)
  assert.ok('calcudoku' in imported)
  const restored = readImportedCalcudoku(imported.calcudoku.id)!
  assert.equal(restored.puzzle.globalEntropy, true)
  assert.equal(restored.initialPosition?.values[39], solution[39])
  assert.ok(restored.puzzle.cages.some(cage => cage.target === 8 && cage.cells[0] === 0 && cage.cells[1] === 1))
  assert.deepEqual(solveLatin(restored.puzzle).solution, solution)
  assert.deepEqual(checkLatin(restored.puzzle, swapped).conflicts.map(rule => rule.cells), [failingArea])
  assert.equal(readImportedCalcudoku(restored.id.replace('.e1', '.e2')), undefined)
})

test('Global Entropy rejects unsupported group settings, cells and grids', async () => {
  const input = (layer: unknown, gridSize = 9) => coachCode({ gridSize, regions: [], givenConstraints: [layer] })
  await assert.rejects(detectPuzzle(input({ ...entropyLayer, settings: { groups: [2, 3, 4] } })), /unsupported settings/)
  await assert.rejects(detectPuzzle(input({ ...entropyLayer, segments: [{ cells: failingArea }] })), /unsupported cells/)
  for (const size of [4, 7]) await assert.rejects(detectPuzzle(input(entropyLayer, size)), /Global Entropy needs a 9 × 9 grid/)
})
