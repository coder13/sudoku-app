import { chainAlsId, chainCandidate, candidateId, chainNodeCandidates, chainPoint, isAlsChainNode, sameEdge, type ChainEdge, type ChainNode } from '../../sudoku/chains'
import { almostLockedSetColor } from '../../sudoku/als-highlighting'
import { chainColor, type ChainColorPair } from '../../sudoku/chain-sketch'
import { nextChainColorPair, type AnalyzedChainSketch, type ChainProof } from '../../sudoku/chain-sketch-analysis'
import type { BoardAnnotations, BoardGroup, BoardLink, CandidateAnnotation, CellAnnotation } from '../BoardAnnotations'
import type { SubsetDescription } from '../../sudoku/subsets'

type Options = {
  sketches: readonly AnalyzedChainSketch[]
  activeId: number
  activeHidden: boolean
  activeAnalysis?: AnalyzedChainSketch
  canAnalyze: boolean
  pending: ChainNode | null
  colorPairs: readonly ChainColorPair[]
  previewedProof: ChainProof | null
  showEliminations: boolean
  grouping: boolean
  groupSelection: readonly number[] | null
  hoveredNotation: { sketchId: number; pathIndex: number; kind: 'node' | 'edge'; index: number } | null
  sets: readonly SubsetDescription[]
}

type ChainColorAssignment = { pair: ChainColorPair; side: 0 | 1 }
type Coloring = Map<ChainNode, ChainColorAssignment>

/** Project analyzed chain sketches into the annotations and assigned colors rendered on the board. */
export function buildChainSketchAnnotations({
  sketches, activeId, activeHidden, activeAnalysis, canAnalyze, pending, colorPairs,
  previewedProof, showEliminations, grouping, groupSelection, hoveredNotation, sets,
}: Options) {
  const cells = new Map<number, CellAnnotation>()
  const setsById = new Map(sets.map(set => [set.id, set]))
  const candidateMarks = new Map<number, Map<number, CandidateAnnotation>>()
  const assigned = new Map<number, ChainColorAssignment>()
  const links: BoardLink[] = []
  const groupMarks: BoardGroup[] = []
  const activeProofs = canAnalyze && activeAnalysis && !activeHidden ? [...activeAnalysis.chains, ...activeAnalysis.medusas] : []
  const proof = previewedProof && activeProofs.some(item => item === previewedProof) &&
    (showEliminations || !previewedProof.actions.some(action => 'eliminate' in action)) ? previewedProof : null
  const proofNodes = new Set(proof?.nodes)
  const proofEdges: ChainEdge[] = proof?.strengths ? proof.nodes.slice(1).map((to, i) => [proof.nodes[i], to]) : []
  for (const action of proof?.actions ?? []) proofNodes.add(candidateId('place' in action ? action.place : action.eliminate))

  function mark(node: ChainNode | number, annotation: CandidateAnnotation, preview = false) {
    const candidates = typeof node === 'number' ? [chainCandidate(node)] : chainNodeCandidates(node)
    for (const { cell, digit } of candidates) {
      const row = candidateMarks.get(cell) ?? new Map()
      row.set(digit, preview && proof && !proofNodes.has(node) ? { ...annotation, opacity: 0.5 } : annotation)
      candidateMarks.set(cell, row)
    }
  }

  const visible = sketches.filter(sketch => !sketch.hidden || sketch.id === hoveredNotation?.sketchId)
  const { usedPairs, nextPair } = nextChainColorPair(colorPairs, visible)
  const neutral = 'var(--chain-neutral)'
  const colorings = new Map<number, Coloring>(visible.map(sketch => {
    const sides = new Map(sketch.medusas.flatMap(item => [...item.sides]))
    const coloring: Coloring = new Map()
    let useSketchPair = true
    for (const nodes of sketch.components) {
      const coloredNodes = nodes.filter(node => sides.has(node))
      if (!coloredNodes.length) continue
      const pair: ChainColorPair = useSketchPair ? [sketch.color, sketch.secondColor] : nextPair()
      if (!useSketchPair) usedPairs.push(pair)
      useSketchPair = false
      for (const node of coloredNodes) coloring.set(node, { pair, side: sides.get(node)! })
    }
    return [sketch.id, coloring]
  }))

  // Draw the active sketch last so its marks take priority at shared candidates.
  const ordered = [...visible.filter(({ id }) => id !== activeId), ...visible.filter(({ id }) => id === activeId)]
  for (const sketch of ordered) {
    const coloring = colorings.get(sketch.id)!
    for (const [pathIndex, { nodes, strengths }] of sketch.paths.entries()) {
      strengths.forEach((strength, i) => {
        const color = coloring.get(nodes[i])
        const from = nodes[i]
        const to = nodes[i + 1]
        const inProof = proof?.strengths ? proofEdges.some(edge => sameEdge(edge, [from, to]))
          : strength === 'strong' && proofNodes.has(from) && proofNodes.has(to)
        const notationFocus = hoveredNotation?.sketchId === sketch.id ? hoveredNotation : null
        const focused = notationFocus?.kind === 'edge' && notationFocus.pathIndex === pathIndex && notationFocus.index === i
        const opacity = proof && sketch.id === activeId && !inProof && !focused ? 0.5 : 1
        links.push({ from: chainPoint(from), to: chainPoint(to), dashed: strength === 'weak', opacity, emphasized: focused,
          hideGroupOutlines: isAlsChainNode(from) || isAlsChainNode(to),
          color: strength === 'strong' && color ? chainColor(color.pair[0]) : neutral })
      })
    }

    const notationFocus = hoveredNotation?.sketchId === sketch.id ? hoveredNotation : null
    const focusedNode = notationFocus?.kind === 'node'
      ? sketch.paths[notationFocus.pathIndex]?.nodes[notationFocus.index] : undefined
    for (const node of sketch.components.flat()) {
      const color = coloring.get(node)
      const focused = node === focusedNode
      if (isAlsChainNode(node)) {
        const set = setsById.get(chainAlsId(node))
        if (set) {
          const marker = { color: almostLockedSetColor(set.id - 1), label: `Set ${set.number}` }
          for (const cell of set.cells) {
            const current = cells.get(cell)
            const setMarkers = current?.setMarkers ?? []
            cells.set(cell, { ...current, referenceHighlight: focused || current?.referenceHighlight,
              setMarkers: setMarkers.some(({ label }) => label === marker.label) ? setMarkers : [...setMarkers, marker] })
          }
        }
      } else if (typeof node === 'string') groupMarks.push({ point: chainPoint(node), emphasized: focused,
        color: color ? chainColor(color.pair[color.side]) : neutral,
        opacity: proof && sketch.id === activeId && !proofNodes.has(node) && !focused ? 0.5 : undefined, label: 'Candidate group' })
      if (color) {
        for (const candidate of chainNodeCandidates(node)) assigned.set(candidateId(candidate), color)
        mark(node, { color: chainColor(color.pair[color.side]),
          emphasized: focused, mark: 'emphasized', label: focused ? 'Highlighted chain node' : `${typeof node === 'string' ? 'Group' : 'Chain'} color ${color.side === 0 ? 'A' : 'B'}` }, sketch.id === activeId)
      } else {
        for (const candidate of chainNodeCandidates(node)) assigned.delete(candidateId(candidate))
        mark(node, { color: neutral, emphasized: focused, mark: 'emphasized',
          label: focused ? 'Highlighted chain node' : typeof node === 'string' ? 'Linked candidate group' : 'Linked candidate' }, sketch.id === activeId)
      }
    }
  }

  const visibleActive = canAnalyze && !activeHidden ? activeAnalysis : undefined
  for (const { contradictionCell } of showEliminations ? visibleActive?.medusas ?? [] : []) {
    if (contradictionCell === undefined) continue
    cells.set(contradictionCell, {
      ...cells.get(contradictionCell),
      fill: 'color-mix(in srgb, var(--chain-removal) 22%, var(--candidate-match-surface, var(--board-bg)))',
      label: 'Would have no candidates if the crossed-out color were true',
    })
  }
  const removals = new Set(showEliminations
    ? activeProofs.flatMap(({ actions }) => actions.flatMap(action =>
      'eliminate' in action ? [candidateId(action.eliminate)] : []))
    : [])
  for (const id of removals) {
    const { cell, digit } = chainCandidate(id)
    const colored = candidateMarks.get(cell)?.get(digit)
    mark(id, colored?.mark === 'emphasized'
      ? { ...colored, strike: true, label: [colored.label, 'can be removed'].filter(Boolean).join(', ') }
      : { color: 'var(--chain-removal)', mark: 'strike', label: 'can be removed' }, true)
  }
  for (const { actions } of activeProofs) {
    for (const action of actions) {
      if (!('place' in action) || removals.has(candidateId(action.place))) continue
      const { cell, digit } = action.place
      const colored = candidateMarks.get(cell)?.get(digit)
      mark(candidateId(action.place), { color: colored?.color ?? 'var(--chain-placement)',
        mark: colored?.mark ?? 'ring', label: [colored?.label, 'forced placement'].filter(Boolean).join(', ') }, true)
    }
  }
  if (!activeHidden && pending !== null) {
    if (typeof pending === 'string' && !isAlsChainNode(pending)) groupMarks.push({ point: chainPoint(pending), color: neutral, label: 'Group selected for linking' })
    for (const candidate of chainNodeCandidates(pending)) {
      if (!candidateMarks.get(candidate.cell)?.has(candidate.digit)) {
        mark(candidateId(candidate), { color: neutral, mark: 'emphasized', label: typeof pending === 'string' ? 'Group selected for linking' : 'Selected for linking' })
      }
    }
  }
  if (grouping && groupSelection) {
    for (const node of groupSelection) mark(node, { color: 'var(--chain-placement)', mark: 'ring', label: 'Selected group member' })
    groupMarks.push({ point: { candidates: groupSelection.map(chainCandidate) }, color: 'var(--chain-placement)', label: 'Selected group members' })
  }

  const annotations: BoardAnnotations = { cells, candidates: candidateMarks, links, groups: groupMarks }
  return { annotations, assigned, usedPairs }
}
