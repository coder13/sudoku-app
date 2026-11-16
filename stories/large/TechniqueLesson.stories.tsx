import type { Meta, StoryObj } from '@storybook/react-vite'
import { TechniqueLesson } from '../../src/components/TechniqueLesson'
import { fundamentals, fishLesson, singlesLesson } from '../support/fixtures'
import { LessonFrame, PreviewRouter } from '../support/frames'

const meta = {
  title: 'Large/Learn/Technique article',
  component: TechniqueLesson,
  args: { lesson: singlesLesson, variant: singlesLesson.id },
  decorators: [(Story) => <PreviewRouter><LessonFrame><Story /></LessonFrame></PreviewRouter>],
} satisfies Meta<typeof TechniqueLesson>
export default meta
type Story = StoryObj<typeof meta>

export const Singles: Story = {}
export const Fundamentals: Story = { args: { lesson: fundamentals, variant: fundamentals.id } }
export const FishWithVariants: Story = { args: { lesson: fishLesson, variant: 'finned-x-wing' } }
