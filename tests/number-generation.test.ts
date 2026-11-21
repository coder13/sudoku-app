import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calcudokuCatalog } from '../src/calcudoku/catalog.ts'
import {
  calcudokuCandidates, calcudokuCandidateSignatures, calcudokuClueVariants, generateCalcudoku,
  calcudokuRecipeKey, calcudokuRecipeKeys, calcudokuRecipeSignature,
} from '../src/calcudoku/generator.ts'
import { kakuroCatalog } from '../src/kakuro/catalog.ts'
import {
  findKakuroRecipes, generateKakuro, kakuroCandidates, kakuroHintDifficulty, kakuroLayouts, kakuroRecipeFromPuzzle,
  kakuroRecipeSignature, varyKakuroClues,
} from '../src/kakuro/generator.ts'
import { checkKakuro, findKakuroHint, solveKakuro } from '../src/kakuro/engine.ts'
import { checkLatin, findLatinHint, findLatinHints, findLatinSolutionHints, solveLatin } from '../src/latin/engine.ts'
import { numberPuzzleDifficulties } from '../src/number-puzzles/catalog.ts'
import {
  calcudokuFromRecipe, decodeGeneratedNumberPuzzle, encodeGeneratedNumberPuzzle, generatedNumberToken,
  kakuroFromRecipe, RECENT_GENERATED_PUZZLE_LIMIT,
} from '../src/number-puzzles/generated.ts'
import { calcudokuPlaySeeds, generateNumberPuzzle, selectCalcudokuPlay, summarizeKakuroLayouts } from '../src/number-puzzles/generation.ts'
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

test('Kakuro can exclude a candidate after an indexed lookup and continue the same search', () => {
  const seed = 0x5ca58d23
  for (const difficulty of numberPuzzleDifficulties) {
    const excluded = new Set<string>()
    const candidates = kakuroCandidates(difficulty, seed, excluded)
    for (let i = 0; i < 4; i++) {
      const candidate = candidates.next()
      assert.equal(candidate.done, false, difficulty)
      assert.ok(candidate.value)
      assert.deepEqual(candidate.value.recipe, generateKakuro(difficulty, seed, excluded))
      assert.equal(candidate.value.signature, kakuroRecipeSignature(kakuroFromRecipe(candidate.value.recipe)))
      assert.ok(!excluded.has(candidate.value.signature))
      excluded.add(candidate.value.signature)
    }
    candidates.return(undefined)
  }
})

test('Kakuro history keeps the latest valid play of each layout per difficulty', () => {
  const game = 'kakuro'
  const { puzzle, difficulty } = kakuroCatalog.find(entry => entry.id === 'easy-1')!
  const recipe = kakuroRecipeFromPuzzle(puzzle)
  const signature = kakuroRecipeSignature(puzzle)
  const first = encodeGeneratedNumberPuzzle({ game, difficulty, recipe })
  const later = encodeGeneratedNumberPuzzle({ game, difficulty, recipe }, '00000000-0000-0000-0000-000000000001')
  const medium = encodeGeneratedNumberPuzzle({ game, difficulty: 'medium', recipe })
  const broken = encodeGeneratedNumberPuzzle({ game, difficulty, recipe: [3, '/ . /'] })
  const sessions = [first, 'v1.invalid', medium, later, broken].map((id, index) => ({ id, number: index + 1 }))

  assert.deepEqual(summarizeKakuroLayouts(sessions), [
    { difficulty, signature, latest: 4, id: later },
    { difficulty: 'medium', signature, latest: 3, id: medium },
  ])
})

test('Kakuro tries fresh clues before a second seed or replay', () => {
  const game = 'kakuro'
  const difficulty = 'hard'
  const seed = 2
  const retrySeed = (seed ^ 0x9e3779b1) >>> 0
  const excluded = new Set(kakuroCatalog.map(({ puzzle }) => kakuroRecipeSignature(puzzle)))
  const request = { game, difficulty, seed } as const
  const save = (recipe: NonNullable<ReturnType<typeof generateKakuro>>) =>
    encodeGeneratedNumberPuzzle({ game, difficulty, recipe })
  const exhaustSeed = (value: number) => {
    const pick = seededIndex(value)
    const recipes = shuffled(kakuroLayouts.hard, pick)
      .flatMap(layout => findKakuroRecipes(layout, difficulty, excluded, pick, Infinity))
    for (let recipe = generateKakuro(difficulty, value, excluded); recipe; recipe = generateKakuro(difficulty, value, excluded)) {
      const signature = kakuroRecipeSignature(kakuroFromRecipe(recipe))
      assert.ok(!excluded.has(signature))
      excluded.add(signature)
      recipes.push(recipe)
    }
    return recipes.map(save)
  }

  const first = exhaustSeed(seed)
  assert.ok(first.length > 4)
  assert.equal(generateKakuro(difficulty, seed, excluded), null)

  // Keep the four most recent source grids fixed while filling the older history.
  const sources = first.slice(-4)
  const saved = first.slice(0, -4)
  const catalog = kakuroCatalog.filter(entry => entry.difficulty === difficulty)
  const sourcePuzzles = [
    ...sources.slice().reverse().map(token => kakuroFromRecipe(decodeGeneratedNumberPuzzle(token, game)!.recipe)),
    ...catalog.map(({ puzzle }) => puzzle),
  ]
  const previous = () => [...saved, ...sources]
  const fresh = decodeGeneratedNumberPuzzle(generateNumberPuzzle({ ...request, previous: previous() }), game)
  assert.ok(fresh)
  const puzzle = kakuroFromRecipe(fresh.recipe)
  assert.ok(!excluded.has(kakuroRecipeSignature(puzzle)))
  assert.equal(solveKakuro(puzzle, [], 1).status, 'unique')
  assert.equal(kakuroHintDifficulty(puzzle, puzzle.cells.filter(cell => cell === null).length), difficulty)
  assert.deepEqual(fresh.recipe, varyKakuroClues(difficulty, seed, excluded, sourcePuzzles))

  // Saturate the short search too, then verify the second seed still works.
  for (let next = varyKakuroClues(difficulty, seed, excluded, sourcePuzzles); next;
    next = varyKakuroClues(difficulty, seed, excluded, sourcePuzzles)) {
    excluded.add(kakuroRecipeSignature(kakuroFromRecipe(next)))
    saved.push(save(next))
  }
  const retry = generateKakuro(difficulty, retrySeed, excluded)
  assert.ok(retry)
  const retried = generateNumberPuzzle({ ...request, previous: previous() })
  assert.deepEqual(decodeGeneratedNumberPuzzle(retried, game), { game, difficulty, recipe: retry })

  saved.push(...exhaustSeed(retrySeed))
  assert.equal(generateKakuro(difficulty, retrySeed, excluded), null)
  assert.ok(previous().length < RECENT_GENERATED_PUZZLE_LIMIT)
  const catalogPlay = generateNumberPuzzle({ ...request, previous: previous() })
  assert.deepEqual(decodeGeneratedNumberPuzzle(catalogPlay, game), {
    game, difficulty, recipe: kakuroRecipeFromPuzzle(catalog[0].puzzle),
  })

  saved.push(...exhaustSeed(123).slice(0, RECENT_GENERATED_PUZZLE_LIMIT + 1 - previous().length))
  const history = previous()
  assert.equal(history.length, RECENT_GENERATED_PUZZLE_LIMIT + 1)
  const replay = generateNumberPuzzle({ ...request, previous: history })
  const original = decodeGeneratedNumberPuzzle(first[0], game)
  assert.ok(original)
  assert.ok(generatedNumberToken(replay))
  assert.ok(!history.includes(replay))
  assert.notEqual(generateNumberPuzzle({ ...request, previous: history }), replay)
  assert.equal(decodeGeneratedNumberPuzzle(replay, 'calcudoku'), null)
  assert.deepEqual(decodeGeneratedNumberPuzzle(replay, game), original)
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
        const transformed = { size, cages: rotated }
        const oriented = calcudokuRecipeKey(transformed)
        transforms.add(oriented)
        assert.equal(calcudokuRecipeSignature(transformed), key)
        assert.deepEqual(calcudokuRecipeKeys(transformed), { key: oriented, signature: key })
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

test('Calcudoku checks other seeds before replaying an older layout in a new orientation', () => {
  const game = 'calcudoku'
  const difficulty = 'easy'
  const seed = 7499330
  const [first, second] = calcudokuPlaySeeds(seed)
  const catalog = new Set(calcudokuCatalog.filter(entry => entry.difficulty === difficulty)
    .map(({ puzzle }) => calcudokuRecipeSignature(puzzle)))
  const signatures = new Set(calcudokuCandidateSignatures(difficulty, first))
  const history = { signatures, recipes: new Set<string>() }
  const older = generateCalcudoku(difficulty, first, catalog, history)
  assert.ok(older)
  assert.ok(signatures.has(calcudokuRecipeSignature(older)))
  const expected = generateCalcudoku(difficulty, second, new Set([...catalog, ...signatures]))
  assert.ok(expected)
  assert.deepEqual(selectCalcudokuPlay({ game, difficulty, seed }, new Map(), history, []), expected)
})

function* playableCalcudokuRecipes(candidates: ReturnType<typeof calcudokuCandidates>) {
  for (const { recipe, signature } of candidates) {
    if (solveLatin(calcudokuFromRecipe(recipe), [], 1).status === 'unique') yield { recipe, signature }
  }
}

test('Calcudoku opens fresh larger cages when all three regular seeds are exhausted', () => {
  const game = 'calcudoku'
  const seed = 7499330
  for (const [difficulty, cells] of [['easy', 5], ['medium', 4], ['hard', 5]] as const) {
    const signatures = new Set(calcudokuCatalog.filter(entry => entry.difficulty === difficulty)
      .map(({ puzzle }) => calcudokuRecipeSignature(puzzle)))
    const previous: string[] = []
    for (const playSeed of calcudokuPlaySeeds(seed)) {
      for (const { recipe, signature } of calcudokuCandidates(difficulty, playSeed)) {
        if (signatures.has(signature) || solveLatin(calcudokuFromRecipe(recipe), [], 1).status !== 'unique') continue
        signatures.add(signature)
        previous.push(encodeGeneratedNumberPuzzle({ game, difficulty, recipe }))
      }
    }
    assert.ok(previous.length > 0)
    for (let play = 0; play < 3; play++) {
      const token = generateNumberPuzzle({ game, difficulty, seed, previous })
      const decoded = decodeGeneratedNumberPuzzle(token, game)
      assert.ok(decoded)
      assert.equal(decoded.difficulty, difficulty)
      const { recipe } = decoded
      const signature = calcudokuRecipeSignature(recipe)
      assert.ok(!signatures.has(signature), difficulty)
      assert.ok(recipe.cages.some(cage => cage.cells.length === cells), difficulty)
      assert.equal(solveLatin(calcudokuFromRecipe(recipe), [], 1).status, 'unique')
      signatures.add(signature)
      previous.push(token)
    }
  }
})

test('Calcudoku tries a new cage clue before replay when the regular and larger cages are in history', () => {
  const game = 'calcudoku'
  const seed = 7499330
  for (const difficulty of numberPuzzleDifficulties) {
    const signatures = new Set(calcudokuCatalog.filter(entry => entry.difficulty === difficulty)
      .map(({ puzzle }) => calcudokuRecipeSignature(puzzle)))
    const previous: string[] = []
    const sources = Array.from(calcudokuCandidates(difficulty, seed), ({ recipe }) => recipe)
    const searches = calcudokuPlaySeeds(seed).map(playSeed => calcudokuCandidates(difficulty, playSeed))
    searches.push(calcudokuCandidates(difficulty, seed, { largerCage: true }))
    for (const search of searches) {
      for (const { recipe, signature } of playableCalcudokuRecipes(search)) {
        if (signatures.has(signature)) continue
        signatures.add(signature)
        previous.push(encodeGeneratedNumberPuzzle({ game, difficulty, recipe }))
      }
    }

    for (let play = 0; play < 3; play++) {
      const token = generateNumberPuzzle({ game, difficulty, seed, previous })
      const board = decodeGeneratedNumberPuzzle(token, game)
      assert.ok(board)
      assert.equal(board.difficulty, difficulty)
      const { recipe } = board
      const signature = calcudokuRecipeSignature(recipe)
      assert.ok(!signatures.has(signature), difficulty)
      const layout = JSON.stringify(recipe.cages.map(cage => cage.cells))
      assert.ok(sources.some(source => JSON.stringify(source.cages.map(cage => cage.cells)) === layout &&
        source.cages.filter((cage, i) => cage.operator !== recipe.cages[i].operator).length === 1), difficulty)
      assert.equal(solveLatin(calcudokuFromRecipe(recipe), [], 1).status, 'unique')
      signatures.add(signature)
      previous.push(token)
    }
  }
})

test('Calcudoku checks both retries and keeps exact replays outside the recent layouts', () => {
  const game = 'calcudoku'
  const difficulty = 'easy'
  const seed = 7499330
  const catalog = new Set(calcudokuCatalog.filter(entry => entry.difficulty === difficulty)
    .map(({ puzzle }) => calcudokuRecipeSignature(puzzle)))
  const seeds = calcudokuPlaySeeds(seed)

  for (const exhausted of [1, 2, 3]) {
    const replay = exhausted === seeds.length
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
    for (const blockedSeed of seeds.slice(0, exhausted)) {
      while (true) {
        const recipe = generateCalcudoku(difficulty, blockedSeed, catalog, history)
        if (!recipe) break
        remember(recipe)
      }
    }

    if (replay) {
      for (const search of [calcudokuCandidates(difficulty, seed, { largerCage: true }), calcudokuClueVariants(difficulty, seed)]) {
        for (const { recipe, signature } of playableCalcudokuRecipes(search)) {
          if (!signatures.has(signature) && !catalog.has(signature)) remember(recipe)
        }
      }
    }

    const excluded = new Set(catalog)
    for (let i = 0; i < RECENT_GENERATED_PUZZLE_LIMIT; i++) {
      const filler = generateCalcudoku(difficulty, Math.imul(i + 1, 0x45d9f3b), new Set([...catalog, ...signatures]))
      assert.ok(filler)
      excluded.add(remember(filler))
    }
    assert.equal(generateCalcudoku(difficulty, seed, excluded, history), null)
    const expected = replay
      ? generateCalcudoku(difficulty, seed, excluded)
      : generateCalcudoku(difficulty, seeds[exhausted], new Set([...excluded, ...signatures]))
    assert.ok(expected)
    const legacy = encodeGeneratedNumberPuzzle({ game, difficulty, recipe: expected })
    assert.equal(previous.includes(legacy), replay)

    const request = { game, difficulty, seed, previous } as const
    const candidates = new Set(seeds.flatMap(value => calcudokuCandidateSignatures(difficulty, value)))
    for (const search of [calcudokuCandidates(difficulty, seed, { largerCage: true }), calcudokuClueVariants(difficulty, seed)]) {
      for (const { signature } of search) candidates.add(signature)
    }
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
    }, previous), expected)

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
  for (const blockedSeed of calcudokuPlaySeeds(seed)) {
    while (true) {
      const recipe = generateCalcudoku(difficulty, blockedSeed, recent)
      if (!recipe) break
      recent.add(calcudokuRecipeSignature(recipe))
      previous.push(encodeGeneratedNumberPuzzle({ game, difficulty, recipe }))
    }
  }
  for (const search of [calcudokuCandidates(difficulty, seed, { largerCage: true }), calcudokuClueVariants(difficulty, seed)]) {
    for (const { recipe, signature } of playableCalcudokuRecipes(search)) {
      if (recent.has(signature)) continue
      recent.add(signature)
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

  // An exact replay has a new save ID and makes the original layout recent again.
  const recentReplay = generateNumberPuzzle({ ...request, previous: [olderToken, ...previous, olderReplay] })
  assert.notEqual(calcudokuRecipeSignature(decodeGeneratedNumberPuzzle(recentReplay, game)!.recipe),
    calcudokuRecipeSignature(older))
})

test('generated puzzle links reject unknown versions and malformed payloads', () => {
  for (const token of ['v2.YQ', 'v1.YQ', 'v1.' + 'a'.repeat(1801), 'v1.🧩']) {
    assert.equal(decodeGeneratedNumberPuzzle(token, 'kakuro'), null)
    assert.equal(decodeGeneratedNumberPuzzle(token, 'calcudoku'), null)
  }
})

test('Kakuro generation makes connected boards with varied run lengths and shapes', () => {
  for (const difficulty of numberPuzzleDifficulties) {
    const shapes = new Set<string>()
    for (let index = 0; index < 16; index++) {
      const seed = Math.imul(1679 + index, 0x45d9f3b) >>> 0
      const recipe = generateKakuro(difficulty, seed)
      assert.ok(recipe, difficulty)
      const { width, height, cells, runs } = kakuroFromRecipe(recipe)
      const lengths = runs.map(run => run.cells.length).sort((a, b) => a - b)
      shapes.add([Math.min(width, height), Math.max(width, height), lengths.join(',')].join(':'))

      const connected = new Set([cells.indexOf(null)])
      for (const cell of connected) {
        for (const run of runs.filter(run => run.cells.includes(cell))) {
          for (const next of run.cells) connected.add(next)
        }
      }
      assert.equal(connected.size, cells.filter(cell => cell === null).length)
    }
    assert.ok(shapes.size >= 8, `${difficulty} had ${shapes.size} distinct shapes`)
  }
})

test('Hard Calcudoku solutions can swap two digits across two rows and columns', () => {
  const recipe = generateCalcudoku('hard', 67)
  assert.ok(recipe)
  const { size } = recipe
  const { status, solution } = solveLatin(calcudokuFromRecipe(recipe), [], 1)
  assert.equal(status, 'unique')
  assert.ok(solution)
  const rows = Array.from({ length: size }, (_, row) => solution.slice(row * size, (row + 1) * size))
  // In a cyclic 5 × 5 square, no pair of rows swaps just two digits.
  assert.ok(rows.some((row, index) => rows.slice(index + 1).some(other =>
    row.some((digit, column) => {
      const opposite = row.indexOf(other[column])
      return opposite !== column && other[opposite] === digit
    }))))
})

test('Calcudoku signatures compare clues when two orientations share the same cage shape', () => {
  const recipe = {
    size: 3,
    cages: [
      { cells: [0, 1, 2], operator: 'multiply', target: 6 },
      { cells: [3, 4, 5], operator: 'multiply', target: 6 },
      { cells: [6, 7, 8], operator: 'add', target: 6 },
    ],
  } as const
  const reflected = { size: 3, cages: recipe.cages.map(cage => ({
    ...cage,
    cells: cage.cells.map(cell => (2 - Math.floor(cell / 3)) * 3 + cell % 3),
  })) }
  const first = calcudokuRecipeKey(recipe)
  const second = calcudokuRecipeKey(reflected)
  assert.ok(second < first)
  assert.equal(calcudokuRecipeSignature(recipe), second)
  assert.equal(calcudokuRecipeSignature(reflected), second)
})

test('Calcudoku can generate a puzzle with a column total in the first hint', () => {
  const game = 'calcudoku'
  const token = generateNumberPuzzle({ game, difficulty: 'hard', seed: 1470, previous: [] })
  const stored = decodeGeneratedNumberPuzzle(token, game)
  assert.ok(stored)
  const puzzle = calcudokuFromRecipe(stored.recipe)
  const simpler = { ...puzzle, rules: puzzle.rules.filter(rule => rule.kind !== 'line-total' && rule.kind !== 'cage-line') }
  assert.equal(findLatinHint(simpler, []), null)
  const hint = findLatinHint(puzzle, [])
  assert.equal(hint?.cell, 4)
  assert.equal(hint.value, 4)
  assert.equal(hint.rules[0].kind, 'line-total')
  assert.match(hint.rules[0].label, /Column 5 totals 15/)
  assert.equal(solveLatin(puzzle, [], 1).status, 'unique')
})

test('Calcudoku can generate and reopen puzzles that need advanced deductions', () => {
  for (const [seed, kind] of [
    [528673878, 'naked-pair'], [1509958913, 'naked-triple'], [119, 'cage-line'], [24, 'x-wing'],
  ] as const) {
    const game = 'calcudoku'
    const token = generateNumberPuzzle({ game, difficulty: 'hard', seed, previous: [] })
    const stored = decodeGeneratedNumberPuzzle(token, game)
    assert.equal(stored?.difficulty, 'hard')
    const puzzle = calcudokuFromRecipe(stored.recipe)
    const simpler = { ...puzzle, rules: puzzle.rules.filter(rule => rule.kind !== kind) }
    assert.equal(solveLatin(simpler, [], 1).status, 'search-limit', kind)
    const answer = solveLatin(simpler)
    assert.equal(answer.status, 'unique')
    const placements = findLatinHints(puzzle, [])
    assert.equal(placements.length, puzzle.givens.filter(value => !value).length)
    assert.ok(placements.some(hint => hint.rules.some(rule => rule.kind === kind)), kind)
    assert.ok(placements.every(({ cell, value }) => answer.solution?.[cell] === value))
  }
})

test('Hard Calcudoku prefers fresh advanced boards within a batch and falls back to a fresh basic board', () => {
  const game = 'calcudoku'
  const difficulty = 'hard'
  const seed = 2
  const basicRecipe = generateCalcudoku(difficulty, seed)
  assert.ok(basicRecipe)
  const previous: string[] = []
  const signatures = new Set<string>()

  for (let play = 0; play < 4; play++) {
    const token = generateNumberPuzzle({ game, difficulty, seed, previous })
    const stored = decodeGeneratedNumberPuzzle(token, game)
    assert.ok(stored)
    const puzzle = calcudokuFromRecipe(stored.recipe)
    const signature = calcudokuRecipeSignature(stored.recipe)
    const basicRules = puzzle.rules.filter(rule => !rule.afterBasic && rule.kind !== 'line-total')
    assert.ok(!signatures.has(signature))
    assert.equal(solveLatin({ ...puzzle, rules: basicRules }, [], 1).status, play < 3 ? 'search-limit' : 'unique')
    const answer = solveLatin(puzzle, [], 1)
    assert.equal(answer.status, 'unique')
    const walkthrough = findLatinSolutionHints(puzzle, [])
    assert.equal(walkthrough.length, puzzle.givens.filter(value => !value).length)
    assert.ok(walkthrough.every(({ cell, value }) => answer.solution?.[cell] === value))
    if (play === 3) assert.equal(signature, calcudokuRecipeSignature(basicRecipe))
    previous.push(token)
    signatures.add(signature)
  }
})
