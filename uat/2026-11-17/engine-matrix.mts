// Reproduce with: node --experimental-strip-types uat/2026-11-17/engine-matrix.mts
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { generateClassic } from '../../src/sudoku/classic-generation.ts'
import { DIFFICULTY_LEVELS } from '../../src/sudoku/difficulty.ts'
import { createEngineHandler, type EngineExports } from '../../src/sudoku/engine-protocol.ts'
import { runEngine, type DeductionAction, type Difficulty, type EngineRequest, type EngineResponse, type VariantPuzzle } from '../../src/sudoku/engine.ts'
import { applyDeduction, hintEliminations, makeGame, replaceCandidates, valuesOf, type Game } from '../../src/sudoku/game.ts'
import { generatePlayableVariant, getVariantPlayOrder } from '../../src/sudoku/variant-play.ts'
import { VARIANTS, validVariantSave, variantDifficulties, variantHouseMasks, type PlayableVariant, type VariantId } from '../../src/sudoku/variants.ts'

const wasmBytes = await readFile(new URL('../../src/sudoku/generated/engine.wasm', import.meta.url))
const profile = JSON.parse(await readFile(new URL('../../src/sudoku/generated/engine-profile.json', import.meta.url), 'utf8'))
assert.equal(profile.profile, 'app')
assert.equal(profile.capabilities.variants, true)
assert.equal(profile.capabilities.generation, true)
class CompiledWorker {
  onmessage?: (event: { data: EngineResponse }) => void
  onerror?: () => void
  private handle = createEngineHandler(async () =>
    (await WebAssembly.instantiate(wasmBytes)).instance.exports as unknown as EngineExports)
  postMessage(message: { id: number; request: EngineRequest }) {
    void this.handle(message).then(data => this.onmessage?.({ data }), () => this.onerror?.())
  }
  terminate() {}
}
Object.defineProperty(globalThis, 'Worker', { value: CompiledWorker, configurable: true })

const indices = Array.from({ length: 9 }, (_, i) => i)
const allCells = Array.from({ length: 81 }, (_, i) => i)
const standardRegions = indices.map(box => indices.map(i => Math.floor(box / 3) * 27 + box % 3 * 3 + Math.floor(i / 3) * 9 + i % 3))
function distinctDigits(solution: string, cells: readonly number[], label: string) {
  assert.equal(cells.length, 9, label)
  assert.equal(new Set(cells.map(cell => solution[cell])).size, 9, label)
}
function validateSolution(puzzle: VariantPuzzle, solution: string) {
  assert.match(puzzle.givens, /^[0-9]{81}$/)
  assert.match(solution, /^[1-9]{81}$/)
  assert.ok(puzzle.givens.includes('0'), 'Generated puzzle has empty cells')
  for (const cell of allCells) if (puzzle.givens[cell] !== '0') assert.equal(solution[cell], puzzle.givens[cell], `Given at ${cell}`)
  for (const i of indices) {
    distinctDigits(solution, indices.map(c => i * 9 + c), `Row ${i + 1}`)
    distinctDigits(solution, indices.map(r => r * 9 + i), `Column ${i + 1}`)
  }
  const regions = puzzle.regions?.type === 'jigsaw' ? puzzle.regions.regions : standardRegions
  assert.deepEqual([...regions.flat()].sort((a, b) => a - b), allCells, 'Regions partition the grid')
  for (const region of regions) distinctDigits(solution, region, 'Region')
  const n = (cell: number) => Number(solution[cell])
  for (const rule of puzzle.rules ?? []) {
    switch (rule.type) {
      case 'diagonal': distinctDigits(solution, indices.map(i => rule.diagonal === 'main' ? i * 10 : i * 8 + 8), 'Diagonal'); break
      case 'extra-house': distinctDigits(solution, rule.cells, 'Extra house'); break
      case 'killer-cages': {
        for (const cage of rule.cages) {
          assert.equal(new Set(cage.cells.map(n)).size, cage.cells.length, 'Cage digits are distinct')
          assert.equal(cage.cells.reduce((sum, cell) => sum + n(cell), 0), cage.sum, 'Cage sum')
        }
        if (rule.coverGrid) assert.deepEqual(rule.cages.flatMap(cage => cage.cells).sort((a, b) => a - b), allCells, 'Cages cover the grid')
        break
      }
      case 'anti-knight':
        for (const a of allCells) for (const b of allCells) {
          if (Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) * Math.abs(a % 9 - b % 9) === 2) assert.notEqual(n(a), n(b), 'Knight peers')
        }
        break
      case 'thermometer':
        for (let i = 1; i < rule.cells.length; i++) assert.ok(n(rule.cells[i - 1]) < n(rule.cells[i]), 'Thermometer increases')
        break
      case 'arrow': assert.equal(n(rule.circle), rule.cells.reduce((sum, cell) => sum + n(cell), 0), 'Arrow sum'); break
      case 'kropki':
        for (const [a, b] of rule.consecutive?.pairs ?? []) assert.equal(Math.abs(n(a) - n(b)), 1, 'White dot')
        for (const [a, b] of rule.ratioTwo?.pairs ?? []) assert.ok(n(a) === 2 * n(b) || n(b) === 2 * n(a), 'Black dot')
        assert.ok(!rule.consecutive?.negative && !rule.ratioTwo?.negative, 'Offered recipes use positive Kropki clues')
        break
      default: assert.fail(`Add an independent validator for offered rule ${rule.type}`)
    }
  }
}
function validateMasks(puzzle: VariantPuzzle, solution: string, masks: readonly number[]) {
  assert.equal(masks.length, 81)
  for (const cell of allCells) {
    assert.ok(Number.isInteger(masks[cell]) && masks[cell] >= 0 && masks[cell] <= 511, `Candidate mask ${cell}`)
    if (puzzle.givens[cell] !== '0') assert.equal(masks[cell], 0)
    else {
      assert.ok(masks[cell] & (1 << (Number(solution[cell]) - 1)), `Solution candidate remains at ${cell}`)
      const regions = puzzle.regions?.type === 'jigsaw' ? puzzle.regions.regions : standardRegions
      const region = regions.find(cells => cells.includes(cell))!
      const peers = new Set([...indices.map(c => Math.floor(cell / 9) * 9 + c), ...indices.map(r => r * 9 + cell % 9), ...region])
      for (const rule of puzzle.rules ?? []) {
        if (rule.type === 'diagonal') {
          const cells = indices.map(i => rule.diagonal === 'main' ? i * 10 : i * 8 + 8)
          if (cells.includes(cell)) for (const peer of cells) peers.add(peer)
        } else if (rule.type === 'extra-house' && rule.cells.includes(cell)) for (const peer of rule.cells) peers.add(peer)
        else if (rule.type === 'killer-cages') {
          for (const cage of rule.cages) if (cage.cells.includes(cell)) for (const peer of cage.cells) peers.add(peer)
        } else if (rule.type === 'anti-knight') {
          for (const peer of allCells) if (Math.abs(Math.floor(cell / 9) - Math.floor(peer / 9)) * Math.abs(cell % 9 - peer % 9) === 2) peers.add(peer)
        }
      }
      for (const peer of peers) if (puzzle.givens[peer] !== '0') assert.equal(masks[cell] & (1 << (Number(puzzle.givens[peer]) - 1)), 0, `Given peer ${peer} is excluded at ${cell}`)
    }
  }
}
function validateHint(actions: readonly DeductionAction[], puzzle: VariantPuzzle, solution: string) {
  assert.ok(actions.length, 'Hint has actions')
  for (const action of actions) {
    const { cell, digit } = 'place' in action ? action.place : action.eliminate
    assert.ok(Number.isInteger(cell) && cell >= 0 && cell < 81)
    assert.ok(Number.isInteger(digit) && digit >= 1 && digit <= 9)
    assert.equal(puzzle.givens[cell], '0', 'Hint edits an empty cell')
    if ('place' in action) assert.equal(digit, Number(solution[cell]), 'Placement agrees with unique solution')
    else assert.notEqual(digit, Number(solution[cell]), 'Removal preserves unique solution')
  }
}

const results: Record<string, unknown>[] = []
const seeds = [0, 1]
const withHistory = !process.argv.includes('--independent')
assert.deepEqual(await runEngine({ type: 'capabilities' }), profile.capabilities)
const catalog = await runEngine({ type: 'techniques' })
const variantOrder = await getVariantPlayOrder()
const choices = (Object.keys(VARIANTS) as VariantId[]).flatMap(variant =>
  variantDifficulties(variant).filter((difficulty): difficulty is Difficulty => difficulty !== 'auto').map(difficulty => ({ variant, difficulty })))
const unsupportedChoices = (Object.keys(VARIANTS) as VariantId[]).filter(variant => variant !== 'classic').flatMap(variant =>
  DIFFICULTY_LEVELS.filter(difficulty => !variantDifficulties(variant).includes(difficulty)).map(difficulty => ({ variant, difficulty })))
const report = {
  startedAt: new Date().toISOString(), completedAt: '',
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  wasmSha256: createHash('sha256').update(wasmBytes).digest('hex'), profile,
  seeds, withHistory, choices, unsupportedChoices, results,
}
const output = new URL(`./engine-matrix${withHistory ? '' : '-independent'}-results.json`, import.meta.url)
for (const { variant, difficulty } of choices) {
  const previousBoards: string[] = []
  const previousGames: Game[] = []
  for (const seed of seeds) {
    const started = performance.now()
    const row: Record<string, unknown> = { variant, difficulty, seed, excludedPuzzles: withHistory ? previousBoards.length : 0 }
    try {
      const generated = variant === 'classic'
        ? await generateClassic(difficulty, seed, undefined, withHistory ? previousBoards : [])
        : await generatePlayableVariant(variant as PlayableVariant, difficulty, seed, withHistory ? previousGames : [])
      const puzzle: VariantPuzzle = 'board' in generated ? { version: 1, givens: generated.board } : generated.puzzle
      const solution = variant === 'classic'
        ? await runEngine({ type: 'solve', values: puzzle.givens }) : ('solution' in generated ? generated.solution : null)
      assert.ok(solution)
      validateSolution(puzzle, solution)
      if (withHistory && previousBoards.length) {
        if (variant === 'classic') {
          const keys = await runEngine({ type: 'canonical-puzzles', values: [...previousBoards, puzzle.givens] })
          assert.equal(new Set(keys).size, keys.length, 'New puzzle excludes equivalent saved structures')
        } else assert.ok(!previousBoards.includes(puzzle.givens), 'New variant puzzle differs from saved puzzles')
      }
      assert.deepEqual(generated.rating.status, { solved: difficulty })
      const analyze = (entries?: string) => variant === 'classic'
        ? runEngine({ type: 'analyze', values: entries ?? puzzle.givens })
        : runEngine({ type: 'variant', operation: 'analyze', position: { puzzle, entries } })
      assert.equal(await analyze(), 'unique')
      const masks = variant === 'classic'
        ? await runEngine({ type: 'notes', values: puzzle.givens })
        : await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle } })
      assert.ok(masks)
      validateMasks(puzzle, solution, masks)
      const hints = variant === 'classic'
        ? (await runEngine({ type: 'hints', values: puzzle.givens, techniqueOrder: catalog.difficultyOrder, limit: 10 })).choices
        : await runEngine({ type: 'variant', operation: 'hints', position: { puzzle }, techniqueOrder: variantOrder, limit: 10 })
      assert.ok(hints.length > 0)
      for (const hint of hints) validateHint(hint.actions, puzzle, solution)
      const game = makeGame('uat', 'UAT engine puzzle', puzzle.givens, 'generated')
      const next = applyDeduction(game, hints[0].actions, variant === 'classic' ? masks : variantHouseMasks(puzzle, puzzle.givens))
      assert.notDeepEqual(next.position, game.position, 'First hint makes progress')
      assert.equal(await analyze(variant === 'classic' ? valuesOf(next) : next.position.entries), 'unique')
      // Generate all candidates records rule-based removals before requesting hints.
      // Initial variant hints use house masks so those same rules can be taught.
      const removals = hintEliminations(puzzle.givens, masks)
      const hintsWithCandidates = variant === 'classic'
        ? (await runEngine({ type: 'hints', values: puzzle.givens, eliminations: removals, techniqueOrder: catalog.difficultyOrder, limit: 10 })).choices
        : await runEngine({ type: 'variant', operation: 'hints', position: { puzzle, eliminations: removals }, techniqueOrder: variantOrder, limit: 10 })
      assert.ok(hintsWithCandidates.length > 0)
      for (const hint of hintsWithCandidates) validateHint(hint.actions, puzzle, solution)
      const withCandidates = replaceCandidates(game, masks)
      const afterCandidatesHint = applyDeduction(withCandidates, hintsWithCandidates[0].actions, masks)
      assert.notDeepEqual(afterCandidatesHint.position, withCandidates.position, 'First hint after generating candidates makes progress')
      assert.equal(await analyze(variant === 'classic' ? valuesOf(afterCandidatesHint) : afterCandidatesHint.position.entries), 'unique')
      assert.equal(await analyze(variant === 'classic' ? solution : [...solution].map((digit, cell) => puzzle.givens[cell] === '0' ? digit : '0').join('')), 'unique')
      const solvedEntries = [...solution].map((digit, cell) => puzzle.givens[cell] === '0' ? digit : '0').join('')
      const solvedMasks = variant === 'classic'
        ? await runEngine({ type: 'notes', values: solution })
        : await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle, entries: solvedEntries } })
      assert.deepEqual(solvedMasks, Array(81).fill(0), 'Solved grid has no candidates')
      const solvedHints = variant === 'classic'
        ? (await runEngine({ type: 'hints', values: solution, limit: 10 })).choices
        : await runEngine({ type: 'variant', operation: 'hints', position: { puzzle, entries: solvedEntries }, techniqueOrder: variantOrder, limit: 10 })
      assert.deepEqual(solvedHints, [], 'Solved grid has no further hints')
      if (variant !== 'classic') {
        assert.ok(validVariantSave({ id: variant, puzzle, solution }, puzzle.givens))
        assert.equal(await runEngine({ type: 'variant', operation: 'solve', position: { puzzle } }), solution)
      }
      previousBoards.push(puzzle.givens)
      previousGames.push(variant === 'classic' ? game : { ...game, variant: { id: variant as PlayableVariant, puzzle, solution } })
      Object.assign(row, { status: 'passed', givens: puzzle.givens.replaceAll('0', '').length, puzzleHash: createHash('sha256').update(JSON.stringify(puzzle)).digest('hex'), hintsChecked: hints.length + hintsWithCandidates.length, hintModesChecked: 2, milliseconds: Math.round(performance.now() - started) })
    } catch (error) {
      Object.assign(row, { status: 'failed', error: error instanceof Error ? error.stack : String(error), milliseconds: Math.round(performance.now() - started) })
    }
    results.push(row)
    await writeFile(output, JSON.stringify(report, null, 2) + '\n')
    console.log(`${row.status} ${variant}/${difficulty} seed=${seed} ${row.milliseconds}ms${row.error ? ` ${String(row.error).split('\n')[0]}` : ''}`)
  }
}
for (const { variant, difficulty } of unsupportedChoices) {
  await assert.rejects(generatePlayableVariant(variant as PlayableVariant, difficulty, 0, []), { code: 'unsupported' })
}
report.completedAt = new Date().toISOString()
await writeFile(output, JSON.stringify(report, null, 2) + '\n')
const failures = results.filter(row => row.status !== 'passed')
console.log(JSON.stringify({ choices: choices.length, samples: results.length, unsupportedChoices: unsupportedChoices.length, passed: results.length - failures.length, failed: failures.length }))
if (failures.length) process.exitCode = 1
