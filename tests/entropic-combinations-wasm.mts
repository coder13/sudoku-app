import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHints } from '../src/sudoku/puzzle-help.ts'
import { coachCode } from './helpers/coach-code.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
useWasmWorker()

// Keep the legacy exhaustive 16-family matrix intact. Extend composition with
// each new family, each pair of companions, and the full set of companions.
// This bounds test cost as the catalog grows. These are compatibility witnesses,
// not a claim that every arrangement is feasible or each clue is essential.
test('Entropic composes with every current family, every companion pair and their full inventory', async () => {
  const { cases } = JSON.parse(
    readFileSync(new URL('./fixtures/nonconsecutive-combined.json', import.meta.url), 'utf8')
  )
  const families = [
    'jigsaw',
    'killer-cages',
    'thermometer',
    'kropki',
    'extra-house',
    'diagonal',
    'arrow',
    'anti-knight',
    'quadruple',
    'parity',
    'anti-king',
    'non-consecutive',
    'whispers',
    'palindrome',
    'inequality',
    'xv',
    'adjacent-total',
    'renban',
  ]
  const selections = [
    [],
    ...families.map((f) => [f]),
    ...families.flatMap((a, i) => families.slice(i + 1).map((b) => [a, b])),
    families,
  ]
  assert.equal(selections.length, 173)
  const sourceFamily: Record<string, string> = {
    nonconsecutive: 'non-consecutive',
    antiKing: 'anti-king',
    cage: 'killer-cages',
    thermometer: 'thermometer',
    difference: 'kropki',
    ratio: 'kropki',
    region: 'extra-house',
    diagonalNegative: 'diagonal',
    arrow: 'arrow',
    antiKnight: 'anti-knight',
    quadruple: 'quadruple',
    odd: 'parity',
    even: 'parity',
  }
  const paths = cases.map((sample: { solution: string }) => {
    function find(accept: (digits: number[]) => boolean) {
      const walk: number[] = []
      function visit(): number[] | undefined {
        if (walk.length === 3)
          return accept(walk.map((c) => Number(sample.solution[c]))) ? [...walk] : undefined
        for (let cell = 0; cell < 81; cell++) {
          if (walk.includes(cell)) continue
          const prior = walk.at(-1)
          if (
            prior !== undefined &&
            Math.max(
              Math.abs((prior % 9) - (cell % 9)),
              Math.abs(Math.floor(prior / 9) - Math.floor(cell / 9))
            ) !== 1
          )
            continue
          walk.push(cell)
          const result = visit()
          walk.pop()
          if (result) return result
        }
      }
      const result = visit()
      assert.ok(result)
      return result
    }
    return {
      entropic: find((d) => new Set(d.map((d) => Math.floor((d - 1) / 3))).size === 3),
      renban: find((d) => new Set(d).size === 3 && Math.max(...d) - Math.min(...d) === 2),
      palindrome: find((d) => d[0] === d[2]),
      whispers: find((d) => Math.abs(d[0] - d[1]) >= 5 && Math.abs(d[1] - d[2]) >= 5),
    }
  })
  let valid = 0,
    conflicting = 0
  for (const selection of selections) {
    const enabled = new Set(selection),
      both = enabled.has('diagonal') && enabled.has('anti-knight')
    const index = enabled.has('anti-knight') && !both ? 1 : 0,
      sample = cases[index],
      line = paths[index]
    const edges: [number, number][] = []
    for (let a = 0; a < 81; a++)
      for (const b of [a % 9 < 8 ? a + 1 : -1, a < 72 ? a + 9 : -1]) if (b >= 0) edges.push([a, b])
    const sumPair = (sum: number) =>
      edges.find(([a, b]) => Number(sample.solution[a]) + Number(sample.solution[b]) === sum)!
    const v = sumPair(5),
      x = sumPair(10),
      total = sumPair(15)
    const [less, greater] =
      Number(sample.solution[0]) < Number(sample.solution[1]) ? [0, 1] : [1, 0]
    const rules: VariantRule[] = [
      ...sample.puzzle.rules.filter((r: VariantRule) => enabled.has(r.type)),
      ...(both ? [{ type: 'anti-knight' as const }] : []),
      { type: 'entropic', cells: line.entropic },
      ...(enabled.has('renban') ? [{ type: 'renban' as const, cells: line.renban }] : []),
      ...(enabled.has('palindrome')
        ? [{ type: 'palindrome' as const, cells: line.palindrome }]
        : []),
      ...(enabled.has('whispers')
        ? [{ type: 'whispers' as const, cells: line.whispers, minDifference: 5 }]
        : []),
      ...(enabled.has('inequality') ? [{ type: 'inequality' as const, less, greater }] : []),
      ...(enabled.has('xv')
        ? [{ type: 'xv' as const, five: { pairs: [v] }, ten: { pairs: [x] } }]
        : []),
      ...(enabled.has('adjacent-total')
        ? [{ type: 'adjacent-total' as const, cells: total, sum: 15 }]
        : []),
    ]
    const puzzle: VariantPuzzle = {
      ...sample.puzzle,
      ...(enabled.has('jigsaw') ? {} : { regions: undefined }),
      rules,
    }
    const input = coachCode({
      ...sample.coachData,
      ...(enabled.has('jigsaw') ? {} : { regions: undefined }),
      givenConstraints: [
        ...sample.coachData.givenConstraints.filter((r: { type: string }) =>
          enabled.has(sourceFamily[r.type])
        ),
        ...(both ? [{ type: 'antiKnight', segments: [], settings: {} }] : []),
        {
          type: 'entropicLine',
          settings: {},
          segments: [{ cells: line.entropic, parameters: {} }],
        },
        ...(enabled.has('renban')
          ? [{ type: 'renban', settings: {}, segments: [{ cells: line.renban, parameters: {} }] }]
          : []),
        ...(enabled.has('palindrome')
          ? [
              {
                type: 'palindromeLine',
                settings: {},
                segments: [{ cells: line.palindrome, parameters: {} }],
              },
            ]
          : []),
        ...(enabled.has('whispers')
          ? [
              {
                type: 'whisper',
                settings: {},
                segments: [{ cells: line.whispers, parameters: {} }],
              },
            ]
          : []),
        ...(enabled.has('inequality')
          ? [
              {
                type: 'greaterLess',
                settings: {},
                segments: [{ cells: [less, greater], parameters: {} }],
              },
            ]
          : []),
        ...(enabled.has('xv')
          ? [
              {
                type: 'twoCellSum',
                settings: {},
                segments: [
                  { cells: v, parameters: { sum: 5 } },
                  { cells: x, parameters: { sum: 10 } },
                ],
              },
            ]
          : []),
        ...(enabled.has('adjacent-total')
          ? [
              {
                type: 'twoCellSum',
                settings: {},
                segments: [{ cells: total, parameters: { sum: 15 } }],
              },
            ]
          : []),
      ],
    })
    if (both) {
      await assert.rejects(prepareImportedPuzzle(input), /conflicting givens or rules/)
      conflicting++
      continue
    }
    assertVariantCompletion(puzzle, sample.solution)
    const { game } = await prepareImportedPuzzle(input)
    assert.deepEqual(game.variant!.puzzle, JSON.parse(JSON.stringify(puzzle)))
    assert.equal(game.variant!.solution, sample.solution)
    assert.ok((await puzzleHints(game)).choices.length > 1)
    valid++
  }
  assert.deepEqual({ valid, conflicting }, { valid: 171, conflicting: 2 })
})
