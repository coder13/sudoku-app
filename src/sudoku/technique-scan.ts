import { createCountWorker } from './engine.ts'

const MAX_CACHED_POSITIONS = 24
type TechniqueCounts = Readonly<Record<string, { count: number }>>
const emptyCounts: TechniqueCounts = {}
const cachedCounts = new Map<string, TechniqueCounts>()
type Scan = { observers: number; pending: Map<string, Promise<number>>; worker: ReturnType<typeof createCountWorker> }
const scans = new Map<string, Scan>()

export function techniqueScanKey(values: string, eliminations?: readonly number[]) {
  return `${values}:${eliminations?.join(',') ?? ''}`
}

export function cachedTechniqueCounts(key: string): TechniqueCounts {
  return cachedCounts.get(key) ?? emptyCounts
}

export function watchTechniqueScan(values: string, eliminations?: readonly number[]) {
  const key = techniqueScanKey(values, eliminations)
  const scan = scans.get(key) ?? { observers: 0, pending: new Map<string, Promise<number>>(), worker: createCountWorker(values, eliminations) }
  scans.set(key, scan)
  scan.observers++
  let closed = false

  function count(technique: string): Promise<number> {
    if (closed) return Promise.reject(new DOMException('Technique scan closed.', 'AbortError'))
    const cached = cachedTechniqueCounts(key)[technique]
    if (cached) return Promise.resolve(cached.count)
    const pending = scan.pending.get(technique)
    if (pending) return pending
    const request = scan.worker.count(technique).then(count => {
      const counts = { ...cachedTechniqueCounts(key), [technique]: { count } }
      cachedCounts.delete(key)
      cachedCounts.set(key, counts)
      if (cachedCounts.size > MAX_CACHED_POSITIONS) {
        const oldest = cachedCounts.keys().next().value
        if (oldest !== undefined) cachedCounts.delete(oldest)
      }
      return count
    }).finally(() => scan.pending.delete(technique))
    scan.pending.set(technique, request)
    return request
  }

  function close() {
    if (closed) return
    closed = true
    if (--scan.observers === 0) {
      scans.delete(key)
      scan.worker.close()
    }
  }
  return { count, close }
}
