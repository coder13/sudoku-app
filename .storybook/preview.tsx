import type { Preview } from '@storybook/react-vite'
import { DEFAULT_APPEARANCE } from '../src/sudoku/preferences'
import { usePageAppearance } from '../src/components/usePageAppearance'
import { THEME_OPTIONS, type ThemeId } from '../src/sudoku/themes'
import '@fontsource-variable/dm-sans/wght.css'
import '../src/styles.css'
import '../src/lessons.css'
import './preview.css'

function Theme({ mode, theme, flatAppearance }: { mode: 'light' | 'dark'; theme?: ThemeId; flatAppearance: boolean }) {
  const palettes = theme ? { lightTheme: theme, darkTheme: theme } : undefined
  usePageAppearance({ ...DEFAULT_APPEARANCE, ...palettes, colorMode: mode, flatAppearance }, true)
  return null
}

const preview: Preview = {
  tags: ['autodocs'],
  globalTypes: {
    colorMode: {
      description: 'App appearance',
      toolbar: { title: 'Appearance', icon: 'paintbrush', items: ['light', 'dark'], dynamicTitle: true },
    },
    surfaceStyle: {
      description: 'Surface style',
      toolbar: { title: 'Surface style', icon: 'component', items: [
        { value: 'default', title: 'Theme default' },
        { value: 'flat', title: 'Flat' },
      ] },
    },
  },
  initialGlobals: { colorMode: 'light', surfaceStyle: 'default' },
  decorators: [(Story, { globals, parameters }) => <>
    <Theme mode={globals.colorMode === 'dark' ? 'dark' : 'light'}
      flatAppearance={globals.surfaceStyle === 'flat'}
      theme={THEME_OPTIONS.find(({ id }) => id === parameters.appTheme)?.id} />
    <Story />
  </>],
  parameters: {
    layout: 'padded',
    backgrounds: { disable: true },
    controls: { expanded: true },
    options: {
      storySort: { order: ['Welcome', 'Small', ['Hints', ['Copy review', 'Easy', 'Medium', 'Hard', 'Unfair', 'Extreme']], 'Medium', 'Large'] },
    },
  },
}

export default preview
