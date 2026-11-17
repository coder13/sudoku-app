import { CircleCheck, CircleX, Info } from 'lucide-react'
import type { CheckResult } from '../sudoku/puzzle-validation'
export { validation, type CheckResult } from '../sudoku/puzzle-validation'
import { Modal } from './Modal'

export type DialogResult = CheckResult & { title: 'Puzzle check' | 'Puzzle action' }

export function PuzzleCheckResult({ result, onClose }: { result: DialogResult; onClose: () => void }) {
  const Icon = result.tone === 'success' ? CircleCheck : result.tone === 'error' ? CircleX : Info
  return (
    <Modal title={result.title} onClose={onClose} className="check-dialog">
      <div className={`check-result ${result.tone}`}>
        <span className="check-result-icon" aria-hidden="true"><Icon size={30} /></span>
        <p>{result.text}</p>
      </div>
    </Modal>
  )
}
