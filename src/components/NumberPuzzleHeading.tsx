import { Link, useCanGoBack, useLocation, useRouter } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { iconButtonClassName } from './Button'
import type { NumberGame } from './NumberPuzzleTypes'

export function NumberGameHeading({ game, title, inPlay, children }: {
  game: NumberGame; title: string; inPlay?: boolean; children?: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const state = useLocation({ select: location => location.state })
  const fromParent = inPlay ? state.fromNumberDifficulty === game || game === 'kakuro' && state.fromKakuroDifficulty
    : state.fromPuzzleGameTypes

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [title])

  return <header className="puzzles-page-heading number-puzzle-heading">
    <Link to={inPlay ? `/puzzles/${game}` : '/puzzles/games'} className={iconButtonClassName('secondary', inPlay ? undefined : 'puzzles-back')}
      aria-label={inPlay ? `Back to ${title} difficulty` : 'Back to game types'}
      onClick={event => {
        if (fromParent && canGoBack && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
          event.preventDefault()
          router.history.back()
        }
      }}>
      <ChevronLeft size={21} aria-hidden="true" />
    </Link>
    {inPlay ? <div><h1 ref={heading} tabIndex={-1}>{title}</h1>{children}</div>
      : <h1 id="puzzles-page-title" ref={heading} tabIndex={-1}>{title}</h1>}
  </header>
}
