import { MAX_IMPORT_LENGTH, record } from './shared.ts'

export async function fetchPublishedExport(source: 'sudoku-coach' | 'sudokupad', path: string) {
  const response = await fetch(`/api/v1/import/${source}/${path}`, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}))
    throw new Error(typeof error === 'string' ? error : 'Could not open this published puzzle.')
  }
  const data: unknown = await response.json()
  const { code, coach } = record(data) ? data : {}
  if (typeof code !== 'string' || code.length > MAX_IMPORT_LENGTH) throw new Error('This link does not contain a supported puzzle export.')
  return { code, coach }
}
