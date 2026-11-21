import assert from 'node:assert/strict'
import type { VariantDeduction, VariantPuzzle } from '../../src/sudoku/engine.ts'
import { assertGroupLineProof } from './group-line-truth.ts'

export function assertModularProof(puzzle: VariantPuzzle, proof: VariantDeduction) {
  const { evidence } = proof
  if (evidence.type === 'group-line-house' || evidence.type === 'constraint' && evidence.rules.length === 1) {
    assertGroupLineProof(puzzle, proof, 'modular')
    return
  }

  assert.equal(proof.technique, 'modular')
  assert.equal(evidence.type, 'constraint')
  const { cells, domains, rules } = evidence
  assert.equal(rules.length, 2)
  const line = puzzle.rules![rules[0]]
  const clue = puzzle.rules![rules[1]]
  assert.equal(line.type, 'modular')
  assert.deepEqual(new Set(cells), new Set(line.cells))
  assert.equal(cells.length, new Set(cells).size)
  assert.equal(domains.length, cells.length)
  const [a, b] = cells
  const pairMatches = ([first, second]: readonly number[]) => first === a && second === b || first === b && second === a
  const total = clue.type === 'adjacent-total' && pairMatches(clue.cells) ? clue.sum
    : clue.type === 'xv' && clue.five?.pairs?.some(pairMatches) ? 5
      : clue.type === 'xv' && clue.ten?.pairs?.some(pairMatches) ? 10 : undefined
  assert.ok(total)

  // Enumerate the digits at the printed sum and then group choices at
  // each remaining cell, checking the original sliding windows directly.
  const masks = [0, 0, 0]
  for (let digit = 1; digit <= 9; digit++) masks[digit % 3] |= 1 << (digit - 1)
  const walk = line.cells.map(cell => cells.indexOf(cell))
  const assigned: number[] = []
  const support = cells.map(() => 0)
  let assignments = 0

  function visit() {
    for (let i = 0; i < walk.length; i++)
      for (let j = i + 1; j < Math.min(i + 3, walk.length); j++) {
        const x = assigned[walk[i]], y = assigned[walk[j]]
        if (x !== undefined && x === y) return
      }
    if (assigned.length === cells.length) {
      assignments++
      assigned.forEach((group, i) => { support[i] |= masks[group] & domains[i] })
      return
    }
    for (let group = 0; group < 3; group++) if (masks[group] & domains[assigned.length]) {
      assigned.push(group)
      visit()
      assigned.pop()
    }
  }

  for (let digit = 1; digit <= 9; digit++) {
    const partner = total - digit
    if (partner < 1 || partner > 9 || digit === partner ||
      !(domains[0] & (1 << (digit - 1))) || !(domains[1] & (1 << (partner - 1)))) continue
    assigned.push(digit % 3, partner % 3)
    visit()
    assigned.length = 0
  }
  assert.ok(assignments > 0)
  assert.ok(proof.actions.length > 0)
  for (const action of proof.actions) {
    assert.ok('eliminate' in action)
    const { cell, digit } = action.eliminate
    const index = cells.indexOf(cell), bit = 1 << (digit - 1)
    assert.ok(index >= 0 && domains[index] & bit)
    assert.equal(support[index] & bit, 0)
  }
}
