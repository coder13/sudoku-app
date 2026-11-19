import { createFileRoute, redirect } from '@tanstack/react-router'
import { isSyncPage, syncPageTitles } from '../sudoku/sync-pages'

export const Route = createFileRoute('/sync/$step')({
  loader: ({ params }) => {
    if (!isSyncPage(params.step)) throw redirect({ to: '/sync', replace: true })
    return params.step
  },
  head: ({ loaderData }) => loaderData ? { meta: [{ title: syncPageTitles[loaderData] + ' | Sudoku' }] } : {},
  component: () => null,
})
