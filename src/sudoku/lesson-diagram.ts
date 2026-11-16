import type { BoardAnnotations, BoardLink, BoardRegion, CandidateAnnotation, CellAnnotation } from '../components/BoardAnnotations'
import type { Candidate, Deduction, DeductionAction, House, InferenceNode, LessonExample, PositionSnapshot, ProofPattern } from './engine'
import { DIGITS, peer } from './game'

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
const candidateName = ({ cell, digit }: Candidate) => `${digit} in ${cellName(cell)}`
const candidatesConflict = (a: Candidate, b: Candidate) =>
  a.cell === b.cell ? a.digit !== b.digit : a.digit === b.digit && peer(a.cell, b.cell)
const capital = (phrase: string) => phrase[0].toUpperCase() + phrase.slice(1)
const inferenceName = (node: InferenceNode) => 'candidate' in node
  ? candidateName(node.candidate)
  : `${node.group.digit} in ${either.format(node.group.cells.map(cellName))}`
const boardPoint = (node: InferenceNode) => 'candidate' in node ? node.candidate : node.group

function houseName(house: House) {
  if ('row' in house) return `row ${house.row + 1}`
  if ('column' in house) return `column ${house.column + 1}`
  return `box ${house.box + 1}`
}

function houseCells(house: House) {
  return DIGITS.map((_, index) => {
    if ('row' in house) return house.row * 9 + index
    if ('column' in house) return index * 9 + house.column
    return Math.floor(house.box / 3) * 27 + (house.box % 3) * 3 + Math.floor(index / 3) * 9 + index % 3
  })
}

function link(from: number, to: number, digit: number, dashed = false, arrow = false): BoardLink {
  return { from: { cell: from, digit }, to: { cell: to, digit }, color: patternColor, dashed, arrow }
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
      ? `Those cells have to take those ${cells.length} digits. Erase the other candidates in them.`
      : `The cells share ${groups}, so they must take different digits. Erase those digits from the other cells in ${groups}.`
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
      reason: `If ${cellName(a)} takes ${digit}, ${cellName(d)} takes the other copy. If ${cellName(b)} takes it, ${cellName(c)} does. Both arrangements use up the ${digit}s in ${list.format(covers.map(houseName))}.`,
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
      ? `If a fin takes ${digit}, every crossed-out ${digit} sees it in the same box. If no fin takes it, the ${baseType} use up the ${digit}s in ${coverNames} and rule out the same candidates.`
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
      reason: `If ${cellName(outer[0])} loses ${digit}, ${cellName(bridge[0])} takes it and rules it out in ${cellName(bridge[1])}. That forces ${digit} into ${cellName(outer[1])}. ${cellName(first.cell)} sees both far ends.`,
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
      description: `In box ${box + 1}, ${digit} can go only on row ${row + 1} or column ${column + 1}. If ${cellName(near)} takes ${digit}, it rules out ${list.format(blocked.map(cellName))} along the arrow.`,
      reason: `If ${cellName(far)} takes ${digit}, ${cellName(first.cell)} loses it. If ${cellName(near)} takes it, box ${box + 1} must put ${digit} on ${otherArm}. ${cellName(first.cell)} loses ${digit} in that case too.`,
    }
  }
  if ('wing' in evidence) {
    const { pivot, pincers: [a, b], digits: [x, y, z] } = evidence.wing
    const cells = [pivot, a, b]
    const why = `If ${cellName(pivot)} takes ${x}, ${cellName(a)} must take ${z}. If it takes ${y}, ${cellName(b)} must take ${z}.`
    return {
      cells, candidates: marks(cells, [x, y, z]),
      links: [link(pivot, a, x, true), link(pivot, b, y, true)],
      description: `${cellName(pivot)} shares ${x} with ${cellName(a)} and ${y} with ${cellName(b)}. The two wing cells share ${z}.`,
      reason: technique === 'xyz-wing'
        ? `${why} The pivot could also take ${z}. ${cellName(first.cell)} sees all three cells.`
        : `${why} ${cellName(first.cell)} sees both wings.`,
    }
  }
  if ('wxyz-wing' in evidence) {
    const { cells, digits, unrestricted } = evidence['wxyz-wing']
    return {
      cells, candidates: marks(cells, digits.filter((digit) => digit !== unrestricted)),
      accent: unrestricted === null ? undefined : { candidates: marks(cells, [unrestricted]), label: 'Unrestricted digit' },
      description: `${list.format(cells.map(cellName))} have only ${list.format(digits.map(String))} between them.`,
      reason: unrestricted === null
        ? 'Each digit can appear only once within the four cells. The cells must use every digit.'
        : `Each of the other three digits can fill just one cell. The fourth cell needs ${unrestricted}. ${cellName(first.cell)} sees every place ${unrestricted} can go in the wing.`,
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
    const grouped = nodes.flatMap((node) => 'group' in node
      ? node.group.cells.map((cell) => ({ cell, digit: node.group.digit })) : [])
    const pattern = {
      candidates: singles, links: path, cells: [...singles, ...grouped].map(({ cell }) => cell),
      accent: grouped.length ? { candidates: grouped, label: 'Grouped candidates' } : undefined,
    }
    const firstName = inferenceName(start)
    const second = inferenceName(chain[0].to)
    const group = nodes.find((node) => 'group' in node)
    const groupNote = group ? ` The marked group is true if you place ${inferenceName(group)}.` : ''
    if (technique.includes('discontinuous-')) {
      const assumed = chain[0].strength === 'weak' ? 'true' : 'false'
      const other = assumed === 'true' ? 'false' : 'true'
      return {
        ...pattern,
        description: `Start at ${firstName}. Follow the alternating links back to the same candidate.${groupNote}`,
        reason: `Suppose ${firstName} is ${assumed}. The first link makes ${second} ${other}. By the time you come back, the loop makes ${firstName} ${other}. The starting assumption breaks.`,
      }
    }
    if (technique.includes('continuous-')) {
      const conflictsWithRemoval = (node: InferenceNode) => 'candidate' in node
        ? candidatesConflict(node.candidate, first)
        : node.group.cells.every((cell) => candidatesConflict({ cell, digit: node.group.digit }, first))
      const weak = chain.find(({ strength, from, to }) =>
        strength === 'weak' && conflictsWithRemoval(from) && conflictsWithRemoval(to))!
      const left = inferenceName(weak.from)
      const right = inferenceName(weak.to)
      return {
        ...pattern,
        description: `The links alternate all the way around the loop, including at ${firstName}.${groupNote}`,
        reason: `If you rule out ${left}, the rest of the loop forces ${right}. ${capital(candidateName(first))} conflicts with both. Use the other dashed links to check the remaining removals.`,
      }
    }
    const last = inferenceName(closing.to)
    return {
      ...pattern,
      description: `The chain starts and ends with a solid link, at ${firstName} and ${last}.${groupNote}`,
      reason: `If you rule out ${firstName}, the first link forces ${second}. Follow the rest of the chain to force ${last}. Any candidate that conflicts with both ends is ruled out either way.`,
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
      description: 'Each solid link joins two candidates that have to take opposite colors. When one is placed, the other is ruled out.',
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
    const description = `${list.format(corners.map(cellName))} form a rectangle in two boxes. Each corner can take ${pair}.`
    if ('extra-candidates' in support) {
      const extras = support['extra-candidates']
      const reason = technique === 'unique-rectangle-1'
        ? `Only ${cellName(first.cell)} has an extra candidate. If it took either digit from the pair, all four corners could swap and give a second solution.`
        : `At least one of ${list.format(extras.map(({ cell }) => cellName(cell)))} has to take ${first.digit}. ${cellName(first.cell)} sees them all.`
      return { cells: corners, candidates: marks(corners, digits), accent: { candidates: extras, label: 'Extra candidate' }, description, reason }
    }
    if ('subset' in support) {
      const { cells, digits: locked, houses } = support.subset
      return {
        houses, cells: [...corners, ...cells], candidates: marks(corners, digits),
        accent: { candidates: marks([...corners, ...cells], locked), label: 'Subset candidate' }, description,
        reason: `One corner must take an extra digit. Count the corners with extras as one slot and add ${list.format(cells.map(cellName))}. Those slots need ${list.format(locked.map(String))} between them.`,
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
        ? `If ${cellName(first.cell)} took ${first.digit}, both links would force ${digit} into the adjacent corners. The opposite corner would take ${first.digit}, completing a rectangle that could be swapped.`
        : `One of the linked corners must take ${digit}. If the other linked corner took ${first.digit}, the opposite corners would complete a rectangle that could be swapped. Both linked corners therefore lose ${first.digit}.`
    return { houses, cells: corners, candidates: marks(corners, digits), links, description, reason }
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
    reason: `If ${cellName(left)} takes ${linkedDigit}, ${cellName(a)} takes ${digit}. If ${cellName(right)} takes ${linkedDigit}, ${cellName(b)} takes ${digit}. ${cellName(first.cell)} sees both wings.`,
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

export function lessonDiagram({ deduction, candidates }: Pick<LessonExample, 'deduction' | 'candidates'>, proof?: ProofPattern) {
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
  for (const action of deduction.actions) {
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
  const { description, reason, mainLabel = 'Pattern candidate', accent, trace } = pattern
  const focus = [...candidateMarks.keys(), ...('house' in deduction.evidence ? houseCells(deduction.evidence.house) : [])]
  return { annotations, region: enclosingRegion(focus), description, reason, mainLabel, accentLabel: accent?.label, results, trace }
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
