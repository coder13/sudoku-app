import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Modal } from '../../src/components/Modal'
import { Width } from '../support/frames'

const meta = {
  title: 'Small/Surfaces/Modal',
  component: Modal,
  args: {
    title: 'Confirm changes',
    onClose: () => {},
    children: <p>Review the changes before you continue.</p>,
  },
  decorators: [(Story) => <Width><Story /></Width>],
  render: (args) => {
    const [open, setOpen] = useState(true)
    return <>
      <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      <Modal {...args} open={open} onClose={() => { args.onClose(); setOpen(false) }} data-story-dialog>
        <p>Review the changes before you continue.</p>
      </Modal>
    </>
  },
} satisfies Meta<typeof Modal>
export default meta
type Story = StoryObj<typeof meta>

export const ForwardedNativeAttributes: Story = {}
