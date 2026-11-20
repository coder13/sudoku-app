import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { MarkedPairs, SizedConstraintRule } from '../sudoku/engine'
import { gridCellsShareEdge, type SizedGrid } from '../sudoku/grid'
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
  kropki: 'Kropki dots',
  difference: 'Difference marker',
  arrow: 'Arrow',
}

type RuleChoice = keyof typeof ruleNames
const ruleChoice = (rule: SizedConstraintRule) => rule.type === 'diagonal' ? rule.diagonal
  : rule.type === 'parity' ? rule.parity : rule.type

type KropkiKind = 'consecutive' | 'ratioTwo'
type KropkiMarks = Partial<Record<KropkiKind, MarkedPairs>>

function draftRule(kind: RuleChoice, cells: readonly number[], marks: KropkiMarks, difference: number): SizedConstraintRule {
  if (kind === 'arrow') return { type: kind, circle: cells[0] ?? 0, cells: cells.slice(1) }
  if (kind === 'difference') return { type: kind, cells: [cells[0] ?? 0, cells[1] ?? cells[0] ?? 0], difference }
  if (kind === 'kropki') return { type: kind, ...marks }
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
  const [marks, setMarks] = useState<KropkiMarks>({})
  const [dotKind, setDotKind] = useState<KropkiKind>('consecutive')
  const [difference, setDifference] = useState(1)
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')
  const id = useId()
  const otherRules = rules.filter((_, index) => index !== editing)
  const previous = rules[editing]
  const rule = kind === 'renban' && previous?.type === 'renban' && cells === previous.cells
    ? previous : draftRule(kind, cells, marks, difference)
  const preview = isSizedRuleList([rule], size) ? [...otherRules, rule] : otherRules
  const canSelectCells = 'cells' in rule || kind === 'kropki'
  const selectedEdge = cells.length === 2 && gridCellsShareEdge(cells[0], cells[1], size)
  const matchesEdge = ([a, b]: readonly [number, number]) => cells.includes(a) && cells.includes(b)
  const markedEdge = selectedEdge && marks[dotKind]?.pairs?.some(matchesEdge)
  const hasKropkiClues = Object.values(marks).some(mark => mark?.negative || mark?.pairs?.length)


  function selectRule(index: number) {
    const previous = rules[index]
    setEditing(index)
    setKind(previous ? ruleChoice(previous) : 'thermometer')
    setCells(previous?.type === 'arrow' ? [previous.circle, ...previous.cells] : previous && 'cells' in previous ? previous.cells : [])
    setMarks(previous?.type === 'kropki' ? { consecutive: previous.consecutive, ratioTwo: previous.ratioTwo } : {})
    setDotKind('consecutive')
    setDifference(previous?.type === 'difference' ? previous.difference : 1)
    setActive(previous?.type === 'arrow' ? previous.circle : previous && 'cells' in previous ? previous.cells[0] : 0)
    setError('')
  }

  function selectCell(cell: number) {
    setActive(cell)
    setError('')
    setCells(current => {
      if (current.includes(cell)) return current.filter(item => item !== cell)
      if ((kind === 'kropki' || kind === 'difference') && current.length === 2) return [cell]
      if ((kind === 'thermometer' || kind === 'renban') && current.length === size) return current
      if (kind === 'arrow' && current.length === size + 1) return current
      return [...current, cell]
    })
  }

  function toggleSelectedDot() {
    if (!selectedEdge) return
    const edge = [Math.min(...cells), Math.max(...cells)] as const
    const pairs = marks[dotKind]?.pairs ?? []
    const next = markedEdge ? pairs.filter(pair => !matchesEdge(pair)) : [...pairs, edge]
    setMarks({ ...marks, [dotKind]: { ...marks[dotKind], pairs: next } })
    setCells([])
    setError('')
  }

  function setNegative(kind: KropkiKind, negative: boolean) {
    setMarks({ ...marks, [kind]: { ...marks[kind], negative } })
    setError('')
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
    if (kind === 'kropki' && !hasKropkiClues) {
      setError('Add a dot or enable a negative rule.')
      return
    }
    if (kind === 'difference' && !selectedEdge) {
      setError('Select two cells that share an edge.')
      return
    }
    if (!isSizedRuleList(next, size)) {
      setError(kind === 'thermometer' ? `Select 2 to ${size} cells for the thermometer.`
        : kind === 'renban' ? `Select 1 to ${size} cells for the Renban line.`
          : kind === 'arrow' ? `Select a bulb and 1 to ${size} cells along the arrow.` : 'Select the cells for this rule.')
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
          {ruleNames[ruleChoice(rule)]}{rule.type === 'arrow' ? ` from ${cellName(rule.circle)}` : ''}{rule.type === 'difference' ? ` ${rule.difference}` : ''}{'cells' in rule ? ` · ${rule.cells.map(cellName).join(', ')}` : ''}
        </option>)}
      </SelectControl>
      <label htmlFor={`${id}-rule`}>Rule</label>
      <SelectControl id={`${id}-rule`} value={kind} onChange={event => {
        setKind(event.currentTarget.value as RuleChoice)
        setCells([])
        setMarks({})
        setDotKind('consecutive')
        setDifference(1)
        setError('')
      }}>
        {Object.entries(ruleNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </SelectControl>
      {'cells' in rule && <p id={`${id}-instructions`}>{kind === 'thermometer'
        ? 'Select the cells in order, from the bulb to the tip.'
        : kind === 'renban' ? 'Select the cells in the order you want to draw the line.'
          : kind === 'difference' ? 'Select two cells that share an edge.'
            : kind === 'arrow' ? 'Select the bulb first, then select the cells along the arrow in order.'
              : 'Select the cells that should have a marker.'}</p>}
      {kind === 'difference' && <>
        <label htmlFor={`${id}-difference`}>Exact difference</label>
        <SelectControl id={`${id}-difference`} value={difference} onChange={event => {
          setDifference(Number(event.currentTarget.value))
          setError('')
        }}>
          {Array.from({ length: size - 1 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
        </SelectControl>
      </>}
      {kind === 'kropki' && <>
        <label htmlFor={`${id}-dot-kind`}>Dot</label>
        <SelectControl id={`${id}-dot-kind`} value={dotKind}
          onChange={event => setDotKind(event.currentTarget.value as KropkiKind)}>
          <option value="consecutive">White dot</option>
          <option value="ratioTwo">Black dot</option>
        </SelectControl>
        <p id={`${id}-instructions`}>Select two cells that share an edge, then add or remove the dot.</p>
      </>}
      <Board grid={layout} sizedRules={preview} givens={game.givens} values={valuesOf(game)} showGuides
        label="Rule editor" selected={cells} active={active} onCell={canSelectCells ? selectCell : undefined}
        onGridKeyDown={canSelectCells ? moveFocus : undefined}
        descriptionId={canSelectCells ? `${id}-instructions` : undefined} />
      {kind === 'kropki' && <>
        <Button type="button" disabled={!selectedEdge} onClick={toggleSelectedDot}>{markedEdge ? 'Remove dot' : 'Add dot'}</Button>
        <label>
          <input type="checkbox" checked={marks.consecutive?.negative ?? false}
            onChange={event => setNegative('consecutive', event.currentTarget.checked)} />
          No consecutive digits across unmarked edges
        </label>
        <label>
          <input type="checkbox" checked={marks.ratioTwo?.negative ?? false}
            onChange={event => setNegative('ratioTwo', event.currentTarget.checked)} />
          No 1:2 ratios across unmarked edges
        </label>
      </>}
      {kind === 'arrow' && cells.length > 0 && <p aria-live="polite">Bulb {cellName(cells[0])}
        {cells.length > 1 && ` · Arrow through ${cells.slice(1).map(cellName).join(' → ')}`}</p>}
      {kind === 'thermometer' && cells.length > 0 && <p aria-live="polite">Path from bulb to tip · {cells.map(cellName).join(' → ')}</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="dialog-actions spread">
        {editing >= 0 && <Button type="button" variant="danger" onClick={() => update(otherRules)}>Remove clue</Button>}
        <Button type="submit" variant="primary">Save clue</Button>
      </div>
    </form>
  </Modal>
}
