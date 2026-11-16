import type { Meta, StoryObj } from '@storybook/react-vite'
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
