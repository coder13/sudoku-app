import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowLeft } from 'lucide-react'
import { fn } from 'storybook/test'
import { Modal } from '../../src/components/Modal'
import { DialogStory } from '../support/frames'

const meta = {
  title: 'Medium/Dialogs/Modal',
  component: Modal,
  args: { title: 'About this puzzle', onClose: fn(), children: <p>Use this puzzle to practice finding singles.</p> },
  tags: ['!autodocs'],
  render: ({ onClose, ...args }) => <DialogStory label="Open modal" initialOpen={false}>{(close) =>
    <Modal {...args} onClose={() => { onClose(); close() }} />}</DialogStory>,
} satisfies Meta<typeof Modal>
export default meta
type Story = StoryObj<typeof meta>
export const Standard: Story = {}
export const WithBackButton: Story = {
  args: { leading: <button className="icon-button borderless" aria-label="Back" onClick={fn()}><ArrowLeft size={18} /></button> },
}
