import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateCalcudoku, calcudokuRecipeKey } from '../src/calcudoku/generator.ts'
import { generateKakuro, kakuroRecipeSignature } from '../src/kakuro/generator.ts'
import { checkKakuro, findKakuroHint, solveKakuro } from '../src/kakuro/engine.ts'
import { checkLatin, findLatinHint, solveLatin } from '../src/latin/engine.ts'
import { numberPuzzleDifficulties } from '../src/number-puzzles/catalog.ts'
import { calcudokuFromRecipe, decodeGeneratedNumberPuzzle, encodeGeneratedNumberPuzzle, kakuroFromRecipe } from '../src/number-puzzles/generated.ts'

test('Kakuro generation avoids previous recipes and rates the full hint replay', () => {
  for (const difficulty of numberPuzzleDifficulties) {
    const seen = new Set<string>()
    for (let index = 0; index < 4; index++) {
      const recipe = generateKakuro(difficulty, 0x5ca58d23, seen)
      assert.ok(recipe, difficulty)
      const puzzle = kakuroFromRecipe(recipe)
      const key = kakuroRecipeSignature(puzzle)
      assert.ok(!seen.has(key))
      seen.add(key)

      const token = encodeGeneratedNumberPuzzle({ game: 'kakuro', difficulty, recipe })
      assert.deepEqual(decodeGeneratedNumberPuzzle(token, 'kakuro'), { game: 'kakuro', difficulty, recipe })
      assert.equal(decodeGeneratedNumberPuzzle(token, 'calcudoku'), null)
      const exact = solveKakuro(puzzle)
      assert.equal(exact.status, 'unique')
      const path = puzzle.cells.map(() => 0)
      let depth = 0
      for (const cell of puzzle.cells) {
        if (cell !== null) continue
        const hint = findKakuroHint(puzzle, path)
        assert.ok(hint)
        assert.equal(hint.digit, exact.solution![hint.cell])
        path[hint.cell] = hint.digit
        depth = Math.max(depth, hint.depth)
      }
      assert.equal(checkKakuro(puzzle, path).complete, true)
      assert.equal(depth === 1 ? 'easy' : depth === 2 ? 'medium' : 'hard', difficulty)
    }
  }
})

test('Calcudoku generation gives a distinct cage set and complete hints at each difficulty', () => {
  for (const difficulty of numberPuzzleDifficulties) {
    const seen = new Set<string>()
    for (let index = 0; index < 6; index++) {
      const recipe = generateCalcudoku(difficulty, 0xc6be72a2, seen)
      assert.ok(recipe, difficulty)
      const key = calcudokuRecipeKey(recipe)
      assert.ok(!seen.has(key))
      seen.add(key)
      const token = encodeGeneratedNumberPuzzle({ game: 'calcudoku', difficulty, recipe })
      assert.deepEqual(decodeGeneratedNumberPuzzle(token, 'calcudoku'), { game: 'calcudoku', difficulty, recipe })
      assert.equal(decodeGeneratedNumberPuzzle(token, 'kakuro'), null)

      const puzzle = calcudokuFromRecipe(recipe)
      const exact = solveLatin(puzzle)
      assert.equal(exact.status, 'unique')
      const path = puzzle.givens.slice()
      for (let count = path.filter(value => !value).length; count > 0; count--) {
        const hint = findLatinHint(puzzle, path)
        assert.ok(hint)
        assert.equal(hint.value, exact.solution![hint.cell])
        path[hint.cell] = hint.value
      }
      assert.equal(checkLatin(puzzle, path).complete, true)
    }
  }
})

test('generated puzzle links reject unknown versions and malformed payloads', () => {
  for (const token of ['v2.YQ', 'v1.YQ', 'v1.' + 'a'.repeat(1801), 'v1.🧩']) {
    assert.equal(decodeGeneratedNumberPuzzle(token, 'kakuro'), null)
    assert.equal(decodeGeneratedNumberPuzzle(token, 'calcudoku'), null)
  }
})
