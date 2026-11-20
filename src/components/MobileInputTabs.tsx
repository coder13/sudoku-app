import { type ReactNode, type Ref, useId, useLayoutEffect, useRef, useState } from 'react'
import { MoreHorizontal, X } from 'lucide-react'
import { IconButton } from './Button'
import { scrollActiveTabIntoView } from './PlayLayout'
import { TOOL_PANEL_ORDER, type ToolPanelTab, type PuzzleTool } from '../sudoku/play-session'
import { TECHNIQUE_FINDER_TITLE } from '../sudoku/puzzle-analysis'

const labels = { digits: 'Digits', solution: 'Solution', techniques: TECHNIQUE_FINDER_TITLE, colors: 'Colors', chains: 'Chains', subsets: 'Subsets' }

function InputToolsMenu({ disabled, onShow, children }: {
  disabled: boolean
  onShow?: (opener: HTMLButtonElement) => void
  children: ReactNode
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const button = trigger.current
    const menu = popup.current
    if (!open || !button || !menu) return
    const position = () => {
      const anchor = button.getBoundingClientRect()
      const inset = 8
      const below = window.innerHeight - anchor.bottom - inset
      const menuBottom = Math.min(anchor.bottom, window.innerHeight)
      const above = menuBottom - inset
      const minMenuHeight = 64
      const opensAbove = above >= minMenuHeight || above >= below
      menu.style.maxHeight = `${Math.max(0, opensAbove ? above : below)}px`
      menu.style.left = `${Math.max(inset, Math.min(anchor.right, window.innerWidth - inset) - menu.offsetWidth)}px`
      menu.style.top = opensAbove ? 'auto' : `${Math.max(inset, anchor.bottom)}px`
      menu.style.bottom = opensAbove ? `${window.innerHeight - menuBottom}px` : 'auto'
    }
    position()
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
    // Keep the open menu in place while its toggles move the input card.
    window.addEventListener('resize', position)
    return () => {
      window.removeEventListener('resize', position)
      menu.removeAttribute('style')
    }
  }, [open])

  function close() {
    popup.current?.hidePopover()
    trigger.current?.focus({ preventScroll: true })
  }

  return <div className="input-tools" data-no-panel-hold>
    <IconButton variant="quiet" ref={trigger} title="Input tools" aria-label="Input tools"
      disabled={disabled} aria-expanded={open} popoverTarget={id}>
      <MoreHorizontal size={19} aria-hidden="true" />
    </IconButton>
    <div ref={popup} className="app-menu input-tools-menu" id={id} role="group" aria-label="Input tools" popover="auto"
      onToggle={event => {
        const shown = event.currentTarget.matches(':popover-open')
        setOpen(shown)
        if (shown && trigger.current) onShow?.(trigger.current)
      }}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key !== 'Escape') return
        event.preventDefault()
        close()
      }}>
      {children}
    </div>
  </div>
}

/** Show Digits and any open solving tools in the mobile input card. Worktable owns the saved tab selection. */
export function MobileInputTabs({ active, open, panels, activeTabRef, toolsDisabled, toolToggles, onShowTools, onSelect, onClose }: {
  active: ToolPanelTab
  open: PuzzleTool[]
  panels: Record<ToolPanelTab, ReactNode>
  activeTabRef: Ref<HTMLButtonElement>
  toolsDisabled: boolean
  toolToggles?: ReactNode
  onShowTools?: (opener: HTMLButtonElement) => void
  onSelect: (tab: ToolPanelTab) => void
  onClose: (tab: PuzzleTool) => void
}) {
  const id = useId()
  const visibleTools = TOOL_PANEL_ORDER.filter(tool => open.includes(tool))
  const tabs = ['digits', ...visibleTools] as const
  const toolToClose = active === 'digits' ? visibleTools.at(0) : active
  const hasInputCard = Boolean(open.length || toolToggles)
  const tabList = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { scrollActiveTabIntoView(tabList.current) }, [active, tabs.length])

  return <div className={hasInputCard ? 'surface mobile-input-tabs' : undefined} data-tools-open={open.length > 0 || undefined}>
    {hasInputCard && <div className={open.length ? 'mobile-input-toolbar' : 'mobile-input-menu-slot'} data-no-panel-hold>
      {open.length > 0 && (
        <div ref={tabList} role="tablist" aria-label="Sudoku input" className="mobile-input-tablist" onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const step = event.key === 'ArrowLeft' ? -1 : 1
          const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
            : (tabs.indexOf(active) + step + tabs.length) % tabs.length
          onSelect(tabs[index])
          event.currentTarget.querySelectorAll('button')[index]?.focus({ preventScroll: true })
        }}>
          {tabs.map((tab) => <button type="button" key={tab} ref={active === tab ? activeTabRef : undefined}
            id={`${id}-tab-${tab}`} role="tab" aria-selected={active === tab} aria-controls={`${id}-panel-${tab}`}
            tabIndex={active === tab ? 0 : -1} onClick={() => onSelect(tab)}>{labels[tab]}</button>)}
        </div>
      )}
      {toolToggles && <InputToolsMenu disabled={toolsDisabled} onShow={onShowTools}>{toolToggles}</InputToolsMenu>}
      {toolToClose && <IconButton variant="quiet" className="mobile-input-close"
        aria-label={`Close ${labels[toolToClose].toLowerCase()} panel`} onClick={() => onClose(toolToClose)}>
        <X size={20} aria-hidden="true" />
      </IconButton>}
    </div>}
    <div className={hasInputCard ? 'mobile-input-panels' : undefined}>
      {tabs.map((tab) => {
        const digits = tab === 'digits'
        const selected = tab === active
        return <div key={tab} id={open.length ? `${id}-panel-${tab}` : undefined}
          role={open.length ? 'tabpanel' : undefined} aria-labelledby={open.length ? `${id}-tab-${tab}` : undefined}
          className={digits ? 'mobile-input-digits' : 'mobile-input-tool'} hidden={!digits && !selected} inert={!selected}
          tabIndex={!digits && selected ? 0 : undefined} data-no-panel-hold={!digits || undefined}>
          {panels[tab]}
        </div>
      })}
    </div>
  </div>
}
