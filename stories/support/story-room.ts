import { isSolved, STARTER_GAME, type Game } from '../../src/sudoku/game'
import { initialPlayerRating, type PlayerRating } from '../../src/sudoku/player-rating'
import type { roomStore as appStore } from '../../src/sudoku/storage'

type Room = ReturnType<typeof appStore.getSnapshot>
const starter = { ...STARTER_GAME, difficulty: 'easy' } satisfies Game
let room: Room = { games: [starter], active: starter.id, stoppedPlaying: false, storageAvailable: true, playerRating: initialPlayerRating }
const listeners = new Set<() => void>()

function publish(next: Room) {
  room = next
  listeners.forEach((listener) => listener())
}

function playPuzzle(games: Game[], selected: Game) {
  const next = games.map((game) => {
    if (game.id === selected.id) return game.savedForLater ? { ...game, savedForLater: undefined } : game
    if (game.id === room.active && game.started && game.source !== 'draft' && selected.source !== 'draft' && !isSolved(game)) {
      return { ...game, savedForLater: true as const }
    }
    return game
  })
  publish({ ...room, games: next, active: selected.id, stoppedPlaying: false })
}

export function seedRoom(games: Game[], active = games[0]?.id ?? null, storageAvailable = true) {
  publish({ games, active, stoppedPlaying: false, storageAvailable, playerRating: initialPlayerRating })
}

export function seedPlayerRating(playerRating: PlayerRating) {
  publish({ ...room, playerRating })
}

export const roomStore: typeof appStore = {
  subscribe(listener) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  getSnapshot: () => room,
  getServerSnapshot: () => room,
  setAutoPlacement(difficulty) {
    seedPlayerRating({ ...room.playerRating, recommended: difficulty })
  },
  connect: () => () => {},
  select(id) {
    const game = room.games.find((game) => game.id === id)
    if (game) playPuzzle(room.games, game)
  },
  saveForLater(id) {
    const game = room.games.find(item => item.id === id)
    if (!game || game.source === 'draft' || isSolved(game)) return
    roomStore.stopPlaying(id)
    roomStore.update(id, current => ({ ...current, savedForLater: true }))
  },
  stopPlaying(id) {
    if (room.active === id) publish({ ...room, active: null, stoppedPlaying: true })
  },
  add(game) {
    const games = [game, ...room.games]
    if (game.savedForLater) publish({ ...room, games })
    else playPuzzle(games, game)
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
