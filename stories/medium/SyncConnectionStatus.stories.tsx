import type { Meta, StoryObj } from '@storybook/react-vite'
import { SyncConnectionStatus } from '../../src/components/SyncConnectionStatus'

const meta = {
  title: 'Medium/Device sync/Connection status',
  component: SyncConnectionStatus,
  args: {
    connection: { mode: 'live', checkFailed: false },
  },
} satisfies Meta<typeof SyncConnectionStatus>

export default meta
type Story = StoryObj<typeof meta>

export const AppHeader: Story = {}
export const LinkedDevices: Story = { args: { showLabel: true } }
export const Reconnecting: Story = {
  args: { showLabel: true, connection: { mode: 'fallback', checkFailed: false } },
}
export const CloudCheckFailed: Story = {
  args: { showLabel: true, connection: { mode: 'live', checkFailed: true } },
}
export const Offline: Story = {
  args: { connection: { mode: 'offline', checkFailed: false } },
}
