import { Redo2, Undo2 } from 'lucide-react'
import { IconButton } from './Button'

/** Present consistent Undo and Redo controls for puzzle histories. */
export function PuzzleHistoryActions({ undo, redo, canUndo, canRedo, disabled = false, hideUndo = false }: {
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  disabled?: boolean
  hideUndo?: boolean
}) {
  return <>
    {!hideUndo && <IconButton className="history-button" onClick={undo} disabled={disabled || !canUndo}
      aria-label="Undo" title="Undo"><Undo2 size={18} /></IconButton>}
    <IconButton className="history-button" onClick={redo} disabled={disabled || !canRedo}
      aria-label="Redo" title="Redo"><Redo2 size={18} /></IconButton>
  </>
}
