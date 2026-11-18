import { Check, Search } from 'lucide-react'
import { useId, useState } from 'react'
import type { VariantRule } from '../sudoku/engine'
import { jigsawLayout, variantSeeds } from '../sudoku/variant-generation'
import { regionMembership, VARIANTS, WINDOKU_REGIONS, type VariantId } from '../sudoku/variants'
import { VariantClues } from './VariantClues'

const previews: Record<VariantId, readonly VariantRule[]> = {
  classic: [],
  'killer-cages': [{ type: 'killer-cages', cages: [{ cells: [10, 11, 20], sum: 12 }, { cells: [33, 34, 43, 52], sum: 23 }, { cells: [49, 58, 59], sum: 18 }] }],
  windoku: WINDOKU_REGIONS.map(cells => ({ type: 'extra-house', cells })),
  diagonal: [{ type: 'diagonal', diagonal: 'main' }, { type: 'diagonal', diagonal: 'anti' }],
  jigsaw: [],
  'anti-knight': [],
  thermometer: [{ type: 'thermometer', cells: [10, 19, 29, 30] }, { type: 'thermometer', cells: [68, 58, 49, 48] }],
  arrow: [{ type: 'arrow', circle: 28, cells: [29, 39, 40] }, { type: 'arrow', circle: 61, cells: [52, 43] }],
  kropki: [{ type: 'kropki', consecutive: { pairs: [[20, 21], [48, 57], [31, 40]] }, ratioTwo: { pairs: [[10, 19], [50, 51], [57, 58]] } }],
}

const previewRegions = regionMembership(jigsawLayout(variantSeeds.jigsaw.easy![0].regions!).regions)
const previewRegionEdges = previewRegions.flatMap((region, cell) => {
  const x = cell % 9
  const y = Math.floor(cell / 9)
  const edges = []
  if (x < 8 && region !== previewRegions[cell + 1]) edges.push(`M${x + 1},${y}v1`)
  if (y < 8 && region !== previewRegions[cell + 9]) edges.push(`M${x},${y + 1}h1`)
  return edges
}).join(' ')

export function VariantPreview({ variant }: { variant: VariantId }) {
  return <span className="variant-preview" data-variant={variant} aria-hidden="true">
    {previews[variant].length > 0 && <VariantClues rules={previews[variant]} />}
    {variant === 'jigsaw' && <svg className="variant-clues" viewBox="0 0 9 9" focusable="false">
      <path className="variant-preview-regions" d={previewRegionEdges} />
    </svg>}
    {variant === 'anti-knight' && <span className="variant-knight">♞</span>}
  </span>
}

export function VariantSelector({ value, onChange, busy }: {
  value: VariantId; onChange: (variant: VariantId) => void; busy: boolean
}) {
  const group = useId()
  const description = useId()
  const [query, setQuery] = useState('')
  const search = query.trim().toLowerCase().replace(/[-\s]+/g, ' ')
  const variants = (Object.keys(VARIANTS) as VariantId[]).filter((id) =>
    VARIANTS[id].name.toLowerCase().replace(/[-\s]+/g, ' ').includes(search))

  return <fieldset className="variant-picker" disabled={busy} aria-describedby={description}>
    <legend>Sudoku variant</legend>
    <label className="variant-search">
      <Search size={17} aria-hidden="true" />
      <span className="sr-only">Search variants</span>
      <input type="search" value={query} placeholder="Search variants" autoComplete="off"
        onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault()
        }} />
    </label>
    <div className="variant-options">
      {variants.map((id) => <label key={id} className="variant-option">
        <input className="sr-only" type="radio" name={group} value={id} checked={value === id} onChange={() => onChange(id)} />
        <VariantPreview variant={id} />
        <span>{VARIANTS[id].name}</span>
        {value === id && <Check className="variant-check" size={14} aria-hidden="true" />}
      </label>)}
    </div>
    {variants.length === 0 && <p className="variant-empty" role="status">No variants found. Try another search.</p>}
    <p id={description} className="variant-description" aria-live="polite" aria-atomic="true">
      <strong>{VARIANTS[value].name}</strong>
      <span>{VARIANTS[value].rule}</span>
    </p>
  </fieldset>
}
