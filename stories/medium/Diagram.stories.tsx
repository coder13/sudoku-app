import type { Meta, StoryObj } from '@storybook/react-vite'
import { Diagram } from '../../src/components/TechniqueLesson'
import { lessonExamples } from '../support/fixtures'
import { LessonFrame } from '../support/frames'

const meta = {
  title: 'Medium/Learn/Worked diagram',
  component: Diagram,
  decorators: [(Story) => <LessonFrame><article className="lesson-article"><Story /></article></LessonFrame>],
  args: { example: lessonExamples['naked-single'] },
} satisfies Meta<typeof Diagram>
export default meta
type Story = StoryObj<typeof meta>
export const Placement: Story = {}
export const MultipleRemovals: Story = { args: { example: lessonExamples['locked-pair'] } }
export const LinkLegend: Story = { args: { example: lessonExamples['xy-chain'] } }
export const FinsAndCoverLines: Story = { args: { example: lessonExamples['finned-x-wing'] } }
export const StepByStepProof: Story = { args: { example: lessonExamples['forcing-chain'] } }
