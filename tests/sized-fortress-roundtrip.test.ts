import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { enter, makeGame } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { publishFixture } from './helpers/shared-puzzle.ts'

const { puzzles } = JSON.parse(readFileSync(new URL('./fixtures/aspartagcus-irregular-fortress.json', import.meta.url), 'utf8')) as {
  puzzles: { url: string; size: number; solution: string }[]
}

test('published Fortress imports preserve shaded Maximum rules through progress, reload, and sharing', async () => {
  for (const { url, size, solution } of puzzles) {
    const code = decodeURIComponent(new URL(url).pathname.slice(1))
    const imported = await detectPuzzle(code)
    assert.ok(imported.grid && imported.sizedRules, `${size} × ${size}`)
    const rule = imported.sizedRules.find(rule => rule.type === 'maximum')
    assert.ok(rule?.type === 'maximum' && rule.shaded, `${size} × ${size}`)
    const game = { ...makeGame(`fortress-${size}`, `${size} × ${size} Fortress`, imported.givens, 'imported', 0, imported.grid),
      sized: { rules: imported.sizedRules, solution } }
    const progressed = enter(game, [0], 'value', Number(solution[0]))
    assert.deepEqual(readGame(game.id, JSON.stringify(progressed))?.sized, game.sized, `${size} × ${size} reload`)
    const shared = await publishFixture(progressed)
    assert.deepEqual(shared.sizedRules, game.sized.rules, `${size} × ${size} share`)
  }
})
