import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { MarkedPairs, SizedConstraintRule, SizedLabeledDotsRule } from '../sudoku/engine'
import { gridCellsShareEdge, sizedGridIdentity, type SizedGrid } from '../sudoku/grid'
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
  'labeled-dots': 'Labeled dots',
  difference: 'Difference marker',
  arrow: 'Arrow',
  'double-arrow': 'Double Arrow',
  'region-sum': 'Region Sum line',
  'extra-house': 'Extra region',
  'killer-cages': 'Killer cages',
}

type RuleChoice = keyof typeof ruleNames
const ruleChoice = (rule: SizedConstraintRule) => rule.type === 'diagonal' ? rule.diagonal
  : rule.type === 'parity' ? rule.parity : rule.type

type KillerRule = Extract<SizedConstraintRule, { type: 'killer-cages' }>

type KropkiKind = 'consecutive' | 'ratioTwo'
type KropkiMarks = Partial<Record<KropkiKind, MarkedPairs>>

const emptyDotLayer: SizedLabeledDotsRule = { type: 'labeled-dots', relation: 'difference', marks: [] }

function draftRule(kind: RuleChoice, cells: readonly number[], marks: KropkiMarks, difference: number, groupByRegion: boolean, labeled: SizedLabeledDotsRule, killer: KillerRule): SizedConstraintRule {
  if (kind === 'killer-cages') return killer
  if (kind === 'labeled-dots') return labeled
  if (kind === 'region-sum') return { type: kind, cells, ...(groupByRegion && { groupByRegion }) }
  if (kind === 'double-arrow') return { type: kind, ends: [cells[0] ?? 0, cells.at(-1) ?? 0], cells: cells.slice(1, -1) }
  if (kind === 'arrow') return { type: kind, circle: cells[0] ?? 0, cells: cells.slice(1) }
  if (kind === 'difference') return { type: kind, cells: [cells[0] ?? 0, cells[1] ?? cells[0] ?? 0], difference }
  if (kind === 'kropki') return { type: kind, ...marks }
  if (kind === 'main' || kind === 'anti') return { type: 'diagonal', diagonal: kind }
  if (kind === 'thermometer' || kind === 'renban' || kind === 'extra-house') return { type: kind, cells }
  return { type: 'parity', parity: kind, cells }
}

export function EditSizedRules({ game, layout, close }: { game: Game; layout: SizedGrid; close: () => void }) {
  const { size } = layout
  const group = 'regions' in layout ? 'region' : 'box'
  const cellName = (cell: number) => `R${Math.floor(cell / size) + 1}C${cell % size + 1}`
  const [rules] = useState(game.position.draftSizedRules ?? [])
  const [editing, setEditing] = useState(-1)
  const [kind, setKind] = useState<RuleChoice>('thermometer')
  const [cells, setCells] = useState<readonly number[]>([])
  const [cages, setCages] = useState<KillerRule['cages']>([])
  const [cageIndex, setCageIndex] = useState(-1)
  const [cageTotal, setCageTotal] = useState('')
  const [marks, setMarks] = useState<KropkiMarks>({})
  const [dotKind, setDotKind] = useState<KropkiKind>('consecutive')
  const [difference, setDifference] = useState(1)
  const [labeled, setLabeled] = useState(emptyDotLayer)
  const [dotValue, setDotValue] = useState(1)
  const [groupByRegion, setGroupByRegion] = useState(false)
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')
  const id = useId()
  const otherRules = rules.filter((_, index) => index !== editing)
  const previous = rules[editing]
  const editingCage = cageIndex >= 0 || cells.length > 0 || cageTotal !== ''
  const nextCages = [...cages]
  if (kind === 'killer-cages' && editingCage) {
    nextCages[cageIndex < 0 ? cages.length : cageIndex] = { cells, sum: Number(cageTotal) }
  }
  const killerLayer = (cages: KillerRule['cages']): KillerRule => ({
    type: 'killer-cages',
    cages,
    ...(previous?.type === 'killer-cages' && previous.coverGrid &&
      cages.reduce((count, cage) => count + cage.cells.length, 0) === size ** 2 && { coverGrid: true }),
  })
  const killer = killerLayer(nextCages)
  let rule = draftRule(kind, cells, marks, difference, groupByRegion, labeled, killer)
  if (kind === 'renban' && previous?.type === 'renban' && cells === previous.cells) {
    rule = previous
  } else if (kind === 'region-sum' && previous?.type === 'region-sum' && cells === previous.cells) {
    rule = groupByRegion === (previous.groupByRegion ?? false) ? previous : { ...previous, groupByRegion }
  }
  const previewRule = kind === 'killer-cages' && !isSizedRuleList([...otherRules, rule], layout) ? killerLayer(cages) : rule
  const preview = isSizedRuleList([...otherRules, previewRule], layout) ? [...otherRules, previewRule] : otherRules
  const canSelectCells = 'cells' in rule || kind === 'kropki' || kind === 'labeled-dots' || kind === 'killer-cages'
  const selectedEdge = cells.length === 2 && gridCellsShareEdge(cells[0], cells[1], size)
  const matchesEdge = ([a, b]: readonly [number, number]) => cells.includes(a) && cells.includes(b)
  const markedEdge = selectedEdge && marks[dotKind]?.pairs?.some(matchesEdge)
  const labeledEdge = selectedEdge && labeled.marks.find(mark => matchesEdge(mark.cells))
  const hasKropkiClues = Object.values(marks).some(mark => mark?.negative || mark?.pairs?.length)

  function selectCage(index: number) {
    const cage = cages[index]
    setCageIndex(index)
    setCageTotal(cage ? String(cage.sum) : '')
    setCells(cage?.cells ?? [])
    if (cage) setActive(cage.cells[0])
    setError('')
  }

  function applyCage() {
    if (!isSizedRuleList([...otherRules, killer], layout)) {
      setError('Select cells for a cage with a possible total. Each cell can belong to one cage.')
      return
    }
    setCages(nextCages)
    selectCage(-1)
  }

  function selectRule(index: number) {
    const previous = rules[index]
    setEditing(index)
    setKind(previous ? ruleChoice(previous) : 'thermometer')
    const selected = previous?.type === 'arrow' ? [previous.circle, ...previous.cells]
      : previous?.type === 'double-arrow' ? [previous.ends[0], ...previous.cells, previous.ends[1]]
        : previous && 'cells' in previous ? previous.cells : []
    setCells(selected)
    setCages(previous?.type === 'killer-cages' ? previous.cages : [])
    setCageIndex(-1)
    setCageTotal('')
    setMarks(previous?.type === 'kropki' ? { consecutive: previous.consecutive, ratioTwo: previous.ratioTwo } : {})
    setDotKind('consecutive')
    setLabeled(previous?.type === 'labeled-dots' ? previous : emptyDotLayer)
    setDotValue(previous?.type === 'labeled-dots' && previous.relation === 'ratio' ? 2 : 1)
    setDifference(previous?.type === 'difference' ? previous.difference : 1)
    setGroupByRegion(previous?.type === 'region-sum' && previous.groupByRegion === true)
    setActive(selected[0] ?? 0)
    setError('')
  }

  function selectCell(cell: number) {
    setActive(cell)
    setError('')
    setCells(current => {
      if (current.includes(cell)) return current.filter(item => item !== cell)
      if ((kind === 'kropki' || kind === 'difference' || kind === 'labeled-dots') && current.length === 2) return [cell]
      if ((kind === 'thermometer' || kind === 'renban' || kind === 'extra-house' || kind === 'killer-cages') && current.length === size) return current
      if (kind === 'arrow' && current.length === size + 1) return current
      if (kind === 'double-arrow' && current.length === 2 * size + 2) return current
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
      if (current.source !== 'draft' || !current.grid || sizedGridIdentity(current.grid) !== sizedGridIdentity(layout) ||
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
    if (kind === 'kropki' && !hasKropkiClues || kind === 'labeled-dots' && !labeled.marks.length && !labeled.negative) {
      setError('Add a dot or enable a negative rule.')
      return
    }
    if (kind === 'difference' && !selectedEdge) {
      setError('Select two cells that share an edge.')
      return
    }
    if (!isSizedRuleList(next, layout)) {
      if (kind === 'double-arrow') {
        setError('Select two end circles with at least one cell along the line.')
        return
      }
      setError(kind === 'thermometer' ? `Select 2 to ${size} cells for the thermometer.`
        : kind === 'renban' ? `Select 1 to ${size} cells for the Renban line.`
          : kind === 'arrow' ? `Select a bulb and 1 to ${size} cells along the arrow.`
            : kind === 'region-sum' ? `Select a path that crosses at least one ${group} border.`
              : kind === 'extra-house' ? `Select ${size} cells for the extra region.`
                : kind === 'killer-cages' ? 'Add at least one cage with a possible total. Each cell can belong to one cage.'
                  : 'Select the cells for this rule.')
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
          {ruleNames[ruleChoice(rule)]}{rule.type === 'arrow' ? ` from ${cellName(rule.circle)}` : ''}
          {rule.type === 'double-arrow' ? ` from ${cellName(rule.ends[0])} to ${cellName(rule.ends[1])}` : ''}{rule.type === 'difference' ? ` ${rule.difference}` : ''}{'cells' in rule ? ` · ${rule.cells.map(cellName).join(', ')}` : ''}
        </option>)}
      </SelectControl>
      <label htmlFor={`${id}-rule`}>Rule</label>
      <SelectControl id={`${id}-rule`} value={kind} onChange={event => {
        setKind(event.currentTarget.value as RuleChoice)
        setCells([])
        setCages([])
        setCageIndex(-1)
        setCageTotal('')
        setMarks({})
        setDotKind('consecutive')
        setDifference(1)
        setLabeled(emptyDotLayer)
        setDotValue(1)
        setGroupByRegion(false)
        setError('')
      }}>
        {Object.entries(ruleNames).filter(([value]) => value !== 'region-sum' || !('noRegions' in layout))
          .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </SelectControl>
      {kind === 'double-arrow' && <p id={`${id}-instructions`}>Select the first end circle, the cells along the line in order, and the second end circle.</p>}
      {'cells' in rule && kind !== 'double-arrow' && <p id={`${id}-instructions`}>{kind === 'thermometer'
        ? 'Select the cells in order, from the bulb to the tip.'
        : kind === 'renban' || kind === 'region-sum' ? 'Select the cells in the order you want to draw the line.'
          : kind === 'difference' ? 'Select two cells that share an edge.'
            : kind === 'arrow' ? 'Select the bulb first, then select the cells along the arrow in order.'
              : kind === 'extra-house' ? `Select ${size} cells that contain each digit once.`
                : 'Select the cells that should have a marker.'}</p>}
      {kind === 'killer-cages' && <>
        {cages.length > 0 && <>
          <label htmlFor={`${id}-cage`}>Cage</label>
          <SelectControl id={`${id}-cage`} value={cageIndex} onChange={event => selectCage(Number(event.currentTarget.value))}>
            <option value={-1}>New cage</option>
            {cages.map(({ cells, sum }, index) => <option key={index} value={index}>
              {sum} · {cellName(Math.min(...cells))}
            </option>)}
          </SelectControl>
        </>}
        <label htmlFor={`${id}-cage-total`}>Cage total</label>
        <input id={`${id}-cage-total`} inputMode="numeric" type="number" min={1}
          max={size * (size + 1) / 2} value={cageTotal} onChange={event => {
            setCageTotal(event.currentTarget.value)
            setError('')
          }} />
        <p id={`${id}-instructions`}>Select the cells in the cage and enter their total.</p>
      </>}
      {kind === 'region-sum' && <label>
        <input type="checkbox" checked={groupByRegion} onChange={event => setGroupByRegion(event.currentTarget.checked)} />
        Count all visits to the same {group} together
      </label>}
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
      {kind === 'labeled-dots' && <>
        <label>Dot relation
          <SelectControl value={labeled.relation} disabled={labeled.marks.length > 0} onChange={event => {
            const relation = event.currentTarget.value as SizedLabeledDotsRule['relation']
            setLabeled({ ...labeled, relation })
            setDotValue(relation === 'ratio' ? 2 : 1)
          }}>
            <option value="difference">White difference dot</option>
            <option value="ratio">Black ratio dot</option>
          </SelectControl>
        </label>
        <label>Dot number
          <SelectControl value={dotValue} onChange={event => setDotValue(Number(event.currentTarget.value))}>
            {Array.from({ length: size - 1 }, (_, index) => index + (labeled.relation === 'ratio' ? 2 : 1))
              .map(value => <option key={value}>{value}</option>)}
          </SelectControl>
        </label>
        <p id={`${id}-instructions`}>Select two cells that share an edge, then set the dot.</p>
      </>}
      <Board grid={layout} sizedRules={preview} givens={game.givens} values={valuesOf(game)} showGuides
        label="Rule editor" selected={cells} active={active} onCell={canSelectCells ? selectCell : undefined}
        onGridKeyDown={canSelectCells ? moveFocus : undefined}
        descriptionId={canSelectCells ? `${id}-instructions` : undefined} />
      {kind === 'killer-cages' && <>
        <Button type="button" disabled={!cells.length || !cageTotal} onClick={applyCage}>
          {cageIndex < 0 ? 'Add cage' : 'Update cage'}
        </Button>
        {cageIndex >= 0 && <Button type="button" onClick={() => {
          setCages(cages.filter((_, index) => index !== cageIndex))
          selectCage(-1)
        }}>Remove cage</Button>}
      </>}
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
      {kind === 'labeled-dots' && <>
        <Button type="button" disabled={!selectedEdge} onClick={() => {
          const cellsOfDot = [Math.min(...cells), Math.max(...cells)] as const
          setLabeled({ ...labeled, marks: [...labeled.marks.filter(mark => !matchesEdge(mark.cells)), { cells: cellsOfDot, value: dotValue }] })
          setCells([])
          setError('')
        }}>{labeledEdge ? 'Update dot' : 'Add labeled dot'}</Button>
        {labeledEdge && <Button type="button" onClick={() => {
          setLabeled({ ...labeled, marks: labeled.marks.filter(mark => !matchesEdge(mark.cells)) })
          setCells([])
        }}>Remove labeled dot</Button>}
        <label>
          <input type="checkbox" checked={labeled.negative ?? false}
            onChange={event => setLabeled({ ...labeled, negative: event.currentTarget.checked })} />
          {labeled.relation === 'ratio' ? 'No 1:2 ratios without a labeled black dot' : 'No consecutive digits without a labeled white dot'}
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
