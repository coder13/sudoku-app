import { Minus, Plus } from 'lucide-react'
import { Button } from './Button'

export const RESIZE_STEP = 24

/** Use for one axis of a resize dialog with click and keyboard size steps. */
export function ResizeStepControls({ axis, onStep, step = RESIZE_STEP, atMin = false, atMax = false }: {
  axis: 'width' | 'height'
  onStep: (delta: number) => void
  step?: number
  atMin?: boolean
  atMax?: boolean
}) {
  const horizontal = axis === 'width'
  return <div className="resize-step-controls" role="group" aria-label={horizontal ? 'Width' : 'Height'}>
    <Button disabled={atMin} onClick={() => onStep(-step)}>
      <Minus size={16} aria-hidden="true" /> {horizontal ? 'Narrower' : 'Shorter'}
    </Button>
    <Button disabled={atMax} onClick={() => onStep(step)}>
      <Plus size={16} aria-hidden="true" /> {horizontal ? 'Wider' : 'Taller'}
    </Button>
  </div>
}
