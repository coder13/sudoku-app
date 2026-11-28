import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

test('SCv4–SCv6 progress reaches the verified Play preview without changing puzzle givens', async () => {
  const zero = '0a81b'
  const zeroMasks = '0Ac80d0'
  const userDigits = '1' + '0'.repeat(80)
  const userCellCandidates = ['0', '2', ...Array(79).fill('0')].join('-')
  const userBoxCandidates = ['0', '8', ...Array(79).fill('0')].join('-')
  const state = [zero, zero, userDigits, zero, zero, userCellCandidates, zeroMasks, userBoxCandidates, '', '', zero]

  for (const [version, tail] of [
    [4, ['']],
    [5, [zero, '']],
    [6, [zero, zeroMasks, '', '', '', '']],
  ] as const) {
    const code = `SCv${version}_yyR30_${[...state, ...tail].join('_')}`
    const preview = await prepareImportedPuzzle(code, [], { deferRating: true })
    assert.equal(preview.hasProgress, true, `SCv${version} preview recognizes saved progress`)
    assert.equal(preview.game.givens, '0'.repeat(81), `SCv${version} keeps entries out of puzzle givens`)
    assert.equal(preview.game.position.entries[0], '1', `SCv${version} restores the placed digit in Play`)
    assert.equal(preview.game.position.center[1], 1, `SCv${version} restores center candidates in Play`)
    assert.equal(preview.game.position.corner[1], 4, `SCv${version} restores corner candidates in Play`)
  }
})
