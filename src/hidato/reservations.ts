function indexOfBit(bit: number) {
  return 31 - Math.clz32(bit)
}

export function indicesOfMask(mask: number): number[] {
  const indices: number[] = []
  for (; mask; mask &= mask - 1) indices.push(indexOfBit(mask & -mask))
  return indices
}

// Each number needs a different cell. Filter candidate edges using a perfect
// matching and the alternating cycles that can change it.
export function pruneReservedCells(
  domains: number[],
  explain?: (number: number, reservedNumbers: number, reservedCells: number) => void,
): boolean | null {
  const size = domains.length
  const owner = new Int8Array(size).fill(-1)
  let visited = 0
  function match(number: number): boolean {
    for (let choices = domains[number]; choices; choices &= choices - 1) {
      const bit = choices & -choices
      if (visited & bit) continue
      visited |= bit
      const cell = indexOfBit(bit)
      if (owner[cell] < 0 || match(owner[cell])) {
        owner[cell] = number
        return true
      }
    }
    return false
  }

  for (let number = 0; number < size; number++) {
    visited = 0
    if (!match(number)) return null
  }

  // Each edge leads to the number that owns the candidate cell in the
  // matching. A placement is possible if this owner can give up its cell
  // through a cycle that returns to the number requesting it.
  const reaches = domains.map(mask => {
    let numbers = 0
    for (; mask; mask &= mask - 1) numbers |= 1 << owner[indexOfBit(mask & -mask)]
    return numbers
  })
  for (let via = 0; via < size; via++) {
    const bit = 1 << via
    for (let number = 0; number < size; number++) {
      if (reaches[number] & bit) reaches[number] |= reaches[via]
    }
  }

  let changed = false
  for (let number = 0; number < size; number++) {
    let choices = domains[number]
    const bit = 1 << number
    while (choices) {
      const candidate = choices & -choices
      choices ^= candidate
      const reserved = reaches[owner[indexOfBit(candidate)]]
      if (reserved & bit) continue
      changed = true
      if (!explain) {
        domains[number] &= ~candidate
        continue
      }
      // This closed set of numbers has exactly as many candidate cells as
      // numbers. All of its cells are unavailable to outsiders.
      let cells = 0
      for (let rest = reserved; rest; rest &= rest - 1) cells |= domains[indexOfBit(rest & -rest)]
      domains[number] &= ~cells
      choices &= ~cells
      explain(number, reserved, cells)
    }
  }
  return changed
}
