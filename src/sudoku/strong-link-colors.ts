import { candidateId, chainCandidate, makeChainGraph } from './chains.ts'
import type { Candidate, VariantPuzzle } from './engine.ts'
import { alternateColorShade, DIGITS, hasCandidate, type ColorTarget, type Position } from './game.ts'

export type ColorContinuation = {
  status: 'ready' | 'complete' | 'uncolored' | 'missing-candidate' | 'no-links' | 'link-conflict' | 'color-conflict'
  marks: (Candidate & { color: number })[]
  conflicts: Candidate[]
}

export function continueStrongLinkColors(
  masks: readonly number[], start: Candidate, position: Position, target: ColorTarget, puzzle?: VariantPuzzle,
): ColorContinuation {
  const blocked = (status: ColorContinuation['status'], conflicts: Candidate[] = []): ColorContinuation => ({
    status, marks: [], conflicts,
  })
  if (masks.length !== 81 || !Number.isInteger(start.cell) || start.cell < 0 || start.cell >= 81 ||
    !DIGITS.includes(start.digit) || !hasCandidate(masks[start.cell], start.digit)) return blocked('missing-candidate')

  const colorAt = ({ cell, digit }: Candidate) => target === 'cell'
    ? position.colors[cell] : position.candidateColors?.[cell]?.[digit] ?? 0
  const firstColor = colorAt(start)
  const otherColor = alternateColorShade(firstColor)
  if (otherColor === null) return blocked('uncolored')

  const graph = makeChainGraph(masks, puzzle)
  const nodes = graph.candidates.filter((node) => chainCandidate(node).digit === start.digit)
  const root = candidateId(start)
  const queue = [root]
  const colors = new Map([[root, firstColor]])
  for (const node of queue) {
    const nextColor = colors.get(node) === firstColor ? otherColor : firstColor
    for (const neighbor of nodes) {
      if (graph.strength(node, neighbor) !== 'strong') continue
      if (colors.has(neighbor)) {
        if (colors.get(neighbor) !== nextColor) return blocked('link-conflict')
      } else {
        colors.set(neighbor, nextColor)
        queue.push(neighbor)
      }
    }
  }
  if (colors.size === 1) return blocked('no-links')

  const marks: ColorContinuation['marks'] = []
  const conflicts: Candidate[] = []
  for (const [node, color] of colors) {
    const candidate = chainCandidate(node)
    const existing = colorAt(candidate)
    if (!existing) marks.push({ ...candidate, color })
    else if (existing !== color) conflicts.push(candidate)
  }
  // Never partially fill a group whose existing marks disagree with the starting mark.
  if (conflicts.length) return blocked('color-conflict', conflicts)
  return { status: marks.length ? 'ready' : 'complete', marks, conflicts }
}
