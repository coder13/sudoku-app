import { Button } from './Button'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useId, useState, type CSSProperties } from 'react'
import { foundationBoard, foundationVisuals, visualColors, type FoundationVisualId, type VisualBranch, type VisualKey } from '../sudoku/foundation-visuals'
import { Board } from './Board'

const keyLabels: Record<VisualKey, string> = {
  pattern: 'A blue ring marks a candidate in the pattern.',
  accent: 'An amber ring marks a second group.',
  removal: 'A red strike marks a candidate to remove.',
  result: 'A green ring marks a digit to place.',
  strong: 'A solid line is a strong link. At least one end is true.',
  weak: 'A dashed line is a weak link. At most one end is true.',
  arrow: 'An arrow points from an assumption to what follows.',
}

function VisualKey({ kind }: { kind: VisualKey }) {
  return <span className="foundation-key-item">
    <span className="foundation-key-symbol" aria-hidden="true">
      {kind === 'strong' || kind === 'weak' ? <i className={`lesson-key-link ${kind === 'weak' ? 'dashed' : ''}`} />
        : kind === 'arrow' ? <svg viewBox="0 0 32 16"><path d="M2 8H27M22 3L28 8L22 13" /></svg>
        : <span style={{ color: visualColors[kind] }} data-mark={kind === 'removal' ? 'strike' : 'ring'}>5</span>}
    </span>
    <span>{keyLabels[kind]}</span>
  </span>
}

function ProofBranches({ branches }: { branches: VisualBranch[] }) {
  return <ul className="foundation-branches">{branches.map(({ assumption, result, children }, index) => <li key={index}>
    <div className="foundation-branch-label">{assumption}</div>
    {children && <ProofBranches branches={children} />}
    <p className="foundation-branch-result"><ArrowRight size={16} aria-hidden="true" />{result}</p>
  </li>)}</ul>
}

function VisualWalkthrough({ visual: id }: { visual: FoundationVisualId }) {
  const visual = foundationVisuals[id]
  const [index, setIndex] = useState(0)
  const step = visual.steps[index]
  const heading = useId()
  const note = useId()
  return <figure className="lesson-diagram foundation-visual" aria-labelledby={heading} data-visual={id}>
    <header className="foundation-visual-heading"><h3 id={heading}>{visual.title}</h3>
      {visual.steps.length > 1 && <div className="foundation-step-controls" role="group" aria-label={`${visual.title} steps`}>
        <Button type="button" aria-label="Previous diagram step" disabled={index === 0}
          onClick={() => setIndex(index - 1)}><ArrowLeft size={16} aria-hidden="true" /></Button>
        <span>{index + 1} / {visual.steps.length}</span>
        <Button type="button" aria-label="Next diagram step" disabled={index === visual.steps.length - 1}
          onClick={() => setIndex(index + 1)}><ArrowRight size={16} aria-hidden="true" /></Button>
      </div>}
    </header>
    <p className="foundation-visual-note" id={note}>{visual.note}</p>
    {visual.region ? <div className="foundation-board lesson-board" style={{ '--visual-columns': visual.region.columns } as CSSProperties}>
      <Board {...foundationBoard(visual, step)} region={visual.region} showGuides label={visual.title} descriptionId={note} />
    </div> : <div className="foundation-stage-stack">{visual.steps.map((frame, i) => <div className="foundation-stage" key={i}
      data-active={i === index} aria-hidden={i !== index}>
      {frame.branches && <ProofBranches branches={frame.branches} />}
    </div>)}</div>}
    <figcaption>
      <div className="foundation-stage-stack" aria-live="polite" aria-atomic="true">
        {visual.steps.map((frame, i) => <div className="foundation-stage foundation-step-copy" key={i} data-active={i === index} aria-hidden={i !== index}>
          <h4>{frame.title}</h4>
          {frame.notation && <div className="foundation-notation" aria-label="Chain notation">{frame.notation.map((token, n) =>
            <code key={n} data-active={frame.active?.includes(n) || undefined}>{token}</code>)}</div>}
          {frame.states && <ul className="foundation-states" aria-label="Candidate states">{frame.states.map(state => <li key={state}>{state}</li>)}</ul>}
          <p>{frame.description}</p>
        </div>)}
      </div>
      <div className="lesson-legend foundation-key" aria-label="Diagram key">{visual.key.map(kind => <VisualKey key={kind} kind={kind} />)}</div>
    </figcaption>
  </figure>
}

export function FoundationVisual({ visual }: { visual: FoundationVisualId }) {
  return <VisualWalkthrough key={visual} visual={visual} />
}
