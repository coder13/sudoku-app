import type { SyncConnection } from '../sudoku/device-sync'

const statuses = {
  unlinked: '',
  connecting: 'Connecting to live sync…',
  live: 'Live sync connected',
  fallback: 'Live sync reconnecting',
  offline: 'Offline',
} as const

/** Show the connection by the wordmark and label it on the Device sync page. */
export function SyncConnectionStatus({ connection, showLabel = false }: { connection: SyncConnection; showLabel?: boolean }) {
  const { mode, checkFailed } = connection
  if (mode === 'unlinked') return null
  const problem = checkFailed && mode !== 'offline'
  const text = problem ? 'Cloud check failed' : statuses[mode]
  return <span className="sync-connection-label" data-connection={problem ? 'failure' : mode} role="status" title={showLabel ? undefined : text}>
    <span className="sync-connection-dot" aria-hidden="true" />
    <span className={showLabel ? undefined : 'sr-only'}>{text}</span>
  </span>
}
