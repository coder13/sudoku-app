import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { EditJigsawRegions } from '../../src/components/EditJigsawRegions'
import { makeGame } from '../../src/sudoku/game'
import { sevenJigsawForSeed } from '../../src/sudoku/grid'

const layout = sevenJigsawForSeed()
const game = makeGame('jigsaw-editor', 'Jigsaw draft', '0'.repeat(49), 'draft', 0, layout)
const meta = {
  title: 'Medium/Play/Jigsaw region editor',
  component: EditJigsawRegions,
  args: { game, layout, close: () => {} },
} satisfies Meta<typeof EditJigsawRegions>
export default meta
type Story = StoryObj<typeof meta>

export const IncompleteRegion: Story = {
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body).getByRole('dialog', { name: 'Edit regions' })
    const editor = within(dialog)
    await userEvent.selectOptions(editor.getByRole('combobox', { name: /Assign cells to/ }), '1')
    await userEvent.click(editor.getAllByRole('gridcell')[0])
    await userEvent.click(editor.getByRole('button', { name: 'Save regions' }))
    await expect(editor.getByRole('alert')).toHaveTextContent('Each region needs seven cells connected along their edges.')
  },
}
