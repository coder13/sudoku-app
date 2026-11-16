import { createFileRoute } from '@tanstack/react-router'
import { KeyboardShortcutsPage } from '../components/KeyboardShortcutsPage'

export const Route = createFileRoute('/shortcuts')({ component: KeyboardShortcutsPage })
