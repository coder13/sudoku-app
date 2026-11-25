import { useState, type KeyboardEvent } from 'react'
import { move, valuesOf, type Game } from '../sudoku/game'
import { isJigsawGrid, jigsawMembership, regionsFromMembership, type JigsawGrid } from '../sudoku/grid'
import { isSizedRuleList } from '../sudoku/sized-rule-game'
import { roomStore } from '../sudoku/storage'
import { Board } from './Board'
import { Button } from './Button'
import { Modal } from './Modal'
import { SelectControl } from './SelectControl'
import { focusGridCell, gridCellInDirection } from './grid-cell-navigation'

/** Edit a draft's region membership and commit the complete layout in one undo step. */
export function EditJigsawRegions({ game, layout, close }: { game: Game; layout: JigsawGrid; close: () => void }) {
  const { size } = layout
  const [membership, setMembership] = useState(() => jigsawMembership(layout))
  const [region, setRegion] = useState(0)
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')
  const preview: JigsawGrid = {
    size,
    regions: regionsFromMembership(membership, size),
    ...(layout.wrapAround && { wrapAround: true }),
  }

  function assign(cell: number) {
    setActive(cell)
    setError('')
    setMembership((current) => (current[cell] === region ? current : current.map((value, index) => (index === cell ? region : value))))
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const cell = gridCellInDirection(active, size, event.key)
    if (cell === undefined) return
    event.preventDefault()
    event.stopPropagation()
    setActive(cell)
    focusGridCell(event.currentTarget, cell)
  }

  function save() {
    if (!isJigsawGrid(preview)) {
      setError(`Each region needs ${size} cells connected along their edges${layout.wrapAround ? ', including the marked wraparound edges' : ''}.`)
      return
    }
    let failure = 'The draft changed. Reopen Edit regions to see the latest layout.'
    roomStore.update(game.id, (current) => {
      if (current.source !== 'draft' || current.grid !== layout) return current
      if (!isSizedRuleList(current.position.draftSizedRules ?? [], preview)) {
        failure = 'A Region Sum line must cross a region border. Edit that clue before moving its border.'
        return current
      }
      failure = ''
      if (membership.every((value, index) => value === jigsawMembership(layout)[index])) return current
      return move(current, {
        ...current.position,
        draftRegions: preview.regions,
      })
    })
    if (failure) setError(failure)
    else close()
  }

  return (
    <Modal title="Edit regions" onClose={close}>
      <div className="dialog-form sized-rule-editor">
        <label>
          Assign cells to
          <SelectControl value={region} onChange={(event) => setRegion(Number(event.currentTarget.value))}>
            {preview.regions.map((cells, index) => (
              <option key={index} value={index}>
                Region {index + 1} · {cells.length} of {size} cells
              </option>
            ))}
          </SelectControl>
        </label>
        <p>Select cells on the grid to assign them to that region.</p>
        <Board
          content={{
            grid: preview,
            givens: game.givens,
            values: valuesOf(game),
            position: {
              ...game.position,
              colors: membership.map((index) => index + 1),
            },
          }}
          appearance={{
            annotations: {
              cells: new Map(membership.map((index, cell) => [cell, { label: `Region ${index + 1}` }])),
            },
            label: 'Region editor',
            showGuides: true,
          }}
          interaction={{
            active: active,
            onCell: assign,
            onGridKeyDown: moveFocus,
          }}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save regions
          </Button>
        </div>
      </div>
    </Modal>
  )
}
