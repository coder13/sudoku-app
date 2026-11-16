import { useState, type ComponentProps } from 'react'
import type { StoryObj } from '@storybook/react-vite'
import { HintCard } from '../../src/components/HintCard'
import { SelectControl } from '../../src/components/SelectControl'
import { DIFFICULTY_LABELS } from '../../src/sudoku/difficulty'
import {
  CELL_REFERENCE_LABELS, DEFAULT_CELL_REFERENCE_STYLE, describeHint, isCellReferenceStyle, type CellReferenceStyle,
} from '../../src/sudoku/hints'
import { techniqueDifficulties } from '../../src/sudoku/technique-difficulties'
import { lessonExamples } from '../support/fixtures'
import { fallbackHints, hintMeta } from '../support/hint-stories'

const meta = { ...hintMeta, title: 'Small/Hints/Copy review', tags: ['autodocs'] }
export default meta
type Story = StoryObj<typeof meta>
const defaultFallbackHints = fallbackHints()

function CopyGallery() {
  const [query, setQuery] = useState('')
  const [cellReferenceStyle, setCellReferenceStyle] = useState<CellReferenceStyle>(DEFAULT_CELL_REFERENCE_STYLE)
  const [dismissed, setDismissed] = useState<string[]>([])
  const search = query.trim().toLowerCase()
  const groups = [
    ...Object.entries(DIFFICULTY_LABELS).map(([difficulty, label]) => ({
      label,
      items: Object.entries(techniqueDifficulties).flatMap(([id, level]) =>
        level === difficulty ? [{ id, hint: describeHint(lessonExamples[id].deduction, { difficulty: level, cellReferenceStyle }) }] : []),
    })),
    { label: 'Fallback messages', items: fallbackHints(cellReferenceStyle).map((hint, index) => ({ id: `fallback-${index}`, hint })) },
  ].flatMap(({ label, items }) => {
    const matches = items.filter(({ id, hint }) =>
      !dismissed.includes(id) && `${id} ${label} ${hint.title} ${hint.text}`.toLowerCase().includes(search))
    return matches.length ? [{ label, items: matches }] : []
  })
  return <div className="story-copy-gallery">
    <div className="story-hint-filters">
      <label>Filter hint copy
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try X-wing or place digit" />
      </label>
      <label>Cell references
        <SelectControl value={cellReferenceStyle} onChange={(event) => {
          const style = event.target.value
          if (isCellReferenceStyle(style)) setCellReferenceStyle(style)
        }}>
          {Object.entries(CELL_REFERENCE_LABELS).map(([style, label]) => <option key={style} value={style}>{label}</option>)}
        </SelectControl>
      </label>
    </div>
    {dismissed.length > 0 && <div><button className="button secondary" onClick={() => setDismissed([])}>Restore dismissed hints</button></div>}
    {!groups.length && <p role="status">No matching hints.</p>}
    {groups.map(({ label, items }) => <section key={label} aria-label={label}>
      <h2>{label}</h2>
      <div className="story-hint-grid">{items.map(({ id, hint }) =>
        <HintCard key={id} hint={hint} onClose={() => setDismissed((previous) => [...previous, id])} />)}</div>
    </section>)}
  </div>
}

export const AllTechniques: Story = {
  args: { hint: defaultFallbackHints[0] },
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => <CopyGallery />,
}
export const SingleFallback: Story = { args: { hint: defaultFallbackHints[0] } }
export const NoSupportedMove: Story = { args: { hint: defaultFallbackHints[1] } }
export const Conflicts: Story = { args: { hint: defaultFallbackHints[2] } }
export const NoActionsInDeduction: Story = { args: { hint: defaultFallbackHints[3] } }
export const Dismissible: Story = {
  args: { hint: defaultFallbackHints[0] },
  render: (args) => <DismissibleCard {...args} />,
}

function DismissibleCard({ hint, onClose }: ComponentProps<typeof HintCard>) {
  const [open, setOpen] = useState(true)
  return open ? <HintCard hint={hint} onClose={() => { onClose(); setOpen(false) }} />
    : <button className="button secondary" onClick={() => setOpen(true)}>View hint</button>
}
