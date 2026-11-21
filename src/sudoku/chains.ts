import type { Candidate, DeductionAction, VariantPuzzle } from './engine.ts'
import { candidateCount, hasCandidate, marksOf, peer } from './game.ts'
import { cellReference } from './hints.ts'
import { techniqueActionKey } from './technique-progress.ts'
import { regionMembership, variantHouseCells } from './variants.ts'

export type ChainEdge = readonly [from: number, to: number]
export type LinkStrength = 'strong' | 'weak'

export type ChainAnalysis = {
  nodes: number[]
  strengths: LinkStrength[]
  title: string
  actions: DeductionAction[]
  explanation?: string
  loop?: 'continuous' | 'discontinuous'
  canComplete: boolean
}

export const candidateId = ({ cell, digit }: Candidate) => cell * 9 + digit - 1
export const chainCandidate = (id: number): Candidate => ({ cell: Math.floor(id / 9), digit: id % 9 + 1 })

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

export function makeChainGraph(masks: readonly number[], puzzle?: VariantPuzzle) {
  const cellCandidates = masks.map((mask, cell) => marksOf(mask).map((digit) => candidateId({ cell, digit })))
  const candidates = cellCandidates.flat()
  const houseCandidates = Array.from({ length: 27 }, () => Array.from({ length: 9 }, () => [] as number[]))
  const regions = puzzle?.regions && puzzle.regions.type !== 'boxes' ? regionMembership(puzzle.regions.regions) : undefined
  const houses = masks.map((_, cell) => housesAt(cell, regions))
  for (const rule of puzzle?.rules ?? []) {
    if (rule.type !== 'diagonal' && rule.type !== 'extra-house') continue
    const cells = rule.type === 'extra-house' ? rule.cells : variantHouseCells({ diagonal: rule.diagonal }, puzzle!)
    const house = houseCandidates.push(Array.from({ length: 9 }, () => [])) - 1
    for (const cell of cells) houses[cell].push(house)
  }
  for (const id of candidates) {
    const { cell, digit } = chainCandidate(id)
    for (const house of houses[cell]) houseCandidates[house][digit - 1].push(id)
  }
  const constraints = [...houseCandidates.flat(), ...cellCandidates].filter((group) => group.length > 1)

  function peers(a: number, b: number) { return peer(a, b, puzzle) }

  function conflicts(a: number, b: number) {
    if (a === b) return false
    const first = chainCandidate(a)
    const second = chainCandidate(b)
    return first.cell === second.cell || (first.digit === second.digit && peers(first.cell, second.cell))
  }

  function strength(a: number, b: number): LinkStrength | undefined {
    if (!conflicts(a, b)) return
    const first = chainCandidate(a)
    const second = chainCandidate(b)
    if (!hasCandidate(masks[first.cell], first.digit) || !hasCandidate(masks[second.cell], second.digit)) return
    if (first.cell === second.cell) return candidateCount(masks[first.cell]) === 2 ? 'strong' : 'weak'
    return houses[first.cell].some((house) => houses[second.cell].includes(house) && houseCandidates[house][first.digit - 1].length === 2)
      ? 'strong' : 'weak'
  }

  return { candidates, cellCandidates, peers, conflicts, strength, constraints }
}

export type ChainGraph = ReturnType<typeof makeChainGraph>

export function highlightedStrongLinks(graph: ChainGraph, digitMask: number): ChainEdge[] {
  if (!digitMask) return []
  const seen = new Set<string>()
  const links: ChainEdge[] = []
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

function alternate(links: readonly LinkStrength[], first: LinkStrength) {
  const roles = links.map((_, i) => i % 2 === 0 ? first : opposite(first))
  return roles.every((role, i) => role === 'weak' || links[i] === 'strong') ? roles : undefined
}

type LoopPrefix = { first: LinkStrength; last: LinkStrength; discontinuous: boolean }

function loopPrefixes(links: readonly LinkStrength[]) {
  let prefixes: LoopPrefix[] = [{ first: 'weak', last: 'weak', discontinuous: false }]
  if (links[0] === 'strong') prefixes.push({ first: 'strong', last: 'strong', discontinuous: false })
  for (const strength of links.slice(1)) {
    const next = new Map<string, LoopPrefix>()
    const roles: LinkStrength[] = strength === 'strong' ? ['strong', 'weak'] : ['weak']
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

function openTitle(graph: ChainGraph, nodes: number[], strengths: LinkStrength[]) {
  if (strengths.length === 1) return strengths[0] === 'strong' ? 'Strong link' : 'Weak link'
  if (strengths[0] !== 'strong' || strengths.at(-1) !== 'strong') return 'Alternating chain'
  const candidates = nodes.map(chainCandidate)
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

function analyzePath(graph: ChainGraph, nodes: number[]): ChainAnalysis {
  const links = nodes.slice(1).map((node, i) => graph.strength(nodes[i], node)!)
  const first = nodes[0]
  const last = nodes.at(-1)!
  if (first !== last) {
    const strengths = alternate(links, 'strong') ?? alternate(links, 'weak')
    if (!strengths) {
      return { nodes, strengths: links, title: 'Non-alternating chain', actions: [], canComplete: loopPrefixes(links).length > 0 }
    }
    const hasStrongEnds = strengths[0] === 'strong' && strengths.at(-1) === 'strong'
    return {
      nodes, strengths, title: openTitle(graph, nodes, strengths), canComplete: true,
      actions: hasStrongEnds ? commonEliminations(graph, [[first, last]]) : [],
      explanation: hasStrongEnds ? 'At least one end must be true. A candidate that conflicts with both ends can be removed.' : undefined,
    }
  }

  if (links.length % 2 === 0) {
    const strengths = alternate(links, 'strong') ?? alternate(links, 'weak')
    if (strengths) {
      const pairs: ChainEdge[] = strengths.flatMap((strength, i) => strength === 'weak' ? [[nodes[i], nodes[i + 1]]] : [])
      return {
        nodes, strengths, title: 'Continuous nice loop', loop: 'continuous', canComplete: false,
        explanation: 'At least one end of each weak link must be true. Remove candidates that conflict with both ends of any weak link.',
        actions: commonEliminations(graph, pairs),
      }
    }
  } else {
    for (const seam of ['strong', 'weak'] as const) {
      for (let start = 0; start < links.length; start++) {
        const rotated = [...links.slice(start), ...links.slice(0, start)]
        const strengths = alternate(rotated, seam)
        if (!strengths) continue
        const candidate = chainCandidate(nodes[start])
        return {
          nodes,
          strengths: [...strengths.slice(strengths.length - start), ...strengths.slice(0, strengths.length - start)],
          title: 'Discontinuous nice loop', loop: 'discontinuous', canComplete: false,
          actions: [seam === 'strong' ? { place: candidate } : { eliminate: candidate }],
          explanation: seam === 'strong'
            ? 'Ruling out the candidate where two strong links meet would force that candidate to be true.'
            : 'Placing the candidate where two weak links meet would force that candidate to be false.',
        }
      }
    }
  }
  return { nodes, strengths: links, title: 'Non-alternating loop', actions: [], canComplete: false }
}

export function chainComponents(edges: readonly ChainEdge[]) {
  const neighbors = new Map<number, number[]>()
  for (const [a, b] of edges) {
    for (const [from, to] of [[a, b], [b, a]]) {
      const list = neighbors.get(from)
      if (list) list.push(to)
      else neighbors.set(from, [to])
    }
  }

  const components: number[][] = []
  const visited = new Set<number>()
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
    let previous = -1
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

    function report(path: number[], loop: boolean) {
      const proof = analyzePath(graph, path)
      if (loop && !proof.loop) return
      const key = proofKey(proof)
      if (seen.has(key)) return
      seen.add(key)
      proofs.push({ ...proof, canComplete: false })
    }

    function walk(path: number[], used: Set<number>, next: LinkStrength, startsStrong: boolean) {
      if (visitsLeft-- <= 0) return
      const start = path[0]
      const from = path.at(-1)!
      for (const to of neighbors.get(from)!) {
        if (visitsLeft <= 0) break
        const strength = graph.strength(from, to)
        if (next === 'strong' && strength !== 'strong') continue
        if (to === start && path.length >= 3) {
          report([...path, start], true)
        } else if (!used.has(to)) {
          used.add(to)
          path.push(to)
          if (path.length >= 4 && start < to && startsStrong && next === 'strong') report([...path], false)
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
export function colorStrongLinks(graph: ChainGraph, edges: readonly ChainEdge[]) {
  const { neighbors, components } = chainComponents(edges.filter(edge => graph.strength(...edge) === 'strong'))
  return components.map((nodes) => {
    const sides = new Map<number, 0 | 1>([[nodes[0], 0]])
    for (const from of nodes) {
      const opposite = sides.get(from) === 0 ? 1 : 0
      for (const to of neighbors.get(from)!) {
        if (sides.has(to) && sides.get(to) !== opposite) return { nodes, sides: new Map<number, 0 | 1>() }
        sides.set(to, opposite)
      }
    }
    return { nodes, sides }
  })
}

type MedusaAnalysis = {
  nodes: number[]
  sides: ReadonlyMap<number, 0 | 1>
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
      if (members.some(isExcluded)) return conflict
      const cell = graph.cellCandidates.findIndex((group) => group.length > 1 && group.every(isExcluded))
      if (cell !== -1) {
        return { cell, explanation: `Placing the candidates of color ${color} leaves ${cellReference(cell, 'concise')} with no digit. Remove that color throughout this connected set.` }
      }
      if (graph.constraints.some((group) => group.every(isExcluded))) return conflict
    })
    if (contradictions.every(Boolean)) {
      return { nodes, sides, actions: [], explanation: 'Both colors lead to a conflict. Review the candidates and links.' }
    }
    const falseSide = contradictions.findIndex(Boolean)
    const removals = falseSide === -1
      ? graph.candidates.filter((node) => !sides.has(node) && excluded.every((group) => group.has(node)))
      : colors[falseSide]
    const contradiction = contradictions[falseSide]
    const explanation = contradiction?.explanation ?? (removals.length ? 'Remove candidates that conflict with both colors.' : undefined)
    return { nodes, sides, actions: removals.map((node) => ({ eliminate: chainCandidate(node) })),
      explanation, contradictionCell: contradiction?.cell }
  })
}

export function completeMedusa(graph: ChainGraph, edges: readonly ChainEdge[], start: number): ChainEdge[] {
  const { neighbors } = chainComponents(edges.filter(([a, b]) => graph.strength(a, b) === 'strong'))
  const reached = new Set<number>()
  const queue: number[] = []
  const additions: ChainEdge[] = []

  // Include branches already drawn before looking for a new strong link.
  function includeDrawnBranch(node: number) {
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

  includeDrawnBranch(start)
  for (const from of queue) {
    for (const to of graph.candidates) {
      if (reached.has(to) || graph.strength(from, to) !== 'strong') continue
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

export function completeChainLoop(graph: ChainGraph, path: readonly number[], excluded: ReadonlySet<number> = new Set()): LoopSearch {
  if (path.length < 2 || new Set(path).size !== path.length) return { status: 'exhausted' }
  const links = path.slice(1).map((node, i) => graph.strength(path[i], node))
  if (!links.every((link) => link !== undefined)) return { status: 'exhausted' }
  const start = path[0]
  const end = path.at(-1)!
  const used = new Set(path)
  const extensions = graph.candidates.filter((node) => !used.has(node) && !excluded.has(node))
  const queue: { nodes: number[]; next: LinkStrength; first: LinkStrength; discontinuous: boolean }[] = []
  for (const { first, last, discontinuous } of loopPrefixes(links)) {
    queue.push({ nodes: [end], next: opposite(last), first, discontinuous })
    if (!discontinuous) queue.push({ nodes: [end], next: last, first, discontinuous: true })
  }

  const neighbors = new Map<number, number[]>()
  let limited = false
  for (const { nodes, next, first, discontinuous } of queue) {
    const from = nodes.at(-1)!
    const closing = graph.strength(from, start)
    if (path.length + nodes.length > 3 && closing && (next === 'weak' || closing === 'strong') &&
      (!discontinuous || next !== first)) {
      const closed = [...nodes, start]
      return { status: 'found', edges: closed.slice(1).map((node, i) => [closed[i], node]) }
    }

    const key = from * 2 + Number(next === 'strong')
    let choices = neighbors.get(key)
    if (!choices) {
      choices = extensions.filter((to) => {
        const strength = graph.strength(from, to)
        return strength && (next === 'weak' || strength === 'strong')
      })
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
