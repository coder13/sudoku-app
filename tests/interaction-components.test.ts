import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'

let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode
let settings: Record<string, (props: Record<string, unknown>) => ReactNode>
let preferences: Record<string, unknown>

before(async () => {
  server = await createServer({
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  ;({ Board } = await server.ssrLoadModule('/src/components/Board.tsx'))
  settings = await server.ssrLoadModule('/src/components/Settings.tsx')
  preferences = await server.ssrLoadModule('/src/sudoku/preferences.ts')
})

after(async () => { await server?.close() })

function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...Object.values(node.props).flatMap(elements)]
}

function boardTree(props: Record<string, unknown>) {
  let tree: ReactNode
  function RenderBoard() {
    tree = Board({
      givens: '0'.repeat(81), values: '0'.repeat(81), showGuides: true,
      candidates: [3, 3, ...Array(79).fill(0)], ...props,
    })
    return tree
  }
  renderToStaticMarkup(createElement(RenderBoard))
  return elements(tree!)
}

test('chain drawing exposes a keyboard tab stop and accepts keyboard candidate activation', () => {
  const selected: unknown[] = []
  const tree = boardTree({ onCandidate: (candidate: unknown) => selected.push(candidate) })
  const candidates = tree.filter(({ props }) => String(props.className).includes('candidate-button'))
  assert.equal(candidates.length, 4)
  assert.equal(candidates.filter(({ props }) => props.tabIndex === 0).length, 1)
  const first = candidates.find(({ props }) => props.tabIndex === 0)!
  ;(first.props.onClick as (event: unknown) => void)({ detail: 0 })
  assert.deepEqual(selected, [{ cell: 0, digit: 1 }])
  assert.equal(typeof tree.find(({ props }) => props.role === 'grid')?.props.onKeyDown, 'function')
})

test('candidate coloring retains its keyboard tab stop and activation', () => {
  const painted: unknown[] = []
  const tree = boardTree({ onPaintCandidate: (candidate: unknown) => painted.push(candidate) })
  const candidates = tree.filter(({ props }) => String(props.className).includes('candidate-button'))
  const first = candidates.find(({ props }) => props.tabIndex === 0)!
  ;(first.props.onClick as (event: unknown) => void)({ detail: 0 })
  assert.deepEqual(painted, [{ cell: 0, digit: 1 }])
})

test('chain candidate arrows and Home/End move focus without leaking grid key events', () => {
  let focused = -1
  class CandidateButton {
    readonly index: number
    readonly x: number
    readonly y: number
    constructor(index: number, x: number, y: number) { this.index = index; this.x = x; this.y = y }
    matches() { return true }
    closest() { return null }
    getBoundingClientRect() { return { x: this.x, y: this.y } }
    focus() { focused = this.index }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'HTMLButtonElement')
  Object.defineProperty(globalThis, 'HTMLButtonElement', { configurable: true, value: CandidateButton })
  try {
    const tree = boardTree({ onCandidate() {} })
    const keyDown = tree.find(({ props }) => props.role === 'grid')!.props.onKeyDown as (event: unknown) => void
    const buttons = [new CandidateButton(0, 0, 0), new CandidateButton(1, 10, 0), new CandidateButton(2, 0, 10)]
    for (const [key, expected] of [['ArrowRight', 1], ['ArrowDown', 2], ['Home', 0], ['End', 2]] as const) {
      let prevented = false
      keyDown({
        key, target: buttons[0], currentTarget: { querySelectorAll: () => buttons },
        preventDefault() { prevented = true },
      })
      assert.equal(focused, expected, key)
      assert.equal(prevented, true, key)
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'HTMLButtonElement', original)
    else Reflect.deleteProperty(globalThis, 'HTMLButtonElement')
  }
})

function radioGroups(component: string, props: Record<string, unknown>) {
  const html = renderToStaticMarkup(createElement(Fragment, null,
    createElement(settings[component], props), createElement(settings[component], props)))
  return [...html.matchAll(/<input\b[^>]*type="radio"[^>]*>/g)].map(([tag]) => ({
    name: /\bname="([^"]+)"/.exec(tag)?.[1], checked: /\bchecked(?:=|\s|\/|>)/.test(tag),
  }))
}

function assertIndependentGroups(radios: ReturnType<typeof radioGroups>, options: number) {
  assert.equal(radios.length, options * 2)
  const groups = new Set(radios.map(({ name }) => name))
  assert.equal(groups.size, 2)
  assert.ok(!groups.has(undefined))
  for (const group of groups) {
    assert.equal(radios.filter(({ name }) => name === group).length, options)
    assert.equal(radios.filter(({ name, checked }) => name === group && checked).length, 1)
  }
}

test('desktop and mobile candidate-layout controls use independent radio groups', () => {
  assertIndependentGroups(radioGroups('GeneralSettings', {
    section: 'input', advancedModes: preferences.DEFAULT_ADVANCED_MODES,
    setAdvancedModes() {}, draft: false, errorMode: 'all', setErrorMode() {},
    cellReferenceStyle: 'automatic', setCellReferenceStyle() {},
  }), 2)
})

test('desktop and mobile candidate-highlight controls use independent radio groups', () => {
  assertIndependentGroups(radioGroups('HighlightSettings', {
    highlighting: preferences.DEFAULT_HIGHLIGHT_PREFERENCES, setHighlighting() {},
  }), 4)
})

test('desktop and mobile workspace-mode controls use independent radio groups', () => {
  assertIndependentGroups(radioGroups('AppearanceSettings', {
    appearance: preferences.DEFAULT_APPEARANCE, setAppearance() {}, inputSize: 210, setInputSize() {},
    workspaceMode: 'standard', setWorkspaceMode() {},
  }), 2)
})
