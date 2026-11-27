import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { enter } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { publishFixture } from './helpers/shared-puzzle.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const { puzzles } = JSON.parse(readFileSync(new URL('./fixtures/aspartagcus-irregular-fortress.json', import.meta.url), 'utf8')) as {
  puzzles: { url: string; size: number; solution: string }[]
}

test('published Fortress imports preserve shaded Maximum rules through progress, reload, and sharing', async () => {
  for (const { url, size, solution } of puzzles) {
    const code = decodeURIComponent(new URL(url).pathname.slice(1))
    const preview = await prepareImportedPuzzle(code)
    assert.equal(preview.format, 'f-puzzles', `${size} × ${size} preview format`)
    const game = preview.game
    assert.equal(game.grid?.size, size)
    assert.ok(game.sized, `${size} × ${size} preview rules`)
    const rule = game.sized.rules.find(rule => rule.type === 'maximum')
    assert.ok(rule?.type === 'maximum' && rule.shaded, `${size} × ${size}`)
    assert.equal(game.sized.solution, solution, `${size} × ${size} verified Preview solution`)
    const progressed = enter(game, [0], 'value', Number(solution[0]))
    assert.deepEqual(readGame(game.id, JSON.stringify(progressed))?.sized, game.sized, `${size} × ${size} reload`)
    const shared = await publishFixture(progressed)
    assert.deepEqual(shared.sizedRules, game.sized.rules, `${size} × ${size} share`)
  }
})
