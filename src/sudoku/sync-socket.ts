import type { Credentials } from './sync-engine.ts'

const presenceProtocol = 'sudoku-sync-presence'

export type LiveConnection = 'inactive' | 'connecting' | 'live' | 'fallback'

type Callbacks = {
  status: (status: LiveConnection) => void
  opened: () => void
  changes: () => void
  devices: () => void
  presence: (puzzles: readonly string[]) => void
  revoked: () => void
}

export function createSyncSocket(callbacks: Callbacks) {
  let device: Credentials | null = null
  let socket: WebSocket | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let delay = 1000
  let connectedAt = 0
  let lastPing = 0
  let waitingForPong = false
  let status: LiveConnection = 'inactive'
  let selectedPuzzle: string | null = null
  let announcedPuzzle: string | null = null
  let presenceSupported = false

  function publish(next: LiveConnection) {
    if (status === next) return
    status = next
    callbacks.status(next)
  }

  function ping(connection: WebSocket) {
    lastPing = Date.now()
    waitingForPong = true
    connection.send('ping')
  }

  function announcePuzzle() {
    const puzzle = document.hidden ? null : selectedPuzzle
    if (!presenceSupported || status !== 'live' || socket?.readyState !== WebSocket.OPEN || puzzle === announcedPuzzle) return
    socket.send('puzzle:' + (puzzle ?? ''))
    announcedPuzzle = puzzle
  }

  function close() {
    const previous = socket
    socket = undefined
    waitingForPong = false
    announcedPuzzle = null
    presenceSupported = false
    callbacks.presence([])
    previous?.close()
  }

  function stop() {
    clearTimeout(retry)
    retry = undefined
    delay = 1000
    device = null
    close()
    publish('inactive')
  }

  function revoked() {
    stop()
    callbacks.revoked()
  }

  function reconnect() {
    publish('fallback')
    if (retry !== undefined) return
    // Stagger reconnects when a Cloudflare restart drops many connections.
    retry = setTimeout(() => {
      retry = undefined
      open()
    }, delay * (1 + Math.random() * 0.25))
    delay = Math.min(delay * 2, 60_000)
  }

  function open() {
    if (!device || socket || retry !== undefined || !navigator.onLine || document.hidden) return
    try {
      if (status === 'inactive') publish('connecting')
      const url = new URL('/api/v1/live', location.href)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      const connection = new WebSocket(url, ['sudoku-sync', device.token, presenceProtocol])
      socket = connection
      connectedAt = Date.now()
      connection.onopen = () => {
        if (socket !== connection) return
        presenceSupported = connection.protocol === presenceProtocol
        ping(connection)
        callbacks.opened()
      }
      connection.onmessage = ({ data }) => {
        if (socket !== connection) return
        if (data === 'revoked') { revoked(); return }
        if (data === 'pong' && waitingForPong) {
          waitingForPong = false
          delay = 1000
          publish('live')
          announcePuzzle()
        }
        if (presenceSupported && typeof data === 'string' && data.startsWith('presence:')) {
          try {
            const peers: unknown = JSON.parse(data.slice('presence:'.length))
            if (Array.isArray(peers)) {
              const puzzles = peers.flatMap(peer => typeof peer?.puzzle === 'string' &&
                typeof peer?.device === 'string' && peer.device !== device?.id ? [peer.puzzle] : [])
              callbacks.presence([...new Set(puzzles)])
            }
          } catch { /* An invalid frame cannot change presence. */ }
        }
        if (!document.hidden && data === 'changes') callbacks.changes()
        if (!document.hidden && data === 'devices') callbacks.devices()
      }
      connection.onclose = ({ code }) => {
        if (socket !== connection) return
        close()
        if (code === 4001) revoked()
        else reconnect()
      }
    } catch {
      reconnect()
    }
  }

  return {
    showPuzzle(puzzle: string | null) {
      selectedPuzzle = puzzle
      announcePuzzle()
    },
    update(next: Credentials | null) {
      if (!next || !navigator.onLine) { stop(); return }
      if (next.id !== device?.id || next.token !== device.token) {
        stop()
        device = next
      }
      open()
    },
    isOpen: () => status === 'live' && socket?.readyState === WebSocket.OPEN,
    check(now: number) {
      const connectionTimedOut = socket?.readyState === WebSocket.CONNECTING && now - connectedAt >= 15_000
      const heartbeatTimedOut = waitingForPong && now - lastPing >= 15_000
      if (connectionTimedOut || heartbeatTimedOut) {
        close()
        reconnect()
      }
      if (socket?.readyState === WebSocket.OPEN && !waitingForPong && now - lastPing >= 45_000) {
        if (now - lastPing >= 60_000 && status === 'live') publish('connecting')
        ping(socket)
      }
    },
    stop,
  }
}
