import type { Meta, StoryObj } from '@storybook/react-vite'
import { PuzzleKeypad } from '../../src/components/PuzzleKeypad'
import { Width } from '../support/frames'

const meta = {
  title: 'Small/Puzzle input/Puzzle keypad',
  component: PuzzleKeypad,
  decorators: [Story => <Width width={210}><Story /></Width>],
} satisfies Meta<typeof PuzzleKeypad>
export default meta
type Story = StoryObj<typeof meta>

function keys(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const digit = index + 1
    return <button type="button" className="key" key={digit} aria-label={`Enter ${digit}`}
      disabled={digit === count}>{digit}</button>
  })
}

export const Digits: Story = { args: { label: 'Digit pad', children: keys(9) } }
export const Mini: Story = { args: { label: 'Digit pad', variant: 'mini', children: keys(4) } }
