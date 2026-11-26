import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fillEntries, isSolved } from '../src/sudoku/game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { publishSharedPuzzle, puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { runSizedRuleAlternatives, verifySizedRulePuzzle, type SizedRuleDefinition } from '../src/sudoku/sized-rule-game.ts'
import { sizedRuleCandidates, sizedRuleHintChoices, sizedRuleSingles, sizedRuleSolutionTrace } from '../src/sudoku/sized-rule-play.ts'
import type { SizedConstraintAlternativesRule, SizedConstraintRule } from '../src/sudoku/engine.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import worker from '../cloudflare/pages/_worker.js'

useWasmWorker()

const code = readFileSync(new URL('./fixtures/sudokupad-double-clues.ctc', import.meta.url), 'utf8').trim()

function relaxedChoices(group: SizedConstraintAlternativesRule): SizedConstraintRule[][] {
  if (group.family === 'killer') {
    const source = group.choices[0][0]
    assert.equal(source.type, 'killer-cages')
    if (source.type !== 'killer-cages') throw new Error('Expected Killer alternatives.')
    return Array.from({ length: 1 << source.cages.length }, (_, mask) => [{
      type: 'killer-cages',
      cages: source.cages.map((cage, index) => ({ ...cage, sum: mask & (1 << index) ? 12 : 6 })),
    }])
  }
  if (group.family === 'kropki') {
    const source = group.choices[0][0]
    assert.equal(source.type, 'kropki')
    if (source.type !== 'kropki') throw new Error('Expected Kropki alternatives.')
    const pairs = [...(source.consecutive?.pairs ?? []), ...(source.ratioTwo?.pairs ?? [])]
    return Array.from({ length: 1 << pairs.length }, (_, mask) => {
      const consecutive = pairs.filter((_, index) => !(mask & (1 << index)))
      const doubled = pairs.filter((_, index) => mask & (1 << index))
      return [
        ...(consecutive.length ? [{ type: 'kropki', consecutive: { pairs: consecutive } } as SizedConstraintRule] : []),
        ...(doubled.length ? [{ type: 'labeled-dots', relation: 'difference', marks: doubled.map(cells => ({ cells, value: 2 })) } as SizedConstraintRule] : []),
      ]
    })
  }
  if (group.family === 'little-killer') {
    const source = group.choices[0]
    const numeric = source.filter((rule): rule is Extract<SizedConstraintRule, { type: 'little-killer' }> => rule.type === 'little-killer')
    const odd = source.find((rule): rule is Extract<SizedConstraintRule, { type: 'sum-modulo' }> => rule.type === 'sum-modulo')
    assert.equal(numeric.length, 2)
    assert.ok(odd)
    return Array.from({ length: 8 }, (_, mask) => [
      ...numeric.map(rule => ({ ...rule, sum: mask & (1 << numeric.indexOf(rule)) ? 10 : 5 })),
      { ...odd, modulus: mask & 4 ? 4 : 2, remainder: mask & 4 ? 2 : 1 },
    ])
  }
  if (group.family === 'sandwich') {
    const source = group.choices[0].filter((rule): rule is Extract<SizedConstraintRule, { type: 'sandwich' }> => rule.type === 'sandwich')
    assert.equal(source.length, 4)
    return Array.from({ length: 16 }, (_, mask) => source.map((rule, index) => ({
      ...rule, sum: mask & (1 << index) ? 14 : 7,
    })))
  }
  throw new Error(`Unexpected family ${group.family}`)
}

async function solveAcrossInterpretations(definition: SizedRuleDefinition) {
  const position = {
    version: 2 as const,
    grid: definition.grid,
    digits: Array.from(definition.givens, Number),
    rules: definition.rules,
  }
  const branches = await runSizedRuleAlternatives({ type: 'sized-variant', operation: 'solve-unique', position })
  const solutions = new Set(branches.flatMap(branch => branch.status === 'unique' ? [branch.solution.digits.join('')] : []))
  return branches.some(branch => branch.status === 'multiple') || solutions.size > 1 ? 'multiple'
    : branches.some(branch => branch.status === 'search-limit') ? 'search-limit'
      : solutions.size === 1 ? 'unique' : branches.some(branch => branch.status === 'unsolvable') ? 'unsolvable' : 'conflict'
}

test('#430 parses and uniquely solves the original exact-one-doubled puzzle', async () => {
  const imported = await detectPuzzle(code)
  assert.equal(imported.title, 'Double The Clues, Double The Fun')
  assert.deepEqual(imported.grid, { size: 6, boxRows: 2, boxColumns: 3 })
  assert.ok(imported.sizedRules)
  assert.deepEqual(imported.sizedRules.filter(rule => rule.type === 'constraint-alternatives').map(rule => [rule.family, rule.choices.length]), [
    ['killer', 2], ['kropki', 2], ['little-killer', 3], ['sandwich', 4],
  ])
  assert.equal(imported.authoredSolution, '346521125463264135513642652314431256')

  const definition: SizedRuleDefinition = {
    grid: imported.grid!, givens: imported.givens, rules: imported.sizedRules!, authoredSolution: imported.authoredSolution,
  }
  const game = await verifySizedRulePuzzle(definition)
  assert.equal(game.solution, imported.authoredSolution)
  assert.ok(await sizedRuleCandidates(game, definition.grid, definition.givens))
  assert.ok(await sizedRuleHintChoices(game, definition.grid, definition.givens))
  assert.equal((await sizedRuleSolutionTrace(game, definition.grid, definition.givens)).board, imported.authoredSolution)
  assert.equal(await sizedRuleSingles(game, definition.grid, definition.givens), imported.authoredSolution)
})

test('#430 exact-one groups reject impossible clues and expose ambiguity controls', async () => {
  const imported = await detectPuzzle(code)
  assert.ok(imported.grid && imported.sizedRules && imported.authoredSolution)
  const definition: SizedRuleDefinition = { grid: imported.grid, givens: imported.givens, rules: imported.sizedRules }
  const littleKiller = definition.rules.find(rule => rule.type === 'constraint-alternatives' && rule.family === 'little-killer')
  assert.ok(littleKiller && littleKiller.type === 'constraint-alternatives')
  const impossibleRules = definition.rules.map(rule => rule === littleKiller ? {
    ...rule,
    choices: rule.choices.map(choice => choice.map(item => item.type === 'little-killer' ? { ...item, sum: item.sum + 1 } : item)),
  } : rule)
  assert.equal(await solveAcrossInterpretations({ ...definition, givens: imported.authoredSolution, rules: impossibleRules }), 'conflict')

  for (const family of ['kropki', 'little-killer', 'sandwich']) {
    const rules = definition.rules.map(rule => rule.type === 'constraint-alternatives' && rule.family === family
      ? { ...rule, choices: relaxedChoices(rule) }
      : rule)
    assert.equal(await solveAcrossInterpretations({ ...definition, rules }), 'multiple', `${family} without exact-one semantics`)
  }
})

test('#430 explains when placed digits force a doubled clue', async () => {
  const imported = await detectPuzzle(code)
  assert.ok(imported.grid && imported.sizedRules && imported.authoredSolution)
  const definition: SizedRuleDefinition = { grid: imported.grid, givens: imported.givens, rules: imported.sizedRules }
  const game = await verifySizedRulePuzzle({ ...definition, authoredSolution: imported.authoredSolution })
  const values = Array.from(imported.authoredSolution, (digit, cell) => cell < 20 ? digit : '0').join('')
  const result = await sizedRuleHintChoices(game, definition.grid, values)
  const interpretationHint = result?.choices.find(choice => choice.technique === 'sized-clue-interpretation')
  assert.ok(interpretationHint)
  assert.match(interpretationHint.evidence.variant.description, /digits placed rule out doubling the Killer cage beginning at R4C2/)
  assert.match(interpretationHint.evidence.variant.description, /double the Killer cage beginning at R2C2/)
  assert.match(interpretationHint.evidence.variant.reason, /each remaining interpretation/)
})

test('#430 retains doubled-clue interpretations through saved reload and sharing', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    mock.method(globalThis, 'fetch', (path: string | URL, options?: RequestInit) =>
      fetcher(new URL(String(path), 'https://sudoku.test'), options))
    const { game } = await prepareImportedPuzzle(code)
    assert.ok(game.sized)
    const finished = fillEntries(game, game.sized.solution)
    assert.equal(isSolved(finished), true)
    const saved = readGame(finished.id, JSON.stringify(finished))
    assert.deepEqual(saved?.sized, game.sized)
    assert.equal(saved?.position.entries, game.sized.solution)

    const definition = puzzleDefinitionForSharing(game)
    const response = await fetcher('/api/v1/shares', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(definition) })
    assert.equal(response.status, 201, await response.clone().text())
    const nestedRules = (definition.sixRules ?? []).map(rule => rule.type === 'constraint-alternatives'
      ? { ...rule, choices: rule.choices.map(() => [{ ...rule }]) }
      : rule)
    const rejectedNested = await fetcher('/api/v1/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...definition, sixRules: nestedRules }) })
    assert.equal(rejectedNested.status, 400, 'share validation must reject nested interpretation groups')
    const id = await publishSharedPuzzle(game)
    const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
    assert.deepEqual(shared.game.sized, game.sized)
    assert.equal(shared.game.givens, game.givens)
    assert.equal(shared.game.sized?.rules.filter(rule => rule.type === 'constraint-alternatives').length, 4)
  } finally {
    sqlite.close()
  }
})
