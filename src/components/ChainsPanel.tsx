import { Eraser, Eye, EyeOff, Link2, Plus, Trash2, Undo2 } from 'lucide-react'
import type { Deduction, DeductionAction } from '../sudoku/engine'
import { chainCandidate, type LinkStrength } from '../sudoku/chains'
import { DIGITS } from '../sudoku/game'
import { techniqueLabel } from '../sudoku/hints'
import { cellName, deductionResults } from '../sudoku/lesson-diagram'
import { shortcutLabel, type ShortcutPreferences } from '../sudoku/shortcuts'
import type { BoardLink } from './BoardAnnotations'
import { CHAIN_COLORS, chainColor, type useChainSketch } from './useChainSketch'

type ChainInspection = { deduction: Deduction; links: readonly BoardLink[]; explanation?: string }
type Props = {
  sketch: ReturnType<typeof useChainSketch>
  onApply: (actions: readonly DeductionAction[]) => void
  shortcuts: Pick<ShortcutPreferences, 'chainDrawing' | 'newChain'>
  digitHighlight?: { digit: number | null; onChange: (digit: number | null) => void }
  unavailable?: string
  inspection?: ChainInspection
}

function pointName(point: BoardLink['from']) {
  if ('cells' in point) return `${point.digit} in ${point.cells.map(cellName).join(' or ')}`
  if ('candidates' in point) return point.candidates.map(({ cell, digit }) => `${digit} in ${cellName(cell)}`).join(' or ')
  return `${point.digit} in ${cellName(point.cell)}`
}

function compactPath(nodes: readonly number[], strengths: readonly LinkStrength[]) {
  return nodes.map((id, i) => {
    const { cell, digit } = chainCandidate(id)
    const candidate = `${digit}${cellName(cell).toLowerCase()}`
    return i === 0 ? candidate : `${strengths[i - 1] === 'strong' ? '=' : '−'} ${candidate}`
  }).join(' ')
}

function LinkLegend({ notation = false }: { notation?: boolean }) {
  return <div className="chain-legend" aria-label="Link styles">
    <span><i aria-hidden="true" />Strong{notation && <code>=</code>}</span>
    <span><i className="weak-link" aria-hidden="true" />Weak{notation && <code>−</code>}</span>
  </div>
}

export function ChainsPanel({ sketch, onApply, shortcuts, digitHighlight, unavailable, inspection }: Props) {
  if (inspection) {
    const { deduction, links, explanation } = inspection
    return <section className="chains-panel" aria-label="Chains">
      <h2>{techniqueLabel(deduction.technique)}</h2>
      {links.length > 0 && <LinkLegend />}
      {explanation && <p>{explanation}</p>}
      <ul className="chain-results">{deductionResults(deduction.actions).map((result) => <li key={result}>{result}</li>)}</ul>
      {links.length > 0 && <details className="chain-links">
        <summary>{links.length} {links.length === 1 ? 'link' : 'links'}</summary>
        <ol>{links.map(({ from, to, dashed }, i) => (
          <li key={i}>{pointName(from)} to {pointName(to)} · {dashed ? 'weak' : 'strong'}</li>
        ))}</ol>
      </details>}
    </section>
  }

  const { active } = sketch
  const medusa = active.type === 'medusa'
  const drawLabel = sketch.drawing ? 'Done drawing' : 'Draw links'
  const drawKey = shortcutLabel(shortcuts.chainDrawing)
  const newKey = shortcutLabel(shortcuts.newChain)
  return <section className="chains-panel" aria-label="Chains">
    {unavailable ? <p role="status">{unavailable}</p> : <>
      <div className="chain-toolbar chain-draw-tools">
        <button type="button" className={`button ${sketch.drawing ? 'secondary' : 'primary'}`}
          title={`${drawLabel} (${drawKey})`} aria-keyshortcuts={drawKey} onClick={sketch.toggle}>
          <Link2 size={15} aria-hidden="true" /> {drawLabel}
        </button>
        <button type="button" className="button secondary" title={`New chain (${newKey})`} aria-keyshortcuts={newKey} onClick={sketch.addSketch}>
          <Plus size={15} aria-hidden="true" /> New chain
        </button>
        <div className="chain-edit-actions">
          <button type="button" className="button secondary" disabled={!sketch.drawing || sketch.pending === null}
            title="End path (Esc)" aria-keyshortcuts="Escape" onClick={sketch.endPath}>End path</button>
          <button type="button" className="icon-button borderless" aria-label="Undo edit" title="Undo edit (Ctrl+Z or Command+Z)"
            aria-keyshortcuts="Control+Z Meta+Z"
            disabled={!sketch.canUndo} onClick={sketch.undo}>
            <Undo2 size={16} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button borderless" aria-label="Clear links" title="Clear links"
            disabled={!sketch.hasLinks} onClick={sketch.clear}>
            <Eraser size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul className="chain-list" aria-label="Drawn chains">
        {sketch.sketches.map(({ id, type, color, secondColor, hidden, edges, chains, paths }, index) => {
          const name = `Chain ${index + 1}`
          const selected = id === active.id
          const visibilityLabel = `${hidden ? 'Show' : 'Hide'} ${name.toLowerCase()}`
          const deleteLabel = `Delete ${name.toLowerCase()}`
          const title = type === 'medusa' ? '3D Medusa' : chains.length === 1 ? chains[0].title : undefined
          const VisibilityIcon = hidden ? EyeOff : Eye
          return <li className="chain-row" key={id} data-active={selected || undefined} data-hidden={hidden || undefined}>
            <div className="chain-row-actions">
              <button type="button" className="chain-select" aria-pressed={selected} onClick={() => sketch.switchSketch(id)}>
                <span className="chain-swatches" aria-hidden="true">
                  <i style={{ backgroundColor: chainColor(color) }} />
                  {type === 'medusa' && <i style={{ backgroundColor: chainColor(secondColor) }} />}
                </span>
                {name}
              </button>
              <button type="button" className="icon-button borderless" aria-label={visibilityLabel} title={visibilityLabel}
                onClick={() => sketch.toggleVisibility(id)}>
                <VisibilityIcon size={16} aria-hidden="true" />
              </button>
              <button type="button" className="icon-button borderless" aria-label={deleteLabel} title={deleteLabel}
                disabled={sketch.sketches.length === 1 && edges.length === 0} onClick={() => sketch.deleteSketch(id)}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
            {title && <h2>{title}</h2>}
            {paths.length > 0
              ? <p className="chain-notation"><code>{paths.map(({ nodes, strengths }) => compactPath(nodes, strengths)).join(', ')}</code></p>
              : <p>No links yet.</p>}
          </li>
        })}
      </ul>
      {sketch.sketches.some(({ paths }) => paths.length > 0) && <LinkLegend notation />}
      <div className="chain-settings">
        <label>
          <span>Type</span>
          <select value={active.type} disabled={sketch.hasLinks} onChange={(event) => {
            sketch.setType(event.target.value === 'medusa' ? 'medusa' : 'alternating')
          }}>
            <option value="alternating">Alternating (XY, AIC)</option>
            <option value="medusa">3D Medusa</option>
          </select>
        </label>
        <label>
          <span>{medusa ? 'Color A' : 'Color'}</span>
          <span className="chain-color-input">
            <i style={{ backgroundColor: chainColor(active.color) }} aria-hidden="true" />
            <select value={active.color} onChange={(event) => sketch.setColor(CHAIN_COLORS[event.target.selectedIndex])}>
              {CHAIN_COLORS.map((color) => <option key={color}>{color}</option>)}
            </select>
          </span>
        </label>
        {medusa && <label>
          <span>Color B</span>
          <span className="chain-color-input">
            <i style={{ backgroundColor: chainColor(active.secondColor) }} aria-hidden="true" />
            <select value={active.secondColor} onChange={(event) => sketch.setColor(CHAIN_COLORS[event.target.selectedIndex], true)}>
              {CHAIN_COLORS.map((color) => <option key={color}>{color}</option>)}
            </select>
          </span>
        </label>}
        {digitHighlight && <label>
          <span>Highlight digit</span>
          <select value={digitHighlight.digit ?? ''} onChange={(event) => digitHighlight.onChange(Number(event.target.value) || null)}>
            <option value="">None</option>
            {DIGITS.map((digit) => <option key={digit}>{digit}</option>)}
          </select>
        </label>}
      </div>
      <p className="chain-instructions" role="status">{sketch.status || (sketch.drawing
        ? active.hidden ? 'Show this chain to draw links.'
          : medusa ? 'Select candidates joined by strong links. Select a marked candidate to start a branch.'
          : 'Select candidates in order to draw links. Select the last candidate again to end the path.'
        : 'Choose Draw links to mark candidates on the grid.')}</p>
      {sketch.chains.map((chain) => {
        const results = deductionResults(chain.actions)
        const open = chain.nodes[0] !== chain.nodes.at(-1)
        return <article className="chain-analysis" key={chain.nodes[0]}>
          {sketch.chains.length > 1 && <h2>{chain.title}</h2>}
          {chain.explanation && <p>{chain.explanation}</p>}
          {results.length > 0 ? <ul className="chain-results">{results.map((result) => <li key={result}>{result}</li>)}</ul>
            : <p>{chain.strengths.length ? 'No placements or eliminations from these links.' : 'Remove a link at the branch to analyze a single path.'}</p>}
          {(results.length > 0 || open) && <div className="chain-toolbar">
            {results.length > 0 && <button type="button" className="button primary" onClick={() => onApply(chain.actions)}>Apply edits</button>}
            {open && <button type="button" className="button secondary" disabled={!sketch.canFinishLoop(chain)}
              onClick={() => sketch.finishLoop(chain)}>Complete loop</button>}
          </div>}
        </article>
      })}
      {sketch.medusas.map(({ nodes, actions, explanation }) => {
        const results = deductionResults(actions)
        return <article className="chain-analysis" key={nodes[0]}>
          {sketch.medusas.length > 1 && <h2>{`${nodes.length} candidates starting at ${pointName(chainCandidate(nodes[0]))}`}</h2>}
          <p>{explanation ?? 'No candidates to remove from these links.'}</p>
          {results.length > 0 && <>
            <ul className="chain-results">{results.map((result) => <li key={result}>{result}</li>)}</ul>
            <button type="button" className="button primary" onClick={() => onApply(actions)}>Apply edits</button>
          </>}
        </article>
      })}
    </>}
  </section>
}
