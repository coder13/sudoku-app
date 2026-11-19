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
    await canvas.findByRole('heading', { name: 'Mini Sudoku' })
    await userEvent.click(canvas.getByRole('link', { name: 'Continue' }))
    await canvas.findByRole('heading', { name: 'Choose difficulty' })
    await expect(canvas.getByText('Mini Sudoku', { exact: true })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Back to variant' }))
    await expect(await canvas.findByRole('heading', { name: 'Mini Sudoku' })).toBeVisible()
  },
}

export const RectangularSix: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=six&boxRows=3" />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByRole('combobox', { name: 'Box layout' })).toHaveValue('3')
    await userEvent.click(canvas.getByRole('button', { name: 'Create puzzle' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Edit rules' }))
    await expect(await canvas.findByRole('grid', { name: '6 × 6 rule editor' })).toBeVisible()
  },
}

export const AlgebraicCages: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=algebraic-cages" />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Create puzzle' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Edit cages' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Edit cages' })
    await expect(dialog).toBeVisible()
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

export const PalindromeVariant: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=palindrome" />,
}
export const PalindromeDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=palindrome" />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}

export const GlobalEntropyVariant: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=global-entropy" />,
}
export const GlobalEntropyDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=global-entropy" />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}

export const EntropicVariant: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=entropic" />,
}
export const EntropicDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=entropic" />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}

export const ModularVariant: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=modular" />,
}
export const ModularDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=modular" />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}

export const KakuroFromGameTypes: Story = {
  ...ChooseVariant,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('link', { name: 'Change game type' }))
    await expect(await canvas.findByRole('heading', { name: 'Choose a game type' })).toHaveFocus()
    await userEvent.click(canvas.getByRole('link', { name: /Kakuro/ }))
    await expect(await canvas.findByRole('button', { name: 'Decrease difficulty' })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Increase difficulty' }))
    await expect(canvas.getByRole('button', { name: 'Start medium puzzle' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Decrease difficulty' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Start easy puzzle' }))
    const cell = await canvas.findByRole('button', { name: /^R2C3, empty/ })
    await userEvent.click(cell)
    await userEvent.keyboard('1')
    await expect(cell).toHaveAccessibleName(/^R2C3, 1/)
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'View hint' }))
    for (const name of ['Show digits', 'Show location', 'Show explanation']) {
      await userEvent.click(await canvas.findByRole('button', { name }))
    }
    await userEvent.click(canvas.getByText('Show hint steps'))
    await expect(canvas.getByText('The clue rules out 1 in R4C2. R4C2 can only be 3.')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Apply hint' }))
    await expect(canvas.getByRole('button', { name: /^R4C2, 3/ })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
    await userEvent.click(canvas.getByRole('link', { name: 'Back to Kakuro difficulty' }))
    await expect(await canvas.findByRole('heading', { name: 'Choose difficulty' })).toHaveFocus()
    await expect(await canvas.findByRole('button', { name: 'Start easy puzzle' })).toBeEnabled()
  },
}

export const CalcudokuFromGameTypes: Story = {
  ...ChooseVariant,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('link', { name: 'Change game type' }))
    await userEvent.click(await canvas.findByRole('link', { name: /Calcudoku/ }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Start easy puzzle' }))
    const cell = await canvas.findByRole('button', { name: /^R1C1, empty/ })
    await userEvent.click(cell)
    await userEvent.keyboard('1')
    await expect(cell).toHaveAccessibleName(/^R1C1, 1/)
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
  },
}

export const RenbanVariant: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=renban" />,
}
export const RenbanDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=renban" />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}
