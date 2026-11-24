import { useId } from 'react'
import { outsideClueLabel, type outsideClueLayout } from '../sudoku/outside-clues'

type Layout = ReturnType<typeof outsideClueLayout>

/** Draw outside clues in the same cell viewport as grid links; Board reserves their edge and corner gutters. */
export function OutsideClues({ layout, hidden, size = 9 }: { layout: Layout; hidden?: boolean; size?: number }) {
  const marker = useId()
  if (!layout.clues.length) return null
  return (
    <svg
      className="board-outside-clues"
      aria-hidden={hidden || undefined}
      viewBox={`0 0 ${size} ${size}`}
      focusable="false"
      role="img"
      aria-label={layout.clues.map(({ rule }) => outsideClueLabel(rule, size)).join(' ')}
    >
      {layout.clues.some((clue) => clue.arrow) && (
        <defs>
          <marker
            id={marker}
            viewBox="0 0 1 1"
            refX=".9"
            refY=".5"
            markerWidth=".16"
            markerHeight=".16"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M0 0L1 .5L0 1Z" fill="currentColor" />
          </marker>
        </defs>
      )}
      {layout.clues.map(({ rule, x, y, lane, arrow, label }, i) => (
        <g key={i} data-outside-clue={rule.type} data-outside-lane={lane}>
          <text x={x} y={y}>
            {label}
          </text>
          {arrow && <line className="outside-diagonal-arrow" {...arrow} markerEnd={`url(#${marker})`} />}
        </g>
      ))}
    </svg>
  )
}
