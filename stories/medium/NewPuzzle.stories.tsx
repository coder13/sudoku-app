import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { PreviewRouter } from '../support/frames'

const meta = {
  title: 'Medium/Puzzles/New puzzle',
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

export const ChooseVariant: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=classic" />,
}

export const ChooseDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=windoku" />,
}

export const Mobile: Story = {
  ...ChooseVariant,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Next variant' }))
    await canvas.findByRole('heading', { name: 'Killer' })
    await userEvent.click(canvas.getByRole('link', { name: 'Continue' }))
    await canvas.findByRole('heading', { name: 'Choose difficulty' })
    await expect(canvas.getByText('Killer', { exact: true })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Back to variant' }))
    await expect(await canvas.findByRole('heading', { name: 'Killer' })).toBeVisible()
  },
}
