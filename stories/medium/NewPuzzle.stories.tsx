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

export const XSumsDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=x-sum" />,
}

export const SkyscrapersDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=skyscrapers" />,
}

export const AntiKingDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=anti-king" />,
}

export const AntiKingVariant: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=anti-king" />,
}

export const NonConsecutiveVariant: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=non-consecutive" />,
}

export const NonConsecutiveDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=non-consecutive" />,
}

export const OddEvenVariant: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=parity" />,
}

export const OddEvenDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=parity" />,
}

export const GermanWhispers: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=whispers&ruleset=german" />,
}
export const DutchWhispers: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=whispers&ruleset=dutch" />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}
