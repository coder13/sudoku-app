import { useRef, useState, type PointerEvent } from 'react'
import type { VariantPuzzle } from '../sudoku/engine'
import { hasCandidate } from '../sudoku/game'
import { digitLocations, findHouseSubsets, selectedDigits, sharedSubsetHouses, SUBSET_SCOPES, subsetHouseCells, type SubsetKind, type SubsetScope } from '../sudoku/subsets'
import type { PlayGrid } from '../sudoku/grid'
import type { BoardAnnotations, CandidateAnnotation, CellAnnotation } from './BoardAnnotations'

type Reveal = { masks: readonly number[]; match: number; stage: 'location' | 'pattern' | 'removals' }
type Sweep = { pointerId: number; cell: number; scope?: 'row' | 'column' }

export function useSubsets(masks: readonly number[] | null, grid: PlayGrid, puzzle?: VariantPuzzle) {
  const [kind, setKind] = useState<SubsetKind>('hidden')
  const [scope, setScope] = useState<SubsetScope>('box')
  const [anchor, setAnchor] = useState<number | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [reveal, setReveal] = useState<Reveal>()
  const sweep = useRef<Sweep>(null)
  const [preview, setPreview] = useState<Pick<Sweep, 'cell' | 'scope'>>()
  const { size } = grid
  const selectedCells = kind === 'naked' && masks ? selected.filter((cell) => masks[cell]) : []
  const anchorCells = selectedCells.length ? selectedCells : anchor === null ? [] : [anchor]
  const houses = sharedSubsetHouses(anchorCells, grid, puzzle)
  const activeScope = houses[scope] ? scope : SUBSET_SCOPES.find((choice) => houses[choice]) ?? scope
  const house = houses[activeScope]
  const cells = house ? subsetHouseCells(house, grid, puzzle) : []
  const emptyCells = masks ? cells.filter((cell) => masks[cell]) : []
  const locations = Array.from({ length: size }, (_, i) => masks ? digitLocations(emptyCells, masks, i + 1) : [])
  const picks = kind === 'hidden' ? selected.filter((digit) => locations[digit - 1]?.length) : selectedCells
  const digits = kind === 'naked' && masks ? selectedDigits(picks, masks) : picks
  const activeReveal = reveal?.masks === masks ? reveal : undefined
  const found = activeReveal && findHouseSubsets(cells, activeReveal.masks, kind)
  const match = activeReveal && found?.[activeReveal.match]
  const stage = activeReveal?.stage
  const showMatch = match && stage !== 'location'

  function chooseKind(next: SubsetKind) {
    if (next === kind) return
    setKind(next)
    setSelected([])
    setReveal(undefined)
  }

  function chooseScope(next: SubsetScope) {
    setScope(next)
    setReveal(undefined)
  }

  function selectCell(cell: number) {
    if (kind === 'hidden') {
      setAnchor(cell)
    } else {
      if (!masks?.[cell]) return
      const next = picks.includes(cell) ? picks.filter((pick) => pick !== cell) : [...picks, cell]
      const shared = sharedSubsetHouses(next, grid, puzzle)
      const nextScope = shared[activeScope] ? activeScope : SUBSET_SCOPES.find((choice) => shared[choice])
      const nextCells = nextScope || !next.length ? next : [cell]
      setAnchor(nextCells[0] ?? cell)
      setSelected(nextCells)
      setScope(nextScope ?? scope)
    }
    setReveal(undefined)
  }

  function toggleDigit(digit: number) {
    if (kind !== 'hidden' || !locations[digit - 1]?.length) return
    setSelected(selected.includes(digit) ? selected.filter((pick) => pick !== digit) : [...selected, digit])
    setReveal(undefined)
  }

  function startSweep(cell: number, event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return
    sweep.current = { cell, pointerId: event.pointerId }
  }

  function moveSweep(cell: number | null, event: PointerEvent) {
    const drag = sweep.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.buttons === 0) {
      endSweep(event)
      return
    }
    if (cell === null || cell === drag.cell) return
    const rows = Math.abs(Math.floor(cell / size) - Math.floor(drag.cell / size))
    const columns = Math.abs(cell % size - drag.cell % size)
    if (rows === columns) return
    const nextScope = rows > columns ? 'column' : 'row'
    if (drag.scope === nextScope) return
    if (!drag.scope) event.currentTarget.setPointerCapture(event.pointerId)
    drag.scope = nextScope
    setPreview({ cell: drag.cell, scope: nextScope })
  }

  function endSweep(event: PointerEvent) {
    const drag = sweep.current
    if (!drag || drag.pointerId !== event.pointerId) return
    sweep.current = null
    setPreview(undefined)
    if (event.type === 'pointerup' && drag.scope) {
      setAnchor(drag.cell)
      chooseScope(drag.scope)
    }
  }

  function find() {
    if (!masks) return
    setReveal({ masks, match: 0, stage: 'location' })
  }

  function advance() {
    if (!activeReveal || activeReveal.stage === 'removals') return
    setReveal({ ...activeReveal, stage: activeReveal.stage === 'location' ? 'pattern' : 'removals' })
  }

  function selectMatch(offset: number) {
    if (!activeReveal || !found?.length) return
    const match = (activeReveal.match + offset + found.length) % found.length
    setReveal({ ...activeReveal, match, stage: 'location' })
  }

  let annotations: BoardAnnotations | undefined
  if (masks) {
    const previewHouse = kind === 'hidden' && preview?.scope && sharedSubsetHouses([preview.cell], grid, puzzle)[preview.scope]
    const area = previewHouse ? subsetHouseCells(previewHouse, grid, puzzle) : cells
    const houseMarks = new Map<number, CellAnnotation>(area.map((cell) => [cell, { fill: 'var(--subset-scope-fill)' }]))
    const marks = new Map<number, Map<number, CandidateAnnotation>>()
    const markedCells = previewHouse ? [] : showMatch ? match.cells : kind === 'hidden' ? [...new Set(picks.flatMap((digit) => locations[digit - 1]))] : picks
    const markedDigits = showMatch ? match.digits : digits
    for (const cell of markedCells) {
      houseMarks.set(cell, { fill: 'var(--lesson-pattern-fill)', label: 'selected for subset inspection' })
      marks.set(cell, new Map(markedDigits.filter((digit) => hasCandidate(masks[cell], digit))
        .map((digit) => [digit, { color: 'var(--lesson-pattern)', label: 'selected candidate' }])))
    }
    if (!previewHouse && stage === 'removals' && match) {
      for (const { cell, digit } of match.removals) {
        const cellMarks = marks.get(cell) ?? new Map<number, CandidateAnnotation>()
        cellMarks.set(digit, { color: 'var(--lesson-removal)', label: 'can be removed', mark: 'strike' })
        marks.set(cell, cellMarks)
      }
    }
    annotations = { cells: houseMarks, candidates: marks }
  }

  return {
    kind, house, houses, scope: activeScope, locations, emptyCells, picks, digits,
    chooseScope, chooseKind, selectCell, toggleDigit, annotations, startSweep, moveSweep, endSweep,
    clue: { total: found?.length, match, stage, index: reveal?.match ?? 0, find, advance, selectMatch, clear: () => setReveal(undefined) },
  }
}
