import type { SizedCornerKropkiRule } from './engine.ts'

export const cornerKropkiKinds = ['consecutive', 'ratioTwo'] as const
export type CornerKropkiKind = (typeof cornerKropkiKinds)[number]

/** An interior corner is indexed by the cell at its top left. */
export function isInteriorCorner(corner: number, size: number) {
  return Number.isInteger(corner) && corner >= 0 && corner < size * (size - 1) && corner % size !== size - 1
}

export function cornerPairs(corner: number, size: number) {
  return [[corner, corner + size + 1], [corner + 1, corner + size]] as const
}

export function cornerKropkiAllows(left: number, right: number, kind: CornerKropkiKind) {
  if (kind === 'consecutive') return Math.abs(left - right) === 1
  const low = Math.min(left, right)
  return low > 0 && Math.max(left, right) === 2 * low
}

export function validCornerKropki(rule: SizedCornerKropkiRule, size: number) {
  const valid = (marks: readonly number[] | undefined) => marks === undefined ||
    Array.isArray(marks) && marks.length <= (size - 1) ** 2 && new Set(marks).size === marks.length &&
    marks.every(corner => isInteriorCorner(corner, size))
  return Object.keys(rule).every(key => ['type', 'consecutive', 'ratioTwo'].includes(key)) &&
    valid(rule.consecutive) && valid(rule.ratioTwo) && Boolean(rule.consecutive?.length || rule.ratioTwo?.length)
}

const isPoint = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate))

/** Decode SudokuPad's authored corner dots without consuming unrelated overlays. */
export function readCornerKropki(overlays: readonly unknown[], size: number) {
  const consecutive: number[] = [], ratioTwo: number[] = []
  const unused: unknown[] = []
  for (const mark of overlays) {
    if (!mark || typeof mark !== 'object' || Array.isArray(mark)) {
      unused.push(mark)
      continue
    }
    const data = mark as Record<string, unknown>
    if (!isPoint(data.center) || !data.center.every(Number.isInteger)) {
      unused.push(mark)
      continue
    }
    const [row, column] = data.center
    const corner = (row - 1) * size + column - 1
    if (row < 1 || row >= size || column < 1 || column >= size || !isInteriorCorner(corner, size) ||
      Object.keys(data).some(key => !['center', 'width', 'height', 'stroke', 'angle', 'rounded', 'backgroundColor', 'borderColor', 'thickness'].includes(key)) ||
      data.rounded !== true || typeof data.width !== 'number' || data.width !== data.height || data.width <= 0 || data.width > .5 ||
      (data.stroke !== undefined && data.stroke !== 'none') || (data.angle !== undefined && data.angle !== 0) || typeof data.backgroundColor !== 'string') {
      throw new Error('This SudokuPad export has an invalid Quadruple Kropki dot.')
    }
    if (/^#(?:fff|ffffff|ffffffff)$/i.test(data.backgroundColor)) consecutive.push(corner)
    else if (/^#(?:000|000000|000000ff)$/i.test(data.backgroundColor)) ratioTwo.push(corner)
    else throw new Error('A Quadruple Kropki dot must be white or black.')
  }
  if (!consecutive.length && !ratioTwo.length) throw new Error('The Quadruple Kropki dots are missing.')
  const rule: SizedCornerKropkiRule = { type: 'corner-kropki',
    ...(consecutive.length > 0 && { consecutive }), ...(ratioTwo.length > 0 && { ratioTwo }),
  }
  return { rule, unused }
}
