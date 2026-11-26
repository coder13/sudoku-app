import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { syncDatabase } from './helpers/sync-database.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'

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
      assert.deepEqual(await reopened.json(), JSON.parse(JSON.stringify(definition)), source)
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
