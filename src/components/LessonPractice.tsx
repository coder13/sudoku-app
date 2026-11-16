import { useState } from 'react'
import type { DeductionAction, LessonPractice } from '../sudoku/engine'
import { cellName } from '../sudoku/lesson-diagram'
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

function retryGuidance(attempt: DeductionAction, answers: LessonPractice['answers'], technique: string) {
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

export function PracticePuzzle({ puzzle, technique, instruction }: { puzzle: LessonPractice; technique: string; instruction?: string }) {
  const canPlace = puzzle.answers.some((answer) => 'place' in answer)
  const canRemove = puzzle.answers.some((answer) => 'eliminate' in answer)
  const defaultInstruction = canPlace && canRemove ? 'Find one placement or candidate removal.'
    : canPlace ? 'Find one digit you can place.' : 'Use Pencil mode to remove a candidate.'
  const [result, setResult] = useState<{ actions: DeductionAction[]; revealed: boolean } | null>(null)
  const [guidance, setGuidance] = useState<string>()
  const annotations: BoardAnnotations | undefined = result ? {
    cells: new Map(result.actions.map((action) => {
      const { cell } = 'place' in action ? action.place : action.eliminate
      return [cell, { outline: 'var(--lesson-result)', label: actionText(action) }]
    })),
  } : undefined

  return <LessonWorkbench puzzle={puzzle} label={`Practice grid for ${technique}`} annotations={annotations}
    initialPencil={canRemove && !canPlace} instruction={instruction ?? defaultInstruction}
    onEdit={() => { setResult(null); setGuidance(undefined) }}>
    {({ actions, reset, reveal }) => <>
      <p className="lesson-practice-feedback" role="status" data-result={result ? 'correct' : undefined}>
        {result ? `${result.revealed ? 'One possible move.' : 'Correct.'} ${result.actions.map(actionText).join(' ')}`
          : guidance ?? (actions.length ? actions.map(actionText).join(' ') : 'Select cells. Then use the input tools to try a move.')}
      </p>
      <div className="lesson-practice-actions">
        <button type="button" className={`button ${result ? 'secondary' : 'primary'}`} disabled={!result && !actions.length}
          onClick={() => {
            if (result) { reset(); setResult(null); setGuidance(undefined); return }
            const invalid = actions.find((action) => !puzzle.answers.some((answer) => sameAction(answer, action)))
            if (invalid) setGuidance(retryGuidance(invalid, puzzle.answers, technique))
            else if (actions.length) setResult({ actions, revealed: false })
          }}>{result ? 'Reset puzzle' : 'Check move'}</button>
        {!result && <button type="button" className="button quiet" onClick={() => {
          reveal(puzzle.suggestion); setGuidance(undefined); setResult({ actions: [puzzle.suggestion], revealed: true })
        }}>Show one move</button>}
      </div>
    </>}
  </LessonWorkbench>
}
