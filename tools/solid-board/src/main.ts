import '@fontsource-variable/dm-sans'
import '../../../src/styles.css'
import './lab.css'
import { applyTheme } from '../../../src/sudoku/themes'
import { COLORS } from '../../../src/sudoku/game'
import { mountCurrentReact, mountMemoReact } from './board.react'
import { mountSolid } from './board.solid'
import { runComparison, type ComparisonReport, type PrototypeApi } from './benchmark'
import { createFixture, reduceAction, DIGITS, type Action, type BoardAdapter, type Fixture, type Implementation, type InputMode } from './model'

applyTheme(document.documentElement, 'violet', 'light')

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector)
  if (!result) throw new Error(`Missing prototype element: ${selector}`)
  return result
}

const lab = element('.lab')
const root = element('#board-root')
const progress = element('#progress')
const runButton = element<HTMLButtonElement>('#run')
const fixtureSelect = element<HTMLSelectElement>('#fixture')
const benchmarkButton = element<HTMLButtonElement>('#benchmark-action')
const viewport = element('#zoom-viewport')
const zoomContent = element('#zoom-content')
const zoomInput = element<HTMLInputElement>('#zoom')
const widthInput = element<HTMLInputElement>('#board-width')
let implementation: Implementation = 'current-react'
let fixture: Fixture = 'puzzle'
let state = createFixture(fixture)
let adapter: BoardAdapter | undefined
let mode: InputMode = 'pencil'
let color = 1
let queuedAction: Action | undefined
let running = false
let latestReport: ComparisonReport | undefined
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
const factories = { 'current-react': mountCurrentReact, 'memo-react': mountMemoReact, solid: mountSolid }

function showError(error: unknown) {
  progress.textContent = error instanceof Error ? error.message : String(error)
  progress.dataset.error = ''
  console.error(error)
}

function updateControls() {
  element('#clear').textContent = mode === 'highlight' ? 'Clear highlight' : mode === 'color' ? 'Clear color' : 'Clear value'
  element('#selection-label').textContent = state.selected.length === 1
    ? `R${Math.floor(state.active / 9) + 1}C${state.active % 9 + 1} selected`
    : `${state.selected.length} cells selected`
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.mode === mode))
  }
  element('.lab-digits').dataset.mode = mode
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-digit]')) {
    const digit = Number(button.dataset.digit)
    button.className = `button secondary${mode === 'color' ? ` color-${digit}` : ''}`
    button.setAttribute('aria-label', mode === 'color' ? `Color selected cells ${COLORS[digit - 1].toLowerCase()}` : `${mode} ${digit}`)
    button.setAttribute('aria-pressed', String(mode === 'highlight' && state.highlightedDigit === digit))
  }
}

function applyActions(actions: Action[]) {
  for (const action of actions) state = reduceAction(state, action)
  adapter?.update(state)
  updateControls()
}

function apply(action: Action) { applyActions([action]) }

function enter(digit: number) {
  if (mode === 'highlight') {
    apply({ type: 'highlight', digit: state.highlightedDigit === digit ? null : digit })
  } else {
    if (mode === 'color') color = digit
    applyActions(state.selected.map((cell): Action => mode === 'color'
      ? { type: 'color', cell, color: state.colors[cell] === digit ? 0 : digit }
      : mode === 'pencil' ? { type: 'candidate', cell, digit }
        : { type: 'value', cell, digit: Number(state.values[cell]) === digit ? 0 : digit }))
  }
}

for (const digit of DIGITS) {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.digit = String(digit)
  button.textContent = String(digit)
  button.addEventListener('click', () => { if (!running) enter(digit) })
  element('.lab-digits').append(button)
}

function resetZoom() {
  zoomView = { scale: 1, x: 0, y: 0 }
  zoomContent.style.transform = ''
  zoomInput.value = '1'
  element('#zoom-value').textContent = '100%'
}

async function setImplementation(next: Implementation) {
  adapter?.dispose()
  root.replaceChildren()
  implementation = next
  adapter = factories[next](root, state)
  for (const button of document.querySelectorAll('[data-implementation]')) {
    button.setAttribute('aria-pressed', String((button as HTMLElement).dataset.implementation === next))
  }
  const start = performance.now()
  while (!root.querySelector('[role="grid"]')) {
    if (performance.now() - start > 4000) throw new Error(`${next} did not mount`)
    await frame()
  }
  await frame()
  await frame()
}

async function reset(next: Fixture) {
  fixture = next
  fixtureSelect.value = fixture
  state = createFixture(fixture)
  resetZoom()
  updateControls()
  await setImplementation(implementation)
}

interface NormalNode { tag: string; attributes: Record<string, string>; children: (NormalNode | string)[] }

function normalize(node: Node): NormalNode | string | null {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() || null
  if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) return null
  if (node.getAttribute('data-board-fade') === 'exit') return null
  const children = Array.from(node.childNodes).map(normalize).filter((child): child is NormalNode | string => child !== null)
  if (node.classList.contains('candidate-marks') && !children.length) return null
  const attributes: Record<string, string> = {}
  for (const attribute of [...node.attributes].sort((a, b) => a.name.localeCompare(b.name))) {
    if (attribute.name === 'data-board-fade') continue
    const value = attribute.name === 'class' ? attribute.value.trim().split(/\s+/).sort().join(' ')
      : attribute.name === 'style' ? Array.from(node.style).sort().map(name => `${name}:${node.style.getPropertyValue(name).trim()}`).join(';')
        : attribute.value
    if ((attribute.name === 'class' || attribute.name === 'style') && !value) continue
    attributes[attribute.name] = value
  }
  return { tag: node.tagName.toLowerCase(), attributes, children }
}

benchmarkButton.addEventListener('click', () => {
  if (!queuedAction) return
  const action = queuedAction
  queuedAction = undefined
  apply(action)
})

const api: PrototypeApi = {
  setImplementation,
  reset,
  dispatch(action) {
    queuedAction = action
    // Native click dispatch gives every adapter the same event and scheduling context.
    benchmarkButton.click()
  },
  getState: () => state,
  getImplementation: () => implementation,
  getRoot: () => root,
  snapshot: () => Array.from(root.childNodes).map(normalize).filter(value => value !== null),
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-implementation]')) {
  button.addEventListener('click', () => { if (!running) void setImplementation(button.dataset.implementation as Implementation).catch(showError) })
}
for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-mode]')) {
  button.addEventListener('click', () => { if (!running) { mode = button.dataset.mode as InputMode; updateControls() } })
}
fixtureSelect.addEventListener('change', () => { if (!running) void reset(fixtureSelect.value as Fixture).catch(showError) })
element('#reset').addEventListener('click', () => { if (!running) void reset(fixture).catch(showError) })
element('#clear').addEventListener('click', () => {
  if (running) return
  if (mode === 'highlight') apply({ type: 'highlight', digit: null })
  else applyActions(state.selected.map((cell): Action => mode === 'color' ? { type: 'color', cell, color: 0 } : { type: 'value', cell, digit: 0 }))
})

let mouseDrag = false
let movedSelection = false
root.addEventListener('pointerdown', event => {
  if (running || touches.size > 1 || zoomView.scale > 1 || event.button !== 0) return
  const cell = (event.target as Element).closest<HTMLElement>('[data-cell]')
  if (!cell) return
  mouseDrag = true
  movedSelection = false
  apply({ type: 'select', cell: Number(cell.dataset.cell), extend: event.shiftKey })
})
root.addEventListener('pointermove', event => {
  if (!mouseDrag || running || touches.size > 1 || zoomView.scale > 1) return
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-cell]')
  if (cell && root.contains(cell) && !state.selected.includes(Number(cell.dataset.cell))) {
    movedSelection = true
    apply({ type: 'select', cell: Number(cell.dataset.cell), extend: true })
  }
})
window.addEventListener('pointerup', () => { mouseDrag = false })
window.addEventListener('pointercancel', () => { mouseDrag = false })
root.addEventListener('click', event => {
  if (running || gestureConsumed) { gestureConsumed = false; return }
  const cell = (event.target as Element).closest<HTMLElement>('[data-cell]')
  if (!cell) return
  const index = Number(cell.dataset.cell)
  const candidate = (event.target as Element).closest<HTMLElement>('.board-candidate')
  if (mode === 'color' && candidate) {
    const digit = Number(candidate.textContent)
    apply({ type: 'candidate-color', cell: index, digit, color: state.candidateColors[index]?.[digit] === color ? 0 : color })
  } else if (!movedSelection && (state.active !== index || (!event.shiftKey && state.selected.length !== 1))) {
    apply({ type: 'select', cell: index, extend: event.shiftKey })
  }
  movedSelection = false
})
root.addEventListener('keydown', event => {
  if (running) return
  const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }
  if (event.key in offsets) {
    event.preventDefault()
    const cell = Math.max(0, Math.min(80, state.active + offsets[event.key]))
    apply({ type: 'select', cell, extend: event.shiftKey })
    requestAnimationFrame(() => root.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus({ preventScroll: true }))
  } else if (/^[1-9]$/.test(event.key)) {
    event.preventDefault()
    const digit = Number(event.key)
    if (event.altKey) apply({ type: 'candidate-color', cell: state.active, digit, color })
    else if (event.ctrlKey || event.metaKey) apply({ type: 'candidate', cell: state.active, digit })
    else enter(digit)
  } else if (['Backspace', 'Delete', '0'].includes(event.key)) {
    event.preventDefault()
    applyActions(state.selected.map(cell => ({ type: 'value', cell, digit: 0 })))
  }
})

// Common direct-DOM zoom, following usePuzzleZoom.ts. Renderer switches do not change this path.
type Point = { x: number; y: number }
let zoomView = { scale: 1, x: 0, y: 0 }
const touches = new Map<number, Point>()
let gesture: { distance: number; scale: number; anchor: Point } | { start: Point; view: typeof zoomView } | null = null
let gestureConsumed = false
const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
function applyZoom(scale: number, x: number, y: number) {
  const width = viewport.clientWidth
  const height = viewport.clientHeight
  zoomView = { scale, x: Math.min(0, Math.max(width * (1 - scale), x)), y: Math.min(0, Math.max(height * (1 - scale), y)) }
  zoomContent.style.transform = scale > 1 ? `translate3d(${zoomView.x}px, ${zoomView.y}px, 0) scale(${scale})` : ''
  zoomInput.value = String(scale)
  element('#zoom-value').textContent = `${Math.round(scale * 100)}%`
}
function startGesture() {
  const [first, second] = touches.values()
  if (!first) { gesture = null; return }
  if (second) {
    const rect = viewport.getBoundingClientRect()
    const center = midpoint(first, second)
    gesture = { distance: Math.max(1, distance(first, second)), scale: zoomView.scale,
      anchor: { x: (center.x - rect.left - zoomView.x) / zoomView.scale, y: (center.y - rect.top - zoomView.y) / zoomView.scale } }
  } else gesture = { start: first, view: { ...zoomView } }
}
viewport.addEventListener('pointerdown', event => {
  if (running || event.pointerType !== 'touch') return
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
  startGesture()
  if (touches.size > 1 || zoomView.scale > 1) viewport.setPointerCapture(event.pointerId)
}, true)
viewport.addEventListener('pointermove', event => {
  if (running || !touches.has(event.pointerId) || !gesture) return
  const point = { x: event.clientX, y: event.clientY }
  touches.set(event.pointerId, point)
  if ('distance' in gesture) {
    const [a, b] = touches.values()
    if (!a || !b) return
    const rect = viewport.getBoundingClientRect()
    const center = midpoint(a, b)
    const scale = Math.max(1, Math.min(3, gesture.scale * distance(a, b) / gesture.distance))
    applyZoom(scale, center.x - rect.left - gesture.anchor.x * scale, center.y - rect.top - gesture.anchor.y * scale)
    gestureConsumed = true
  } else if (gesture.view.scale > 1) {
    applyZoom(gesture.view.scale, gesture.view.x + point.x - gesture.start.x, gesture.view.y + point.y - gesture.start.y)
    gestureConsumed = true
  }
  if (gestureConsumed) event.preventDefault()
}, { capture: true, passive: false })
for (const name of ['pointerup', 'pointercancel'] as const) viewport.addEventListener(name, event => {
  touches.delete(event.pointerId)
  startGesture()
}, true)
zoomInput.addEventListener('input', () => { if (!running) applyZoom(Number(zoomInput.value), 0, 0) })
widthInput.addEventListener('input', () => {
  if (running) return
  element('.play-column').style.setProperty('--lab-width', `${widthInput.value}px`)
  element('#width-value').textContent = `${widthInput.value} px`
  resetZoom()
})

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const showMotion = () => { element('#motion-status').textContent = reducedMotion.matches ? 'Reduced motion' : 'Full animations' }
showMotion()
reducedMotion.addEventListener('change', showMotion)

// Result rendering stays outside the board and outside timed samples.
function showResults(report: ComparisonReport) {
  latestReport = report
  progress.textContent = `Complete. ${report.parity.snapshotsChecked.toLocaleString()} matching board states checked.`
  element('#results').hidden = false
  const container = element('#results-table')
  const table = document.createElement('table')
  const header = table.createTHead().insertRow()
  for (const label of ['Action', 'Implementation', 'DOM median', 'DOM p95', 'Next frame median']) {
    const cell = document.createElement('th')
    cell.scope = 'col'
    cell.textContent = label
    header.append(cell)
  }
  const names: Record<Implementation, string> = { 'current-react': 'Current React', 'memo-react': 'Memoized React', solid: 'Solid 2.0' }
  const workloads = { selection: 'Selection', 'candidate-toggle': 'Candidate notes', 'value-entry': 'Digit entry', 'dense-highlight': 'Dense highlights' }
  const body = table.createTBody()
  for (const summary of report.summaries) {
    const row = body.insertRow()
    for (const value of [workloads[summary.workload], names[summary.implementation],
      `${summary.commitMs.median.toFixed(2)} ms`, `${summary.commitMs.p95.toFixed(2)} ms`, `${summary.nextFrameMs.median.toFixed(2)} ms`]) {
      row.insertCell().textContent = value
    }
  }
  container.replaceChildren(table)
}

runButton.addEventListener('click', async () => {
  if (running) return
  running = true
  lab.dataset.running = ''
  runButton.disabled = true
  delete progress.dataset.error
  resetZoom()
  try {
    const report = await runComparison(api, { samples: 60, rounds: 3, onProgress: message => { progress.textContent = message } })
    showResults(report)
    progress.textContent = 'Complete. All compared board states matched.'
  } catch (error) { showError(error) }
  finally { running = false; delete lab.dataset.running; runButton.disabled = false }
})
element('#download').addEventListener('click', () => {
  if (!latestReport) return
  const url = URL.createObjectURL(new Blob([JSON.stringify(latestReport, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'sudoku-board-comparison.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

declare global {
  interface Window {
    sudokuPrototype: PrototypeApi
    runSudokuComparison: (options?: Parameters<typeof runComparison>[1]) => ReturnType<typeof runComparison>
  }
}
window.sudokuPrototype = api
window.runSudokuComparison = async options => {
  const report = await runComparison(api, options)
  showResults(report)
  return report
}
updateControls()
api.ready = setImplementation('current-react')
void api.ready.catch(showError)
