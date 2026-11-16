import type { EngineRequest } from './engine.ts'

const KEY = 'sudoku-app:v1:solver-profile'

function isTechniqueOrder(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(id => typeof id === 'string' && id.length > 0)
    && new Set(value).size === value.length
}

export function readSolverProfile(storage?: Pick<Storage, 'getItem'>): string[] | undefined {
  try {
    const order: unknown = JSON.parse((storage ?? localStorage).getItem(KEY) ?? 'null')
    return isTechniqueOrder(order) ? order : undefined
  } catch {
    return undefined
  }
}

export function saveSolverProfile(order: readonly string[], storage?: Pick<Storage, 'setItem'>) {
  if (!isTechniqueOrder(order)) return false
  try {
    const target = storage ?? localStorage
    target.setItem(KEY, JSON.stringify(order))
    return true
  } catch {
    return false
  }
}

export function withSolverProfile<T extends EngineRequest>(request: T): T {
  switch (request.type) {
    case 'rate':
    case 'logical-solve':
    case 'logical-solve-with-rank':
    case 'compare-solve-paths':
    case 'alternate-solve-path':
    case 'practice-position':
    case 'deductions':
    case 'generate-constrained':
    case 'generate-from-pool':
      return { ...request, techniqueOrder: request.techniqueOrder ?? readSolverProfile() }
    case 'generate-targeted':
      return request.target.type === 'difficulty'
        ? { ...request, target: { ...request.target, techniqueOrder: request.target.techniqueOrder ?? readSolverProfile() } }
        : request
    case 'generation-start':
      return { ...request, request: withSolverProfile(request.request) }
    default:
      return request
  }
}
