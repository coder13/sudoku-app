export const THEME_IDS = [
  'violet', 'ocean', 'forest', 'rose-pine', 'catppuccin', 'solarized',
  'nord', 'ayu', 'github', 'one', 'tokyo-night', 'gruvbox', 'high-contrast',
] as const

export type ThemeId = typeof THEME_IDS[number]
export type ResolvedColorMode = 'light' | 'dark'
export const DEFAULT_DARK_THEME: ThemeId = 'github'

type ThemeSeed = {
  canvas: string
  surface: string
  raised: string
  sunken: string
  text: string
  muted: string
  accent: string
  accentHover: string
  border: string
  borderStrong: string
  board: string
  gridStrong: string
  selection: string
  selectionBorder: string
  key: string
  keyBorder: string
  note: string
  dangerBg: string
  dangerText: string
}

export type ThemeTokens = Record<
  | 'pageBg' | 'ink' | 'muted' | 'purple' | 'primaryHover' | 'primaryInk' | 'darkPurple'
  | 'surface' | 'surfaceRaised' | 'surfaceSoft' | 'surfaceMuted' | 'surfaceHover'
  | 'surfaceHoverStrong' | 'surfaceActive' | 'border' | 'borderStrong' | 'lavender'
  | 'focus' | 'controlInk' | 'boardBg' | 'givenBg' | 'gridLine' | 'gridStrong'
  | 'boardOutline' | 'peerBg' | 'matchingBg' | 'selectedBg' | 'selectedBorder'
  | 'keyBg' | 'keyBorder' | 'keyInk' | 'noteInk' | 'centerNoteBg' | 'dangerBg'
  | 'dangerInk',
  string
>

type ThemeDefinition = {
  id: ThemeId
  name: string
  category: 'Sudoku' | 'Curated' | 'IDE' | 'Accessibility'
  light: ThemeSeed
  dark: ThemeSeed
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

function readableInk(background: string) {
  return contrast('#ffffff', background) >= contrast('#000000', background) ? '#ffffff' : '#000000'
}

function buildTokens(seed: ThemeSeed): ThemeTokens {
  return {
    pageBg: seed.canvas,
    ink: seed.text,
    muted: seed.muted,
    purple: seed.accent,
    primaryHover: seed.accentHover,
    primaryInk: readableInk(seed.accent),
    darkPurple: contrast(seed.accent, seed.surface) >= 4.5 ? seed.accent : seed.text,
    surface: seed.surface,
    surfaceRaised: seed.raised,
    surfaceSoft: mix(seed.surface, seed.canvas, 0.32),
    surfaceMuted: seed.sunken,
    surfaceHover: mix(seed.surface, seed.accent, 0.11),
    surfaceHoverStrong: mix(seed.surface, seed.accent, 0.24),
    surfaceActive: mix(seed.surface, seed.accent, 0.18),
    border: seed.border,
    borderStrong: seed.borderStrong,
    lavender: mix(seed.surface, seed.accent, 0.12),
    focus: seed.selectionBorder,
    controlInk: seed.text,
    boardBg: seed.board,
    givenBg: mix(seed.board, seed.text, 0.07),
    gridLine: seed.borderStrong,
    gridStrong: seed.gridStrong,
    boardOutline: seed.gridStrong,
    peerBg: mix(seed.board, seed.selection, 0.25),
    matchingBg: mix(seed.board, seed.selection, 0.52),
    selectedBg: seed.selection,
    selectedBorder: seed.selectionBorder,
    keyBg: seed.key,
    keyBorder: seed.keyBorder,
    keyInk: seed.text,
    noteInk: seed.note,
    centerNoteBg: mix(seed.board, seed.surface, 0.58),
    dangerBg: seed.dangerBg,
    dangerInk: seed.dangerText,
  }
}

// Each family keeps its recognizable source palette, then maps it to the app's
// semantic layers. Light and dark variants are deliberately paired.
const definitions: ThemeDefinition[] = [
  {
    id: 'violet', name: 'Violet', category: 'Sudoku',
    light: { canvas: '#f3f0f8', surface: '#ffffff', raised: '#f9f7fc', sunken: '#ece7f3', text: '#231b36', muted: '#675e77', accent: '#5b3dba', accentHover: '#492c9e', border: '#ddd5e8', borderStrong: '#c6b9d5', board: '#fffefe', gridStrong: '#584665', selection: '#ded0fa', selectionBorder: '#6f49c2', key: '#f7f3fb', keyBorder: '#d9cde7', note: '#78583d', dangerBg: '#fee9ed', dangerText: '#9c2540' },
    dark: { canvas: '#15121b', surface: '#211b29', raised: '#2d2536', sunken: '#1a1620', text: '#f3eef8', muted: '#b8aec4', accent: '#8f70dd', accentHover: '#7356ba', border: '#45394f', borderStrong: '#665775', board: '#1b1721', gridStrong: '#8c7a98', selection: '#4a3766', selectionBorder: '#bc9cf4', key: '#2a2133', keyBorder: '#51415e', note: '#efc27f', dangerBg: '#482631', dangerText: '#ffb1bf' },
  },
  {
    id: 'ocean', name: 'Ocean', category: 'Sudoku',
    light: { canvas: '#eef5fa', surface: '#ffffff', raised: '#f5faff', sunken: '#e2edf5', text: '#17324a', muted: '#526b7e', accent: '#1967b3', accentHover: '#0f559b', border: '#ccdde9', borderStrong: '#a9c5d8', board: '#fcfeff', gridStrong: '#3d617a', selection: '#cce3f8', selectionBorder: '#2774b7', key: '#f1f7fb', keyBorder: '#c4d8e6', note: '#7b542f', dangerBg: '#fee8ec', dangerText: '#98233c' },
    dark: { canvas: '#0c1722', surface: '#142435', raised: '#1b2d40', sunken: '#0f1d2a', text: '#e9f4ff', muted: '#a9bfd1', accent: '#4f8fd2', accentHover: '#3b75b1', border: '#294158', borderStrong: '#41617d', board: '#101d29', gridStrong: '#7593ac', selection: '#2e4e6b', selectionBorder: '#83b9ed', key: '#1a2b3d', keyBorder: '#36516a', note: '#efbd76', dangerBg: '#472631', dangerText: '#ffadba' },
  },
  {
    id: 'forest', name: 'Forest', category: 'Sudoku',
    light: { canvas: '#eff6f1', surface: '#ffffff', raised: '#f5faf7', sunken: '#e3eee7', text: '#18382c', muted: '#577064', accent: '#28755a', accentHover: '#1f624a', border: '#cfe0d6', borderStrong: '#acc9b8', board: '#fcfffd', gridStrong: '#456c59', selection: '#cce7d8', selectionBorder: '#367d60', key: '#f1f7f3', keyBorder: '#c6dbcE', note: '#76552f', dangerBg: '#fee9e9', dangerText: '#962b35' },
    dark: { canvas: '#0f1915', surface: '#192820', raised: '#213329', sunken: '#132019', text: '#edf8f2', muted: '#adc4b7', accent: '#4c9b77', accentHover: '#3c7f60', border: '#30493d', borderStrong: '#496b5a', board: '#142019', gridStrong: '#769685', selection: '#315344', selectionBorder: '#83cba7', key: '#203128', keyBorder: '#3b5a49', note: '#edbe77', dangerBg: '#46272d', dangerText: '#ffb0b8' },
  },
  {
    id: 'rose-pine', name: 'Rosé Pine', category: 'Curated',
    light: { canvas: '#faf4ed', surface: '#fffaf3', raised: '#f7eee7', sunken: '#f2e9e1', text: '#575279', muted: '#797593', accent: '#907aa9', accentHover: '#735f89', border: '#dfd6d0', borderStrong: '#c8b9b1', board: '#fffaf3', gridStrong: '#797593', selection: '#dfdad9', selectionBorder: '#725d8b', key: '#f4ebe5', keyBorder: '#d8cac2', note: '#9a5b42', dangerBg: '#f6dddd', dangerText: '#8c3342' },
    dark: { canvas: '#191724', surface: '#232136', raised: '#2a273f', sunken: '#1f1d2e', text: '#e0def4', muted: '#9893b2', accent: '#c4a7e7', accentHover: '#9f84c2', border: '#393552', borderStrong: '#56516f', board: '#1f1d2e', gridStrong: '#817c9c', selection: '#4a4362', selectionBorder: '#c4a7e7', key: '#2a273f', keyBorder: '#4d4866', note: '#f6c177', dangerBg: '#4b2938', dangerText: '#ebbcba' },
  },
  {
    id: 'catppuccin', name: 'Catppuccin', category: 'Curated',
    light: { canvas: '#e6e9ef', surface: '#eff1f5', raised: '#f7f8fa', sunken: '#dce0e8', text: '#4c4f69', muted: '#6c6f85', accent: '#8839ef', accentHover: '#7027cd', border: '#ccd0da', borderStrong: '#aeb3c2', board: '#f5f6f8', gridStrong: '#6c6f85', selection: '#d8c7f4', selectionBorder: '#7c2bd6', key: '#e9ebf1', keyBorder: '#c3c7d2', note: '#8c4d20', dangerBg: '#f6dce0', dangerText: '#9d1f36' },
    dark: { canvas: '#11111b', surface: '#1e1e2e', raised: '#29293d', sunken: '#181825', text: '#cdd6f4', muted: '#a6adc8', accent: '#cba6f7', accentHover: '#a786ce', border: '#313244', borderStrong: '#585b70', board: '#181825', gridStrong: '#7f849c', selection: '#45405d', selectionBorder: '#cba6f7', key: '#272738', keyBorder: '#45475a', note: '#fab387', dangerBg: '#472731', dangerText: '#f5a2b8' },
  },
  {
    id: 'solarized', name: 'Solarized', category: 'IDE',
    light: { canvas: '#eee8d5', surface: '#fdf6e3', raised: '#fffaf0', sunken: '#e4deca', text: '#4f6268', muted: '#657b83', accent: '#6c71c4', accentHover: '#5358a7', border: '#d1cbb8', borderStrong: '#a9a58f', board: '#fff9e9', gridStrong: '#657b83', selection: '#d8d5e7', selectionBorder: '#5b60ad', key: '#f5eedb', keyBorder: '#c9c2ad', note: '#9a5d00', dangerBg: '#f5dbd2', dangerText: '#a1262e' },
    dark: { canvas: '#001f27', surface: '#002b36', raised: '#083944', sunken: '#001a21', text: '#b6c2c1', muted: '#93a1a1', accent: '#6c71c4', accentHover: '#555aa7', border: '#17434d', borderStrong: '#38616a', board: '#00252e', gridStrong: '#6d8588', selection: '#233f57', selectionBorder: '#7f87da', key: '#073640', keyBorder: '#28505a', note: '#d99b25', dangerBg: '#4a2929', dangerText: '#f29b91' },
  },
  {
    id: 'nord', name: 'Nord', category: 'IDE',
    light: { canvas: '#e5e9f0', surface: '#eceff4', raised: '#f7f8fa', sunken: '#d8dee9', text: '#2e3440', muted: '#596273', accent: '#5e81ac', accentHover: '#496b94', border: '#c5ccd8', borderStrong: '#9ba7ba', board: '#f4f6f9', gridStrong: '#4c566a', selection: '#cbd8e8', selectionBorder: '#4f719d', key: '#e2e7ee', keyBorder: '#b9c3d1', note: '#8b5e22', dangerBg: '#f1d9dd', dangerText: '#8f2738' },
    dark: { canvas: '#242933', surface: '#2e3440', raised: '#3b4252', sunken: '#272c36', text: '#eceff4', muted: '#b8c0cc', accent: '#5e81ac', accentHover: '#4c6c94', border: '#434c5e', borderStrong: '#657087', board: '#292f3a', gridStrong: '#8793a8', selection: '#44546a', selectionBorder: '#88c0d0', key: '#38404e', keyBorder: '#566176', note: '#ebcb8b', dangerBg: '#4a2d36', dangerText: '#f0a6b4' },
  },
  {
    id: 'ayu', name: 'Ayu', category: 'IDE',
    light: { canvas: '#f0f1f2', surface: '#fafafa', raised: '#ffffff', sunken: '#e8e9ea', text: '#3b4045', muted: '#687078', accent: '#b35c00', accentHover: '#914a00', border: '#d4d6d8', borderStrong: '#adb2b6', board: '#ffffff', gridStrong: '#5c6166', selection: '#f1dcc3', selectionBorder: '#a95200', key: '#f3f4f5', keyBorder: '#cdd0d2', note: '#8a4b08', dangerBg: '#f9dedd', dangerText: '#9c2930' },
    dark: { canvas: '#05070b', surface: '#0d1017', raised: '#171b24', sunken: '#080b10', text: '#bfbdb6', muted: '#8a8f98', accent: '#e6b450', accentHover: '#bf8f33', border: '#242936', borderStrong: '#464d5c', board: '#0b0e14', gridStrong: '#727784', selection: '#3b3528', selectionBorder: '#e6b450', key: '#151922', keyBorder: '#343a48', note: '#ffb454', dangerBg: '#43262b', dangerText: '#f29a9b' },
  },
  {
    id: 'github', name: 'GitHub', category: 'IDE',
    light: { canvas: '#f0f2f4', surface: '#ffffff', raised: '#f6f8fa', sunken: '#eaeef2', text: '#1f2328', muted: '#59636e', accent: '#0969da', accentHover: '#0757b8', border: '#d0d7de', borderStrong: '#a8b3be', board: '#ffffff', gridStrong: '#57606a', selection: '#cce5ff', selectionBorder: '#0969da', key: '#f6f8fa', keyBorder: '#c8d0d8', note: '#8a4b08', dangerBg: '#ffebe9', dangerText: '#a40e26' },
    dark: { canvas: '#010409', surface: '#0d1117', raised: '#161b22', sunken: '#070b10', text: '#e6edf3', muted: '#9da7b1', accent: '#2f81f7', accentHover: '#1f6feb', border: '#30363d', borderStrong: '#59636e', board: '#0b0f14', gridStrong: '#7d8590', selection: '#183963', selectionBorder: '#58a6ff', key: '#151b23', keyBorder: '#3d444d', note: '#e3b341', dangerBg: '#44272d', dangerText: '#ff9da8' },
  },
  {
    id: 'one', name: 'One', category: 'IDE',
    light: { canvas: '#eef0f2', surface: '#fafafa', raised: '#ffffff', sunken: '#e7e9eb', text: '#383a42', muted: '#626671', accent: '#a626a4', accentHover: '#871f85', border: '#d1d4d8', borderStrong: '#a9aeb7', board: '#ffffff', gridStrong: '#5c6370', selection: '#ead5ea', selectionBorder: '#982397', key: '#f1f2f3', keyBorder: '#c8ccd1', note: '#986801', dangerBg: '#f7dedf', dangerText: '#9d2732' },
    dark: { canvas: '#1d2026', surface: '#282c34', raised: '#323842', sunken: '#21252b', text: '#d7dae0', muted: '#a8adb7', accent: '#c678dd', accentHover: '#a45fba', border: '#3e4451', borderStrong: '#60697a', board: '#242830', gridStrong: '#8790a0', selection: '#4b3c57', selectionBorder: '#d08ee3', key: '#303640', keyBorder: '#505867', note: '#e5c07b', dangerBg: '#4a2b33', dangerText: '#f3a1ae' },
  },
  {
    id: 'tokyo-night', name: 'Tokyo Night', category: 'IDE',
    light: { canvas: '#d5d8e2', surface: '#e1e2e7', raised: '#f1f2f6', sunken: '#c4c8d5', text: '#26345a', muted: '#596990', accent: '#2e7de9', accentHover: '#2065c4', border: '#bdc3d1', borderStrong: '#929bb2', board: '#f0f1f5', gridStrong: '#53658d', selection: '#bdcff0', selectionBorder: '#256ed1', key: '#d9dce5', keyBorder: '#adb5c7', note: '#8b5500', dangerBg: '#f3d8df', dangerText: '#9f1f46' },
    dark: { canvas: '#15161e', surface: '#1a1b26', raised: '#24283b', sunken: '#11121a', text: '#c0caf5', muted: '#9aa5ce', accent: '#7aa2f7', accentHover: '#5d86df', border: '#292e42', borderStrong: '#4b5577', board: '#171821', gridStrong: '#7582ad', selection: '#283457', selectionBorder: '#8fb5ff', key: '#222638', keyBorder: '#414868', note: '#e0af68', dangerBg: '#472833', dangerText: '#f7a4b5' },
  },
  {
    id: 'gruvbox', name: 'Gruvbox', category: 'IDE',
    light: { canvas: '#ebdbb2', surface: '#fbf1c7', raised: '#f9f5d7', sunken: '#d5c4a1', text: '#3c3836', muted: '#665c54', accent: '#8f3f71', accentHover: '#73315a', border: '#d5c4a1', borderStrong: '#a89984', board: '#fff8d7', gridStrong: '#665c54', selection: '#e3c7c9', selectionBorder: '#8f3f71', key: '#f2e5bc', keyBorder: '#c9b98f', note: '#9d4f00', dangerBg: '#f5d8c5', dangerText: '#9d0006' },
    dark: { canvas: '#1d2021', surface: '#282828', raised: '#3c3836', sunken: '#202223', text: '#ebdbb2', muted: '#bdae93', accent: '#d3869b', accentHover: '#ae687c', border: '#504945', borderStrong: '#7c6f64', board: '#242424', gridStrong: '#a89984', selection: '#504045', selectionBorder: '#e39caf', key: '#353230', keyBorder: '#665c54', note: '#fabd2f', dangerBg: '#512d29', dangerText: '#ff9a82' },
  },
  {
    id: 'high-contrast', name: 'High contrast', category: 'Accessibility',
    light: { canvas: '#d9d9d9', surface: '#ffffff', raised: '#f2f2f2', sunken: '#e3e3e3', text: '#000000', muted: '#3f3f3f', accent: '#0047cc', accentHover: '#00379f', border: '#767676', borderStrong: '#3f3f3f', board: '#ffffff', gridStrong: '#000000', selection: '#b8d5ff', selectionBorder: '#003fae', key: '#eeeeee', keyBorder: '#626262', note: '#6b3e00', dangerBg: '#ffd7d7', dangerText: '#8d0014' },
    dark: { canvas: '#000000', surface: '#101010', raised: '#242424', sunken: '#080808', text: '#ffffff', muted: '#d0d0d0', accent: '#70a7ff', accentHover: '#4d8eed', border: '#777777', borderStrong: '#b0b0b0', board: '#080808', gridStrong: '#ffffff', selection: '#193d72', selectionBorder: '#8db9ff', key: '#202020', keyBorder: '#989898', note: '#ffd27a', dangerBg: '#500914', dangerText: '#ffb3bd' },
  },
]

export const THEME_OPTIONS = definitions.map(({ id, name, category }) => ({ id, name, category }))
export const THEME_IDS_SET = new Set<ThemeId>(THEME_IDS)

export const THEME_TOKENS = Object.fromEntries(definitions.map((theme) => [theme.id, {
  light: buildTokens(theme.light),
  dark: buildTokens(theme.dark),
}])) as Record<ThemeId, Record<ResolvedColorMode, ThemeTokens>>

function cssName(name: string) {
  return `--${name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}`
}

export function applyTheme(root: HTMLElement, theme: ThemeId, mode: ResolvedColorMode) {
  const tokens = THEME_TOKENS[theme][mode]
  Object.entries(tokens).forEach(([name, value]) => root.style.setProperty(cssName(name), value))
}

export function themePreview(theme: ThemeId, mode: ResolvedColorMode) {
  const tokens = THEME_TOKENS[theme][mode]
  return { background: tokens.surface, border: tokens.borderStrong, colors: [tokens.purple, tokens.selectedBg, tokens.keyBg] }
}
