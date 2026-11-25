import type { Meta, StoryObj } from '@storybook/react-vite'
import { AppearanceSettings } from '../../src/components/SettingsAppearance'
import { MIN_INPUT_SIZE, MAX_INPUT_SIZE } from '../../src/sudoku/preferences'
import { Width } from '../support/frames'
import { settingArgs } from '../support/settings-example'

const { appearance, setAppearance, inputSize, setInputSize, workspaceMode, setWorkspaceMode, onResetLayout } = settingArgs
const meta = {
  title: 'Medium/Settings/Appearance',
  component: AppearanceSettings,
  args: { appearance, setAppearance, inputSize, setInputSize, workspaceMode, setWorkspaceMode, onResetLayout },
  decorators: [(Story) => <Width><Story /></Width>],
} satisfies Meta<typeof AppearanceSettings>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const CompactWithoutGuides: Story = { args: { inputSize: MIN_INPUT_SIZE, appearance: { ...appearance, showGuides: false } } }
export const LargeDigits: Story = { args: { inputSize: MAX_INPUT_SIZE } }
