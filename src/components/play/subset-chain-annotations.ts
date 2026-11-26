import { almostLockedSetColor } from '../../sudoku/als-highlighting'
import type { AnalyzedChainSketch } from '../../sudoku/chain-sketch-analysis'
import { chainColor, CHAIN_COLOR_PAIRS, type ChainColorPair } from '../../sudoku/chain-sketch'
import { chainNodeCandidates, chainPoint } from '../../sudoku/chains'
import { alsChainAssumption, alsChainCandidateStates, subsetOccurrences, type SubsetProofAnalysis } from '../../sudoku/subset-proofs'
import { subsetDigits, subsetProofSets, type SubsetContext, type SubsetDescription, type SubsetProof } from '../../sudoku/subsets'
import { mergeBoardAnnotations, type BoardAnnotations, type BoardLink, type CandidateAnnotation, type CellAnnotation } from '../BoardAnnotations'

type Part = { set: number } | { link: number } | { stem: true } | { node: number } | { edge: number }
export type SubsetChainFocus = { sketchId: number; part: Part }

export function buildSubsetProofAnnotations(proof: SubsetProof, analysis: SubsetProofAnalysis, sets: ReadonlyMap<number, SubsetDescription>,
  masks: readonly number[], showEliminations: boolean, focus?: Part, colors: ChainColorPair = CHAIN_COLOR_PAIRS[0]): BoardAnnotations {
  const cells = new Map<number, CellAnnotation>()
  const candidates = new Map<number, Map<number, CandidateAnnotation>>()
  const links: BoardLink[] = []
  const restricted = 'var(--lesson-accent)'
  const assumption = alsChainAssumption(proof, analysis, showEliminations)

  function mark(cell: number, digit: number, annotation: CandidateAnnotation) {
    const marks = candidates.get(cell) ?? new Map()
    const previous = marks.get(digit)
    marks.set(digit, { ...annotation, referenceHighlight: annotation.referenceHighlight || previous?.referenceHighlight })
    candidates.set(cell, marks)
  }

  for (const id of new Set(subsetProofSets(proof))) {
    const set = sets.get(id)
    if (!set) continue
    const color = almostLockedSetColor(set.id - 1)
    for (const cell of set.cells) {
      const previous = cells.get(cell)
      const name = `Set ${set.number}`
      cells.set(cell, {
        setMarkers: [...(previous?.setMarkers ?? []), { color, label: name }],
        referenceHighlight: (focus && 'set' in focus && focus.set === id) || previous?.referenceHighlight,
      })
    }
  }

  if (proof.kind === 'blossom') {
    cells.set(proof.stem, { fill: 'var(--lesson-pivot-fill)', label: 'Stem', referenceHighlight: focus && 'stem' in focus })
  }
  if (proof.kind === 'endpoint' && analysis.links.length) {
    for (const [index, node] of proof.path.entries()) {
      const emphasized = focus && 'node' in focus && focus.node === index
      for (const { cell, digit } of chainNodeCandidates(node)) {
        mark(cell, digit, { color: 'var(--chain-neutral)', mark: 'emphasized', referenceHighlight: emphasized, label: 'Linked candidate' })
      }
      if (index > 0) links.push({
        from: chainPoint(proof.path[index - 1]), to: chainPoint(node), color: 'var(--chain-neutral)',
        dashed: index % 2 === 0, emphasized: focus && 'edge' in focus && focus.edge === index - 1,
      })
    }
  }
  if (assumption && proof.kind === 'path') {
    const states = alsChainCandidateStates(proof.sets.map(id => sets.get(id)!.cells), proof.links, masks,
      assumption.on ? undefined : assumption.digit)
    for (const { cell, digit } of states.on) {
      mark(cell, digit, { color: chainColor(colors[0]), mark: 'ring', label: 'ON in this case' })
    }
    for (const { cell, digit } of states.off) {
      mark(cell, digit, { color: chainColor(colors[1]), mark: 'ring', label: 'OFF in this case' })
    }
  } else if (showEliminations) for (const { cell, digit } of analysis.witnesses ?? []) {
    mark(cell, digit, { color: 'var(--chain-blue)', mark: 'ring', label: 'Eliminating digit in the proof' })
  }
  for (const [index, link] of analysis.links.entries()) {
    const { to, digit } = link
    const a = 'fromNode' in link ? chainNodeCandidates(link.fromNode).map(({ cell }) => cell)
      : proof.kind === 'blossom' ? [link.from] : subsetOccurrences(sets.get(link.from)?.cells ?? [], digit, masks)
    const b = subsetOccurrences(sets.get(to)?.cells ?? [], digit, masks)
    if (!a.length || !b.length) continue
    const emphasized = focus && 'link' in focus && focus.link === index
    for (const cell of [...a, ...b]) {
      const previous = assumption ? candidates.get(cell)?.get(digit) : undefined
      mark(cell, digit, { ...(previous ?? { color: restricted, mark: 'ring', label: 'Restricted common candidate' }),
        referenceHighlight: emphasized })
    }
    links.push({
      from: { cells: a, digit },
      to: { cells: b, digit },
      color: assumption ? 'var(--chain-neutral)' : restricted,
      dashed: true,
      hideGroupOutlines: proof.kind === 'path' && proof.sets.length > 2,
      emphasized,
    })
  }
  if (showEliminations) for (const action of analysis.actions) if ('eliminate' in action) {
    mark(action.eliminate.cell, action.eliminate.digit, { color: 'var(--chain-removal)', mark: 'strike', label: 'Can be removed' })
  }
  return { cells, candidates, links }
}

/** Draw verified RCCs and set membership for the subset sketches currently visible on the board. */
export function buildSubsetChainAnnotations(sketches: readonly AnalyzedChainSketch[], sets: readonly SubsetDescription[],
  context: SubsetContext, activeId: number, showEliminations: boolean, focus: SubsetChainFocus | null) {
  const { masks } = context
  if (!masks) return
  const byId = new Map(sets.map(set => [set.id, set]))
  let annotations: BoardAnnotations | undefined
  for (const sketch of sketches) {
    if (!sketch.subset || (sketch.hidden && focus?.sketchId !== sketch.id)) continue
    const { proof, analysis } = sketch.subset
    annotations = mergeBoardAnnotations(annotations, buildSubsetProofAnnotations(proof, analysis, byId, masks,
      sketch.id === activeId && showEliminations, focus?.sketchId === sketch.id ? focus.part : undefined, [sketch.color, sketch.secondColor]))
  }
  return annotations
}

/** Show strong links inside a saved subset. A digit can point to several possible cells. */
export function subsetStrongLinks(sets: readonly SubsetDescription[], context: SubsetContext, highlightedDigit: number | null) {
  const { masks } = context
  if (!masks) return []
  const links: BoardLink[] = []
  const color = 'var(--chain-blue)'
  for (const set of sets) {
    const digits = subsetDigits(set.digitMask, context.grid.size)
    const occurrences = digits.map(digit => ({ cells: subsetOccurrences(set.cells, digit, masks), digit }))
    for (const [index, point] of occurrences.entries()) {
      if (set.kind === 'als') {
        // The set omits at most one digit, so at least one of these two groups is true.
        for (const other of occurrences.slice(index + 1)) {
          if (highlightedDigit === null || point.digit === highlightedDigit || other.digit === highlightedDigit)
            links.push({ from: point, to: other, color })
        }
      } else if ((set.kind === 'locked' || set.kind === 'peer' && set.extra === 0) && point.cells.length === 2 &&
        (highlightedDigit === null || point.digit === highlightedDigit)) {
        const [first, second] = point.cells
        links.push({ from: { cell: first, digit: point.digit }, to: { cell: second, digit: point.digit }, color })
      }
    }
  }
  return links
}
