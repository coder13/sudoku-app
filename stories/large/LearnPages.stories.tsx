import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
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
export const MobilePracticeShortcut: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: () => <PreviewRouter shell path="/learn/wxyz-wing" />,
  play: async ({ canvas }) => {
    const title = await canvas.findByRole('heading', { name: 'WXYZ-Wing', level: 1 })
    const practice = canvas.getByRole('button', { name: /^Practice$/ })
    await expect(practice).toBeEnabled()
    await expect(title.closest('.lesson-heading')).toContainElement(practice)
    await expect(practice.getBoundingClientRect().left).toBeGreaterThanOrEqual(title.getBoundingClientRect().right)
  },
}
export const TrainerShortcut: Story = {
  render: () => <PreviewRouter path="/learn/death-blossom" />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('link', { name: /^Practice$/ })).toHaveAttribute('href', '#trainer')
    await expect(canvas.getByRole('region', { name: 'Trainer' })).toHaveAttribute('id', 'trainer')
  },
}
export const MobileTrainer: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: () => <PreviewRouter shell path="/learn/wxyz-wing#trainer" />,
  play: async ({ canvas }) => {
    const title = await canvas.findByRole('heading', { name: 'WXYZ-Wing', level: 1 })
    await expect(title.closest('.lesson-heading')).toHaveStyle('position: static')
    await expect(canvas.getByRole('region', { name: 'Trainer' })).toHaveAttribute('id', 'trainer')
  },
}
