import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { puzzleHints, puzzleSolution } from '../src/sudoku/puzzle-help.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { sizedRuleHintChoices } from '../src/sudoku/sized-rule-play.ts'
import { sizedRulePosition } from '../src/sudoku/sized-rule-game.ts'
import { puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import worker from '../cloudflare/pages/_worker.js'
import { EngineError, runEngine, type EngineRequest, type SizedConstraintPosition } from '../src/sudoku/engine.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'
import { coachCode } from './helpers/coach-code.ts'

useWasmWorker(process.env.SIZED_RULES_WASM)

test('#393 sized Clone groups constrain corresponding cells in the sized engine', async () => {
  const position: SizedConstraintPosition = {
    version: 2,
    grid: { size: 6, boxRows: 2, boxColumns: 3 },
    digits: [1, ...Array(35).fill(0)],
    rules: [
      { type: 'clone', groups: [[0, 9], [9, 17], [1, 10], [0, 16]] },
      { type: 'palindrome', cells: [16, 17, 23] },
    ],
  }
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  assert.ok(Array.isArray(candidates))
  assert.equal(candidates[9], 1)
  assert.equal(candidates[17], 1)
  assert.equal(candidates[23], 1)
  const conflict = { ...position, digits: position.digits.map((digit, cell) => cell === 9 ? 2 : digit) }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: conflict }), 'conflict')

  const zeroBased: SizedConstraintPosition = {
    version: 2,
    grid: { size: 10, boxRows: 2, boxColumns: 5 },
    zeroBased: true,
    digits: [1, ...Array(99).fill(0)],
    rules: [{ type: 'clone', groups: [[0, 15], [15, 29]] }],
  }
  const zeroBasedCandidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: zeroBased })
  assert.ok(Array.isArray(zeroBasedCandidates))
  assert.equal(zeroBasedCandidates[15], 1)
  assert.equal(zeroBasedCandidates[29], 1)
})

test('#396 validates the published Anti-King and Region Sum combination in the sized engine', async () => {
  const code = readFileSync(new URL('./fixtures/sudoku-pad-weighted-libra.scl', import.meta.url), 'utf8').trim()
  const imported = await detectPuzzle(code)
  assert.ok(imported.grid && imported.sizedRules)
  const position = sizedRulePosition(imported.grid, { rules: imported.sizedRules }, imported.authoredSolution!)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...position, digits: Array.from('621345435261216453543126162534354613', Number),
  } }), 'conflict')
})

test('#394 validates the published six-cell Anti-Knight and three-Arrow f-puzzles source in the sized engine', async () => {
  const code = readFileSync(new URL('./fixtures/sudokupad-3-pointing-knights.fpuz', import.meta.url), 'utf8').trim()
  const imported = await detectPuzzle(code)
  assert.ok(imported.grid && imported.sizedRules && imported.authoredSolution)
  const position = sizedRulePosition(imported.grid, { rules: imported.sizedRules }, imported.authoredSolution)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  const alteredArrow = { ...position, rules: position.rules.map((rule, index) => index === 1 && rule.type === 'arrow'
    ? { ...rule, circle: 0 }
    : rule) }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: alteredArrow }), 'conflict')
})

test('#407 validates sized Sandwich totals, including zero, alongside a Thermometer', async () => {
  const solution = Array.from('123456456123234561561234345612612345', Number)
  const position = {
    version: 2 as const,
    grid: { size: 6, boxRows: 2, boxColumns: 3 },
    digits: solution,
    rules: [
      { type: 'sandwich' as const, direction: 'south' as const, cells: [0, 6, 12, 18, 24, 30], sum: 14 },
      { type: 'sandwich' as const, direction: 'west' as const, cells: [17, 16, 15, 14, 13, 12], sum: 0 },
      { type: 'sandwich' as const, direction: 'north' as const, cells: [35, 29, 23, 17, 11, 5], sum: 3 },
      { type: 'thermometer' as const, cells: [0, 1, 2] },
    ],
  }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
})

test('#404 enforces sized X-Sums with distinct prefix digits and directional rays', async () => {
  const position: SizedConstraintPosition = {
    version: 2,
    grid: { size: 4, boxRows: 2, boxColumns: 2 },
    digits: Array(16).fill(0),
    rules: [{ type: 'x-sum', direction: 'east', cells: [0, 1, 2, 3], sum: 10 }],
  }
  const hints = await runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 10 })
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  assert.equal(candidates?.[0], 0b1000)
  assert.ok(hints?.choices.some(choice => choice.type === 'rule' && choice.rule === 0 &&
    choice.actions.some(action => action.eliminate?.cell === 0 && action.eliminate.digit === 1) &&
    choice.actions.some(action => action.eliminate?.cell === 1 && action.eliminate.digit === 4)))
  const solution = Array.from('4321213412433412', Number)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: { ...position, digits: solution } }), 'unique')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...position, digits: solution, rules: [{ type: 'x-sum', direction: 'east', cells: [0, 1, 2, 3], sum: 9 }],
  } }), 'conflict')
  const wide = {
    version: 2 as const,
    grid: { size: 16, boxRows: 4, boxColumns: 4 },
    digits: Array(256).fill(0),
    rules: [{ type: 'x-sum' as const, direction: 'east' as const, cells: Array.from({ length: 16 }, (_, index) => index), sum: 136 }],
  }
  const wideCandidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: wide })
  assert.equal(wideCandidates?.[0], 0x8000)
})

test('#404 enforces both white-dot relationships from the original X-Sum Twins import', async () => {
  const code = readFileSync(new URL('./fixtures/sized-sudokupad-xsums-white-dots.scl', import.meta.url), 'utf8').trim()
  const imported = await detectPuzzle(code)
  assert.ok(imported.grid && imported.sizedRules)
  const solution = imported.authoredSolution!
  const position = sizedRulePosition(imported.grid, { rules: imported.sizedRules }, solution)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')

  const incompatible = {
    ...position,
    rules: position.rules.map((rule, index) => index === 0
      ? { ...rule, relation: 'ratio' as const }
      : rule),
  }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: incompatible }), 'conflict')

  const ratioPosition: SizedConstraintPosition = {
    version: 2,
    grid: { size: 4, boxRows: 2, boxColumns: 2 },
    digits: Array(16).fill(0),
    rules: [{ type: 'x-sum-dot', ends: [{ direction: 'east', index: 1 }, 4], relation: 'ratio' }],
  }
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: ratioPosition })
  assert.equal(candidates?.[5] & 0b1000, 0)
  const hints = await runEngine({ type: 'sized-variant', operation: 'hints', position: ratioPosition, limit: 10 })
  assert.ok(hints?.choices.some(choice => choice.type === 'rule' && choice.rule === 0 &&
    choice.actions.some(action => action.eliminate?.cell === 5 && action.eliminate.digit === 4)))
})

test('#394/#396/#404 imports Coach chess rules and X-Sums with companion sized rules into the shared engine', async ({ mock }) => {
  const solution = '123456456123234561561234345612612345'
  const regionLabels = Array.from({ length: 36 }, (_, cell) =>
    Math.floor(Math.floor(cell / 6) / 2) * 2 + Math.floor((cell % 6) / 3) + 1)
  const code = coachCode({ gridSize: 6, givenDigits: solution, regions: regionLabels, givenConstraints: [
    { type: 'cosmeticText', settings: {}, segments: [
      { cells: [[-0.5, 1.5]], parameters: { text: '16' } },
      { cells: [[1.5, -0.5]], parameters: { text: '7' } },
    ] },
    { type: 'thermometer', settings: {}, segments: [{ cells: [12, 13, 14], parameters: {} }] },
    { type: 'antiKnight', settings: {}, segments: [] },
    { type: 'antiKing', settings: {}, segments: [] },
  ] })
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ code, coach: {
    hasAuthorInstructions: true, authoredRule: 'x-sum', title: 'Six by six X-Sums with a Thermometer',
  } }), { headers: { 'content-type': 'application/json' } }))

  const imported = await detectPuzzle('https://sudoku.coach/en/s/Ab12')
  assert.deepEqual(imported.sizedRules, [
    { type: 'x-sum', direction: 'east', cells: [6, 7, 8, 9, 10, 11], sum: 16 },
    { type: 'x-sum', direction: 'south', cells: [1, 7, 13, 19, 25, 31], sum: 7 },
    { type: 'thermometer', cells: [12, 13, 14] },
    { type: 'anti-knight' },
    { type: 'anti-king' },
  ])

  const blank = sizedRulePosition(imported.grid!, { rules: imported.sizedRules! }, '0'.repeat(36))
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: blank })
  assert.equal(candidates, null, 'the mixed clues have no completion once Anti-Knight is retained')
  const antiKnightPosition = { ...blank, digits: Array.from({ length: 36 }, (_, cell) => cell === 0 ? 1 : 0), rules: [
    { type: 'anti-knight' as const }, { type: 'thermometer' as const, cells: [6, 7, 8] },
  ] }
  const antiKnightCandidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: antiKnightPosition })
  const classicKnightCandidates = await runEngine({ type: 'sized-classic', operation: 'candidates', position: {
    version: 2, grid: imported.grid!, digits: antiKnightPosition.digits,
  } })
  assert.ok(antiKnightCandidates && classicKnightCandidates)
  assert.ok(antiKnightCandidates.slice(1).every(mask => mask !== 0), 'Anti-Knight composes with a Thermometer')
  assert.equal(antiKnightCandidates[13] & 1, 0, 'Anti-Knight removes the given value from a knight-move cell')
  assert.notEqual(classicKnightCandidates[13] & 1, 0, 'row, column and region alone keep that rank as a candidate')
  const antiKnightHints = await runEngine({ type: 'sized-variant', operation: 'hints', position: antiKnightPosition, limit: 10 })
  assert.ok(antiKnightHints?.choices.some(choice => choice.type === 'rule' && choice.rule === 0 &&
    choice.actions.some(action => action.eliminate?.cell === 13 && action.eliminate.digit === 1)))
  const antiKnightSolution = (await runEngine({ type: 'sized-variant', operation: 'solve', position: antiKnightPosition }))?.digits
  assert.ok(antiKnightSolution)
  assert.ok(antiKnightSolution[6] < antiKnightSolution[7] && antiKnightSolution[7] < antiKnightSolution[8],
    'the solved combination respects its Thermometer')
  for (let cell = 0; cell < 36; cell++) {
    const row = Math.floor(cell / 6), column = cell % 6
    for (const [rowDelta, columnDelta] of [[1, 2], [2, 1]]) {
      for (const rowSign of [-1, 1]) for (const columnSign of [-1, 1]) {
        const otherRow = row + rowDelta * rowSign, otherColumn = column + columnDelta * columnSign
        if (otherRow >= 0 && otherRow < 6 && otherColumn >= 0 && otherColumn < 6) {
          assert.notEqual(antiKnightSolution[cell], antiKnightSolution[otherRow * 6 + otherColumn])
        }
      }
    }
  }
  const completed = { ...blank, digits: Array.from(solution, Number) }
  const withoutAntiKnight = { ...completed, rules: completed.rules.filter(rule => rule.type !== 'anti-knight') }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: withoutAntiKnight }), 'unique')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: completed }), 'conflict',
    'the imported Anti-Knight rule rejects the authored grid where equal digits share a knight move')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...completed,
    rules: completed.rules.map(rule => rule.type === 'x-sum' && rule.direction === 'east'
      ? { ...rule, sum: rule.sum + 1 }
      : rule),
  } }), 'conflict')
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...completed,
    rules: completed.rules.map(rule => rule.type === 'thermometer' ? { ...rule, cells: [...rule.cells].reverse() } : rule),
  } }), 'conflict')

  const kingOnly = { ...blank, digits: Array.from({ length: 36 }, (_, cell) => cell === 2 ? 1 : 0), rules: [{ type: 'anti-king' as const }] }
  const kingCandidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: kingOnly })
  const classicCandidates = await runEngine({ type: 'sized-classic', operation: 'candidates', position: {
    version: 2, grid: imported.grid!, digits: kingOnly.digits,
  } })
  assert.ok(kingCandidates && classicCandidates)
  assert.equal(kingCandidates[9] & 1, 0, 'Anti-King removes the given value from a diagonal neighbor')
  assert.notEqual(classicCandidates[9] & 1, 0, 'row, column and region alone keep that rank as a candidate')

  await assert.rejects(detectPuzzle(coachCode({ gridSize: 6, regions: regionLabels, givenConstraints: [
    { type: 'antiKing', settings: { distance: 2 }, segments: [] },
  ] })), /unsupported settings for antiKing/)
  await assert.rejects(detectPuzzle(coachCode({ gridSize: 6, regions: regionLabels, givenConstraints: [
    { type: 'antiKnight', settings: { distance: 2 }, segments: [] },
  ] })), /unsupported settings for antiKnight/)
})

test('one Renban request uses the supplied geometry across supported rectangular layouts', async () => {
  const layouts = [[4, 2, 2], [6, 2, 3], [6, 3, 2], [8, 2, 4], [8, 4, 2], [10, 2, 5], [12, 3, 4], [16, 4, 4]]
  for (const [size, boxRows, boxColumns] of layouts) {
    const digits = Array.from({ length: size * size }, (_, cell) => cell === 0 ? 1 : 0)
    const position: SizedConstraintPosition = {
      version: 2, grid: { size, boxRows, boxColumns }, digits,
      rules: [{ type: 'renban', cells: [0, 1, 2, 3], segments: [[0, 1], [1, 2, 3]] }],
    }
    const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
    assert.ok(masks)
    assert.equal(masks.length, size * size)
    assert.deepEqual(masks.slice(1, 4), [0b1110, 0b1110, 0b1110])
    const solved = Array.from(digits, (_, cell) => {
      const row = Math.floor(cell / size)
      return (row * boxColumns + Math.floor(row / boxRows) + cell % size) % size + 1
    })
    const nearComplete = { ...position, digits: solved.map((digit, cell) => cell === 1 ? 0 : digit) }
    assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: nearComplete }), 'unique')
    assert.deepEqual((await runEngine({ type: 'sized-variant', operation: 'solve', position: nearComplete }))?.digits, solved)
    const trace = await runEngine({ type: 'sized-variant', operation: 'trace', position: nearComplete })
    assert.deepEqual(trace?.at(-1)?.digits, solved)
    const eliminations = digits.map((_, cell) => cell === 1 ? (size < 16 ? 1 << size : 0) : 0)
    if (size === 16) eliminations.pop()
    await assert.rejects(runEngine({ type: 'sized-variant', operation: 'hints', position, eliminations, limit: 1 }),
      error => error instanceof EngineError && error.code === 'invalid-eliminations')
  }
})

test('one irregular layout composes Renban and parity without a size-specific solver', async () => {
  const regions = [[0, 1, 2, 3, 7], [4, 8, 9, 13, 14], [5, 6, 10, 11, 12], [17, 18, 19, 23, 24], [15, 16, 20, 21, 22]]
  const digits = Array.from('1000000000012000000005000', Number)
  const answer = Array.from('1234534512512342345145123', Number)
  const position: SizedConstraintPosition = {
    version: 2, grid: { size: 5, regions }, digits,
    rules: [{ type: 'renban', cells: [0, 1, 2] }, { type: 'parity', parity: 'odd', cells: [7] }],
  }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  assert.deepEqual((await runEngine({ type: 'sized-variant', operation: 'solve', position }))?.digits, answer)
  for (const rule of position.rules) {
    assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: { ...position, rules: [rule] } }), 'multiple')
  }
  const trace = await runEngine({ type: 'sized-variant', operation: 'trace', position })
  assert.deepEqual(trace?.at(-1)?.digits, answer)
  const regionOnlyDigits = digits.map((_, cell) => cell === 7 ? 5 : 0)
  const masks = await runEngine({ type: 'sized-classic', operation: 'candidates', position: {
    version: 2, grid: position.grid, digits: regionOnlyDigits,
  } })
  assert.equal(masks?.[0], 0b01111)
  assert.equal(masks?.[10], 0b11111)
  const disconnected = regions.map(cells => [...cells])
  ;[disconnected[0][0], disconnected[1][4]] = [disconnected[1][4], disconnected[0][0]]
  await assert.doesNotReject(runEngine({ type: 'sized-variant', operation: 'analyze',
    position: { ...position, grid: { size: 5, regions: disconnected } } }))
})

test('#400 verifies the original SudokuPad Between Lines solution in Wasm', async () => {
  const code = readFileSync(new URL('./fixtures/sized-sudokupad-between-lines.scl', import.meta.url), 'utf8').trim()
  const { game } = await prepareImportedPuzzle(code)
  const solution = '634125512364246513351642465231123456'
  assert.equal(game.title, 'Choose Your Fighter: Between Lines')
  assert.ok(game.sized && game.grid)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze',
    position: sizedRulePosition(game.grid, game.sized, solution) }), 'unique')
  assert.deepEqual(game.sized.solution, solution)
})

test('#382 solves the published boxless Skyscrapers puzzle with clues from every side', async () => {
  const solution = Array.from('4573261764213512367545124376631754234516272765413', Number)
  const rules = [
    ['north', 3, 3], ['north', 5, 2], ['east', 4, 4], ['west', 2, 5], ['north', 4, 2],
    ['east', 1, 3], ['east', 2, 3], ['east', 6, 5], ['south', 5, 4], ['south', 0, 4],
    ['west', 5, 5], ['west', 0, 3],
  ].map(([direction, index, count]) => ({
    type: 'skyscrapers' as const,
    direction: direction as 'north' | 'east' | 'south' | 'west',
    index: Number(index),
    count: Number(count),
  }))
  const position = { version: 2 as const, grid: { size: 7, noRegions: true as const }, digits: Array(49).fill(0), rules }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  assert.deepEqual((await runEngine({ type: 'sized-variant', operation: 'solve', position }))?.digits, solution)
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  assert.equal(candidates?.length, 49)
  assert.ok(candidates?.every(mask => mask !== 0))
  const completed = { ...position, digits: solution }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: completed }), 'unique')
  const invalid = [...solution]
  invalid[3] = 1
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: { ...position, digits: invalid } }), 'conflict')
})

test('#382 the complete published Skyscrapers import solves with its parsed clue set', async ({ mock }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/skyscrapers-unsupported-9W3o.json', import.meta.url), 'utf8')) as {
    metadata: { sudoku_id: string; sudoku: string; name: string; description: string; solution: string }
  }
  const url = `https://sudoku.coach/en/s/${source.metadata.sudoku_id}`
  const page = '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: source.metadata.sudoku_id, sudoku: source.metadata.sudoku, name: source.metadata.name, blocked: false,
    custom_constraints: true, description: source.metadata.description,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => {
    if (path === url) return Promise.resolve(new Response(page))
    if (typeof path === 'string' && path.startsWith('/api/v1/import/')) {
      return worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
    }
    return Promise.resolve(new Response('Not found.', { status: 404 }))
  })

  const preview = await prepareImportedPuzzle(url)
  const game = preview.game
  assert.ok(game.grid?.size === 7 && game.sized)
  assert.equal(game.sized.rules.filter(rule => rule.type === 'skyscrapers').length, 12)
  const result = await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2, grid: game.grid, rules: game.sized.rules,
    digits: Array.from(source.metadata.solution, Number),
  } })
  assert.equal(result, 'unique')
  const definition = puzzleDefinitionForSharing(game)
  assert.deepEqual(definition.sizedRules, game.sized.rules)
  const reopened = await prepareImportedPuzzle(JSON.stringify({ ...definition, format: 'sudoku-app-puzzle' }))
  assert.deepEqual(reopened.game.sized?.rules, game.sized.rules)
})

test('#397 accepts the published 6×6 mixed Non-Consecutive solution and edge exceptions', async () => {
  const solution = Array.from('642513315246531462264135426351153624', Number)
  const position: SizedConstraintPosition = {
    version: 2, grid: { size: 6, boxRows: 2, boxColumns: 3 }, digits: solution,
    rules: [
      { type: 'non-consecutive' },
      { type: 'whispers', cells: [9, 16, 21], minDifference: 3 },
      { type: 'inequality', less: 2, greater: 1 },
      { type: 'inequality', less: 25, greater: 24 },
    ],
  }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')

  const candidatePosition: SizedConstraintPosition = {
    ...position, digits: [2, ...Array(35).fill(0)],
    rules: [{ type: 'non-consecutive' }],
  }
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: candidatePosition })
  assert.equal((candidates![1] & 0b000101), 0)
  const exempt = { ...candidatePosition, rules: [{ type: 'non-consecutive', except: [[1, 0]] as const }] }
  const exemptCandidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position: exempt })
  assert.equal(exemptCandidates![1] & 0b000101, 0b000101)
})

test('#402 applies explicit Global Entropy digit groups on a 6×6 Sudoku grid', async () => {
  const grid = { size: 6, boxRows: 2, boxColumns: 3 } as const
  const groups = [[1, 2], [3, 4], [5, 6]] as const
  const solution = '123546456123231465645231314652562314'
  const position = {
    version: 2 as const,
    grid,
    digits: [...solution].map(Number),
    rules: [{ type: 'global-entropy', groups }],
  }
  assert.equal(await runEngine({ type: 'sized-variant', position, operation: 'analyze' }), 'unique')
  const invalidLatinSolution = '321546456321213465645213134652562134'
  assert.equal(await runEngine({ type: 'sized-variant', position: { ...position, digits: [...invalidLatinSolution].map(Number) }, operation: 'analyze' }), 'conflict')
  const oneCellBlank = `${solution.slice(0, 7)}0${solution.slice(8)}`
  const candidates = await runEngine({ type: 'sized-variant', position: { ...position, digits: [...oneCellBlank].map(Number) }, operation: 'candidates' })
  assert.ok(Array.isArray(candidates))
  assert.equal(candidates[7] & (1 << (Number(solution[7]) - 1)), 1 << (Number(solution[7]) - 1))
})

test('#397 imports Non-Consecutive Flockers through Preview with all companion rules', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/nonconsecutive-coach.json', import.meta.url), 'utf8')) as {
    examples: { url: string; code: string; solution: string }[]
  }
  const source = fixture.examples.find(example => example.url.endsWith('/Cby7'))!
  const { game } = await prepareImportedPuzzle(source.code)
  assert.ok(game.grid?.size === 6 && game.sized)
  assert.deepEqual(game.sized.rules.map(rule => rule.type), ['non-consecutive', 'whispers', 'inequality', 'inequality'])
  const completed = { ...sizedRulePosition(game.grid, game.sized, source.solution), digits: [...source.solution].map(Number) }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: completed }), 'unique')
  const definition = puzzleDefinitionForSharing(game)
  assert.deepEqual(definition.sixRules, game.sized.rules)
  const reopened = await prepareImportedPuzzle(JSON.stringify({ ...definition, format: 'sudoku-app-puzzle' }))
  assert.deepEqual(reopened.game.sized?.rules, game.sized.rules)
})

test('the sized dispatcher accepts Between with Renban and rejects an unavailable companion rule', async () => {
  const position = {
    version: 2, grid: { size: 4, boxRows: 2, boxColumns: 2 }, digits: Array(16).fill(0),
    rules: [{ type: 'renban', cells: [0, 1, 2] }, { type: 'between', cells: [5, 6, 7] }],
  }
  const request = {
    type: 'sized-variant', operation: 'analyze',
    position,
  } as EngineRequest
  assert.equal(await runEngine(request), 'multiple')
  const unsupported = { ...request, position: { ...position,
    rules: [...position.rules, { type: 'unknown-companion' }],
  } } as EngineRequest
  await assert.rejects(runEngine(unsupported))
})

test('Kropki support uses the digit range and edge layout on small and wide grids', async () => {
  for (const [size, boxRows, boxColumns] of [[4, 2, 2], [6, 2, 3], [6, 3, 2], [16, 4, 4]]) {
    const digits = Array.from({ length: size ** 2 }, (_, cell) => cell === 0 ? 1 : 0)
    const position: SizedConstraintPosition = {
      version: 2, grid: { size, boxRows, boxColumns }, digits,
      rules: [{ type: 'kropki', consecutive: { pairs: [[0, 1]] }, ratioTwo: { pairs: [[1, 2]] } }],
    }
    const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
    assert.equal(masks?.[1], 1 << 1)
    assert.equal(masks?.[2], 1 << 3)
    assert.equal(masks?.[size], (1 << size) - 2)
    const hints = await runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 5 })
    assert.ok(hints?.choices.some(choice => choice.type === 'kropki' && choice.pair.cells[1] === 1 &&
      choice.pair.relation === 'consecutive' && !choice.pair.negative))
    const invalid: SizedConstraintPosition = { ...position, rules: [{ type: 'kropki', ratioTwo: { pairs: [[size - 1, size]] } }] }
    await assert.rejects(runEngine({ type: 'sized-variant', operation: 'analyze', position: invalid }),
      error => error instanceof EngineError && error.code === 'invalid-rules')
  }
})

test('Quadki corner dots constrain both diagonal pairs through the sized engine', async () => {
  const solution = [...'164523523164352641416235641352235416'].map(Number)
  const position: SizedConstraintPosition = {
    version: 2, grid: { size: 6, boxRows: 2, boxColumns: 3 },
    digits: solution,
    rules: [{ type: 'corner-kropki', consecutive: [28, 13], ratioTwo: [1, 8, 15, 20] }],
  }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  const incomplete = { ...position, digits: solution.map((digit, cell) => cell === 8 ? 0 : digit) }
  const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position: incomplete })
  assert.equal(masks?.[8], 1 << 2)
  await assert.rejects(runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...position, rules: [{ type: 'corner-kropki', ratioTwo: [5] }],
  } }), error => error instanceof EngineError)
})

test('the published Quadki SudokuPad code reaches Preview with its unique engine-verified solution', async () => {
  const code = readFileSync(new URL('./fixtures/sized-quadki.scl', import.meta.url), 'utf8').trim()
  const { game } = await prepareImportedPuzzle(code)
  const solution = '164523523164352641416235641352235416'
  assert.equal(game.title, 'Quadki')
  assert.ok(game.grid && game.sized)
  assert.equal(game.sized.solution, solution)
  assert.deepEqual(game.sized.rules, [{
    type: 'corner-kropki', consecutive: [28, 13], ratioTwo: [1, 8, 15, 20],
  }])
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    version: 2,
    grid: game.grid,
    digits: [...game.givens].map(Number),
    rules: game.sized.rules,
  } }), 'unique')
})

test('Kropki negative rules exempt any marked edge across authored rule records', async () => {
  const grid = { size: 6, boxRows: 2, boxColumns: 3 } as const
  const digits = Array<number>(36).fill(0)
  digits[0] = 1
  const position: SizedConstraintPosition = {
    version: 2, grid, digits,
    rules: [{ type: 'kropki', consecutive: { negative: true } },
      { type: 'kropki', ratioTwo: { pairs: [[1, 0]] } }],
  }
  const hints = await runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 8 })
  assert.ok(hints?.choices.some(choice => choice.type === 'kropki' && choice.rule === 0 &&
    choice.pair.cells[0] === 0 && choice.pair.cells[1] === 6 && choice.pair.negative &&
    choice.actions.some(action => 'eliminate' in action && action.eliminate.cell === 6 && action.eliminate.digit === 2)))
  assert.ok(!hints?.choices.some(choice => choice.type === 'kropki' && choice.pair.cells[0] === 0 &&
    choice.pair.cells[1] === 1 && choice.pair.negative))
  const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  assert.equal(masks?.[1], 1 << 1)
  assert.equal((masks?.[6] ?? 0) & (1 << 1), 0)
})

test('Difference markers can use the largest valid gap at each supplied size', async () => {
  for (const [size, boxRows, boxColumns] of [[4, 2, 2], [8, 2, 4], [16, 4, 4]]) {
    const digits = Array<number>(size * size).fill(0)
    digits[0] = 1
    const position: SizedConstraintPosition = {
      version: 2, grid: { size, boxRows, boxColumns }, digits,
      rules: [{ type: 'difference', cells: [1, 0], difference: size - 1 }],
    }
    const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
    assert.equal(masks?.[1], 1 << (size - 1))
    await assert.rejects(runEngine({ type: 'sized-variant', operation: 'analyze', position: {
      ...position, rules: [{ type: 'difference', cells: [1, 0], difference: size }],
    } }), error => error instanceof EngineError && error.code === 'invalid-rules')
  }
})

test('an Arrow permits repeated shaft digits when the houses also permit them', async () => {
  const digits = Array<number>(16).fill(0)
  digits[0] = digits[6] = 1
  const position: SizedConstraintPosition = {
    version: 2, grid: { size: 4, boxRows: 2, boxColumns: 2 }, digits,
    rules: [{ type: 'arrow', circle: 1, cells: [0, 6] }],
  }
  const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  assert.equal(masks?.[1], 1 << 1)
  const response = await runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 1 })
  assert.deepEqual(response?.choices, [{ type: 'rule', rule: 0,
    actions: [{ eliminate: { cell: 1, digit: 3 } }, { eliminate: { cell: 1, digit: 4 } }] }])
  const completed = Array.from('1234341221434321', Number)
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: { ...position, digits: completed } }), 'unique')
})

test('a full-length Arrow uses the digit range and scratch space of a 16 × 16 layout', async () => {
  const size = 16
  const digits = Array<number>(size ** 2).fill(0)
  const cells = Array.from({ length: size }, (_, row) => row * size + ((size - (row * 4 + Math.floor(row / 4)) % size) % size))
  digits[15] = size
  const position: SizedConstraintPosition = {
    version: 2, grid: { size, boxRows: 4, boxColumns: 4 }, digits,
    rules: [{ type: 'arrow', circle: 15, cells }],
  }
  const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  for (const cell of cells) assert.equal(masks?.[cell], 1)
  await assert.rejects(runEngine({ type: 'sized-variant', operation: 'analyze',
    position: { ...position, rules: [{ type: 'arrow', circle: cells[0], cells }] },
  }), error => error instanceof EngineError && error.code === 'invalid-rules')
})

test('Region Sum distinguishes consecutive visits from totals grouped by box', async () => {
  const digits = Array.from('0030000000000001', Number)
  const answer = Array.from('1234341221434321', Number)
  const cells = [0, 4, 9, 13, 10, 5]
  const position: SizedConstraintPosition = {
    version: 2, grid: { size: 4, boxRows: 2, boxColumns: 2 }, digits,
    rules: [{ type: 'region-sum', cells }],
  }
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  assert.deepEqual(await runEngine({ type: 'sized-variant', operation: 'solve-unique', position }), {
    status: 'unique', solution: { digits: answer, variables: {} },
  })
  assert.deepEqual(await runEngine({ type: 'sized-variant', operation: 'solve-unique', position: {
    ...position, rules: [{ type: 'region-sum', cells, groupByRegion: true }],
  } }), { status: 'unsolvable' })
  assert.deepEqual(await runEngine({ type: 'sized-variant', operation: 'solve-unique', position: {
    ...position, rules: [{ type: 'parity', parity: 'odd', cells: [0] }],
  } }), { status: 'multiple' })
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position: {
    ...position, rules: [{ type: 'region-sum', cells, groupByRegion: true }],
  } }), 'unsolvable')
  assert.equal(await runEngine({ type: 'sized-classic', operation: 'analyze', position: {
    version: 2, grid: position.grid, digits,
  } }), 'multiple')
  const hints = await runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 1 })
  assert.ok(hints?.choices.some(choice => choice.type === 'rule' && choice.rule === 0))
  const trace = await runEngine({ type: 'sized-variant', operation: 'trace', position })
  assert.deepEqual(trace?.at(-1)?.digits, answer)
})

test('Region Sum supports a total of 136 across two complete 16 × 16 boxes', async () => {
  const size = 16
  const answer = Array.from({ length: size ** 2 }, (_, cell) => {
    const row = Math.floor(cell / size)
    return (row * 4 + Math.floor(row / 4) + cell % size) % size + 1
  })
  const digits = answer.map((digit, cell) => cell === 19 || cell === 39 ? 0 : digit)
  const firstBox = Array.from({ length: size }, (_, cell) => Math.floor(cell / 4) * size + cell % 4)
  const position: SizedConstraintPosition = {
    version: 2, grid: { size, boxRows: 4, boxColumns: 4 }, digits,
    rules: [{ type: 'region-sum', cells: [...firstBox, ...firstBox.map(cell => cell + 4)] }],
  }
  const masks = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  for (const cell of [19, 39]) assert.equal(masks?.[cell], 1 << (answer[cell] - 1))
  assert.equal(await runEngine({ type: 'sized-variant', operation: 'analyze', position }), 'unique')
  assert.deepEqual((await runEngine({ type: 'sized-variant', operation: 'solve', position }))?.digits, answer)
})

test('labeled ratios use the digit range and report precise positive and negative edges', async () => {
  const size = 16
  const digits = Array(size ** 2).fill(0)
  digits[0] = 1
  const position: SizedConstraintPosition = {
    version: 2, grid: { size, boxRows: 4, boxColumns: 4 }, digits,
    rules: [{ type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [0, 1], value: 16 }], negative: true }],
  }
  const candidates = await runEngine({ type: 'sized-variant', operation: 'candidates', position })
  assert.equal(candidates?.[1], 1 << 15)
  assert.equal((candidates?.[16] ?? 0) & (1 << 1), 0)
  const hints = await runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 16 })
  assert.ok(hints?.choices.some(step => step.type === 'kropki' && step.pair.cells[1] === 1 && step.pair.value === 16))
  assert.ok(hints?.choices.some(step => step.type === 'kropki' && step.pair.cells[1] === 16 && step.pair.value === 2 && step.pair.negative))
})

const coachSumQuadruples = JSON.parse(readFileSync(new URL('./fixtures/sum-quadruple-coach.json', import.meta.url), 'utf8')) as {
  url: string; title: string; coach: string; solution: string
}[]

for (const publication of coachSumQuadruples) {
  test(`Coach ${publication.title} opens with overlapping clues and solves without contradiction`, async ({ mock }) => {
    const { url, coach, title } = publication
    const specificSudoku = {
      sudoku_id: url.split('/').at(-1), sudoku: coach, name: title, description: '', blocked: false, custom_constraints: false,
    }
    mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => input === url
      ? new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>')
      : worker.fetch(new Request(new URL(input, 'https://sudoku.example'), init), {}, {}))
    const { game } = await prepareImportedPuzzle(url)
    const { game: pasted } = await prepareImportedPuzzle(coach)
    assert.equal(game.title, title)
    assert.deepEqual(game.sized, pasted.sized)
    specificSudoku.custom_constraints = true
    specificSudoku.description = 'The author has added a separate rule.'
    await assert.rejects(prepareImportedPuzzle(url), /has author instructions/)
    assert.ok(game.sized && game.grid && game.grid.size === 4)
    assert.equal(game.sized.solution, publication.solution)
    const { grid, sized, givens } = game
    const position = sizedRulePosition(grid, sized, givens)
    const result = await runEngine({ type: 'sized-variant', operation: 'hints', position, limit: 64 })
    const overlaps = result?.choices.filter(choice => choice.type === 'quadruple-overlap') ?? []
    assert.ok(overlaps.some(choice => choice.rules.some(index => sized.rules[index].type === 'region-sum')))
    if (url.endsWith('/HuRz')) {
      assert.ok(overlaps.some(choice => choice.rules.every(index => sized.rules[index].type === 'quadruple')))
    }
    const box = (cell: number) => 2 * Math.floor(cell / 8) + Math.floor(cell % 4 / 2)
    const sharesHouse = (a: number, b: number) => Math.floor(a / 4) === Math.floor(b / 4) || a % 4 === b % 4 || box(a) === box(b)
    for (const overlap of overlaps) {
      const cells = overlap.cells
      const supports = cells.map(() => new Set<number>())
      const selected = overlap.rules.map(index => sized.rules[index])
      const fits = (board: readonly number[]) => selected.every(rule => {
        if (rule.type === 'quadruple') {
          const a = rule.topLeft
          const values = [a, a + 1, a + 4, a + 5].map(cell => board[cell])
          return rule.digits.every(digit => values.filter(value => value === digit).length >=
            rule.digits.filter(value => value === digit).length)
        }
        assert.ok(rule.type === 'region-sum' && !rule.groupByRegion)
        const totals: number[] = []
        let previous = -1
        for (const cell of rule.cells) {
          if (box(cell) !== previous) totals.push(0)
          previous = box(cell)
          totals[totals.length - 1] += board[cell]
        }
        return new Set(totals).size === 1
      })
      const enumerate = (values: number[]) => {
        const cell = cells[values.length]
        if (cell === undefined) {
          const board = Array.from({ length: 16 }, (_, index) => values[cells.indexOf(index)])
          if (fits(board)) values.forEach((digit, index) => supports[index].add(digit))
          return
        }
        for (const digit of [1, 2, 3, 4]) {
          if (!values.some((value, index) => value === digit && sharesHouse(cell, cells[index]))) enumerate([...values, digit])
        }
      }
      enumerate([])
      const expected = cells.flatMap((cell, i) => [1, 2, 3, 4]
        .filter(digit => !supports[i].has(digit)).map(digit => ({ eliminate: { cell, digit } })))
      assert.deepEqual(overlap.actions, expected)
    }

    const hint = (await puzzleHints(game)).choices[0]
    assert.equal(hint.technique, 'sized-quadruple')
    assert.ok('variant' in hint.evidence && /Both clues must use the same digits/.test(hint.evidence.variant.description))
    const finder = await sizedRuleHintChoices(sized, grid, givens)
    const quadChoices = finder?.choices.filter(choice => choice.technique === 'sized-quadruple')
    assert.ok(quadChoices?.length)
    assert.deepEqual((await puzzleHints(game, 'all', 'sized-quadruple')).choices, quadChoices)

    const path = await puzzleSolution(game)
    assert.equal(path.board, publication.solution)
    assert.equal(path.status, 'solved')
    assert.ok(path.steps.every(step => step.technique !== 'sized-contradiction'))
    for (const step of path.steps) {
      for (const action of step.actions) {
        if ('place' in action) assert.equal(publication.solution[action.place.cell], String(action.place.digit))
        else assert.notEqual(publication.solution[action.eliminate.cell], String(action.eliminate.digit))
      }
    }
  })
}
