import { createFileRoute } from '@tanstack/react-router'
import { Workspace } from '../components/Workspace'

export const Route = createFileRoute('/')({
  validateSearch: (search): { puzzle?: string } => typeof search.puzzle === 'string' ? { puzzle: search.puzzle } : {},
  ssr: false, component: Workspace,
})
