import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { AdvancedModes } from '../sudoku/preferences'
import { MOBILE_LAYOUT_QUERY } from './mobile-layout'
import { useLinearResize } from './useLinearResize'

type Options = {
  compact?: boolean
  workspaceRoot?: RefObject<HTMLDivElement | null>
  draft: boolean
  inputSize: number
  panelHeight: number
  setPanelHeight: Dispatch<SetStateAction<number>>
  beginResize: () => void
  pencil: boolean
  candidateLayout: AdvancedModes['candidateLayout']
}

/** Own the responsive bounds and pointer or keyboard interaction for the input panel grip. */
export function useControlsPanelResize({ compact, workspaceRoot, draft, inputSize, panelHeight, setPanelHeight, beginResize,
  pencil, candidateLayout }: Options) {
  const [mobile, setMobile] = useState(false)
  const [bounds, setBounds] = useState({ min: 250, max: 420 })
  const controlsRoot = useRef<HTMLElement>(null)

  useEffect(() => {
    if (compact) return
    const query = window.matchMedia(MOBILE_LAYOUT_QUERY)
    const update = () => {
      setMobile(query.matches)
      const candidateControls = !draft && pencil && candidateLayout === 'center-corner' ? 44 : 0
      const min = Math.max(210, inputSize + candidateControls + 42)
      const max = Math.min(430, Math.max(min, Math.round(window.innerHeight * .56)))
      setBounds({ min, max })
      if (query.matches) {
        setPanelHeight(current => Math.min(max, Math.max(min, current || Math.round(window.innerHeight * .32))))
      }
    }
    update()
    query.addEventListener('change', update)
    window.addEventListener('resize', update)
    return () => {
      query.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [candidateLayout, compact, draft, inputSize, pencil, setPanelHeight])

  useLayoutEffect(() => {
    if (!mobile || compact) return
    const target = workspaceRoot?.current
    if (!target) return
    const property = '--mobile-controls-height'
    const previous = target.style.getPropertyValue(property)
    const value = `${panelHeight}px`
    target.style.setProperty(property, value)
    return () => {
      if (target.style.getPropertyValue(property) !== value) return
      if (previous) target.style.setProperty(property, previous)
      else target.style.removeProperty(property)
    }
  }, [mobile, compact, panelHeight, workspaceRoot])

  useEffect(() => {
    if (compact) return
    const clamped = Math.min(bounds.max, Math.max(bounds.min, panelHeight))
    if (clamped !== panelHeight) setPanelHeight(clamped)
  }, [bounds, compact, panelHeight, setPanelHeight])

  function resizePanel(next: number) {
    setPanelHeight(Math.min(bounds.max, Math.max(bounds.min, Math.round(next))))
  }

  const resizeHandle = useLinearResize<HTMLButtonElement>({
    value: panelHeight,
    min: bounds.min,
    max: bounds.max,
    axis: 'y',
    direction: -1,
    keys: { increase: 'ArrowUp', decrease: 'ArrowDown', home: 'min', end: 'max', step: 16 },
    onResize: resizePanel,
    onBegin: beginResize,
  })
  const resizeHandleProps = {
    onPointerDown: resizeHandle.onPointerDown,
    onPointerMove: resizeHandle.onPointerMove,
    onPointerUp: resizeHandle.onPointerUp,
    onPointerCancel: resizeHandle.onPointerCancel,
    onLostPointerCapture: resizeHandle.onLostPointerCapture,
    onKeyDown: resizeHandle.onKeyDown,
  }

  return { mobile, controlsRoot, resizeHandleProps }
}
