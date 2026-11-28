import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEngine, type VariantDeduction, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { applyDeduction, enter, isSolved, makeGame, redo, restartGame, undo, valuesOf } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle, prepareSharedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleHintPage, puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { publishSharedPuzzle } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { generatePlayableVariant, getVariantPlayOrder, playCandidates, variantPosition } from '../src/sudoku/variant-play.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantHouseMasks, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { watchTechniqueScan } from '../src/sudoku/technique-scan.ts'
import { cloneLayout } from '../src/sudoku/clone.ts'
import { countLineSolutions } from './helpers/line-oracle.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { syncDatabase } from './helpers/sync-database.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { cloneFPuzzles } from './helpers/clone-export.ts'
useWasmWorker()

const sources = ['murphy', 'newman', 'mixed'].map(name => JSON.parse(readFileSync(new URL('./fixtures/clone-' + name + '.json', import.meta.url), 'utf8')) as { title: string; puzzle: VariantPuzzle; solution: string; originalOnlineUrl?: string; originalOnlineCode?: string })
const share = (puzzle: VariantPuzzle) => '#variant=' + encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))

function checkCloneProof(deduction: VariantDeduction, puzzle: VariantPuzzle) {
  assert.equal(deduction.technique, 'clone')
  assert.equal(deduction.evidence.type, 'constraint')
  if (deduction.evidence.type !== 'constraint') throw new Error('Clone needs equality premises')
  const { cells, domains, rules } = deduction.evidence
  assert.equal(cells.length, domains.length)
  assert.ok(rules.some(index => {
    const rule = puzzle.rules?.[index]
    return rule?.type === 'clone' && rule.groups.some(group => cells.every(cell => group.includes(cell)))
  }))
  // Enumerate the nine possible equal-digit assignments directly.
  const possible = Array.from({ length: 9 }, (_, i) => i + 1).filter(digit => domains.every(mask => mask & 1 << (digit - 1)))
  assert.ok(possible.length)
  for (const action of deduction.actions) {
    const candidate = 'place' in action ? action.place : action.eliminate
    const index = cells.indexOf(candidate.cell)
    assert.ok(index >= 0 && domains[index] & 1 << (candidate.digit - 1))
    if ('place' in action) assert.deepEqual(possible, [candidate.digit])
    else assert.ok(!possible.includes(candidate.digit))
  }
}

for (const [index, source] of sources.entries()) {
  test(source.title + ' imports all rules with multiple valid hints and a complete checked human path', async () => {
    const { game } = await prepareImportedPuzzle(share(source.puzzle))
    assert.deepEqual(game.variant!.puzzle, source.puzzle)
    assert.equal(game.variant!.solution, source.solution)
    assert.equal(game.variant!.id, index === 2 ? 'mixed' : 'clone')
    const candidates = await playCandidates(game)
    for (let cell = 0; cell < 81; cell++) if (game.givens[cell] === '0') assert.ok(candidates![cell] & 1 << (Number(source.solution[cell]) - 1))
    const choices = await puzzleHints(game)
    assert.ok(choices.choices.length > 1)
    const solution = await puzzleSolution(game)
    assert.notEqual(solution.rating.status, 'stalled')
    assert.equal(solution.board, source.solution)
    if (index < 2) {
      assert.equal(solution.rating.score.points, index === 0 ? 796 : 1114)
      assert.equal(solution.steps.length, index === 0 ? 71 : 89)
    }
    let play = game
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: source.puzzle }, techniqueOrder: await getVariantPlayOrder() })
    for (const step of trace.steps) {
      for (const action of step.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(source.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(source.solution[action.eliminate.cell]))
      }
      const before = play
      play = applyDeduction(play, step.actions, variantHouseMasks(source.puzzle, valuesOf(play), play.position.eliminations))
      assert.deepEqual(undo(play).position, before.position)
      assert.deepEqual(redo(undo(play)).position, play.position)
    }
    assert.ok(isSolved(play))
    assert.equal(valuesOf(play), source.solution)
    assertVariantCompletion(source.puzzle, source.solution)
    assert.equal(countLineSolutions(source.puzzle).solution, source.solution)
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: source.puzzle }, maxNodes: 20_000 }), 'unique')
    assert.equal(await runEngine({ type: 'variant', operation: 'solve', position: { puzzle: source.puzzle }, maxNodes: 20_000 }), source.solution)
  })
}

test('the original SudokuPad publications verify, offer Clone hints, and share their authored colors', async ({ mock }) => {
  const { sqlite, fetcher } = syncDatabase()
  const online = sources.filter(source => source.originalOnlineUrl)
  mock.method(globalThis, 'fetch', (path: string, init?: RequestInit) => {
    const source = online.find(source => path === source.originalOnlineUrl!.replace('sudokupad.app/', 'sudokupad.app/api/puzzle/'))
    return source ? Promise.resolve(new Response(source.originalOnlineCode)) : fetcher(path, init)
  })
  try {
    for (const [index, source] of online.entries()) {
      const { game, format } = await prepareImportedPuzzle(source.originalOnlineUrl!)
      assert.equal(format, 'SudokuPad')
      assert.deepEqual(game.variant?.puzzle, source.puzzle)
      assert.equal(game.variant?.solution, source.solution)
      assert.ok(game.givenCellColors)
      assert.equal(Object.keys(game.givenCellColors).length, index === 0 ? 24 : 28)

      const ranked = await puzzleHints(game)
      assert.equal(ranked.choices.length, 10)
      const selected = await puzzleHints(game, 'all', 'clone')
      const moves = new Set(selected.choices.flatMap(hint => hint.actions.map(action => JSON.stringify(action))))
      assert.ok(moves.size)
      const finder = watchTechniqueScan(valuesOf(game), game.position.eliminations, variantPosition(game.variant!, game.position))
      try { assert.equal(await finder.count('clone'), moves.size) } finally { finder.close() }

      const changed = applyDeduction(game, ranked.choices[0].actions, ranked.candidates!)
      assert.notEqual(changed, game)
      assert.deepEqual(undo(changed).position, game.position)
      assert.deepEqual(restartGame(changed).givenCellColors, game.givenCellColors)
      const restored = readGame(changed.id, JSON.stringify(changed))!
      assert.deepEqual(restored.variant, game.variant)
      assert.deepEqual(restored.givenCellColors, game.givenCellColors)
      const id = await publishSharedPuzzle(restored)
      const shared = await prepareSharedPuzzle(id, [], new AbortController().signal)
      assert.deepEqual(shared.game.variant, game.variant)
      assert.deepEqual(shared.game.givenCellColors, game.givenCellColors)

      const path = await puzzleSolution(game)
      assert.deepEqual(path.rating.status, { solved: 'easy' })
      assert.equal(path.steps.length, index === 0 ? 71 : 89)
      assert.equal(path.board, source.solution)
    }
  } finally { sqlite.close() }
})

test('disabled human techniques and explicit removals still enforce all Clone and companion rules', async () => {
  for (const source of sources) {
    const position = { puzzle: source.puzzle }
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: [], limit: 10 }), [])
    assert.equal((await runEngine({ type: 'variant', operation: 'rate', position, techniqueOrder: [] })).points, 0)
    assert.equal(await runEngine({ type: 'variant', operation: 'solve', position }), source.solution)
    const cell = source.puzzle.givens.indexOf('0'), removals = Array<number>(81).fill(0)
    removals[cell] = 1 << (Number(source.solution[cell]) - 1)
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { ...position, eliminations: removals } }), 'unsolvable')
  }
})

test('full typed f-puzzles Clone controls verify their printed solutions through the actual import preview', async () => {
  for (const source of sources.slice(0, 2)) {
    const { game } = await prepareImportedPuzzle(JSON.stringify(cloneFPuzzles(source.puzzle)))
    assert.deepEqual(game.variant!.puzzle, source.puzzle)
    assert.equal(game.variant!.solution, source.solution)
    assert.equal((await puzzleSolution(game)).board, source.solution)
    assert.ok((await puzzleHints(game)).choices.length > 1)
  }
})

test('every square transform preserves source equality, companion clues and exact completions', async () => {
  for (const source of sources) {
    const original = structuredClone(source.puzzle)
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const puzzle = reflectVariant(source.puzzle, symmetry), solution = transformedBoard(source.solution, symmetry)
      assertVariantCompletion(puzzle, solution)
      assert.equal(await runEngine({ type: 'variant', operation: 'solve', position: { puzzle } }), solution)
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle } }), 'unique')
    }
    assert.deepEqual(source.puzzle, original)
  }
})

test('Clone proof descriptions and Finder counts keep the actual matching letters before and after a placement', async () => {
  const source = sources[0], { game } = await prepareImportedPuzzle(share(source.puzzle))
  for (const current of [game, enter(game, [0], 'value', Number(source.solution[0]))]) {
    const position = variantPosition(current.variant!, current.position)
    const full = await runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: ['clone'], limit: 0xffff_ffff })
    assert.ok(full.length > 1)
    const choices = await puzzleHints(current, 'all', 'clone')
    assert.equal(choices.choices.length, full.length)
    for (const choice of choices.choices) {
      assert.ok('variant' in choice.evidence)
      assert.match(choice.evidence.variant.description, /Clone [A-Z]+ links .*These cells must contain the same digit/)
    }
    for (const deduction of full) {
      checkCloneProof(deduction, source.puzzle)
      assert.equal(deduction.evidence.type, 'constraint')
      if (deduction.evidence.type !== 'constraint') throw new Error('Clone needs its constraint premises')
      const set = cloneLayout(source.puzzle.rules).at[deduction.evidence.cells[0]]!
      assert.ok(deduction.evidence.cells.every(cell => set.cells.includes(cell)))
      for (const action of deduction.actions) {
        if ('place' in action) assert.equal(action.place.digit, Number(source.solution[action.place.cell]))
        else assert.notEqual(action.eliminate.digit, Number(source.solution[action.eliminate.cell]))
      }
    }
    const scan = watchTechniqueScan(valuesOf(current), current.position.eliminations, position)
    try { assert.equal(await scan.count('clone'), new Set(full.flatMap(d => d.actions.map(a => JSON.stringify(a)))).size) }
    finally { scan.close() }
  }
})

test('all selected Clone hint pages retain every proof and release only the requested collection', async () => {
  const source = sources[0]
  const rules = [...source.puzzle.rules!]
  for (let cell = 0; cell < 81; cell++) if (source.puzzle.givens[cell] === '0') {
    const anchor = [...source.puzzle.givens].findIndex(digit => digit !== '0' && digit === source.solution[cell])
    assert.ok(anchor >= 0)
    rules.push({ type: 'clone', groups: [[anchor, cell]] })
  }
  const { game } = await prepareImportedPuzzle(share({ ...source.puzzle, rules }))
  const full = await puzzleHints(game, 'all', 'clone')
  assert.ok(full.choices.length > 32)
  const first = await puzzleHints(game, 'all', 'clone', 841), collected = [...first.choices]
  while (collected.length < first.available) {
    const page = await puzzleHintPage(game.variant, 841, collected.length)
    assert.equal(page.offset, collected.length)
    assert.ok(page.choices.length)
    collected.push(...page.choices)
  }
  assert.deepEqual(collected, full.choices)
  const other = await puzzleHints(game, 'all', 'clone', 842)
  await runEngine({ type: 'release-hints', collection: 841 })
  assert.deepEqual((await puzzleHintPage(game.variant, 842, 0)).choices, other.choices)
  await runEngine({ type: 'release-hints', collection: 842 })
})

test('actual Easy New Puzzle generation yields twenty distinct independently unique Clone-dependent puzzles', async () => {
  const distinct = new Set<string>()
  for (let seed = 1; seed <= 20; seed++) {
    const result = await generatePlayableVariant('clone', 'easy', seed, [])
    assert.ok(result.givens > 0 && result.givens <= 30)
    assert.equal(result.ruleDependencies?.[0].rule, 'clone')
    assert.deepEqual(result.rating.status, { solved: 'easy' })
    assert.ok(result.rating.counts.clone)
    assertVariantCompletion(result.puzzle, result.solution)
    const counted = countLineSolutions(result.puzzle)
    assert.equal(counted.count, 1)
    assert.equal(counted.solution, result.solution)
    assert.equal(countLineSolutions({ ...result.puzzle, rules: [] }).count, 2)
    distinct.add(result.puzzle.givens)
  }
  assert.equal(distinct.size, 20)
})

test('New Puzzle repeats are deterministic and exclude played puzzles, mixed aliases and reordered equality sets in all orientations', async () => {
  const first = await generatePlayableVariant('clone', 'easy', 2, [])
  assert.deepEqual(await generatePlayableVariant('clone', 'easy', 2, []), first)
  const prior = { ...makeGame('clone-prior', 'Clone', first.puzzle.givens, 'generated'),
    variant: { id: 'clone' as const, puzzle: first.puzzle, solution: first.solution } }
  const reordered = { ...first.puzzle, rules: [...first.puzzle.rules!].reverse().map(rule => rule.type === 'clone'
    ? { ...rule, groups: [...rule.groups].reverse().map(cells => [...cells].reverse()) } : rule) }
  for (const puzzle of [first.puzzle, reflectVariant(first.puzzle, 3), reordered]) for (const id of ['clone', 'mixed'] as const) {
    const next = await generatePlayableVariant('clone', 'easy', 2, [{ ...prior, variant: { ...prior.variant, id, puzzle } }])
    for (let symmetry = 0; symmetry < 8; symmetry++) assert.notEqual(next.puzzle.givens, transformedBoard(first.puzzle.givens, symmetry))
    assert.deepEqual(next.rating.status, { solved: 'easy' })
    assert.equal(countLineSolutions(next.puzzle).solution, next.solution)
  }
})

test('three Clone practice positions and a fresh drill retain sound moves, matching clues and the 17-point Easy cost', async () => {
  const catalog = await runEngine({ type: 'techniques', variant: true }), technique = catalog.techniques.find(item => item.id === 'clone')!
  assert.equal(technique.cost, 17)
  assert.equal(technique.difficulty, 'easy')
  assert.equal(technique.requiresUniqueSolution, false)
  const examples = await runEngine({ type: 'practice-examples', variant: true, technique: 'clone' })
  assert.equal(examples.length, 3)
  const fresh = await runEngine({ type: 'generate-practice-example', variant: true, technique: 'clone', seed: 67, exclude: examples[0].position.puzzle.givens })
  for (const exercise of [...examples, fresh]) {
    checkCloneProof(exercise.deduction, exercise.position.puzzle)
    const counted = countLineSolutions(exercise.position.puzzle)
    assert.equal(counted.count, 1)
    assertVariantCompletion(exercise.position.puzzle, counted.solution!)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position, technique: 'clone', action: exercise.suggestion }), exercise.deduction)
    const action = exercise.suggestion, cell = 'place' in action ? action.place.cell : action.eliminate.cell
    assert.equal(await runEngine({ type: 'variant', operation: 'check-practice-move', position: exercise.position, technique: 'clone', action: { eliminate: { cell, digit: Number(counted.solution![cell]) } } }), null)
    assert.ok(cloneLayout(exercise.position.puzzle.rules).sets.length)
  }
})

test('actual mixed Clone storage reload preserves rules, progress, history and shared data', async () => {
  const source = sources[2], { game } = await prepareImportedPuzzle(share(source.puzzle))
  const keys = ['window', 'localStorage', 'sessionStorage'] as const, prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperties(globalThis, { window: { value: {}, configurable: true }, localStorage: { value: new MemoryStorage(), configurable: true }, sessionStorage: { value: new MemoryStorage(), configurable: true } })
  try {
    const module = '../src/sudoku/storage.ts?clone-save', { roomStore } = await import(module) as typeof import('../src/sudoku/storage.ts')
    roomStore.add(game)
    roomStore.update(game.id, saved => enter(saved, [0], 'value', Number(source.solution[0])))
    const next = '../src/sudoku/storage.ts?clone-reload'
    const restored = (await import(next) as typeof import('../src/sudoku/storage.ts')).roomStore.getSnapshot().games.find(saved => saved.id === game.id)!
    assert.deepEqual(restored.variant, game.variant)
    assert.equal(restored.position.entries[0], source.solution[0])
    assert.equal(undo(restored).position.entries[0], '0')
    assert.deepEqual(redo(undo(restored)).position, restored.position)
    assert.deepEqual((await prepareImportedPuzzle(share(restored.variant!.puzzle))).game.variant!.puzzle, source.puzzle)
  } finally { keys.forEach((key, i) => { if (prior[i]) Object.defineProperty(globalThis, key, prior[i]!); else Reflect.deleteProperty(globalThis, key) }) }
})
