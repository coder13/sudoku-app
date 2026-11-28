import { IconButton } from './Button'
import { Component, Fragment, type CSSProperties, type ReactNode, type RefCallback, type RefObject, useId, useMemo, useRef, useState } from 'react'
import { GripVertical, X } from 'lucide-react'
import { MobileHintSwipe, type HintSwipeActions } from './MobileHintSwipe'
import { MobilePuzzleTopSpaceGesture, type PuzzleGestureAnchors } from './MobilePuzzleTopSpaceGesture'
import { MobileInputResizeHandle, type MobileInputResizeRefs } from './MobileInputResizeHandle'
import { useMobilePanelArrangement } from './useMobilePanelArrangement'
import { useMobilePuzzleFit } from './useMobilePuzzleFit'
import { animatePanelLayout, MotionSurface, motionDuration, usePresentContent } from './Presence'
import { mergeRefs } from './merge-refs'
import { type MobilePanelId } from '../sudoku/mobile-panels'
import type { PlayLayoutAnchors } from './play-layout-anchors'

type Panel = { title: string; content: ReactNode }
type Props = {
  panels: Partial<Record<MobilePanelId, Panel>>
  pageRef?: PlayLayoutAnchors['page']
  workspaceRef?: PlayLayoutAnchors['workspace']
  rearranging: boolean
  onRearrangingChange: (active: boolean) => void
  blocked: boolean
  puzzleId: string
  withHint: boolean
  hintInTabs?: boolean
  fitContent?: boolean
  resizableInput?: boolean
  inputTabCount?: number
  savedInputHeight?: number
  onInputHeightChange?: (height: number | undefined) => void
  inputResizeRefs?: MobileInputResizeRefs
  puzzleTopSpace?: number
  puzzleShrink?: number
  onPuzzleTopSpaceChange?: (space: number, shrink: number) => void
  hintSwipe?: HintSwipeActions
}
type MotionProps = {
  panelContent: RefObject<Partial<Record<MobilePanelId, HTMLDivElement | null>>>
  hintPanel: RefObject<HTMLDivElement | null>
  inputToolbar: RefObject<HTMLDivElement | null>
  inputPanels: RefObject<HTMLDivElement | null>
  onHintLayoutChange: () => void
  withHint: boolean
  tabCount: number
  rearranging: boolean
  children: ReactNode
}
type LayoutSnapshot = {
  duration: number
  cards: { element: HTMLElement; rect: DOMRect; anchorX: 'center' | 'left' }[]
  expandInputToolbar?: boolean
  inputBodyMinHeight?: number
  hintEntering?: boolean
  hint?: { element: HTMLElement; height: number }
}

class MobilePanelMotion extends Component<MotionProps, Record<string, never>, LayoutSnapshot | null> {
  private animations: Animation[] = []
  private animationCleanups = new Set<() => void>()

  // Measure the currently visible cards before React changes the grid or flex layout.
  getSnapshotBeforeUpdate(previous: MotionProps): LayoutSnapshot | null {
    const { panelContent, hintPanel, withHint, tabCount, rearranging } = this.props
    const hintChanged = previous.withHint !== withHint
    const tabsChanged = previous.tabCount !== tabCount
    const firstTabOpened = previous.tabCount === 0 && tabCount > 0
    const lastTabClosed = previous.tabCount > 0 && tabCount === 0
    const animateTabs = tabsChanged && !firstTabOpened && !lastTabClosed

    if (firstTabOpened && !hintChanged) {
      if (previous.rearranging || rearranging) return null
      const duration = motionDuration('tabs')
      const body = this.props.inputPanels.current
      const zoom = body ? Number.parseFloat(getComputedStyle(body).zoom) || 1 : 1
      return {
        duration,
        cards: [],
        expandInputToolbar: duration > 0,
        inputBodyMinHeight: body ? body.getBoundingClientRect().height / zoom : undefined,
      }
    }

    if ((!hintChanged && !animateTabs) || previous.rearranging || rearranging) return null
    const duration = motionDuration(tabsChanged || hintChanged ? 'tabs' : 'standard')
    if (!duration) return null

    const hintEntering = hintChanged && withHint
    const cards = (hintEntering ? [] : ['puzzle', 'input'] as const).flatMap((id) => {
      if ((firstTabOpened || lastTabClosed) && id === 'input') return []
      const element = panelContent.current[id]
      return element ? [{ element, rect: element.getBoundingClientRect(), anchorX: id === 'puzzle' ? 'center' as const : 'left' as const }] : []
    })
    const hint = hintChanged && !withHint ? hintPanel.current : null
    const body = firstTabOpened ? this.props.inputPanels.current : null
    const zoom = body ? Number.parseFloat(getComputedStyle(body).zoom) || 1 : 1
    return { duration, cards, hintEntering: hintEntering || undefined, expandInputToolbar: firstTabOpened || undefined,
      inputBodyMinHeight: body ? body.getBoundingClientRect().height / zoom : undefined,
      hint: hint ? { element: hint, height: hint.getBoundingClientRect().height } : undefined }
  }

  componentDidUpdate(previous: MotionProps, _state: unknown, snapshot?: LayoutSnapshot | null) {
    const { hintPanel, withHint, rearranging } = this.props
    if (snapshot || previous.rearranging !== rearranging || previous.tabCount !== this.props.tabCount) this.cancelAnimations()

    const inputPanels = this.props.inputPanels.current
    if (previous.tabCount === 0 && this.props.tabCount > 0 && inputPanels && snapshot?.inputBodyMinHeight !== undefined) {
      inputPanels.style.setProperty('--mobile-input-tab-body-min-height', `${snapshot.inputBodyMinHeight}px`)
    }

    const hint = previous.withHint !== withHint ? hintPanel.current : null
    if (withHint && hint) {
      hint.style.removeProperty('block-size')
      hint.style.removeProperty('overflow')
    }
    if (!snapshot) return

    if (snapshot.hintEntering && hint?.isConnected) {
      const height = hint.getBoundingClientRect().height
      if (height > 0) {
        const previousBlockSize = hint.style.blockSize
        const previousOverflow = hint.style.overflow
        const easing = getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim()
        hint.style.blockSize = '0px'
        hint.style.overflow = 'clip'
        // Commit the collapsed start, then fit the puzzle from that same live
        // geometry before the browser paints the first expanded frame.
        void hint.offsetHeight
        this.props.onHintLayoutChange()
        const animation = hint.animate([
          { blockSize: '0px' },
          { blockSize: `${height}px` },
        ], { duration: snapshot.duration, easing, fill: 'both' })
        this.trackAnimation(animation, () => {
          animation.cancel()
          hint.style.blockSize = previousBlockSize
          hint.style.overflow = previousOverflow
        })
      }
    }

    // Keep the outgoing hint in normal flow so the puzzle fitter can follow
    // the same shrinking box instead of treating the hint as already gone.
    if (snapshot.hint) {
      const { element, height } = snapshot.hint
      const easing = getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim()
      element.style.overflow = 'clip'
      const animation = element.animate([
        { blockSize: `${height}px` },
        { blockSize: '0px' },
      ], { duration: snapshot.duration, easing, fill: 'both' })
      this.trackAnimation(animation, () => {
        animation.cancel()
        element.style.blockSize = '0px'
        element.style.overflow = 'clip'
      })
    }

    if (snapshot.expandInputToolbar && snapshot.duration > 0) {
      const element = this.props.inputToolbar.current
      if (element?.isConnected) {
        const style = getComputedStyle(element)
        const height = element.getBoundingClientRect().height
        const previousOverflow = element.style.overflow
        const easing = getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim()
        element.style.overflow = 'clip'
        const animation = element.animate([
          { height: '0px', minHeight: '0px', paddingBlockStart: '0px', paddingBlockEnd: '0px',
            borderBottomWidth: '0px', opacity: '0', translate: '0 10px' },
          { height: `${height}px`, minHeight: style.minHeight, paddingBlockStart: style.paddingBlockStart,
            paddingBlockEnd: style.paddingBlockEnd, borderBottomWidth: style.borderBottomWidth,
            opacity: '1', translate: '0 0' },
        ], { duration: snapshot.duration, easing, fill: 'both' })
        this.trackAnimation(animation, () => {
          animation.cancel()
          element.style.overflow = previousOverflow
        })
      }
    }

    for (const { element, rect, anchorX } of snapshot.cards) {
      if (!element.isConnected) continue
      const animation = animatePanelLayout(element, rect, snapshot.duration, anchorX)
      this.trackAnimation(animation)
    }
  }

  private trackAnimation(animation: Animation | undefined, cleanup?: () => void) {
    if (!animation) {
      cleanup?.()
      return
    }
    this.animations.push(animation)

    let active = true
    const restore = () => {
      if (!active) return
      active = false
      cleanup?.()
      this.animations = this.animations.filter((current) => current !== animation)
      this.animationCleanups.delete(restore)
    }
    this.animationCleanups.add(restore)
    animation.addEventListener('finish', restore, { once: true })
    animation.addEventListener('cancel', restore, { once: true })
  }

  private cancelAnimations() {
    this.animations.forEach((animation) => animation.cancel())
    this.animations = []
    this.animationCleanups.forEach((cleanup) => cleanup())
    this.animationCleanups.clear()
  }

  componentWillUnmount() { this.cancelAnimations() }

  render() { return this.props.children }
}

export function MobilePanelLayout(props: Props) {
  const arrangement = useMobilePanelArrangement({ panels: props.panels, rearranging: props.rearranging,
    onRearrangingChange: props.onRearrangingChange, blocked: props.blocked, puzzleId: props.puzzleId })
  return <MobilePuzzlePanels key={props.puzzleId} {...props} arrangement={arrangement} />
}

function MobilePuzzlePanels({ arrangement, ...props }: Props & { arrangement: ReturnType<typeof useMobilePanelArrangement> }) {
  const { order, dragView, announcement, saveFailed } = arrangement
  const root = arrangement.rootRef
  const [layoutElement, setLayoutElement] = useState<HTMLDivElement | null>(null)
  const layoutRef = useMemo(() => mergeRefs(root, setLayoutElement), [root])
  const localPageRef = useRef<HTMLElement>(null)
  const pageRef = props.pageRef ?? localPageRef
  const panelContentElements = useRef<Partial<Record<MobilePanelId, HTMLDivElement | null>>>({})
  const panelContentCallbacks = useRef<Partial<Record<MobilePanelId, RefCallback<HTMLDivElement>>>>({})
  const panelRefCallbacks = useRef<Partial<Record<MobilePanelId, RefCallback<HTMLDivElement>>>>({})
  const puzzlePanelRef = useRef<HTMLDivElement>(null)
  const inputPanelRef = useRef<HTMLDivElement>(null)
  const hintPanelRef = useRef<HTMLDivElement>(null)
  const noToolbarRef = useRef<HTMLDivElement>(null)
  const gapRef = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const closeButton = arrangement.closeButtonRef
  const hintPresence = usePresentContent(props.panels.hint, 'tabs')
  // Pinning moves the hint into the input tab stack. It must not also linger
  // as an exiting card in the standalone panel.
  const hint = props.hintInTabs ? null : hintPresence.content
  const hintExiting = !props.hintInTabs && hintPresence.exiting
  const hintLayoutActive = props.withHint || hintExiting
  const panels = { ...props.panels, hint: hint || undefined }
  // Retained exit content still owns its layout position until its collapse ends.
  const layoutIds = order.filter((id) => panels[id])
  const panelRef = (id: MobilePanelId) => panelRefCallbacks.current[id] ??= element => {
    arrangement.panelRef(id)(element)
    if (id === 'puzzle') puzzlePanelRef.current = element
    else if (id === 'input') inputPanelRef.current = element
    else if (id === 'hint') hintPanelRef.current = element
  }
  const panelContentRef = (id: MobilePanelId) => panelContentCallbacks.current[id] ??= (element) => { panelContentElements.current[id] = element }
  const { inputResizing, updateInputResizing, fitAfterResize, previewResize } = useMobilePuzzleFit({
    layoutRef: root,
    pageRef,
    workspaceRef: props.workspaceRef,
    puzzlePanelRef,
    inputPanelRef,
    hintPanelRef,
    gapRef,
    order,
    puzzleId: props.puzzleId,
    puzzleShrink: props.puzzleShrink,
    inputResizeRefs: props.inputResizeRefs,
    rearranging: props.rearranging,
    withHint: hintLayoutActive,
    fitContent: props.fitContent,
  })
  const puzzleGestureAnchors = useMemo(() => props.inputResizeRefs ? ({
    layout: root, page: pageRef, panel: puzzlePanelRef, gap: gapRef,
    puzzle: props.inputResizeRefs.puzzle,
    boardViewport: props.inputResizeRefs.boardViewport, boardFrame: props.inputResizeRefs.boardFrame,
  }) : undefined, [props.inputResizeRefs])

  const layout = <div ref={layoutRef} className={`mobile-panel-layout${hintLayoutActive ? ' with-hint' : ''}`}
    data-fit-content={(hintLayoutActive || props.fitContent) && !props.rearranging || undefined}
    data-puzzle-shrunk={Boolean(props.puzzleShrink) || undefined}
    data-input-resizing={inputResizing || undefined}
    data-rearranging={props.rearranging || undefined} style={{ '--mobile-secondary-count': layoutIds.length - 1 } as CSSProperties}
    onPointerDownCapture={arrangement.startHold}
    onContextMenuCapture={arrangement.onContextMenuCapture}
    onClickCapture={arrangement.onClickCapture}>
    <MotionSurface>{props.rearranging && <div className="mobile-panel-toolbar surface" role="region" aria-label="Rearrange cards" data-panel-editor>
      <div><strong>Rearrange cards</strong><small id="mobile-panel-instructions">
        {saveFailed ? 'Order saved for this session only.' : 'Drag cards to move them. Changes save automatically.'}
      </small></div>
      <IconButton ref={closeButton} variant="quiet" aria-label="Finish rearranging cards" onClick={arrangement.exit}>
        <X size={22} aria-hidden="true" />
      </IconButton>
    </div>}</MotionSurface>
    {order.filter((id) => panels[id]).map((id) => {
      const panel = panels[id]!
      const exiting = id === 'hint' && hintExiting
      const index = layoutIds.indexOf(id)
      const moving = dragView?.id === id
      const drop = dragView?.drop?.id === id ? dragView.drop.edge : undefined
      const resizeEdge = id === 'input' && props.resizableInput && panels.puzzle
        ? order.indexOf('puzzle') < order.indexOf('input') ? 'top' : 'bottom'
        : undefined
      return <Fragment key={id}>
        <div ref={panelRef(id)}
          className={`mobile-panel${id === 'hint' ? ' motion-surface' : ''}`} data-mobile-panel={id} data-first={index === 0 || undefined}
          data-after-gap={index > 1 || undefined}
          id={id === 'input' ? inputId : undefined} data-resize-edge={resizeEdge}
          data-presence={id === 'hint' ? exiting ? 'exit' : 'open' : undefined} inert={exiting || undefined} aria-hidden={exiting || undefined}
          data-dragging={moving || undefined} data-drop={drop} role="group" aria-label={`${panel.title} card`}
          style={{
            '--mobile-panel-row': index,
            ...(moving ? { transform: `translate(${dragView.x}px, ${dragView.y}px)` } : {}),
          } as CSSProperties}>
          <div ref={panelContentRef(id)} className="mobile-panel-content" inert={props.rearranging} aria-hidden={props.rearranging || undefined}>
            {id === 'puzzle' && <MobilePuzzleTopSpaceGesture edge="top" value={props.puzzleTopSpace ?? 0} shrink={props.puzzleShrink ?? 0}
              onChange={props.onPuzzleTopSpaceChange} disabled={props.blocked || props.rearranging}
              fitContent={props.withHint || Boolean(props.fitContent)} anchors={puzzleGestureAnchors} />}
            {resizeEdge && props.inputResizeRefs && <MobileInputResizeHandle inputId={inputId} layoutElement={layoutElement} inputPanelRef={inputPanelRef}
              refs={props.inputResizeRefs} edge={resizeEdge}
              disabled={props.blocked || props.rearranging} withHint={props.withHint}
              fitContent={Boolean(props.fitContent)}
              savedHeight={props.savedInputHeight}
              onHeightChange={props.onInputHeightChange} onResizingChange={updateInputResizing}
              onResizePreview={previewResize}
              onResizeSettled={fitAfterResize} />}
            {id === 'hint' ? <MobileHintSwipe exiting={exiting}
              actions={exiting || props.rearranging || props.blocked ? undefined : props.hintSwipe}>
              {panel.content}
            </MobileHintSwipe> : panel.content}
          </div>
          {props.rearranging && <div className="mobile-panel-editor" data-panel-editor>
            <button type="button" className="mobile-panel-drag" aria-label={`Move ${panel.title.toLowerCase()} card`}
              aria-describedby="mobile-panel-instructions" onPointerDown={(event) => arrangement.startDrag(id, event)}
              onLostPointerCapture={(event) => arrangement.lostPointerCapture(id, event)}>
              <span><GripVertical size={18} aria-hidden="true" />{panel.title}</span>
            </button>
          </div>}
        </div>
        {index === 0 && layoutIds.length > 1 && <div ref={gapRef} className="mobile-panel-gap" aria-hidden="true">
          {id === 'puzzle' && <MobilePuzzleTopSpaceGesture edge="bottom" value={props.puzzleTopSpace ?? 0} shrink={props.puzzleShrink ?? 0}
            onChange={props.onPuzzleTopSpaceChange} disabled={props.blocked || props.rearranging}
            fitContent={props.withHint || Boolean(props.fitContent)} anchors={puzzleGestureAnchors} />}
        </div>}
      </Fragment>
    })}
    <span className="sr-only" role="status">{announcement}</span>
  </div>

  return <MobilePanelMotion panelContent={panelContentElements} hintPanel={hintPanelRef}
    inputToolbar={props.inputResizeRefs?.inputToolbar ?? noToolbarRef}
    inputPanels={props.inputResizeRefs?.inputPanels ?? noToolbarRef} withHint={props.withHint} tabCount={props.inputTabCount ?? 0}
    onHintLayoutChange={fitAfterResize} rearranging={props.rearranging}>{layout}</MobilePanelMotion>
}
