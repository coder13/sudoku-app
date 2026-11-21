import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ResizeStepControls } from '../../src/components/ResizeStepControls'

const meta = {
  title: 'Design system/Resize options',
  component: ResizeStepControls,
  args: { axis: 'width', onStep: fn() },
} satisfies Meta<typeof ResizeStepControls>
export default meta

type Story = StoryObj<typeof meta>

export const Width: Story = {}
export const MinimumHeight: Story = {
  args: { axis: 'height', atMin: true },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}
