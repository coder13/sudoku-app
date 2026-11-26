import type { CSSProperties, KeyboardEventHandler } from 'react'
import type { NumberBoard, NumberGame } from './NumberPuzzleTypes'

export type NumberPuzzleGridAppearance = {
  values: readonly number[]
  notes?: readonly number[]
  conflicts?: ReadonlySet<number>
  highlightedCell?: number | null
  contextCells?: ReadonlySet<number>
}

const noCells: ReadonlySet<number> = new Set()

export type NumberPuzzleGridInteraction = {
  selection: number
  locked: boolean
  onCellFocus: (index: number) => void
  onCellClick: (index: number, value: number) => void
  onCellRef: (index: number, button: HTMLButtonElement | null) => void
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
}

/** Render board content with independent visual marks and optional live interaction. */
export function NumberPuzzleGrid({ content, appearance, interaction, ariaLabel, readOnlySemantics = 'image' }: {
  content: { board: NumberBoard; game: NumberGame; name: string }
  appearance: NumberPuzzleGridAppearance
  interaction?: NumberPuzzleGridInteraction
  ariaLabel?: string
  readOnlySemantics?: 'button' | 'image'
}) {
  const { board, game, name } = content
  const { width, height, maxValue, cells, cellChoices, mirrorEdgeClues } = board
  const digits = Array.from({ length: maxValue }, (_, index) => index + 1)
  const { values, notes = [], conflicts = noCells, highlightedCell, contextCells = noCells } = appearance
  const label = ariaLabel ?? `${name} board`
  const cellName = (index: number) => `R${Math.floor(index / width) + 1}C${index % width + 1}`

  function renderBlock(index: number, copy?: 'top' | 'left' | 'corner') {
    const { label: clue, decoration } = cells[index]
    const named = !copy && Boolean(clue)
    return <div key={copy ? `${copy}-${index}` : index} className="number-puzzle-block" data-clue={Boolean(clue)}
      data-conflict={conflicts.has(index)} data-hint={contextCells.has(index)}
      role={named ? 'img' : undefined} aria-label={named ? `${cellName(index)}: ${clue}` : undefined}
      aria-hidden={named ? undefined : true}>
      {decoration}
    </div>
  }

  function renderCell({ label: clue, block, decoration, edges, given, endpoint, printed }: NumberBoard['cells'][number], index: number) {
    if (block) return renderBlock(index)
    const value = given || values[index]
    const marks = digits.filter(digit => (notes[index] ?? 0) & (1 << (digit - 1)))
    const description = printed !== undefined ? String(printed)
      : given ? `given ${given}` : value ? String(value) : marks.length ? `notes ${marks.join(', ')}` : 'empty'
    const label = `${cellName(index)}, ${description}${clue ? ', ' + clue : ''}`
    const content = <>
      {decoration}
      {printed !== undefined ? <span>{printed}</span> : value ? endpoint ? <span className="number-puzzle-endpoint">{value}</span> : value
        : maxValue > 9 ? <span className="number-puzzle-multi-notes" aria-hidden="true">{marks.join(' ')}</span>
          : marks.length ? <span className="number-puzzle-notes" aria-hidden="true">{Array.from({ length: 9 }, (_, slot) => slot + 1).map(digit =>
            <span key={digit}>{marks.includes(digit) ? digit : ''}</span>)}</span> : null}
    </>
    const visualProps = {
      className: 'number-puzzle-cell',
      'data-entry': Boolean(value && !given),
      'data-choice': cellChoices && value,
      'data-conflict': conflicts.has(index),
      'data-hint': highlightedCell === index,
      'data-context': contextCells.has(index),
      'data-edges': edges,
      'data-given': Boolean(given),
      'data-endpoint': endpoint,
      'data-decorated': Boolean(decoration),
      'aria-label': label,
    } as const
    if (!interaction && readOnlySemantics === 'image') {
      return <div key={index} {...visualProps} role="img">{content}</div>
    }
    return <button key={index} type="button" {...visualProps}
      ref={interaction ? button => interaction.onCellRef(index, button) : undefined}
      tabIndex={interaction?.selection === index ? 0 : -1}
      aria-pressed={cellChoices ? value !== cellChoices.off : interaction ? interaction.selection === index : undefined}
      disabled={!interaction} aria-disabled={cellChoices && interaction?.locked ? true : undefined}
      onFocus={interaction && (() => interaction.onCellFocus(index))}
      onClick={interaction && (() => interaction.onCellClick(index, value))}>{content}</button>
  }

  return <div className="number-puzzle-grid" data-game={game}
    data-toggle-cells={Boolean(cellChoices) || undefined} role="group" aria-label={label}
    style={{ '--number-puzzle-columns': width + Number(Boolean(mirrorEdgeClues)) } as CSSProperties}
    onKeyDown={interaction?.onKeyDown}>
    {mirrorEdgeClues && renderBlock(cells.length - 1, 'corner')}
    {mirrorEdgeClues && cells.slice(-width).map((_, column) => renderBlock((height - 1) * width + column, 'top'))}
    {mirrorEdgeClues ? cells.flatMap((cell, index) => index % width === 0
      ? [renderBlock(index + width - 1, 'left'), renderCell(cell, index)] : [renderCell(cell, index)])
      : cells.map(renderCell)}
  </div>
}
