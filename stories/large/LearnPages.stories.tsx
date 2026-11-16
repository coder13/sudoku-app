import type { Meta, StoryObj } from '@storybook/react-vite'
import { LearnLayout } from '../../src/routes/learn'
import { LessonOverview } from '../../src/routes/learn.index'
import { LessonPage } from '../../src/routes/learn.$technique'
import { PreviewRouter } from '../support/frames'

const meta = {
  title: 'Large/Learn/Learn pages',
  component: LearnLayout,
  subcomponents: { LessonOverview, LessonPage },
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LearnLayout>
export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = { render: () => <PreviewRouter path="/learn" /> }
export const Technique: Story = { render: () => <PreviewRouter path="/learn/naked-single" /> }
export const TechniqueVariant: Story = { render: () => <PreviewRouter path="/learn/finned-x-wing" /> }
