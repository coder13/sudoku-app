import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { HighlightSettings } from '../../src/components/Settings'
import { Width } from '../support/frames'
import { settingArgs } from '../support/settings-example'

const { highlighting, setHighlighting } = settingArgs
const meta = {
  title: 'Medium/Settings/Highlighting',
  component: HighlightSettings,
  args: { highlighting, setHighlighting },
  decorators: [(Story) => <Width><Story /></Width>],
  render: (args) => {
    const [value, setValue] = useState(args.highlighting)
    return <HighlightSettings highlighting={value} setHighlighting={(next) => { args.setHighlighting(next); setValue(next) }} />
  },
} satisfies Meta<typeof HighlightSettings>
export default meta
type Story = StoryObj<typeof meta>
export const CandidateStyles: Story = {}
export const CandidateHighlightingDisabled: Story = {
  args: { highlighting: { ...highlighting, matchingCandidates: false } },
  play: async ({ canvas, userEvent }) => {
    const styles = within(canvas.getByRole('group', { name: 'Candidate highlight style' }))
    const font = styles.getByRole('radio', { name: 'Font color' })
    await userEvent.click(font)
    await expect(font).toBeChecked()
  },
}
