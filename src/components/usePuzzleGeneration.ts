import { useEffect, useRef, useState } from 'react'
import { EngineError, runEngine, type Difficulty } from '../sudoku/engine'
import { createGameId, makeGame } from '../sudoku/game'
import { roomStore } from '../sudoku/storage'

export function usePuzzleGeneration() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function generate(difficulty: Difficulty, onGenerated?: () => void) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      const maxAttempts = difficulty === 'extreme' ? 2048 : 512
      const givens = await runEngine({
        type: 'generate-targeted', seed, maxAttempts, target: { type: 'difficulty', level: difficulty },
      })
      if (!mounted.current) return
      const titles = new Set(roomStore.getSnapshot().games.map((game) => game.title))
      let n = 1
      while (titles.has(`Puzzle ${n}`)) n++
      const game = makeGame(createGameId(), `Puzzle ${n}`, givens, 'generated')
      roomStore.add({ ...game, difficulty })
      onGenerated?.()
    } catch (reason) {
      if (mounted.current) {
        setError(reason instanceof EngineError && reason.code === 'search-limit'
          ? 'The engine couldn’t find a puzzle at this difficulty. Try again.'
          : (reason as Error).message)
      }
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return { busy, error, generate }
}
