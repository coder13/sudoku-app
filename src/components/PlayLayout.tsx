import { type ComponentProps, type ReactNode, type Ref } from 'react'
import { ListChecks, X } from 'lucide-react'
import { IconButton } from './Button'
import { MobilePanelLayout } from './MobilePanelLayout'
import { MotionSurface } from './Presence'

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
    <div className="standard-puzzle-stack">
      {puzzle}
      <div className="standard-hint-slot" data-open={Boolean(hint)}>
        <div><MotionSurface>{hint}</MotionSurface></div>
      </div>
    </div>
    <div className="standard-input-stack" id="standard-digit-input">
      {input}
      <MotionSurface>{insights && <PlayInsights {...insights} />}</MotionSurface>
    </div>
  </>
}

function PlayInsights<Id extends string>({ tabs, active, content, onSelect, onClose, tabListRef, className, ...props }:
  Insights<Id> & Omit<ComponentProps<'section'>, keyof Insights<Id>>) {
  const selected = tabs.find(tab => tab.id === active)
  const classes = ['desktop-insight-panel', className].filter(Boolean).join(' ')
  return <section {...props} className={classes} aria-label="Puzzle insights">
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
