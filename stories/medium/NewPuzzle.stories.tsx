import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { CUSTOM_MODES_KEY } from '../../src/sudoku/custom-modes'
import { NEW_PUZZLE_KEY } from '../../src/sudoku/preferences'
import { PreviewRouter } from '../support/frames'
import { solved } from '../support/fixtures'
import { seedRoom } from '../support/story-room'

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

export const DifficultyResults: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=classic&difficulty=hard" />,
  beforeEach: () => { seedRoom([{ ...solved, difficulty: 'hard', elapsed: 249 }]) },
}

export const MiracleXSums: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=x-sum&difficulty=hard" />,
  play: async ({ canvas, userEvent }) => {
    const checkbox = await canvas.findByRole('checkbox', { name: 'Miracle puzzle (no givens)' })
    await expect(checkbox).toBeEnabled()
    await userEvent.click(checkbox)
    await expect(checkbox).toBeChecked()
  },
}

export const CombinedModeDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?step=variant" />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: () => {
    const previous = localStorage.getItem(CUSTOM_MODES_KEY)
    localStorage.setItem(CUSTOM_MODES_KEY, JSON.stringify([{
      id: '00000000-0000-4000-8000-000000000000', name: 'Chess', rules: ['anti-king', 'anti-knight', 'non-consecutive'],
    }]))
    return () => {
      if (previous === null) localStorage.removeItem(CUSTOM_MODES_KEY)
      else localStorage.setItem(CUSTOM_MODES_KEY, previous)
    }
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('link', { name: 'Chess' }))
    await expect(await canvas.findByRole('heading', { name: 'Choose difficulty' })).toHaveFocus()
    await expect(canvas.getByText('Anti-King · Anti-Knight · Non-Consecutive')).toBeVisible()
    const auto = canvas.getByRole('checkbox', { name: 'Adjust difficulty automatically' })
    await userEvent.click(auto)
    await expect(canvas.getByRole('button', { name: /Start Auto/ })).toBeEnabled()
    await userEvent.click(auto)
    const increase = canvas.queryByRole('button', { name: 'Increase difficulty' })
    if (increase) {
      await userEvent.click(increase)
      await userEvent.click(increase)
    } else await userEvent.click(canvas.getByRole('radio', { name: 'Hard' }))
    await expect(await canvas.findByRole('button', { name: 'Start hard puzzle' })).toBeEnabled()
    await expect(canvas.getByRole('checkbox', { name: 'Miracle puzzle (no givens)' })).toBeDisabled()
    await userEvent.click(canvas.getByRole('link', { name: 'Edit mode' }))
    await expect(await canvas.findByRole('textbox', { name: 'Mode name' })).toHaveValue('Chess')
    await userEvent.click(canvas.getByRole('button', { name: /^Back$/ }))
    await expect(await canvas.findByRole('button', { name: 'Start hard puzzle' })).toBeEnabled()
  },
}

export const RememberedDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new" />,
  beforeEach: () => {
    const previous = localStorage.getItem(NEW_PUZZLE_KEY)
    localStorage.setItem(NEW_PUZZLE_KEY, JSON.stringify({ variant: 'classic', difficulty: 'hard' }))
    return () => {
      if (previous === null) localStorage.removeItem(NEW_PUZZLE_KEY)
      else localStorage.setItem(NEW_PUZZLE_KEY, previous)
    }
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByRole('button', { name: 'Start hard puzzle' })).toBeEnabled()
    const increase = canvas.queryByRole('button', { name: 'Increase difficulty' })
    if (increase) await userEvent.click(increase)
    else await userEvent.click(canvas.getByRole('radio', { name: 'Very Hard' }))
    await expect(await canvas.findByRole('button', { name: 'Start very hard puzzle' })).toBeEnabled()
    await userEvent.click(canvas.getByRole('link', { name: 'Back to Sudoku modes' }))
    await expect(await canvas.findByRole('heading', { name: 'Choose a Sudoku mode' })).toBeVisible()
    await userEvent.click(canvas.getByRole('link', { name: 'Classic' }))
    await expect(await canvas.findByRole('button', { name: 'Start very hard puzzle' })).toBeEnabled()
  },
}

export const Mobile: Story = {
  ...ChooseVariant,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Next variant' }))
    await canvas.findByRole('heading', { name: 'Diagonal' })
    await userEvent.click(canvas.getByRole('link', { name: 'Continue' }))
    await canvas.findByRole('heading', { name: 'Choose difficulty' })
    await expect(canvas.getByText('X Sudoku', { exact: true })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Back' }))
    await expect(await canvas.findByRole('heading', { name: 'Diagonal' })).toBeVisible()
  },
}

export const RectangularSix: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=six&boxRows=3" />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByRole('combobox', { name: 'Box layout' })).toHaveValue('3')
    await userEvent.click(canvas.getByRole('link', { name: 'Continue' }))
    await expect(await canvas.findByRole('heading', { name: 'Choose difficulty' })).toBeVisible()
    await expect(canvas.getByText('3 × 2 boxes', { exact: true })).toBeVisible()
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
    await userEvent.click(await canvas.findByRole('link', { name: 'Play a catalog puzzle' }))
    const cell = await canvas.findByRole('button', { name: /^R2C3, empty/ })
    await userEvent.click(cell)
    await userEvent.keyboard('1')
    await expect(cell).toHaveAccessibleName(/^R2C3, 1/)
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'View hint' }))
    const more = await canvas.findByRole('button', { name: 'More detail' })
    for (let stage = 0; stage < 3; stage++) await userEvent.click(more)
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
    await userEvent.click(await canvas.findByRole('link', { name: 'Play a catalog puzzle' }))
    const cell = await canvas.findByRole('button', { name: /^R1C1, empty/ })
    await userEvent.click(cell)
    await userEvent.keyboard('1')
    await expect(cell).toHaveAccessibleName(/^R1C1, 1/)
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
  },
}

export const FutoshikiFromGameTypes: Story = {
  ...ChooseVariant,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('link', { name: 'Change game type' }))
    await userEvent.click(await canvas.findByRole('link', { name: /Futoshiki/ }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Start easy puzzle' }))
    const cell = await canvas.findByRole('button', { name: /^R2C3, empty/ })
    await expect(cell).toHaveAccessibleName(/R2C3 is less than R2C2/)
    await userEvent.click(cell)
    await userEvent.keyboard('{ArrowLeft}')
    await expect(canvas.getByRole('button', { name: /^R2C2, empty/ })).toHaveFocus()
    await userEvent.click(canvas.getByRole('link', { name: 'Back to Futoshiki difficulty' }))
    const increase = await canvas.findByRole('button', { name: 'Increase difficulty' })
    await userEvent.click(increase)
    await userEvent.click(increase)
    await userEvent.click(canvas.getByRole('button', { name: 'Start hard puzzle' }))
    await expect(await canvas.findByRole('group', { name: 'Digit pad' })).toHaveClass('six-keypad')
  },
}

export const HidatoTwoDigitEntry: Story = {
  render: () => <PreviewRouter shell path="/puzzles/hidato/hard-1" />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const cell = await canvas.findByRole('button', { name: /^R1C2, empty/ })
    await userEvent.click(cell)
    const input = canvas.getByRole('textbox', { name: 'Number from 1 to 23' })
    await userEvent.type(input, '12')
    await userEvent.click(canvas.getByRole('button', { name: /^Place$/ }))
    await expect(cell).toHaveAccessibleName(/^R1C2, 12/)
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

export const InequalityVariant: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new?variant=inequality" />,
}
export const InequalityDifficulty: Story = {
  render: () => <PreviewRouter shell path="/puzzles/new/difficulty?variant=inequality" />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}
