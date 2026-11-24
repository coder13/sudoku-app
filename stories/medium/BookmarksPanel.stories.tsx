import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { BookmarksPanel } from '../../src/components/BookmarksPanel'
import { createPuzzleBookmark, makeGame, type PuzzleBookmark } from '../../src/sudoku/game'
import { Width } from '../support/frames'

const game = makeGame('bookmark-example', 'Bookmark example', '0'.repeat(81), 'custom')
const saved = [
  createPuzzleBookmark(game, 'Before checking the candidates in the bottom-right box'),
  createPuzzleBookmark(game, 'Before trying 7 in R4C2'),
]

function BookmarksExample({ populated = false, disabled = false }: { populated?: boolean; disabled?: boolean }) {
  const [bookmarks, setBookmarks] = useState<readonly PuzzleBookmark[]>(populated ? saved : [])
  return <BookmarksPanel bookmarks={bookmarks} disabled={disabled}
    onSave={name => setBookmarks(current => [createPuzzleBookmark({ ...game, bookmarks: current }, name), ...current])}
    onRestore={() => {}}
    onDelete={id => setBookmarks(current => current.filter(bookmark => bookmark.id !== id))} />
}

const meta = {
  title: 'Medium/Play/Bookmarks',
  component: BookmarksExample,
  decorators: [(Story) => <Width width={270}><Story /></Width>],
} satisfies Meta<typeof BookmarksExample>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
export const SavedPositions: Story = { args: { populated: true } }
export const Paused: Story = { args: { populated: true, disabled: true } }
