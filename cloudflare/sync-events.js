import { DurableObject } from 'cloudflare:workers'

const puzzleMessage = /^puzzle:([a-zA-Z0-9_-]{0,128})$/
const presenceProtocol = 'sudoku-sync-presence'

export class SyncEvents extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  fetch(request) {
    const device = request.headers.get('X-Sync-Device')
    if (!device || request.headers.get('Upgrade') !== 'websocket') {
      return new Response(null, { status: 426 })
    }
    const { 0: client, 1: server } = new WebSocketPair()
    const presence = request.headers.get('X-Sync-Presence') === '1'
    this.ctx.acceptWebSocket(server, presence ? [device, presenceProtocol] : [device])
    return new Response(null, { status: 101, webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': presence ? presenceProtocol : 'sudoku-sync' } })
  }

  presenceMessage(sockets) {
    const peers = sockets.flatMap(socket => {
      const selection = socket.readyState === WebSocket.OPEN && socket.deserializeAttachment()
      return selection ? [{ device: this.ctx.getTags(socket).find(tag => tag !== presenceProtocol), ...selection }] : []
    }).sort((a, b) => b.viewedAt - a.viewedAt)
    return 'presence:' + JSON.stringify(peers)
  }

  broadcastPresence(excluded) {
    const sockets = this.ctx.getWebSockets(presenceProtocol).filter(socket => socket !== excluded && socket.readyState === WebSocket.OPEN)
    const message = this.presenceMessage(sockets)
    for (const socket of sockets) {
      try { socket.send(message) }
      catch { if (socket.readyState === WebSocket.OPEN) socket.close(1011, 'Sync connection interrupted') }
    }
  }

  webSocketMessage(socket, message) {
    const selection = typeof message === 'string' && message.length <= 135 && puzzleMessage.exec(message)
    if (!selection || !this.ctx.getTags(socket).includes(presenceProtocol)) { socket.close(1008, 'Unsupported message'); return }
    const puzzle = selection[1] || null
    const previous = socket.deserializeAttachment()?.puzzle ?? null
    if (puzzle === previous) return
    socket.serializeAttachment(puzzle ? { puzzle, viewedAt: Date.now() } : null)
    this.broadcastPresence()
  }

  webSocketClose(socket) {
    if (socket.deserializeAttachment()) this.broadcastPresence(socket)
  }

  webSocketError(socket) {
    this.webSocketClose(socket)
  }

  notify(message, device) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue
      const sameDevice = this.ctx.getTags(socket).includes(device)
      if (message === 'changes' && sameDevice) continue
      try {
        if (message === 'revoked' && sameDevice) {
          socket.send('revoked')
          socket.close(4001, 'Device unlinked')
        } else {
          socket.send(message === 'revoked' ? 'devices' : message)
        }
      } catch {
        if (socket.readyState === WebSocket.OPEN) socket.close(1011, 'Sync connection interrupted')
      }
    }
  }
}

export default {
  fetch: () => new Response(null, { status: 404 }),
}
