import { ChevronRight } from 'lucide-react'
import { isSolved, valuesOf, type Game } from '../sudoku/game'
import { PuzzleRowContent } from './PuzzleRowContent'

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
              <PuzzleRowContent values={valuesOf(game)} size={game.grid?.size} title={game.title} detail={status}
                trailing={current ? <span className="current-dot" aria-hidden="true" /> : <ChevronRight size={17} className="row-arrow" aria-hidden="true" />} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
