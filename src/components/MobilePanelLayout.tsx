import { IconButton } from './Button'
import { Component, Fragment, type CSSProperties, type ReactNode, type RefCallback, type RefObject, useId, useMemo, useRef } from 'react'
import { GripVertical, X } from 'lucide-react'
import { MobileHintSwipe, type HintSwipeActions } from './MobileHintSwipe'
import { MobilePuzzleTopSpaceGesture, type PuzzleGestureAnchors } from './MobilePuzzleTopSpaceGesture'
import { MobileInputResizeHandle, type MobileInputResizeRefs } from './MobileInputResizeHandle'
import { useMobilePanelArrangement } from './useMobilePanelArrangement'
import { useMobilePuzzleFit } from './useMobilePuzzleFit'
import { animatePanelLayout, MotionSurface, motionDuration, usePresentContent } from './Presence'
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
  withHint: boolean
  tabCount: number
  rearranging: boolean
  children: ReactNode
}
type LayoutSnapshot = {
  duration: number
  cards: { element: HTMLElement; rect: DOMRect; anchorX: 'center' | 'left' }[]
  hint?: { element: HTMLElement; left: number; top: number; width: number }
}

class MobilePanelMotion extends Component<MotionProps, Record<string, never>, LayoutSnapshot | null> {
  private animations: Animation[] = []

  // Measure the currently visible cards before React changes the grid or flex layout.
  getSnapshotBeforeUpdate(previous: MotionProps): LayoutSnapshot | null {
    const { panelContent, hintPanel, withHint, tabCount, rearranging } = this.props
    const hintChanged = previous.withHint !== withHint
    const tabsChanged = previous.tabCount !== tabCount
    if ((!hintChanged && !tabsChanged) || previous.rearranging || rearranging) return null
    const duration = motionDuration(tabsChanged ? 'panel' : 'standard')
    if (!duration) return null

    const cards = (['puzzle', 'input'] as const).flatMap((id) => {
      const element = panelContent.current[id]
      return element ? [{ element, rect: element.getBoundingClientRect(), anchorX: id === 'puzzle' ? 'center' as const : 'left' as const }] : []
    })
    const hint = hintChanged && !withHint ? hintPanel.current : null
    return { duration, cards, hint: hint ? {
      element: hint, left: hint.offsetLeft, top: hint.offsetTop, width: hint.getBoundingClientRect().width,
    } : undefined }
  }

  componentDidUpdate(previous: MotionProps, _state: unknown, snapshot?: LayoutSnapshot | null) {
    const { hintPanel, withHint, rearranging } = this.props
    if (snapshot || previous.rearranging !== rearranging) this.cancelAnimations()

    const hint = previous.withHint !== withHint ? hintPanel.current : null
    if (withHint && hint) {
      for (const property of ['--hint-exit-left', '--hint-exit-top', '--hint-exit-width', '--hint-exit-visibility']) {
        hint.style.removeProperty(property)
      }
    }
    if (!snapshot) return

    // Let the other cards move immediately while the outgoing hint fades in its old slot.
    if (snapshot.hint) {
      const { element, left, top, width } = snapshot.hint
      element.style.setProperty('--hint-exit-left', `${left}px`)
      element.style.setProperty('--hint-exit-top', `${top}px`)
      element.style.setProperty('--hint-exit-width', `${width}px`)
      element.style.setProperty('--hint-exit-visibility', 'visible')
    }

    for (const { element, rect, anchorX } of snapshot.cards) {
      if (!element.isConnected) continue
      const animation = animatePanelLayout(element, rect, snapshot.duration, anchorX)
      if (animation) this.animations.push(animation)
    }
  }

  private cancelAnimations() {
    this.animations.forEach((animation) => animation.cancel())
    this.animations = []
  }

  componentWillUnmount() { this.cancelAnimations() }

  render() { return this.props.children }
}

export function MobilePanelLayout(props: Props) {
  const arrangement = useMobilePanelArrangement({ panels: props.panels, rearranging: props.rearranging,
    onRearrangingChange: props.onRearrangingChange, blocked: props.blocked, puzzleId: props.puzzleId })
  const { order, visibleIds: visible, dragView, announcement, saveFailed } = arrangement
  const root = arrangement.rootRef
  const localPageRef = useRef<HTMLElement>(null)
  const pageRef = props.pageRef ?? localPageRef
  const panelContentElements = useRef<Partial<Record<MobilePanelId, HTMLDivElement | null>>>({})
  const panelContentCallbacks = useRef<Partial<Record<MobilePanelId, RefCallback<HTMLDivElement>>>>({})
  const panelRefCallbacks = useRef<Partial<Record<MobilePanelId, RefCallback<HTMLDivElement>>>>({})
  const puzzlePanelRef = useRef<HTMLDivElement>(null)
  const inputPanelRef = useRef<HTMLDivElement>(null)
  const hintPanelRef = useRef<HTMLDivElement>(null)
  const gapRef = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const closeButton = arrangement.closeButtonRef
  const { content: hint, exiting: hintExiting } = usePresentContent(props.panels.hint)
  const panels = { ...props.panels, hint: hint || undefined }
  const panelRef = (id: MobilePanelId) => panelRefCallbacks.current[id] ??= element => {
    arrangement.panelRef(id)(element)
    if (id === 'puzzle') puzzlePanelRef.current = element
    else if (id === 'input') inputPanelRef.current = element
    else if (id === 'hint') hintPanelRef.current = element
  }
  const panelContentRef = (id: MobilePanelId) => panelContentCallbacks.current[id] ??= (element) => { panelContentElements.current[id] = element }
  const { inputResizing, updateInputResizing, fitAfterResize } = useMobilePuzzleFit({
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
    inputTabCount: props.inputTabCount,
    inputResizeRefs: props.inputResizeRefs,
    rearranging: props.rearranging,
    withHint: props.withHint,
    fitContent: props.fitContent,
  })
  const puzzleGestureAnchors = useMemo(() => props.inputResizeRefs ? ({
    layout: root, page: pageRef, panel: puzzlePanelRef, gap: gapRef,
    puzzle: props.inputResizeRefs.puzzle,
    boardViewport: props.inputResizeRefs.boardViewport, boardFrame: props.inputResizeRefs.boardFrame,
  }) : undefined, [props.inputResizeRefs])

  const layout = <div ref={root} className={`mobile-panel-layout${props.withHint ? ' with-hint' : ''}`}
    data-fit-content={(props.withHint || props.fitContent) && !props.rearranging || undefined}
    data-puzzle-shrunk={Boolean(props.puzzleShrink) || undefined}
    data-input-resizing={inputResizing || undefined}
    data-rearranging={props.rearranging || undefined} style={{ '--mobile-secondary-count': visible.length - 1 } as CSSProperties}
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
      const index = visible.indexOf(id)
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
            {resizeEdge && props.inputResizeRefs && <MobileInputResizeHandle inputId={inputId} layoutRef={root} inputPanelRef={inputPanelRef}
              refs={props.inputResizeRefs} edge={resizeEdge}
              disabled={props.blocked || props.rearranging} withHint={props.withHint}
              fitContent={Boolean(props.fitContent)}
              hasOpenTabs={Boolean(props.inputTabCount)} savedHeight={props.savedInputHeight}
              onHeightChange={props.onInputHeightChange} onResizingChange={updateInputResizing}
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
        {index === 0 && visible.length > 1 && <div ref={gapRef} className="mobile-panel-gap" aria-hidden="true">
          {id === 'puzzle' && <MobilePuzzleTopSpaceGesture edge="bottom" value={props.puzzleTopSpace ?? 0} shrink={props.puzzleShrink ?? 0}
            onChange={props.onPuzzleTopSpaceChange} disabled={props.blocked || props.rearranging}
            fitContent={props.withHint || Boolean(props.fitContent)} anchors={puzzleGestureAnchors} />}
        </div>}
      </Fragment>
    })}
    <span className="sr-only" role="status">{announcement}</span>
  </div>

  return <MobilePanelMotion panelContent={panelContentElements} hintPanel={hintPanelRef} withHint={props.withHint} tabCount={props.inputTabCount ?? 0}
    rearranging={props.rearranging}>{layout}</MobilePanelMotion>
}
