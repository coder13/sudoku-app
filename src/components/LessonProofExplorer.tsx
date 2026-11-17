import { useId, useRef, useState, type CSSProperties } from 'react'
import { candidateId } from '../sudoku/chains'
import type { Candidate, LessonExample } from '../sudoku/engine'
import type { Game } from '../sudoku/game'
import { cellName, lessonDiagram, lessonValues } from '../sudoku/lesson-diagram'
import { copyLessonPosition, proofDependencies, type lessonForcingProof } from '../sudoku/lesson-proof'
import { Board } from './Board'
import type { BoardAnnotations, BoardLink, BoardRegion, CandidateAnnotation } from './BoardAnnotations'
import { LessonProofScratch } from './LessonProofScratch'

type Props = {
  example: LessonExample
  proof: NonNullable<ReturnType<typeof lessonForcingProof>>
  description?: string
  crop?: BoardRegion
}

export function LessonProofExplorer({ example, proof, description, crop }: Props) {
  const [branch, setBranch] = useState<number | null>(null)
  const [step, setStep] = useState(0)
  const [focused, setFocused] = useState(false)
  const [completed, setCompleted] = useState<ReadonlySet<number>>(() => new Set())
  const [scratch, setScratch] = useState<Game | null>(null)
  const heading = useId()
  const copyButton = useRef<HTMLButtonElement>(null)
  const steps = branch === null ? [] : proof.branches[branch]
  const current = steps[step]
  const end = Boolean(current) && step === steps.length - 1
  const dependencies = current && focused ? proofDependencies(steps, step) : undefined
  const { annotations: pattern } = lessonDiagram(example)
  const marks = new Map<number, Map<number, CandidateAnnotation>>()
  const links: BoardLink[] = []
  const controls = new Map<number, number>()

  if (!current) {
    for (const [cell, candidates] of pattern.candidates ?? []) marks.set(cell, new Map(candidates))
    marks.get(proof.target.cell)?.delete(proof.target.digit)
    proof.branches.forEach(([{ candidate }], index) => controls.set(candidateId(candidate), index))
  } else {
    for (let index = 0; index <= step; index++) {
      if (dependencies && !dependencies.has(index)) continue
      const { candidate, truth, causes } = steps[index]
      const color = index === 0 ? 'var(--lesson-accent)' : truth ? 'var(--lesson-result)' : 'var(--lesson-removal)'
      const candidates = marks.get(candidate.cell) ?? new Map()
      candidates.set(candidate.digit, { color, label: index === 0 ? 'assumed true' : truth ? 'forced placement' : 'ruled out',
        mark: truth ? 'ring' : 'strike' })
      marks.set(candidate.cell, candidates)
      controls.set(candidateId(candidate), index)
      for (const cause of causes) {
        links.push({ from: steps[cause].candidate, to: candidate, color: 'var(--lesson-pattern)', arrow: true })
      }
    }
  }

  const annotations: BoardAnnotations = { cells: focused ? undefined : pattern.cells, candidates: marks, links }

  function chooseBranch(index: number) {
    setBranch(index)
    setStep(0)
    setFocused(false)
  }

  function showStep(index: number, focus = false) {
    setStep(index)
    setFocused(focus)
    if (branch !== null && index === steps.length - 1 && !completed.has(branch)) {
      setCompleted((previous) => new Set([...previous, branch]))
    }
  }

  function inspect(candidate: Candidate) {
    const index = controls.get(candidateId(candidate))
    if (index === undefined) return
    if (branch === null) chooseBranch(index)
    else showStep(index, true)
  }

  function returnToProof() {
    setScratch(null)
    requestAnimationFrame(() => copyButton.current?.focus())
  }

  return (
    <section className="lesson-diagram lesson-proof-explorer" aria-labelledby={heading}>
      <h3 id={heading}>Explore the proof</h3>
      <p className="lesson-proof-intro">{description ?? 'At least one guardian must be true. Explore each branch.'}</p>
      {scratch ? <LessonProofScratch initial={scratch} onReturn={returnToProof} /> : <>
        <div className="lesson-proof-toolbar" role="group" aria-label="Guardian branches">
          <button type="button" className="button secondary" aria-pressed={branch === null}
            onClick={() => { setBranch(null); showStep(0) }}>Pattern</button>
          {proof.branches.map(([{ candidate, text }], index) => (
            <button type="button" className="button secondary" key={candidateId(candidate)} aria-pressed={index === branch}
              onClick={() => chooseBranch(index)}>{text.slice(0, -1)}</button>
          ))}
        </div>
        <div className="lesson-proof-layout">
          <div className="lesson-board lesson-diagram-board lesson-proof-board"
            style={crop && { '--diagram-columns': crop.columns } as CSSProperties}>
            <Board givens={example.givens} values={lessonValues(example)} candidates={example.candidates}
              label="Tridagon proof grid" showGuides region={crop} annotations={annotations} onCandidate={inspect}
              canSelectCandidate={(candidate) => controls.has(candidateId(candidate))}
              selectedCandidate={focused ? current?.candidate : undefined} />
          </div>
          <div className="lesson-proof-controls">
            {current ? <>
              <p role="status">{focused ? `Showing the reasoning for ${current.candidate.digit} in ${cellName(current.candidate.cell)}.`
                : `Step ${step + 1} of ${steps.length}. ${current.text}`}</p>
              <ol className="lesson-proof-steps" aria-label="Proof steps">
                {steps.slice(0, step + 1).map(({ text }, index) => (!dependencies || dependencies.has(index)) && (
                  <li key={index} value={index + 1}>
                    <button type="button" aria-current={index === step ? 'step' : undefined}
                      onClick={() => showStep(index, focused)}>{text}</button>
                  </li>
                ))}
              </ol>
              <div className="lesson-proof-toolbar">
                <button type="button" className="button secondary" disabled={step === 0} onClick={() => showStep(step - 1)}>Back</button>
                <button type="button" className="button primary" disabled={end} onClick={() => showStep(step + 1)}>Next step</button>
                {focused && <button type="button" className="button secondary" onClick={() => setFocused(false)}>Show all steps</button>}
              </div>
              {end && !focused && <p>Click the crossed-out {proof.target.digit} in {cellName(proof.target.cell)} to see what it depends on.</p>}
            </> : <p>Choose a guardian on the grid or open its branch above.</p>}
            {completed.size === proof.branches.length && <p className="lesson-outcomes">
              Every branch rules out {proof.target.digit} in {cellName(proof.target.cell)}. At least one guardian must be true, so you can remove it.
            </p>}
            <button type="button" className="button secondary" ref={copyButton}
              onClick={() => setScratch(copyLessonPosition(example, steps.slice(0, step + 1)))}>Explore a copy</button>
          </div>
        </div>
      </>}
    </section>
  )
}
