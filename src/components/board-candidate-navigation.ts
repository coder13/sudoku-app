import type { KeyboardEvent } from 'react'

/** Move focus to the nearest candidate in the arrow-key direction. */
export function navigateBoardCandidates(event: KeyboardEvent<HTMLDivElement>) {
  if (!(event.target instanceof HTMLButtonElement) || !event.target.hasAttribute('data-candidate-button')) return
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!keys.includes(event.key) || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-candidate-button]')]
    .filter(button => !button.closest('[inert]'))
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    buttons.at(event.key === 'Home' ? 0 : -1)?.focus()
    return
  }
  const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'
  const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1
  const origin = event.target.getBoundingClientRect()
  let nearest: HTMLButtonElement | undefined
  let distance = Infinity
  for (const button of buttons) {
    const rect = button.getBoundingClientRect()
    const main = direction * (vertical ? rect.y - origin.y : rect.x - origin.x)
    const cross = Math.abs(vertical ? rect.x - origin.x : rect.y - origin.y)
    if (main > 0 && main + cross * 3 < distance) {
      nearest = button
      distance = main + cross * 3
    }
  }
  event.preventDefault()
  nearest?.focus()
}
