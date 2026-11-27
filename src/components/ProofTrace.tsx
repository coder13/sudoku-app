import type { HintTrace } from '../sudoku/engine'
import { CellReferenceText } from './CellReferenceHighlight'

/** Render proof steps with interactive cell references and separately expandable cases. */
export function ProofTrace({ trace, summary = 'Read the proof step by step' }: { trace: HintTrace; summary?: string }) {
  const steps = ({ steps, conclusion, cases }: HintTrace[number]) => <>
    {steps.length > 0 && <ol>{steps.map((step, index) => <li key={index}><CellReferenceText text={step} /></li>)}</ol>}
    {cases?.length ? <ProofTrace trace={cases} summary="Inspect inner cases" /> : null}
    {conclusion && <p><CellReferenceText text={conclusion} /></p>}
  </>
  return <details className="hint-card-explanation proof-trace">
    <summary>{summary}</summary>
    {trace.map((item, index) => trace.length === 1 ? <div key={index}>
      <p><CellReferenceText text={item.assumption} /></p>{steps(item)}
    </div> : <details className="proof-trace-case" key={index}>
      <summary>{item.assumption}</summary>{steps(item)}
    </details>)}
  </details>
}
