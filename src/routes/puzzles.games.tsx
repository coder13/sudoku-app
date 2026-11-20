import { createFileRoute, Link, useCanGoBack, useLocation, useRouter } from '@tanstack/react-router'
import { Calculator, ChevronLeft, ChevronRight, Grid3X3, Hash, MoveHorizontal, Route as PathIcon, Sigma } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { NumberGame } from '../number-puzzles/catalog'
import { iconButtonClassName } from '../components/Button'
import '../components/puzzle-games.css'

export const Route = createFileRoute('/puzzles/games')({
  staticData: { standalonePuzzlePage: true },
  component: GameTypePicker,
})

function GameTypePicker() {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const fromSudokuVariant = useLocation({ select: location => location.state.fromSudokuVariant })
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  return <main className="puzzles-page puzzles-subscreen puzzle-game-page">
    <div className="puzzles-layout">
      <header className="puzzles-page-heading">
        <Link to="/puzzles/new" className={iconButtonClassName()} aria-label="Back to Sudoku variants"
          onClick={event => {
            if (fromSudokuVariant && canGoBack && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
              event.preventDefault()
              router.history.back()
            }
          }}>
          <ChevronLeft size={21} aria-hidden="true" />
        </Link>
        <h1 ref={heading} tabIndex={-1}>Choose a game type</h1>
      </header>
      <ul className="game-list main-puzzle-list motion-screen">
        <li><Link className="game-row" to="/puzzles/new">
          <Grid3X3 size={24} aria-hidden="true" />
          <span className="game-row-copy"><strong>Sudoku</strong><small>Place digits in rows, columns, and regions.</small></span>
          <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
        </Link></li>
        <li><Link className="game-row" to="/puzzles/kakuro" state={{ fromPuzzleGameTypes: true }}>
          <Hash size={24} aria-hidden="true" />
          <span className="game-row-copy"><strong>Kakuro</strong><small>Use digit sums to solve across and down clues.</small></span>
          <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
        </Link></li>
        <li><Link className="game-row" to="/puzzles/calcudoku" state={{ fromPuzzleGameTypes: true }}>
          <Calculator size={24} aria-hidden="true" />
          <span className="game-row-copy"><strong>Calcudoku</strong><small>Fill a grid with arithmetic cage clues.</small></span>
          <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
        </Link></li>
        <li><Link className="game-row" to="/puzzles/futoshiki" state={{ fromPuzzleGameTypes: true }}>
          <MoveHorizontal size={24} aria-hidden="true" />
          <span className="game-row-copy"><strong>Futoshiki</strong><small>Use inequality signs to compare neighboring numbers.</small></span>
          <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
        </Link></li>
        <li><Link className="game-row" to="/puzzles/hidato" state={{ fromPuzzleGameTypes: true }}>
          <PathIcon size={24} aria-hidden="true" />
          <span className="game-row-copy"><strong>Hidato</strong><small>Connect consecutive numbers to form a path.</small></span>
          <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
        </Link></li>
        <li><Link className="game-row" to="/puzzles/rullo" state={{ fromPuzzleGameTypes: true }}>
          <Sigma size={24} aria-hidden="true" />
          <span className="game-row-copy"><strong>Rullo</strong><small>Keep numbers that add up to each row and column target.</small></span>
          <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
        </Link></li>
      </ul>
    </div>
  </main>
}

declare module '@tanstack/history' {
  interface HistoryState {
    fromSudokuVariant?: boolean
    fromPuzzleGameTypes?: boolean
    fromKakuroDifficulty?: boolean
    fromNumberDifficulty?: NumberGame
    fromNumberPuzzleLibrary?: boolean
  }
}
