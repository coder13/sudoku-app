import { type Dispatch, type SetStateAction } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { IconButton } from './Button'
import { CHAIN_COLORS, type ChainColorPair } from '../sudoku/chain-sketch'
import { PINNABLE_ACTIONS, type PinnedAction } from '../sudoku/pinned-actions'
import { type HighlightPreferences } from '../sudoku/preferences'
import { ChainSwatches } from './ChainsPanel'
import { SelectControl } from './SelectControl'
import { SettingToggle } from './SettingToggle'

export function HighlightSettings({ highlighting, setHighlighting }: {
  highlighting: HighlightPreferences
  setHighlighting: (highlighting: HighlightPreferences) => void
}) {
  return (
    <div className="settings-section mobile-title-duplicate">
      <h3>Highlighting</h3>
      <p className="settings-intro">Choose what follows the active cell or selected digit.</p>
      <div className="advanced-options">
        <fieldset>
          <legend>Automatic highlights</legend>
          <SettingToggle label="Related cells" description="Highlight the cells that share a house with the active cell."
            checked={highlighting.relatedCells} onChange={relatedCells => setHighlighting({ ...highlighting, relatedCells })} />
          <SettingToggle label="Matching digits" description="Highlight every cell containing the active digit."
            checked={highlighting.matchingDigits} onChange={matchingDigits => setHighlighting({ ...highlighting, matchingDigits })} />
          <SettingToggle label="Matching candidates" description="Highlight cells with a candidate matching the active digit."
            checked={highlighting.matchingCandidates} onChange={matchingCandidates => setHighlighting({ ...highlighting, matchingCandidates })} />
        </fieldset>
        <p className="settings-intro">Press Shift+1–9 to match any selected digit or Cmd/Ctrl+1–9 with no cells selected to match all selected digits. You can also touch and hold a digit on the keypad or Shift-click it.</p>
      </div>
    </div>
  )
}

export function ChainColorSettings({ pairs, setPairs }: {
  pairs: readonly ChainColorPair[]
  setPairs: Dispatch<SetStateAction<readonly ChainColorPair[]>>
}) {

  return <div className="settings-section mobile-title-duplicate">
    <h3>Chain colors</h3>
    <div className="advanced-options chain-pair-settings">
      {pairs.map((pair, index) => {
        const name = `Pair ${index + 1}`
        return <fieldset key={name}>
          <legend>{name} <ChainSwatches first={pair[0]} second={pair[1]} /></legend>
          {(['First color', 'Second color'] as const).map((label, slot) => (
            <label key={label} className="advanced-select settings-select">
              <strong>{label}</strong>
              <SelectControl aria-label={`${name} ${label.toLowerCase()}`} value={pair[slot]}
                onChange={event => {
                  const color = CHAIN_COLORS.find(option => option === event.target.value)
                  if (!color) return
                  setPairs(current => current.map((currentPair, pairIndex): ChainColorPair => pairIndex !== index
                    ? currentPair : slot === 0 ? [color, currentPair[1]] : [currentPair[0], color]))
                }}>
                {CHAIN_COLORS.map(color => <option key={color} value={color} disabled={color === pair[1 - slot]}>{color}</option>)}
              </SelectControl>
            </label>
          ))}
        </fieldset>
      })}
    </div>
  </div>
}

export function PuzzleButtonSettings({ pinned, setPinned }: {
  pinned: readonly PinnedAction[]
  setPinned: Dispatch<SetStateAction<readonly PinnedAction[]>>
}) {
  const ordered = [
    ...pinned.map(id => PINNABLE_ACTIONS.find(action => action.id === id))
      .filter((action): action is typeof PINNABLE_ACTIONS[number] => action !== undefined),
    ...PINNABLE_ACTIONS.filter(action => !pinned.includes(action.id)),
  ]

  function move(id: PinnedAction, direction: -1 | 1) {
    setPinned(current => {
      const index = current.indexOf(id)
      if (index < 0 || index + direction < 0 || index + direction >= current.length) return current
      const next = [...current]
      ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
      return next
    })
  }

  return <div className="settings-section mobile-title-duplicate">
    <h3>Puzzle buttons</h3>
    <p className="settings-intro">Pin buttons to the bottom of your puzzle card. Choose their order with the arrows. Unpinned actions stay in the menus.</p>
    <div className="pinned-action-settings" aria-label="Puzzle footer buttons">
      {ordered.map(({ id, label, description }) => {
        const index = pinned.indexOf(id)
        return <div className="pinned-action-row" key={id}>
          <SettingToggle label={label} description={description} checked={index !== -1}
            onChange={checked => setPinned(current => checked
              ? current.includes(id) ? current : [...current, id]
              : current.filter(action => action !== id))} />
          {index !== -1 && <div className="pinned-action-reorder" role="group" aria-label={'Order for ' + label}>
            <span className="pinned-action-order" aria-label={'Position ' + (index + 1)}>{index + 1}</span>
            <IconButton variant="quiet" aria-label={'Move ' + label + ' up'} disabled={index === 0}
              onClick={() => move(id, -1)}><ArrowUp size={17} /></IconButton>
            <IconButton variant="quiet" aria-label={'Move ' + label + ' down'} disabled={index === pinned.length - 1}
              onClick={() => move(id, 1)}><ArrowDown size={17} /></IconButton>
          </div>}
        </div>
      })}
    </div>
  </div>
}
