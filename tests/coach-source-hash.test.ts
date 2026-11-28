import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { sourceHash } from '../src/sudoku/puzzle-import/shared.ts'

test('reviewed Sudoku Coach recognizers hash puzzle data without player progress', async t => {
  const payload = { givenDigits: '0'.repeat(81), gridSize: 9, userDigits: '1'.repeat(81) }
  let calls = 0
  const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle)
  t.mock.method(globalThis.crypto.subtle, 'digest', (algorithm: AlgorithmIdentifier, data: BufferSource) => {
    calls++
    return digest(algorithm, data)
  })

  const first = sourceHash('SCv7_32_source', payload)
  assert.strictEqual(sourceHash('SCv7_32_source', payload), first)
  const fingerprint = `SCv7_32_{"givenDigits":"${'0'.repeat(81)}","gridSize":9}`
  assert.equal(await first, createHash('sha256').update(fingerprint).digest('hex'))
  assert.equal(await sourceHash('SCV7_32_SOURCE', payload), await first)
  assert.equal(await sourceHash('SCv7_32_source', payload), await first)
  assert.equal(calls, 1)

  assert.equal(await sourceHash('SCv8_32_other', payload), createHash('sha256').update(fingerprint.replace('SCv7_', 'SCv8_')).digest('hex'))
  assert.equal(calls, 2, 'changing the Coach format version invalidates the payload cache entry')

  payload.givenDigits = '1'.repeat(81)
  const updatedFingerprint = `SCv7_32_{"givenDigits":"${'1'.repeat(81)}","gridSize":9}`
  assert.equal(await sourceHash('SCv7_32_other', payload), createHash('sha256').update(updatedFingerprint).digest('hex'))
  assert.equal(calls, 3, 'changing puzzle data invalidates the payload cache entry')

  const otherPayload = { gridSize: 9, givenDigits: '1'.repeat(81) }
  assert.equal(await sourceHash('SCv7_32_other', otherPayload), createHash('sha256')
    .update(`SCv7_32_{"givenDigits":"${'1'.repeat(81)}","gridSize":9}`).digest('hex'))
  assert.equal(calls, 4, 'separate decoded payload objects have separate cache entries')

  const legacyPayload = { gridSize: 9, givenDigits: '0'.repeat(81), userDigits: '1'.repeat(81) }
  assert.equal(await sourceHash('SCv4_y_legacy', legacyPayload), createHash('sha256')
    .update(`SCv4_{"givenDigits":"${'0'.repeat(81)}","gridSize":9}`).digest('hex'))
})

test('reviewed Coach hashes ignore Quick Draw progress while retaining other cell data', async () => {
  const code = 'SCv7_32_source'
  const puzzle = { gridSize: 9, givenDigits: '0'.repeat(81), cells: { 4: { authoredMark: 'keep' } } }
  const progressed = { ...puzzle, quickDrawLineSegments: { '0/0=>1/1': { colour: 'blue' } },
    quickDrawSymbols: { '1/0.5': { shape: 'cross', colour: 'red' } },
    cells: { 4: { authoredMark: 'keep', quickSymbol: { shape: 'circle', colour: 'green' } },
      'NaN,NaN': { cellCandidates: 3 } } }
  assert.equal(await sourceHash(code, progressed), await sourceHash(code, puzzle))

  const changedPuzzle = { ...progressed, cells: { ...progressed.cells, 4: { authoredMark: 'changed',
    quickSymbol: { shape: 'circle', colour: 'green' } } } }
  assert.notEqual(await sourceHash(code, changedPuzzle), await sourceHash(code, puzzle))
})
