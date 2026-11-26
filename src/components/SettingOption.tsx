import type { ReactNode } from 'react'

/** Render a labeled radio option while the owning group keeps its selection state. */
export function SettingOption({ name, value, label, description, checked, onSelect, className }: {
  name: string
  value: string
  label: string
  description?: ReactNode
  checked: boolean
  onSelect: () => void
  className?: string
}) {
  return <label className={className}>
    <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} />
    <span><strong>{label}</strong>{description != null && <small>{description}</small>}</span>
  </label>
}
