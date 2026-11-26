import { sizedSumEndKey, sizedSumEndLabel, sizedXSumSide } from '../sudoku/sized-linked-double-arrow'
import { memo, useId, useMemo, type CSSProperties } from 'react'
import type { SizedConstraintRule, SizedLinkedDoubleArrow, SizedSumEnd, SizedDifferenceRule, SizedVariantPosition, VariantRule } from '../sudoku/engine'
import { isQuadrupleRule, quadrupleCells, sumLabel } from '../sudoku/variants'
import { coloredLineOverlapLanes, lineSkipsCells, sharedPalindromeEdges, sharedRegionSumEnds } from '../sudoku/line-geometry'
import { sizedRegionSumParts } from '../sudoku/region-sum'
import { fractionalRegionEdges } from '../sudoku/fractional-regions'
import { buildVariantClueModel, kropkiDots, pairKey } from './variant-clue-model'

// Keep these exports available to the frozen renderer used for performance comparisons.
export { sizedRuleClueLabels, variantCellLabels } from './VariantClueLabels'

const x = (cell: number, size = 9) => cell % size
const y = (cell: number, size = 9) => Math.floor(cell / size)
const center = (cell: number, size = 9) => [x(cell, size) + 0.5, y(cell, size) + 0.5] as const
const points = (cells: readonly number[], size = 9) => cells.map(cell => center(cell, size).join(',')).join(' ')

function ParityClue({ parity, cells, size = 9 }: Extract<SizedConstraintRule, { type: 'parity' }> & { size?: number }) {
  return <g className={`variant-parity variant-parity-${parity}`}>
    {[...new Set(cells)].map(cell => parity === 'odd'
      ? <circle key={cell} cx={center(cell, size)[0]} cy={center(cell, size)[1]} r=".36" />
      : <rect key={cell} x={x(cell, size) + .14} y={y(cell, size) + .14} width=".72" height=".72" />)}
  </g>
}

function DigitRestrictionClue({ shape, cells, size = 9 }: Extract<VariantRule, { type: 'digit-restriction' }> & { size?: number }) {
  return <g className={`variant-digit-restriction variant-digit-restriction-${shape}`}>
    {[...new Set(cells)].map(cell => {
      const [cx, cy] = center(cell, size)
      if (shape === 'circle') return <circle key={cell} cx={cx} cy={cy} r=".32" />
      if (shape === 'square') return <rect key={cell} x={cx - .3} y={cy - .3} width=".6" height=".6" />
      return <path key={cell} d={`M ${cx - .24} ${cy - .24} L ${cx + .24} ${cy + .24} M ${cx - .24} ${cy + .24} L ${cx + .24} ${cy - .24}`} />
    })}
  </g>
}

function EntropyWindowGroupClue({ cells, group }: Extract<VariantRule, { type: 'entropy-window-group' }>) {
  const [first] = cells
  const cx = first % 9 + 1
  const cy = Math.floor(first / 9) + 1
  return <g className={`variant-entropy-window-group variant-entropy-window-group-${group}`} data-entropy-window-group={group}>
    {group === 'middle'
      ? <path d={`M ${cx - .18} ${cy - .1} L ${cx} ${cy - .2} L ${cx + .18} ${cy - .1} L ${cx + .18} ${cy + .1} L ${cx} ${cy + .2} L ${cx - .18} ${cy + .1} Z`} />
      : group === 'low'
        ? <rect x={cx - .15} y={cy - .15} width=".3" height=".3" />
        : <circle cx={cx} cy={cy} r=".16" />}
  </g>
}

function DiagonalClue({ diagonal, size = 9 }: { diagonal: 'main' | 'anti'; size?: number }) {
  return <line className="variant-diagonal" x1={diagonal === 'main' ? 0 : size} y1="0"
    x2={diagonal === 'main' ? size : 0} y2={size} />
}

function ThermometerClue({ cells, size = 9, consecutive, color, slow }: {
  cells: readonly number[]; size?: number; consecutive?: boolean; color?: string; slow?: boolean
}) {
  const [bulbX, bulbY] = center(cells[0], size)
  return <g className="variant-thermometer" data-consecutive-thermometer={consecutive || undefined}
    data-slow-thermometer={slow || undefined}
    style={color ? { '--line-clue-color': color } as CSSProperties : undefined}>
    <polyline points={points(cells, size)} />
    <circle cx={bulbX} cy={bulbY} r=".32" />
  </g>
}

function InsideGridClue({ rows }: Extract<VariantRule, { type: 'inside-grid' }>) {
  return <g className="variant-inside-grid">
    {rows.flatMap(row => row.map(cell => {
      const [cx, cy] = center(cell)
      return <rect key={cell} x={cx - .33} y={cy - .33} width=".66" height=".66" rx=".045"
        transform={`rotate(45 ${cx} ${cy})`} />
    }))}
  </g>
}

function ExtremumMarks({ rules }: { rules: readonly VariantRule[] }) {
  const marks = new Map<number, Set<'minimum' | 'maximum'>>()
  for (const rule of rules) if (rule.type === 'minimum' || rule.type === 'maximum') {
    for (const cell of rule.cells) {
      const kinds = marks.get(cell) ?? new Set<'minimum' | 'maximum'>()
      kinds.add(rule.type)
      marks.set(cell, kinds)
    }
  }
  return [...marks].flatMap(([cell, kinds]) => [...kinds].map(type => {
    const cx = x(cell) + (type === 'minimum' && kinds.size > 1 ? .57 : .8)
    const cy = y(cell) + .18
    const offset = type === 'minimum' ? .068 : -.068
    const points = `${cx - .09},${cy - offset} ${cx},${cy + offset} ${cx + .09},${cy - offset}`
    return <g key={`${cell}-${type}`} className="variant-extremum" data-extremum={type} data-extremum-cell={cell}>
      <polyline className="variant-inequality-halo" points={points} />
      <polyline className="variant-inequality-sign" points={points} />
    </g>
  }))
}

const renbanColors = ['#cf419c', '#8353be', '#d26878', '#aa48bf']
const regionSumColors = ['#258fbd', '#5875bd', '#3b8ac4', '#5975d0']
const regionSumEndGap = .28
const overlapColors: Partial<Record<VariantRule['type'], string>> = {
  thermometer: 'currentColor',
  whispers: '#72a54e',
  entropic: '#bc6c27',
  modular: '#288e93',
  between: 'var(--board-ink)',
  lockout: 'var(--lockout-ink)',
}

function RenbanClue({ cells, segments, number, size = 9 }: {
  cells: readonly number[]; segments?: readonly (readonly number[])[]; number: number; size?: number
}) {
  const color = renbanColors[(number - 1) % renbanColors.length]
  return <g className="variant-renban" data-renban={number} stroke={color} fill={color}>
    {(segments ?? [cells]).map((path, part) => path.length === 1
      ? <circle key={part} cx={center(path[0], size)[0]} cy={center(path[0], size)[1]} r=".12" />
      : <polyline key={part} points={points(path, size)} />)}
  </g>
}

function AqreRegionClue({ regions }: { regions: Extract<VariantRule, { type: 'aqre' }>['regions'] }) {
  const owners = new Map<number, number>()
  regions.forEach((region, index) => region.cells.forEach(cell => owners.set(cell, index)))
  const edges: string[] = []
  for (let cell = 0; cell < 81; cell++) {
    const row = Math.floor(cell / 9), column = cell % 9
    if (column > 0 && owners.get(cell - 1) !== owners.get(cell)) edges.push(`M${column} ${row}v1`)
    if (row > 0 && owners.get(cell - 9) !== owners.get(cell)) edges.push(`M${column} ${row}h1`)
  }
  return <g className="variant-aqre-regions"><path d={edges.join(' ')} /></g>
}

function sharedCageEdge(cages: readonly (readonly number[])[], firstCage: number, secondCage: number) {
  const secondCells = new Set(cages[secondCage])
  for (const cell of cages[firstCage]) {
    const row = y(cell), column = x(cell)
    for (const neighbor of [column > 0 ? cell - 1 : -1, column < 8 ? cell + 1 : -1,
      row > 0 ? cell - 9 : -1, row < 8 ? cell + 9 : -1]) {
      if (neighbor >= 0 && secondCells.has(neighbor)) return [cell, neighbor] as const
    }
  }
}

function UnknownCagesClue({ rule }: { rule: Extract<VariantRule, { type: 'unknown-cage-sums' }> }) {
  return <g className="variant-unknown-cage-sums">
    {rule.cages.map((cells, index) => <g key={index} data-unknown-cage={index + 1}>
      <Cage cells={cells} captionWidth={0} captionInset={.075} />
    </g>)}
    {rule.consecutivePairs.map(([first, second]) => {
      const edge = sharedCageEdge(rule.cages, first, second)
      if (!edge) return null
      const [ax, ay] = center(edge[0]), [bx, by] = center(edge[1])
      return <text key={`${first}-${second}`} className="variant-cage-consecutive-label"
        data-consecutive-cage-link={`${first + 1}-${second + 1}`} x={(ax + bx) / 2} y={(ay + by) / 2}>C</text>
    })}
  </g>
}

function DistantNeighborsClue({ markedCells }: Extract<VariantRule, { type: 'distant-neighbors' }>) {
  return <g className="variant-distant-neighbors">
    {markedCells.map((cell, index) => <rect key={cell} className="variant-distant-neighbor-identity"
      data-distant-neighbor-identity={index + 1} x={x(cell)} y={y(cell)} width="1" height="1" />)}
  </g>
}

function renderKropkiDot(a: number, b: number, kind: number, paired: boolean, compact: boolean, size: number, value?: number) {
  const offset = paired ? (kind ? 1 : -1) * (compact ? .1 : .125) : 0
  const [ax, ay] = center(a, size), [bx, by] = center(b, size)
  const cx = (ax + bx) / 2 + (ax === bx ? offset : 0)
  const cy = (ay + by) / 2 + (ay === by ? offset : 0)
  const key = `${kind}-${a}-${b}`
  const color = kind ? 'variant-dot-black' : 'variant-dot-white'
  if (value === undefined) return <circle key={key} className={`variant-dot ${color}`} cx={cx} cy={cy} r={compact ? .085 : .105} />
  return <g key={key} className={`variant-labeled-dot ${kind ? 'ratio' : 'difference'}`}>
    <circle className={`variant-dot ${color}`} cx={cx} cy={cy} r={paired ? .111 : .145} />
    <text x={cx} y={cy}>{value}</text>
  </g>
}

function DifferenceClue({ cells: [a, b], difference, dots, size }: SizedDifferenceRule & { dots: number; size: number }) {
  const offset = dots === 3 ? .43 : dots ? .3 : 0
  const point = pairCenter(a, b, offset, size)
  const [cx, cy] = point.some(coordinate => coordinate < .18 || coordinate > size - .18)
    ? pairCenter(a, b, -offset, size) : point
  return <g className="variant-difference" data-difference={difference}>
    <circle cx={cx} cy={cy} r=".16" />
    <text x={cx} y={cy}>{difference}</text>
  </g>
}

function QuadrupleClue({ digits, topLeft, size = 9, sum, lettered }: {
  digits: readonly (number | string)[]; topLeft: number; size?: number; sum?: boolean; lettered?: boolean
}) {
  const cx = x(topLeft, size) + 1
  const cy = y(topLeft, size) + 1
  const count = digits.length
  return <g className="variant-quadruple" data-quadruple-sum={sum || undefined} data-lettered-quadruple={lettered || undefined}>
    <circle cx={cx} cy={cy} r=".265" />
    {sum && <text className="quadruple-sum-mark" x={cx + .23} y={cy - .19}>+</text>}
    {digits.map((digit, index) => <text key={index}
      x={cx + (count === 1 || count === 3 && index === 2 ? 0 : index % 2 ? .105 : -.105)}
      y={cy + (count <= 2 ? 0 : Math.floor(index / 2) ? .105 : -.105)}>{digit}</text>)}
  </g>
}

export function SizedRuleClues({ rules, size, values }: { rules: readonly SizedConstraintRule[]; size: number; values?: string }) {
  const marker = useId()
  let renbanNumber = 0, regionSumNumber = 0
  const colored = rules.flatMap<{
    rule: Extract<SizedConstraintRule, { type: 'renban' | 'region-sum' }>
    number: number
    color: string
  }>(rule => {
    if (rule.type === 'renban') return [{ rule, number: ++renbanNumber, color: renbanColors[(renbanNumber - 1) % renbanColors.length] }]
    if (rule.type === 'region-sum') return [{ rule, number: ++regionSumNumber, color: regionSumColors[(regionSumNumber - 1) % regionSumColors.length] }]
    return []
  })
  const lanes = coloredLineOverlapLanes(colored.map(({ rule }) => rule), size)
  const doubleArrows = rules.filter(rule => rule.type === 'double-arrow')
  const doubleArrowEnds = new Set(doubleArrows.flatMap(rule => rule.ends))
  const dots = kropkiDots(rules, size)
  const diamondEdges = new Map(rules.flatMap(rule => rule.type === 'row-column-sum'
    ? rule.pairs.map(pair => [pairKey(...pair, size), pair] as const) : []))
  const differences = new Set(diamondEdges.size
    ? rules.flatMap(rule => rule.type === 'difference' ? [pairKey(...rule.cells, size)] : []) : [])
  const markedEdges = new Set([...dots.keys(), ...rules.flatMap(rule => rule.type === 'xv'
    ? [...(rule.five?.pairs ?? []), ...(rule.ten?.pairs ?? [])].map(pair => pairKey(...pair, size)) : [])])
  const dotValues = new Map<number, [number?, number?]>()
  for (const rule of rules) if (rule.type === 'labeled-dots') {
    const kind = rule.relation === 'ratio' ? 1 : 0
    for (const { cells: [a, b], value } of rule.marks) {
      const edge = pairKey(a, b, size)
      const values = dotValues.get(edge) ?? []
      values[kind] = value
      dotValues.set(edge, values)
    }
  }
  return <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="variant-clues" data-sized-rule-clues>
    {rules.some(rule => rule.type === 'arrow') && arrowHead(marker)}
    {rules.map((rule, index) => rule.type === 'fractional-regions' && <g key={index} className="variant-fractional-regions" data-fractional-regions>
      {rule.pieces.flatMap((piece, pieceIndex) => piece.quarters.map(quarter => {
        const width = 2 * size
        return <rect key={`${pieceIndex}-${quarter}`} className="variant-fractional-region-fill"
          x={(quarter % width) / 2} y={Math.floor(quarter / width) / 2} width=".5" height=".5"
          fill={piece.color} fillOpacity=".38" />
      }))}
      {fractionalRegionEdges(rule.pieces, size).map(([rawX1, rawY1, rawX2, rawY2], edge) => {
        let x1 = rawX1 / 2, y1 = rawY1 / 2, x2 = rawX2 / 2, y2 = rawY2 / 2
        const dx = x2 - x1, dy = y2 - y1
        const trimCellCenter = (px: number, py: number) => Number.isInteger(px - .5) && Number.isInteger(py - .5) &&
          values?.[Math.floor(py) * size + Math.floor(px)] !== undefined && values[Math.floor(py) * size + Math.floor(px)] !== '0'
        const gap = .3
        if (trimCellCenter(x1, y1)) { x1 += dx * gap / .5; y1 += dy * gap / .5 }
        if (trimCellCenter(x2, y2)) { x2 -= dx * gap / .5; y2 -= dy * gap / .5 }
        return <line key={edge} className="variant-fractional-region-edge" x1={x1} y1={y1} x2={x2} y2={y2} />
      })}
    </g>)}
    {rules.map((rule, index) => rule.type === 'extra-house' && <ExtraRegion key={index} cells={rule.cells} size={size} />)}
    {rules.map((rule, index) => rule.type === 'killer-cages' && <g key={index}>
      {rule.cages.map(({ cells, sum }) => <g key={Math.min(...cells)} data-killer-cage={sum}>
        <Cage cells={cells} captionWidth={sum < 10 ? .17 : .3} captionInset={cageLabelInset(Math.min(...cells), rules, size)} size={size} />
      </g>)}
    </g>)}
    {rules.map((rule, index) => rule.type === 'diagonal' && <DiagonalClue key={index} diagonal={rule.diagonal} size={size} />)}
    {rules.map((rule, index) => rule.type === 'crust' && <g key={index} className="variant-crust">
      {rule.fixedEdges?.map(([a, b], edgeIndex) => {
        const ax = a % size, ay = Math.floor(a / size)
        const bx = b % size, by = Math.floor(b / size)
        return <path key={edgeIndex} className="variant-crust-fixed-edge"
          d={ay === by ? `M${Math.max(ax, bx)},${ay}v1` : `M${ax},${Math.max(ay, by)}h1`} />
      })}
      {rule.sharedRegion?.map(cell => <g key={cell} className="variant-crust-shared-region" data-crust-region="A">
        <circle cx={x(cell, size) + .18} cy={y(cell, size) + .18} r=".13" />
        <text x={x(cell, size) + .18} y={y(cell, size) + .18}>A</text>
      </g>)}
    </g>)}
    {rules.map((rule, index) => rule.type === 'parity' && <ParityClue key={index} {...rule} size={size} />)}
    {rules.map((rule, index) => rule.type === 'digit-restriction' && <DigitRestrictionClue key={index} {...rule} size={size} />)}
    {rules.map((rule, index) => (rule.type === 'thermometer' || rule.type === 'slow-thermometer') &&
      <ThermometerClue key={index} cells={rule.cells} size={size} slow={rule.type === 'slow-thermometer'} />)}
    {rules.map((rule, index) => rule.type === 'between' &&
      <EndpointLineClue key={`between-${index}`} cells={rule.cells} size={size} />)}
    {rules.map((rule, index) => rule.type === 'between' &&
      <EndpointLineClue key={`between-endpoints-${index}`} cells={rule.cells} endpoints size={size} />)}
    {rules.map((rule, index) => rule.type === 'whispers' && <g key={index} className="variant-whispers"
      data-min-difference={rule.minDifference}
      style={{ '--line-clue-color': rule.minDifference === 2 ? '#ffa600' : rule.minDifference === 3 ? '#67f067' : '#72a54e' } as CSSProperties}>
      <polyline points={points(rule.cells, size)} />
    </g>)}
    {rules.flatMap((rule, index) => rule.type === 'whispers' && rule.minDifference !== 5
      ? [<WhispersLabel key={index} rule={rule} markedEdges={markedEdges} size={size} />] : [])}
    {rules.flatMap(rule => rule.type === 'xv'
      ? [...(rule.five?.pairs ?? []).map(pair => [pair, 5] as const), ...(rule.ten?.pairs ?? []).map(pair => [pair, 10] as const)] : [])
      .map(([[a, b], sum]) => <SumClue key={pairKey(a, b, size)} a={a} b={b}
        sums={[[sum, 'xv']]} dots={dots.get(pairKey(a, b, size)) ?? 0} size={size} />)}
    {rules.map((rule, index) => rule.type === 'zipper' && <g key={index} data-zipper>
      <polyline className="variant-zipper" data-zipper-line points={points(rule.cells, size)} />
      {(() => {
        const middle = rule.cells.length / 2
        const [cx, cy] = Number.isInteger(middle)
          ? pairCenter(rule.cells[middle - 1], rule.cells[middle], 0, size)
          : center(rule.cells[Math.floor(middle)], size)
        return <circle className="variant-zipper-center" data-zipper-center cx={cx} cy={cy} r=".12" />
      })()}
    </g>)}
    {colored.map(({ rule, number, color }, index) => rule.type === 'renban'
      ? <RenbanClue key={index} {...rule} number={number} size={size} />
      : <RegionSumClue key={index} rule={rule} color={color} number={number} size={size} />)}
    {[...lanes].map(([index, edges]) => {
      const { rule, number, color } = colored[index]
      const dashed = rule.type === 'region-sum' && (rule.segments ?? [rule.cells]).some(path => lineSkipsCells(path, size))
      return <g key={index} className={`variant-${rule.type}-overlap`}
        data-renban={rule.type === 'renban' ? number : undefined}
        data-region-sum={rule.type === 'region-sum' ? number : undefined}>
        {edges.map((edge, i) => <ColoredLineLane key={i} {...edge} size={size} color={color} dashed={dashed} />)}
      </g>
    })}
    {rules.map((rule, index) => rule.type === 'arrow' && <ArrowClue key={index} {...rule} size={size} marker={marker} />)}
    {doubleArrows.map(({ ends: [start, finish], cells }, index) =>
      <g key={index} data-double-arrow>
        <EndpointLine cells={[start, ...cells, finish]} size={size} />
      </g>)}
    {doubleArrowEnds.size > 0 && <g className="variant-between-endpoints" data-double-arrow-ends>
      {[...doubleArrowEnds].map(cell =>
        <circle key={cell} cx={center(cell, size)[0]} cy={center(cell, size)[1]} r=".32" />)}
    </g>}
    {[...dots].flatMap(([edge, marks]) => {
      const a = Math.floor(edge / (size ** 2)), b = edge % (size ** 2)
      return [0, 1].filter(kind => marks & (1 << kind))
        .map(kind => renderKropkiDot(a, b, kind, marks === 3, false, size, dotValues.get(edge)?.[kind]))
    })}
    {rules.map((rule, index) => rule.type === 'difference' &&
      <DifferenceClue key={index} {...rule} dots={dots.get(pairKey(...rule.cells, size)) ?? 0} size={size} />)}
    {[...diamondEdges].map(([edge, [a, b]]) => {
      const shared = dots.has(edge) || differences.has(edge)
      const [cx, cy] = pairCenter(a, b, shared ? -.34 : 0, size)
      const side = shared ? .17 : .25
      return <rect key={edge} className="variant-row-column-sum-diamond" data-row-column-sum-diamond
        x={cx - side / 2} y={cy - side / 2} width={side} height={side}
        transform={`rotate(45 ${cx} ${cy})`} />
    })}
    {rules.map((rule, index) => rule.type === 'quadruple' && <QuadrupleClue key={index} {...rule} size={size} />)}
    {rules.map((rule, index) => rule.type === 'row-equation' && <g key={index} className="variant-row-equation" data-row-equation>
      {rule.operators.map((operator, step) => {
        if (operator === 'join') return null
        const first = rule.cells[step], second = rule.cells[step + 1]
        const glyph = { add: '+', subtract: '−', multiply: '×', divide: '÷', equals: '=' }[operator]
        return <text key={step} x={(first % size + second % size + 1) / 2}
          y={Math.floor(first / size) + .5}>{glyph}</text>
      })}
    </g>)}
  </svg>
}

/** Draw Double Arrow paths that can continue to X-Sum circles outside the grid. */
export function LinkedDoubleArrowClues({ rules, size, hidden }: {
  rules: readonly SizedLinkedDoubleArrow[]; size: number; hidden?: boolean
}) {
  const endCenter = (end: SizedSumEnd): readonly [number, number] => {
    if (typeof end === 'number') return center(end, size)
    const side = sizedXSumSide(end.direction)
    const at = end.index + .5
    if (side === 'top') return [at, -.5]
    if (side === 'bottom') return [at, size + .5]
    if (side === 'left') return [-.5, at]
    return [size + .5, at]
  }
  const ends = new Map(rules.flatMap(rule => rule.ends.map(end => [sizedSumEndKey(end), end] as const)))
  const label = rules.map(({ ends: [a, b] }) =>
    `Double Arrow connects ${sizedSumEndLabel(a, size)} with ${sizedSumEndLabel(b, size)}.`).join(' ')
  return <svg className="board-outside-clues linked-double-arrow-clues" viewBox={`0 0 ${size} ${size}`}
    role="img" aria-label={label} aria-hidden={hidden || undefined} focusable="false">
    {rules.map(({ ends: [a, b], cells }, i) => <g className="variant-between" data-linked-double-arrow key={i}>
      <EndpointPath path={[endCenter(a), ...cells.map(cell => center(cell, size)), endCenter(b)]} />
    </g>)}
    <g className="variant-between-endpoints">
      {[...ends].map(([key, end]) => {
        const [cx, cy] = endCenter(end)
        return <circle data-linked-sum-end={key} key={key} cx={cx} cy={cy} r=".32" />
      })}
    </g>
  </svg>
}

// Use the same side of an edge even when a directed clue reverses its endpoints.
function pairCenter(a: number, b: number, offset = 0, size = 9) {
  const [first, second] = a < b ? [a, b] : [b, a]
  const [ax, ay] = center(first, size), [bx, by] = center(second, size)
  const length = Math.hypot(bx - ax, by - ay)
  return [(ax + bx) / 2 - (by - ay) / length * offset,
    (ay + by) / 2 + (bx - ax) / length * offset] as const
}

/** Reserve the circle at the caption cell's top-left intersection. */
export function cageLabelInset(cell: number, rules: readonly (VariantRule | SizedConstraintRule)[], size = 9) {
  return rules.some(rule => (rule.type === 'quadruple' || rule.type === 'quadruple-sum') && rule.topLeft + size + 1 === cell) ? .34 : .1
}

function Cage({ cells, captionWidth, captionInset, size = 9 }: {
  cells: readonly number[]; captionWidth: number; captionInset: number; size?: number
}) {
  const edge = 0.075
  const members = new Set(cells)
  const corner = Math.min(...cells)
  return <>
    {cells.map((cell) => {
      const col = cell % size
      const row = Math.floor(cell / size)
      const left = col === 0 || !members.has(cell - 1)
      const right = col === size - 1 || !members.has(cell + 1)
      const top = !members.has(cell - size)
      const bottom = !members.has(cell + size)
      const x1 = col + (left ? edge : 0)
      const x2 = col + 1 - (right ? edge : 0)
      const y1 = row + (top ? edge : 0)
      const y2 = row + 1 - (bottom ? edge : 0)
      const segments = [
        top && `M${cell === corner ? col + captionInset + captionWidth : x1},${y1}H${x2}`,
        right && `M${x2},${y1}V${y2}`,
        bottom && `M${x2},${y2}H${x1}`,
        left && `M${x1},${y2}V${y1}`,
        !top && !left && !members.has(cell - size - 1) && `M${col + edge},${row}V${row + edge}H${col}`,
        !top && !right && !members.has(cell - size + 1) && `M${col + 1 - edge},${row}V${row + edge}H${col + 1}`,
        !bottom && !right && !members.has(cell + size + 1) && `M${col + 1 - edge},${row + 1}V${row + 1 - edge}H${col + 1}`,
        !bottom && !left && !members.has(cell + size - 1) && `M${col + edge},${row + 1}V${row + 1 - edge}H${col}`,
      ].filter(Boolean)
      return <path key={cell} className="variant-cage-edge" d={segments.join(' ')} />
    })}
  </>
}

/** Outline arithmetic cages and include captions when used without Board. */
export function AlgebraicCages({ rules, captions = false }: { rules: SizedVariantPosition['rules']; captions?: boolean }) {
  return <svg className="variant-clues" viewBox="0 0 4 4" aria-hidden="true">
    {rules.map((rule, index) => {
      const first = Math.min(...rule.cells)
      return <g key={index} data-algebraic-cage={index}>
        <Cage cells={rule.cells} captionInset={.1} captionWidth={Math.min(.75, .13 * rule.label.length + .05)} size={4} />
        {captions && <text className="variant-algebraic-preview-label" x={first % 4 + .12} y={Math.floor(first / 4) + .3}>{rule.label}</text>}
      </g>
    })}
  </svg>
}

function cellBoundary(cells: readonly number[], size = 9) {
  const members = new Set(cells)
  const edge = cells.flatMap((cell) => {
    const column = x(cell, size)
    const row = y(cell, size)
    return [
      !members.has(cell - size) && `M${column},${row}h1`,
      (column === size - 1 || !members.has(cell + 1)) && `M${column + 1},${row}v1`,
      !members.has(cell + size) && `M${column},${row + 1}h1`,
      (column === 0 || !members.has(cell - 1)) && `M${column},${row}v1`,
    ].filter(Boolean)
  }).join(' ')
  return edge
}

function ExtraRegion({ cells, size = 9, color, distinct }: {
  cells: readonly number[]; size?: number; color?: string; distinct?: true
}) {
  return <g className="variant-extra-region" data-distinct-cells={distinct}
    style={color ? { '--region-clue-color': color } as CSSProperties : undefined}>
    {cells.map((cell) => <rect key={cell} x={x(cell, size)} y={y(cell, size)} width="1" height="1" />)}
    <path d={cellBoundary(cells, size)} />
  </g>
}

function CloneClue({ groups, color }: { groups: readonly (readonly number[])[]; color: string }) {
  const cells = [...new Set(groups.flat())]
  return <g className="variant-clone" style={{ color }}>
    {cells.map(cell => <rect key={cell} data-clone-cell={cell} x={x(cell)} y={y(cell)} width="1" height="1" />)}
    <path d={cellBoundary(cells)} />
  </g>
}

function arrowHead(marker: string) {
  return <defs>
    <marker id={marker} viewBox="0 0 1 1" refX=".9" refY=".5" markerWidth=".29" markerHeight=".29"
      markerUnits="userSpaceOnUse" orient="auto">
      <path className="variant-arrow-head" d="M.08 .08L.9 .5L.08 .92" />
    </marker>
  </defs>
}

function ArrowClue({ circle, cells, marker, size = 9, pill }: {
  circle: number; cells: readonly number[]; marker: string; size?: number; pill?: readonly [number, number]
}) {
  const [cx, cy] = center(circle, size)
  const [nx, ny] = center(cells[0], size)
  const length = Math.hypot(nx - cx, ny - cy)
  const start = [cx + (nx - cx) * .33 / length, cy + (ny - cy) * .33 / length]
  return <>
    <polyline className="variant-arrow-line" points={`${start.join(',')} ${points(cells, size)}`} markerEnd={`url(#${marker})`} />
    {pill ? <PillClue cells={pill} /> : <circle className="variant-arrow-circle" cx={cx} cy={cy} r=".33" />}
  </>
}

function PillClue({ cells: [tens, ones] }: { cells: readonly [number, number] }) {
  const [tx, ty] = center(tens)
  const [ox, oy] = center(ones)
  const angle = Math.atan2(oy - ty, ox - tx) * 180 / Math.PI
  return <>
    <rect className="variant-arrow-pill" x={tx - .33} y={ty - .33}
      width={Math.hypot(ox - tx, oy - ty) + .66} height=".66" rx=".33"
      transform={`rotate(${angle} ${tx} ${ty})`} />
    {tens > ones && <text x={tx} y={ty - .35} className="variant-arrow-tens">10s</text>}
  </>
}

function EndpointPath({ path }: { path: readonly (readonly [number, number])[] }) {
  const gap = ([x1, y1]: readonly [number, number], [x2, y2]: readonly [number, number]) =>
    Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) > 1
  if (!path.slice(1).some((point, index) => gap(path[index], point))) {
    return <polyline points={path.map(point => point.join(',')).join(' ')} />
  }
  return <>
    {path.slice(1).map(([x2, y2], index) => {
      const [x1, y1] = path[index]
      return <line key={index} className={gap([x1, y1], [x2, y2]) ? 'variant-between-jump' : undefined} {...{ x1, y1, x2, y2 }} />
    })}
    {path.slice(1, -1).map(([cx, cy], index) => <circle key={index} className="variant-between-node" {...{ cx, cy }} r=".11" />)}
  </>
}

function EndpointLine({ cells, size = 9 }: { cells: readonly number[]; size?: number }) {
  return <g className="variant-between"><EndpointPath path={cells.map(cell => center(cell, size))} /></g>
}

function EndpointLineClue({ cells, endpoints = false, lockout = false, size = 9 }: {
  cells: readonly number[]; endpoints?: boolean; lockout?: boolean; size?: number
}) {
  if (!endpoints) return lockout
    ? <g className="variant-lockout"><EndpointPath path={cells.map(cell => center(cell, size))} /></g>
    : <EndpointLine cells={cells} size={size} />
  return <g className={lockout ? 'variant-lockout-endpoints' : 'variant-between-endpoints'}>
    {[cells[0], cells[cells.length - 1]].map(cell => {
      const [cx, cy] = center(cell, size)
      return lockout ? <path key={cell} d={`M${cx},${cy - .36}l.36,.36l-.36,.36l-.36,-.36Z`} />
        : <circle key={cell} cx={cx} cy={cy} r=".32" />
    })}
  </g>
}

function RegionSumClue({ rule, color, number, size = 9, sharedEnds }: {
  rule: Extract<VariantRule, { type: 'region-sum' }>; color: string; number: number; size?: number; sharedEnds?: ReadonlySet<number>
}) {
  const paths = rule.segments ?? [rule.cells]
  const separated = paths.some(path => lineSkipsCells(path, size))
  const shifted = sharedEnds && new Map<number, readonly [number, number]>()
  const drawings = paths.map(path => path.map((cell, i) => {
    const origin = center(cell, size)
    if (!sharedEnds?.has(cell)) return origin
    const next = center(i === 0 ? path[1] : path[i - 1], size)
    const dx = next[0] - origin[0], dy = next[1] - origin[1]
    const fraction = regionSumEndGap / Math.hypot(dx, dy)
    const end = [origin[0] + dx * fraction, origin[1] + dy * fraction] as const
    shifted?.set(cell, end)
    return end
  }))
  return <g className="variant-region-sum" data-region-sum={number} style={{ color }}>
    {paths.map((path, index) => lineSkipsCells(path, size)
      ? <g key={index}>{path.slice(1).map((cell, i) => <line key={i} className={lineSkipsCells([path[i], cell], size) ? 'variant-region-sum-jump' : undefined}
        x1={drawings[index][i][0]} y1={drawings[index][i][1]} x2={drawings[index][i + 1][0]} y2={drawings[index][i + 1][1]} />)}</g>
      : <polyline key={index} points={drawings[index].map(point => point.join(',')).join(' ')} />)}
    {(separated ? rule.cells : paths.filter(path => path.length === 1).flat()).map(cell => {
      const [cx, cy] = shifted?.get(cell) ?? center(cell, size)
      return <circle key={cell} className="variant-region-sum-node" cx={cx} cy={cy} r=".11" />
    })}
  </g>
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

function ColoredLineLane({ cells, lane, count, color, endpoints, sharedEnds, dashed, size = 9 }: {
  cells: readonly [number, number]; lane: number; count: number; color: string
  endpoints?: readonly number[]; sharedEnds?: ReadonlySet<number>; dashed?: boolean; size?: number
}) {
  const [ax, ay] = center(cells[0], size), [bx, by] = center(cells[1], size)
  const length = Math.hypot(bx - ax, by - ay)
  const offset = (lane - (count - 1) / 2) * Math.min(.1, .26 / count)
  const dx = -(by - ay) / length * offset, dy = (bx - ax) / length * offset
  const inset = (cell: number) => endpoints?.includes(cell) ? .32 : sharedEnds?.has(cell) ? regionSumEndGap : 0
  const first = inset(cells[0]), last = inset(cells[1])
  return <line x1={ax + dx + (bx - ax) / length * first} y1={ay + dy + (by - ay) / length * first}
    x2={bx + dx - (bx - ax) / length * last} y2={by + dy - (by - ay) / length * last}
    stroke={color} strokeWidth={Math.min(.075, .2 / count)} strokeDasharray={dashed ? '.1 .08' : undefined} />
}

function whispersLabelPoint(a: number, b: number, marked: boolean, size = 9) {
  const [ax, ay] = center(a, size), [bx, by] = center(b, size)
  const cx = (ax + bx) / 2, cy = (ay + by) / 2
  if (!marked) return [cx, cy] as const
  const length = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / length, uy = (by - ay) / length
  // Move beside the marked edge, then along it to clear signs and sum text.
  const candidates = [1, -1].map(side => [cx - uy * .5 * side + ux * .3, cy + ux * .5 * side + uy * .3] as const)
  return candidates.find(([x, y]) => x >= .25 && x <= size - .25 && y >= .15 && y <= size - .15)
    ?? [Math.max(.25, Math.min(size - .25, candidates[0][0])), Math.max(.15, Math.min(size - .15, candidates[0][1]))] as const
}

function WhispersLabel({ rule, markedEdges, size = 9 }: {
  rule: Extract<VariantRule, { type: 'whispers' }> | Extract<SizedConstraintRule, { type: 'whispers' }>
  markedEdges: ReadonlySet<number>; size?: number
}) {
  const edges = rule.cells.slice(1).map((b, i) => [rule.cells[i], b] as const)
  const [a, b] = edges.find(([a, b]) => !markedEdges.has(pairKey(a, b, size))) ?? edges[0]
  const marked = markedEdges.has(pairKey(a, b, size)), [lx, ly] = whispersLabelPoint(a, b, marked, size)
  return <g className="variant-whispers-label">
    {marked && <line className="variant-whispers-label-leader"
      x1={(x(a, size) + x(b, size) + 1) / 2} y1={(y(a, size) + y(b, size) + 1) / 2} x2={lx} y2={ly} />}
    <text className="variant-whispers-gap-halo" x={lx} y={ly}>≥{rule.minDifference}</text>
    <text className="variant-whispers-gap" x={lx} y={ly}>≥{rule.minDifference}</text>
  </g>
}

function SumClue({ a, b, sums, dots, size = 9 }: { a: number; b: number; sums: readonly [number, SumKind][]; dots: number; size?: number }) {
  return <g className={sums.every(([, kind]) => kind === 'xv') ? 'variant-xv' : 'variant-adjacent-total'} data-cell-a={a} data-cell-b={b}>
    {sums.map(([sum, kind], index) => {
      const offset = sums.length > 1 ? (index - (sums.length - 1) / 2) * (dots ? .86 : .36)
        : dots === 3 ? -.34 : dots ? -.27 : 0
      const [cx, cy] = pairCenter(a, b, offset, size)
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

function visibleCellPath(cells: ReadonlySet<number>) {
  const runs: string[] = []
  for (let row = 0; row < 9; row++) {
    for (let column = 0; column < 9; column++) {
      if (!cells.has(row * 9 + column)) continue
      const first = column
      while (column < 8 && cells.has(row * 9 + column + 1)) column++
      const width = column - first + 1
      runs.push(`M${first} ${row}h${width}v1h-${width}z`)
    }
  }
  return runs.join(' ')
}

export function VariantClues({ rules, viewBox = '0 0 9 9', visibleCells }: {
  rules: readonly VariantRule[]; viewBox?: string; visibleCells?: ReadonlySet<number>
}) {
  const marker = useId()
  const clipId = `${marker}-fog`
  const clip = useMemo(() => visibleCells && visibleCellPath(visibleCells), [visibleCells])
  const drawing = <VariantClueDrawing rules={rules} marker={marker} />
  return <svg className="variant-clues" viewBox={viewBox} aria-hidden="true" focusable="false">
    {rules.some(rule => rule.type === 'arrow' || rule.type === 'pill-arrow') && arrowHead(marker)}
    {clip === undefined ? drawing : <>
      <defs><clipPath id={clipId}><path d={clip} /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>{drawing}</g>
    </>}
  </svg>
}

// A reveal changes the clip path while the authored geometry stays in place.
const VariantClueDrawing = memo(function VariantClueDrawing({ rules, marker }: {
  rules: readonly VariantRule[]; marker: string
}) {
  const model = useMemo(() => buildVariantClueModel(rules), [rules])
  const { clones, cloneIndices, disjoint, shared, coloredLanes, sumEnds, renbanIndices, regionSumIndices, drawingOrder, dots, sums, markedEdges } = model
  const renbanColor = (index: number) => renbanColors[renbanIndices.get(index)! % renbanColors.length]
  const regionSumColor = (index: number) => regionSumColors[regionSumIndices.get(index)! % regionSumColors.length]
  const drawnSums = new Set<number>()
  return <>
    {drawingOrder.map(({ rule, index, overlay }) => {
      if (overlay === 'endpoints' && (rule.type === 'between' || rule.type === 'lockout')) return <EndpointLineClue key={`${index}-endpoints`} cells={rule.cells} endpoints lockout={rule.type === 'lockout'} />
      if (overlay === 'whispers-label' && rule.type === 'whispers') return <WhispersLabel key={`${index}-whispers-label`} rule={rule} markedEdges={markedEdges} />
      if (overlay === 'colored-line') {
        const endpoints = rule.type === 'between' || rule.type === 'lockout' ? [rule.cells[0], rule.cells[rule.cells.length - 1]]
          : rule.type === 'thermometer' ? [rule.cells[0]] : undefined
        const dashed = (rule.type === 'between' || rule.type === 'lockout') && lineSkipsCells(rule.cells) || rule.type === 'region-sum' && (rule.segments ?? [rule.cells]).some(path => lineSkipsCells(path))
        const color = rule.type === 'region-sum' ? regionSumColor(index) : overlapColors[rule.type] ?? renbanColor(index)
        return <g key={`${index}-line-overlap`} className={`variant-${rule.type}-overlap`} data-renban={rule.type === 'renban' ? renbanIndices.get(index)! + 1 : undefined}
          data-region-sum={rule.type === 'region-sum' ? regionSumIndices.get(index)! + 1 : undefined}>
          {coloredLanes.get(index)!.map((lane, part) =>
            <ColoredLineLane key={part} {...lane} endpoints={endpoints} sharedEnds={sumEnds.get(index)} dashed={dashed} color={color} />)}
        </g>
      }
      if (overlay === 'palindrome') return <g key={`${index}-overlap`} className="variant-palindrome-overlap">
        {shared.get(index)!.map((edge, i) => <polyline key={i} points={points(edge)} />)}
      </g>
      switch (rule.type) {
        case 'aqre': return <AqreRegionClue key={index} regions={rule.regions} />
        case 'clone': return <CloneClue key={index} groups={rule.groups} color={['#b6753d', '#488caa', '#9165ad', '#56876a'][cloneIndices.get(index)! % 4]} />
        case 'distant-neighbors': return <DistantNeighborsClue key={index} {...rule} />
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
          return <ParityClue key={index} {...rule} />
        case 'digit-restriction':
          return <DigitRestrictionClue key={index} {...rule} />
        case 'entropy-window-group':
          return <EntropyWindowGroupClue key={index} {...rule} />
        case 'forbidden-entropic-connection': {
          const [from, to] = rule.cells.slice(1, 3)
          const [ax, ay] = center(from), [bx, by] = center(to)
          const dx = bx - ax, dy = by - ay
          const perpendicularX = -dy * .07, perpendicularY = dx * .07
          return <g key={index} className="variant-entropic-break" data-entropic-break={`${from}-${to}`}>
            {[.36, .64].map((position, mark) => {
              const cx = ax + dx * position, cy = ay + dy * position
              return <line key={mark} x1={cx - perpendicularX} y1={cy - perpendicularY} x2={cx + perpendicularX} y2={cy + perpendicularY} />
            })}
          </g>
        }
        case 'lettered-quadruples':
          return <g key={index}>{rule.clues.map(({ topLeft, letters }) =>
            <QuadrupleClue key={topLeft} topLeft={topLeft} digits={[...letters]} lettered />)}</g>
        case 'quadruple': case 'quadruple-sum':
          return <QuadrupleClue key={index} {...rule} sum={rule.type === 'quadruple-sum'} />
        case 'diagonal':
          return <DiagonalClue key={index} diagonal={rule.diagonal} />
        case 'distinct-cells':
          return <ExtraRegion key={index} cells={rule.cells} color={rule.color} distinct />
        case 'inside-grid':
          return <InsideGridClue key={index} {...rule} />
        case 'consecutive-run':
          if (rule.fromBulb) return <ThermometerClue key={index} cells={rule.cells} color={rule.color} consecutive />
          return <g key={index} className="variant-consecutive-run"
            style={rule.color ? { '--line-clue-color': rule.color } as CSSProperties : undefined}>
            <polyline points={points(rule.cells)} />
          </g>
        case 'extra-house':
          return disjoint.has(index) ? null : <ExtraRegion key={index} cells={rule.cells} />
        case 'killer-cages':
          return <g key={index}>{rule.cages.map((cage) => <Cage key={Math.min(...cage.cells)} cells={cage.cells} captionWidth={cage.sum < 10 ? .17 : .3}
            captionInset={cageLabelInset(Math.min(...cage.cells), rules)} />)}</g>
        case 'unknown-cage-sums': return <UnknownCagesClue key={index} rule={rule} />
        case 'whispers': {
          return <g key={index} className="variant-whispers" data-min-difference={rule.minDifference}>
            <polyline points={points(rule.cells)} />
          </g>
        }
        case 'palindrome':
          return <g key={index} className="variant-palindrome">
            {(rule.segments ?? [rule.cells]).map((path, part) => <polyline key={part} points={points(path)} />)}
          </g>
        case 'entropic': case 'modular': {
          return <g key={index} className={`variant-${rule.type}`}>
            {rule.cells.length === 1 ? <circle cx={center(rule.cells[0])[0]} cy={center(rule.cells[0])[1]} r=".12" />
              : <>
                {rule.type === 'entropic' && <polyline className="variant-entropic-outline" points={points(rule.cells)} />}
                <polyline points={points(rule.cells)} />
              </>}
          </g>
        }
        case 'renban':
          return <RenbanClue key={index} {...rule} number={renbanIndices.get(index)! + 1} />
        case 'between': case 'lockout':
          return <EndpointLineClue key={index} cells={rule.cells} lockout={rule.type === 'lockout'} />
        case 'region-sum':
          return <RegionSumClue key={index} rule={rule} color={regionSumColor(index)} number={regionSumIndices.get(index)! + 1} sharedEnds={sumEnds.get(index)} />
        case 'thermometer':
          return <ThermometerClue key={index} cells={rule.cells} />
        case 'arrow':
          return <ArrowClue key={index} {...rule} marker={marker} />
        case 'pill-arrow':
          return <g key={index} className="variant-pill-arrow">
            <ArrowClue circle={rule.pill[rule.fromTens ? 0 : 1]} cells={rule.cells} pill={rule.pill} marker={marker} />
          </g>
        case 'labeled-dots': {
          const kind = rule.relation === 'ratio' ? 1 : 0
          return <g key={index}>{rule.marks.map(({ cells: [a, b], value }) => {
            const edge = pairKey(a, b)
            const paired = dots.get(edge) === 3
            return renderKropkiDot(a, b, kind, paired, paired && sums.has(edge), 9, value === kind + 1 ? undefined : value)
          })}</g>
        }
        case 'kropki':
          return <g key={index}>{[rule.consecutive, rule.ratioTwo].flatMap((marks, kind) =>
            (marks?.pairs ?? []).map(([a, b]) => {
              const other = dots.get(pairKey(a, b)) === 3
              // A sum of three can validly share both dots and a sign. Keep
              // the complete group inside the cells even at the grid edge.
              const compact = other && sums.has(pairKey(a, b))
              return renderKropkiDot(a, b, kind, other, compact, 9)
            }))}</g>
        default: return null
      }
    })}
    <ExtremumMarks rules={rules} />
    {clones.sets.map(set => <g key={set.label} className="variant-clone-label" data-clone={set.label}>
      {set.cells.map(cell => <g key={cell}>
        <text className="variant-clone-label-halo" x={x(cell) + .08} y={y(cell) + .94}>{set.label}</text>
        <text className="variant-clone-label-mark" data-clone-label-cell={cell} x={x(cell) + .08} y={y(cell) + .94}>{set.label}</text>
      </g>)}
    </g>)}
  </>
})
