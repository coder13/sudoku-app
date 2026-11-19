import { useEffect, useRef, type RefObject } from 'react'

/** Clear cell selection on background clicks without stealing input-tool clicks. */
export function useGridClickAway(
  grid: RefObject<HTMLElement | null>,
  onAway: () => void,
  isInputTool: (target: Element) => boolean,
) {
  const latest = useRef({ onAway, isInputTool })
  latest.current = { onAway, isInputTool }
  useEffect(() => {
    function pointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element) || !grid.current || grid.current.contains(target)) return
      if (target.closest('.app-menu-trigger, #app-menu, .settings-dialog') || latest.current.isInputTool(target)) return
      latest.current.onAway()
    }
    document.addEventListener('pointerdown', pointerDown)
    return () => document.removeEventListener('pointerdown', pointerDown)
  }, [grid])
}
