import { playVariantPuzzle } from './fog.ts'
import { analyzeChainPaths, analyzeMedusa, candidateId, chainCandidate, chainNodeCandidates, chainNodeDigit, makeChainGraph, sameEdge, validChainNode, type ChainEdge, type ChainNode } from './chains.ts'
import type { DeductionAction } from './engine.ts'
import { applyDeduction, conflictsOf, fillEntries, hasCandidate, hasUniquenessProof, move, valuesOf, type Game } from './game.ts'
import { validSubsetProof, type SubsetProof } from './subsets.ts'
import type { VariantToolId } from './variants.ts'

export const CHAIN_COLORS = ['Blue', 'Orange', 'Purple', 'Teal', 'Pink', 'Green', 'Gold', 'Indigo', 'Red', 'Slate'] as const
export type ChainColor = typeof CHAIN_COLORS[number]
export type ChainColorPair = readonly [ChainColor, ChainColor]
export const CHAIN_COLOR_PAIRS = [
  ['Blue', 'Orange'], ['Purple', 'Teal'], ['Pink', 'Green'], ['Gold', 'Indigo'], ['Red', 'Slate'],
] as const satisfies readonly ChainColorPair[]
export const chainColor = (color: ChainColor) => `var(--chain-${color.toLowerCase()})`

export function chainPairIndex(first: ChainColor, second: ChainColor, pairs: readonly ChainColorPair[] = CHAIN_COLOR_PAIRS) {
  return pairs.findIndex(([a, b]) => (a === first && b === second) || (b === first && a === second))
}

export function cycleChainPairs(pairs: readonly ChainColorPair[], assigned: readonly ChainColorPair[]) {
  const used = new Set(assigned.map(([first, second]) => chainPairIndex(first, second, pairs)))
  let index = assigned.length % pairs.length
  return () => {
    const unused = pairs.findIndex((_, slot) => !used.has(slot))
    if (unused !== -1) {
      used.add(unused)
      index = (unused + 1) % pairs.length
      return pairs[unused]
    }
    const pair = pairs[index]
    index = (index + 1) % pairs.length
    return pair
  }
}

type ChainSelection = { activeId: number; pending: ChainNode | null }

export type ChainSketch = {
  id: number
  type: 'alternating' | 'medusa' // Kept for saves shared with older devices.
  color: ChainColor
  secondColor: ChainColor
  hidden: boolean
  history: ChainEdge[][]
  /** Subset proofs share the same history steps as candidate links. */
  subsetHistory?: (SubsetProof | null)[]
  undoSelections?: (ChainSelection | null)[]
  highlightedDigit: number | null
  merges?: { step: number; absorbed: { index: number; sketch: ChainSketch }[] }[]
}
export type ChainSketchState = ChainSelection & { sketches: ChainSketch[] }
export const MAX_CHAIN_HISTORY = 64

export function newChainSketch(id: number, pairs: readonly ChainColorPair[] = CHAIN_COLOR_PAIRS): ChainSketch {
  const [color, secondColor] = pairs[(id - 1) % pairs.length]
  return {
    id, type: 'alternating', color, secondColor,
    hidden: false, history: [[]], highlightedDigit: null,
  }
}

export const initialChainSketch: ChainSketchState = { sketches: [newChainSketch(1)], activeId: 1, pending: null }

export const currentSubsetProof = (sketch: ChainSketch) => sketch.subsetHistory?.at(-1) ?? null
export const hasChainContent = (sketch: ChainSketch) => Boolean(sketch.history.at(-1)?.length || currentSubsetProof(sketch))

export function nextChainId(sketches: readonly ChainSketch[]) {
  const queue = [...sketches]
  let latest = 0
  for (const sketch of queue) {
    latest = Math.max(latest, sketch.id)
    for (const merge of sketch.merges ?? []) for (const item of merge.absorbed) queue.push(item.sketch)
  }
  return latest + 1
}

/** Select a blank chain, reusing one if it is already in the panel. */
export function selectEmptyChain(state: ChainSketchState, pairs: readonly ChainColorPair[]) {
  const empty = state.sketches.find(sketch => !hasChainContent(sketch))
  if (empty) return { ...state, activeId: empty.id, pending: null }
  const sketch = newChainSketch(nextChainId(state.sketches), pairs)
  return { sketches: [...state.sketches, sketch], activeId: sketch.id, pending: null }
}

export function updateChainEdges(state: ChainSketchState, next: ChainEdge[], pending: ChainNode | null,
  highlightedDigit?: number, reveal = false, colorPairs: readonly ChainColorPair[] = CHAIN_COLOR_PAIRS): ChainSketchState {
  const current = state.sketches.find(sketch => sketch.id === state.activeId)!
  const before = current.history.at(-1)!
  const added = next.filter(edge => !before.some(previous => sameEdge(edge, previous)))
  const addedNodes = new Set(added.flat())
  const touches = (edges: readonly ChainEdge[]) => edges.some(edge => edge.some(node => addedNodes.has(node)))
  if (before.length && added.length && !touches(before) && before.every(edge => next.some(link => sameEdge(edge, link)))) {
    // A disconnected addition belongs to another chain. Keep the original card and history intact.
    const owner = state.sketches.find(sketch => !sketch.hidden && touches(sketch.history.at(-1)!))
    const target = owner ? { ...state, activeId: owner.id } : { ...selectEmptyChain(state, colorPairs), pending: state.pending }
    const existing = owner?.history.at(-1) ?? []
    const fresh = added.filter(edge => !existing.some(link => sameEdge(edge, link)))
    return fresh.length
      ? updateChainEdges(target, [...existing, ...fresh], pending, highlightedDigit, reveal, colorPairs)
      : { ...target, pending }
  }
  const joined = state.sketches.flatMap((sketch, index) => sketch === current ||
    (!sketch.hidden && touches(sketch.history.at(-1)!)) ? [{ index, sketch }] : [])
  const base = joined[0].sketch
  const absorbed = joined.slice(1)
  let links = next
  if (absorbed.length) {
    const combined = joined.flatMap(({ sketch }) => sketch === current ? next : sketch.history.at(-1)!)
    links = combined.filter((edge, index) => combined.findIndex(other => sameEdge(edge, other)) === index)
  }
  const discarded = Math.max(0, base.history.length + 1 - MAX_CHAIN_HISTORY)
  const history = [...base.history.slice(discarded), links]
  const undoSelections = [...(base.undoSelections ?? base.history.map(() => null)).slice(discarded),
    { activeId: state.activeId, pending: state.pending }]
  const merges = base.merges?.filter(({ step }) => step > discarded).map(merge => ({ ...merge, step: merge.step - discarded })) ?? []
  if (absorbed.length) merges.push({ step: history.length - 1, absorbed })
  const updated = { ...base, hidden: !reveal && base.hidden, history, undoSelections, highlightedDigit: highlightedDigit ?? base.highlightedDigit }
  if (base.subsetHistory) updated.subsetHistory = [...base.subsetHistory.slice(discarded), null]
  if (merges.length) updated.merges = merges
  else delete updated.merges
  const absorbedIds = new Set(absorbed.map(({ sketch }) => sketch.id))
  return { sketches: state.sketches.filter(sketch => !absorbedIds.has(sketch.id)).map(sketch => sketch === base ? updated : sketch),
    activeId: base.id, pending }
}

export function updateSubsetChain(state: ChainSketchState, proof: SubsetProof | null): ChainSketchState {
  const active = state.sketches.find(sketch => sketch.id === state.activeId)!
  if ((active.history.at(-1)!.length && proof?.kind !== 'endpoint') || proof === currentSubsetProof(active)) return state
  const next = updateChainEdges(state, [], null)
  return {
    ...next,
    sketches: next.sketches.map(sketch => sketch.id === next.activeId ? {
      ...sketch, subsetHistory: [...(sketch.subsetHistory ?? sketch.history.map(() => null)).slice(0, -1), proof],
    } : sketch),
  }
}

export function undoChainEdit(state: ChainSketchState, restoreEndpoint = false): ChainSketchState {
  const active = state.sketches.find(sketch => sketch.id === state.activeId)!
  if (active.history.length <= 1) return state.pending === null ? state : { ...state, pending: null }
  const history = active.history.slice(0, -1)
  const latest = active.merges?.at(-1)
  const undoneMerge = latest?.step === history.length ? latest : undefined
  const updated = { ...active, history }
  if (active.subsetHistory) {
    const subsetHistory = active.subsetHistory.slice(0, -1)
    if (subsetHistory.some(Boolean)) updated.subsetHistory = subsetHistory
    else delete updated.subsetHistory
  }
  if (active.undoSelections) {
    const undoSelections = active.undoSelections.slice(0, -1)
    if (undoSelections.some(Boolean)) updated.undoSelections = undoSelections
    else delete updated.undoSelections
  }
  if (undoneMerge) {
    const merges = active.merges!.slice(0, -1)
    if (merges.length) updated.merges = merges
    else delete updated.merges
  }
  const sketches = state.sketches.map(sketch => sketch === active ? updated : sketch)
  for (const { index, sketch } of undoneMerge?.absorbed ?? []) sketches.splice(index, 0, sketch)
  const undone = { ...state, sketches, pending: null }
  if (!restoreEndpoint) return undone

  const selection = active.undoSelections?.at(-1) ?? legacyUndoSelection(active,
    [updated, ...(undoneMerge?.absorbed.map(({ sketch }) => sketch) ?? [])], state.pending)
  if (!selection) return undone
  const originIndex = sketches.findIndex(({ id }) => id === selection.activeId)
  if (originIndex < 0 || sketches[originIndex].hidden) return undone
  const origin = sketches[originIndex]
  const pending = selection.pending
  if (pending !== null) sketches[originIndex] = { ...origin, highlightedDigit: chainNodeDigit(pending) }
  return { sketches, activeId: origin.id, pending }
}

/** Older saves only recorded links. A single added link points from the previous endpoint to the selected candidate. */
function legacyUndoSelection(active: ChainSketch, restored: readonly ChainSketch[], pending: ChainNode | null): ChainSelection | null {
  if (pending === null) return null
  const previous = restored.flatMap(sketch => sketch.history.at(-1)!)
  const added = active.history.at(-1)!.filter(edge => !previous.some(link => sameEdge(edge, link)))
  if (added.length !== 1 || added[0][1] !== pending) return null
  const [from] = added[0]
  const origin = restored.find(sketch => sketch.history.at(-1)!.some(edge => edge.includes(from)))
  return { activeId: origin?.id ?? active.id, pending: from }
}

export function applyChainDeduction(game: Game, chainIds: readonly number[], actions: readonly DeductionAction[],
  candidates: readonly number[], removeCandidates: boolean, variantRules?: readonly VariantToolId[]): Game {
  const before = game.chainSketch
  if (!before || !actions.length || !chainIds.some(id => before.sketches.some(sketch => sketch.id === id))) return game

  const removals = actions.filter(action => 'eliminate' in action)
  const eliminated = applyDeduction(game, removals, candidates, removeCandidates, variantRules)
  if (removals.length && eliminated === game) return game
  const placements = actions.filter(action => 'place' in action)
  let position = eliminated.position
  if (placements.length) {
    const values = [...valuesOf(game)]
    for (const { place: { cell, digit } } of placements) {
      if (values[cell] !== '0' || !hasCandidate(candidates[cell] & ~(position.eliminations?.[cell] ?? 0), digit)) return game
      values[cell] = String(digit)
    }
    const filled = values.join('')
    if (conflictsOf(filled, playVariantPuzzle(game.variant, game.position.entries), game.grid, game.sized?.rules).size) return game
    position = fillEntries(eliminated, filled, removeCandidates, variantRules).position
  }

  const sketches = before.sketches.filter(({ id }) => !chainIds.includes(id))
  const activeIndex = before.sketches.findIndex(({ id }) => id === before.activeId)
  const activeId = sketches.find(({ id }) => id === before.activeId)?.id ?? sketches[Math.min(activeIndex, sketches.length - 1)]?.id
  const applied = move(game, position)
  return {
    ...applied,
    past: [...applied.past.slice(0, -1), { ...game.position, chainSketch: before }],
    chainSketch: activeId === undefined ? undefined : {
      sketches, activeId, pending: before.activeId === activeId ? before.pending : null,
    },
  }
}


export function validChainSketchState(value: unknown): value is ChainSketchState {
  if (!value || typeof value !== 'object') return false
  const { sketches, activeId, pending } = value as ChainSketchState
  if (!(pending === null || validChainNode(pending)) || !Array.isArray(sketches) || !sketches.some(sketch => sketch?.id === activeId)) return false
  const ids = new Set<number>()
  const queue = [...sketches]
  for (const sketch of queue) {
    if (!sketch || !Number.isSafeInteger(sketch.id) || sketch.id < 1 || ids.has(sketch.id) ||
      (sketch.type !== 'alternating' && sketch.type !== 'medusa') || !CHAIN_COLORS.includes(sketch.color) ||
      !CHAIN_COLORS.includes(sketch.secondColor) || typeof sketch.hidden !== 'boolean' ||
      !(sketch.highlightedDigit === null || (Number.isInteger(sketch.highlightedDigit) && sketch.highlightedDigit >= 1 && sketch.highlightedDigit <= 9)) ||
      !Array.isArray(sketch.history) || !sketch.history.length || sketch.history.length > MAX_CHAIN_HISTORY) return false
    ids.add(sketch.id)
    if (!sketch.history.every(edges => Array.isArray(edges) && edges.every(edge =>
      Array.isArray(edge) && edge.length === 2 && edge.every(validChainNode) && edge[0] !== edge[1]))) return false
    if (sketch.subsetHistory !== undefined && (!Array.isArray(sketch.subsetHistory) ||
      sketch.subsetHistory.length !== sketch.history.length ||
      !sketch.subsetHistory.every((proof, step) => proof === null || (!sketch.history[step].length && validSubsetProof(proof))))) return false
    if (sketch.undoSelections !== undefined && (!Array.isArray(sketch.undoSelections) || sketch.undoSelections.length !== sketch.history.length ||
      !sketch.undoSelections.every(selection => selection === null || selection && Number.isSafeInteger(selection.activeId) &&
        selection.activeId > 0 && (selection.pending === null || validChainNode(selection.pending))))) return false
    if (sketch.merges === undefined) continue
    if (!Array.isArray(sketch.merges)) return false
    let previousStep = 0
    for (const merge of sketch.merges) {
      if (!merge || !Number.isSafeInteger(merge.step) || merge.step <= previousStep || merge.step >= sketch.history.length ||
        !Array.isArray(merge.absorbed) || !merge.absorbed.length) return false
      previousStep = merge.step
      for (const item of merge.absorbed) {
        if (!item || !Number.isSafeInteger(item.index) || item.index < 0) return false
        queue.push(item.sketch)
      }
    }
  }
  return true
}

export function removeUnavailableChains(state: ChainSketchState, unavailable: (node: number) => boolean,
  resolved?: (edges: readonly ChainEdge[]) => boolean): ChainSketchState {
  const missingNode = (node: ChainNode) => chainNodeCandidates(node).some(candidate => unavailable(candidateId(candidate)))
  const missingEndpoint = (edge: ChainEdge) => edge.some(missingNode)
  const before = state.sketches.findIndex(({ id }) => id === state.activeId)
  const sketches = state.sketches.filter(({ history }) => {
    const edges = history.at(-1)!
    return !edges.some(missingEndpoint) && !resolved?.(edges)
  }).map(sketch => {
    const history: ChainEdge[][] = []
    const steps = new Map<number, number>()
    for (const [step, edges] of sketch.history.entries()) {
      if (edges.some(missingEndpoint)) continue
      steps.set(step, history.length)
      history.push(edges)
    }
    const previousSelections = sketch.undoSelections
    const undoSelections = previousSelections?.filter((_, step) => steps.has(step)).map(selection =>
      selection?.pending != null && missingNode(selection.pending) ? { ...selection, pending: null } : selection)
    const selectionsUnchanged = previousSelections?.every((selection, step) => selection === undoSelections?.[step]) ?? true
    if (history.length === sketch.history.length && selectionsUnchanged) return sketch
    const updated = { ...sketch, history }
    if (sketch.subsetHistory) updated.subsetHistory = sketch.subsetHistory.filter((_, step) => steps.has(step))
    if (undoSelections) updated.undoSelections = undoSelections
    const merges = sketch.merges?.flatMap(merge => {
      const step = steps.get(merge.step)
      return step ? [{ ...merge, step }] : []
    })
    if (merges?.length) updated.merges = merges
    else delete updated.merges
    return updated
  })
  if (!sketches.length) return initialChainSketch
  const activeId = sketches.some(({ id }) => id === state.activeId) ? state.activeId : sketches[Math.min(before, sketches.length - 1)].id
  const pending = activeId !== state.activeId || (state.pending !== null && missingNode(state.pending)) ? null : state.pending
  return pending === state.pending && sketches.length === state.sketches.length && sketches.every((sketch, i) => sketch === state.sketches[i])
    ? state : { sketches, activeId, pending }
}

export function savePrunedChains(game: Game, chainSketch: ChainSketchState, recordUndo: boolean): Game {
  if (chainSketch === game.chainSketch) return game
  const before = game.past.at(-1)
  const past = recordUndo && game.chainSketch && before && before.chainSketch === undefined
    ? [...game.past.slice(0, -1), { ...before, chainSketch: game.chainSketch }]
    : game.past
  return { ...game, chainSketch, past }
}

export function pruneChainsAfterMove(previous: Game, next: Game,
  candidateMasks?: (game: Game) => readonly number[] | null): Game {
  const state = next.chainSketch
  if (!state || next.position === previous.position) return next
  // Bookmarks restore the sketch that was saved with the destination board.
  if (next.past.at(-1)?.chainSketch !== undefined &&
    previous.bookmarks?.some(bookmark => bookmark.position === next.position && bookmark.chainSketch === state)) return next
  // Puzzle undo or redo can restore a board and its matching sketch together.
  if ((next.past.length === previous.past.length - 1 && state === previous.past.at(-1)?.chainSketch) ||
    (next.future.length === previous.future.length - 1 && state === previous.future.at(-1)?.chainSketch)) return next
  const { entries, center, corner, eliminations } = next.position
  const old = previous.position
  const removed = center.map((mask, cell) => (old.center[cell] | old.corner[cell]) & ~(mask | corner[cell]))
  const unavailable = (node: number) => {
    const { cell, digit } = chainCandidate(node)
    return entries[cell] !== '0' || hasCandidate(removed[cell] | (eliminations?.[cell] ?? 0), digit)
  }
  // The graph before the edit still contains the eliminated candidates.
  const masks = next.future.length === 0 && (entries !== old.entries || eliminations !== old.eliminations || removed.some(Boolean))
    ? candidateMasks?.(previous) : null
  const graph = masks ? makeChainGraph(masks, playVariantPuzzle(previous.variant, previous.position.entries),
    previous.subsetWorkspace?.sets, !previous.variant && hasUniquenessProof(previous)) : null
  const chainSketch = removeUnavailableChains(state, unavailable, graph ? edges => {
    if (!edges.length) return false
    const targets = [...analyzeChainPaths(graph, edges), ...analyzeMedusa(graph, edges)]
      .flatMap(({ actions }) => actions.flatMap(action => 'eliminate' in action ? [action.eliminate] : []))
    return targets.length > 0 && targets.every(target => unavailable(candidateId(target)))
  } : undefined)
  const undoPosition = next.past.at(-1)
  const extendsMove = next.past !== previous.past && undoPosition === previous.past.at(-1) &&
    next.past.length === previous.past.length
  return savePrunedChains(next, chainSketch, undoPosition === previous.position || extendsMove)
}
