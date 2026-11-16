export const THEME_IDS = [
  'violet', 'ocean', 'forest', 'rose-pine', 'catppuccin', 'solarized',
  'nord', 'ayu', 'github', 'one', 'tokyo-night', 'gruvbox', 'high-contrast', 'andoku',
] as const

export type ThemeId = typeof THEME_IDS[number]
export type ResolvedColorMode = 'light' | 'dark'
export const DEFAULT_DARK_THEME: ThemeId = 'github'

type ThemeAccents = {
  accent: string
  selectionBorder: string
  secondaryAccent: string
}

const colorModes = {
  light: {
    pageBg: '#f2f2f2',
    ink: '#171717',
    muted: '#575757',
    candidateInk: '#383838',
    surface: '#ffffff',
    surfaceRaised: '#f9f9f9',
    surfaceSoft: '#fafafa',
    surfaceMuted: '#ebebeb',
    surfaceHover: '#eeeeee',
    surfaceHoverStrong: '#dddddd',
    surfaceActive: '#e6e6e6',
    border: '#d7d7d7',
    borderStrong: '#949494',
    boardBg: '#ffffff',
    givenBg: '#f3f3f3',
    gridLine: '#b7b7b7',
    gridStrong: '#525252',
    peerBg: '#e0e0e0',
    keyBg: '#f7f7f7',
    keyBorder: '#c2c2c2',
    dangerBg: '#fee9ed',
    dangerInk: '#9c2540',
  },
  dark: {
    pageBg: '#101010',
    ink: '#f0f0f0',
    muted: '#b5b5b5',
    candidateInk: '#e0e0e0',
    surface: '#1c1c1c',
    surfaceRaised: '#262626',
    surfaceSoft: '#232323',
    surfaceMuted: '#151515',
    surfaceHover: '#2b2b2b',
    surfaceHoverStrong: '#383838',
    surfaceActive: '#414141',
    border: '#3e3e3e',
    borderStrong: '#777777',
    boardBg: '#171717',
    givenBg: '#242424',
    gridLine: '#545454',
    gridStrong: '#969696',
    peerBg: '#363636',
    keyBg: '#252525',
    keyBorder: '#545454',
    dangerBg: '#482631',
    dangerInk: '#ffb1bf',
  },
}

type ThemeDefinition = {
  id: ThemeId
  name: string
  category: 'Sudoku' | 'Curated' | 'IDE' | 'Accessibility'
  light: ThemeAccents
  dark: ThemeAccents
}

function rgb(hex: string) {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16))
}

function hex(values: number[]) {
  return `#${values.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`
}

export function mix(first: string, second: string, secondAmount: number) {
  const a = rgb(first)
  const b = rgb(second)
  return hex(a.map((value, index) => value * (1 - secondAmount) + b[index] * secondAmount))
}

function luminance(color: string) {
  const channels = rgb(color).map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

export function contrast(first: string, second: string) {
  const light = Math.max(luminance(first), luminance(second))
  const dark = Math.min(luminance(first), luminance(second))
  return (light + 0.05) / (dark + 0.05)
}

function contrastingAccent(accent: string, fallback: string, against: string[], minimum = 4.5, increment = 0.1) {
  for (let amount = 0; amount < 1; amount += increment) {
    const color = mix(accent, fallback, amount)
    if (against.every((other) => contrast(color, other) >= minimum)) return color
  }
  return fallback
}

function buildTokens(mode: ResolvedColorMode, { accent, selectionBorder, secondaryAccent }: ThemeAccents) {
  const base = colorModes[mode]
  const { boardBg, ink } = base
  const lightMode = mode === 'light'
  const highlight = (color: string, lightAmount: number, darkContrast: number) => lightMode
    ? mix(boardBg, color, lightAmount)
    : contrastingAccent(boardBg, color, [boardBg], darkContrast, 0.02)
  const primaryInk = '#ffffff'
  const primaryBg = contrastingAccent(accent, '#000000', [primaryInk], 5)
  const matchingBg = highlight(accent, 0.32, 2.2)
  const selectedBg = highlight(accent, 0.48, 2.85)
  const candidateCountBg = highlight(secondaryAccent, 0.35, 2.4)
  const cellBackgrounds = [base.givenBg, base.peerBg, matchingBg, selectedBg, candidateCountBg]
  const accentInk = contrastingAccent(accent, ink, [base.pageBg, base.surfaceHoverStrong, ...cellBackgrounds])
  const selectedBorder = contrastingAccent(selectionBorder, ink, [selectedBg], 3)

  return {
    ...base,
    purple: accent,
    secondaryAccent,
    primaryBg,
    primaryHover: mix(primaryBg, '#000000', 0.15),
    primaryInk,
    darkPurple: accentInk,
    focus: selectionBorder,
    controlInk: ink,
    boardOutline: base.gridStrong,
    boardBoxBg: boardBg,
    boardInk: ink,
    entryInk: accentInk,
    matchingBg,
    matchingDigitBg: matchingBg,
    candidateCountBg,
    selectedBg,
    selectedBorder,
    boardSelectedBg: selectedBg,
    boardSelectedBorder: selectedBorder,
    keyInk: ink,
    centerNoteBg: boardBg,
  }
}

export type ThemeTokens = ReturnType<typeof buildTokens>

const andokuOption = { id: 'andoku', name: 'Andoku', category: 'Sudoku' } as const
const andokuTokens: ThemeTokens = {
  pageBg: '#424242',
  ink: '#f5f5f5',
  muted: '#c7c7c7',
  candidateInk: '#343434',
  surface: '#474747',
  surfaceRaised: '#515151',
  surfaceSoft: '#454545',
  surfaceMuted: '#383838',
  surfaceHover: '#555555',
  surfaceHoverStrong: '#595959',
  surfaceActive: '#50556f',
  border: '#606060',
  borderStrong: '#8b8b8b',
  boardBg: '#fafafa',
  boardBoxBg: '#eeeeee',
  givenBg: '#fafafa',
  gridLine: '#9a9a9a',
  gridStrong: '#424242',
  boardOutline: '#424242',
  boardInk: '#111111',
  entryInk: '#28351b',
  peerBg: '#dedede',
  matchingBg: '#e6ca4f',
  matchingDigitBg: '#ffda32',
  candidateCountBg: '#d7ddad',
  boardSelectedBg: '#ffda32',
  boardSelectedBorder: '#695100',
  centerNoteBg: '#fafafa',
  keyBg: '#424242',
  keyBorder: '#606060',
  keyInk: '#f5f5f5',
  purple: '#a3afff',
  secondaryAccent: '#ffda32',
  primaryBg: '#4052b6',
  primaryHover: '#3547a6',
  primaryInk: '#ffffff',
  darkPurple: '#d0d6ff',
  focus: '#b6c0ff',
  controlInk: '#f5f5f5',
  selectedBg: '#494f71',
  selectedBorder: '#a3afff',
  dangerBg: '#f8d9d9',
  dangerInk: '#81283b',
}

const definitions: ThemeDefinition[] = [
  {
    id: 'violet', name: 'Violet', category: 'Sudoku',
    light: { accent: '#5b3dba', selectionBorder: '#6f49c2', secondaryAccent: '#78583d' },
    dark: { accent: '#8f70dd', selectionBorder: '#bc9cf4', secondaryAccent: '#efc27f' },
  },
  {
    id: 'ocean', name: 'Ocean', category: 'Sudoku',
    light: { accent: '#1967b3', selectionBorder: '#2774b7', secondaryAccent: '#7b542f' },
    dark: { accent: '#4f8fd2', selectionBorder: '#83b9ed', secondaryAccent: '#efbd76' },
  },
  {
    id: 'forest', name: 'Forest', category: 'Sudoku',
    light: { accent: '#28755a', selectionBorder: '#367d60', secondaryAccent: '#76552f' },
    dark: { accent: '#4c9b77', selectionBorder: '#83cba7', secondaryAccent: '#edbe77' },
  },
  {
    id: 'rose-pine', name: 'Rosé Pine', category: 'Curated',
    light: { accent: '#907aa9', selectionBorder: '#725d8b', secondaryAccent: '#9a5b42' },
    dark: { accent: '#c4a7e7', selectionBorder: '#c4a7e7', secondaryAccent: '#f6c177' },
  },
  {
    id: 'catppuccin', name: 'Catppuccin', category: 'Curated',
    light: { accent: '#8839ef', selectionBorder: '#7c2bd6', secondaryAccent: '#8c4d20' },
    dark: { accent: '#cba6f7', selectionBorder: '#cba6f7', secondaryAccent: '#fab387' },
  },
  {
    id: 'solarized', name: 'Solarized', category: 'IDE',
    light: { accent: '#6c71c4', selectionBorder: '#5b60ad', secondaryAccent: '#9a5d00' },
    dark: { accent: '#6c71c4', selectionBorder: '#7f87da', secondaryAccent: '#d99b25' },
  },
  {
    id: 'nord', name: 'Nord', category: 'IDE',
    light: { accent: '#5e81ac', selectionBorder: '#4f719d', secondaryAccent: '#8b5e22' },
    dark: { accent: '#5e81ac', selectionBorder: '#88c0d0', secondaryAccent: '#ebcb8b' },
  },
  {
    id: 'ayu', name: 'Ayu', category: 'IDE',
    light: { accent: '#b35c00', selectionBorder: '#a95200', secondaryAccent: '#8a4b08' },
    dark: { accent: '#e6b450', selectionBorder: '#e6b450', secondaryAccent: '#ffb454' },
  },
  {
    id: 'github', name: 'GitHub', category: 'IDE',
    light: { accent: '#0969da', selectionBorder: '#0969da', secondaryAccent: '#8a4b08' },
    dark: { accent: '#2f81f7', selectionBorder: '#58a6ff', secondaryAccent: '#e3b341' },
  },
  {
    id: 'one', name: 'One', category: 'IDE',
    light: { accent: '#a626a4', selectionBorder: '#982397', secondaryAccent: '#986801' },
    dark: { accent: '#c678dd', selectionBorder: '#d08ee3', secondaryAccent: '#e5c07b' },
  },
  {
    id: 'tokyo-night', name: 'Tokyo Night', category: 'IDE',
    light: { accent: '#2e7de9', selectionBorder: '#256ed1', secondaryAccent: '#8b5500' },
    dark: { accent: '#7aa2f7', selectionBorder: '#8fb5ff', secondaryAccent: '#e0af68' },
  },
  {
    id: 'gruvbox', name: 'Gruvbox', category: 'IDE',
    light: { accent: '#8f3f71', selectionBorder: '#8f3f71', secondaryAccent: '#9d4f00' },
    dark: { accent: '#d3869b', selectionBorder: '#e39caf', secondaryAccent: '#fabd2f' },
  },
  {
    id: 'high-contrast', name: 'High contrast', category: 'Accessibility',
    light: { accent: '#0047cc', selectionBorder: '#003fae', secondaryAccent: '#6b3e00' },
    dark: { accent: '#70a7ff', selectionBorder: '#8db9ff', secondaryAccent: '#ffd27a' },
  },
]

export const THEME_OPTIONS = [...definitions.map(({ id, name, category }) => ({ id, name, category })), andokuOption]
export const THEME_IDS_SET = new Set<ThemeId>(THEME_IDS)

export const THEME_TOKENS = Object.fromEntries([
  ...definitions.map((theme) => [theme.id, { light: buildTokens('light', theme.light), dark: buildTokens('dark', theme.dark) }] as const),
  [andokuOption.id, { light: andokuTokens, dark: andokuTokens }],
]) as Record<ThemeId, Record<ResolvedColorMode, ThemeTokens>>

export function themeVariables(theme: ThemeId, mode: ResolvedColorMode) {
  return Object.fromEntries(Object.entries(THEME_TOKENS[theme][mode]).map(([name, value]) => [
    `--${name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}`, value,
  ]))
}

export function applyTheme(root: HTMLElement, theme: ThemeId, mode: ResolvedColorMode) {
  Object.entries(themeVariables(theme, mode)).forEach(([name, value]) => root.style.setProperty(name, value))
}

export function themePreview(theme: ThemeId, mode: ResolvedColorMode) {
  const tokens = THEME_TOKENS[theme][mode]
  return { background: tokens.surface, border: tokens.borderStrong, colors: [tokens.purple, tokens.secondaryAccent] }
}
