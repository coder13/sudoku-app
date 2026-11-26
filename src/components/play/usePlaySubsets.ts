import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { almostLockedSetColor } from '../../sudoku/als-highlighting'
import type { Game } from '../../sudoku/game'
import { analyzeVisibleSubsets } from '../../sudoku/subset-proofs'
import {
  deleteSubset, describeSubsets, eligibleSubsetCells, EMPTY_SUBSET_WORKSPACE, saveSubset, subsetMembershipProblem,
  type SubsetContext, type SubsetWorkspace,
} from '../../sudoku/subsets'
import { mergeBoardAnnotations, type BoardAnnotations, type CandidateAnnotation, type CellAnnotation } from '../BoardAnnotations'
import { buildSubsetProofAnnotations, subsetStrongLinks } from './subset-chain-annotations'

type Draft = { gameId: string; id?: number; cells: readonly number[] }
const DEFAULT_VISIBILITY: ReadonlyMap<number, boolean> = new Map()

/** Manage saved set membership, in-progress grid selection, and subset highlighting in Play. */
export function usePlaySubsets({
  game, context, panelVisible, panelOpen, enabled, highlightedDigit, updateGame, clearSelection,
}: {
  game: Game
  context: SubsetContext
  panelVisible: boolean
  panelOpen: boolean
  enabled: boolean
  highlightedDigit: number | null
  updateGame: (update: (game: Game) => Game) => void
  clearSelection: () => void
}) {
  const workspace = game.subsetWorkspace ?? EMPTY_SUBSET_WORKSPACE
  const [building, setBuilding] = useState<Draft>()
  const [selected, setSelected] = useState<{ gameId: string; id: number }>()
  const [visibility, setVisibility] = useState<{ gameId: string; overrides: ReadonlyMap<number, boolean> }>()
  const [display, setDisplay] = useState<{ gameId: string; eliminations: boolean; strongLinks: boolean }>()
  const options = display?.gameId === game.id ? display : undefined
  const showEliminations = options?.eliminations ?? false
  const showStrongLinks = options?.strongLinks ?? false
  const editExists = building?.id === undefined || workspace.sets.some(set => set.id === building.id)
  const draft = enabled && panelVisible && building?.gameId === game.id && editExists ? building : undefined
  const draftId = draft?.id ?? (draft?.cells.length ? workspace.nextId : null)
  const sets = useMemo(() => {
    const saved = workspace.sets
    if (!draft || draftId === null) return describeSubsets(saved, context)
    const preview = { id: draftId, cells: draft.cells }
    return describeSubsets(draft.id === undefined
      ? [...saved, preview]
      : saved.map(set => set.id === draftId ? preview : set), context)
  }, [workspace.sets, context, draft, draftId])
  const selection = selected?.gameId === game.id && sets.some(set => set.id === selected.id) ? selected.id : null
  const selectedId = draft ? draftId : selection ?? sets.at(-1)?.id ?? null
  const overrides = visibility?.gameId === game.id ? visibility.overrides : DEFAULT_VISIBILITY
  const highlightedIds = useMemo(() => new Set(sets.filter(set => overrides.get(set.id) !== false)
    .map(set => set.id)), [sets, overrides])
  const highlightedSets = useMemo(() => sets.filter(set => highlightedIds.has(set.id)), [sets, highlightedIds])
  const eligible = useMemo(() => draft ? eligibleSubsetCells(draft.cells, context) : undefined, [draft, context])
  const deductions = useMemo(() => enabled && panelOpen && !draft && showEliminations && context.masks
    ? analyzeVisibleSubsets(highlightedSets, context) : undefined, [enabled, panelOpen, draft, showEliminations, highlightedSets, context])

  function update(transform: (workspace: SubsetWorkspace) => SubsetWorkspace) {
    if (!enabled) return
    updateGame(current => {
      if (current.position !== game.position || current.id !== game.id) return current
      const before = current.subsetWorkspace ?? EMPTY_SUBSET_WORKSPACE
      const next = transform(before)
      return next === before ? current : { ...current, subsetWorkspace: next }
    })
  }

  function commit(cells: readonly number[], id?: number) {
    if (!enabled || subsetMembershipProblem(cells, context)) return false
    update(current => saveSubset(current, cells, context, id))
    setSelected({ gameId: game.id, id: id ?? workspace.nextId })
    return true
  }

  function finish() {
    if (!building) return
    if (building.gameId === game.id && editExists) commit(building.cells, building.id)
    setBuilding(undefined)
  }

  const finishWhenHidden = useEffectEvent(finish)
  useEffect(() => {
    if (building && (!panelVisible || !enabled || building.gameId !== game.id || !editExists)) finishWhenHidden()
  }, [building, panelVisible, enabled, game.id, editExists])

  function start(id?: number) {
    if (!enabled) return
    if (draft && id === draftId) return
    if (draft) commit(draft.cells, draft.id)
    setBuilding({ gameId: game.id, id, cells: workspace.sets.find(set => set.id === id)?.cells ?? [] })
    clearSelection()
  }

  function select(id: number) {
    if (draft) start(id)
    else setSelected({ gameId: game.id, id })
  }

  function toggleCell(cell: number) {
    if (!draft) return
    const cells = draft.cells.includes(cell) ? draft.cells.filter(member => member !== cell)
      : eligible?.has(cell) ? [...draft.cells, cell].sort((first, second) => first - second) : draft.cells
    if (cells !== draft.cells) setBuilding({ ...draft, cells })
  }

  function remove(id: number) {
    if (draft && id === draftId) setBuilding({ gameId: game.id, cells: [] })
    if (workspace.sets.some(set => set.id === id)) update(current => deleteSubset(current, id))
    if (overrides.has(id)) {
      const next = new Map(overrides)
      next.delete(id)
      setVisibility({ gameId: game.id, overrides: next })
    }
  }

  const annotations = useMemo(() => {
    if (!enabled || !panelOpen) return undefined
    const cells = new Map<number, CellAnnotation>()
    if (draftId !== null && highlightedIds.has(draftId) && draft?.cells.length && eligible) {
      for (const cell of eligible) {
        cells.set(cell, { fill: 'var(--subset-eligible)', label: 'Can join subset' })
      }
    }
    for (const set of highlightedSets) {
      const color = almostLockedSetColor(set.id - 1)
      for (const cell of set.cells) {
        const previous = cells.get(cell)
        cells.set(cell, {
          ...previous,
          setMarkers: [...(previous?.setMarkers ?? []), { color, label: `Set ${set.number}` }],
        })
      }
    }
    let result: BoardAnnotations = { cells }
    if (showStrongLinks) result.links = subsetStrongLinks(highlightedSets, context, highlightedDigit)
    if (deductions && context.masks) {
      const setsById = new Map(highlightedSets.map(set => [set.id, set]))
      for (const { proof, analysis } of deductions.proofs) {
        const { candidates, links } = buildSubsetProofAnnotations(proof, analysis, setsById, context.masks, true)
        result = mergeBoardAnnotations(result, { candidates, links })!
      }
      const candidates = new Map<number, Map<number, CandidateAnnotation>>()
      const mark = (cell: number, digit: number, annotation: CandidateAnnotation) => {
        const marks = candidates.get(cell) ?? new Map()
        marks.set(digit, annotation)
        candidates.set(cell, marks)
      }
      for (const { cell, digit } of deductions.singles.witnesses) {
        if (!result.candidates?.get(cell)?.has(digit)) mark(cell, digit, { color: 'var(--chain-blue)', mark: 'ring' })
      }
      for (const action of deductions.actions) if ('eliminate' in action) {
        mark(action.eliminate.cell, action.eliminate.digit, { color: 'var(--chain-removal)', mark: 'strike', label: 'Can be removed' })
      }
      result = mergeBoardAnnotations(result, { candidates })!
    }
    return result.cells?.size || result.candidates?.size || result.links?.length ? result : undefined
  }, [enabled, panelOpen, draft, draftId, eligible, highlightedIds, highlightedSets, showStrongLinks, highlightedDigit, deductions, context])

  return {
    sets, selectedId, highlightedIds, select, draft, start, finish, toggleCell, annotations, remove,
    showEliminations, showStrongLinks,
    actions: deductions?.actions,
    toggleEliminations: () => setDisplay({ gameId: game.id, eliminations: !showEliminations, strongLinks: showStrongLinks }),
    toggleStrongLinks: () => setDisplay({ gameId: game.id, eliminations: showEliminations, strongLinks: !showStrongLinks }),
    toggleVisibility: (id: number) => setVisibility({
      gameId: game.id, overrides: new Map(overrides).set(id, !highlightedIds.has(id)),
    }),
    saveCells(cells: readonly number[]) {
      if (!commit(cells)) return false
      clearSelection()
      return true
    },
  }
}
