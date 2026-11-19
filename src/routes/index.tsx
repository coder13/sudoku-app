import { createFileRoute } from '@tanstack/react-router'
import { Workspace } from '../components/Workspace'

export const Route = createFileRoute('/')({
  validateSearch: (search): { puzzle?: string; share?: string } => {
    if ('share' in search) return { share: typeof search.share === 'string' ? search.share : '' }
    if (typeof search.puzzle === 'string') return { puzzle: search.puzzle }
    return {}
  },
  ssr: false, component: Workspace,
})
