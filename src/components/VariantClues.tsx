import { useId, useMemo } from 'react'
import type { VariantRule } from '../sudoku/engine'
import { extraRegionName, palindromePartner, quadrupleCells, sumLabel } from '../sudoku/variants'
import { coloredLineOverlapLanes, sharedPalindromeEdges } from '../sudoku/line-geometry'

const x = (cell: number) => cell % 9
const y = (cell: number) => Math.floor(cell / 9)
const center = (cell: number) => [x(cell) + 0.5, y(cell) + 0.5] as const
const pairKey = (a: number, b: number) => Math.min(a, b) * 81 + Math.max(a, b)
const points = (cells: readonly number[]) => cells.map((cell) => center(cell).join(',')).join(' ')

// Use the same side of an edge even when a directed clue reverses its endpoints.
function pairCenter(a: number, b: number, offset = 0) {
  const [first, second] = a < b ? [a, b] : [b, a]
  const [ax, ay] = center(first), [bx, by] = center(second)
  const length = Math.hypot(bx - ax, by - ay)
  return [(ax + bx) / 2 - (by - ay) / length * offset,
    (ay + by) / 2 + (bx - ax) / length * offset] as const
}

/** Reserve the circle at the caption cell's top-left intersection. */
export function cageLabelInset(cell: number, rules: readonly VariantRule[]) {
  return rules.some(rule => rule.type === 'quadruple' && rule.topLeft + 10 === cell) ? .34 : .1
}

function Cage({ cells, sum, captionInset }: { cells: readonly number[]; sum: number; captionInset: number }) {
  const edge = 0.075
  const members = new Set(cells)
  const corner = Math.min(...cells)
  return <>
    {cells.map((cell) => {
      const col = x(cell)
      const row = y(cell)
      const left = col === 0 || !members.has(cell - 1)
      const right = col === 8 || !members.has(cell + 1)
      const top = !members.has(cell - 9)
      const bottom = !members.has(cell + 9)
      const x1 = col + (left ? edge : 0)
      const x2 = col + 1 - (right ? edge : 0)
      const y1 = row + (top ? edge : 0)
      const y2 = row + 1 - (bottom ? edge : 0)
      const segments = [
        top && `M${cell === corner ? col + captionInset + (sum < 10 ? .17 : .3) : x1},${y1}H${x2}`,
        right && `M${x2},${y1}V${y2}`,
        bottom && `M${x2},${y2}H${x1}`,
        left && `M${x1},${y2}V${y1}`,
        !top && !left && !members.has(cell - 10) && `M${col + edge},${row}V${row + edge}H${col}`,
        !top && !right && !members.has(cell - 8) && `M${col + 1 - edge},${row}V${row + edge}H${col + 1}`,
        !bottom && !right && !members.has(cell + 10) && `M${col + 1 - edge},${row + 1}V${row + 1 - edge}H${col + 1}`,
        !bottom && !left && !members.has(cell + 8) && `M${col + edge},${row + 1}V${row + 1 - edge}H${col}`,
      ].filter(Boolean)
      return <path key={cell} className="variant-cage-edge" d={segments.join(' ')} />
    })}
  </>
}

function ExtraRegion({ cells }: { cells: readonly number[] }) {
  const members = new Set(cells)
  const edge = cells.flatMap((cell) => {
    const column = x(cell)
    const row = y(cell)
    return [
      !members.has(cell - 9) && `M${column},${row}h1`,
      (column === 8 || !members.has(cell + 1)) && `M${column + 1},${row}v1`,
      !members.has(cell + 9) && `M${column},${row + 1}h1`,
      (column === 0 || !members.has(cell - 1)) && `M${column},${row}v1`,
    ].filter(Boolean)
  }).join(' ')
  return <g className="variant-extra-region">
    {cells.map((cell) => <rect key={cell} x={x(cell)} y={y(cell)} width="1" height="1" />)}
    <path d={edge} />
  </g>
}

function ArrowClue({ circle, cells, marker }: { circle: number; cells: readonly number[]; marker: string }) {
  const [cx, cy] = center(circle)
  const [nx, ny] = center(cells[0])
  const length = Math.hypot(nx - cx, ny - cy)
  const start = [cx + (nx - cx) * .33 / length, cy + (ny - cy) * .33 / length]
  return <>
    <polyline className="variant-arrow-line" points={`${start.join(',')} ${points(cells)}`} markerEnd={`url(#${marker})`} />
    <circle className="variant-arrow-circle" cx={cx} cy={cy} r=".33" />
  </>
}

function InequalityClue({ less, greater, offset, compact = false }: { less: number; greater: number; offset: number; compact?: boolean }) {
  const [ax, ay] = center(less), [bx, by] = center(greater)
  const length = Math.hypot(bx - ax, by - ay)
  const ux = (bx - ax) / length, uy = (by - ay) / length
  const [cx, cy] = pairCenter(less, greater, offset)
  // The vertex faces the smaller cell, regardless of orientation.
  const span = compact ? .8 : 1
  const sign = `${cx + (ux * .09 - uy * .12) * span},${cy + (uy * .09 + ux * .12) * span} ${cx - ux * .09 * span},${cy - uy * .09 * span} ${cx + (ux * .09 + uy * .12) * span},${cy + (uy * .09 - ux * .12) * span}`
  return <g className="variant-inequality" data-less={less} data-greater={greater}>
    {length > 1.01 && <line className="variant-inequality-connector"
      x1={ax + ux * .35} y1={ay + uy * .35} x2={bx - ux * .35} y2={by - uy * .35} />}
    <polyline className="variant-inequality-halo" points={sign} style={compact ? { strokeWidth: .112 } : undefined} />
    <polyline className="variant-inequality-sign" points={sign} style={compact ? { strokeWidth: .036 } : undefined} />
  </g>
}

type SumKind = 'xv' | 'adjacent-total'

function ColoredLineLane({ cells, lane, count, color }: { cells: readonly [number, number]; lane: number; count: number; color: string }) {
  const [ax, ay] = center(cells[0]), [bx, by] = center(cells[1])
  const length = Math.hypot(bx - ax, by - ay)
  const offset = (lane - (count - 1) / 2) * Math.min(.1, .26 / count)
  const dx = -(by - ay) / length * offset, dy = (bx - ax) / length * offset
  return <line x1={ax + dx} y1={ay + dy} x2={bx + dx} y2={by + dy} stroke={color} strokeWidth={Math.min(.075, .2 / count)} />
}

function whispersLabelPoint(a: number, b: number, marked: boolean) {
  const [ax, ay] = center(a), [bx, by] = center(b)
  const cx = (ax + bx) / 2, cy = (ay + by) / 2
  if (!marked) return [cx, cy] as const
  const length = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / length, uy = (by - ay) / length
  // Move beside the marked edge, then along it to clear signs and sum text.
  const candidates = [1, -1].map(side => [cx - uy * .5 * side + ux * .3, cy + ux * .5 * side + uy * .3] as const)
  return candidates.find(([x, y]) => x >= .25 && x <= 8.75 && y >= .15 && y <= 8.85)
    ?? [Math.max(.25, Math.min(8.75, candidates[0][0])), Math.max(.15, Math.min(8.85, candidates[0][1]))] as const
}

function WhispersLabel({ rule, markedEdges }: { rule: Extract<VariantRule, { type: 'whispers' }>; markedEdges: ReadonlySet<number> }) {
  const edges = rule.cells.slice(1).map((b, i) => [rule.cells[i], b] as const)
  const [a, b] = edges.find(([a, b]) => !markedEdges.has(pairKey(a, b))) ?? edges[0]
  const marked = markedEdges.has(pairKey(a, b)), [lx, ly] = whispersLabelPoint(a, b, marked)
  return <g className="variant-whispers-label">
    {marked && <line className="variant-whispers-label-leader"
      x1={(x(a) + x(b) + 1) / 2} y1={(y(a) + y(b) + 1) / 2} x2={lx} y2={ly} />}
    <text className="variant-whispers-gap-halo" x={lx} y={ly}>≥{rule.minDifference}</text>
    <text className="variant-whispers-gap" x={lx} y={ly}>≥{rule.minDifference}</text>
  </g>
}

function SumClue({ a, b, sums, dots }: { a: number; b: number; sums: readonly [number, SumKind][]; dots: number }) {
  return <g className={sums.every(([, kind]) => kind === 'xv') ? 'variant-xv' : 'variant-adjacent-total'} data-cell-a={a} data-cell-b={b}>
    {sums.map(([sum, kind], index) => {
      const offset = sums.length > 1 ? (index - (sums.length - 1) / 2) * (dots ? .86 : .36)
        : dots === 3 ? -.34 : dots ? -.27 : 0
      const [cx, cy] = pairCenter(a, b, offset)
      const label = sumLabel(sum)
      const prefix = kind === 'xv' ? 'variant-xv' : 'variant-total'
      const style = dots === 3 ? { fontSize: '.2px', strokeWidth: '.05px' }
        : kind === 'adjacent-total' ? { fontSize: label.length > 3 ? '.19px' : '.23px' } : undefined
      return <g key={sum}>
        <text className={`${prefix}-halo`} x={cx} y={cy} style={style}>{label}</text>
        <text className={`${prefix}-mark`} data-sum={sum} x={cx} y={cy} style={style}>{label}</text>
      </g>
    })}
  </g>
}

export function VariantClues({ rules }: { rules: readonly VariantRule[] }) {
  const marker = useId()
  const shared = useMemo(() => sharedPalindromeEdges(rules), [rules])
  const coloredLanes = useMemo(() => coloredLineOverlapLanes(rules), [rules])
  const renbanIndices = new Map<number, number>()
  rules.forEach((rule, index) => { if (rule.type === 'renban') renbanIndices.set(index, renbanIndices.size) })
  const renbanColor = (index: number) => ['#cf419c', '#8353be', '#d26878', '#aa48bf'][renbanIndices.get(index)! % 4]
  // Cell markers sit behind lines; intersection circles remain above cage edges.
  const layer = (rule: VariantRule) => rule.type === 'parity' ? -2 : rule.type === 'renban' ? -1.5 : rule.type === 'palindrome' ? -1 :
    rule.type === 'inequality' ? 2 : rule.type === 'xv' || rule.type === 'adjacent-total' ? 1.5 : rule.type === 'quadruple' || rule.type === 'kropki' ? 1 : 0
  const drawingOrder = rules.flatMap((rule, index) => [
    { rule, index, overlay: undefined as 'palindrome' | 'colored-line' | 'whispers-label' | undefined, layer: layer(rule) },
    ...(shared.has(index) ? [{ rule, index, overlay: 'palindrome' as const, layer: .5 }] : []),
    ...(coloredLanes.has(index) ? [{ rule, index, overlay: 'colored-line' as const, layer: .4 }] : []),
    ...(rule.type === 'whispers' && rule.minDifference !== 5 ? [{ rule, index, overlay: 'whispers-label' as const, layer: .75 }] : []),
  ]).sort((a, b) => a.layer - b.layer)
  const dots = new Map<number, number>()
  const sums = new Map<number, Map<number, SumKind>>()
  const addSum = (a: number, b: number, sum: number, kind: SumKind) => {
    const key = pairKey(a, b), marks = sums.get(key) ?? new Map<number, SumKind>()
    if (kind === 'xv' || !marks.has(sum)) marks.set(sum, kind)
    sums.set(key, marks)
  }
  for (const rule of rules) {
    if (rule.type === 'adjacent-total') addSum(rule.cells[0], rule.cells[1], rule.sum, 'adjacent-total')
    if (rule.type === 'xv') {
      for (const [kind, marks] of [rule.five, rule.ten].entries()) for (const [a, b] of marks?.pairs ?? []) {
        addSum(a, b, kind === 0 ? 5 : 10, 'xv')
      }
    }
    if (rule.type !== 'kropki') continue
    for (const [kind, marks] of [rule.consecutive, rule.ratioTwo].entries()) {
      for (const [a, b] of marks?.pairs ?? []) {
        const key = pairKey(a, b)
        dots.set(key, (dots.get(key) ?? 0) | (1 << kind))
      }
    }
  }
  const drawnSums = new Set<number>()
  const markedEdges = new Set([...dots.keys(), ...sums.keys(), ...rules.flatMap(rule => rule.type === 'inequality' ? [pairKey(rule.less, rule.greater)] : [])])
  return <svg className="variant-clues" viewBox="0 0 9 9" aria-hidden="true" focusable="false">
    {rules.some((rule) => rule.type === 'arrow') && <defs>
      <marker id={marker} viewBox="0 0 1 1" refX=".9" refY=".5" markerWidth=".29" markerHeight=".29"
        markerUnits="userSpaceOnUse" orient="auto">
        <path className="variant-arrow-head" d="M.08 .08L.9 .5L.08 .92" />
      </marker>
    </defs>}
    {drawingOrder.map(({ rule, index, overlay }) => {
      if (overlay === 'whispers-label' && rule.type === 'whispers') return <WhispersLabel key={`${index}-whispers-label`} rule={rule} markedEdges={markedEdges} />
      if (overlay === 'colored-line') return <g key={`${index}-line-overlap`} className={rule.type === 'entropic' ? 'variant-entropic-overlap' : 'variant-renban-overlap'} data-renban={rule.type === 'renban' ? renbanIndices.get(index)! + 1 : undefined}>
        {coloredLanes.get(index)!.map((lane, part) => <ColoredLineLane key={part} {...lane} color={rule.type === 'entropic' ? '#bc6c27' : renbanColor(index)} />)}
      </g>
      if (overlay === 'palindrome') return <g key={`${index}-overlap`} className="variant-palindrome-overlap">
        {shared.get(index)!.map((edge, i) => <polyline key={i} points={points(edge)} />)}
      </g>
      switch (rule.type) {
        case 'inequality':
          return <InequalityClue key={index} {...rule} compact={dots.get(pairKey(rule.less, rule.greater)) === 3 && sums.has(pairKey(rule.less, rule.greater))}
            offset={dots.get(pairKey(rule.less, rule.greater)) === 3 ? sums.has(pairKey(rule.less, rule.greater)) ? .347 : .4
            : sums.has(pairKey(rule.less, rule.greater)) ? .31 : dots.has(pairKey(rule.less, rule.greater)) ? .27 : 0} />
        case 'xv': case 'adjacent-total': {
          const pairs = rule.type === 'adjacent-total' ? [rule.cells] : [rule.five, rule.ten].flatMap(marks => marks?.pairs ?? [])
          return <g key={index}>{pairs.flatMap(([a, b]) => {
            const key = pairKey(a, b)
            if (drawnSums.has(key)) return []
            drawnSums.add(key)
            return <SumClue key={key} a={a} b={b} sums={[...sums.get(key)!].sort(([a], [b]) => a - b)} dots={dots.get(key) ?? 0} />
          })}</g>
        }
        case 'parity':
          return <g key={index} className={`variant-parity variant-parity-${rule.parity}`}>
            {rule.cells.map(cell => rule.parity === 'odd'
              ? <circle key={cell} cx={center(cell)[0]} cy={center(cell)[1]} r=".36" />
              : <rect key={cell} x={x(cell) + .14} y={y(cell) + .14} width=".72" height=".72" />)}
          </g>
        case 'quadruple': {
          const cx = x(rule.topLeft) + 1
          const cy = y(rule.topLeft) + 1
          const count = rule.digits.length
          return <g key={index} className="variant-quadruple">
            <circle cx={cx} cy={cy} r=".265" />
            {rule.digits.map((digit, i) => <text key={i}
              x={cx + (count === 1 || count === 3 && i === 2 ? 0 : i % 2 ? .105 : -.105)}
              y={cy + (count <= 2 ? 0 : Math.floor(i / 2) ? .105 : -.105)}>{digit}</text>)}
          </g>
        }
        case 'diagonal':
          return <line key={index} className="variant-diagonal" x1={rule.diagonal === 'main' ? 0 : 9} y1="0"
            x2={rule.diagonal === 'main' ? 9 : 0} y2="9" />
        case 'extra-house':
          return <ExtraRegion key={index} cells={rule.cells} />
        case 'killer-cages':
          return <g key={index}>{rule.cages.map((cage) => <Cage key={Math.min(...cage.cells)} {...cage}
            captionInset={cageLabelInset(Math.min(...cage.cells), rules)} />)}</g>
        case 'whispers': {
          return <g key={index} className="variant-whispers" data-min-difference={rule.minDifference}>
            <polyline points={points(rule.cells)} />
          </g>
        }
        case 'palindrome':
          return <g key={index} className="variant-palindrome">
            {(rule.segments ?? [rule.cells]).map((path, part) => <polyline key={part} points={points(path)} />)}
          </g>
        case 'entropic':
          return <g key={index} className="variant-entropic">
            {rule.cells.length === 1 ? <circle cx={center(rule.cells[0])[0]} cy={center(rule.cells[0])[1]} r=".12" />
              : <polyline points={points(rule.cells)} />}
          </g>
        case 'renban':
          return <g key={index} className="variant-renban" data-renban={renbanIndices.get(index)! + 1} stroke={renbanColor(index)} fill={renbanColor(index)}>
            {(rule.segments ?? [rule.cells]).map((path, part) => path.length === 1
              ? <circle key={part} cx={center(path[0])[0]} cy={center(path[0])[1]} r=".12" />
              : <polyline key={part} points={points(path)} />)}
          </g>
        case 'thermometer':
          return <g key={index} className="variant-thermometer">
            <polyline points={points(rule.cells)} />
            <circle cx={center(rule.cells[0])[0]} cy={center(rule.cells[0])[1]} r=".32" />
          </g>
        case 'arrow':
          return <ArrowClue key={index} {...rule} marker={marker} />
        case 'kropki':
          return <g key={index}>{[rule.consecutive, rule.ratioTwo].flatMap((marks, kind) =>
            (marks?.pairs ?? []).map(([a, b]) => {
              const other = dots.get(pairKey(a, b)) === 3
              // A sum of three can validly share both dots and a sign. Keep
              // the complete group inside the cells even at the grid edge.
              const compact = other && sums.has(pairKey(a, b))
              const offset = other ? (kind ? 1 : -1) * (compact ? .1 : .125) : 0
              return <circle key={`${kind}-${a}-${b}`} className={`variant-dot ${kind ? 'variant-dot-black' : 'variant-dot-white'}`}
                cx={(x(a) + x(b) + 1) / 2 + (x(a) === x(b) ? offset : 0)}
                cy={(y(a) + y(b) + 1) / 2 + (y(a) === y(b) ? offset : 0)} r={compact ? .085 : .105} />
            }))}</g>
        default: return null
      }
    })}
  </svg>
}

const reference = (cell: number) => `row ${y(cell) + 1}, column ${x(cell) + 1}`

export function variantCellLabels(rules: readonly VariantRule[]) {
  const labels: string[][] = Array.from({ length: 81 }, () => [])
  for (const [index, rule] of rules.entries()) {
    switch (rule.type) {
      case 'inequality':
        labels[rule.less].push(`inequality, smaller than ${reference(rule.greater)}`)
        labels[rule.greater].push(`inequality, larger than ${reference(rule.less)}`)
        break
      case 'adjacent-total': {
        const [a, b] = rule.cells
        const describe = (cell: number) => `${sumLabel(rule.sum)} clue, sum ${rule.sum} with ${reference(cell)}`
        if (!labels[a].includes(describe(b))) labels[a].push(describe(b))
        if (!labels[b].includes(describe(a))) labels[b].push(describe(a))
        break
      }
      case 'xv':
        for (const [sum, marks] of [[5, rule.five], [10, rule.ten]] as const) for (const [a, b] of marks?.pairs ?? []) {
          const describe = (cell: number) => `${sum === 5 ? 'V' : 'X'} clue, sum ${sum} with ${reference(cell)}`
          if (!labels[a].includes(describe(b))) labels[a].push(describe(b))
          if (!labels[b].includes(describe(a))) labels[b].push(describe(a))
        }
        break
      case 'non-consecutive':
        for (const [a, b] of rule.except ?? []) {
          labels[a].push(`Non-Consecutive exception with ${reference(b)}`)
          labels[b].push(`Non-Consecutive exception with ${reference(a)}`)
        }
        break
      case 'parity':
        for (const cell of rule.cells) labels[cell].push(rule.parity === 'odd'
          ? 'odd circle, digit must be 1, 3, 5, 7, or 9'
          : 'even square, digit must be 2, 4, 6, or 8')
        break
      case 'quadruple':
        for (const cell of quadrupleCells(rule.topLeft)) labels[cell].push(
          `Quadruple ${rule.digits.join(', ')}, circle touching ${reference(rule.topLeft)} and its three neighbors; repeated digits need separate cells`)
        break
      case 'diagonal': {
        const main = rule.diagonal === 'main'
        for (let i = 0; i < 9; i++) {
          labels[main ? i * 10 : i * 8 + 8].push(main ? 'top-left diagonal' : 'top-right diagonal')
        }
        break
      }
      case 'extra-house':
        for (const cell of rule.cells) labels[cell].push(`${extraRegionName(rules, index)}, digits 1–9 once each`)
        break
      case 'killer-cages':
        for (const { cells, sum } of rule.cages) {
          const corner = reference(Math.min(...cells))
          for (const cell of cells) labels[cell].push(`cage totaling ${sum}, starting at ${corner}`)
        }
        break
      case 'whispers':
        for (const cell of new Set(rule.cells)) {
          const neighbors = new Set(rule.cells.flatMap((other, i) => i > 0
            ? other === cell ? [rule.cells[i - 1]] : rule.cells[i - 1] === cell ? [other] : [] : []))
          labels[cell].push(`Whispers line, minimum difference ${rule.minDifference} with ${[...neighbors].map(reference).join(' and ')}`)
        }
        break
      case 'entropic': {
        const number = rules.slice(0, index + 1).filter(rule => rule.type === 'entropic').length
        for (const cell of new Set(rule.cells)) labels[cell].push(`Entropic line ${number}, ${rule.cells.length === 1 ? 'one-cell path, any digit 1–9' : rule.cells.length === 2 ? 'two positions from different low (1–3), medium (4–6) or high (7–9) groups' : 'every three successive positions contain a low (1–3), medium (4–6) and high (7–9) digit'}`)
        break
      }
      case 'renban':
        for (const cell of rule.cells) labels[cell].push(`Renban line ${rules.slice(0, index + 1).filter(rule => rule.type === 'renban').length}, ${rule.cells.length === 1 ? 'one-cell set, any digit 1–9' : `${rule.cells.length} different consecutive digits in any order`}`)
        break
      case 'palindrome':
        for (const cell of rule.cells) {
          const partner = palindromePartner(rule.cells, cell)
          labels[cell].push(partner === undefined ? 'Palindrome middle cell, no matching partner'
            : `Palindrome line, same digit as ${reference(partner)}`)
        }
        break
      case 'thermometer':
        rule.cells.forEach((cell, index) => {
          labels[cell].push(index === 0 ? 'thermometer bulb' :
            `thermometer cell ${index + 1} of ${rule.cells.length} from the bulb at ${reference(rule.cells[0])}`)
        })
        break
      case 'arrow':
        labels[rule.circle].push(`arrow circle, path through ${rule.cells.map(reference).join('; ')}`)
        for (const cell of rule.cells) labels[cell].push(`arrow path from the circle at ${reference(rule.circle)}`)
        break
      case 'kropki':
        for (const [marks, color] of [[rule.consecutive, 'white'], [rule.ratioTwo, 'black']] as const) {
          for (const [a, b] of marks?.pairs ?? []) {
            labels[a].push(`${color} dot with ${reference(b)}`)
            labels[b].push(`${color} dot with ${reference(a)}`)
          }
        }
        break
      default: break
    }
  }
  return labels
}
