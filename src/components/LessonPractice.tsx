import { useMemo, useRef, useState } from 'react'
import type { DeductionAction, PracticeExercise } from '../sudoku/engine'
import { describeHint, describeHintRemovals } from '../sudoku/hints'
import { cellName, lessonDiagram } from '../sudoku/lesson-diagram'
import { practiceClueAnnotations, practiceSearch } from '../sudoku/lesson-guidance'
import { HintCard } from './HintCard'
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

export function PracticePuzzle({ puzzle, technique, instruction }: { puzzle: PracticeExercise; technique: string; instruction?: string }) {
  const canPlace = puzzle.answers.some((answer) => 'place' in answer)
  const canRemove = puzzle.answers.some((answer) => 'eliminate' in answer)
  const defaultInstruction = canPlace && canRemove ? 'Find one placement or candidate removal.'
    : canPlace ? 'Find one digit you can place.' : 'Use Pencil mode to remove a candidate.'
  const [result, setResult] = useState<{ actions: DeductionAction[]; revealed: boolean } | null>(null)
  const [guidance, setGuidance] = useState<string>()
  const [step, setStep] = useState<number | null>(null)
  const hintButton = useRef<HTMLButtonElement>(null)
  const clues = useMemo(() => {
    const { start, check, follow } = practiceSearch(puzzle)
    const checkAnnotations = practiceClueAnnotations(check)
    const stages = [
      { title: 'Where to look', text: start.text, annotations: practiceClueAnnotations(start), next: 'Show the first check' },
      { title: 'What to check', text: check.text, annotations: checkAnnotations, next: follow ? 'Show the pattern' : 'Show solution' },
    ]
    if (follow) stages.push({ title: 'Follow the pattern', text: follow, next: 'Show solution',
      annotations: 'forcing' in puzzle.deduction.evidence ? checkAnnotations : lessonDiagram(puzzle, undefined, { showActions: false }).annotations })
    return stages
  }, [puzzle])
  const clue = step === null ? undefined : clues[step]
  const solution = step === clues.length
  const solutionDiagram = useMemo(() => solution ? lessonDiagram(puzzle) : undefined, [puzzle, solution])
  const fullHint = solutionDiagram && describeHint(puzzle.deduction, { cellReferenceStyle: 'concise' })
  const hint = fullHint ? { ...fullHint, title: technique } : clue
  const guide = hint && step !== null ?
    <HintCard hint={hint} progress={{ step: step + 1, count: clues.length + 1 }} onClose={() => {
      setStep(null)
      requestAnimationFrame(() => hintButton.current?.focus({ preventScroll: true }))
    }}
      action={clue ? { label: clue.next, onClick: () => setStep(step + 1) } : undefined}
      secondaryAction={step > 0 ? { label: 'Previous step', onClick: () => setStep(step - 1) } : undefined}
      explanation={solutionDiagram && [solutionDiagram.description, ...(solutionDiagram.reasonSteps ? [] : [solutionDiagram.reason])]}
      explanationSteps={solutionDiagram?.reasonSteps} trace={solutionDiagram?.trace}
      removals={solution ? describeHintRemovals(puzzle.deduction, { cellReferenceStyle: 'concise' }) : undefined} />
    : !result && <div><button ref={hintButton} type="button" className="button secondary" onClick={() => setStep(0)}>Get a hint</button></div>
  const annotations: BoardAnnotations | undefined = result ? {
    cells: new Map(result.actions.map((action) => {
      const { cell } = 'place' in action ? action.place : action.eliminate
      return [cell, { outline: 'var(--lesson-result)', label: actionText(action) }]
    })),
  } : solutionDiagram?.annotations ?? clue?.annotations

  return <LessonWorkbench puzzle={puzzle} label={`Practice grid for ${technique}`} annotations={annotations}
    initialPencil={canRemove && !canPlace} instruction={solution ? undefined : instruction ?? defaultInstruction}
    preview={solution} guide={guide}
    onEdit={() => { setResult(null); setGuidance(undefined) }}>
    {({ actions, reset, reveal }) => <>
      {!solution && <p className="lesson-practice-feedback" role="status" data-result={result ? 'correct' : undefined}>
        {result ? `${result.revealed ? 'One possible move.' : 'Correct.'} ${result.actions.map(actionText).join(' ')}`
          : guidance ?? (actions.length ? actions.map(actionText).join(' ') : step === null ? 'Select cells. Then use the input tools to try a move.' : '')}
      </p>}
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
    </>}
  </LessonWorkbench>
}
