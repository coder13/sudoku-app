import { useEffect, useState } from 'react'
import type { AppearancePreferences } from '../sudoku/preferences'
import { applyTheme } from '../sudoku/themes'

export function usePageAppearance(appearance: AppearancePreferences, preferencesReady: boolean) {
  const [systemDark, setSystemDark] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const colorMode = appearance.colorMode === 'system' ? (systemDark ? 'dark' : 'light') : appearance.colorMode
  const activeTheme = colorMode === 'dark' ? appearance.darkTheme : appearance.lightTheme

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!preferencesReady) return
    const root = document.documentElement
    root.dataset.colorMode = colorMode
    root.dataset.theme = activeTheme
    root.style.colorScheme = activeTheme === 'andoku' ? 'dark' : colorMode
    applyTheme(root, activeTheme, colorMode)
    const styles = getComputedStyle(root)
    const background = styles.getPropertyValue('--status-bar-bg').trim() || styles.getPropertyValue('--page-bg').trim()
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (themeColor && background) themeColor.content = background
  }, [activeTheme, colorMode, preferencesReady])
}
