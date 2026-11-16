import { STARTER_GAME, type Game } from '../../src/sudoku/game'
import type { roomStore as appStore } from '../../src/sudoku/storage'

type Room = ReturnType<typeof appStore.getSnapshot>
const starter = { ...STARTER_GAME, difficulty: 'easy' } satisfies Game
let room: Room = { games: [starter], active: starter.id, storageAvailable: true }
const listeners = new Set<() => void>()

function publish(next: Room) {
  room = next
  listeners.forEach((listener) => listener())
}

export function seedRoom(games: Game[], active = games[0]?.id ?? null, storageAvailable = true) {
  publish({ games, active, storageAvailable })
}

export const roomStore: typeof appStore = {
  subscribe(listener) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  getSnapshot: () => room,
  getServerSnapshot: () => room,
  connect: () => () => {},
  select(id) {
    if (room.games.some((game) => game.id === id)) publish({ ...room, active: id })
  },
  add(game) {
    publish({ ...room, games: [game, ...room.games], active: game.id })
  },
  update(id, update) {
    const game = room.games.find((item) => item.id === id)
    if (!game) return
    const next = update(game)
    if (next !== game) publish({ ...room, games: room.games.map((item) => item.id === id ? next : item) })
  },
  remove(id) {
    const games = room.games.filter((game) => game.id !== id)
    publish({ ...room, games, active: room.active === id ? games[0]?.id ?? null : room.active })
  },
}
