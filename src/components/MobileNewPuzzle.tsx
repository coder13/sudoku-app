import { useState } from 'react'
import { DEFAULT_DIFFICULTY, type DifficultyPreference } from '../sudoku/difficulty'
import { DifficultyStepper } from './DifficultyStepper'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check, ChevronRight, Dices, Gauge, PencilLine } from 'lucide-react'
import type { NewPuzzlePreference } from '../sudoku/preferences'
import { VARIANTS, variantDifficulty, variantDifficultyLabel, type VariantId } from '../sudoku/variants'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'
import { VariantPreview } from './VariantSelector'

export type MobileNewPuzzleScreen = 'variant' | 'difficulty' | 'start'

export function MobileNewPuzzle({ screen, variant, remembered, remember, done, onCreate }: {
  screen: MobileNewPuzzleScreen
  variant: VariantId
  remembered: NewPuzzlePreference | null
  remember: (preference: NewPuzzlePreference) => void
  done: (preference: NewPuzzlePreference) => void
  onCreate: () => void
}) {
  const navigate = useNavigate()
  const { busy, error, generate } = usePuzzleGeneration()
  const { recommended } = usePlayerRating()
  const [selection, setSelection] = useState<DifficultyPreference | null>(null)
  const selected = variantDifficulty(variant, selection ?? remembered?.difficulty ?? DEFAULT_DIFFICULTY)
  const createButton = <button type="button" className="button secondary" disabled={busy} onClick={onCreate}>
    <PencilLine size={18} aria-hidden="true" /> Create by hand
  </button>

  if (screen === 'variant') return <section className="mobile-new-puzzle" aria-labelledby="puzzles-page-title">
    <div className="main-menu-mobile-list mobile-variant-list">
      {(Object.keys(VARIANTS) as VariantId[]).map((id) => <Link key={id}
        aria-label={VARIANTS[id].name} aria-describedby={`mobile-variant-${id}-rule`}
        to="/puzzles/new" search={{ step: 'difficulty', variant: id }}>
        <VariantPreview variant={id} />
        <span><strong>{VARIANTS[id].name}</strong><small id={`mobile-variant-${id}-rule`}>{VARIANTS[id].rule}</small></span>
        {remembered?.variant === id ? <Check size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
      </Link>)}
    </div>
    {createButton}
  </section>

  if (screen === 'difficulty') return <section className="mobile-new-puzzle" aria-labelledby="puzzles-page-title">
    <p className="mobile-new-puzzle-variant"><VariantPreview variant={variant} />{VARIANTS[variant].name}</p>
    <DifficultyStepper value={selected} recommended={recommended} variant={variant} onChange={setSelection} />
    <button type="button" className="button primary" onClick={() => {
      remember({ variant, difficulty: selected })
      void navigate({ to: '/puzzles/new', search: {}, replace: true })
    }}>Continue <ChevronRight size={18} aria-hidden="true" /></button>
  </section>

  if (!remembered) return null
  return <section className="mobile-new-puzzle" aria-labelledby="puzzles-page-title">
    <div className="main-menu-mobile-list">
      <button type="button" disabled={busy} onClick={() => { void navigate({ to: '/puzzles/new', search: { step: 'variant' } }) }}>
        <VariantPreview variant={remembered.variant} />
        <span><strong>Change variant</strong><small>{VARIANTS[remembered.variant].name}</small></span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <button type="button" disabled={busy} onClick={() => {
        void navigate({ to: '/puzzles/new', search: { step: 'difficulty', variant: remembered.variant } })
      }}>
        <span className="main-menu-icon"><Gauge size={21} aria-hidden="true" /></span>
        <span><strong>Change difficulty</strong><small>{variantDifficultyLabel(remembered.variant, remembered.difficulty, recommended)}</small></span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="button" className="button primary" disabled={busy}
      onClick={() => { void generate(remembered.difficulty, () => done(remembered), remembered.variant) }}>
      <Dices size={18} aria-hidden="true" /> {busy ? 'Generating…' : 'Start puzzle'}
    </button>
    {createButton}
  </section>
}
