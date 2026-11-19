import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
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
    const actions = canvas.getByRole('button', { name: 'Actions' })
    await userEvent.click(cell)
    await userEvent.click(canvas.getByRole('button', { name: 'Enter 9' }))
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Check puzzle' }))
    const check = within(await canvas.findByRole('dialog', { name: 'Puzzle check' }))
    await expect(check.getByText('The highlighted clues cannot fit these entries.')).toBeVisible()
    await userEvent.click(check.getByRole('button', { name: 'Close dialog' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Erase cell' }))
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Technique finder' }))
    const finder = within(await canvas.findByRole('dialog', { name: 'Technique finder' }))
    await userEvent.click(await finder.findByRole('button', { name: 'Crossing run sums' }))
    await expect(await canvas.findByRole('complementary', { name: 'Puzzle hint' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Close hint' }))
    await userEvent.click(actions)
    await userEvent.click(await canvas.findByRole('button', { name: 'Open solution panel' }))
    const solution = within(await canvas.findByRole('dialog', { name: 'Solution' }))
    await userEvent.click(solution.getByRole('button', { name: 'Next step' }))
    await expect(solution.getByRole('button', { name: /^R4C2, 3/ })).toBeVisible()
    await userEvent.click(solution.getByRole('button', { name: 'Final grid' }))
    await userEvent.click(solution.getByRole('button', { name: 'Close dialog' }))
    await expect(cell).toHaveAccessibleName(/^R2C3, empty/)
  },
}
