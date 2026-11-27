import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeBranch, branchOriginMasks, branchResults, branchRules, type BranchMove, type BranchOrigin, type SavedBranch } from '../src/sudoku/branches.ts'
import { makeGame, shouldOfferPuzzleSave } from '../src/sudoku/game.ts'

const empty = '0'.repeat(81)
const seven = 1 << 6
const rules = branchRules()

function branch(number: number, origin: BranchOrigin, assumption: BranchMove, edits: BranchMove[] = []): SavedBranch {
  return { id: String(number), number, origin, assumption, edits, cursor: edits.length }
}

function check(origin: BranchOrigin, branches: SavedBranch[]) {
  const cases = branches.map(branch => ({ branch, analysis: analyzeBranch(branch, rules) }))
  return branchResults(cases, branchOriginMasks(origin, rules), rules)
}

test('a shared elimination requires every starting case and ignores matching trial edits', () => {
  const masks = Array<number>(81).fill(511)
  for (let cell = 2; cell < 9; cell++) masks[cell] &= ~seven
  const origin = { values: empty, candidateMasks: masks }
  const manual = { cell: 80, digit: 8, truth: false }
  const branches = [0, 1].map((cell, index) => branch(index + 1, origin, { cell, digit: 7, truth: true }, [manual]))

  assert.deepEqual(check(origin, [branches[0]]), [])
  const removesSharedSeven = ({ move }: { move: BranchMove }) => move.cell === 11 && move.digit === 7 && !move.truth
  const unrelated = branch(3, origin, { cell: 75, digit: 1, truth: true })
  const results = check(origin, [...branches, unrelated])
  const shared = results.find(removesSharedSeven)
  assert.equal(shared?.kind, 'shared')
  assert.deepEqual(shared?.proof.map(({ branch }) => branch.number), [1, 2])
  assert.ok(!results.some(({ move }) => move.cell === manual.cell && move.digit === manual.digit))

  const duplicate = branch(4, origin, { cell: 0, digit: 7, truth: false })
  const traced: SavedBranch = { ...duplicate, id: '5', number: 5, trace: true }
  const complement = check(origin, [branches[0], duplicate, traced]).find(removesSharedSeven)
  assert.deepEqual(complement?.proof.map(({ branch }) => branch.number), [1, 5])
})

test('a trial contradiction cannot disprove an assumption', () => {
  const origin = { values: empty }
  const trial = branch(1, origin, { cell: 0, digit: 7, truth: true }, [{ cell: 1, digit: 7, truth: true }])
  assert.equal(analyzeBranch(trial, rules).conflict?.type, 'opposite')
  assert.deepEqual(check(origin, [trial]), [])

  const masks = Array<number>(81).fill(511)
  masks[0] = seven
  const forcedOrigin = { values: empty, candidateMasks: masks }
  const removal = branch(1, forcedOrigin, { cell: 0, digit: 7, truth: false })
  const [proved] = check(forcedOrigin, [removal])
  assert.equal(proved?.kind, 'contradiction')
  assert.deepEqual(proved?.move, { cell: 0, digit: 7, truth: true })
})

test('saved branches keep a new puzzle eligible for the library before any main grid edits', () => {
  const game = { ...makeGame('new', 'New puzzle', empty, 'generated'), pendingSave: true as const }
  const saved = branch(1, { values: empty }, { cell: 0, digit: 7, truth: true })
  assert.equal(shouldOfferPuzzleSave(game), true)
  assert.equal(shouldOfferPuzzleSave({ ...game, branchWorkspace: { branches: [saved], nextNumber: 2 } }), false)
})
