import { outsideClueLabel, type outsideClueLayout, type OutsideSide } from '../sudoku/outside-clues'

type Layout = ReturnType<typeof outsideClueLayout>

/** Render a grid edge's outside clues in reserved lanes; Board owns the cell-sized gutters. */
export function OutsideClues({ layout, side, hidden }: { layout: Layout; side: OutsideSide; hidden?: boolean }) {
  const depth = layout.depths[side]
  if (!depth) return null
  const horizontal = side === 'top' || side === 'bottom'
  return <div className={`outside-clues outside-clues-${side}`} aria-hidden={hidden || undefined}>
    <svg viewBox={`0 0 ${horizontal ? 9 : depth} ${horizontal ? depth : 9}`} focusable="false"
      role="img" aria-label={layout.sides[side].map(({ rule }) => outsideClueLabel(rule)).join(' ')}>
      {layout.sides[side].map(({ rule, index, lane }, i) => {
        const near = (lane + .5) * .7
        const cross = side === 'top' || side === 'left' ? depth - near : near
        return <text key={i} data-outside-clue={rule.type} data-outside-index={index} data-outside-lane={lane}
          x={horizontal ? index + .5 : cross} y={horizontal ? cross : index + .5}>
          {rule.sum}
        </text>
      })}
    </svg>
  </div>
}
