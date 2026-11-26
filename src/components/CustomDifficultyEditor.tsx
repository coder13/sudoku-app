import { useState } from 'react'
import { createUuid } from '../uuid'
import { CUSTOM_DIFFICULTY_NAME_LIMIT, type CustomDifficultyProfile } from '../sudoku/custom-difficulties'
import { DIFFICULTY_LABELS, DIFFICULTY_LEVELS, SINGLE_TECHNIQUES } from '../sudoku/difficulty'
import generationTechniques from '../sudoku/generated/classic-generation-techniques.json'
import { techniqueLabel } from '../sudoku/hints'
import { Button } from './Button'
import { SelectControl } from './SelectControl'

type TechniqueChoice = 'skip' | 'allow' | 'require'

/** Edit the allowed techniques and practice targets of a saved classic difficulty. */
export function CustomDifficultyEditor({ profile, names, onSave, onDelete }: {
  profile?: CustomDifficultyProfile
  names: readonly string[]
  onSave: (profile: CustomDifficultyProfile) => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(profile?.name ?? '')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [choices, setChoices] = useState<Record<string, TechniqueChoice>>(() => Object.fromEntries(
    (profile?.allowed ?? SINGLE_TECHNIQUES).map(id => [id, profile?.required.includes(id) ? 'require' : 'allow']),
  ))
  const allowed = generationTechniques.filter(({ id }) => choices[id] === 'allow' || choices[id] === 'require').map(({ id }) => id)
  const required = allowed.filter(id => choices[id] === 'require')
  const query = search.trim().toLowerCase()
  const visible = generationTechniques.filter(({ id }) => techniqueLabel(id).toLowerCase().includes(query))

  function save() {
    const title = name.trim()
    if (!title || !required.length) return
    if ([...names, ...DIFFICULTY_LEVELS.map(tier => DIFFICULTY_LABELS[tier]), 'Auto'].some(item => item.toLowerCase() === title.toLowerCase())) {
      setError('Choose a different difficulty name.')
      return
    }
    try {
      onSave({ id: profile?.id ?? `difficulty-${createUuid()}`, name: title, created: profile?.created ?? Date.now(), allowed, required })
    } catch { setError('Could not save this difficulty on this device.') }
  }

  return <form className="main-menu-section new-puzzle-step custom-difficulty-editor" aria-labelledby="puzzles-page-title"
    onSubmit={event => { event.preventDefault(); save() }}>
    <label>Difficulty name <input value={name} maxLength={CUSTOM_DIFFICULTY_NAME_LIMIT} required
      onChange={event => { setName(event.target.value); setError('') }} /></label>
    <p>Require the techniques you want to practice. Allow the techniques that can help complete the solve.</p>
    <label>Find a technique <input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <p role="status">{required.length ? `Required: ${required.map(techniqueLabel).join(', ')}` : 'Require at least one technique.'}</p>
    {DIFFICULTY_LEVELS.map(tier => {
      const techniques = visible.filter(item => item.tier === tier)
      return techniques.length > 0 && <details key={tier} className="custom-difficulty-techniques" open={query ? true : undefined}>
        <summary>{DIFFICULTY_LABELS[tier]}</summary>
        {techniques.map(({ id }) => <label key={id}>
          <span>{techniqueLabel(id)}</span>
          <SelectControl value={choices[id] ?? 'skip'} onChange={event => {
            setChoices(current => ({ ...current, [id]: event.target.value as TechniqueChoice }))
          }}>
            <option value="skip">Skip</option>
            <option value="allow">Allow</option>
            <option value="require">Require</option>
          </SelectControl>
        </label>)}
      </details>
    })}
    {!visible.length && <p>No matching techniques.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions">
      <Button type="submit" variant="primary" disabled={!name.trim() || !required.length}>Save difficulty</Button>
      {onDelete && (confirmDelete ? <>
        <Button type="button" variant="danger" onClick={() => {
          try { onDelete() } catch { setError('Could not delete this difficulty on this device.') }
        }}>Confirm delete</Button>
        <Button type="button" variant="quiet" onClick={() => setConfirmDelete(false)}>Cancel</Button>
      </> : <Button type="button" variant="quiet" onClick={() => setConfirmDelete(true)}>Delete difficulty</Button>)}
    </div>
  </form>
}
