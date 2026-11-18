// Sample the same fixed-difficulty entry points as the New Puzzle screen.
import assert from 'node:assert/strict'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { seedFor, wasmSha256 } from '../../../docs/research/sudoku-construction/engine.mts'
import { generateClassic } from '../../../src/sudoku/classic-generation.ts'
import { EngineError, type Difficulty, type VariantPuzzle } from '../../../src/sudoku/engine.ts'
import { makeGame, type Game } from '../../../src/sudoku/game.ts'
import { generatePlayableVariant } from '../../../src/sudoku/variant-play.ts'
import { variantDifficulties } from '../../../src/sudoku/variants.ts'

const [directory, family, ...requested] = process.argv.slice(2)
assert.ok(directory && ['classic', 'killer', 'x'].includes(family))
const variant = family === 'classic' ? 'classic' : family === 'x' ? 'diagonal' : 'killer-cages'
const allowed = variantDifficulties(variant).filter(t => t !== 'auto')
const levels = requested.length ? requested as Difficulty[] : allowed
await mkdir(directory, { recursive: true })
for (const tier of levels) {
  assert.ok(allowed.includes(tier))
  const rows = []
  const failed = []
  for (let room = 1; room <= 5; room++) {
    const history: Game[] = []
    for (let attempt = 1; history.length < 10; attempt++) {
      assert.ok(attempt <= 60, 'Too many failed requests in one room')
      const seed = seedFor(['sinclair-v-normal-v1', family, tier, room, attempt].join('/'))
      const id = [family, tier, room, history.length + 1].join('-')
      try {
        let puzzle: VariantPuzzle
        let game: Game
        // The classic API exposes only the request seed. Variants also return the chosen recipe seed.
        let sourceSeed = seed
        let points: number
        if (variant === 'classic') {
          const result = await generateClassic(tier, seed, undefined, history.map(g => g.givens))
          assert.deepEqual(result.rating.status, { solved: tier })
          points = result.rating.score.points
          puzzle = { version: 1, givens: result.board }
          game = makeGame(id, id, puzzle.givens, 'generated')
        } else {
          const result = await generatePlayableVariant(variant, tier, seed, history)
          assert.deepEqual(result.rating.status, { solved: tier })
          puzzle = result.puzzle
          points = result.rating.points
          sourceSeed = result.seed
          game = makeGame(id, id, puzzle.givens, 'generated')
          game.variant = { id: variant, puzzle, solution: result.solution }
        }
        rows.push({ id, family, tier, room, slot: history.length + 1, attempt, seed, sourceSeed, points, puzzle })
        history.push(game)
      } catch (e) {
        if (!(e instanceof EngineError && e.code === 'search-limit')) throw e
        failed.push({ room, attempt, seed, code: e.code })
      }
    }
  }
  const output = join(directory, family + '-' + tier + '.json')
  await writeFile(output + '.part', JSON.stringify({ wasmSha256, rows, failed }))
  await rename(output + '.part', output)
  console.log(family, tier, rows.length, 'returned,', failed.length, 'failed')
}
