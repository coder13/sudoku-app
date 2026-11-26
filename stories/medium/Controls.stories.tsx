import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Controls, type ControlsProps } from '../../src/components/Controls'
import { alternateColorShade, valuesOf } from '../../src/sudoku/game'
import { solved } from '../support/fixtures'
import { Width } from '../support/frames'
import { inputExampleArgs } from '../support/input-example'

const meta = {
  title: 'Medium/Grid/Input controls',
  component: Controls,
  args: inputExampleArgs,
  render: (args) => (
    <Width width={args.layout.compact ? 320 : 395}>
      <InputExample key={`${args.digits.mode}-${args.digits.pencil}`} {...args} />
    </Width>
  ),
} satisfies Meta<typeof Controls>
export default meta

type StoryArgs = Omit<Partial<ControlsProps>, 'digits' | 'tools' | 'history' | 'actions' | 'layout'> & {
  digits?: Partial<ControlsProps['digits']>
  tools?: Partial<ControlsProps['tools']>
  history?: Partial<ControlsProps['history']>
  actions?: Partial<ControlsProps['actions']>
  layout?: Partial<ControlsProps['layout']>
}
type Story = Omit<StoryObj<typeof meta>, 'args'> & { args?: StoryArgs }

export const DigitPad: Story = {}
export const MiniSudoku: Story = { args: { layout: { compact: true }, digits: { gridSize: 4, values: '0234341221434321' } } }
export const DesktopCandidateMatching: Story = {
  args: {
    tools: { highlightMode: true, clearDigitHighlightsAvailable: true, onClearDigitHighlights: fn() },
    digits: { highlightedDigitMask: 3, digitHighlightMatch: 'all', onDigitHighlightMatchChange: fn() },
  },
}
export const SingleDigitHighlight: Story = {
  args: { tools: { highlightMode: true, clearDigitHighlightsAvailable: true, onClearDigitHighlights: fn() }, digits: { highlightedDigitMask: 1 } },
}
export const MobileCandidateMatching: Story = {
  args: { ...DesktopCandidateMatching.args, layout: { compact: true } },
}
export const MobileCandidateColorGroup: Story = {
  args: {
    layout: { compact: true },
    tools: {
      colorTarget: 'candidate',
      colorsActive: true,
      paintCandidateGroupAvailable: true,
      onPaintCandidateGroup: fn(),
      clearDigitHighlightsAvailable: true,
      onClearDigitHighlights: fn(),
    },
    digits: { highlightedDigitMask: (1 << 2) | (1 << 4), digitPaintColor: 4 },
  },
}
export const CellTargetDigitPaintCursor: Story = {
  args: { tools: { colorTarget: 'cell', colorsActive: true }, digits: { digitPaintColor: 4 } },
}
export const MobileRemainingDigits: Story = {
  args: { layout: { compact: true, advancedModes: { ...inputExampleArgs.layout.advancedModes, keypadProgress: 'count' } } },
}
export const CenterAndCorner: Story = {
  args: {
    digits: { mode: 'corner', pencil: true, candidateKind: 'corner' },
    layout: { advancedModes: { ...inputExampleArgs.layout.advancedModes, candidateLayout: 'center-corner' } },
  },
}
export const Colors: Story = { args: { digits: { mode: 'color' }, tools: { colorMode: true } } }
export const Draft: Story = { args: { layout: { draft: true }, digits: { hasCellSelection: true } } }
export const Solved: Story = { args: { digits: { values: valuesOf(solved) }, layout: { disabled: true } } }

function InputExample(args: ControlsProps) {
  const [mode, setMode] = useState(args.digits.mode)
  const [kind, setKind] = useState(args.digits.candidateKind)
  const [colorTarget, setColorTarget] = useState(args.tools.colorTarget)
  const [digit, setDigit] = useState(args.digits.selectedDigit)
  const [erase, setErase] = useState(args.tools.eraseMode)
  const [highlight, setHighlight] = useState(args.tools.highlightMode)
  const [match, setMatch] = useState(args.digits.digitHighlightMatch)
  const [multi, setMulti] = useState(args.tools.multi)
  const [height, setHeight] = useState(args.layout.panelHeight)
  const pencil = mode === 'candidate' || mode === 'center' || mode === 'corner'

  return (
    <Controls
      {...args}
      digits={{
        ...args.digits,
        mode,
        pencil,
        candidateKind: kind,
        selectedDigit: digit,
        digitHighlightMatch: match,
        onDigitHighlightMatchChange: args.digits.onDigitHighlightMatchChange && setMatch,
        setCandidateKind: (value) => {
          args.digits.setCandidateKind(value)
          setKind(value)
          setMode(value)
        },
        input: (value) => {
          args.digits.input(value)
          setDigit((current) => (current === value ? null : value))
        },
      }}
      tools={{
        ...args.tools,
        colorMode: mode === 'color',
        colorTarget,
        onSwitchShade: () => setDigit((current) => (current === null ? null : (alternateColorShade(current) ?? current))),
        setColorTarget: (target) => {
          args.tools.setColorTarget(target)
          setColorTarget(target)
          setDigit(null)
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
            setDigit(null)
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
      history={{ ...args.history, canUndo: args.history.canUndo && !args.layout.disabled }}
      layout={{ ...args.layout, panelHeight: height, setPanelHeight: setHeight }}
    />
  )
}
