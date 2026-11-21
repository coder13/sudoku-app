import assert from 'node:assert/strict'
import test from 'node:test'
import type { Candidate, DeductionAction } from '../src/sudoku/engine.ts'
import {
  analyzeChainPaths, analyzeChains, analyzeMedusa, candidateId, chainGroup, makeChainGraph,
  type ChainEdge, type ChainNode,
} from '../src/sudoku/chains.ts'

const atom = (cell: number, digit = 1): Candidate => ({ cell, digit })
const sameCandidate = (a: Candidate, b: Candidate) => a.cell === b.cell && a.digit === b.digit
const conflict = (a: Candidate, b: Candidate) => a.cell === b.cell ? a.digit !== b.digit : a.digit === b.digit && (
  Math.floor(a.cell / 9) === Math.floor(b.cell / 9) || a.cell % 9 === b.cell % 9 ||
  Math.floor(a.cell / 27) === Math.floor(b.cell / 27) && Math.floor(a.cell % 9 / 3) === Math.floor(b.cell % 9 / 3)
)

function position(atoms: Candidate[]) {
  const masks = Array<number>(81).fill(0)
  for (const { cell, digit } of atoms) masks[cell] |= 1 << (digit - 1)
  return makeChainGraph(masks)
}

// Check the deduction against every local assignment. Only the listed houses
// or cells must contain a true candidate, so no unlisted deduction can help.
function models(atoms: Candidate[], required: Candidate[][]) {
  const indices = required.map(choices => choices.map(candidate => {
    const index = atoms.findIndex(other => sameCandidate(candidate, other))
    assert.notEqual(index, -1)
    return index
  }))
  return Array.from({ length: 2 ** atoms.length }, (_, state) => state).filter(state => {
    if (!indices.every(choices => choices.filter(index => state & (1 << index)).length === 1)) return false
    return atoms.every((candidate, index) => !(state & (1 << index)) || atoms.every((other, next) =>
      next <= index || !(state & (1 << next)) || !conflict(candidate, other)))
  })
}

function assertActions(atoms: Candidate[], assignments: number[], actions: readonly DeductionAction[]) {
  assert.ok(assignments.length, 'the premises must have at least one model')
  for (const action of actions) {
    const candidate = 'place' in action ? action.place : action.eliminate
    const index = atoms.findIndex(other => sameCandidate(candidate, other))
    assert.notEqual(index, -1, 'every action must name a live candidate')
    for (const state of assignments) {
      assert.equal(Boolean(state & (1 << index)), 'place' in action, JSON.stringify({ action, state, atoms }))
    }
  }
}

function edges(nodes: readonly ChainNode[]): ChainEdge[] {
  return nodes.slice(1).map((to, index) => [nodes[index], to])
}

test('a true group at a discontinuity removes common peers without placing its members', () => {
  const atoms = [0, 1, 4, 9, 36, 40].map(cell => atom(cell))
  const graph = position(atoms)
  const group = chainGroup(1, [0, 1])!
  const links = edges([group, candidateId(atom(4)), candidateId(atom(40)), candidateId(atom(36)), candidateId(atom(9)), group])
  const [proof] = analyzeChains(graph, links)
  const assignments = models(atoms, [[0, 1, 4], [36, 40], [0, 1, 9]].map(cells => cells.map(cell => atom(cell))))
  assert.ok(assignments.some(state => state & 1), 'the first group member can be true')
  assert.ok(assignments.some(state => state & 2), 'the second group member can be true')
  assert.equal(proof.loop, 'discontinuous')
  assert.ok(proof.actions.length)
  assert.ok(proof.actions.every(action => 'eliminate' in action && [4, 9].includes(action.eliminate.cell)))
  assertActions(atoms, assignments, proof.actions)
})

test('a false group at a discontinuity eliminates every member', () => {
  const atoms = [0, 1, 3, 4, 9].map(cell => atom(cell))
  const graph = position(atoms)
  const group = chainGroup(1, [0, 1])!
  const [proof] = analyzeChains(graph, edges([group, candidateId(atom(3)), candidateId(atom(4)), group]))
  const assignments = models(atoms, [[atom(3), atom(4)]])
  assert.equal(proof.loop, 'discontinuous')
  assert.deepEqual(proof.actions, [{ eliminate: atom(0) }, { eliminate: atom(1) }])
  assertActions(atoms, assignments, proof.actions)
})

test('coloring a group does not imply that all of its members are true', () => {
  const rows = [[0, 1, 3], [9, 12], [24], [27, 28], [40], [52], [56], [68], [80]]
  const atoms = rows.flat().map(cell => atom(cell))
  const graph = position(atoms)
  const group = chainGroup(1, [0, 1])!
  const assignments = models(atoms, rows.map(cells => cells.map(cell => atom(cell))))
  assert.equal(assignments.length, 3)
  const [proof] = analyzeMedusa(graph, [[group, candidateId(atom(3))]])
  assert.equal(proof.sides.size, 2)
  assert.deepEqual(proof.actions, [])
  assertActions(atoms, assignments, proof.actions)
})

test('grouped paths and coloring remain sound when a group and its members both appear', () => {
  const atoms = [0, 1, 3, 4, 9].map(cell => atom(cell))
  const graph = position(atoms)
  const groups = [chainGroup(1, [0, 1])!, chainGroup(1, [0, 9])!, chainGroup(1, [3, 4])!]
  const nodes: ChainNode[] = [...atoms.map(candidateId), ...groups]
  const links: ChainEdge[] = nodes.flatMap((from, index) => nodes.slice(index + 1)
    .filter(to => graph.strength(from, to)).map(to => [from, to] as const))
  const assignments = models(atoms, [[0, 1, 3, 4], [0, 1, 9], [0, 9], [3, 4]].map(cells => cells.map(cell => atom(cell))))
  assert.equal(assignments.length, 2)
  assert.equal(graph.strength(groups[0], candidateId(atom(0))), undefined)
  assert.equal(graph.strength(groups[0], groups[1]), undefined)
  const proofs = [...analyzeChainPaths(graph, links), ...analyzeMedusa(graph, links)]
  assert.ok(proofs.some(proof => proof.actions.length))
  for (const proof of proofs) assertActions(atoms, assignments, proof.actions)
})

test('a grouped AIC can end on a different digit and remove only a candidate that conflicts with every member', () => {
  for (const nearMiss of [false, true]) {
    const start = [atom(0), atom(1)]
    const turn = nearMiss ? 57 : 30
    const bridge = nearMiss ? 54 : 27
    const end = nearMiss ? 27 : 9
    const target = atom(end)
    const atoms = [...start, atom(3), atom(turn), atom(turn, 2), atom(bridge, 2), atom(end, 2), target]
    const graph = position(atoms)
    const group = chainGroup(1, [0, 1])!
    const links = edges([group, candidateId(atom(3)), candidateId(atom(turn)), candidateId(atom(turn, 2)),
      candidateId(atom(bridge, 2)), candidateId(atom(end, 2))])
    const assignments = models(atoms, [[...start, atom(3)], [atom(turn), atom(turn, 2)], [atom(bridge, 2), atom(end, 2)]])
    const [proof] = analyzeChains(graph, links)
    assertActions(atoms, assignments, proof.actions)
    if (nearMiss) {
      assert.ok(assignments.some(state => state & (1 << atoms.indexOf(target))), 'the target remains possible when it misses one group member')
      assert.equal(proof.actions.some(action => 'eliminate' in action && sameCandidate(action.eliminate, target)), false)
    } else {
      assert.ok(proof.actions.some(action => 'eliminate' in action && sameCandidate(action.eliminate, target)))
    }
  }
})
