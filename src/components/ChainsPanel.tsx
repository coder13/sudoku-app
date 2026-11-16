import type { Deduction } from '../sudoku/engine'
import { chainCandidate } from '../sudoku/chains'
import { techniqueLabel } from '../sudoku/hints'
import { cellName, deductionResults } from '../sudoku/lesson-diagram'
import type { BoardLink } from './BoardAnnotations'
import type { useChainSketch } from './useChainSketch'

type ChainInspection = { deduction: Deduction; links: readonly BoardLink[]; explanation?: string }
type Props = { sketch: ReturnType<typeof useChainSketch>; unavailable?: string; inspection?: ChainInspection }

function pointName(point: BoardLink['from']) {
  return 'cells' in point ? `${point.digit} in ${point.cells.map(cellName).join(' or ')}`
    : `${point.digit} in ${cellName(point.cell)}`
}

function LinkLegend() {
  return <div className="chain-legend" aria-label="Link styles">
    <span><i aria-hidden="true" />Strong</span>
    <span><i className="weak-link" aria-hidden="true" />Weak</span>
  </div>
}

export function ChainsPanel({ sketch, unavailable, inspection }: Props) {
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

  return <section className="chains-panel" aria-label="Chains">
    {unavailable ? <p role="status">{unavailable}</p> : <>
      <div className="chain-toolbar">
        <button type="button" className="button secondary" aria-pressed={sketch.drawing} onClick={sketch.toggle}>Draw links</button>
        <button type="button" className="button secondary" disabled={!sketch.canUndo} onClick={sketch.undo}>Undo edit</button>
        <button type="button" className="button secondary" disabled={!sketch.hasLinks} onClick={sketch.clear}>Clear links</button>
      </div>
      <LinkLegend />
      <p role="status">{sketch.status || (sketch.drawing
        ? 'Choose two candidates to toggle a link. Press Esc to cancel the selection or leave drawing mode.'
        : 'Turn on Draw links to select candidates in the grid.')}</p>
      {sketch.chains.map((chain) => {
        const first = chainCandidate(chain.nodes[0])
        const last = chainCandidate(chain.nodes.at(-1)!)
        const results = deductionResults(chain.actions)
        return <article className="chain-analysis" key={chain.nodes[0]}>
          <h2>{chain.title}</h2>
          {chain.strengths.length > 0 && <p>{pointName(first)}{chain.loop ? '' : ` to ${pointName(last)}`} · {chain.strengths.length} {chain.strengths.length === 1 ? 'link' : 'links'}</p>}
          {chain.explanation && <p>{chain.explanation}</p>}
          {results.length > 0 ? <ul className="chain-results">{results.map((result) => <li key={result}>{result}</li>)}</ul>
            : <p>{chain.strengths.length ? 'No placements or eliminations from these links.' : 'Remove a link at the branch to analyze a single path.'}</p>}
          {chain.canComplete && <button type="button" className="button secondary" onClick={() => sketch.finishLoop(chain)}>Complete loop</button>}
        </article>
      })}
    </>}
  </section>
}
