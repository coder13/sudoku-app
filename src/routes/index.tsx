import { createFileRoute } from '@tanstack/react-router'
import { Workspace } from '../components/Workspace'

export const Route = createFileRoute('/')({ ssr: false, component: Workspace })
