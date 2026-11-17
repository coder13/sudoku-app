import { ArrowLeft, X } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DeductionAction } from '../sudoku/engine'
import { describeHint, describeHintRemovals } from '../sudoku/hints'
import { cellName, lessonDiagram } from '../sudoku/lesson-diagram'
import { practiceClueAnnotations, practiceSearch } from '../sudoku/lesson-guidance'
import type { PracticeGuide } from '../sudoku/lesson-content'
import type { LessonExercise } from '../sudoku/lesson-examples'
import { DeductionExplanation, DeductionOutcome } from './HintCard'
import { LessonWorkbench } from './LessonWorkbench'
import type { BoardAnnotations } from './BoardAnnotations'

function actionText(action: DeductionAction) {
  return 'place' in action
    ? `Place ${action.place.digit} in ${cellName(action.place.cell)}.`
    : `Remove ${action.eliminate.digit} from ${cellName(action.eliminate.cell)}.`
}

function sameAction(a: DeductionAction, b: DeductionAction) {
  if ('place' in a) return 'place' in b && a.place.cell === b.place.cell && a.place.digit === b.place.digit
  return 'eliminate' in b && a.eliminate.cell === b.eliminate.cell && a.eliminate.digit === b.eliminate.digit
}

function retryGuidance(attempt: DeductionAction, answers: readonly DeductionAction[], technique: string) {
  const placing = 'place' in attempt
  const { cell } = placing ? attempt.place : attempt.eliminate
  const address = cellName(cell)
  const movesHere = answers.filter((answer) => ('place' in answer ? answer.place : answer.eliminate).cell === cell)
  if (!movesHere.length) {
    return `There’s no ${technique} move in ${address}. Keep looking in the rest of the grid.`
  }
  if (!movesHere.some((answer) => ('place' in answer) === placing)) {
    return placing
      ? `In ${address}, look for a candidate to remove with ${technique}.`
      : `In ${address}, look for a digit to place with ${technique}.`
  }
  return placing
    ? `Look for a different digit to place in ${address} with ${technique}.`
    : `Look for a different candidate to remove from ${address} with ${technique}.`
}

export function PracticePuzzle({ puzzle, technique, instruction, practiceGuide }: {
  puzzle: LessonExercise; technique: string; instruction?: string; practiceGuide?: PracticeGuide
}) {
  const canPlace = puzzle.answers.some((answer) => 'place' in answer)
  const canRemove = puzzle.answers.some((answer) => 'eliminate' in answer)
  const defaultInstruction = canPlace && canRemove ? 'Find one placement or candidate removal.'
    : canPlace ? 'Find one digit you can place.' : 'Use Pencil mode to remove a candidate.'
  const [result, setResult] = useState<{ actions: DeductionAction[]; revealed: boolean } | null>(null)
  const [guidance, setGuidance] = useState<string>()
  const [step, setStep] = useState<number | null>(null)
  const nextButton = useRef<HTMLButtonElement>(null)
  const stepBody = useRef<HTMLDivElement>(null)
  const clues = useMemo(() => {
    const { start, check, follow } = practiceSearch(puzzle, practiceGuide)
    const checkAnnotations = practiceClueAnnotations(check)
    const stages = [
      { title: 'Where to look', text: start.text, annotations: practiceClueAnnotations(start) },
      { title: 'What to check', text: check.text, annotations: checkAnnotations },
    ]
    if (follow) stages.push({ title: 'Follow the pattern', text: follow,
      annotations: 'forcing' in puzzle.deduction.evidence ? checkAnnotations : lessonDiagram(puzzle, undefined, { showActions: false }).annotations })
    return stages
  }, [puzzle, practiceGuide])
  const clue = step === null ? undefined : clues[step]
  const solution = step === clues.length
  const solutionDiagram = useMemo(() => solution ? lessonDiagram(puzzle) : undefined, [puzzle, solution])
  useLayoutEffect(() => {
    if (stepBody.current) stepBody.current.scrollTop = 0
    if (solution) stepBody.current?.focus({ preventScroll: true })
  }, [step, solution])

  const guide = (ready: boolean) => <section className="lesson-practice-guide" aria-label="Practice walkthrough">
    <div className="lesson-practice-guide-bar">
      <span>{step === null ? 'Walkthrough' : `Step ${step + 1} of ${clues.length + 1}`}</span>
      <div className="lesson-practice-guide-actions">
        <button type="button" className="icon-button" aria-label="Previous step" disabled={step === null || step === 0}
          onClick={() => setStep((step ?? 0) - 1)}><ArrowLeft size={16} aria-hidden="true" /></button>
        <button ref={nextButton} type="button" className="button secondary" disabled={!ready || solution || Boolean(result)}
          onClick={() => setStep((step ?? -1) + 1)}>{step === clues.length - 1 ? 'Show solution' : 'Show next step'}</button>
        <button type="button" className="icon-button borderless" aria-label="Hide steps" disabled={step === null}
          onClick={() => {
            setStep(null)
            requestAnimationFrame(() => nextButton.current?.focus({ preventScroll: true }))
          }}><X size={16} aria-hidden="true" /></button>
      </div>
    </div>
    <div className="lesson-practice-step" tabIndex={0} role="group" aria-label="Step details" ref={stepBody}>
      <div aria-live="polite">
        {clue ? <><h3>{clue.title}</h3><p>{clue.text}</p></>
          : solution ? <h3>Solution</h3> : <p className="lesson-practice-instruction">{instruction ?? defaultInstruction}</p>}
      </div>
      {solutionDiagram && <>
        <DeductionOutcome removals={describeHintRemovals(puzzle.deduction, { cellReferenceStyle: 'concise' })}
          text={describeHint(puzzle.deduction, { cellReferenceStyle: 'concise' }).text} />
        <DeductionExplanation explanation={[solutionDiagram.description, ...(solutionDiagram.reasonSteps ? [] : [
          (puzzle.variantPuzzle || !solutionDiagram.reason) ? practiceGuide?.reason ?? solutionDiagram.reason : solutionDiagram.reason,
        ])].filter(Boolean)}
          explanationSteps={solutionDiagram.reasonSteps} trace={solutionDiagram.trace} />
      </>}
    </div>
  </section>
  const annotations: BoardAnnotations | undefined = result ? {
    cells: new Map(result.actions.map((action) => {
      const { cell } = 'place' in action ? action.place : action.eliminate
      return [cell, { outline: 'var(--lesson-result)', label: actionText(action) }]
    })),
  } : solutionDiagram?.annotations ?? clue?.annotations

  return <LessonWorkbench puzzle={puzzle} label={`Practice grid for ${technique}`} annotations={annotations}
    initialPencil={canRemove && !canPlace}
    preview={solution} guide={guide}
    onEdit={() => { setResult(null); setGuidance(undefined) }}>
    {({ actions, reset, reveal }) => <>
      <div className="lesson-practice-actions">
        {solution ? <button type="button" className="button secondary" onClick={() => {
          reveal(puzzle.suggestion); setStep(null); setGuidance(undefined); setResult({ actions: [puzzle.suggestion], revealed: true })
        }}>Apply one move</button> : <button type="button" className={`button ${result ? 'secondary' : 'primary'}`} disabled={!result && !actions.length}
          onClick={() => {
            if (result) { reset(); setResult(null); setGuidance(undefined); return }
            const invalid = actions.find((action) => !puzzle.answers.some((answer) => sameAction(answer, action)))
            if (invalid) setGuidance(retryGuidance(invalid, puzzle.answers, technique))
            else if (actions.length) { setStep(null); setResult({ actions, revealed: false }) }
          }}>{result ? 'Reset puzzle' : 'Check move'}</button>}
      </div>
      <p className="lesson-practice-feedback" role="status" data-result={result ? 'correct' : undefined}>
        {result ? `${result.revealed ? 'One possible move.' : 'Correct.'} ${result.actions.map(actionText).join(' ')}`
          : guidance ?? actions.map(actionText).join(' ')}
      </p>
    </>}
  </LessonWorkbench>
}
