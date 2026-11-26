import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ThemeSettings } from '../../src/components/SettingsAppearance'
import { Width } from '../support/frames'
import { settingArgs } from '../support/settings-example'

const { appearance, setAppearance } = settingArgs
const meta = {
  title: 'Medium/Settings/Theme choices',
  component: ThemeSettings,
  args: { appearance, setAppearance },
  decorators: [(Story) => <Width><Story /></Width>],
  render: (args) => {
    const [value, setValue] = useState(args.appearance)
    return <ThemeSettings appearance={value} setAppearance={(next) => { args.setAppearance(next); setValue(next) }} />
  },
} satisfies Meta<typeof ThemeSettings>
export default meta
type Story = StoryObj<typeof meta>
export const System: Story = {}
export const Dark: Story = { args: { appearance: { ...appearance, colorMode: 'dark' } } }
