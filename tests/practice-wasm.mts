import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { generateDifficultyCheck } from '../src/sudoku/difficulty-check-generation.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import type { PracticePosition } from '../src/sudoku/practice.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const load = <T,>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

test('the current Classic catalog has named drills and the engine proves every bundled move', async () => {
  const mixed = load<PracticePosition[]>('../src/sudoku/practice-positions.json')
  const named = load<Record<string, PracticePosition[]>>('../src/sudoku/generated/practice-exercises.json')
  const { techniques } = await runEngine({ type: 'techniques' })
  assert.deepEqual(Object.keys(named).sort(), techniques.map(({ id }) => id).sort())
  for (const positions of Object.values(named)) assert.ok(positions.length >= 5)
  for (const position of [...mixed, ...Object.values(named).flat()]) {
    const { givens, entries, eliminations, hint } = position
    const action = hint.deduction.actions[0]
    const proof = await runEngine({
      type: 'practice-proof', values: givens, entries, eliminations,
      preferredTechnique: hint.technique, action,
    }, { background: true })
    assert.equal(proof?.technique, hint.technique, hint.technique)
    assert.ok(proof?.pattern)
    assert.ok(proof.actions.some(move => JSON.stringify(move) === JSON.stringify(action)))
  }
})

test('a difficulty check can generate a full puzzle using a familiar profile and one practice technique', async () => {
  const comfortable = ['full-house', 'hidden-single-box', 'naked-single', 'hidden-single', 'claiming', 'naked-pair', 'hidden-pair', 'naked-triple', 'hidden-triple']
  const { board, rating } = await generateDifficultyCheck('medium', 31, { comfortable, practice: ['pointing'] }, [])
  assert.equal(await runEngine({ type: 'analyze', values: board }), 'unique')
  assert.deepEqual(rating.status, { solved: 'medium' })
  assert.ok(rating.score.counts.pointing)
  assert.ok(Object.keys(rating.score.counts).every(id => id === 'pointing' || comfortable.includes(id)))
})
