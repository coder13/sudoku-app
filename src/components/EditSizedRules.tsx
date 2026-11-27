import { sizedSumEndCells, sizedSumEndKey, sizedSumEndLabel, sizedXSumDirections, type SizedXSumEnd } from '../sudoku/sized-linked-double-arrow'
import { Fragment, useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { MarkedPairs, SizedConstraintRule, SizedLabeledDotsRule, SizedSumEnd } from '../sudoku/engine'
import { gridCellsShareEdge, gridValueOffset, rowColumnSumTotal, sizedGridIdentity, type SizedGrid } from '../sudoku/grid'
import { move, valuesOf, type Game } from '../sudoku/game'
import { isSizedRuleList } from '../sudoku/sized-rule-game'
import { roomStore } from '../sudoku/storage'
import { Board } from './Board'
import { Button } from './Button'
import { Modal } from './Modal'
import { SelectControl } from './SelectControl'
import { focusGridCell, gridCellInDirection } from './grid-cell-navigation'

const ruleNames = {
  main: 'Top-left to bottom-right diagonal',
  anti: 'Top-right to bottom-left diagonal',
  odd: 'Odd circles',
  even: 'Even squares',
  thermometer: 'Thermometer',
  'slow-thermometer': 'Slow Thermometer',
  renban: 'Renban line',
  kropki: 'Kropki dots',
  'labeled-dots': 'Labeled dots',
  difference: 'Difference marker',
  'anti-sum': 'Anti-Sum',
  'row-column-sum': 'Row and column sum diamonds',
  arrow: 'Arrow',
  'double-arrow': 'Double Arrow',
  'linked-double-arrow': 'Double Arrow with X-Sum ends',
  'x-sum': 'Outside X-Sum',
  'x-sum-dot': 'X-Sum dot',
  'region-sum': 'Region Sum line',
  quadruple: 'Quadruple circle',
  'extra-house': 'Extra region',
  'killer-cages': 'Killer cages',
  'product-cage': 'Product cage',
  'digit-count': 'Digit count',
}

type RuleChoice = keyof typeof ruleNames
const ruleChoice = (rule: SizedConstraintRule): RuleChoice =>
  rule.type === 'constraint-alternatives'
    ? 'thermometer'
    : rule.type === 'diagonal'
    ? rule.diagonal
    : rule.type === 'parity'
      ? rule.parity
      : rule.type === 'xv'
        ? 'kropki'
        : rule.type === 'whispers' || rule.type === 'sandwich'
          ? 'thermometer'
          : (rule.type as RuleChoice)

function ruleLabel(rule: SizedConstraintRule, size: number, valueOffset = 0) {
  if (rule.type === 'constraint-alternatives') return `Exact-one ${rule.family} clue group · ${rule.choices.length} interpretations`
  if (rule.type === 'whispers') return `Whispers, minimum difference ${rule.minDifference}`
  if (rule.type === 'xv') return 'X/V markers'
  if (rule.type === 'sandwich') return `Sandwich, total ${rule.sum}`
  if (rule.type === 'x-sum') {
    const vertical = rule.direction === 'north' || rule.direction === 'south'
    const index = vertical ? rule.cells[0] % size : Math.floor(rule.cells[0] / size)
    return `Outside X-Sum ${rule.sum} · ${sizedSumEndLabel({ direction: rule.direction, index }, size)}`
  }
  if (rule.type === 'x-sum-dot') return `X-Sum dot · ${rule.relation === 'consecutive' ? 'consecutive' : 'ratio 1:2'} · ${sizedSumEndLabel(rule.ends[0], size)} and ${sizedSumEndLabel(rule.ends[1], size)}`
  if (rule.type === 'product-cage') return `Product cage · ${rule.product}`
  if (rule.type === 'digit-count') return `Digit count · ${rule.digit - valueOffset} at least ${rule.minimum}`
  return ruleNames[ruleChoice(rule)]
}

type DiamondRule = Extract<SizedConstraintRule, { type: 'row-column-sum' }>
type KillerRule = Extract<SizedConstraintRule, { type: 'killer-cages' }>

type KropkiKind = 'consecutive' | 'ratioTwo'
type KropkiMarks = Partial<Record<KropkiKind, MarkedPairs>>

const defaultLinkedEnds: readonly [SizedSumEnd, SizedSumEnd] = [
  { direction: 'south', index: 0 },
  { direction: 'north', index: 0 },
]

const emptyDiamondRule: DiamondRule = { type: 'row-column-sum', pairs: [] }
const emptyDotLayer: SizedLabeledDotsRule = {
  type: 'labeled-dots',
  relation: 'difference',
  marks: [],
}

function draftRule(
  kind: Exclude<RuleChoice, 'linked-double-arrow' | 'anti-sum' | 'row-column-sum' | 'quadruple' | 'x-sum' | 'x-sum-dot'>,
  cells: readonly number[],
  marks: KropkiMarks,
  difference: number,
  groupByRegion: boolean,
  labeled: SizedLabeledDotsRule,
  killer: KillerRule,
  product: number,
  countDigit: number,
  countMinimum: number,
  countMaximum?: number,
): SizedConstraintRule {
  if (kind === 'killer-cages') return killer
  if (kind === 'product-cage') return { type: kind, cells, product }
  if (kind === 'digit-count') return {
    type: kind, cells, digit: countDigit, minimum: countMinimum,
    ...(countMaximum !== undefined && { maximum: countMaximum }),
  }
  if (kind === 'labeled-dots') return labeled
  if (kind === 'region-sum') return { type: kind, cells, ...(groupByRegion && { groupByRegion }) }
  if (kind === 'double-arrow')
    return {
      type: kind,
      ends: [cells[0] ?? 0, cells.at(-1) ?? 0],
      cells: cells.slice(1, -1),
    }
  if (kind === 'arrow') return { type: kind, circle: cells[0] ?? 0, cells: cells.slice(1) }
  if (kind === 'difference')
    return {
      type: kind,
      cells: [cells[0] ?? 0, cells[1] ?? cells[0] ?? 0],
      difference,
    }
  if (kind === 'kropki') return { type: kind, ...marks }
  if (kind === 'main' || kind === 'anti') return { type: 'diagonal', diagonal: kind }
  if (kind === 'thermometer' || kind === 'slow-thermometer' || kind === 'renban' || kind === 'extra-house') return { type: kind, cells }
  return { type: 'parity', parity: kind, cells }
}

export function EditSizedRules({ game, layout, close }: { game: Game; layout: SizedGrid; close: () => void }) {
  const { size } = layout
  const group = 'regions' in layout ? 'region' : 'box'
  const cellName = (cell: number) => `R${Math.floor(cell / size) + 1}C${(cell % size) + 1}`
  const [rules] = useState(game.position.draftSizedRules ?? [])
  const [editing, setEditing] = useState(-1)
  const [kind, setKind] = useState<RuleChoice>('thermometer')
  const [linkedEnds, setLinkedEnds] = useState(defaultLinkedEnds)
  const [xSumDotEnds, setXSumDotEnds] = useState<readonly [SizedSumEnd, SizedSumEnd]>(defaultLinkedEnds)
  const [xSumDotRelation, setXSumDotRelation] = useState<'consecutive' | 'ratio'>('consecutive')
  const [xSumEnd, setXSumEnd] = useState<SizedXSumEnd>({ direction: 'south', index: 0 })
  const [xSumTotal, setXSumTotal] = useState('')
  const [quadrupleDigits, setQuadrupleDigits] = useState('')
  const [cells, setCells] = useState<readonly number[]>([])
  const [cages, setCages] = useState<KillerRule['cages']>([])
  const [cageIndex, setCageIndex] = useState(-1)
  const [cageTotal, setCageTotal] = useState('')
  const [productTotal, setProductTotal] = useState('')
  const [countDigit, setCountDigit] = useState(1)
  const [countMinimum, setCountMinimum] = useState('1')
  const [countMaximum, setCountMaximum] = useState('')
  const [marks, setMarks] = useState<KropkiMarks>({})
  const [dotKind, setDotKind] = useState<KropkiKind>('consecutive')
  const [difference, setDifference] = useState(1)
  const [forbiddenSum, setForbiddenSum] = useState(2 * size - 1)
  const [diamonds, setDiamonds] = useState(emptyDiamondRule)
  const [labeled, setLabeled] = useState(emptyDotLayer)
  const [dotValue, setDotValue] = useState(1)
  const [groupByRegion, setGroupByRegion] = useState(false)
  const [alternativeChoices, setAlternativeChoices] = useState<readonly boolean[]>([])
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')
  const id = useId()
  const otherRules = rules.filter((_, index) => index !== editing)
  const xSumDotPairs: (readonly [SizedSumEnd, SizedSumEnd])[] = []
  const xSumEnds = sizedXSumDirections.flatMap((direction) =>
    Array.from({ length: size }, (_, index) => ({ direction, index }))
  )
  for (const end of xSumEnds) {
    xSumDotPairs.push([end, sizedSumEndCells(end, size)[0]])
    const neighbor = xSumEnds.find((other) => other.direction === end.direction && other.index === end.index + 1)
    if (neighbor) xSumDotPairs.push([end, neighbor])
  }
  const previous = rules[editing]
  const readOnlyImported = previous && ['whispers', 'xv', 'sandwich'].includes(previous.type)
  const editingAlternatives = previous?.type === 'constraint-alternatives'
  const editingCage = cageIndex >= 0 || cells.length > 0 || cageTotal !== ''
  const nextCages = [...cages]
  if (kind === 'killer-cages' && editingCage) {
    nextCages[cageIndex < 0 ? cages.length : cageIndex] = {
      cells,
      sum: Number(cageTotal),
    }
  }
  const killerLayer = (cages: KillerRule['cages']): KillerRule => ({
    type: 'killer-cages',
    cages,
    ...(previous?.type === 'killer-cages' && previous.coverGrid && cages.reduce((count, cage) => count + cage.cells.length, 0) === size ** 2 && { coverGrid: true }),
  })
  const killer = killerLayer(nextCages)
  let rule: SizedConstraintRule = previous?.type === 'constraint-alternatives'
    ? {
        ...previous,
        choices: previous.choices.filter((_, index) => alternativeChoices[index]),
        ...(previous.choiceLabels && { choiceLabels: previous.choiceLabels.filter((_, index) => alternativeChoices[index]) }),
      }
    : kind === 'linked-double-arrow'
      ? { type: kind, ends: linkedEnds, cells }
      : kind === 'anti-sum'
        ? { type: kind, sum: forbiddenSum }
        : kind === 'row-column-sum'
          ? diamonds
          : kind === 'quadruple'
            ? {
                type: kind,
                topLeft: cells[0] ?? -1,
                digits: [...quadrupleDigits].map(Number),
              }
              : kind === 'x-sum'
                ? { type: kind, direction: xSumEnd.direction, cells: sizedSumEndCells(xSumEnd, size), sum: Number(xSumTotal) }
                : kind === 'x-sum-dot'
                  ? { type: kind, ends: xSumDotEnds, relation: xSumDotRelation }
            : draftRule(kind, cells, marks, difference, groupByRegion, labeled, killer,
              Number(productTotal), countDigit, Number(countMinimum), countMaximum === '' ? undefined : Number(countMaximum))
  if (kind === 'product-cage' && rule.type === 'product-cage' && previous?.type === 'product-cage' && previous.color) {
    rule = { ...rule, color: previous.color }
  }
  if (kind === 'renban' && previous?.type === 'renban' && cells === previous.cells) {
    rule = previous
  } else if (kind === 'region-sum' && previous?.type === 'region-sum' && cells === previous.cells) {
    rule = groupByRegion === (previous.groupByRegion ?? false) ? previous : { ...previous, groupByRegion }
  }
  const previewRule = kind === 'killer-cages' && !isSizedRuleList([...otherRules, rule], layout) ? killerLayer(cages) : rule
  const preview = isSizedRuleList([...otherRules, previewRule], layout) ? [...otherRules, previewRule] : otherRules
  const canSelectCells =
    kind !== 'x-sum' && !readOnlyImported && !editingAlternatives && ('cells' in rule || kind === 'kropki' || kind === 'labeled-dots' || kind === 'killer-cages' || kind === 'row-column-sum' || kind === 'quadruple')
  const selectedEdge = cells.length === 2 && gridCellsShareEdge(cells[0], cells[1], size)
  const matchesEdge = ([a, b]: readonly [number, number]) => cells.includes(a) && cells.includes(b)
  const markedDiamond = selectedEdge && diamonds.pairs.some(matchesEdge)
  const markedEdge = selectedEdge && marks[dotKind]?.pairs?.some(matchesEdge)
  const labeledEdge = selectedEdge && labeled.marks.find((mark) => matchesEdge(mark.cells))
  const hasKropkiClues = Object.values(marks).some((mark) => mark?.negative || mark?.pairs?.length)

  function toggleDiamond() {
    if (!selectedEdge) return
    const pair = [cells[0], cells[1]] as const
    setDiamonds({
      ...diamonds,
      pairs: markedDiamond ? diamonds.pairs.filter((edge) => !matchesEdge(edge)) : [...diamonds.pairs, pair],
    })
    setCells([])
    setError('')
  }

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
    setKind(previous && previous.type !== 'constraint-alternatives' ? ruleChoice(previous) : 'thermometer')
    setAlternativeChoices(previous?.type === 'constraint-alternatives' ? previous.choices.map(() => true) : [])
    const selected =
      previous?.type === 'x-sum'
        ? []
        : previous?.type === 'arrow'
        ? [previous.circle, ...previous.cells]
        : previous?.type === 'double-arrow'
          ? [previous.ends[0], ...previous.cells, previous.ends[1]]
          : previous?.type === 'quadruple'
            ? [previous.topLeft]
            : previous && 'cells' in previous
              ? previous.cells
              : []
    setQuadrupleDigits(previous?.type === 'quadruple' ? previous.digits.join('') : '')
    setCells(selected)
    setLinkedEnds(previous?.type === 'linked-double-arrow' ? previous.ends : defaultLinkedEnds)
    setXSumDotEnds(previous?.type === 'x-sum-dot' ? previous.ends : xSumDotPairs[0] ?? defaultLinkedEnds)
    setXSumDotRelation(previous?.type === 'x-sum-dot' ? previous.relation : 'consecutive')
    if (previous?.type === 'x-sum') {
      const vertical = previous.direction === 'north' || previous.direction === 'south'
      setXSumEnd({ direction: previous.direction, index: vertical ? previous.cells[0] % size : Math.floor(previous.cells[0] / size) })
      setXSumTotal(String(previous.sum))
    } else {
      setXSumEnd({ direction: 'south', index: 0 })
      setXSumTotal('')
    }
    setCages(previous?.type === 'killer-cages' ? previous.cages : [])
    setCageIndex(-1)
    setCageTotal('')
    setProductTotal(previous?.type === 'product-cage' ? String(previous.product) : '')
    setCountDigit(previous?.type === 'digit-count' ? previous.digit : 1)
    setCountMinimum(previous?.type === 'digit-count' ? String(previous.minimum) : '1')
    setCountMaximum(previous?.type === 'digit-count' && previous.maximum !== undefined ? String(previous.maximum) : '')
    setMarks(previous?.type === 'kropki' ? { consecutive: previous.consecutive, ratioTwo: previous.ratioTwo } : {})
    setDotKind('consecutive')
    setLabeled(previous?.type === 'labeled-dots' ? previous : emptyDotLayer)
    setDotValue(previous?.type === 'labeled-dots' && previous.relation === 'ratio' ? 2 : 1)
    setDifference(previous?.type === 'difference' ? previous.difference : 1)
    setForbiddenSum(previous?.type === 'anti-sum' ? previous.sum : 2 * size - 1)
    setDiamonds(previous?.type === 'row-column-sum' ? previous : emptyDiamondRule)
    setGroupByRegion(previous?.type === 'region-sum' && previous.groupByRegion === true)
    setActive(selected[0] ?? 0)
    setError('')
  }

  function selectCell(cell: number) {
    setActive(cell)
    setError('')
    setCells((current) => {
      if (current.includes(cell)) return current.filter((item) => item !== cell)
      if (kind === 'quadruple') return [cell]
      if ((kind === 'kropki' || kind === 'difference' || kind === 'labeled-dots' || kind === 'row-column-sum') && current.length === 2) return [cell]
      if ((kind === 'thermometer' || kind === 'slow-thermometer' || kind === 'renban' || kind === 'extra-house' || kind === 'killer-cages') && current.length === size)
        return current
      if ((kind === 'product-cage' || kind === 'digit-count') && current.length === size ** 2) return current
      if (kind === 'arrow' && current.length === size + 1) return current
      if (kind === 'double-arrow' && current.length === 2 * size + 2) return current
      return [...current, cell]
    })
  }

  function toggleSelectedDot() {
    if (!selectedEdge) return
    const edge = [Math.min(...cells), Math.max(...cells)] as const
    const pairs = marks[dotKind]?.pairs ?? []
    const next = markedEdge ? pairs.filter((pair) => !matchesEdge(pair)) : [...pairs, edge]
    setMarks({ ...marks, [dotKind]: { ...marks[dotKind], pairs: next } })
    setCells([])
    setError('')
  }

  function setNegative(kind: KropkiKind, negative: boolean) {
    setMarks({ ...marks, [kind]: { ...marks[kind], negative } })
    setError('')
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const cell = gridCellInDirection(active, size, event.key)
    if (cell === undefined) return
    event.preventDefault()
    event.stopPropagation()
    setActive(cell)
    focusGridCell(event.currentTarget, cell)
  }

  function update(next: readonly SizedConstraintRule[]) {
    let changed = false
    roomStore.update(game.id, (current) => {
      if (
        current.source !== 'draft' ||
        !current.grid ||
        sizedGridIdentity(current.grid) !== sizedGridIdentity(layout) ||
        current.position.draftCages !== undefined ||
        JSON.stringify(current.position.draftSizedRules ?? []) !== JSON.stringify(rules)
      )
        return current
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
    if ((kind === 'kropki' && !hasKropkiClues) || (kind === 'labeled-dots' && !labeled.marks.length && !labeled.negative)) {
      setError('Add a dot or enable a negative rule.')
      return
    }
    if (kind === 'x-sum' && xSumTotal === '') {
      setError('Enter the outside X-Sum total.')
      return
    }
    if (kind === 'x-sum-dot' && !xSumDotPairs.some(([a, b]) =>
      sizedSumEndKey(a) === sizedSumEndKey(xSumDotEnds[0]) && sizedSumEndKey(b) === sizedSumEndKey(xSumDotEnds[1]))) {
      setError('Choose two adjacent X-Sums or an X-Sum and its first digit for the dot.')
      return
    }
    if (kind === 'product-cage' && productTotal === '') {
      setError('Enter the product for the selected cells.')
      return
    }
    if (kind === 'digit-count' && (countMinimum === '' || countMaximum !== '' && Number(countMaximum) < Number(countMinimum))) {
      setError('Enter a valid minimum and maximum count for the selected cells.')
      return
    }
    if (kind === 'difference' && !selectedEdge) {
      setError('Select two cells that share an edge.')
      return
    }
    if (previous?.type === 'constraint-alternatives' && rule.type === 'constraint-alternatives' && rule.choices.length < 2) {
      setError('Keep at least two possible clue interpretations in this group.')
      return
    }
    if (kind === 'x-sum' && otherRules.some(other => other.type === 'x-sum' &&
      other.direction === xSumEnd.direction &&
      (other.direction === 'north' || other.direction === 'south'
        ? other.cells[0] % size
        : Math.floor(other.cells[0] / size)) === xSumEnd.index)) {
      setError('There is already an X-Sum on that side of this row or column.')
      return
    }
    if (!isSizedRuleList(next, layout)) {
      if (kind === 'quadruple') {
        setError(`Select a cell with a neighbor below and a neighbor to its right. Enter 1 to 4 digits from 1 to ${size} for the circle.`)
        return
      }
      if (kind === 'row-column-sum') {
        setError('Add a diamond or require an unmarked edge.')
        return
      }
      if (kind === 'linked-double-arrow') {
        setError('Choose two different end circles, including an outside X-Sum, and select the line cells.')
        return
      }
      if (kind === 'double-arrow') {
        setError('Select two end circles with at least one cell along the line.')
        return
      }
      setError(
        kind === 'thermometer' || kind === 'slow-thermometer'
          ? `Select 2 to ${size} cells for the thermometer.`
          : kind === 'renban'
            ? `Select 1 to ${size} cells for the Renban line.`
            : kind === 'arrow'
              ? `Select a bulb and 1 to ${size} cells along the arrow.`
              : kind === 'region-sum'
                ? `Select a path that crosses at least one ${group} border.`
                : kind === 'extra-house'
                  ? `Select ${size} cells for the extra region.`
                  : kind === 'product-cage'
                    ? 'Select the cells in this product cage.'
                    : kind === 'digit-count'
                      ? 'Select the cells included in this digit count.'
                  : kind === 'killer-cages'
                    ? 'Add at least one cage with a possible total. Each cell can belong to one cage.'
                    : 'Select the cells for this rule.'
      )
      return
    }
    update(next)
  }

  return (
    <Modal title={`Edit ${size} × ${size} rules`} className="sized-rule-editor" onClose={close}>
      <form className="dialog-form" onSubmit={save}>
        <label htmlFor={`${id}-clue`}>Clue</label>
        <SelectControl id={`${id}-clue`} value={editing} onChange={(event) => selectRule(Number(event.currentTarget.value))}>
          <option value={-1}>New clue</option>
          {rules.map((rule, index) => (
            <option key={index} value={index}>
              {ruleLabel(rule, size, gridValueOffset(layout))}
              {rule.type === 'arrow' ? ` from ${cellName(rule.circle)}` : ''}
              {rule.type === 'quadruple' ? ` with ${rule.digits.join(', ')} below and to the right of ${cellName(rule.topLeft)}` : ''}
              {rule.type === 'double-arrow' ? ` from ${cellName(rule.ends[0])} to ${cellName(rule.ends[1])}` : ''}
              {rule.type === 'difference' ? ` ${rule.difference}` : ''}
              {rule.type === 'anti-sum' ? ` (${rule.sum})` : ''}
              {rule.type === 'row-column-sum' && rule.pairs.length ? ` · ${rule.pairs.length}` : ''}
              {'cells' in rule ? ` · ${rule.cells.map(cellName).join(', ')}` : ''}
            </option>
          ))}
        </SelectControl>
        <label htmlFor={`${id}-rule`}>Rule</label>
        {readOnlyImported || editingAlternatives ? (
          <p>{editingAlternatives
            ? 'Choose which clue interpretations are allowed. The solver checks each remaining choice against the grid.'
            : 'This imported clue can be viewed or removed here. It cannot be edited yet.'}</p>
        ) : (
          <SelectControl
            id={`${id}-rule`}
            value={kind}
            onChange={(event) => {
              setKind(event.currentTarget.value as RuleChoice)
              setCells([])
              setLinkedEnds(defaultLinkedEnds)
              setXSumDotEnds(xSumDotPairs[0] ?? defaultLinkedEnds)
              setXSumDotRelation('consecutive')
              setXSumEnd({ direction: 'south', index: 0 })
              setXSumTotal('')
              setCages([])
              setCageIndex(-1)
              setCageTotal('')
              setProductTotal('')
              setCountDigit(1)
              setCountMinimum('1')
              setCountMaximum('')
              setMarks({})
              setDotKind('consecutive')
              setDifference(1)
              setForbiddenSum(2 * size - 1)
              setDiamonds(emptyDiamondRule)
              setLabeled(emptyDotLayer)
              setDotValue(1)
              setGroupByRegion(false)
              setQuadrupleDigits('')
              setError('')
            }}
          >
            {Object.entries(ruleNames)
              .filter(([value]) => value !== 'region-sum' || !('noRegions' in layout))
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </SelectControl>
        )}
        {editingAlternatives && editing === rules.indexOf(previous) && (
          <fieldset className="dialog-fieldset">
            <legend>Allowed clue interpretations</legend>
            {previous.choices.map((_, index) => (
              <label key={index}>
                <input
                  type="checkbox"
                  checked={alternativeChoices[index] ?? true}
                  onChange={event => {
                    const checked = event.currentTarget.checked
                    setAlternativeChoices(current => current.map((enabled, item) => item === index ? checked : enabled))
                  }}
                />
                {previous.choiceLabels?.[index] ?? `${previous.family} interpretation ${index + 1}`}
              </label>
            ))}
          </fieldset>
        )}
        {kind === 'linked-double-arrow' &&
          (() => {
            const options: SizedSumEnd[] = sizedXSumDirections.flatMap((direction) =>
              Array.from({ length: size }, (_, index) => ({
                direction,
                index,
              }))
            )
            options.push(...Array.from({ length: size ** 2 }, (_, cell) => cell))
            return (
              <>
                {linkedEnds.map((end, index) => (
                  <Fragment key={index}>
                    <label htmlFor={`${id}-linked-${index}`}>{index === 0 ? 'First end circle' : 'Second end circle'}</label>
                    <SelectControl
                      id={`${id}-linked-${index}`}
                      value={sizedSumEndKey(end)}
                      onChange={(event) => {
                        const chosen = options.find((option) => sizedSumEndKey(option) === event.currentTarget.value)
                        if (chosen === undefined) return
                        setLinkedEnds(index === 0 ? [chosen, linkedEnds[1]] : [linkedEnds[0], chosen])
                        setError('')
                      }}
                    >
                      {options.map((option) => (
                        <option key={sizedSumEndKey(option)} value={sizedSumEndKey(option)}>
                          {sizedSumEndLabel(option, size)}
                        </option>
                      ))}
                    </SelectControl>
                  </Fragment>
                ))}
                <p id={`${id}-instructions`}>Select the line cells in order between the two end circles.</p>
              </>
            )
          })()}
        {kind === 'x-sum' && (
          <>
            <label htmlFor={`${id}-x-sum-direction`}>Viewing direction</label>
            <SelectControl
              id={`${id}-x-sum-direction`}
              value={xSumEnd.direction}
              onChange={event => {
                setXSumEnd({ ...xSumEnd, direction: event.currentTarget.value as SizedXSumEnd['direction'] })
                setError('')
              }}
            >
              <option value="south">From the top</option>
              <option value="west">From the right</option>
              <option value="north">From the bottom</option>
              <option value="east">From the left</option>
            </SelectControl>
            <label htmlFor={`${id}-x-sum-index`}>{xSumEnd.direction === 'north' || xSumEnd.direction === 'south' ? 'Column' : 'Row'}</label>
            <SelectControl
              id={`${id}-x-sum-index`}
              value={xSumEnd.index}
              onChange={event => {
                setXSumEnd({ ...xSumEnd, index: Number(event.currentTarget.value) })
                setError('')
              }}
            >
              {Array.from({ length: size }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}
            </SelectControl>
            <label htmlFor={`${id}-x-sum-total`}>Outside total</label>
            <input
              id={`${id}-x-sum-total`}
              type="number"
              inputMode="numeric"
              min={1 - gridValueOffset(layout)}
              max={size * (size + 1 - 2 * gridValueOffset(layout)) / 2}
              value={xSumTotal}
              onChange={event => {
                setXSumTotal(event.currentTarget.value)
                setError('')
              }}
            />
            <p id={`${id}-instructions`}>The first digit from this side gives the count of digits to add, including the first digit.</p>
          </>
        )}
        {kind === 'x-sum-dot' && (
          <>
            <label htmlFor={`${id}-x-sum-dot-pair`}>Numbers separated by the dot</label>
            <SelectControl
              id={`${id}-x-sum-dot-pair`}
              value={`${sizedSumEndKey(xSumDotEnds[0])}|${sizedSumEndKey(xSumDotEnds[1])}`}
              onChange={event => {
                const pair = xSumDotPairs.find(([a, b]) => `${sizedSumEndKey(a)}|${sizedSumEndKey(b)}` === event.currentTarget.value)
                if (pair) setXSumDotEnds(pair)
                setError('')
              }}
            >
              {xSumDotPairs.map(([a, b]) => <option key={`${sizedSumEndKey(a)}|${sizedSumEndKey(b)}`} value={`${sizedSumEndKey(a)}|${sizedSumEndKey(b)}`}>
                {sizedSumEndLabel(a, size)} · {sizedSumEndLabel(b, size)}
              </option>)}
            </SelectControl>
            <label htmlFor={`${id}-x-sum-dot-relation`}>Dot relation</label>
            <SelectControl id={`${id}-x-sum-dot-relation`} value={xSumDotRelation}
              onChange={event => setXSumDotRelation(event.currentTarget.value as 'consecutive' | 'ratio')}>
              <option value="consecutive">White dot · consecutive</option>
              <option value="ratio">Black dot · ratio 1:2</option>
            </SelectControl>
            <p id={`${id}-instructions`}>A dot links adjacent outside X-Sums or an X-Sum to its first digit.</p>
          </>
        )}
        {kind === 'double-arrow' && <p id={`${id}-instructions`}>Select the first end circle, the cells along the line in order, and the second end circle.</p>}
        {'cells' in rule && kind !== 'double-arrow' && kind !== 'linked-double-arrow' && kind !== 'x-sum' && (
          <p id={`${id}-instructions`}>
            {kind === 'thermometer' || kind === 'slow-thermometer'
              ? 'Select the cells in order, from the bulb to the tip.'
              : kind === 'renban' || kind === 'region-sum'
                ? 'Select the cells in the order you want to draw the line.'
                : kind === 'difference'
                  ? 'Select two cells that share an edge.'
                  : kind === 'arrow'
                    ? 'Select the bulb first, then select the cells along the arrow in order.'
                    : kind === 'extra-house'
                      ? `Select ${size} cells that contain each digit once.`
                      : kind === 'product-cage'
                        ? 'Select the cells in this product cage.'
                        : kind === 'digit-count'
                          ? 'Select the cells included in this digit count.'
                      : 'Select the cells that should have a marker.'}
          </p>
        )}
        {kind === 'killer-cages' && (
          <>
            {cages.length > 0 && (
              <>
                <label htmlFor={`${id}-cage`}>Cage</label>
                <SelectControl id={`${id}-cage`} value={cageIndex} onChange={(event) => selectCage(Number(event.currentTarget.value))}>
                  <option value={-1}>New cage</option>
                  {cages.map(({ cells, sum }, index) => (
                    <option key={index} value={index}>
                      {sum} · {cellName(Math.min(...cells))}
                    </option>
                  ))}
                </SelectControl>
              </>
            )}
            <label htmlFor={`${id}-cage-total`}>Cage total</label>
            <input
              id={`${id}-cage-total`}
              inputMode="numeric"
              type="number"
              min={1}
              max={(size * (size + 1)) / 2}
              value={cageTotal}
              onChange={(event) => {
                setCageTotal(event.currentTarget.value)
                setError('')
              }}
            />
            <p id={`${id}-instructions`}>Select the cells in the cage and enter their total.</p>
          </>
        )}
        {kind === 'product-cage' && (
          <>
            <label htmlFor={`${id}-product-total`}>Product</label>
            <input
              id={`${id}-product-total`}
              type="number"
              inputMode="numeric"
              min={gridValueOffset(layout) ? 0 : 1}
              max={Number.MAX_SAFE_INTEGER}
              step={1}
              value={productTotal}
              onChange={event => {
                setProductTotal(event.currentTarget.value)
                setError('')
              }}
            />
            <p>The displayed digits in the selected cells multiply to this product. Repeats are allowed when other rules permit them.</p>
          </>
        )}
        {kind === 'digit-count' && (
          <>
            <label htmlFor={`${id}-count-digit`}>Digit to count</label>
            <SelectControl
              id={`${id}-count-digit`}
              value={countDigit}
              onChange={event => {
                setCountDigit(Number(event.currentTarget.value))
                setError('')
              }}
            >
              {Array.from({ length: size }, (_, index) => (
                <option key={index + 1} value={index + 1}>{index + 1 - gridValueOffset(layout)}</option>
              ))}
            </SelectControl>
            <label htmlFor={`${id}-count-minimum`}>Minimum count</label>
            <input
              id={`${id}-count-minimum`}
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(1, cells.length)}
              step={1}
              value={countMinimum}
              onChange={event => {
                setCountMinimum(event.currentTarget.value)
                setError('')
              }}
            />
            <label htmlFor={`${id}-count-maximum`}>Maximum count (optional)</label>
            <input
              id={`${id}-count-maximum`}
              type="number"
              inputMode="numeric"
              min={countMinimum || 1}
              max={Math.max(1, cells.length)}
              step={1}
              value={countMaximum}
              onChange={event => {
                setCountMaximum(event.currentTarget.value)
                setError('')
              }}
            />
            <p>The selected cells must contain the chosen digit the required number of times.</p>
          </>
        )}
        {kind === 'region-sum' && (
          <label>
            <input type="checkbox" checked={groupByRegion} onChange={(event) => setGroupByRegion(event.currentTarget.checked)} />
            Count all visits to the same {group} together
          </label>
        )}
        {kind === 'row-column-sum' && (
          <>
            <p id={`${id}-instructions`}>Select two cells that share an edge. The diamond total is their row number across or their column number down.</p>
            <Button type="button" disabled={!selectedEdge} onClick={toggleDiamond}>
              {markedDiamond ? 'Remove diamond' : 'Add diamond'}
            </Button>
            {selectedEdge && <p aria-live="polite">Diamond total {rowColumnSumTotal([cells[0], cells[1]], size)}</p>}
            <label>
              <input
                type="checkbox"
                checked={diamonds.requireUnmarked ?? false}
                onChange={(event) => {
                  setDiamonds({
                    ...diamonds,
                    requireUnmarked: event.currentTarget.checked,
                  })
                  setError('')
                }}
              />
              At least one unmarked edge must also meet its row or column sum
            </label>
          </>
        )}
        {kind === 'quadruple' && (
          <>
            <p id={`${id}-instructions`}>Select the cell just above and to the left of the circle.</p>
            <label htmlFor={`${id}-quadruple-digits`}>Digits in the circle</label>
            <input
              id={`${id}-quadruple-digits`}
              inputMode="numeric"
              maxLength={4}
              value={quadrupleDigits}
              onChange={(event) => {
                setQuadrupleDigits(event.currentTarget.value)
                setError('')
              }}
            />
          </>
        )}
        {kind === 'anti-sum' && (
          <>
            <label htmlFor={`${id}-forbidden-sum`}>Forbidden sum</label>
            <SelectControl
              id={`${id}-forbidden-sum`}
              value={forbiddenSum}
              onChange={(event) => {
                setForbiddenSum(Number(event.currentTarget.value))
                setError('')
              }}
            >
              {Array.from({ length: 2 * size - 1 }, (_, index) => (
                <option key={index + 2}>{index + 2}</option>
              ))}
            </SelectControl>
            <p>Digits in cells that share an edge cannot add to {forbiddenSum}.</p>
          </>
        )}
        {kind === 'difference' && (
          <>
            <label htmlFor={`${id}-difference`}>Exact difference</label>
            <SelectControl
              id={`${id}-difference`}
              value={difference}
              onChange={(event) => {
                setDifference(Number(event.currentTarget.value))
                setError('')
              }}
            >
              {Array.from({ length: size - 1 }, (_, index) => (
                <option key={index + 1}>{index + 1}</option>
              ))}
            </SelectControl>
          </>
        )}
        {kind === 'kropki' && (
          <>
            <label htmlFor={`${id}-dot-kind`}>Dot</label>
            <SelectControl id={`${id}-dot-kind`} value={dotKind} onChange={(event) => setDotKind(event.currentTarget.value as KropkiKind)}>
              <option value="consecutive">White dot</option>
              <option value="ratioTwo">Black dot</option>
            </SelectControl>
            <p id={`${id}-instructions`}>Select two cells that share an edge, then add or remove the dot.</p>
          </>
        )}
        {kind === 'labeled-dots' && (
          <>
            <label>
              Dot relation
              <SelectControl
                value={labeled.relation}
                disabled={labeled.marks.length > 0}
                onChange={(event) => {
                  const relation = event.currentTarget.value as SizedLabeledDotsRule['relation']
                  setLabeled({ ...labeled, relation })
                  setDotValue(relation === 'ratio' ? 2 : 1)
                }}
              >
                <option value="difference">White difference dot</option>
                <option value="ratio">Black ratio dot</option>
              </SelectControl>
            </label>
            <label>
              Dot number
              <SelectControl value={dotValue} onChange={(event) => setDotValue(Number(event.currentTarget.value))}>
                {Array.from({ length: size - 1 }, (_, index) => index + (labeled.relation === 'ratio' ? 2 : 1)).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </SelectControl>
            </label>
            <p id={`${id}-instructions`}>Select two cells that share an edge, then set the dot.</p>
          </>
        )}
        <Board
          content={{
            grid: layout,
            sizedRules: preview,
            givens: game.givens,
            values: valuesOf(game),
          }}
          appearance={{
            showGuides: true,
            label: 'Rule editor',
            descriptionId: canSelectCells ? `${id}-instructions` : undefined,
          }}
          interaction={{
            selected: cells,
            active: active,
            onCell: canSelectCells ? selectCell : undefined,
            onGridKeyDown: canSelectCells ? moveFocus : undefined,
          }}
        />
        {kind === 'killer-cages' && (
          <>
            <Button type="button" disabled={!cells.length || !cageTotal} onClick={applyCage}>
              {cageIndex < 0 ? 'Add cage' : 'Update cage'}
            </Button>
            {cageIndex >= 0 && (
              <Button
                type="button"
                onClick={() => {
                  setCages(cages.filter((_, index) => index !== cageIndex))
                  selectCage(-1)
                }}
              >
                Remove cage
              </Button>
            )}
          </>
        )}
        {kind === 'kropki' && (
          <>
            <Button type="button" disabled={!selectedEdge} onClick={toggleSelectedDot}>
              {markedEdge ? 'Remove dot' : 'Add dot'}
            </Button>
            <label>
              <input type="checkbox" checked={marks.consecutive?.negative ?? false} onChange={(event) => setNegative('consecutive', event.currentTarget.checked)} />
              No consecutive digits across unmarked edges
            </label>
            <label>
              <input type="checkbox" checked={marks.ratioTwo?.negative ?? false} onChange={(event) => setNegative('ratioTwo', event.currentTarget.checked)} />
              No 1:2 ratios across unmarked edges
            </label>
          </>
        )}
        {kind === 'labeled-dots' && (
          <>
            <Button
              type="button"
              disabled={!selectedEdge}
              onClick={() => {
                const cellsOfDot = [Math.min(...cells), Math.max(...cells)] as const
                setLabeled({
                  ...labeled,
                  marks: [...labeled.marks.filter((mark) => !matchesEdge(mark.cells)), { cells: cellsOfDot, value: dotValue }],
                })
                setCells([])
                setError('')
              }}
            >
              {labeledEdge ? 'Update dot' : 'Add labeled dot'}
            </Button>
            {labeledEdge && (
              <Button
                type="button"
                onClick={() => {
                  setLabeled({
                    ...labeled,
                    marks: labeled.marks.filter((mark) => !matchesEdge(mark.cells)),
                  })
                  setCells([])
                }}
              >
                Remove labeled dot
              </Button>
            )}
            <label>
              <input
                type="checkbox"
                checked={labeled.negative ?? false}
                onChange={(event) =>
                  setLabeled({
                    ...labeled,
                    negative: event.currentTarget.checked,
                  })
                }
              />
              {labeled.relation === 'ratio' ? 'No 1:2 ratios without a labeled black dot' : 'No consecutive digits without a labeled white dot'}
            </label>
          </>
        )}
        {kind === 'arrow' && cells.length > 0 && (
          <p aria-live="polite">
            Bulb {cellName(cells[0])}
            {cells.length > 1 && ` · Arrow through ${cells.slice(1).map(cellName).join(' → ')}`}
          </p>
        )}
        {(kind === 'thermometer' || kind === 'slow-thermometer') && cells.length > 0 && <p aria-live="polite">Path from bulb to tip · {cells.map(cellName).join(' → ')}</p>}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-actions spread">
          {editing >= 0 && (
            <Button type="button" variant="danger" onClick={() => update(otherRules)}>
              Remove clue
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={Boolean(readOnlyImported)}>
            Save clue
          </Button>
        </div>
      </form>
    </Modal>
  )
}
