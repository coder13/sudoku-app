import assert from 'node:assert/strict'
import { test } from 'node:test'
import lzString from 'lz-string'
import { runEngine, type VariantPuzzle } from '../src/sudoku/engine.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { reflectVariant } from '../src/sudoku/variant-generation.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const puzzle: VariantPuzzle = {
  version: 1,
  givens: '0'.repeat(81),
  rules: [{ type: 'anti-knight' }, { type: 'conditional-neighbor', triggerDigit: 5, alternatives: [
    { rowOffset: -1, columnOffset: 0, digit: 1 },
    { rowOffset: 1, columnOffset: 0, digit: 9 },
  ] }],
}

test('conditional neighbor composes with Anti-Knight and rejects invalid completions', async () => {
  const sudokuPad = {
    metadata: {
      title: 'Dutch Flatmates', author: 'aqjhs', antiknight: true,
      rules: "Normal sudoku rules apply.\n\nCells one chess knight's move apart may not have the same digit. \n\nDutch Flatmates: Every 5 in the grid must have a '1' directly above it or a '9' directly below it. It may have both, but it doesn't need both.",
    },
    cells: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({}))),
    regions: Array.from({ length: 9 }, (_, box) => Array.from({ length: 9 }, (_, offset) => [
      Math.floor(box / 3) * 3 + Math.floor(offset / 3), (box % 3) * 3 + offset % 3,
    ])),
  }
  const imported = await detectPuzzle('ctc' + lzString.compressToBase64(JSON.stringify(sudokuPad)))
  assert.deepEqual(imported.variant?.puzzle.rules, puzzle.rules)
  const importedPuzzle = imported.variant!.puzzle

  const blocked = Array(81).fill('0')
  blocked[31] = '2'
  blocked[49] = '8'
  const withoutSupport = await runEngine({ type: 'variant', operation: 'candidates', position: {
    puzzle: importedPuzzle, entries: blocked.join(''),
  } })
  assert.equal(withoutSupport?.[40] & (1 << 4), 0)

  const forced = Array(81).fill('0')
  forced[40] = '5'
  forced[31] = '2'
  const withOneOption = await runEngine({ type: 'variant', operation: 'candidates', position: {
    puzzle: importedPuzzle, entries: forced.join(''),
  } })
  assert.equal(withOneOption?.[49], 1 << 8)

  const bothAlternativesConflict = Array(81).fill('0')
  bothAlternativesConflict[40] = '5'
  bothAlternativesConflict[12] = '1' // a knight move from the upper alternative at cell 31
  bothAlternativesConflict[30] = '9' // a knight move from the lower alternative at cell 49
  const combinedCandidates = await runEngine({ type: 'variant', operation: 'candidates', position: {
    puzzle: importedPuzzle, entries: bothAlternativesConflict.join(''),
  } })
  assert.equal(combinedCandidates?.[40] & (1 << 4), 0,
    'Anti-Knight can remove both supports, so the conditional trigger must be rejected')
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const cell = (index: number) => {
      let row = Math.floor(index / 9), column = index % 9
      if (symmetry & 1) [row, column] = [column, row]
      if (symmetry & 2) row = 8 - row
      if (symmetry & 4) column = 8 - column
      return row * 9 + column
    }
    const symmetricEntries = Array(81).fill('0')
    for (let index = 0; index < 81; index++) symmetricEntries[cell(index)] = bothAlternativesConflict[index]
    const symmetricCandidates = await runEngine({ type: 'variant', operation: 'candidates', position: {
      puzzle: reflectVariant(importedPuzzle, symmetry), entries: symmetricEntries.join(''),
    } })
    assert.ok(symmetricCandidates)
    assert.equal(symmetricCandidates[cell(40)] & (1 << 4), 0,
      `the composed contradiction remains under square symmetry ${symmetry}`)
  }

  const classicSolution = Array.from({ length: 81 }, (_, cell) =>
    String((Math.floor(cell / 9) * 3 + Math.floor(Math.floor(cell / 9) / 3) + cell % 9) % 9 + 1)).join('')
  assert.equal(await runEngine({ type: 'variant', operation: 'analyze', position: {
    puzzle: importedPuzzle, entries: classicSolution,
  } }), 'unsolvable')
})
