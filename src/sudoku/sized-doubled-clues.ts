import type { SizedConstraintAlternativesRule, SizedConstraintRule } from './engine.ts'
import { rectangularGridFromRegions } from './grid.ts'

export type DoubledClueSudokuPadResult = {
  grid: { size: 6; boxRows: 2; boxColumns: 3 }
  givens: string
  sizedRules: SizedConstraintRule[]
  title?: string
  sizedAuthor?: string
  authoredSolution?: string
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cell([row, column]: readonly [number, number], size: number) {
  if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= size || column < 0 || column >= size) {
    throw new Error('A doubled clue points outside its Sudoku grid.')
  }
  return row * size + column
}

function cellName(index: number, size: number) {
  return `R${Math.floor(index / size) + 1}C${index % size + 1}`
}

function alternative(family: string, choices: SizedConstraintRule[][]): SizedConstraintAlternativesRule {
  if (choices.length < 2 || choices.some(choice => !choice.length)) throw new Error('A doubled clue family needs multiple choices.')
  return { type: 'constraint-alternatives', family, choices }
}

/** Parse ThePedallingPianist's source-faithful 6×6 exact-one-doubled export. */
export function readDoubleTheCluesSudokuPad(data: Record<string, unknown>): DoubledClueSudokuPadResult | undefined {
  const metadata = data.metadata
  if (!record(metadata) || typeof metadata.rules !== 'string' ||
    !/For each clue type, one of the clues is displayed as half of its true value/i.test(metadata.rules)) return

  const expectedRuleText = [
    'Normal 6x6 sudoku rules apply.',
    'Standard Killer, Kropki, Little Killer and Sandwich rules apply (explained below).',
    'For each clue type, one of the clues is displayed as half of its true value, and must therefore be doubled before being used. For example, one of the Sandwich clues represents 14, not 7.',
  ].join('\n\n') + '\n\n' + [
    '- Killer: digits in a cage must not repeat and must sum to the indicated value;',
    '- Kropki: digits separated by a white dot have a difference of 1 (the \'doubled\' dot shows digits with a difference of 2);',
    '- Little Killer (black): digits along an indicated diagonal sum to the given total;',
    '- Sandwich (blue): the clue shows the sum of the digits between the 1 and 6 in that row/column.',
  ].join('\n') + '\n\n' + [
    '(N.B. the word \'odd\' should be interpreted as \'an unknown odd number\')',
  ].join('')
  if (metadata.rules.trim().replace(/\r\n/g, '\n') !== expectedRuleText ||
    Object.keys(data).some(key => !['id', 'metadata', 'cages', 'cellSize', 'cells', 'regions', 'lines', 'underlays', 'overlays', 'a'].includes(key)) ||
    !Array.isArray(data.cells) || data.cells.length !== 6 || data.cells.some(row => !Array.isArray(row) || row.length !== 6) ||
    data.cells.flat().some(cell => !record(cell) || Object.keys(cell).length ||
      (cell.value !== undefined && cell.value !== null)) ||
    !Array.isArray(data.regions) || data.regions.length !== 6 || data.regions.some(region => !Array.isArray(region) || region.length !== 6) ||
    !Array.isArray(data.cages) || data.cages.length !== 2 || !Array.isArray(data.overlays) || !Array.isArray(data.underlays) ||
    !Array.isArray(data.a) || data.a.length !== 3 || typeof metadata.title !== 'string' ||
    metadata.title !== 'Double The Clues, Double The Fun' || metadata.author !== 'ThePedallingPianist' ||
    typeof metadata.solution !== 'string' || metadata.solution.length !== 36 || !/^[1-6]{36}$/.test(metadata.solution)) {
    throw new Error('This SudokuPad doubled-clue export has unsupported or incomplete source data.')
  }

  const labels = Array(36).fill(-1) as number[]
  for (const [region, coordinates] of data.regions.entries()) {
    for (const point of coordinates) {
      if (!Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isInteger(value))) {
        throw new Error('This SudokuPad doubled-clue export has invalid regions.')
      }
      const index = cell(point as [number, number], 6)
      if (labels[index] !== -1) throw new Error('This SudokuPad doubled-clue export has overlapping regions.')
      labels[index] = region
    }
  }
  const grid = rectangularGridFromRegions(6, labels)
  if (!grid || grid.boxRows !== 2 || grid.boxColumns !== 3) {
    throw new Error('This SudokuPad doubled-clue export has unsupported regions.')
  }
  const givens = '0'.repeat(36)

  const cages = data.cages.map((value, index) => {
    if (!record(value) || value.unique !== true || value.value !== 6 || !Array.isArray(value.cells) || value.cells.length !== 3) {
      throw new Error('This SudokuPad doubled-clue export has invalid Killer cages.')
    }
    const cells = value.cells.map(point => {
      if (!Array.isArray(point) || point.length !== 2 || point.some(item => !Number.isInteger(item))) {
        throw new Error('This SudokuPad doubled-clue export has invalid cage cells.')
      }
      return cell(point as [number, number], 6)
    })
    if (new Set(cells).size !== cells.length) throw new Error('A doubled Killer cage repeats a cell.')
    return { cells, sum: 6, index }
  })
  const killerChoices = cages.map(({ index: doubled }) => [{
    type: 'killer-cages', cages: cages.map(({ cells, sum, index }) => ({ cells, sum: sum * (index === doubled ? 2 : 1) })),
  } as SizedConstraintRule])

  const dots: [number, number][] = []
  const sandwiches: { direction: 'north' | 'east' | 'south' | 'west'; index: number; sum: number }[] = []
  const littleKillerMarkers = new Set<string>()
  for (const overlay of data.overlays) {
    if (!record(overlay) || !Array.isArray(overlay.center) || overlay.center.length !== 2 ||
      overlay.center.some(value => typeof value !== 'number') || overlay.rounded !== true) {
      throw new Error('This SudokuPad doubled-clue export has an unsupported clue marker.')
    }
    const [row, column] = overlay.center as [number, number]
    if (overlay.backgroundColor === '#ffffff') {
      if (overlay.text !== '' || overlay.width !== .34 || overlay.height !== .34) {
        throw new Error('This SudokuPad doubled-clue export has an unsupported Kropki dot.')
      }
      let pair: [number, number]
      if (Number.isInteger(row - .5) && Number.isInteger(column)) pair = [cell([Math.floor(row), column - 1], 6), cell([Math.floor(row), column], 6)]
      else if (Number.isInteger(row) && Number.isInteger(column - .5)) pair = [cell([row - 1, Math.floor(column)], 6), cell([row, Math.floor(column)], 6)]
      else throw new Error('A Kropki dot must lie between neighboring cells.')
      dots.push(pair)
      continue
    }
    if (overlay.width !== 1 || overlay.height !== 1 || !Number.isInteger(overlay.text) || overlay.stroke !== 'none') {
      throw new Error('This SudokuPad doubled-clue export has an unsupported outside clue.')
    }
    const edge = row === -.5 && Number.isInteger(column - .5) ? 'north'
      : column === -.5 && Number.isInteger(row - .5) ? 'west'
        : column === 6.5 && Number.isInteger(row - .5) ? 'east'
          : row === 6.5 && Number.isInteger(column - .5) ? 'south' : undefined
    if (!edge) throw new Error('An outside clue must sit on the grid edge.')
    const index = edge === 'north' || edge === 'south' ? column - .5 : row - .5
    const direction = edge === 'north' ? 'south' : edge === 'south' ? 'north' : edge === 'west' ? 'east' : 'west'
    if (overlay.color === '#00f' && overlay.text === 7) sandwiches.push({ direction, index, sum: 7 })
    else if (overlay.color === '#000000' && overlay.text === 5 && edge === 'north' && (index === 2 || index === 3)) {
      littleKillerMarkers.add(String(index))
    } else throw new Error('This SudokuPad doubled-clue export has an unsupported outside clue color or value.')
  }
  if (dots.length !== 2 || sandwiches.length !== 4 ||
    new Set(sandwiches.map(clue => clue.direction + ':' + clue.index)).size !== sandwiches.length ||
    [...littleKillerMarkers].sort().join(',') !== '2,3' ||
    sandwiches.some(clue => clue.sum !== 7) ||
    !['south:0', 'south:5', 'east:0', 'east:5'].every(key => sandwiches.some(clue => clue.direction + ':' + clue.index === key))) {
    throw new Error('This SudokuPad doubled-clue export is missing a Kropki or Sandwich clue.')
  }
  const sandwichRules = (doubled: number): SizedConstraintRule[] => sandwiches.map((clue) => {
    const cells = clue.direction === 'north'
      ? Array.from({ length: 6 }, (_, row) => (5 - row) * 6 + clue.index)
      : clue.direction === 'south' ? Array.from({ length: 6 }, (_, row) => row * 6 + clue.index)
        : clue.direction === 'west' ? Array.from({ length: 6 }, (_, column) => clue.index * 6 + (5 - column))
          : Array.from({ length: 6 }, (_, column) => clue.index * 6 + column)
    return { type: 'sandwich', direction: clue.direction, cells, sum: clue.sum * (sandwiches.indexOf(clue) === doubled ? 2 : 1) }
  })
  const sandwichChoices = sandwiches.map((_, doubled) => sandwichRules(doubled))

  const dotsByPair = dots.map(pair => pair.sort((a, b) => a - b))
  const kropkiChoiceLabels = dotsByPair.map(([first, second]) =>
    `Double the white dot between ${cellName(first, 6)} and ${cellName(second, 6)}`)
  const kropkiChoices: SizedConstraintRule[][] = dotsByPair.map((doubled, index) => [
    { type: 'kropki', consecutive: { pairs: dotsByPair.filter((_, other) => other !== index) } },
    { type: 'labeled-dots', relation: 'difference', marks: [{ cells: doubled, value: 2 }] },
  ])

  const oddMarker = data.underlays.length === 1 && record(data.underlays[0]) &&
    Object.keys(data.underlays[0]).every(key => ['stroke', 'angle', 'center', 'width', 'height', 'text', 'fs', 'color', 'rounded'].includes(key)) &&
    data.underlays[0].stroke === '#ffffff' && data.underlays[0].angle === 0 &&
    JSON.stringify(data.underlays[0].center) === JSON.stringify([-.5, -.5]) && data.underlays[0].width === 0 &&
    data.underlays[0].height === .816 && data.underlays[0].text === 'odd' && data.underlays[0].color === '#000000' &&
    data.underlays[0].rounded === true
  if (!oddMarker) throw new Error('This SudokuPad doubled-clue export is missing the odd Little Killer clue.')
  const arrows = data.a
  const rays = arrows.map(value => {
    if (!record(value) || Object.keys(value).some(key => !['wp', 'hl', 'c', 'th'].includes(key)) ||
      value.hl !== .18 && value.hl !== .2 || value.c !== '#000000' || value.th !== 3 || !Array.isArray(value.wp) ||
      value.wp.length !== 2 || value.wp.some(point => !Array.isArray(point) || point.length !== 2 || point.some(item => typeof item !== 'number'))) {
      throw new Error('This SudokuPad doubled-clue export has an unsupported Little Killer arrow.')
    }
    const [a, b] = value.wp as [[number, number], [number, number]]
    if (!(b[0] > a[0] && Math.abs(b[1] - a[1]) > 0)) throw new Error('This Little Killer arrow has an unsupported direction.')
    const boundaryColumn = Math.round(b[1])
    const direction = b[1] > a[1] ? 'south-east' as const : 'south-west' as const
    const startColumn = direction === 'south-east' ? boundaryColumn : boundaryColumn - 1
    if (startColumn < 0 || startColumn >= 6) throw new Error('This Little Killer arrow points outside the grid.')
    const cells = Array.from({ length: direction === 'south-east' ? 6 - startColumn : startColumn + 1 }, (_, index) =>
      index * 6 + startColumn + (direction === 'south-east' ? index : -index))
    return { direction, cells }
  })
  if (rays.length !== 3) throw new Error('This SudokuPad doubled-clue export has incomplete Little Killer arrows.')
  const oddRay = rays.find(ray => ray.direction === 'south-east' && ray.cells[0] === 0)
  const numericRays = rays.filter(ray => ray !== oddRay).sort((a, b) => a.cells[0] % 6 - b.cells[0] % 6)
  if (!oddRay || oddRay.cells.length !== 6 || numericRays.length !== 2 ||
    numericRays[0].cells[0] !== 1 || numericRays[1].cells[0] !== 4 ||
    numericRays[0].cells.length !== 2 || numericRays[1].cells.length !== 2) {
    throw new Error('This SudokuPad doubled-clue export has unsupported Little Killer ray geometry.')
  }
  const littleKillerChoices: SizedConstraintRule[][] = numericRays.map((_, doubled) => [
    { type: 'little-killer', direction: numericRays[0].direction, cells: numericRays[0].cells, sum: doubled === 0 ? 10 : 5 },
    { type: 'little-killer', direction: numericRays[1].direction, cells: numericRays[1].cells, sum: doubled === 1 ? 10 : 5 },
    { type: 'sum-modulo', cells: oddRay.cells, modulus: 2, remainder: 1 },
  ])
  littleKillerChoices.push([
    { type: 'little-killer', direction: numericRays[0].direction, cells: numericRays[0].cells, sum: 5 },
    { type: 'little-killer', direction: numericRays[1].direction, cells: numericRays[1].cells, sum: 5 },
    { type: 'sum-modulo', cells: oddRay.cells, modulus: 4, remainder: 2 },
  ])
  const littleKillerChoiceLabels = [
    ...numericRays.map(ray => `Double the diagonal clue from ${cellName(ray.cells[0], 6)}`),
    'Double the odd diagonal sum',
  ]
  const sandwichChoiceLabels = sandwiches.map(clue => {
    const outside = clue.direction === 'south' ? 'top' : clue.direction === 'north' ? 'bottom'
      : clue.direction === 'east' ? 'left' : 'right'
    const axis = clue.direction === 'north' || clue.direction === 'south' ? 'column' : 'row'
    return `Double the Sandwich clue at the ${outside} of ${axis} ${clue.index + 1}`
  })

  return {
    grid: { size: 6, boxRows: 2, boxColumns: 3 }, givens,
    sizedRules: [
      { ...alternative('killer', killerChoices), choiceLabels: cages.map(cage =>
        `Double the Killer cage beginning at ${cellName(cage.cells[0], 6)}`),
        displayRules: [{ type: 'killer-cages', cages: cages.map(({ cells, sum }) => ({ cells, sum })) }] },
      { ...alternative('kropki', kropkiChoices), choiceLabels: kropkiChoiceLabels,
        displayRules: [{ type: 'kropki', consecutive: { pairs: dotsByPair } }] },
      { ...alternative('little-killer', littleKillerChoices), choiceLabels: littleKillerChoiceLabels, displayRules: [
        ...numericRays.map(ray => ({ type: 'little-killer' as const, direction: ray.direction, cells: ray.cells, sum: 5 })),
        { type: 'outside-text', direction: oddRay.direction, cells: oddRay.cells, label: 'odd' },
      ] },
      { ...alternative('sandwich', sandwichChoices), choiceLabels: sandwichChoiceLabels, displayRules: sandwichRules(-1) },
    ],
    title: metadata.title.trim().slice(0, 72), sizedAuthor: metadata.author.trim().slice(0, 72),
    authoredSolution: metadata.solution,
  }
}
