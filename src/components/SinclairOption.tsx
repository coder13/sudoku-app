import { useId, useSyncExternalStore } from 'react'
import { setSinclair, subscribeToGenerator, usesSinclair } from '../sudoku/generator-preference'

export function SinclairOption({ disabled }: { disabled: boolean }) {
  const id = useId()
  const enabled = useSyncExternalStore(subscribeToGenerator, usesSinclair, () => false)
  return <label className="sinclair-option">
    <input type="checkbox" checked={enabled} disabled={disabled} aria-labelledby={id} aria-describedby={id + '-detail'}
      onChange={event => setSinclair(event.target.checked)} />
    <span><strong id={id}>Sinclair collection</strong><small id={id + '-detail'}>Download 100 puzzles at this level. Each new game uses a different answer.</small></span>
  </label>
}
