import { type ReactNode, type Ref, useId, useLayoutEffect, useRef, useState } from 'react'
import { MoreHorizontal, Palette, X } from 'lucide-react'
import { IconButton } from './Button'

const labels = { digits: 'Digits', colors: 'Colors', chains: 'Chains' }
export type MobileInputTab = keyof typeof labels
export type MobileInputTool = Exclude<MobileInputTab, 'digits'>

function InputToolsMenu({ disabled, onOpen }: {
  disabled: boolean
  onOpen: (opener: HTMLButtonElement | null) => void
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
      const gap = 8
      const below = window.innerHeight - anchor.bottom - 2 * gap
      const above = anchor.top - 2 * gap
      const opensAbove = menu.scrollHeight > below && above > below
      menu.style.maxHeight = `${Math.max(0, opensAbove ? above : below)}px`
      menu.style.left = `${Math.max(gap, Math.min(anchor.right, window.innerWidth - gap) - menu.offsetWidth)}px`
      menu.style.top = `${Math.max(gap, opensAbove ? anchor.top - gap - menu.offsetHeight : anchor.bottom + gap)}px`
    }
    position()
    menu.querySelector('button')?.focus({ preventScroll: true })
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
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
      onToggle={event => setOpen(event.currentTarget.matches(':popover-open'))}
      onKeyDown={event => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        close()
      }}>
      <button type="button" onClick={() => { close(); onOpen(trigger.current) }}>
        <Palette size={17} aria-hidden="true" /> Colors &amp; Chains
      </button>
    </div>
  </div>
}

/** Show Digits and any open solving tools in the mobile input card. Worktable owns the saved tab selection. */
export function MobileInputTabs({ active, open, panels, activeTabRef, toolsDisabled, onOpenTools, onSelect, onClose }: {
  active: MobileInputTab
  open: MobileInputTool[]
  panels: Record<MobileInputTab, ReactNode>
  activeTabRef: Ref<HTMLButtonElement>
  toolsDisabled: boolean
  onOpenTools?: (opener: HTMLButtonElement | null) => void
  onSelect: (tab: MobileInputTab) => void
  onClose: (tab: MobileInputTool) => void
}) {
  const id = useId()
  const tabs = (['digits', 'colors', 'chains'] as const).filter((tab) => tab === 'digits' || open.includes(tab))
  const toolToClose = active === 'digits' ? open.at(0) : active
  const hasInputCard = Boolean(open.length || onOpenTools)

  return <div className={hasInputCard ? 'surface mobile-input-tabs' : undefined} data-tools-open={open.length > 0 || undefined}>
    {open.length > 0 && <div className="mobile-input-toolbar" data-no-panel-hold>
      <div role="tablist" aria-label="Sudoku input" className="mobile-input-tablist" onKeyDown={(event) => {
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
          {digits && onOpenTools && <InputToolsMenu disabled={toolsDisabled} onOpen={onOpenTools} />}
          {panels[tab]}
        </div>
      })}
    </div>
  </div>
}
