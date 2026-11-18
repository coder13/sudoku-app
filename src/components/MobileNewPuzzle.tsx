import { Button } from './Button'
import { useState } from 'react'
import type { DifficultyPreference } from '../sudoku/difficulty'
import { DifficultySelector } from './DifficultySelector'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check, ChevronRight, Dices, FileUp, Gauge, PencilLine } from 'lucide-react'
import type { NewPuzzlePreference } from '../sudoku/preferences'
import { VARIANTS, variantDifficulty, variantDifficultyLabel, type VariantId } from '../sudoku/variants'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'
import { VariantPreview } from './VariantSelector'

export type MobileNewPuzzleScreen = 'variant' | 'difficulty' | 'start'

export function MobileNewPuzzle({ screen, variant, preference, remember, done, onCreate }: {
  screen: MobileNewPuzzleScreen
  variant: VariantId
  preference: NewPuzzlePreference
  remember: (preference: NewPuzzlePreference) => void
  done: (preference: NewPuzzlePreference) => void
  onCreate: () => void
}) {
  const navigate = useNavigate()
  const { busy, error, generate } = usePuzzleGeneration()
  const { recommended } = usePlayerRating()
  const [selection, setSelection] = useState<DifficultyPreference | null>(null)
  const selected = variantDifficulty(variant, selection ?? preference.difficulty)
  function applySettings(variant: VariantId, difficulty: DifficultyPreference) {
    remember({ variant, difficulty: variantDifficulty(variant, difficulty) })
    void navigate({ to: '/puzzles/new', search: {}, replace: true })
  }
  const createButton = <Button type="button" disabled={busy} onClick={onCreate}>
    <PencilLine size={18} aria-hidden="true" /> Create by hand
  </Button>

  if (screen === 'variant') return <section className="mobile-new-puzzle" aria-labelledby="puzzles-page-title">
    <div className="main-menu-mobile-list mobile-variant-list">
      {(Object.keys(VARIANTS) as VariantId[]).map((id) => <button type="button" key={id}
        aria-label={VARIANTS[id].name} aria-describedby={`mobile-variant-${id}-rule`}
        aria-pressed={preference.variant === id} onClick={() => applySettings(id, preference.difficulty)}>
        <VariantPreview variant={id} />
        <span><strong>{VARIANTS[id].name}</strong><small id={`mobile-variant-${id}-rule`}>{VARIANTS[id].rule}</small></span>
        {preference.variant === id ? <Check size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
      </button>)}
    </div>
    {createButton}
  </section>

  if (screen === 'difficulty') return <section className="mobile-new-puzzle" aria-labelledby="puzzles-page-title">
    <p className="mobile-new-puzzle-variant"><VariantPreview variant={variant} />{VARIANTS[variant].name}</p>
    <DifficultySelector value={selected} recommended={recommended} variant={variant} onChange={setSelection} />
    <Button type="button" variant="primary" onClick={() => applySettings(variant, selected)}>
      Done <Check size={18} aria-hidden="true" />
    </Button>
  </section>

  return <section className="mobile-new-puzzle" aria-labelledby="puzzles-page-title">
    <div className="main-menu-mobile-list">
      <button type="button" disabled={busy} onClick={() => { void navigate({ to: '/puzzles/new', search: { step: 'variant' } }) }}>
        <VariantPreview variant={preference.variant} />
        <span><strong>Change variant</strong><small>{VARIANTS[preference.variant].name}</small></span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <button type="button" disabled={busy} onClick={() => {
        void navigate({ to: '/puzzles/new', search: { step: 'difficulty', variant: preference.variant } })
      }}>
        <span className="main-menu-icon"><Gauge size={21} aria-hidden="true" /></span>
        <span><strong>Change difficulty</strong><small>{variantDifficultyLabel(preference.variant, preference.difficulty, recommended)}</small></span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <Link to="/import" disabled={busy}>
        <span className="main-menu-icon"><FileUp size={21} aria-hidden="true" /></span>
        <strong>Import a puzzle</strong>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <Button type="button" variant="primary" className="puzzle-start-button" disabled={busy}
      onClick={() => { void generate(selected, () => done({ variant, difficulty: selected }), variant) }}>
      <Dices size={18} aria-hidden="true" /> {busy ? 'Generating…' : 'Start puzzle'}
    </Button>
    {createButton}
  </section>
}
