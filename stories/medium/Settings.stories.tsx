import type { Meta, StoryObj } from '@storybook/react-vite'
import { Settings } from '../../src/components/Settings'
import { settingArgs, SettingsExample } from '../support/settings-example'

const meta = {
  title: 'Medium/Settings/Settings dialog',
  component: Settings,
  tags: ['!autodocs'],
  args: settingArgs,
  render: (args) => <SettingsExample {...args} />,
} satisfies Meta<typeof Settings>
export default meta
type Story = StoryObj<typeof meta>

function openSection(name: string): Story['play'] {
  return async ({ canvas, userEvent }) => {
    await canvas.findByRole('dialog')
    const tab = canvas.queryByRole('tab', { name })
    await userEvent.click(tab ?? canvas.getByRole('button', { name: new RegExp(`^${name}`) }))
  }
}

export const LookAndFeel: Story = {}
export const InputControls: Story = { play: openSection('Input controls') }
export const Highlighting: Story = { play: openSection('Highlighting') }
export const SolvingStyle: Story = { play: openSection('Solving style') }
export const SolvingWhileDrafting: Story = { args: { draft: true }, play: openSection('Solving style') }
export const Hints: Story = { play: openSection('Hints') }
