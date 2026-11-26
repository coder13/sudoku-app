import { Link, useCanGoBack, useRouter } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { DIFFICULTY_LABELS, DIFFICULTY_LEVELS } from '../sudoku/difficulty'
import { techniqueLabel } from '../sudoku/hints'
import ratingSample from '../sudoku/classic-rating-sample.json'
import generationTechniques from '../sudoku/generated/classic-generation-techniques.json'
import { IconButton, iconButtonClassName } from './Button'
import '../about.css'

const pointsFormat = new Intl.NumberFormat('en')

function rangeLabel([low, high]: readonly number[], format: (score: number) => string) {
  return low === high ? format(low) : `${format(low)}–${format(high)}`
}

/** Show the classic generation tiers and observed rating ranges in the app’s About route. */
export function AboutPage() {
  const heading = useRef<HTMLHeadingElement>(null)
  const router = useRouter()
  const canGoBack = useCanGoBack()
  useEffect(() => heading.current?.focus({ preventScroll: true }), [])

  return <main className="puzzles-page puzzles-subscreen about-page" aria-labelledby="about-title">
    <header className="puzzles-page-heading">
      {canGoBack ? <IconButton className="puzzles-back" aria-label="Back" onClick={() => router.history.back()}>
        <ChevronLeft size={21} aria-hidden="true" />
      </IconButton> : <Link to="/puzzles/browse" className={iconButtonClassName('secondary', 'puzzles-back')} aria-label="Back to puzzles">
        <ChevronLeft size={21} aria-hidden="true" />
      </Link>}
      <h1 id="about-title" ref={heading} tabIndex={-1}>About Sudoku</h1>
    </header>

    <section className="about-difficulties" aria-labelledby="about-difficulties">
      <div className="about-intro">
        <h2 id="about-difficulties">Classic difficulty tiers</h2>
        <p>Each list shows the techniques added at that tier. Earlier techniques stay available. The app’s solve path uses at least one technique from the puzzle’s tier, and the puzzle must resist the lower-tier solve checks.</p>
        <p>App points add up across the solve. SE rates the hardest step in Sukaku Explainer’s solve. The ranges show the middle half of a sample of {ratingSample.puzzlesPerTier} generated puzzles per tier. Individual scores can fall outside these ranges.</p>
      </div>

      <div className="about-tier-list">
        {DIFFICULTY_LEVELS.map(tier => {
          const label = DIFFICULTY_LABELS[tier]
          const { app, se } = ratingSample.tiers[tier]
          const techniques = generationTechniques.filter(technique => technique.tier === tier)
          return <section className="about-tier" key={tier} id={tier} aria-labelledby={`about-tier-${tier}`}>
            <div className="about-tier-heading">
              <h3 id={`about-tier-${tier}`}>{label}</h3>
              <dl className="about-scores">
                <div><dt>App points</dt><dd>{rangeLabel(app, pointsFormat.format)}</dd></div>
                <div>
                  <dt>{se ? 'SE rating' : 'SE sample'}</dt>
                  <dd>{se ? rangeLabel(se, score => score.toFixed(1)) : <>
                    {ratingSample.impossibleSe.score.toFixed(1)}
                    <small>{ratingSample.impossibleSe.rated} of {ratingSample.puzzlesPerTier} rated</small>
                  </>}</dd>
                </div>
              </dl>
            </div>
            <ul className="about-techniques" role="list" aria-label={`Techniques added at ${label}`}>
              {techniques.map(({ id }) => <li key={id}>
                <Link to="/learn/$technique" params={{ technique: id }}>{techniqueLabel(id)}</Link>
              </li>)}
            </ul>
          </section>
        })}
      </div>
    </section>
  </main>
}
