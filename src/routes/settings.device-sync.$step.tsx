import { createFileRoute, redirect } from '@tanstack/react-router'
import { isSyncStep, syncStepTitles } from '../sudoku/sync-steps'

export const Route = createFileRoute('/settings/device-sync/$step')({
  loader: ({ params }) => {
    if (!isSyncStep(params.step)) throw redirect({ to: '/settings/device-sync', replace: true })
    return params.step
  },
  head: ({ loaderData }) => loaderData ? { meta: [{ title: syncStepTitles[loaderData] + ' | Sudoku' }] } : {},
  component: () => null,
})
