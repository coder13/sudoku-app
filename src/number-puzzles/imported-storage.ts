import type { NumberGame, NumberPuzzleEntry } from './catalog.ts'

export function numberPuzzleImports<Entry extends NumberPuzzleEntry>(
  game: NumberGame,
  readToken: (value: unknown) => string | undefined,
  readEntry: (id: string) => Entry | undefined,
) {
  const key = `${game}.imports.v1`
  function readIds(): string[] {
    const raw = localStorage.getItem(key)
    let saved: unknown
    try { saved = raw && JSON.parse(raw) } catch { return [] }
    if (!Array.isArray(saved)) return []
    return [...new Set(saved.map(readToken).filter(id => id !== undefined))]
  }
  return {
    save(entry: Entry) {
      try {
        const ids = readIds()
        if (ids.includes(entry.id)) return 'existing'
        localStorage.setItem(key, JSON.stringify([...ids, entry.id]))
        return 'added'
      } catch {
        return 'unavailable'
      }
    },
    read(): Entry[] {
      try {
        return readIds().flatMap((id, index) => {
          const entry = readEntry(id)
          return entry ? [{ ...entry, number: index + 1 }] : []
        })
      } catch {
        return []
      }
    },
  }
}
