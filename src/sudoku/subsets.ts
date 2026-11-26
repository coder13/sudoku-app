import { candidateCount, hasCandidate, peer } from './game.ts'
import { gridHouseCells, type PlayGrid } from './grid.ts'
import type { VariantPuzzle } from './engine.ts'
import { validChainNode, type ChainNode } from './chains.ts'
import type { SizedRuleGame } from './sized-rule-game.ts'

export type SavedSubset = { id: number; cells: readonly number[] }
export type SubsetPath = { kind: 'path'; sets: readonly number[]; links: readonly number[] }
export type SubsetBlossom = { kind: 'blossom'; stem: number; petals: Readonly<Record<number, number>> }
export type SubsetEndpoint = { kind: 'endpoint'; path: readonly ChainNode[]; set: number }
export type SubsetPattern = { kind: 'pattern'; sets: readonly number[] }
export type SubsetProof = SubsetPath | SubsetBlossom | SubsetEndpoint | SubsetPattern
export type SubsetWorkspace = { sets: readonly SavedSubset[]; nextId: number; proof?: SubsetProof }
export const EMPTY_SUBSET_WORKSPACE: SubsetWorkspace = { sets: [], nextId: 1 }

export function subsetProofSets(proof: SubsetProof) {
  if (proof.kind === 'path' || proof.kind === 'pattern') return proof.sets
  if (proof.kind === 'endpoint') return [proof.set]
  return Object.values(proof.petals)
}

export type SubsetContext = {
  values: string
  masks: readonly number[] | null
  grid: PlayGrid
  puzzle?: VariantPuzzle
  sizedRules?: SizedRuleGame['rules']
  visibleCells?: ReadonlySet<number>
}

export type SubsetHouse = { label: string; cells: readonly number[]; kind: 'line' | 'region' | 'extra' }
export type SubsetDescription = SavedSubset & {
  number: number
  houses: readonly SubsetHouse[]
  digitMask: number
  extra: number | null
  kind: 'invalid' | 'unclassified' | 'locked' | 'als' | 'surplus' | 'peer'
}
export type SubsetMembershipProblem =
  | { type: 'empty' }
  | { type: 'unavailable'; cell: number }
  | { type: 'not-peers'; cells: readonly [number, number] }

export function cellAvailableForSubset(cell: number, { values, visibleCells }: SubsetContext) {
  return Number.isSafeInteger(cell) && values[cell] === '0' && (!visibleCells || visibleCells.has(cell))
}

export function subsetPeers(a: number, b: number, { grid, puzzle, sizedRules }: SubsetContext) {
  return a !== b && peer(a, b, puzzle, grid, sizedRules)
}

export function subsetMembershipProblem(cells: readonly number[], context: SubsetContext): SubsetMembershipProblem | undefined {
  if (!cells.length) return { type: 'empty' }
  for (const [index, cell] of cells.entries()) {
    if (!cellAvailableForSubset(cell, context)) return { type: 'unavailable', cell }
    const conflict = cells.slice(0, index).find(other => !subsetPeers(other, cell, context))
    if (conflict !== undefined) return { type: 'not-peers', cells: [conflict, cell] }
  }
}

export function eligibleSubsetCells(members: readonly number[], context: SubsetContext) {
  return new Set(Array.from({ length: context.values.length }, (_, cell) => cell).filter(cell =>
    cellAvailableForSubset(cell, context) && members.every(member => subsetPeers(member, cell, context))))
}

export function subsetHouses({ grid, puzzle, sizedRules }: SubsetContext): SubsetHouse[] {
  const { size } = grid
  const rows = Array.from({ length: size }, (_, row): SubsetHouse => ({
    label: `row ${row + 1}`, cells: gridHouseCells({ row }, grid), kind: 'line',
  }))
  const columns = Array.from({ length: size }, (_, column): SubsetHouse => ({
    label: `column ${column + 1}`, cells: gridHouseCells({ column }, grid), kind: 'line',
  }))
  const regions = puzzle?.regions && puzzle.regions.type !== 'boxes'
    ? puzzle.regions.regions.map((cells, index): SubsetHouse => ({ label: `region ${index + 1}`, cells, kind: 'region' }))
    : 'noRegions' in grid ? [] : Array.from({ length: size }, (_, box): SubsetHouse => ({
      label: `${'regions' in grid ? 'region' : 'box'} ${box + 1}`, cells: gridHouseCells({ box }, grid), kind: 'region',
    }))
  const ruleHouses = [...(puzzle?.rules ?? []), ...(sizedRules ?? [])].flatMap<SubsetHouse>(rule => {
    if (rule.type === 'diagonal') return [{
      label: `${rule.diagonal} diagonal`,
      kind: 'extra',
      cells: Array.from({ length: size }, (_, index) => index * size + (rule.diagonal === 'main' ? index : size - index - 1)),
    }]
    if ((rule.type === 'extra-house' || rule.type === 'distinct-cells') && rule.cells.length === size) {
      return [{ label: 'extra house', cells: rule.cells, kind: 'extra' }]
    }
    return []
  })
  return [...rows, ...columns, ...regions, ...ruleHouses]
}

export function describeSubsets(sets: readonly SavedSubset[], context: SubsetContext): SubsetDescription[] {
  const houses = subsetHouses(context)
  const fullMask = (1 << context.grid.size) - 1
  const masks = context.masks
  return sets.map((set, index) => {
    const shared = houses.filter(house => set.cells.every(cell => house.cells.includes(cell)))
    const digitMask = masks ? set.cells.reduce((union, cell) => union | (masks[cell] ?? 0), 0) & fullMask : 0
    const extra = masks ? candidateCount(digitMask) - set.cells.length : null
    const kind = subsetMembershipProblem(set.cells, context) || (extra !== null && (extra < 0 || set.cells.some(cell => !masks?.[cell])))
      ? 'invalid'
      : extra === null ? 'unclassified'
      : !shared.length ? 'peer'
      : extra === 0 ? 'locked' : extra === 1 ? 'als' : 'surplus'
    return { ...set, number: index + 1, houses: shared, digitMask, extra, kind }
  })
}

export function subsetDigits(mask: number, size: number) {
  return Array.from({ length: size }, (_, index) => index + 1).filter(digit => hasCandidate(mask, digit))
}

export function saveSubset(workspace: SubsetWorkspace, cells: readonly number[], context: SubsetContext, id?: number): SubsetWorkspace {
  if (subsetMembershipProblem(cells, context)) return workspace
  const members = [...cells].sort((first, second) => first - second)
  if (id === undefined) return {
    ...workspace, sets: [...workspace.sets, { id: workspace.nextId, cells: members }], nextId: workspace.nextId + 1,
  }
  return { ...workspace, sets: workspace.sets.map(set => set.id === id ? { id, cells: members } : set) }
}

export function deleteSubset(workspace: SubsetWorkspace, id: number): SubsetWorkspace {
  const { proof } = workspace
  const referenced = proof && subsetProofSets(proof).includes(id)
  return { ...workspace, sets: workspace.sets.filter(set => set.id !== id), ...(referenced && { proof: undefined }) }
}

/** Validate the saved proof shape. The live board verifies each relationship before applying it. */
export function validSubsetProof(value: unknown, size = 9): value is SubsetProof {
  if (!value || typeof value !== 'object') return false
  const proof = value as SubsetProof
  const validId = (id: number) => Number.isSafeInteger(id) && id > 0
  const validDigit = (digit: number) => Number.isInteger(digit) && digit >= 1 && digit <= size
  if (proof.kind === 'path') {
    return Array.isArray(proof.sets) && proof.sets.length > 0 && proof.sets.every(validId) &&
      new Set(proof.sets).size === proof.sets.length && Array.isArray(proof.links) &&
      proof.links.length === proof.sets.length - 1 && proof.links.every(validDigit)
  }
  if (proof.kind === 'pattern') {
    return Array.isArray(proof.sets) && proof.sets.length >= 2 && proof.sets.length <= 4 &&
      proof.sets.every(validId) && new Set(proof.sets).size === proof.sets.length
  }
  if (proof.kind === 'endpoint') {
    return size === 9 && validId(proof.set) && Array.isArray(proof.path) && proof.path.length >= 2 &&
      proof.path.length % 2 === 0 && proof.path.every(validChainNode) && new Set(proof.path).size === proof.path.length
  }
  return proof.kind === 'blossom' && Number.isInteger(proof.stem) && proof.stem >= 0 && proof.stem < size ** 2 &&
    Boolean(proof.petals && typeof proof.petals === 'object' && !Array.isArray(proof.petals) &&
      Object.entries(proof.petals).every(([digit, id]) => String(Number(digit)) === digit && validDigit(Number(digit)) && validId(id)))
}

/** Validate stored membership and references. Candidate status is always derived from the live grid. */
export function readSubsetWorkspace(value: SubsetWorkspace | undefined, grid: PlayGrid): SubsetWorkspace | undefined {
  if (!value || !Array.isArray(value.sets)) return undefined
  const ids = new Set<number>()
  const sets = value.sets.filter(set => {
    if (!set || !Number.isSafeInteger(set.id + 1) || set.id < 1 || ids.has(set.id) || !Array.isArray(set.cells)
      || !set.cells.length || new Set(set.cells).size !== set.cells.length
      || set.cells.some((cell: number) => !Number.isSafeInteger(cell) || cell < 0 || cell >= grid.size ** 2)) return false
    ids.add(set.id)
    return true
  })
  if (!sets.length && !(Number.isSafeInteger(value.nextId) && value.nextId > 1)) return undefined
  const nextId = sets.reduce((next, set) => Math.max(next, set.id + 1), 1)
  const proof = value.proof
  const validProof = validSubsetProof(proof, grid.size) && subsetProofSets(proof).every(id => ids.has(id))
  return {
    sets, nextId: Number.isSafeInteger(value.nextId) ? Math.max(nextId, value.nextId) : nextId,
    ...(validProof && { proof }),
  }
}
