import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { valuesOf, type Game } from '../sudoku/game'
import { lastPlayed } from '../sudoku/puzzle-activity'

export function ResumePuzzles({ games }: { games: Game[] }) {
  return <main className="page sync-page">
    <h1>In-progress puzzles</h1>
    <ul className="game-list">{games.map(game => (
      <li key={game.id}><Link className="game-row" to="/" search={{ puzzle: game.id }}>
        <span className="mini-grid" aria-hidden="true">{[...valuesOf(game)].map((digit, i) => <i key={i} data-filled={digit !== '0'} />)}</span>
        <span className="game-row-copy"><strong>{game.title}</strong>
          <small>{game.source === 'draft' ? 'Draft · ' : ''}Last played <time dateTime={new Date(lastPlayed(game)).toISOString()}>{new Date(lastPlayed(game)).toLocaleString()}</time></small>
        </span><ChevronRight size={17} aria-hidden="true" />
      </Link></li>
    ))}</ul>
    <Link className="button primary" to="/puzzles/new">New puzzle</Link>
    <Link className="button secondary" to="/sync">Device sync</Link>
  </main>
}
