import { isSolved, shouldOfferPuzzleSave, STARTER_GAME, type Game } from '../../src/sudoku/game'
import { pruneChainsAfterMove } from '../../src/sudoku/chain-sketch'
import { initialPlayerRating, type PlayerRating } from '../../src/sudoku/player-rating'
import type { roomStore as appStore } from '../../src/sudoku/storage'
import { puzzleTiming } from '../../src/sudoku/puzzle-timing'

type Room = ReturnType<typeof appStore.getSnapshot>
const starter = { ...STARTER_GAME, difficulty: 'easy' } satisfies Game
let room: Room = { games: [starter], active: starter.id, stoppedPlaying: false, storageAvailable: true, playerRating: initialPlayerRating }
const selections = new Set<(id: string | null) => void>()
const listeners = new Set<() => void>()

function publish(next: Room) {
  room = next
  listeners.forEach((listener) => listener())
}

function playPuzzle(games: Game[], selected: Game) {
  const next = games.map((game) => {
    if (game.id === selected.id) return game.savedForLater ? { ...game, savedForLater: undefined } : game
    return game
  })
  publish({ ...room, games: next, active: selected.id, stoppedPlaying: false })
  selections.forEach(listener => listener(selected.id))
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
  onPlay(listener) { selections.add(listener); return () => { selections.delete(listener) } },
  onEdit() { return () => {} },
  view(id) { if (room.active !== id) publish({ ...room, active: id }) },
  refreshPuzzle() {},
  playedMiniGivens: () => room.games.filter(game => game.grid && !game.algebraic && game.source !== 'draft').map(game => game.givens),
  playedSizedGivens: () => [],

  playedAlgebraicPuzzles: () => [],
  getSnapshot: () => room,
  getServerSnapshot: () => room,
  connect: () => () => {},
  select(id) {
    const game = room.games.find((game) => game.id === id)
    if (game) playPuzzle(room.games, game)
  },
  saveForLater(id) {
    const game = room.games.find(item => item.id === id)
    if (!game || game.source === 'draft' || isSolved(game)) return
    roomStore.stopPlaying(id)
    roomStore.update(id, current => ({ ...current, pendingSave: undefined, savedForLater: true }))
  },
  resolvePendingSave(id, save) {
    if (!shouldOfferPuzzleSave(room.games.find(game => game.id === id))) return
    if (save) roomStore.saveForLater(id, { notify: false })
    else roomStore.remove(id, { notify: false })
  },
  stopPlaying(id) {
    if (room.active === id) publish({ ...room, active: null, stoppedPlaying: true })
  },
  startFirstPuzzle() {},
  add(game) {
    const games = [game, ...room.games]
    if (game.savedForLater) publish({ ...room, games })
    else playPuzzle(games, game)
  },
  update(id, update) {
    const game = room.games.find((item) => item.id === id)
    if (!game) return
    const next = pruneChainsAfterMove(game, update(game))
    if (next !== game) publish({ ...room, games: room.games.map((item) => item.id === id ? next : item) })
  },
  advanceElapsed(id, seconds) {
    if (!Number.isSafeInteger(seconds) || seconds <= 0 || !puzzleTiming.getSnapshot().trackTime) return
    roomStore.update(id, game => !game.started || game.paused || game.timeUntracked || isSolved(game) ||
      !Number.isSafeInteger(game.elapsed + seconds) ? game : { ...game, elapsed: game.elapsed + seconds })
  },
  flushElapsed() {},
  finishRatingAttempt() {},
  remove(id) {
    const games = room.games.filter((game) => game.id !== id)
    publish({ ...room, games, active: room.active === id ? games.find((game) => !game.savedForLater)?.id ?? null : room.active })
  },
}
