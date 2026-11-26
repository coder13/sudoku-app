import { useEffect } from 'react'

type Options = {
  enabled: boolean
  draft: boolean
  placeholder: boolean
  completed: boolean
  clearPointerFocus: (cell: number | null) => void
  toggleSolvedView: () => void
  togglePause: () => void
}

/** Keep the pause shortcut ahead of focused buttons that also respond to Space. */
export function usePauseHotkey({ enabled, draft, placeholder, completed, clearPointerFocus, toggleSolvedView, togglePause }: Options) {
  useEffect(() => {
    function pauseOnSpace(event: KeyboardEvent) {
      if (!enabled || draft || placeholder || event.key !== ' ' || event.isComposing ||
        event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'tel', 'password'].includes(target.type))) return

      event.preventDefault()
      event.stopPropagation()
      if (event.repeat) return
      clearPointerFocus(null)
      if (completed) toggleSolvedView()
      else togglePause()
    }

    window.addEventListener('keydown', pauseOnSpace, true)
    return () => window.removeEventListener('keydown', pauseOnSpace, true)
  }, [enabled, draft, placeholder, completed, clearPointerFocus, toggleSolvedView, togglePause])
}
