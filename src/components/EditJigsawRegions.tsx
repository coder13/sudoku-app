import { useState, type KeyboardEvent } from 'react'
import { move, valuesOf, type Game } from '../sudoku/game'
import { isSevenJigsawGrid, jigsawMembership, regionsFromMembership, type SevenJigsawGrid } from '../sudoku/grid'
import { isSizedRuleList } from '../sudoku/sized-rule-game'
import { roomStore } from '../sudoku/storage'
import { Board } from './Board'
import { Button } from './Button'
import { Modal } from './Modal'
import { SelectControl } from './SelectControl'

const directions = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as const

/** Edit a draft's region membership and commit the complete layout in one undo step. */
export function EditJigsawRegions({ game, layout, close }: { game: Game; layout: SevenJigsawGrid; close: () => void }) {
  const { size } = layout
  const [membership, setMembership] = useState(() => jigsawMembership(layout))
  const [region, setRegion] = useState(0)
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')
  const preview: SevenJigsawGrid = { size, regions: regionsFromMembership(membership, size) }

  function assign(cell: number) {
    setActive(cell)
    setError('')
    setMembership(current => current[cell] === region ? current : current.map((value, index) => index === cell ? region : value))
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!Object.hasOwn(directions, event.key)) return
    const [dr, dc] = directions[event.key as keyof typeof directions]
    const row = Math.min(size - 1, Math.max(0, Math.floor(active / size) + dr))
    const column = Math.min(size - 1, Math.max(0, active % size + dc))
    const cell = row * size + column
    event.preventDefault()
    event.stopPropagation()
    setActive(cell)
    event.currentTarget.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus()
  }

  function save() {
    if (!isSevenJigsawGrid(preview)) {
      setError('Each region needs seven cells connected along their edges.')
      return
    }
    let failure = 'The draft changed. Reopen Edit regions to see the latest layout.'
    roomStore.update(game.id, current => {
      if (current.source !== 'draft' || current.grid !== layout) return current
      if (!isSizedRuleList(current.position.draftSizedRules ?? [], preview)) {
        failure = 'A Region Sum line must cross a region border. Edit that clue before moving its border.'
        return current
      }
      failure = ''
      if (membership.every((value, index) => value === jigsawMembership(layout)[index])) return current
      return move(current, { ...current.position, draftRegions: preview.regions })
    })
    if (failure) setError(failure)
    else close()
  }

  return <Modal title="Edit regions" onClose={close}>
    <div className="dialog-form sized-rule-editor">
      <label>Assign cells to
        <SelectControl value={region} onChange={event => setRegion(Number(event.currentTarget.value))}>
          {preview.regions.map((cells, index) => <option key={index} value={index}>Region {index + 1} · {cells.length} of {size} cells</option>)}
        </SelectControl>
      </label>
      <p>Select cells on the grid to assign them to that region.</p>
      <Board grid={preview} givens={game.givens} values={valuesOf(game)}
        position={{ ...game.position, colors: membership.map(index => index + 1) }}
        annotations={{ cells: new Map(membership.map((index, cell) => [cell, { label: `Region ${index + 1}` }])) }}
        active={active} onCell={assign} onGridKeyDown={moveFocus} label="Region editor" showGuides />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={save}>Save regions</Button>
      </div>
    </div>
  </Modal>
}
