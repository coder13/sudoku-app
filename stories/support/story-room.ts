import { STARTER_GAME, type Game } from '../../src/sudoku/game'
import { initialPlayerRating } from '../../src/sudoku/player-rating'
import type { roomStore as appStore } from '../../src/sudoku/storage'

type Room = ReturnType<typeof appStore.getSnapshot>
const starter = { ...STARTER_GAME, difficulty: 'easy' } satisfies Game
let room: Room = { games: [starter], active: starter.id, stoppedPlaying: false, storageAvailable: true, playerRating: initialPlayerRating }
const listeners = new Set<() => void>()

function publish(next: Room) {
  room = next
  listeners.forEach((listener) => listener())
}

export function seedRoom(games: Game[], active = games[0]?.id ?? null, storageAvailable = true) {
  publish({ games, active, stoppedPlaying: false, storageAvailable, playerRating: initialPlayerRating })
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
    const game = room.games.find((game) => game.id === id)
    if (!game) return
    if (game.savedForLater) roomStore.update(id, (saved) => ({ ...saved, savedForLater: undefined }))
    publish({ ...room, active: id, stoppedPlaying: false })
  },
  stopPlaying(id) {
    if (room.active === id) publish({ ...room, active: null, stoppedPlaying: true })
  },
  add(game) {
    publish({ ...room, games: [game, ...room.games], active: game.id, stoppedPlaying: false })
  },
  update(id, update) {
    const game = room.games.find((item) => item.id === id)
    if (!game) return
    const next = update(game)
    if (next !== game) publish({ ...room, games: room.games.map((item) => item.id === id ? next : item) })
  },
  finishRatingAttempt() {},
  remove(id) {
    const games = room.games.filter((game) => game.id !== id)
    publish({ ...room, games, active: room.active === id ? games.find((game) => !game.savedForLater)?.id ?? null : room.active })
  },
}
