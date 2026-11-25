import { useId, useSyncExternalStore } from 'react'
import { Button } from './Button'
import { SlidersHorizontal } from 'lucide-react'
import { type ErrorMode } from '../sudoku/game'
import { CELL_REFERENCE_LABELS, type CellReferenceStyle } from '../sudoku/hints'
import { puzzleTiming } from '../sudoku/puzzle-timing'
import { type AdvancedModes } from '../sudoku/preferences'
import { VARIANT_TOOL_OPTIONS, type VariantToolId } from '../sudoku/variants'
import { SelectControl } from './SelectControl'
import { SettingOption } from './SettingOption'
import { SettingToggle } from './SettingToggle'
import { usePlayPreference } from './usePlayPreference'

export type GeneralSettingsSection = 'input' | 'solving' | 'hints'

const cellReferenceDescriptions: Record<CellReferenceStyle, string> = {
  automatic: 'Use concise references for Tricky and higher techniques.',
  concise: 'Show cells as r1c6.',
  verbose: 'Show cells as row 1, column 6.',
}
const cellReferenceStyles = Object.keys(CELL_REFERENCE_LABELS) as CellReferenceStyle[]

function PuzzleTimingSettings() {
  const timing = useSyncExternalStore(puzzleTiming.subscribe, puzzleTiming.getSnapshot, puzzleTiming.getServerSnapshot)
  return <fieldset>
    <legend>Solve timing</legend>
    <SettingToggle label="Track solve time" description="Turn this off to make puzzles untimed."
      descriptionId="track-solve-time-description" checked={timing.trackTime}
      onChange={checked => puzzleTiming.set('trackTime', checked)} />
    <SettingToggle label="Show timer" checked={timing.showTimer} disabled={!timing.trackTime}
      onChange={checked => puzzleTiming.set('showTimer', checked)} />
    <SettingToggle label="Show pause button" checked={timing.showPause} disabled={!timing.trackTime}
      onChange={checked => puzzleTiming.set('showPause', checked)} />
    <SettingToggle label="Pause on open"
      description="Pause the puzzle when you open the app. Turn this off to reopen it as you left it."
      checked={timing.pauseOnOpen} onChange={checked => puzzleTiming.set('pauseOnOpen', checked)} />
  </fieldset>
}

function VariantToolChoices({ title, description, selected, onChange }: {
  title: string
  description: string
  selected: readonly VariantToolId[]
  onChange: (selected: VariantToolId[]) => void
}) {
  return <details className="variant-tool-choices">
    <summary>{title}</summary>
    <p>{description}</p>
    <div className="variant-tool-choice-list">
      {VARIANT_TOOL_OPTIONS.map(({ id, label }) => <label key={id}>
        <input type="checkbox" checked={selected.includes(id)} onChange={(event) => onChange(
          event.target.checked ? [...selected, id] : selected.filter(item => item !== id))} />
        <span>{label}</span>
      </label>)}
    </div>
  </details>
}

export function GeneralSettings({ section, advancedModes, setAdvancedModes, errorMode, setErrorMode, draft,
  cellReferenceStyle, setCellReferenceStyle, onApplyPaperStyle, paperStyleApplied,
}: {
  section: GeneralSettingsSection
  advancedModes: AdvancedModes
  setAdvancedModes: (modes: AdvancedModes) => void
  errorMode: ErrorMode
  setErrorMode: (mode: ErrorMode) => void
  draft: boolean
  cellReferenceStyle: CellReferenceStyle
  setCellReferenceStyle: (style: CellReferenceStyle) => void
  onApplyPaperStyle?: () => void
  paperStyleApplied?: boolean
}) {
  const candidateLayoutGroup = useId()
  const cellReferenceGroup = useId()
  const [showKillerCombinations, setShowKillerCombinations] = usePlayPreference('showKillerCombinations')
  if (section === 'input') {
    return (
      <div className="settings-section mobile-title-duplicate">
        <h3>Input controls</h3>
        <div className="advanced-options input-control-options">
          <fieldset>
            <legend>Candidate layout</legend>
            <SettingOption name={candidateLayoutGroup} value="grid" label="Grid"
              description="Use fixed positions in a 3×3 grid." checked={advancedModes.candidateLayout === 'grid'}
              onSelect={() => setAdvancedModes({ ...advancedModes, candidateLayout: 'grid' })} />
            <SettingOption name={candidateLayoutGroup} value="center-corner" label="Center and corner"
              description="Place candidates in cell centers or corners." checked={advancedModes.candidateLayout === 'center-corner'}
              onSelect={() => setAdvancedModes({ ...advancedModes, candidateLayout: 'center-corner' })} />
          </fieldset>
          <label className="advanced-select settings-select">
            <span><strong>Keypad progress</strong><small>Choose how the keypad shows your progress for each digit.</small></span>
            <SelectControl value={advancedModes.keypadProgress}
              onChange={(event) => setAdvancedModes({ ...advancedModes, keypadProgress: event.target.value as AdvancedModes['keypadProgress'] })}>
              <option value="dim">Dim when complete</option>
              <option value="count">Show remaining count</option>
              <option value="off">Off</option>
            </SelectControl>
          </label>
          <SettingToggle label="Multi-select button" description="Show the Multi-select button in the Advanced desktop workspace."
            checked={advancedModes.multiSelectButton}
            onChange={multiSelectButton => setAdvancedModes({ ...advancedModes, multiSelectButton })} />
          <SettingToggle label="Double-click naked singles" description="Place a naked single with a double-click."
            checked={advancedModes.doubleClickSingles}
            onChange={doubleClickSingles => setAdvancedModes({ ...advancedModes, doubleClickSingles })} />
          <p className="settings-intro">With no cell selected, tap a digit first, then tap cells to place it.</p>
        </div>
      </div>
    )
  }

  if (section === 'solving') {
    return (
      <div className="settings-section mobile-title-duplicate">
        <h3>Solving style</h3>
        <div className="advanced-options">
          <PuzzleTimingSettings />
          <fieldset>
            <legend>Candidates</legend>
            <SettingToggle label="Automatically generate candidates"
              description="Use normal Sudoku rules by default. Select variant rules below to include them."
              checked={advancedModes.autoGenerateCandidates}
              onChange={autoGenerateCandidates => setAdvancedModes({ ...advancedModes, autoGenerateCandidates })} />
            <SettingToggle label="Automatically remove candidates"
              description="Use normal Sudoku rules by default. Select variant rules below to include them."
              checked={advancedModes.autoRemoveCandidates}
              onChange={autoRemoveCandidates => setAdvancedModes({ ...advancedModes, autoRemoveCandidates })} />
            <VariantToolChoices title="Generate candidates: variant rules"
              description="Choose which variant rules Generate Candidates and automatic candidate generation should use. Normal Sudoku rules apply by default."
              selected={advancedModes.generateCandidateVariants}
              onChange={(generateCandidateVariants) => setAdvancedModes({ ...advancedModes, generateCandidateVariants })} />
            <VariantToolChoices title="Solve singles: variant rules"
              description="Choose which variant rules Solve Singles should use. Normal Sudoku rules apply by default."
              selected={advancedModes.solveSinglesVariants}
              onChange={(solveSinglesVariants) => setAdvancedModes({ ...advancedModes, solveSinglesVariants })} />
            <VariantToolChoices title="Automatic candidate removal: variant rules"
              description="Choose which variant rules remove candidates after you place a digit. Normal Sudoku rules apply by default."
              selected={advancedModes.autoRemoveCandidateVariants}
              onChange={(autoRemoveCandidateVariants) => setAdvancedModes({ ...advancedModes, autoRemoveCandidateVariants })} />
          </fieldset>
          <fieldset>
            <legend>Killer Sudoku</legend>
            <SettingToggle label="Combo calculator" description="Show digit combinations for the selected cage."
              checked={showKillerCombinations} onChange={setShowKillerCombinations} />
          </fieldset>
          <fieldset>
            <legend>Experimental features</legend>
            <SettingToggle label="Highlight ALS"
              description="Show almost-locked sets connected by restricted common candidates."
              checked={advancedModes.experimentalAlsHighlighting}
              onChange={experimentalAlsHighlighting => setAdvancedModes({ ...advancedModes, experimentalAlsHighlighting })} />
          </fieldset>
          <SettingToggle label="Automatically place naked singles"
            description="After you place a digit, also place any available naked singles."
            checked={advancedModes.autoPlaceNakedSingles}
            onChange={autoPlaceNakedSingles => setAdvancedModes({ ...advancedModes, autoPlaceNakedSingles })} />
          {!draft ? (
            <label className="advanced-select settings-select">
              <span><strong>Error display</strong><small>Choose when mistakes are highlighted.</small></span>
              <SelectControl value={errorMode} onChange={(event) => setErrorMode(event.target.value as ErrorMode)}>
                <option value="conflicts">Flag conflicts only</option>
                <option value="all">Flag all errors immediately</option>
                <option value="incorrect">Flag incorrect digits immediately</option>
                <option value="none">Don’t flag errors</option>
              </SelectControl>
            </label>
          ) : (
            <div className="settings-placeholder"><SlidersHorizontal size={20} /><span><strong>Error display</strong><small>Error options become available while solving a puzzle.</small></span></div>
          )}
          {onApplyPaperStyle && <div className="setting-row-heading">
            <span><strong>Paper style</strong><small>Hide the timer and turn off solving aids, error feedback, and automatic highlights.</small></span>
            <Button onClick={onApplyPaperStyle} disabled={paperStyleApplied}
              aria-label={paperStyleApplied ? 'Paper style applied' : 'Apply Paper style'}>{paperStyleApplied ? 'Applied' : 'Apply'}</Button>
          </div>}
        </div>
      </div>
    )
  }

  return (
    <div className="settings-section mobile-title-duplicate">
      <h3>Hints</h3>
      <div className="advanced-options">
        <fieldset>
          <legend>Cell references</legend>
          {cellReferenceStyles.map((style) => <SettingOption key={style} name={cellReferenceGroup} value={style}
            label={CELL_REFERENCE_LABELS[style]} description={cellReferenceDescriptions[style]}
            checked={cellReferenceStyle === style} onSelect={() => setCellReferenceStyle(style)} />)}
        </fieldset>
      </div>
    </div>
  )
}

