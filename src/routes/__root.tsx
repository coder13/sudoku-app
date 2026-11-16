import type { ReactNode } from 'react'
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { OfflineUpdates } from '../components/OfflineUpdates'
import { SudokuShell } from '../components/Workspace'
import { APPEARANCE_KEY, DEFAULT_APPEARANCE } from '../sudoku/preferences'
import { THEME_TOKENS, themeVariables } from '../sudoku/themes'
import '@fontsource-variable/dm-sans/wght.css'
import '../styles.css'

const initialTheme = DEFAULT_APPEARANCE.lightTheme
const initialStyle = { colorScheme: 'light', ...themeVariables(initialTheme, 'light') }
const themeBootstrap = `(() => {
  try {
    const root = document.documentElement
    const themes = ${JSON.stringify(THEME_TOKENS)}
    const defaults = ${JSON.stringify(DEFAULT_APPEARANCE)}
    const saved = JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)}) || 'null') || {}
    const preference = ['system', 'light', 'dark'].includes(saved.colorMode) ? saved.colorMode : defaults.colorMode
    const mode = preference === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : preference
    const lightTheme = Object.hasOwn(themes, saved.lightTheme) ? saved.lightTheme : defaults.lightTheme
    const migratedDarkTheme = saved.themeDefaultsVersion !== 2 && saved.darkTheme === 'violet'
      ? defaults.darkTheme : saved.darkTheme
    const darkTheme = Object.hasOwn(themes, migratedDarkTheme) ? migratedDarkTheme : defaults.darkTheme
    const theme = mode === 'dark' ? darkTheme : lightTheme
    root.dataset.colorMode = mode
    root.dataset.theme = theme
    root.style.colorScheme = theme === 'andoku' ? 'dark' : mode
    for (const [name, value] of Object.entries(themes[theme][mode])) {
      root.style.setProperty('--' + name.replace(/[A-Z]/g, character => '-' + character.toLowerCase()), value)
    }
    const themeColor = document.querySelector('meta[name="theme-color"]')
    if (themeColor) themeColor.content = themes[theme][mode].pageBg
  } catch {}
})()`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: THEME_TOKENS[initialTheme].light.pageBg },
      { name: 'description', content: 'Play, create and share classic Sudoku puzzles.' },
      { title: 'Sudoku' },
    ],
    links: [
      { rel: 'icon', href: '/icon-192.png', type: 'image/png' },
      { rel: 'apple-touch-icon', href: '/icon-192.png' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
    ],
  }),
  component: App,
  shellComponent: RootDocument,
})

function App() {
  return <SudokuShell><Outlet /></SudokuShell>
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={initialStyle} suppressHydrationWarning>
      <head><HeadContent /><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body>{children}<OfflineUpdates /><Scripts /></body>
    </html>
  )
}
