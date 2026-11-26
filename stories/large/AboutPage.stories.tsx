import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { AboutPage } from '../../src/components/AboutPage'
import { PreviewRouter } from '../support/frames'

const meta = {
  title: 'Puzzles/About Sudoku',
  component: AboutPage,
  parameters: { layout: 'fullscreen' },
  render: () => <PreviewRouter path="/about" shell />,
} satisfies Meta<typeof AboutPage>
export default meta

type Story = StoryObj<typeof meta>

export const Desktop: Story = {}
export const Narrow: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'About Sudoku' })).toHaveFocus()
    await expect(canvas.getAllByRole('heading', { level: 3 })).toHaveLength(10)
    await expect(canvas.getByText('1 of 30 rated')).toBeVisible()
  },
}
