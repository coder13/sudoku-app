import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { makeChainGraph, chainCandidate } from '../sudoku/chains'
import type { Candidate, DeductionAction } from '../sudoku/engine'
import {
  applyDeduction, clearCandidateColors, enter, paintCandidate, undo, valuesOf,
  type ColorTarget, type Game,
} from '../sudoku/game'
import { cellName } from '../sudoku/lesson-diagram'
import { Board } from './Board'
import { CellColorPalette } from './CellColorPalette'
import { ChainsPanel } from './ChainsPanel'
import { useChainSketch } from './useChainSketch'

const tools = [
  ['place', 'Assume true'], ['eliminate', 'Assume false'], ['color', 'Color'], ['links', 'Links'],
] as const
type Tool = typeof tools[number][0]

export function LessonProofScratch({ initial, onReturn }: { initial: Game; onReturn: () => void }) {
  const [game, setGame] = useState(initial)
  const [tool, setTool] = useState<Tool>('place')
  const [target, setTarget] = useState<ColorTarget>('candidate')
  const [brush, setBrush] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  const returnButton = useRef<HTMLButtonElement>(null)
  useEffect(() => returnButton.current?.focus(), [])

  const values = valuesOf(game)
  const masks = game.position.corner
  const empty = [...values].findIndex((digit, cell) => digit === '0' && masks[cell] === 0)
  const graph = useMemo(() => empty === -1 ? makeChainGraph(masks) : null, [masks, empty])
  const sketch = useChainSketch(graph, `${values}:${masks.join(',')}`, tool === 'links' && graph !== null)
  const paintingCells = tool === 'color' && target === 'cell' && brush !== null
  const paintingCandidates = tool === 'color' && target === 'candidate' && brush !== null
  const assuming = tool === 'place' || tool === 'eliminate'

  function apply(actions: readonly DeductionAction[]) {
    setGame((current) => applyDeduction(current, actions, current.position.corner))
  }

  function assume(candidate: Candidate) {
    apply([tool === 'place' ? { place: candidate } : { eliminate: candidate }])
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      if (sketch.drawing) sketch.cancel()
      if (tool === 'color') setBrush(null)
    }
    if (!paintingCells || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return
    const row = Math.floor(active / 9)
    const column = active % 9
    const offsets = { ArrowLeft: column ? -1 : 0, ArrowRight: column < 8 ? 1 : 0, ArrowUp: row ? -9 : 0, ArrowDown: row < 8 ? 9 : 0 }
    if (!Object.hasOwn(offsets, event.key)) return
    event.preventDefault()
    const next = active + offsets[event.key as keyof typeof offsets]
    setActive(next)
    event.currentTarget.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus({ preventScroll: true })
  }

  return (
    <>
      <div className="lesson-proof-toolbar">
        <button type="button" className="button secondary" ref={returnButton} onClick={onReturn}>Return to proof</button>
        <button type="button" className="button secondary" disabled={!game.past.length}
          onClick={() => setGame(undo)}>Undo board edit</button>
      </div>
      <div className="lesson-proof-layout">
        <div className="lesson-board lesson-diagram-board lesson-proof-board chain-sketch" onKeyDown={keyDown}>
          <Board givens={game.givens} values={values} position={game.position} showGuides active={active}
            label="Proof copy grid" annotations={tool === 'links' ? sketch.annotations : undefined}
            errors={empty === -1 ? undefined : new Set([empty])}
            onCandidate={sketch.drawing ? sketch.select : assuming ? assume : undefined}
            onCell={paintingCells ? (cell) => {
              setActive(cell)
              setGame((current) => enter(current, [cell], 'color', brush))
            } : undefined}
            onPaintCandidate={paintingCandidates ? (candidate) => setGame((current) => paintCandidate(current, candidate, brush)) : undefined}
            onCandidateHover={sketch.drawing ? sketch.hover : undefined} isLinkTarget={sketch.drawing ? sketch.isLinkTarget : undefined}
            selectedCandidate={sketch.pending === null ? undefined : chainCandidate(sketch.pending)} />
        </div>
        <div className="lesson-proof-controls">
          <div className="lesson-proof-toolbar" role="group" aria-label="Explore the proof copy">
            {tools.map(([id, label]) => <button type="button" className="button secondary" key={id}
              aria-pressed={tool === id} onClick={() => setTool(id)}>{label}</button>)}
          </div>
          {empty !== -1 && <p role="status">{cellName(empty)} has no candidates left. This board has reached a contradiction.</p>}
          {assuming && <p>Choose a candidate to {tool === 'place' ? 'place it and remove it from its peers' : 'remove it'}.</p>}
          {tool === 'color' && <CellColorPalette target={target} onTarget={setTarget} brush={brush} disabled={false}
            hasColors={target === 'cell' ? game.position.colors.some(Boolean) : Boolean(game.position.candidateColors)}
            onColor={setBrush} onStop={() => setBrush(null)} onClear={() => setGame((current) => target === 'candidate'
              ? clearCandidateColors(current)
              : enter(current, current.position.colors.flatMap((color, cell) => color ? [cell] : []), 'color', 0))} />}
          {tool === 'links' && <ChainsPanel sketch={sketch} onApply={apply}
            unavailable={graph ? undefined : 'Undo the contradiction to draw links.'} />}
        </div>
      </div>
    </>
  )
}
