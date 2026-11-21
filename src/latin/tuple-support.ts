import type { LatinRule } from './engine.ts'

const tupleSkips = new WeakMap<Uint16Array, Uint32Array>()

export function tuplePrefixSkips(tuples: Uint16Array, length: number) {
  if (tuples.length < 128 * length) return undefined
  let skips = tupleSkips.get(tuples)
  if (skips) return skips
  skips = new Uint32Array(tuples.length)
  // Tuples are ordered by their digits, starting with the first cell.
  // A failed digit rules out every tuple with the same prefix.
  for (let offset = tuples.length - length; offset >= 0; offset -= length) {
    const next = offset + length
    let samePrefix = next < tuples.length
    for (let cell = 0; cell < length; cell++) {
      samePrefix &&= tuples[offset + cell] === tuples[next + cell]
      skips[offset + cell] = samePrefix ? skips[next + cell] : next
    }
  }
  tupleSkips.set(tuples, skips)
  return skips
}

export function tupleSupport(cells: readonly number[], tuples: Uint16Array): LatinRule['support'] {
  const length = cells.length
  const skips = tuplePrefixSkips(tuples, length)
  const cache = new Map<number, readonly number[] | null>()
  return domains => {
    // A digit mask uses nine bits. Five masks fit in an exact JS number.
    let key = 0
    for (const cell of cells) key = key * 512 + domains[cell]
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    const masks = cells.map(cell => domains[cell])
    const supported = new Array<number>(length).fill(0)
    tuple: for (let offset = 0; offset < tuples.length;) {
      for (let i = 0; i < length; i++) {
        if (masks[i] & tuples[offset + i]) continue
        offset = skips ? skips[offset + i] : offset + length
        continue tuple
      }
      let complete = true
      for (let i = 0; i < length; i++) {
        supported[i] |= tuples[offset + i]
        if (supported[i] !== masks[i]) complete = false
      }
      if (complete) break
      offset += length
    }
    const result = supported[0] ? supported : null
    if (cache.size >= 128) cache.clear()
    cache.set(key, result)
    return result
  }
}
