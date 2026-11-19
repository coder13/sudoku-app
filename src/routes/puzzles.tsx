import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/puzzles')({})

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    standalonePuzzlePage?: boolean
  }
}
