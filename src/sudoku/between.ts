import type { VariantPuzzle } from './engine.ts'

function betweenOrientation(domains: readonly number[], lowDomain: number, highDomain: number) {
  const lowestEnd = lowDomain & -lowDomain
  const highestEnd = 1 << (31 - Math.clz32(highDomain))
  const interval = (highestEnd - 1) & ~(2 * lowestEnd - 1)
  if (!interval) return
  let lowestInteriorMaximum = highestEnd
  let highestInteriorMinimum = lowestEnd
  for (let index = 1; index < domains.length - 1; index++) {
    const inside = domains[index] & interval
    if (!inside) return
    lowestInteriorMaximum = Math.min(lowestInteriorMaximum, 1 << (31 - Math.clz32(inside)))
    highestInteriorMinimum = Math.max(highestInteriorMinimum, inside & -inside)
  }
  return {
    low: lowDomain & (lowestInteriorMaximum - 1),
    high: highDomain & ~(2 * highestInteriorMinimum - 1),
    interval,
  }
}

/** Exact digit support for a Between path with one or more interior cells. */
export function betweenSupport(domains: readonly number[]): number[] | null {
  const last = domains.length - 1
  const first = domains[0], end = domains[last]
  if (!first || !end) return null
  const ascending = betweenOrientation(domains, first, end)
  const descending = betweenOrientation(domains, end, first)
  if (!ascending && !descending) return null
  const inside = (ascending?.interval ?? 0) | (descending?.interval ?? 0)
  const support = domains.map(domain => domain & inside)
  support[0] = (ascending?.low ?? 0) | (descending?.high ?? 0)
  support[last] = (ascending?.high ?? 0) | (descending?.low ?? 0)
  return support
}

/** Exact digit support for a Lockout path using the source rule's four-digit gap. */
export function lockoutSupport(domains: readonly number[], size: number, minDifference = 4): number[] | null {
  const last = domains.length - 1
  const firstDomain = domains[0], lastDomain = domains[last]
  if (!firstDomain || !lastDomain) return null
  const full = (1 << size) - 1
  const endpoints = firstDomain | lastDomain
  const caps = Array<number>(size).fill(full)
  caps[0] = full >>> 1
  for (let index = 1; index < last; index++) {
    const domain = domains[index]
    if (domain === full) continue
    if (!domain) return null
    const lowest = 31 - Math.clz32(domain & -domain)
    caps[lowest] &= (1 << (31 - Math.clz32(domain))) - 1
  }
  let firstSupport = 0, lastSupport = 0, insideSupport = 0
  let cap = full
  for (let index = size - 1; index >= 0; index--) {
    cap &= caps[index]
    const low = 1 << index
    if (!(low & endpoints)) continue
    const below = low - 1
    const higher = endpoints & cap & ~((low << minDifference) - 1)
    const ascending = low & firstDomain ? higher & lastDomain : 0
    const descending = low & lastDomain ? higher & firstDomain : 0
    if (!(ascending | descending)) continue
    firstSupport |= (ascending ? low : 0) | descending
    lastSupport |= (descending ? low : 0) | ascending
    const smallestHigh = (ascending | descending) & -(ascending | descending)
    insideSupport |= below | (full & ~(2 * smallestHigh - 1))
  }
  if (!firstSupport) return null
  const support = domains.map(domain => domain & insideSupport)
  support[0] = firstSupport
  support[last] = lastSupport
  return support
}

/** Local Between and Lockout restrictions from placed digits. Houses and other rules are
 * checked separately. Interior cells may repeat when those rules permit it. */
export function endpointLineState(puzzle: VariantPuzzle | undefined, values: string) {
  const lines = puzzle?.rules?.flatMap(rule => rule.type === 'between' || rule.type === 'lockout' ? [rule] : [])
  if (!lines?.length) return
  const allowed = Array<number>(81).fill(511)
  const conflicts = new Set<number>()
  for (const { cells, type } of lines) {
    const placed = cells.map(cell => Number(values[cell]))
    const last = cells.length - 1
    const insidePlaced = placed.slice(1, last)
    const lockout = type === 'lockout'
    const support = Array<number>(cells.length).fill(0)
    for (let first = 1; first <= 9; first++) {
      if (placed[0] && placed[0] !== first) continue
      for (let end = 1; end <= 9; end++) {
        if (placed[last] && placed[last] !== end) continue
        const low = Math.min(first, end), high = Math.max(first, end)
        if (high - low < (lockout ? 4 : 2)) continue
        const inside = lockout ? ((1 << (low - 1)) - 1) | (511 & ~((1 << high) - 1))
          : ((1 << (high - 1)) - 1) & ~((1 << low) - 1)
        if (insidePlaced.some(digit => digit && !(inside & (1 << (digit - 1)))) || last > 1 && !inside) continue
        support[0] |= 1 << (first - 1)
        support[last] |= 1 << (end - 1)
        for (let i = 1; i < last; i++) support[i] |= placed[i] ? 1 << (placed[i] - 1) : inside
      }
    }
    for (const [i, cell] of cells.entries()) {
      allowed[cell] &= support[i]
      if (!support[0] && placed[i]) conflicts.add(cell)
    }
  }
  return { allowed, conflicts }
}
