import { useEffect, useId, useState } from 'react'
import type { VariantRuleSection, VariantRuleSectionId } from '../sudoku/variants'
import { usePanelActivity } from './PanelActivity'

/** List the active Sudoku rule families and report the section a player is inspecting. */
export function VariantRules({ sections, active, onHighlight }: {
  sections: readonly VariantRuleSection[]
  active?: boolean
  onHighlight: (id: VariantRuleSectionId | null) => void
}) {
  const activity = usePanelActivity()
  const isActive = active ?? activity === 'active'
  const headingId = useId()
  const [hovered, setHovered] = useState<VariantRuleSectionId | null>(null)
  const [focused, setFocused] = useState<VariantRuleSectionId | null>(null)
  const highlighted = isActive ? hovered ?? focused : null

  useEffect(() => {
    onHighlight(highlighted)
    return () => onHighlight(null)
  }, [highlighted, onHighlight])

  useEffect(() => {
    if (isActive) return
    setHovered(null)
    setFocused(null)
  }, [isActive])

  return <div className="variant-rules-copy variant-rule-list">
    {sections.map(({ id, title, descriptions }) => <section key={id} className="variant-rule-section"
      aria-labelledby={`${headingId}-${id}`} tabIndex={0} data-rule-active={id === highlighted || undefined}
      onPointerEnter={(event) => { if (event.pointerType !== 'touch') setHovered(id) }}
      onPointerLeave={() => setHovered(current => current === id ? null : current)}
      onFocus={() => setFocused(id)} onBlur={() => setFocused(current => current === id ? null : current)}
      onClick={(event) => event.currentTarget.focus({ preventScroll: true })}>
      <h3 id={`${headingId}-${id}`}>{title}</h3>
      {descriptions.map(description => <p key={description}>{description}</p>)}
    </section>)}
  </div>
}
