import type { FutoshikiEntry } from './catalog.ts'
import { importedFutoshikiToken, readImportedFutoshiki } from './imported.ts'

const key = 'futoshiki.imports.v1'

function readIds(storage: Storage): string[] {
  const raw = storage.getItem(key)
  let saved: unknown
  try { saved = raw && JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(saved)) return []
  const ids = saved.map(importedFutoshikiToken).filter(id => id !== undefined)
  return [...new Set(ids)]
}

export function saveFutoshikiImport(entry: FutoshikiEntry) {
  try {
    const ids = readIds(localStorage)
    if (ids.includes(entry.id)) return 'existing'
    localStorage.setItem(key, JSON.stringify([...ids, entry.id]))
    return 'added'
  } catch {
    return 'unavailable'
  }
}

export function readFutoshikiImports(): FutoshikiEntry[] {
  try {
    return readIds(localStorage).flatMap((id, index) => {
      const entry = readImportedFutoshiki(id)
      return entry ? [{ ...entry, number: index + 1 }] : []
    })
  } catch {
    return []
  }
}
