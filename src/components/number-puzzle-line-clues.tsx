import type { Inequality } from '../futoshiki/inequality-rules'
import { cellLabel } from '../latin/engine'
import { lockoutMinimumGap } from '../latin/endpoint-lines'
import { pathClueNames, pathClueNotes, type LatinClues } from '../latin/path-clues'
import { whispersRuleNote, whispersTechnique } from '../latin/whispers'
import { ArrowClue } from './ArrowClue'
import { EndpointLineClues } from './EndpointLineClues'
import { PuzzlePathClue } from './PuzzlePathClue'
import { RenbanClue } from './RenbanClue'
import { WhispersLineClue, WhispersLineLabel } from './WhispersClue'

export function numberPuzzleLines(
  size: number, inequalities: readonly Inequality[], { adjacentClues, whispers = [], pathClues = [] }: LatinClues,
) {
  if (!whispers.length && !pathClues.length) return
  const key = (a: number, b: number) => Math.min(a, b) * size ** 2 + Math.max(a, b)
  const markedEdges = new Set(inequalities.map(({ less, greater }) => key(less, greater)))
  for (const { cells: [a, b] } of adjacentClues?.marks ?? []) markedEdges.add(key(a, b))
  const labels = new Map<number, Set<string>>()
  const addLabel = (cell: number, text: string) => {
    const current = labels.get(cell) ?? new Set()
    current.add(text)
    labels.set(cell, current)
  }
  for (const { cells, minDifference } of whispers) {
    for (let index = 1; index < cells.length; index++) {
      const a = cells[index - 1], b = cells[index]
      for (const [cell, other] of [[a, b], [b, a]]) {
        addLabel(cell, `Whispers line with ${cellLabel(other, size)}, difference at least ${minDifference}`)
      }
    }
  }
  for (const { type, cells, segments } of pathClues) {
    if (type === 'consecutive') {
      for (const path of segments ?? [cells]) {
        if (path.length === 1) addLabel(path[0], 'Consecutive Line')
        for (let index = 1; index < path.length; index++) {
          const a = path[index - 1], b = path[index]
          addLabel(a, `Consecutive Line, next to ${cellLabel(b, size)}`)
          addLabel(b, `Consecutive Line, next to ${cellLabel(a, size)}`)
        }
      }
    } else if (type === 'arrow') {
      const [bulb, ...path] = cells
      addLabel(bulb, `Arrow bulb, sum of ${path.map(cell => cellLabel(cell, size)).join(', ')}`)
      for (const cell of path) addLabel(cell, `Arrow with its bulb at ${cellLabel(bulb, size)}`)
    } else if (type === 'thermometer') {
      addLabel(cells[0], 'Thermometer bulb')
      if (cells.length > 1) addLabel(cells.at(-1)!, 'Thermometer tip')
      for (let index = 1; index < cells.length; index++) {
        const a = cells[index - 1], b = cells[index]
        addLabel(a, `Thermometer, less than ${cellLabel(b, size)}`)
        addLabel(b, `Thermometer, greater than ${cellLabel(a, size)}`)
      }
    } else if (type === 'between') {
      const first = cellLabel(cells[0], size), last = cellLabel(cells.at(-1)!, size)
      addLabel(cells[0], `Between Line end circle, other end at ${last}`)
      addLabel(cells.at(-1)!, `Between Line end circle, other end at ${first}`)
      for (const cell of cells.slice(1, -1)) {
        addLabel(cell, `Between Line, digit strictly between the digits at ${first} and ${last}`)
      }
    } else if (type === 'lockout') {
      const first = cellLabel(cells[0], size), last = cellLabel(cells.at(-1)!, size)
      addLabel(cells[0], `Lockout diamond, difference of at least ${lockoutMinimumGap} with ${last}`)
      addLabel(cells.at(-1)!, `Lockout diamond, difference of at least ${lockoutMinimumGap} with ${first}`)
      for (const cell of cells.slice(1, -1)) {
        addLabel(cell, `Lockout Line, digit below both or above both diamonds at ${first} and ${last}`)
      }
    } else if (type === 'renban') {
      for (const cell of cells) addLabel(cell, `Renban line of ${cells.length} consecutive digits`)
    } else {
      for (const [index, cell] of cells.entries()) {
        const mirror = cells[cells.length - 1 - index]
        addLabel(cell, mirror === cell ? 'Center of Palindrome Line' : `Palindrome Line, same digit as ${cellLabel(mirror, size)}`)
      }
    }
  }
  const drawing = <svg className="number-puzzle-line-clues" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    {pathClues.filter(line => line.type === 'thermometer').map((line, index) => <PuzzlePathClue key={`thermometer-${index}`} line={line} size={size} />)}
    {pathClues.filter(line => line.type === 'renban').map((line, index) => <RenbanClue key={`renban-${index}`} {...line} number={index + 1} size={size} />)}
    {pathClues.filter(line => line.type === 'palindrome').map((line, index) => <PuzzlePathClue key={`palindrome-${index}`} line={line} size={size} />)}
    {whispers.map((line, index) => <WhispersLineClue key={`whispers-${index}`} line={line} size={size} />)}
    {pathClues.filter(line => line.type === 'consecutive').map((line, index) => <PuzzlePathClue key={`consecutive-${index}`} line={line} size={size} />)}
    {pathClues.filter(line => line.type === 'arrow').map(({ cells: [circle, ...cells] }, index) =>
      <ArrowClue key={`arrow-${index}`} circle={circle} cells={cells} size={size} />)}
    {(['between', 'lockout'] as const).map(kind =>
      <EndpointLineClues key={kind} kind={kind} paths={pathClues.filter(line => line.type === kind).map(line => line.cells)} size={size} />)}
    {whispers.map((line, index) => <WhispersLineLabel key={`gap-${index}`} line={line} size={size} markedEdges={markedEdges} />)}
  </svg>
  const types = new Set(pathClues.map(line => line.type))
  return {
    drawing, labels,
    notes: [...(whispers.length ? [whispersRuleNote] : []), ...Array.from(types, type => pathClueNotes[type])],
    techniques: [...(whispers.length ? [whispersTechnique] : []), ...Array.from(types, type => pathClueNames[type])],
  }
}
