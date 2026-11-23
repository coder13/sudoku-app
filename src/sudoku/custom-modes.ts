import { VARIANTS, type PlayableVariant } from './variants.ts'
import { DIFFICULTY_LEVELS, type CurrentDifficulty } from './difficulty.ts'
import { notifySettingsEdit } from './settings-events.ts'

export const coreSudokuModes = ['classic', 'diagonal', 'windoku', 'killer-cages', 'jigsaw'] as const
const customDifficulties = ['easy', 'medium', 'hard'] as const
const jigsawDifficulties = ['easy', 'medium', 'tricky'] as const
export type CustomDifficulty = CurrentDifficulty

export function isCustomDifficulty(value: unknown): value is CustomDifficulty {
  return typeof value === 'string' && (DIFFICULTY_LEVELS as readonly string[]).includes(value)
}

export function customModeDifficulties(rules: readonly CustomRule[]): readonly CustomDifficulty[] {
  if (rules.length > 1) return DIFFICULTY_LEVELS
  return rules[0] === 'jigsaw' ? jigsawDifficulties : customDifficulties
}

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

export type SudokuMode = CustomModeDefinition & { id: string }

const { classic: _classic, ...variantRules } = VARIANTS
export const customRules: Record<CustomRule, { name: string; rule: string }> = {
  ...variantRules, ...additionalRules,
  diagonal: { ...VARIANTS.diagonal, name: 'Both diagonals' },
  whispers: { name: 'German Whispers', rule: 'Neighboring digits along the line differ by at least 5.' },
}
export const customRuleIds = Object.keys(customRules) as CustomRule[]

export const CUSTOM_MODES_KEY = 'sudoku-app:v1:custom-modes'
// Keep reading existing local-only saves after moving modes into the settings namespace.
const legacyStorageKey = 'sudoku.custom-modes.v1'
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
    const target = storage ?? localStorage
    const values: unknown = JSON.parse(target.getItem(CUSTOM_MODES_KEY) ?? target.getItem(legacyStorageKey) ?? '[]')
    if (!Array.isArray(values)) return []
    const modes: SudokuMode[] = []
    for (const item of values) {
      const mode = readCustomModeDefinition(item)
      if (!mode || !isSudokuModeId(item.id) || modes.some(saved => saved.id === item.id)) continue
      modes.push({ id: item.id, ...mode })
    }
    return modes
  } catch { return [] }
}

export function writeSudokuModes(modes: readonly SudokuMode[], storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(CUSTOM_MODES_KEY, JSON.stringify(modes))
  notifySettingsEdit()
}
