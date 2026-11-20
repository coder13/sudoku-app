import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateCalcudoku, calcudokuRecipeKey, calcudokuRecipeSignature } from '../src/calcudoku/generator.ts'
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
      const key = calcudokuRecipeSignature(recipe)
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

test('Calcudoku recipe keys match rotations and reflections independent of cage order', () => {
  const recipe = generateCalcudoku('easy', 0xc6be72a2)
  assert.ok(recipe)
  const { size, cages } = recipe
  const key = calcudokuRecipeSignature(recipe)
  const transforms = new Set<string>()
  for (const transpose of [false, true]) {
    for (const flipRow of [false, true]) {
      for (const flipColumn of [false, true]) {
        const rotated = cages.toReversed().map(cage => ({
          ...cage,
          cells: cage.cells.toReversed().map(cell => {
            let row = Math.floor(cell / size)
            let column = cell % size
            if (transpose) [row, column] = [column, row]
            if (flipRow) row = size - 1 - row
            if (flipColumn) column = size - 1 - column
            return row * size + column
          }),
        }))
        transforms.add(calcudokuRecipeKey({ size, cages: rotated }))
        assert.equal(calcudokuRecipeSignature({ size, cages: rotated }), key)
      }
    }
  }
  assert.equal(transforms.size, 8)
  const updated = { size, cages: cages.map((cage, index) =>
    index === 0 ? { ...cage, target: cage.target + 1 } : cage) }
  assert.notEqual(calcudokuRecipeSignature(updated), key)
})

test('Calcudoku prefers unseen boards and can reuse older boards after the search limit', () => {
  const seed = 0xc6be72a2
  const signatures = new Set<string>()
  const recipes = new Set<string>()
  const history = { signatures, recipes }
  const first = generateCalcudoku('easy', seed)
  assert.ok(first)
  const firstKey = calcudokuRecipeSignature(first)
  signatures.add(firstKey)

  const second = generateCalcudoku('easy', seed, new Set(), history)
  assert.ok(second)
  const secondKey = calcudokuRecipeSignature(second)
  assert.notEqual(secondKey, firstKey)
  signatures.add(secondKey)
  for (let next = generateCalcudoku('easy', seed, signatures); next; next = generateCalcudoku('easy', seed, signatures)) {
    signatures.add(calcudokuRecipeSignature(next))
  }

  const excluded = new Set([firstKey])
  const fallback = generateCalcudoku('easy', seed, excluded, history)
  assert.ok(fallback)
  assert.deepEqual(fallback, second)
  recipes.add(calcudokuRecipeKey(second))
  const alternate = generateCalcudoku('easy', seed, excluded, history)
  assert.ok(alternate)
  assert.notEqual(calcudokuRecipeKey(alternate), calcudokuRecipeKey(second))
  assert.notEqual(calcudokuRecipeSignature(alternate), firstKey)
  assert.equal(generateCalcudoku('easy', seed, signatures, history), null)
})

test('generated puzzle links reject unknown versions and malformed payloads', () => {
  for (const token of ['v2.YQ', 'v1.YQ', 'v1.' + 'a'.repeat(1801), 'v1.🧩']) {
    assert.equal(decodeGeneratedNumberPuzzle(token, 'kakuro'), null)
    assert.equal(decodeGeneratedNumberPuzzle(token, 'calcudoku'), null)
  }
})
