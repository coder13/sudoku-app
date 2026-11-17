import { Eraser, Link2, Plus, Trash2, Undo2 } from 'lucide-react'
import type { Deduction, DeductionAction } from '../sudoku/engine'
import { chainCandidate } from '../sudoku/chains'
import { techniqueLabel } from '../sudoku/hints'
import { cellName, deductionResults } from '../sudoku/lesson-diagram'
import type { BoardLink } from './BoardAnnotations'
import { CHAIN_COLORS, chainColor, type useChainSketch } from './useChainSketch'

type ChainInspection = { deduction: Deduction; links: readonly BoardLink[]; explanation?: string }
type Props = {
  sketch: ReturnType<typeof useChainSketch>
  onApply: (actions: readonly DeductionAction[]) => void
  unavailable?: string
  inspection?: ChainInspection
}

function pointName(point: BoardLink['from']) {
  if ('cells' in point) return `${point.digit} in ${point.cells.map(cellName).join(' or ')}`
  if ('candidates' in point) return point.candidates.map(({ cell, digit }) => `${digit} in ${cellName(cell)}`).join(' or ')
  return `${point.digit} in ${cellName(point.cell)}`
}

function LinkLegend() {
  return <div className="chain-legend" aria-label="Link styles">
    <span><i aria-hidden="true" />Strong</span>
    <span><i className="weak-link" aria-hidden="true" />Weak</span>
  </div>
}

export function ChainsPanel({ sketch, onApply, unavailable, inspection }: Props) {
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
  return <section className="chains-panel" aria-label="Chains">
    {unavailable ? <p role="status">{unavailable}</p> : <>
      <div className="chain-picker">
        <label>
          <span>Chain</span>
          <select value={active.id} onChange={(event) => sketch.switchSketch(Number(event.target.value))}>
            {sketch.sketches.map(({ id, type, color }) => <option key={id} value={id}>
              {type === 'medusa' ? 'Medusa' : 'Chain'} {id} ({color})
            </option>)}
          </select>
        </label>
        <button type="button" className="button secondary" onClick={sketch.addSketch}><Plus size={15} /> New chain</button>
        <button type="button" className="icon-button borderless" aria-label="Delete chain" title="Delete chain"
          disabled={sketch.sketches.length === 1 && !sketch.hasLinks} onClick={sketch.deleteSketch}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
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
      </div>
      <div className="chain-toolbar">
        <button type="button" className={`button ${sketch.drawing ? 'secondary' : 'primary'}`} onClick={sketch.toggle}>
          <Link2 size={15} aria-hidden="true" /> {sketch.drawing ? 'Done drawing' : 'Draw links'}
        </button>
        <button type="button" className="button secondary" disabled={!sketch.drawing || sketch.pending === null} onClick={sketch.endPath}>End path</button>
        <button type="button" className="icon-button borderless" aria-label="Undo edit" title="Undo edit"
          disabled={!sketch.canUndo} onClick={sketch.undo}>
          <Undo2 size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button borderless" aria-label="Clear links" title="Clear links"
          disabled={!sketch.hasLinks} onClick={sketch.clear}>
          <Eraser size={16} aria-hidden="true" />
        </button>
      </div>
      {!medusa && <LinkLegend />}
      <p className="chain-instructions" role="status">{sketch.status || (sketch.drawing
        ? medusa ? 'Select candidates joined by strong links. Select a marked candidate to start a branch.'
          : 'Select candidates in order to draw links. Select the last candidate again to end the path.'
        : 'Choose Draw links to mark candidates on the grid.')}</p>
      {sketch.chains.map((chain) => {
        const first = chainCandidate(chain.nodes[0])
        const last = chainCandidate(chain.nodes.at(-1)!)
        const results = deductionResults(chain.actions)
        const open = chain.nodes[0] !== chain.nodes.at(-1)
        return <article className="chain-analysis" key={chain.nodes[0]}>
          <h2>{chain.title}</h2>
          {chain.strengths.length > 0 && <p>{pointName(first)}{chain.loop ? '' : ` to ${pointName(last)}`} · {chain.strengths.length} {chain.strengths.length === 1 ? 'link' : 'links'}</p>}
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
      {sketch.medusas.map(({ nodes, sides, actions, explanation }) => {
        const results = deductionResults(actions)
        return <article className="chain-analysis" key={nodes[0]}>
          <h2>{sides.size ? `3D Medusa · ${nodes.length} candidates` : '3D Medusa'}</h2>
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
