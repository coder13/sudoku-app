import { Check } from 'lucide-react'
import { useId } from 'react'
import type { VariantRule } from '../sudoku/engine'
import { VARIANTS, type VariantId } from '../sudoku/variants'
import { VariantClues } from './VariantClues'

const previews: Record<VariantId, readonly VariantRule[]> = {
  classic: [],
  'killer-cages': [{ type: 'killer-cages', cages: [{ cells: [10, 11, 20], sum: 12 }, { cells: [33, 34, 43, 52], sum: 23 }, { cells: [49, 58, 59], sum: 18 }] }],
  diagonal: [{ type: 'diagonal', diagonal: 'main' }, { type: 'diagonal', diagonal: 'anti' }],
  'anti-knight': [],
  thermometer: [{ type: 'thermometer', cells: [10, 19, 29, 30] }, { type: 'thermometer', cells: [68, 58, 49, 48] }],
  arrow: [{ type: 'arrow', circle: 28, cells: [29, 39, 40] }, { type: 'arrow', circle: 61, cells: [52, 43] }],
  kropki: [{ type: 'kropki', consecutive: { pairs: [[20, 21], [48, 57], [31, 40]] }, ratioTwo: { pairs: [[10, 19], [50, 51], [57, 58]] } }],
}

function VariantPreview({ variant }: { variant: VariantId }) {
  return <span className="variant-preview" aria-hidden="true">
    {previews[variant].length > 0 && <VariantClues rules={previews[variant]} />}
    {variant === 'anti-knight' && <span className="variant-knight">♞</span>}
  </span>
}

export function VariantSelector({ value, onChange, busy }: {
  value: VariantId; onChange: (variant: VariantId) => void; busy: boolean
}) {
  const group = useId()
  const description = useId()
  return <fieldset className="variant-picker" disabled={busy} aria-describedby={description}>
    <legend>Sudoku variant</legend>
    <div className="variant-options">
      {(Object.keys(VARIANTS) as VariantId[]).map((id) => <label key={id} className="variant-option">
        <input className="sr-only" type="radio" name={group} value={id} checked={value === id} onChange={() => onChange(id)} />
        <VariantPreview variant={id} />
        <span>{VARIANTS[id].name}</span>
        {value === id && <Check className="variant-check" size={14} aria-hidden="true" />}
      </label>)}
    </div>
    <p id={description} aria-live="polite">{VARIANTS[value].rule}</p>
  </fieldset>
}
