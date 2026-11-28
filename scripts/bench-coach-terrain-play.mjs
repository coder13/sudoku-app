import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { terrainSandwichState } from '../src/sudoku/terrain-sandwich.ts'

const { source } = JSON.parse(await readFile(new URL('../tests/fixtures/coach-terrain.json', import.meta.url), 'utf8'))
const imported = await detectPuzzle(source.sudoku)
assert.ok(imported.variant, 'the published Coach Terrain source should import as a variant')
assert.equal(imported.variant.puzzle.rules?.filter(rule => rule.type === 'terrain-sandwich').length, 15)

const timings = []
for (let cell = 0; cell < 81; cell++) {
  const values = Array(81).fill('0')
  values[cell] = source.solution[cell]
  const start = performance.now()
  const state = terrainSandwichState(imported.variant.puzzle, values.join(''))
  timings.push(performance.now() - start)

  assert.equal(state?.conflicts.size ?? 0, 0, `published digit at cell ${cell} should not conflict`)
  assert.ok((state?.allowed[cell] ?? 0x1ff) & (1 << (Number(source.solution[cell]) - 1)),
    `published digit at cell ${cell} should remain supported`)
}

timings.sort((left, right) => left - right)
const percentile = (fraction) => timings[Math.ceil(timings.length * fraction) - 1]
console.log(`Coach Terrain Play ${process.platform} ${process.arch}, Node ${process.version}; 15 clues.`)
console.log('One sweep of 81 distinct, source-valid single-entry states; shared support cache retained between states.')
console.log(`Manual candidate cleanup: ${percentile(0.5).toFixed(3)}/${percentile(0.95).toFixed(3)} ms median/p95; max ${timings.at(-1).toFixed(3)} ms.`)
