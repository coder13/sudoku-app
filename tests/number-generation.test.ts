import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calcudokuCatalog } from '../src/calcudoku/catalog.ts'
import {
  calcudokuCandidateSignatures, generateCalcudoku, calcudokuRecipeKey, calcudokuRecipeSignature,
} from '../src/calcudoku/generator.ts'
import { kakuroCatalog } from '../src/kakuro/catalog.ts'
import { findKakuroRecipes, generateKakuro, kakuroLayouts, kakuroRecipeFromPuzzle, kakuroRecipeSignature } from '../src/kakuro/generator.ts'
import { checkKakuro, findKakuroHint, solveKakuro } from '../src/kakuro/engine.ts'
import { checkLatin, findLatinHint, solveLatin } from '../src/latin/engine.ts'
import { numberPuzzleDifficulties } from '../src/number-puzzles/catalog.ts'
import {
  calcudokuFromRecipe, decodeGeneratedNumberPuzzle, encodeGeneratedNumberPuzzle, generatedNumberToken,
  kakuroFromRecipe, RECENT_GENERATED_PUZZLE_LIMIT,
} from '../src/number-puzzles/generated.ts'
import { generateNumberPuzzle, selectCalcudokuPlay } from '../src/number-puzzles/generation.ts'
import { seededIndex, shuffled } from '../src/number-puzzles/generation-random.ts'

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

test('Kakuro retries and keeps a fresh play available when both searches reach their limits', () => {
  const game = 'kakuro'
  const difficulty = 'hard'
  const seed = 7499330
  const retrySeed = (seed ^ 0x9e3779b1) >>> 0
  const excluded = new Set(kakuroCatalog.map(({ puzzle }) => kakuroRecipeSignature(puzzle)))
  const request = { game, difficulty, seed } as const
  const exhaustSeed = (value: number) => {
    const pick = seededIndex(value)
    const recipes = shuffled(kakuroLayouts.hard, pick)
      .flatMap(layout => findKakuroRecipes(layout, difficulty, excluded, pick, Infinity))
    return recipes.map(recipe => encodeGeneratedNumberPuzzle({ game, difficulty, recipe }))
  }

  const first = exhaustSeed(seed)
  assert.ok(first.length > 0)
  assert.equal(generateKakuro(difficulty, seed, excluded), null)
  const retry = generateKakuro(difficulty, retrySeed, excluded)
  assert.ok(retry)
  const retried = generateNumberPuzzle({ ...request, previous: first })
  assert.deepEqual(decodeGeneratedNumberPuzzle(retried, game), { game, difficulty, recipe: retry })

  const second = exhaustSeed(retrySeed)
  assert.equal(generateKakuro(difficulty, retrySeed, excluded), null)
  const exhausted = [...first, ...second]
  assert.ok(exhausted.length < RECENT_GENERATED_PUZZLE_LIMIT)
  const catalogPlay = generateNumberPuzzle({ ...request, previous: exhausted })
  const catalog = kakuroCatalog.find(entry => entry.difficulty === difficulty)
  assert.ok(catalog)
  assert.deepEqual(decodeGeneratedNumberPuzzle(catalogPlay, game), {
    game, difficulty, recipe: kakuroRecipeFromPuzzle(catalog.puzzle),
  })

  const filler = exhaustSeed(123).slice(0, RECENT_GENERATED_PUZZLE_LIMIT + 1 - exhausted.length)
  const previous = [...exhausted, ...filler]
  assert.equal(previous.length, RECENT_GENERATED_PUZZLE_LIMIT + 1)
  const replay = generateNumberPuzzle({ ...request, previous })
  const original = decodeGeneratedNumberPuzzle(first[0], game)
  assert.ok(original)
  assert.ok(generatedNumberToken(replay))
  assert.ok(!previous.includes(replay))
  assert.notEqual(generateNumberPuzzle({ ...request, previous }), replay)
  assert.equal(decodeGeneratedNumberPuzzle(replay, 'calcudoku'), null)
  assert.deepEqual(decodeGeneratedNumberPuzzle(replay, game), original)
  assert.equal(solveKakuro(kakuroFromRecipe(original.recipe), [], 1).status, 'unique')
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

test('Easy Calcudoku can generate a solvable board with a four-cell cage', () => {
  const recipe = generateCalcudoku('easy', 0)
  assert.ok(recipe)
  assert.equal(recipe.size, 3)
  assert.ok(recipe.cages.some(({ cells }) => cells.length === 4))
  assert.equal(solveLatin(calcudokuFromRecipe(recipe), [], 1).status, 'unique')
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

test('Calcudoku retries and gives exact replays fresh links outside the recent layouts', () => {
  const game = 'calcudoku'
  const difficulty = 'easy'
  const seed = 7499330
  const catalog = new Set(calcudokuCatalog.filter(entry => entry.difficulty === difficulty)
    .map(({ puzzle }) => calcudokuRecipeSignature(puzzle)))
  const retrySeed = (seed ^ 0x9e3779b1) >>> 0

  for (const replay of [false, true]) {
    const signatures = new Set<string>()
    const recipes = new Set<string>()
    const history = { signatures, recipes }
    const previous: string[] = []
    const remember = (recipe: NonNullable<ReturnType<typeof generateCalcudoku>>) => {
      const signature = calcudokuRecipeSignature(recipe)
      signatures.add(signature)
      recipes.add(calcudokuRecipeKey(recipe))
      previous.push(encodeGeneratedNumberPuzzle({ game, difficulty, recipe }))
      return signature
    }
    for (const blockedSeed of replay ? [seed, retrySeed] : [seed]) {
      while (true) {
        const recipe = generateCalcudoku(difficulty, blockedSeed, catalog, history)
        if (!recipe) break
        remember(recipe)
      }
    }

    const excluded = new Set(catalog)
    for (let i = 0; i < RECENT_GENERATED_PUZZLE_LIMIT; i++) {
      const filler = generateCalcudoku(difficulty, Math.imul(i + 1, 0x45d9f3b), new Set([...catalog, ...signatures]))
      assert.ok(filler)
      excluded.add(remember(filler))
    }
    assert.equal(generateCalcudoku(difficulty, seed, excluded, history), null)
    const retry = generateCalcudoku(difficulty, retrySeed, excluded, history)
    if (replay) assert.equal(retry, null)
    const expected = replay ? generateCalcudoku(difficulty, seed, excluded) : retry
    assert.ok(expected)
    const legacy = encodeGeneratedNumberPuzzle({ game, difficulty, recipe: expected })
    assert.equal(previous.includes(legacy), replay)

    const request = { game, difficulty, seed, previous } as const
    const candidates = new Set([
      ...calcudokuCandidateSignatures(difficulty, seed),
      ...calcudokuCandidateSignatures(difficulty, retrySeed),
    ])
    const recent = new Map<string, number>()
    const indexedSignatures = new Set<string>()
    const indexedRecipes = new Set<string>()
    for (const [index, token] of previous.entries()) {
      const board = decodeGeneratedNumberPuzzle(token, game)
      assert.ok(board)
      const signature = calcudokuRecipeSignature(board.recipe)
      if (index >= previous.length - RECENT_GENERATED_PUZZLE_LIMIT) recent.set(signature, index)
      if (!candidates.has(signature)) continue
      indexedSignatures.add(signature)
      indexedRecipes.add(calcudokuRecipeKey(board.recipe))
    }
    assert.deepEqual(selectCalcudokuPlay(request, recent, {
      signatures: indexedSignatures, recipes: indexedRecipes,
    }).recipe, expected)

    const token = generateNumberPuzzle(request)
    assert.ok(token && generatedNumberToken(token))
    assert.ok(!previous.includes(token))
    assert.notEqual(generateNumberPuzzle(request), token)
    assert.equal(decodeGeneratedNumberPuzzle(token, 'kakuro'), null)
    assert.deepEqual(decodeGeneratedNumberPuzzle(token, game), { game, difficulty, recipe: expected })
    assert.ok(!excluded.has(calcudokuRecipeSignature(expected)))
    assert.equal(solveLatin(calcudokuFromRecipe(expected), [], 1).status, 'unique')
  }
})

test('Calcudoku can use an older saved board or the catalog when all search attempts miss', () => {
  const game = 'calcudoku'
  const difficulty = 'easy'
  const seed = 7499330
  const catalog = calcudokuCatalog.filter(entry => entry.difficulty === difficulty)
  const recent = new Set(catalog.map(({ puzzle }) => calcudokuRecipeSignature(puzzle)))
  const previous = catalog.map(({ puzzle: { size, cages } }) =>
    encodeGeneratedNumberPuzzle({ game, difficulty, recipe: { size, cages: [...cages] } }))
  for (const blockedSeed of [seed, (seed ^ 0x9e3779b1) >>> 0]) {
    while (true) {
      const recipe = generateCalcudoku(difficulty, blockedSeed, recent)
      if (!recipe) break
      recent.add(calcudokuRecipeSignature(recipe))
      previous.push(encodeGeneratedNumberPuzzle({ game, difficulty, recipe }))
    }
  }
  const older = generateCalcudoku(difficulty, 123, recent)
  assert.ok(older)
  while (recent.size < RECENT_GENERATED_PUZZLE_LIMIT) {
    const filler = generateCalcudoku(difficulty, recent.size, new Set([...recent, calcudokuRecipeSignature(older)]))
    assert.ok(filler)
    recent.add(calcudokuRecipeSignature(filler))
    previous.push(encodeGeneratedNumberPuzzle({ game, difficulty, recipe: filler }))
  }
  const request = { game, difficulty, seed, previous } as const
  const fallback = generateNumberPuzzle(request)
  assert.ok(fallback)
  assert.deepEqual(decodeGeneratedNumberPuzzle(fallback, game), decodeGeneratedNumberPuzzle(previous[0], game))
  const olderToken = encodeGeneratedNumberPuzzle({ game, difficulty, recipe: older })
  const olderReplay = generateNumberPuzzle({ ...request, previous: [olderToken, ...previous] })
  assert.ok(olderReplay)
  assert.deepEqual(decodeGeneratedNumberPuzzle(olderReplay, game), { game, difficulty, recipe: older })
})

test('generated puzzle links reject unknown versions and malformed payloads', () => {
  for (const token of ['v3.YQ', 'v2.YQ', 'v2.YQ.invalid', 'v1.YQ', 'v1.' + 'a'.repeat(1801), 'v1.🧩']) {
    assert.equal(decodeGeneratedNumberPuzzle(token, 'kakuro'), null)
    assert.equal(decodeGeneratedNumberPuzzle(token, 'calcudoku'), null)
  }
})
