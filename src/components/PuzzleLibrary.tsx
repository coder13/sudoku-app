import { ChevronRight } from 'lucide-react'
import { isSolved, valuesOf, type Game } from '../sudoku/game'

export function PuzzleLibrary({ games, active, onSelect }: {
  games: Game[]
  active: string | null
  onSelect: (id: string) => void
}) {
  return (
    <ul className="game-list">
      {games.map((game) => {
        const status = game.source === 'draft' ? 'Draft' : isSolved(game) ? 'Solved' : null
        const current = active === game.id
        return (
          <li key={game.id}>
            <button className="game-row" onClick={() => onSelect(game.id)} aria-current={current ? 'true' : undefined}>
              <span className="mini-grid" aria-hidden="true">
                {[...valuesOf(game)].map((digit, i) => <i key={i} data-filled={digit !== '0'} />)}
              </span>
              <span className="game-row-copy"><strong>{game.title}</strong>{status && <small>{status}</small>}</span>
              {current ? <span className="current-dot" aria-hidden="true" /> : <ChevronRight size={17} className="row-arrow" aria-hidden="true" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
