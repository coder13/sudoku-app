import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { TechniqueNavigation } from '../../src/routes/learn'
import { PreviewRouter } from '../support/frames'

const meta = {
  title: 'Medium/Learn/Technique navigation',
  component: TechniqueNavigation,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TechniqueNavigation>
export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {
  render: () => <PreviewRouter path="/learn"><div className="learn-page"><TechniqueNavigation /></div></PreviewRouter>,
}
export const CurrentTechnique: Story = {
  render: () => <PreviewRouter path="/learn/finned-x-wing"><div className="learn-page"><TechniqueNavigation /></div></PreviewRouter>,
}
export const MobileDifficultyGroups: Story = {
  ...Overview,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Articles' }))
    const groups = canvas.getByRole('navigation', { name: 'Sudoku articles' }).querySelectorAll('details.learn-nav-group')
    await expect(groups.length).toBeGreaterThan(1)
    const first = groups[0].querySelector('summary')!
    await userEvent.click(first)
    await expect(groups[0]).toHaveAttribute('open')
    await userEvent.click(first)
    await expect(groups[0]).not.toHaveAttribute('open')
  },
}
