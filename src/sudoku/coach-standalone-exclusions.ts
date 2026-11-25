export type CoachStandaloneExclusion = 'anti-knight' | 'anti-king' | 'nonconsecutive'

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

const empty = (value: unknown) => value === undefined || value === null || value === '' ||
  (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)

/** Read Sudoku Coach's Anti-Knight and Anti-King marker layers. */
export function readCoachStandaloneExclusions(value: unknown, size: number): CoachStandaloneExclusion[] {
  if (!Number.isInteger(size) || size < 3 || size > 9 || !Array.isArray(value) || value.length > 3) {
    throw new Error('This Sudoku Coach export has invalid anti-move rules.')
  }
  const result: CoachStandaloneExclusion[] = []
  for (const layer of value) {
    if (!record(layer) || !['antiKnight', 'antiKing', 'nonconsecutive'].includes(String(layer.type)) ||
      Object.keys(layer).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
      !Array.isArray(layer.segments) || layer.segments.length || !empty(layer.settings)) {
      throw new Error('This Sudoku Coach export has unsupported anti-move settings.')
    }
    const rule = layer.type === 'antiKnight' ? 'anti-knight' : layer.type === 'antiKing' ? 'anti-king' : 'nonconsecutive'
    if (result.includes(rule)) throw new Error('This Sudoku Coach export repeats an anti-move rule.')
    result.push(rule)
  }
  return result
}
