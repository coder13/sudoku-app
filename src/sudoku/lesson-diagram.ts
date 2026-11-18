import type { BoardAnnotations, BoardLink, BoardRegion, CandidateAnnotation, CellAnnotation } from '../components/BoardAnnotations'
import type { Candidate, Deduction, DeductionAction, Difficulty, HintChoice, House, InferenceNode, LessonExample, PositionSnapshot, ProofPattern } from './engine'
import { DIGITS, peer } from './game.ts'
import { cellReference, type CellReferenceOptions, type CellReferenceStyle } from './hints.ts'
import { variantHintChoice } from './variant-hints.ts'

type Pattern = {
  houses?: House[]
  otherHouses?: House[]
  cells?: number[]
  candidates: Candidate[]
  mainLabel?: string
  accent?: { candidates: Candidate[]; label: string }
  links?: BoardLink[]
  description: string
  reason: string
  reasonSteps?: string[]
  trace?: { assumption: string; steps: string[]; conclusion: string }[]
  sets?: DiagramSet[]
  linkSteps?: LinkStep[]
  removalStep?: { candidates: Candidate[]; text?: string }
}

type DiagramSet = { cells: readonly number[]; label: string }
type LinkStep = { label: string; text: string; candidates: Candidate[]; links: BoardLink[] }
export type DiagramStep = {
  label: string
  text?: string
  key?: { label: string; fill: string; cells: string }[]
  annotations: BoardAnnotations
}

const patternColor = 'var(--lesson-pattern)'
const linkColor = 'var(--lesson-link)'
const accentColor = 'var(--lesson-accent)'
const resultColor = 'var(--lesson-result)'
const removalColor = 'var(--lesson-removal)'
const list = new Intl.ListFormat('en')
const either = new Intl.ListFormat('en', { type: 'disjunction' })
export const cellName = (cell: number) => `R${Math.floor(cell / 9) + 1}C${cell % 9 + 1}`
export const lessonValues = ({ givens, entries }: Pick<PositionSnapshot, 'givens' | 'entries'>) =>
  [...givens].map((digit, cell) => digit === '0' ? entries[cell] : digit).join('')
const labelCandidate = ({ cell, digit }: Candidate, nameCell: (cell: number) => string) => `${digit} in ${nameCell(cell)}`
export const candidateName = (candidate: Candidate) => labelCandidate(candidate, cellName)
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

export function houseCells(house: House) {
  return DIGITS.map((_, index) => {
    if ('row' in house) return house.row * 9 + index
    if ('column' in house) return index * 9 + house.column
    return Math.floor(house.box / 3) * 27 + (house.box % 3) * 3 + Math.floor(index / 3) * 9 + index % 3
  })
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

export function hintLocation(hint: HintChoice, style: CellReferenceStyle, difficulty?: Difficulty) {
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
    const nameCell = (cell: number) => cellReference(cell, style, difficulty)
    const text = `Start at ${inferenceName(start, nameCell)}. The other end is ${inferenceName(end, nameCell)}.`
    const annotations: BoardAnnotations = { cells, candidates }
    return { text, annotations }
  }

  const { evidence, pattern } = hint
  if (!pattern) return
  const focus = 'house' in evidence ? [] : pattern.cells
  const cells = new Map<number, CellAnnotation>()
  for (const house of pattern.houses) {
    for (const cell of houseCells(house)) cells.set(cell, { fill: 'var(--lesson-area-fill)', label: 'hint area' })
  }
  for (const cell of focus) cells.set(cell, { fill: 'var(--lesson-pattern-fill)', label: 'hint cell' })

  const references = focus.length ? focus.map((cell) => cellReference(cell, style, difficulty)) : pattern.houses.map(houseName)
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

function sightLines(from: number, targets: readonly number[], nameCell: (cell: number) => string) {
  const byHouse = new Map<string, number[]>()
  for (const cell of new Set(targets)) {
    const house = sharedHouse([from, cell])
    if (!house) continue
    const name = houseName(house)
    const cells = byHouse.get(name) ?? []
    cells.push(cell)
    byHouse.set(name, cells)
  }
  return list.format([...byHouse].map(([house, cells]) => `${list.format(cells.map(nameCell))} through ${house}`))
}

function weakLinkStep(from: Candidate[], to: Candidate[], fromLabel: string, toLabel: string, digit: number,
  nameCell: (cell: number) => string): LinkStep {
  const candidates = [...from, ...to]
  const house = sharedHouse(candidates.map(({ cell }) => cell))
  const conflicts = house
    ? `The ${digit} candidates in ${fromLabel} and ${toLabel} share ${houseName(house)}.`
    : from.map(({ cell }) => `${nameCell(cell)} sees ${sightLines(cell, to.map(candidate => candidate.cell), nameCell)}.`).join(' ')
  // Fan out from a single candidate. For two groups, a single line joins the rings on the two sides.
  const style = { color: linkColor, dashed: true, offsetLongAligned: true }
  const links = from.length === 1 || to.length === 1
    ? from.flatMap(a => to.map(b => ({ from: a, to: b, ...style })))
    : [{ from: { candidates: from }, to: { candidates: to }, ...style }]
  return {
    label: `Link on ${digit}`,
    text: `${conflicts} Placing ${digit} in ${fromLabel} rules out ${digit} in ${toLabel}.`,
    candidates, links,
  }
}

function explainSetRemoval(target: Candidate, placements: Candidate[], nameCell: (cell: number) => string) {
  const { cell, digit } = target
  const locations = [...new Set(placements.map(candidate => candidate.cell))]
  const required = locations.length === 1 ? `${nameCell(locations[0])} must be ${digit}.`
    : `At least one of ${list.format(locations.map(nameCell))} must be ${digit}.`
  return `${required} If ${nameCell(cell)} is ${digit}, it rules out ${digit} in ${sightLines(cell, locations, nameCell)}.`
}

function eliminationStep(actions: DeductionAction[], supporting: (target: Candidate) => Candidate[],
  nameCell: (cell: number) => string) {
  const eliminations = actions.flatMap(action => 'eliminate' in action ? [action.eliminate] : [])
  const supports = eliminations.map(target => supporting(target))
  const [first] = eliminations
  if (!first) return undefined
  const places = sightLines(first.cell, supports[0].map(({ cell }) => cell), nameCell)
  const sameSightLines = eliminations.every(({ cell }, index) =>
    cell === first.cell && sightLines(cell, supports[index].map(candidate => candidate.cell), nameCell) === places)
  const digits = list.format([...new Set(eliminations.map(({ digit }) => digit))].map(String))
  return {
    candidates: supports.flat(),
    text: places ? `${nameCell(first.cell)} sees every possible ${sameSightLines ? digits : first.digit} at ${places}.${
      sameSightLines ? '' : ' Check the other removals the same way.'}` : undefined,
  }
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
    const coverCells = covers.map(houseCells)
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
    const candidates = marks([...new Set(bases.flatMap(houseCells))], [digit])
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
    const coverCells = new Set(covers.flatMap(houseCells))
    const candidates = marks(bases.flatMap(houseCells).filter((cell) => coverCells.has(cell)), [digit])
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
    const xyz = technique === 'xyz-wing'
    const linkSteps = [
      weakLinkStep(marks([pivot], [x]), marks([a], [x]), 'the pivot', 'the first wing', x, nameCell),
      weakLinkStep(marks([pivot], [y]), marks([b], [y]), 'the pivot', 'the second wing', y, nameCell),
    ]
    const why = [x, y].map((digit, index) => {
      const wing = [a, b][index]
      return `If ${nameCell(pivot)} is ${digit}, ${houseName(sharedHouse([pivot, wing])!)} rules out ${digit} in ${nameCell(wing)}, so ${nameCell(wing)} must be ${z}.`
    })
    const removalStep = eliminationStep(actions, () => marks(xyz ? [a, b, pivot] : [a, b], [z]), nameCell)
    return {
      sets: [{ cells: [a], label: 'First wing' }, { cells: [pivot], label: 'Pivot' }, { cells: [b], label: 'Second wing' }],
      candidates: marks([a, pivot, b], [x, y, z]), linkSteps, removalStep,
      description: `${nameCell(pivot)} shares ${x} with ${nameCell(a)} and ${y} with ${nameCell(b)}. Both wings also allow ${z}.`,
      reason: [...why, xyz ? `The pivot can also be ${z}.` : '', removalStep?.text].filter(Boolean).join(' '),
    }
  }
  if ('wxyz-wing' in evidence) {
    const { cells, digits, unrestricted } = evidence['wxyz-wing']
    const restricted = digits.filter((digit) => digit !== unrestricted)
    const restrictedDigits = list.format(restricted.map(String))
    const limits = restricted.map((digit) => {
      const locations = marks(cells, [digit]).map(({ cell }) => cell)
      if (locations.length === 1) return `In the wing, ${digit} can go only in ${nameCell(locations[0])}.`
      const house = sharedHouse(locations)
      return house ? `The candidates for ${digit} share ${houseName(house)}.`
        : `Any two cells with candidate ${digit} share a row, column, or box.`
    })
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
      const placement = targetCells.length === 1 ? `${digit} in ${nameCell(targetCells[0])}` : `any crossed-out ${digit}`
      return `Placing ${placement} would rule out every ${digit} in the wing (${list.format(locations)}).`
    })
    const remaining = unrestricted === null ? 'only three digits' : `only ${restrictedDigits}`
    const consequence = actions.length === 1 ? 'That leaves' : 'Each of those moves would leave'
    return {
      cells, candidates: marks(cells, restricted),
      mainLabel: 'Digits that cannot repeat',
      accent: unrestricted === null ? undefined : { candidates: marks(cells, [unrestricted]), label: 'Digit the wing must use' },
      description: `The four wing cells have just four possible digits between them, ${list.format(digits.map(String))}.`,
      ...explainSteps([
        [...limits, 'If you place one of these digits in a wing cell, it rules out the same digit in the other wing cells.'].join(' '),
        ...blocked,
        `${consequence} ${remaining} for four cells. These three digits can fill at most three cells.`,
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
    const explainInference = (reason: string) => alsSteps.length ? explainSteps([...alsSteps, reason]) : { reason }
    const pattern = {
      candidates: singles, links: path, cells: [...singles, ...grouped].map(({ cell }) => cell)
        .concat(alsLinks.flatMap(({ set }) => set.cells), cellLinks.flatMap(({ evidence }) => evidence.set.cells)),
      accent: accent.length ? { candidates: accent, label: alternatives.length ? 'Grouped candidates and outside alternatives' : 'Grouped candidates' } : undefined,
    }
    const firstName = nameInference(start)
    const second = nameInference(chain[0].to)
    const group = nodes.find(node => !('candidate' in node))
    const groupNote = group ? ` Read the marked group as “${nameInference(group)}.”` : ''
    if (technique.includes('discontinuous-')) {
      const assumed = chain[0].strength === 'weak' ? 'true' : 'false'
      const other = assumed === 'true' ? 'false' : 'true'
      return {
        ...pattern,
        description: `Start at ${firstName}. Follow the alternating links back to the same candidate.${groupNote}`,
        ...explainInference(`Suppose ${firstName} is ${assumed}. The first link makes ${second} ${other}. By the time you come back, the loop makes ${firstName} ${other}. The starting candidate must be ${other}.`),
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
        ...explainInference(`If you rule out ${left}, the rest of the loop forces ${right}. ${capital(nameCandidate(first))} conflicts with both. Check each other removal against the weak link it blocks.`),
      }
    }
    const last = nameInference(closing.to)
    return {
      ...pattern,
      description: `The chain starts and ends with a solid link, at ${firstName} and ${last}.${groupNote}`,
      ...explainInference(`If you rule out ${firstName}, the first link forces ${second}. Follow the rest of the chain to force ${last}. At least one end must be true. Remove any candidate that conflicts with both ends.`),
    }
  }
  if ('coloring' in evidence) {
    const { colors: [blue, amber], links, reason } = evidence.coloring
    const mainLabel = 'Blue group'
    const accent = { candidates: amber, label: 'Amber group' }
    const group = (candidate: Candidate) => blue.some(({ cell, digit }) => cell === candidate.cell && digit === candidate.digit) ? 'blue' : 'amber'
    let explanation: string
    if (reason === 'both-colors') {
      const a = blue.find((candidate) => candidatesConflict(candidate, first))
      const b = amber.find((candidate) => candidatesConflict(candidate, first))
      explanation = a && b
        ? `In the blue case, ${nameCandidate(a)} rules out ${nameCandidate(first)}. In the amber case, ${nameCandidate(b)} rules it out.`
        : `${capital(nameCandidate(first))} conflicts with a candidate of each color. One of those colors must be placed.`
    } else if ('same-color-conflict' in reason) {
      const [a, b] = reason['same-color-conflict']
      explanation = `The ${group(a)} candidates include ${nameCandidate(a)} and ${nameCandidate(b)}. The two conflict ${a.cell === b.cell ? 'in the same cell' : `in ${houseName(sharedHouse([a.cell, b.cell])!)}`}. Remove every ${group(a)} candidate in this connected set.`
    } else if ('emptied-cell' in reason) {
      explanation = `Placing the ${group(first)} candidates leaves ${nameCell(reason['emptied-cell'])} with no digit. Remove that color throughout this connected set.`
    } else {
      const { house, digit } = reason['emptied-house']
      explanation = `Placing the ${group(first)} candidates leaves ${houseName(house)} with no place for ${digit}. Remove that color throughout this connected set.`
    }
    return {
      candidates: blue, mainLabel, accent, cells: [...blue, ...amber].map(({ cell }) => cell),
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
    const { sets, links } = 'als-xz' in evidence ? evidence['als-xz'] : evidence['als-chain']
    const setLocation = (index: number) => list.format(sets[index].cells.map(nameCell))
    const last = sets.length - 1
    const xyWing = technique === 'als-xy-wing'
    const labels = xyWing ? ['the first wing', 'the pivot', 'the second wing'] : sets.map((_, index) => `set ${index + 1}`)
    const linkSteps = links.map((digit, index) => {
      const left = last === 1 ? 0 : index
      const right = left + 1
      const [from, to] = xyWing && left === 1 ? [right, left] : [left, right]
      return weakLinkStep(marks(sets[from].cells, [digit]), marks(sets[to].cells, [digit]), labels[from], labels[to], digit, nameCell)
    })
    const ends = [...new Set([...sets[0].cells, ...sets[last].cells])]
    const doublyLinked = last === 1 && links.length === 2
    const supporting = (target: Candidate) => {
      if (!doublyLinked || links.includes(target.digit)) return marks(ends, [target.digit])
      return sets.flatMap(({ cells }) => {
        const placements = marks(cells, [target.digit])
        return placements.every(candidate => candidatesConflict(candidate, target)) ? placements : []
      })
    }
    const pattern = {
      sets: sets.map(({ cells }, index) => ({ cells, label: capital(labels[index].replace(/^the /, '')) })),
      candidates: marks([...new Set(sets.flatMap(({ cells }) => cells))], DIGITS),
      linkSteps, removalStep: eliminationStep(actions, supporting, nameCell),
      description: 'Each almost locked set has one more candidate digit than cells in the same house. If a set loses one digit, it must use all the others.',
    }
    if (last === 1) {
      const setup = `Set 1 is at ${setLocation(0)}. Set 2 is at ${setLocation(1)}.`
      const reasonSteps = [setup, ...linkSteps.map(({ text }) => text)]
      if (doublyLinked) {
        reasonSteps.push(`One set must skip ${links[0]} and the other must skip ${links[1]}. Each set must use all its remaining digits.`)
        const targets = actions.flatMap(action => 'eliminate' in action ? [action.eliminate] : [])
        for (const target of [targets.find(({ digit }) => links.includes(digit)), targets.find(({ digit }) => !links.includes(digit))]) {
          if (target) reasonSteps.push(explainSetRemoval(target, supporting(target), nameCell))
        }
      } else {
        reasonSteps.push(`At least one set skips ${links[0]}. That set must use its other digits, including the shared ${first.digit}.`,
          explainSetRemoval(first, supporting(first), nameCell))
      }
      return { ...pattern, ...explainSteps(reasonSteps) }
    }
    if (xyWing) {
      const places = sightLines(first.cell, supporting(first).map(({ cell }) => cell), nameCell)
      const remaining = sets[1].digits.filter(digit => !links.includes(digit))
      const pivotCells = sets[1].cells.length === 1 ? 'its cell' : `its ${sets[1].cells.length} cells`
      const pivotLimit = remaining.length ? `The pivot has only ${list.format(remaining.map(String))} to fill ${pivotCells}. That's too few digits.`
        : 'The pivot has no candidates left.'
      return { ...pattern, ...explainSteps([
        `If ${nameCell(first.cell)} is ${first.digit}, it rules out ${first.digit} in both wings at ${places}.`,
        `The first wing must use ${links[0]}. ${linkSteps[0].text}`,
        `The second wing must use ${links[1]}. ${linkSteps[1].text}`,
        `${pivotLimit} Remove ${first.digit} from ${nameCell(first.cell)}.`,
      ]) }
    }
    const reasonSteps = [
      `Start with set 1 at ${setLocation(0)}. If it skips ${first.digit}, it must use ${links[0]}.`,
      ...linkSteps.map(({ text }, index) => `${text} Set ${index + 2} at ${setLocation(index + 1)} must use ${links[index + 1] ?? first.digit}.`),
      `Either way, one of the end sets must use ${first.digit}.`,
      explainSetRemoval(first, supporting(first), nameCell),
    ]
    return { ...pattern, ...explainSteps(reasonSteps) }
  }
  if ('death-blossom' in evidence) {
    const { stem, petals } = evidence['death-blossom']
    const linkSteps = petals.map(({ digit, set }) =>
      weakLinkStep(marks([stem], [digit]), marks(set.cells, [digit]), 'the stem', `the ${digit} petal`, digit, nameCell))
    const supporting = ({ digit }: Candidate) => petals.flatMap(({ set }) => marks(set.cells, [digit]))
    return {
      sets: [{ cells: [stem], label: 'Stem' }, ...petals.map(({ digit, set }) => ({ cells: set.cells, label: `${digit} petal` }))],
      candidates: marks([...new Set([stem, ...petals.flatMap(({ set }) => set.cells)])], DIGITS),
      linkSteps, removalStep: eliminationStep(actions, supporting, nameCell),
      description: `The stem is ${nameCell(stem)}. Each of its candidates rules out one digit throughout its own petal. That petal then needs all its other digits.`,
      ...explainSteps([
        ...linkSteps.map(({ text }, index) => `${text} The ${petals[index].digit} petal must then use ${first.digit}.`),
        explainSetRemoval(first, supporting(first), nameCell),
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
function displayCellName({ cellReferenceStyle, difficulty }: CellReferenceOptions) {
  return cellReferenceStyle === undefined ? cellName : (cell: number) => cellReference(cell, cellReferenceStyle, difficulty)
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
  proof = lessonPattern, options: CellReferenceOptions & { showActions?: boolean } = {}) {
  const { showActions = true } = options
  const nameCell = displayCellName(options)
  let variant = 'variant' in deduction.evidence ? deduction.evidence.variant : undefined
  if (variant?.source && options.cellReferenceStyle !== undefined) {
    const copy = variantHintChoice(variant.source.deduction, variant.source.puzzle, options).evidence
    if ('variant' in copy) variant = copy.variant
  }
  const pattern: Pattern | undefined = variant
    ? proof && { ...proof, description: variant.description, reason: variant.reason }
    : describePattern(deduction, candidates, nameCell) ?? (proof && { ...proof, description: '', reason: '', ...explainProof(deduction, nameCell) })
  if (!pattern) throw new Error(`Missing diagram for ${deduction.technique}`)
  const baseCells = new Map<number, CellAnnotation>()
  const tint = (houses: House[] | undefined, fill: string) => {
    for (const house of houses ?? []) {
      for (const cell of houseCells(house)) baseCells.set(cell, { fill })
    }
  }
  tint(pattern.otherHouses, 'var(--lesson-secondary-fill)')
  tint(pattern.houses, 'var(--lesson-area-fill)')
  for (const cell of pattern.cells ?? []) baseCells.set(cell, { fill: 'var(--lesson-pattern-fill)', label: 'pattern cell' })
  const sets = pattern.sets ?? []
  const key = sets.map(({ cells, label }, index) => ({
    label, fill: `var(--lesson-set-${index + 1})`, cells: list.format(cells.map(nameCell)),
  }))
  const membership = new Map<number, { label: string; fill: string }[]>()
  for (const [index, { cells }] of sets.entries()) {
    for (const cell of cells) {
      const members = membership.get(cell) ?? []
      members.push(key[index])
      membership.set(cell, members)
    }
  }
  for (const [cell, members] of membership) {
    const bands = members.map(({ fill }, index) => `${fill} ${100 * index / members.length}% ${100 * (index + 1) / members.length}%`)
    baseCells.set(cell, {
      fill: members[0].fill, label: list.format(members.map(({ label }) => label)),
      fillImage: members.length > 1 ? `linear-gradient(135deg, ${bands.join(', ')})` : undefined,
    })
  }
  const annotate = (marks: Candidate[], color: string, label: string, links: BoardLink[] | undefined,
    reveal: boolean, accent?: Pattern['accent']): BoardAnnotations => {
    const cells = new Map(baseCells)
    const candidates = new Map<number, Map<number, CandidateAnnotation>>()
    const mark = ({ cell, digit }: Candidate, ink: string, name: string, strike = false) => {
      const atCell = candidates.get(cell) ?? new Map<number, CandidateAnnotation>()
      atCell.set(digit, { color: ink, mark: strike ? 'strike' : 'ring', label: name })
      candidates.set(cell, atCell)
    }
    for (const candidate of marks) mark(candidate, color, label)
    if (accent) for (const candidate of accent.candidates) mark(candidate, accentColor, accent.label)
    for (const action of reveal ? deduction.actions : []) {
      if ('place' in action) {
        const { cell } = action.place
        cells.set(cell, { ...cells.get(cell), outline: resultColor })
        mark(action.place, resultColor, 'to place')
      } else {
        mark(action.eliminate, removalColor, 'to remove', true)
      }
    }
    return { cells, candidates, links }
  }
  const { linkSteps, removalStep } = pattern
  let steps: DiagramStep[] | undefined
  if (linkSteps?.length) {
    steps = [{ label: 'Sets', key, annotations: annotate([], linkColor, '', undefined, false) },
      ...linkSteps.map(({ label, text, candidates, links }) => ({
        label, text, annotations: annotate(candidates, linkColor, 'linking candidate', links, false),
      }))]
    if (showActions && removalStep) steps.push({
      label: 'Removals', text: removalStep.text,
      annotations: annotate(removalStep.candidates, linkColor, 'supports a removal', undefined, true),
    })
  }
  const annotations = steps ? steps[showActions ? steps.length - 1 : 0].annotations
    : annotate(pattern.candidates, patternColor, pattern.mainLabel ?? 'in the pattern', pattern.links, showActions, pattern.accent)
  const results = deductionResults(deduction.actions, options)
  const { description, reason, reasonSteps, mainLabel = 'Pattern candidate', accent, trace } = pattern
  const focus = [...(annotations.candidates?.keys() ?? []), ...membership.keys(),
    ...('house' in deduction.evidence ? houseCells(deduction.evidence.house) : [])]
  return { annotations, steps, region: enclosingRegion(focus.length ? focus : [...baseCells.keys()]),
    description, reason, reasonSteps, mainLabel, accentLabel: accent?.label, results, trace }
}

function enclosingRegion(cells: number[]): BoardRegion {
  const span = (coordinates: number[]) => {
    const low = Math.min(...coordinates)
    const high = Math.max(...coordinates)
    const size = Math.max(4, high - low + 1)
    const start = Math.min(9 - size, Math.max(0, low - Math.floor((size - (high - low + 1)) / 2)))
    return [start, size]
  }
  const [row, rows] = span(cells.map((cell) => Math.floor(cell / 9)))
  const [column, columns] = span(cells.map((cell) => cell % 9))
  return { row, column, rows, columns }
}
