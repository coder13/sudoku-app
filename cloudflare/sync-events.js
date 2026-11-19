import { DurableObject } from 'cloudflare:workers'

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
    this.ctx.acceptWebSocket(server, [device])
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'sudoku-sync' } })
  }

  webSocketMessage(socket) {
    socket.close(1008, 'Unsupported message')
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
