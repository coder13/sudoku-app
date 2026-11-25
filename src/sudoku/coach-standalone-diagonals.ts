export type CoachStandaloneDiagonal = 'main' | 'anti'

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

const empty = (value: unknown) => value === undefined || value === null || value === '' ||
  (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)

/** Read Sudoku Coach's two all-different diagonal layers on a boxless Latin grid. */
export function readCoachStandaloneDiagonals(value: unknown, size: number): CoachStandaloneDiagonal[] {
  if (!Number.isInteger(size) || size < 3 || size > 9 || !Array.isArray(value) || value.length > 2) {
    throw new Error('This Sudoku Coach export has invalid diagonal rules.')
  }
  const result: CoachStandaloneDiagonal[] = []
  for (const layer of value) {
    if (!record(layer) || !['diagonalNegative', 'diagonalPositive'].includes(String(layer.type)) ||
      Object.keys(layer).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
      !Array.isArray(layer.segments) || layer.segments.length || !empty(layer.settings)) {
      throw new Error('This Sudoku Coach export has unsupported diagonal settings.')
    }
    const diagonal = layer.type === 'diagonalNegative' ? 'main' : 'anti'
    if (result.includes(diagonal)) throw new Error('This Sudoku Coach export repeats a diagonal rule.')
    result.push(diagonal)
  }
  return result
}
