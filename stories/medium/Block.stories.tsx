import type { Meta, StoryObj } from '@storybook/react-vite'
import { Block } from '../../src/components/TechniqueLesson'
import { lessonRoutes } from '../../src/sudoku/lessons'
import { fundamentals, practiceBlock, singlesLesson } from '../support/fixtures'
import { LessonFrame } from '../support/frames'

const meta = {
  title: 'Medium/Learn/Article block',
  component: Block,
  decorators: [(Story) => <LessonFrame><div className="lesson-article"><Story /></div></LessonFrame>],
  args: { variant: 'naked-single' },
} satisfies Meta<typeof Block>
export default meta
type Story = StoryObj<typeof meta>

export const Text: Story = { args: { block: singlesLesson.blocks.find(({ type }) => type === 'text')! } }
export const Heading: Story = { args: { block: fundamentals.blocks.find(({ type }) => type === 'heading')! } }
export const List: Story = { args: { block: lessonRoutes.get('hidden-single')!.blocks.find(({ type }) => type === 'list')! } }
export const Diagram: Story = { args: { block: singlesLesson.blocks.find(({ type }) => type === 'diagram')! } }
export const Practice: Story = { args: { block: practiceBlock('naked-single') } }
