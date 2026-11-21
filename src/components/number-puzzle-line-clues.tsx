import type { Inequality } from '../futoshiki/inequality-rules'
import { latinDiagonalNames, latinDiagonalTechnique } from '../latin/diagonals'
import { cellLabel } from '../latin/engine'
import { lockoutMinimumGap } from '../latin/endpoint-lines'
import { extraRegionNote, extraRegionTechnique, unnumberedCageNote, unnumberedCageTechnique } from '../latin/extra-regions'
import { groupLineNames, groupLineNote } from '../latin/group-line'
import { globalEntropyNote, globalEntropyTechnique } from '../latin/global-entropy'
import { minMaxName, minMaxNeighbors } from '../latin/min-max'
import { latinParityTechnique } from '../latin/parity'
import { pathClueNames, pathClueNotes, type LatinClues } from '../latin/path-clues'
import { pillDigitCells } from '../latin/pill-arrow'
import { whispersRuleNote, whispersTechnique } from '../latin/whispers'
import { regionsInsideArtwork } from '../number-puzzles/authored-region-borders'
import { gridDiagonalCells } from '../sudoku/grid'
import { coloredLineOverlapLanes } from '../sudoku/line-geometry'
import { antiKingNote, antiKingTechnique } from '../sudoku/anti-king'
import { antiKnightNote, antiKnightTechnique } from '../sudoku/anti-knight'
import type { AuthoredCornerPath } from '../sudoku/authored-artwork'
import { quadrupleCells, quadrupleNote, quadrupleTechnique } from '../sudoku/quadruple'
import { ArrowClue, PillArrowClue } from './ArrowClue'
import { EndpointLineClues } from './EndpointLineClues'
import { MinMaxClue } from './MinMaxClue'
import { ParityClue } from './ParityClue'
import { PuzzlePathClue } from './PuzzlePathClue'
import { QuadrupleClue } from './QuadrupleClue'
import { RenbanClue } from './RenbanClue'
import { Cage, ColoredLineLane, DiagonalClue, ExtraRegion } from './VariantClues'
import { WhispersLineClue, WhispersLineLabel } from './WhispersClue'

export function numberPuzzleClues(
  size: number, inequalities: readonly Inequality[],
  { adjacentClues, whispers = [], pathClues = [], extraRegions = [], unnumberedCages = [], globalEntropy, quadruples = [], parity = [], antiKnight, antiKing, diagonals = [], minMax = [] }: LatinClues,
  artwork?: readonly AuthoredCornerPath[],
) {
  const hasDrawing = whispers.length > 0 || pathClues.length > 0 || extraRegions.length > 0 || unnumberedCages.length > 0 || quadruples.length > 0 || parity.length > 0 || diagonals.length > 0 || minMax.length > 0
  if (!hasDrawing && !globalEntropy && !antiKnight && !antiKing) return
  const key = (a: number, b: number) => Math.min(a, b) * size ** 2 + Math.max(a, b)
  const markedEdges = new Set(inequalities.map(({ less, greater }) => key(less, greater)))
  for (const { cells: [a, b] } of adjacentClues?.marks ?? []) markedEdges.add(key(a, b))
  const labels = new Map<number, Set<string>>()
  const addLabel = (cell: number, text: string) => {
    const current = labels.get(cell) ?? new Set()
    current.add(text)
    labels.set(cell, current)
  }
  for (const diagonal of diagonals) {
    for (const cell of gridDiagonalCells(size, diagonal)) addLabel(cell, latinDiagonalNames[diagonal])
  }
  const minMaxTechniques = new Set<string>()
  for (const { cells, maximum } of minMax) {
    const name = minMaxName(maximum)
    minMaxTechniques.add(name)
    const group = new Set(cells)
    for (const cell of cells) {
      const neighbors = minMaxNeighbors(size, cell, group).map(neighbor => cellLabel(neighbor, size))
      addLabel(cell, neighbors.length ? `${name} cell, ${maximum ? 'larger' : 'smaller'} than ${neighbors.join(', ')}` : `${name} cell`)
    }
  }
  const odd: number[] = [], even: number[] = []
  for (const { cell, parity: kind } of parity) {
    if (kind === 'odd') {
      odd.push(cell)
      addLabel(cell, 'odd circle, digit must be odd')
    } else {
      even.push(cell)
      addLabel(cell, 'even square, digit must be even')
    }
  }
  for (const [index, cells] of extraRegions.entries()) {
    for (const cell of cells) addLabel(cell, `Extra region ${index + 1}`)
  }
  for (const [index, cells] of unnumberedCages.entries()) {
    for (const cell of cells) addLabel(cell, `Unnumbered cage ${index + 1}, no repeated digits`)
  }
  for (const { topLeft, digits } of quadruples) {
    const cells = quadrupleCells(topLeft, size)
    markedEdges.add(key(cells[0], cells[3]))
    markedEdges.add(key(cells[1], cells[2]))
    const label = `Quadruple ${digits.join(', ')} touching ${cellLabel(cells[0], size)} through ${cellLabel(cells[3], size)}`
    for (const cell of cells) addLabel(cell, label)
  }
  for (const { cells, minDifference } of whispers) {
    for (let index = 1; index < cells.length; index++) {
      const a = cells[index - 1], b = cells[index]
      for (const [cell, other] of [[a, b], [b, a]]) {
        addLabel(cell, `Whispers line with ${cellLabel(other, size)}, difference at least ${minDifference}`)
      }
    }
  }
  const groupLineNumbers = { entropic: 0, modular: 0 }
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
    } else if (type === 'pill-arrow') {
      const [tens, ones] = pillDigitCells(cells)
      const first = cellLabel(tens, size), last = cellLabel(ones, size)
      const shaft = cells.slice(2)
      addLabel(tens, `Pill Arrow tens digit, ones digit at ${last}, total of ${shaft.map(cell => cellLabel(cell, size)).join(', ')}`)
      addLabel(ones, `Pill Arrow ones digit, tens digit at ${first}`)
      for (const cell of shaft) addLabel(cell, `Pill Arrow path, pill at ${first} and ${last}`)
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
    } else if (type === 'entropic' || type === 'modular') {
      const number = ++groupLineNumbers[type]
      const rule = cells.length === 1 ? 'one-cell path, any digit' : cells.length === 2 ? 'two positions from different digit groups'
        : 'every three successive positions need one digit from each group'
      for (const cell of cells) addLabel(cell, `${groupLineNames[type]} ${number}, ${rule}`)
    } else if (type === 'renban') {
      for (const cell of cells) addLabel(cell, `Renban line of ${cells.length} consecutive digits`)
    } else {
      for (const [index, cell] of cells.entries()) {
        const mirror = cells[cells.length - 1 - index]
        addLabel(cell, mirror === cell ? 'Center of Palindrome Line' : `Palindrome Line, same digit as ${cellLabel(mirror, size)}`)
      }
    }
  }
  const artworkRegions = artwork && extraRegions.length ? regionsInsideArtwork(size, artwork) : []
  const artworkKeys = new Set(artworkRegions.map(cells => cells.join(',')))
  const regionKeys = extraRegions.map(cells => [...cells].sort((a, b) => a - b).join(','))
  const squareArtworkRegions = size === 9 ? artworkRegions.filter(cells => cells.length === 9 &&
    cells[0] % size <= size - 3 && cells.every((cell, index) => cell === cells[0] + Math.floor(index / 3) * size + index % 3)) : []
  const squareRegionRule = squareArtworkRegions.length > 0 && squareArtworkRegions.length === extraRegions.length &&
    squareArtworkRegions.every(cells => regionKeys.includes(cells.join(',')))
  const regionCells = extraRegions.flat()
  const regionsOverlap = new Set(regionCells).size !== regionCells.length
  const groupLines = pathClues.flatMap(({ type, cells }) =>
    type === 'entropic' || type === 'modular' ? [{ type, cells }] : [])
  const lanes = coloredLineOverlapLanes(groupLines, size)
  const drawing = hasDrawing ? <svg className="number-puzzle-line-clues" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    {diagonals.map(diagonal => <DiagonalClue key={diagonal} diagonal={diagonal} size={size} />)}
    {minMax.map((group, index) => <MinMaxClue key={index} {...group} size={size} />)}
    {odd.length > 0 && <ParityClue parity="odd" cells={odd} size={size} />}
    {even.length > 0 && <ParityClue parity="even" cells={even} size={size} />}
    {extraRegions.map((cells, index) => !artworkKeys.has(regionKeys[index]) && <ExtraRegion key={`region-${index}`} cells={cells} size={size} outlineOnly={regionsOverlap} />)}
    {unnumberedCages.map((cells, index) => <g key={index} data-unnumbered-cage={index + 1}>
      <Cage cells={cells} size={size} />
    </g>)}
    {pathClues.filter(line => line.type === 'thermometer').map((line, index) => <PuzzlePathClue key={`thermometer-${index}`} line={line} size={size} />)}
    {pathClues.filter(line => line.type === 'renban').map((line, index) => <RenbanClue key={`renban-${index}`} {...line} number={index + 1} size={size} />)}
    {pathClues.filter(line => line.type === 'palindrome').map((line, index) => <PuzzlePathClue key={`palindrome-${index}`} line={line} size={size} />)}
    {whispers.map((line, index) => <WhispersLineClue key={`whispers-${index}`} line={line} size={size} />)}
    {groupLines.map((line, index) => <PuzzlePathClue key={`group-line-${index}`} line={line} size={size} />)}
    {[...lanes].map(([index, edges]) => {
      const { type } = groupLines[index]
      const entropic = type === 'entropic'
      return <g key={`group-line-overlap-${index}`} className={`variant-${type}-overlap`}>
        {edges.map((edge, index) => <ColoredLineLane key={index} {...edge} size={size}
          color={entropic ? '#bc6c27' : '#288e93'} dashed={entropic} />)}
      </g>
    })}
    {pathClues.filter(line => line.type === 'consecutive').map((line, index) => <PuzzlePathClue key={`consecutive-${index}`} line={line} size={size} />)}
    {pathClues.filter(line => line.type === 'arrow').map(({ cells: [circle, ...cells] }, index) =>
      <ArrowClue key={`arrow-${index}`} circle={circle} cells={cells} size={size} />)}
    {pathClues.filter(line => line.type === 'pill-arrow').map(({ cells }, index) =>
      <PillArrowClue key={`pill-arrow-${index}`} cells={cells} size={size} />)}
    {(['between', 'lockout'] as const).map(kind =>
      <EndpointLineClues key={kind} kind={kind} paths={pathClues.filter(line => line.type === kind).map(line => line.cells)} size={size} />)}
    {quadruples.map((clue, index) => <QuadrupleClue key={`quadruple-${index}`} {...clue} size={size} />)}
    {whispers.map((line, index) => <WhispersLineLabel key={`gap-${index}`} line={line} size={size} markedEdges={markedEdges} />)}
  </svg> : undefined
  const types = new Set(pathClues.map(line => line.type))
  return {
    drawing, labels,
    notes: [
      ...diagonals.map(diagonal => `Place each digit from 1 to ${size} once on the ${latinDiagonalNames[diagonal]}.`),
      ...(antiKing ? [antiKingNote] : []),
      ...(antiKnight ? [antiKnightNote] : []),
      ...(odd.length ? ['A circle marks an odd digit.'] : []),
      ...(even.length ? ['A square marks an even digit.'] : []),
      ...(quadruples.length ? [quadrupleNote] : []),
      ...(globalEntropy ? [globalEntropyNote] : []),
      ...Array.from(minMaxTechniques, name => `A ${name} cell is ${name === 'Maximum' ? 'larger' : 'smaller'} than its edge neighbors.`),
      ...(minMax.length ? ['Cells in the same Minimum or Maximum group skip comparisons with each other.'] : []),
      ...(extraRegions.length ? [squareRegionRule ? 'Digits cannot repeat in each outlined 3 × 3 square.' : extraRegionNote] : []),
      ...(unnumberedCages.length ? [unnumberedCageNote] : []),
      ...(whispers.length ? [whispersRuleNote] : []),
      ...Array.from(types, type => type === 'entropic' || type === 'modular' ? groupLineNote(type, size) : pathClueNotes[type]),
    ],
    techniques: [
      ...(diagonals.length ? [latinDiagonalTechnique] : []), ...minMaxTechniques,
      ...(antiKing ? [antiKingTechnique] : []),
      ...(antiKnight ? [antiKnightTechnique] : []),
      ...(parity.length ? [latinParityTechnique] : []),
      ...(quadruples.length ? [quadrupleTechnique] : []),
      ...(globalEntropy ? [globalEntropyTechnique] : []),
      ...(extraRegions.length ? [extraRegionTechnique] : []),
      ...(unnumberedCages.length ? [unnumberedCageTechnique] : []),
      ...(whispers.length ? [whispersTechnique] : []),
      ...Array.from(types, type => pathClueNames[type]),
    ],
  }
}
