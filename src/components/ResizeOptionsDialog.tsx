import { Button } from './Button'
import { Modal } from './Modal'
import { ResizeStepControls } from './ResizeStepControls'

/** Present the shared step and reset controls for resizing one panel dimension. */
export function ResizeOptionsDialog({ title, axis, value, min, max, onStep, onReset, open, onClose, step, returnFocus }: {
  title: string
  axis: 'width' | 'height'
  value: number
  min: number
  max: number
  onStep: (delta: number) => void
  onReset: () => void
  open: boolean
  onClose: () => void
  step?: number
  returnFocus?: () => HTMLElement | null
}) {
  return <Modal title={title} className="resize-options-dialog" open={open} onClose={onClose} returnFocus={returnFocus}>
    <ResizeStepControls axis={axis} step={step} onStep={onStep} atMin={value <= min} atMax={value >= max} />
    <Button className="resize-options-reset" onClick={onReset}>Reset size</Button>
  </Modal>
}
