import type { BoardAnnotations, BoardLink, BoardRegion, CandidateAnnotation, CellAnnotation } from '../components/BoardAnnotations'
import type { Candidate, Deduction, DeductionAction, Difficulty, HintChoice, House, InferenceNode, LessonExample, PositionSnapshot, ProofPattern } from './engine'
import { DIGITS, peer } from './game.ts'
import { cellReference, type CellReferenceStyle } from './hints.ts'

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
}

const patternColor = 'var(--lesson-pattern)'
const accentColor = 'var(--lesson-accent)'
const resultColor = 'var(--lesson-result)'
const removalColor = 'var(--lesson-removal)'
const list = new Intl.ListFormat('en')
const either = new Intl.ListFormat('en', { type: 'disjunction' })
export const cellName = (cell: number) => `R${Math.floor(cell / 9) + 1}C${cell % 9 + 1}`
export const lessonValues = ({ givens, entries }: Pick<PositionSnapshot, 'givens' | 'entries'>) =>
  [...givens].map((digit, cell) => digit === '0' ? entries[cell] : digit).join('')
export const candidateName = ({ cell, digit }: Candidate) => `${digit} in ${cellName(cell)}`
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
    const text = `Chain starts at ${inferenceName(start, nameCell)}. It ends at ${inferenceName(end, nameCell)}.`
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

function explainRemoval({ cell, digit }: Candidate, placements: Candidate[]) {
  const locations = [...new Set(placements.map(({ cell }) => cell))]
  const required = locations.length === 1 ? `${cellName(locations[0])} must be ${digit}.`
    : `At least one of ${list.format(locations.map(cellName))} must be ${digit}.`
  return `${required} Putting ${digit} in ${cellName(cell)} would block ${locations.length === 1 ? 'that spot' : 'all of those spots'}.`
}

function describePattern(deduction: Deduction, candidates: readonly number[]): Pattern | undefined {
  const { evidence, technique, actions } = deduction
  const firstAction = actions[0]
  const first = 'place' in firstAction ? firstAction.place : firstAction.eliminate
  const marks = (cells: readonly number[], digits: readonly number[]) => cells.flatMap((cell) =>
    digits.filter((digit) => candidates[cell] & (1 << (digit - 1))).map((digit) => ({ cell, digit })))

  if ('cell' in evidence) {
    const target = cellName(evidence.cell)
    return {
      cells: [evidence.cell], candidates: [first],
      description: `Only ${first.digit} is left in ${target}.`,
      reason: 'The digits placed in its three houses rule out the rest.',
    }
  }
  if ('house' in evidence) {
    const group = houseName(evidence.house)
    const target = cellName(first.cell)
    const fullHouse = technique === 'full-house'
    return {
      houses: [evidence.house], cells: [first.cell], candidates: [first],
      description: fullHouse ? `${target} is the only gap in ${group}.` : `Look for ${first.digit} in ${group}. Only ${target} shows it as a candidate.`,
      reason: fullHouse
        ? `The other eight cells contain every digit except ${first.digit}.`
        : `${capital(group)} still needs a ${first.digit}, so it has to go in ${target}.`,
    }
  }
  if ('intersection' in evidence) {
    const { source, target, cells } = evidence.intersection
    const digit = first.digit
    return {
      houses: [source], otherHouses: [target], cells, candidates: marks(cells, [first.digit]),
      description: `In ${houseName(source)}, ${list.format(cells.map(cellName))} are the only places for ${digit}. Those cells all lie in ${houseName(target)}.`,
      reason: `Either placement gives ${houseName(target)} its ${digit}. Cross out ${digit} from the rest of ${houseName(target)}.`,
    }
  }
  if ('pair' in evidence || 'subset' in evidence) {
    const { house, cells, digits } = 'pair' in evidence ? evidence.pair : evidence.subset
    const lockedIn = 'subset' in evidence ? evidence.subset.lockedIn : null
    const groups = list.format((lockedIn ? [house, lockedIn] : [house]).map(houseName))
    const digitNames = list.format(digits.map(String))
    const cellNames = list.format(cells.map(cellName))
    const hidden = technique.startsWith('hidden-')
    const description = hidden
      ? `In ${groups}, ${cellNames} are the only places for ${digitNames}.`
      : `${cellNames} have only ${digitNames} between them.`
    const reason = hidden
      ? `Those ${cells.length} digits must go in those cells. Erase the other candidates in them.`
      : `The cells share ${groups}, so each must contain a different digit. Erase those digits from the other cells in ${groups}.`
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
      reason: `If ${cellName(a)} is ${digit}, the other ${digit} goes in ${cellName(d)}. If ${cellName(b)} is ${digit}, the other goes in ${cellName(c)}. Both arrangements use up the ${digit}s in ${list.format(covers.map(houseName))}.`,
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
      description: `For digit ${digit}, compare the ${bases.length} base houses (${baseNames}) with the ${covers.length} cover houses (${coverNames}).`,
      reason: `Count a placement once for each selected house it belongs to. Each crossed-out candidate counts toward more covers than bases.${fins.length ? ' Each target sees every fin, so placing a target rules out all candidates that could balance the counts.' : ' Every other candidate counts toward at least as many covers as bases, so placing a target would make the totals unequal.'}`,
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
      ? `In ${baseNames}, the only ${digit}s outside ${coverNames} are the fins at ${list.format(fins.map(cellName))}.${single && singleBase ? ` Set those fins aside and ${cellName(single.cell)} is the only place left for ${digit} in ${houseName(singleBase)}.` : ''}`
      : `In ${baseNames}, every candidate for ${digit} lies in ${coverNames}.`
    const reason = fins.length
      ? `If ${digit} goes in a fin, every crossed-out ${digit} sees it in the same box. If ${digit} goes in none of the fins, the ${baseType} use up the ${digit}s in ${coverNames} and rule out the same candidates.`
      : `The ${baseType} need ${bases.length} copies of ${digit}, each in a different crossing line. Those lines can get their ${digit}s only from the starting ${baseType}.`
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
      description: `${capital(list.format(links.map(({ house }) => houseName(house))))} each have two places for ${digit}. The dashed link joins ${cellName(bridge[0])} and ${cellName(bridge[1])}, which see each other.`,
      reason: `If ${cellName(outer[0])} loses ${digit}, ${digit} must go in ${cellName(bridge[0])}. This rules out ${digit} in ${cellName(bridge[1])} and forces it into ${cellName(outer[1])}. ${cellName(first.cell)} sees both far ends.`,
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
      description: `In box ${box + 1}, ${digit} can go only on row ${row + 1} or column ${column + 1}. Placing ${digit} in ${cellName(near)} rules it out in ${list.format(blocked.map(cellName))} along the arrow.`,
      reason: `If ${cellName(far)} is ${digit}, ${cellName(first.cell)} loses it. If ${cellName(near)} is ${digit}, the ${digit} in box ${box + 1} must go on ${otherArm}. ${cellName(first.cell)} loses ${digit} in that case too.`,
    }
  }
  if ('wing' in evidence) {
    const { pivot, pincers: [a, b], digits: [x, y, z] } = evidence.wing
    const cells = [pivot, a, b]
    const why = `If ${cellName(pivot)} is ${x}, ${cellName(a)} must be ${z}. If ${cellName(pivot)} is ${y}, ${cellName(b)} must be ${z}.`
    return {
      cells, candidates: marks(cells, [x, y, z]),
      links: [link(pivot, a, x, true), link(pivot, b, y, true)],
      description: `${cellName(pivot)} shares ${x} with ${cellName(a)} and ${y} with ${cellName(b)}. The two wing cells share ${z}.`,
      reason: technique === 'xyz-wing'
        ? `${why} The pivot can also be ${z}. ${cellName(first.cell)} sees all three cells.`
        : `${why} ${cellName(first.cell)} sees both wings.`,
    }
  }
  if ('wxyz-wing' in evidence) {
    const { cells, digits, unrestricted } = evidence['wxyz-wing']
    const restricted = digits.filter((digit) => digit !== unrestricted)
    const restrictedDigits = list.format(restricted.map(String))
    const limits = restricted.map((digit) => {
      const locations = marks(cells, [digit]).map(({ cell }) => cell)
      if (locations.length === 1) return `In the wing, ${digit} can go only in ${cellName(locations[0])}.`
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
      const locations = marks(cells, [digit]).map(({ cell }) => cellName(cell))
      const placement = targetCells.length === 1 ? `${digit} in ${cellName(targetCells[0])}` : `any crossed-out ${digit}`
      return `Placing ${placement} would rule out every ${digit} in the wing (${list.format(locations)}).`
    })
    const remaining = unrestricted === null ? 'only three digits' : `only ${restrictedDigits}`
    const consequence = actions.length === 1 ? 'That leaves' : 'Each of those moves would leave'
    return {
      cells, candidates: marks(cells, restricted),
      mainLabel: 'Digits that cannot repeat',
      accent: unrestricted === null ? undefined : { candidates: marks(cells, [unrestricted]), label: 'Digit the wing must use' },
      description: `The four highlighted cells have only four candidate digits between them. They are ${list.format(digits.map(String))}.`,
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
      description: `Follow the links from ${candidateName(start)} to ${candidateName(end)}.`,
      reason: `Cross out ${candidateName(start)} for the sake of the proof. The first solid link forces ${candidateName(chain[0].to)}. Alternate placing and crossing out the next candidate until you reach ${candidateName(end)}, which must be placed. ${cellName(first.cell)} sees both ends.`,
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
    const setNames = (cells: number[]) => list.format(cells.map(cellName))
    const alsSteps = [...new Set([
      ...alsLinks.map(({ set, digits: [a, b] }) => `The set at ${setNames(set.cells)} can skip only one digit. It must use ${a} or ${b}.`),
      ...cellLinks.map(({ evidence, inside, forced, blocked }) =>
        `If the set at ${setNames(evidence.set.cells)} skips ${inside.digit}, it must use ${list.format(blocked.map(String))}. That forces ${candidateName(forced)}.`),
    ])]
    const explainInference = (reason: string) => alsSteps.length ? explainSteps([...alsSteps, reason]) : { reason }
    const pattern = {
      candidates: singles, links: path, cells: [...singles, ...grouped].map(({ cell }) => cell)
        .concat(alsLinks.flatMap(({ set }) => set.cells), cellLinks.flatMap(({ evidence }) => evidence.set.cells)),
      accent: accent.length ? { candidates: accent, label: alternatives.length ? 'Grouped candidates and outside alternatives' : 'Grouped candidates' } : undefined,
    }
    const firstName = inferenceName(start)
    const second = inferenceName(chain[0].to)
    const group = nodes.find(node => !('candidate' in node))
    const groupNote = group ? ` The marked group is true if you place ${inferenceName(group)}.` : ''
    if (technique.includes('discontinuous-')) {
      const assumed = chain[0].strength === 'weak' ? 'true' : 'false'
      const other = assumed === 'true' ? 'false' : 'true'
      return {
        ...pattern,
        description: `Start at ${firstName}. Follow the alternating links back to the same candidate.${groupNote}`,
        ...explainInference(`Suppose ${firstName} is ${assumed}. The first link makes ${second} ${other}. By the time you come back, the loop makes ${firstName} ${other}. The starting assumption breaks.`),
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
        const reason = !lock ? 'The alternating loop makes exactly one end of each link true.'
          : lock.outside
            ? `Exactly one end of the link at ${setNames(lock.set.cells)} is true. Either way, the set loses one other candidate digit. The set must use ${first.digit} in either case.`
            : `The loop puts exactly one of the two linked digits in the set at ${setNames(lock.set.cells)}. The set must use every other digit, including ${first.digit}.`
        return {
          ...pattern,
          accent: lock ? { candidates: [...accent, ...lock.members], label: 'Grouped and locked candidates' } : pattern.accent,
          description: `Follow the alternating links around the loop, starting at ${firstName}.${groupNote}`,
          ...explainInference(lock ? `${reason} ${capital(candidateName(first))} conflicts with every place the set can use it.` : reason),
        }
      }
      const left = inferenceName(weak.from)
      const right = inferenceName(weak.to)
      return {
        ...pattern,
        description: `The links alternate all the way around the loop, including at ${firstName}.${groupNote}`,
        ...explainInference(`If you rule out ${left}, the rest of the loop forces ${right}. ${capital(candidateName(first))} conflicts with both. Use the other dashed links to check the remaining removals.`),
      }
    }
    const last = inferenceName(closing.to)
    return {
      ...pattern,
      description: `The chain starts and ends with a solid link, at ${firstName} and ${last}.${groupNote}`,
      ...explainInference(`If you rule out ${firstName}, the first link forces ${second}. Follow the rest of the chain to force ${last}. Any candidate that conflicts with both ends is ruled out either way.`),
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
        ? `If you place the blue candidates, ${candidateName(a)} rules out ${candidateName(first)}. If you place the amber candidates, ${candidateName(b)} rules it out.`
        : `${capital(candidateName(first))} conflicts with a candidate of each color. One of those colors must be placed.`
    } else if ('same-color-conflict' in reason) {
      const [a, b] = reason['same-color-conflict']
      explanation = `The ${group(a)} candidates include ${candidateName(a)} and ${candidateName(b)}. Placing both would break a rule, so cross out every ${group(a)} candidate in this set.`
    } else if ('emptied-cell' in reason) {
      explanation = `Placing the ${group(first)} candidates leaves ${cellName(reason['emptied-cell'])} with no digit. Erase that color.`
    } else {
      const { house, digit } = reason['emptied-house']
      explanation = `Placing the ${group(first)} candidates leaves ${houseName(house)} with no place for ${digit}. Erase that color.`
    }
    return {
      candidates: blue, mainLabel, accent, cells: [...blue, ...amber].map(({ cell }) => cell),
      links: links.map(({ from, to }) => ({ from, to, color: patternColor })),
      description: 'Each solid link joins two candidates of opposite colors. If you place one, the other is ruled out.',
      reason: explanation,
    }
  }
  if ('bug-plus-one' in evidence) {
    const { cell, candidates: digits, houses } = evidence['bug-plus-one']
    return {
      cells: [cell], houses, candidates: marks([cell], digits),
      description: `${cellName(cell)} is the only empty cell with three candidates. ${first.digit} occurs three times in each of its three houses.`,
      reason: `Erase ${first.digit} from ${cellName(cell)} in your head. Every empty cell would have two choices and the grid would fit the pattern that allows a swap. Since the puzzle has one solution, that ${first.digit} has to stay.`,
    }
  }
  if ('forcing' in evidence) {
    const { branches } = evidence.forcing
    const starting = branches.map(({ assumption }) => assumption.candidate)
      .filter(({ cell, digit }) => cell !== first.cell || digit !== first.digit)
    const statement = ({ candidate, truth }: { candidate: Candidate; truth: boolean }) =>
      `${candidate.digit} ${truth ? 'goes in' : 'is ruled out in'} ${cellName(candidate.cell)}`
    const trace = branches.map(({ assumption, steps, conflict }) => {
      const effects = [assumption, ...steps.map(({ effect }) => effect)]
      let conclusion = `This choice also ${'place' in firstAction ? 'forces' : 'rules out'} ${candidateName(first)}.`
      if (conflict && 'opposite' in conflict) {
        conclusion = `The steps both force and rule out ${candidateName(effects[conflict.opposite[0]].candidate)}.`
      } else if (conflict && 'exhausted' in conflict) {
        const { scope } = conflict.exhausted
        if (typeof scope === 'object') {
          if ('cell' in scope) conclusion = `${cellName(scope.cell)} has no candidate left.`
          if ('house' in scope) conclusion = `There is no place for ${scope.house.digit} in ${houseName(scope.house.house)}.`
        }
      }
      return {
        assumption: `Assume ${statement(assumption)}.`,
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
        : `Every starting choice ${'place' in firstAction ? 'forces' : 'rules out'} ${candidateName(first)}.`,
      trace,
    }
  }
  if ('unique-rectangle' in evidence) {
    const { corners, digits, support } = evidence['unique-rectangle']
    const pair = list.format(digits.map(String))
    const description = `${list.format(corners.map(cellName))} form a rectangle in two boxes. Each corner has candidates ${pair}.`
    if ('extra-candidates' in support) {
      const extras = support['extra-candidates']
      const reason = technique === 'unique-rectangle-1'
        ? `Only ${cellName(first.cell)} has an extra candidate. If you place either digit from the pair there, swapping the digits in the four corners gives a second solution.`
        : `At least one of ${list.format(extras.map(({ cell }) => cellName(cell)))} must be ${first.digit}. ${cellName(first.cell)} sees them all.`
      return { cells: corners, candidates: marks(corners, digits), accent: { candidates: extras, label: 'Extra candidate' }, description, reason }
    }
    if ('subset' in support) {
      const { cells, digits: locked, houses } = support.subset
      return {
        houses, cells: [...corners, ...cells], candidates: marks(corners, digits),
        accent: { candidates: marks([...corners, ...cells], locked), label: 'Subset candidate' }, description,
        reason: `One corner must use an extra digit. Count the corners with extras as one slot and add ${list.format(cells.map(cellName))}. Those slots need ${list.format(locked.map(String))} between them.`,
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
        ? `If ${cellName(first.cell)} were ${first.digit}, both links would force ${digit} into the adjacent corners. The opposite corner would be ${first.digit}, completing a rectangle that could be swapped.`
        : `One of the linked corners must be ${digit}. If the other linked corner were ${first.digit}, the opposite corners would complete a rectangle that could be swapped. Both linked corners therefore lose ${first.digit}.`
    return { houses, cells: corners, candidates: marks(corners, digits), links, description, reason }
  }
  if ('als-xz' in evidence || 'als-chain' in evidence) {
    const { sets, links } = 'als-xz' in evidence ? evidence['als-xz'] : evidence['als-chain']
    const setLocation = (index: number) => list.format(sets[index].cells.map(cellName))
    const linkConflict = (index: number, digit: number) => {
      const locations = marks([...sets[index].cells, ...sets[index + 1].cells], [digit]).map(({ cell }) => cell)
      const house = sharedHouse(locations)
      return house ? `The ${digit} candidates in sets ${index + 1} and ${index + 2} share ${houseName(house)}.`
        : `Each ${digit} candidate in set ${index + 1} shares a row, column, or box with every ${digit} candidate in set ${index + 2}.`
    }
    const last = sets.length - 1
    const cells = sets.flatMap(({ cells }) => cells)
    const pattern = {
      cells, candidates: sets.flatMap(({ cells, digits }) => marks(cells, digits)),
      mainLabel: 'Set candidate',
      description: 'Each set fits in one row, column, or box. Placing a digit in one cell rules it out in the rest of that set. Each set has one more candidate digit than cells, so it leaves out exactly one digit.',
    }
    if (sets.length === 2) {
      const setup = `Set 1 is at ${setLocation(0)}. Set 2 is at ${setLocation(1)}.`
      const reasonSteps = [setup, ...links.map(digit => `${linkConflict(0, digit)} Placing ${digit} in one set rules it out in the other.`)]
      if (links.length === 2) {
        reasonSteps.push(`One set must skip ${links[0]} and the other must skip ${links[1]}. Each set must use all its remaining digits.`)
        const targets = actions.flatMap(action => 'eliminate' in action ? [action.eliminate] : [])
        const linkedTarget = targets.find(({ digit }) => links.includes(digit))
        if (linkedTarget) reasonSteps.push(explainRemoval(linkedTarget, marks(cells, [linkedTarget.digit])))
        const otherTarget = targets.find(({ digit }) => !links.includes(digit))
        if (otherTarget) {
          for (const set of sets) {
            const placements = marks(set.cells, [otherTarget.digit])
            if (!placements.length || !placements.every(candidate => candidatesConflict(candidate, otherTarget))) continue
            reasonSteps.push(explainRemoval(otherTarget, placements))
            break
          }
        }
      } else {
        reasonSteps.push(`At least one set skips ${links[0]}. That set must use its other digits, including the shared ${first.digit}.`,
          explainRemoval(first, marks(cells, [first.digit])))
      }
      return { ...pattern, ...explainSteps(reasonSteps) }
    }
    const ends = [...sets[0].cells, ...sets[last].cells]
    const reasonSteps = [
      `Start with set 1 at ${setLocation(0)}. If it skips ${first.digit}, it must use ${links[0]}.`,
      ...links.map((digit, index) => `${linkConflict(index, digit)} Placing ${digit} in set ${index + 1} rules it out in set ${index + 2} (${setLocation(index + 1)}). This set must use ${links[index + 1] ?? first.digit}.`),
      `Either way, one of the end sets must use ${first.digit}.`,
      explainRemoval(first, marks(ends, [first.digit])),
    ]
    return { ...pattern, ...explainSteps(reasonSteps) }
  }
  if ('death-blossom' in evidence) {
    const { stem, petals } = evidence['death-blossom']
    const stemDigits = petals.map(({ digit }) => digit)
    return {
      cells: [stem, ...petals.flatMap(({ set }) => set.cells)],
      candidates: petals.flatMap(({ set }) => marks(set.cells, set.digits)),
      accent: { candidates: marks([stem], stemDigits), label: 'Starting cell candidate' },
      description: `Start at ${cellName(stem)}. Each choice there blocks one digit in a set with one extra candidate digit. That set must use all its remaining digits.`,
      ...explainSteps([
        ...petals.map(({ digit, set }) => `If ${cellName(stem)} is ${digit}, that rules out ${digit} in the set at ${list.format(set.cells.map(cellName))}. That set must use ${first.digit}.`),
        explainRemoval(first, petals.flatMap(({ set }) => marks(set.cells, [first.digit]))),
      ]),
    }
  }
  if ('sue-de-coq' in evidence) {
    const { intersection, digits, line, block } = evidence['sue-de-coq']
    return {
      houses: [line.house, block.house], cells: [...intersection, ...line.cells, ...block.cells],
      candidates: [...marks(intersection, digits), ...marks(line.cells, line.digits), ...marks(block.cells, block.digits)],
      description: `${list.format(intersection.map(cellName))} lie in both ${houseName(line.house)} and ${houseName(block.house)}. The sets to either side need different digits from those cells' candidates.`,
      reason: 'The two side sets use up all the spare digits from the intersection. Every remaining digit must go in the intersection itself. That locks the crossed-out digits into the highlighted cells of their respective houses.',
    }
  }
  if ('exocet' in evidence) {
    const { bases, targets, crossLines, covers } = evidence.exocet
    const digits = covers.map(({ digit }) => digit)
    return {
      houses: crossLines, cells: [...bases, ...targets], candidates: marks(bases, digits),
      accent: { candidates: marks(targets, digits), label: 'Target candidate' },
      description: `Every digit placed at ${list.format(bases.map(cellName))} must also occur in all three cross-lines (${list.format(crossLines.map(houseName))}). Cells that see both bases lose that digit. The remaining places outside ${list.format(targets.map(cellName))} fit in at most two houses.`,
      reason: 'Each base digit therefore needs one of the two target cells. Check the assignments where both base digits can fit on all three lines. A crossed-out candidate either never appears in those assignments or would block a copy required by every assignment.',
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
      description: `Count one slot for each linked digit in its house (${linkDetails}). There are ${cells.length} slots for the ${cells.length} highlighted cells, and every candidate in those cells uses at least one slot.`,
      reason: 'The highlighted cells must fill every slot. An outside candidate that uses a slot, or a candidate inside that uses two slots, would leave a cell without one.',
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
    description: `${cellName(a)} and ${cellName(b)} each have ${linkedDigit} and ${digit}. In ${houseName(pair.house)}, ${linkedDigit} must go in ${cellName(left)} or ${cellName(right)}.`,
    reason: `If ${cellName(left)} is ${linkedDigit}, ${cellName(a)} must be ${digit}. If ${cellName(right)} is ${linkedDigit}, ${cellName(b)} must be ${digit}. ${cellName(first.cell)} sees both wings.`,
  }
}

export function deductionResults(actions: readonly DeductionAction[]) {
  const results: string[] = []
  const removals = new Map<number, string[]>()
  for (const action of actions) {
    if ('place' in action) {
      const { cell, digit } = action.place
      results.push(`Place ${digit} in ${cellName(cell)}.`)
    } else {
      const { cell, digit } = action.eliminate
      const locations = removals.get(digit) ?? []
      locations.push(cellName(cell))
      removals.set(digit, locations)
    }
  }
  for (const [digit, locations] of removals) {
    results.push(`Remove ${digit} from ${list.format(locations)}.`)
  }
  return results
}

export function lessonDiagram({ deduction, candidates, pattern: lessonPattern }: Pick<LessonExample, 'deduction' | 'candidates' | 'pattern'>,
  proof = lessonPattern, { showActions = true } = {}) {
  const pattern: Pattern | undefined = 'variant' in deduction.evidence
    ? proof && { ...proof, ...deduction.evidence.variant }
    : describePattern(deduction, candidates) ?? (proof && { ...proof, description: '', reason: '' })
  if (!pattern) throw new Error(`Missing diagram for ${deduction.technique}`)
  const cells = new Map<number, CellAnnotation>()
  const candidateMarks = new Map<number, Map<number, CandidateAnnotation>>()
  const tint = (houses: House[] | undefined, fill: string) => {
    for (const house of houses ?? []) {
      for (const cell of houseCells(house)) cells.set(cell, { fill })
    }
  }
  const mark = ({ cell, digit }: Candidate, color: string, label: string, strike = false) => {
    const marks = candidateMarks.get(cell) ?? new Map<number, CandidateAnnotation>()
    marks.set(digit, { color, mark: strike ? 'strike' : 'ring', label })
    candidateMarks.set(cell, marks)
  }
  tint(pattern.otherHouses, 'var(--lesson-secondary-fill)')
  tint(pattern.houses, 'var(--lesson-area-fill)')
  for (const cell of pattern.cells ?? []) cells.set(cell, { fill: 'var(--lesson-pattern-fill)', label: 'pattern cell' })
  for (const candidate of pattern.candidates) mark(candidate, patternColor, pattern.mainLabel ?? 'in the pattern')
  if (pattern.accent) {
    for (const candidate of pattern.accent.candidates) mark(candidate, accentColor, pattern.accent.label)
  }
  for (const action of showActions ? deduction.actions : []) {
    if ('place' in action) {
      const { cell } = action.place
      cells.set(cell, { ...cells.get(cell), outline: resultColor })
      mark(action.place, resultColor, 'to place')
    } else {
      mark(action.eliminate, removalColor, 'to remove', true)
    }
  }
  const results = deductionResults(deduction.actions)
  const annotations: BoardAnnotations = { cells, candidates: candidateMarks, links: pattern.links }
  const { description, reason, reasonSteps, mainLabel = 'Pattern candidate', accent, trace } = pattern
  const focus = [...candidateMarks.keys(), ...('house' in deduction.evidence ? houseCells(deduction.evidence.house) : [])]
  return { annotations, region: enclosingRegion(focus.length ? focus : [...cells.keys()]), description, reason, reasonSteps, mainLabel, accentLabel: accent?.label, results, trace }
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
