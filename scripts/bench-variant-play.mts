import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { arch, platform } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { STARTER } from '../src/sudoku/formats.ts'
import { conflictsOf, enter, fillEntries, makeGame, type Game } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantDigitExclusions } from '../src/sudoku/variants.ts'
import { mixedFixtures } from '../tests/helpers/mixed-fixtures.ts'

const [baselineCheckout] = process.argv.slice(2)
assert.ok(baselineCheckout, 'Pass a checkout of the baseline app.')
const old = await import(pathToFileURL(resolve(baselineCheckout, 'src/sudoku/game.ts')).href) as typeof import('../src/sudoku/game.ts')
const { variantDigitExclusions: oldExclusions } = await import(
  pathToFileURL(resolve(baselineCheckout, 'src/sudoku/variants.ts')).href) as typeof import('../src/sudoku/variants.ts')
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../tests/fixtures/${name}.json`, import.meta.url), 'utf8'))
type Source = { url: string; code: string; solution: string }
const sources: Source[] = [
  ...fixture('whispers-coach').examples.filter(({ solution }: Source) => solution),
  ...fixture('global-entropy-coach').examples.filter(({ url }: Source) => url.endsWith('/K95q')),
]
const classicSolution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
const samples = [{
  name: 'Classic', givens: STARTER, solution: classicSolution, variant: undefined,
}, ...await Promise.all(sources.map(async source => {
  const { givens, variant } = await detectPuzzle(source.code)
  assert.ok(variant)
  return { name: source.url.split('/').at(-1)!, givens, solution: source.solution, variant }
})), ...Object.entries(mixedFixtures).map(([name, { puzzle, solution }]) => ({
  name, givens: puzzle.givens, solution, variant: { id: 'mixed' as const, puzzle },
}))]

// The paired lookup comparison also covers cross-layer exemptions and Clone closure.
const combined: VariantRule[] = [
  { type: 'kropki', consecutive: { pairs: [[0, 1]], negative: true } },
  { type: 'kropki', ratioTwo: { pairs: [[1, 10]], negative: true } },
  { type: 'xv', five: { pairs: [[0, 9]], negative: true } },
  { type: 'xv', ten: { pairs: [[9, 18]], negative: true } },
  { type: 'adjacent-total', cells: [2, 11], sum: 5 },
  { type: 'adjacent-total', cells: [11, 20], sum: 10 },
  { type: 'non-consecutive', except: [[0, 1]] },
  { type: 'whispers', cells: [0, 9, 18, 10, 0], minDifference: 5 },
  { type: 'whispers', cells: [9, 18], minDifference: 3 },
  { type: 'entropic', cells: [1, 2, 11, 20, 1] },
  { type: 'modular', cells: [8, 17, 16, 15] },
  { type: 'renban', cells: [28, 38, 48, 58] },
  { type: 'palindrome', cells: [28, 29, 30, 31, 40] },
  { type: 'inequality', less: 0, greater: 1 },
  { type: 'clone', groups: [[1, 27], [27, 62]] },
]
const puzzles: (VariantPuzzle | undefined)[] = [...samples.map(sample => sample.variant?.puzzle),
  ...[combined, [...combined].reverse()].map(rules => ({ version: 1 as const, givens: '0'.repeat(81), rules }))]
for (const puzzle of puzzles) for (let from = 0; from < 81; from++) for (let to = 0; to < 81; to++) {
  for (let digit = 1; digit <= 9; digit++) {
    assert.equal(variantDigitExclusions(puzzle, from, to, digit), oldExclusions(puzzle, from, to, digit))
  }
}
console.log(JSON.stringify({ node: process.version, platform: platform(), arch: arch(), comparedExclusionMasks: puzzles.length * 81 * 81 * 9 }))

type Play = Pick<typeof old, 'conflictsOf' | 'enter' | 'fillEntries'>
const current = { conflictsOf, enter, fillEntries }

function compare(label: string, test: (play: Play, round: number) => unknown, count = 160) {
  for (let i = 0; i < 35; i++) assert.deepEqual(test(current, i), test(old, i), label)
  const times: [number[], number[]] = [[], []]
  for (let round = 0; round < count; round++) {
    for (const index of round % 2 ? [1, 0] as const : [0, 1] as const) {
      const start = performance.now()
      test(index ? current : old, round)
      times[index].push(performance.now() - start)
    }
  }
  const stats = times.map(values => {
    values.sort((a, b) => a - b)
    return { medianMs: values[Math.floor(values.length * .5)], p95Ms: values[Math.ceil(values.length * .95) - 1] }
  })
  console.log(JSON.stringify({ label, samples: count, baseline: stats[0], candidate: stats[1] }))
}

for (const { name, givens, solution, variant } of samples) {
  const game: Game = { ...makeGame(name, name, givens, 'imported', 0), variant: variant && { ...variant, solution } }
  assert.ok(/^[1-9]{81}$/.test(solution))
  const values = [...givens].map((digit, cell) => digit === '0' && cell % 2 ? solution[cell] : digit).join('')
  const wrong = [...values].map((digit, cell) => cell % 13 === 0 && digit !== '0' ? String(Number(digit) % 9 + 1) : digit).join('')
  game.position.center.fill(511)
  game.position.corner.fill(511)
  const editable = [...values].flatMap((digit, cell) => digit === '0' ? [cell] : [])
  game.position.entries = [...values].map((digit, cell) => givens[cell] === '0' ? digit : '0').join('')
  const noPencil: Game = { ...game, position: { ...game.position, center: Array(81).fill(0), corner: Array(81).fill(0) } }
  const fill = [...values].map((digit, cell) => cell % 4 === 0 ? solution[cell] : digit).join('')
  compare(`${name} opening conflicts`, play => play.conflictsOf(givens, variant?.puzzle))
  compare(`${name} midgame conflicts`, (play, i) => play.conflictsOf(i % 2 ? values : wrong, variant?.puzzle))
  compare(`${name} digit entry`, (play, i) => {
    const cell = editable[i % editable.length]
    return play.enter(game, [cell], 'value', Number(solution[cell]))
  })
  compare(`${name} digit entry without candidates`, (play, i) => {
    const cell = editable[i % editable.length]
    return play.enter(noPencil, [cell], 'value', Number(solution[cell]))
  })
  compare(`${name} bulk fill`, play => play.fillEntries(game, fill))
  if (variant?.puzzle.rules) {
    const { puzzle } = variant
    compare(`${name} fresh midgame conflicts`, (play, i) =>
      play.conflictsOf(i % 2 ? values : wrong, { ...puzzle, rules: [...puzzle.rules!] }), 80)
  }
}

const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
const cmdt = samples.find(sample => sample.name === 'Cmdt')?.variant?.puzzle
if (gc && cmdt?.rules) {
  const rules = cmdt.rules
  for (const [implementation, exclusions] of [['baseline', oldExclusions], ['candidate', variantDigitExclusions]] as const) {
    const puzzles = Array.from({ length: 2000 }, () => ({ ...cmdt, rules: [...rules] }))
    gc()
    gc()
    const before = process.memoryUsage().heapUsed
    for (const puzzle of puzzles) exclusions(puzzle, 0, 1, 4)
    gc()
    gc()
    const retainedBytes = process.memoryUsage().heapUsed - before
    console.log(JSON.stringify({ fixture: 'Cmdt', implementation, definitions: puzzles.length, bytesPerDefinition: retainedBytes / puzzles.length }))
  }
}
