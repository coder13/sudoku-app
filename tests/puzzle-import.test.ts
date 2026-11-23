import assert from 'node:assert/strict'
import { test } from 'node:test'
import lzString from 'lz-string'
import { exportPuzzle, STARTER } from '../src/sudoku/formats.ts'
import { WINDOKU_REGIONS, isPlayablePuzzle, variantName, variantRuleDescriptions } from '../src/sudoku/variants.ts'
import { countMixedSolutions } from './helpers/mixed-oracle.ts'
import { mixedFixtures } from './helpers/mixed-fixtures.ts'
import { coachCode as coach } from './helpers/coach-code.ts'
import { MINI_GRID } from '../src/sudoku/grid.ts'
import { EMPTY } from '../src/sudoku/game.ts'
import { detectPuzzle, MAX_IMPORT_LENGTH } from '../src/sudoku/puzzle-import.ts'
import { jigsawLayout, variantSeeds } from '../src/sudoku/variant-generation.ts'
import type { VariantPuzzle } from '../src/sudoku/engine.ts'

const killerCode = 'SCv7_32_f2ear5619r1j0424vv2ueeb4dmnhrtoafv013t8gml8m9a8dak99187anvhi042qle5n5g57oht8itr6ctujbgskht7vj8pnnc237p5nfpucogqucqpj7jeneb6rubfjfn1c7ipo5t9pfhvlj3jqnia7mehgcpjpnua3lj513ft85jnte3n7v423fstaqjodq8fedkidrmslvul9dhesrv3qbqvrvnfgpcosgap014oa5fef8m0h3a6po9cjgk41tlutgui1fe8dm917g1s5769ddje089io8k85jac8c0ajab210ulnibi91ao8l714o441no0kiolen2rm4keaq02t0ejqbi29maqd7g99lamep49bil33g9ae2gi4ps0d7gkr0b6obeo44ilvng1infda8230vs0hboktfih9u44qph55vaogeashio3b0hugm8nt7ggc1pdstpg8qre9f6f6gigch48112ikkbbtqm20c135u9i36gsbl205bug245l36amr2cma45l5tat2n923rhs3ecl2s9uaqfh1dbb5fvqcd3vh1davtvumbif3m3n9ftur4t4r05u3'
const jigsawCode = 'SCv7_32_f2e6rjmd1b130360u5rsjec7tihmncvjrpg4fsb656skp67287crmbq9lc7b8vp8pm7l5uk2njp6bpj7ga8hpb19udqrjgbod9eajd9ql7vinvhjfl2mrc2k6hnha2uirfk20kaik4lb2him72ccjma1sp3lk9mefibhu0uqt8u65l23bdj15gg6e4k67lcv8mtfbejp19p5qni1r1r21nhsn4'
const shortGrid = STARTER.replace(/\d0{0,5}/g, (run) =>
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwx'[Number(run[0]) + 10 * (run.length - 1)])

test('detects existing formats and compact Classic links', async () => {
  const inputs = [
    [STARTER, 'Text grid'],
    ['```text\n' + exportPuzzle(STARTER, 'grid') + '\n```', 'Text grid'],
    [exportPuzzle(STARTER, 'hodoku'), 'HoDoKu'],
    [`https://example.org/#puzzle=${STARTER}`, 'Puzzle link'],
    [exportPuzzle(STARTER, 'coach'), 'Sudoku Coach'],
    [exportPuzzle(STARTER, 'exchange'), 'Sudoku Exchange'],
    [`https://sudokuexchange.com/play/?s=${shortGrid}&d=1`, 'Sudoku Exchange'],
    [`https://sudokupad.app/scf${shortGrid}`, 'SudokuPad'],
  ]
  for (const [input, format] of inputs) assert.deepEqual(await detectPuzzle(input), { givens: STARTER, format }, input)
})

test('imports embedded puzzles with no browser location and resolves shares only on the app origin', async t => {
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const origin = 'https://sudoku.example'
  const id = '12345678-1234-4123-8123-123456789abc'
  const fetch = t.mock.method(globalThis, 'fetch', async (path: string) => {
    assert.equal(path, `/api/v1/shares/${id}`)
    return Response.json({ version: 1, title: 'Shared puzzle', givens: STARTER })
  })
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })
  try {
    assert.deepEqual(await detectPuzzle(`#puzzle=${STARTER}`), { givens: STARTER, format: 'Puzzle link' })
    await assert.rejects(detectPuzzle(`/?share=${id}`), /link format is not supported/)
    Object.defineProperty(globalThis, 'window', { value: { location: { origin } }, configurable: true })
    await assert.rejects(detectPuzzle(`https://elsewhere.example/?share=${id}`), /link format is not supported/)
    assert.equal((await detectPuzzle(`/?share=${id}`)).sharedPuzzleId, id)
    assert.equal(fetch.mock.callCount(), 1)
  } finally {
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('Mini Sudoku imports text and versioned links and rejects unsupported authored rules', async () => {
  const givens = '0000300201400000'
  const grid = MINI_GRID
  for (const input of [exportPuzzle(givens, 'givens'), exportPuzzle(givens, 'grid', 4), '..|..\n3.|.2\n--+--\n.1|4.\n..|..']) {
    assert.deepEqual(await detectPuzzle(input), { givens, grid, format: 'Text grid' })
  }
  assert.deepEqual(await detectPuzzle('#sized=' + encodeURIComponent(JSON.stringify({ version: 2, givens, grid }))), { givens, grid, format: 'Puzzle link' })
  const data = { gridSize: 4, givenDigits: givens, regions: [0,0,1,1,0,0,1,1,2,2,3,3,2,2,3,3] }
  assert.deepEqual(await detectPuzzle(coach(data)), { givens, grid, format: 'Sudoku Coach' })
  assert.deepEqual((await detectPuzzle(coach({ ...data, givenConstraints: [{ type: 'diagonalNegative', segments: [] }] }))).sizedRules,
    [{ type: 'diagonal', diagonal: 'main' }])
  await assert.rejects(detectPuzzle(coach({ ...data, givenConstraints: [{ type: 'antiKnight', segments: [] }] })), /unsupported active rule/)
  await assert.rejects(detectPuzzle(coach({ ...data, regions: [0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3] })), /four 2 × 2 boxes/)
  const puzzle = { size: 4, ruleset: 'Normal 4×4 Sudoku rules apply.', grid: [
    [{}, {}, {}, {}], [{ given: true, value: 3 }, {}, {}, { given: true, value: 2 }],
    [{}, { given: true, value: 1 }, { given: true, value: 4 }, {}], [{}, {}, {}, {}],
  ] }
  const code = lzString.compressToBase64(JSON.stringify(puzzle))
  assert.deepEqual(await detectPuzzle(`https://sudokupad.app/fpuz${encodeURIComponent(code)}`), { givens, grid, format: 'SudokuPad' })
  assert.deepEqual(await detectPuzzle(JSON.stringify(puzzle)), { givens, grid, format: 'f-puzzles' })
  await assert.rejects(detectPuzzle(JSON.stringify({ ...puzzle, 'diagonal+': true })), /rules that Mini Sudoku cannot import/)
  const rules = [{ type: 'diagonal', diagonal: 'main' }]
  const invalidShare = '#sized=' + encodeURIComponent(JSON.stringify({ version: 2, grid, givens, rules }))
  await assert.rejects(detectPuzzle(invalidShare), /unsupported rules or invalid algebraic cages/)
})

test('imports the supplied Killer grid from a Sudoku Coach code or link', async () => {
  const puzzle = await detectPuzzle(killerCode)
  assert.equal(puzzle.format, 'Sudoku Coach')
  assert.equal(puzzle.givens, '000000300' + '0'.repeat(72))
  assert.equal(puzzle.variant?.id, 'killer-cages')
  const rule = puzzle.variant.puzzle.rules?.[0]
  assert.equal(rule?.type, 'killer-cages')
  assert.equal(rule.cages.length, 36)
  assert.deepEqual(rule.cages[0], { cells: [0, 9], sum: 10 })
  assert.deepEqual(rule.cages.at(-1), { cells: [79, 80], sum: 11 })
  assert.equal(new Set(rule.cages.flatMap(({ cells }) => cells)).size, 81)
  assert.equal(rule.cages.reduce((sum, cage) => sum + cage.sum, 0), 405)
  assert.deepEqual(await detectPuzzle(`sudoku.coach/en/play/${killerCode}`), puzzle)
  assert.deepEqual(await detectPuzzle(`https://sudoku.coach/en/solver/${killerCode}`), puzzle)
  const shared = `https://example.org/#variant=${encodeURIComponent(JSON.stringify(puzzle.variant))}`
  assert.deepEqual(await detectPuzzle(shared), { ...puzzle, format: 'Puzzle link' })
})

test('keeps the givens and irregular regions of a Jigsaw grid', async () => {
  const puzzle = await detectPuzzle(jigsawCode)
  assert.equal(puzzle.givens, '000000350080000200000090030100600000020000000000000000000000090000400005971005000')
  assert.equal(puzzle.variant?.id, 'jigsaw')
  const regions = puzzle.variant.puzzle.regions
  assert.equal(regions?.type, 'jigsaw')
  assert.equal(regions.regions.length, 9)
  assert.deepEqual(regions.regions[0], [0, 1, 2, 3, 10, 11, 12, 19, 28])
  assert.equal(new Set(regions.regions.flat()).size, 81)
})

test('keeps 9 × 9 Coach Current State digits and both kinds of candidates separate from givens and rules', async () => {
  const editable = [...STARTER].flatMap((digit, cell) => digit === '0' ? [cell] : [])
  const [placedCell, candidateCell, cornerOnlyCell] = editable
  const givenCell = [...STARTER].findIndex(digit => digit !== '0')
  const entries = [...EMPTY]
  entries[placedCell] = '1'
  const center = Array<number>(81).fill(0)
  const corner = Array<number>(81).fill(0)
  center[candidateCell] = 1 | 256
  corner[candidateCell] = 16
  corner[cornerOnlyCell] = 511
  const userDigits = [...entries]
  userDigits[givenCell] = STARTER[givenCell]
  const state = await detectPuzzle(coach({
    givenDigits: STARTER,
    userDigits: userDigits.join(''),
    userCellCandidates: center.map(mask => mask << 1).join('-'),
    userBoxCandidates: corner.map(mask => mask << 1).join('-'),
    givenConstraints: [
      { type: 'diagonalNegative', segments: [], settings: {} },
      { type: 'diagonalPositive', segments: [], settings: {} },
    ],
  }))
  assert.equal(state.givens, STARTER)
  assert.equal(state.variant?.puzzle.givens, STARTER)
  assert.deepEqual(state.progress, { entries: entries.join(''), center, corner })
  assert.deepEqual(state.variant?.puzzle.rules, [
    { type: 'diagonal', diagonal: 'main' },
    { type: 'diagonal', diagonal: 'anti' },
  ])
  assert.equal((await detectPuzzle(coach({}))).givens, EMPTY)
  assert.deepEqual(await detectPuzzle(coach({ givenDigits: STARTER, meta: { puzzleName: 'Classic puzzle' } })),
    { givens: STARTER, format: 'Sudoku Coach' })
  for (const [type, cells, rule] of [
    ['antiKnight', [], { type: 'anti-knight' }],
    ['thermometer', [0, 10, 11], { type: 'thermometer', cells: [0, 10, 11] }],
    ['arrow', [0, 10, 11], { type: 'arrow', circle: 0, cells: [10, 11] }],
  ] as const) {
    const puzzle = await detectPuzzle(coach({ givenDigits: STARTER,
      givenConstraints: [{ type, segments: cells.length ? [{ cells, parameters: {} }] : [], settings: {} }] }))
    assert.deepEqual(puzzle.variant?.puzzle.rules, [rule])
  }
})

test('Coach Current State keeps multiple player colors separate from the authored region', async () => {
  const house = [0, 1, 2, 9, 10, 11, 18, 19, 27]
  const givenConstraints = [{ type: 'region', segments: [{ cells: house }] }]
  const givenColours = Array.from({ length: 81 }, (_, cell) => house.includes(cell) ? '0' : '').join(',')
  const marks = Array<string>(81).fill('')
  marks[0] = '21'
  marks[80] = '3'
  const data = { givenDigits: STARTER, givenConstraints, givenColours,
    colours: ['green', 'blueHeavy', 'cyan', '#6c5ce7'], userColours: marks.join(',') }
  const imported = await detectPuzzle(coach(data))
  assert.deepEqual(imported.variant?.puzzle.rules, [{ type: 'extra-house', cells: house }])
  assert.deepEqual(imported.progress, {
    entries: EMPTY, center: Array(81).fill(0), corner: Array(81).fill(0),
    importedCellColors: { 0: ['blueHeavy', 'cyan'], 80: ['#6c5ce7'] },
  })
  assert.equal((await detectPuzzle(coach({ ...data, userColours: ','.repeat(80) }))).progress, undefined)
  assert.equal((await detectPuzzle(coach({ ...data, userColours: undefined }))).progress, undefined)
  for (const userColours of ['1', '4' + ','.repeat(80), '11' + ','.repeat(80)]) {
    await assert.rejects(detectPuzzle(coach({ ...data, userColours })), /invalid cell colors/)
  }
  await assert.rejects(detectPuzzle(coach({ ...data, colours: ['green', 'var(--custom)', 'cyan', '#6c5ce7'] })),
    /invalid or unsupported cell colors/)
})

test('Coach Current State decodes candidate colors without changing either candidate style', async () => {
  const palette = ['blueHeavy', 'orangeHeavy', ...Array(8).fill('blue'), '#542aff']
  const masks = [4, 32, ...Array(79).fill(0)].join('-')
  const data = { colours: palette, userCellCandidates: masks, userBoxCandidates: masks, userCellCandidatesColours: '0+2+0-1+5+1-80+9+A' }
  const { progress } = await detectPuzzle(coach(data))
  assert.deepEqual(progress?.importedCandidateColors, { 0: { 2: 'blueHeavy' }, 1: { 5: 'orangeHeavy' }, 80: { 9: '#542aff' } })
  assert.deepEqual(progress?.center, [2, 16, ...Array(79).fill(0)])
  assert.deepEqual(progress?.corner, progress?.center)
  assert.deepEqual((await detectPuzzle(coach({ colours: palette, userCellCandidatesColours: '80+9+A' }))).progress, {
    entries: EMPTY, center: Array(81).fill(0), corner: Array(81).fill(0), importedCandidateColors: { 80: { 9: '#542aff' } },
  })
  for (const userCellCandidatesColours of ['81+2+0', '0+0+0', '0+2+B', '0+2+0-0+2+1', '0+2+0-', '00+2+0']) {
    await assert.rejects(detectPuzzle(coach({ ...data, userCellCandidatesColours })), /invalid or unsupported candidate colors/)
  }
  await assert.rejects(detectPuzzle(coach({ ...data, colours: ['var(--bad)'] })), /invalid or unsupported candidate colors/)
})

test('Coach Current State preserves Quick Draw lines, edge crosses, and cell symbols', async () => {
  const diagonal = { type: 'diagonalNegative', segments: [] }
  const data = {
    givenDigits: STARTER, givenConstraints: [diagonal],
    quickDrawLineSegments: {
      '0.5/0.5=>2.5/3.5': { colour: 'blueHeavy' },
      '0/1=>1/1': { colour: '#3af89c' },
      '-0.5/0.5=>0.5/0.5': { colour: 'grey' },
    },
    quickDrawSymbols: { '1/0.5': { shape: 'cross', colour: 'redHeavy' } },
    cells: {
      0: { quickSymbol: { shape: 'circle', colour: 'greenHeavy' } },
      40: { quickSymbol: { shape: 'square', colour: 'orangeHeavy' } },
      80: { quickSymbol: { shape: 'cross', colour: 'purpleHeavy' } },
    },
  }
  const result = await detectPuzzle(coach(data))
  assert.equal(result.givens, STARTER)
  assert.deepEqual(result.variant?.puzzle.rules, [{ type: 'diagonal', diagonal: 'main' }])
  assert.deepEqual(result.progress, {
    entries: EMPTY, center: Array(81).fill(0), corner: Array(81).fill(0),
    importedDrawings: [
      { shape: 'line', from: [.5, .5], to: [2.5, 3.5], color: 'blueHeavy' },
      { shape: 'line', from: [0, 1], to: [1, 1], color: '#3af89c' },
      { shape: 'line', from: [-.5, .5], to: [.5, .5], color: 'grey' },
      { shape: 'cross', at: [1, .5], color: 'redHeavy' },
      { shape: 'circle', at: [.5, .5], color: 'greenHeavy' },
      { shape: 'square', at: [4.5, 4.5], color: 'orangeHeavy' },
      { shape: 'cross', at: [8.5, 8.5], color: 'purpleHeavy' },
    ],
  })
  for (const override of [
    { quickDrawLineSegments: { '1.2/1=>1/1': { colour: 'red' } } },
    { quickDrawLineSegments: { '1/1=>1/1': { colour: 'red' } } },
    { quickDrawLineSegments: { '0/0=>1/1': { colour: 'var(--unsafe)' } } },
    { quickDrawSymbols: { '1/1': { shape: 'cross', colour: 'red' } } },
    { quickDrawSymbols: { '1/0.5': { shape: 'circle', colour: 'red' } } },
    { cells: { 81: data.cells[0] } },
    { cells: { 0: { ...data.cells[0], predefinedLetters: 'A' } } },
    { cells: { 0: { quickSymbol: { shape: 'triangle', colour: 'red' } } } },
  ]) await assert.rejects(detectPuzzle(coach({ ...data, ...override })), /invalid or unsupported Quick Draw/)
})

test('ignores 9 × 9 Coach candidate marks without a cell coordinate', async () => {
  for (const cellCandidates of [0, 511]) {
    const imported = await detectPuzzle(coach({ givenDigits: STARTER, cells: { 'NaN,NaN': { cellCandidates } } }))
    assert.equal(imported.format, 'Sudoku Coach')
    assert.equal(imported.givens, STARTER)
    assert.equal(imported.progress, undefined)
  }
  for (const cellCandidates of [-1, 1.5, 512]) {
    await assert.rejects(detectPuzzle(coach({ cells: { 'NaN,NaN': { cellCandidates } } })), /invalid or unsupported Quick Draw/)
  }
})

test('accepts empty Coach Current State and reports malformed progress separately from givens', async () => {
  const emptyMasks = Array(81).fill('0').join('-')
  assert.deepEqual(await detectPuzzle(coach({
    givenDigits: STARTER, userDigits: EMPTY, userCellCandidates: emptyMasks, userBoxCandidates: '',
  })), { givens: STARTER, format: 'Sudoku Coach' })
  const wrongGiven = [...EMPTY]
  const givenCell = [...STARTER].findIndex(digit => digit !== '0')
  wrongGiven[givenCell] = STARTER[givenCell] === '1' ? '2' : '1'
  await assert.rejects(detectPuzzle(coach({ givenDigits: STARTER, userDigits: wrongGiven.join('') })), /replaces a given/)
  await assert.rejects(detectPuzzle(coach({ givenDigits: STARTER, userDigits: '123' })), /invalid placed digits/)
  for (const mask of ['2-4', '1024' + emptyMasks.slice(1), '513' + emptyMasks.slice(1), '0x2' + emptyMasks.slice(1)]) {
    await assert.rejects(detectPuzzle(coach({ givenDigits: STARTER, userBoxCandidates: mask })), /invalid candidate marks/)
  }
})

test('imports Windoku regions and keeps them through sharing', async () => {
  const givenConstraints = WINDOKU_REGIONS.map(cells => ({
    type: 'region', segments: [{ cells, parameters: {} }],
    settings: { opacity: 255, colour: '#d68a8a', shapeSize: 100, borderColour: '#aaaaaa', borderThickness: 0 },
  }))
  const source = coach({ givenDigits: '000000070700000056000590000000000300040001090016000000000000800003254000007100000', givenConstraints })
  const imported = await detectPuzzle(source)
  assert.equal(imported.variant?.id, 'windoku')
  assert.deepEqual(imported.variant.puzzle.rules, WINDOKU_REGIONS.map(cells => ({ type: 'extra-house', cells })))
  const shared = 'https://example.org/#variant=' + encodeURIComponent(JSON.stringify(imported.variant))
  assert.deepEqual(await detectPuzzle(shared), { ...imported, format: 'Puzzle link' })
  const partial = await detectPuzzle(coach({ givenConstraints: givenConstraints.slice(1) }))
  assert.equal(partial.variant?.id, 'mixed')
  assert.deepEqual(partial.variant.puzzle.rules, WINDOKU_REGIONS.slice(1).map(cells => ({ type: 'extra-house', cells })))
  const repeated = await detectPuzzle(coach({ givenConstraints: [
    ...givenConstraints, { type: 'region', segments: [{ cells: WINDOKU_REGIONS[0], parameters: {} }] },
  ] }))
  assert.equal(repeated.variant?.id, 'mixed')
  assert.equal(repeated.variant.puzzle.rules?.length, 5)
  const short = WINDOKU_REGIONS[0].slice(1)
  const shaded = await detectPuzzle(coach({ givenConstraints: [{
    type: 'region', segments: [{ cells: short, parameters: {} }],
  }] }))
  assert.equal(shaded.variant?.id, 'mixed')
  assert.deepEqual(shaded.variant.puzzle.rules, [{ type: 'distinct-cells', cells: short }])
  await assert.rejects(detectPuzzle(coach({ givenConstraints: [{ type: 'region', segments: [
    { cells: [...short, short[0]], parameters: {} },
  ] }] })), /unsupported or invalid/)
})

test('opens f-puzzles links, raw exports, and SudokuPad f-puzzles links', async () => {
  const grid = Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, column) => {
    const value = Number(STARTER[row * 9 + column])
    return value ? { value, given: true } : { value: 8, centerPencilMarks: [1, 2] }
  }))
  const json = JSON.stringify({ size: 9, grid, ruleset: 'Normal sudoku rules apply.' })
  const code = lzString.compressToBase64(json)
  const parsed = { givens: STARTER, format: 'f-puzzles' }
  assert.deepEqual(await detectPuzzle(json), parsed)
  assert.deepEqual(await detectPuzzle(code), parsed)
  assert.deepEqual(await detectPuzzle(`https://f-puzzles.com/?load=${encodeURIComponent(code)}`), parsed)
  assert.deepEqual(await detectPuzzle(`https://sudokupad.app/fpuzzles${encodeURIComponent(code)}`), { ...parsed, format: 'SudokuPad' })
  const result = await detectPuzzle(JSON.stringify({ size: 9, grid, killercage: [{ cells: ['R1C1', 'R1C2'], value: '8' }] }))
  assert.deepEqual(result.variant?.puzzle.rules, [{ type: 'killer-cages', cages: [{ cells: [0, 1], sum: 8 }] }])
  await assert.rejects(detectPuzzle(JSON.stringify({ size: 9, grid, fogofwar: ['R1C1'] })), /not supported yet.*fogofwar/)
})

test('reports unsupported or damaged codes without treating them as Classic', async ({ mock }) => {
  await assert.rejects(detectPuzzle('SCv6_32_0000'), /unsupported format/)
  await assert.rejects(detectPuzzle('SCv7_32_zzzz'), /invalid character/)
  await assert.rejects(detectPuzzle('SCv7_32_0000'), /could not be opened/)
  mock.method(globalThis, 'fetch', async (path: string) => {
    assert.ok(['/api/v1/import/sudokupad/example-share-id', '/api/v1/import/sudoku-coach/DMnw'].includes(path))
    return Response.json({ error: 'The published puzzle could not be found.' }, { status: 404 })
  })
  await assert.rejects(detectPuzzle('https://sudoku.coach/en/s/DMnw'), /published puzzle could not be found/)
  await assert.rejects(detectPuzzle('https://sudokupad.app/example-share-id'), /published puzzle could not be found/)
  await assert.rejects(detectPuzzle(coach({ givenConstraints: [{ type: 'globalModularity', segments: [] }] })), /not supported yet.*globalModularity/)
  await assert.rejects(detectPuzzle(coach({ givenConstraints: [{ type: 'cage', segments: [] }] })), /no Killer cages/)
  await assert.rejects(detectPuzzle(coach({ givenConstraints: [
    { type: 'antiKnight', segments: [] },
    { type: 'globalModularity', segments: [] },
  ] })), /not supported yet.*globalModularity/)
  await assert.rejects(detectPuzzle('x'.repeat(MAX_IMPORT_LENGTH + 1)), /one puzzle at a time/)
})

test('authored mixed fixtures require their rules and have independently verified completions', () => {
  for (const [name, { puzzle, solution }] of Object.entries(mixedFixtures)) {
    const full = countMixedSolutions(puzzle)
    assert.equal(full.count, 1, name)
    assert.equal(full.solution, solution, name)
    assert.equal(countMixedSolutions({ ...puzzle, rules: puzzle.rules?.filter(rule => rule.type !== 'killer-cages') }).count, 2, name)
    if (name === 'x-killer') assert.equal(countMixedSolutions({
      ...puzzle, rules: puzzle.rules?.filter(rule => rule.type !== 'diagonal'),
    }).count, 2)
  }
})

test('Coach, f-puzzles, and native share links preserve the complete mixed puzzle', async () => {
  for (const fixture of Object.values(mixedFixtures)) {
    for (const source of [fixture.coach, fixture.fpuzzles]) {
      const imported = await detectPuzzle(source)
      assert.equal(imported.variant?.id, 'mixed')
      // f-puzzles stores unordered diagonal flags; Coach stores an ordered constraint list.
      const expected = structuredClone(fixture.puzzle)
      if (source === fixture.fpuzzles && expected.rules?.[0]?.type === 'diagonal') {
        expected.rules = [expected.rules[1], expected.rules[0], ...expected.rules.slice(2)]
      }
      assert.deepEqual(imported.variant.puzzle, expected)
      assert.equal(isPlayablePuzzle('mixed', imported.variant.puzzle), true)
      const link = 'https://example.org/#variant=' + encodeURIComponent(JSON.stringify(imported.variant))
      assert.deepEqual(await detectPuzzle(link), { ...imported, format: 'Puzzle link' })
    }
  }
  assert.equal(variantName({ id: 'mixed', puzzle: mixedFixtures['x-killer'].puzzle }), 'Diagonal + Killer')
  assert.equal(variantName({ id: 'mixed', puzzle: mixedFixtures['jigsaw-killer'].puzzle }), 'Jigsaw + Killer')
})

test('mixed imports preserve interleaved rule indices and explain every rule family', async () => {
  const constraints = [
    { type: 'cage', segments: [{ cells: [10, 11], parameters: { sum: 3 } }], settings: {} },
    { type: 'region', segments: [{ cells: WINDOKU_REGIONS[0], parameters: {} }], settings: {} },
    { type: 'diagonalPositive', segments: [], settings: {} },
    { type: 'thermometer', segments: [{ cells: [0, 1, 2], parameters: {} }], settings: {} },
    { type: 'arrow', segments: [{ cells: [4, 13, 14], parameters: {} }], settings: {} },
    { type: 'antiKnight', segments: [], settings: {} },
  ]
  const imported = await detectPuzzle(coach({ givenConstraints: constraints }))
  assert.equal(imported.variant?.id, 'mixed')
  assert.deepEqual(imported.variant.puzzle.rules, [
    { type: 'killer-cages', cages: [{ cells: [10, 11], sum: 3 }] },
    { type: 'extra-house', cells: WINDOKU_REGIONS[0] },
    { type: 'diagonal', diagonal: 'anti' },
    { type: 'thermometer', cells: [0, 1, 2] },
    { type: 'arrow', circle: 4, cells: [13, 14] },
    { type: 'anti-knight' },
  ])
  const descriptions = variantRuleDescriptions(imported.variant.puzzle)
  for (const rule of ['extra region', 'top-right to bottom-left', 'cage', 'thermometer', 'arrow', 'knight']) {
    assert.ok(descriptions.some(description => description.toLowerCase().includes(rule)), rule)
  }
  assert.equal(isPlayablePuzzle('killer-cages', imported.variant.puzzle), false)
  for (const invalid of [
    { type: 'extra-house', cells: [...WINDOKU_REGIONS[0].slice(1), WINDOKU_REGIONS[0][1]] },
    { type: 'thermometer', cells: [0, 81] },
    { type: 'arrow', circle: 4, cells: [4] },
    { type: 'parity', parity: 'neither', cells: [0] },
  ]) assert.equal(isPlayablePuzzle('mixed', { ...imported.variant.puzzle, rules: [...imported.variant.puzzle.rules!, invalid] }), false)
})

test('Coach white and black dot layers keep independent negative flags and shared edges', async () => {
  const imported = await detectPuzzle(coach({ givenConstraints: [
    { type: 'difference', segments: [{ cells: [7, 8], parameters: {} }], settings: { negativeConstraint: true } },
    { type: 'ratio', segments: [{ cells: [8, 7], parameters: { ratio: 2 } }], settings: { negativeConstraint: false } },
  ] }))
  assert.equal(imported.variant?.id, 'kropki')
  assert.deepEqual(imported.variant.puzzle.rules, [
    { type: 'kropki', consecutive: { pairs: [[7, 8]], negative: true } },
    { type: 'kropki', ratioTwo: { pairs: [[8, 7]], negative: false } },
  ])
  const rules = variantRuleDescriptions(imported.variant.puzzle)
  assert.ok(rules.includes('Digits in cells sharing an edge without a Kropki dot cannot be consecutive.'))
  assert.ok(!rules.includes('For cells sharing an edge without a Kropki dot, neither digit can be twice the other.'))
  const numbered = await detectPuzzle(coach({ givenConstraints: [
    { type: 'difference', segments: [{ cells: [7, 8], parameters: { difference: 2 } }] },
    { type: 'ratio', segments: [{ cells: [7, 8], parameters: { ratio: 3 } }], settings: { negativeConstraint: true } },
    { type: 'ratio', segments: [{ cells: [18, 19], parameters: { ratio: 2 } }] },
  ] }))
  assert.deepEqual(numbered.variant?.puzzle.rules, [
    { type: 'labeled-dots', relation: 'difference', marks: [{ cells: [7, 8], value: 2 }] },
    { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [7, 8], value: 3 }], negative: true },
    { type: 'labeled-dots', relation: 'ratio', marks: [{ cells: [18, 19], value: 2 }] },
  ])
  for (const constraint of [
    { type: 'difference', segments: [{ cells: [7, 8], parameters: { difference: 9 } }], settings: {} },
    { type: 'ratio', segments: [{ cells: [7, 8], parameters: { ratio: 1 } }], settings: {} },
    { type: 'ratio', segments: [{ cells: [7, 7], parameters: {} }], settings: {} },
    { type: 'ratio', segments: [{ cells: [7, 8], parameters: {} }], settings: { negativeConstraint: 'true' } },
  ]) await assert.rejects(detectPuzzle(coach({ givenConstraints: [constraint] })), /invalid|unsupported|must be a whole number/)
})

test('every Classic share format round-trips sparse and dense grids without player progress', async () => {
  let state = 0x13579bdf
  const random = () => (state = Math.imul(state, 1664525) + 1013904223 >>> 0)
  const grids = [EMPTY, '123456789'.repeat(9), STARTER,
    ...Array.from({ length: 80 }, () => Array.from({ length: 81 }, () => String(random() % 10)).join(''))]
  for (const givens of grids) {
    for (const format of ['givens', 'grid', 'hodoku', 'exchange', 'coach'] as const) {
      assert.equal((await detectPuzzle(exportPuzzle(givens, format))).givens, givens, format)
    }
  }
})

test('native fragments take precedence over provider codes and provider domains match exactly', async () => {
  const imported = { givens: STARTER, format: 'Puzzle link' }
  const fragment = '#puzzle=' + STARTER
  for (const input of [
    'https://f-puzzles.com/?load=unreadable' + fragment,
    'www.Sudoku.Coach/en/play/SCv6_32_0000' + fragment,
    'https://sudokupad.app/sclunsupported' + fragment,
  ]) {
    assert.deepEqual(await detectPuzzle(input), imported)
  }
  await assert.rejects(
    detectPuzzle('https://sudoku.coach.example/en/play/' + STARTER),
    /link format is not supported/,
  )
  await assert.rejects(detectPuzzle('{"puzzle":"other-format"}'), /Enter exactly 81 cells/)
})

test('supported SudokuPad hosts, compact codes, and encoded f-puzzles exports preserve givens', async () => {
  const grid = Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, column) => {
    const value = Number(STARTER[row * 9 + column])
    return value ? { value, given: true } : {}
  }))
  const code = lzString.compressToBase64(JSON.stringify({ size: 9, grid }))
  for (const host of ['sudokupad.app', 'beta.sudokupad.app', 'sudokupad.svencodes.com', 'app.crackingthecryptic.com']) {
    for (const payload of [`scf${shortGrid}`, `fpuz${encodeURIComponent(code)}`, `fpuzzles${encodeURIComponent(code)}`]) {
      const imported = await detectPuzzle(`https://${host}/${payload}/`)
      assert.equal(imported.givens, STARTER, `${host}/${payload}`)
      assert.equal(imported.format, 'SudokuPad')
    }
  }
  for (const input of [`scf${shortGrid}`, `fpuz${code}`, `fpuzzles${code}`]) {
    assert.equal((await detectPuzzle(input)).givens, STARTER, input)
  }
})

test('internal sharing round-trips all eight playable variants and fragment-only links', async () => {
  const puzzle = (extra: Partial<VariantPuzzle>): VariantPuzzle => ({ version: 1, givens: EMPTY, ...extra })
  const variants = [
    { id: 'killer-cages', puzzle: puzzle({ rules: [{ type: 'killer-cages', cages: [{ cells: [0, 1], sum: 3 }] }] }) },
    { id: 'windoku', puzzle: puzzle({ rules: WINDOKU_REGIONS.map(cells => ({ type: 'extra-house' as const, cells })) }) },
    { id: 'diagonal', puzzle: puzzle({ rules: [{ type: 'diagonal', diagonal: 'main' }, { type: 'diagonal', diagonal: 'anti' }] }) },
    { id: 'jigsaw', puzzle: puzzle({ regions: jigsawLayout(variantSeeds.jigsaw.easy![0].regions!) }) },
    { id: 'anti-knight', puzzle: puzzle({ rules: [{ type: 'anti-knight' }] }) },
    { id: 'thermometer', puzzle: puzzle({ rules: [{ type: 'thermometer', cells: [0, 1, 2] }] }) },
    { id: 'arrow', puzzle: puzzle({ rules: [{ type: 'arrow', circle: 0, cells: [9, 10] }] }) },
    { id: 'kropki', puzzle: puzzle({ rules: [{ type: 'kropki', consecutive: { pairs: [[0, 1]] }, ratioTwo: { pairs: [[9, 10]] } }] }) },
  ]
  for (const variant of variants) {
    assert.ok(isPlayablePuzzle(variant.id, variant.puzzle), variant.id)
    const fragment = '#variant=' + encodeURIComponent(JSON.stringify(variant))
    for (const input of [fragment, `https://example.org/${fragment}`]) {
      assert.deepEqual(await detectPuzzle(input), { givens: EMPTY, format: 'Puzzle link', variant }, variant.id)
    }
  }
  assert.equal((await detectPuzzle('#puzzle=' + STARTER)).givens, STARTER)
})

test('f-puzzles preserves diagonal directions, Killer cages, and irregular region labels', async () => {
  const regions = jigsawLayout(variantSeeds.jigsaw.easy![0].regions!)
  const membership = Array<number>(81)
  regions.regions.forEach((cells, index) => cells.forEach(cell => { membership[cell] = index + 1 }))
  const grid = Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, column) => ({
    region: membership[row * 9 + column],
  })))
  assert.deepEqual((await detectPuzzle(JSON.stringify({ size: 9, grid }))).variant?.puzzle.regions, regions)
  const plain = grid.map(row => row.map(() => ({})))
  const diagonals = await detectPuzzle(JSON.stringify({ size: 9, grid: plain, 'diagonal+': true, 'diagonal-': true }))
  assert.deepEqual(diagonals.variant?.puzzle.rules, [{ type: 'diagonal', diagonal: 'anti' }, { type: 'diagonal', diagonal: 'main' }])
  const killer = await detectPuzzle(JSON.stringify({ size: 9, grid: plain, killercage: [{ cells: ['r1c1', 'r1c2'], value: 3 }] }))
  assert.deepEqual(killer.variant?.puzzle.rules, [{ type: 'killer-cages', cages: [{ cells: [0, 1], sum: 3 }] }])
})

test('malformed formats reject invalid dimensions, regions, rules, givens, and URL data', async () => {
  const grid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({})))
  const invalid = [
    '', '1'.repeat(80), '1'.repeat(82), '0'.repeat(MAX_IMPORT_LENGTH + 1),
    'https://example.org/#variant=%7B', 'https://example.org/#variant=' + encodeURIComponent(JSON.stringify({ id: 'classic', puzzle: { version: 1, givens: EMPTY } })),
    'https://example.org/#puzzle=' + STARTER + '1',
    'https://sudokuexchange.com/play/?s=zzzz', 'https://sudokupad.app/sclunsupported',
    'https://f-puzzles.com/?load=not_a_compressed_puzzle',
    JSON.stringify({ size: 8, grid }), JSON.stringify({ size: 9, grid: grid.slice(1) }),
    JSON.stringify({ size: 9, grid: grid.map(row => row.slice(1)) }),
    JSON.stringify({ size: 9, grid, 'diagonal+': 'true' }),
    JSON.stringify({ size: 9, grid, killercage: [{ cells: ['R0C1'], value: 3 }] }),
    JSON.stringify({ size: 9, grid, killercage: [{ cells: ['R1C1'], value: 0 }] }),
    JSON.stringify({ size: 9, grid, ruleset: 'Digits on a red line add to 10.' }),
    coach({ gridSize: 6 }), coach({ givenDigits: '0'.repeat(80) }), coach({ regions: Array(81).fill(0) }),
    coach({ givenConstraints: [{ type: 'thermometer', settings: { unknownRule: true }, segments: [{ cells: [0, 1], parameters: {} }] }] }),
    coach({ givenConstraints: [{ type: 'thermometer', segments: [{ cells: [0, 0], parameters: {} }] }] }),
    coach({ givenConstraints: [{ type: 'arrow', segments: [{ cells: [0], parameters: {} }] }] }),
  ]
  for (const input of invalid) await assert.rejects(detectPuzzle(input), Error, input.slice(0, 100))
})

test('compressed puzzles enforce the decoded-size limit without committing a partial grid', async () => {
  const coachCode = coach({ givenDigits: STARTER, meta: { title: 'x'.repeat(128_001) } })
  const grid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({})))
  const fpCode = lzString.compressToBase64(JSON.stringify({ size: 9, grid, title: 'x'.repeat(128_001) }))
  assert.ok(coachCode.length < MAX_IMPORT_LENGTH)
  assert.ok(fpCode.length < MAX_IMPORT_LENGTH)
  await assert.rejects(detectPuzzle(coachCode), /could not be opened/)
  await assert.rejects(detectPuzzle(fpCode), /unreadable/)
})

test('deterministic malformed-input stress run always resolves to a validated grid or a bounded error', async () => {
  let state = 0x2468ace0
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:/%#?=&+_{}[]\\\n'
  const random = () => (state = Math.imul(state, 1103515245) + 12345 >>> 0)
  for (let sample = 0; sample < 500; sample++) {
    const input = Array.from({ length: random() % 180 }, () => alphabet[random() % alphabet.length]).join('')
    let imported
    try {
      imported = await detectPuzzle(input)
    } catch (error) {
      assert.ok(error instanceof Error)
      assert.ok(error.message.length > 0 && error.message.length < 300)
      continue
    }
    assert.match(imported.givens, /^[0-9]{81}$/)
    if (imported.variant) assert.ok(isPlayablePuzzle(imported.variant.id, imported.variant.puzzle))
  }
})

test('Coach joins Consecutive Line segments into runs and preserves short shaded groups', async () => {
  const consecutive = (paths: number[][], colour = '#9a77c4') => ({
    type: 'consecutiveLine', settings: { colour },
    segments: paths.map(cells => ({ cells, parameters: {} })),
  })
  const input = coach({ givenConstraints: [
    consecutive([[1, 2], [0, 1], [20, 30]]),
    { type: 'region', segments: [{ cells: [3, 42], parameters: {} }], settings: { colour: '#0cd3ed' } },
  ] })
  const { variant } = await detectPuzzle(input)
  assert.deepEqual(variant?.puzzle.rules, [
    { type: 'consecutive-run', cells: [2, 1, 0], color: '#9a77c4' },
    { type: 'consecutive-run', cells: [20, 30], color: '#9a77c4' },
    { type: 'distinct-cells', cells: [3, 42], color: '#0cd3ed' },
  ])
  for (const paths of [[[0, 1], [1, 2], [2, 0]], [[0, 1], [1, 2], [1, 3]]]) {
    await assert.rejects(detectPuzzle(coach({ givenConstraints: [consecutive(paths)] })), /must form a path/)
  }
  await assert.rejects(detectPuzzle(coach({ givenConstraints: [consecutive([[0, 1]], 'var(--line)')] })),
    /unsupported settings/)
})
