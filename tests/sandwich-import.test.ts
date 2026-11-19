import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import type { VariantPuzzle, VariantRule } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, fillEntries, makeGame, redo, undo } from '../src/sudoku/game.ts'
import { sandwichState } from '../src/sudoku/sandwich.ts'
import { outsideClueLabel, outsideClueLayout } from '../src/sudoku/outside-clues.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { isPlayablePuzzle, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { coachCode } from './helpers/coach-code.ts'

const empty = '0'.repeat(81)
const sources = ['murphy', 'newman', 'coach-9VLq'].map(name => JSON.parse(readFileSync(new URL('./fixtures/sandwich-' + name + '.json', import.meta.url), 'utf8'))) as { puzzle: VariantPuzzle; solution: string; originalCode?: string; decoded?: unknown }[]
const row = Array.from({ length: 9 }, (_, i) => i)
const clue = (sum: number): VariantRule => ({ type: 'sandwich', direction: 'east', cells: row, sum })

test('complete published Sandwich controls are independently unique and preserve every printed total and companion', async () => {
  for (const source of sources) {
    const input = source.originalCode ?? '#variant=' + encodeURIComponent(JSON.stringify({ id: 'sandwich', puzzle: source.puzzle }))
    assert.deepEqual((await detectPuzzle(input)).variant?.puzzle, source.puzzle)
    assertVariantCompletion(source.puzzle, source.solution)
    const counted = countLineSolutions(source.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, source.solution)
    assert.equal(conflictsOf(source.solution, source.puzzle).size, 0)
    const without = { ...source.puzzle, rules: source.puzzle.rules!.filter(rule => rule.type !== 'sandwich') }
    assert.equal(countLineSolutions(without).count, 2)
    assert.ok(variantRuleDescriptions(source.puzzle).some(text => /strictly between 1 and 9/.test(text)))
  }
})

test('Sandwich validation accepts every edge and integer zero and rejects incomplete rays or altered semantics', () => {
  for (const sum of [0, 1, 35]) assert.ok(isPlayablePuzzle('sandwich', { version: 1, givens: empty, rules: [clue(sum)] }))
  const base = clue(0)
  for (const extra of [{ sum: -1 }, { sum: 36 }, { sum: .5 }, { sum: '0' }, { sum: null }, { direction: 'south' },
    { cells: row.slice(1) }, { cells: [...row].reverse() }, { cells: [...row.slice(0,8), 9] }, { cells: null }, { bread: [2,8] }, { max: true }]) {
    assert.equal(isPlayablePuzzle('sandwich', { version: 1, givens: empty, rules: [{ ...base, ...extra }] }), false, JSON.stringify(extra))
  }
  for (let symmetry = 0; symmetry < 8; symmetry++) assert.ok(isPlayablePuzzle('sandwich', reflectVariant({ version: 1, givens: empty, rules: [base] }, symmetry)))
})

test('Coach Sandwich decoding preserves all four sides, zero and companion thermometers and rejects unknown parameters', async () => {
  const decoded = sources[2].decoded as { gridSize: number; givenConstraints: Record<string, unknown>[] }
  const constraint = { type: 'sandwich', segments: ['top', 'right', 'bottom', 'left'].map(side => ({ cells: [], parameters: { side, index: 0, value: 0 } })), settings: {} }
  const imported = await detectPuzzle(coachCode({ ...decoded, givenConstraints: [constraint] }))
  assert.deepEqual(imported.variant!.puzzle.rules!.map(rule => 'direction' in rule ? rule.direction : ''), ['south','west','north','east'])
  const first = imported.variant!.puzzle.rules![0]
  assert.deepEqual('cells' in first && first.cells, [0,9,18,27,36,45,54,63,72])
  for (const parameters of [{ side: 'top', index: 9, value: 0 }, { side: 'left', index: '0', value: 0 }, { side: 'up', index: 0, value: 0 },
    { side: 'top', index: 0, value: 36 }, { side: 'top', index: 0, value: '0' }, { side: 'top', index: 0, value: 0, bread: '28' }]) {
    await assert.rejects(detectPuzzle(coachCode({ ...decoded, givenConstraints: [{ ...constraint, segments: [{ cells: [], parameters }] }] })), /invalid Sandwich/)
  }
  for (const change of [{ segments: [] }, { segments: [{ cells: [0], parameters: { side: 'top', index: 0, value: 0 } }] },
    { settings: { outsideLevel: 2 } }, { settings: { bread: '28' } }]) {
    await assert.rejects(detectPuzzle(coachCode({ ...decoded, givenConstraints: [{ ...constraint, ...change }] })), /Sandwich/)
  }
  const terrain = JSON.parse(readFileSync(new URL('./fixtures/sandwich-terrain-unsupported.json', import.meta.url), 'utf8'))
  const code = terrain.metadata?.sudoku ?? terrain.source?.sudoku ?? terrain.sudoku
  assert.equal(typeof code, 'string')
  await assert.rejects(detectPuzzle(code), /unsupported|not supported/)
})

test('local placed-digit support agrees with direct nine-digit permutations for every total and varied partial rows', () => {
  const permutations: string[][] = Array.from({ length: 36 }, () => [])
  function enumerate(prefix: number[], remaining: number[]) {
    if (!remaining.length) {
      const one = prefix.indexOf(1), nine = prefix.indexOf(9)
      const sum = prefix.slice(Math.min(one,nine)+1,Math.max(one,nine)).reduce((a,b) => a+b, 0)
      permutations[sum].push(prefix.join('')); return
    }
    remaining.forEach((digit, i) => enumerate([...prefix,digit], remaining.filter((_, j) => j !== i)))
  }
  enumerate([], [1,2,3,4,5,6,7,8,9])
  for (let sum = 0; sum <= 35; sum++) {
    const completion = permutations[sum][0] ?? '123456789'
    const partials = [empty.slice(0,9), ...[1,3,7,23,85,170,257,341,438,510,511].map(mask =>
      [...completion].map((digit,i) => mask & 1 << i ? digit : '0').join('')), '110000000', '900000001', '001020900']
    for (const partial of partials) {
      const possible = permutations[sum].filter(candidate => [...partial].every((digit,i) => digit === '0' || digit === candidate[i]))
      const expected = row.map(i => possible.reduce((mask,candidate) => mask | 1 << (Number(candidate[i])-1),0))
      const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [clue(sum)] }
      const state = sandwichState(puzzle, partial + empty.slice(9))!
      assert.deepEqual(state.allowed.slice(0,9), expected, sum + ':' + partial)
      assert.deepEqual([...state.conflicts], possible.length ? [] : row.filter(i => partial[i] !== '0'))
    }
  }
})

test('both Pencil modes and bulk placements obey a zero Sandwich and restore candidates through undo and redo', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [clue(0)] }
  const game = { ...makeGame('sandwich-input', 'Sandwich', empty, 'imported'), variant: { id: 'sandwich' as const, puzzle, solution: sources[0].solution } }
  game.position.center = Array<number>(81).fill(511); game.position.corner = Array<number>(81).fill(511)
  for (const changed of [enter(game,[0],'value',1), fillEntries(game, '1' + empty.slice(1))]) {
    for (const mode of ['center','corner'] as const) {
      assert.equal(changed.position[mode][1], 256)
      assert.ok(!(changed.position[mode][2] & 256))
      assert.ok(changed.position[mode][9] & 256)
    }
    assert.deepEqual(undo(changed).position, game.position)
    assert.deepEqual(redo(undo(changed)).position, changed.position)
  }
  assert.deepEqual([...conflictsOf('109' + empty.slice(3),puzzle)].sort(), [0,2])
})

test('outside geometry retains edge, direction, repeated clues and all eight independently transformed completions', () => {
  const puzzle: VariantPuzzle = { version: 1, givens: empty, rules: [clue(0),clue(0)] }
  const expected = [
    ['east',[0,1,2,3,4,5,6,7,8]], ['south',[0,9,18,27,36,45,54,63,72]],
    ['east',[72,73,74,75,76,77,78,79,80]], ['north',[72,63,54,45,36,27,18,9,0]],
    ['west',[8,7,6,5,4,3,2,1,0]], ['south',[8,17,26,35,44,53,62,71,80]],
    ['west',[80,79,78,77,76,75,74,73,72]], ['north',[80,71,62,53,44,35,26,17,8]],
  ]
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const transformed = reflectVariant(puzzle,symmetry), rule = transformed.rules![0]
    assert.deepEqual('direction' in rule && [rule.direction,rule.cells], expected[symmetry])
    const layout = outsideClueLayout(transformed.rules)
    assert.equal(Object.values(layout.depths).filter(Boolean)[0], 1.4)
    assert.equal(Object.values(layout.sides).flat()[1].lane, 1)
    assert.match(outsideClueLabel(rule as Parameters<typeof outsideClueLabel>[0]), /Sandwich 0/)
    for (const source of sources) assertVariantCompletion(reflectVariant(source.puzzle,symmetry), transformedBoard(source.solution,symmetry))
  }
})
