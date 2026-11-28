import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { syncDatabase } from './helpers/sync-database.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { makeGame } from '../src/sudoku/game.ts'
import { MAX_DECODED_LENGTH, MAX_IMPORT_LENGTH } from '../src/sudoku/puzzle-import/shared.ts'
import { puzzleExportText } from '../src/sudoku/puzzle-sharing.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { isSizedRuleList } from '../src/sudoku/sized-rule-game.ts'
import { isPlayablePuzzle } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'
import { readCoachSolutionSources } from './helpers/coach-fixture-sources.ts'

const fixtureRoot = new URL('./fixtures/', import.meta.url)
const fixturePath = new URL(fixtureRoot).pathname
const codes = new Map<string, string>()
const publicCoachLinks = new Map<string, { code: string; source: string; title?: string }>()

type CoachDotMark = { relation: string; cells: [number, number]; value?: number; negative: boolean }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function withoutGeneratedSupport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutGeneratedSupport)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'support')
    .map(([key, child]) => [key, withoutGeneratedSupport(child)]))
}

function collectCoachDotMarks(value: unknown): CoachDotMark[] {
  const marks: CoachDotMark[] = []
  const readMarkGroup = (relation: string, group: unknown) => {
    if (!isRecord(group)) return
    const negative = group.negative === true
    if (Array.isArray(group.pairs)) for (const pair of group.pairs) {
      if (Array.isArray(pair) && pair.length === 2 && pair.every(Number.isInteger)) {
        marks.push({ relation, cells: [Number(pair[0]), Number(pair[1])], negative })
      }
    }
    if (Array.isArray(group.marks)) for (const mark of group.marks) {
      if (isRecord(mark) && Array.isArray(mark.cells) && mark.cells.length === 2 && mark.cells.every(Number.isInteger) &&
        Number.isInteger(mark.value)) {
        marks.push({ relation, cells: [Number(mark.cells[0]), Number(mark.cells[1])], value: Number(mark.value), negative })
      }
    }
  }
  const readKropki = (value: unknown) => {
    if (!isRecord(value)) return
    for (const relation of ['consecutive', 'ratioTwo', 'difference', 'ratio']) readMarkGroup(relation, value[relation])
    if (Array.isArray(value.layers)) for (const layer of value.layers) {
      if (isRecord(layer) && typeof layer.relation === 'string') readMarkGroup(layer.relation, layer)
    }
  }
  const visit = (item: unknown) => {
    if (Array.isArray(item)) {
      item.forEach(visit)
      return
    }
    if (!isRecord(item)) return
    if (item.type === 'labeled-dots' && typeof item.relation === 'string') readMarkGroup(item.relation, item)
    if (item.type === 'kropki') readKropki(item)
    if ('kropki' in item) readKropki(item.kropki)
    for (const [key, child] of Object.entries(item)) if (key !== 'kropki') visit(child)
  }
  visit(value)
  return marks
}

function withoutCoachDotRules(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter(item => !isRecord(item) ||
    item.type !== 'kropki' && item.type !== 'labeled-dots' && item.kind !== 'kropki' &&
    !(isRecord(item.rule) && item.rule.kind === 'kropki')).map(withoutCoachDotRules)
  if (!isRecord(value)) return value
  const normalized = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'kropki' && key !== 'id' && key !== 'support')
    .map(([key, child]) => [key, withoutCoachDotRules(child)]))
  const variant = normalized.variant
  if (isRecord(variant) && isRecord(variant.puzzle) && Array.isArray(variant.puzzle.rules) &&
    variant.puzzle.rules.length === 0 && variant.puzzle.regions === undefined && variant.fog === undefined) {
    delete normalized.variant
  }
  return normalized
}

function visit(value: unknown, file: string, keyPath = '$') {
  if (typeof value === 'string' && value.startsWith('SCv7_32_')) {
    codes.set(value, `${file}:${keyPath}`)
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, file, `${keyPath}[${index}]`))
  } else if (value && typeof value === 'object') {
    if (!Array.isArray(value)) {
      const entry = value as Record<string, unknown>
      const code = typeof entry.code === 'string' && entry.code.startsWith('SCv7_32_')
        ? entry.code
        : typeof entry.coach === 'string' && entry.coach.startsWith('SCv7_32_') ? entry.coach : undefined
      if (typeof entry.url === 'string' && /^https:\/\/sudoku\.coach\/(?:[a-z]{2}\/)?s\/[A-Za-z0-9]{1,16}\/?$/i.test(entry.url) && code) {
        const source = `${file}:${keyPath}`
        const previous = publicCoachLinks.get(entry.url)
        if (previous && previous.code !== code) throw new Error(`Conflicting Coach exports for ${entry.url}`)
        publicCoachLinks.set(entry.url, { code, source, ...(typeof value.title === 'string' && { title: value.title }) })
      }
    }
    for (const [key, item] of Object.entries(value)) visit(item, file, `${keyPath}.${key}`)
  }
}

for (const name of readdirSync(fixturePath).filter(name => name.endsWith('.json')).sort()) {
  const path = join(fixturePath, name)
  visit(JSON.parse(readFileSync(path, 'utf8')), relative(fixturePath, path))
}

const expectedRejections = new Map([
  ['parity-coach.json:$.examples[0].coach', /3 × 3 Jigsaw grid needs three connected regions of three cells/],
  ['parity-coach.json:$.examples[1].coach', /3 × 3 Jigsaw grid needs three connected regions of three cells/],
])

test('every preserved raw Coach fixture imports or matches its explicit unsupported control', async () => {
  assert.equal(codes.size, 121)
  const rejected = new Set<string>()

  for (const [code, source] of [...codes].sort(([, left], [, right]) => left.localeCompare(right))) {
    const expected = expectedRejections.get(source)
    if (expected) {
      await assert.rejects(detectPuzzle(code), expected, source)
      rejected.add(source)
      continue
    }

    const imported = await detectPuzzle(code)
    assert.equal(imported.format, 'Sudoku Coach', source)
  }

  assert.deepEqual([...rejected].sort(), [...expectedRejections.keys()].sort())
})

test('SCv7 Coach solution sources preserve authored data with an appended solution-valid Ratio clue', async () => {
  let checked = 0
  for (const source of readCoachSolutionSources().values()) {
    if (!source.code.startsWith('SCv7_32_')) continue
    const payload = await decodeSudokuCoachPayload(source.code)
    const size = Math.sqrt(source.solution.length)
    if (!Number.isInteger(size)) continue
    const imported = await detectPuzzle(source.code)
    const importedMarks = collectCoachDotMarks(imported)
    const ratioKeys = new Set(importedMarks.filter(mark => mark.relation === 'ratio' || mark.relation === 'ratioTwo')
      .map(mark => [...mark.cells].sort((a, b) => a - b).join(':')))
    let cells: [number, number] | undefined
    for (let cell = 0; cell < size ** 2 && !cells; cell++) {
      const row = Math.floor(cell / size), column = cell % size
      for (const other of [row + 1 < size ? cell + size : -1, column + 1 < size ? cell + 1 : -1]) {
        if (other < 0) continue
        const first = Number(source.solution[cell]), second = Number(source.solution[other])
        const key = [cell, other].sort((a, b) => a - b).join(':')
        if (Math.max(first, second) === 2 * Math.min(first, second) && !ratioKeys.has(key)) {
          cells = [cell, other]
          break
        }
      }
    }
    if (!cells) continue

    const originalLayers = Array.isArray(payload.givenConstraints) ? payload.givenConstraints : []
    const companion = { type: 'ratio', segments: [{ cells, parameters: {} }] }
    const rewritten = await detectPuzzle(coachCode(payload))
    const combined = await detectPuzzle(coachCode({ ...payload, givenConstraints: [...originalLayers, companion] }))
    const edgeKey = [...cells].sort((a, b) => a - b).join(':')
    const combinedMarks = collectCoachDotMarks(combined)
    assert.ok(combinedMarks.some(mark => (mark.relation === 'ratio' && mark.value === 2 || mark.relation === 'ratioTwo') &&
      [...mark.cells].sort((a, b) => a - b).join(':') === edgeKey),
    `${source.references.join(', ')}: appended Ratio clue must survive import`)

    const markCounts = new Map<string, number>()
    for (const mark of combinedMarks) {
      const key = JSON.stringify([mark.relation, [...mark.cells].sort((a, b) => a - b), mark.value, mark.negative])
      markCounts.set(key, (markCounts.get(key) ?? 0) + 1)
    }
    for (const mark of importedMarks) {
      const key = JSON.stringify([mark.relation, [...mark.cells].sort((a, b) => a - b), mark.value, mark.negative])
      const count = markCounts.get(key) ?? 0
      assert.ok(count > 0, `${source.references.join(', ')}: existing ${mark.relation} marker must survive`)
      markCounts.set(key, count - 1)
    }
    assert.deepEqual(withoutCoachDotRules(combined), withoutCoachDotRules(rewritten),
      `${source.references.join(', ')}: original clues, colors, and artwork must remain unchanged`)
    checked++
  }
  assert.ok(checked >= 70, `expected broad coverage of current Coach combinations, checked ${checked}`)
})

test('Current State progress preserves rules and authored data across every published 9 × 9 Coach source', async () => {
  let checked = 0
  const sources = [...readCoachSolutionSources().values()]
    .filter(source => source.code.startsWith('SCv7_32_') && source.solution.length === 81)
  for (const source of sources) {
    const original = await detectPuzzle(source.code)
    const payload = await decodeSudokuCoachPayload(source.code)
    const editable = [...original.givens].flatMap((digit, cell) => digit === '0' ? [cell] : [])
    assert.ok(editable.length >= 3, `${source.references.join(', ')}: fixture needs editable cells`)
    const [placedCell, centerCell, cornerCell] = editable
    const entries = Array(81).fill('0')
    entries[placedCell] = source.solution[placedCell]
    const center = Array<number>(81).fill(0)
    const corner = Array<number>(81).fill(0)
    center[centerCell] = 1 << (Number(source.solution[centerCell]) - 1)
    corner[cornerCell] = 1 << (Number(source.solution[cornerCell]) - 1)

    const progressed = await detectPuzzle(coachCode({
      ...payload,
      userDigits: [...original.givens].map((digit, cell) => digit === '0' ? entries[cell] : digit).join(''),
      userCellCandidates: center.map(mask => mask << 1).join('-'),
      userBoxCandidates: corner.map(mask => mask << 1).join('-'),
    }))
    const { progress, ...definition } = progressed
    const numberKind = original.futoshiki ? 'futoshiki' : original.calcudoku ? 'calcudoku' : undefined
    if (numberKind) {
      const sourceNumber = numberKind === 'futoshiki' ? original.futoshiki : original.calcudoku
      const progressedNumber = numberKind === 'futoshiki' ? progressed.futoshiki : progressed.calcudoku
      assert.ok(sourceNumber && progressedNumber)
      const { id: _sourceId, initialPosition: _sourcePosition, ...sourceDefinition } = sourceNumber
      const { id: _progressedId, initialPosition, ...progressedDefinition } = progressedNumber
      assert.deepEqual(withoutGeneratedSupport({ ...definition, [numberKind]: progressedDefinition }),
        withoutGeneratedSupport({ ...original, [numberKind]: sourceDefinition }),
        `${source.references.join(', ')}: puzzle definition`)
      assert.deepEqual(initialPosition, {
        values: [...original.givens].map((digit, cell) => digit === '0' ? Number(entries[cell]) : 0),
        notes: [...original.givens].map((digit, cell) => digit === '0' ? center[cell] | corner[cell] : 0),
      }, `${source.references.join(', ')}: restored boxless progress`)
      assert.equal(progress, undefined, `${source.references.join(', ')}: boxless progress uses its native position model`)
    } else {
      assert.deepEqual(definition, original, `${source.references.join(', ')}: puzzle definition`)
      assert.deepEqual(progress, { entries: entries.join(''), center, corner },
        `${source.references.join(', ')}: restored progress`)
    }
    checked++
  }
  assert.equal(checked, sources.length, 'expected each supported published 9 × 9 source exactly once')
})

test('SCv7 9 × 9 Coach variants preserve their rules with appended solution-valid Odd and Even layers', async () => {
  let checked = 0
  for (const source of readCoachSolutionSources().values()) {
    if (!source.code.startsWith('SCv7_32_') || source.solution.length !== 81) continue
    const imported = await detectPuzzle(source.code)
    if (!imported.variant) continue

    const payload = await decodeSudokuCoachPayload(source.code)
    const odd = [...source.solution].flatMap((digit, cell) => Number(digit) % 2 === 1 ? [cell] : [])
    const even = [...source.solution].flatMap((digit, cell) => Number(digit) % 2 === 0 ? [cell] : [])
    const companions = [
      { type: 'odd', segments: odd.map(cell => ({ cells: [cell], parameters: {} })) },
      { type: 'even', segments: even.map(cell => ({ cells: [cell], parameters: {} })) },
    ]
    const originalLayers = Array.isArray(payload.givenConstraints) ? payload.givenConstraints : []
    const combined = await detectPuzzle(coachCode({ ...payload, givenConstraints: [...originalLayers, ...companions] }))
    assert.ok(combined.variant, `${source.references.join(', ')}: combined source remains a Sudoku variant`)

    const originalRules = imported.variant.puzzle.rules ?? []
    const combinedRules = combined.variant.puzzle.rules ?? []
    const companionRules = [
      { type: 'parity', cells: odd, parity: 'odd' },
      { type: 'parity', cells: even, parity: 'even' },
    ] as const
    const remainingRules = [...combinedRules]
    for (const companion of companionRules) {
      const index = remainingRules.findIndex(rule => rule.type === 'parity' && rule.parity === companion.parity &&
        rule.cells.length === companion.cells.length && rule.cells.every((cell, cellIndex) => cell === companion.cells[cellIndex]))
      assert.notEqual(index, -1,
        `${source.references.join(', ')}: added ${companion.parity} layer remains a typed engine rule`)
      remainingRules.splice(index, 1)
    }
    assert.deepEqual(remainingRules, originalRules,
      `${source.references.join(', ')}: original engine rules remain unchanged and in order`)
    assert.deepEqual(combined.variant.puzzle.regions, imported.variant.puzzle.regions,
      `${source.references.join(', ')}: original region layout remains unchanged`)
    assert.equal(combined.givens, imported.givens, `${source.references.join(', ')}: original givens remain unchanged`)
    assert.deepEqual(combined.givenCellColors, imported.givenCellColors,
      `${source.references.join(', ')}: original color overlays remain unchanged`)
    assert.deepEqual(combined.authoredArtwork, imported.authoredArtwork,
      `${source.references.join(', ')}: original authored artwork remains unchanged`)
    checked++
  }
  assert.ok(checked >= 50, `expected broad 9 × 9 Coach variant coverage, checked ${checked}`)
})

test('the published Every Constraint Coach source retains every mixed rule family', async () => {
  const fixture = JSON.parse(readFileSync(join(fixturePath, 'sudoku-coach-every-constraint.json'), 'utf8'))
  const source = fixture.examples[0]
  const imported = await detectPuzzle(source.code)
  assert.equal(imported.givens, '0'.repeat(81))
  assert.deepEqual(Object.fromEntries([...imported.variant!.puzzle.rules.reduce((counts, { type }) => {
    counts.set(type, (counts.get(type) ?? 0) + 1)
    return counts
  }, new Map<string, number>())].sort(([left], [right]) => left.localeCompare(right))), {
    'anti-king': 1,
    'anti-knight': 1,
    arrow: 1,
    between: 1,
    'consecutive-run': 1,
    entropic: 1,
    'global-entropy': 1,
    inequality: 3,
    'killer-cages': 1,
    kropki: 1,
    'labeled-dots': 1,
    'little-killer': 1,
    lockout: 1,
    maximum: 1,
    minimum: 1,
    modular: 1,
    'non-consecutive': 1,
    palindrome: 1,
    parity: 2,
    'pill-arrow': 1,
    quadruple: 1,
    'region-sum': 1,
    renban: 1,
    sandwich: 18,
    thermometer: 1,
    whispers: 1,
    xv: 1,
  })
})

test('K95q keeps its authored complete-black-dot rule with an appended Ratio companion', async () => {
  const examples = JSON.parse(readFileSync(join(fixturePath, 'global-entropy-coach.json'), 'utf8')).examples as {
    url: string; code: string; solution: string
  }[]
  const source = examples.find(example => example.url.endsWith('/K95q'))!
  const data = await decodeSudokuCoachPayload(source.code)
  const pair = Array.from({ length: 81 }, (_, cell) => cell).flatMap(cell => {
    const row = Math.floor(cell / 9), column = cell % 9
    return [row < 8 ? cell + 9 : -1, column < 8 ? cell + 1 : -1]
      .filter(other => other >= 0 && (Number(source.solution[cell]) === 2 * Number(source.solution[other]) ||
        Number(source.solution[other]) === 2 * Number(source.solution[cell])))
      .map(other => [cell, other] as [number, number])
  })[0]
  assert.ok(pair)
  const ratio = { type: 'ratio', segments: [{ cells: pair, parameters: {} }] }
  const imported = await detectPuzzle(coachCode({ ...data, givenConstraints: [...data.givenConstraints, ratio] }))
  const rules = imported.variant?.puzzle.rules ?? []
  assert.ok(rules.some(rule => rule.type === 'global-entropy'))
  const blackLayers = rules.filter(rule => rule.type === 'kropki' && rule.ratioTwo)
  assert.ok(blackLayers.length >= 2)
  assert.ok(blackLayers.every(rule => rule.type === 'kropki' && rule.ratioTwo?.negative === true))
  assert.ok(blackLayers.some(rule => rule.type === 'kropki' &&
    rule.ratioTwo?.pairs.some(([a, b]) => a === pair[0] && b === pair[1])))
})

test('all preserved published Coach links import the same rules as their raw exports', async ({ mock }) => {
  assert.equal(publicCoachLinks.size, 82)
  const authoredRules: Record<string, string> = {
    K95q: 'all-black-dots',
    '7rs9': 'line-colours',
    '7FCB': 'inside-grid',
    'ALYC': 'lettered-quadruples',
    '7Vva': 'quad-arrows',
  }
  const linksById = new Map([...publicCoachLinks].map(([url, value]) => [new URL(url).pathname.match(/\/s\/([^/]+)/i)![1], value]))
  mock.method(globalThis, 'fetch', async (path: string) => {
    const id = path.match(/^\/api\/v1\/import\/sudoku-coach\/([A-Za-z0-9]{1,16})$/)?.[1]
    const publication = id && linksById.get(id)
    if (!id || !publication) return Response.json({ error: 'Unknown fixture link' }, { status: 404 })
    const authoredRule = authoredRules[id]
    return Response.json({ code: publication.code, coach: {
      hasAuthorInstructions: Boolean(authoredRule),
      ...(publication.title && { title: publication.title }),
      ...(authoredRule && { authoredRule }),
    } })
  })

  for (const [url, { code, source }] of publicCoachLinks) {
    const linked = await detectPuzzle(url)
    const raw = await detectPuzzle(code)
    assert.equal(linked.format, 'Sudoku Coach', source)
    const id = new URL(url).pathname.match(/\/s\/([^/]+)/i)![1]
    const title = linksById.get(id)?.title
    if (title) assert.equal(linked.title, title, `${source}: published title`)
    const linkedData = Object.fromEntries(Object.entries(linked).filter(([key]) => key !== 'title'))
    const rawData = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'title'))
    assert.equal(JSON.stringify(linkedData), JSON.stringify(rawData), `${source}: complete linked import data`)
    assert.equal(linked.givens, raw.givens, `${source}: linked givens`)
    assert.deepEqual(linked.grid, raw.grid, `${source}: linked grid`)
    assert.deepEqual(linked.sizedRules, raw.sizedRules, `${source}: linked sized rules`)
    assert.deepEqual(linked.algebraic, raw.algebraic, `${source}: linked algebraic rules`)
    assert.deepEqual(linked.variant && {
      id: linked.variant.id,
      puzzle: linked.variant.puzzle,
      fog: linked.variant.fog,
    }, raw.variant && {
      id: raw.variant.id,
      puzzle: raw.variant.puzzle,
      fog: raw.variant.fog,
    }, `${source}: linked variant rules`)
    for (const field of [
      'sizedAuthor', 'futoshiki', 'calcudoku', 'progress', 'authoredSolution', 'authoredSolutionOnly',
      'givenCellColors', 'authoredArtwork', 'whispersGuide',
    ] as const) {
      // Import results can include runtime rule callbacks. Compare their
      // serialized puzzle data, while checking those callbacks separately via
      // the existing engine and import contract tests.
      assert.equal(JSON.stringify(linked[field]), JSON.stringify(raw[field]), `${source}: linked ${field}`)
    }
  }
})

test('every imported Coach rule rejects unknown engine fields', async () => {
  let mutations = 0
  for (const [code, source] of [...codes].sort(([, left], [, right]) => left.localeCompare(right))) {
    if (expectedRejections.has(source)) continue
    const imported = await detectPuzzle(code)
    const variant = imported.variant
    if (!variant?.puzzle.rules) continue
    variant.puzzle.rules.forEach((rule, index) => {
      const changed = { ...variant.puzzle, rules: variant.puzzle.rules!.map((candidate, ruleIndex) =>
        ruleIndex === index ? { ...candidate, futureSemantics: true } : candidate) }
      assert.equal(isPlayablePuzzle(variant.id, changed, variant.fog), false,
        `${source}: ${rule.type} rule ${index + 1} must reject unknown engine fields`)
      mutations++
    })
  }
  assert.ok(mutations > 100)
})

test('every imported sized Coach rule rejects unknown engine fields', async () => {
  let mutations = 0
  for (const [code, source] of [...codes].sort(([, left], [, right]) => left.localeCompare(right))) {
    if (expectedRejections.has(source)) continue
    const imported = await detectPuzzle(code)
    if (!imported.grid || !imported.sizedRules?.length) continue
    assert.equal(isSizedRuleList(imported.sizedRules, imported.grid), true, source)
    imported.sizedRules.forEach((rule, index) => {
      const changed = imported.sizedRules!.map((candidate, ruleIndex) =>
        ruleIndex === index ? { ...candidate, futureSemantics: true } : candidate)
      assert.equal(isSizedRuleList(changed, imported.grid!), false,
        `${source}: ${rule.type} sized rule ${index + 1} must reject unknown engine fields`)
      mutations++
    })
  }
  assert.equal(mutations, 128)
})

test('preserved Coach exports reject unknown root, layer, setting, segment and parameter fields', async () => {
  let mutations = 0
  for (const [code, source] of [...codes].sort(([, left], [, right]) => left.localeCompare(right))) {
    const payload = await decodeSudokuCoachPayload(code)
    await assert.rejects(detectPuzzle(coachCode({ ...payload, futurePuzzleSemantics: true })),
      `${source}: unknown root data must reject the whole import`)
    mutations++

    const constraints = payload.givenConstraints
    if (!Array.isArray(constraints)) continue
    for (let index = 0; index < constraints.length; index++) {
      const original = constraints[index]
      for (const location of ['layer', 'settings'] as const) {
        const changed = structuredClone(constraints)
        const layer = changed[index]
        if (!layer || typeof layer !== 'object' || Array.isArray(layer)) continue
        if (location === 'layer') {
          layer.futureSemantics = true
        } else if (location === 'settings') {
          const settings = layer.settings && typeof layer.settings === 'object' && !Array.isArray(layer.settings)
            ? layer.settings : {}
          layer.settings = { ...settings, futureSemantics: true }
        }

        await assert.rejects(detectPuzzle(coachCode({ ...payload, givenConstraints: changed })),
          `${source}: unknown ${location} data on Coach ${original?.type ?? 'rule'} layer ${index + 1} must reject the whole import`)
        mutations++
      }

      const segments = original && typeof original === 'object' && !Array.isArray(original) ? original.segments : undefined
      if (Array.isArray(segments)) {
        for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
          const changed = structuredClone(constraints)
          const layer = changed[index]
          const segment = layer && typeof layer === 'object' && !Array.isArray(layer) && Array.isArray(layer.segments)
            ? layer.segments[segmentIndex] : undefined
          if (!segment || typeof segment !== 'object' || Array.isArray(segment)) continue
          segment.futureSemantics = true

          await assert.rejects(detectPuzzle(coachCode({ ...payload, givenConstraints: changed })),
            `${source}: unknown segment data on Coach ${original?.type ?? 'rule'} layer ${index + 1}, segment ${segmentIndex + 1} must reject the whole import`)
          mutations++

          if (segment.parameters && typeof segment.parameters === 'object' && !Array.isArray(segment.parameters)) {
            const parameterMutation = structuredClone(constraints)
            const parameterLayer = parameterMutation[index]
            const parameterSegment = parameterLayer && typeof parameterLayer === 'object' && !Array.isArray(parameterLayer) &&
              Array.isArray(parameterLayer.segments) ? parameterLayer.segments[segmentIndex] : undefined
            assert.ok(parameterSegment && typeof parameterSegment === 'object' && !Array.isArray(parameterSegment))
            const parameters = parameterSegment.parameters && typeof parameterSegment.parameters === 'object' &&
              !Array.isArray(parameterSegment.parameters) ? parameterSegment.parameters : {}
            parameterSegment.parameters = { ...parameters, futureSemantics: true }

            await assert.rejects(detectPuzzle(coachCode({ ...payload, givenConstraints: parameterMutation })),
              `${source}: unknown parameter data on Coach ${original?.type ?? 'rule'} layer ${index + 1}, segment ${segmentIndex + 1} must reject the whole import`)
            mutations++
          }
        }
      }
    }
  }
  assert.equal(mutations, 6737)
})

test('every preserved Coach Sudoku export survives public sharing and reopen', async () => {
  const { sqlite, fetcher } = syncDatabase()
  try {
    const unsupported = new Set(expectedRejections.keys())
    const standalonePuzzles = new Set<string>()
    for (const [code, source] of [...codes].sort(([, left], [, right]) => left.localeCompare(right))) {
      if (unsupported.has(source)) continue
      const imported = await detectPuzzle(code)
      if (imported.futoshiki || imported.calcudoku) {
        standalonePuzzles.add(source)
        continue
      }
      const { variant, grid, sizedRules, sizedAuthor, algebraic, collection, givenCellColors,
        authoredArtwork, whispersGuide } = imported
      const classicSized = grid?.size === 6 && 'boxRows' in grid
      const definition = {
        version: 1 as const,
        title: imported.title ?? 'Coach fixture',
        givens: imported.givens,
        ...(grid && { grid }),
        ...(variant && { variant: {
          id: variant.id,
          puzzle: { version: variant.puzzle.version, givens: imported.givens,
            rules: variant.puzzle.rules, regions: variant.puzzle.regions },
          ...(variant.fog && { fog: variant.fog }),
        } }),
        ...(sizedRules && (classicSized
          ? { sixRules: sizedRules, ...(sizedAuthor && { sixAuthor: sizedAuthor }) }
          : { sizedRules, ...(sizedAuthor && { sizedAuthor }) })),
        ...(algebraic && (algebraic.source
          ? { algebraic: { sudokuPad: algebraic.source.code } }
          : { algebraic: { rules: algebraic.rules } })),
        ...(collection && { collection: { collectionId: collection.collectionId, puzzleId: collection.puzzleId } }),
        ...(givenCellColors && { givenCellColors }),
        ...(authoredArtwork && { authoredArtwork }),
        ...(whispersGuide && { whispersGuide: true as const }),
      }
      const created = await fetcher('/api/v1/shares', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(definition),
      })
      assert.equal(created.status, 201, `${source}: ${await created.clone().text()}`)
      const { id } = await created.json() as { id: string }
      const reopened = await fetcher(`/api/v1/shares/${id}`)
      assert.equal(reopened.status, 200, source)
      const reopenedDefinition = await reopened.json() as typeof definition
      assert.deepEqual(reopenedDefinition, JSON.parse(JSON.stringify(definition)), source)

      const sharedText = JSON.stringify({ ...reopenedDefinition, format: 'sudoku-app-puzzle' })
      const sharedImport = await detectPuzzle(sharedText).catch((error: unknown) => {
        throw new Error(`${source}: shared import failed at ${sharedText.length} characters`, { cause: error })
      })
      assert.equal(sharedImport.format, 'Puzzle export', `${source}: shared export format`)
      assert.equal(sharedImport.givens, imported.givens, `${source}: shared givens`)
      assert.deepEqual(sharedImport.grid, grid, `${source}: shared grid`)
      assert.deepEqual(sharedImport.variant?.puzzle, variant?.puzzle, `${source}: shared variant rules`)
      assert.deepEqual(sharedImport.variant?.fog, variant?.fog, `${source}: shared fog`)
      assert.deepEqual(sharedImport.sizedRules, sizedRules, `${source}: shared sized rules`)
      assert.deepEqual(sharedImport.algebraic, algebraic, `${source}: shared algebraic rules`)
      assert.deepEqual(sharedImport.givenCellColors, givenCellColors, `${source}: shared cell colors`)
      assert.deepEqual(sharedImport.authoredArtwork, authoredArtwork, `${source}: shared authored artwork`)
      assert.equal(sharedImport.whispersGuide, whispersGuide, `${source}: shared guide state`)
    }
    assert.deepEqual([...standalonePuzzles].sort(), [
      'sudoku-coach-boxless-calcudoku.json:$.code',
      'sudoku-coach-boxless-diagonal.json:$.code',
      'sudoku-coach-boxless-modular.json:$.code',
    ])
  } finally {
    sqlite.close()
  }
})

test('#547 pretty-printed app exports above the provider cap re-import with authored artwork', async () => {
  const authored = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-authored-layers.json', import.meta.url), 'utf8')) as {
    examples: { issue: number; code: string }[]
  }
  const source = authored.examples.find(example => example.issue === 547)
  assert.ok(source)
  const sourcePuzzle = await detectPuzzle(source.code)
  assert.ok(sourcePuzzle.variant)
  const game = { ...makeGame('coach-large-export', 'CS1G', sourcePuzzle.givens, 'imported'),
    variant: sourcePuzzle.variant, authoredArtwork: sourcePuzzle.authoredArtwork }
  const text = puzzleExportText(game)
  assert.ok(text.length > MAX_IMPORT_LENGTH)
  assert.ok(text.length <= MAX_DECODED_LENGTH)
  const imported = await detectPuzzle(text)
  assert.equal(imported.format, 'Puzzle export')
  assert.deepEqual(imported.variant?.puzzle, game.variant?.puzzle)
  assert.deepEqual(imported.authoredArtwork, game.authoredArtwork)
})
