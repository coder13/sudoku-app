import { chainCandidate, type ChainEdge } from './chains.ts'
import type { DeductionAction } from './engine.ts'
import { applyDeduction, conflictsOf, fillEntries, hasCandidate, move, valuesOf, type Game } from './game.ts'

export const CHAIN_COLORS = ['Blue', 'Orange', 'Purple', 'Teal', 'Pink', 'Green'] as const
export type ChainColor = typeof CHAIN_COLORS[number]
export const CHAIN_COLOR_PAIRS = [
  ['Blue', 'Orange'], ['Purple', 'Teal'], ['Pink', 'Green'],
] as const satisfies readonly (readonly [ChainColor, ChainColor])[]
export const chainColor = (color: ChainColor) => `var(--chain-${color.toLowerCase()})`

export function chainPairIndex(first: ChainColor, second: ChainColor) {
  return CHAIN_COLOR_PAIRS.findIndex(([a, b]) => (a === first && b === second) || (b === first && a === second))
}

export type ChainSketch = {
  id: number
  type: 'alternating' | 'medusa' // Kept for saves shared with older devices.
  color: ChainColor
  secondColor: ChainColor
  hidden: boolean
  history: ChainEdge[][]
  highlightedDigit: number | null
}
export type ChainSketchState = { sketches: ChainSketch[]; activeId: number; pending: number | null }
export const MAX_CHAIN_HISTORY = 64

export function newChainSketch(id: number): ChainSketch {
  const [color, secondColor] = CHAIN_COLOR_PAIRS[(id - 1) % CHAIN_COLOR_PAIRS.length]
  return {
    id, type: 'alternating', color, secondColor,
    hidden: false, history: [[]], highlightedDigit: null,
  }
}

export const initialChainSketch: ChainSketchState = { sketches: [newChainSketch(1)], activeId: 1, pending: null }

export function applyChainDeduction(game: Game, chainIds: readonly number[], actions: readonly DeductionAction[],
  candidates: readonly number[], removeCandidates: boolean): Game {
  const before = game.chainSketch
  if (!before || !actions.length || !chainIds.some(id => before.sketches.some(sketch => sketch.id === id))) return game

  const removals = actions.filter(action => 'eliminate' in action)
  const eliminated = applyDeduction(game, removals, candidates, removeCandidates)
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
    if (conflictsOf(filled, game.variant?.puzzle, game.grid, game.six?.rules).size) return game
    position = fillEntries(eliminated, filled, removeCandidates).position
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

function validNode(node: unknown): node is number {
  return typeof node === 'number' && Number.isInteger(node) && node >= 0 && node < 729
}

export function validChainSketchState(value: unknown): value is ChainSketchState {
  if (!value || typeof value !== 'object') return false
  const { sketches, activeId, pending } = value as ChainSketchState
  const ids = new Set<number>()
  return (pending === null || validNode(pending)) && Array.isArray(sketches) && sketches.length > 0 && sketches.every(sketch => {
    if (!sketch || !Number.isSafeInteger(sketch.id) || sketch.id < 1 || ids.has(sketch.id) ||
      (sketch.type !== 'alternating' && sketch.type !== 'medusa') || !CHAIN_COLORS.includes(sketch.color) ||
      !CHAIN_COLORS.includes(sketch.secondColor) || typeof sketch.hidden !== 'boolean' ||
      !(sketch.highlightedDigit === null || (Number.isInteger(sketch.highlightedDigit) && sketch.highlightedDigit >= 1 && sketch.highlightedDigit <= 9)) ||
      !Array.isArray(sketch.history) || !sketch.history.length || sketch.history.length > MAX_CHAIN_HISTORY) return false
    ids.add(sketch.id)
    return sketch.history.every(edges => Array.isArray(edges) && edges.every(edge =>
      Array.isArray(edge) && edge.length === 2 && edge.every(validNode) && edge[0] !== edge[1]))
  }) && ids.has(activeId)
}

export function removeUnavailableChains(state: ChainSketchState, unavailable: (node: number) => boolean): ChainSketchState {
  const missingEndpoint = (edge: ChainEdge) => edge.some(unavailable)
  const before = state.sketches.findIndex(({ id }) => id === state.activeId)
  const sketches = state.sketches.filter(({ history }) => !history.at(-1)!.some(missingEndpoint)).map(sketch => {
    const history = sketch.history.filter(edges => !edges.some(missingEndpoint))
    return history.length === sketch.history.length ? sketch : { ...sketch, history }
  })
  if (!sketches.length) return initialChainSketch
  const activeId = sketches.some(({ id }) => id === state.activeId) ? state.activeId : sketches[Math.min(before, sketches.length - 1)].id
  const pending = activeId !== state.activeId || (state.pending !== null && unavailable(state.pending)) ? null : state.pending
  return pending === state.pending && sketches.length === state.sketches.length && sketches.every((sketch, i) => sketch === state.sketches[i])
    ? state : { sketches, activeId, pending }
}

export function pruneChainsAfterMove(previous: Game, next: Game): Game {
  const state = next.chainSketch
  if (!state || next.position === previous.position) return next
  const { entries, center, corner, eliminations } = next.position
  const old = previous.position
  const chainSketch = removeUnavailableChains(state, (node) => {
    const { cell, digit } = chainCandidate(node)
    const bit = 1 << (digit - 1)
    const removed = (old.center[cell] | old.corner[cell]) & ~(center[cell] | corner[cell])
    return entries[cell] !== '0' || Boolean(bit & (removed | (eliminations?.[cell] ?? 0)))
  })
  return chainSketch === state ? next : { ...next, chainSketch }
}
