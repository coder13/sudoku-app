import { createFileRoute } from '@tanstack/react-router'
import { DeviceSyncPage } from '../components/DeviceSyncPage'

export const Route = createFileRoute('/sync')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Device sync | Sudoku' }] }),
  component: DeviceSyncPage,
})
