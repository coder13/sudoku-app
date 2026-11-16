import { createFileRoute } from '@tanstack/react-router'
import { PuzzlesWorkspace } from '../components/Workspace'

export const Route = createFileRoute('/puzzles')({ component: PuzzlesWorkspace })
