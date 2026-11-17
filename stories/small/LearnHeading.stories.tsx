import type { Meta, StoryObj } from '@storybook/react-vite'
import { LearnHeading } from '../../src/components/LearnHeading'
import { LessonFrame, PreviewRouter } from '../support/frames'

const meta = {
  id: 'small-learn-breadcrumbs',
  title: 'Small/Learn/Article heading',
  component: LearnHeading,
  decorators: [(Story) => <PreviewRouter path="/learn"><LessonFrame><Story /></LessonFrame></PreviewRouter>],
} satisfies Meta<typeof LearnHeading>
export default meta
type Story = StoryObj<typeof meta>
export const Overview: Story = {}
export const Technique: Story = { args: {
  title: 'Naked single', difficulty: 'Easy', summary: 'Place a digit when a cell has only one candidate.',
} }
export const UnavailableTechnique: Story = { args: { title: 'Technique unavailable' } }
