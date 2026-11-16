import { ChevronRight, Plus } from 'lucide-react'
import { isSolved, progressOf, valuesOf, type Game } from '../sudoku/game'

export function PuzzleLibrary({ games, active, onSelect, onNew }: {
  games: Game[]
  active: string | null
  onSelect: (id: string) => void
  onNew: () => void
}) {
  return (
    <section className="surface library" id="my-puzzles" aria-labelledby="library-heading">
      <div className="panel-heading">
        <h2 id="library-heading">My puzzles</h2>
        <button className="icon-button" onClick={onNew} aria-label="Add a puzzle" title="Add a puzzle"><Plus size={19} /></button>
      </div>
      {games.length ? (
        <ul className="game-list">
          {games.map((game) => {
            const { filled, total } = progressOf(game)
            const status = game.source === 'draft' ? 'Draft' : isSolved(game) ? 'Solved' : `${filled} of ${total} filled`
            const current = active === game.id
            return (
              <li key={game.id}>
                <button className="game-row" onClick={() => onSelect(game.id)} aria-current={current ? 'true' : undefined}>
                  <span className="mini-grid" aria-hidden="true">
                    {[...valuesOf(game)].map((digit, i) => <i key={i} data-filled={digit !== '0'} />)}
                  </span>
                  <span className="game-row-copy"><strong>{game.title}</strong><small>{status}</small></span>
                  {current ? <span className="current-dot" aria-hidden="true" /> : <ChevronRight size={17} className="row-arrow" aria-hidden="true" />}
                </button>
              </li>
            )
          })}
        </ul>
      ) : <p className="empty-library">Puzzles you start appear here.</p>}
    </section>
  )
}
