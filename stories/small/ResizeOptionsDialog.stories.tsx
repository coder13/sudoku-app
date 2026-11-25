import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ResizeOptionsDialog } from '../../src/components/ResizeOptionsDialog'
import { Width as WidthFrame } from '../support/frames'

const meta = {
  title: 'Small/Layout/ResizeOptionsDialog',
  component: ResizeOptionsDialog,
  args: {
    title: 'Resize input panel',
    axis: 'width',
    value: 384,
    min: 240,
    max: 540,
    step: 24,
    open: true,
    onStep: () => {},
    onReset: () => {},
    onClose: () => {},
  },
  decorators: [(Story) => <WidthFrame><Story /></WidthFrame>],
  render: (args) => {
    const [value, setValue] = useState(args.value)
    const [open, setOpen] = useState(args.open)
    return <ResizeOptionsDialog {...args} value={value} open={open}
      onStep={(delta) => { args.onStep(delta); setValue(current => Math.min(args.max, Math.max(args.min, current + delta))) }}
      onReset={() => { args.onReset(); setValue(args.value) }}
      onClose={() => { args.onClose(); setOpen(false) }} />
  },
} satisfies Meta<typeof ResizeOptionsDialog>
export default meta
type Story = StoryObj<typeof meta>

export const Width: Story = {}
export const Height: Story = { args: { axis: 'height', value: 192, min: 120, max: 360, step: 8 } }
export const AtMinimum: Story = { args: { value: 240, min: 240 } }
export const AtMaximum: Story = { args: { value: 540, max: 540 } }
