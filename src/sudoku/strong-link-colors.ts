import { chainCandidate, makeChainGraph } from './chains.ts'
import type { Candidate, VariantPuzzle } from './engine.ts'
import { alternateColorShade, COLOR_FAMILIES, DIGITS } from './game.ts'

export type StrongLinkGroup = {
  sides: [Candidate[], Candidate[]]
  links: number
}

export function findStrongLinkGroups(masks: readonly number[], digit: number, puzzle?: VariantPuzzle) {
  const groups: StrongLinkGroup[] = []
  if (masks.length !== 81 || !DIGITS.includes(digit)) return { groups, conflictingGroups: 0 }
  const graph = makeChainGraph(masks, puzzle)
  const nodes = graph.candidates.filter((node) => chainCandidate(node).digit === digit)
  const neighbors = new Map<number, number[]>()
  for (let i = 0; i < nodes.length; i++) {
    for (const other of nodes.slice(i + 1)) {
      const node = nodes[i]
      if (graph.strength(node, other) !== 'strong') continue
      neighbors.set(node, [...neighbors.get(node) ?? [], other])
      neighbors.set(other, [...neighbors.get(other) ?? [], node])
    }
  }

  const visited = new Set<number>()
  let conflictingGroups = 0
  for (const root of neighbors.keys()) {
    if (visited.has(root)) continue
    const queue = [root]
    const sides = new Map<number, 0 | 1>([[root, 0]])
    let conflict = false
    let links = 0
    for (const node of queue) {
      visited.add(node)
      const side = sides.get(node)!
      for (const neighbor of neighbors.get(node)!) {
        links++
        if (sides.has(neighbor)) {
          if (sides.get(neighbor) === side) conflict = true
        } else {
          sides.set(neighbor, side === 0 ? 1 : 0)
          queue.push(neighbor)
        }
      }
    }
    if (conflict) { conflictingGroups++; continue }
    const group: StrongLinkGroup = { sides: [[], []], links: links / 2 }
    for (const [node, side] of sides) group.sides[side].push(chainCandidate(node))
    groups.push(group)
  }
  return { groups, conflictingGroups }
}

export function strongLinkColorMarks(groups: readonly StrongLinkGroup[], firstColor: number) {
  if (alternateColorShade(firstColor) === null || groups.length > COLOR_FAMILIES.length) return []
  const firstFamily = (firstColor - 1) % COLOR_FAMILIES.length
  const darkFirst = firstColor > COLOR_FAMILIES.length
  return groups.flatMap(({ sides }, index) => {
    const light = (firstFamily + index) % COLOR_FAMILIES.length + 1
    const dark = alternateColorShade(light)!
    return sides.flatMap((candidates, side) => candidates.map((candidate) => ({
      ...candidate, color: (side === 0) !== darkFirst ? light : dark,
    })))
  })
}
