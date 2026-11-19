import { IconButton } from './Button'
import { type ReactNode, type Ref, useId } from 'react'
import { X } from 'lucide-react'

const labels = { digits: 'Digits', colors: 'Colors', chains: 'Chains' }
export type MobileInputTab = keyof typeof labels
export type MobileInputTool = Exclude<MobileInputTab, 'digits'>

/** Use in the mobile Worktable to share one input card between Digits and open solving tools. */
export function MobileInputTabs({ active, open, panels, activeTabRef, onSelect, onClose }: {
  active: MobileInputTab
  open: MobileInputTool[]
  panels: Record<MobileInputTab, ReactNode>
  activeTabRef: Ref<HTMLButtonElement>
  onSelect: (tab: MobileInputTab) => void
  onClose: (tab: MobileInputTool) => void
}) {
  const id = useId()
  const tabs = (['digits', 'colors', 'chains'] as const).filter((tab) => tab === 'digits' || open.includes(tab))
  const toolToClose = active === 'digits' ? open.at(0) : active

  return <div className={open.length ? 'surface mobile-input-tabs' : undefined}>
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
    <div className={open.length ? 'mobile-input-panels' : undefined}>
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
