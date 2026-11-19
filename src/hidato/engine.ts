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

type Reason = { text: string; cells: number[] }
type Explain = (target: number, reason: Reason, sources: readonly number[]) => void
type Placed = ReturnType<typeof position>['placed']

function startDomains(puzzle: HidatoPuzzle, placed: Placed, explain?: Explain) {
  const size = puzzle.cells.length
  const domains = puzzle.cells.map(() => (1 << size) - 1)
  for (const { value, slot } of placed) {
    const number = value - 1
    const cell = puzzle.cells[slot]
    const reason = explain && { text: `${value} at ${cellLabel(puzzle, cell)} limits how far its neighbors can go.`, cells: [cell] }
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

function propagate(puzzle: HidatoPuzzle, domains: number[], explain?: Explain) {
  const all = (1 << domains.length) - 1
  const uniqueReason = { text: 'Each cell holds exactly one number.', cells: [] }
  const pairReasons = explain && domains.map((_, i) =>
    ({ text: `${i + 1} and ${i + 2} must touch.`, cells: [] }))

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

    for (let i = 0; i < domains.length - 1; i++) {
      const left = domains[i]
      const right = domains[i + 1]
      const maskLeft = left & neighborUnion(puzzle, right)
      const maskRight = right & neighborUnion(puzzle, left)
      if (maskLeft !== left || maskRight !== right) changed = true
      if (maskLeft !== left) {
        domains[i] = maskLeft
        if (pairReasons) explain?.(i, pairReasons[i], [i + 1])
      }
      if (maskRight !== right) {
        domains[i + 1] = maskRight
        if (pairReasons) explain?.(i + 1, pairReasons[i], [i])
      }
    }

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
  }
  return true
}

export function findHidatoHint(puzzle: HidatoPuzzle, values: readonly number[]) {
  const { placed, conflicts } = position(puzzle, values)
  if (conflicts.size) return null
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
  const initial = domains.findIndex((mask, number) => !known.has(number) && single(mask))
  let next = initial
  const valid = propagate(puzzle, domains, (number, reason, sources) => {
    if (next !== -1) return
    track(number, reason, sources)
    if (!known.has(number) && single(domains[number])) next = number
  })
  if (!valid || next === -1) return null
  const reasons = [...dependencies[next]]
  return {
    value: next + 1,
    cell: puzzle.cells[indexOf(domains[next])],
    reasons: reasons.map(reason => reason.text),
    marked: [...new Set(reasons.flatMap(reason => reason.cells))],
  }
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
    if (!propagate(puzzle, domains)) return
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
