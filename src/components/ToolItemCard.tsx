import { Eye, EyeOff, Pencil, Trash2 } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { IconButton } from './Button'

type CardAction = { label: string; disabled?: boolean; onClick: () => void }

type Props = {
  name: string
  typeLabel?: string
  subtitle?: { text: string; description: string }
  colors: readonly string[]
  selected: boolean
  hidden?: boolean
  onSelect: () => void
  edit?: CardAction & { pressed?: boolean }
  visibility: CardAction
  remove: CardAction
  descriptionId?: string
  summary?: ReactNode
  editor?: { label: string; content: ReactNode }
}

/** Render a selectable Play tool item in a list, with board visibility and removal actions. */
export function ToolItemCard({
  name, typeLabel, subtitle, colors, selected, hidden, onSelect, edit, visibility, remove, descriptionId, summary, editor,
}: Props) {
  const typeId = useId()
  const subtitleId = `${typeId}-subtitle`
  const description = [typeLabel ? typeId : undefined, subtitle ? subtitleId : undefined, descriptionId].filter(Boolean).join(' ') || undefined
  const VisibilityIcon = hidden ? EyeOff : Eye

  return <li className="tool-item-card" data-active={selected || undefined} data-hidden={hidden || undefined}
    onClick={event => {
      if (!selected && event.target instanceof Element && !event.target.closest('button')) onSelect()
    }}>
    <div className="tool-item-header">
      <div className="tool-item-main">
        <button type="button" className="tool-item-select" aria-label={name} aria-describedby={description}
          aria-pressed={selected} onClick={onSelect}>
          <span className="tool-item-label">
            <span className="tool-item-swatches" aria-hidden="true">
              {colors.map((color, index) => <i key={index} style={{ backgroundColor: color }} />)}
            </span>
            <span className="tool-item-text">
              <span className="tool-item-heading">
                <span className="tool-item-name">{name}</span>
                {typeLabel && <span id={typeId} className="tool-item-type" title={typeLabel}>{typeLabel}</span>}
              </span>
              {subtitle && <>
                <span className="tool-item-subtitle" aria-hidden="true">{subtitle.text}</span>
                <span className="sr-only" id={subtitleId}>{subtitle.description}</span>
              </>}
            </span>
          </span>
        </button>
        {!selected && summary}
      </div>
      {edit && <IconButton variant="quiet" aria-label={edit.label} title={edit.label}
        disabled={edit.disabled} aria-pressed={edit.pressed} onClick={edit.onClick}>
        <Pencil size={16} aria-hidden="true" />
      </IconButton>}
      <IconButton variant="quiet" aria-label={visibility.label} title={visibility.label}
        disabled={visibility.disabled} onClick={visibility.onClick}>
        <VisibilityIcon size={16} aria-hidden="true" />
      </IconButton>
      <IconButton variant="quiet" aria-label={remove.label} title={remove.label}
        disabled={remove.disabled} onClick={remove.onClick}>
        <Trash2 size={16} aria-hidden="true" />
      </IconButton>
    </div>
    {selected && editor && <div className="tool-item-editor" role="group" aria-label={editor.label}>
      {editor.content}
    </div>}
  </li>
}
