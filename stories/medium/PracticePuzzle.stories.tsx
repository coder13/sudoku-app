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
export const DrawLinks: Story = {
  args: { puzzle: lessonExamples['wxyz-wing'].practice, technique: 'WXYZ-Wing' },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const grid = canvas.getByRole('grid')
    await userEvent.click(canvas.getByRole('button', { name: 'Input tools' }))
    await userEvent.click(canvas.getByRole('button', { name: /^Chains$/ }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(canvas.getByRole('button', { name: 'Draw links' }))
    const start = grid.querySelector<HTMLButtonElement>('.chain-candidate')!
    start.focus()
    await userEvent.keyboard('{Enter}')
    const target = grid.querySelector<HTMLButtonElement>('[data-link-target="true"]')!
    await userEvent.click(target)
    await expect(canvas.getByRole('button', { name: 'Undo edit' })).toBeEnabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Done drawing' }))
    await expect(canvas.getByRole('group', { name: 'Digit pad' })).toBeVisible()
  },
}
export const RevealAndReset: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvasElement.ownerDocument.fonts.ready
    const grid = canvas.getByRole('grid')
    const keypad = canvas.getByRole('group', { name: 'Digit pad' })
    const walkthrough = canvas.getByRole('region', { name: 'Practice walkthrough' })
    const layout = () => [grid, keypad, walkthrough].map((element) => [
      element.offsetLeft, element.offsetTop, element.offsetWidth, element.offsetHeight,
    ])
    const initialLayout = layout()
    await userEvent.click(canvas.getByRole('button', { name: 'Show next step' }))
    await expect(canvas.getByText('Where to look')).toBeVisible()
    await expect(layout()).toEqual(initialLayout)
    await expect(canvas.queryByRole('button', { name: 'Apply one move' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Show next step' }))
    await expect(canvas.getByText('What to check')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Show solution' }))
    await expect(canvas.getByRole('heading', { name: 'Solution' })).toBeVisible()
    await expect(canvas.getByRole('heading', { name: 'Why this works' })).toBeInTheDocument()
    await expect(keypad).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Select 1' })).toBeDisabled()
    await expect(layout()).toEqual(initialLayout)
    await userEvent.click(canvas.getByRole('button', { name: 'Previous step' }))
    await expect(canvas.getByRole('button', { name: 'Select 1' })).toBeEnabled()
    await expect(layout()).toEqual(initialLayout)
    await userEvent.click(canvas.getByRole('button', { name: 'Show solution' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Apply one move' }))
    await expect(canvas.getByRole('status')).toHaveTextContent('One possible move.')
    await userEvent.click(canvas.getByRole('button', { name: 'Reset puzzle' }))
    await expect(canvas.getByRole('button', { name: 'Check move' })).toBeDisabled()
    await expect(layout()).toEqual(initialLayout)
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
