import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { enter, redo, undo } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { parsePuzzleExport, puzzleExportText } from '../src/sudoku/puzzle-sharing.ts'
import { variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'
import { publishFixture } from './helpers/shared-puzzle.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const mixedCoachSources = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-mixed-rules.json', import.meta.url), 'utf8')) as {
  url: string
  title: string
  author: string
  coach: string
  solution: string
}[]

test('negative Coach Ratio layers with custom values only negate the default 2:1 ratio', async () => {
  const imported = await detectPuzzle(coachCode({ givenConstraints: [
    { type: 'ratio', settings: { negativeConstraint: true }, segments: [
      { cells: [0, 1], parameters: { ratio: 2 } },
      { cells: [1, 2], parameters: { ratio: 3 } },
    ] },
  ] }))
  assert.ok(imported.variant)
  const position = variantPosition(imported.variant, { entries: '0001' + '0'.repeat(77) })
  const candidates = await runEngine({ type: 'variant', operation: 'candidates', position })
  assert.ok(candidates)
  assert.ok(candidates[4] & (1 << 2), 'an unmarked 1:3 edge remains allowed')
  assert.equal(candidates[12] & (1 << 1), 0, 'an unmarked 1:2 edge remains forbidden')
})

test('negative Coach Ratio with custom labels excludes only the default 2:1 relation', async () => {
  const solution = '123456789456789123789123456234567891567891234891234567345678912678912345912345678'
  const digits = [...solution].map(Number)
  const ratioTwoPairs: [number, number][] = []
  const ratioThreePairs: [number, number][] = []
  for (let cell = 0; cell < digits.length; cell++) {
    for (const next of [cell % 9 < 8 ? cell + 1 : -1, cell < 72 ? cell + 9 : -1]) {
      if (next >= 0) {
        const ratio = Math.max(digits[cell], digits[next]) / Math.min(digits[cell], digits[next])
        if (ratio === 2) ratioTwoPairs.push([cell, next])
        if (ratio === 3) ratioThreePairs.push([cell, next])
      }
    }
  }
  assert.ok(ratioTwoPairs.length > 0)
  assert.ok(ratioThreePairs.length > 0)
  const negativeMarks = [...ratioTwoPairs, ...ratioThreePairs]
  const { game } = await prepareImportedPuzzle(coachCode({ givenDigits: solution, givenConstraints: [
    { type: 'ratio', settings: { negativeConstraint: true }, segments: negativeMarks.map(cells => ({
      cells, parameters: { ratio: Math.max(digits[cells[0]], digits[cells[1]]) / Math.min(digits[cells[0]], digits[cells[1]]) },
    })) },
  ] }))

  assert.deepEqual(game.variant?.puzzle.rules, [
    { type: 'labeled-dots', relation: 'ratio', marks: negativeMarks.map(cells => ({
      cells, value: Math.max(digits[cells[0]], digits[cells[1]]) / Math.min(digits[cells[0]], digits[cells[1]]),
    })), negative: true },
  ])
  assert.equal(game.variant?.solution, solution)
})

test('negative default Ratio joins same-value custom clues split across classic layers', async () => {
  const solution = '123456789456789123789123456234567891567891234891234567345678912678912345912345678'
  const digits = [...solution].map(Number)
  const ratioTwoPairs: [number, number][] = []
  const ratioThreePairs: [number, number][] = []
  for (let cell = 0; cell < digits.length; cell++) {
    for (const next of [cell % 9 < 8 ? cell + 1 : -1, cell < 72 ? cell + 9 : -1]) {
      if (next >= 0) {
        const ratio = Math.max(digits[cell], digits[next]) / Math.min(digits[cell], digits[next])
        if (ratio === 2) ratioTwoPairs.push([cell, next])
        if (ratio === 3) ratioThreePairs.push([cell, next])
      }
    }
  }
  assert.ok(ratioThreePairs.length > 1)
  const [negativeLayerMarks, positiveLayerMarks] = [ratioThreePairs.slice(0, -1), ratioThreePairs.slice(-1)]
  const { game } = await prepareImportedPuzzle(coachCode({ givenDigits: solution, givenConstraints: [
    { type: 'ratio', settings: { negativeConstraint: true }, segments: negativeLayerMarks.map(cells => ({
      cells, parameters: { ratio: 3 },
    })) },
    { type: 'ratio', settings: { negativeConstraint: false }, segments: positiveLayerMarks.map(cells => ({
      cells, parameters: { ratio: 3 },
    })) },
    { type: 'ratio', settings: { negativeConstraint: false }, segments: ratioTwoPairs.map(cells => ({
      cells, parameters: { ratio: 2 },
    })) },
  ] }))

  assert.deepEqual(game.variant?.puzzle.rules, [
    { type: 'labeled-dots', relation: 'ratio', marks: negativeLayerMarks.map(cells => ({ cells, value: 3 })), negative: true },
    { type: 'labeled-dots', relation: 'ratio', marks: positiveLayerMarks.map(cells => ({ cells, value: 3 })) },
    { type: 'labeled-dots', relation: 'ratio', marks: ratioTwoPairs.map(cells => ({ cells, value: 2 })) },
  ])
  assert.equal(game.variant?.solution, solution)
})

test('an empty negative default Ratio layer remains active beside custom Ratio labels', async () => {
  const solution = '123456789456789123789123456234567891567891234891234567345678912678912345912345678'
  const imported = await detectPuzzle(coachCode({ givenDigits: solution, givenConstraints: [
    { type: 'ratio', settings: { negativeConstraint: true }, segments: [] },
    { type: 'ratio', settings: { negativeConstraint: false }, segments: [
      { cells: [8, 17], parameters: { ratio: 3 } },
    ] },
  ] }))
  assert.ok(imported.variant)
  assert.deepEqual(imported.variant.puzzle.rules, [
    { type: 'labeled-dots', relation: 'ratio', marks: [], negative: true },
    { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [8, 17], value: 3 }] },
  ])
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.variant.puzzle, entries: solution,
  } }), 'conflict')
})

test('an empty negative default Difference layer remains active beside custom Difference labels', async () => {
  const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const digits = [...solution].map(Number)
  const differenceTwoPair: [number, number] | undefined = (() => {
    for (let cell = 0; cell < digits.length; cell++) {
      for (const next of [cell % 9 < 8 ? cell + 1 : -1, cell < 72 ? cell + 9 : -1]) {
        if (next >= 0 && Math.abs(digits[cell] - digits[next]) === 2) return [cell, next]
      }
    }
    return undefined
  })()
  assert.ok(differenceTwoPair)
  const imported = await detectPuzzle(coachCode({ givenDigits: solution, givenConstraints: [
    { type: 'difference', settings: { negativeConstraint: true }, segments: [] },
    { type: 'difference', settings: { negativeConstraint: false }, segments: [
      { cells: differenceTwoPair, parameters: { difference: 2 } },
    ] },
  ] }))
  assert.ok(imported.variant)
  assert.deepEqual(imported.variant.puzzle.rules, [
    { type: 'labeled-dots', relation: 'difference', marks: [], negative: true },
    { type: 'labeled-dots', relation: 'difference', marks: [{ cells: differenceTwoPair, value: 2 }] },
  ])
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.variant.puzzle, entries: solution,
  } }), 'conflict')
})

test('empty negative default Ratio layers exempt matching clues from other labeled layers', async () => {
  const imported = await detectPuzzle(coachCode({ givenConstraints: [
    { type: 'ratio', settings: { negativeConstraint: true }, segments: [] },
    { type: 'ratio', settings: { negativeConstraint: false }, segments: [
      { cells: [0, 1], parameters: { ratio: 2 } },
    ] },
    { type: 'ratio', settings: { negativeConstraint: false }, segments: [
      { cells: [8, 17], parameters: { ratio: 3 } },
    ] },
  ] }))
  assert.ok(imported.variant)
  const position = variantPosition(imported.variant, { entries: '1' + '0'.repeat(80) })
  const candidates = await runEngine({ type: 'variant', operation: 'candidates', position })
  assert.ok(candidates)
  assert.equal(candidates[1], 1 << 1, 'the separately marked 1:2 edge remains allowed')
  assert.equal(candidates[9] & (1 << 1), 0, 'an unmarked 1:2 edge remains forbidden')
})

test('empty negative default Difference layers exempt matching clues from other labeled layers', async () => {
  const imported = await detectPuzzle(coachCode({ givenConstraints: [
    { type: 'difference', settings: { negativeConstraint: true }, segments: [] },
    { type: 'difference', settings: { negativeConstraint: false }, segments: [
      { cells: [0, 1], parameters: { difference: 1 } },
    ] },
    { type: 'difference', settings: { negativeConstraint: false }, segments: [
      { cells: [2, 3], parameters: { difference: 2 } },
    ] },
  ] }))
  assert.ok(imported.variant)
  const position = variantPosition(imported.variant, { entries: '1' + '0'.repeat(80) })
  const candidates = await runEngine({ type: 'variant', operation: 'candidates', position })
  assert.ok(candidates)
  assert.equal(candidates[1], 1 << 1, 'the separately marked difference-1 edge remains allowed')
  assert.equal(candidates[9] & (1 << 1), 0, 'an unmarked difference-1 edge remains forbidden')
})

test('negative default Difference joins custom 2 labels in classic Sudoku', async () => {
  const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  const digits = [...solution].map(Number)
  const differenceOnePairs: [number, number][] = []
  const differenceTwoPairs: [number, number][] = []
  for (let cell = 0; cell < digits.length; cell++) {
    for (const next of [cell % 9 < 8 ? cell + 1 : -1, cell < 72 ? cell + 9 : -1]) {
      if (next >= 0) {
        const difference = Math.abs(digits[cell] - digits[next])
        if (difference === 1) differenceOnePairs.push([cell, next])
        if (difference === 2) differenceTwoPairs.push([cell, next])
      }
    }
  }
  assert.ok(differenceOnePairs.length > 0)
  assert.ok(differenceTwoPairs.length > 0)
  const marks = [...differenceOnePairs, ...differenceTwoPairs]
  const { game } = await prepareImportedPuzzle(coachCode({ givenDigits: solution, givenConstraints: [
    { type: 'difference', settings: { negativeConstraint: true }, segments: marks.map(cells => ({
      cells, parameters: { difference: Math.abs(digits[cells[0]] - digits[cells[1]]) },
    })) },
  ] }))

  assert.deepEqual(game.variant?.puzzle.rules, [
    { type: 'labeled-dots', relation: 'difference', marks: marks.map(cells => ({
      cells, value: Math.abs(digits[cells[0]] - digits[cells[1]]),
    })), negative: true },
  ])
  assert.equal(game.variant?.solution, solution)
})

test('synthetic Coach Ratio 3 keeps its marked relation in Play and engine analysis', async () => {
  const { game } = await prepareImportedPuzzle(coachCode({
    givenConstraints: [
      { type: 'ratio', segments: [
        { cells: [0, 1], parameters: { ratio: 3 } },
        { cells: [1, 2], parameters: { ratio: 2 } },
      ], settings: { negativeConstraint: false } },
      { type: 'diagonalPositive', segments: [] },
    ],
  }))

  assert.deepEqual(game.variant?.puzzle.rules, [
    { type: 'labeled-dots', relation: 'ratio', marks: [
      { cells: [0, 1], value: 3 }, { cells: [1, 2], value: 2 },
    ] },
    { type: 'diagonal', diagonal: 'anti' },
  ])

  const opening = await playCandidates(game)
  assert.ok(opening)
  assert.ok(opening[0] & 1 << 0)
  assert.ok(opening[1] & 1 << 2)

  const afterOne = enter(game, [0], 'value', 1)
  const candidates = await playCandidates(afterOne)
  assert.ok(candidates)
  assert.deepEqual([...Array(9).keys()].filter(digit => candidates[1] & 1 << digit), [2])
  assert.deepEqual([...Array(9).keys()].filter(digit => candidates[2] & 1 << digit), [5],
    'a default 1:2 dot stays marked beside the custom 1:3 dot')
  assert.notEqual(candidates[9] & (1 << 1), 0, 'without negative markers, unmarked 1:2 edges remain allowed')

  const restored = readGame(afterOne.id, JSON.stringify(afterOne))
  assert.ok(restored)
  assert.deepEqual(restored.variant, afterOne.variant, 'saved progress keeps both the 1:3 and 1:2 marks')
  assert.deepEqual(undo(restored).position, game.position)
  assert.deepEqual(redo(undo(restored)).position, afterOne.position)

  const exported = parsePuzzleExport(puzzleExportText(afterOne))
  assert.deepEqual(exported.variant?.puzzle, game.variant?.puzzle, 'portable sharing retains both labeled ratios')
  assert.equal(exported.givens, game.givens)
  const shared = await publishFixture(afterOne)
  assert.deepEqual(shared.variant?.puzzle, game.variant?.puzzle, 'public sharing retains both labeled ratios')

  const impossible = await runEngine({
    type: 'variant', operation: 'analyze',
    position: { ...variantPosition(game.variant!, afterOne.position), entries: '12' + '0'.repeat(79) },
  })
  assert.equal(impossible, 'conflict')
})

test('synthetic Coach Ratio labels from 2:1 through 9:1 match exact candidate support', async () => {
  for (let ratio = 2; ratio <= 9; ratio++) {
    for (let fixedDigit = 1; fixedDigit <= 9; fixedDigit++) {
      const imported = await detectPuzzle(coachCode({
        givenDigits: String(fixedDigit) + '0'.repeat(80),
        givenConstraints: [{ type: 'ratio', settings: { negativeConstraint: false }, segments: [
          { cells: [0, 1], parameters: { ratio } },
        ] }],
      }))
      assert.ok(imported.variant, `ratio ${ratio}:1 with ${fixedDigit} fixed at R1C1`)
      const candidates = await runEngine({ type: 'variant', operation: 'candidates', position: variantPosition(imported.variant) })
      assert.ok(candidates)
      const expected = Array.from({ length: 9 }, (_, index) => index + 1).filter(digit =>
        Math.max(digit, fixedDigit) / Math.min(digit, fixedDigit) === ratio)
      const actual = Array.from({ length: 9 }, (_, index) => index + 1).filter(digit => candidates[1] & (1 << (digit - 1)))
      assert.deepEqual(actual, expected, `ratio ${ratio}:1 with ${fixedDigit} fixed at R1C1`)
    }
  }
})

test('#86 imports the published Light puzzle with its 3:1 Ratio mark and companion rules', async () => {
  const source = mixedCoachSources.find(({ url }) => url.endsWith('/FzrY'))
  assert.ok(source)
  assert.equal(source.title, '光 (Light)')
  assert.equal(source.author, 'hoi')

  const imported = await detectPuzzle(source.coach)
  assert.ok(imported.variant)
  const ratioRule = imported.variant.puzzle.rules?.find(rule => rule.type === 'labeled-dots' && rule.relation === 'ratio')
  assert.ok(ratioRule)
  assert.deepEqual(ratioRule, {
    type: 'labeled-dots',
    relation: 'ratio',
    marks: [{ cells: [79, 78], value: 3 }],
  })
  assert.ok(imported.variant.puzzle.rules?.some(rule => rule.type === 'palindrome'))
  assert.ok(imported.variant.puzzle.rules?.some(rule => rule.type === 'entropic'))
  assert.ok(imported.variant.puzzle.rules?.some(rule => rule.type === 'quadruple'))
  assert.ok(variantRuleDescriptions(imported.variant.puzzle).some(description =>
    description.includes('Across a numbered black dot, multiply the smaller digit by the number on the dot')))

  const solution = source.solution
  assert.equal(Math.max(Number(solution[79]), Number(solution[78])),
    3 * Math.min(Number(solution[79]), Number(solution[78])))
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.variant.puzzle,
    entries: imported.givens,
  } }), 'unique', 'the complete published puzzle must solve uniquely with all imported companion rules')
  const withoutRatio = {
    ...imported.variant.puzzle,
    rules: imported.variant.puzzle.rules?.filter(rule => rule.type !== 'labeled-dots' || rule.relation !== 'ratio'),
  }
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: withoutRatio,
    entries: imported.givens,
  } }), 'multiple', 'the published 3:1 Ratio rule is needed for uniqueness alongside the companion rules')
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.variant.puzzle,
    entries: solution,
  } }), 'unique', 'the published completion must satisfy the Ratio and every companion rule together')

  const ratioOnlyPuzzle = { ...imported.variant.puzzle, rules: [ratioRule] }
  const entries = Array(81).fill('0')
  entries[79] = solution[79]
  const candidates = await runEngine({ type: 'variant', operation: 'candidates', position: {
    puzzle: ratioOnlyPuzzle,
    entries: entries.join(''),
  } })
  assert.ok(candidates)
  assert.deepEqual(Array.from({ length: 9 }, (_, index) => index + 1)
    .filter(digit => candidates[78] & (1 << (digit - 1))), [Number(solution[78])])
})

test('synthetic sized Coach Ratio 3 composes with a diagonal and constrains imported Play candidates', async () => {
  const { game } = await prepareImportedPuzzle(coachCode({
    gridSize: 6,
    givenDigits: '000000000000000000000000000030000400',
    regions: Array.from({ length: 36 }, (_, cell) => Math.floor(cell / 12) * 2 + Math.floor(cell % 6 / 3)),
    givenConstraints: [
      { type: 'diagonalPositive', segments: [] },
      { type: 'thermometer', segments: [{ cells: [1, 7, 13, 14] }, { cells: [32, 26, 20] }] },
      { type: 'odd', segments: [{ cells: [24] }, { cells: [17] }] },
      { type: 'ratio', segments: [{ cells: [1, 2], parameters: { ratio: 3 } }] },
    ],
  }))

  assert.ok(game.sized)
  assert.equal(game.sized.solution, '413652625314234561156243542136361425')
  assert.deepEqual(game.sized.rules, [
    { type: 'diagonal', diagonal: 'anti' },
    { type: 'thermometer', cells: [1, 7, 13, 14] },
    { type: 'thermometer', cells: [32, 26, 20] },
    { type: 'parity', parity: 'odd', cells: [24, 17] },
    { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [1, 2], value: 3 }], negative: false },
  ])
  const afterOne = enter(game, [1], 'value', 1)
  const candidates = await playCandidates(afterOne)
  assert.ok(candidates)
  assert.deepEqual([...Array(6).keys()].filter(digit => candidates[2] & 1 << digit), [2])
  const restored = readGame(afterOne.id, JSON.stringify(afterOne))
  assert.ok(restored)
  assert.deepEqual(restored.sized, game.sized)
  assert.deepEqual(undo(restored).position, game.position)
  assert.deepEqual(redo(undo(restored)).position, afterOne.position)
})
