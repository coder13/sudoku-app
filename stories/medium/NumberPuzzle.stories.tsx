import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { KakuroPlay } from '../../src/components/Kakuro'
import { kakuroCatalog } from '../../src/kakuro/catalog'
import { PreviewRouter } from '../support/frames'

const meta = {
  title: 'Medium/Puzzles/Number puzzle',
  parameters: { layout: 'fullscreen' },
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

export const Kakuro: Story = {
  render: () => <PreviewRouter shell><KakuroPlay entry={kakuroCatalog[0]} /></PreviewRouter>,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const cell = await canvas.findByRole('button', { name: /^R2C3,/ })
    await userEvent.click(cell)
    await userEvent.click(canvas.getByRole('button', { name: 'Enter 9' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Check puzzle' }))
    await expect(canvas.getByRole('status')).toHaveTextContent('The highlighted clues cannot fit these entries.')
    await userEvent.click(canvas.getByRole('button', { name: 'Erase cell' }))
    await userEvent.click(canvas.getByRole('button', { name: /^Hint$/ }))
    await expect(canvas.getByRole('complementary', { name: 'Puzzle hint' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Close hint' }))
    await expect(canvas.getByRole('button', { name: /^Hint$/ })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Show solution' }))
    await expect(canvas.getByRole('heading', { name: 'Solution preview' })).toHaveFocus()
    await expect(cell).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Back to puzzle' }))
    await expect(cell).toHaveAccessibleName(/^R2C3, empty/)
  },
}
