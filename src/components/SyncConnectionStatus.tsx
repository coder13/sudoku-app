import { LoaderCircle } from 'lucide-react'
import type { SyncConnection } from '../sudoku/device-sync'

const statuses = {
  unlinked: '',
  connecting: 'Connecting to live sync…',
  live: 'Live sync connected',
  fallback: 'Live sync reconnecting',
  offline: 'Offline',
} as const

/** Show account loading and the connection by the wordmark and on the Device sync page. */
export function SyncConnectionStatus({ connection, loadingAccount = false, showLabel = false }: {
  connection: SyncConnection
  loadingAccount?: boolean
  showLabel?: boolean
}) {
  const { mode, checkFailed } = connection
  if (mode === 'unlinked') return null
  const problem = checkFailed && mode !== 'offline'
  const loading = loadingAccount && mode !== 'offline'
  const text = loading ? 'Syncing your account…' : problem ? 'Cloud check failed' : statuses[mode]
  return <span className="sync-connection-label" data-connection={problem ? 'failure' : mode} role="status" title={showLabel ? undefined : text}>
    {loading ? <LoaderCircle size={14} className="loading-spinner" aria-hidden="true" />
      : <span className="sync-connection-dot" aria-hidden="true" />}
    <span className={showLabel ? undefined : 'sr-only'}>{text}</span>
  </span>
}
