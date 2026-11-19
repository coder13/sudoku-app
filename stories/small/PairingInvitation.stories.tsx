import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Button } from '../../src/components/Button'
import { PairingInvitation } from '../../src/components/PairingInvitation'

const meta = {
  title: 'Small/Device sync/Pairing invitation',
  component: PairingInvitation,
  args: {
    link: 'https://sudoku.example/sync#pair=' + '1234567890abcdef'.repeat(4),
    expires: new Date().setHours(16, 30, 0, 0),
    onClose: fn(),
  },
  parameters: { docs: { description: { component: 'Show this card on the device issuing the invitation. The example uses a sample pairing link.' } } },
} satisfies Meta<typeof PairingInvitation>
export default meta

export const Card: StoryObj<typeof meta> = {
  render: function Example(args) {
    const [open, setOpen] = useState(true)
    return <div className="page sync-page device-sync-page" style={{ height: 'auto' }}>
      {open ? <PairingInvitation {...args} onClose={() => { setOpen(false); args.onClose() }} />
        : <Button onClick={() => setOpen(true)}>Show pairing code</Button>}
    </div>
  },
}
