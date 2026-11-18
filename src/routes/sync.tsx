import { createFileRoute } from '@tanstack/react-router'
import { DeviceSyncPage } from '../components/DeviceSyncPage'

export const Route = createFileRoute('/sync')({ ssr: false, component: DeviceSyncPage })
