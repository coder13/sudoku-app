import { useId, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { LessonBlock } from '../sudoku/lesson-content'

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
      <button type="button" className="button secondary lesson-new-example" onClick={() => {
        setIndex((index + 1) % block.questions.length)
        setAnswer(null)
      }}><RefreshCw size={16} aria-hidden="true" /> New example</button>
    </header>
    <fieldset className="concept-choices">
      <legend aria-live="polite">{question.prompt}</legend>
      {question.options.map((option, optionIndex) => <button type="button" className="button secondary" key={`${index}:${optionIndex}`}
        aria-pressed={answer === optionIndex} onClick={() => setAnswer(optionIndex)}>{option}</button>)}
    </fieldset>
    <div className="concept-feedback" role="status" aria-atomic="true">
      {answer !== null && <><strong>{correct ? 'Correct.' : 'Try again.'}</strong> {question.explanation}</>}
    </div>
  </section>
}
