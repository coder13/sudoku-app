import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { inflateSync } from 'node:zlib'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { bit, checkLatin, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { pillArrowRule } from '../src/latin/pill-arrow.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const solution = Array.from('1234214334124321', Number)
const givens = '0034004334124321'
const swap = Array.from('2134124334124321', Number)
const cells = [11, 10, 5, 2, 3, 6]
const pill = { type: 'pillArrow', settings: { bulbBorderThickness: 25, arrowHeadLength: 20 },
  segments: [{ cells, parameters: {} }] }
const cage = { type: 'cosmeticCage', segments: [{ cells: [12, 13], parameters: { sum: '7+' } }] }
const source = (givenConstraints: readonly unknown[], userDigits?: string) =>
  coachCode({ gridSize: 4, regions: [], givenDigits: givens, givenConstraints, userDigits })

test('Pill Arrow support agrees with direct sums and preserves both bulb digits', () => {
  let random = 41
  for (const [first, second] of [[0, 1], [1, 0], [0, 9], [9, 0]]) {
    const shaft = [18, 19, 20, 21, 22, 23, 24]
    const positions = [first, second, ...shaft]
    const rule = pillArrowRule(9, positions)
    for (const tens of [1, 3, 6, 8]) for (let sample = 0; sample < 16; sample++) {
      const choices = positions.map(cell => {
        if (cell === Math.min(first, second)) return [tens, tens + 1]
        return [...new Set([0, 1, 2].map(() => {
          random = (Math.imul(random, 1664525) + 1013904223) >>> 0
          return 1 + (random >>> 20) % 9
        }))]
      })
      const domains = Array<number>(81).fill(0)
      choices.forEach((digits, index) => { domains[positions[index]] = digits.reduce((mask, value) => mask | bit(value), 0) })
      const supported = positions.map(() => 0)
      const chosen: number[] = []
      function enumerate(index: number, sum: number) {
        if (index === positions.length) {
          const target = first < second ? 10 * chosen[0] + chosen[1] : 10 * chosen[1] + chosen[0]
          if (sum === target) chosen.forEach((digit, position) => { supported[position] |= bit(digit) })
          return
        }
        for (const digit of choices[index]) {
          chosen[index] = digit
          enumerate(index + 1, index < 2 ? sum : sum + digit)
        }
      }
      enumerate(0, 0)
      assert.deepEqual(rule.support(domains), supported[0] ? supported : null)
    }
  }
  for (const total of [32, 64, 99]) {
    const length = Math.ceil(total / 9)
    const arrow = [1, 0, ...Array.from({ length }, (_, index) => index + 2)]
    const domains = [bit(Math.floor(total / 10)), bit(total % 10), ...Array<number>(length - 1).fill(bit(9)), 511]
    const support = pillArrowRule(9, arrow).support(domains)
    assert.equal(support?.at(-1), bit(total - 9 * (length - 1)))
  }
})

test('a reversed pill reads left to right in both games and survives portable Play links', async () => {
  const base = (await detectPuzzle(source([]))).futoshiki!.puzzle
  assert.equal(solveLatin(base).status, 'multiple')
  assert.equal(checkLatin(base, swap).complete, true)

  const futo = await preparePlayableImport(source([pill]))
  assert.ok('futoshiki' in futo)
  const c = await preparePlayableImport(source([cage, pill], '1000000000000000'))
  assert.ok('calcudoku' in c)
  const calc = readImportedCalcudoku(c.calcudoku.id)!
  assert.equal(calc.initialPosition?.values[0], 1)
  for (const { puzzle } of [readImportedFutoshiki(futo.futoshiki.id)!, calc]) {
    assert.deepEqual(puzzle.pathClues, [{ type: 'pill-arrow', cells }])
    const exact = solveLatin(puzzle)
    assert.equal(exact.status, 'unique')
    assert.deepEqual(exact.solution, solution)
    assert.deepEqual(checkLatin(puzzle, swap).conflicts.map(rule => [rule.kind, rule.cells]), [['pill-arrow', cells]])
    const move = findLatinSolutionHints(puzzle, []).find(hint => hint.cell === 5)
    const proof = move?.rules.find(rule => rule.kind === 'pill-arrow')
    assert.equal(move?.value, 1)
    assert.deepEqual(proof?.cells, cells)
    assert.match(proof!.label, /R3C3 to R3C4/)
  }
})

test('published horizontal and vertical Pill Arrows retain their shaft arithmetic', async () => {
  const examples = JSON.parse(readFileSync(new URL('./fixtures/coach-clue-styles.json', import.meta.url), 'utf8'))
  const { code, solution } = examples.find((example: { id: string }) => example.id === 'HBLt')
  const bits = [...(code as string).slice('SCv7_32_'.length)].map(char => Number.parseInt(char, 32).toString(2).padStart(5, '0')).join('')
  const raw = JSON.parse(inflateSync(Buffer.from(bits.match(/.{8}/g)!.map(byte => Number.parseInt(byte, 2)))).toString())
  const layer = raw.givenConstraints.find((layer: { type: string }) => layer.type === 'pillArrow')
  const imported = await detectPuzzle(coachCode({ gridSize: 9, regions: [], givenDigits: solution, givenConstraints: [layer] }))
  const puzzle = imported.futoshiki!.puzzle
  assert.deepEqual(puzzle.pathClues?.map(clue => clue.cells), [[40, 41, 49, 48, 39, 29, 28], [60, 69, 68, 59, 58, 67]])
  assert.equal(checkLatin(puzzle, []).complete, true)
})

test('invalid Pill Arrow paths and unsupported settings are rejected', async () => {
  for (const path of [[1, 0, 2], [1, 0, 2, 1, 5], [1, 0, 2, 16], [1, 0, 2, 2.5]]) {
    await assert.rejects(detectPuzzle(source([{ ...pill, segments: [{ cells: path }] }])), /invalid line clues/)
  }
  await assert.rejects(detectPuzzle(source([{ ...pill, settings: { sumMultiplier: 2 } }])), /pillArrow uses unsupported settings/)
})
