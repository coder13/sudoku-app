import { useRef, useState } from 'react'
import { BookmarkPlus, Trash2 } from 'lucide-react'
import { BOOKMARK_NAME_LIMIT, type PuzzleBookmark } from '../sudoku/game'
import { Button, IconButton } from './Button'

/** List a puzzle's saved grid positions and let the player save, restore, or delete one. */
export function BookmarksPanel({ bookmarks = [], disabled, onSave, onRestore, onDelete }: {
  bookmarks?: readonly Pick<PuzzleBookmark, 'id' | 'name'>[]
  disabled?: boolean
  onSave: (name: string) => void
  onRestore: (id: string) => void
  onDelete: (id: string) => void
}) {
  const nameInput = useRef<HTMLInputElement>(null)
  const [announcement, setAnnouncement] = useState('')

  return <section className="bookmarks-panel" aria-label="Puzzle bookmarks" data-grid-click-away-exempt>
    <form className="bookmark-form" onSubmit={event => {
      event.preventDefault()
      onSave(nameInput.current?.value ?? '')
      event.currentTarget.reset()
      setAnnouncement('Bookmark saved.')
    }}>
      <input ref={nameInput} type="text" aria-label="Bookmark name" placeholder="Name (optional)"
        maxLength={BOOKMARK_NAME_LIMIT} disabled={disabled} />
      <Button type="submit" disabled={disabled}><BookmarkPlus size={16} aria-hidden="true" /> Save bookmark</Button>
    </form>
    {bookmarks.length === 0 ? <p>Save a bookmark to return to this grid later.</p> :
      <ul className="bookmark-list">{bookmarks.map(bookmark => <li key={bookmark.id}>
        <strong>{bookmark.name}</strong>
        <Button variant="quiet" disabled={disabled} aria-label={`Restore ${bookmark.name}`} onClick={() => {
          onRestore(bookmark.id)
          setAnnouncement(`Restored ${bookmark.name}.`)
        }}>Restore</Button>
        <IconButton variant="quiet" disabled={disabled} aria-label={`Delete ${bookmark.name}`} title={`Delete ${bookmark.name}`} onClick={() => {
          onDelete(bookmark.id)
          setAnnouncement(`Deleted ${bookmark.name}.`)
          nameInput.current?.focus({ preventScroll: true })
        }}><Trash2 size={16} aria-hidden="true" /></IconButton>
      </li>)}</ul>}
    <span className="sr-only" role="status">{announcement}</span>
  </section>
}
