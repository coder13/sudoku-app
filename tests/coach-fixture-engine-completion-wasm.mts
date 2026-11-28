import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { runEngine } from '../src/sudoku/engine.ts'
import { isPlayablePuzzle } from '../src/sudoku/variants.ts'
import { sizedRulePosition } from '../src/sudoku/sized-rule-game.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { readCoachSolutionSources, standaloneCoachSolutionSources } from './helpers/coach-fixture-sources.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'
import { transformedBoard } from './helpers/transformed-board.ts'
import { coachCode } from './helpers/coach-code.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const sources = readCoachSolutionSources()

function assertSolutionCandidates(candidates: readonly number[], givens: string, solution: string, source: string) {
  for (let cell = 0; cell < solution.length; cell++) {
    if (givens[cell] !== '0') continue
    const digit = Number(solution[cell])
    assert.ok(Number.isInteger(digit) && digit > 0 && (candidates[cell] & (1 << (digit - 1))),
      `${source}: the engine removed the published solution digit from cell ${cell}`)
  }
}

function coachProgress(givens: string, solution: string) {
  const emptyCells = [...givens].flatMap((digit, cell) => digit === '0' ? [cell] : [])
  const moves = Array(solution.length).fill('0')
  const values = [...givens]
  for (let tenth = 1; tenth < 10; tenth++) {
    const offset = Math.floor(emptyCells.length * tenth / 10)
    const cell = emptyCells[offset]
    if (cell === undefined) continue
    moves[cell] = solution[cell]
    values[cell] = solution[cell]
  }
  return { entries: moves.join(''), values: values.join('') }
}

test('published Sudoku Coach completions pass the Rust engine with every imported rule combination', async () => {
  assert.equal(sources.size, 81)
  const standaloneSeen = new Set<string>()
  let checked = 0, transformedChecks = 0

  for (const source of sources.values()) {
    const imported = await detectPuzzle(source.code)
    const sourceName = source.references[0]
    const progress = coachProgress(imported.givens, source.solution)

    if (imported.futoshiki || imported.calcudoku) {
      assert.ok(source.references.every(reference => standaloneCoachSolutionSources.has(reference)), sourceName)
      for (const reference of source.references) standaloneSeen.add(reference)
      continue
    }

    if (imported.variant) {
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
        puzzle: imported.variant.puzzle,
        entries: source.solution,
      } }), 'unique', sourceName)
      const repeatedDigitCells = Array.from(source.solution, (digit, cell) => digit === '1' ? cell : -1)
        .filter(cell => cell >= 0)
      assert.equal(repeatedDigitCells.length, 9, `${sourceName}: published solution contains nine ones`)
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
        puzzle: {
          ...imported.variant.puzzle,
          rules: [...(imported.variant.puzzle.rules ?? []), { type: 'extra-house', cells: repeatedDigitCells }],
        },
        entries: source.solution,
      } }), 'conflict', `${sourceName}: the engine rejects an added rule that contradicts its completion`)
      for (let symmetry = 0; symmetry < 8; symmetry++) {
        const puzzle = reflectVariant(imported.variant.puzzle, symmetry)
        const solution = transformedBoard(source.solution, symmetry)
        assertVariantCompletion(puzzle, solution)
        assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
          puzzle, entries: solution,
        } }), 'unique', `${sourceName}, symmetry ${symmetry}`)
        transformedChecks++
      }
      const candidates = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle: imported.variant.puzzle } })
      assertSolutionCandidates(candidates, imported.givens, source.solution, sourceName)
      const progressed = await runEngine({ type: 'variant', operation: 'candidates', position: {
        puzzle: imported.variant.puzzle,
        entries: progress.entries,
      } })
      assertSolutionCandidates(progressed, progress.values, source.solution, `${sourceName} after player entries`)
    } else if (imported.grid) {
      const position = sizedRulePosition(imported.grid, { rules: imported.sizedRules ?? [] }, source.solution)
      assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique', sourceName)
      const startingPosition = sizedRulePosition(imported.grid, { rules: imported.sizedRules ?? [] }, imported.givens)
      const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: startingPosition })
      assertSolutionCandidates(candidates, imported.givens, source.solution, sourceName)
      const progressed = await runEngine({ type: 'sized-variant', operation: 'candidates', position:
        sizedRulePosition(imported.grid, { rules: imported.sizedRules ?? [] }, progress.values) })
      assertSolutionCandidates(progressed, progress.values, source.solution, `${sourceName} after player entries`)
    } else {
      assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
        puzzle: { version: 1, givens: imported.givens, rules: [] },
        entries: source.solution,
      } }), 'unique', sourceName)
      const candidates = await runEngine({ type: 'variant', operation: 'candidates', position: {
        puzzle: { version: 1, givens: imported.givens, rules: [] },
      } })
      assertSolutionCandidates(candidates, imported.givens, source.solution, sourceName)
      const progressed = await runEngine({ type: 'variant', operation: 'candidates', position: {
        puzzle: { version: 1, givens: imported.givens, rules: [] },
        entries: progress.entries,
      } })
      assertSolutionCandidates(progressed, progress.values, source.solution, `${sourceName} after player entries`)
    }
    checked++
  }

  assert.equal(checked, 78)
  assert.equal(transformedChecks, 472)
  assert.deepEqual([...standaloneSeen].sort(), [...standaloneCoachSolutionSources].sort())
})

test('every published Coach combination has order-independent candidate propagation', async () => {
  let checked = 0
  let shuffleState = 0x87c0ffee
  const shuffle = <T,>(values: readonly T[]) => {
    const shuffled = [...values]
    for (let index = shuffled.length - 1; index > 0; index--) {
      shuffleState = (Math.imul(shuffleState, 1_664_525) + 1_013_904_223) >>> 0
      const other = shuffleState % (index + 1)
      ;[shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]]
    }
    return shuffled
  }

  for (const source of sources.values()) {
    if (source.solution.length !== 81) continue
    const imported = await detectPuzzle(source.code)
    if (!imported.variant) continue

    const puzzle = imported.variant.puzzle
    const progress = coachProgress(imported.givens, source.solution)
    const blankCandidates = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle } })
    const progressedCandidates = await runEngine({ type: 'variant', operation: 'candidates', position: {
      puzzle,
      entries: progress.entries,
    } })
    for (let permutation = 0; permutation < 8; permutation++) {
      const shuffledPuzzle = { ...puzzle, rules: shuffle(puzzle.rules ?? []) }
      const shuffledCandidates = await runEngine({ type: 'variant', operation: 'candidates', position: {
        puzzle: shuffledPuzzle,
      } })
      assert.deepEqual(shuffledCandidates, blankCandidates,
        `${source.references[0]}: blank-grid propagation must be order independent (shuffle ${permutation})`)
      const shuffledProgressedCandidates = await runEngine({ type: 'variant', operation: 'candidates', position: {
        puzzle: shuffledPuzzle,
        entries: progress.entries,
      } })
      assert.deepEqual(shuffledProgressedCandidates, progressedCandidates,
        `${source.references[0]}: player-progress propagation must be order independent (shuffle ${permutation})`)
    }
    checked++
  }
  assert.equal(checked, 59)
})

test('published 9 × 9 Coach combinations compose with solution-valid Odd and Even rules', async () => {
  const oddMask = 0b101010101
  const evenMask = 0b010101010
  let checked = 0

  for (const source of sources.values()) {
    if (source.solution.length !== 81) continue
    const imported = await detectPuzzle(source.code)
    if (!imported.variant) continue

    const oddCells = [...source.solution].flatMap((digit, cell) => Number(digit) % 2 === 1 ? [cell] : [])
    const evenCells = [...source.solution].flatMap((digit, cell) => Number(digit) % 2 === 0 ? [cell] : [])
    const { puzzle } = imported.variant
    const baseline = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle } })
    const parityRules = [
      { type: 'parity' as const, cells: oddCells, parity: 'odd' as const },
      { type: 'parity' as const, cells: evenCells, parity: 'even' as const },
    ]
    let combinedPuzzle: typeof puzzle = { ...puzzle, rules: [...(puzzle.rules ?? []), ...parityRules] }

    if (source.code.startsWith('SCv7_32_')) {
      const payload = await decodeSudokuCoachPayload(source.code)
      const originalLayers = Array.isArray(payload.givenConstraints) ? payload.givenConstraints : []
      const companions = [
        { type: 'odd', segments: oddCells.map(cell => ({ cells: [cell], parameters: {} })) },
        { type: 'even', segments: evenCells.map(cell => ({ cells: [cell], parameters: {} })) },
      ]
      const combined = await detectPuzzle(coachCode({
        ...payload,
        givenConstraints: [...originalLayers, ...companions],
      }))
      assert.ok(combined.variant, `${source.references[0]}: source re-imports with parity companions`)
      combinedPuzzle = combined.variant.puzzle
    }

    const candidates = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle: combinedPuzzle } })
    for (let cell = 0; cell < 81; cell++) {
      const parityMask = Number(source.solution[cell]) % 2 ? oddMask : evenMask
      assert.ok((candidates[cell] & ~baseline[cell]) === 0,
        `${source.references[0]} cell ${cell}: added parity rules do not restore an original candidate`)
      assert.ok((candidates[cell] & ~parityMask) === 0,
        `${source.references[0]} cell ${cell}: combined candidates satisfy the published solution's parity`)
    }
    assertSolutionCandidates(candidates, imported.givens, source.solution, `${source.references[0]} with parity companions`)
    checked++
  }

  assert.equal(checked, 59)
})

test('the published Every Constraint combination compiles and propagates in the Rust engine', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-every-constraint.json', import.meta.url), 'utf8'))
  const imported = await detectPuzzle(fixture.examples[0].code)
  assert.ok(imported.variant)
  const candidates = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle: imported.variant.puzzle } })
  assert.equal(candidates.length, 81)
  for (const [cell, mask] of candidates.entries()) {
    assert.ok(mask > 0 && (mask & ~0x1ff) === 0, `combined source leaves valid candidates at cell ${cell}`)
  }
  const solved = await runEngine({ type: 'variant', operation: 'solve-unique', position: {
    puzzle: imported.variant.puzzle,
  } })
  assert.equal(solved.status, 'unique', 'the full-rule source has one completion under the imported combination')
  assert.ok('solution' in solved)
  assertSolutionCandidates(candidates, imported.givens, solved.solution, 'published Every Constraint')
  const progress = coachProgress(imported.givens, solved.solution)
  const progressedCandidates = await runEngine({ type: 'variant', operation: 'candidates', position: {
    puzzle: imported.variant.puzzle,
    entries: progress.entries,
  } })
  assertSolutionCandidates(progressedCandidates, progress.values, solved.solution, 'Every Constraint after player entries')
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant(imported.variant.puzzle, symmetry)
    const solution = transformedBoard(solved.solution, symmetry)
    assertVariantCompletion(puzzle, solution)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } }),
      { status: 'unique', solution }, `all-family Coach combination, symmetry ${symmetry}`)
  }

  const sameDigitCells = Array.from({ length: 81 }, (_, cell) => cell)
    .filter(cell => solved.solution[cell] === solved.solution[0])
    .slice(0, 9)
  assert.equal(sameDigitCells.length, 9)
  const contradictoryPuzzle = {
    ...imported.variant.puzzle,
    rules: [...(imported.variant.puzzle.rules ?? []), { type: 'extra-house' as const, cells: sameDigitCells }],
  }
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: {
    puzzle: contradictoryPuzzle,
  } }), { status: 'unsolvable' }, 'a valid contradictory companion makes the imported combination unsatisfiable')
})

test('HBR9 imports Jigsaw and Anti-Royal rules together without promoting colors to constraints', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-jigsaw-anti-royal.json', import.meta.url), 'utf8'))
  const imported = await detectPuzzle(fixture.code)
  assert.ok(imported.variant)
  assert.equal(imported.variant.puzzle.regions?.type, 'jigsaw')
  assert.deepEqual(imported.variant.puzzle.rules.map(rule => rule.type), [
    'anti-knight', 'anti-king', 'non-consecutive',
  ])
  assert.ok(imported.givenCellColors && Object.keys(imported.givenCellColors).length > 0,
    'the source colors remain presentation metadata outside the engine puzzle')

  const solved = await runEngine({ type: 'variant', operation: 'solve-unique', position: {
    puzzle: imported.variant.puzzle,
  } })
  assert.deepEqual(solved, { status: 'unique', solution: fixture.solution })

  const withoutNonconsecutive = {
    ...imported.variant.puzzle,
    rules: imported.variant.puzzle.rules.filter(rule => rule.type !== 'non-consecutive'),
  }
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: {
    puzzle: withoutNonconsecutive,
  } }), { status: 'multiple' }, 'the imported non-consecutive rule contributes to this source')

  const parityCompanions = [
    { type: 'parity' as const, cells: [...fixture.solution].flatMap((digit, cell) => Number(digit) % 2 ? [cell] : []), parity: 'odd' as const },
    { type: 'parity' as const, cells: [...fixture.solution].flatMap((digit, cell) => Number(digit) % 2 ? [] : [cell]), parity: 'even' as const },
  ]
  const combined = {
    ...imported.variant.puzzle,
    rules: [...imported.variant.puzzle.rules, ...parityCompanions],
  }
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle: combined } }),
    { status: 'unique', solution: fixture.solution },
    'cosmetic cell colors stay outside the engine while the original rules compose with typed parity companions')
})

test('published Jigsaw Coach combination needs both Killer and Little Killer rules for uniqueness', async () => {
  const source = [...sources.values()].find(({ references }) =>
    references.includes('disconnected-jigsaw-coach.json:$'))
  assert.ok(source)
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.variant)
  assert.deepEqual(imported.variant.puzzle.rules?.map(rule => rule.type), ['killer-cages', 'little-killer'])

  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: imported.variant.puzzle,
    entries: imported.givens,
  } }), 'unique', 'the original Jigsaw, Killer cages and Little Killer combination is unique')
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
      puzzle: reflectVariant(imported.variant.puzzle, symmetry),
      entries: transformedBoard(imported.givens, symmetry),
    } }), 'unique', `the mixed Jigsaw combination stays unique under symmetry ${symmetry}`)
  }

  for (const ruleType of ['killer-cages', 'little-killer'] as const) {
    const withoutRule = {
      ...imported.variant.puzzle,
      rules: imported.variant.puzzle.rules?.filter(rule => rule.type !== ruleType),
    }
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
      puzzle: withoutRule,
      entries: imported.givens,
    } }), 'multiple', `removing the ${ruleType} companion must expose alternate solutions`)
  }
})

test('every published Coach combination detects an inconsistent digit-restriction companion', async () => {
  let checked = 0
  for (const source of sources.values()) {
    if (source.solution.length !== 81) continue
    const imported = await detectPuzzle(source.code)
    if (!imported.variant) continue
    const cell = imported.givens.indexOf('0')
    assert.notEqual(cell, -1, `${source.references[0]}: source has an editable cell`)
    const puzzle = {
      ...imported.variant.puzzle,
      rules: [...(imported.variant.puzzle.rules ?? []),
        { type: 'digit-restriction' as const, cells: [cell], digits: [1, 2, 3], shape: 'circle' as const },
        { type: 'digit-restriction' as const, cells: [cell], digits: [8, 9], shape: 'square' as const },
      ],
    }
    assert.equal(isPlayablePuzzle('mixed', puzzle), true,
      `${source.references[0]}: individually valid companion rules pass structural validation`)
    const candidates = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle } })
    assert.equal(candidates[cell], 0,
      `${source.references[0]}: disjoint circle/square restrictions intersect to no digit at cell ${cell}`)
    checked++
  }
  assert.equal(checked, 59)
})

test('zero-given published Coach Bento needs Global Entropy and labeled dots for uniqueness', async () => {
  const source = [...sources.values()].find(({ references }) =>
    references.includes('global-entropy-coach.json:$.examples[5]'))
  assert.ok(source)
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.variant)
  assert.equal(imported.givens, '0'.repeat(81))
  assert.equal(imported.variant.puzzle.regions?.type, 'partial')
  assert.ok(imported.variant.puzzle.rules?.some(rule => rule.type === 'global-entropy'))
  assert.ok(imported.variant.puzzle.rules?.some(rule => rule.type === 'labeled-dots'))
  assert.ok(imported.variant.puzzle.rules?.some(rule => rule.type === 'kropki'))

  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: {
    puzzle: imported.variant.puzzle,
  } }), { status: 'unique', solution: source.solution },
  'the complete zero-given published puzzle must retain its exact solution')
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: {
      puzzle: reflectVariant(imported.variant.puzzle, symmetry),
    } }), { status: 'unique', solution: transformedBoard(source.solution, symmetry) },
    `the mixed partial-region puzzle stays unique under symmetry ${symmetry}`)
  }

  for (const ruleType of ['global-entropy', 'labeled-dots'] as const) {
    const withoutRule = {
      ...imported.variant.puzzle,
      rules: imported.variant.puzzle.rules?.filter(rule => rule.type !== ruleType),
    }
    assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
      puzzle: withoutRule,
      entries: imported.givens,
    } }), 'multiple', `removing the ${ruleType} family must expose alternate solutions`)
  }
})

test('the zero-given Entropic Coach source has one exact solution from its encoded rules', async () => {
  const source = [...sources.values()].find(({ references }) => references.includes('entropic-coach.json:$.examples[6]'))
  assert.ok(source)
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.variant)
  assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: {
    puzzle: imported.variant.puzzle,
  } }), { status: 'unique', solution: source.solution })
})

test('the zero-given Entropic Coach source proves unique under all eight symmetries', async () => {
  const source = [...sources.values()].find(({ references }) => references.includes('entropic-coach.json:$.examples[6]'))
  assert.ok(source)
  const imported = await detectPuzzle(source.code)
  assert.ok(imported.variant)
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const puzzle = reflectVariant(imported.variant.puzzle, symmetry)
    const solution = transformedBoard(source.solution, symmetry)
    assert.deepEqual(await runEngine({ type: 'variant', operation: 'solve-unique', position: { puzzle } }),
      { status: 'unique', solution }, `symmetry ${symmetry}`)
  }
})
