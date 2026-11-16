import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PuzzleCheckResult, validation } from '../../src/components/PuzzleCheckResult'
import { DialogStory } from '../support/frames'

const meta = {
  title: 'Medium/Dialogs/Puzzle check',
  component: PuzzleCheckResult,
  tags: ['!autodocs'],
  args: { onClose: fn(), result: { title: 'Puzzle check', ...validation.unique } },
  render: ({ result, onClose }) => <DialogStory label="Check puzzle">{(close) =>
    <PuzzleCheckResult result={result} onClose={() => { onClose(); close() }} />}</DialogStory>,
} satisfies Meta<typeof PuzzleCheckResult>
export default meta
type Story = StoryObj<typeof meta>
export const UniqueSolution: Story = {}
export const ConflictingDigits: Story = { args: { result: { title: 'Puzzle check', ...validation.conflict } } }
export const NoSolution: Story = { args: { result: { title: 'Puzzle check', ...validation.unsolvable } } }
export const MultipleSolutions: Story = { args: { result: { title: 'Puzzle check', ...validation.multiple } } }
export const CouldNotVerify: Story = { args: { result: { title: 'Puzzle check', ...validation['search-limit'] } } }
