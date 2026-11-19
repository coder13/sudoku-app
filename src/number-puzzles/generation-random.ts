export type PickIndex = (count: number) => number

export function seededIndex(seed: number): PickIndex {
  let state = seed
  return count => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return Math.floor(state / 2 ** 32 * count)
  }
}

export function shuffled<T>(items: readonly T[], pick: PickIndex): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = pick(i + 1)
    const item = next[i]
    next[i] = next[j]
    next[j] = item
  }
  return next
}
