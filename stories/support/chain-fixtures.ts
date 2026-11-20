import { newChainSketch } from '../../src/sudoku/chain-sketch'
import { candidateId, type ChainEdge } from '../../src/sudoku/chains'
import { makeGame, replaceCandidates } from '../../src/sudoku/game'

const medusaRemovalGivens = [
  '450720690', '087946005', '296530047',
  '019375004', '034192570', '725684900',
  '940863750', '060257409', '570419300',
].join('')
export const medusaRemovalMasks = [
  '- - 13 - - 18 - - 38',
  '13 - - - - - 12 23 -',
  '- - - - - 18 18 - -',
  '68 - - - - - 2 26 -',
  '68 - - - - - - - 68',
  '- - - - - - - 13 13',
  '- - 12 - - - - - 12',
  '13 - 138 - - - - 18 -',
  '- - 28 - - - - 268 268',
].flatMap(row => row.split(' ').map(digits => digits === '-' ? 0
  : [...digits].reduce((mask, digit) => mask | (1 << (Number(digit) - 1)), 0)))
const medusaRemovalNodes = [
  { cell: 56, digit: 1 }, { cell: 62, digit: 1 }, { cell: 53, digit: 1 },
  { cell: 53, digit: 3 }, { cell: 8, digit: 3 },
].map(candidateId)
export const medusaRemovalLinks = medusaRemovalNodes.slice(1)
  .map((node, index): ChainEdge => [medusaRemovalNodes[index], node])
export const medusaRemovalGame = {
  ...replaceCandidates(makeGame('medusa-removal', '3D Medusa', medusaRemovalGivens, 'generated'),
    medusaRemovalMasks, { recordHistory: false }),
  difficulty: 'hard' as const, score: 784,
  chainSketch: { sketches: [{ ...newChainSketch(1), history: [[], medusaRemovalLinks] }], activeId: 1, pending: null },
}
