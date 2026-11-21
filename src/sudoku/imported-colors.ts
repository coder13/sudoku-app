const COACH_CELL_COLORS = {
  white: '#ffffff', grey: '#e2e2e2', lime: '#def7c5', blue: '#c5e4f7', purple: '#d1c5f7',
  red: '#f7c5c5', green: '#c5f7d3', yellow: '#f7f7c5', orange: '#f7e4c5',
  cyan: '#c5f7f5', magenta: '#f7c5f5', error: '#7f1717',
  whiteHeavy: '#ffffff', greyHeavy: '#c1c1c1', limeHeavy: '#ccf7a1', blueHeavy: '#a1d5f7',
  purpleHeavy: '#b8a1f7', redHeavy: '#f7a1a1', greenHeavy: '#a1f7b9', yellowHeavy: '#f7f7a1',
  orangeHeavy: '#f7d5a1', cyanHeavy: '#a1f7f0', magentaHeavy: '#f7a1f7',
} as const
type CoachCellColor = keyof typeof COACH_CELL_COLORS
export type ImportedCellColors = Partial<Record<number, readonly string[]>>
export type CandidateColors<Shade> = Record<number, Record<number, Shade>>

export function sameCandidateColors<Shade>(a?: CandidateColors<Shade>, b?: CandidateColors<Shade>): boolean {
  if (a === b) return true
  const cells = Object.entries(a ?? {})
  return cells.length === Object.keys(b ?? {}).length && cells.every(([cell, marks]) => {
    const other = b?.[Number(cell)]
    if (!other) return false
    const digits = Object.entries(marks)
    return digits.length === Object.keys(other).length && digits.every(([digit, shade]) => shade === other[Number(digit)])
  })
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export function isImportedColor(value: unknown): value is string {
  return typeof value === 'string' && (Object.hasOwn(COACH_CELL_COLORS, value) || HEX_COLOR.test(value))
}

export function validImportedCellColors(value: unknown): value is ImportedCellColors {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([cell, shades]) => /^(?:[0-9]|[1-7][0-9]|80)$/.test(cell) &&
      Array.isArray(shades) && shades.length > 0 && shades.length <= 62 &&
      shades.every(isImportedColor) && new Set(shades).size === shades.length))
}

export function sameImportedCellColors(a?: ImportedCellColors, b?: ImportedCellColors): boolean {
  if (a === b) return true
  const cells = Object.keys(a ?? {})
  return cells.length === Object.keys(b ?? {}).length && cells.every(key => {
    const left = a?.[Number(key)], right = b?.[Number(key)]
    return left?.length === right?.length && left?.every((shade, index) => shade === right?.[index])
  })
}

export function importedColorValue(shade: string): string {
  if (Object.hasOwn(COACH_CELL_COLORS, shade)) return COACH_CELL_COLORS[shade as CoachCellColor]
  return HEX_COLOR.test(shade) ? shade : '#ffffff'
}

export function importedColorFill(shade: string): string {
  const raw = importedColorValue(shade)
  return shade === 'error' || HEX_COLOR.test(shade) ? `color-mix(in srgb, ${raw} 34%, white)` : raw
}

export function importedColorLabel(shade: string): string {
  if (shade.endsWith('Heavy')) return `deep ${shade.slice(0, -5)}`
  return shade === 'error' ? 'dark red' : shade
}
