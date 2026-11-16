import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { Workspace } from '../../src/components/Workspace'
import { PreviewRouter } from '../support/frames'
import { namedDraft, solved, starter } from '../support/fixtures'
import { seedRoom } from '../support/story-room'

const meta = {
  title: 'Large/Play/Workspace',
  component: Workspace,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  render: () => <div className="story-app"><PreviewRouter shell /></div>,
} satisfies Meta<typeof Workspace>
export default meta
type Story = StoryObj<typeof meta>

export const ReadyToPlay: Story = { beforeEach: () => { seedRoom([starter]) } }
export const Empty: Story = { beforeEach: () => { seedRoom([]) } }
export const StorageUnavailable: Story = { beforeEach: () => { seedRoom([starter], starter.id, false) } }
export const DraftValidation: Story = {
  beforeEach: () => { seedRoom([namedDraft, starter]) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Open options menu' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Validate puzzle' }))
    await expect(await canvas.findByRole('dialog', { name: 'Puzzle check' }, { timeout: 6000 })).toHaveTextContent('This puzzle has exactly one solution.')
  },
}
export const DifficultyAfterSolve: Story = {
  beforeEach: () => { seedRoom([solved]) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Choose difficulty' }))
    await expect(canvas.getByRole('radiogroup', { name: 'Next puzzle difficulty' })).toBeVisible()
  },
}
export const ResizeInputPanel: Story = {
  beforeEach: () => { seedRoom([starter]) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Open options menu' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Settings' }))
    await canvas.findByRole('dialog')
    const mobileAppearance = canvas.queryByRole('button', { name: /^Look & feel/ })
    if (mobileAppearance) await userEvent.click(mobileAppearance)
    await userEvent.click(await canvas.findByRole('button', { name: /^Panel size/ }))
    await expect(await canvas.findByRole('region', { name: 'Resize panels' })).toBeVisible()
  },
}
