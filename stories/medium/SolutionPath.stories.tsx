import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { SolutionPath } from '../../src/components/SolutionPath'

const steps = [
  { title: 'Inequality', text: 'Remove 1 from R1C3. Remove 9 from R2C3.' },
  { title: 'Palindrome', text: 'Remove 9 from R1C4.' },
]

const meta = {
  title: 'Medium/Play/SolutionPath',
  component: SolutionPath,
  // Storybook's type extractor cannot expand the nested trace types safely.
  parameters: { layout: 'centered', docs: { extractArgTypes: false } },
  args: {
    state: { status: 'ready', trace: { status: 'stalled', steps } },
    index: 0, onSelect: fn(), onRetry: fn(), onClose: fn(),
  },
  render: function Example(args) {
    const [index, setIndex] = useState(args.index)
    return <div style={{ width: 'min(420px, 90vw)', height: 420, display: 'flex' }}>
      <SolutionPath {...args} index={index} onSelect={value => { setIndex(value); args.onSelect(value) }} />
    </div>
  },
} satisfies Meta<typeof SolutionPath>
export default meta
type Story = StoryObj<typeof meta>

/** Show the incomplete result before the player selects its last position. */
export const Partial: Story = {}
export const NoAvailableSteps: Story = {
  args: { state: { status: 'ready', trace: { status: 'stalled', steps: [] } } },
}
export const Complete: Story = {
  args: { state: { status: 'ready', trace: { status: 'solved', steps: [{ title: 'Naked single', text: 'Place 4 in R1C3.' }] } } },
}
const overlayGivens = '000000012000003004004020500001060005070008000300900000006010020080006000900700600'
const overlaySolution = '567489312129573864834621597291367485675148239348952176756814923483296751912735648'
export const ExhaustiveOverlay: Story = {
  args: { state: { status: 'ready', trace: {
    board: overlaySolution,
    steps: [],
    rating: { status: 'stalled', techniqueOrder: [], scoringVersion: 11, score: { points: 0, hardest: null, counts: {} } },
    exactPosition: {
      givens: overlayGivens,
      entries: [...overlaySolution].map((digit, cell) => overlayGivens[cell] === '0' ? digit : '0').join(''),
      eliminations: Array<number>(81).fill(0),
    },
    completionProof: {
      omittedDigit: 9,
      layouts: Array.from({ length: 8 }, (_, digit) =>
        [...overlaySolution].flatMap((value, cell) => Number(value) === digit + 1 ? [cell] : [])),
    },
  } } },
}
export const Loading: Story = { args: { state: { status: 'loading' } } }
export const Unavailable: Story = { args: { state: { status: 'unavailable', message: 'The solving steps are unavailable. Try again.' } } }
