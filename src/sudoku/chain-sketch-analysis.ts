import type { DeductionAction } from './engine.ts'
import { analyzeChainPaths, analyzeMedusa, chainComponents, chainNodeDigit, isAlsChainNode, type ChainAnalysis, type ChainEdge, type ChainGraph, type ChainNode, type LinkStrength } from './chains.ts'
import { currentSubsetProof, cycleChainPairs, type ChainColorPair, type ChainSketch } from './chain-sketch.ts'
import { analyzeSubsetProof, type SubsetProofAnalysis } from './subset-proofs.ts'
import type { SubsetContext, SubsetDescription, SubsetProof } from './subsets.ts'
import { techniqueActionKey } from './technique-progress.ts'

export type ChainPath = { nodes: readonly ChainNode[]; strengths: readonly LinkStrength[] }
export type ChainProof = {
  title: string; nodes: readonly ChainNode[]; strengths?: readonly LinkStrength[]
  actions: readonly DeductionAction[]; explanation?: string
}
type MedusaProof = ReturnType<typeof analyzeMedusa>[number] & { title: string }

export type AnalyzedChainSketch = ChainSketch & {
  edges: ChainEdge[]
  chains: ChainAnalysis[]
  types: string[]
  paths: ChainPath[]
  medusas: MedusaProof[]
  components: ChainNode[][]
  subset?: { proof: SubsetProof; analysis: SubsetProofAnalysis }
}

export function sketchPaths(graph: ChainGraph, edges: readonly ChainEdge[]): ChainPath[] {
  const paths: { nodes: ChainNode[]; strengths: LinkStrength[] }[] = []
  for (const [from, to] of edges) {
    const strength = graph.strength(from, to)
    if (!strength) continue
    const previous = paths.at(-1)
    if (previous?.nodes.at(-1) === from) {
      previous.nodes.push(to)
      previous.strengths.push(strength)
    } else paths.push({ nodes: [from, to], strengths: [strength] })
  }
  return paths
}

function recognizedPath(chain: ChainAnalysis) {
  if (['AIC with ALS nodes', 'Firework AIC', 'Unique Rectangle AIC'].includes(chain.title)) return chain.title
  const grouped = chain.nodes.some(node => typeof node === 'string')
  if (chain.loop) return grouped ? 'Grouped Nice Loop' : 'Nice Loop'
  const { strengths } = chain
  return strengths.length >= 3 && strengths[0] === 'strong' && strengths.at(-1) === 'strong' &&
    strengths.every((strength, index) => strength !== strengths[index - 1]) ? grouped ? 'Grouped AIC' : 'AIC' : undefined
}

export function drawnChainEdges(sketches: readonly ChainSketch[], activeId: number) {
  return sketches.filter(sketch => !sketch.hidden || sketch.id === activeId).flatMap(sketch => sketch.history.at(-1)!)
}

function titleMedusa(proof: ReturnType<typeof analyzeMedusa>[number]): string {
  if (proof.nodes.some(node => typeof node === 'string')) return 'Grouped strong-link coloring'
  return proof.nodes.length >= 3 && proof.nodes.some(node => chainNodeDigit(node) !== chainNodeDigit(proof.nodes[0]))
    ? '3D Medusa' : 'Strong-link coloring'
}

export function analyzeChainSketches(graph: ChainGraph, sketches: readonly ChainSketch[],
  subsets?: { sets: readonly SubsetDescription[]; context: SubsetContext }): AnalyzedChainSketch[] {
  return sketches.map(sketch => {
    const edges = sketch.history.at(-1)!
    const medusas = analyzeMedusa(graph, edges).map(proof => ({ ...proof, title: titleMedusa(proof) }))
    const chains = analyzeChainPaths(graph, edges).filter(proof => {
      if (!recognizedPath(proof) || proof.loop || proof.nodes.some((node, i) => i > 0 && graph.strength(proof.nodes[i - 1], node) === 'weak')) return true
      // Strong-link coloring already covers these candidates and deductions.
      return !medusas.some(medusa => medusa.title === '3D Medusa' && medusa.sides.size &&
        proof.nodes.every(node => medusa.sides.has(node)) &&
        proof.actions.every(action => medusa.actions.some(edit => techniqueActionKey(edit) === techniqueActionKey(action))))
    })
    const types = new Set([
      ...medusas.filter(proof => proof.sides.size && (proof.nodes.length >= 3 || proof.actions.length)).map(({ title }) => title),
      ...chains.flatMap(chain => recognizedPath(chain) ?? []),
    ])
    const proof = currentSubsetProof(sketch)
    const subset = proof && subsets ? { proof, analysis: analyzeSubsetProof(proof, subsets.sets, subsets.context, graph) } : undefined
    const paths = sketchPaths(graph, edges).map(path => {
      if (!path.nodes.some(isAlsChainNode) && !path.nodes.slice(1).some((node, i) => graph.patternSource(path.nodes[i], node))) return path
      for (const chain of chains) {
        if (chain.strengths.length !== path.strengths.length) continue
        if (path.nodes.every((node, index) => node === chain.nodes[index])) return { ...path, strengths: chain.strengths }
        if (path.nodes.every((node, index) => node === chain.nodes[chain.nodes.length - index - 1])) {
          return { ...path, strengths: [...chain.strengths].reverse() }
        }
      }
      return path
    })
    return {
      ...sketch,
      edges,
      chains,
      types: [...types],
      paths,
      medusas,
      components: chainComponents(edges.filter(edge => graph.strength(...edge))).components,
      subset,
    }
  })
}

export function applicableChainActions(sketches: readonly AnalyzedChainSketch[], enabled: boolean) {
  const actions = new Map<string, DeductionAction>()
  const chainIds: number[] = []
  if (enabled) for (const { id, chains, medusas, subset } of sketches) {
    const edits = [...chains, ...medusas].flatMap(({ actions }) => actions).concat(subset?.analysis.actions ?? [])
    if (edits.length) chainIds.push(id)
    for (const action of edits) actions.set(techniqueActionKey(action), action)
  }
  return { actions: [...actions.values()], chainIds }
}

export function visibleChainActions(
  sketches: readonly AnalyzedChainSketch[],
  applicable: ReturnType<typeof applicableChainActions>,
  showEliminations: boolean,
) {
  if (showEliminations) return applicable
  return {
    actions: applicable.actions.filter(action => 'place' in action),
    chainIds: sketches.filter(({ chains, medusas }) =>
      [...chains, ...medusas].some(({ actions }) => actions.some(action => 'place' in action)))
      .map(({ id }) => id),
  }
}

export function nextChainColorPair(colorPairs: readonly ChainColorPair[], sketches: readonly AnalyzedChainSketch[]) {
  const usedPairs = sketches.filter(sketch => !sketch.hidden && sketch.medusas.some(({ sides }) => sides.size))
    .map(({ color, secondColor }): ChainColorPair => [color, secondColor])
  return { usedPairs, nextPair: cycleChainPairs(colorPairs, usedPairs) }
}
