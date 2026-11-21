import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import worker from '../cloudflare/pages/_worker.js'
import { readImportedCalcudoku } from '../src/calcudoku/imported.ts'
import { readImportedFutoshiki } from '../src/futoshiki/imported.ts'
import { bit, checkLatin, findLatinHint, findLatinHints, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { latinPathRules } from '../src/latin/path-clues.ts'
import { numberSolution } from '../src/number-puzzles/solution.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { preparePlayableImport } from '../src/sudoku/puzzle-preview.ts'
import { coachCode } from './helpers/coach-code.ts'

const { examples } = JSON.parse(readFileSync(new URL('./fixtures/modular-coach.json', import.meta.url), 'utf8'))
const source = examples.find(({ url }: { url: string }) => url.endsWith('/7hzU'))
const modular = [[0, 5, 11, 16, 15], [17, 18, 13, 7, 2]]
const entropic = [[0, 1], [7, 6], [11, 12], [21, 22]]
const answer = Array.from(source.solution as string, Number)
const givens = '0000000000000050000000000'

test('the original 5 × 5 Coach short link and export keep all six paths and Anti-King', async ({ mock }) => {
  const publication = {
    sudoku_id: '7hzU', sudoku: source.code, name: source.title,
    description: source.description, blocked: false, custom_constraints: false,
  }
  let specificSudoku = publication
  mock.method(globalThis, 'fetch', (url: string) => url === source.url
    ? Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>'))
    : worker.fetch(new Request(new URL(url, 'https://sudoku.example')), {}, {}))

  const short = await preparePlayableImport(source.url)
  const exported = await preparePlayableImport(source.code)
  assert.ok('futoshiki' in short && 'futoshiki' in exported)
  assert.equal(short.futoshiki.id, exported.futoshiki.id)
  const restored = readImportedFutoshiki(short.futoshiki.id)
  assert.ok(restored)
  const { puzzle } = restored
  assert.equal(puzzle.antiKing, true)
  assert.deepEqual(puzzle.pathClues, [
    ...modular.map(cells => ({ type: 'modular', cells })),
    ...entropic.map(cells => ({ type: 'entropic', cells })),
  ])
  for (const kind of ['modular', 'entropic', 'anti-king']) {
    const rules = puzzle.rules.filter(rule => rule.kind !== kind)
    assert.equal(solveLatin({ ...puzzle, rules }).status, 'multiple', kind)
  }
  const exact = solveLatin(puzzle)
  assert.equal(exact.status, 'unique')
  assert.deepEqual(exact.solution, answer)

  const opening = findLatinHint(puzzle, [])
  assert.deepEqual([opening?.cell, opening?.value], [11, 3])
  assert.ok(opening?.trace?.every(branch => branch.steps.some(step => /Modular Line|Entropic Line/.test(step))))
  assert.ok(opening?.trace?.some(branch => branch.steps.some(step => step.includes('touch at a corner'))))
  const replay = numberSolution({
    check: values => checkLatin(puzzle, values),
    hints: values => findLatinHints(puzzle, values),
    solutionHints: values => findLatinSolutionHints(puzzle, values),
    solve: () => null,
  }, puzzle.givens.map(value => value === 0))
  assert.equal(replay.complete, true)
  assert.equal(replay.steps.length, 24)
  assert.ok(replay.steps.every(step => step && step.value === answer[step.cell]))
  const final = replay.positions.at(-1)!.map((digit, cell) => puzzle.givens[cell] || digit)
  assert.deepEqual(final, answer)
  assert.ok(replay.steps.some(step => step?.rules.some(rule => rule.kind === 'modular')))

  for (const changed of [
    { description: source.description + '\nEvery row starts with an odd digit.' },
    { custom_constraints: true },
    { sudoku: coachCode({ gridSize: 5, regions: [], givenDigits: answer.join('') }) },
  ]) {
    specificSudoku = { ...publication, ...changed }
    await assert.rejects(detectPuzzle(source.url), /author instructions/)
  }
})

test('Calcudoku restores Modular Lines, shared edges, a numbered cage, and player progress', async () => {
  const withPaths = (type: string, paths: number[][]) => ({ type, segments: paths.map(cells => ({ cells })) })
  const input = coachCode({
    gridSize: 5, regions: [], givenDigits: givens, userDigits: '5' + givens.slice(1),
    givenConstraints: [
      { type: 'antiKing', segments: [] },
      { type: 'cosmeticCage', segments: [{ cells: [0, 1], parameters: { sum: '7+' } }] },
      withPaths('modularLine', [...modular, [7, 6]]), withPaths('entropicLine', entropic),
    ],
  })
  const preview = await preparePlayableImport(input)
  assert.ok('calcudoku' in preview)
  const restored = readImportedCalcudoku(preview.calcudoku.id)
  assert.ok(restored)
  assert.equal(restored.initialPosition?.values[0], 5)
  assert.equal(restored.puzzle.cages[0].target, 7)
  assert.equal(restored.puzzle.pathClues?.length, 7)
  assert.deepEqual(solveLatin(restored.puzzle).solution, answer)
  assert.equal(checkLatin(restored.puzzle, answer).complete, true)
  const conflicting = Array<number>(25).fill(0)
  conflicting[0] = 2
  conflicting[5] = 5
  assert.ok(checkLatin(restored.puzzle, conflicting).conflicts.some(rule => rule.kind === 'modular'))
})

test('Modular Line supports match digit enumeration for short paths and repeated cells', () => {
  const representative = [1, 2, 3]
  const choices = Array.from({ length: 8 }, (_, mask) => representative.filter(digit => mask & bit(digit)))
  for (const cells of [[0, 1], [0, 1, 2], [0, 1, 2, 3], [0, 1, 2, 0], [0, 1, 2, 1], [0, 0]]) {
    const [rule] = latinPathRules(9, [{ type: 'modular', cells }])
    const distinct = [...new Set(cells)]
    for (let mask = 0; mask < 8 ** distinct.length; mask++) {
      const digits = distinct.map((_, index) => choices[(mask >> (3 * index)) & 7])
      const supported = digits.map(() => 0)
      const visit = (selected: number[]) => {
        if (selected.length < distinct.length) {
          for (const digit of digits[selected.length]) visit([...selected, digit])
          return
        }
        const groups = cells.map(cell => selected[distinct.indexOf(cell)] % 3)
        if (groups.some((value, index) => groups[index + 1] === value || groups[index + 2] === value)) return
        selected.forEach((digit, index) => { supported[index] |= bit(digit) })
      }
      visit([])
      const domains = digits.map(list => list.reduce((result, digit) => result | bit(digit), 0))
      assert.deepEqual(rule.support(domains), supported[0] ? supported : null)
    }
  }
  const [rule] = latinPathRules(5, [{ type: 'modular', cells: [0, 1, 2, 3] }])
  assert.deepEqual(rule.support([bit(1) | bit(4), bit(2), bit(3), bit(4) | bit(5)]),
    [bit(1) | bit(4), bit(2), bit(3), bit(4)])
})

test('invalid active Modular Line parameters, paths, and tokens are rejected', async () => {
  const layer = { type: 'modularLine', segments: [{ cells: [0, 1] }] }
  const input = (givenConstraints: unknown[]) => coachCode({ gridSize: 5, regions: [], givenConstraints })
  await assert.rejects(detectPuzzle(input([{ ...layer, settings: { modulus: 4 } }])), /Modular line uses unsupported settings/)
  for (const segments of [[{ cells: [0, 25] }], [{ cells: [0, 1], parameters: { modulus: 4 } }]]) {
    await assert.rejects(detectPuzzle(input([{ ...layer, segments }])), /invalid Modular path/)
  }
  await assert.rejects(detectPuzzle(input([{ ...layer, segments: [] }])), /no Modular cells/)
  const { futoshiki } = await detectPuzzle(input([layer]))
  assert.ok(futoshiki)
  assert.equal(readImportedFutoshiki(futoshiki.id.replace('.lm', '.lz')), undefined)
})
