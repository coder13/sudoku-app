import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine } from '../src/sudoku/engine.ts'
import { conflictsOf, enter, makeGame, redo, undo, valuesOf } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { parsePuzzleExport, puzzleDefinitionForSharing, puzzleExportText } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { syncRequest } from '../src/sudoku/sync-engine.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { terrainSandwichMaximum } from '../src/sudoku/terrain-sandwich.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const source = JSON.parse(readFileSync(new URL('./fixtures/coach-terrain.json', import.meta.url), 'utf8')) as {
  source: { sudoku: string; solution: string }
}

function terrainSandwichSupports(
  rule: Extract<NonNullable<NonNullable<Awaited<ReturnType<typeof detectPuzzle>>['variant']>['puzzle']['rules']>[number], { type: 'terrain-sandwich' }>,
  domains = Array<number>(rule.cells.length).fill(0x1ff),
) {
  const support = Array<number>(rule.cells.length).fill(0)
  const digits = Array<number>(rule.cells.length)
  const visit = (index: number, used: number) => {
    if (index === digits.length) {
      const values = digits.map((digit, cell) => digit * rule.transforms[cell].multiplier + rule.transforms[cell].offset)
      const ones = values.flatMap((value, cell) => value === 1 ? [cell] : [])
      const nines = values.flatMap((value, cell) => value === 9 ? [cell] : [])
      const prefix = [0]
      values.forEach(value => prefix.push(prefix.at(-1)! + value))
      const totals = ones.flatMap(one => nines.flatMap(nine => one === nine ? [] : [
        prefix[Math.max(one, nine)] - prefix[Math.min(one, nine) + 1],
      ]))
      if (totals.length && Math.max(...totals) === rule.maximum) {
        digits.forEach((digit, cell) => { support[cell] |= 1 << (digit - 1) })
      }
      return
    }
    for (let digit = 1; digit <= 9; digit++) {
      const bit = 1 << (digit - 1)
      if (used & bit || !(domains[index] & bit)) continue
      digits[index] = digit
      visit(index + 1, used | bit)
    }
  }
  visit(0, 0)
  return support
}

test('#196 imports the reviewed Terrain source and checks its transformed maxima in Wasm', async () => {
  const parsed = await detectPuzzle(source.source.sudoku)
  assert.ok(parsed.variant)
  assertVariantCompletion(parsed.variant.puzzle, source.source.solution)

  const rules = parsed.variant.puzzle.rules ?? []
  const firstTerrainRule = rules.findIndex(rule => rule.type === 'terrain-sandwich')
  assert.notEqual(firstTerrainRule, -1)
  const alteredRules = rules.map((rule, index) => index === firstTerrainRule && rule.type === 'terrain-sandwich'
    ? { ...rule, maximum: rule.maximum + 1 }
    : rule)
  const altered = await runEngine({ type: 'variant', operation: 'solve-unique', position: {
    puzzle: { ...parsed.variant.puzzle, rules: alteredRules },
  } })
  assert.notEqual(altered.status, 'unique', 'the Wasm engine must enforce every imported Terrain maximum')

  const ratioTwoCompanion = { type: 'kropki' as const, ratioTwo: { pairs: [[6, 15] as [number, number]] } }
  const combinedPuzzle = { ...parsed.variant.puzzle, rules: [...rules, ratioTwoCompanion] }
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle: combinedPuzzle } }),
    { status: 'unique', solution: source.source.solution })

  const firstRow = Array.from({ length: 9 }, (_, cell) => cell)
  const firstDigit = Number(source.source.solution[0])
  const firstRowXSum = {
    type: 'x-sum' as const,
    direction: 'east' as const,
    cells: firstRow,
    sum: [...source.source.solution.slice(0, firstDigit)].reduce((sum, digit) => sum + Number(digit), 0),
  }
  const firstRowValues = source.source.solution.slice(0, 9)
  const oneIndex = firstRowValues.indexOf('1'), nineIndex = firstRowValues.indexOf('9')
  assert.notEqual(oneIndex, -1)
  assert.notEqual(nineIndex, -1)
  const standardSandwich = {
    type: 'sandwich' as const,
    direction: 'east' as const,
    cells: firstRow,
    sum: firstRowValues.slice(Math.min(oneIndex, nineIndex) + 1, Math.max(oneIndex, nineIndex))
      .split('').reduce((sum, digit) => sum + Number(digit), 0),
  }
  const terrainWithXSums = { ...parsed.variant.puzzle,
    rules: [...rules, ratioTwoCompanion, firstRowXSum, standardSandwich] }
  assert.equal(terrainWithXSums.rules?.filter(rule => rule.type === 'terrain-sandwich').length, 15)
  assert.equal(terrainWithXSums.rules?.filter(rule => rule.type === 'sandwich').length, 1)
  assertVariantCompletion(terrainWithXSums, source.source.solution)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle: terrainWithXSums } }),
    { status: 'unique', solution: source.source.solution },
    'Terrain transforms, a marked ratio edge, and a source-derived X-Sum must compose in the engine')

  const { game } = await prepareImportedPuzzle(source.source.sudoku)
  assert.equal(game.variant?.solution, source.source.solution)
  assert.equal(game.givenCellColors && Object.keys(game.givenCellColors).length > 0, true)
  assert.deepEqual(readGame(game.id, JSON.stringify(game))?.variant, game.variant)
  assert.deepEqual(readGame(game.id, JSON.stringify(game))?.givenCellColors, game.givenCellColors)
  const shared = parsePuzzleExport(puzzleExportText(game))
  assert.deepEqual(shared.variant, { id: game.variant?.id, puzzle: game.variant?.puzzle })
  assert.deepEqual(shared.givenCellColors, game.givenCellColors)

  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    const combinedGame = { ...game, variant: { ...game.variant!, puzzle: combinedPuzzle } }
    const definition = puzzleDefinitionForSharing(combinedGame)
    const { id } = await api<{ id: string }>('shares', 'POST', definition)
    assert.deepEqual(await api(`shares/${id}`), JSON.parse(JSON.stringify(definition)))

    type RulePayload = {
      type: string
      cells?: number[]
      direction?: string
      maximum?: number
      transforms?: { multiplier: number; offset: number }[]
    }
    type VariantPayload = { puzzle: { rules: RulePayload[] } }
    const changeTerrain = (edit: (rule: RulePayload) => void) => {
      const invalid = JSON.parse(JSON.stringify(definition)) as { variant: VariantPayload }
      edit(invalid.variant.puzzle.rules.find(rule => rule.type === 'terrain-sandwich')!)
      return invalid
    }
    const invalidTransform = changeTerrain(rule => { rule.transforms![0].multiplier = 3 })
    const invalidMaximum = changeTerrain(rule => { rule.maximum = 127 })
    const invalidRay = changeTerrain(rule => { rule.cells!.reverse() })
    for (const invalid of [invalidTransform, invalidMaximum, invalidRay]) {
      await assert.rejects(api('shares', 'POST', invalid), { status: 400 })
    }
  } finally { sqlite.close() }
})

test('#196 variant generation preserves the imported Terrain rules and returns a unique puzzle', async () => {
  const parsed = await detectPuzzle(source.source.sudoku)
  assert.ok(parsed.variant)
  const template = { ...parsed.variant.puzzle, givens: '0'.repeat(81) }
  const generated = await runEngine({ type: 'generate-variant', seed: 8_675_309, maxAttempts: 3,
    maxNodes: 20_000, template, givens: [60, 60] })

  assert.equal(generated.givens, 60)
  assert.equal([...generated.puzzle.givens].filter(digit => digit !== '0').length, 60)
  assert.deepEqual(generated.puzzle.rules, template.rules)
  assert.equal(generated.puzzle.rules?.filter(rule => rule.type === 'terrain-sandwich').length, 15)
  assertVariantCompletion(generated.puzzle, generated.solution)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: {
    puzzle: generated.puzzle,
  } }), { status: 'unique', solution: generated.solution })
})

test('#196 transforms every Terrain ray and preserves the published solution under all eight symmetries', async () => {
  const parsed = await detectPuzzle(source.source.sudoku)
  assert.ok(parsed.variant)
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant(parsed.variant.puzzle, symmetry)
    const solution = transformedBoard(source.source.solution, symmetry)
    assertVariantCompletion(puzzle, solution)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } }),
      { status: 'unique', solution }, `symmetry ${symmetry}`)
  }
})

test('#196 Terrain candidates match an independent permutation oracle for every published clue', async () => {
  const parsed = await detectPuzzle(source.source.sudoku)
  assert.ok(parsed.variant)
  const rules = parsed.variant.puzzle.rules ?? []
  const terrainRules = rules.filter((rule): rule is Extract<typeof rule, { type: 'terrain-sandwich' }> => rule.type === 'terrain-sandwich')
  assert.equal(terrainRules.length, 15)

  for (const [index, rule] of terrainRules.entries()) {
    const expected = terrainSandwichSupports(rule)
    assert.ok(expected.every(mask => mask !== 0), `oracle clue ${index + 1} has support in every ray cell`)
    const puzzle = { ...parsed.variant.puzzle, givens: '0'.repeat(81), rules: [rule] }
    const actual = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle } })
    assert.ok(actual)
    assert.deepEqual(rule.cells.map(cell => actual[cell]), expected,
      `Terrain clue ${index + 1} candidate support must match all distinct-digit assignments`)
  }
})

test('#196 Terrain hint evidence names the actual value changes', async () => {
  const parsed = await detectPuzzle(source.source.sudoku)
  assert.ok(parsed.variant)
  const puzzle = parsed.variant.puzzle
  const deductions = await runEngine({ type: 'variant', operation: 'hints', position: { puzzle },
    techniqueOrder: ['sandwich'], limit: 10 })
  const deduction = deductions.find(item => item.evidence.type === 'constraint' &&
    item.evidence.rules.some(index => puzzle.rules?.[index]?.type === 'terrain-sandwich'))
  assert.ok(deduction, 'a published Terrain clue should produce an independently checkable hint')
  const hint = variantHintChoice(deduction, puzzle)
  assert.ok('variant' in hint.evidence)
  assert.match(hint.evidence.variant.description, /add 3 to the digits in/)
  assert.match(hint.evidence.variant.description, /subtract 3 from the digits in/)
  assert.match(hint.evidence.variant.description, /greatest total/)

  assert.equal(deduction.evidence.type, 'constraint')
  const terrainIndex = deduction.evidence.rules.find(index => puzzle.rules?.[index]?.type === 'terrain-sandwich')!
  const terrainRule = puzzle.rules![terrainIndex]
  assert.equal(terrainRule.type, 'terrain-sandwich')
  const domainsByCell = new Map(deduction.evidence.cells.map((cell, index) => [cell, deduction.evidence.domains[index]]))
  const ruleDomains = terrainRule.cells.map(cell => domainsByCell.get(cell) ?? 0x1ff)
  const independentlySupported = terrainSandwichSupports(terrainRule, ruleDomains)
  const eliminations = deduction.actions.filter((action): action is Extract<typeof action, { eliminate: unknown }> => 'eliminate' in action)
  assert.ok(eliminations.length, 'Terrain hint should provide at least one candidate elimination to replay')
  for (const action of eliminations) {
    const offset = terrainRule.cells.indexOf(action.eliminate.cell)
    assert.notEqual(offset, -1, 'Terrain elimination target belongs to the independently checked clue')
    assert.equal(independentlySupported[offset] & (1 << (action.eliminate.digit - 1)), 0,
      `Terrain clue ${terrainIndex + 1} must reject the eliminated digit under the evidence domains`)
  }

  const doubledIndex = puzzle.rules?.findIndex(rule => rule.type === 'terrain-sandwich' &&
    rule.transforms.some(transform => transform.multiplier === 2)) ?? -1
  assert.notEqual(doubledIndex, -1)
  const doubledRule = puzzle.rules![doubledIndex]
  assert.equal(doubledRule.type, 'terrain-sandwich')
  const doubledHint = variantHintChoice({
    ...deduction,
    evidence: { type: 'constraint', rules: [doubledIndex], cells: [...doubledRule.cells], domains: Array(9).fill(0x1ff) },
  }, puzzle)
  assert.ok('variant' in doubledHint.evidence)
  assert.match(doubledHint.evidence.variant.description, /double the digits in/)
})

test('#196 every Terrain hint premise matches the independent numeric oracle across player progress', async () => {
  const parsed = await detectPuzzle(source.source.sudoku)
  assert.ok(parsed.variant)
  const puzzle = parsed.variant.puzzle
  const emptyCells = [...parsed.givens].flatMap((digit, cell) => digit === '0' ? [cell] : [])
  let checkedHints = 0

  for (const enteredCount of [0, 10, 20, 30, 40, 50, 60]) {
    const entries = Array(81).fill('0')
    for (const cell of emptyCells.slice(0, enteredCount)) entries[cell] = source.source.solution[cell]
    const deductions = await runEngine({ type: 'variant', operation: 'hints', position: {
      puzzle, entries: entries.join(''),
    }, techniqueOrder: ['sandwich'], limit: 100 })
    assert.ok(deductions.length, `Terrain hints remain available after ${enteredCount} correct entries`)

    for (const [deductionIndex, deduction] of deductions.entries()) {
      if (deduction.evidence.type !== 'constraint') continue
      const terrainIndices = deduction.evidence.rules.filter(index => puzzle.rules?.[index]?.type === 'terrain-sandwich')
      if (!terrainIndices.length) continue
      assert.equal(terrainIndices.length, 1, `hint ${deductionIndex} has one Terrain premise`)
      assert.deepEqual(deduction.evidence.rules, terrainIndices, `hint ${deductionIndex} is attributed only to Terrain`)
      const rule = puzzle.rules![terrainIndices[0]]
      assert.equal(rule.type, 'terrain-sandwich')

      const domainsByCell = new Map(deduction.evidence.cells.map((cell, index) => [cell, deduction.evidence.domains[index]]))
      for (const cell of rule.cells) {
        assert.ok(domainsByCell.has(cell), `hint ${deductionIndex} includes the current domain for clue cell ${cell}`)
      }
      const ruleDomains = rule.cells.map(cell => domainsByCell.get(cell) ?? 0x1ff)
      const support = terrainSandwichSupports(rule, ruleDomains)
      const eliminations = deduction.actions.filter((action): action is Extract<typeof action, { eliminate: unknown }> => 'eliminate' in action)
      assert.ok(eliminations.length && eliminations.length === deduction.actions.length,
        `hint ${deductionIndex} contains only candidate removals`)
      for (const action of eliminations) {
        const offset = rule.cells.indexOf(action.eliminate.cell)
        assert.notEqual(offset, -1, `hint ${deductionIndex} removes a candidate in its Terrain clue`)
        assert.equal(support[offset] & (1 << (action.eliminate.digit - 1)), 0,
          `hint ${deductionIndex} after ${enteredCount} entries: clue ${terrainIndices[0] + 1} supports no ${action.eliminate.digit} at cell ${action.eliminate.cell}`)
      }

      const choice = variantHintChoice(deduction, puzzle)
      assert.ok('variant' in choice.evidence)
      const description = choice.evidence.variant.description
      assert.ok(description.includes(`maximum is ${rule.maximum}`), `hint ${deductionIndex} names its authored maximum`)
      for (const [index, transform] of rule.transforms.entries()) {
        const operation = transform.multiplier === 2 ? /double the digits in/
          : transform.offset > 0 ? /add 3 to the digits in/
            : transform.offset < 0 ? /subtract 3 from the digits in/ : undefined
        if (operation) {
          assert.match(description, operation, `hint ${deductionIndex} names the transformation at clue cell ${rule.cells[index]}`)
          const cell = rule.cells[index]
          assert.ok(description.includes(`r${Math.floor(cell / 9) + 1}c${cell % 9 + 1}`),
            `hint ${deductionIndex} names transformed cell ${cell}`)
        }
      }
      checkedHints++
    }
  }

  assert.ok(checkedHints >= 70, `the oracle replays the source's Terrain hints across progress states (got ${checkedHints})`)
})

test('#196 Terrain clues prune manual candidates, report conflicts, and survive input history', async () => {
  const parsed = await detectPuzzle(source.source.sudoku)
  assert.ok(parsed.variant)
  const { game: importedGame } = await prepareImportedPuzzle(source.source.sudoku)
  assert.equal(importedGame.variant?.solution, source.source.solution)
  const importedPuzzle = importedGame.variant!.puzzle
  const rule = parsed.variant.puzzle.rules?.find((candidate): candidate is Extract<typeof candidate, { type: 'terrain-sandwich' }> =>
    candidate.type === 'terrain-sandwich' && candidate.cells.filter(cell => importedPuzzle.givens[cell] === '0').length >= 2)
  assert.ok(rule)

  const importedMarkedGame = { ...importedGame, position: { ...importedGame.position,
    center: Array.from(importedPuzzle.givens, digit => digit === '0' ? 0x1ff : 0),
    corner: Array.from(importedPuzzle.givens, digit => digit === '0' ? 0x1ff : 0),
  } }
  const editableRuleCells = rule.cells.filter(cell => importedPuzzle.givens[cell] === '0')
  const importedCell = editableRuleCells[0]
  assert.notEqual(importedCell, undefined)
  const importedDigit = Number(source.source.solution[importedCell])
  const importedEntry = enter(importedMarkedGame, [importedCell], 'value', importedDigit)
  assert.equal(valuesOf(importedEntry)[importedCell], String(importedDigit))
  assert.deepEqual([...conflictsOf(valuesOf(importedEntry), importedPuzzle)], [],
    'a source-valid entry stays conflict-free with all fifteen Terrain clues and companion rules active')
  assert.deepEqual(importedEntry.variant?.puzzle.rules, parsed.variant.puzzle.rules,
    'manual play retains the complete imported Terrain and companion rule combination')
  const assertEngineCandidatesSurvivePlay = async (game: typeof importedEntry, stage: string) => {
    const exactCandidates = await runEngine({ type: 'variant', operation: 'candidates', position: {
      puzzle: importedPuzzle, entries: game.position.entries,
    } })
    assert.ok(exactCandidates)
    for (let cell = 0; cell < 81; cell++) if (valuesOf(game)[cell] === '0') {
      assert.equal(exactCandidates[cell] & ~game.position.center[cell], 0,
        `${stage}: Play center marks retain every engine-supported candidate at imported cell ${cell}`)
      assert.equal(exactCandidates[cell] & ~game.position.corner[cell], 0,
        `${stage}: Play corner marks retain every engine-supported candidate at imported cell ${cell}`)
    }
  }
  await assertEngineCandidatesSurvivePlay(importedEntry, 'after one entry')
  const importedSecondCell = editableRuleCells.find(cell => cell !== importedCell)!
  const importedSecondDigit = Number(source.source.solution[importedSecondCell])
  const importedProgress = enter(importedEntry, [importedSecondCell], 'value', importedSecondDigit)
  assert.deepEqual([...conflictsOf(valuesOf(importedProgress), importedPuzzle)], [],
    'a second source-valid entry stays conflict-free across the full imported combination')
  await assertEngineCandidatesSurvivePlay(importedProgress, 'after two entries')

  const restoredProgress = readGame(importedProgress.id, JSON.stringify(importedProgress))
  assert.ok(restoredProgress, 'the imported Terrain game reloads after player progress')
  assert.deepEqual(restoredProgress.variant, importedProgress.variant,
    'reload retains all Terrain and companion rules')
  assert.deepEqual(restoredProgress.position, importedProgress.position,
    'reload retains placed digits and manually pruned candidates')
  assert.deepEqual(restoredProgress.past, importedProgress.past,
    'reload retains the undo history for imported entries')
  assert.deepEqual([...conflictsOf(valuesOf(restoredProgress), importedPuzzle)], [],
    'reloaded source-valid entries remain conflict-free')
  await assertEngineCandidatesSurvivePlay(restoredProgress, 'after reload')
  assert.deepEqual(undo(restoredProgress).position, undo(importedProgress).position,
    'undo after reload restores the prior Terrain progress')
  assert.deepEqual(redo(undo(restoredProgress)).position, importedProgress.position,
    'redo after reload restores the imported Terrain progress')

  const local = new MemoryStorage()
  const storageKeys = ['window', 'localStorage', 'sessionStorage'] as const
  const storageGlobals = storageKeys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    localStorage: { value: local, configurable: true },
    sessionStorage: { value: new MemoryStorage(), configurable: true },
  })
  try {
    const { roomStore } = await import('../src/sudoku/storage.ts?coach-terrain-library-save')
    roomStore.add(importedProgress)
    const reloadedRoom = (await import('../src/sudoku/storage.ts?coach-terrain-library-reload')).roomStore.getSnapshot()
    const reopenedGame = reloadedRoom.games.find(game => game.id === importedProgress.id)
    assert.ok(reopenedGame, 'the imported Terrain game returns from a saved library reload')
    assert.deepEqual(reopenedGame.variant, importedProgress.variant,
      'the saved library retains all imported Terrain and companion rules')
    assert.deepEqual(reopenedGame.position, importedProgress.position,
      'the saved library retains placed digits and candidate marks')
    assert.deepEqual(reopenedGame.past, importedProgress.past,
      'the saved library retains undo history')
    assert.deepEqual(redo(undo(reopenedGame)).position, importedProgress.position,
      'the saved library restores working undo and redo history')
  } finally {
    storageKeys.forEach((key, index) => {
      const descriptor = storageGlobals[index]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    })
  }

  const puzzle = { ...parsed.variant.puzzle, givens: '0'.repeat(81), rules: [rule] }
  const game = { ...makeGame('terrain-play-input', 'Terrain', puzzle.givens, 'imported'),
    variant: { id: 'mixed' as const, puzzle, solution: source.source.solution } }
  const firstCell = rule.cells[0]
  const digit = Number(source.source.solution[firstCell])
  const domains = rule.cells.map(cell => cell === firstCell ? 1 << (digit - 1) : 0x1ff)
  const expected = terrainSandwichSupports(rule, domains)
  const marked = {
    ...game,
    position: { ...game.position,
      center: game.position.center.map((mask, cell) => rule.cells.includes(cell) ? 0x1ff : mask),
      corner: game.position.corner.map((mask, cell) => rule.cells.includes(cell) ? 0x1ff : mask),
    },
  }
  const entered = enter(marked, [firstCell], 'value', digit)
  assert.equal(valuesOf(entered)[firstCell], String(digit))
  for (const [index, cell] of rule.cells.entries()) {
    if (cell === firstCell) continue
    assert.equal(entered.position.center[cell], expected[index], `center candidates at Terrain cell ${cell}`)
    assert.equal(entered.position.corner[cell], expected[index], `corner candidates at Terrain cell ${cell}`)
  }
  assert.deepEqual(undo(entered).position, marked.position)
  assert.deepEqual(redo(undo(entered)).position, entered.position)

  const terrainRules = parsed.variant.puzzle.rules?.filter(candidate => candidate.type === 'terrain-sandwich') ?? []
  assert.equal(terrainRules.length, 15)
  for (const [clueIndex, clue] of terrainRules.entries()) {
    const cell = clue.cells[0]
    const placedDigit = Number(source.source.solution[cell])
    const cluePuzzle = { ...puzzle, rules: [clue] }
    const clueGame = { ...makeGame(`terrain-play-clue-${clueIndex}`, 'Terrain', cluePuzzle.givens, 'imported'),
      variant: { id: 'mixed' as const, puzzle: cluePuzzle, solution: source.source.solution } }
    const clueMarked = { ...clueGame, position: { ...clueGame.position,
      center: clueGame.position.center.map((mask, candidateCell) => clue.cells.includes(candidateCell) ? 0x1ff : mask),
      corner: clueGame.position.corner.map((mask, candidateCell) => clue.cells.includes(candidateCell) ? 0x1ff : mask),
    } }
    const clueEntered = enter(clueMarked, [cell], 'value', placedDigit)
    const clueDomains = clue.cells.map(candidateCell => candidateCell === cell ? 1 << (placedDigit - 1) : 0x1ff)
    const clueExpected = terrainSandwichSupports(clue, clueDomains)
    for (const [index, candidateCell] of clue.cells.entries()) {
      if (candidateCell === cell) continue
      assert.equal(clueEntered.position.center[candidateCell], clueExpected[index], `clue ${clueIndex + 1} center candidates at cell ${candidateCell}`)
      assert.equal(clueEntered.position.corner[candidateCell], clueExpected[index], `clue ${clueIndex + 1} corner candidates at cell ${candidateCell}`)
    }

    const secondCell = clue.cells[1]
    const secondDigit = Number(source.source.solution[secondCell])
    const clueAdvanced = enter(clueEntered, [secondCell], 'value', secondDigit)
    const advancedDomains = clue.cells.map(candidateCell => candidateCell === cell ? 1 << (placedDigit - 1)
      : candidateCell === secondCell ? 1 << (secondDigit - 1) : 0x1ff)
    const advancedExpected = terrainSandwichSupports(clue, advancedDomains)
    for (const [index, candidateCell] of clue.cells.entries()) {
      if (candidateCell === cell || candidateCell === secondCell) continue
      assert.equal(clueAdvanced.position.center[candidateCell], advancedExpected[index],
        `clue ${clueIndex + 1} center candidates after two entries at cell ${candidateCell}`)
      assert.equal(clueAdvanced.position.corner[candidateCell], advancedExpected[index],
        `clue ${clueIndex + 1} corner candidates after two entries at cell ${candidateCell}`)
    }
  }

  let badDigits: number[] | undefined
  for (let left = 0; left < rule.cells.length && !badDigits; left++) for (let right = left + 1; right < rule.cells.length; right++) {
    const digits = rule.cells.map(cell => Number(source.source.solution[cell]))
    ;[digits[left], digits[right]] = [digits[right], digits[left]]
    if (terrainSandwichMaximum(rule, digits) !== rule.maximum) { badDigits = digits; break }
  }
  assert.ok(badDigits, 'a digit swap should violate this Terrain clue while keeping the ray a permutation')
  const invalid = Array(81).fill('0')
  rule.cells.forEach((cell, index) => { invalid[cell] = String(badDigits![index]) })
  assert.deepEqual([...conflictsOf(invalid.join(''), puzzle)].sort((a, b) => a - b), [...rule.cells].sort((a, b) => a - b),
    'the Play conflict path reports every placed digit in an invalid complete Terrain ray')
})
