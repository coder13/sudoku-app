import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { variantTechniqueOrder } from '../src/sudoku/variant-generation.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { coachCode } from './helpers/coach-code.ts'

useWasmWorker()

const source = (JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-mixed-rules.json', import.meta.url), 'utf8')) as {
  url: string
  coach: string
  solution: string
}[]).find(item => item.url.endsWith('/FzrY'))!
const terrain = (JSON.parse(readFileSync(new URL('./fixtures/coach-terrain.json', import.meta.url), 'utf8')) as {
  source: { sudoku: string; solution: string }
  payload: Record<string, unknown> & { givenConstraints: unknown[] }
})

const terrainDigits = [...terrain.source.solution].map(Number)
const adjacentPairs = Array.from({ length: 81 }, (_, cell) => [
  ...(cell % 9 < 8 ? [cell + 1] : []),
  ...(cell < 72 ? [cell + 9] : []),
].map(next => [cell, next] as const)).flat()
const findTerrainPair = (matches: (left: number, right: number) => boolean) => {
  const pair = adjacentPairs.find(([left, right]) => matches(terrainDigits[left]!, terrainDigits[right]!))
  assert.ok(pair, 'the published Terrain completion includes an adjacent pair for each companion')
  return pair
}
const terrainRatioPair = findTerrainPair((left, right) => Math.max(left, right) === 2 * Math.min(left, right))
const terrainDifferencePair = findTerrainPair((left, right) => Math.abs(left - right) === 1)
const relationLayer = (type: 'ratio' | 'difference', cells: readonly [number, number]) => ({ type, settings: {},
  segments: [{ cells, parameters: {} }] })
const parityLayer = (type: 'odd' | 'even', cells: number[]) => ({ type, settings: {},
  segments: cells.map(cell => ({ cells: [cell], parameters: {} })) })
const terrainCompanionCode = coachCode({ ...terrain.payload, givenConstraints: [
  ...terrain.payload.givenConstraints,
  relationLayer('ratio', terrainRatioPair),
  relationLayer('difference', terrainDifferencePair),
  parityLayer('odd', terrainDigits.flatMap((digit, cell) => digit % 2 ? [cell] : [])),
  parityLayer('even', terrainDigits.flatMap((digit, cell) => digit % 2 ? [] : [cell])),
] })

for (const sample of [
  { name: 'published mixed-rule Ratio puzzle', code: source.coach, solution: source.solution, terrainCompanions: false },
  { name: 'published Terrain with Ratio, Difference, Odd and Even companions',
    code: terrainCompanionCode, solution: terrain.source.solution, terrainCompanions: true },
]) test(`background Technique Finder on the ${sample.name} leaves foreground requests exact`, async () => {
  const imported = await detectPuzzle(sample.code)
  assert.ok(imported.variant)
  if (sample.terrainCompanions) {
    const rules = imported.variant.puzzle.rules ?? []
    assert.equal(rules.filter(rule => rule.type === 'terrain-sandwich').length, 15)
    assert.equal(rules.filter(rule => rule.type === 'parity').length, 2)
    assert.ok(rules.some(rule => rule.type === 'kropki' && rule.ratioTwo?.pairs.length))
    assert.ok(rules.some(rule => rule.type === 'kropki' && rule.consecutive?.pairs.length))
  }
  const position = { puzzle: imported.variant.puzzle }
  const classic = await runEngine({ type: 'techniques' })
  const variant = await runEngine({ type: 'techniques', variant: true })
  const order = variantTechniqueOrder(variant.defaultOrder, classic.difficultyOrder,
    Object.fromEntries([...classic.techniques, ...variant.techniques].map(item => [item.id, item.difficulty])))
  const referenceHints = await runEngine({ type: 'variant', operation: 'hints', position,
    techniqueOrder: order, limit: 0xffff_ffff })
  const expectedCounts: Record<string, number> = {}
  const covered = new Set<string>()
  for (const technique of order) {
    const targets = new Set<string>()
    for (const hint of referenceHints) {
      if (hint.technique !== technique) continue
      for (const action of hint.actions) {
        const { cell, digit } = 'place' in action ? action.place : action.eliminate
        const target = `${cell}:${digit}`
        if (!covered.has(target)) targets.add(target)
        covered.add(target)
      }
    }
    expectedCounts[technique] = targets.size
  }

  const emptyCell = imported.givens.indexOf('0')
  assert.notEqual(emptyCell, -1)
  const entries = Array(81).fill('0') as string[]
  entries[emptyCell] = sample.solution[emptyCell]!
  const editedPosition = { ...position, entries: entries.join('') }
  const baselineHints = await runEngine({ type: 'variant', operation: 'hints', position, limit: 10 })
  const baselineCandidates = await runEngine({ type: 'variant', operation: 'candidates', position: editedPosition })

  const scan = watchTechniqueScan(imported.givens, undefined, position, undefined, order)
  try {
    const pendingCounts = Promise.all(order.map(technique => scan.count(technique)))
    const [counts, hints, candidates] = await Promise.all([
      pendingCounts,
      runEngine({ type: 'variant', operation: 'hints', position, limit: 10 }),
      runEngine({ type: 'variant', operation: 'candidates', position: editedPosition }),
    ])
    assert.deepEqual(Object.fromEntries(order.map((technique, index) => [technique, counts[index]])), expectedCounts)
    assert.deepEqual(hints, baselineHints)
    assert.deepEqual(candidates, baselineCandidates)
  } finally {
    scan.close()
  }
})
