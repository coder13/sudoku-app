import { VARIANTS, type PlayableVariant } from './variants.ts'

export const coreSudokuModes = ['classic', 'diagonal', 'windoku', 'killer-cages', 'jigsaw'] as const
export const coreModeLimit = 9
export const customDifficulties = ['easy', 'medium', 'hard'] as const
export type CustomDifficulty = typeof customDifficulties[number]

const additionalRules = {
  'diagonal-main': { name: 'Main diagonal', rule: 'The diagonal from the top left must contain each digit once.' },
  'diagonal-anti': { name: 'Anti-diagonal', rule: 'The diagonal from the top right must contain each digit once.' },
  'kropki-white': { name: 'White Kropki dots', rule: 'Digits separated by a white dot are consecutive.' },
  'kropki-black': { name: 'Black Kropki dots', rule: 'Across a black dot, one digit is double the other.' },
  'xv-five': { name: 'V marks', rule: 'Digits joined by a V add to 5.' },
  'xv-ten': { name: 'X marks', rule: 'Digits joined by an X add to 10.' },
  'dutch-whispers': { name: 'Dutch Whispers', rule: 'Neighboring digits along the line differ by at least 4.' },
} as const

export type CustomRule = PlayableVariant | keyof typeof additionalRules
export const markerOptions = {
  'kropki-white': { family: 'kropki', label: 'No consecutive digits without a Kropki dot' },
  'kropki-black': { family: 'kropki', label: 'No doubling without a Kropki dot' },
  'xv-five': { family: 'xv', label: 'No sum of 5 without a V or X' },
  'xv-ten': { family: 'xv', label: 'No sum of 10 without a V or X' },
} as const
export type MarkerRule = keyof typeof markerOptions

export function selectedMarkerRules(rules: readonly CustomRule[]): MarkerRule[] {
  return (Object.keys(markerOptions) as MarkerRule[]).filter(rule =>
    rules.includes(rule) || rules.includes(markerOptions[rule].family))
}

export type CustomModeDefinition = {
  name: string
  rules: readonly CustomRule[]
  negativeMarkers?: readonly MarkerRule[]
}

export type SudokuMode = CustomModeDefinition & { id: string; pinned: boolean }

const { classic: _classic, ...variantRules } = VARIANTS
export const customRules: Record<CustomRule, { name: string; rule: string }> = {
  ...variantRules, ...additionalRules,
  diagonal: { ...VARIANTS.diagonal, name: 'Both diagonals' },
  whispers: { name: 'German Whispers', rule: 'Neighboring digits along the line differ by at least 5.' },
}
export const customRuleIds = Object.keys(customRules) as CustomRule[]

const storageKey = 'sudoku.custom-modes.v1'
const modePattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
export const isSudokuModeId = (value: unknown): value is string => typeof value === 'string' && modePattern.test(value)
export const isCustomRule = (value: unknown): value is CustomRule => typeof value === 'string' && Object.hasOwn(customRules, value)

export function readCustomModeDefinition(value: unknown): CustomModeDefinition | undefined {
  if (!value || typeof value !== 'object') return
  const { name, rules, negativeMarkers } = value as { name?: unknown; rules?: unknown; negativeMarkers?: unknown }
  if (typeof name !== 'string' || !name.trim() || name.length > 48 || !Array.isArray(rules) ||
      !rules.length || !rules.every(isCustomRule)) return
  if (negativeMarkers !== undefined && (!Array.isArray(negativeMarkers) ||
      negativeMarkers.some(marker => typeof marker !== 'string' || !Object.hasOwn(markerOptions, marker)))) return
  const selected = Array.isArray(negativeMarkers) ? selectedMarkerRules(rules).filter(marker => negativeMarkers.includes(marker)) : []
  return { name: name.trim(), rules: [...new Set<CustomRule>(rules)], ...(selected.length && { negativeMarkers: selected }) }
}

export function readSudokuModes(storage?: Pick<Storage, 'getItem'>): SudokuMode[] {
  try {
    const values: unknown = JSON.parse((storage ?? localStorage).getItem(storageKey) ?? '[]')
    if (!Array.isArray(values)) return []
    const modes: SudokuMode[] = []
    let pins = 0
    for (const item of values) {
      const mode = readCustomModeDefinition(item)
      if (!mode || !isSudokuModeId(item.id) || modes.some(saved => saved.id === item.id)) continue
      const pinned = item.pinned === true && pins < coreModeLimit - coreSudokuModes.length
      if (pinned) pins++
      modes.push({ id: item.id, ...mode, pinned })
    }
    return modes
  } catch { return [] }
}

export function writeSudokuModes(modes: readonly SudokuMode[], storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(storageKey, JSON.stringify(modes))
}
