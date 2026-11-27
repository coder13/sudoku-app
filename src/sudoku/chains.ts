import type { Candidate, DeductionAction, VariantPuzzle } from './engine.ts'
import { visitFireworkLinks, visitRectangleLinks, type PatternLinkSource } from './chain-pattern-links.ts'
import { candidateCount, hasCandidate, marksOf, peer } from './game.ts'
import { cellReference } from './hints.ts'
import { techniqueActionKey } from './technique-progress.ts'
import { regionMembership, variantDigitExclusions, variantHouseCells } from './variants.ts'

export type ChainGroup = `g:${number}:${string}`
/** The proposition that a digit occurs in one of its candidate cells in a saved ALS. */
export type ChainAls = `a:${number}:${number}:${string}`
/** A disjunction whose members need not share one digit or one house. */
export type ChainPatternGroup = `p:${string}`
export type ChainNode = number | ChainGroup | ChainAls | ChainPatternGroup
export type ChainEdge<Node extends ChainNode = ChainNode> = readonly [from: Node, to: Node]
export type LinkStrength = 'strong' | 'weak'

export type ChainAnalysis = {
  nodes: ChainNode[]
  strengths: LinkStrength[]
  title: string
  actions: DeductionAction[]
  explanation?: string
  loop?: 'continuous' | 'discontinuous'
  canComplete: boolean
}

export const candidateId = ({ cell, digit }: Candidate) => cell * 9 + digit - 1
export const chainCandidate = (id: number): Candidate => ({ cell: Math.floor(id / 9), digit: id % 9 + 1 })

/** Group IDs retain their exact members across saves and candidate changes. */
export function chainGroup(digit: number, cells: readonly number[]): ChainGroup | null {
  if (!Number.isInteger(digit) || digit < 1 || digit > 9 || cells.length < 2 || cells.length > 9 ||
    cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= 81) || new Set(cells).size !== cells.length) return null
  return `g:${digit}:${[...cells].sort((a, b) => a - b).join(',')}`
}

const isPatternGroup = (node: ChainNode): node is ChainPatternGroup => typeof node === 'string' && node.startsWith('p:')
const patternGroup = (ids: readonly number[]): ChainPatternGroup => `p:${[...ids].sort((a, b) => a - b).join(',')}`

export function validChainNode(node: unknown): node is ChainNode {
  if (typeof node === 'number') return Number.isInteger(node) && node >= 0 && node < 729
  if (typeof node === 'string' && /^p:\d+(?:,\d+){1,27}$/.test(node)) {
    const ids = node.slice(2).split(',').map(Number)
    return ids.every((id, i) => id < 729 && (!i || id > ids[i - 1])) && patternGroup(ids) === node
  }
  if (typeof node === 'string' && /^a:[1-9]\d*:[1-9]:\d+(?:,\d+){0,7}$/.test(node)) {
    const [, id, digit, cells] = node.split(':')
    const members = cells.split(',').map(Number)
    return Number.isSafeInteger(Number(id)) && members.every((cell, index) => cell < 81 && (!index || cell > members[index - 1])) &&
      alsChainNode(Number(id), Number(digit), members) === node
  }
  if (typeof node !== 'string' || !/^g:[1-9]:\d+(?:,\d+){1,8}$/.test(node)) return false
  const [, digit, list] = node.split(':')
  return chainGroup(Number(digit), list.split(',').map(Number)) === node
}

export const alsChainNode = (id: number, digit: number, cells: readonly number[]): ChainAls =>
  `a:${id}:${digit}:${[...cells].sort((a, b) => a - b).join(',')}`
export const isAlsChainNode = (node: ChainNode): node is ChainAls => typeof node === 'string' && node.startsWith('a:')
export const chainAlsId = (node: ChainAls) => Number(node.split(':')[1])

export function chainPoint(node: ChainNode): Candidate | { digit: number; cells: number[] } | { candidates: Candidate[] } {
  if (typeof node === 'number') return chainCandidate(node)
  if (isPatternGroup(node)) return { candidates: node.slice(2).split(',').map(id => chainCandidate(Number(id))) }
  const [digit, cells] = node.split(':').slice(-2)
  return { digit: Number(digit), cells: cells.split(',').map(Number) }
}

export function chainNodeCandidates(node: ChainNode): Candidate[] {
  const point = chainPoint(node)
  if ('candidates' in point) return point.candidates
  return 'cells' in point ? point.cells.map(cell => ({ cell, digit: point.digit })) : [point]
}

export const chainNodeDigit = (node: ChainNode) => {
  const point = chainPoint(node)
  return 'candidates' in point ? point.candidates[0].digit : point.digit
}
const compareNodes = (a: ChainNode, b: ChainNode) => typeof a === 'number' && typeof b === 'number'
  ? a - b : String(a).localeCompare(String(b))

export function sameEdge([a, b]: ChainEdge, [c, d]: ChainEdge) {
  return (a === c && b === d) || (a === d && b === c)
}

const opposite = (strength: LinkStrength): LinkStrength => strength === 'strong' ? 'weak' : 'strong'

function housesAt(cell: number, regions?: readonly number[]) {
  const row = Math.floor(cell / 9)
  const column = cell % 9
  const region = regions ? regions[cell] : Math.floor(row / 3) * 3 + Math.floor(column / 3)
  return region === undefined ? [row, 9 + column] : [row, 9 + column, 18 + region]
}

export function makeChainGraph(masks: readonly number[], puzzle?: VariantPuzzle,
  sets: readonly { id: number; cells: readonly number[] }[] = [], unique = false) {
  const cellCandidates = masks.map((mask, cell) => marksOf(mask).map((digit) => candidateId({ cell, digit })))
  const candidates = cellCandidates.flat()
  const houseCandidates = Array.from({ length: 27 }, () => Array.from({ length: 9 }, () => [] as number[]))
  const regions = puzzle?.regions && puzzle.regions.type !== 'boxes' ? regionMembership(puzzle.regions.regions) : undefined
  const houses = masks.map((_, cell) => housesAt(cell, regions))
  for (const rule of puzzle?.rules ?? []) {
    const cells = rule.type === 'diagonal' ? variantHouseCells({ diagonal: rule.diagonal }, puzzle!)
      : rule.type === 'extra-house' || rule.type === 'distinct-cells' && rule.cells.length === 9 ? rule.cells : undefined
    if (!cells) continue
    const house = houseCandidates.push(Array.from({ length: 9 }, () => [])) - 1
    for (const cell of cells) houses[cell].push(house)
  }
  for (const id of candidates) {
    const { cell, digit } = chainCandidate(id)
    for (const house of houses[cell]) houseCandidates[house][digit - 1].push(id)
  }
  const constraints = [...houseCandidates.flat(), ...cellCandidates].filter((group) => group.length > 1)

  function peers(a: number, b: number) { return peer(a, b, puzzle) }

  function candidateConflicts(a: number, b: number) {
    if (a === b) return false
    const first = chainCandidate(a)
    const second = chainCandidate(b)
    return first.cell === second.cell || (first.digit === second.digit && peers(first.cell, second.cell))
      || hasCandidate(variantDigitExclusions(puzzle, first.cell, second.cell, first.digit), second.digit)
  }

  const knownCandidates = new Set(candidates)
  const alsNodes = new Map<number, Map<number, ChainAls>>()
  const alsCells = new Map<number, ReadonlySet<number>>()
  for (const { id, cells } of sets) {
    if (!cells.length || cells.some(cell => !masks[cell]) ||
      !houses[cells[0]].some(house => cells.every(cell => houses[cell].includes(house)))) continue
    const digits = marksOf(cells.reduce((union, cell) => union | masks[cell], 0))
    if (digits.length !== cells.length + 1) continue
    alsCells.set(id, new Set(cells))
    alsNodes.set(id, new Map(digits.map(digit => [digit, alsChainNode(id, digit, cells.filter(cell => hasCandidate(masks[cell], digit)))])))
  }
  const groupMembers = new Map<ChainGroup | ChainPatternGroup, number[]>()
  const availableGroups = new Map<ChainGroup, boolean>()
  function members(node: ChainNode): number[] {
    if (typeof node === 'number') return [node]
    if (isAlsChainNode(node)) return available(node) ? chainNodeCandidates(node).map(candidateId) : []
    let result = groupMembers.get(node)
    if (!result) {
      result = validChainNode(node) ? chainNodeCandidates(node).map(candidateId) : []
      groupMembers.set(node, result)
    }
    return result
  }

  function available(node: ChainNode) {
    if (typeof node === 'number') return knownCandidates.has(node)
    if (isAlsChainNode(node)) return alsNodes.get(chainAlsId(node))?.get(chainNodeDigit(node)) === node
    if (isPatternGroup(node)) return patternLinks().has(node)
    const cached = availableGroups.get(node)
    if (cached !== undefined) return cached
    const ids = members(node)
    const present = ids.length > 0 && ids.every(id => knownCandidates.has(id))
    const valid = present && houses[chainCandidate(ids[0]).cell].some(house => ids.every(id => houses[chainCandidate(id).cell].includes(house)))
    availableGroups.set(node, valid)
    return valid
  }

  function conflicts(a: ChainNode, b: ChainNode) {
    if (a === b) return false
    if (typeof a === 'number' && typeof b === 'number') return candidateConflicts(a, b)
    const first = members(a)
    const second = members(b)
    return first.length > 0 && second.length > 0 && first.every(from => second.every(to => candidateConflicts(from, to)))
  }

  let patternIndex: Map<ChainNode, Map<ChainNode, PatternLinkSource>> | undefined
  function patternLinks() {
    if (patternIndex) return patternIndex
    const links = new Map<ChainNode, Map<ChainNode, PatternLinkSource>>()
    patternIndex = links
    if (puzzle) return links

    function endpoint(ids: readonly number[]): ChainNode {
      if (ids.length === 1) return ids[0]
      const { digit } = chainCandidate(ids[0])
      if (ids.length <= 9 && ids.every(id => chainCandidate(id).digit === digit)) {
        const group = chainGroup(digit, ids.map(id => chainCandidate(id).cell))
        if (group && available(group)) return group
      }
      return patternGroup(ids)
    }
    function add(first: readonly number[], second: readonly number[], source: PatternLinkSource) {
      const a = endpoint(first)
      const b = endpoint(second)
      if (conflicts(a, b) && ordinaryStrong(a, b)) return
      for (const [from, to] of [[a, b], [b, a]] as const) {
        const targets = links.get(from) ?? new Map<ChainNode, PatternLinkSource>()
        if (!targets.has(to)) targets.set(to, source)
        links.set(from, targets)
      }
    }
    const groupWitnesses = new Map<string, boolean>()
    function useful(ids: readonly number[]) {
      if (ids.length === 1) return true
      const key = ids.join(',')
      const cached = groupWitnesses.get(key)
      if (cached !== undefined) return cached
      const { cell, digit } = chainCandidate(ids[0])
      const hasWitness = houses[cell].some(house => houseCandidates[house][digit - 1].some(candidate =>
        ids.every(member => candidateConflicts(candidate, member))))
      groupWitnesses.set(key, hasWitness)
      return hasWitness
    }
    visitFireworkLinks(masks, (a, b, source) => {
      if (useful(a) && useful(b)) add(a, b, source)
    })
    if (unique) visitRectangleLinks(masks, add)
    return links
  }

  // An ALS can force a digit in an outside cell when the ALS skips a digit.
  // Each blocked digit must be visible at all its possible positions in the set.
  const alsCellLinks = new Map<ChainAls, Map<number, number>>()
  for (const [id, ports] of alsNodes) {
    const inside = alsCells.get(id)!
    if (inside.size < 2) continue
    for (let cell = 0; cell < masks.length; cell++) {
      const live = masks[cell]
      if (inside.has(cell) || candidateCount(live) < 3) continue
      let blocked = 0
      for (const digit of marksOf(live)) {
        const port = ports.get(digit)
        if (port && conflicts(port, candidateId({ cell, digit }))) blocked |= 1 << (digit - 1)
      }
      if (candidateCount(blocked) < 2) continue
      for (const [digit, port] of ports) {
        const remaining = live & (~blocked | (1 << (digit - 1)))
        if (candidateCount(remaining) !== 1) continue
        const forced = candidateId({ cell, digit: marksOf(remaining)[0] })
        const links = alsCellLinks.get(port) ?? new Map<number, number>()
        links.set(forced, (live ^ remaining) | (1 << (digit - 1)))
        alsCellLinks.set(port, links)
      }
    }
  }

  function alsCellLink(a: ChainNode, b: ChainNode) {
    if (isAlsChainNode(a) && typeof b === 'number') return alsCellLinks.get(a)?.get(b)
    if (isAlsChainNode(b) && typeof a === 'number') return alsCellLinks.get(b)?.get(a)
  }

  function lockedAlsTargets(a: ChainNode, b: ChainNode): number[] {
    const port = isAlsChainNode(a) ? a : isAlsChainNode(b) ? b : null
    if (!port) return []
    const id = chainAlsId(port)
    const sameSet = isAlsChainNode(a) && isAlsChainNode(b) && chainAlsId(a) === chainAlsId(b)
    const unlocked = sameSet ? (1 << (chainNodeDigit(a) - 1)) | (1 << (chainNodeDigit(b) - 1)) : alsCellLink(a, b)
    if (unlocked === undefined) return []
    const inside = alsCells.get(id)!
    return [...alsNodes.get(id)!].flatMap(([digit, node]) => hasCandidate(unlocked, digit) ? [] :
      candidates.filter(target => chainNodeDigit(target) === digit &&
        !inside.has(chainCandidate(target).cell) && conflicts(target, node)))
  }

  function patternSource(a: ChainNode, b: ChainNode) { return patternLinks().get(a)?.get(b) }

  function ordinaryStrong(a: ChainNode, b: ChainNode) {
    if (isAlsChainNode(a) || isAlsChainNode(b) || isPatternGroup(a) || isPatternGroup(b)) return false
    const first = chainCandidate(members(a)[0])
    const second = chainCandidate(members(b)[0])
    if (typeof a === 'number' && typeof b === 'number' && first.cell === second.cell) {
      return candidateCount(masks[first.cell]) === 2
    }
    if (first.digit !== second.digit) return false
    const ids = [...members(a), ...members(b)]
    return houses[first.cell].some(house =>
      ids.every(id => houses[chainCandidate(id).cell].includes(house)) &&
      houseCandidates[house][first.digit - 1].every(id => ids.includes(id)))
  }

  function strength(a: ChainNode, b: ChainNode): LinkStrength | undefined {
    if (a === b || !available(a) || !available(b)) return
    if (isAlsChainNode(a) && isAlsChainNode(b) && chainAlsId(a) === chainAlsId(b)) return 'strong'
    if (alsCellLink(a, b) !== undefined) return 'strong'
    const exclusive = conflicts(a, b)
    if (exclusive && ordinaryStrong(a, b)) return 'strong'
    if (!isAlsChainNode(a) && !isAlsChainNode(b) && patternSource(a, b)) return 'strong'
    return exclusive ? 'weak' : undefined
  }

  let intersections: ChainGroup[] | undefined
  function houseGroups() {
    if (intersections) return intersections
    const groups = new Set<ChainGroup>()
    for (const house of houseCandidates) for (const [index, ids] of house.entries()) {
      if (ids.length < 2) continue
      const cells = ids.map(id => chainCandidate(id).cell)
      const shared = new Map<number, number[]>()
      for (const cell of cells) for (const other of houses[cell]) {
        const intersection = shared.get(other) ?? []
        intersection.push(cell)
        shared.set(other, intersection)
      }
      for (const [other, intersection] of shared) {
        if (intersection.length < 2 || houseCandidates[other] === house) continue
        const group = chainGroup(index + 1, intersection)
        if (group) groups.add(group)
      }
    }
    intersections = [...groups]
    return intersections
  }

  return { candidates, cellCandidates, peers, conflicts, strength, constraints, available, members, alsNodes,
    houseGroups, lockedAlsTargets, alsCellLink, patternLinks, patternSource }
}

export type ChainGraph = ReturnType<typeof makeChainGraph>

export function highlightedStrongLinks(graph: ChainGraph, digitMask: number): ChainEdge<number>[] {
  if (!digitMask) return []
  const seen = new Set<string>()
  const links: ChainEdge<number>[] = []
  for (const group of graph.constraints) {
    if (group.length !== 2) continue
    const [from, to] = group
    if (!hasCandidate(digitMask, chainCandidate(from).digit) || !hasCandidate(digitMask, chainCandidate(to).digit)) continue
    const key = [Math.min(from, to), Math.max(from, to)].join(':')
    if (seen.has(key)) continue
    seen.add(key)
    links.push([from, to])
  }
  return links
}

function linkRoles(graph: ChainGraph, from: ChainNode, to: ChainNode): LinkStrength[] {
  const strength = graph.strength(from, to)
  if (!strength) return []
  return strength === 'strong' && graph.conflicts(from, to)
    ? ['strong', 'weak'] : [strength]
}

function alternate(links: readonly LinkStrength[][], first: LinkStrength) {
  const roles = links.map((_, i) => i % 2 === 0 ? first : opposite(first))
  return roles.every((role, i) => links[i].includes(role)) ? roles : undefined
}

type LoopPrefix = { first: LinkStrength; last: LinkStrength; discontinuous: boolean }

function loopPrefixes(links: readonly LinkStrength[][]) {
  let prefixes: LoopPrefix[] = links[0].map(first => ({ first, last: first, discontinuous: false }))
  for (const roles of links.slice(1)) {
    const next = new Map<string, LoopPrefix>()
    for (const prefix of prefixes) {
      for (const role of roles) {
        const repeats = role === prefix.last
        if (prefix.discontinuous && repeats) continue
        const candidate = { first: prefix.first, last: role, discontinuous: prefix.discontinuous || repeats }
        next.set(`${candidate.first}:${candidate.last}:${candidate.discontinuous}`, candidate)
      }
    }
    prefixes = [...next.values()]
    if (prefixes.length === 0) break
  }
  return prefixes
}

function commonEliminations(graph: ChainGraph, pairs: readonly ChainEdge[]): DeductionAction[] {
  return graph.candidates
    .filter((target) => pairs.some(([a, b]) => graph.conflicts(target, a) && graph.conflicts(target, b)))
    .map((target) => ({ eliminate: chainCandidate(target) }))
}

function openTitle(graph: ChainGraph, nodes: ChainNode[], strengths: LinkStrength[]) {
  const pattern = strengths.flatMap((strength, i) =>
    strength === 'strong' ? [graph.patternSource(nodes[i], nodes[i + 1])] : [])
  if (pattern.some(source => source?.kind === 'rectangle')) return 'Unique Rectangle AIC'
  if (pattern.some(source => source?.kind === 'firework')) return 'Firework AIC'
  if (nodes.some(isAlsChainNode)) return 'AIC with ALS nodes'
  if (strengths.length === 1) return strengths[0] === 'strong' ? 'Strong link' : 'Weak link'
  if (strengths[0] !== 'strong' || strengths.at(-1) !== 'strong') return nodes.some(node => typeof node === 'string') ? 'Grouped alternating chain' : 'Alternating chain'
  if (nodes.some(node => typeof node === 'string')) return 'Grouped alternating inference chain'
  const candidates = (nodes as number[]).map(chainCandidate)
  const first = candidates[0]
  const last = candidates.at(-1)!
  if (candidates.every(({ digit }) => digit === first.digit)) return 'X-chain'
  if (first.digit === last.digit && strengths.length >= 5 && strengths.every((strength, i) =>
    strength === 'strong' ? candidates[i].cell === candidates[i + 1].cell : candidates[i].digit === candidates[i + 1].digit)) {
    return 'XY-chain'
  }
  if (first.digit === last.digit) return 'Alternating inference chain (Type 1)'
  return first.cell !== last.cell && graph.peers(first.cell, last.cell)
    ? 'Alternating inference chain (Type 2)' : 'Alternating inference chain'
}

function analyzePath(graph: ChainGraph, nodes: ChainNode[]): ChainAnalysis {
  const links = nodes.slice(1).map((node, i) => linkRoles(graph, nodes[i], node))
  const first = nodes[0]
  const last = nodes.at(-1)!
  if (first !== last) {
    const strengths = alternate(links, 'strong') ?? alternate(links, 'weak')
    if (!strengths) {
      return { nodes, strengths: links.map(roles => roles[0]), title: 'Non-alternating chain', actions: [], canComplete: loopPrefixes(links).length > 0 }
    }
    const hasStrongEnds = strengths[0] === 'strong' && strengths.at(-1) === 'strong'
    return {
      nodes, strengths, title: openTitle(graph, nodes, strengths), canComplete: true,
      actions: hasStrongEnds ? commonEliminations(graph, [[first, last]]) : [],
      explanation: hasStrongEnds ? nodes.some(node => typeof node === 'string')
        ? 'A group is true when one of its candidates is true. At least one end must be true. Remove candidates that conflict with every candidate at both ends.'
        : 'At least one end must be true. A candidate that conflicts with both ends can be removed.' : undefined,
    }
  }

  if (links.length % 2 === 0) {
    const strengths = alternate(links, 'strong') ?? alternate(links, 'weak')
    if (strengths) {
      const pairs: ChainEdge[] = strengths.flatMap((strength, i) => strength === 'weak' ? [[nodes[i], nodes[i + 1]]] : [])
      const locked = strengths.flatMap((strength, i) => strength === 'strong' ? graph.lockedAlsTargets(nodes[i], nodes[i + 1]) : [])
      const actions = [...new Map([
        ...commonEliminations(graph, pairs), ...locked.map(target => ({ eliminate: chainCandidate(target) })),
      ].map(action => [techniqueActionKey(action), action])).values()]
      return {
        nodes, strengths, title: nodes.some(node => typeof node === 'string') ? 'Grouped continuous nice loop' : 'Continuous nice loop', loop: 'continuous', canComplete: false,
        explanation: locked.length
          ? 'Each weak link has a true endpoint. The loop also locks the remaining digits in its almost locked sets. Remove candidates that see all possible positions of a locked digit.'
          : nodes.some(node => typeof node === 'string')
          ? 'At least one end of each weak link must be true. Remove candidates that conflict with every candidate at both ends of a weak link.'
          : 'At least one end of each weak link must be true. Remove candidates that conflict with both ends of any weak link.',
        actions,
      }
    }
  } else {
    for (const seam of ['strong', 'weak'] as const) {
      for (let start = 0; start < links.length; start++) {
        const rotated = [...links.slice(start), ...links.slice(0, start)]
        const strengths = alternate(rotated, seam)
        if (!strengths) continue
        const node = nodes[start]
        const group = typeof node === 'string'
        return {
          nodes,
          strengths: [...strengths.slice(strengths.length - start), ...strengths.slice(0, strengths.length - start)],
          title: nodes.some(node => typeof node === 'string') ? 'Grouped discontinuous nice loop' : 'Discontinuous nice loop', loop: 'discontinuous', canComplete: false,
          actions: seam === 'strong'
            ? group ? commonEliminations(graph, [[node, node]]) : [{ place: chainCandidate(node) }]
            : chainNodeCandidates(node).map(candidate => ({ eliminate: candidate })),
          explanation: seam === 'strong'
            ? group ? 'The group where two strong links meet must be true. Remove candidates that conflict with every member of that group.'
              : 'If the candidate where two strong links meet is false, the loop forces it to be true. Place that candidate.'
            : group ? 'The group where two weak links meet must be false. Remove every candidate in that group.'
              : 'If the candidate where two weak links meet is true, the loop forces it to be false. Remove that candidate.',
        }
      }
    }
  }
  return { nodes, strengths: links.map(roles => roles[0]), title: 'Non-alternating loop', actions: [], canComplete: false }
}

export function chainComponents<Node extends ChainNode>(edges: readonly ChainEdge<Node>[]) {
  const neighbors = new Map<Node, Node[]>()
  for (const [a, b] of edges) {
    for (const [from, to] of [[a, b], [b, a]]) {
      const list = neighbors.get(from)
      if (list) list.push(to)
      else neighbors.set(from, [to])
    }
  }

  const components: Node[][] = []
  const visited = new Set<Node>()
  for (const node of neighbors.keys()) {
    if (visited.has(node)) continue
    const component = [node]
    visited.add(node)
    for (const from of component) {
      for (const to of neighbors.get(from)!) {
        if (visited.has(to)) continue
        visited.add(to)
        component.push(to)
      }
    }
    components.push(component)
  }
  return { neighbors, components }
}

/** Check for a three-link weak path or loop that contains the proposed edge. */
export function weakLinkRun(graph: ChainGraph, edges: readonly ChainEdge[]) {
  const { neighbors } = chainComponents(edges.filter(edge => graph.strength(...edge) === 'weak'))
  return ([from, to]: ChainEdge) => {
    if (graph.strength(from, to) !== 'weak') return false
    const before = neighbors.get(from)?.filter(node => node !== to) ?? []
    const after = neighbors.get(to)?.filter(node => node !== from) ?? []
    return (before.length > 0 && after.length > 0) ||
      before.some(node => neighbors.get(node)!.some(other => other !== from)) ||
      after.some(node => neighbors.get(node)!.some(other => other !== to))
  }
}

export function analyzeChains(graph: ChainGraph, edges: readonly ChainEdge[]) {
  const { neighbors, components } = chainComponents(edges.filter(([a, b]) => graph.strength(a, b)))
  const chains: ChainAnalysis[] = []
  for (const component of components) {

    if (component.some((id) => neighbors.get(id)!.length > 2)) {
      chains.push({ nodes: component, strengths: [], title: 'Branched links', actions: [], canComplete: false })
      continue
    }

    const start = component.find((id) => neighbors.get(id)!.length === 1) ?? component[0]
    const path = [start]
    let previous: ChainNode = -1
    let current = start
    while (true) {
      const next = neighbors.get(current)!.find((id) => id !== previous)
      if (next === undefined) break
      path.push(next)
      if (next === start) break
      previous = current
      current = next
    }
    chains.push(analyzePath(graph, path))
  }
  return chains
}

const BRANCH_SEARCH_LIMIT = 12_000

export function analyzeChainPaths(graph: ChainGraph, edges: readonly ChainEdge[]) {
  const links = edges.filter(edge => graph.strength(...edge))
  const { neighbors } = chainComponents(links)
  let visitsLeft = BRANCH_SEARCH_LIMIT
  return analyzeChains(graph, links).flatMap((chain) => {
    const fullPath = chain.strengths.length > 0
    if (fullPath && chain.nodes.length <= 4) return [chain]

    const proofs: ChainAnalysis[] = fullPath ? [chain] : []
    const seen = new Set<string>()
    function proofKey(proof: ChainAnalysis) {
      return `${proof.loop ?? 'aic'}:${proof.actions.map(techniqueActionKey).sort().join(',')}`
    }
    if (fullPath && (chain.loop || chain.actions.length)) seen.add(proofKey(chain))

    function report(path: ChainNode[], loop: boolean) {
      const proof = analyzePath(graph, path)
      if (loop && !proof.loop) return
      const key = proofKey(proof)
      if (seen.has(key)) return
      seen.add(key)
      proofs.push({ ...proof, canComplete: false })
    }

    function walk(path: ChainNode[], used: Set<ChainNode>, next: LinkStrength, startsStrong: boolean) {
      if (visitsLeft-- <= 0) return
      const start = path[0]
      const from = path.at(-1)!
      for (const to of neighbors.get(from)!) {
        if (visitsLeft <= 0) break
        if (!linkRoles(graph, from, to).includes(next)) continue
        if (to === start && path.length >= 3) {
          report([...path, start], true)
        } else if (!used.has(to)) {
          used.add(to)
          path.push(to)
          if (path.length >= 4 && compareNodes(start, to) < 0 && startsStrong && next === 'strong') report([...path], false)
          walk(path, used, opposite(next), startsStrong)
          path.pop()
          used.delete(to)
        }
      }
    }

    for (const start of chain.nodes) {
      if (visitsLeft <= 0) break
      walk([start], new Set([start]), 'strong', true)
      walk([start], new Set([start]), 'weak', false)
    }
    return proofs
  })
}

/** Only strong links carry the two-color relationship between candidates. */
export function colorStrongLinks<Node extends ChainNode>(graph: ChainGraph, edges: readonly ChainEdge<Node>[]) {
  const { neighbors, components } = chainComponents(edges.filter(edge => !edge.some(isAlsChainNode) && graph.strength(...edge) === 'strong' && graph.conflicts(...edge)))
  return components.map((nodes) => {
    const sides = new Map<Node, 0 | 1>([[nodes[0], 0]])
    for (const from of nodes) {
      const opposite = sides.get(from) === 0 ? 1 : 0
      for (const to of neighbors.get(from)!) {
        if (sides.has(to) && sides.get(to) !== opposite) return { nodes, sides: new Map<Node, 0 | 1>() }
        sides.set(to, opposite)
      }
    }
    return { nodes, sides }
  })
}

type MedusaAnalysis = {
  nodes: ChainNode[]
  sides: ReadonlyMap<ChainNode, 0 | 1>
  actions: { eliminate: Candidate }[]
  explanation?: string
  contradictionCell?: number
}

export function analyzeMedusa(graph: ChainGraph, edges: readonly ChainEdge[]): MedusaAnalysis[] {
  return colorStrongLinks(graph, edges).map(({ nodes, sides }) => {
    if (!sides.size) {
      return { nodes, sides, actions: [],
        explanation: 'This loop cannot alternate two colors. Remove a link to color it.' }
    }

    const colors = [nodes.filter((node) => sides.get(node) === 0), nodes.filter((node) => sides.get(node) === 1)]
    const excluded = colors.map((members) =>
      new Set(graph.candidates.filter((target) => members.some((node) => graph.conflicts(target, node)))))
    const contradictions = colors.map<{ explanation: string; cell?: number } | undefined>((members, side) => {
      const color = side === 0 ? 'A' : 'B'
      const conflict = { explanation: `Color ${color} leads to a conflict, so remove its candidates.` }
      const isExcluded = (node: number) => excluded[side].has(node)
      if (members.some(node => chainNodeCandidates(node).every(candidate => isExcluded(candidateId(candidate))))) return conflict
      const cell = graph.cellCandidates.findIndex((group) => group.length > 1 && group.every(isExcluded))
      if (cell !== -1) {
        return { cell, explanation: members.some(node => typeof node === 'string')
          ? `If color ${color} is true, each group has one true candidate. This leaves ${cellReference(cell, 'concise')} with no digit. Remove every candidate of that color.`
          : `Placing the candidates of color ${color} leaves ${cellReference(cell, 'concise')} with no digit. Remove that color throughout this connected set.` }
      }
      if (graph.constraints.some((group) => group.every(isExcluded))) return conflict
    })
    if (contradictions.every(Boolean)) {
      return { nodes, sides, actions: [], explanation: 'Both colors lead to a conflict. Review the candidates and links.' }
    }
    const falseSide = contradictions.findIndex(Boolean)
    const removals = falseSide === -1
      ? graph.candidates.filter((node) => !sides.has(node) && excluded.every((group) => group.has(node)))
      : [...new Set(colors[falseSide].flatMap(node => chainNodeCandidates(node).map(candidateId)))]
    const contradiction = contradictions[falseSide]
    const explanation = contradiction?.explanation ?? (removals.length ? 'Remove candidates that conflict with both colors.' : undefined)
    return { nodes, sides, actions: removals.map((node) => ({ eliminate: chainCandidate(node) })),
      explanation, contradictionCell: contradiction?.cell }
  })
}

export function completeMedusa(graph: ChainGraph, edges: readonly ChainEdge[], start: ChainNode, groups: readonly ChainNode[] = []): ChainEdge[] {
  if (isAlsChainNode(start)) return []
  const { neighbors } = chainComponents(edges.filter(edge => !edge.some(isAlsChainNode) &&
    graph.strength(...edge) === 'strong' && graph.conflicts(...edge)))
  const reached = new Set<ChainNode>()
  const queue: ChainNode[] = []
  const additions: ChainEdge[] = []

  // Include branches already drawn before looking for a new strong link.
  function includeDrawnBranch(node: ChainNode) {
    const from = queue.length
    reached.add(node)
    queue.push(node)
    for (let i = from; i < queue.length; i++) {
      for (const next of neighbors.get(queue[i]) ?? []) {
        if (reached.has(next)) continue
        reached.add(next)
        queue.push(next)
      }
    }
  }

  const availableNodes: ChainNode[] = [...graph.candidates, ...groups.filter(group => graph.available(group))]
  includeDrawnBranch(start)
  for (const from of queue) {
    for (const to of availableNodes) {
      if (reached.has(to) || isAlsChainNode(to) || graph.strength(from, to) !== 'strong' || !graph.conflicts(from, to)) continue
      additions.push([from, to])
      includeDrawnBranch(to)
    }
  }
  return additions
}

export function chainExtensionStrength(graph: ChainGraph, edges: readonly ChainEdge[], extension: ChainEdge): LinkStrength | undefined {
  const strength = graph.strength(...extension)
  if (!strength || edges.some((edge) => sameEdge(edge, extension))) return
  if (edges.length === 0) return strength

  const chain = analyzeChains(graph, [...edges, extension]).find(({ nodes }) => nodes.includes(extension[0]))
  if (!chain) return
  if (!chain.strengths.length) return strength
  if (!chain.canComplete && !chain.loop) return
  const index = chain.strengths.findIndex((_, i) => sameEdge([chain.nodes[i], chain.nodes[i + 1]], extension))
  return chain.strengths[index]
}

type LoopSearch = { status: 'found'; edges: ChainEdge[] } | { status: 'exhausted' | 'limited' }
const LOOP_SEARCH_LIMIT = 12_000

export function completeChainLoop(graph: ChainGraph, path: readonly ChainNode[], excluded: ReadonlySet<ChainNode> = new Set(),
  groups: readonly ChainNode[] = []): LoopSearch {
  if (path.length < 2 || new Set(path).size !== path.length) return { status: 'exhausted' }
  const links = path.slice(1).map((node, i) => linkRoles(graph, path[i], node))
  if (!links.every(link => link.length)) return { status: 'exhausted' }
  const start = path[0]
  const end = path.at(-1)!
  const used = new Set(path)
  const extensions = [...new Set([
    ...graph.candidates, ...groups, ...graph.houseGroups(), ...graph.patternLinks().keys(),
    ...[...graph.alsNodes.values()].flatMap(ports => [...ports.values()]),
  ])].filter(node => !used.has(node) && !excluded.has(node) && graph.available(node))
  const queue: { nodes: ChainNode[]; next: LinkStrength; first: LinkStrength; discontinuous: boolean }[] = []
  for (const { first, last, discontinuous } of loopPrefixes(links)) {
    queue.push({ nodes: [end], next: opposite(last), first, discontinuous })
    if (!discontinuous) queue.push({ nodes: [end], next: last, first, discontinuous: true })
  }

  const neighbors = new Map<string, ChainNode[]>()
  let limited = false
  for (const { nodes, next, first, discontinuous } of queue) {
    const from = nodes.at(-1)!
    if (path.length + nodes.length > 3 && linkRoles(graph, from, start).includes(next) &&
      (!discontinuous || next !== first)) {
      const closed = [...nodes, start]
      return { status: 'found', edges: closed.slice(1).map((node, i) => [closed[i], node]) }
    }

    const key = `${from}:${next}`
    let choices = neighbors.get(key)
    if (!choices) {
      choices = extensions.filter(to => linkRoles(graph, from, to).includes(next))
      neighbors.set(key, choices)
    }
    for (const to of choices) {
      if (nodes.includes(to)) continue
      if (queue.length >= LOOP_SEARCH_LIMIT) {
        limited = true
        break
      }
      queue.push({ nodes: [...nodes, to], next: opposite(next), first, discontinuous })
    }
  }
  return { status: limited ? 'limited' : 'exhausted' }
}
