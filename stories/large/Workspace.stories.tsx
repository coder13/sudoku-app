import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { Workspace } from '../../src/components/Workspace'
import { fillEntries, valuesOf } from '../../src/sudoku/game'
import { PreviewRouter } from '../support/frames'
import { namedDraft, solved, starter } from '../support/fixtures'
import { seedRoom } from '../support/story-room'
import { seedAppearance } from '../support/story-preferences'

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
export const PictureInPictureSpace: Story = {
  render: () => <div className="story-app"><PreviewRouter shell path={`/?puzzle=${starter.id}`} /></div>,
  beforeEach: () => {
    seedRoom([starter])
    return seedAppearance({ mobilePuzzleTopSpace: 96 })
  },
}
export const DeviceSyncFromSettings: Story = {
  beforeEach: () => { seedRoom([starter]) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Open options menu' }))
    await expect(canvas.queryByRole('link', { name: 'Device sync' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Settings' }))
    await userEvent.click(await canvas.findByRole('link', { name: /^Device sync/ }))
    const dialog = await canvas.findByRole('dialog', { name: 'Device sync' })
    const sync = within(dialog)
    await userEvent.click(await sync.findByRole('link', { name: /^Scan QR code/ }))
    await expect(await canvas.findByRole('dialog', { name: 'Scan QR code' })).toBe(dialog)
    await userEvent.click(sync.getByRole('link', { name: 'Use a recovery key' }))
    await expect(await sync.findByRole('heading', { name: 'Recover sync' })).toHaveFocus()
    await expect(sync.getByRole('button', { name: 'Recover puzzles and settings' })).toBeDisabled()
    await userEvent.click(sync.getByRole('button', { name: 'Back to scanner' }))
    await expect(await sync.findByRole('heading', { name: 'Scan QR code' })).toBeVisible()
    await userEvent.click(sync.getByRole('button', { name: 'Back to Device sync' }))
    await expect(await canvas.findByRole('dialog', { name: 'Device sync' })).toBe(dialog)
  },
}
export const DeviceSyncFromPairingLink: Story = {
  render: () => <div className="story-app">
    <PreviewRouter shell path={'/settings/device-sync/confirm#pair=' + 'a'.repeat(64)} />
  </div>,
  beforeEach: () => { seedRoom([starter]) },
  play: async ({ canvas, userEvent }) => {
    const dialog = within(await canvas.findByRole('dialog', { name: 'Link this device?' }))
    const link = await dialog.findByRole('button', { name: 'Link this device' })
    await waitFor(() => expect(link).toBeVisible())
    await userEvent.click(dialog.getByRole('button', { name: 'Back to Device sync' }))
    await expect(await canvas.findByRole('dialog', { name: 'Device sync' })).toBeVisible()
  },
}
export const KeyboardShortcutsInSettings: Story = {
  beforeEach: () => { seedRoom([starter]) },
  play: async ({ canvas, userEvent }) => {
    const options = await canvas.findByRole('button', { name: 'Open options menu' })
    await userEvent.click(options)
    await userEvent.click(canvas.getByRole('button', { name: 'Keyboard shortcuts' }))
    await expect(await canvas.findByRole('heading', { name: 'Keyboard shortcuts' })).toHaveFocus()
    const direct = within(await canvas.findByRole('dialog', { name: 'Keyboard shortcuts' }))
    await userEvent.click(direct.getByRole('button', { name: 'Close dialog' }))
    await waitFor(() => expect(options).toHaveFocus())

    await userEvent.click(options)
    await userEvent.click(canvas.getByRole('button', { name: 'Settings' }))
    const dialog = await canvas.findByRole('dialog', { name: /^Settings$/ })
    await userEvent.click(within(dialog).getByRole('link', { name: /^Keyboard shortcuts/ }))
    await expect(await canvas.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBe(dialog)

    const shortcuts = within(dialog)
    const binding = await shortcuts.findByRole('button', { name: /^Change shortcut for Highlight mode/ })
    await userEvent.click(binding)
    await userEvent.keyboard('1')
    await expect(shortcuts.getByRole('status')).toHaveTextContent('Choose a letter key or question mark')
    await userEvent.keyboard('{Escape}')
    await expect(shortcuts.getByRole('status')).toHaveTextContent('Shortcut change canceled.')
    await expect(binding).toHaveFocus()
  },
}
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
const solvedValues = valuesOf(solved)
const beforeNextPuzzle = {
  ...fillEntries(starter, solvedValues.slice(0, 3) + '0' + solvedValues.slice(4)),
  id: 'before-next-puzzle',
  elapsed: solved.elapsed,
}
export const NextPuzzleAfterSolve: Story = {
  beforeEach: () => { seedRoom([beforeNextPuzzle]) },
  render: () => <div className="story-app"><PreviewRouter shell path={`/?puzzle=${beforeNextPuzzle.id}`} /></div>,
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
