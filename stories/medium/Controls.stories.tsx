import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Controls } from '../../src/components/Controls'
import { valuesOf } from '../../src/sudoku/game'
import { DEFAULT_ADVANCED_MODES, DEFAULT_INPUT_SIZE } from '../../src/sudoku/preferences'
import { solved, starter } from '../support/fixtures'
import { Width } from '../support/frames'

const meta = {
  title: 'Medium/Grid/Input controls',
  component: Controls,
  args: {
    mode: 'value', pencil: false, togglePencil: fn(), candidateKind: 'corner', setCandidateKind: fn(),
    advancedModes: { ...DEFAULT_ADVANCED_MODES, colorsEnabled: true, multiSelectButton: true },
    colorMode: false, toggleColorMode: fn(), eraseMode: false, toggleEraseMode: fn(), highlightMode: false,
    toggleHighlightMode: fn(), selectedDigit: null, hasCellSelection: false, values: starter.givens,
    input: fn(), undo: fn(), redo: fn(), canUndo: true, canRedo: false, disabled: false, draft: false,
    inputSize: DEFAULT_INPUT_SIZE, panelHeight: 280, setPanelHeight: fn(), beginResize: fn(), multi: false, toggleMulti: fn(),
  },
  render: (args) => <Width width={395}><InputExample key={`${args.mode}-${args.pencil}`} {...args} /></Width>,
} satisfies Meta<typeof Controls>
export default meta
type Story = StoryObj<typeof meta>
export const DigitPad: Story = {}
export const CenterAndCorner: Story = {
  args: { mode: 'corner', pencil: true, advancedModes: { ...meta.args.advancedModes, candidateLayout: 'center-corner' } },
}
export const Colors: Story = { args: { mode: 'color', colorMode: true } }
export const Draft: Story = { args: { draft: true, hasCellSelection: true } }
export const Solved: Story = { args: { values: valuesOf(solved), disabled: true } }

type Props = ComponentProps<typeof Controls>
function InputExample(args: Props) {
  const [mode, setMode] = useState(args.mode)
  const [kind, setKind] = useState(args.candidateKind)
  const [digit, setDigit] = useState(args.selectedDigit)
  const [erase, setErase] = useState(args.eraseMode)
  const [highlight, setHighlight] = useState(args.highlightMode)
  const [multi, setMulti] = useState(args.multi)
  const [height, setHeight] = useState(args.panelHeight)
  const pencil = mode === 'candidate' || mode === 'center' || mode === 'corner'
  return <Controls {...args} mode={mode} pencil={pencil} colorMode={mode === 'color'} candidateKind={kind}
    eraseMode={erase} highlightMode={highlight} selectedDigit={digit} multi={multi} panelHeight={height}
    setPanelHeight={setHeight}
    input={(value) => { args.input(value); setDigit((current) => current === value ? null : value) }}
    togglePencil={() => { args.togglePencil(); setMode(pencil ? 'value' : args.advancedModes.candidateLayout === 'grid' ? 'candidate' : kind) }}
    setCandidateKind={(value) => { args.setCandidateKind(value); setKind(value); setMode(value) }}
    toggleColorMode={() => { args.toggleColorMode(); setMode(mode === 'color' ? 'value' : 'color'); setDigit(null) }}
    toggleEraseMode={() => { args.toggleEraseMode(); setErase(!erase) }}
    toggleHighlightMode={() => { args.toggleHighlightMode(); setHighlight(!highlight) }}
    toggleMulti={() => { args.toggleMulti(); setMulti(!multi) }} />
}
