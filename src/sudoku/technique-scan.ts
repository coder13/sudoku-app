import { runEngine, type VariantPosition, type VariantPuzzle } from './engine.ts'

const MAX_CACHED_POSITIONS = 24
type TechniqueCounts = Readonly<Record<string, { count: number }>>
const emptyCounts: TechniqueCounts = {}
const cachedCounts = new Map<string, TechniqueCounts>()
const pendingCounts = new Map<string, Promise<number>>()

export function techniqueScanKey(values: string, eliminations?: readonly number[], puzzle?: VariantPuzzle) {
  return `${values}:${eliminations?.join(',') ?? ''}:${puzzle ? JSON.stringify(puzzle) : 'classic'}`
}

export function cachedTechniqueCounts(key: string): TechniqueCounts {
  return cachedCounts.get(key) ?? emptyCounts
}

export function scanTechnique(values: string, eliminations: readonly number[] | undefined, technique: string, position?: VariantPosition) {
  const key = techniqueScanKey(values, eliminations, position?.puzzle)
  const cached = cachedTechniqueCounts(key)[technique]
  if (cached) return Promise.resolve(cached.count)

  const pendingKey = `${key}:${technique}`
  const pending = pendingCounts.get(pendingKey)
  if (pending) return pending

  const scan = position ? runEngine({ type: 'variant', operation: 'hints',
    position: { ...position, eliminations }, techniqueOrder: [technique], limit: 0xffff_ffff,
  }, { background: true }).then((hints) => new Set(hints.flatMap(({ actions }) => actions.map((action) => {
    const { cell, digit } = 'place' in action ? action.place : action.eliminate
    return `${'place' in action ? 'p' : 'e'}:${cell}:${digit}`
  }))).size) : runEngine({ type: 'technique-count', values, eliminations, technique })
  const request = scan.then((count) => {
    const counts = { ...cachedTechniqueCounts(key), [technique]: { count } }
    cachedCounts.delete(key)
    cachedCounts.set(key, counts)
    if (cachedCounts.size > MAX_CACHED_POSITIONS) {
      const oldest = cachedCounts.keys().next().value
      if (oldest !== undefined) cachedCounts.delete(oldest)
    }
    return count
  }).finally(() => pendingCounts.delete(pendingKey))
  pendingCounts.set(pendingKey, request)
  return request
}
