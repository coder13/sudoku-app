import type { Meta, StoryObj } from '@storybook/react-vite'
import { LearnBreadcrumbs } from '../../src/components/LearnBreadcrumbs'
import { LessonFrame, PreviewRouter } from '../support/frames'

const meta = {
  title: 'Small/Learn/Breadcrumbs',
  component: LearnBreadcrumbs,
  decorators: [(Story) => <PreviewRouter path="/learn"><LessonFrame><Story /></LessonFrame></PreviewRouter>],
} satisfies Meta<typeof LearnBreadcrumbs>
export default meta
type Story = StoryObj<typeof meta>
export const Overview: Story = {}
export const Technique: Story = { args: { current: 'Naked single' } }
export const UnavailableTechnique: Story = { args: { current: 'Technique unavailable' } }
