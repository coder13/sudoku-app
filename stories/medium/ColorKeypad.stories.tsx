import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ColorKeypad } from '../../src/components/ColorKeypad'
import { Width } from '../support/frames'

const meta = {
  title: 'Medium/Play/ColorKeypad',
  component: ColorKeypad,
  args: {
    selectedColor: 3,
    target: 'cell',
    disabled: false,
    onSelectColor: fn(),
    onSwitchShade: fn(),
    onTarget: fn(),
    onErase: fn(),
  },
  decorators: [(Story) => <Width><Story /></Width>],
  parameters: {
    docs: { description: { component: 'Select a color and choose whether it paints cells or candidates. The host supplies selection, shade switching, erase behavior, and disabled state.' } },
  },
} satisfies Meta<typeof ColorKeypad>

export default meta
type Story = StoryObj<typeof meta>

export const CellColors: Story = {}
export const DarkShade: Story = { args: { selectedColor: 9 } }
export const CandidateColors: Story = { args: { selectedColor: 8, target: 'candidate' } }
export const Disabled: Story = { args: { disabled: true } }
