import { ArrowLeft, ArrowRight, Eraser, Eye, Layers, Link2, Palette, Plus, Redo2, RotateCw, Undo2 } from 'lucide-react'
import { Fragment, useId, useLayoutEffect, useState, type Ref } from 'react'
import type { Deduction } from '../sudoku/engine'
import type { AnalyzedChainSketch, ChainProof } from '../sudoku/chain-sketch-analysis'
import { chainColor, chainPairIndex, hasChainContent, type ChainColor } from '../sudoku/chain-sketch'
import { chainNodeCandidates, isAlsChainNode, type ChainNode, type LinkStrength } from '../sudoku/chains'
import { CLASSIC_GRID } from '../sudoku/grid'
import { cellReference, techniqueLabel, type CellReferenceOptions } from '../sudoku/hints'
import { cellName, deductionResults } from '../sudoku/lesson-diagram'
import { shortcutLabel, type ShortcutPreferences } from '../sudoku/shortcuts'
import { techniqueActionKey } from '../sudoku/technique-progress'
import { almostLockedSetColor } from '../sudoku/als-highlighting'
import { alsChainAssumption } from '../sudoku/subset-proofs'
import { subsetDigits, subsetProofSets, type SubsetDescription } from '../sudoku/subsets'
import type { BoardLink } from './BoardAnnotations'
import { CellReferenceText } from './CellReferenceHighlight'
import { Button, IconButton } from './Button'
import { Modal } from './Modal'
import { ToolItemCard } from './ToolItemCard'
import { SketchActionsMenu } from './SketchActionsMenu'
import type { ChainNotationPart, useChainSketch } from './useChainSketch'
import type { SubsetChainFocus } from './play/subset-chain-annotations'
import { usePlayPreference } from './usePlayPreference'

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

function chainNodeNotation(node: ChainNode) {
  const members = chainNodeCandidates(node)
  if (isAlsChainNode(node)) return `(${members[0].digit})${compactCells(members.map(({ cell }) => cell))}`
  return typeof node === 'number'
    ? `${members[0].digit}${cellName(members[0].cell).toLowerCase()}`
    : `${members[0].digit}(${members.map(({ cell }) => cellName(cell).toLowerCase()).join('|')})`
}

function compactPath(nodes: readonly ChainNode[], strengths: readonly LinkStrength[]) {
  return nodes.map((node, index) =>
    `${index === 0 ? '' : strengths[index - 1] === 'strong' ? '= ' : '− '}${chainNodeNotation(node)}`).join(' ')
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
        const candidate = chainNodeNotation(node)
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

function compactCells(cells: readonly number[]) {
  const { size } = CLASSIC_GRID
  const rows = new Map<number, number[]>()
  for (const cell of [...cells].sort((a, b) => a - b)) {
    const row = Math.floor(cell / size) + 1
    const columns = rows.get(row) ?? []
    columns.push(cell % size + 1)
    rows.set(row, columns)
  }
  const byRow = [...rows]
  const firstColumn = byRow[0][1][0]
  return byRow.every(([, columns]) => columns.length === 1 && columns[0] === firstColumn)
    ? `r${byRow.map(([row]) => row).join('')}c${firstColumn}`
    : byRow.map(([row, columns]) => `r${row}c${columns.join('')}`).join(',')
}

function alsNotation({ cells, digitMask }: SubsetDescription) {
  return `${compactCells(cells)} {${subsetDigits(digitMask, CLASSIC_GRID.size).join('')}}`
}

function SubsetChainNotation({ id, sketchId, subset, sets, onHighlight }: {
  id: string
  sketchId: number
  subset: NonNullable<AnalyzedChainSketch['subset']>
  sets: readonly SubsetDescription[]
  onHighlight: (focus: SubsetChainFocus | null) => void
}) {
  const { proof, analysis } = subset
  function token(text: string, part: SubsetChainFocus['part'], label = text) {
    return <span className={'link' in part || 'edge' in part ? 'chain-notation-edge' : 'chain-notation-node'} tabIndex={0}
      aria-label={`Highlight ${label}`}
      onPointerEnter={() => onHighlight({ sketchId, part })} onPointerLeave={() => onHighlight(null)}
      onFocus={() => onHighlight({ sketchId, part })} onBlur={() => onHighlight(null)}>{text}</span>
  }
  function setToken(setId: number) {
    const set = sets.find(set => set.id === setId)
    if (!set) return <span>Missing set</span>
    const label = `Set ${set.number}`
    return token(set.kind === 'als' && proof.kind !== 'pattern' ? alsNotation(set) : label, { set: setId }, label)
  }
  function restrictedToken(digit: number, index: number, text = `-${digit}-`) {
    return token(text, { link: index }, `restricted common candidate ${digit}`)
  }
  function restrictedTokens(from: number | undefined, to: number, digit?: number) {
    return analysis.links.flatMap((link, index) => ('from' in link ? link.from === from : from === undefined) &&
      link.to === to && (digit === undefined || digit === link.digit)
      ? [<Fragment key={index}>{' '}{restrictedToken(link.digit, index)}{' '}</Fragment>]
      : [])
  }
  if (proof.kind === 'endpoint') return <span className="chain-notation" id={id}><code>
    {proof.path.map((node, index) => <Fragment key={node}>
      {index > 0 && <> {token(index % 2 ? '=' : '−', { edge: index - 1 }, index % 2 ? 'strong link' : 'weak link')} </>}
      {token(chainNodeNotation(node), { node: index })}
    </Fragment>)}{restrictedTokens(undefined, proof.set)}{!analysis.links.length && ' · '}{setToken(proof.set)}
  </code></span>
  // Doubly linked ALS-XZ names two parallel RCCs rather than depicting consecutive links.
  if (proof.kind === 'path' && proof.sets.length === 2 && analysis.links.length === 2) {
    return <span className="chain-notation" id={id}><code>
      A={setToken(proof.sets[0])}, B={setToken(proof.sets[1])}, X={analysis.links.map(({ digit }, index) =>
        <Fragment key={digit}>{index > 0 && ', '}{restrictedToken(digit, index, String(digit))}</Fragment>)}
    </code></span>
  }
  return <span className="chain-notation" id={id}><code>
    {proof.kind === 'path' || proof.kind === 'pattern' ? proof.sets.map((setId, index) => {
      const links = index > 0 ? restrictedTokens(proof.sets[index - 1], setId) : []
      return <Fragment key={setId}>
        {index > 0 && (links.length ? links : ' · ')}{setToken(setId)}
      </Fragment>
    }) : <>
      {token(`[${cellName(proof.stem).toLowerCase()}]`, { stem: true }, 'stem')}
      {Object.entries(proof.petals).map(([digit, setId]) => <span className="subset-branch-notation" key={digit}>
        {restrictedTokens(proof.stem, setId, Number(digit))}{setToken(setId)}
      </span>)}
    </>}
  </code></span>
}

function subsetResult(subset: AnalyzedChainSketch['subset']): ChainProof[] {
  if (!subset?.analysis.technique || !subset.analysis.actions.length) return []
  const { analysis } = subset
  const patternExplanation = {
    'xyz-wing': 'The pivot sees both wings. If the pivot omits the shared digit, its value forces that digit into one of the wings.',
    'wxyz-wing': 'The four cells need four values. The digit that can repeat must occur. When every digit is restricted, all four digits must occur.',
    'sue-de-coq': 'The line and the box each need different digits from the intersection. Their combined demand uses the full surplus, so each house locks the digits its side needs.',
  }
  const explanation = subset.proof.kind === 'blossom'
    ? 'Each possible stem digit rules out the same digit in its petal. That petal must use the digit shared by every petal. A target that sees all of its possible placements can drop it.'
    : subset.proof.kind === 'endpoint'
      ? 'If the first candidate group is false, the drawn links force the restricted digit at the other end. That rules out the digit in the subset, so the subset must use the eliminating digit.'
      : subset.proof.kind === 'pattern'
        ? patternExplanation[analysis.technique as keyof typeof patternExplanation]
        : analysis.links.length > subset.proof.links.length
      ? 'The two restricted digits must go in different sets. Each set must use its remaining digits. A target that sees all possible placements of a forced digit can drop it.'
      : 'The restricted candidates force at least one end set to use the eliminating digit. A target that sees every possible placement of that digit in both ends can drop it.'
  return [{ title: techniqueLabel(subset.analysis.technique), nodes: [], actions: analysis.actions, explanation }]
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
  const activeSubset = sketch.sketches.find(({ id }) => id === active.id)?.subset
  const activeAssumption = activeSubset && alsChainAssumption(activeSubset.proof, activeSubset.analysis, Boolean(eliminations?.shown))
  const drawLabel = sketch.drawing ? 'Done drawing' : 'Draw links'
  const drawKey = shortcutLabel(shortcuts.chainDrawing)
  const applyKey = shortcutLabel(shortcuts.applyEdits)
  const strongLinkStatus = strongLinks?.hasHighlights && !strongLinks.count ? 'No strong links between the highlighted candidates.' : ''
  const completablePaths = sketch.chains.filter(sketch.canFinishLoop)
  const loopPath = completablePaths.length === 1 ? completablePaths[0]
    : completablePaths.find(({ nodes }) => sketch.pending !== null && nodes.includes(sketch.pending))
  const editorControls = <div className="tool-toolbar chain-draw-tools">
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
      <SketchActionsMenu label="Chain actions" actions={[
        ...(!sketch.drawingUnavailable || activeAssumption ? [{ label: 'Choose colors', icon: Palette, disabled: false, opensDialog: true, run: onChooseColors }] : []),
        { label: 'Complete loop', icon: RotateCw, disabled: !loopPath,
          title: loopPath ? 'Add links to close the path' : completablePaths.length
            ? 'Select a candidate in the path you want to complete' : 'No loop completion found',
          run: () => { if (loopPath) sketch.finishLoop(loopPath) } },
        { label: 'Extend strong links', icon: Link2, disabled: !sketch.canExtendStrongLinks,
          title: 'Add the remaining strong links from the selected candidate', run: sketch.extendStrongLinks },
        { label: 'Clear links', icon: Eraser, disabled: !sketch.hasLinks, run: sketch.clear },
        ...sketch.subsetChoices.map(({ label, proof }) => ({
          label, icon: Layers, disabled: false, run: () => sketch.changeSubset(proof),
        })),
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
            disabled={sketch.drawingUnavailable} onClick={onToggleDrawing}><Link2 size={16} aria-hidden="true" /></IconButton>
          <SketchActionsMenu label="Chain display options" actions={[
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
      <ul className="tool-item-list" aria-label="Drawn chains">
        {sketch.sketches.map((item, index) => {
          const { id, color, secondColor, hidden, types, paths, chains, medusas, subset } = item
          const name = `Chain ${index + 1}`
          const selected = id === active.id
          const hasHiddenElimination = !eliminations?.shown && [...chains, ...medusas]
            .some(proof => proof.actions.some(action => 'eliminate' in action))
          const subsetProofs = eliminations?.shown ? subsetResult(subset) : []
          const visibleTypes = types.filter(type => !hasHiddenElimination || type === 'AIC with ALS nodes')
          if (subset?.analysis.technique && (subset.proof.kind === 'path' || eliminations?.shown)) {
            visibleTypes.push(techniqueLabel(subset.analysis.technique))
          }
          const typeLabel = visibleTypes.find(type => /Nice Loop/.test(type))
            ?? visibleTypes.find(type => /AIC/.test(type))
            ?? visibleTypes[0]
          const notationId = paths.length || subset ? `${chainLabelId}-${id}-notation` : undefined
          const showSubsetEliminations = selected && Boolean(eliminations?.shown)
          const notation = notationId && (subset
            ? <SubsetChainNotation id={notationId} sketchId={id} subset={subset} sets={sketch.subsetSets}
              onHighlight={sketch.highlightSubsetNotation} />
            : <ChainNotation id={notationId} sketchId={id} paths={paths} onHighlight={sketch.highlightNotation} />)
          const content = hasChainContent(item)
          const assumption = subset && alsChainAssumption(subset.proof, subset.analysis, showSubsetEliminations)
          const firstSetId = subset?.proof.kind === 'path' ? subset.proof.sets[0] : undefined
          const firstSet = sketch.subsetSets.find(set => set.id === firstSetId)
          const colors = subset && !assumption ? [...new Set(subsetProofSets(subset.proof))].slice(0, 4).map(setId => almostLockedSetColor(setId - 1))
            : [chainColor(color), chainColor(secondColor)]
          return <ToolItemCard key={id} name={name} typeLabel={typeLabel} colors={colors}
            selected={selected} hidden={hidden} onSelect={() => sketch.switchSketch(id)}
            descriptionId={notationId} summary={notation}
            visibility={{
              label: `${hidden ? 'Show' : 'Hide'} ${name.toLowerCase()}`,
              disabled: !hidden && !content, onClick: () => sketch.toggleVisibility(id),
            }}
            remove={{
              label: `Delete ${name.toLowerCase()}`,
              disabled: sketch.sketches.length === 1 && !content && sketch.pending === null,
              onClick: () => sketch.deleteSketch(id),
            }}
            editor={{ label: `Edit ${name.toLowerCase()}`, content: <>
              {editorControls}
              {notation}
              {assumption && firstSet && <div className="chain-legend chain-case-legend">
                <span>If Set {firstSet.number} {assumption.on ? 'uses' : 'skips'} {assumption.digit}</span>
                <span><i aria-hidden="true" style={{ backgroundColor: chainColor(color) }} />ON</span>
                <span><i aria-hidden="true" style={{ backgroundColor: chainColor(secondColor) }} />OFF</span>
              </div>}
              <ChainResults onPreview={sketch.setPreviewedProof} showEliminations={eliminations?.shown ?? false} proofs={[
                ...sketch.chains.filter(proof => proof.actions.length),
                ...sketch.medusas.filter(proof => proof.actions.length || proof.explanation),
                ...subsetProofs,
              ]} />
            </> }}
          />
        })}
      </ul>
      {sketch.sketches.some(({ paths }) => paths.length > 0) && <LinkLegend notation />}
    </>}
  </section>
}
