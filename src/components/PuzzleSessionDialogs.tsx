import { Button } from './Button'
import { Modal } from './Modal'

type CandidateConfirmation = {
  open: boolean
  returnFocus: () => HTMLElement | null
  onClose: () => void
  onConfirm: () => void
}

type ResetConfirmation = {
  open: boolean
  removesTime: boolean
  onClose: () => void
  onConfirm: () => void
}

type DraftConfirmation = {
  open: boolean
  editing: boolean
  onClose: () => void
  onDiscard: () => void
}

/** Present the puzzle's destructive confirmations; the host owns each transaction. */
export function PuzzleSessionDialogs({ candidates, reset, draft }: {
  candidates: CandidateConfirmation
  reset: ResetConfirmation
  draft: DraftConfirmation
}) {
  return <>
    <Modal title="Generate candidates?" open={candidates.open} onClose={candidates.onClose}
      returnFocus={candidates.returnFocus}>
      <p>Generating candidates will replace the candidates already in the grid. You can undo this change.</p>
      <div className="dialog-actions">
        <Button onClick={candidates.onClose}>Cancel</Button>
        <Button variant="primary" onClick={candidates.onConfirm}>Generate candidates</Button>
      </div>
    </Modal>
    <Modal title="Reset puzzle" open={reset.open} onClose={reset.onClose} className="reset-puzzle-dialog">
      <p>{reset.removesTime
        ? 'Remove all placed digits, candidates, and colors from this puzzle?'
        : 'Remove all placed digits, candidates, colors, and elapsed time from this puzzle?'}</p>
      <div className="dialog-actions">
        <Button onClick={reset.onClose}>Cancel</Button>
        <Button variant="danger" onClick={reset.onConfirm}>Reset puzzle</Button>
      </div>
    </Modal>
    <Modal title={draft.editing ? 'Cancel puzzle editing?' : 'Cancel puzzle creation?'} open={draft.open}
      onClose={draft.onClose} className="reset-puzzle-dialog">
      <p>{draft.editing
        ? 'Discard your changes and return to the saved puzzle?'
        : 'Discard this draft and return to your previous puzzle?'}</p>
      <div className="dialog-actions">
        <Button onClick={draft.onClose}>Keep editing</Button>
        <Button variant="danger" onClick={draft.onDiscard}>
          {draft.editing ? 'Discard changes' : 'Discard draft'}
        </Button>
      </div>
    </Modal>
  </>
}
