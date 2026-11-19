import type { Meta, StoryObj } from '@storybook/react-vite'
import { SyncConnectionStatus } from '../../src/components/SyncConnectionStatus'

const lastCheck = Date.UTC(2026, 10, 18, 21, 0)
const meta = {
  title: 'Medium/Device sync/Connection status',
  component: SyncConnectionStatus,
  args: {
    connection: { mode: 'live', lastCheck, lastNotification: lastCheck - 5000, checkFailed: false },
  },
} satisfies Meta<typeof SyncConnectionStatus>

export default meta
type Story = StoryObj<typeof meta>

export const PuzzleCard: Story = {}
export const LinkedDevices: Story = { args: { detailed: true } }
export const Reconnecting: Story = {
  args: { detailed: true, connection: { mode: 'fallback', lastCheck, lastNotification: null, checkFailed: false } },
}
export const CloudCheckFailed: Story = {
  args: { detailed: true, connection: { mode: 'live', lastCheck, lastNotification: null, checkFailed: true } },
}
export const Offline: Story = {
  args: { connection: { mode: 'offline', lastCheck: null, lastNotification: null, checkFailed: false } },
}
