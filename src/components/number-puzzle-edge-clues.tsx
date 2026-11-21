import type { ReactNode } from 'react'
import type { Inequality } from '../futoshiki/inequality-rules'
import { cellLabel, type LatinHint, type LatinRule } from '../latin/engine'
import { adjacentClueLabel, type AdjacentClues } from '../latin/adjacent-clues'
import { sumLabel } from '../sudoku/variants'
import './number-puzzle-edge-clues.css'

export const inequalityTechniqueNames = {
  'inequality': 'Inequality',
  'inequality-line': 'Inequalities in a line',
  'inequality-bound': 'Shared inequality bound',
  'inequality-chain-line': 'Inequality chains in a line',
  'line-digit-bound': 'Line digit bounds',
  'inequality-line-matching': 'Inequality line matching',
} as const satisfies Partial<Record<NonNullable<LatinRule['kind']>, string>>
export const inequalityTechniques = Object.values(inequalityTechniqueNames)

export function advancedInequalityTechnique(hint: LatinHint) {
  for (const kind of ['line-digit-bound', 'inequality-chain-line', 'inequality-bound', 'inequality-line'] as const) {
    if (hint.rules.some(rule => rule.kind === kind)) return inequalityTechniqueNames[kind]
  }
}

export function numberPuzzleEdgeClues(size: number, inequalities: readonly Inequality[], adjacent?: AdjacentClues) {
  const clues = new Map<number, { labels: string[]; signs: ReactNode[] }>()
  const edges = new Map<number, { first: number; second: number; signs: ReactNode[] }>()
  function at(cell: number) {
    const clue = clues.get(cell) ?? { labels: [], signs: [] }
    clues.set(cell, clue)
    return clue
  }
  function add(first: number, second: number, label: string, sign: ReactNode) {
    at(first).labels.push(label)
    at(second).labels.push(label)
    const key = first * size ** 2 + second
    const edge = edges.get(key) ?? { first, second, signs: [] }
    edge.signs.push(sign)
    edges.set(key, edge)
  }
  for (const { less, greater } of inequalities) {
    const first = Math.min(less, greater)
    const second = Math.max(less, greater)
    add(first, second, `${cellLabel(less, size)} is less than ${cellLabel(greater, size)}`,
      <span key="inequality" className="futoshiki-sign">{less === first ? '<' : '>'}</span>)
  }
  const marks = adjacent?.marks.slice().sort((a, b) => a.type.localeCompare(b.type)) ?? []
  for (const mark of marks) {
    const [a, b] = mark.cells
    const text = mark.type === 'sum' ? sumLabel(mark.value)
      : mark.value === (mark.type === 'difference' ? 1 : 2) ? '' : mark.value
    add(Math.min(a, b), Math.max(a, b), adjacentClueLabel(mark, size),
      <span key={mark.type} className="number-puzzle-edge-clue" data-kind={mark.type}>{text}</span>)
  }
  for (const { first, second, signs } of edges.values()) {
    at(first).signs.push(<span key={second} className="number-puzzle-edge-clues"
      data-side={second - first === size ? 'bottom' : 'right'} data-multiple={signs.length > 1} aria-hidden="true">
      {signs}
    </span>)
  }
  return clues
}
