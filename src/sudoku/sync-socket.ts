import type { Credentials } from './sync-engine.ts'

type Callbacks = {
  opened: () => void
  changes: () => void
  devices: () => void
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

  function close() {
    const previous = socket
    socket = undefined
    waitingForPong = false
    previous?.close()
  }

  function stop() {
    clearTimeout(retry)
    retry = undefined
    delay = 1000
    device = null
    close()
  }

  function revoked() {
    stop()
    callbacks.revoked()
  }

  function reconnect() {
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
      const url = new URL('/api/v1/live', location.href)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      const connection = new WebSocket(url, ['sudoku-sync', device.token])
      socket = connection
      connectedAt = Date.now()
      connection.onopen = () => {
        if (socket !== connection) return
        delay = 1000
        lastPing = Date.now()
        waitingForPong = false
        callbacks.opened()
      }
      connection.onmessage = ({ data }) => {
        if (socket !== connection) return
        if (data === 'revoked') { revoked(); return }
        if (data === 'pong') waitingForPong = false
        if (!document.hidden && data === 'changes') callbacks.changes()
        if (!document.hidden && data === 'devices') callbacks.devices()
      }
      connection.onclose = ({ code }) => {
        if (socket !== connection) return
        socket = undefined
        if (code === 4001) revoked()
        else reconnect()
      }
    } catch {
      reconnect()
    }
  }

  return {
    update(next: Credentials | null) {
      if (!next || !navigator.onLine) { stop(); return }
      if (next.id !== device?.id || next.token !== device.token) {
        stop()
        device = next
      }
      open()
    },
    isOpen: () => socket?.readyState === WebSocket.OPEN,
    check(now: number) {
      const connectionTimedOut = socket?.readyState === WebSocket.CONNECTING && now - connectedAt >= 15_000
      const heartbeatTimedOut = waitingForPong && now - lastPing >= 15_000
      if (connectionTimedOut || heartbeatTimedOut) {
        close()
        reconnect()
      }
      if (socket?.readyState === WebSocket.OPEN && now - lastPing >= 45_000) {
        socket.send('ping')
        lastPing = now
        waitingForPong = true
      }
    },
    stop,
  }
}
