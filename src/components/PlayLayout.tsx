import { type ComponentProps, type PointerEvent, type ReactNode, type Ref, useLayoutEffect, useRef } from 'react'
import { ListChecks, X } from 'lucide-react'
import { IconButton } from './Button'
import { MobilePanelLayout } from './MobilePanelLayout'
import { animatePanelLayout, MotionSurface, motionDuration } from './Presence'
import { RESIZE_STEP } from './ResizeStepControls'

type InsightTab<Id extends string> = { id: Id; label: string }
type Insights<Id extends string> = {
  tabs: readonly InsightTab<Id>[]
  active: Id
  content: ReactNode
  onSelect: (id: Id) => void
  onClose: () => void
  tabListRef?: Ref<HTMLDivElement>
}

type MobilePlay = Omit<ComponentProps<typeof MobilePanelLayout>, 'panels'> & {
  inputTitle: string
  hintPlaceholder?: ReactNode
}

/** Use the same grid, input, hint, and insight slots for every playable puzzle. */
export function PlayLayout<Id extends string>({ desktop, puzzle, input, hint, insights, mobile, advanced }: {
  desktop: boolean
  puzzle: ReactNode
  input: ReactNode
  hint?: ComponentProps<typeof MotionSurface>['children']
  insights?: Insights<Id>
  mobile: MobilePlay
  advanced?: ReactNode
}) {
  const puzzleStack = useRef<HTMLDivElement>(null)
  const hintSlot = useRef<HTMLDivElement>(null)
  const standardDesktop = desktop && !advanced
  useLayoutEffect(() => {
    if (!standardDesktop) return
    const stack = puzzleStack.current
    const column = stack?.querySelector<HTMLElement>(':scope > .puzzle-column')
    const slot = hintSlot.current
    const content = slot?.querySelector<HTMLElement>(':scope > .standard-hint-content')
    if (!stack || !column || !slot || !content) return

    let hintRevealHeight = 0
    const measureHint = () => {
      const height = content.offsetHeight
      // The loading card can grow into a taller hint. Keep the initial reveal continuous.
      hintRevealHeight = Math.min(hintRevealHeight || height, height)
      slot.style.setProperty('--desktop-hint-height', `${height}px`)
    }

    const fitBoard = () => {
      if (stack.closest('[data-layout-resizing]')) return
      const hintHeight = slot.getBoundingClientRect().height
      if (!hintHeight) {
        stack.style.removeProperty('--desktop-hint-board-width')
        return
      }
      const stage = column.querySelector<HTMLElement>('.puzzle-stage')
      const frame = stage?.querySelector('.board-frame:not(.completion-frame, [inert] .board-frame)')
      if (!stage || !frame) return
      const scale = Number(getComputedStyle(stack).getPropertyValue('--desktop-layout-scale')) || 1
      const style = getComputedStyle(frame)
      const dimension = (name: string) => Number(style.getPropertyValue(name))
      const rows = (dimension('--board-rows') || 9) + dimension('--outside-top') + dimension('--outside-bottom')
      const columns = (dimension('--board-columns') || 9) + dimension('--outside-left') + dimension('--outside-right')
      const aspect = columns / rows
      const room = stack.getBoundingClientRect().height - column.getBoundingClientRect().height
      const frameWidth = frame.getBoundingClientRect().width
      // If the full-size puzzle already overflows a short window, ease out that overflow along with the hint height.
      const remainingWidth = stage.getBoundingClientRect().width - frameWidth
      const overflow = Math.max(0, remainingWidth / aspect - room)
      const progress = Math.min(1, hintHeight / (hintRevealHeight * scale))
      const spareHeight = room - hintHeight + overflow * (1 - progress)
      const width = Math.max(0, Math.floor((frameWidth + spareHeight * aspect) / scale))
      const limit = `${width}px`
      if (stack.style.getPropertyValue('--desktop-hint-board-width') !== limit) {
        stack.style.setProperty('--desktop-hint-board-width', limit)
      }
    }

    measureHint()
    fitBoard()
    const contentObserver = new ResizeObserver(measureHint)
    contentObserver.observe(content)
    const layoutObserver = new ResizeObserver(fitBoard)
    for (const element of [stack, slot]) layoutObserver.observe(element, { box: 'border-box' })
    return () => {
      contentObserver.disconnect()
      layoutObserver.disconnect()
    }
  }, [standardDesktop])

  if (advanced) return advanced
  if (!desktop) {
    const { inputTitle, hintPlaceholder, ...layout } = mobile
    return <MobilePanelLayout {...layout} panels={{
      puzzle: { title: 'Puzzle', content: puzzle },
      hint: mobile.withHint ? { title: 'Hint', content: hint || hintPlaceholder } : undefined,
      input: { title: inputTitle, content: input },
    }} />
  }
  return <>
    <div ref={puzzleStack} className="standard-puzzle-stack">
      {puzzle}
      <div ref={hintSlot} className="standard-hint-slot" id="standard-puzzle-hint" data-open={Boolean(hint)}>
        <div className="standard-hint-content"><MotionSurface>{hint}</MotionSurface></div>
        {hint && <DesktopHintDivider />}
      </div>
    </div>
    <div className="standard-input-stack" id="standard-digit-input">
      {input}
      <MotionSurface>{insights && <PlayInsights {...insights} />}</MotionSurface>
    </div>
  </>
}

type HintDrag = {
  divider: HTMLDivElement
  slot: HTMLElement
  pointerId: number
  startY: number
  y: number
  height: number
  min: number
  max: number
  scale: number
  savedSize: string
  frame: number | null
}

function DesktopHintDivider() {
  const divider = useRef<HTMLDivElement>(null)
  const drag = useRef<HintDrag | null>(null)

  function measure() {
    const slot = divider.current?.parentElement
    const card = slot?.querySelector<HTMLElement>('.hint-card')
    if (!slot || !card) return
    const style = getComputedStyle(card)
    const max = Math.floor(parseFloat(style.maxBlockSize))
    if (!Number.isFinite(max)) return
    const height = card.offsetHeight
    const body = card.querySelector<HTMLElement>('.hint-card-body')
    const min = Math.min(max, Math.max(96, height - (body?.offsetHeight ?? height) + 24))
    return { slot, height, min, max }
  }

  function reportHeight() {
    const range = measure()
    if (!range) return
    const { height, min, max } = range
    divider.current?.setAttribute('aria-valuemin', String(Math.min(min, height)))
    divider.current?.setAttribute('aria-valuemax', String(Math.max(max, height)))
    divider.current?.setAttribute('aria-valuenow', String(height))
    divider.current?.setAttribute('aria-valuetext', `${height} pixels`)
  }

  function finish(pointerId?: number, y?: number) {
    const current = drag.current
    if (!current || (pointerId !== undefined && current.pointerId !== pointerId)) return
    const { slot, divider } = current
    drag.current = null
    if (current.frame !== null) cancelAnimationFrame(current.frame)
    if (y !== undefined && y !== current.startY) {
      slot.style.setProperty('--desktop-hint-size', `${heightAtPointer(current, y)}px`)
    } else if (current.savedSize) {
      slot.style.setProperty('--desktop-hint-size', current.savedSize)
    } else {
      slot.style.removeProperty('--desktop-hint-size')
    }
    slot.removeAttribute('data-hint-resizing')
    if (divider.hasPointerCapture(current.pointerId)) divider.releasePointerCapture(current.pointerId)
  }

  useLayoutEffect(() => {
    const slot = divider.current?.parentElement
    if (!slot) return
    reportHeight()
    const observer = new ResizeObserver(reportHeight)
    const content = slot.querySelector('.standard-hint-content')
    if (content) observer.observe(content)
    if (slot.parentElement) observer.observe(slot.parentElement)
    const cancel = () => finish()
    window.addEventListener('resize', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      cancel()
      observer.disconnect()
      window.removeEventListener('resize', cancel)
      window.removeEventListener('blur', cancel)
    }
  }, [])

  function heightAtPointer(current: HintDrag, y: number) {
    const height = current.height + (current.startY - y) / current.scale
    return Math.min(current.max, Math.max(current.min, Math.round(height)))
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || drag.current || event.currentTarget.closest('[data-layout-resizing]')) return
    const range = measure()
    if (!range) return
    const { slot, height, min, max } = range
    const scale = Number(getComputedStyle(slot).getPropertyValue('--desktop-layout-scale')) || 1
    drag.current = {
      divider: event.currentTarget, slot, pointerId: event.pointerId, startY: event.clientY, y: event.clientY,
      height, min, max, scale,
      savedSize: slot.style.getPropertyValue('--desktop-hint-size'), frame: null,
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (current?.pointerId !== event.pointerId) return
    current.y = event.clientY
    if (current.frame !== null) return
    current.frame = requestAnimationFrame(() => {
      current.frame = null
      current.slot.setAttribute('data-hint-resizing', '')
      current.slot.style.setProperty('--desktop-hint-size', `${heightAtPointer(current, current.y)}px`)
    })
  }

  return <div ref={divider} className="desktop-hint-divider" role="separator" aria-orientation="horizontal"
    aria-label="Resize hint panel" aria-controls="standard-puzzle-hint" title="Drag to resize hint panel" tabIndex={0}
    onPointerDown={start} onPointerMove={move}
    onPointerUp={event => finish(event.pointerId, event.clientY)}
    onPointerCancel={event => finish(event.pointerId)}
    onLostPointerCapture={event => finish(event.pointerId)}
    onKeyDown={event => {
      if (!['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return
      const range = measure()
      if (!range) return
      event.preventDefault()
      event.stopPropagation()
      finish()
      const { slot, height, min, max } = range
      if (event.key === 'Home') {
        slot.style.removeProperty('--desktop-hint-size')
      } else {
        const step = event.key === 'ArrowUp' ? RESIZE_STEP : -RESIZE_STEP
        slot.style.setProperty('--desktop-hint-size', `${Math.min(max, Math.max(min, height + step))}px`)
      }
    }} />
}

export function scrollActiveTabIntoView(list: HTMLElement | null) {
  const tab = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
  if (!tab || !list) return
  const { left, right } = tab.getBoundingClientRect()
  const viewport = list.getBoundingClientRect()
  if (left < viewport.left) list.scrollLeft += left - viewport.left
  else if (right > viewport.right) list.scrollLeft += right - viewport.right
}

function PlayInsights<Id extends string>({ tabs, active, content, onSelect, onClose, tabListRef, className, ...props }:
  Insights<Id> & Omit<ComponentProps<'section'>, keyof Insights<Id>>) {
  const selected = tabs.find(tab => tab.id === active)
  const classes = ['desktop-insight-panel', className].filter(Boolean).join(' ')
  const panel = useRef<HTMLElement>(null)
  const previousSize = useRef<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return
    const size = () => ({ width: element.offsetWidth, height: element.offsetHeight })
    const before = previousSize.current
    const after = size()
    const duration = motionDuration('panel')
    let animation: Animation | undefined
    if (before && duration && before.width && before.height && after.width && after.height &&
      (before.width !== after.width || before.height !== after.height)) {
      const bounds = element.getBoundingClientRect()
      animation = animatePanelLayout(element, {
        left: bounds.left, top: bounds.top,
        width: bounds.width * before.width / after.width,
        height: bounds.height * before.height / after.height,
      }, duration)
    }
    previousSize.current = after
    const observer = new ResizeObserver(() => { previousSize.current = size() })
    observer.observe(element)
    return () => {
      observer.disconnect()
      animation?.cancel()
    }
  }, [tabs.length])
  useLayoutEffect(() => {
    scrollActiveTabIntoView(panel.current?.querySelector<HTMLElement>('[role="tablist"]') ?? null)
  }, [active, tabs.length])
  return <section {...props} ref={panel} className={classes} aria-label="Puzzle insights">
    <div className="desktop-insight-toolbar">
      <div ref={tabListRef} className="desktop-insight-tabs" role="tablist" aria-label="Puzzle insight tabs"
        onKeyDown={event => {
          if (tabs.length < 2 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const index = tabs.findIndex(tab => tab.id === active)
          const step = event.key === 'ArrowLeft' ? -1 : 1
          const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
            : (index + step + tabs.length) % tabs.length
          const next = tabs[nextIndex].id
          onSelect(next)
          event.currentTarget.querySelector<HTMLButtonElement>(`[data-insight-tab="${next}"]`)?.focus()
        }}>
        {tabs.map(({ id, label }) => <button type="button" key={id} role="tab" data-insight-tab={id}
          id={`desktop-insight-tab-${id}`} aria-controls="desktop-insight-content"
          aria-selected={active === id} tabIndex={active === id ? 0 : -1}
          onClick={() => onSelect(id)}>{label}</button>)}
      </div>
      <IconButton type="button" variant="quiet" className="desktop-insight-close"
        aria-label={`Close ${selected?.label.toLowerCase() ?? 'insight'} tab`} onClick={onClose}>
        <X size={18} aria-hidden="true" />
      </IconButton>
    </div>
    <div className="desktop-insight-body" id="desktop-insight-content" role="tabpanel"
      aria-labelledby={`desktop-insight-tab-${active}`}>{content}</div>
  </section>
}

/** Put a hint card in the standard desktop or mobile hint slot. */
export function PlayHint({ mobile, panelRef, className, ...props }: ComponentProps<'div'> & {
  mobile: boolean; panelRef?: Ref<HTMLDivElement>
}) {
  const classes = ['hint-dock', mobile && 'workspace-controls mobile-hint-panel', className].filter(Boolean).join(' ')
  return <div {...props} className={classes} ref={panelRef} aria-live="polite" />
}

/** Use for the standard keypad action menu trigger. */
export function PlayActionsButton({ mobile, open, ...props }: Omit<ComponentProps<typeof IconButton>, 'aria-label'> & {
  mobile: boolean; open: boolean
}) {
  return <IconButton {...props} className="actions-key" aria-label="Actions" aria-expanded={open}
    aria-controls={open ? (mobile ? 'mobile-actions-menu' : 'input-actions-menu') : undefined}
    aria-haspopup={mobile ? 'dialog' : undefined}>
    <ListChecks size={20} aria-hidden="true" />
  </IconButton>
}
