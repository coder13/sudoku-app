import type { Meta, StoryObj } from '@storybook/react-vite'
import { ExplanationBlock } from '../../src/components/TechniqueLesson'
import { lessonRoutes } from '../../src/sudoku/lessons'
import { fundamentals, singlesLesson } from '../support/fixtures'
import { LessonFrame } from '../support/frames'

const meta = {
  title: 'Medium/Learn/Article block',
  component: ExplanationBlock,
  decorators: [(Story) => <LessonFrame><div className="lesson-explanation"><Story /></div></LessonFrame>],
  args: { index: 0, drills: [] },
} satisfies Meta<typeof ExplanationBlock>
export default meta
type Story = StoryObj<typeof meta>

export const Text: Story = { args: { block: singlesLesson.blocks.find(({ type }) => type === 'text')! } }
export const Heading: Story = { args: { block: fundamentals.blocks.find(({ type }) => type === 'heading')! } }
export const List: Story = { args: { block: lessonRoutes.get('hidden-single')!.blocks.find(({ type }) => type === 'list')! } }
