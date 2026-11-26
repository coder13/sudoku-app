import { Button } from './Button'
import { useId, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { LessonBlock } from '../sudoku/lesson-content'
import { CellReferenceText } from './CellReferenceHighlight'

export function ConceptCheck({ block }: { block: Extract<LessonBlock, { type: 'concept-check' }> }) {
  const id = useId()
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState<number | null>(null)
  const question = block.questions[index]
  const correct = answer === question.answer

  return <section className="surface lesson-concept-check" aria-labelledby={`${id}-title`}>
    <header className="lesson-practice-heading">
      <h2 id={`${id}-title`}>{block.title}</h2>
      <span className="concept-progress">{index + 1} of {block.questions.length}</span>
      <Button type="button" className="lesson-new-example" onClick={() => {
        setIndex((index + 1) % block.questions.length)
        setAnswer(null)
      }}><RefreshCw size={16} aria-hidden="true" /> New example</Button>
    </header>
    <fieldset className="concept-choices">
      <legend aria-live="polite"><CellReferenceText text={question.prompt} /></legend>
      {question.options.map((option, optionIndex) => <Button type="button" key={`${index}:${optionIndex}`}
        aria-pressed={answer === optionIndex} onClick={() => setAnswer(optionIndex)}><CellReferenceText text={option} /></Button>)}
    </fieldset>
    <div className="concept-feedback" role="status" aria-atomic="true">
      {answer !== null && <><strong>{correct ? 'Correct.' : 'Try again.'}</strong> <CellReferenceText text={question.explanation} /></>}
    </div>
  </section>
}
