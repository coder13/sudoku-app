import assert from 'node:assert/strict'
import { test } from 'node:test'
import { restoreSizedRuleGame } from '../src/sudoku/sized-rule-game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { makeGame } from '../src/sudoku/game.ts'
import { parsePuzzleExport, puzzleExportText } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { readCoachSolutionSources, standaloneCoachSolutionSources } from './helpers/coach-fixture-sources.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

const sources = readCoachSolutionSources()
useWasmWorker()

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
  assert.equal(sources.size, 81)
  const standaloneSeen = new Set<string>()
  const ruleFamilies = new Set<string>()
  const ruleInventories = new Set<string>()

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
      const families = [...new Set((imported.variant.puzzle.rules ?? []).map(rule => rule.type))].sort()
      for (const family of families) ruleFamilies.add(family)
      ruleInventories.add(families.join(','))
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
  assert.equal(ruleInventories.size, 52, 'the Coach corpus retains 52 distinct rule-family combinations')
  assert.equal(ruleFamilies.size, 34, 'the Coach corpus covers 34 imported rule families')
})

test('published Sudoku Coach variant sources pass full import preview verification', async () => {
  let checked = 0
  for (const source of sources.values()) {
    const imported = await detectPuzzle(source.code)
    if (!imported.variant) continue

    const preview = await prepareImportedPuzzle(source.code, [], { deferRating: true })
    assert.ok(preview.game.variant, `${source.references[0]}: preview retains the variant`)
    assert.deepEqual(preview.game.variant.puzzle, imported.variant.puzzle,
      `${source.references[0]}: preview retains every imported rule`)
    if (!preview.game.nonUnique) {
      assert.equal(preview.game.variant.solution, source.solution,
        `${source.references[0]}: unique preview matches the published completion`)
    } else {
      assertVariantCompletion(preview.game.variant.puzzle, preview.game.variant.solution!,
        `${source.references[0]}: alternate preview solution satisfies every imported rule`)
    }
    checked++
  }
  assert.equal(checked, 59)
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
  assert.equal(transformed, 472)
})

test('all published 9 × 9 Coach combinations survive actual library reload with progress and undo history', async () => {
  const local = new MemoryStorage()
  const keys = ['window', 'localStorage', 'sessionStorage'] as const
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })

  try {
    const { roomStore } = await import('../src/sudoku/storage.ts?coach-combinations-library-save')
    const expectedGames = new Map<string, ReturnType<typeof makeGame>>()
    let restoredCount = 0
    for (const source of sources.values()) {
      const imported = await detectPuzzle(source.code)
      if (!imported.variant) continue
      const game = makeGame(`coach-combination-${restoredCount}`, `Coach combination ${restoredCount + 1}`,
        imported.givens, 'imported')
      game.variant = { ...imported.variant, solution: source.solution }
      game.givenCellColors = imported.givenCellColors
      game.authoredArtwork = imported.authoredArtwork

      const originalPosition = game.position
      const entries = [...originalPosition.entries]
      let placed = 0
      for (let cell = 0; cell < imported.givens.length && placed < 3; cell++) {
        if (imported.givens[cell] !== '0') continue
        entries[cell] = source.solution[cell]
        placed++
      }
      game.position = { ...originalPosition, entries: entries.join('') }
      game.past = [originalPosition]

      const restored = readGame(game.id, JSON.stringify(game))
      assert.ok(restored, source.references[0])
      assert.deepEqual(restored.variant, game.variant, `${source.references[0]}: complete rule definition`)
      assert.deepEqual(restored.givenCellColors, game.givenCellColors, `${source.references[0]}: authored cell colors`)
      assert.deepEqual(restored.authoredArtwork, game.authoredArtwork, `${source.references[0]}: authored artwork`)
      assert.deepEqual(restored.position, game.position, `${source.references[0]}: current player entries`)
      assert.deepEqual(restored.past, game.past, `${source.references[0]}: undo history`)

      const exported = parsePuzzleExport(puzzleExportText(game))
      assert.equal(exported.givens, imported.givens, `${source.references[0]}: exported givens`)
      assert.deepEqual(exported.givenCellColors, game.givenCellColors, `${source.references[0]}: exported cell colors`)
      assert.deepEqual(exported.authoredArtwork, game.authoredArtwork, `${source.references[0]}: exported artwork`)
      assert.equal(exported.variant?.id, game.variant.id, `${source.references[0]}: exported variant family`)
      assert.deepEqual(exported.variant?.puzzle, game.variant.puzzle, `${source.references[0]}: exported complete rules`)
      assert.deepEqual(exported.variant?.fog, game.variant.fog, `${source.references[0]}: exported fog state`)

      const reimported = await detectPuzzle(puzzleExportText(game))
      assert.equal(reimported.format, 'Puzzle export', `${source.references[0]}: imported export format`)
      assert.equal(reimported.givens, imported.givens, `${source.references[0]}: reimported givens`)
      assert.deepEqual(reimported.givenCellColors, exported.givenCellColors, `${source.references[0]}: reimported cell colors`)
      assert.deepEqual(reimported.authoredArtwork, exported.authoredArtwork, `${source.references[0]}: reimported artwork`)
      assert.equal(reimported.variant?.id, game.variant.id, `${source.references[0]}: reimported variant family`)
      assert.deepEqual(reimported.variant?.puzzle, exported.variant?.puzzle, `${source.references[0]}: reimported complete rules`)
      assert.deepEqual(reimported.variant?.fog, exported.variant?.fog, `${source.references[0]}: reimported fog state`)

      roomStore.add(game)
      expectedGames.set(game.id, game)
      restoredCount++
    }
    assert.equal(restoredCount, 59)

    const reloaded = (await import('../src/sudoku/storage.ts?coach-combinations-library-reload')).roomStore.getSnapshot()
    assert.equal(reloaded.games.length, expectedGames.size, 'every imported Coach combination remains in the library')
    for (const [id, expected] of expectedGames) {
      const restored = reloaded.games.find(game => game.id === id)
      assert.ok(restored, `${id}: imported puzzle survives a library reload`)
      assert.deepEqual(restored.variant, expected.variant, `${id}: complete rule definition`)
      assert.deepEqual(restored.position, expected.position, `${id}: current player entries`)
      assert.deepEqual(restored.past, expected.past, `${id}: undo history`)
    }
  } finally {
    keys.forEach((key, index) => {
      const descriptor = originals[index]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
})
