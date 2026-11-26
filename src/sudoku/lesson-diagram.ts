import type { BoardAnnotations, BoardGroup, BoardLink, BoardRegion, CandidateAnnotation, CellAnnotation } from '../components/BoardAnnotations'
import type { Candidate, Deduction, DeductionAction, Difficulty, HintChoice, HintTrace, House, InferenceNode, LessonExample, PositionSnapshot, ProofPattern } from './engine'
import { CLASSIC_GRID, gridHouseCells, type PlayGrid } from './grid.ts'
import { DIGITS, peer } from './game.ts'
import { cellReference, type CellReferenceOptions, type CellReferenceStyle } from './hints.ts'
import { variantHintChoice } from './variant-hints.ts'
import { chainColor, CHAIN_COLOR_PAIRS } from './chain-sketch.ts'
import { alsChainCandidateStates } from './subset-proofs.ts'

type Pattern = {
  houses?: House[]
  otherHouses?: House[]
  cells?: number[]
  contradictionCells?: number[]
  candidates: Candidate[]
  mainLabel?: string
  mainColor?: string
  accent?: { candidates: Candidate[]; label: string; color?: string }
  links?: BoardLink[]
  description: string
  reason: string
  reasonSteps?: string[]
  trace?: HintTrace
}

const patternColor = 'var(--lesson-pattern)'
const accentColor = 'var(--lesson-accent)'
const resultColor = 'var(--lesson-result)'
const removalColor = 'var(--lesson-removal)'
const contradictionFill = `color-mix(in srgb, ${removalColor} 24%, var(--board-bg))`
type Evidence = Deduction['evidence']
const list = new Intl.ListFormat('en')
const either = new Intl.ListFormat('en', { type: 'disjunction' })
const setColors = [
  { name: 'blue', fill: 'var(--lesson-pattern-fill)' },
  { name: 'purple', fill: 'var(--lesson-als-second-set-fill)' },
  { name: 'teal', fill: 'var(--lesson-set-teal)' },
  { name: 'pink', fill: 'var(--lesson-set-pink)' },
  { name: 'gold', fill: 'var(--lesson-set-gold)' },
  { name: 'gray', fill: 'var(--lesson-set-gray)' },
  { name: 'green', fill: 'var(--lesson-set-green)' },
] as const

type DiagramSet = { cells: readonly number[]; label?: string }

function proofCellSets(evidence: Deduction['evidence']): DiagramSet[] {
  if ('als-xz' in evidence) return evidence['als-xz'].sets
  if ('als-chain' in evidence) return evidence['als-chain'].sets
  if ('sue-de-coq' in evidence) {
    const { line, block, intersection } = evidence['sue-de-coq']
    return [
      { cells: line.cells, label: 'Line set' },
      { cells: block.cells, label: 'Box set' },
      { cells: intersection, label: 'Intersection' },
    ]
  }
  if ('death-blossom' in evidence) {
    const { stem, petals } = evidence['death-blossom']
    return [
      ...petals.map(({ digit, set }) => ({ cells: set.cells, label: `Petal for ${digit}` })),
      { cells: [stem], label: 'Stem' },
    ]
  }
  if ('firework-als-wing' in evidence) {
    const { pivots, wings, bivalue } = evidence['firework-als-wing']
    return [
      ...wings.map((groups, index) => ({ cells: [pivots[index], ...groups.flat()], label: `Firework ${index + 1}` })),
      { cells: [bivalue], label: 'Two-candidate cell' },
    ]
  }
  if ('multi-sector-locked-sets' in evidence) {
    const { core, attachments } = evidence['multi-sector-locked-sets']
    return [{ cells: core, label: 'Core' }, { cells: attachments, label: 'Attachments' }].filter(({ cells }) => cells.length)
  }
  if ('inference' in evidence) {
    const sets = new Map<string, DiagramSet>()
    for (const { source } of evidence.inference.links) {
      const set = 'almost-locked-set' in source ? source['almost-locked-set']
        : 'almost-locked-set-cell' in source ? source['almost-locked-set-cell'].set : undefined
      if (set) sets.set(set.cells.join(','), set)
    }
    return [...sets.values()]
  }
  return []
}

function styledSets(sets: readonly DiagramSet[]) {
  return sets.map(({ cells, label }, index) => ({
    cells, label: label ?? `Set ${index + 1}`, ...setColors[index % setColors.length],
  }))
}

function setLocations(sets: ReturnType<typeof styledSets>, nameCell: (cell: number) => string) {
  return sets.map(({ cells, label, name }) =>
    `${label} (${name}) is at ${list.format(cells.map(nameCell))}.`).join(' ')
}

function setAnnotations(sets: ReturnType<typeof styledSets>) {
  const cells = new Map<number, CellAnnotation>()
  for (const { cells: members, label, fill } of sets) {
    for (const cell of new Set(members)) {
      const setMarkers = cells.get(cell)?.setMarkers ?? []
      cells.set(cell, { setMarkers: [...setMarkers, { label, color: fill }] })
    }
  }
  return cells
}

function subsetMembers(evidence: Evidence): readonly number[] {
  if ('pair' in evidence) return evidence.pair.cells
  if ('subset' in evidence) return evidence.subset.cells
  if ('direct-placement' in evidence) return subsetMembers(evidence['direct-placement'].premise)
  return []
}

export const cellName = (cell: number) => `R${Math.floor(cell / 9) + 1}C${cell % 9 + 1}`
export const lessonValues = ({ givens, entries }: Pick<PositionSnapshot, 'givens' | 'entries'>) =>
  [...givens].map((digit, cell) => digit === '0' ? entries[cell] : digit).join('')
const labelCandidate = ({ cell, digit }: Candidate, nameCell: (cell: number) => string) => `${digit} in ${nameCell(cell)}`
export const candidateName = (candidate: Candidate) => labelCandidate(candidate, cellName)
export const candidateCount = (mask: number) => {
  let count = 0
  while (mask) {
    mask &= mask - 1
    count++
  }
  return count
}

export function wingCellRoles(evidence: Evidence, countAtCell: (cell: number) => number = () => 0) {
  if ('wing' in evidence) return { pivots: [evidence.wing.pivot], wings: [...evidence.wing.pincers] }
  if ('wxyz-wing' in evidence) {
    const { cells } = evidence['wxyz-wing']
    const pivot = cells.reduce((best, cell) => countAtCell(cell) > countAtCell(best) ? cell : best, cells[0])
    return { pivots: [pivot], wings: cells.filter(cell => cell !== pivot) }
  }
  if ('w-wing' in evidence) return { pivots: [], wings: [...evidence['w-wing'].wings] }
  if ('firework' in evidence) return {
    pivots: evidence.firework.pivots.map(({ cell }) => cell), wings: [...evidence.firework.wings],
  }
  if ('firework-w-wing' in evidence) return {
    pivots: [evidence['firework-w-wing'].pivot], wings: evidence['firework-w-wing'].wings.flat(),
  }
  if ('firework-l-wing' in evidence) return {
    pivots: [evidence['firework-l-wing'].pivot], wings: [...evidence['firework-l-wing'].wings],
  }
  if ('firework-als-wing' in evidence) return {
    pivots: [...evidence['firework-als-wing'].pivots], wings: evidence['firework-als-wing'].wings.flat(2),
  }
  return { pivots: [], wings: [] }
}

const candidatesConflict = (a: Candidate, b: Candidate) =>
  a.cell === b.cell ? a.digit !== b.digit : a.digit === b.digit && peer(a.cell, b.cell)
const capital = (phrase: string) => phrase[0].toUpperCase() + phrase.slice(1)
export const inferenceCandidates = (node: InferenceNode): Candidate[] => {
  if ('candidate' in node) return [node.candidate]
  if ('group' in node) return node.group.cells.map(cell => ({ cell, digit: node.group.digit }))
  return node['mixed-group']
}
export const inferenceName = (node: InferenceNode, nameCell = cellName) => 'group' in node
  ? `${node.group.digit} in ${either.format(node.group.cells.map(nameCell))}`
  : either.format(inferenceCandidates(node).map(({ digit, cell }) => `${digit} in ${nameCell(cell)}`))
export const inferenceGroupMeaning = 'A group is true when at least one member is true. It is false only when every member is false.'
export const boardPoint = (node: InferenceNode) => {
  if ('candidate' in node) return node.candidate
  if ('group' in node) return node.group
  return { candidates: node['mixed-group'] }
}

export function houseName(house: House) {
  if ('row' in house) return `row ${house.row + 1}`
  if ('column' in house) return `column ${house.column + 1}`
  return `box ${house.box + 1}`
}

export const houseCells = gridHouseCells

function placementPeers(cell: number, grid: PlayGrid) {
  const { size } = grid
  const row = Math.floor(cell / size)
  const column = cell % size
  const houses: House[] = [{ row }, { column }]
  if ('regions' in grid) {
    const box = grid.regions.findIndex(region => region.includes(cell))
    if (box >= 0) houses.push({ box })
  } else if (!('noRegions' in grid)) {
    const boxesAcross = size / grid.boxColumns
    houses.push({ box: Math.floor(row / grid.boxRows) * boxesAcross + Math.floor(column / grid.boxColumns) })
  }
  return [...new Set(houses.flatMap(house => houseCells(house, grid)))].filter(other => other !== cell)
}

function sharedHouse(cells: readonly number[]) {
  const [first] = cells
  if (first === undefined) return undefined
  const houses = [{ row: Math.floor(first / 9) }, { column: first % 9 }, { box: Math.floor(first / 27) * 3 + Math.floor(first % 9 / 3) }]
  return houses.find((house) => cells.every((cell) => houseCells(house).includes(cell)))
}

export function aicEndpoints(hint?: Deduction) {
  if (!hint || (hint.technique !== 'aic' && !hint.technique.endsWith('-aic')) || !('inference' in hint.evidence)) return
  const { links } = hint.evidence.inference
  if (links.length) return [links[0].from, links[links.length - 1].to] as const
}

export function hintLocation(hint: HintChoice, style: CellReferenceStyle, difficulty?: Difficulty, grid: PlayGrid = CLASSIC_GRID) {
  const endpoints = aicEndpoints(hint)
  if (endpoints) {
    const [start, end] = endpoints
    const cells = new Map<number, CellAnnotation>()
    const candidates = new Map<number, Map<number, CandidateAnnotation>>()
    const mark = (node: InferenceNode, label: string, color: string) => {
      for (const { cell, digit } of inferenceCandidates(node)) {
        cells.set(cell, { fill: 'var(--lesson-pattern-fill)' })
        const marks = candidates.get(cell) ?? new Map<number, CandidateAnnotation>()
        const previous = marks.get(digit)
        marks.set(digit, previous ? { ...previous, label: 'chain start and end' } : { color, label })
        candidates.set(cell, marks)
      }
    }
    mark(start, 'chain start', patternColor)
    mark(end, 'chain end', accentColor)
    const nameCell = (cell: number) => cellReference(cell, style, difficulty, grid.size)
    const text = `Start at ${inferenceName(start, nameCell)}. The other end is ${inferenceName(end, nameCell)}.`
    const groups: BoardGroup[] = [start, end].flatMap((node, index) => 'candidate' in node ? [] : [{
      point: boardPoint(node), color: index === 0 ? patternColor : accentColor,
      label: `Chain ${index === 0 ? 'start' : 'end'} group: ${inferenceName(node, nameCell)}`,
    }])
    const annotations: BoardAnnotations = { cells, candidates, ...(groups.length ? { groups } : {}) }
    return { text, annotations }
  }

  const { evidence, pattern } = hint
  const sets = styledSets(proofCellSets(evidence))
  if (sets.length && !('inference' in evidence)) {
    const annotations: BoardAnnotations = { cells: setAnnotations(sets) }
    return { text: setLocations(sets, cell => cellReference(cell, style, difficulty, grid.size)), annotations, setReferences: sets }
  }
  if (!pattern) return
  const coloring = 'coloring' in evidence ? evidence.coloring : undefined
  const colored = coloring?.colors.flat() ?? ('multi-coloring' in evidence ? evidence['multi-coloring'].groups.flat(2) : undefined)
  const focus = colored ? [...new Set(colored.map(({ cell }) => cell))].sort((a, b) => a - b)
    : 'house' in evidence ? [] : pattern.cells
  const houses = colored ? [] : pattern.houses
  const cells = new Map<number, CellAnnotation>()
  for (const house of houses) {
    for (const cell of houseCells(house, grid)) cells.set(cell, { fill: 'var(--lesson-area-fill)', label: 'hint area' })
  }
  for (const cell of focus) cells.set(cell, { fill: 'var(--lesson-pattern-fill)', label: 'hint cell' })
  for (const cell of subsetMembers(evidence)) cells.set(cell, { setMarkers: [{ color: setColors[0].fill, label: 'Subset' }] })
  const roles = wingCellRoles(evidence, cell => pattern.candidates.filter(candidate => candidate.cell === cell).length)
  for (const cell of roles.wings) cells.set(cell, { fill: 'var(--lesson-wing-fill)', label: 'wing cell' })
  for (const cell of roles.pivots) cells.set(cell, { fill: 'var(--lesson-pivot-fill)', label: 'pivot cell' })

  const references = focus.length ? focus.map((cell) => cellReference(cell, style, difficulty, grid.size)) : houses.map(houseName)
  const text = references.length > 0 && references.length <= 4 ? `Look in ${list.format(references)}.`
    : 'Look at the highlighted cells.'
  const annotations: BoardAnnotations = { cells }
  return { text, annotations }
}

function link(from: number, to: number, digit: number, dashed = false, arrow = false): BoardLink {
  return { from: { cell: from, digit }, to: { cell: to, digit }, color: patternColor, dashed, arrow }
}

function explainSteps(reasonSteps: string[]) {
  return { reason: reasonSteps.join(' '), reasonSteps }
}

function explainRemoval({ cell, digit }: Candidate, placements: Candidate[], nameCell = cellName) {
  const locations = [...new Set(placements.map(({ cell }) => cell))]
  const required = locations.length === 1 ? `${nameCell(locations[0])} must be ${digit}.`
    : `At least one of ${list.format(locations.map(nameCell))} must be ${digit}.`
  return `${required} Putting ${digit} in ${nameCell(cell)} would block ${locations.length === 1 ? 'that spot' : 'all of those spots'}.`
}

function describePattern(deduction: Deduction, candidates: readonly number[], nameCell = cellName): Pattern | undefined {
  const nameCandidate = (candidate: Candidate) => labelCandidate(candidate, nameCell)
  const nameInference = (node: InferenceNode) => inferenceName(node, nameCell)
  const nameRemoval = (candidate: Candidate, placements: Candidate[]) => explainRemoval(candidate, placements, nameCell)
  const { evidence, technique, actions } = deduction
  const firstAction = actions[0]
  const first = 'place' in firstAction ? firstAction.place : firstAction.eliminate
  const marks = (cells: readonly number[], digits: readonly number[]) => cells.flatMap((cell) =>
    digits.filter((digit) => candidates[cell] & (1 << (digit - 1))).map((digit) => ({ cell, digit })))

  if ('cell' in evidence) {
    const target = nameCell(evidence.cell)
    return {
      cells: [evidence.cell], candidates: [first],
      description: `Only ${first.digit} remains in ${target}.`,
      reason: 'Every other candidate in this cell is already ruled out.',
    }
  }
  if ('house' in evidence) {
    const group = houseName(evidence.house)
    const target = nameCell(first.cell)
    const fullHouse = technique === 'full-house'
    return {
      houses: [evidence.house], cells: [first.cell], candidates: [first],
      description: fullHouse ? `${target} is the only empty cell in ${group}.` : `Only ${target} can hold ${first.digit} in ${group}.`,
      reason: fullHouse
        ? `The other eight cells contain every digit except ${first.digit}.`
        : `${capital(group)} needs one ${first.digit}. No other cell there allows it.`,
    }
  }
  if ('direct-placement' in evidence) {
    const { house, premise, removed } = evidence['direct-placement']
    const rule = describePattern({
      technique: technique.slice('direct-'.length), evidence: premise,
      actions: [{ eliminate: { cell: removed[0], digit: first.digit } }],
    }, candidates, nameCell)
    const cells = list.format(removed.map(nameCell))
    return {
      ...rule,
      houses: [...(rule?.houses ?? []), house],
      candidates: rule?.candidates ?? [],
      description: rule?.description ?? '',
      ...explainSteps([
        rule?.reason ?? '',
        `That rules out ${first.digit} in ${cells} and leaves one spot in ${houseName(house)}. Place ${first.digit} in ${nameCell(first.cell)}.`,
      ].filter(Boolean)),
    }
  }
  if ('intersection' in evidence) {
    const { source, target, cells } = evidence.intersection
    const digit = first.digit
    return {
      houses: [source], otherHouses: [target], cells, candidates: marks(cells, [first.digit]),
      description: `Every possible ${digit} in ${houseName(source)} lies in ${houseName(target)}. The shared places are ${list.format(cells.map(nameCell))}.`,
      reason: `One of those cells must be ${digit}. That supplies ${houseName(target)} with its ${digit}, so remove it elsewhere in that house.`,
    }
  }
  if ('pair' in evidence || 'subset' in evidence) {
    const { house, cells, digits } = 'pair' in evidence ? evidence.pair : evidence.subset
    const lockedIn = 'subset' in evidence ? evidence.subset.lockedIn : null
    const groups = list.format((lockedIn ? [house, lockedIn] : [house]).map(houseName))
    const digitNames = list.format(digits.map(String))
    const cellNames = list.format(cells.map(nameCell))
    const hidden = technique.startsWith('hidden-')
    const description = hidden
      ? `In ${groups}, ${cellNames} are the only places for ${digitNames}.`
      : `${cellNames} have only ${digitNames} between them.`
    const reason = hidden
      ? `Those ${cells.length} digits need all ${cells.length} cells. Remove the other candidates inside the set.`
      : `These cells share ${groups}. They must use all ${cells.length} digits, one per cell. Remove those digits elsewhere in ${groups}.`
    return { houses: [house], otherHouses: lockedIn ? [lockedIn] : [], cells, candidates: marks(cells, digits), description, reason }
  }
  if ('x-wing' in evidence) {
    const { bases, covers, digit } = evidence['x-wing']
    const coverCells = covers.map(house => houseCells(house))
    const corners = bases.map((base) => houseCells(base).filter((cell) => coverCells.some((cover) => cover.includes(cell))))
    const [[a, b], [c, d]] = corners
    return {
      houses: bases, otherHouses: covers, cells: corners.flat(), candidates: marks(corners.flat(), [digit]),
      links: [link(a, b, digit), link(c, d, digit), link(a, c, digit, true), link(b, d, digit, true)],
      description: `The only places for ${digit} in ${list.format(bases.map(houseName))} lie in ${list.format(covers.map(houseName))}.`,
      reason: `If ${nameCell(a)} is ${digit}, the other ${digit} goes in ${nameCell(d)}. If ${nameCell(b)} is ${digit}, the other goes in ${nameCell(c)}. Either arrangement supplies ${list.format(covers.map(houseName))} with one ${digit} each.`,
    }
  }
  if ('complex-fish' in evidence) {
    const { bases, covers, fins, digit } = evidence['complex-fish']
    const candidates = marks([...new Set(bases.flatMap(house => houseCells(house)))], [digit])
    const baseNames = list.format(bases.map(houseName))
    const coverNames = list.format(covers.map(houseName))
    return {
      houses: bases, otherHouses: covers, cells: candidates.map(({ cell }) => cell), candidates,
      accent: fins.length ? { candidates: marks(fins, [digit]), label: 'Fin candidate' } : undefined,
      description: `For ${digit}, the bases are ${baseNames}. The covers are ${coverNames}.`,
      reason: `Each base needs one copy, and each cover has room for one. A crossed-out digit uses more covers than it fills bases.${fins.length ? ' Each target sees every fin. Placing it removes every chance to balance that count.' : ' No other candidate can fill the extra base that this leaves.'}`,
    }
  }
  if ('fish' in evidence) {
    const { bases, covers, fins, digit } = evidence.fish
    const coverCells = new Set(covers.flatMap(house => houseCells(house)))
    const candidates = marks(bases.flatMap(house => houseCells(house)).filter((cell) => coverCells.has(cell)), [digit])
    const baseNames = list.format(bases.map(houseName))
    const coverNames = list.format(covers.map(houseName))
    const baseType = 'row' in bases[0] ? 'rows' : 'columns'
    const singleBase = technique.startsWith('sashimi-') && bases.find((house) => {
      const cells = houseCells(house)
      return candidates.filter(({ cell }) => cells.includes(cell)).length === 1
    })
    const single = singleBase && candidates.find(({ cell }) => houseCells(singleBase).includes(cell))
    const description = fins.length
      ? `In ${baseNames}, the extra candidates for ${digit} outside ${coverNames} are the fins at ${list.format(fins.map(nameCell))}.${single && singleBase ? ` Set those fins aside and ${nameCell(single.cell)} is the only place left for ${digit} in ${houseName(singleBase)}.` : ''}`
      : `In ${baseNames}, every candidate for ${digit} lies in ${coverNames}.`
    const reason = fins.length
      ? `If any fin is ${digit}, its box rules out the marked removals. If none is ${digit}, the base ${baseType} need every cover and rule out those same candidates.`
      : `The ${baseType} need ${bases.length} copies of ${digit}, each in a different crossing line. Each crossing line must get its ${digit} from one of the base ${baseType}.`
    return {
      houses: bases, otherHouses: covers, cells: [...candidates.map(({ cell }) => cell), ...fins], candidates,
      accent: fins.length ? { candidates: marks(fins, [digit]), label: 'Fin candidate' } : undefined, description, reason,
    }
  }
  if ('single-digit-chain' in evidence) {
    const { digit, links, bridge } = evidence['single-digit-chain']
    const cells = links.flatMap(({ cells: pair }) => pair)
    const outer = cells.filter((cell) => !bridge.includes(cell))
    return {
      houses: links.map(({ house }) => house), cells, candidates: marks(cells, [digit]),
      links: [...links.map(({ cells: [a, b] }) => link(a, b, digit)), link(bridge[0], bridge[1], digit, true)],
      description: `${capital(list.format(links.map(({ house }) => houseName(house))))} each have two places for ${digit}. The dashed link joins ${nameCell(bridge[0])} and ${nameCell(bridge[1])} in ${houseName(sharedHouse(bridge)!)}.`,
      reason: `If ${nameCell(outer[0])} loses ${digit}, ${digit} must go in ${nameCell(bridge[0])}. This rules out ${digit} in ${nameCell(bridge[1])} and forces it into ${nameCell(outer[1])}. Either far end rules out ${digit} in ${nameCell(first.cell)}.`,
    }
  }
  if ('empty-rectangle' in evidence) {
    const { row, column, cells, link: pair, digit } = evidence['empty-rectangle']
    const box = Math.floor(row / 3) * 3 + Math.floor(column / 3)
    const onNear = (cell: number) => 'column' in pair.house ? Math.floor(cell / 9) === row : cell % 9 === column
    const [a, b] = pair.cells
    const near = onNear(a) ? a : b
    const far = near === a ? b : a
    const otherArm = 'column' in pair.house ? `column ${column + 1}` : `row ${row + 1}`
    const blocked = cells.filter(onNear)
    const closest = blocked.reduce((best, cell) => Math.abs(cell - near) < Math.abs(best - near) ? cell : best)
    return {
      houses: [{ box }, pair.house], cells: [...cells, a, b], candidates: marks([...cells, a, b], [digit]),
      links: [link(a, b, digit), link(near, closest, digit, true, true)],
      description: `In box ${box + 1}, ${digit} can go only on row ${row + 1} or column ${column + 1}. Placing ${digit} in ${nameCell(near)} rules it out in ${list.format(blocked.map(nameCell))} along the arrow.`,
      reason: `If ${nameCell(far)} is ${digit}, ${nameCell(first.cell)} loses it. If ${nameCell(near)} is ${digit}, box ${box + 1} needs its ${digit} in ${otherArm}. That line also rules out ${digit} in ${nameCell(first.cell)}.`,
    }
  }
  if ('wing' in evidence) {
    const { pivot, pincers: [a, b], digits: [x, y, z] } = evidence.wing
    const cells = [pivot, a, b]
    const why = `If ${nameCell(pivot)} is ${x}, ${nameCell(a)} must be ${z}. If ${nameCell(pivot)} is ${y}, ${nameCell(b)} must be ${z}.`
    return {
      cells, candidates: marks(cells, [x, y, z]),
      links: [link(pivot, a, x, true), link(pivot, b, y, true)],
      description: `${nameCell(pivot)} shares ${x} with ${nameCell(a)} and ${y} with ${nameCell(b)}. Both wings also allow ${z}.`,
      reason: technique === 'xyz-wing'
        ? `${why} The pivot can also be ${z}. ${nameCell(first.cell)} sees all three cells.`
        : `${why} ${nameCell(first.cell)} sees both wings.`,
    }
  }
  if ('wxyz-wing' in evidence) {
    const { cells, digits, unrestricted } = evidence['wxyz-wing']
    const restricted = digits.filter((digit) => digit !== unrestricted)
    const restrictedDigits = list.format(restricted.map(String))
    const limits = restricted.map((digit) => {
      const locations = marks(cells, [digit]).map(({ cell }) => cell)
      if (locations.length === 1) return `Candidate ${digit} is restricted; it can go only in ${nameCell(locations[0])}.`
      const house = sharedHouse(locations)
      return house ? `Candidate ${digit} is restricted; all its cells share ${houseName(house)}.`
        : `Candidate ${digit} is restricted; every pair of its cells shares a row, column, or box.`
    })
    const unrestrictedDescription = unrestricted === null ? [] :
      [`Candidate ${unrestricted} is unrestricted because a pair of its candidate cells does not share a row, column, or box.`]
    const targets = new Map<number, number[]>()
    for (const action of actions) {
      if (!('eliminate' in action)) continue
      const { cell, digit } = action.eliminate
      const targetCells = targets.get(digit) ?? []
      targetCells.push(cell)
      targets.set(digit, targetCells)
    }
    const blocked = Array.from(targets, ([digit, targetCells]) => {
      const locations = marks(cells, [digit]).map(({ cell }) => nameCell(cell))
      const placement = targetCells.length === 1 ? `If ${nameCell(targetCells[0])} is ${digit}`
        : `If ${digit} is placed in any of ${list.format(targetCells.map(nameCell))}`
      return `${placement}, it rules out every ${digit} in the wing (${list.format(locations)}).`
    })
    const consequence = actions.length === 1 ? 'That leaves' : 'Each such placement leaves'
    const remaining = unrestricted === null ? 'only three restricted candidates' : `only the three restricted candidates (${restrictedDigits})`
    const result = unrestricted === null
      ? 'They cannot fill all four cells, so the crossed-out digit must appear in the wing.'
      : 'They can fill at most three cells, so the unrestricted candidate must appear in the wing.'
    return {
      cells, candidates: marks(cells, restricted),
      mainLabel: 'Restricted candidates',
      accent: unrestricted === null ? undefined : { candidates: marks(cells, [unrestricted]), label: 'Unrestricted candidate' },
      description: `The four wing cells have four candidate digits between them: ${list.format(digits.map(String))}. At least three are restricted candidates.`,
      ...explainSteps([
        [...limits, ...unrestrictedDescription, 'A restricted candidate can appear at most once in the wing.'].join(' '),
        ...blocked,
        `${consequence} ${remaining} for four cells. ${result}`,
      ]),
    }
  }
  if ('chain' in evidence) {
    const chain = evidence.chain.links
    const start = chain[0].from
    const end = chain[chain.length - 1].to
    const links = chain.map(({ from, to, strength }) => ({ from, to, dashed: strength === 'weak', color: patternColor }))
    const candidates = [start, ...chain.map(({ to }) => to)]
    return {
      candidates, cells: candidates.map(({ cell }) => cell), links,
      description: `Follow the links from ${nameCandidate(start)} to ${nameCandidate(end)}.`,
      reason: `Suppose ${nameCell(start.cell)} cannot be ${start.digit}. The first strong link forces ${nameCandidate(chain[0].to)}. The alternating links then force ${nameCandidate(end)}. Either end rules out ${nameCandidate(first)}.`,
    }
  }
  if ('inference' in evidence) {
    const chain = evidence.inference.links
    const start = chain[0].from
    const closing = chain[chain.length - 1]
    const nodes = [start, ...chain.map(({ to }) => to)]
    const path = chain.map(({ from, to, strength }) => ({
      from: boardPoint(from), to: boardPoint(to), dashed: strength === 'weak', color: patternColor,
    }))
    const singles = nodes.flatMap((node) => 'candidate' in node ? [node.candidate] : [])
    const grouped = nodes.flatMap(node => 'candidate' in node ? [] : inferenceCandidates(node))
    const cellLinks = chain.flatMap(({ from, to, source }) => {
      if (!('almost-locked-set-cell' in source)) return []
      const evidence = source['almost-locked-set-cell']
      const { cell, blocked } = evidence
      const members = [...inferenceCandidates(from), ...inferenceCandidates(to)]
      const inside = members.find(candidate => candidate.cell !== cell)
      const forced = members.find(candidate => candidate.cell === cell)
      return inside && forced ? [{ evidence, inside, forced, blocked: DIGITS.filter(digit => blocked & (1 << (digit - 1))) }] : []
    })
    const alternatives = cellLinks.flatMap(({ forced, blocked }) => marks([forced.cell], blocked))
    const accent = [...grouped, ...alternatives]
    const alsLinks = chain.flatMap(({ from, to, source }) => {
      if (!('almost-locked-set' in source)) return []
      const set = source['almost-locked-set']
      const [a] = inferenceCandidates(from)
      const [b] = inferenceCandidates(to)
      return [{ set, digits: [a.digit, b.digit] }]
    })
    const setNames = (cells: number[]) => list.format(cells.map(nameCell))
    const alsSteps = [...new Set([
      ...alsLinks.map(({ set, digits: [a, b] }) => `The set at ${setNames(set.cells)} can omit only one digit. At least one of ${a} and ${b} must appear there.`),
      ...cellLinks.map(({ evidence, inside, forced, blocked }) =>
        `If the set at ${setNames(evidence.set.cells)} skips ${inside.digit}, it must use ${list.format(blocked.map(String))}. That forces ${nameCandidate(forced)}.`),
    ])]
    const group = nodes.find(node => !('candidate' in node))
    const explainInference = (reason: string) => {
      const steps = [...(group ? [inferenceGroupMeaning] : []), ...alsSteps, reason]
      return steps.length > 1 ? explainSteps(steps) : { reason }
    }
    const pattern = {
      candidates: singles, links: path, cells: [...singles, ...grouped].map(({ cell }) => cell)
        .concat(alsLinks.flatMap(({ set }) => set.cells), cellLinks.flatMap(({ evidence }) => evidence.set.cells)),
      accent: accent.length ? { candidates: accent, label: alternatives.length ? 'Grouped candidates and outside alternatives' : 'Grouped candidates' } : undefined,
    }
    const firstName = nameInference(start)
    const second = nameInference(chain[0].to)
    const groupNote = group ? ' Read each outlined group as one end of a link.' : ''
    if (technique.includes('discontinuous-')) {
      const assumed = chain[0].strength === 'weak' ? 'true' : 'false'
      const other = assumed === 'true' ? 'false' : 'true'
      const startsWithGroup = !('candidate' in start)
      const startType = startsWithGroup ? 'group' : 'candidate'
      const conclusion = !startsWithGroup ? `The starting candidate must be ${other}.`
        : other === 'false' ? 'Every member of the starting group is false. Remove each member.'
          : 'The starting group is true. Remove candidates that conflict with every member.'
      return {
        ...pattern,
        description: `Start at ${firstName}. Follow the alternating links back to the same ${startType}.${groupNote}`,
        ...explainInference(`Suppose ${firstName} is ${assumed}. The first link makes ${second} ${other}. By the time you come back, the loop makes ${firstName} ${other}. ${conclusion}`),
      }
    }
    if (technique.includes('continuous-')) {
      const conflictsWithRemoval = (node: InferenceNode) =>
        inferenceCandidates(node).every(candidate => candidatesConflict(candidate, first))
      const weak = chain.find(({ strength, from, to }) =>
        strength === 'weak' && conflictsWithRemoval(from) && conflictsWithRemoval(to))
      if (!weak) {
        const [lock] = chain.flatMap(({ strength, from, to, source }) => {
          if (strength !== 'strong') return []
          const outside = 'almost-locked-set-cell' in source ? source['almost-locked-set-cell'] : undefined
          const set = outside?.set ?? ('almost-locked-set' in source ? source['almost-locked-set'] : undefined)
          if (!set?.digits.includes(first.digit) || (outside && (outside.blocked & (1 << (first.digit - 1))) !== 0)) return []
          if ([...inferenceCandidates(from), ...inferenceCandidates(to)].some(({ cell, digit }) =>
            digit === first.digit && cell !== outside?.cell)) return []
          const members = marks(set.cells, [first.digit])
          return members.length && members.every(member => candidatesConflict(member, first)) ? [{ members, set, outside }] : []
        })
        const reason = !lock ? 'Exactly one end of each link in this loop must be true.'
          : lock.outside
            ? `Exactly one end of the link at ${setNames(lock.set.cells)} is true. Either way, the set loses one other candidate digit. The set must use ${first.digit} in either case.`
            : `The loop puts exactly one of the two linked digits in the set at ${setNames(lock.set.cells)}. The set must use every other digit, including ${first.digit}.`
        return {
          ...pattern,
          accent: lock ? { candidates: [...accent, ...lock.members], label: 'Grouped and locked candidates' } : pattern.accent,
          description: `Follow the alternating links around the loop, starting at ${firstName}.${groupNote}`,
          ...explainInference(lock ? `${reason} ${capital(nameCandidate(first))} conflicts with every place the set can use it.` : reason),
        }
      }
      const left = nameInference(weak.from)
      const right = nameInference(weak.to)
      return {
        ...pattern,
        description: `The links alternate all the way around the loop, including at ${firstName}.${groupNote}`,
        ...explainInference(`If you rule out ${left}, the rest of the loop forces ${right}. ${capital(nameCandidate(first))} conflicts with ${group ? 'every candidate at both ends' : 'both'}. Check each other removal against the weak link it blocks.`),
      }
    }
    const last = nameInference(closing.to)
    return {
      ...pattern,
      description: `The chain starts and ends with a solid link, at ${firstName} and ${last}.${groupNote}`,
      ...explainInference(`If you rule out ${firstName}, the first link forces ${second}. Follow the rest of the chain to force ${last}. At least one end must be true. Remove any candidate that conflicts with ${group ? 'every candidate at both ends' : 'both ends'}.`),
    }
  }
  if ('multi-coloring' in evidence) {
    const { groups: [left, right], links, bridge, other_bridge: otherBridge } = evidence['multi-coloring']
    const includes = (color: Candidate[], candidate: Candidate) =>
      color.some(({ cell, digit }) => cell === candidate.cell && digit === candidate.digit)
    const leftColor = Number(!includes(left[0], bridge.from))
    const rightColor = Number(!includes(right[0], bridge.to))
    const bridges = otherBridge ? [bridge, otherBridge] : [bridge]
    const describeConflict = (from: Candidate, to: Candidate) => {
      const house = sharedHouse([from.cell, to.cell])
      const location = from.cell === to.cell ? ' in the same cell' : house ? ` in ${houseName(house)}` : ''
      return `${capital(nameCandidate(from))} conflicts with ${nameCandidate(to)}${location}.`
    }
    const opposite = [left[1 - leftColor], right[1 - rightColor]]
    const blockers = opposite.flatMap(color => color.find(candidate => candidatesConflict(candidate, first)) ?? [])
    const reasonSteps = otherBridge
      ? [...bridges.map(({ from, to }) => describeConflict(from, to)),
        'The marked color in the first group conflicts with both colors in the second group.',
        'One color in the second group must be true. Remove the marked color in the first group.']
      : [describeConflict(bridge.from, bridge.to),
        'The blue colors cannot both be true. At least one amber color must be true.',
        ...blockers.map((blocker) => describeConflict(blocker, first)),
        `Remove ${nameCandidate(first)}.`]
    return {
      candidates: otherBridge ? left[leftColor] : [...left[leftColor], ...right[rightColor]],
      mainLabel: otherBridge ? 'Color that causes the contradiction' : 'Conflicting colors',
      accent: {
        candidates: otherBridge ? right.flat() : opposite.flat(),
        label: otherBridge ? 'Both alternatives in the second group' : 'Opposite colors',
      },
      cells: [...left.flat(), ...right.flat()].map(({ cell }) => cell),
      contradictionCells: otherBridge ? [...new Set(bridges.flatMap(({ from, to }) => [from.cell, to.cell]))] : undefined,
      links: [...links, ...bridges].map(({ from, to, strength }) => ({
        from, to, color: patternColor, dashed: strength === 'weak',
      })),
      description: 'The solid links form two groups. Links can connect the same digit or cross digits through bivalue cells. In each group, one color marks the true candidates.',
      ...explainSteps(reasonSteps),
    }
  }
  if ('coloring' in evidence) {
    const { colors: [blue, amber], links, reason } = evidence.coloring
    const mainLabel = 'Blue group'
    const accent = { candidates: amber, label: 'Amber group' }
    const group = (candidate: Candidate) => blue.some(({ cell, digit }) => cell === candidate.cell && digit === candidate.digit) ? 'blue' : 'amber'
    let explanation: string
    let contradictionCells: number[] | undefined
    if (reason === 'both-colors') {
      const a = blue.find((candidate) => candidatesConflict(candidate, first))
      const b = amber.find((candidate) => candidatesConflict(candidate, first))
      explanation = a && b
        ? `In the blue case, ${nameCandidate(a)} rules out ${nameCandidate(first)}. In the amber case, ${nameCandidate(b)} rules it out.`
        : `${capital(nameCandidate(first))} conflicts with a candidate of each color. One of those colors must be placed.`
    } else if ('same-color-conflict' in reason) {
      const [a, b] = reason['same-color-conflict']
      contradictionCells = [...new Set([a.cell, b.cell])]
      explanation = `The ${group(a)} candidates include ${nameCandidate(a)} and ${nameCandidate(b)}. The two conflict ${a.cell === b.cell ? 'in the same cell' : `in ${houseName(sharedHouse([a.cell, b.cell])!)}`}. Remove every ${group(a)} candidate in this connected set.`
    } else if ('emptied-cell' in reason) {
      const cell = reason['emptied-cell']
      const color = group(first)
      const placements = color === 'blue' ? blue : amber
      const blockers = marks([cell], DIGITS).flatMap(target => {
        const blocker = placements.find(candidate => candidatesConflict(candidate, target))
        if (!blocker) return []
        const house = blocker.cell === cell ? undefined : sharedHouse([blocker.cell, cell])
        return [`The ${nameCandidate(blocker)} rules out ${target.digit} there${house ? ` because both cells share ${houseName(house)}` : ''}.`]
      })
      contradictionCells = [cell]
      explanation = [
        `If all ${color} candidates are true, ${nameCell(cell)} has no candidate left.`,
        ...blockers,
        `Remove every ${color} candidate in this connected set.`,
      ].join(' ')
    } else {
      const { house, digit } = reason['emptied-house']
      contradictionCells = marks(houseCells(house), [digit]).map(({ cell }) => cell)
      explanation = `Placing the ${group(first)} candidates leaves ${houseName(house)} with no place for ${digit}. Remove that color throughout this connected set.`
    }
    return {
      candidates: blue, mainLabel, accent, cells: [...blue, ...amber].map(({ cell }) => cell), contradictionCells,
      links: links.map(({ from, to }) => ({ from, to, color: patternColor })),
      description: 'Exactly one candidate on each colored link is true. Within this connected set, either all blue candidates or all amber candidates are true.',
      reason: explanation,
    }
  }
  if ('bug-plus-one' in evidence) {
    const { cell, candidates: digits, houses } = evidence['bug-plus-one']
    return {
      cells: [cell], houses, candidates: marks([cell], digits),
      description: `${nameCell(cell)} is the only empty cell with three candidates. ${first.digit} occurs three times in each of its three houses.`,
      reason: `Suppose ${nameCell(cell)} loses ${first.digit}. Each empty cell then has two choices. Every missing digit has two places in each house that needs it. Swapping the choices gives a second solution. This puzzle has one solution, so the cell needs ${first.digit}.`,
    }
  }
  if ('forcing' in evidence) {
    const { branches } = evidence.forcing
    const starting = branches.map(({ assumption }) => assumption.candidate)
      .filter(({ cell, digit }) => cell !== first.cell || digit !== first.digit)
    const statement = ({ candidate, truth }: { candidate: Candidate; truth: boolean }) =>
      `${candidate.digit} ${truth ? 'goes in' : 'is ruled out in'} ${nameCell(candidate.cell)}`
    const trace = branches.map(({ assumption, steps, conflict }) => {
      const effects = [assumption, ...steps.map(({ effect }) => effect)]
      let conclusion = `This choice also ${'place' in firstAction ? 'forces' : 'rules out'} ${nameCandidate(first)}.`
      if (conflict && 'opposite' in conflict) {
        conclusion = `This trial both forces and rules out ${nameCandidate(effects[conflict.opposite[0]].candidate)}.`
      } else if (conflict && 'exhausted' in conflict) {
        const { scope } = conflict.exhausted
        if (typeof scope === 'object') {
          if ('cell' in scope) conclusion = `This trial leaves ${nameCell(scope.cell)} without a candidate.`
          if ('house' in scope) conclusion = `There is no place for ${scope.house.digit} in ${houseName(scope.house.house)}.`
        }
      }
      if (conflict && 'cases' in conflict) {
        const inner = conflict.cases.map(({ branch }) => statement(branch.assumption))
        conclusion = `The two inner cases are “${inner[0]}” and “${inner[1]}.” Both lead to a conflict, so the starting assumption is impossible.`
      }
      return {
        assumption: `Suppose ${statement(assumption)}.`,
        steps: steps.map(({ effect, causes }) => `${capital(statement(effect))} (from ${list.format(causes.map((index) => index === 0 ? 'the assumption' : `step ${index}`))}).`),
        conclusion,
      }
    })
    return {
      candidates: branches.flatMap(({ steps }) => steps.map(({ effect }) => effect.candidate)),
      accent: starting.length ? { candidates: starting, label: 'Starting assumption' } : undefined,
      description: trace[0].assumption,
      reason: branches.length === 1
        ? trace[0].conclusion
        : `Every starting choice ${'place' in firstAction ? 'forces' : 'rules out'} ${nameCandidate(first)}.`,
      trace,
    }
  }
  if ('unique-rectangle' in evidence) {
    const { corners, digits, support } = evidence['unique-rectangle']
    const pair = list.format(digits.map(String))
    const description = `${list.format(corners.map(nameCell))} form a rectangle in two boxes. If all four corners use only ${pair}, swapping those digits gives a second solution.`
    if ('extra-candidates' in support) {
      const extras = support['extra-candidates']
      const reason = technique === 'unique-rectangle-1'
        ? `Only ${nameCell(first.cell)} has an extra candidate. If you place either digit from the pair there, swapping the digits in the four corners gives a second solution.`
        : `At least one of ${list.format(extras.map(({ cell }) => nameCell(cell)))} must be ${first.digit}. ${nameCell(first.cell)} sees them all.`
      return { cells: corners, candidates: marks(corners, digits), accent: { candidates: extras, label: 'Extra candidate' }, description, reason }
    }
    if ('subset' in support) {
      const { cells, digits: locked, houses } = support.subset
      return {
        houses, cells: [...corners, ...cells], candidates: marks(corners, digits),
        accent: { candidates: marks([...corners, ...cells], locked), label: 'Subset candidate' }, description,
        reason: `One corner must use an extra digit. Count the corners with extras as one slot and add ${list.format(cells.map(nameCell))}. Those slots need ${list.format(locked.map(String))} between them.`,
      }
    }
    const { houses, digit } = support['strong-links']
    const links = houses.flatMap((house) => {
      const cells = houseCells(house).filter((cell) => corners.includes(cell))
      return cells.length === 2 ? [link(cells[0], cells[1], digit)] : []
    })
    const reason = technique === 'unique-rectangle-6'
      ? `The links force ${digit} onto one diagonal. Placing it on the diagonal with extra candidates would force all four corners to use ${pair}. ${digit} must use the other diagonal.`
      : technique === 'hidden-rectangle'
        ? `If ${nameCell(first.cell)} were ${first.digit}, both links would force ${digit} into the adjacent corners. The opposite corner would be ${first.digit}, completing a rectangle that could be swapped.`
        : `One of the linked corners must be ${digit}. If the other linked corner were ${first.digit}, the opposite corners would complete a rectangle that could be swapped. Both linked corners therefore lose ${first.digit}.`
    return { houses, cells: corners, candidates: marks(corners, digits), links, description, reason }
  }
  if ('als-xz' in evidence || 'als-chain' in evidence) {
    const alsXz = 'als-xz' in evidence
    const { sets, links } = alsXz ? evidence['als-xz'] : evidence['als-chain']
    const setLocation = (index: number) => list.format(sets[index].cells.map(nameCell))
    const rccCells = (index: number, digit: number) => marks(sets[index].cells, [digit]).map(({ cell }) => cell)
    const linkConflict = (index: number, digit: number) => {
      const locations = [...rccCells(index, digit), ...rccCells(index + 1, digit)]
      const house = sharedHouse(locations)
      return house ? `The ${digit} candidates in sets ${index + 1} and ${index + 2} share ${houseName(house)}.`
        : `Each ${digit} candidate in set ${index + 1} shares a row, column, or box with every ${digit} candidate in set ${index + 2}.`
    }
    const last = sets.length - 1
    const cells = sets.flatMap(({ cells }) => cells)
    const ends = [...sets[0].cells, ...sets[last].cells]
    const singlyLinked = alsXz && links.length === 1
    const pattern = {
      cells,
      candidates: alsXz && !singlyLinked ? sets.flatMap(({ cells, digits }) => marks(cells, digits)) : marks(ends, [first.digit]),
      mainLabel: singlyLinked ? 'Unrestricted common candidate' : alsXz ? 'Set candidate' : 'Common candidate at the ends',
      accent: {
        candidates: links.flatMap((digit, index) =>
          marks(alsXz ? cells : [...sets[index].cells, ...sets[index + 1].cells], [digit])),
        label: 'Restricted common candidate',
      },
      description: 'Each set shares one house, so its cells need different digits. Each set has one extra candidate digit and must use all the others.',
    }
    if (sets.length === 2) {
      const reasonSteps = links.map(digit => `${linkConflict(0, digit)} Placing ${digit} in one set rules it out in the other.`)
      if (links.length === 2) {
        reasonSteps.push(`One set must skip ${links[0]} and the other must skip ${links[1]}. Each set must use all its remaining digits.`)
        const targets = actions.flatMap(action => 'eliminate' in action ? [action.eliminate] : [])
        const linkedTarget = targets.find(({ digit }) => links.includes(digit))
        if (linkedTarget) reasonSteps.push(nameRemoval(linkedTarget, marks(cells, [linkedTarget.digit])))
        const otherTarget = targets.find(({ digit }) => !links.includes(digit))
        if (otherTarget) {
          for (const set of sets) {
            const placements = marks(set.cells, [otherTarget.digit])
            if (!placements.length || !placements.every(candidate => candidatesConflict(candidate, otherTarget))) continue
            reasonSteps.push(nameRemoval(otherTarget, placements))
            break
          }
        }
      } else {
        reasonSteps.push(`At least one set skips ${links[0]}. That set must use its other digits, including the shared ${first.digit}.`,
          nameRemoval(first, marks(cells, [first.digit])))
      }
      return { ...pattern, ...explainSteps(reasonSteps) }
    }
    const states = alsChainCandidateStates(sets.map(set => set.cells), links, candidates, first.digit)
    const [on, off] = CHAIN_COLOR_PAIRS[0]
    const reasonSteps = [
      `Start with set 1 at ${setLocation(0)}. If it skips ${first.digit}, it must use ${links[0]}. ${on} shows digits a set must use in this case. ${off} shows digits a set must skip.`,
      ...links.map((digit, index) => `${linkConflict(index, digit)} Placing ${digit} in set ${index + 1} rules it out in set ${index + 2} (${setLocation(index + 1)}). This set must use ${links[index + 1] ?? first.digit}.`),
      `Either way, one of the end sets must use ${first.digit}.`,
      nameRemoval(first, marks(ends, [first.digit])),
    ]
    return {
      ...pattern,
      candidates: states.on,
      mainLabel: 'ON in this case',
      mainColor: chainColor(on),
      accent: { candidates: states.off, label: 'OFF in this case', color: chainColor(off) },
      links: links.map((digit, index) => ({
        from: { cells: rccCells(index, digit), digit },
        to: { cells: rccCells(index + 1, digit), digit },
        color: 'var(--chain-neutral)',
        dashed: true,
        hideGroupOutlines: true,
      })),
      ...explainSteps(reasonSteps),
    }
  }
  if ('death-blossom' in evidence) {
    const { stem, petals } = evidence['death-blossom']
    const stemDigits = petals.map(({ digit }) => digit)
    return {
      cells: [stem, ...petals.flatMap(({ set }) => set.cells)],
      candidates: petals.flatMap(({ set }) => marks(set.cells, [first.digit])),
      mainLabel: 'Common candidate in the petals',
      accent: {
        candidates: [...marks([stem], stemDigits), ...petals.flatMap(({ digit, set }) => marks(set.cells, [digit]))],
        label: 'Linking candidate',
      },
      description: `The stem is ${nameCell(stem)}. Each of its candidates rules out one digit throughout its own petal. That petal then needs all its other digits.`,
      ...explainSteps([
        ...petals.map(({ digit, set }) => `If ${nameCell(stem)} is ${digit}, that rules out ${digit} in the set at ${list.format(set.cells.map(nameCell))}. That set must use ${first.digit}.`),
        nameRemoval(first, petals.flatMap(({ set }) => marks(set.cells, [first.digit]))),
      ]),
    }
  }
  if ('sue-de-coq' in evidence) {
    const { intersection, digits, line, block } = evidence['sue-de-coq']
    return {
      houses: [line.house, block.house], cells: [...intersection, ...line.cells, ...block.cells],
      candidates: [...marks(intersection, digits), ...marks(line.cells, line.digits), ...marks(block.cells, block.digits)],
      description: `${list.format(intersection.map(nameCell))} lie in both ${houseName(line.house)} and ${houseName(block.house)}. The set in ${houseName(line.house)} allows ${list.format(line.digits.map(String))}. The set in ${houseName(block.house)} allows ${list.format(block.digits.map(String))}.`,
      reason: 'Each side set uses different digits from the overlap. Together they account for all the spare choices. The highlighted cells must supply the line digits to the line and the box digits to the box.',
    }
  }
  if ('exocet' in evidence) {
    const { bases, targets, crossLines, covers } = evidence.exocet
    const digits = covers.map(({ digit }) => digit)
    return {
      houses: crossLines, cells: [...bases, ...targets], candidates: marks(bases, digits),
      accent: { candidates: marks(targets, digits), label: 'Target candidate' },
      description: `Each digit in the base pair at ${list.format(bases.map(nameCell))} must appear on all three crossing lines, ${list.format(crossLines.map(houseName))}. Cells that see both bases lose that digit. The remaining places outside ${list.format(targets.map(nameCell))} fit in at most two houses.`,
      reason: 'At most two copies fit outside the targets. Each base digit needs a third copy in a target. A crossed-out candidate cannot occur with any valid arrangement of the two base digits.',
    }
  }
  if ('sk-loop' in evidence || 'multi-sector-locked-sets' in evidence) {
    const { cells: body, links } = 'sk-loop' in evidence
      ? { cells: evidence['sk-loop'].arms.flat(), links: evidence['sk-loop'].links }
      : { cells: [...evidence['multi-sector-locked-sets'].core, ...evidence['multi-sector-locked-sets'].attachments], links: evidence['multi-sector-locked-sets'].links }
    const cells = [...new Set(body)]
    const linkDetails = list.format(links.map(({ house, digits }) => `${digits.join(', ')} in ${houseName(house)}`))
    return {
      cells, houses: links.map(({ house }) => house), candidates: marks(cells, DIGITS),
      description: `Each digit in a linked house supplies one slot. The slots are ${linkDetails}. All ${cells.length} highlighted cells need a slot, and there are exactly ${cells.length}.`,
      reason: 'The group needs every slot. An outside candidate that uses one leaves too few for the group. An inside candidate that uses two also leaves too few.',
    }
  }
  if (!('w-wing' in evidence)) return undefined
  const { wings, link: pair, linkedDigit, digit } = evidence['w-wing']
  const [a, b] = wings
  const [start, end] = pair.cells
  const [left, right] = peer(a, start) && peer(b, end) ? [start, end] : [end, start]
  return {
    houses: [pair.house], cells: [...wings, start, end],
    candidates: [...marks(wings, [linkedDigit, digit]), ...marks(pair.cells, [linkedDigit])],
    links: [link(a, left, linkedDigit, true), link(left, right, linkedDigit), link(right, b, linkedDigit, true)],
    description: `${nameCell(a)} and ${nameCell(b)} each have ${linkedDigit} and ${digit}. In ${houseName(pair.house)}, ${linkedDigit} must go in ${nameCell(left)} or ${nameCell(right)}.`,
    reason: `If ${nameCell(left)} is ${linkedDigit}, ${nameCell(a)} must be ${digit}. If ${nameCell(right)} is ${linkedDigit}, ${nameCell(b)} must be ${digit}. ${nameCell(first.cell)} sees both wings.`,
  }
}

// Lessons retain their established notation unless a display preference is supplied.
function displayCellName({ cellReferenceStyle, difficulty, gridSize = 9 }: CellReferenceOptions) {
  return cellReferenceStyle === undefined ? (cell: number) => `R${Math.floor(cell / gridSize) + 1}C${cell % gridSize + 1}`
    : (cell: number) => cellReference(cell, cellReferenceStyle, difficulty, gridSize)
}

export function deductionResults(actions: readonly DeductionAction[], options: CellReferenceOptions = {}) {
  const nameCell = displayCellName(options)
  const results: string[] = []
  const removals = new Map<number, string[]>()
  for (const action of actions) {
    if ('place' in action) {
      const { cell, digit } = action.place
      results.push(`Place ${digit} in ${nameCell(cell)}.`)
    } else {
      const { cell, digit } = action.eliminate
      const locations = removals.get(digit) ?? []
      locations.push(nameCell(cell))
      removals.set(digit, locations)
    }
  }
  for (const [digit, locations] of removals) {
    results.push(`Remove ${digit} from ${list.format(locations)}.`)
  }
  return results
}

// These proofs already include the cells and candidates to mark on the board.
function explainProof({ evidence, actions, technique }: Deduction, nameCell = cellName) {
  const nameCandidate = (candidate: Candidate) => labelCandidate(candidate, nameCell)
  const names = (cells: readonly number[]) => list.format(cells.map(nameCell))
  const digits = (values: readonly number[]) => list.format(values.map(String))
  const houses = (groups: readonly House[]) => list.format(groups.map(houseName))
  const action = actions[0]
  const target = 'place' in action ? action.place : action.eliminate
  if ('aligned-exclusion' in evidence) {
    const { cases, cells } = evidence['aligned-exclusion']
    const targetIndex = cells.indexOf(target.cell)
    const trial = cases.find(c => c.digits[targetIndex] === target.digit)
    const description = `Suppose ${nameCell(target.cell)} is ${target.digit}. Try the choices in ${names(cells.filter(c => c !== target.cell))}.`
    let example = ''
    if (trial) {
      const values = cells.map((cell, i) => `${nameCell(cell)} = ${trial.digits[i]}`)
      const problem = 'empty-cell' in trial.reason ? `${nameCell(trial.reason['empty-cell'])} loses its last candidate`
        : `${names(trial.reason['repeated-digit'])} repeat a digit in ${houseName(sharedHouse(trial.reason['repeated-digit'])!)}`
      example = `For example, with ${list.format(values)}, ${problem}. `
    }
    return { description, reason: `${example}Every combination with ${nameCandidate(target)} breaks a rule.` }
  }
  if ('pattern-overlay' in evidence) {
    const { scopes, geometry } = evidence['pattern-overlay']
    const description = scopes.length === 1 ? `Trace all nine copies of ${scopes[0].digit}.`
      : `Compare the complete layouts for ${digits(scopes.map(scope => scope.digit))}. Each cell can hold only one digit.`
    const units = geometry ? 'each required house' : 'each row, column, and box'
    const outcome = 'place' in action ? `Every possible arrangement puts ${nameCandidate(target)}.`
      : `No possible arrangement includes ${nameCandidate(target)}.`
    return { description, reason: `Each layout puts its digit once in ${units}. ${outcome}` }
  }
  if ('unique-loop' in evidence) {
    const { digits: pair, sides, support } = evidence['unique-loop']
    const description = `The ${sides[0].length + sides[1].length} cells of the loop share ${digits(pair)}. Using only those digits allows a swap and a second solution.`
    let reason: string
    if ('extra-candidates' in support) {
      const extras = support['extra-candidates']
      reason = extras.length === 1
        ? `Only ${nameCandidate(extras[0])} can prevent the swap. That cell cannot use either loop digit.`
        : `One of the extra candidates must be true. The possible extras are ${list.format(extras.map(c => nameCandidate(c)))}.`
    } else if ('strong-links' in support) {
      const { digit, houses: linked } = support['strong-links']
      reason = `Only the two cells with extras can supply ${digit} in ${houseName(linked[0])}. One needs ${digit}, so the other must use an extra to prevent the swap.`
    } else if ('hidden-subset' in support) {
      const { cells, digits: locked, house } = support['hidden-subset']
      reason = `The loop needs an extra digit. In ${houseName(house)}, that reserves ${names(cells)} for digits from ${digits(locked)}. Remove their other candidates.`
    } else {
      const { cells, digits: locked } = support.subset
      reason = `At least one loop cell must use an extra digit. Count those cells as one slot alongside ${names(cells)}. These slots need ${digits(locked)}.`
    }
    return { description, reason }
  }
  if ('tridagon' in evidence) {
    const { digits: core, guardians, branches } = evidence.tridagon
    const description = `The twelve marked cells cannot all use just ${digits(core)}. At least one extra candidate must be true.`
    const reason = branches.length ? `The guardian trials ${'place' in action ? 'force' : 'rule out'} ${nameCandidate(target)}.`
      : guardians.length === 1 ? `The only extra candidate is ${nameCandidate(guardians[0])}. It must be true.`
        : `The extra candidates are ${list.format(guardians.map(c => nameCandidate(c)))}. The target conflicts with all of them.`
    return { description, reason }
  }
  if ('kraken-fish' in evidence) {
    const { digit, bases, covers } = evidence['kraken-fish']
    const description = `For ${digit}, the bases are ${houses(bases)}. The covers are ${houses(covers)}.`
    const reason = technique === 'kraken-fish-1'
      ? `Without the fins, the fish rules out ${nameCandidate(target)}. Each true fin starts a chain that rules it out too.`
      : `At least one of the fish placements or fins must be true. Every one starts a chain that rules out ${nameCandidate(target)}.`
    return { description, reason }
  }
  if ('firework' in evidence) {
    const { pivots, wings } = evidence.firework
    const description = pivots.map(p => `Each of ${digits(p.digits)} must appear at ${nameCell(p.cell)} or in a wing.`).join(' ')
    return { description, reason: `The wings are ${names(wings)}. Together the pivots and wings need all their places for the Firework digits.` }
  }
  if ('firework-w-wing' in evidence) {
    const { pivot, bivalue, digits: pair } = evidence['firework-w-wing']
    return { description: `${names(bivalue)} each allow only ${digits(pair)}.`,
      reason: `If ${nameCell(target.cell)} is ${target.digit}, both cells must use the other digit. Both Firework digits then lose their wing places and need ${nameCell(pivot)}.` }
  }
  if ('firework-l-wing' in evidence) {
    const { pivot, link, linked_digit: digit, wings } = evidence['firework-l-wing']
    return { description: `${capital(houseName(link.house))} has just two places for ${digit}, ${names(link.cells)}.`,
      reason: `If ${nameCell(target.cell)} is ${target.digit}, the link forces ${digit} into the other wing. Neither ${nameCell(wings[0])} nor ${nameCell(wings[1])} can then supply a Firework digit. Both Firework digits then need the pivot at ${nameCell(pivot)}.` }
  }
  if ('firework-als-wing' in evidence) {
    const { bivalue, pivots, digits: pair } = evidence['firework-als-wing']
    return { description: `${nameCell(bivalue)} allows only ${digits(pair)}. Its digit blocks every wing place for that digit in both Fireworks.`,
      reason: `Both pivots, ${names(pivots)}, must use that digit. The other digit needs a wing in each Firework. Neither choice allows the crossed-out candidates.` }
  }
  if ('grouped-exocet' in evidence) {
    const { bases, crossLines } = evidence['grouped-exocet']
    return { description: `Trace the digits from ${names(bases)} across ${houses(crossLines)}.`,
      reason: 'Each base digit needs three copies on those lines. At most two fit outside the targets, so at least one target place must hold it.' }
  }
  if ('double-exocet' in evidence || 'grouped-double-exocet' in evidence) {
    const { components: [a, b], crossLines } = 'double-exocet' in evidence ? evidence['double-exocet'] : evidence['grouped-double-exocet']
    return { description: `The bases at ${names(a.bases)} and the bases at ${names(b.bases)} both use ${houses(crossLines)}.`,
      reason: 'Both base pairs must fit their targets on the same crossing lines. No way to fill both patterns supports a crossed-out candidate.' }
  }
}


export function lessonDiagram({ deduction, candidates, pattern: lessonPattern }: Pick<LessonExample, 'deduction' | 'candidates' | 'pattern'>,
  proof = lessonPattern, options: CellReferenceOptions & { showActions?: boolean; grid?: PlayGrid } = {}) {
  const { showActions = true, grid = CLASSIC_GRID } = options
  const displayOptions = { ...options, gridSize: grid.size }
  let variant = 'variant' in deduction.evidence ? deduction.evidence.variant : undefined
  if (variant?.source && options.cellReferenceStyle !== undefined) {
    const copy = variantHintChoice(variant.source.deduction, variant.source.puzzle, options).evidence
    if ('variant' in copy) variant = copy.variant
  }
  const pattern: Pattern | undefined = variant
    ? proof && { ...proof, description: variant.description, reason: variant.reason, reasonSteps: variant.reasonSteps, trace: variant.trace }
    : describePattern(deduction, candidates, displayCellName(displayOptions)) ?? (proof && { ...proof, description: '', reason: '', ...explainProof(deduction, displayCellName(displayOptions)) })
  if (!pattern) throw new Error(`Missing diagram for ${deduction.technique}`)
  const sets = styledSets(proofCellSets(deduction.evidence))
  const setCells = setAnnotations(sets)
  const cells = new Map<number, CellAnnotation>()
  const candidateMarks = new Map<number, Map<number, CandidateAnnotation>>()
  const roles = wingCellRoles(deduction.evidence, cell => candidateCount(candidates[cell] ?? 0))
  const tint = (houses: House[] | undefined, fill: string) => {
    for (const house of houses ?? []) {
      for (const cell of houseCells(house, grid)) cells.set(cell, { fill })
    }
  }
  const mark = ({ cell, digit }: Candidate, color: string, label: string, strike = false) => {
    const marks = candidateMarks.get(cell) ?? new Map<number, CandidateAnnotation>()
    marks.set(digit, { color, mark: strike ? 'strike' : 'ring', label })
    candidateMarks.set(cell, marks)
  }
  tint(pattern.otherHouses, 'var(--lesson-secondary-fill)')
  tint(pattern.houses, 'var(--lesson-area-fill)')
  if (!sets.length) {
    for (const cell of pattern.cells ?? []) cells.set(cell, { fill: 'var(--lesson-pattern-fill)', label: 'pattern cell' })
  }
  for (const [cell, annotation] of setCells) cells.set(cell, annotation)
  for (const cell of subsetMembers(deduction.evidence)) cells.set(cell, { setMarkers: [{ color: setColors[0].fill, label: 'Subset' }] })
  for (const cell of pattern.contradictionCells ?? []) cells.set(cell, { ...cells.get(cell), fill: contradictionFill, label: 'contradiction cell' })
  for (const cell of roles.wings) cells.set(cell, { ...cells.get(cell), fill: 'var(--lesson-wing-fill)', label: 'wing cell' })
  for (const cell of roles.pivots) cells.set(cell, { ...cells.get(cell), fill: 'var(--lesson-pivot-fill)', label: 'pivot cell' })
  for (const candidate of pattern.candidates) mark(candidate, pattern.mainColor ?? patternColor, pattern.mainLabel ?? 'in the pattern')
  if (pattern.accent) {
    for (const candidate of pattern.accent.candidates) mark(candidate, pattern.accent.color ?? accentColor, pattern.accent.label)
  }
  for (const action of showActions ? deduction.actions : []) {
    if ('place' in action) {
      const { cell } = action.place
      cells.set(cell, { ...cells.get(cell), fill: 'var(--lesson-result-fill)', fills: undefined })
      mark(action.place, resultColor, 'to place')
      const bit = 1 << (action.place.digit - 1)
      for (const peer of placementPeers(cell, grid)) {
        if ((candidates[peer] ?? 0) & bit) mark({ cell: peer, digit: action.place.digit }, removalColor, 'to remove after this placement', true)
      }
    } else {
      mark(action.eliminate, removalColor, 'to remove', true)
    }
  }
  const results = deductionResults(deduction.actions, displayOptions)
  const annotations: BoardAnnotations = { cells, candidates: candidateMarks, links: pattern.links }
  const { description, mainLabel = 'Pattern candidate', mainColor, accent, trace } = pattern
  const { reason, reasonSteps } = sets.length
    ? explainSteps([setLocations(sets, displayCellName(displayOptions)), ...(pattern.reasonSteps ?? [pattern.reason])])
    : pattern
  const focus = [...candidateMarks.keys(), ...setCells.keys(), ...(pattern.contradictionCells ?? []),
    ...('house' in deduction.evidence ? houseCells(deduction.evidence.house, grid) : [])]
  return { annotations, setReferences: sets, region: enclosingRegion(focus.length ? focus : [...cells.keys()], grid.size), description, reason, reasonSteps,
    mainLabel, mainColor, accentLabel: accent?.label, accentColor: accent?.color, results, trace }
}

function enclosingRegion(cells: number[], gridSize: number): BoardRegion {
  const span = (coordinates: number[]) => {
    const low = Math.min(...coordinates)
    const high = Math.max(...coordinates)
    const size = Math.max(4, high - low + 1)
    const start = Math.min(gridSize - size, Math.max(0, low - Math.floor((size - (high - low + 1)) / 2)))
    return [start, size]
  }
  const [row, rows] = span(cells.map((cell) => Math.floor(cell / gridSize)))
  const [column, columns] = span(cells.map((cell) => cell % gridSize))
  return { row, column, rows, columns }
}
