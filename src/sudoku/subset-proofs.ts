import type { Candidate, DeductionAction } from './engine.ts'
import { candidateId, chainNodeCandidates, chainNodeDigit, makeChainGraph, type ChainEdge, type ChainGraph, type ChainNode } from './chains.ts'
import { candidateCount, hasCandidate } from './game.ts'
import {
  cellAvailableForSubset, subsetDigits, subsetHouses, subsetMembershipProblem, subsetPeers,
  type SubsetBlossom, type SubsetContext, type SubsetDescription, type SubsetEndpoint, type SubsetPath, type SubsetPattern, type SubsetProof,
} from './subsets.ts'

export type SubsetLink = { to: number; digit: number } & ({ from: number } | { fromNode: ChainNode })
export type SubsetProofAnalysis = {
  links: readonly SubsetLink[]
  actions: readonly DeductionAction[]
  witnesses?: readonly Candidate[]
  technique?: 'als-xz' | 'als-xy-wing' | 'als-chain' | 'death-blossom' | 'aic' | 'xyz-wing' | 'wxyz-wing' | 'sue-de-coq'
  problem?: 'missing-candidates' | 'not-als' | 'invalid-link' | 'repeated-rcc' | 'missing-petal' | 'invalid-stem' | 'needs-sets'
}

export function subsetOccurrences(cells: readonly number[], digit: number, masks: readonly number[]) {
  return cells.filter(cell => hasCandidate(masks[cell] ?? 0, digit))
}

/** Color a linear ALS case starting with its first RCC, or by ruling out the shared end digit. */
export function alsChainCandidateStates(sets: readonly (readonly number[])[], links: readonly number[],
  masks: readonly number[], endDigit?: number) {
  const occurrences = (index: number, digit: number) =>
    subsetOccurrences(sets[index], digit, masks).map(cell => ({ cell, digit }))
  const on = links.flatMap((digit, index) => occurrences(index, digit))
  const off = links.flatMap((digit, index) => occurrences(index + 1, digit))
  if (endDigit !== undefined) {
    off.push(...occurrences(0, endDigit))
    on.push(...occurrences(sets.length - 1, endDigit))
  }
  // An ON group can include an occurrence already ruled out by an overlapping set.
  const excluded = new Set(off.map(candidateId))
  return { on: on.filter(candidate => !excluded.has(candidateId(candidate))), off }
}

export function alsChainAssumption(proof: SubsetProof, analysis: SubsetProofAnalysis, showEliminations: boolean) {
  if (proof.kind !== 'path' || proof.sets.length < 3 || analysis.problem) return
  const action = showEliminations ? analysis.actions[0] : undefined
  return action && 'eliminate' in action
    ? { digit: action.eliminate.digit, on: false }
    : { digit: proof.links[0], on: true }
}

/** Expand a saved set path into candidate propositions when the player continues past its last ALS. */
export function expandAlsPath(proof: SubsetPath | SubsetEndpoint, exitDigit: number, graph: ChainGraph) {
  const setId = proof.kind === 'path' ? proof.sets.at(-1)! : proof.set
  const last = graph.alsNodes.get(setId)
  const exit = last?.get(exitDigit)
  if (!last || !exit) return
  const nodes: (ChainNode | undefined)[] = []
  if (proof.kind === 'endpoint') {
    nodes.push(...proof.path, last.get(chainNodeDigit(proof.path.at(-1)!)))
  } else {
    const start = graph.alsNodes.get(proof.sets[0])
    const firstLink = proof.links[0] ?? exitDigit
    const startDigit = start?.has(exitDigit) && exitDigit !== firstLink ? exitDigit : [...(start?.keys() ?? [])].find(digit => digit !== firstLink)
    nodes.push(start?.get(startDigit ?? 0))
    for (const [index, digit] of proof.links.entries()) {
      nodes.push(graph.alsNodes.get(proof.sets[index])?.get(digit), graph.alsNodes.get(proof.sets[index + 1])?.get(digit))
    }
  }
  if (nodes.at(-1) === exit || nodes.some(node => node === undefined)) return
  nodes.push(exit)
  const path = nodes as ChainNode[]
  const edges = path.slice(1).map((node, index): ChainEdge => [path[index], node])
  return edges.every(edge => graph.strength(...edge)) ? { edges, exit } : undefined
}

/** An RCC has no pair of occurrences that can both be true, including a shared cell. */
export function restrictedSubsetDigits(first: SubsetDescription, second: SubsetDescription, context: SubsetContext) {
  const { masks } = context
  if (!masks || first.id === second.id || first.kind !== 'als' || second.kind !== 'als') return []
  return subsetDigits(first.digitMask & second.digitMask, context.grid.size).filter(digit => {
    const from = subsetOccurrences(first.cells, digit, masks)
    const to = subsetOccurrences(second.cells, digit, masks)
    return from.length > 0 && to.length > 0 && from.every(a => to.every(b => subsetPeers(a, b, context)))
  })
}

export function blossomPetalOptions(stem: number, digit: number, sets: readonly SubsetDescription[], context: SubsetContext) {
  const { masks } = context
  if (!masks || !cellAvailableForSubset(stem, context) || !hasCandidate(masks[stem], digit)) return []
  return sets.filter(set => set.kind === 'als' && !set.cells.includes(stem) && hasCandidate(set.digitMask, digit) &&
    subsetOccurrences(set.cells, digit, masks).every(cell => subsetPeers(stem, cell, context)))
}

export type SubsetChainChoice = { label: string; proof: SubsetProof; target?: { set: number; digit?: number } }

/** Resolve valid next nodes from the current subset path or the selected stem candidate. */
export function subsetChainChoices(proof: SubsetProof | null, sets: readonly SubsetDescription[],
  context: SubsetContext, stemCandidate?: Candidate): SubsetChainChoice[] {
  const available = sets.filter(set => set.kind !== 'invalid' && set.kind !== 'unclassified')
  const alses = available.filter(set => set.kind === 'als')
  if (!proof) {
    const starts: SubsetChainChoice[] = available.map(set => ({
      label: `Add Set ${set.number}`, proof: { kind: 'path', sets: [set.id], links: [] },
      target: set.kind === 'als' ? { set: set.id } : undefined,
    }))
    if (!stemCandidate || subsetDigits(context.masks?.[stemCandidate.cell] ?? 0, context.grid.size).length < 2) return starts
    const { cell: stem, digit } = stemCandidate
    return [...blossomPetalOptions(stem, digit, alses, context).map((set): SubsetChainChoice => ({
      label: `Add Set ${set.number} as petal for ${digit}`, proof: { kind: 'blossom', stem, petals: { [digit]: set.id } },
    })), ...starts]
  }
  if (proof.kind === 'blossom') {
    return subsetDigits(context.masks?.[proof.stem] ?? 0, context.grid.size).flatMap(digit =>
      blossomPetalOptions(proof.stem, digit, alses, context).filter(set => set.id !== proof.petals[digit])
        .map(set => ({
          label: `Add Set ${set.number} as petal for ${digit}`,
          proof: { ...proof, petals: { ...proof.petals, [digit]: set.id } },
        })))
  }
  if (proof.kind === 'endpoint') return []
  const combined: SubsetChainChoice[] = (proof.kind === 'pattern' ? proof.sets.length < 4 : proof.sets.length === 1)
    ? available.filter(set => !proof.sets.includes(set.id)).map(set => ({
      label: `Combine Set ${set.number}`, proof: { kind: 'pattern', sets: [...proof.sets, set.id] },
    })) : []
  if (proof.kind === 'pattern') return combined
  const last = alses.find(set => set.id === proof.sets.at(-1))
  if (!last) return combined
  const linked = alses.filter(set => !proof.sets.includes(set.id)).flatMap(set => {
    const restricted = restrictedSubsetDigits(last, set, context)
    if (proof.sets.length === 1 && restricted.length > 2) return []
    return restricted.filter(digit => digit !== proof.links.at(-1)).map(digit => ({
      label: `Link Set ${set.number} via RCC ${digit}`,
      proof: { kind: 'path' as const, sets: [...proof.sets, set.id], links: [...proof.links, digit] },
      target: { set: set.id, digit },
    }))
  })
  return [...linked, ...combined]
}

type SubsetElimination = { cell: number; digit: number; occurrences: readonly number[] }

function eliminations(context: SubsetContext, sources: readonly Pick<SubsetDescription, 'cells'>[], memberCells: ReadonlySet<number>, digitMask: number,
  candidateEnd: readonly number[] = []) {
  const { masks } = context
  if (!masks) return []
  return subsetDigits(digitMask, context.grid.size).flatMap(digit => {
    const occurrences = [...candidateEnd, ...sources.flatMap(set => subsetOccurrences(set.cells, digit, masks))]
    if (!occurrences.length) return []
    return masks.flatMap<SubsetElimination>((mask, cell) => hasCandidate(mask, digit) && !memberCells.has(cell) &&
      cellAvailableForSubset(cell, context) && occurrences.every(other => subsetPeers(cell, other, context))
      ? [{ cell, digit, occurrences }] : [])
  })
}

function analyzeEndpoint(proof: SubsetEndpoint, set: SubsetDescription | undefined, context: SubsetContext, graph: ChainGraph): SubsetProofAnalysis {
  if (set?.kind !== 'als') return { links: [], actions: [], problem: 'not-als' }
  const { path } = proof
  if (path.length < 2 || path.length % 2 || new Set(path).size !== path.length ||
    !path.every((node, index) => graph.available(node) &&
      chainNodeCandidates(node).every(({ cell }) => cellAvailableForSubset(cell, context)) &&
      (index === 0 || (index % 2 ? graph.strength(path[index - 1], node) === 'strong' : graph.conflicts(path[index - 1], node))))) {
    return { links: [], actions: [], problem: 'invalid-link' }
  }
  const endpoint = path.at(-1)!
  const last = chainNodeCandidates(endpoint)
  const restricted = last[0].digit
  const inSet = subsetOccurrences(set.cells, restricted, context.masks!)
  if (!inSet.length || !last.every(({ cell, digit }) =>
    digit === restricted && inSet.every(other => subsetPeers(cell, other, context)))) {
    return { links: [], actions: [], problem: 'invalid-link' }
  }
  const links = [{ fromNode: endpoint, to: set.id, digit: restricted }]
  const start = chainNodeCandidates(path[0])
  const digit = start[0].digit
  if (digit === restricted || !hasCandidate(set.digitMask, digit) || start.some(candidate => candidate.digit !== digit)) {
    return { links, actions: [] }
  }
  const first = start.map(({ cell }) => cell)
  const members = new Set([...set.cells, ...path.flatMap(node => chainNodeCandidates(node).map(({ cell }) => cell))])
  const removed = eliminations(context, [set], members, 1 << (digit - 1), first)
  const pair = path.length === 2 && typeof path[0] === 'number' && typeof endpoint === 'number' &&
    first[0] === last[0].cell
  return { links, ...summarizeEliminations(removed), ...(removed.length && { technique: pair ? 'als-xz' : 'aic' }) }
}

/** Attach a saved ALS to a drawn path, including when its first candidate is already drawn. */
export function subsetEndpointChoices(nodes: readonly ChainNode[], sets: readonly SubsetDescription[],
  context: SubsetContext, graph: ChainGraph): SubsetChainChoice[] {
  const last = nodes.at(-1)
  if (nodes.length < 2 || last === undefined || !context.masks) return []
  return sets.flatMap(set => {
    const inside = chainNodeCandidates(last).every(({ cell }) => set.cells.includes(cell))
    const path = inside ? nodes.slice(0, -1) : nodes
    const proof: SubsetEndpoint = { kind: 'endpoint', path, set: set.id }
    const analysis = analyzeEndpoint(proof, set, context, graph)
    return analysis.links.length ? [{
      label: `Link Set ${set.number} via RCC ${analysis.links[0].digit}`, proof,
      target: { set: set.id, digit: analysis.links[0].digit },
    }] : []
  })
}

function summarizeEliminations(eliminated: readonly SubsetElimination[]) {
  const actions = new Map<string, DeductionAction>()
  const witnesses = new Map<string, Candidate>()
  for (const { cell, digit, occurrences } of eliminated) {
    actions.set(`${cell}:${digit}`, { eliminate: { cell, digit } })
    for (const source of occurrences) witnesses.set(`${source}:${digit}`, { cell: source, digit })
  }
  return { actions: [...actions.values()], witnesses: [...witnesses.values()] }
}

function wingEliminations(cells: number[], context: SubsetContext, masks: readonly number[]): SubsetProofAnalysis | undefined {
  if (cells.length === 3) {
    for (const pivot of cells) {
      const [first, second] = cells.filter(cell => cell !== pivot)
      const a = masks[first], b = masks[second]
      const shared = a & b
      if (candidateCount(a) !== 2 || candidateCount(b) !== 2 || candidateCount(shared) !== 1 ||
        masks[pivot] !== (a | b) || !subsetPeers(pivot, first, context) || !subsetPeers(pivot, second, context)) continue
      const removed = eliminations(context, [{ cells }], new Set(cells), shared)
      if (removed.length) return { technique: 'xyz-wing', links: [], ...summarizeEliminations(removed) }
    }
  }
  if (cells.length !== 4 || subsetHouses(context).some(house => cells.every(cell => house.cells.includes(cell))) ||
    cells.some(cell => candidateCount(masks[cell]) < 2)) return
  const digits = cells.reduce((union, cell) => union | masks[cell], 0)
  if (candidateCount(digits) !== 4) return
  const unrestricted = subsetDigits(digits, context.grid.size)
    .filter(digit => subsetMembershipProblem(subsetOccurrences(cells, digit, masks), context))
  if (unrestricted.length > 1) return
  // Four cells use four digits. If one digit can repeat, it is required. If none can repeat, every digit is required.
  const forced = unrestricted.length ? 1 << (unrestricted[0] - 1) : digits
  const removed = eliminations(context, [{ cells }], new Set(cells), forced)
  if (removed.length) return { technique: 'wxyz-wing', links: [], ...summarizeEliminations(removed) }
}

function intersectionEliminations(sets: readonly SubsetDescription[], context: SubsetContext, masks: readonly number[]) {
  const removed: SubsetElimination[] = []
  if (sets.length !== 3 || new Set(sets.flatMap(set => set.cells)).size !== sets.reduce((size, set) => size + set.cells.length, 0))
    return removed
  for (const intersection of sets) {
    const gap = intersection.extra ?? 0
    if (intersection.cells.length < 2 || gap < 2) continue
    const demand = (side: SubsetDescription) => side.cells.length - candidateCount(side.digitMask & ~intersection.digitMask)
    const sides = sets.filter(set => set.id !== intersection.id)
    for (const [line, block] of [sides, [...sides].reverse()]) {
      const lineDemand = demand(line), boxDemand = demand(block)
      const lineDigits = line.digitMask & intersection.digitMask
      const boxDigits = block.digitMask & intersection.digitMask
      if (lineDemand < 1 || boxDemand < 1 || lineDemand + boxDemand !== gap || (lineDigits & boxDigits) ||
        lineDemand > candidateCount(lineDigits) || boxDemand > candidateCount(boxDigits)) continue
      const houses = intersection.houses.filter(house => house.kind !== 'extra')
      const lines = houses.filter(house => house.kind === 'line' && line.houses.some(other => other.label === house.label))
      const boxes = houses.filter(house => house.kind === 'region' && block.houses.some(other => other.label === house.label))
      if (!lines.length || !boxes.length) continue
      // The sides use disjoint intersection digits and exhaust the surplus. Each house therefore locks
      // its side's digits and every intersection digit that cannot go to the opposite side.
      for (const { house, side, otherDigits } of [
        ...lines.map(house => ({ house, side: line, otherDigits: boxDigits })),
        ...boxes.map(house => ({ house, side: block, otherDigits: lineDigits })),
      ]) {
        const sources = [...intersection.cells, ...side.cells]
        const locked = side.digitMask | (intersection.digitMask & ~otherDigits)
        for (const digit of subsetDigits(locked, context.grid.size)) {
          const occurrences = subsetOccurrences(sources, digit, masks)
          for (const cell of house.cells) if (!sources.includes(cell) && cellAvailableForSubset(cell, context) && hasCandidate(masks[cell], digit)) {
            removed.push({ cell, digit, occurrences })
          }
        }
      }
    }
  }
  return removed
}

function analyzePattern(proof: SubsetPattern, byId: ReadonlyMap<number, SubsetDescription>,
  context: SubsetContext, masks: readonly number[]): SubsetProofAnalysis {
  if (new Set(proof.sets).size !== proof.sets.length || proof.sets.length < 2 || proof.sets.length > 4)
    return { links: [], actions: [], problem: 'needs-sets' }
  const sets = proof.sets.flatMap(id => byId.get(id) ?? [])
  if (sets.length !== proof.sets.length || sets.some(set => set.kind === 'invalid' || set.kind === 'unclassified'))
    return { links: [], actions: [], problem: 'invalid-link' }
  const cells = [...new Set(sets.flatMap(set => set.cells))]
  const wing = wingEliminations(cells, context, masks)
  if (wing) return wing
  const intersection = intersectionEliminations(sets, context, masks)
  if (intersection.length) return { technique: 'sue-de-coq', links: [], ...summarizeEliminations(intersection) }
  return { links: [], actions: [] }
}

function analyzePath(proof: SubsetPath, sets: ReadonlyMap<number, SubsetDescription>, context: SubsetContext): SubsetProofAnalysis {
  if (proof.sets.length < 2) return { links: [], actions: [], problem: 'needs-sets' }
  if (new Set(proof.sets).size !== proof.sets.length) return { links: [], actions: [], problem: 'invalid-link' }
  const path = proof.sets.map(id => sets.get(id))
  if (path.some(set => set?.kind !== 'als')) return { links: [], actions: [], problem: 'not-als' }
  const nodes = path.filter((set): set is SubsetDescription => set !== undefined)
  const links: SubsetLink[] = []
  let doubleLink: readonly number[] | undefined
  for (let index = 0; index < nodes.length - 1; index++) {
    const [first, second] = [nodes[index], nodes[index + 1]]
    const digit = proof.links[index]
    const rccs = restrictedSubsetDigits(first, second, context)
    if (!rccs.includes(digit) || (nodes.length === 2 && rccs.length > 2)) return { links, actions: [], problem: 'invalid-link' }
    if (index > 0 && proof.links[index - 1] === digit) return { links, actions: [], problem: 'repeated-rcc' }
    if (nodes.length === 2 && rccs.length === 2) {
      doubleLink = rccs
      links.push(...rccs.map(digit => ({ from: first.id, to: second.id, digit })))
    } else {
      links.push({ from: first.id, to: second.id, digit })
    }
  }

  const first = nodes[0], last = nodes[nodes.length - 1]
  const members = new Set(nodes.flatMap(set => set.cells))
  let technique: SubsetProofAnalysis['technique']
  let removed: SubsetElimination[]
  if (doubleLink) {
    // Two bivalue peers with the same pair are an ordinary naked pair.
    if (first.cells.length === 1 && last.cells.length === 1) return { links, actions: [] }
    const restricted = doubleLink.reduce((mask, digit) => mask | (1 << (digit - 1)), 0)
    const fromBoth = eliminations(context, [first, last], members, restricted)
    const fromEach = [first, last].flatMap(set => eliminations(context, [set], members, set.digitMask & ~restricted))
    removed = [...fromBoth, ...fromEach]
    technique = 'als-xz'
  } else {
    const endLinks = (1 << (links[0].digit - 1)) | (1 << (links[links.length - 1].digit - 1))
    const shared = (first.digitMask & last.digitMask) & ~endLinks
    removed = eliminations(context, [first, last], members, shared)
    if (shared) technique = nodes.length === 2 ? 'als-xz' : nodes.length === 3 ? 'als-xy-wing' : 'als-chain'
  }
  return { links, ...summarizeEliminations(removed), ...(technique && { technique }) }
}

function analyzeBlossom(proof: SubsetBlossom, sets: ReadonlyMap<number, SubsetDescription>, context: SubsetContext): SubsetProofAnalysis {
  const stemMask = context.masks?.[proof.stem] ?? 0
  const digits = subsetDigits(stemMask, context.grid.size)
  if (digits.length < 2 || !cellAvailableForSubset(proof.stem, context)) return { links: [], actions: [], problem: 'invalid-stem' }
  const links: SubsetLink[] = []
  const petals: SubsetDescription[] = []
  for (const digit of digits) {
    const set = sets.get(proof.petals[digit])
    if (!set || !blossomPetalOptions(proof.stem, digit, [set], context).length) continue
    petals.push(set)
    links.push({ from: proof.stem, to: set.id, digit })
  }
  if (petals.length !== digits.length) return { links, actions: [], problem: 'missing-petal' }
  const memberCells = new Set([proof.stem, ...petals.flatMap(set => set.cells)])
  const common = petals.reduce((mask, set) => mask & set.digitMask, ~stemMask)
  const removed = eliminations(context, petals, memberCells, common)
  return { links, ...summarizeEliminations(removed), ...(removed.length && { technique: 'death-blossom' }) }
}

export function analyzeSubsetProof(proof: SubsetProof, sets: readonly SubsetDescription[], context: SubsetContext, graph?: ChainGraph): SubsetProofAnalysis {
  if (!context.masks) return { links: [], actions: [], problem: 'missing-candidates' }
  const byId = new Map(sets.map(set => [set.id, set]))
  if (proof.kind === 'path') return analyzePath(proof, byId, context)
  if (proof.kind === 'blossom') return analyzeBlossom(proof, byId, context)
  if (proof.kind === 'pattern') return analyzePattern(proof, byId, context, context.masks)
  return analyzeEndpoint(proof, byId.get(proof.set), context, graph ?? makeChainGraph(context.masks, context.puzzle))
}

/** Find deductions from the saved sets the player is currently showing. */
export function analyzeVisibleSubsets(sets: readonly SubsetDescription[], context: SubsetContext) {
  const locked = sets.filter(set => set.kind === 'locked' || (set.kind === 'peer' && set.extra === 0))
  const singles = summarizeEliminations(locked.flatMap(set => eliminations(context, [set], new Set(set.cells), set.digitMask)))
  const alses = sets.filter(set => set.kind === 'als')
  const pairs: { proof: SubsetPath; analysis: SubsetProofAnalysis }[] = []
  for (const [index, first] of alses.entries()) for (const second of alses.slice(index + 1)) {
    const restricted = restrictedSubsetDigits(first, second, context)
    if (!restricted.length || restricted.length > 2) continue
    const proof: SubsetPath = { kind: 'path', sets: [first.id, second.id], links: [restricted[0]] }
    const analysis = analyzeSubsetProof(proof, [first, second], context)
    if (analysis.actions.length) pairs.push({ proof, analysis })
  }
  const actions = new Map(singles.actions.flatMap(action => 'eliminate' in action
    ? [[`${action.eliminate.cell}:${action.eliminate.digit}`, action] as const] : []))
  const pattern: SubsetPattern = { kind: 'pattern', sets: sets.map(set => set.id) }
  const match = analyzeSubsetProof(pattern, sets, context)
  const proofs = match.technique ? [...pairs, { proof: pattern, analysis: match }] : pairs
  for (const { analysis } of proofs) for (const action of analysis.actions) if ('eliminate' in action) {
    actions.set(`${action.eliminate.cell}:${action.eliminate.digit}`, action)
  }
  return { singles, proofs, actions: [...actions.values()] }
}
