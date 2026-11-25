import type { ChangeEvent, ReactNode } from 'react'

/** Render a checkbox setting with the shared title and optional detail layout. */
export function SettingToggle({ label, description, checked, onChange, disabled = false, className = 'advanced-toggle',
  labelId, descriptionId, leading }: {
  label: string
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  labelId?: string
  descriptionId?: string
  leading?: ReactNode
}) {
  return <label className={className}>
    <input type="checkbox" checked={checked} disabled={disabled} aria-labelledby={labelId}
      aria-describedby={descriptionId}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)} />
    {leading}
    <span><strong id={labelId}>{label}</strong>{description != null && <small id={descriptionId}>{description}</small>}</span>
  </label>
}
