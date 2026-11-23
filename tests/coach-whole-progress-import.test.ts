import assert from 'node:assert/strict'
import test from 'node:test'
import { deflateSync } from 'node:zlib'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'

const alphabet = '0123456789abcdefghijklmnopqrstuv'
function encodeBase32Hex(bytes: Uint8Array) {
  const bits = Array.from(bytes, byte => byte.toString(2).padStart(8, '0')).join('')
  return bits.match(/.{1,5}/g)!.map(chunk => alphabet[Number.parseInt(chunk.padEnd(5, '0'), 2)]).join('')
}

function wholeProgress(value: unknown) {
  return `32_${encodeBase32Hex(deflateSync(JSON.stringify(value)))}`
}

test('imports the current 9 × 9 Sudoku Coach snapshot from a whole-progress export', async () => {
  const givens = '0'.repeat(81)
  const entries = `${'0'.repeat(4)}7${'0'.repeat(76)}`
  const snapshot = JSON.stringify({ version: 7, gridSize: 9, givenDigits: givens, userDigits: entries })
  // Coach exports the entire undo history. Older snapshots can make the decoded payload exceed
  // the per-puzzle limit even when the active puzzle and its progress are small.
  const code = wholeProgress({ i: 1, a: ['0'.repeat(140_000), snapshot] })

  const imported = await detectPuzzle(code)
  assert.equal(imported.format, 'Sudoku Coach')
  assert.equal(imported.givens, givens)
  assert.equal(imported.progress?.entries, entries)
})

test('imports whole-progress Coach links and rejects invalid active snapshots', async () => {
  const snapshot = JSON.stringify({ version: 7, gridSize: 9, givenDigits: '0'.repeat(81) })
  const code = wholeProgress({ i: 0, a: [snapshot] })
  const imported = await detectPuzzle(`https://sudoku.coach/play/${code}`)
  assert.equal(imported.format, 'Sudoku Coach')
  assert.equal(imported.givens, '0'.repeat(81))

  await assert.rejects(detectPuzzle(wholeProgress({ i: 1, a: [snapshot] })), /invalid puzzle snapshot/)
  await assert.rejects(detectPuzzle(wholeProgress({ i: 0, a: ['not JSON'] })), /invalid puzzle snapshot/)
  await assert.rejects(detectPuzzle(wholeProgress({ i: 0, a: [JSON.stringify({ version: 6 })] })), /invalid puzzle snapshot/)
})
