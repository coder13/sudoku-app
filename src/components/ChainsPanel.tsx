import { ArrowLeft, ArrowRight, Eraser, Eye, EyeOff, Link2, MoreHorizontal, Palette, Plus, RotateCw, Trash2, Undo2 } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { Deduction, DeductionAction } from '../sudoku/engine'
import { chainColor, chainPairIndex, type ChainColor } from '../sudoku/chain-sketch'
import { chainCandidate, type LinkStrength } from '../sudoku/chains'
import { cellReference, techniqueLabel, type CellReferenceOptions } from '../sudoku/hints'
import { cellName, deductionResults } from '../sudoku/lesson-diagram'
import { shortcutLabel, type ShortcutPreferences } from '../sudoku/shortcuts'
import { techniqueActionKey } from '../sudoku/technique-progress'
import type { BoardLink } from './BoardAnnotations'
import { Button, IconButton } from './Button'
import { Modal } from './Modal'
import type { useChainSketch } from './useChainSketch'
import { usePlayPreference } from './usePlayPreference'

type ChainInspection = CellReferenceOptions & { deduction: Deduction; links: readonly BoardLink[]; explanation?: string }
type Props = {
  sketch: ReturnType<typeof useChainSketch>
  onApply: () => void
  applyFailed: boolean
  onToggleDrawing: () => void
  onChooseColors: () => void
  shortcuts: Pick<ShortcutPreferences, 'chainDrawing' | 'applyEdits'>
  compact?: boolean
  strongLinks?: { shown: boolean; hasHighlights: boolean; count: number; toggle: () => void }
  unavailable?: string
  inspection?: ChainInspection
}

function pointName(point: BoardLink['from'], nameCell = cellName) {
  if ('cells' in point) return `${point.digit} in ${point.cells.map(nameCell).join(' or ')}`
  if ('candidates' in point) return point.candidates.map(({ cell, digit }) => `${digit} in ${nameCell(cell)}`).join(' or ')
  return `${point.digit} in ${nameCell(point.cell)}`
}

function compactPath(nodes: readonly number[], strengths: readonly LinkStrength[]) {
  return nodes.map((id, i) => {
    const { cell, digit } = chainCandidate(id)
    const candidate = `${digit}${cellName(cell).toLowerCase()}`
    return i === 0 ? candidate : `${strengths[i - 1] === 'strong' ? '=' : '−'} ${candidate}`
  }).join(' ')
}

function LinkLegend({ notation = false }: { notation?: boolean }) {
  return <div className="chain-legend" aria-label="Link styles">
    <span><i aria-hidden="true" />Strong{notation && <code>=</code>}</span>
    <span><i className="weak-link" aria-hidden="true" />Weak{notation && <code>−</code>}</span>
  </div>
}

export function ChainSwatches({ first, second }: { first: ChainColor; second: ChainColor }) {
  return <span className="chain-swatches" aria-hidden="true">
    <i style={{ backgroundColor: chainColor(first) }} />
    <i style={{ backgroundColor: chainColor(second) }} />
  </span>
}

export function ChainColorsDialog({ open, first, second, onSelect, onClose, onEdit }: {
  open: boolean; first: ChainColor; second: ChainColor
  onSelect: (first: ChainColor, second: ChainColor) => void
  onClose: () => void; onEdit?: () => void
}) {
  const [pairs] = usePlayPreference('chainColorPairs')
  const pairIndex = chainPairIndex(first, second, pairs)
  const choices = pairs.map(([first, second], index) => ({ first, second, label: `Pair ${index + 1}` }))
  if (pairIndex === -1) choices.push({ first, second, label: `${first} and ${second}` })
  const selected = pairIndex === -1 ? choices.length - 1 : pairIndex

  return <Modal title="Chain colors" open={open} onClose={onClose}>
    <div className="chain-color-options">
      {choices.map(({ first, second, label }, index) => (
        <Button key={label} variant="quiet" aria-pressed={index === selected} onClick={() => {
          if (index !== selected) onSelect(first, second)
          onClose()
        }}>
          <ChainSwatches first={first} second={second} /> {label}
        </Button>
      ))}
    </div>
    {onEdit && <div className="dialog-actions">
      <Button variant="quiet" onClick={onEdit}>Edit color pairs</Button>
    </div>}
  </Modal>
}

type ChainProof = {
  title: string
  nodes: readonly number[]
  strengths?: readonly LinkStrength[]
  actions: readonly DeductionAction[]
  explanation?: string
}

function ChainResults({ proofs }: { proofs: readonly ChainProof[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const groups = new Map<string, ChainProof[]>()
  for (const proof of proofs) {
    const group = groups.get(proof.title) ?? []
    group.push(proof)
    groups.set(proof.title, group)
  }
  const titles = [...groups.keys()]
  if (!titles.length) return null

  const index = Math.max(0, selected === null ? -1 : titles.indexOf(selected))
  const title = titles[index]
  const group = groups.get(title)!
  const actions = group.flatMap(proof => proof.actions)
  const results = deductionResults([...new Map(actions.map(action => [techniqueActionKey(action), action])).values()])
  const explanations = group.filter(proof => Boolean(proof.explanation))
  function move(offset: number) {
    setSelected(titles[(index + offset + titles.length) % titles.length])
  }

  return <article className="chain-analysis">
    <div className="chain-analysis-heading">
      <h2 aria-live="polite">{title}</h2>
      {titles.length > 1 && <div className="chain-result-navigation" role="group" aria-label="Chain technique navigation">
        <IconButton aria-label="Previous chain technique" onClick={() => move(-1)}>
          <ArrowLeft size={16} aria-hidden="true" />
        </IconButton>
        <span>{index + 1}/{titles.length}</span>
        <IconButton aria-label="Next chain technique" onClick={() => move(1)}>
          <ArrowRight size={16} aria-hidden="true" />
        </IconButton>
      </div>}
    </div>
    {results.length > 0 && <ul className="chain-results">{results.map(result => <li key={result}>{result}</li>)}</ul>}
    {explanations.length > 0 && <details className="chain-links" key={title} open={results.length ? undefined : true}>
      <summary>Why this works</summary>
      {explanations.map(({ nodes, strengths, actions, explanation }) => <div className="chain-proof" key={nodes.join('-')}>
        {strengths && <p><code>{compactPath(nodes, strengths)}</code></p>}
        {group.length > 1 && actions.length > 0 && <p>{deductionResults(actions).join(' ')}</p>}
        <p>{explanation}</p>
      </div>)}
    </details>}
  </article>
}

function ChainActionsMenu({ actions }: {
  actions: { label: string; icon: typeof Link2; disabled: boolean; title?: string; opensDialog?: boolean; run: () => void }[]
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const menu = popover.current
    const button = trigger.current
    if (!open || !menu || !button) return
    const position = () => {
      const anchor = button.getBoundingClientRect()
      const scale = Number(getComputedStyle(menu).getPropertyValue('--desktop-layout-scale')) || 1
      const gap = 8
      const below = window.innerHeight - anchor.bottom - 2 * gap
      const above = anchor.top - 2 * gap
      const opensAbove = menu.scrollHeight * scale > below && above > below
      menu.style.maxHeight = `${Math.max(0, opensAbove ? above : below) / scale}px`
      const left = Math.max(gap, Math.min(anchor.right, window.innerWidth - gap) - menu.offsetWidth * scale)
      const top = opensAbove ? anchor.top - gap - menu.offsetHeight * scale : anchor.bottom + gap
      menu.style.left = `${left / scale}px`
      menu.style.top = `${Math.max(gap, top) / scale}px`
    }
    position()
    const first = menu.querySelector<HTMLButtonElement>('button:not([aria-disabled="true"])') ?? menu.querySelector('button')
    first?.focus({ preventScroll: true })
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      menu.removeAttribute('style')
    }
  }, [open])

  function close() {
    popover.current?.hidePopover()
    trigger.current?.focus({ preventScroll: true })
  }

  return <>
    <IconButton ref={trigger} variant="quiet" aria-label="Chain actions"
      title="Chain actions" aria-haspopup="menu" aria-expanded={open} popoverTarget={id}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown') return
        event.preventDefault()
        popover.current?.showPopover()
      }}>
      <MoreHorizontal size={18} aria-hidden="true" />
    </IconButton>
    <div ref={popover} id={id} popover="auto" className="app-menu chain-actions-menu" role="menu" aria-label="Chain actions"
      onToggle={(event) => setOpen(event.currentTarget.matches(':popover-open'))}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') event.preventDefault()
          close()
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          const items = Array.from(event.currentTarget.querySelectorAll('button'))
          const index = items.findIndex(item => item === document.activeElement)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          items[next]?.focus()
        }
      }}>
      {actions.map(({ label, icon: Icon, disabled, title, opensDialog, run }) => (
        <button type="button" key={label} role="menuitem" tabIndex={-1} aria-disabled={disabled}
          aria-haspopup={opensDialog ? 'dialog' : undefined} title={title} onClick={() => {
          if (disabled) return
          close()
          run()
        }}><Icon size={16} aria-hidden="true" />{label}</button>
      ))}
    </div>
  </>
}

export function ChainsPanel({ sketch, onApply, applyFailed, onToggleDrawing, onChooseColors, shortcuts, compact, strongLinks, unavailable, inspection }: Props) {
  const chainLabelId = useId()
  if (inspection) {
    const { deduction, links, explanation, cellReferenceStyle, difficulty } = inspection
    const nameCell = cellReferenceStyle === undefined ? cellName : (cell: number) => cellReference(cell, cellReferenceStyle, difficulty)
    return <section className="chains-panel" aria-label="Chains">
      <h2>{techniqueLabel(deduction.technique)}</h2>
      {!compact && links.length > 0 && <LinkLegend />}
      {explanation && <p>{explanation}</p>}
      <ul className="chain-results">{deductionResults(deduction.actions, inspection).map((result) => <li key={result}>{result}</li>)}</ul>
      {links.length > 0 && <details className="chain-links">
        <summary>{links.length} {links.length === 1 ? 'link' : 'links'}</summary>
        <ol>{links.map(({ from, to, dashed }, i) => (
          <li key={i}>{pointName(from, nameCell)} to {pointName(to, nameCell)} · {dashed ? 'weak' : 'strong'}</li>
        ))}</ol>
      </details>}
    </section>
  }

  const { active } = sketch
  const drawLabel = sketch.drawing ? 'Done drawing' : 'Draw links'
  const drawKey = shortcutLabel(shortcuts.chainDrawing)
  const applyKey = shortcutLabel(shortcuts.applyEdits)
  const strongLinkStatus = strongLinks?.hasHighlights && !strongLinks.count ? 'No strong links between the highlighted candidates.' : ''
  const showStrongLinkInstructions = !sketch.drawing || (sketch.pending === null && !sketch.hasLinks)
  const completablePaths = sketch.chains.filter(sketch.canFinishLoop)
  const loopPath = completablePaths.length === 1 ? completablePaths[0]
    : completablePaths.find(({ nodes }) => sketch.pending !== null && nodes.includes(sketch.pending))
  const editorControls = <div className="chain-toolbar chain-draw-tools">
    <div className="chain-path-actions">
      <Button variant={sketch.drawing ? 'secondary' : 'primary'}
        title={sketch.drawing ? `${drawLabel} (${drawKey} or Esc)` : `${drawLabel} (${drawKey})`}
        aria-keyshortcuts={sketch.drawing ? `${drawKey} Escape` : drawKey} onClick={onToggleDrawing}>
        {!sketch.drawing && <Link2 size={15} aria-hidden="true" />} {drawLabel}
      </Button>
      <Button variant="quiet" disabled={!sketch.drawing || sketch.pending === null}
        title="Deselect the current endpoint and keep drawing" onClick={sketch.endPath}>End path</Button>
    </div>
    <div className="chain-edit-actions">
      <IconButton variant="quiet" aria-label="Undo edit" title="Undo edit (Ctrl+Z or Command+Z)"
        aria-keyshortcuts="Control+Z Meta+Z"
        disabled={!sketch.canUndo} onClick={sketch.undo}>
        <Undo2 size={16} aria-hidden="true" />
      </IconButton>
      <ChainActionsMenu actions={[
        { label: 'Choose colors', icon: Palette, disabled: false, opensDialog: true, run: onChooseColors },
        { label: 'Complete loop', icon: RotateCw, disabled: !loopPath,
          title: loopPath ? 'Add links to close the path' : completablePaths.length
            ? 'Select a candidate in the path you want to complete' : 'No loop completion found',
          run: () => { if (loopPath) sketch.finishLoop(loopPath) } },
        { label: 'Extend strong links', icon: Link2, disabled: !sketch.canExtendStrongLinks,
          title: 'Add the remaining strong links from the selected candidate', run: sketch.extendStrongLinks },
        { label: 'Clear links', icon: Eraser, disabled: !sketch.hasLinks, run: sketch.clear },
      ]} />
    </div>
  </div>
  return <section className="chains-panel" aria-label="Chains">
    {unavailable ? <p role="status">{unavailable}</p> : <>
      <div className="chain-panel-tools">
        <Button disabled={!sketch.hasLinks} onClick={sketch.addSketch}>
          <Plus size={15} aria-hidden="true" /> New chain
        </Button>
        <div className="chain-panel-end-actions">
          <Button variant="primary" className="apply-chain-edits" disabled={!sketch.allActions.length}
            title={`Apply deductions from all chains (${applyKey})`} aria-keyshortcuts={applyKey} onClick={onApply}>
            Apply edits
          </Button>
          {strongLinks && <Button aria-pressed={strongLinks.shown} onClick={strongLinks.toggle}>Show strong links</Button>}
        </div>
      </div>
      {applyFailed && <p role="status">Some chain edits conflict or the grid has changed.</p>}
      {strongLinks?.shown && (showStrongLinkInstructions || strongLinkStatus) && <div className="strong-link-tool">
        {showStrongLinkInstructions && <p>Select a candidate or link to start drawing.</p>}
        {strongLinkStatus && <p role="status">{strongLinkStatus}</p>}
      </div>}
      <ul className="chain-list" aria-label="Drawn chains">
        {sketch.sketches.map(({ id, color, secondColor, hidden, edges, types, paths }, index) => {
          const name = `Chain ${index + 1}`
          const selected = id === active.id
          const visibilityLabel = `${hidden ? 'Show' : 'Hide'} ${name.toLowerCase()}`
          const deleteLabel = `Delete ${name.toLowerCase()}`
          const typeId = types.length ? `${chainLabelId}-${id}-type` : undefined
          const notationId = paths.length ? `${chainLabelId}-${id}-notation` : undefined
          const description = [typeId, notationId].filter(Boolean).join(' ') || undefined
          const VisibilityIcon = hidden ? EyeOff : Eye
          return <li className="chain-row" key={id} data-active={selected || undefined} data-hidden={hidden || undefined}
            onClick={(event) => {
              if (!selected && event.target instanceof Element && !event.target.closest('button')) sketch.switchSketch(id)
            }}>
            <div className="chain-row-actions">
              <button type="button" className="chain-select" aria-label={name} aria-describedby={description}
                aria-pressed={selected} onClick={() => sketch.switchSketch(id)}>
                <span className="chain-select-label">
                  <ChainSwatches first={color} second={secondColor} />
                  <span className="chain-name">{name}</span>
                  {typeId && <span id={typeId} className="chain-type-label">{types.join(' · ')}</span>}
                </span>
                {notationId
                  ? <span className="chain-notation" id={notationId}><code>{paths.map(({ nodes, strengths }) => compactPath(nodes, strengths)).join(', ')}</code></span>
                  : <span className="chain-empty">No links yet.</span>}
              </button>
              <IconButton variant="quiet" aria-label={visibilityLabel} title={visibilityLabel}
                disabled={!hidden && edges.length === 0} onClick={() => sketch.toggleVisibility(id)}>
                <VisibilityIcon size={16} aria-hidden="true" />
              </IconButton>
              <IconButton variant="quiet" aria-label={deleteLabel} title={deleteLabel}
                disabled={sketch.sketches.length === 1 && edges.length === 0 && sketch.pending === null} onClick={() => sketch.deleteSketch(id)}>
                <Trash2 size={16} aria-hidden="true" />
              </IconButton>
            </div>
            {selected && <div className="chain-editor" role="group" aria-label={`Edit ${name.toLowerCase()}`}>
              {editorControls}
              {sketch.status && <p role="status">{sketch.status}</p>}
              <ChainResults proofs={[
                ...sketch.chains.filter(proof => proof.actions.length),
                ...sketch.medusas.filter(proof => proof.actions.length || proof.explanation),
              ]} />
            </div>}
          </li>
        })}
      </ul>
      {!compact && sketch.sketches.some(({ paths }) => paths.length > 0) && <LinkLegend notation />}
    </>}
  </section>
}
