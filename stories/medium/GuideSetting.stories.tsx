import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { GuideSetting } from '../../src/components/Settings'
import { Width } from '../support/frames'
import { settingArgs } from '../support/settings-example'

const { appearance, setAppearance } = settingArgs
const meta = {
  title: 'Medium/Settings/Grid guides',
  component: GuideSetting,
  args: { appearance, setAppearance },
  decorators: [(Story) => <Width><Story /></Width>],
  render: (args) => {
    const [value, setValue] = useState(args.appearance)
    return <GuideSetting {...args} appearance={value} setAppearance={(next) => { args.setAppearance(next); setValue(next) }} />
  },
} satisfies Meta<typeof GuideSetting>
export default meta
type Story = StoryObj<typeof meta>
export const Visible: Story = {}
export const Hidden: Story = { args: { appearance: { ...appearance, showGuides: false } } }
