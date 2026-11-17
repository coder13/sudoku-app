import { useId } from 'react'
import type { VariantRule } from '../sudoku/engine'
import { extraRegionName, quadrupleCells } from '../sudoku/variants'

const x = (cell: number) => cell % 9
const y = (cell: number) => Math.floor(cell / 9)
const center = (cell: number) => [x(cell) + 0.5, y(cell) + 0.5] as const
const pairKey = (a: number, b: number) => Math.min(a, b) * 81 + Math.max(a, b)
const points = (cells: readonly number[]) => cells.map((cell) => center(cell).join(',')).join(' ')

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

export function VariantClues({ rules }: { rules: readonly VariantRule[] }) {
  const marker = useId()
  // Keep foreground circle symbols above lines and cage edges in either source order.
  const drawingOrder = rules.map((rule, index) => ({ rule, index }))
    .sort((a, b) => Number(a.rule.type === 'quadruple') - Number(b.rule.type === 'quadruple'))
  const dots = new Map<number, number>()
  for (const rule of rules) {
    if (rule.type !== 'kropki') continue
    for (const [kind, marks] of [rule.consecutive, rule.ratioTwo].entries()) {
      for (const [a, b] of marks?.pairs ?? []) {
        const key = pairKey(a, b)
        dots.set(key, (dots.get(key) ?? 0) | (1 << kind))
      }
    }
  }
  return <svg className="variant-clues" viewBox="0 0 9 9" aria-hidden="true" focusable="false">
    {rules.some((rule) => rule.type === 'arrow') && <defs>
      <marker id={marker} viewBox="0 0 1 1" refX=".9" refY=".5" markerWidth=".29" markerHeight=".29"
        markerUnits="userSpaceOnUse" orient="auto">
        <path className="variant-arrow-head" d="M.08 .08L.9 .5L.08 .92" />
      </marker>
    </defs>}
    {drawingOrder.map(({ rule, index }) => {
      switch (rule.type) {
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
              const offset = other ? (kind ? .125 : -.125) : 0
              return <circle key={`${kind}-${a}-${b}`} className={`variant-dot ${kind ? 'variant-dot-black' : 'variant-dot-white'}`}
                cx={(x(a) + x(b) + 1) / 2 + (x(a) === x(b) ? offset : 0)}
                cy={(y(a) + y(b) + 1) / 2 + (y(a) === y(b) ? offset : 0)} r=".105" />
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
