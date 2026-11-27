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
import { isPlayablePuzzle } from '../src/sudoku/variants.ts'
import { coachCode } from './helpers/coach-code.ts'

const fixtureRoot = new URL('./fixtures/', import.meta.url)
const fixturePath = new URL(fixtureRoot).pathname
const codes = new Map<string, string>()

function visit(value: unknown, file: string, keyPath = '$') {
  if (typeof value === 'string' && value.startsWith('SCv7_32_')) {
    codes.set(value, `${file}:${keyPath}`)
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, file, `${keyPath}[${index}]`))
  } else if (value && typeof value === 'object') {
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
  assert.equal(codes.size, 120)
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

test('preserved Coach exports reject unknown fields on every populated rule layer, setting and segment', async () => {
  let mutations = 0
  for (const [code, source] of [...codes].sort(([, left], [, right]) => left.localeCompare(right))) {
    const payload = await decodeSudokuCoachPayload(code)
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
        }
      }
    }
  }
  assert.equal(mutations, 3822)
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
