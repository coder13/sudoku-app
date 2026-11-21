import { useRef, useState, type CSSProperties } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Braces } from 'lucide-react'
import { useArgs } from 'storybook/preview-api'
import benchmarks from '../../crates/engine/benches/fixtures/variants.json'
import { Board } from '../../src/components/Board'
import { Modal } from '../../src/components/Modal'
import { HighlightSettings } from '../../src/components/Settings'
import { VariantPreview } from '../../src/components/VariantPreview'
import type { VariantPuzzle } from '../../src/sudoku/engine'
import { DIGITS, valuesOf } from '../../src/sudoku/game'
import { DEFAULT_HIGHLIGHT_PREFERENCES } from '../../src/sudoku/preferences'
import { THEME_OPTIONS, THEME_TOKENS, type ResolvedColorMode, type ThemeId } from '../../src/sudoku/themes'
import { variantHouseMasks, type VariantId } from '../../src/sudoku/variants'
import { inProgress } from '../support/fixtures'
import { InputExample, inputExampleArgs } from '../support/input-example'

const palette = [
  ['pageBg', 'Page', '--page-bg'],
  ['surface', 'Surface', '--surface'],
  ['ink', 'Text', '--ink'],
  ['primaryBg', 'Primary button', '--primary-bg'],
  ['boardBg', 'Grid background', '--board-bg'],
  ['gridLine', 'Cell borders', '--grid-line'],
  ['gridStrong', 'Box and region borders', '--grid-strong'],
  ['boardInk', 'Givens', '--board-ink'],
  ['entryInk', 'Placed digits', '--entry-ink'],
  ['candidateInk', 'Candidates', '--candidate-ink'],
  ['extraHouseBg', 'Additional houses', '--extra-house-bg'],
  ['peerBg', 'Related cells', '--peer-bg'],
  ['boardSelectedBg', 'Selected cells', '--board-selected-bg'],
  ['boardSelectedBorder', 'Selected cell and candidate outlines', '--board-selected-border'],
  ['matchingBg', 'Matching highlights', '--matching-bg'],
] as const

type Args = { highlightedDigit: number; showCandidates: boolean; highlightCandidatePairs: boolean; showGuides: boolean } &
  Partial<Record<typeof palette[number][0], string>>

const initialDigit = 5
// Select outside the extra houses so their base fill and peer shading are both visible.
const initialCell = 39

function gridSample(label: string, variant: VariantId, puzzle: VariantPuzzle, values = puzzle.givens) {
  return {
    label, variant, givens: puzzle.givens, values,
    variantPuzzle: variant === 'classic' ? undefined : puzzle,
    candidates: variantHouseMasks(puzzle, values),
  }
}

const variantSamples = ([
  ['x-sudoku', 'X Sudoku', 'diagonal'],
  ['windoku', 'Windoku', 'windoku'],
  ['jigsaw-killer', 'Jigsaw + Killer', 'jigsaw'],
] as const).map(([id, label, variant]) => {
  const puzzle = benchmarks.find(({ name }) => name === id)!.position as VariantPuzzle
  return gridSample(label, variant, puzzle)
})

const samples = [
  gridSample('Classic Sudoku', 'classic', { version: 1, givens: inProgress.givens }, valuesOf(inProgress)),
  ...variantSamples,
]

function ThemeKitchenSink({ theme, mode, args, onDigitChange, onToggleCandidatePairs, onResetHighlights }: {
  theme: ThemeId; mode: ResolvedColorMode; args: Args
  onDigitChange: (digit: number | null) => void
  onToggleCandidatePairs: () => void
  onResetHighlights: () => void
}) {
  const tokens = THEME_TOKENS[theme][mode]
  const themeName = THEME_OPTIONS.find(({ id }) => id === theme)!.name
  const [highlighting, setHighlighting] = useState(DEFAULT_HIGHLIGHT_PREFERENCES)
  const [selectedCell, setSelectedCell] = useState<number | null>(initialCell)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsButton = useRef<HTMLButtonElement>(null)
  const highlightedDigit = args.highlightedDigit || null
  const gridHighlighting = highlightedDigit === null
    ? { ...highlighting, matchingDigits: false, matchingCandidates: false }
    : highlighting
  const style = Object.fromEntries(palette.flatMap(([key, , variable]) => args[key] ? [[variable, args[key]]] : [])) as CSSProperties

  function resetHighlighting() {
    setHighlighting(DEFAULT_HIGHLIGHT_PREFERENCES)
    setSelectedCell(initialCell)
    onResetHighlights()
    setDialogOpen(false)
  }

  function closeActions() {
    setActionsOpen(false)
    actionsButton.current?.focus({ preventScroll: true })
  }

  return <main className="theme-kitchen-sink" style={style}>
    <div className="theme-samples">
      <h1>{themeName}</h1>
      <dl className="theme-sample-palette" aria-label="Theme colors">
        {palette.map(([key, label]) => <div key={key} className="surface">
          <dt><span aria-hidden="true" style={{ background: args[key] || tokens[key] }} />{label}</dt>
          <dd><code>{args[key] || tokens[key]}</code></dd>
        </div>)}
      </dl>

      <div className="theme-sample-grids">
        {samples.map(({ label, variant, variantPuzzle, givens, values, candidates }) => <figure key={label} className="surface theme-sample-grid">
          <figcaption><VariantPreview variant={variant} />{label}</figcaption>
          <Board variantPuzzle={variantPuzzle} givens={givens} values={values}
            label={`${label} grid`} showGuides={args.showGuides} candidates={args.showCandidates ? candidates : undefined}
            highlightedDigit={highlightedDigit} highlighting={gridHighlighting}
            highlightCandidateCells
            highlightCandidateCount={args.highlightCandidatePairs && args.showCandidates ? 2 : null}
            selected={selectedCell === null ? [] : [selectedCell]} active={selectedCell ?? initialCell}
            onCell={(cell) => {
              setSelectedCell(cell === selectedCell ? null : cell)
              const digit = Number(values[cell])
              if (digit) onDigitChange(digit)
            }} />
        </figure>)}
      </div>

      <div className="theme-sample-controls">
        <section className="surface theme-sample-panel" aria-label="Keypad and buttons">
          <h2>Keypad and buttons</h2>
          <InputExample {...inputExampleArgs} selectedDigit={highlightedDigit} onDigitChange={onDigitChange}
            actionsButtonRef={actionsButton} actionsOpen={actionsOpen} onActions={() => setActionsOpen(open => !open)}
            actionsMenu={actionsOpen && <div className="app-menu theme-sample-input-actions" id="input-actions-menu"
              role="group" aria-label="Input actions" onBlur={event => {
                if (event.relatedTarget !== actionsButton.current && !event.currentTarget.contains(event.relatedTarget)) setActionsOpen(false)
              }} onKeyDown={event => {
                if (event.key !== 'Escape') return
                event.preventDefault()
                closeActions()
              }}>
              <button type="button" autoFocus aria-pressed={args.highlightCandidatePairs} onClick={() => {
                onToggleCandidatePairs()
                closeActions()
              }}><Braces size={17} aria-hidden="true" /> Highlight {'{x,y}'} cells</button>
            </div>} />
          <div className="theme-sample-actions">
            <button className="button primary" onClick={() => setDialogOpen(true)}>Open dialog</button>
            <button className="button secondary" onClick={resetHighlighting}>Reset highlighting</button>
          </div>
        </section>
        <div className="surface theme-sample-panel">
          <HighlightSettings highlighting={highlighting} setHighlighting={setHighlighting} />
        </div>
      </div>
      <Modal title="Reset highlighting" open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <p>Restore the default highlighting settings for this preview?</p>
        <div className="dialog-actions">
          <button className="button secondary" onClick={() => setDialogOpen(false)}>Cancel</button>
          <button className="button danger" onClick={resetHighlighting}>Reset</button>
        </div>
      </Modal>
    </div>
  </main>
}

const meta = {
  title: 'Large/Appearance/Theme kitchen sinks',
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { highlightedDigit: initialDigit, showCandidates: true, highlightCandidatePairs: false, showGuides: false },
  argTypes: {
    highlightedDigit: { name: 'Highlighted digit', options: [0, ...DIGITS], control: { type: 'select', labels: { 0: 'None' } } },
    showCandidates: { name: 'Show candidates' },
    highlightCandidatePairs: { name: 'Highlight two-candidate cells' },
    showGuides: { name: 'Show grid guides' },
    ...Object.fromEntries(palette.map(([key, label]) => [key, {
      name: label, control: 'color' as const, table: { category: 'Color overrides' },
    }])),
  },
  render(args, { globals, parameters }) {
    const [, updateArgs, resetArgs] = useArgs<Args>()
    return <ThemeKitchenSink args={args} theme={parameters.appTheme} mode={globals.colorMode === 'dark' ? 'dark' : 'light'}
      onDigitChange={(digit) => updateArgs({ highlightedDigit: digit ?? 0 })}
      onToggleCandidatePairs={() => updateArgs({ highlightedDigit: 0, highlightCandidatePairs: !args.highlightCandidatePairs })}
      onResetHighlights={() => resetArgs(['highlightedDigit', 'highlightCandidatePairs'])} />
  },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

function themeStory(theme: ThemeId): Story {
  return { parameters: { appTheme: theme } }
}

export const Violet = themeStory('violet')
export const Ocean = themeStory('ocean')
export const Forest = themeStory('forest')
export const RosePine = { ...themeStory('rose-pine'), name: 'Rosé Pine' }
export const Catppuccin = themeStory('catppuccin')
export const Solarized = themeStory('solarized')
export const Nord = themeStory('nord')
export const Ayu = themeStory('ayu')
export const GitHub = { ...themeStory('github'), name: 'GitHub' }
export const One = themeStory('one')
export const TokyoNight = themeStory('tokyo-night')
export const Gruvbox = themeStory('gruvbox')
export const HighContrast = { ...themeStory('high-contrast'), name: 'High contrast' }
export const Andoku = themeStory('andoku')
