import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/shortcuts')({
  ssr: false,
  component: () => <Navigate to="/settings/$section" params={{ section: 'shortcuts' }} replace />,
})
