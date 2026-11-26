import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { CustomDifficultyEditor } from '../../src/components/CustomDifficultyEditor'
import { Width } from '../support/frames'

const meta = {
  title: 'Puzzles/Custom difficulty',
  component: CustomDifficultyEditor,
  args: { names: [], onSave: fn() },
  decorators: [(Story) => <Width><Story /></Width>],
} satisfies Meta<typeof CustomDifficultyEditor>
export default meta

type Story = StoryObj<typeof meta>

export const NewDifficulty: Story = {}
export const Narrow: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent, args }) => {
    const save = canvas.getByRole('button', { name: 'Save difficulty' })
    await expect(save).toBeDisabled()
    await userEvent.type(canvas.getByRole('textbox', { name: 'Difficulty name' }), 'Fish practice')
    await userEvent.type(canvas.getByRole('searchbox', { name: 'Find a technique' }), 'swordfish')
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: /^Swordfish$/ }), 'require')
    await userEvent.click(save)
    await expect(args.onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Fish practice', required: ['swordfish'], allowed: expect.arrayContaining(['naked-single', 'swordfish']),
    }))
  },
}
