import type { Preview } from '@storybook/react-vite'
import { DEFAULT_APPEARANCE } from '../src/sudoku/preferences'
import { usePageAppearance } from '../src/components/usePageAppearance'
import '@fontsource-variable/dm-sans/wght.css'
import '../src/styles.css'
import '../src/lessons.css'
import './preview.css'

function Theme({ mode }: { mode: 'light' | 'dark' }) {
  usePageAppearance({ ...DEFAULT_APPEARANCE, colorMode: mode })
  return null
}

const preview: Preview = {
  tags: ['autodocs'],
  globalTypes: {
    colorMode: {
      description: 'App appearance',
      toolbar: { title: 'Appearance', icon: 'paintbrush', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { colorMode: 'light' },
  decorators: [(Story, { globals }) => <>
    <Theme mode={globals.colorMode === 'dark' ? 'dark' : 'light'} />
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
