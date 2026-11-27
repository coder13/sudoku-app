import { useLayoutEffect, useMemo, useState } from 'react'
import type { BoardAnnotations, CandidateAnnotation, CellAnnotation } from '../BoardAnnotations'
import { analyzeBranch, branchLetter, branchOriginMasks, branchOriginUsable, branchResults, branchRules, recordBranchInput, sameBranchOrigin,
  type BranchAnalysis, type BranchMove, type BranchOrigin, type BranchWorkspace, type SavedBranch } from '../../sudoku/branches'
import { makeGame, type Game } from '../../sudoku/game'
import { createUuid } from '../../uuid'

type View =
  | { kind: 'idle' }
  | { kind: 'edit'; draft: SavedBranch }
  | { kind: 'compare'; id?: string; all: boolean }

type Entry = { branch: SavedBranch; analysis: BranchAnalysis }
type ComparisonMark = { cell: number; digit: number; placed: number[]; removed: number[] }
type Options = { game: Game; values: string; visible: boolean; open: boolean; editPanelActive: boolean; enabled: boolean; originConflict: boolean;
  candidateMasks?: readonly number[] | null; candidateLoadFailed?: boolean;
  updateGame: (change: (current: Game) => Game) => void; onStartEditing: () => void }

const initialWorkspace: BranchWorkspace = { branches: [], nextNumber: 1 }
const classicRules = branchRules()
const noEntries: Entry[] = []
const noMasks: readonly number[] = []
const idle: View = { kind: 'idle' }
const colors = ['blue', 'orange', 'purple', 'teal', 'pink', 'green', 'indigo', 'red']
export const branchColor = (number: number) => `var(--chain-${colors[(number - 1) % colors.length]})`
const letters = (ids: readonly number[]) => ids.map(branchLetter).join(ids.some(id => id > 26) ? '·' : '')
const names = (ids: readonly number[]) => ids.map(branchLetter).join(', ')
const branchNames = (ids: readonly number[]) => `${ids.length === 1 ? 'branch' : 'branches'} ${names(ids)}`

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
    } else if (!fact.truth && showEliminations) {
      const marks = candidates.get(fact.cell) ?? new Map()
      marks.set(fact.digit, { mark: 'strike', color: branchColor(number),
        label: fact.kind === 'assumption' ? 'Assumed removal' : fact.kind === 'trial' ? 'Trial removal' : 'Ruled out in this branch' })
      candidates.set(fact.cell, marks)
    }
  }
  return { cells, candidates }
}

function editorGame({ branch, analysis }: Entry) {
  const game = makeGame(branch.id, `Branch ${branchLetter(branch.number)}`, branch.origin.values, 'imported', 0)
  return { ...game, position: { ...game.position,
    entries: Array.from(analysis.values, (digit, cell) => branch.origin.values[cell] === '0' ? digit : '0').join(''),
    corner: [...analysis.masks],
  } }
}

/** Own branch editing and derive overlays for the live grid. */
export function usePlayBranches({ game, values, visible, open, editPanelActive, enabled, originConflict,
  candidateMasks, candidateLoadFailed, updateGame, onStartEditing }: Options) {
  const workspace = game.branchWorkspace ?? initialWorkspace
  const [ui, setUi] = useState<{ gameId: string; view: View; eliminations: boolean; digit?: number }>({ gameId: game.id, view: idle, eliminations: false })
  const shown = ui.gameId === game.id && ui.eliminations
  const digit = ui.gameId === game.id ? ui.digit : undefined
  const view = enabled && open && ui.gameId === game.id ? ui.view : idle
  const editing = view.kind === 'edit'
  useLayoutEffect(() => {
    if (open && editPanelActive) return
    setUi(current => {
      if (current.gameId !== game.id || current.view.kind !== 'edit') return current
      const { id } = current.view.draft
      return { ...current, view: open && workspace.branches.some(branch => branch.id === id && branch.cursor > 0)
        ? { kind: 'compare', id, all: false } : idle }
    })
  }, [game.id, open, editPanelActive, workspace])
  const puzzle = game.variant?.puzzle
  const rules = useMemo(() => open && enabled && puzzle ? branchRules(puzzle) : classicRules, [open, enabled, puzzle])
  const masks = useMemo(() => open && enabled
    ? branchOriginMasks({ values, eliminations: game.position.eliminations, candidateMasks: candidateMasks ?? undefined }, rules)
    : noMasks, [values, game.position.eliminations, candidateMasks, rules, open, enabled])
  const origin = useMemo<BranchOrigin>(() => ({ values, candidateMasks: masks }), [values, masks])
  const canCreate = visible && enabled && !originConflict && (!puzzle || candidateMasks != null) && branchOriginUsable(origin, masks, rules)
  const unavailable = !visible || !enabled || canCreate ? undefined : originConflict ? 'Resolve the conflicts on the main grid to start a branch.'
    : candidateLoadFailed ? 'Could not load candidates.' : puzzle && candidateMasks === undefined ? 'Loading candidates…'
      : 'Restore the starting candidates before creating a branch.'
  const entries = useMemo(() => open && enabled ? workspace.branches.map(branch => ({ branch, analysis: analyzeBranch(branch, rules) })) : noEntries,
    [open, enabled, workspace, rules])
  const id = editing ? view.draft.id : view.kind === 'compare' ? view.id : undefined
  const selected = entries.find(entry => entry.branch.id === id)
  const editor = useMemo(() => editing ? selected ?? { branch: view.draft, analysis: analyzeBranch(view.draft, rules) } : undefined,
    [editing, selected, view, rules])
  const scratch = useMemo(() => editor ? editorGame(editor) : undefined, [editor])
  const comparisonOrigin = selected?.branch.origin ?? origin
  const sameOrigin = useMemo(() => entries.filter(entry => entry.analysis.moves.length && sameBranchOrigin(entry.branch.origin, comparisonOrigin)),
    [entries, comparisonOrigin])
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

  const overlay = useMemo(() => {
    const annotations = comparisonAnnotations(marks, shown)
    return annotations.candidates?.size ? annotations : undefined
  }, [marks, shown])
  const board = useMemo(() => {
    if (!editor) return null
    const { branch, analysis } = editor
    const annotations = editorAnnotations(editor, shown)
    const candidates = analysis.masks.map((mask, cell) => {
      const marks = annotations.candidates?.get(cell)
      if (marks) for (const digit of marks.keys()) mask |= 1 << (digit - 1)
      return mask
    })
    return { content: { values: analysis.values, candidates }, annotations, label: `Sudoku grid for branch ${branchLetter(branch.number)}` }
  }, [editor, shown])

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
    if (editing && !selected) {
      stopEditing()
      return
    }
    onStartEditing()
    changeView({ kind: 'edit', draft: { id: createUuid(), number: workspace.nextNumber, origin, history: [], cursor: 0 } })
  }

  function toggleEdit(branch: SavedBranch) {
    if (editing && id === branch.id) {
      stopEditing()
      return
    }
    onStartEditing()
    changeView({ kind: 'edit', draft: branch })
  }

  function selectBranch(branch: SavedBranch) {
    changeView(view.kind === 'compare' && !view.all && id === branch.id ? idle : { kind: 'compare', id: branch.id, all: false })
  }

  function compare() {
    changeView(compareAll ? idle : { kind: 'compare', id: selected?.branch.id, all: true })
  }

  function stopEditing() {
    if (!editing) return
    changeView(selected?.analysis.moves.length ? { kind: 'compare', id, all: false } : idle)
  }

  function edit(transform: (current: Game) => Game) {
    if (!editor || !scratch) return
    save(working => {
      const existing = working.branches.find(branch => branch.id === editor.branch.id)
      if (selected && !existing) return working
      const branch = existing ?? { ...editor.branch, number: working.nextNumber }
      const analysis = !existing || existing === editor.branch ? editor.analysis : analyzeBranch(branch, rules)
      const before = analysis === editor.analysis ? scratch : editorGame({ branch, analysis })
      const next = recordBranchInput(branch, analysis, before.position, transform(before).position, rules)
      if (next === branch) return working
      return existing ? { ...working, branches: working.branches.map(item => item === existing ? next : item) }
        : { nextNumber: working.nextNumber + 1, branches: [...working.branches, next] }
    })
  }

  function undo(offset: -1 | 1) {
    if (!editing) return
    updateBranch(view.draft.id, branch => {
      const cursor = Math.max(0, Math.min(branch.history.length, branch.cursor + offset))
      return cursor === branch.cursor ? branch : { ...branch, cursor }
    })
  }

  function remove(branch: SavedBranch) {
    save(working => ({ ...working, branches: working.branches.filter(item => item.id !== branch.id) }))
    if (id === branch.id) changeView(view.kind === 'compare' && view.all ? { kind: 'compare', all: true } : idle)
  }

  return { view, editing, scratch, board, overlay, entries, selected, sameOrigin, marks, differences,
    checked: digit === undefined ? checked : checked.filter(result => result.move.digit === digit),
    origin, canCreate, unavailable, shown, digit,
    begin, toggleEdit, selectBranch, compare, stopEditing, edit, undo, remove,
    toggleEliminations: () => setUi(current => ({ gameId: game.id, view, eliminations: !shown, digit: current.gameId === game.id ? current.digit : undefined })),
    setDigit: (digit: number | undefined) => setUi({ gameId: game.id, view, eliminations: shown, digit }),
    toggleVisibility: (branch: SavedBranch) => updateBranch(branch.id, item => ({ ...item, hidden: item.hidden ? undefined : true })),
    toggleTrace: (branch: SavedBranch) => updateBranch(branch.id, item => ({ ...item, trace: item.trace ? undefined : true })),
  }
}
