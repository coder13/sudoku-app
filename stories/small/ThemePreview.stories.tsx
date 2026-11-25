import { Fragment } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ThemePreview } from '../../src/components/SettingsAppearance'
import { THEME_OPTIONS } from '../../src/sudoku/themes'
import { Width } from '../support/frames'

const meta = {
  title: 'Small/Settings/Theme preview',
  component: ThemePreview,
  args: { theme: 'github', mode: 'light' },
  argTypes: { theme: { options: THEME_OPTIONS.map(({ id }) => id), control: 'select' } },
} satisfies Meta<typeof ThemePreview>
export default meta
type Story = StoryObj<typeof meta>
export const Light: Story = {}
export const Dark: Story = { args: { mode: 'dark' } }
export const AllThemes: Story = {
  render: () => <Width width={420}><div className="story-theme-grid">
    <strong>Theme</strong><strong>Light</strong><strong>Dark</strong>
    {THEME_OPTIONS.map(({ id, name }) => <Fragment key={id}>
      <span>{name}</span><ThemePreview mode="light" theme={id} /><ThemePreview mode="dark" theme={id} />
    </Fragment>)}
  </div></Width>,
}
