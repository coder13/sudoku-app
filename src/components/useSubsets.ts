import { useState } from 'react'
import type { House, VariantPuzzle } from '../sudoku/engine'
import { hasCandidate } from '../sudoku/game'
import { digitLocations, findHouseSubsets, selectedDigits, subsetHouseCells, type SubsetKind } from '../sudoku/subsets'
import type { PlayGrid } from '../sudoku/grid'
import type { BoardAnnotations, CandidateAnnotation, CellAnnotation } from './BoardAnnotations'

type Reveal = { masks: readonly number[]; match: number; stage: 'location' | 'pattern' | 'removals' }

export function useSubsets(masks: readonly number[] | null, grid: PlayGrid, puzzle?: VariantPuzzle) {
  const [kind, setKind] = useState<SubsetKind>('hidden')
  const [houseIndex, setHouseIndex] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  const [reveal, setReveal] = useState<Reveal>()
  const { size } = grid
  const index = houseIndex % (size * 3)
  const house: House = index < size ? { row: index } : index < size * 2
    ? { column: index - size } : { box: index - size * 2 }
  const cells = subsetHouseCells(house, grid, puzzle)
  const emptyCells = masks ? cells.filter((cell) => masks[cell]) : []
  const locations = Array.from({ length: size }, (_, i) => masks ? digitLocations(emptyCells, masks, i + 1) : [])
  const picks = selected.filter((item) => kind === 'hidden' ? locations[item - 1]?.length : emptyCells.includes(item))
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

  function chooseHouse(next: number) {
    setHouseIndex(next)
    setSelected([])
    setReveal(undefined)
  }

  function toggle(item: number) {
    setSelected(picks.includes(item) ? picks.filter((pick) => pick !== item) : [...picks, item])
    setReveal(undefined)
  }

  function find() {
    if (!masks) return
    setSelected([])
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
    const houseMarks = new Map<number, CellAnnotation>(cells.map((cell) => [cell, { fill: 'var(--lesson-area-fill)' }]))
    const marks = new Map<number, Map<number, CandidateAnnotation>>()
    const markedCells = showMatch ? match.cells : kind === 'hidden' ? [...new Set(picks.flatMap((digit) => locations[digit - 1]))] : picks
    const markedDigits = showMatch ? match.digits : digits
    for (const cell of markedCells) {
      houseMarks.set(cell, { fill: 'var(--lesson-pattern-fill)', label: 'selected for subset inspection' })
      marks.set(cell, new Map(markedDigits.filter((digit) => hasCandidate(masks[cell], digit))
        .map((digit) => [digit, { color: 'var(--lesson-pattern)', label: 'selected candidate' }])))
    }
    if (stage === 'removals' && match) {
      for (const { cell, digit } of match.removals) {
        const cellMarks = marks.get(cell) ?? new Map<number, CandidateAnnotation>()
        cellMarks.set(digit, { color: 'var(--lesson-removal)', label: 'can be removed', mark: 'strike' })
        marks.set(cell, cellMarks)
      }
    }
    annotations = { cells: houseMarks, candidates: marks }
  }

  return {
    kind, house, houseIndex: index, locations, emptyCells, picks, digits,
    chooseHouse, chooseKind, toggle, annotations,
    clue: { total: found?.length, match, stage, index: reveal?.match ?? 0, find, advance, selectMatch, clear: () => setReveal(undefined) },
  }
}
