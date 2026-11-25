import { useState } from 'react'
import { fn } from 'storybook/test'
import { Controls, type ControlsProps } from '../../src/components/Controls'
import { alternateColorShade } from '../../src/sudoku/game'
import { DEFAULT_ADVANCED_MODES, DEFAULT_INPUT_SIZE } from '../../src/sudoku/preferences'
import { starter } from './fixtures'

export const inputExampleArgs = {
  digits: {
    mode: 'value',
    pencil: false,
    candidateKind: 'corner',
    setCandidateKind: fn(),
    selectedDigit: null,
    hasCellSelection: false,
    values: starter.givens,
    input: fn(),
  },
  tools: {
    togglePencil: fn(),
    colorMode: false,
    toggleColorMode: fn(),
    colorTarget: 'cell',
    setColorTarget: fn(),
    onSwitchShade: fn(),
    eraseMode: false,
    toggleEraseMode: fn(),
    highlightMode: false,
    toggleHighlightMode: fn(),
    multi: false,
    toggleMulti: fn(),
    showMultiSelectButton: true,
  },
  history: { undo: fn(), redo: fn(), canUndo: true, canRedo: false },
  actions: {},
  layout: {
    advancedModes: { ...DEFAULT_ADVANCED_MODES, colorsEnabled: true },
    disabled: false,
    draft: false,
    inputSize: DEFAULT_INPUT_SIZE,
    panelHeight: 280,
    setPanelHeight: fn(),
    beginResize: fn(),
  },
} satisfies ControlsProps

type Props = ControlsProps & { onDigitChange?: (digit: number | null) => void }
export function InputExample({ onDigitChange, ...args }: Props) {
  const [mode, setMode] = useState(args.digits.mode)
  const [kind, setKind] = useState(args.digits.candidateKind)
  const [colorTarget, setColorTarget] = useState(args.tools.colorTarget)
  const [localDigit, setLocalDigit] = useState(args.digits.selectedDigit)
  const [erase, setErase] = useState(args.tools.eraseMode)
  const [highlight, setHighlight] = useState(args.tools.highlightMode)
  const [multi, setMulti] = useState(args.tools.multi)
  const [height, setHeight] = useState(args.layout.panelHeight)
  const pencil = mode === 'candidate' || mode === 'center' || mode === 'corner'
  const changeDigit = mode === 'color' ? undefined : onDigitChange
  const digit = changeDigit ? args.digits.selectedDigit : localDigit

  return (
    <Controls
      {...args}
      digits={{
        ...args.digits,
        mode,
        pencil,
        candidateKind: kind,
        selectedDigit: digit,
        input: (value) => {
          args.digits.input(value)
          if (changeDigit) changeDigit(digit === value ? null : value)
          else setLocalDigit((current) => (current === value ? null : value))
        },
        setCandidateKind: (value) => {
          args.digits.setCandidateKind(value)
          setKind(value)
          setMode(value)
        },
      }}
      tools={{
        ...args.tools,
        colorMode: mode === 'color',
        onSwitchShade: () => setLocalDigit((current) => (current === null ? null : (alternateColorShade(current) ?? current))),
        colorTarget,
        setColorTarget: (target) => {
          args.tools.setColorTarget(target)
          setColorTarget(target)
          setLocalDigit(null)
        },
        eraseMode: erase,
        highlightMode: highlight,
        multi,
        togglePencil: () => {
          args.tools.togglePencil()
          setMode(pencil ? 'value' : args.layout.advancedModes.candidateLayout === 'grid' ? 'candidate' : kind)
        },
        toggleColorMode:
          args.tools.toggleColorMode &&
          (() => {
            args.tools.toggleColorMode?.()
            setMode(mode === 'color' ? 'value' : 'color')
            setLocalDigit(null)
          }),
        toggleEraseMode: () => {
          args.tools.toggleEraseMode()
          setErase(!erase)
        },
        toggleHighlightMode: () => {
          args.tools.toggleHighlightMode()
          setHighlight(!highlight)
        },
        toggleMulti: () => {
          args.tools.toggleMulti()
          setMulti(!multi)
        },
      }}
      layout={{ ...args.layout, panelHeight: height, setPanelHeight: setHeight }}
    />
  )
}
