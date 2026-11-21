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

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export function isImportedCellColor(value: unknown): value is string {
  return typeof value === 'string' && (Object.hasOwn(COACH_CELL_COLORS, value) || HEX_COLOR.test(value))
}

export function validImportedCellColors(value: unknown): value is ImportedCellColors {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([cell, shades]) => /^(?:[0-9]|[1-7][0-9]|80)$/.test(cell) &&
      Array.isArray(shades) && shades.length > 0 && shades.length <= 62 &&
      shades.every(isImportedCellColor) && new Set(shades).size === shades.length))
}

export function sameImportedCellColors(a?: ImportedCellColors, b?: ImportedCellColors): boolean {
  if (a === b) return true
  const cells = Object.keys(a ?? {})
  return cells.length === Object.keys(b ?? {}).length && cells.every(key => {
    const left = a?.[Number(key)], right = b?.[Number(key)]
    return left?.length === right?.length && left?.every((shade, index) => shade === right?.[index])
  })
}

export function importedCellColorFill(shade: string): string {
  if (Object.hasOwn(COACH_CELL_COLORS, shade) && shade !== 'error') return COACH_CELL_COLORS[shade as CoachCellColor]
  const raw = shade === 'error' ? COACH_CELL_COLORS.error : HEX_COLOR.test(shade) ? shade : '#ffffff'
  return `color-mix(in srgb, ${raw} 34%, white)`
}

export function importedCellColorLabel(shade: string): string {
  if (shade.endsWith('Heavy')) return `deep ${shade.slice(0, -5)}`
  return shade === 'error' ? 'dark red' : shade
}
