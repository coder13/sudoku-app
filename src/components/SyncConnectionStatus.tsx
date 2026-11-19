import type { SyncConnection } from '../sudoku/device-sync'

const statuses = {
  unlinked: { label: '', detail: '' },
  connecting: { label: 'Connecting to live sync…', detail: 'Waiting for the server to confirm the live connection.' },
  live: { label: 'Live sync connected', detail: 'This device can receive live updates from your linked library.' },
  fallback: { label: 'Live sync reconnecting', detail: 'The app checks the cloud periodically while it reconnects.' },
  offline: { label: 'Offline', detail: 'Puzzle changes are saved on this device until it reconnects.' },
} as const

function timeOf(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

/** Show a green dot for a healthy connection on the puzzle card and confirmed activity in Device sync. */
export function SyncConnectionStatus({ connection, detailed = false }: { connection: SyncConnection; detailed?: boolean }) {
  const { mode, checkFailed, lastCheck, lastNotification } = connection
  if (mode === 'unlinked') return null
  const problem = checkFailed && mode !== 'offline'
  const { label, detail } = statuses[mode]
  const dotOnly = !detailed && mode === 'live' && !problem
  const badge = <span className="sync-connection-label" data-connection={problem ? 'failure' : mode} role="status" title={dotOnly ? label : undefined}>
    <span className="sync-connection-dot" aria-hidden="true" />
    <span className={dotOnly ? 'sr-only' : undefined}>{problem && !detailed ? 'Cloud check failed' : label}</span>
  </span>
  if (!detailed) return badge
  return <div className="sync-connection-detail">
    {badge}
    <p>{detail}</p>
    {problem && <p role="status">The latest cloud check failed. The app will retry.</p>}
    <dl>
      <div><dt>Last successful cloud check</dt><dd>{lastCheck === null ? 'Waiting' : <time dateTime={new Date(lastCheck).toISOString()}>{timeOf(lastCheck)}</time>}</dd></div>
      <div><dt>Last live notification</dt><dd>{lastNotification === null ? 'None this session' : <time dateTime={new Date(lastNotification).toISOString()}>{timeOf(lastNotification)}</time>}</dd></div>
    </dl>
    <p>Edits sync about two seconds after your last move, or once a minute if you keep playing. Pausing, resuming, or solving a puzzle syncs right away. You can also choose <strong>Sync now</strong> in Puzzle options.</p>
  </div>
}
