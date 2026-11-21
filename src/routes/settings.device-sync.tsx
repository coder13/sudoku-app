import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/device-sync')({
  head: () => ({ meta: [{ title: 'Device sync | Sudoku' }] }),
  component: () => null,
})
