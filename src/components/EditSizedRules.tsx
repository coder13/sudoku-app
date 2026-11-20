import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { SizedConstraintRule } from '../sudoku/engine'
import type { SizedGrid } from '../sudoku/grid'
import { move, valuesOf, type Game } from '../sudoku/game'
import { isSizedRuleList } from '../sudoku/sized-rule-game'
import { roomStore } from '../sudoku/storage'
import { Board } from './Board'
import { Button } from './Button'
import { Modal } from './Modal'
import { SelectControl } from './SelectControl'

const ruleNames = {
  main: 'Top-left to bottom-right diagonal',
  anti: 'Top-right to bottom-left diagonal',
  odd: 'Odd circles',
  even: 'Even squares',
  thermometer: 'Thermometer',
  renban: 'Renban line',
}

type RuleChoice = keyof typeof ruleNames
const ruleChoice = (rule: SizedConstraintRule) => rule.type === 'diagonal' ? rule.diagonal
  : rule.type === 'parity' ? rule.parity : rule.type

function draftRule(kind: RuleChoice, cells: readonly number[]): SizedConstraintRule {
  if (kind === 'main' || kind === 'anti') return { type: 'diagonal', diagonal: kind }
  if (kind === 'thermometer' || kind === 'renban') return { type: kind, cells }
  return { type: 'parity', parity: kind, cells }
}

export function EditSizedRules({ game, layout, close }: { game: Game; layout: SizedGrid; close: () => void }) {
  const { size } = layout
  const cellName = (cell: number) => `R${Math.floor(cell / size) + 1}C${cell % size + 1}`
  const [rules] = useState(game.position.draftSizedRules ?? [])
  const [editing, setEditing] = useState(-1)
  const [kind, setKind] = useState<RuleChoice>('thermometer')
  const [cells, setCells] = useState<readonly number[]>([])
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')
  const id = useId()
  const otherRules = rules.filter((_, index) => index !== editing)
  const previous = rules[editing]
  const rule = kind === 'renban' && previous?.type === 'renban' && cells === previous.cells
    ? previous : draftRule(kind, cells)
  const preview = isSizedRuleList([rule], size) ? [...otherRules, rule] : otherRules

  function selectRule(index: number) {
    const previous = rules[index]
    setEditing(index)
    setKind(previous ? ruleChoice(previous) : 'thermometer')
    setCells(previous && 'cells' in previous ? previous.cells : [])
    setActive(previous && 'cells' in previous ? previous.cells[0] : 0)
    setError('')
  }

  function selectCell(cell: number) {
    setActive(cell)
    setError('')
    setCells(current => current.includes(cell) ? current.filter(item => item !== cell)
      : (kind === 'thermometer' || kind === 'renban') && current.length === size ? current : [...current, cell])
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const offsets = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as const
    if (!Object.hasOwn(offsets, event.key)) return
    const [rowOffset, columnOffset] = offsets[event.key as keyof typeof offsets]
    const row = Math.max(0, Math.min(size - 1, Math.floor(active / size) + rowOffset))
    const column = Math.max(0, Math.min(size - 1, active % size + columnOffset))
    const cell = row * size + column
    event.preventDefault()
    event.stopPropagation()
    setActive(cell)
    event.currentTarget.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus()
  }

  function update(next: readonly SizedConstraintRule[]) {
    let changed = false
    roomStore.update(game.id, current => {
      if (current.source !== 'draft' || current.grid?.size !== size || current.grid.boxRows !== layout.boxRows ||
        current.position.draftCages !== undefined ||
        JSON.stringify(current.position.draftSizedRules ?? []) !== JSON.stringify(rules)) return current
      changed = true
      return move(current, { ...current.position, draftSizedRules: next })
    })
    if (changed) close()
    else setError('The draft changed. Reopen Edit rules to see the latest clues.')
  }

  function save(event: FormEvent) {
    event.preventDefault()
    const next = [...rules]
    if (editing < 0) next.push(rule)
    else next[editing] = rule
    if (!isSizedRuleList(next, size)) {
      setError(kind === 'thermometer' ? `Select 2 to ${size} cells for the thermometer.`
        : kind === 'renban' ? `Select 1 to ${size} cells for the Renban line.` : 'Select the cells for this rule.')
      return
    }
    update(next)
  }

  return <Modal title={`Edit ${size} × ${size} rules`} className="sized-rule-editor" onClose={close}>
    <form className="dialog-form" onSubmit={save}>
      <label htmlFor={`${id}-clue`}>Clue</label>
      <SelectControl id={`${id}-clue`} value={editing} onChange={event => selectRule(Number(event.currentTarget.value))}>
        <option value={-1}>New clue</option>
        {rules.map((rule, index) => <option key={index} value={index}>
          {ruleNames[ruleChoice(rule)]}{'cells' in rule ? ` · ${rule.cells.map(cellName).join(', ')}` : ''}
        </option>)}
      </SelectControl>
      <label htmlFor={`${id}-rule`}>Rule</label>
      <SelectControl id={`${id}-rule`} value={kind} onChange={event => {
        setKind(event.currentTarget.value as RuleChoice)
        setCells([])
        setError('')
      }}>
        {Object.entries(ruleNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </SelectControl>
      {'cells' in rule && <p id={`${id}-instructions`}>{kind === 'thermometer'
        ? 'Select the cells in order, from the bulb to the tip.'
        : kind === 'renban' ? 'Select the cells in the order you want to draw the line.'
          : 'Select the cells that should have a marker.'}</p>}
      <Board grid={layout} sizedRules={preview} givens={game.givens} values={valuesOf(game)} showGuides
        label="Rule editor" selected={cells} active={active} onCell={'cells' in rule ? selectCell : undefined}
        onGridKeyDown={'cells' in rule ? moveFocus : undefined}
        descriptionId={'cells' in rule ? `${id}-instructions` : undefined} />
      {kind === 'thermometer' && cells.length > 0 && <p aria-live="polite">Path from bulb to tip · {cells.map(cellName).join(' → ')}</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="dialog-actions spread">
        {editing >= 0 && <Button type="button" variant="danger" onClick={() => update(otherRules)}>Remove clue</Button>}
        <Button type="submit" variant="primary">Save clue</Button>
      </div>
    </form>
  </Modal>
}
