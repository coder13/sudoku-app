import { useMemo, useState } from 'react'
import type { BoardAnnotations, CandidateAnnotation, CellAnnotation } from '../BoardAnnotations'
import { analyzeBranch, branchLetter, branchOriginMasks, branchOriginUsable, branchResults, branchRules, sameBranchOrigin,
  type BranchAnalysis, type BranchMove, type BranchOrigin, type BranchWorkspace, type SavedBranch } from '../../sudoku/branches'
import type { Game } from '../../sudoku/game'
import { createUuid } from '../../uuid'

type View =
  | { kind: 'idle' }
  | { kind: 'new'; cell: number | null; digit: number | null; truth: boolean }
  | { kind: 'edit'; id: string; cell: number | null; digit: number | null; truth: boolean }
  | { kind: 'compare'; id?: string; all: boolean }

type Entry = { branch: SavedBranch; analysis: BranchAnalysis }
type ComparisonMark = { cell: number; digit: number; placed: number[]; removed: number[] }
type Options = { game: Game; values: string; visible: boolean; enabled: boolean; originConflict: boolean; selection: number | null;
  candidateMasks?: readonly number[] | null; candidateLoadFailed?: boolean;
  updateGame: (change: (current: Game) => Game) => void; onEnter: () => void }

const initialWorkspace: BranchWorkspace = { branches: [], nextNumber: 1 }
const classicRules = branchRules()
const noEntries: Entry[] = []
const noMasks: readonly number[] = []
const noCornerNotes = Array<number>(81).fill(0)
const idle: View = { kind: 'idle' }
const colors = ['blue', 'orange', 'purple', 'teal', 'pink', 'green', 'indigo', 'red']
export const branchColor = (number: number) => `var(--chain-${colors[(number - 1) % colors.length]})`
const letters = (ids: readonly number[]) => ids.map(branchLetter).join(ids.some(id => id > 26) ? '·' : '')
const names = (ids: readonly number[]) => ids.map(branchLetter).join(', ')
const branchNames = (ids: readonly number[]) => `${ids.length === 1 ? 'branch' : 'branches'} ${names(ids)}`
const contains = (mask: number, digit: number) => Boolean(mask & (1 << (digit - 1)))

function compareFacts(entries: readonly Entry[]) {
  const marks = new Map<number, ComparisonMark>()
  for (const { branch, analysis } of entries) for (const fact of analysis.facts) {
    const key = fact.cell * 9 + fact.digit - 1
    const mark = marks.get(key) ?? { cell: fact.cell, digit: fact.digit, placed: [], removed: [] }
    mark[fact.truth ? 'placed' : 'removed'].push(branch.number)
    marks.set(key, mark)
  }
  return [...marks.values()].sort((a, b) => a.cell - b.cell || a.digit - b.digit)
}

function comparisonAnnotations(marks: readonly ComparisonMark[], showEliminations: boolean): BoardAnnotations {
  const candidates = new Map<number, Map<number, CandidateAnnotation>>()
  for (const { cell, digit, placed, removed } of marks) {
    const shownRemoved = showEliminations ? removed : []
    if (!placed.length && !shownRemoved.length) continue
    const cellMarks = candidates.get(cell) ?? new Map()
    cellMarks.set(digit, {
      mark: placed.length ? 'ring' : 'strike',
      color: branchColor(placed[0] ?? shownRemoved[0]),
      branchLabels: { placed: letters(placed) || undefined, removed: letters(shownRemoved) || undefined },
      label: [placed.length && `placed in ${branchNames(placed)}`, shownRemoved.length && `removed in ${branchNames(shownRemoved)}`]
        .filter(Boolean).join(', '),
    })
    candidates.set(cell, cellMarks)
  }
  return { candidates }
}

function editorAnnotations(entry: Entry, showEliminations: boolean): BoardAnnotations {
  const number = entry.branch.number
  const cells = new Map<number, CellAnnotation>()
  const candidates = new Map<number, Map<number, CandidateAnnotation>>()
  for (const fact of entry.analysis.facts) {
    if (fact.truth && Number(entry.analysis.values[fact.cell]) === fact.digit) {
      cells.set(fact.cell, { fill: `color-mix(in srgb, ${branchColor(number)} 24%, transparent)`, ink: branchColor(number),
        branchPlacement: fact.kind === 'assumption' || fact.kind === 'trial' ? fact.kind : 'derived',
        label: `${fact.kind === 'assumption' ? 'Assumed' : fact.kind === 'trial' ? 'Trial' : 'Forced'} placement in branch ${branchLetter(number)}` })
    } else if (!fact.truth && (showEliminations || fact.kind === 'assumption')) {
      const marks = candidates.get(fact.cell) ?? new Map()
      marks.set(fact.digit, { mark: 'strike', color: branchColor(number),
        label: fact.kind === 'assumption' ? 'Assumed removal' : fact.kind === 'trial' ? 'Trial removal' : 'Ruled out in this branch' })
      candidates.set(fact.cell, marks)
    }
  }
  return { cells, candidates }
}

/** Own the saved branch editor and derive a read-only comparison of branches with the same starting position. */
export function usePlayBranches({ game, values, visible, enabled, originConflict, selection, candidateMasks, candidateLoadFailed, updateGame, onEnter }: Options) {
  const workspace = game.branchWorkspace ?? initialWorkspace
  const [ui, setUi] = useState<{ gameId: string; view: View; eliminations: boolean; digit?: number }>({ gameId: game.id, view: idle, eliminations: false })
  const shown = ui.gameId === game.id && ui.eliminations
  const digit = ui.gameId === game.id ? ui.digit : undefined
  const view = visible && enabled && ui.gameId === game.id ? ui.view : idle
  const pending = view.kind === 'new' || view.kind === 'edit' ? view : undefined
  const puzzle = game.variant?.puzzle
  const rules = useMemo(() => visible && enabled && puzzle ? branchRules(puzzle) : classicRules, [visible, enabled, puzzle])
  const masks = useMemo(() => visible && enabled
    ? branchOriginMasks({ values, eliminations: game.position.eliminations, candidateMasks: candidateMasks ?? undefined }, rules)
    : noMasks, [values, game.position.eliminations, candidateMasks, rules, visible, enabled])
  const origin = useMemo<BranchOrigin>(() => ({ values, candidateMasks: masks }), [values, masks])
  const canCreate = visible && enabled && !originConflict && (!puzzle || candidateMasks != null) && branchOriginUsable(origin, masks, rules)
  const unavailable = !visible || !enabled || canCreate ? undefined : originConflict ? 'Resolve the conflicts on the main grid to start a branch.'
    : candidateLoadFailed ? 'Could not load candidates.' : puzzle && candidateMasks === undefined ? 'Loading candidates…'
      : 'Restore the starting candidates before creating a branch.'
  const entries = useMemo(() => visible && enabled ? workspace.branches.map(branch => ({ branch, analysis: analyzeBranch(branch, rules) })) : noEntries,
    [visible, enabled, workspace, rules])
  const id = view.kind === 'edit' || view.kind === 'compare' ? view.id : undefined
  const selected = entries.find(entry => entry.branch.id === id)
  const comparisonOrigin = selected?.branch.origin ?? origin
  const sameOrigin = useMemo(() => entries.filter(entry => sameBranchOrigin(entry.branch.origin, comparisonOrigin)), [entries, comparisonOrigin])
  const compareAll = view.kind === 'compare' && view.all
  const displayed = useMemo(() => view.kind === 'compare' ? compareAll ? sameOrigin.filter(({ branch }) => !branch.hidden) : selected ? [selected] : noEntries : noEntries,
    [view.kind, compareAll, sameOrigin, selected])
  const marks = useMemo(() => compareFacts(displayed).filter(mark => digit === undefined || mark.digit === digit), [displayed, digit])
  const differences = useMemo(() => {
    if (displayed.length < 2) return []
    const placements = marks.filter(mark => mark.placed.length)
    const differences: { message: string }[] = []
    const coordinate = (cell: number) => `R${Math.floor(cell / 9) + 1}C${cell % 9 + 1}`
    const acrossBranches = (a: readonly number[], b: readonly number[]) => a.some(id => b.some(other => other !== id))
    for (const [index, mark] of placements.entries()) {
      const { cell, digit, placed, removed } = mark
      for (const other of placements.slice(index + 1)) {
        if (!acrossBranches(placed, other.placed)) continue
        if (other.cell === cell) differences.push({ message: `${coordinate(cell)} is ${digit} in ${names(placed)} and ${other.digit} in ${names(other.placed)}.` })
        else if (other.digit === digit) {
          const reason = rules.exclusionReason(cell, other.cell, true)
          if (reason.type === 'house') differences.push({ message: `Branches ${names(placed)} and ${names(other.placed)} place ${digit} in different cells in ${reason.house.name}, ${coordinate(cell)} and ${coordinate(other.cell)}.` })
        }
      }
      if (shown && acrossBranches(placed, removed)) differences.push({ message: `${digit} in ${coordinate(cell)} is placed in ${names(placed)} and removed in ${names(removed)}.` })
    }
    return differences
  }, [displayed.length, marks, rules, shown])
  const displayMasks = useMemo(() => view.kind === 'compare' ? branchOriginMasks(comparisonOrigin, rules) : masks,
    [view.kind, comparisonOrigin, rules, masks])

  const checked = useMemo(() => {
    if (!shown || view.kind !== 'compare' || !displayed.length || !branchOriginUsable(comparisonOrigin, displayMasks, rules)) return []
    return branchResults(displayed, displayMasks, rules)
  }, [view.kind, comparisonOrigin, displayMasks, displayed, rules, shown])

  const board = useMemo(() => {
    if (view.kind === 'idle') return null
    if (view.kind === 'edit' && selected) {
      const { branch, analysis } = selected
      const annotations = editorAnnotations(selected, shown)
      const candidates = analysis.masks.map((mask, cell) => {
        const marks = annotations.candidates?.get(cell)
        if (marks) for (const digit of marks.keys()) mask |= 1 << (digit - 1)
        return mask
      })
      return { content: { values: analysis.values, candidates }, annotations, label: `Sudoku grid for branch ${branchLetter(branch.number)}` }
    }
    if (view.kind === 'compare') {
      const annotations = comparisonAnnotations(marks, shown)
      const candidates = displayMasks.map((_, cell) => {
        let mask = 0
        for (const digit of annotations.candidates?.get(cell)?.keys() ?? []) mask |= 1 << (digit - 1)
        return mask
      })
      const notes = digit === undefined ? { candidates } : { position: { center: candidates, corner: noCornerNotes } }
      return { content: { values: comparisonOrigin.values, ...notes }, annotations,
        label: view.all || !selected ? 'Sudoku grid comparing branches' : `Sudoku grid for branch ${branchLetter(selected.branch.number)}` }
    }
    if (view.kind === 'new' && canCreate) return { content: { values, candidates: masks }, annotations: undefined, label: 'Sudoku grid for choosing a branch assumption' }
    return null
  }, [view, selected, shown, comparisonOrigin, displayMasks, marks, digit, canCreate, values, masks])

  function changeView(next: View) {
    setUi(current => ({ gameId: game.id, view: next, eliminations: current.gameId === game.id && current.eliminations,
      digit: current.gameId === game.id ? current.digit : undefined }))
  }

  function save(change: (working: BranchWorkspace) => BranchWorkspace) {
    if (!enabled) return
    updateGame(current => {
      if (current.id !== game.id || current.paused || current.source === 'draft') return current
      const working = current.branchWorkspace ?? initialWorkspace
      const next = change(working)
      return next === working ? current : { ...current, branchWorkspace: next }
    })
  }

  function updateBranch(target: string, change: (branch: SavedBranch) => SavedBranch) {
    save(working => {
      const current = working.branches.find(branch => branch.id === target)
      if (!current) return working
      const next = change(current)
      return next === current ? working : { ...working, branches: working.branches.map(branch => branch === current ? next : branch) }
    })
  }

  function begin() {
    if (!canCreate) return
    onEnter()
    changeView({ kind: 'new', cell: selection !== null && masks[selection] ? selection : null, digit: null, truth: true })
  }

  function startEdit(branch: SavedBranch) {
    onEnter()
    changeView({ kind: 'edit', id: branch.id, cell: null, digit: null, truth: true })
  }

  function selectBranch(branch: SavedBranch) {
    onEnter()
    changeView({ kind: 'compare', id: branch.id, all: false })
  }

  function compare() {
    if (view.kind === 'compare' && view.all) changeView(selected ? { ...view, all: false } : idle)
    else {
      onEnter()
      changeView({ kind: 'compare', id, all: true })
    }
  }

  function stop() { changeView(idle) }

  function done() {
    if (view.kind === 'edit') changeView({ kind: 'compare', id: view.id, all: false })
    else stop()
  }

  const sourceMasks = useMemo(() => view.kind === 'edit' && selected ? branchOriginMasks(selected.branch.origin, rules) : masks,
    [view.kind, selected, rules, masks])

  function editable(cell: number, digit: number) {
    if (!pending || !contains(sourceMasks[cell], digit)) return false
    if (pending.kind === 'new') return canCreate
    if (!selected || selected.analysis.conflict) return false
    const placed = Number(selected.analysis.values[cell])
    return pending.truth ? placed !== digit : placed === digit || contains(selected.analysis.masks[cell], digit)
  }

  function enter(cell: number, digit: number) {
    if (!pending || !editable(cell, digit)) return
    const move = { cell, digit, truth: pending.truth }
    if (pending.kind === 'new') {
      const id = createUuid()
      save(working => working.branches.some(branch => branch.id === id) ? working : { nextNumber: working.nextNumber + 1,
        branches: [...working.branches, { id, number: working.nextNumber, origin,
          assumption: move, edits: [], cursor: 0 }] })
      changeView({ kind: 'edit', id, cell, digit: pending.digit, truth: pending.digit === null || pending.truth })
    } else {
      updateBranch(pending.id, branch => ({ ...branch, edits: [...branch.edits.slice(0, branch.cursor), move], cursor: branch.cursor + 1 }))
      changeView({ ...pending, cell })
    }
  }

  function selectCell(cell: number, applyDigit = true) {
    if (!pending) return
    if (applyDigit && pending.digit !== null && editable(cell, pending.digit)) enter(cell, pending.digit)
    else changeView({ ...pending, cell })
  }

  function input(digit: number, cell?: number) {
    if (!pending) return
    if (cell !== undefined) enter(cell, digit)
    else if (pending.digit !== null || pending.cell === null) changeView({ ...pending, digit: pending.digit === digit ? null : digit })
    else enter(pending.cell, digit)
  }

  function undo(offset: -1 | 1) {
    if (view.kind !== 'edit') return
    updateBranch(view.id, branch => {
      const cursor = Math.max(0, Math.min(branch.edits.length, branch.cursor + offset))
      return cursor === branch.cursor ? branch : { ...branch, cursor }
    })
  }

  function remove(branch: SavedBranch) {
    save(working => ({ ...working, branches: working.branches.filter(item => item.id !== branch.id) }))
    if (id === branch.id) changeView(view.kind === 'compare' && view.all ? { kind: 'compare', all: true } : idle)
  }

  return { view, pending, board, entries, selected, sameOrigin, marks, differences,
    checked: digit === undefined ? checked : checked.filter(result => result.move.digit === digit),
    origin, canCreate, unavailable, shown, digit,
    begin, startEdit, selectBranch, compare, stop, done, selectCell, input, undo, remove,
    canInput: (digit: number) => Boolean(pending && !selected?.analysis.conflict &&
      (pending.digit !== null || pending.cell === null || editable(pending.cell, digit))),
    setTruth: (truth: boolean) => { if (pending) changeView({ ...pending, truth }) },
    toggleEliminations: () => setUi(current => ({ gameId: game.id, view, eliminations: !shown, digit: current.gameId === game.id ? current.digit : undefined })),
    setDigit: (digit: number | undefined) => setUi({ gameId: game.id, view, eliminations: shown, digit }),
    toggleVisibility: (branch: SavedBranch) => updateBranch(branch.id, item => ({ ...item, hidden: item.hidden ? undefined : true })),
    toggleTrace: (branch: SavedBranch) => updateBranch(branch.id, item => ({ ...item, trace: item.trace ? undefined : true })),
  }
}
