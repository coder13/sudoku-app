import { ArrowLeft, ArrowRight, Eraser, Eye, EyeOff, Link2, MoreHorizontal, Palette, Plus, Redo2, RotateCw, Trash2, Undo2 } from 'lucide-react'
import { Fragment, useId, useLayoutEffect, useRef, useState, type Ref } from 'react'
import type { Deduction } from '../sudoku/engine'
import type { ChainProof } from '../sudoku/chain-sketch-analysis'
import { chainColor, chainPairIndex, type ChainColor } from '../sudoku/chain-sketch'
import { chainNodeCandidates, type ChainNode, type LinkStrength } from '../sudoku/chains'
import { cellReference, techniqueLabel, type CellReferenceOptions } from '../sudoku/hints'
import { cellName, deductionResults } from '../sudoku/lesson-diagram'
import { shortcutLabel, type ShortcutPreferences } from '../sudoku/shortcuts'
import { techniqueActionKey } from '../sudoku/technique-progress'
import type { BoardLink } from './BoardAnnotations'
import { CellReferenceText } from './CellReferenceHighlight'
import { Button, IconButton } from './Button'
import { useActionMenuKeyboard } from './useActionMenuKeyboard'
import { Modal } from './Modal'
import type { ChainNotationPart, useChainSketch } from './useChainSketch'
import { usePlayPreference } from './usePlayPreference'
import { useAnchoredPopover } from './useAnchoredPopover'
import { positionScaledRightPopover } from './scaled-popover-position'

type ChainInspection = CellReferenceOptions & { deduction: Deduction; links: readonly BoardLink[]; explanation?: string }
type Props = {
  sketch: ReturnType<typeof useChainSketch>
  onApply: () => void
  applyFailed: boolean
  onToggleDrawing: () => void
  onChooseColors: () => void
  shortcuts: Pick<ShortcutPreferences, 'chainDrawing' | 'applyEdits'>
  strongLinks?: { shown: boolean; hasHighlights: boolean; count: number; toggle: () => void }
  eliminations?: { shown: boolean; toggle: () => void }
  unavailable?: string
  onRetryCandidates?: () => void
  inspection?: ChainInspection
  panelRef?: Ref<HTMLElement>
}

function pointName(point: BoardLink['from'], nameCell = cellName) {
  if ('cells' in point) return `${point.digit} in ${point.cells.map(nameCell).join(' or ')}`
  if ('candidates' in point) return point.candidates.map(({ cell, digit }) => `${digit} in ${nameCell(cell)}`).join(' or ')
  return `${point.digit} in ${nameCell(point.cell)}`
}

function compactPath(nodes: readonly ChainNode[], strengths: readonly LinkStrength[]) {
  return nodes.map((id, i) => {
    const members = chainNodeCandidates(id)
    const candidate = typeof id === 'number'
      ? `${members[0].digit}${cellName(members[0].cell).toLowerCase()}`
      : `${members[0].digit}(${members.map(({ cell }) => cellName(cell).toLowerCase()).join('|')})`
    return i === 0 ? candidate : `${strengths[i - 1] === 'strong' ? '=' : '−'} ${candidate}`
  }).join(' ')
}

function ChainNotation({ id, sketchId, paths, onHighlight }: {
  id: string
  sketchId: number
  paths: readonly { nodes: readonly ChainNode[]; strengths: readonly LinkStrength[] }[]
  onHighlight: (part: ChainNotationPart | null) => void
}) {
  return <span className="chain-notation" id={id}><code>{paths.map(({ nodes, strengths }, pathIndex) => (
    <span className="chain-notation-path" key={`${pathIndex}-${nodes.join('-')}`}>
      {pathIndex > 0 && ', '}
      {nodes.map((node, index) => {
        const members = chainNodeCandidates(node)
        const candidate = typeof node === 'number'
          ? `${members[0].digit}${cellName(members[0].cell).toLowerCase()}`
          : `${members[0].digit}(${members.map(({ cell }) => cellName(cell).toLowerCase()).join('|')})`
        const nodePart: ChainNotationPart = { sketchId, pathIndex, kind: 'node', index }
        const nodeSpan = <span className="chain-notation-node" key={`node-${node}-${index}`} tabIndex={0}
          aria-label={`Highlight ${candidate}`} onPointerEnter={() => onHighlight(nodePart)}
          onPointerLeave={() => onHighlight(null)} onFocus={() => onHighlight(nodePart)} onBlur={() => onHighlight(null)}>{candidate}</span>
        if (index === 0) return nodeSpan
        const edgePart: ChainNotationPart = { sketchId, pathIndex, kind: 'edge', index: index - 1 }
        return <Fragment key={`${node}-${index}`}>
          {' '}<span className="chain-notation-edge" tabIndex={0} aria-label={`Highlight ${strengths[index - 1] === 'strong' ? 'strong' : 'weak'} link`}
            onPointerEnter={() => onHighlight(edgePart)} onPointerLeave={() => onHighlight(null)}
            onFocus={() => onHighlight(edgePart)} onBlur={() => onHighlight(null)}>{strengths[index - 1] === 'strong' ? '=' : '−'}</span>{' '}{nodeSpan}
        </Fragment>
      })}
    </span>
  ))}</code></span>
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

function ChainResults({ proofs, onPreview, showEliminations }: {
  proofs: readonly ChainProof[]; onPreview: (proof: ChainProof | null) => void; showEliminations: boolean
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<ChainProof | null>(null)
  const [focused, setFocused] = useState<ChainProof | null>(null)
  const preview = hovered ?? focused
  const visibleProofs = proofs.filter(({ actions }) => showEliminations || !actions.some(action => 'eliminate' in action))
  const visiblePreview = preview && visibleProofs.includes(preview) ? preview : null
  useLayoutEffect(() => {
    onPreview(visiblePreview)
    return () => onPreview(null)
  }, [onPreview, visiblePreview])
  const groups = new Map<string, ChainProof[]>()
  for (const proof of visibleProofs) {
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
  function clearPreview() {
    setHovered(null)
    setFocused(null)
  }
  function move(offset: number) {
    clearPreview()
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
    {explanations.length > 0 && <details className="chain-links" key={title} open={results.length ? undefined : true}
      onToggle={(event) => { if (!event.currentTarget.open) clearPreview() }}>
      <summary>Why this works</summary>
      {explanations.map(proof => <div className="chain-proof" key={proof.nodes.join('-')} tabIndex={0}
        onPointerEnter={(event) => { if (event.pointerType !== 'touch') setHovered(proof) }}
        onPointerLeave={() => setHovered(null)}
        onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) setFocused(proof) }}
        onBlur={() => setFocused(null)}>
        {proof.strengths && <p><code>{compactPath(proof.nodes, proof.strengths)}</code></p>}
        {group.length > 1 && proof.actions.length > 0 && <p><CellReferenceText text={deductionResults(proof.actions).join(' ')} /></p>}
        {proof.explanation && <p><CellReferenceText text={proof.explanation} /></p>}
      </div>)}
    </details>}
  </article>
}

function ChainActionsMenu({ actions, label = 'Chain actions' }: {
  actions: { label: string; icon: typeof Link2; disabled: boolean; title?: string; opensDialog?: boolean; checked?: boolean; toggle?: boolean; run: () => void }[]
  label?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  useAnchoredPopover({ open, anchorRef: trigger, popupRef: popover, clearInlineStyle: true,
    place: positionScaledRightPopover,
  })

  function close() {
    popover.current?.hidePopover()
    trigger.current?.focus({ preventScroll: true })
  }
  const onMenuKeyDown = useActionMenuKeyboard({ open, menuRef: popover, triggerRef: trigger,
    close: () => popover.current?.hidePopover() })

  const items = actions.map(({ label: actionLabel, icon: Icon, disabled, title, opensDialog, checked, toggle, run }) => (
    <button type="button" key={actionLabel} role={toggle ? 'menuitemcheckbox' : 'menuitem'} tabIndex={-1} aria-disabled={disabled}
      aria-checked={toggle ? Boolean(checked) : undefined}
      aria-haspopup={opensDialog ? 'dialog' : undefined} title={title} onClick={() => {
      if (disabled) return
      if (!toggle) close()
      run()
    }}><Icon size={16} aria-hidden="true" />{actionLabel}</button>
  ))

  return <>
    <IconButton ref={trigger} variant="quiet" aria-label={label}
      title={label} aria-haspopup="menu" aria-expanded={open} popoverTarget={id}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown') return
        event.preventDefault()
        popover.current?.showPopover()
      }}>
      <MoreHorizontal size={18} aria-hidden="true" />
    </IconButton>
    <div ref={popover} id={id} popover="auto" className="app-menu chain-actions-menu" role="menu" aria-label={label}
      onToggle={(event) => setOpen(event.currentTarget.matches(':popover-open'))}
      onKeyDown={onMenuKeyDown}>
      {items}
    </div>
  </>
}

export function ChainsPanel({ sketch, onApply, applyFailed, onToggleDrawing, onChooseColors, shortcuts, strongLinks, eliminations, unavailable, onRetryCandidates, inspection, panelRef }: Props) {
  const chainLabelId = useId()
  if (inspection) {
    const { deduction, links, explanation, cellReferenceStyle, difficulty } = inspection
    const nameCell = cellReferenceStyle === undefined ? cellName : (cell: number) => cellReference(cell, cellReferenceStyle, difficulty)
    return <section ref={panelRef} className="chains-panel" aria-label="Chains" data-grid-click-away-exempt>
      <h2>{techniqueLabel(deduction.technique)}</h2>
      {links.length > 0 && <LinkLegend />}
      {explanation && <p><CellReferenceText text={explanation} /></p>}
      <ul className="chain-results">{deductionResults(deduction.actions, inspection).map((result) => <li key={result}><CellReferenceText text={result} /></li>)}</ul>
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
  const completablePaths = sketch.chains.filter(sketch.canFinishLoop)
  const loopPath = completablePaths.length === 1 ? completablePaths[0]
    : completablePaths.find(({ nodes }) => sketch.pending !== null && nodes.includes(sketch.pending))
  const editorControls = <div className="chain-toolbar chain-draw-tools">
    <div className="chain-path-actions">
      <Button variant="quiet" disabled={!sketch.drawing || sketch.pending === null}
        title="Deselect the current endpoint and keep drawing" onClick={sketch.endPath}>End path</Button>
    </div>
    <div className="chain-edit-actions">
      <IconButton variant="quiet" aria-label="Undo edit" title="Undo edit (Ctrl+Z or Command+Z)"
        aria-keyshortcuts="Control+Z Meta+Z"
        disabled={!sketch.canUndo} onClick={sketch.undo}>
        <Undo2 size={16} aria-hidden="true" />
      </IconButton>
      <IconButton variant="quiet" aria-label="Redo edit" title="Redo edit (Ctrl+Shift+Z or Command+Shift+Z)"
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y Meta+Y"
        disabled={!sketch.canRedo} onClick={sketch.redo}>
        <Redo2 size={16} aria-hidden="true" />
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
  return <section ref={panelRef} className="chains-panel" aria-label="Chains" data-grid-click-away-exempt>
    {unavailable ? <div className="chains-unavailable">
      <p role="status">{unavailable}</p>
      {onRetryCandidates && <Button variant="quiet" onClick={onRetryCandidates}>Retry candidates</Button>}
    </div> : <>
      <div className="chain-panel-tools">
        <div className="chain-panel-primary-actions">
          <Button disabled={!sketch.hasLinks} onClick={sketch.addSketch}>
            <Plus size={15} aria-hidden="true" /> New chain
          </Button>
          <Button variant="primary" className="apply-chain-edits" disabled={!sketch.allActions.length}
            title={`Apply deductions from all chains (${applyKey})`} aria-keyshortcuts={applyKey} onClick={onApply}>
            Apply edits
          </Button>
        </div>
        <div className="chain-panel-display-actions">
          <IconButton variant="quiet" aria-label={drawLabel} title={sketch.drawing ? `${drawLabel} (${drawKey} or Esc)` : `${drawLabel} (${drawKey})`}
            aria-pressed={sketch.drawing} aria-keyshortcuts={sketch.drawing ? `${drawKey} Escape` : drawKey}
            onClick={onToggleDrawing}><Link2 size={16} aria-hidden="true" /></IconButton>
          <ChainActionsMenu label="Chain display options" actions={[
            ...(eliminations ? [{ label: 'Show eliminations', icon: Eye, disabled: false, toggle: true,
              checked: eliminations.shown, run: eliminations.toggle }] : []),
            ...(strongLinks ? [{ label: 'Show strong links', icon: Link2, disabled: false, toggle: true,
              checked: strongLinks.shown, run: strongLinks.toggle }] : []),
          ]} />
        </div>
      </div>
      <p className="sr-only" role="status">{applyFailed ? 'Some chain edits conflict or the grid has changed.' : sketch.status}</p>
      {strongLinks?.shown && strongLinkStatus && <div className="strong-link-tool">
        <p role="status">{strongLinkStatus}</p>
      </div>}
      <ul className="chain-list" aria-label="Drawn chains">
        {sketch.sketches.map(({ id, color, secondColor, hidden, edges, types, paths, chains, medusas }, index) => {
          const name = `Chain ${index + 1}`
          const selected = id === active.id
          const hasHiddenElimination = !eliminations?.shown && [...chains, ...medusas]
            .some(proof => proof.actions.some(action => 'eliminate' in action))
          const visibleTypes = hasHiddenElimination ? [] : types
          const typeLabel = visibleTypes.find(type => /Nice Loop/.test(type))
            ?? visibleTypes.find(type => /AIC/.test(type))
            ?? visibleTypes[0]
          const visibilityLabel = `${hidden ? 'Show' : 'Hide'} ${name.toLowerCase()}`
          const deleteLabel = `Delete ${name.toLowerCase()}`
          const typeId = typeLabel ? `${chainLabelId}-${id}-type` : undefined
          const notationId = paths.length ? `${chainLabelId}-${id}-notation` : undefined
          const description = [typeId, notationId].filter(Boolean).join(' ') || undefined
          const VisibilityIcon = hidden ? EyeOff : Eye
          return <li className="chain-row" key={id} data-active={selected || undefined} data-hidden={hidden || undefined}
            onClick={(event) => {
              if (!selected && event.target instanceof Element && !event.target.closest('button')) sketch.switchSketch(id)
            }}>
            <div className="chain-row-actions">
              <div className="chain-row-main">
                <button type="button" className="chain-select" aria-label={name} aria-describedby={description}
                  aria-pressed={selected} onClick={() => sketch.switchSketch(id)}>
                  <span className="chain-select-label">
                    <ChainSwatches first={color} second={secondColor} />
                    <span className="chain-name">{name}</span>
                    {typeId && <span id={typeId} className="chain-type-label" title={typeLabel}>{typeLabel}</span>}
                  </span>
                </button>
                {!selected && notationId && <ChainNotation id={notationId} sketchId={id} paths={paths} onHighlight={sketch.highlightNotation} />}
              </div>
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
              {notationId && <ChainNotation id={notationId} sketchId={id} paths={paths} onHighlight={sketch.highlightNotation} />}
              <ChainResults onPreview={sketch.setPreviewedProof} showEliminations={eliminations?.shown ?? false} proofs={[
                ...sketch.chains.filter(proof => proof.actions.length),
                ...sketch.medusas.filter(proof => proof.actions.length || proof.explanation),
              ]} />
            </div>}
          </li>
        })}
      </ul>
      {sketch.sketches.some(({ paths }) => paths.length > 0) && <LinkLegend notation />}
    </>}
  </section>
}
