import { indicesOfMask, pruneReservedCells } from './reservations.ts'

export type HidatoPuzzle = {
  width: number
  height: number
  givens: readonly number[]
  cells: readonly number[]
  adjacent: readonly number[]
  distances: readonly number[][]
  reachable: readonly number[][]
}

function bit(index: number) {
  return 1 << index
}

function indexOf(single: number) {
  return 31 - Math.clz32(single)
}

function single(mask: number) {
  return mask !== 0 && (mask & (mask - 1)) === 0
}

function cellLabel(puzzle: HidatoPuzzle, cell: number) {
  return `R${Math.floor(cell / puzzle.width) + 1}C${cell % puzzle.width + 1}`
}

// Outside cells are -1. Playable cells have a given number or 0.
export function createHidato(width: number, givens: readonly number[]): HidatoPuzzle {
  const height = givens.length / width
  const cells = givens.flatMap((given, cell) => given === -1 ? [] : [cell])
  const size = cells.length
  if (!Number.isInteger(width) || width < 2 || !Number.isInteger(height) || height < 2 || size < 4 || size > 30) {
    throw new Error('Use a rectangular Hidato board with 4 to 30 playable cells.')
  }
  if (givens.some(value => !Number.isInteger(value) || value < -1 || value > size)) {
    throw new Error('A Hidato given must be in the board’s number range.')
  }
  const clues = givens.filter(value => value > 0)
  if (!clues.includes(1) || !clues.includes(size) || new Set(clues).size !== clues.length) {
    throw new Error('Give both Hidato endpoints and use each clue only once.')
  }

  const adjacent = cells.map(cell => cells.reduce((mask, other, index) => {
    const steps = Math.max(Math.abs(cell % width - other % width),
      Math.abs(Math.floor(cell / width) - Math.floor(other / width)))
    return steps === 1 ? mask | bit(index) : mask
  }, 0))

  const distances = cells.map((_, source) => {
    const distance = cells.map(() => Infinity)
    distance[source] = 0
    const queue = [source]
    for (let front = 0; front < queue.length; front++) {
      const from = queue[front]
      for (let mask = adjacent[from]; mask; mask &= mask - 1) {
        const to = indexOf(mask & -mask)
        if (Number.isFinite(distance[to])) continue
        distance[to] = distance[from] + 1
        queue.push(to)
      }
    }
    return distance
  })
  if (distances[0].includes(Infinity)) throw new Error('All Hidato cells must connect.')

  const reachable = distances.map(distance => cells.map((_, steps) =>
    distance.reduce((mask, cost, slot) => cost <= steps ? mask | bit(slot) : mask, 0)))
  return { width, height, givens, cells, adjacent, distances, reachable }
}

function position(puzzle: HidatoPuzzle, values: readonly number[]) {
  const placed: Array<{ value: number; slot: number }> = []
  const conflicts = new Set<number>()
  const size = puzzle.cells.length
  puzzle.cells.forEach((cell, slot) => {
    const entered = values[cell] ?? 0
    const given = puzzle.givens[cell]
    const value = given || entered
    if (!Number.isInteger(entered) || entered < 0 || entered > size || given && entered && entered !== given) {
      conflicts.add(cell)
    } else if (value) {
      placed.push({ value, slot })
    }
  })

  for (let i = 0; i < placed.length; i++) {
    const a = placed[i]
    for (let j = 0; j < i; j++) {
      const b = placed[j]
      if (puzzle.distances[a.slot][b.slot] > Math.abs(a.value - b.value)) {
        conflicts.add(puzzle.cells[a.slot])
        conflicts.add(puzzle.cells[b.slot])
      }
    }
  }
  return { placed, conflicts }
}

export function checkHidato(puzzle: HidatoPuzzle, values: readonly number[]) {
  const { placed, conflicts } = position(puzzle, values)
  return { marked: [...conflicts], complete: !conflicts.size && placed.length === puzzle.cells.length }
}

export const hidatoTechniques = ['Path distance', 'One number per cell', 'Consecutive neighbors', 'Path segment', 'Reserved cells', 'Cut-off cells', 'Contradiction'] as const

type TrialProof = { assumption: string; steps: string[]; conclusion: string }
type Reason = { text: string; cells: number[]; technique: typeof hidatoTechniques[number]; proof?: TrialProof }
type Explain = (target: number, reason: Reason, sources: readonly number[]) => void
type Placed = ReturnType<typeof position>['placed']

const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

function startDomains(puzzle: HidatoPuzzle, placed: Placed, explain?: Explain) {
  const size = puzzle.cells.length
  const domains = puzzle.cells.map(() => (1 << size) - 1)
  for (const { value, slot } of placed) {
    const number = value - 1
    const cell = puzzle.cells[slot]
    const reason = explain && { technique: hidatoTechniques[0], text: `${value} at ${cellLabel(puzzle, cell)} limits how far its neighbors can go.`, cells: [cell] }
    for (let target = 0; target < size; target++) {
      const mask = domains[target] & puzzle.reachable[slot][Math.abs(number - target)]
      if (domains[target] === mask) continue
      domains[target] = mask
      if (reason) explain?.(target, reason, [])
    }
  }
  return domains
}

function neighborUnion(puzzle: HidatoPuzzle, mask: number) {
  let result = 0
  for (; mask; mask &= mask - 1) result |= puzzle.adjacent[indexOf(mask & -mask)]
  return result
}

// After a fixed prefix or suffix, the next placement must leave a connected
// path to the opposite endpoint through all cells that still need a number.
function pruneCutOffCells(puzzle: HidatoPuzzle, domains: number[], explain?: Explain): boolean | null {
  const all = (1 << domains.length) - 1
  let changed = false
  for (const direction of [1, -1]) {
    const start = direction === 1 ? 0 : domains.length - 1
    const end = domains.length - 1 - start
    let number = start
    let used = 0
    while (number !== end && single(domains[number])) {
      used |= domains[number]
      number += direction
    }
    if (number === end) continue

    const finish = domains[end]
    for (let choices = domains[number]; choices; choices &= choices - 1) {
      const candidate = choices & -choices
      const remaining = all & ~(used | candidate)
      let reached = finish
      let frontier = finish
      while (frontier) {
        frontier = neighborUnion(puzzle, frontier) & remaining & ~reached
        reached |= frontier
      }
      const cutOff = remaining & ~reached
      if (!cutOff) continue
      domains[number] &= ~candidate
      if (!domains[number]) return null
      changed = true
      if (explain) {
        const from = puzzle.cells[indexOf(domains[number - direction])]
        const attempted = puzzle.cells[indexOf(candidate)]
        const isolated = puzzle.cells[indexOf(cutOff & -cutOff)]
        const endpoint = puzzle.cells[indexOf(finish)]
        const sources = Array.from({ length: Math.abs(number - start) }, (_, offset) => start + direction * offset)
        const range = number - direction === start ? String(start + 1)
          : `${Math.min(start, number - direction) + 1} through ${Math.max(start, number - direction) + 1}`
        explain(number, {
          technique: hidatoTechniques[5],
          text: `The path already uses the cells for ${range}. If ${number + 1} goes in ${cellLabel(puzzle, attempted)}, the remaining path from ${end + 1} cannot reach ${cellLabel(puzzle, isolated)}.`,
          cells: [from, attempted, isolated, endpoint],
        }, sources)
      }
    }
  }
  return changed
}

// A gap needs at least three unfixed numbers before nonconsecutive cells can repeat.
const minSegmentSteps = 4
const maxShortSegmentSteps = 6
const maxLongSegmentSteps = 10
const longSegmentVisitLimit = 4096
const contradictionTrialLimit = 24

function segmentSupport(
  puzzle: HidatoPuzzle, domains: readonly number[], first: number, last: number,
  budget?: { remaining: number },
) {
  const start = domains[first]
  const end = domains[last]
  const supported = new Array<number>(last - first - 1).fill(0)
  const path = supported.slice()
  let exhausted = false
  let complete = 0

  function visit(number: number, from: number, used: number): boolean {
    if (budget) {
      if (budget.remaining === 0) {
        exhausted = true
        return true
      }
      budget.remaining--
    }
    if (number === last) {
      if (!(puzzle.adjacent[from] & end)) return false
      for (let offset = 0; offset < supported.length; offset++) {
        if (supported[offset] & path[offset]) continue
        supported[offset] |= path[offset]
        if (supported[offset] === domains[first + offset + 1]) complete++
      }
      return complete === supported.length
    }

    const available = domains[number] & puzzle.adjacent[from] & ~used
    for (let choices = available; choices; choices &= choices - 1) {
      const slot = choices & -choices
      path[number - first - 1] = slot
      // Stop once every candidate has support or the search exhausts its budget.
      if (visit(number + 1, indexOf(slot), used | slot)) return true
    }
    return false
  }

  visit(first + 1, indexOf(start), start | end)
  // Partial support cannot rule out a candidate.
  return exhausted ? undefined : supported
}

function prunePathSegments(
  puzzle: HidatoPuzzle, domains: number[], explain?: Explain, budget?: { remaining: number },
): boolean | null {
  const minSteps = budget ? maxShortSegmentSteps + 1 : minSegmentSteps
  const maxSteps = budget ? maxLongSegmentSteps : maxShortSegmentSteps
  let changed = false
  let previous = -1
  for (let last = 0; last < domains.length; last++) {
    if (!single(domains[last])) continue
    const first = previous
    previous = last
    const steps = last - first
    if (first === -1 || steps < minSteps || steps > maxSteps) continue

    const supported = segmentSupport(puzzle, domains, first, last, budget)
    if (!supported) break
    if (!supported[0]) return null
    if (supported.every((mask, offset) => mask === domains[first + offset + 1])) continue
    const sources = explain && Array.from({ length: steps + 1 }, (_, offset) => first + offset)
    const startCell = puzzle.cells[indexOf(domains[first])]
    const endCell = puzzle.cells[indexOf(domains[last])]
    const reason = explain && {
      technique: hidatoTechniques[3],
      text: `The path from ${first + 1} at ${cellLabel(puzzle, startCell)} to ${last + 1} at ${cellLabel(puzzle, endCell)} needs ${steps} steps. It cannot visit a cell twice.`,
      cells: [startCell, endCell],
    }
    for (const [offset, mask] of supported.entries()) {
      const number = first + offset + 1
      if (mask === domains[number]) continue
      domains[number] = mask
      if (reason && sources) explain?.(number, reason, sources)
    }
    changed = true
  }
  return changed
}

function describeConflict(puzzle: HidatoPuzzle, domains: readonly number[]) {
  const needed = domains.map(() => 0)
  let covered = 0
  for (const [number, mask] of domains.entries()) {
    if (!mask) {
      needed[number] = (1 << domains.length) - 1
      return { text: `no cell can hold ${number + 1}`, cells: [], needed }
    }
    covered |= mask
    if (!single(mask)) continue
    const other = domains.indexOf(mask)
    if (other >= number) continue
    const cell = puzzle.cells[indexOf(mask)]
    needed[other] = needed[number] = ~mask
    return { text: `${other + 1} and ${number + 1} both need ${cellLabel(puzzle, cell)}`, cells: [cell], needed }
  }
  const missing = ((1 << domains.length) - 1) & ~covered
  const empty = missing & -missing
  const cell = puzzle.cells[indexOf(empty)]
  needed.fill(empty)
  return { text: `no number can go in ${cellLabel(puzzle, cell)}`, cells: [cell], needed, empty }
}

function traceTrial(
  puzzle: HidatoPuzzle, domains: readonly number[], number: number, candidate: number,
  conflict: ReturnType<typeof describeConflict>,
): TrialProof {
  const trial = domains.slice()
  trial[number] = candidate
  const before = trial.slice()
  const changes: {
    number: number; removed: number; remaining: number; consecutive: boolean
    support: { number: number; cells: number }[]
  }[] = []
  propagate(puzzle, trial, (changed, reason, sources) => {
    changes.push({
      number: changed,
      removed: before[changed] & ~trial[changed],
      remaining: trial[changed],
      consecutive: reason.technique === 'Consecutive neighbors',
      support: sources.map(source => ({ number: source, cells: trial[source] })),
    })
    before[changed] = trial[changed]
  }, false)

  const steps: (string | { owner: number; cell: number; excluded: number[] })[] = []
  const needed = conflict.needed
  const names = (mask: number) => list.format(indicesOfMask(mask).map(slot => cellLabel(puzzle, puzzle.cells[slot])))
  // Walk back only through removals that rule out the final cell or number.
  for (const change of changes.reverse()) {
    const removed = needed[change.number] & change.removed
    if (!removed) continue
    const value = change.number + 1
    if (change.consecutive) {
      const [neighbor] = change.support
      needed[neighbor.number] |= neighborUnion(puzzle, removed)
      steps.push(`No candidate cell for ${neighbor.number + 1} touches ${names(removed)}. ${value} cannot go there.`)
      continue
    }
    const owners = change.support.filter(({ cells }) => single(cells) && (cells & removed))
    const occupied = owners.reduce((mask, { cells }) => mask | cells, 0)
    if (occupied === removed) {
      for (const owner of owners) {
        needed[owner.number] |= ~owner.cells
        const previous = steps.at(-1)
        if (typeof previous === 'object' && previous.owner === owner.number && previous.cell === owner.cells) {
          previous.excluded.unshift(value)
        } else {
          steps.push({ owner: owner.number, cell: owner.cells, excluded: [value] })
        }
      }
      continue
    }
    for (const source of change.support) needed[source.number] |= change.remaining
    steps.push(`Only ${value} can go in ${names(change.remaining)}. It cannot also go in ${names(removed)}.`)
  }
  const ordered = steps.reverse().map(step => typeof step === 'string' ? step
    : `${names(step.cell)} holds ${step.owner + 1}, so ${list.format(step.excluded.map(String))} cannot go there.`)
  const { empty } = conflict
  if (empty) {
    const candidates = domains.flatMap((mask, index) => mask & empty ? [String(index + 1)] : [])
    ordered.unshift(`Before the trial, only ${list.format(candidates)} can go in ${names(empty)}.`)
  }
  const attempted = names(candidate)
  return {
    assumption: `Assume ${number + 1} goes in ${attempted}.`,
    steps: ordered,
    conclusion: `${conflict.text[0].toUpperCase()}${conflict.text.slice(1)}. Remove ${number + 1} from ${attempted}.`,
  }
}

function pruneContradictions(
  puzzle: HidatoPuzzle, domains: number[], budget: { remaining: number }, explain?: Explain,
) {
  for (const [number, mask] of domains.entries()) {
    // Try only numbers that have two possible cells.
    if (!single(mask & (mask - 1))) continue
    for (let cells = mask; cells && budget.remaining; cells &= cells - 1) {
      budget.remaining--
      const candidate = cells & -cells
      const trial = domains.slice()
      trial[number] = candidate
      // Test the placement with local rules only. Do not branch again.
      if (propagate(puzzle, trial, undefined, false)) continue
      const conflict = explain && describeConflict(puzzle, trial)
      const proof = conflict && traceTrial(puzzle, domains, number, candidate, conflict)
      domains[number] &= ~candidate
      if (explain && conflict && proof) {
        const cell = puzzle.cells[indexOf(candidate)]
        explain(number, {
          technique: hidatoTechniques[6],
          text: `If ${number + 1} goes in ${cellLabel(puzzle, cell)}, ${conflict.text}.`,
          cells: [cell, ...conflict.cells],
          proof,
        }, domains.map((_, index) => index))
      }
      return true
    }
    if (!budget.remaining) break
  }
  return false
}

function propagate(
  puzzle: HidatoPuzzle, domains: number[], explain?: Explain, checkAdvanced = true,
  stop?: () => boolean,
) {
  const all = (1 << domains.length) - 1
  const uniqueReason = { technique: hidatoTechniques[1], text: 'Each cell holds exactly one number.', cells: [] }
  const pairReasons = explain && domains.map((_, i) =>
    ({ technique: hidatoTechniques[2], text: `${i + 1} and ${i + 2} must touch.`, cells: [] }))

  const reservationReasons = explain && new Map<number, Reason>()
  // Share the long segment budget across all rounds of the advanced checks.
  const segmentBudget = checkAdvanced ? { remaining: longSegmentVisitLimit } : undefined
  const trialBudget = checkAdvanced ? { remaining: contradictionTrialLimit } : undefined
  let changed = true
  while (changed) {
    changed = false
    let fixed = 0
    const owners: number[] = []
    for (let i = 0; i < domains.length; i++) {
      const mask = domains[i]
      if (!mask) return false
      if (!single(mask)) continue
      if (fixed & mask) return false
      fixed |= mask
      if (explain) owners[indexOf(mask)] = i
    }

    for (let i = 0; i < domains.length; i++) {
      const mask = domains[i]
      if (single(mask) || !(mask & fixed)) continue
      domains[i] = mask & ~fixed
      if (explain) {
        const sources: number[] = []
        for (let eliminated = mask & fixed; eliminated; eliminated &= eliminated - 1) {
          sources.push(owners[indexOf(eliminated & -eliminated)])
        }
        explain(i, uniqueReason, sources)
      }
      changed = true
    }

    if (stop?.()) return true

    let neighbors = neighborUnion(puzzle, domains[0])
    for (let i = 0; i < domains.length - 1; i++) {
      const left = domains[i]
      const right = domains[i + 1]
      const rightNeighbors = neighborUnion(puzzle, right)
      const maskLeft = left & rightNeighbors
      const maskRight = right & neighbors
      if (maskLeft !== left || maskRight !== right) changed = true
      if (maskLeft !== left) {
        domains[i] = maskLeft
        if (pairReasons) explain?.(i, pairReasons[i], [i + 1])
      }
      if (maskRight !== right) {
        domains[i + 1] = maskRight
        if (pairReasons) explain?.(i + 1, pairReasons[i], [i])
      }
      // The right domain becomes the left domain for the next pair.
      neighbors = maskRight === right ? rightNeighbors : neighborUnion(puzzle, maskRight)
    }

    if (stop?.()) return true

    let seen = 0
    let shared = 0
    for (const mask of domains) {
      if (!mask) return false
      shared |= seen & mask
      seen |= mask
    }
    if (seen !== all) return false
    for (let only = seen & ~shared & ~fixed; only; only &= only - 1) {
      const slot = only & -only
      const i = domains.findIndex(mask => Boolean(mask & slot))
      if (i < 0) return false
      if (domains[i] === slot) continue
      domains[i] &= slot
      if (explain) explain(i, uniqueReason, domains.map((_, index) => index).filter(index => index !== i))
      changed = true
    }

    if (stop?.()) return true

    if (!changed && checkAdvanced && fixed !== all) {
      const narrowed = prunePathSegments(puzzle, domains, explain)
      if (narrowed === null) return false
      changed = narrowed
      if (!changed) {
        const reserved = pruneReservedCells(domains, explain && reservationReasons && ((number, reservedNumbers, reservedCells) => {
          const sources = indicesOfMask(reservedNumbers)
          let reason = reservationReasons.get(reservedNumbers)
          if (!reason) {
            const cells = indicesOfMask(reservedCells).map(slot => puzzle.cells[slot])
            const numbers = list.format(sources.map(source => String(source + 1)))
            const names = list.format(cells.map(cell => cellLabel(puzzle, cell)))
            reason = {
              technique: hidatoTechniques[4],
              text: `${numbers} can only go in ${names}. These cells are reserved for them.`,
              cells,
            }
            reservationReasons.set(reservedNumbers, reason)
          }
          explain(number, reason, sources)
        }))
        if (reserved === null) return false
        changed = reserved
      }
      if (!changed && segmentBudget?.remaining) {
        const longSegment = prunePathSegments(puzzle, domains, explain, segmentBudget)
        if (longSegment === null) return false
        changed = longSegment
      }
      if (!changed) {
        const connected = pruneCutOffCells(puzzle, domains, explain)
        if (connected === null) return false
        changed = connected
      }
      if (!changed && trialBudget?.remaining) changed = pruneContradictions(puzzle, domains, trialBudget, explain)
      if (stop?.()) return true
    }
  }
  return true
}

export function findHidatoHint(puzzle: HidatoPuzzle, values: readonly number[]) {
  return findHidatoHints(puzzle, values, 1)[0] ?? null
}

export function findHidatoHints(puzzle: HidatoPuzzle, values: readonly number[], limit = Infinity) {
  const { placed, conflicts } = position(puzzle, values)
  return conflicts.size ? [] : collectHints(puzzle, placed, limit)
}

/** Return placements in order, with the earlier placements visible at each step. */
export function findHidatoSolutionHints(puzzle: HidatoPuzzle, values: readonly number[]) {
  const { placed, conflicts } = position(puzzle, values)
  if (conflicts.size || placed.length === puzzle.cells.length) return []

  // A complete logical solve lets the replay stop each proof at its first placement.
  // Use the regular hint path if propagation cannot verify the full puzzle.
  if (solveHidato(puzzle, values, 1).status !== 'unique') return collectHints(puzzle, placed, 1)

  const hints = []
  while (placed.length < puzzle.cells.length) {
    const [hint] = collectHints(puzzle, placed, 1, true)
    if (!hint) break
    hints.push(hint)
    const slot = puzzle.cells.indexOf(hint.cell)
    const next = placed.findIndex(entry => entry.slot > slot)
    // Match the regular hint's grid order when explaining distance from placed numbers.
    placed.splice(next < 0 ? placed.length : next, 0, { value: hint.value, slot })
  }
  return hints
}

function collectHints(puzzle: HidatoPuzzle, placed: Placed, limit: number, stopAtLimit = false) {
  const known = new Set(placed.map(({ value }) => value - 1))
  const dependencies: Array<Set<Reason>> = puzzle.cells.map(() => new Set())
  function track(target: number, reason: Reason, sources: readonly number[]) {
    const targetReasons = dependencies[target]
    targetReasons.add(reason)
    for (const source of sources) {
      for (const prior of dependencies[source]) targetReasons.add(prior)
    }
  }
  const domains = startDomains(puzzle, placed, track)
  const hints: { value: number; cell: number; reasons: string[]; marked: number[]; technique: Reason['technique']; trace?: TrialProof[] }[] = []
  function record(number: number, technique: Reason['technique']) {
    if (hints.length >= limit || known.has(number) || !single(domains[number])) return
    known.add(number)
    const reasons = [...dependencies[number]]
    const trace = reasons.flatMap(reason => reason.proof ?? [])
    hints.push({
      value: number + 1,
      cell: puzzle.cells[indexOf(domains[number])],
      reasons: reasons.map(reason => reason.text),
      marked: [...new Set(reasons.flatMap(reason => reason.cells))],
      technique: [hidatoTechniques[6], hidatoTechniques[5], hidatoTechniques[4]].find(advanced =>
        reasons.some(reason => reason.technique === advanced)) ?? technique,
      ...(trace.length ? { trace } : {}),
    })
  }
  domains.forEach((_, number) => record(number, hidatoTechniques[0]))
  const stop = stopAtLimit ? () => hints.length >= limit : undefined
  if (stop?.()) return hints
  const valid = propagate(puzzle, domains, (number, reason, sources) => {
    if (hints.length >= limit) return
    track(number, reason, sources)
    record(number, reason.technique)
  }, true, stop)
  return valid ? hints : []
}

export function solveHidato(puzzle: HidatoPuzzle, values: readonly number[] = [], limit = 20_000) {
  const { placed, conflicts } = position(puzzle, values)
  let nodes = 0
  let limited = false
  const solutions: number[][] = []
  function visit(domains: number[]) {
    if (nodes >= limit) {
      limited = true
      return
    }
    nodes++
    // Use advanced checks at the root. Search already tries the remaining placements.
    if (!propagate(puzzle, domains, undefined, nodes === 1)) return
    let branch = -1
    let best = 31
    for (let number = 0; number < domains.length; number++) {
      let count = 0
      for (let mask = domains[number]; mask; mask &= mask - 1) count++
      if (count > 1 && count < best) {
        branch = number
        best = count
      }
    }
    if (branch === -1) {
      const board = puzzle.givens.slice()
      domains.forEach((mask, i) => { board[puzzle.cells[indexOf(mask)]] = i + 1 })
      solutions.push(board)
      return
    }
    for (let choices = domains[branch]; choices && !limited && solutions.length < 2; choices &= choices - 1) {
      const next = domains.slice()
      next[branch] = choices & -choices
      visit(next)
    }
  }
  if (!conflicts.size) visit(startDomains(puzzle, placed))
  const status = limited ? 'search-limit' : (['unsolvable', 'unique', 'multiple'] as const)[solutions.length]
  return { status, solution: solutions[0] ?? null, nodes }
}
