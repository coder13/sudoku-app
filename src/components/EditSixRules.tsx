import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { SixGrid, SizedConstraintRule } from '../sudoku/engine'
import { move, valuesOf, type Game } from '../sudoku/game'
import { isSixRuleList } from '../sudoku/six-game'
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
const cellName = (cell: number) => `R${Math.floor(cell / 6) + 1}C${cell % 6 + 1}`
const ruleChoice = (rule: SizedConstraintRule) => rule.type === 'diagonal' ? rule.diagonal
  : rule.type === 'parity' ? rule.parity : rule.type

function draftRule(kind: RuleChoice, cells: readonly number[]): SizedConstraintRule {
  if (kind === 'main' || kind === 'anti') return { type: 'diagonal', diagonal: kind }
  if (kind === 'thermometer' || kind === 'renban') return { type: kind, cells }
  return { type: 'parity', parity: kind, cells }
}

export function EditSixRules({ game, layout, close }: { game: Game; layout: SixGrid; close: () => void }) {
  const [rules] = useState(game.position.draftSixRules ?? [])
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
  const preview = isSixRuleList([rule]) ? [...otherRules, rule] : otherRules

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
      : (kind === 'thermometer' || kind === 'renban') && current.length === 6 ? current : [...current, cell])
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const offsets = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as const
    if (!Object.hasOwn(offsets, event.key)) return
    const [rowOffset, columnOffset] = offsets[event.key as keyof typeof offsets]
    const row = Math.max(0, Math.min(5, Math.floor(active / 6) + rowOffset))
    const column = Math.max(0, Math.min(5, active % 6 + columnOffset))
    const cell = row * 6 + column
    event.preventDefault()
    event.stopPropagation()
    setActive(cell)
    event.currentTarget.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus()
  }

  function update(next: readonly SizedConstraintRule[]) {
    let changed = false
    roomStore.update(game.id, current => {
      if (current.source !== 'draft' || current.grid?.size !== 6 ||
        JSON.stringify(current.position.draftSixRules) !== JSON.stringify(rules)) return current
      changed = true
      return move(current, { ...current.position, draftSixRules: next })
    })
    if (changed) close()
    else setError('The draft changed. Reopen Edit rules to see the latest clues.')
  }

  function save(event: FormEvent) {
    event.preventDefault()
    const next = [...rules]
    if (editing < 0) next.push(rule)
    else next[editing] = rule
    if (!isSixRuleList(next)) {
      setError(kind === 'thermometer' ? 'Select two to six cells for the thermometer.'
        : kind === 'renban' ? 'Select up to six cells for the Renban line.' : 'Select the cells for this rule.')
      return
    }
    update(next)
  }

  return <Modal title="Edit 6 × 6 rules" className="six-rule-editor" onClose={close}>
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
