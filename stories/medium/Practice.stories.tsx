import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Practice } from '../../src/components/TechniqueLesson'
import { practiceBlock } from '../support/fixtures'
import { LessonFrame } from '../support/frames'

const meta = {
  title: 'Medium/Learn/Practice section',
  component: Practice,
  decorators: [(Story) => <LessonFrame><Story /></LessonFrame>],
  args: { block: practiceBlock('naked-single'), variant: 'naked-single', launch: { busy: false, error: '', onPlay: fn() } },
} satisfies Meta<typeof Practice>
export default meta
type Story = StoryObj<typeof meta>

export const OneTechnique: Story = {
  args: { block: { ...meta.args.block, drills: meta.args.block.drills.filter(({ example }) => example === 'naked-single') } },
}
export const ChooseAVariant: Story = { args: { block: practiceBlock('finned-x-wing'), variant: 'finned-x-wing' } }
