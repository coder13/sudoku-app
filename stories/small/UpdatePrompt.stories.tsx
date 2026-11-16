import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { UpdatePrompt } from '../../src/components/OfflineUpdates'

type UpdatePromptProps = ComponentProps<typeof UpdatePrompt>

const meta = {
  title: 'Small/Status/Offline update',
  component: UpdatePrompt,
  args: { updating: false, onDismiss: fn(), onUpdate: fn() } satisfies UpdatePromptProps,
  parameters: { layout: 'fullscreen' },
  render: (args) => <UpdateExample key={String(args.updating)} {...args} />,
} satisfies Meta<typeof UpdatePrompt>
export default meta
type Story = StoryObj<typeof meta>
export const UpdateReady: Story = {}
export const Updating: Story = { args: { updating: true } }

function UpdateExample({ updating, onDismiss, onUpdate }: UpdatePromptProps) {
  const [visible, setVisible] = useState(true)
  const [busy, setBusy] = useState(updating)
  return visible
    ? <UpdatePrompt updating={busy} onDismiss={() => { onDismiss(); setVisible(false) }}
      onUpdate={() => { onUpdate(); setBusy(true) }} />
    : <button className="button secondary" onClick={() => setVisible(true)}>Show update prompt</button>
}
