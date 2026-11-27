import assert from 'node:assert/strict'
import { test } from 'node:test'
import { restoreSizedRuleGame } from '../src/sudoku/sized-rule-game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { readCoachSolutionSources, standaloneCoachSolutionSources } from './helpers/coach-fixture-sources.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'

const sources = readCoachSolutionSources()

function assertClassicCompletion(givens: string, solution: string, source: string) {
  assert.match(solution, /^[1-9]{81}$/, source)
  for (let cell = 0; cell < 81; cell++) if (givens[cell] !== '0') assert.equal(solution[cell], givens[cell], `${source}: given ${cell}`)
  for (let index = 0; index < 9; index++) {
    const row = Array.from({ length: 9 }, (_, column) => solution[index * 9 + column])
    const column = Array.from({ length: 9 }, (_, row) => solution[row * 9 + index])
    const box = Array.from({ length: 9 }, (_, offset) => solution[Math.floor(index / 3) * 27 + index % 3 * 3 + Math.floor(offset / 3) * 9 + offset % 3])
    for (const house of [row, column, box]) assert.equal(new Set(house).size, 9, `${source}: classic house ${index}`)
  }
}

test('published completions satisfy every preserved Sudoku Coach fixture combination', async () => {
  assert.equal(sources.size, 80)
  const standaloneSeen = new Set<string>()

  for (const source of sources.values()) {
    const imported = await detectPuzzle(source.code)
    assert.equal(imported.format, 'Sudoku Coach', source.references.join(', '))
    const sourceName = source.references[0]

    if (imported.futoshiki || imported.calcudoku) {
      assert.ok(source.references.every(reference => standaloneCoachSolutionSources.has(reference)), sourceName)
      for (const reference of source.references) standaloneSeen.add(reference)
      continue
    }

    if (imported.variant) {
      assertVariantCompletion(imported.variant.puzzle, source.solution)
    } else if (imported.sizedRules && imported.grid) {
      assert.ok(restoreSizedRuleGame({ rules: imported.sizedRules, solution: source.solution, author: imported.sizedAuthor },
        imported.grid, imported.givens), `${sourceName}: sized completion violates its imported rules`)
    } else if (imported.grid) {
      assert.ok(restoreSizedRuleGame({ rules: [], solution: source.solution }, imported.grid, imported.givens),
        `${sourceName}: sized classic completion violates its grid or givens`)
    } else {
      assertClassicCompletion(imported.givens, source.solution, sourceName)
    }
  }

  assert.deepEqual([...standaloneSeen].sort(), [...standaloneCoachSolutionSources].sort())
})

test('every published 9 × 9 Coach combination preserves its completion under all eight symmetries', async () => {
  let transformed = 0
  for (const source of sources.values()) {
    const imported = await detectPuzzle(source.code)
    if (!imported.variant) continue
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      assertVariantCompletion(reflectVariant(imported.variant.puzzle, symmetry), transformedBoard(source.solution, symmetry))
      transformed++
    }
  }
  assert.equal(transformed, 464)
})
