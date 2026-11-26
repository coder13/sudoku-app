import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { GeneralSettings } from '../../src/components/SettingsGeneral'
import { Width } from '../support/frames'
import { settingArgs } from '../support/settings-example'

const { advancedModes, setAdvancedModes, errorMode, setErrorMode, draft, cellReferenceStyle, setCellReferenceStyle } = settingArgs
const meta = {
  title: 'Medium/Settings/Input, solving, and hints',
  component: GeneralSettings,
  args: { section: 'input', advancedModes, setAdvancedModes, errorMode, setErrorMode, draft, cellReferenceStyle, setCellReferenceStyle },
  decorators: [(Story) => <Width><Story /></Width>],
  render: (args) => {
    const [modes, setModes] = useState(args.advancedModes)
    const [errors, setErrors] = useState(args.errorMode)
    const [referenceStyle, setReferenceStyle] = useState(args.cellReferenceStyle)
    return <GeneralSettings {...args}
      advancedModes={modes} setAdvancedModes={(next) => { args.setAdvancedModes(next); setModes(next) }}
      errorMode={errors} setErrorMode={(next) => { args.setErrorMode(next); setErrors(next) }}
      cellReferenceStyle={referenceStyle}
      setCellReferenceStyle={(next) => { args.setCellReferenceStyle(next); setReferenceStyle(next) }} />
  },
} satisfies Meta<typeof GeneralSettings>
export default meta
type Story = StoryObj<typeof meta>
export const Input: Story = {}
export const Solving: Story = { args: { section: 'solving' } }
export const SolvingWithExperimentalAls: Story = {
  args: { section: 'solving', advancedModes: { ...advancedModes, experimentalAlsHighlighting: true } },
}
export const SolvingInDraft: Story = { args: { section: 'solving', draft: true } }
export const Hints: Story = { args: { section: 'hints' } }
