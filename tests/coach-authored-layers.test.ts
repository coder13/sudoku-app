import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { decodeSudokuCoachPayload } from '../src/sudoku/puzzle-import/sudoku-coach.ts'
import { parseCoachEntropyWindowGroups } from '../src/sudoku/entropy-window-groups.ts'
import { validAuthoredArtwork } from '../src/sudoku/authored-artwork.ts'
import { makeGame } from '../src/sudoku/game.ts'
import { puzzleDefinitionForSharing } from '../src/sudoku/puzzle-sharing.ts'
import { readGame } from '../src/sudoku/storage.ts'
import { syncRequest } from '../src/sudoku/sync-engine.ts'
import { syncDatabase } from './helpers/sync-database.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-authored-layers.json', import.meta.url), 'utf8')) as {
  examples: { issue: number; id: string; code: string }[]
}

test('#544 imports XV Entropy when the authored cosmetic cage is empty', async () => {
  const source = fixture.examples.find(example => example.issue === 544)
  assert.ok(source)

  const imported = await detectPuzzle(source.code)

  assert.equal(imported.format, 'Sudoku Coach')
  assert.equal(imported.givens, '0'.repeat(81))
  assert.deepEqual(imported.variant?.puzzle.rules, [
    { type: 'global-entropy' },
    {
      type: 'xv',
      five: { pairs: [[31, 40], [42, 33], [44, 35], [46, 47], [66, 57], [78, 79], [23, 24], [12, 13], [61, 62]] },
      ten: { pairs: [[30, 39], [74, 73], [59, 68], [37, 46], [80, 79], [0, 1], [7, 8], [19, 20], [22, 13]] },
    },
    { type: 'kropki', consecutive: { pairs: [[37, 38]], negative: false } },
  ])
})

test('#542 parses its shapes into the doubled entropy group for each 2 × 2 window', async () => {
  const source = fixture.examples.find(example => example.issue === 542)
  assert.ok(source)

  const data = await decodeSudokuCoachPayload(source.code)
  const layers = (data.givenConstraints as { type?: unknown }[]).filter(layer => layer.type === 'cosmeticShape')
  const groups = parseCoachEntropyWindowGroups(layers)

  assert.deepEqual(groups, [
    { cells: [52, 53, 61, 62], group: 'high' },
    { cells: [68, 69, 77, 78], group: 'high' },
    { cells: [25, 26, 34, 35], group: 'high' },
    { cells: [0, 1, 9, 10], group: 'high' },
    { cells: [30, 31, 39, 40], group: 'high' },
    { cells: [70, 71, 79, 80], group: 'middle' },
    { cells: [63, 64, 72, 73], group: 'middle' },
    { cells: [40, 41, 49, 50], group: 'middle' },
    { cells: [2, 3, 11, 12], group: 'middle' },
    { cells: [7, 8, 16, 17], group: 'low' },
    { cells: [18, 19, 27, 28], group: 'low' },
    { cells: [45, 46, 54, 55], group: 'low' },
    { cells: [65, 66, 74, 75], group: 'low' },
    { cells: [5, 6, 14, 15], group: 'low' },
  ])
})

test('#547 preserves CS1G authored shape artwork without dropping its active rules', async () => {
  const source = fixture.examples.find(example => example.issue === 547)
  assert.ok(source)

  const imported = await detectPuzzle(source.code)
  const artwork = imported.authoredArtwork

  assert.equal(imported.title, 'Thank RP you')
  assert.ok(artwork)
  assert.equal(artwork.length, 405)
  assert.equal(validAuthoredArtwork(artwork), true)
  assert.deepEqual(artwork.reduce<Record<string, number>>((counts, mark) => {
    if (mark.type === 'tile') counts[mark.color] = (counts[mark.color] ?? 0) + 1
    return counts
  }, {}), { '#be3c04': 81, '#f15d1e': 164, '#2142ff': 160 })
  assert.deepEqual(imported.variant?.puzzle.rules?.reduce<Record<string, number>>((counts, rule) => {
    counts[rule.type] = (counts[rule.type] ?? 0) + 1
    return counts
  }, {}), { palindrome: 5, entropic: 10, kropki: 2 })

  assert.ok(imported.variant)
  const game = {
    ...makeGame('coach-cs1g', imported.title ?? 'Thank RP you', imported.givens, 'imported', 1),
    variant: { ...imported.variant, solution: '123456789'.repeat(9) }, authoredArtwork: artwork,
  }
  assert.deepEqual(readGame(game.id, JSON.stringify(game))?.authoredArtwork, artwork)
  const { sqlite, fetcher } = syncDatabase()
  try {
    const api = syncRequest(undefined, fetcher)
    const definition = puzzleDefinitionForSharing(game)
    const { id } = await api<{ id: string }>('shares', 'POST', definition)
    assert.deepEqual((await api<{ authoredArtwork: typeof artwork }>(`shares/${id}`)).authoredArtwork, artwork)
  } finally { sqlite.close() }
})

test('#542, #543, #545, and #546 reject authored rules the app cannot represent yet', async () => {
  const cases = [
    [542, /unsupported or invalid digit restrictions/],
    [543, /unsupported settings for cosmeticLine/],
    [545, /unsupported settings for cosmeticText/],
    [546, /unsupported settings for cosmeticLine/],
  ] as const
  for (const [issue, message] of cases) {
    const source = fixture.examples.find(example => example.issue === issue)
    assert.ok(source, `Missing exact reproduction fixture for #${issue}`)
    await assert.rejects(detectPuzzle(source.code), message, `#${issue} must not import with its authored rule omitted`)
  }
})
