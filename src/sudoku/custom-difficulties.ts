import { notifySettingsEdit } from './settings-events.ts'

export const CUSTOM_DIFFICULTIES_KEY = 'sudoku-app:v1:custom-difficulties'
export const CUSTOM_DIFFICULTY_NAME_LIMIT = 48

export type CustomDifficultyId = `difficulty-${string}`
export type CustomDifficultyProfile = {
  id: CustomDifficultyId
  name: string
  created: number
  allowed: readonly string[]
  required: readonly string[]
}

export function isCustomDifficultyId(value: unknown): value is CustomDifficultyId {
  return typeof value === 'string' && /^difficulty-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
}

function techniqueIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 128 && value.every(id => typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id))
}

export function readCustomDifficultyProfile(value: unknown): CustomDifficultyProfile | undefined {
  if (!value || typeof value !== 'object') return
  const { id, name, created, allowed, required } = value as Partial<CustomDifficultyProfile>
  if (!isCustomDifficultyId(id) || typeof name !== 'string' || !name.trim() || name.length > CUSTOM_DIFFICULTY_NAME_LIMIT ||
    typeof created !== 'number' || !Number.isSafeInteger(created) || created < 0 ||
    !techniqueIds(allowed) || !techniqueIds(required) || !required.length || !required.every(item => allowed.includes(item))) return
  return { id, name: name.trim(), created, allowed: [...new Set(allowed)], required: [...new Set(required)] }
}

export function readCustomDifficulties(storage?: Pick<Storage, 'getItem'>): CustomDifficultyProfile[] {
  try {
    const values: unknown = JSON.parse((storage ?? localStorage).getItem(CUSTOM_DIFFICULTIES_KEY) ?? '[]')
    if (!Array.isArray(values)) return []
    const profiles = new Map<CustomDifficultyId, CustomDifficultyProfile>()
    for (const value of values) {
      const profile = readCustomDifficultyProfile(value)
      if (profile) profiles.set(profile.id, profile)
    }
    return [...profiles.values()].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))
  } catch { return [] }
}

export function saveCustomDifficulty(profile: CustomDifficultyProfile, storage: Storage = localStorage) {
  const next = [...readCustomDifficulties(storage).filter(item => item.id !== profile.id), profile]
  storage.setItem(CUSTOM_DIFFICULTIES_KEY, JSON.stringify(next))
  notifySettingsEdit()
}

export function deleteCustomDifficulty(id: CustomDifficultyId, storage: Storage = localStorage) {
  storage.setItem(CUSTOM_DIFFICULTIES_KEY, JSON.stringify(readCustomDifficulties(storage).filter(item => item.id !== id)))
  notifySettingsEdit()
}
