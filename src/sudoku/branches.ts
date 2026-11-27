import type { Candidate, VariantHouse, VariantPuzzle } from './engine.ts'
import { marksOf, peer, type Position } from './game.ts'
import { CLASSIC_GRID, isGridText } from './grid.ts'
import { hasAuthoredRegions, variantDigitExclusions, variantHouseCells, variantHouseName } from './variants.ts'

const size = 9
const cells = Array.from({ length: size * size }, (_, cell) => cell)
const digits = Array.from({ length: size }, (_, digit) => digit + 1)
const fullMask = (1 << size) - 1
const classic: VariantPuzzle = { version: 1, givens: '0'.repeat(cells.length) }
const bit = (digit: number) => 1 << (digit - 1)
const candidateKey = ({ cell, digit }: Candidate) => cell * size + digit - 1

export type BranchMove = Candidate & { truth: boolean }
export type BranchOrigin = { values: string; eliminations?: readonly number[]; candidateMasks?: readonly number[] }
type BranchEdit = { add: readonly BranchMove[]; clear: readonly BranchMove[] }
export type SavedBranch = {
  id: string; number: number; origin: BranchOrigin; history: readonly BranchEdit[]; cursor: number;
  hidden?: true; trace?: true
}
export type BranchWorkspace = { branches: readonly SavedBranch[]; nextNumber: number }
export type BranchHouse = { cells: readonly number[]; name: string }
type Reason = { type: 'cell' } | { type: 'house'; house: BranchHouse } | { type: 'rule' }
export type BranchFact = BranchMove & {
  kind: 'assumption' | 'trial' | 'exclusion' | 'single'; causes: readonly number[]; reason?: Reason;
}
export type BranchConflict =
  | { type: 'opposite'; move: BranchMove; causes: readonly number[] }
  | { type: 'cell'; cell: number; causes: readonly number[] }
  | { type: 'house'; house: BranchHouse; digit: number; causes: readonly number[] }

export type BranchAnalysis = {
  values: string; masks: readonly number[]; moves: readonly BranchMove[]; facts: readonly BranchFact[]; conflict?: BranchConflict;
}
type AnalyzedBranch = { branch: SavedBranch; analysis: BranchAnalysis }
type ProofCase = AnalyzedBranch & { assumption: BranchMove }
export type BranchResult = {
  move: BranchMove; kind: 'shared' | 'contradiction'; proof: readonly (AnalyzedBranch & { roots: readonly number[] })[];
}

export function branchLetter(id: number): string {
  const letter = String.fromCharCode(65 + (id - 1) % 26)
  return id <= 26 ? letter : branchLetter(Math.floor((id - 1) / 26)) + letter
}

export function sameBranchOrigin(a: BranchOrigin, b: BranchOrigin) {
  return a.values === b.values && cells.every(cell => (a.eliminations?.[cell] ?? 0) === (b.eliminations?.[cell] ?? 0) &&
    (a.candidateMasks?.[cell] ?? fullMask) === (b.candidateMasks?.[cell] ?? fullMask))
}

export function branchRules(puzzle = classic) {
  const houses: VariantHouse[] = digits.flatMap((_, index) => [{ row: index }, { column: index }])
  const regionCount = hasAuthoredRegions(puzzle.regions) ? puzzle.regions.regions.length : size
  for (let region = 0; region < regionCount; region++) houses.push({ region })
  for (const [index, rule] of (puzzle.rules ?? []).entries()) {
    if (rule.type === 'extra-house') houses.push({ extra: index })
    else if (rule.type === 'diagonal') houses.push({ diagonal: rule.diagonal })
  }
  const scopes = houses.map(house => ({ cells: variantHouseCells(house, puzzle), name: variantHouseName(house, puzzle) }))
  const shared = cells.map(from => {
    const peers = scopes.filter(house => house.cells.includes(from))
    return cells.map(to => peers.find(house => house.cells.includes(to)))
  })
  const sameDigit = cells.map(from => cells.map(to => from !== to && (shared[from][to] || peer(from, to, puzzle))))
  function exclusions(from: number, to: number, digit: number) {
    if (from === to) return fullMask & ~bit(digit)
    return (sameDigit[from][to] ? bit(digit) : 0) | variantDigitExclusions(puzzle, from, to, digit)
  }
  function exclusionReason(from: number, to: number, same: boolean): Reason {
    const house = same && shared[from][to]
    return from === to ? { type: 'cell' } : house ? { type: 'house', house } : { type: 'rule' }
  }
  return { houses: scopes.filter(house => house.cells.length === size), exclusions, exclusionReason }
}

export type BranchRules = ReturnType<typeof branchRules>

export function branchOriginMasks(origin: BranchOrigin, rules: BranchRules) {
  const masks = cells.map(cell => origin.values[cell] === '0' ? (origin.candidateMasks?.[cell] ?? fullMask) & ~(origin.eliminations?.[cell] ?? 0) : 0)
  for (const from of cells) {
    const digit = Number(origin.values[from])
    if (digit) for (const to of cells) masks[to] &= ~rules.exclusions(from, to, digit)
  }
  return masks
}

export function branchOriginUsable(origin: BranchOrigin, masks: readonly number[], rules: BranchRules) {
  const values = Array.from(origin.values, Number)
  for (const cell of cells) {
    const digit = values[cell]
    if (!digit && !masks[cell]) return false
    if (digit && cells.some(to => to > cell && values[to] && rules.exclusions(cell, to, digit) & bit(values[to]))) return false
  }
  return rules.houses.every(house => house.cells.reduce((mask, cell) => mask | (values[cell] ? bit(values[cell]) : masks[cell]), 0) === fullMask)
}

const moveKey = (move: BranchMove) => candidateKey(move) * 2 + Number(move.truth)

function activeBranchMoves(branch: SavedBranch) {
  const moves = new Map<number, BranchMove>()
  for (const { add, clear } of branch.history.slice(0, branch.cursor)) {
    for (const move of clear) moves.delete(moveKey(move))
    for (const move of add) moves.set(moveKey(move), move)
  }
  return [...moves.values()]
}

/** Record the manual effects of one ordinary grid edit. Branch analysis supplies the consequences. */
export function recordBranchInput(branch: SavedBranch, analysis: BranchAnalysis, before: Position, after: Position, rules: BranchRules) {
  if (before === after) return branch
  const origin = branchOriginMasks(branch.origin, rules)
  const add: BranchMove[] = []
  const clear: BranchMove[] = []
  const active = new Map(analysis.moves.map(move => [moveKey(move), move]))
  const placing = before.entries !== after.entries
  for (const cell of cells) {
    if (placing) {
      const digit = Number(after.entries[cell])
      if (before.entries[cell] === after.entries[cell] || (digit && !(origin[cell] & bit(digit)))) continue
      const previousDigit = Number(before.entries[cell])
      const previous = previousDigit ? active.get(moveKey({ cell, digit: previousDigit, truth: true })) : undefined
      if (previous) clear.push(previous)
      if (digit) add.push({ cell, digit, truth: true })
    } else if (before.entries[cell] === '0') {
      const previous = before.center[cell] | before.corner[cell]
      const next = after.center[cell] | after.corner[cell]
      for (const digit of marksOf(previous & ~next)) add.push({ cell, digit, truth: false })
      for (const digit of marksOf(next & ~previous)) {
        const removal = active.get(moveKey({ cell, digit, truth: false }))
        if (removal) clear.push(removal)
      }
    }
  }
  if (!add.length && !clear.length) return branch
  return { ...branch, history: [...branch.history.slice(0, branch.cursor), { add, clear }], cursor: branch.cursor + 1 }
}

/** Replay hypothetical moves and retain the reasons for placements and candidate removals. */
export function analyzeBranch(branch: SavedBranch, rules: BranchRules, assumptionsOnly = false): BranchAnalysis {
  const origin = branchOriginMasks(branch.origin, rules)
  const masks = [...origin]
  const values = Array.from(branch.origin.values, Number)
  const placed = new Map<number, number>()
  const removed = new Map<number, number>()
  const facts: BranchFact[] = []
  let conflict: BranchConflict | undefined

  function record(fact: BranchFact) {
    const key = candidateKey(fact)
    const previous = (fact.truth ? placed : removed).get(key)
    if (previous !== undefined) return previous
    const id = facts.push(fact) - 1
    const opposite = (fact.truth ? removed : placed).get(key)
    if (opposite !== undefined) conflict ??= { type: 'opposite', move: fact, causes: [opposite, id] }
    if (fact.truth) placed.set(key, id)
    else {
      removed.set(key, id)
      masks[fact.cell] &= ~bit(fact.digit)
    }
    return id
  }

  function move(fact: BranchFact) {
    if (!(origin[fact.cell] & bit(fact.digit))) return
    const id = record(fact)
    if (!fact.truth) return
    values[fact.cell] = fact.digit
    masks[fact.cell] = 0
    if (conflict) return
    for (const cell of cells) {
      const exclusions = origin[cell] & rules.exclusions(fact.cell, cell, fact.digit)
      for (const digit of digits) if (exclusions & bit(digit)) record({
        cell, digit, truth: false, kind: 'exclusion', causes: [id], reason: rules.exclusionReason(fact.cell, cell, digit === fact.digit),
      })
    }
  }

  function removalCauses(target: readonly number[], choices: readonly number[]) {
    return target.flatMap(cell => choices.flatMap(digit => {
      const id = removed.get(candidateKey({ cell, digit }))
      return id === undefined ? [] : [id]
    }))
  }

  function settle(trace: boolean) {
    while (!conflict) {
      const empty = cells.find(cell => !values[cell] && !masks[cell])
      if (empty !== undefined) {
        conflict = { type: 'cell', cell: empty, causes: removalCauses([empty], digits) }
        return
      }
      let single: BranchFact | undefined
      if (trace) {
        const cell = cells.find(cell => !values[cell] && (masks[cell] & (masks[cell] - 1)) === 0)
        if (cell !== undefined) single = { cell, digit: Math.log2(masks[cell]) + 1, truth: true, kind: 'single',
          causes: removalCauses([cell], digits), reason: { type: 'cell' } }
      }
      for (const house of rules.houses) {
        for (const digit of digits) {
          if (house.cells.some(cell => values[cell] === digit)) continue
          const possible = house.cells.filter(cell => masks[cell] & bit(digit))
          if (!possible.length) {
            conflict = { type: 'house', house, digit, causes: removalCauses(house.cells, [digit]) }
            return
          }
          if (trace && !single && possible.length === 1) single = {
            cell: possible[0], digit, truth: true, kind: 'single', causes: removalCauses(house.cells, [digit]),
            reason: { type: 'house', house },
          }
        }
      }
      if (!single) return
      move(single)
    }
  }

  const active = activeBranchMoves(branch)
  const [assumption, ...edits] = active
  if (assumption) {
    move({ ...assumption, kind: 'assumption', causes: [] })
    settle(false)
  }
  if (!assumptionsOnly) for (const edit of edits) {
    move({ ...edit, kind: 'trial', causes: [] })
    settle(false)
  }
  if (branch.trace && assumption) settle(true)
  return { values: values.join(''), masks, moves: active, facts, conflict }
}

/** Return only the facts that support the chosen result, in their original order. */
export function requiredBranchFacts(facts: readonly BranchFact[], roots: readonly number[]) {
  const included = new Set<number>()
  const stack = [...roots]
  while (stack.length) {
    const index = stack.pop()!
    if (included.has(index)) continue
    included.add(index)
    stack.push(...facts[index].causes)
  }
  return [...included].sort((a, b) => a - b)
}

function exhaustiveSplits(cases: ReadonlyMap<number, ProofCase>, masks: readonly number[], rules: BranchRules) {
  if (cases.size < 2) return []
  const splits: ProofCase[][] = []
  function addSplit(choices: BranchMove[]) {
    if (choices.length < 2) return
    const split: ProofCase[] = []
    for (const choice of choices) {
      const entry = cases.get(moveKey(choice))
      if (!entry) return
      split.push(entry)
    }
    splits.push(split)
  }
  for (const { assumption } of cases.values()) if (assumption.truth) {
    addSplit([assumption, { ...assumption, truth: false }])
  }
  for (const cell of cells) addSplit(digits.filter(digit => masks[cell] & bit(digit)).map(digit => ({ cell, digit, truth: true })))
  for (const house of rules.houses) for (const digit of digits) {
    addSplit(house.cells.filter(cell => masks[cell] & bit(digit)).map(cell => ({ cell, digit, truth: true })))
  }
  return splits
}

/** Prove results from the recorded assumptions alone, independently of any trial edits. */
export function branchResults(entries: readonly AnalyzedBranch[], masks: readonly number[], rules: BranchRules) {
  const cases = new Map<number, ProofCase>()
  for (const { branch, analysis } of entries) {
    const assumption = analysis.moves[0]
    if (!assumption || !(masks[assumption.cell] & bit(assumption.digit))) continue
    const key = moveKey(assumption)
    const existing = cases.get(key)
    if (existing && (existing.branch.trace || !branch.trace)) continue
    cases.set(key, { branch, assumption, analysis: analysis.moves.length > 1 ? analyzeBranch(branch, rules, true) : analysis })
  }
  const splits = exhaustiveSplits(cases, masks, rules)
  // If every case in a covering split fails, there is no move to propose for that position.
  if (splits.some(split => split.every(({ analysis }) => analysis.conflict))) return []

  const results = new Map<number, BranchResult>()
  for (const entry of cases.values()) {
    const { assumption, analysis } = entry
    if (!analysis.conflict) continue
    const move = { ...assumption, truth: !assumption.truth }
    results.set(moveKey(move), { move, kind: 'contradiction', proof: [{ ...entry, roots: analysis.conflict.causes }] })
  }
  for (const split of splits) {
    const live = split.filter(({ analysis }) => !analysis.conflict)
    const facts = live.map(({ analysis }) => new Map(analysis.facts.map((fact, index) => [moveKey(fact), index])))
    for (const [key, index] of facts[0]) if (!results.has(key) && facts.every(caseFacts => caseFacts.has(key))) {
      results.set(key, { move: live[0].analysis.facts[index], kind: 'shared', proof: split.map(item => {
        const { analysis } = item
        return { ...item, roots: analysis.conflict?.causes ?? [facts[live.indexOf(item)].get(key)!] }
      }) })
    }
  }
  return [...results.values()]
}

export function readBranchWorkspace(value: unknown, givens: string): BranchWorkspace | undefined {
  if (!value || typeof value !== 'object') return
  const { branches, nextNumber } = value as BranchWorkspace
  if (!Array.isArray(branches) || !Number.isSafeInteger(nextNumber) || nextNumber < 1) return
  const ids = new Set<string>()
  const numbers = new Set<number>()
  const restored: SavedBranch[] = []
  const validMasks = (masks?: readonly number[]) => masks === undefined || Array.isArray(masks) && masks.length === cells.length &&
    masks.every(mask => Number.isInteger(mask) && mask >= 0 && mask <= fullMask)
  const validMove = (move: BranchMove | undefined, values: string) => move && Number.isInteger(move.cell) && values[move.cell] === '0' &&
    Number.isInteger(move.digit) && move.digit >= 1 && move.digit <= size && typeof move.truth === 'boolean'
  for (const branch of branches as (SavedBranch & { assumption?: BranchMove; edits?: readonly BranchMove[] })[]) {
    const origin = branch?.origin
    if (typeof branch?.id !== 'string' || !branch.id || ids.has(branch.id) || !Number.isSafeInteger(branch.number) ||
      branch.number < 1 || branch.number >= nextNumber || numbers.has(branch.number) || !origin ||
      !isGridText(origin.values, CLASSIC_GRID) || !cells.every(cell => givens[cell] === '0' || origin.values[cell] === givens[cell]) ||
      !validMasks(origin.eliminations) || !validMasks(origin.candidateMasks) ||
      !Number.isInteger(branch.cursor) || branch.cursor < 0 ||
      (branch.hidden !== undefined && branch.hidden !== true) || (branch.trace !== undefined && branch.trace !== true)) return
    if (branch.history !== undefined) {
      if (!Array.isArray(branch.history) || branch.cursor > branch.history.length || !branch.history.every(step =>
        Array.isArray(step?.add) && Array.isArray(step.clear) && [...step.add, ...step.clear].every(move => validMove(move, origin.values)))) return
      restored.push(branch)
    } else {
      const { assumption, edits, cursor, ...saved } = branch
      if (!assumption || !validMove(assumption, origin.values) || !Array.isArray(edits) || cursor > edits.length ||
        !edits.every(move => validMove(move, origin.values))) return
      restored.push({ ...saved, cursor: cursor + 1, history: [assumption, ...edits].map(move => ({ add: [move], clear: [] })) })
    }
    ids.add(branch.id)
    numbers.add(branch.number)
  }
  return { branches: restored, nextNumber }
}
