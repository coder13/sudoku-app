import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { renderedElements } from './component-tree.ts'

let server: ViteDevServer
let Board: (props: Record<string, unknown>) => ReactNode
let ModeBadge: (props: Record<string, unknown>) => ReactNode
let Controls: (props: Record<string, unknown>) => ReactNode
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
  ;({ ModeBadge } = await server.ssrLoadModule('/src/components/ModeBadge.tsx'))
  ;({ Controls } = await server.ssrLoadModule('/src/components/Controls.tsx'))
  const [general, appearance, panels] = await Promise.all([
    server.ssrLoadModule('/src/components/SettingsGeneral.tsx'),
    server.ssrLoadModule('/src/components/SettingsAppearance.tsx'),
    server.ssrLoadModule('/src/components/SettingsPanels.tsx'),
  ])
  settings = { ...general, ...appearance, ...panels } as typeof settings
  preferences = await server.ssrLoadModule('/src/sudoku/preferences.ts')
})

after(async () => { await server?.close() })

test('home and saved puzzle URLs render the same blank loading shell before device data', async () => {
  const { getRouter } = await server.ssrLoadModule('/src/router.tsx') as typeof import('../src/router.tsx')

  async function renderHome(path: string) {
    const router = getRouter()
    router.update({ ...router.options, history: createMemoryHistory({ initialEntries: [path] }) })
    await router.load()
    return renderToStaticMarkup(createElement(RouterProvider, { router }))
  }

  const home = await renderHome('/')
  const savedPuzzle = await renderHome('/?puzzle=saved-puzzle')
  const openingTag = /<main\b[^>]*>/
  const homeMain = home.match(openingTag)?.[0]
  assert.match(homeMain ?? '', /startup-loading/)
  assert.match(homeMain ?? '', /aria-busy="true"/)
  assert.equal(savedPuzzle.match(openingTag)?.[0], homeMain)
  for (const markup of [home, savedPuzzle]) {
    assert.match(markup, /class="startup-progress" role="progressbar" aria-label="Loading puzzles"/)
    assert.doesNotMatch(markup, /class="[^"]*\bpuzzles-(?:home|page)\b|id="sudoku-workspace"/)
  }
})

function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...Object.values(node.props).flatMap(elements)]
}

function boardTree(props: Record<string, unknown>) {
  const tree = renderedElements(Board, {
    givens: '0'.repeat(81), values: '0'.repeat(81), showGuides: true,
    candidates: [3, 3, ...Array(79).fill(0)], ...props,
  })
  const size = (props.grid as { size: number } | undefined)?.size ?? 9
  const region = props.region as { rows: number; columns: number } | undefined
  assert.equal(tree.filter(({ props }) => props.role === 'gridcell').length,
    (region?.rows ?? size) * (region?.columns ?? size), 'Every visible cell must be rendered and inspected')
  return tree
}

test('connected selections render a single outline without borders along shared edges', () => {
  const cells = boardTree({
    grid: { size: 4, boxRows: 2, boxColumns: 2 },
    givens: '0'.repeat(16), values: '0'.repeat(16), selected: [0, 1, 4],
  }).filter(({ props }) => props.role === 'gridcell')
  const byIndex = new Map(cells.map(({ props }) => [props['data-cell'], props]))
  assert.equal(byIndex.get(0)?.['data-selection-edge'], 'top left')
  assert.equal(byIndex.get(1)?.['data-selection-edge'], 'top right bottom')
  assert.equal(byIndex.get(4)?.['data-selection-edge'], 'right bottom left')
  assert.match(String((byIndex.get(0)?.style as { boxShadow?: string }).boxShadow), /inset 0 2px 0.*inset 2px 0 0/)
  assert.doesNotMatch(String((byIndex.get(1)?.style as { boxShadow?: string }).boxShadow), /inset 2px 0 0/)
})

test('imported cell colors retain each named shade and yield to conflicts and hidden player visuals', () => {
  const position = { center: Array(81).fill(0), corner: Array(81).fill(0),
    importedCellColors: { 0: ['blueHeavy', 'yellow'], 1: ['cyan'], 2: ['green'] } }
  const cells = (showPlayerColors: boolean) => boardTree({ position, showPlayerColors, selected: [0], errors: new Set([2]) })
    .filter(({ props }) => props.role === 'gridcell')
  const [multi, single, conflict] = cells(true).map(({ props }) => props)
  assert.match(String(multi['aria-label']), /Cell colors deep blue, yellow/)
  assert.match(String(multi.className), /imported-colors.*selected/)
  assert.match((multi.style as { '--imported-cell-colors': string })['--imported-cell-colors'], /#a1d5f7.*0% 50%.*#f7f7c5.*50% 100%/)
  assert.equal((single.style as { '--tone': string })['--tone'], '#c5f7f5')
  assert.equal(conflict.style, undefined)
  assert.match(String(conflict.className), /conflict/)
  assert.doesNotMatch(String(cells(false)[0].props['aria-label']), /Cell colors/)
  const importedOnly = boardTree({ position: { ...position, colors: [0, 0, 0, 2] }, showPlayerColors: false, showImportedAnnotations: true })
    .filter(({ props }) => props.role === 'gridcell')
  assert.match(String(importedOnly[0].props['aria-label']), /Cell colors/)
  assert.doesNotMatch(String(importedOnly[3].props['aria-label']), /Peach/)
})

test('Fog shows authored cell colors only after reveal and player colors can cover them', () => {
  const entries = '0'.repeat(81)
  const puzzle = { version: 1, givens: entries }
  const position = { center: Array(81).fill(0), corner: Array(81).fill(0), importedCellColors: { 1: ['yellow'] } }
  const cells = (revealed: boolean, showImportedAnnotations = true) => boardTree({
    variantPuzzle: puzzle, position, showImportedAnnotations,
    fog: { entries, puzzle, cells: new Set(revealed ? [0, 1] : [0]), cellColors: { 0: ['grey'], 1: ['red'] } },
  }).filter(({ props }) => props.role === 'gridcell').map(({ props }) => props)

  const [grey, covered] = cells(false)
  assert.match(String(grey['aria-label']), /Cell colors grey/)
  assert.equal((grey.style as { '--tone': string })['--tone'], '#e2e2e2')
  assert.match(String(covered['aria-label']), /covered by fog/)
  assert.doesNotMatch(String(covered['aria-label']), /\b(?:grey|red|yellow)\b|Cell colors/)
  assert.equal(covered.style, undefined)

  const [, playerFill] = cells(true)
  assert.match(String(playerFill['aria-label']), /Cell colors yellow/)
  const [, authoredFill] = cells(true, false)
  assert.match(String(authoredFill['aria-label']), /Cell colors red/)
  assert.equal((authoredFill.style as { '--tone': string })['--tone'], '#f7c5c5')
})

test('imported candidate colors label and shade visible digits in read-only and painting views', () => {
  const position = { center: [2, ...Array(80).fill(0)], corner: [0, 16, ...Array(79).fill(0)],
    importedCandidateColors: { 0: { 2: 'blueHeavy', 9: 'orangeHeavy' }, 1: { 5: 'cyan' } } }
  const props = { position, candidates: undefined, candidateLayout: 'center-corner', showPlayerColors: false, showImportedAnnotations: true }
  const readOnly = boardTree(props)
  const shaded = readOnly.filter(({ props }) => String(props.className).includes('imported-candidate-color'))
  assert.deepEqual(shaded.map(({ props }) => props.children), [2, 5])
  assert.deepEqual(shaded.map(({ props }) => (props.style as { '--imported-candidate-tone': string })['--imported-candidate-tone']),
    ['#a1d5f7', '#c5f7f5'])
  assert.match(String(readOnly.find(({ props }) => props.role === 'gridcell')?.props['aria-label']), /2 deep blue/)

  const painted = boardTree({ ...props, onPaintCandidate() {} })
  const buttons = painted.filter(({ props }) => String(props.className).includes('paint-candidate'))
  assert.deepEqual(buttons.map(({ props }) => props['aria-label']), ['2 in row 1, column 1, deep blue color', '5 in row 1, column 2, cyan color'])
  assert.ok(buttons.every(({ props }) => String((props.children as ReactElement<{ className: string }>).props.className).includes('imported-candidate-color')))
  assert.ok(!boardTree({ ...props, showImportedAnnotations: false }).some(({ props }) => String(props.className).includes('imported-candidate-color')))
})

test('Quick Draw keeps lines and symbols aligned with the imported grid and its crop', () => {
  const position = {
    center: Array(81).fill(0), corner: Array(81).fill(0),
    importedDrawings: [
      { shape: 'line', from: [.5, .5], to: [2, 3], color: 'blueHeavy' },
      { shape: 'cross', at: [1, 1.5], color: 'redHeavy' },
      { shape: 'circle', at: [2.5, 2.5], color: 'cyan' },
      { shape: 'square', at: [4.5, 4.5], color: 'green' },
    ],
  }
  const draw = (props = {}) => renderToStaticMarkup(createElement(Board, {
    givens: '0'.repeat(81), values: '0'.repeat(81), position, showGuides: true, ...props,
  }))
  const full = draw()
  assert.match(full, /class="board-quick-draw" viewBox="0 0 9 9"[^>]*role="img" aria-label="Imported Quick Draw annotations"/)
  assert.match(full, /deep blue line from row 1, column 1 to grid coordinates 2, 3/)
  assert.match(full, /<line x1="0.5" y1="0.5" x2="2" y2="3"/)
  assert.match(full, /<path d="M 0.9 1.4 L 1.1 1.6 M 0.9 1.6 L 1.1 1.4"/)
  assert.match(full, /<circle cx="2.5" cy="2.5" r=".3"/)
  assert.match(full, /<rect x="4.2" y="4.2" width=".6" height=".6"/)
  assert.match(draw({ region: { row: 1, column: 2, rows: 3, columns: 4 } }), /class="board-quick-draw" viewBox="2 1 4 3" data-cropped="true"/)
  assert.doesNotMatch(draw({ showImportedAnnotations: false }), /board-quick-draw/)
  assert.match(draw({ overlay: { content: 'Paused', visible: true } }), /class="board-quick-draw"[^>]*aria-hidden="true"/)
})

test('the shared grid uses 4×4 coordinates, box edges and candidate slots for Mini Sudoku', () => {
  const tree = boardTree({
    grid: { size: 4, boxRows: 2, boxColumns: 2 },
    givens: '0000000000000000', values: '0000000000000000',
    candidates: [9, ...Array(15).fill(0)], selected: [0], onCandidate() {},
  })
  const rows = tree.filter(({ props }) => props.role === 'row')
  const cells = tree.filter(({ props }) => props.role === 'gridcell')
  assert.equal(rows.length, 4)
  assert.equal(cells.length, 16)
  assert.equal(rows[1].props['data-box-edge'], true)
  assert.equal(cells[1].props['data-box-edge'], true)
  assert.match(String(cells[15].props['aria-label']), /Row 4, column 4/)
  assert.match(String(cells[5].props.className), /\bpeer\b/)
  assert.doesNotMatch(String(cells[6].props.className), /\bpeer\b/)
  const buttons = tree.filter(({ props }) => String(props.className).includes('candidate-button'))
  assert.deepEqual(buttons.map(({ props }) => (props.style as { gridArea: string }).gridArea), ['1 / 1', '2 / 2'])
})

test('algebraic cages retain labels and cell descriptions on the 4×4 grid', () => {
  const tree = boardTree({
    grid: { size: 4, boxRows: 2, boxColumns: 2 }, givens: '0'.repeat(16), values: '0'.repeat(16),
    algebraicCages: [
      { type: 'algebraic-cage', cells: [4, 5], label: 'n+2', total: { type: 'variable', name: 'n', offset: 2 } },
      { type: 'algebraic-cage', cells: [8], label: 'n-1', total: { type: 'variable', name: 'n', offset: -1 } },
    ],
  })
  const cells = tree.filter(({ props }) => props.role === 'gridcell')
  assert.match(String(cells[4].props['aria-label']), /algebraic cage total n\+2/)
  assert.match(String(cells[5].props['aria-label']), /algebraic cage total n\+2/)
  assert.match(String(cells[8].props['aria-label']), /algebraic cage total n-1/)
  const labels = tree.filter(({ props }) => props.className === 'variant-cage-total')
  assert.deepEqual(labels.map(({ props }) => props.children), ['n+2', 'n-1'])
})

test('exact-one sized clue groups keep their Killer cage totals on the board', () => {
  const cage = { type: 'killer-cages', cages: [{ cells: [7, 13], sum: 6 }] }
  const tree = boardTree({
    grid: { size: 6, boxRows: 2, boxColumns: 3 }, givens: '0'.repeat(36), values: '0'.repeat(36),
    sizedRules: [{
      type: 'constraint-alternatives', family: 'killer-cages', choices: [[cage], [{ type: 'killer-cages', cages: [{ cells: [7, 13], sum: 12 }] }]],
      displayRules: [cage],
    }],
  })
  const cell = tree.find(({ props }) => props.role === 'gridcell' && props['data-cell'] === 7)
  assert.ok(cell)
  assert.match(String(cell.props['aria-label']), /cage total 6/)
})

test('mobile mode outline and badge attach to the Sudoku grid, not the card', () => {
  const boundary = { current: null }
  const badge = createElement('button', { className: 'puzzle-mode-tab', type: 'button' }, 'Drawing mode')
  const tree = boardTree({ modeBorder: 'pencil', modeBoundaryRef: boundary, modeBadge: badge })
  const body = tree.find(({ props }) => String(props.className) === 'board-body')
  assert.ok(body)
  assert.equal(body.props['data-input-mode'], 'pencil')
  assert.equal(typeof body.props.ref, 'function')
  ;(body.props.ref as (node: HTMLDivElement | null) => void)({} as HTMLDivElement)
  assert.ok(boundary.current)
  const children = elements(body.props.children)
  assert.ok(children.some(({ props }) => String(props.className).includes('sudoku-grid')))
  assert.ok(children.some(({ props }) => props.className === 'puzzle-mode-tab'))
  const frame = tree.find(({ props }) => String(props.className).startsWith('board-frame'))
  assert.equal(frame?.props['data-input-mode'], undefined)
  assert.equal(boardTree({}).find(({ props }) => props.className === 'board-body')?.props['data-input-mode'], undefined)
})

test('resizing the mobile grid does not clip its border-mounted mode icon', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const viewport = css.match(/\.puzzle-zoom\[data-resize-preview\]\s*\{([^}]*)\}/)?.[1]
  const content = css.match(/\.puzzle-zoom\[data-resize-preview\]\s+\.puzzle-zoom-content\s*\{([^}]*)\}/)?.[1]
  assert.ok(viewport, 'resize preview needs a viewport style')
  assert.ok(content, 'resize preview needs a content style')
  assert.match(viewport, /overflow:\s*visible/, 'allow the icon to extend beyond the grid border')
  assert.doesNotMatch(content, /\bpaint\b/, 'paint containment clips the mode icon')
  assert.match(content, /contain:\s*size layout/, 'keep layout containment during resizing')
})

test('showing and hiding the mode icon leaves the Sudoku grid structure unchanged', () => {
  const withoutBadge = boardTree({ modeBorder: 'pen' })
  const withBadge = boardTree({
    modeBorder: 'pen',
    modeBadge: createElement('button', { className: 'puzzle-mode-tab' }, 'Pen mode'),
  })
  const board = (tree: ReturnType<typeof boardTree>) =>
    tree.find(({ props }) => props.role === 'grid')
  assert.equal(withoutBadge.find(({ props }) => String(props.className) === 'board-body')?.props['data-input-mode'], 'pen')
  assert.equal(withBadge.find(({ props }) => String(props.className) === 'board-body')?.props['data-input-mode'], 'pen')
  assert.equal(board(withoutBadge)?.props.className, board(withBadge)?.props.className)
  assert.deepEqual(
    withoutBadge.filter(({ props }) => props.role === 'gridcell').map(({ props }) => props['data-cell']),
    withBadge.filter(({ props }) => props.role === 'gridcell').map(({ props }) => props['data-cell']),
  )
})

test('the floating badge shows the Color mode instead of disappearing', () => {
  const html = renderToStaticMarkup(createElement(ModeBadge, {
    mode: 'color', descriptionId: 'color-mode',
    cardRef: { current: null }, position: { edge: 'bottom', offset: .6 },
    onPosition() {}, onActivate() {},
  }))
  assert.match(html, /Color mode/)
  assert.match(html, /puzzle-mode-tab/)
  assert.match(html, /aria-label="Cycle input mode"/)
})

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

test('strong-link givens select a digit without selecting a cell or intercepting candidates', () => {
  const given = '5' + '0'.repeat(80)
  let highlightedDigit = 0
  let chosenCandidate: unknown = null
  const tree = boardTree({
    givens: given, values: given, selected: [],
    onCandidate: (candidate: unknown) => { chosenCandidate = candidate },
    onGiven: (digit: number) => { highlightedDigit = digit },
  })
  const cells = tree.filter(({ props }) => props.role === 'gridcell')
  assert.equal(cells[0].type, 'button')
  assert.equal(cells[0].props.tabIndex, 0)
  assert.equal(cells[0].props['aria-selected'], false)
  assert.equal(cells[1].type, 'div')
  assert.equal(cells[1].props.onClick, undefined)
  ;(cells[0].props.onClick as () => void)()
  assert.equal(highlightedDigit, 5)
  assert.equal(chosenCandidate, null)

  const candidate = tree.find(({ props }) => String(props.className).includes('candidate-button'))!
  ;(candidate.props.onClick as () => void)()
  assert.deepEqual(chosenCandidate, { cell: 1, digit: 1 })
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
    hasAttribute(name: string) { return name === 'data-candidate-button' }
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

test('Highlighting settings only offer automatic highlight toggles', () => {
  const html = renderToStaticMarkup(createElement(settings.HighlightSettings, {
    highlighting: preferences.DEFAULT_HIGHLIGHT_PREFERENCES, setHighlighting() {},
  }))
  assert.equal(html.match(/type="checkbox"/g)?.length, 3)
  assert.doesNotMatch(html, /type="radio"/)
})

test('candidate tools highlight individual candidates and preserve their annotations', () => {
  const tree = boardTree({ highlightedDigitMask: 1, highlightedDigitMatch: 'any',
    annotations: { candidates: new Map([[0, new Map([[1, { color: 'red', mark: 'strike', label: 'can be removed' }]])]]) },
  })
  assert.ok(!tree.some(({ props }) => String(props.className).includes('candidate-highlight-mixed')))
  const matches = tree.filter(({ props }) => String(props.className).includes('candidate-match'))
  assert.deepEqual(matches.map(({ props }) => props.children), [1, 1])
  assert.equal(matches[0].props['data-mark'], 'strike')
})

test('Any tints individual matches in mixed cells while All fills cells with every selected candidate', () => {
  const highlight = (highlightedDigitMatch: 'any' | 'all', fullCandidateCellHighlight = false) => {
    const tree = boardTree({
      candidates: [1, 3, 7, 5, 4, ...Array(76).fill(0)], highlightedDigitMask: 3,
      highlightedDigitMatch, highlightCandidateCells: true, fullCandidateCellHighlight,
    })
    return {
      cells: tree.filter(({ props }) => props.role === 'gridcell').slice(0, 5).map(({ props }) => props),
      digits: tree.filter(({ props }) => String(props.className).split(' ').includes('candidate-match'))
        .map(({ props }) => props.children),
    }
  }
  const fills = (cells: ReturnType<typeof highlight>['cells']) => cells.map(({ className }) =>
    String(className).split(' ').includes('candidate-highlight-cell'))

  const any = highlight('any')
  assert.deepEqual(fills(any.cells), [true, true, false, false, false])
  assert.deepEqual(any.digits, [1, 2, 1])
  assert.match(String(any.cells[2]['aria-label']), /candidates 1, 2 highlighted/)

  const all = highlight('all')
  assert.deepEqual(fills(all.cells), [false, true, true, false, false])
  assert.deepEqual(all.digits, [])

  const links = highlight('any', true)
  assert.deepEqual(fills(links.cells), [true, true, true, true, false])
  assert.deepEqual(links.digits, [])
})

test('the play grid can fill cells that contain a candidate matching the selected digit', () => {
  const highlight = (matchingCandidates: boolean) => boardTree({
    candidates: [3, 2, ...Array(79).fill(0)], highlightedDigit: 1, highlightCandidateCells: true,
    highlighting: { ...(preferences.DEFAULT_HIGHLIGHT_PREFERENCES as object), matchingCandidates },
  })
  const tree = highlight(true)
  const [match, other] = tree.filter(({ props }) => props.role === 'gridcell')
  assert.match(String(match.props.className), /\bcandidate-highlight-cell\b/)
  assert.match(String(match.props['aria-label']), /cell highlighted for candidate 1/)
  assert.doesNotMatch(String(other.props.className), /\bcandidate-highlight-cell\b/)
  assert.ok(!tree.some(({ props }) => String(props.className).includes('candidate-match')))
  assert.ok(!highlight(false).some(({ props }) => String(props.className).includes('candidate-highlight-cell')))
})

test('desktop and mobile workspace-mode controls use independent radio groups', () => {
  assertIndependentGroups(radioGroups('AppearanceSettings', {
    appearance: preferences.DEFAULT_APPEARANCE, setAppearance() {}, inputSize: 210, setInputSize() {},
    workspaceMode: 'standard', setWorkspaceMode() {},
  }), 2)
})

test('puzzle Undo and Redo stay enabled during chain drawing when history exists', () => {
  const defaults = {
    digits: { mode: 'value', pencil: false, candidateKind: 'center', setCandidateKind() {},
      selectedDigit: null, hasCellSelection: false, values: '0'.repeat(81), input() {} },
    tools: { togglePencil() {}, colorMode: false, colorTarget: 'cell', setColorTarget() {}, onSwitchShade() {},
      eraseMode: false, toggleEraseMode() {}, highlightMode: false, toggleHighlightMode() {},
      multi: false, toggleMulti() {}, chainDrawing: true },
    history: { undo() {}, redo() {}, canUndo: true, canRedo: true },
    actions: {},
    layout: { advancedModes: preferences.DEFAULT_ADVANCED_MODES, compact: true, disabled: false, draft: false,
      inputSize: 210, panelHeight: 280, setPanelHeight() {}, beginResize() {} },
  }
  const buttonTag = (html: string, label: string) => [...html.matchAll(/<button\b[^>]*>/g)]
    .map(([tag]) => tag).find(tag => tag.includes(`aria-label="${label}"`)) ?? ''

  const available = renderToStaticMarkup(createElement(Controls, defaults))
  assert.doesNotMatch(buttonTag(available, 'Undo'), /(?:^|\s)disabled(?:\s|=|>)/)
  assert.doesNotMatch(buttonTag(available, 'Redo'), /(?:^|\s)disabled(?:\s|=|>)/)

  const noHistory = renderToStaticMarkup(createElement(Controls, { ...defaults,
    history: { ...defaults.history, canUndo: false, canRedo: false } }))
  assert.match(buttonTag(noHistory, 'Undo'), /(?:^|\s)disabled(?:\s|=|>)/)
  assert.match(buttonTag(noHistory, 'Redo'), /(?:^|\s)disabled(?:\s|=|>)/)

  const locked = renderToStaticMarkup(createElement(Controls, { ...defaults,
    layout: { ...defaults.layout, disabled: true } }))
  assert.match(buttonTag(locked, 'Undo'), /(?:^|\s)disabled(?:\s|=|>)/)
  assert.match(buttonTag(locked, 'Redo'), /(?:^|\s)disabled(?:\s|=|>)/)
})
