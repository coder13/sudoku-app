import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { PracticePuzzle } from '../../src/components/LessonPractice'
import { lessonExamples } from '../support/fixtures'
import { LessonFrame } from '../support/frames'

const meta = {
  title: 'Medium/Learn/Practice puzzle',
  component: PracticePuzzle,
  decorators: [(Story) => <LessonFrame><section className="surface lesson-practice"><Story /></section></LessonFrame>],
  args: { puzzle: lessonExamples['naked-single'].practice, technique: 'Naked single' },
} satisfies Meta<typeof PracticePuzzle>
export default meta
type Story = StoryObj<typeof meta>
export const Placement: Story = {}
export const CandidateRemoval: Story = { args: { puzzle: lessonExamples['xy-wing'].practice, technique: 'XY-wing' } }
export const RevealAndReset: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show one move' }))
    await expect(canvas.getByRole('status')).toHaveTextContent('One possible move.')
    await expect(canvas.getByRole('button', { name: 'Reset puzzle' })).toBeEnabled()
  },
}
export const CorrectMove: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const action = args.puzzle.suggestion
    if (!('place' in action)) throw new Error('Expected a verified placement fixture.')
    await userEvent.click(canvas.getByRole('gridcell', {
      name: new RegExp(`^Row ${Math.floor(action.place.cell / 9) + 1}, column ${action.place.cell % 9 + 1},`),
    }))
    await userEvent.click(canvas.getByRole('button', { name: `Enter ${action.place.digit}` }))
    await userEvent.click(canvas.getByRole('button', { name: 'Check move' }))
    await expect(canvas.getByRole('status')).toHaveTextContent('Correct.')
  },
}
