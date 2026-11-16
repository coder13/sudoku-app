import type { EngineRequest } from './engine.ts'

const KEY = 'sudoku-app:v1:disabled-hint-techniques'

function isTechniqueList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string' && id.length > 0)
    && new Set(value).size === value.length
}

export function readDisabledHintTechniques(storage?: Pick<Storage, 'getItem'>): string[] {
  try {
    const ids: unknown = JSON.parse((storage ?? localStorage).getItem(KEY) ?? 'null')
    return isTechniqueList(ids) ? ids : []
  } catch {
    return []
  }
}

export function saveDisabledHintTechniques(ids: readonly string[], storage?: Pick<Storage, 'setItem'>): boolean {
  if (!isTechniqueList(ids)) return false
  try {
    const target = storage ?? localStorage
    target.setItem(KEY, JSON.stringify(ids))
    return true
  } catch {
    return false
  }
}

export function withHintPreferences(request: EngineRequest, storage?: Pick<Storage, 'getItem'>): EngineRequest {
  if (request.type !== 'hints' && request.type !== 'next-deduction') return request
  return { ...request, disabledTechniques: request.disabledTechniques ?? readDisabledHintTechniques(storage) }
}
