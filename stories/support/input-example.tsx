import { useState, type ComponentProps } from 'react'
import { fn } from 'storybook/test'
import { Controls } from '../../src/components/Controls'
import { alternateColorShade } from '../../src/sudoku/game'
import { DEFAULT_ADVANCED_MODES, DEFAULT_INPUT_SIZE } from '../../src/sudoku/preferences'
import { starter } from './fixtures'

export const inputExampleArgs = {
  mode: 'value', pencil: false, togglePencil: fn(), candidateKind: 'corner', setCandidateKind: fn(),
  advancedModes: { ...DEFAULT_ADVANCED_MODES, colorsEnabled: true },
  colorMode: false, toggleColorMode: fn(), colorTarget: 'cell', setColorTarget: fn(), onSwitchShade: fn(), eraseMode: false, toggleEraseMode: fn(), highlightMode: false,
  toggleHighlightMode: fn(), selectedDigit: null, hasCellSelection: false, values: starter.givens,
  input: fn(), undo: fn(), redo: fn(), canUndo: true, canRedo: false, disabled: false, draft: false,
  inputSize: DEFAULT_INPUT_SIZE, panelHeight: 280, setPanelHeight: fn(), beginResize: fn(), showMultiSelectButton: true, multi: false, toggleMulti: fn(),
} satisfies ComponentProps<typeof Controls>

type Props = ComponentProps<typeof Controls> & { onDigitChange?: (digit: number | null) => void }
export function InputExample({ onDigitChange, ...args }: Props) {
  const [mode, setMode] = useState(args.mode)
  const [kind, setKind] = useState(args.candidateKind)
  const [colorTarget, setColorTarget] = useState(args.colorTarget)
  const [localDigit, setLocalDigit] = useState(args.selectedDigit)
  const [erase, setErase] = useState(args.eraseMode)
  const [highlight, setHighlight] = useState(args.highlightMode)
  const [multi, setMulti] = useState(args.multi)
  const [height, setHeight] = useState(args.panelHeight)
  const pencil = mode === 'candidate' || mode === 'center' || mode === 'corner'
  const changeDigit = mode === 'color' ? undefined : onDigitChange
  const digit = changeDigit ? args.selectedDigit : localDigit
  return <Controls {...args} mode={mode} pencil={pencil} colorMode={mode === 'color'} candidateKind={kind}
    onSwitchShade={() => setLocalDigit((current) => current === null ? null : alternateColorShade(current) ?? current)}
    colorTarget={colorTarget} setColorTarget={(target) => { args.setColorTarget(target); setColorTarget(target); setLocalDigit(null) }}
    eraseMode={erase} highlightMode={highlight} selectedDigit={digit} multi={multi} panelHeight={height}
    setPanelHeight={setHeight}
    input={(value) => {
      args.input(value)
      if (changeDigit) changeDigit(digit === value ? null : value)
      else setLocalDigit((current) => current === value ? null : value)
    }}
    togglePencil={() => { args.togglePencil(); setMode(pencil ? 'value' : args.advancedModes.candidateLayout === 'grid' ? 'candidate' : kind) }}
    setCandidateKind={(value) => { args.setCandidateKind(value); setKind(value); setMode(value) }}
    toggleColorMode={args.toggleColorMode && (() => { args.toggleColorMode?.(); setMode(mode === 'color' ? 'value' : 'color'); setLocalDigit(null) })}
    toggleEraseMode={() => { args.toggleEraseMode(); setErase(!erase) }}
    toggleHighlightMode={() => { args.toggleHighlightMode(); setHighlight(!highlight) }}
    toggleMulti={() => { args.toggleMulti(); setMulti(!multi) }} />
}
