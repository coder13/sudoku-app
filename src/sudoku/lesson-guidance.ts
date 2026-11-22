import type { BoardAnnotations, BoardLink, CandidateAnnotation, CellAnnotation } from '../components/BoardAnnotations'
import type { Candidate, House, InferenceNode, PracticeExercise } from './engine'
import type { PracticeGuide } from './lesson-content.ts'
import { DIGITS } from './game.ts'
import { boardPoint, candidateName, cellName, houseCells, houseName, inferenceCandidates, inferenceName } from './lesson-diagram.ts'

type Focus = { houses?: House[]; cells?: number[]; candidates?: Candidate[]; accent?: Candidate[]; links?: BoardLink[] }
type Clue = Focus & { text: string }
type Search = { start: Clue; check: Clue; follow?: string }

const patternColor = 'var(--lesson-pattern)'
const list = new Intl.ListFormat('en')
const names = (cells: readonly number[]) => list.format(cells.map(cellName))
const digits = (values: readonly number[]) => list.format(values.map(String))
const houses = (values: readonly House[]) => list.format(values.map(houseName))

export function practiceClueAnnotations({ houses = [], cells = [], candidates = [], accent = [], links }: Focus): BoardAnnotations {
  const area = new Map<number, CellAnnotation>()
  for (const house of houses) {
    for (const cell of houseCells(house)) area.set(cell, { fill: 'var(--lesson-area-fill)', label: 'hint area' })
  }
  for (const cell of cells) area.set(cell, { fill: 'var(--lesson-pattern-fill)', label: 'hint cell' })
  const marks = new Map<number, Map<number, CandidateAnnotation>>()
  function mark(values: Candidate[], color: string, label: string) {
    for (const { cell, digit } of values) {
      const cellMarks = marks.get(cell) ?? new Map()
      cellMarks.set(digit, { color, mark: 'ring', label })
      marks.set(cell, cellMarks)
    }
  }
  mark(candidates, patternColor, 'hint candidate')
  mark(accent, 'var(--lesson-accent)', 'second color')
  return { cells: area, candidates: marks, links }
}

export function practiceSearch({ deduction: { technique, evidence, actions }, candidates, pattern }: PracticeExercise, guide?: PracticeGuide): Search {
  const marks = (cells: number[], values = DIGITS) => cells.flatMap((cell) =>
    values.filter(digit => candidates[cell] & (1 << (digit - 1))).map(digit => ({ cell, digit })))
  const spots = (house: House, digit: number) => marks(houseCells(house), [digit])
  const first = 'place' in actions[0] ? actions[0].place : actions[0].eliminate

  if ('cell' in evidence) {
    const { cell } = evidence
    return {
      start: { cells: [cell], text: `Look at the candidates left in ${cellName(cell)}.` },
      check: { houses: [{ row: Math.floor(cell / 9) }, { column: cell % 9 }, { box: Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3) }],
        cells: [cell], text: 'Read the row, column, and box around this cell. After the earlier removals, which digit can still go here?' },
    }
  }
  if ('house' in evidence) {
    const house = evidence.house
    return {
      start: { houses: [house], text: `Start in ${houseName(house)}. ${technique === 'full-house' ? 'Count the empty cells.' : 'Pick a digit that is still missing.'}` },
      check: { houses: [house], text: technique === 'full-house'
        ? 'Read the eight filled cells. Which digit from 1 through 9 is missing?'
        : `Which empty cells in ${houseName(house)} still allow ${first.digit}? Look for a placed ${first.digit} in each crossing house.` },
    }
  }
  if ('intersection' in evidence) {
    const { source, target, cells } = evidence.intersection
    return {
      start: { houses: [source], text: `Start in ${houseName(source)}. Find all the places for digit ${first.digit}.` },
      check: { houses: [source, target], cells, candidates: marks(cells, [first.digit]),
        text: `All possible ${first.digit}s in ${houseName(source)} lie in ${houseName(target)}. Which cells in ${houseName(target)} lie outside that overlap?` },
    }
  }
  if ('pair' in evidence || 'subset' in evidence) {
    const { house, cells, digits: values } = 'pair' in evidence ? evidence.pair : evidence.subset
    const lockedIn = 'subset' in evidence ? evidence.subset.lockedIn : null
    const hidden = technique.startsWith('hidden-')
    const seed = marks(cells, [values[0]])
    return {
      start: hidden
        ? { houses: [house], text: `Find the places for digit ${values[0]} in ${houseName(house)}. Look for other digits limited to the same few cells.` }
        : { houses: [house], cells: cells.slice(0, 1), text: `Start at ${cellName(cells[0])} in ${houseName(house)}. Which other cells have short lists with some of the same digits?` },
      check: hidden
        ? { houses: [house], candidates: seed, text: `Find all the places for ${digits(values)} in ${houseName(house)}. Do they fit in only ${cells.length} cells?` }
        : { houses: [house], cells, candidates: marks(cells, values),
          text: `Look at ${names(cells)}. How many different digits appear across their candidate lists?` },
      follow: hidden ? 'Which other pencil marks in those cells compete with the reserved digits?'
        : `Look for one of the chosen digits elsewhere in ${lockedIn ? houses([house, lockedIn]) : houseName(house)}.`,
    }
  }
  if ('x-wing' in evidence || 'fish' in evidence) {
    const { bases, covers, digit } = 'fish' in evidence ? evidence.fish : evidence['x-wing']
    const fins = 'fish' in evidence ? evidence.fish.fins : []
    const seed = bases.find(base => !spots(base, digit).some(({ cell }) => fins.includes(cell))) ?? bases[0]
    const crossing = 'row' in seed ? 'columns' : 'rows'
    return {
      start: { houses: [seed], text: `Start in ${houseName(seed)}. Find the places for digit ${digit}.` },
      check: { houses: bases, candidates: bases.flatMap(base => spots(base, digit)),
        text: `Compare the ${digit} candidates in ${houses(bases)}. Which ${covers.length} ${crossing} cover the pattern?` },
      follow: fins.length
        ? `Find the extra candidates outside ${houses(covers)}. Do they all share a box? ${technique.startsWith('sashimi') ? 'Set them aside and find the starting line with a single place left. ' : ''}Look in the fin box where a cover crosses it outside the base lines.`
        : `Each base needs a different cover for ${digit}. Which candidates on ${houses(covers)} lie outside the bases?`,
    }
  }
  if ('single-digit-chain' in evidence) {
    const { digit, links: [a, b], bridge } = evidence['single-digit-chain']
    return {
      start: { houses: [a.house], text: `Find the only two places for digit ${digit} in ${houseName(a.house)}.` },
      check: { houses: [a.house, b.house], cells: bridge, candidates: spots(a.house, digit),
        text: `Find the second pair for ${digit} in ${houseName(b.house)}. Which two ends share a house?` },
      follow: 'Suppose the first far end is false. What happens at the other far end? Find a candidate that sees both.',
    }
  }
  if ('empty-rectangle' in evidence) {
    const { row, column, cells, link, digit } = evidence['empty-rectangle']
    const box = { box: Math.floor(row / 3) * 3 + Math.floor(column / 3) }
    return {
      start: { houses: [box], text: `Find every place for digit ${digit} in ${houseName(box)}. Can one row and one column cover all of them?` },
      check: { houses: [box, link.house], cells, candidates: marks(cells, [digit]),
        text: `The box candidates lie on row ${row + 1} and column ${column + 1}. Which possible ${digit} in ${houseName(link.house)} lines up with an arm?` },
      follow: 'Try each end of the outside pair. Which arm can the box still use? Look for a candidate that both cases rule out.',
    }
  }
  if ('wing' in evidence) {
    const { pivot, pincers, digits: [x, y, z] } = evidence.wing
    const xyz = technique === 'xyz-wing'
    return {
      start: { cells: [pivot], text: `Read the ${xyz ? 'three' : 'two'} candidates in ${cellName(pivot)}. Look for cells it sees with exactly two candidates.` },
      check: { cells: [pivot, ...pincers], candidates: marks([pivot, ...pincers], [x, y, z]),
        text: `Compare ${cellName(pivot)} with ${names(pincers)}. One wing shares ${x} with the pivot, and the other shares ${y}. Which digit do the wings share?` },
      follow: `Try each digit in the pivot. Where can ${z} go in each case? Look for another ${z} that sees ${xyz ? 'all three cells' : 'both wings'}.`,
    }
  }
  if ('w-wing' in evidence) {
    const { wings, link, linkedDigit, digit } = evidence['w-wing']
    return {
      start: { cells: wings.slice(0, 1), text: `Start at ${cellName(wings[0])}. Look for a second cell with the same two candidates.` },
      check: { cells: wings, houses: [link.house], candidates: marks(wings), text: `The matching cell is ${cellName(wings[1])}. Find the two places for ${linkedDigit} in ${houseName(link.house)}. Do the two places see different wings?` },
      follow: `Try both places for ${linkedDigit}. Each forces ${digit} into a different wing. Look for a ${digit} that sees both wings.`,
    }
  }
  if ('wxyz-wing' in evidence) {
    const { cells, digits: values } = evidence['wxyz-wing']
    return {
      start: { cells: cells.slice(0, 1), text: `Start at ${cellName(cells[0])}. Look nearby for cells that use some of the same candidates.` },
      check: { cells, candidates: marks(cells, values), text: 'Count the different candidate digits in the four highlighted cells. There must be four in total.' },
      follow: 'Choose one digit. Do all wing cells with that digit see each other? Repeat for the other digits. Which digit must the wing use?',
    }
  }
  if ('als-xz' in evidence || 'als-chain' in evidence) {
    const { sets, links } = 'als-xz' in evidence ? evidence['als-xz'] : evidence['als-chain']
    const [a, b] = sets
    return {
      start: { cells: a.cells, text: `Start at ${names(a.cells)}. Count the distinct candidate digits. There must be one more digit than cells.` },
      check: { cells: [...a.cells, ...b.cells], candidates: marks([...a.cells, ...b.cells], sets.length === 2 ? links : [links[0]]),
        text: `Compare that set with ${names(b.cells)}. Does each possible ${links[0]} in the first set see every ${links[0]} in the second?${links.length === 2 && sets.length === 2 ? ` Check the same link for ${links[1]}.` : ''}` },
      follow: sets.length === 2
        ? links.length === 2
          ? 'Each set must skip a different linked digit. Which digits does that force into the sets?'
          : 'One set must skip the linked digit and use all its other digits. Which of those digits also appears in the other set?'
        : `Trace the sets in order through the links for ${links.join(', ')}. Then look for a shared digit at the two ends and a candidate that sees all its copies there.`,
    }
  }
  if ('death-blossom' in evidence) {
    const { stem, petals } = evidence['death-blossom']
    const links = petals.map(({ digit }) => digit)
    return {
      start: { cells: [stem], text: `Start at ${cellName(stem)}. Find an almost locked set for each of its candidates.` },
      check: { cells: [stem, ...petals.flatMap(({ set }) => set.cells)], accent: marks([stem], links),
        candidates: petals.flatMap(({ digit, set }) => marks(set.cells, [digit])),
        text: 'For each stem digit, find every copy in its petal. Does the stem see them all?' },
      follow: 'Which other digit appears in every petal? Look for an outside cell that sees each possible copy of that digit.',
    }
  }
  if ('multi-coloring' in evidence) {
    const { bridge, links, other_bridge: otherBridge } = evidence['multi-coloring']
    const seed = [links[0].from, links[0].to]
    const candidates = [bridge.from, bridge.to]
    const usesMultipleDigits = new Set(evidence['multi-coloring'].groups.flat(2).map(({ digit }) => digit)).size > 1
    return {
      start: {
        cells: seed.map(({ cell }) => cell), candidates: seed,
        text: usesMultipleDigits
          ? `Start with the strong link between ${candidateName(seed[0])} and ${candidateName(seed[1])}. Give them opposite colors, then follow strong links to color the first group.`
          : `Start with the two places for ${bridge.from.digit} in ${names(seed.map(({ cell }) => cell))}. Follow their strong links to color the first group.`,
      },
      check: {
        candidates,
        cells: candidates.map(({ cell }) => cell),
        text: `Check the weak link between ${candidateName(bridge.from)} and ${candidateName(bridge.to)}.`,
      },
      follow: otherBridge
        ? 'Can one color in the first group rule out both colors in the second group?'
        : 'Find an uncolored candidate that sees at least one candidate of the opposite color in each group.',
    }
  }
  if ('coloring' in evidence) {
    const { links, colors: [blue] } = evidence.coloring
    const local = links.find(link => 'cell' in link.source)
    const cross = local && links.find(({ from, to, source }) => 'house' in source
      && [from, to].some(candidate => candidate.cell === local.from.cell))
    const lead = local ?? links[0]
    const house = 'house' in lead.source ? lead.source.house : undefined
    const seed = [lead.from, lead.to]
    const firstColor = seed.find(candidate => blue.some(({ cell, digit }) => candidate.cell === cell && candidate.digit === digit))
    const text = !house
      ? `Give ${digits(seed.map(({ digit }) => digit))} opposite colors in ${cellName(lead.from.cell)}.`
      : `Give the two ${lead.from.digit} candidates opposite colors in ${names(seed.map(({ cell }) => cell))}.`
    const nextHouse = cross && 'house' in cross.source ? cross.source.house : undefined
    const next = nextHouse && cross
      ? `Find the only other ${cross.from.digit} in ${houseName(nextHouse)}. Give it the opposite color from the ${cross.from.digit} in the starting cell.`
      : 'Look for another house with exactly two places for this digit. Give those places opposite colors.'
    return {
      start: house ? { houses: [house], text: `Find the two places for ${lead.from.digit} in ${houseName(house)}.` }
        : { cells: [lead.from.cell], text: `Start at ${cellName(lead.from.cell)}. Which of its two digits has exactly one other spot in a shared house?` },
      check: { cells: seed.map(({ cell }) => cell), candidates: firstColor ? [firstColor] : [], accent: seed.filter(candidate => candidate !== firstColor),
        houses: nextHouse ? [nextHouse] : undefined, text: `${text} ${next}` },
      follow: !house
        ? 'At a two-candidate cell, switch digits and colors. Can one color cause a conflict? Can both colors rule out the same candidate?'
        : 'Continue through connected pairs. Does one color repeat in a house? Does an uncolored candidate see both colors?',
    }
  }
  if ('chain' in evidence || 'inference' in evidence) {
    const links = 'inference' in evidence ? evidence.inference.links : evidence.chain.links.map(({ from, to, ...rest }) => ({
      ...rest, from: { candidate: from } satisfies InferenceNode, to: { candidate: to } satisfies InferenceNode,
    }))
    const [a, b] = links
    const rule = (link: typeof a) => {
      const { from, to, strength, source } = link
      if ('cell' in source) return strength === 'strong'
        ? `Only two digits fit in ${cellName(source.cell)}. If one is false, the other must be true.`
        : `Both candidates belong to ${cellName(source.cell)}. Placing one rules out the other.`
      if ('house' in source) return strength === 'strong'
        ? `In ${houseName(source.house)}, ${inferenceName(from)} and ${inferenceName(to)} cover every place for the digit.`
        : `In ${houseName(source.house)}, placing the digit at one end rules it out at the other.`
      return strength === 'strong' ? 'At least one end must be true.'
        : 'The two ends cannot both be true.'
    }
    const seed = inferenceCandidates(a.from)
    const firstLinks = links.slice(0, 2)
    const checkCells = [...seed, ...firstLinks.flatMap(({ to }) => inferenceCandidates(to))]
    const end = inferenceName(links.at(-1)!.to)
    return {
      start: { cells: seed.map(({ cell }) => cell), candidates: seed, text: `Start at ${inferenceName(a.from)}. Look for a ${a.strength} link${'house' in a.source ? ` in ${houseName(a.source.house)}` : ''}.` },
      check: { candidates: checkCells, links: firstLinks.map(({ from, to, strength }) => ({
        from: boardPoint(from), to: boardPoint(to), color: patternColor, dashed: strength === 'weak',
      })), text: `Go from ${inferenceName(a.from)} to ${inferenceName(a.to)}. ${rule(a)}${b ? ` Next, go to ${inferenceName(b.to)}. ${rule(b)}` : ''}` },
      follow: technique.includes('nice-loop')
        ? `Follow the links back to ${end}. Compare the first and last links where they meet.`
        : `${technique === 'xy-chain' ? 'Follow the shared digit to another cell with two candidates, then switch digits in that cell.' : 'Keep alternating weak and strong links.'} Trace the path to ${end}. Look for a candidate that conflicts with both ends.`,
    }
  }
  if ('unique-rectangle' in evidence) {
    const { corners, digits: values, support } = evidence['unique-rectangle']
    const seed = corners.find(cell => marks([cell]).length === 2) ?? corners[0]
    return {
      start: { cells: [seed], text: `In this puzzle with one solution, start at ${cellName(seed)}. Look along its row and column for cells with ${digits(values)}.` },
      check: { cells: corners, candidates: marks(corners, values),
        text: `Check ${names(corners)}. All four contain ${digits(values)}. Count how many boxes the rectangle spans.` },
      follow: 'strong-links' in support
        ? `Count the places for ${support['strong-links'].digit} in ${houses(support['strong-links'].houses)}. Which placements let the four corners swap digits?`
        : 'subset' in support
          ? 'Count the corners with extra digits as one slot. Compare their extras with the nearby cells that share a house with both corners.'
          : 'Find the corners with an extra candidate. At least one must use an extra digit to prevent the swap.',
    }
  }
  if ('bug-plus-one' in evidence) {
    const { cell, candidates: values, houses } = evidence['bug-plus-one']
    return {
      start: { cells: [cell], text: `Start at ${cellName(cell)}. It has three candidates. Count the candidates in the other empty cells.` },
      check: { cells: [cell], houses, candidates: marks([cell], values),
        text: `Count the spots for ${digits(values)} in each highlighted house. Which digit has three spots in all three houses?` },
    }
  }
  if ('forcing' in evidence) {
    const { branches } = evidence.forcing
    const { assumption, steps } = branches[0]
    const describe = ({ candidate, truth }: typeof assumption) =>
      `${truth ? 'Place' : 'Remove'} ${candidateName(candidate)}`
    const firstEffect = steps[0]?.effect
    const effect = firstEffect && (firstEffect.candidate.cell !== first.cell || firstEffect.candidate.digit !== first.digit) ? firstEffect : undefined
    return {
      start: { cells: [assumption.candidate.cell], text: `Start at ${cellName(assumption.candidate.cell)}. Which nearby cells share a candidate with this cell?` },
      check: { candidates: [assumption.candidate, ...(effect ? [effect.candidate] : [])],
        text: `${describe(assumption)} as an assumption. ${effect ? `The first change is to ${describe(effect).toLowerCase()}. ` : ''}Which cell or house now has just one choice?` },
      follow: branches.length === 1
        ? technique === 'forcing-net'
          ? 'Track the changes that follow. If several earlier steps leave only one choice, use them together. Look for a rule the assumption breaks.'
          : 'Follow the forced moves. Does a cell lose every candidate? Does a house lose every place for a digit? Do two forced moves conflict?'
        : 'Try every starting choice separately. Which move follows in every case?',
    }
  }
  if (pattern) {
    const targets = actions.map((action) => 'place' in action ? action.place : action.eliminate)
    const supporting = pattern.candidates.filter(({ cell, digit }) =>
      (candidates[cell] & (1 << (digit - 1))) && !targets.some((target) => target.cell === cell && target.digit === digit))
    const seed = pattern.cells.find((cell) => !targets.some((target) => target.cell === cell)) ?? pattern.cells[0] ?? first.cell
    return {
      start: { cells: [seed], text: guide?.start ?? `Start at ${cellName(seed)}. Which of its candidates also appears in the other marked cells?` },
      check: { cells: pattern.cells.length ? pattern.cells : [seed], houses: pattern.houses, candidates: supporting,
        text: guide?.check ?? 'Compare the marked cells. Which choices can still go together?' },
      follow: guide?.follow,
    }
  }
  throw new Error(`Missing practice guidance for ${technique}`)
}
