import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { SizeSettings } from '../../src/components/Settings'
import { MAX_INPUT_SIZE, MIN_INPUT_SIZE } from '../../src/sudoku/preferences'
import { Width } from '../support/frames'
import { settingArgs } from '../support/settings-example'

const { appearance, setAppearance, inputSize, setInputSize, workspaceMode, onResetLayout } = settingArgs
const meta = {
  title: 'Medium/Settings/Input size',
  component: SizeSettings,
  args: { appearance, setAppearance, inputSize, setInputSize, workspaceMode, onResetLayout },
  decorators: [(Story) => <Width><Story /></Width>],
  render: (args) => {
    const [size, setSize] = useState(args.inputSize)
    const [currentAppearance, setCurrentAppearance] = useState(args.appearance)
    return <SizeSettings {...args} appearance={currentAppearance}
      setAppearance={(next) => { args.setAppearance(next); setCurrentAppearance(next) }}
      inputSize={size} setInputSize={(next) => { args.setInputSize(next); setSize(next) }} />
  },
} satisfies Meta<typeof SizeSettings>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Minimum: Story = { args: { inputSize: MIN_INPUT_SIZE } }
export const Maximum: Story = { args: { inputSize: MAX_INPUT_SIZE } }
export const PuzzleBorder: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const select = canvas.getByRole('combobox', { name: 'Puzzle border thickness' })
    await userEvent.selectOptions(select, '6')
    const preview = canvasElement.querySelector('.puzzle-border-preview .variant-preview')!
    await expect(getComputedStyle(preview).borderTopWidth).toBe('6px')
  },
}
export const ResetLayout: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Reset layout' }))
    await expect(args.onResetLayout).toHaveBeenCalled()
  },
}
