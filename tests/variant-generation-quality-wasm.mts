import assert from 'node:assert/strict'
import test from 'node:test'
import { generateCustomSudoku } from '../src/sudoku/custom-generation.ts'
import { DIFFICULTY_LEVELS } from '../src/sudoku/difficulty.ts'
import { runEngine, type Candidate, type VariantDeduction, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { variantHouseCells } from '../src/sudoku/variants.ts'
import { connectedGridCells } from '../src/sudoku/grid.ts'
import { lessonDiagram } from '../src/sudoku/lesson-diagram.ts'
import { getVariantPlayOrder } from '../src/sudoku/variant-play.ts'
import { variantHintChoice } from '../src/sudoku/variant-hints.ts'
import { EMPTY, makeGame, peer } from '../src/sudoku/game.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { hasReadableArrowLayout } from '../src/sudoku/arrow-layout.ts'
useWasmWorker()

test('zero-given X-Sum and diagonal need both rules on the Hard solve path', async () => {
  const { puzzle, solution, rating, ruleDependencies } = await generateCustomSudoku(['x-sum', 'diagonal-main'], 'hard', 5, [], { miracle: true })
  assert.equal(puzzle.givens, EMPTY)
  assert.deepEqual(rating.status, { solved: 'hard' })
  assert.equal(await runEngine({ type: 'analyze', values: puzzle.givens }), 'multiple')
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } }), { status: 'unique', solution })
  const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder: rating.techniqueOrder })
  assert.deepEqual(new Set(ruleDependencies?.map(proof => proof.rule)), new Set(['x-sum', 'diagonal-main']))
  for (const proof of ruleDependencies!) {
    const reduced = { ...puzzle, rules: puzzle.rules!.filter(rule => rule.type !== (proof.rule === 'diagonal-main' ? 'diagonal' : 'x-sum')) }
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: reduced } }), 'multiple')
    assert.notEqual(proof.alternative, solution)
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: reduced, entries: proof.alternative } }), 'unique')
    const { step, alternative } = proof
    assert.equal(trace.steps[step - 1].technique, proof.technique)
    assert.ok(trace.steps[step - 1].actions.some(action => JSON.stringify(action) === JSON.stringify(proof.action)))
    function fits(action: typeof proof.action) {
      return 'place' in action ? Number(alternative[action.place.cell]) === action.place.digit
        : Number(alternative[action.eliminate.cell]) !== action.eliminate.digit
    }
    assert.ok(trace.steps.slice(0, step - 1).every(move => move.actions.every(fits)))
    assert.equal(fits(proof.action), false)
  }
  const play = await runEngine({ type: 'variant', operation: 'rate', position: { puzzle }, techniqueOrder: await getVariantPlayOrder(puzzle) })
  assert.deepEqual(play.status, rating.status)
})

test('symmetry, grades below Hard, duplicate rules and cancellation have distinct outcomes', async () => {
  await assert.rejects(generateCustomSudoku(['anti-king', 'non-consecutive'], 'hard', 3, [], { miracle: true }), { code: 'unsupported', message: /second solution/ })
  await assert.rejects(generateCustomSudoku(['x-sum'], 'tricky', 3, [], { miracle: true }), { code: 'unsupported' })
  await assert.rejects(generateCustomSudoku(['kropki', 'kropki-black'], 'hard', 3, []), { code: 'unsupported' })
  await assert.rejects(generateCustomSudoku(['non-consecutive', 'kropki-white'], 'hard', 3, [], { negativeMarkers: ['kropki-white'] }), { code: 'unsupported' })
  await assert.rejects(generateCustomSudoku(['x-sum'], 'hard', 3, [], { miracle: true, signal: AbortSignal.abort() }), { name: 'AbortError' })
})

test('the checked diagonal X-Sum constructions replay at all six Miracle grades', async () => {
  for (const grade of DIFFICULTY_LEVELS.slice(DIFFICULTY_LEVELS.indexOf('hard'))) {
    const result = await generateCustomSudoku(['diagonal-main', 'x-sum'], grade, 1, [], { miracle: true })
    assert.equal(result.givens, 0)
    assert.deepEqual(result.rating.status, { solved: grade })
    assert.deepEqual(new Set(result.ruleDependencies?.map(item => item.rule)), new Set(['x-sum', 'diagonal-main']))
  }
  const anti = await generateCustomSudoku(['diagonal-anti', 'x-sum'], 'hard', 1, [], { miracle: true })
  assert.equal(anti.givens, 0)
  assert.ok(anti.puzzle.rules?.some(rule => rule.type === 'diagonal' && rule.diagonal === 'anti'))
  assert.ok(anti.ruleDependencies?.some(item => item.rule === 'diagonal-anti'))
})

test('a played Miracle layout is excluded before searching for its successor', async () => {
  const rules = ['x-sum', 'diagonal-main'] as const
  const first = await generateCustomSudoku(rules, 'hard', 5, [], { miracle: true })
  const game = { ...makeGame('played', 'Diagonal X-Sums', EMPTY, 'generated'),
    variant: { id: 'mixed' as const, puzzle: first.puzzle, solution: first.solution } }
  const next = await generateCustomSudoku(rules, 'hard', 5, [game], { miracle: true })
  assert.equal(next.puzzle.givens, EMPTY)
  assert.notDeepEqual(next.puzzle.rules, first.puzzle.rules)
  assert.deepEqual(next.rating.status, { solved: 'hard' })
  assert.equal(next.ruleDependencies?.length, rules.length)
})

test('the remaining drawn-clue families can each generate two Hard Miracle puzzles', async () => {
  for (const id of ['arrow', 'inequality', 'kropki', 'little-killer', 'region-sum', 'skyscrapers'] as const) {
    const first = await generateCustomSudoku([id], 'hard', 19, [], { miracle: true })
    const played = { ...makeGame(id, id, EMPTY, 'generated'),
      variant: { id, puzzle: first.puzzle, solution: first.solution } }
    const second = await generateCustomSudoku([id], 'hard', 19, [played], { miracle: true })
    assert.notDeepEqual(second.puzzle, first.puzzle, id)
    if (id === 'arrow') {
      const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle: first.puzzle },
        techniqueOrder: first.rating.techniqueOrder })
      const step = trace.steps.find(step => step.technique === 'arrow-house-support')
      assert.ok(step && step.evidence.type === 'line-houses')
      const hint = variantHintChoice(step, first.puzzle)
      assert.ok('variant' in hint.evidence)
      assert.match(hint.evidence.variant.description, /arrow.*circle/i)
    }
    for (const result of [first, second]) {
      assert.equal(result.puzzle.givens, EMPTY, id)
      assert.deepEqual(result.rating.status, { solved: 'hard' }, id)
      assertVariantCompletion(result.puzzle, result.solution)
      assert.ok(hasReadableArrowLayout(result.puzzle.rules), id)
      const [dependency] = result.ruleDependencies!
      assert.equal(dependency.rule, id)
      assertVariantCompletion(result.puzzle, dependency.alternative, id)
    }
  }
})

test('Beginners can use the simple border clue in each outside-row variant', async () => {
  for (const rule of ['x-sum', 'sandwich', 'skyscrapers'] as const) {
    const { puzzle, rating, ruleDependencies } = await generateCustomSudoku([rule], 'beginner', 7, [])
    assert.deepEqual(rating.status, { solved: 'beginner' })
    assert.equal(ruleDependencies?.[0].rule, rule)
    const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder: rating.techniqueOrder })
    const step = trace.steps.find(step => step.evidence.type === 'rule-single')
    assert.ok(step, rule)
    const hint = variantHintChoice(step, puzzle)
    assert.ok('variant' in hint.evidence)
    assert.match(hint.evidence.variant.reason, /sandwich|between 1 and 9|X-Sum|skyscraper|Seeing all nine/i)
  }
})

test('Chess can replay all ten grades with a separate dependency for every rule', async () => {
  const rules = ['anti-king', 'anti-knight', 'non-consecutive'] as const
  for (const grade of DIFFICULTY_LEVELS) {
    const { puzzle, rating, ruleDependencies } = await generateCustomSudoku(rules, grade, 21, [])
    assert.deepEqual(rating.status, { solved: grade })
    assert.deepEqual(new Set(ruleDependencies?.map(proof => proof.rule)), new Set(rules))
    assert.equal(await runEngine({ type: 'analyze', values: puzzle.givens }), 'multiple')
  }
})

test('a fixed construction checks the requested cells, uniqueness and played rotations', async () => {
  const { puzzle, solution } = await generateCustomSudoku(['non-consecutive'], 'very-hard', 7, [])
  const givenCells = Array.from(puzzle.givens, (v, c) => v === '0' ? -1 : c).filter(c => c >= 0)
  const request = { type: 'generate-variant', template: { ...puzzle, givens: solution },
    seed: 7, maxNodes: 20_000, maxAttempts: 1, difficulty: 'very-hard', requiredRules: ['non-consecutive'],
    techniqueOrder: await getVariantPlayOrder(puzzle), givenCells, givens: givenCells.length } as const
  assert.equal((await runEngine(request)).puzzle.givens, puzzle.givens)
  for (const invalid of [{ givenCells: [0, 0], givens: 2 }, { givenCells: [81], givens: 1 }, { givenCells: [0], givens: 2 }]) {
    await assert.rejects(runEngine({ ...request, ...invalid }), { code: 'invalid-given-cells' })
  }
  await assert.rejects(runEngine({ ...request, givens: 1, givenCells: [0] }), { code: 'search-limit' })
  await assert.rejects(runEngine({ ...request, exclude: [reflectVariant(puzzle, 2)] }), { code: 'search-limit' })
})

function stateBefore(puzzle: VariantPuzzle, earlier: VariantDeduction[]) {
  const board = Array.from(puzzle.givens, Number)
  const removed = Array<number>(81).fill(0)
  for (const { actions } of earlier) for (const action of actions) {
    if ('place' in action) board[action.place.cell] = action.place.digit
    else removed[action.eliminate.cell] |= 1 << (action.eliminate.digit - 1)
  }
  const mask = (cell: number) => board[cell] ? 0 : board.reduce((available, value, other) =>
    value && peer(cell, other, puzzle) ? available & ~(1 << (value - 1)) : available, 511 & ~removed[cell])
  return { board, mask }
}

test('a Beginner entropy single is visible in the printed 2×2 area', async () => {
  const { puzzle, rating } = await generateCustomSudoku(['global-entropy'], 'beginner', 7, [])
  assert.equal(rating.scoringVersion, 29)
  const trace = await runEngine({ type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder: rating.techniqueOrder })
  const index = trace.steps.findIndex(step => step.evidence.type === 'rule-single' && step.evidence.entropyWindow)
  assert.ok(index >= 0)
  const step = trace.steps[index]
  const { evidence } = step
  assert.ok(evidence.type === 'rule-single' && evidence.entropyWindow)
  const [top, missing] = evidence.entropyWindow
  const square = [top, top + 1, top + 9, top + 10]
  const { board } = stateBefore(puzzle, trace.steps.slice(0, index))
  assert.equal(board[evidence.excluded], 0)
  assert.ok(square.includes(evidence.excluded))
  const filled = square.filter(c => c !== evidence.excluded).map(c => board[c])
  assert.ok(filled.every(Boolean))
  const groups = [7, 56, 448]
  assert.deepEqual(groups.filter(group => filled.every(d => !(group & (1 << (d - 1))))), [missing])
  assert.equal(missing & (1 << (evidence.candidate.digit - 1)), 0)
  const hint = variantHintChoice(step, puzzle)
  assert.ok('variant' in hint.evidence && hint.evidence.variant.reason.includes('third group'))
  assert.ok(square.every(c => hint.pattern.cells.includes(c)))
  const legacy = { ...puzzle, logicVersion: undefined }
  const older = await runEngine({ type: 'variant', operation: 'rate', position: { puzzle: legacy }, techniqueOrder: rating.techniqueOrder })
  assert.equal(older.scoringVersion, 28)
  assert.equal(older.status, 'stalled')
})

test('Jigsaw wings, grouped links and forcing chains replay using the actual regions', async () => {
  for (const grade of ['hard', 'master', 'extreme'] as const) {
    const { puzzle, solution, rating } = await generateCustomSudoku(['jigsaw'], grade, 7, [])
    assert.ok(puzzle.regions?.type === 'jigsaw')
    assert.equal(rating.scoringVersion, 29)
    const request = { type: 'variant', operation: 'trace', position: { puzzle }, techniqueOrder: rating.techniqueOrder } as const
    const trace = await runEngine(request)
    const reordered = { ...puzzle, regions: { type: 'jigsaw' as const, regions: puzzle.regions.regions.map(group => [...group].reverse()) } }
    const replay = await runEngine({ ...request, position: { puzzle: reordered } })
    assert.deepEqual(replay.steps, trace.steps)
    const index = trace.steps.findIndex(step => step.technique === rating.hardest)
    assert.ok(index >= 0)
    const { evidence, actions } = trace.steps[index]
    const { board, mask } = stateBefore(puzzle, trace.steps.slice(0, index))
    if (grade === 'hard') {
      assert.ok(evidence.type === 'classic' && 'wing' in evidence.proof)
      const hint = variantHintChoice(trace.steps[index], puzzle)
      const diagram = lessonDiagram({ deduction: hint, candidates: board.map((_, cell) => mask(cell)), pattern: hint.pattern })
      assert.match(diagram.reason, /(?:row|column|region) \d+ rules out/)
      const { pivot, pincers } = evidence.proof.wing
      assert.ok(pincers.every(c => peer(pivot, c, puzzle)))
      for (const action of actions) {
        assert.ok('eliminate' in action && pincers.every(c => peer(action.eliminate.cell, c, puzzle)))
        if (rating.hardest === 'xyz-wing') assert.ok(peer(action.eliminate.cell, pivot, puzzle))
      }
    } else if (grade === 'master') {
      assert.ok(evidence.type === 'classic' && 'inference' in evidence.proof)
      const { links } = evidence.proof.inference
      assert.ok(links.some(link => 'group' in link.from || 'group' in link.to))
      assert.ok(links.some(link => 'variant-house' in link.source))
      const hint = variantHintChoice(trace.steps[index], puzzle)
      const diagram = lessonDiagram({ deduction: hint, candidates: board.map((_, cell) => mask(cell)), pattern: hint.pattern })
      assert.ok(diagram.reasonSteps?.some(line => /region \d+/.test(line)))
      for (const link of links) {
        if (!('house' in link.source || 'variant-house' in link.source)) continue
        const house = 'house' in link.source ? link.source.house : link.source['variant-house']
        assert.ok(!('box' in house))
        const houseCells = variantHouseCells(house, puzzle)
        const endpoints = [link.from, link.to].flatMap(node => 'candidate' in node ? [node.candidate]
          : 'group' in node ? node.group.cells.map(cell => ({ cell, digit: node.group.digit })) : node['mixed-group'])
        assert.ok(endpoints.every(({ cell, digit }) => houseCells.includes(cell) && digit === endpoints[0].digit))
        assert.equal(new Set(endpoints.map(c => c.cell)).size, endpoints.length)
        if (link.strength === 'strong') assert.deepEqual(new Set(endpoints.map(c => c.cell)),
          new Set(houseCells.filter(c => mask(c) & (1 << (endpoints[0].digit - 1)))))
      }
    } else {
      assert.ok(evidence.type === 'rule-forcing' && evidence.placements?.length)
      const place = ({ cell, digit }: Candidate) => {
        assert.equal(board[cell], 0)
        board[cell] = digit
      }
      assert.notEqual(Number(solution[evidence.assumption.cell]), evidence.assumption.digit)
      place(evidence.assumption)
      for (const [candidate, house] of evidence.placements) {
        const bit = 1 << (candidate.digit - 1)
        if (house) assert.deepEqual(variantHouseCells(house, puzzle).filter(c => mask(c) & bit), [candidate.cell])
        else assert.equal(mask(candidate.cell), bit)
        place(candidate)
      }
      const failure = evidence.contradiction
      if (failure.type === 'empty-cell') {
        assert.equal(board[failure.cell], 0)
        assert.equal(mask(failure.cell), 0)
      } else assert.ok(variantHouseCells(failure.house, puzzle).every(c => board[c] !== failure.digit && !(mask(c) & (1 << (failure.digit - 1)))))
      const hint = variantHintChoice(trace.steps[index], puzzle)
      assert.ok('variant' in hint.evidence)
      assert.match(hint.evidence.variant.reasonSteps!.at(-1)!, /Remove/)
    }
  }
})

test('Killer Miracle layouts use connected multi-cell cages and can reach every eligible grade', async () => {
  for (const grade of DIFFICULTY_LEVELS.slice(DIFFICULTY_LEVELS.indexOf('hard'))) {
    const { puzzle, rating, solution, ruleDependencies } = await generateCustomSudoku(['killer-cages'], grade, 7, [], { miracle: true })
    assert.equal(puzzle.givens, EMPTY)
    assert.deepEqual(rating.status, { solved: grade })
    assert.deepEqual(ruleDependencies?.map(d => d.rule), ['killer-cages'])
    const [rule] = puzzle.rules!
    assert.ok(rule.type === 'killer-cages' && rule.coverGrid)
    const cells = rule.cages.flatMap(c => c.cells)
    assert.equal(cells.length, 81)
    assert.equal(new Set(cells).size, 81)
    for (const cage of rule.cages) {
      assert.ok(cage.cells.length >= 2 && connectedGridCells(cage.cells, 9))
      const digits = cage.cells.map(c => Number(solution[c]))
      assert.equal(new Set(digits).size, digits.length)
      assert.equal(digits.reduce((sum, d) => sum + d, 0), cage.sum)
    }
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } }), { status: 'unique', solution })
  }
})

test('checked mixed layouts retain the exact complete markings selected in the builder', async () => {
  const rules = ['arrow', 'kropki', 'xv'] as const
  const result = await generateCustomSudoku(rules, 'hard', 11, [], { negativeMarkers: ['xv-ten', 'kropki-white'] })
  const dots = result.puzzle.rules!.find(r => r.type === 'kropki')
  const marks = result.puzzle.rules!.find(r => r.type === 'xv')
  assert.ok(dots?.consecutive?.negative && !dots.ratioTwo?.negative)
  assert.ok(marks?.ten?.negative && !marks.five?.negative)
  assert.deepEqual(new Set(result.ruleDependencies!.map(d => d.rule)), new Set(rules))
})

test('the cheaper-path audit distinguishes exhaustion from a budget limit and returns a replay', async () => {
  const { puzzle, solution, rating } = await generateCustomSudoku(['global-entropy'], 'beginner', 7, [])
  const request = { type: 'variant', operation: 'search-lower-grade', position: { puzzle }, techniqueOrder: rating.techniqueOrder } as const
  assert.deepEqual(await runEngine({ ...request, difficulty: 'beginner', maxPositions: 0 }),
    { status: 'inconclusive', positionsSearched: 0, steps: [] })
  assert.deepEqual(await runEngine({ ...request, difficulty: 'beginner', maxPositions: 1 }),
    { status: 'no-path', positionsSearched: 1, steps: [] })
  const easier = await runEngine({ ...request, difficulty: 'easy', maxPositions: 1 })
  assert.equal(easier.status, 'found')
  for (const { actions } of easier.steps) {
    for (const action of actions) {
      const c = 'place' in action ? action.place : action.eliminate
      assert.equal(solution[c.cell] === String(c.digit), 'place' in action)
    }
  }
  assert.equal(stateBefore(puzzle, easier.steps).board.join(''), solution)
})

test('the cheaper-path search explores non-single deductions in a zero-given mixed puzzle', async () => {
  const { puzzle, solution, rating } = await generateCustomSudoku(['x-sum', 'diagonal-main'], 'hard', 5, [], { miracle: true })
  const request = { type: 'variant', operation: 'search-lower-grade', position: { puzzle },
    difficulty: 'very-hard', techniqueOrder: rating.techniqueOrder } as const
  assert.deepEqual(await runEngine({ ...request, maxPositions: 0 }), { status: 'inconclusive', positionsSearched: 0, steps: [] })
  const found = await runEngine({ ...request, maxPositions: 256 })
  assert.equal(found.status, 'found')
  assert.ok(found.positionsSearched > 1)
  assert.ok(found.steps.some(step => step.technique === 'x-sum'))
  assert.equal(stateBefore(puzzle, found.steps).board.join(''), solution)
})
