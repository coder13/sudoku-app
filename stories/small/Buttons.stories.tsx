import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Check, MoreHorizontal, QrCode } from 'lucide-react'
import { fn } from 'storybook/test'
import { Button, ChoiceButton, IconButton } from '../../src/components/Button'

const meta = {
  title: 'Design system/Buttons',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Save', onClick: fn() },
  argTypes: { variant: { control: 'select', options: ['primary', 'secondary', 'quiet', 'danger'] } },
  parameters: { docs: { description: { component: 'Use a text button for an action, an icon button for a familiar compact control, and a choice button when options need an explanation. Hover changes shadow or fill. Keyboard focus has its own outline.' } } },
} satisfies Meta<typeof Button>
export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}
function GuidesToggle() {
  const [pressed, setPressed] = useState(true)
  return <Button aria-pressed={pressed} onClick={() => setPressed(!pressed)}><Check size={16} /> Guides</Button>
}

export const Usage: Story = {
  render: ({ onClick }) => <div className="story-button-guide">
    <div><Button variant="primary" onClick={onClick}>Save</Button><p>Primary advances the current task.</p></div>
    <div><Button onClick={onClick}>Copy link</Button><p>Secondary offers a supporting action.</p></div>
    <div><Button variant="quiet" onClick={onClick}>Cancel</Button><p>Quiet suits optional or repeated actions.</p></div>
    <div><Button variant="danger" onClick={onClick}>Confirm unlink</Button><p>Danger confirms a destructive change.</p></div>
    <div><IconButton variant="quiet" aria-label="Device options" onClick={onClick}><MoreHorizontal /></IconButton><p>Use an icon for a familiar action in a compact row. Give it an accessible name.</p></div>
    <div><ChoiceButton onClick={onClick}><QrCode aria-hidden size={20} /><span><strong>Scan QR code</strong><small>Join a linked device.</small></span></ChoiceButton><p>Use a choice when a short description helps someone pick a path.</p></div>
    <div><Button disabled>Save</Button><p>Disable an action when it cannot run.</p></div>
    <div><GuidesToggle /><p>Use a pressed state for a persistent on/off choice.</p></div>
  </div>,
}
