import '@fontsource-variable/dm-sans'
import '../../../src/styles.css'
import './harness.css'
import { createRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Board as BaselineBoard } from '../baseline/Board'
import { Board as OptimizedBoard } from '../../../src/components/Board'
import { applyTheme } from '../../../src/sudoku/themes'
import { runComparison, type BoardBenchmarkApi, type ComparisonOptions } from './benchmark'
import { createFixture, reduceAction, type Action, type BoardState, type Implementation } from './model'
import { propsFromState, scenarios, type BoardProps } from './fixtures'

applyTheme(document.documentElement, 'violet', 'light')
const root = document.querySelector<HTMLElement>('#board-root')!
const button = document.querySelector<HTMLButtonElement>('#action')!
const status = document.querySelector<HTMLElement>('#status')!
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const settle = async () => { await frame(); await frame() }
let implementation: Implementation = 'baseline'
let state: BoardState = createFixture()
let props = propsFromState(state)
let reactRoot: Root | undefined
let setCurrent: ((next: BoardProps) => void) | undefined
let queued: (() => void) | undefined

button.addEventListener('click', () => { const action = queued; queued = undefined; action?.() })
function dispatchProps(next: BoardProps) {
  queued = () => { props = next; setCurrent?.(next) }
  button.click()
}
async function mount(next: Implementation, nextProps = props) {
  reactRoot?.unmount()
  root.replaceChildren()
  implementation = next
  props = nextProps
  setCurrent = undefined
  const Component = next === 'baseline' ? BaselineBoard : OptimizedBoard
  function Host() {
    const [current, setProps] = useState(props)
    setCurrent = setProps
    return <Component {...current} />
  }
  reactRoot = createRoot(root)
  reactRoot.render(<Host />)
  const start = performance.now()
  while (!root.querySelector('[role="grid"]')) {
    if (performance.now() - start > 3000) throw new Error(`${next} failed to mount.`)
    await frame()
  }
  await settle()
  status.textContent = `${next}: full production Board`
}

type NormalNode = string | { tag: string; attributes: Record<string, string>; children: NormalNode[] }
function snapshot(includeFades = false): NormalNode[] {
  const ids = new Map([...root.querySelectorAll('[id]')].map((element, index) => [element.id, `local-id-${index}`]))
  function normalize(node: Node): NormalNode | null {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() || null
    if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) return null
    if (!includeFades && node.getAttribute('data-board-fade') === 'exit') return null
    const children = [...node.childNodes].map(normalize).filter((item): item is NormalNode => item !== null)
    if (!includeFades && node.classList.contains('candidate-marks') && !children.length) return null
    const attributes: Record<string, string> = {}
    for (const attr of [...node.attributes].sort((a, b) => a.name.localeCompare(b.name))) {
      if (!includeFades && attr.name === 'data-board-fade') continue
      let value = attr.name === 'class' ? attr.value.trim().split(/\s+/).filter(Boolean).sort().join(' ')
        : attr.name === 'style' ? [...node.style].sort().map(key => `${key}:${node.style.getPropertyValue(key).trim()}`).join(';') : attr.value
      if ((attr.name === 'class' || attr.name === 'style') && !value) continue
      if (attr.name === 'id' && ids.has(value)) value = ids.get(value)!
      else for (const [id, replacement] of ids) value = value.split(`url(#${id})`).join(`url(#${replacement})`)
      attributes[attr.name] = value
    }
    return { tag: node.tagName.toLowerCase(), attributes, children }
  }
  return [...root.childNodes].map(normalize).filter((node): node is NormalNode => node !== null)
}

const api: BoardBenchmarkApi = {
  setImplementation: next => mount(next),
  async reset(fixture) { state = createFixture(fixture); await mount(implementation, propsFromState(state)) },
  dispatch(action: Action) { state = reduceAction(state, action); dispatchProps(propsFromState(state)) },
  getState: () => state, getImplementation: () => implementation, getRoot: () => root, snapshot,
}

function difference(expected: string, actual: string) {
  let index = 0
  while (index < Math.min(expected.length, actual.length) && expected[index] === actual[index]) index++
  return `at ${index}; baseline ${expected.slice(Math.max(0, index - 100), index + 250)}; optimized ${actual.slice(Math.max(0, index - 100), index + 250)}`
}

async function runRegression(options: { motionOnly?: boolean; pressKey?: (key: string) => Promise<void> } = {}) {
  await api.ready
  const reference = new Map<string, string>()
  const checked: string[] = []
  const cases: { id: string; checks: number }[] = []
  const compare = (key: string, value: unknown = snapshot()) => {
    const actual = JSON.stringify(value)
    if (implementation === 'baseline') reference.set(key, actual)
    else {
      const expected = reference.get(key)
      if (expected === undefined) throw new Error(`Missing baseline ${key}`)
      if (expected !== actual) throw new Error(`Regression ${key}: ${difference(expected, actual)}`)
      checked.push(key)
    }
  }

  if (!options.motionOnly) {
    for (const scenario of scenarios()) {
      for (const variant of ['baseline', 'optimized'] as const) {
        await mount(variant, scenario.states[0])
        compare(`${scenario.id}:initial`)
        for (const [index, next] of scenario.states.slice(1).entries()) {
          dispatchProps(next)
          await settle()
          compare(`${scenario.id}:${index}`)
        }
      }
      cases.push({ id: scenario.id, checks: scenario.states.length })
    }

    for (const variant of ['baseline', 'optimized'] as const) {
      const calls: unknown[] = []
      const cell = () => root.querySelector<HTMLElement>('[data-cell="2"]')!
      const candidate = () => cell().querySelector<HTMLButtonElement>('.candidate-button:not([inert])')!
      const focused = () => {
        const element = document.activeElement as HTMLElement | null
        return element && root.contains(element) ? {
          cell: element.closest('[data-cell]')?.getAttribute('data-cell'), tag: element.tagName,
          label: element.getAttribute('aria-label'), digit: element.classList.contains('candidate-button') ? element.textContent : null,
        } : null
      }
      const callbacks = (version: string): Partial<BoardProps> => ({
        onCell: (index, event) => calls.push([version, 'cell', index, event.currentTarget.getAttribute('data-cell')]),
        onCellDoubleClick: (index, event) => calls.push([version, 'double', index, event.currentTarget.getAttribute('data-cell')]),
        onCellPointerDown: (index, event) => calls.push([version, 'down', index, event.currentTarget.getAttribute('data-cell')]),
        onCellPointerMove: (index, event) => calls.push([version, 'move', index, event.currentTarget.getAttribute('role')]),
        onGridPointerLeave: () => calls.push([version, 'leave']),
        onGridKeyDown: event => calls.push([version, 'key', event.key, event.currentTarget.getAttribute('role')]),
        onCandidateHover: value => calls.push([version, 'hover', value]),
        onLinkSelect: value => calls.push([version, 'link', value]),
      })
      const boardRef = createRef<HTMLDivElement>(), boundaryRef = createRef<HTMLDivElement>()
      let current: BoardProps = { ...propsFromState(createFixture('puzzle')), ...callbacks('first'), boardRef,
        modeBoundaryRef: boundaryRef, descriptionId: 'board-description' }
      await mount(variant, current)
      if (boardRef.current !== root.querySelector('.sudoku-grid') || boundaryRef.current !== root.querySelector('.board-body')) {
        throw new Error(`${variant} did not attach board refs.`)
      }
      cell().click()
      cell().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }))
      cell().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))
      const bounds = cell().getBoundingClientRect()
      cell().dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2 }))
      cell().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '1' }))
      compare('callbacks:initial', calls.slice())

      current = { ...current, ...callbacks('replacement') }
      dispatchProps(current)
      await settle()
      calls.length = 0
      cell().click()
      cell().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }))
      cell().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))
      cell().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '2' }))
      compare('callbacks:replaced', calls.slice())
      if (calls.some(call => (call as unknown[])[0] !== 'replacement')) throw new Error(`${variant} used a stale callback.`)

      current = { ...current, onCandidate: value => calls.push(['candidate-first', value]),
        isLinkTarget: value => value.digit === 1, selectedCandidate: { cell: 2, digit: 1 }, highlightCandidateCells: true }
      dispatchProps(current)
      await settle()
      calls.length = 0
      candidate().click()
      candidate().focus()
      await settle()
      compare('candidate:click', calls.slice())
      compare('candidate:focused-dom')
      compare('candidate:focus', focused())
      for (const key of ['End', 'Home', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
        document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }))
        await settle()
        compare(`candidate:key:${key}`, { focus: focused(), dom: snapshot() })
      }
      calls.length = 0
      candidate().dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }))
      candidate().dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }))
      candidate().dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'touch' }))
      compare('candidate:hover', calls.slice())

      current = { ...current, onCandidate: value => calls.push(['candidate-replacement', value]), isLinkTarget: value => value.digit === 4 }
      dispatchProps(current)
      await settle()
      calls.length = 0
      candidate().click()
      await settle()
      compare('candidate:replacement', { calls: calls.slice(), dom: snapshot() })
      if (!calls.some(call => (call as unknown[])[0] === 'candidate-replacement')) throw new Error(`${variant} missed candidate replacement.`)
      if (options.pressKey) {
        candidate().focus()
        await settle()
        calls.length = 0
        await options.pressKey('Enter')
        await settle()
        compare('candidate:keyboard-enter', calls.slice())
        if (!calls.some(call => (call as unknown[])[0] === 'candidate-replacement')) throw new Error(`${variant} missed keyboard candidate activation.`)
      }

      current = { ...current, onPaintCandidate: value => calls.push(['paint', value]) }
      dispatchProps(current)
      await settle()
      calls.length = 0
      candidate().click()
      await settle()
      compare('candidate:paint-priority', { calls: calls.slice(), dom: snapshot() })
      if (!calls.some(call => (call as unknown[])[0] === 'paint') || calls.some(call => (call as unknown[])[0] === 'candidate-replacement')) {
        throw new Error(`${variant} did not give painting priority.`)
      }
      if (options.pressKey) {
        candidate().focus()
        await settle()
        calls.length = 0
        await options.pressKey('Space')
        await settle()
        compare('candidate:keyboard-space-paint', calls.slice())
        if (!calls.some(call => (call as unknown[])[0] === 'paint')) throw new Error(`${variant} missed keyboard painting activation.`)
      }
      current = { ...current, onCell: undefined, onCandidate: undefined, onPaintCandidate: undefined, onCandidateHover: undefined, isLinkTarget: undefined }
      dispatchProps(current)
      await settle()
      compare('callbacks:removed')
      if (cell().tagName !== 'DIV' || cell().querySelector('.candidate-button')) throw new Error(`${variant} retained interactive cells.`)
      current = { ...current, onCell: callbacks('restored').onCell }
      dispatchProps(current)
      await settle()
      calls.length = 0
      cell().click()
      compare('callbacks:restored', { calls: calls.slice(), dom: snapshot() })
      if (cell().tagName !== 'BUTTON') throw new Error(`${variant} did not restore cell buttons.`)

      current = { ...current, annotations: { links: [{ from: { cell: 2, digit: 1 }, to: { cell: 3, digit: 1 },
        color: '#d35c83', arrow: true, selectFrom: { cell: 2, digit: 1 } }] } }
      dispatchProps(current)
      await settle()
      calls.length = 0
      root.querySelector('.board-link-target')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      compare('links:callback', calls.slice())
      compare('links:dom')
    }
    cases.push({ id: 'callbacks-focus-presence-and-refs', checks: checked.filter(key => /^(callbacks|candidate|links):/.test(key)).length })
  }

  if (options.motionOnly) {
    const initial = propsFromState(createFixture('puzzle'))
    const withoutOne = { ...initial, position: { ...initial.position!, center: initial.position!.center.map((mask, cell) => cell === 2 ? mask & ~1 : mask) } }
    const value = { ...initial, values: initial.values.slice(0, 2) + '4' + initial.values.slice(3) }
    const phases = () => [...root.querySelectorAll('[data-board-fade]')].map(element => ({
      cell: element.closest('[data-cell]')?.getAttribute('data-cell'), tag: element.tagName,
      className: [...element.classList].sort().join(' '), text: element.textContent,
      phase: element.getAttribute('data-board-fade'), hidden: element.getAttribute('aria-hidden'), inert: element.hasAttribute('inert'),
    }))
    for (const variant of ['baseline', 'optimized'] as const) {
      await mount(variant, initial)
      await delay(320)
      for (const [index, next] of [withoutOne, initial, value, initial].entries()) {
        dispatchProps(next)
        await settle()
        compare(`fades:${index}:live`)
        // Enter flags can persist until an unrelated render in production. The contract is the retained exit content and its inert semantics.
        compare(`fades:${index}:exits`, phases().filter(phase => phase.phase === 'exit'))
        await delay(320)
        compare(`fades:${index}:settled`)
        if (root.querySelector('[data-board-fade="exit"]')) throw new Error(`${variant} retained stale exit content.`)
      }
      for (const [id, changes] of [['value', [value, initial]], ['candidate', [withoutOne, initial]]] as const) {
        await mount(variant, initial)
        await delay(320)
        for (const next of changes) dispatchProps(next)
        await settle()
        compare(`burst:${id}:live`)
        compare(`burst:${id}:phases`, phases())
        if (root.querySelector('.cell-value[data-board-fade="exit"]')) throw new Error(`${variant} left a ghost value after a synchronous burst.`)
      }
    }
    cases.push({ id: 'normal-motion-exits-and-bursts', checks: checked.length })
  }
  await api.reset('puzzle')
  return { passed: true, baselineCommit: 'a2d91e72c15845d3a308effb84860e15973ddeea',
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, browserKeyboardActivation: Boolean(options.pressKey),
    checks: checked.length, cases, checked }
}

declare global {
  interface Window {
    boardPerformance: BoardBenchmarkApi
    runBoardComparison: (options?: ComparisonOptions) => ReturnType<typeof runComparison>
    runBoardRegression: typeof runRegression
  }
}
window.boardPerformance = api
window.runBoardComparison = options => runComparison(api, options)
window.runBoardRegression = runRegression
api.ready = mount('baseline')
void api.ready.catch(error => { status.textContent = String(error); console.error(error) })
