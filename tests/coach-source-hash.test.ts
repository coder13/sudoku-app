import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { sourceHash } from '../src/sudoku/puzzle-import/shared.ts'

test('reviewed Sudoku Coach recognizers share one source digest per code and decoded payload', async t => {
  const payload = {}
  let calls = 0
  const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle)
  t.mock.method(globalThis.crypto.subtle, 'digest', (algorithm: AlgorithmIdentifier, data: BufferSource) => {
    calls++
    return digest(algorithm, data)
  })

  const first = sourceHash('SCv7_32_source', payload)
  assert.strictEqual(sourceHash('SCv7_32_source', payload), first)
  assert.equal(await first, createHash('sha256').update('SCv7_32_source').digest('hex'))
  assert.equal(await sourceHash('SCv7_32_source', payload), await first)
  assert.equal(calls, 1)

  assert.equal(await sourceHash('SCv7_32_other', payload), createHash('sha256').update('SCv7_32_other').digest('hex'))
  assert.equal(calls, 2, 'changing the source code invalidates the payload cache entry')

  const otherPayload = {}
  assert.equal(await sourceHash('SCv7_32_other', otherPayload), createHash('sha256').update('SCv7_32_other').digest('hex'))
  assert.equal(calls, 3, 'separate decoded payload objects have separate cache entries')
})
