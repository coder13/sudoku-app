import { CircleCheck, CircleX, Info } from 'lucide-react'
import type { Analysis } from '../sudoku/engine'
import { Modal } from './Modal'

export type CheckResult = { text: string; tone: 'error' | 'success' | 'neutral' }
export type DialogResult = CheckResult & { title: 'Puzzle check' | 'Puzzle action' }

export const validation: Record<Analysis, CheckResult> = {
  conflict: { text: 'Resolve the highlighted conflicts first.', tone: 'error' },
  unsolvable: { text: 'The current grid has no solution.', tone: 'error' },
  unique: { text: 'This puzzle has exactly one solution.', tone: 'success' },
  multiple: { text: 'This puzzle has multiple solutions. Add more givens.', tone: 'error' },
  'search-limit': { text: 'The engine couldn’t verify this grid. Review its givens and try again.', tone: 'neutral' },
}

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
