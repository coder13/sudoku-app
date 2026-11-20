import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'
import { EMPTY, enter, makeGame, redo, undo, type Game } from '../src/sudoku/game.ts'
import type { EngineRequest, EngineResponse } from '../src/sudoku/engine.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'

type Message = { id: number; request: EngineRequest }
class TestWorker {
  static all: TestWorker[] = []
  onmessage?: (event: { data: EngineResponse }) => void
  onerror?: () => void
  waiting: Message[] = []
  closed = false
  constructor() { TestWorker.all.push(this) }
  terminate() { this.closed = true }
  postMessage(message: Message) { assert.equal(this.closed, false); this.waiting.push(message) }
  reply(value: unknown) {
    const message = this.waiting.shift()
    assert.ok(message)
    this.onmessage?.({ data: { id: message.id, value } as EngineResponse })
  }
}

let server: ViteDevServer
let Worktable: (props: Record<string, unknown>) => ReactNode
let preferences: typeof import('../src/sudoku/preferences.ts')
let roomStore: typeof import('../src/sudoku/storage.ts').roomStore
let defaults: typeof import('../src/sudoku/play-preferences.ts').DEFAULT_PLAY_PREFERENCES
const previousGlobals = new Map<string, PropertyDescriptor | undefined>()

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ Worktable } = await server.ssrLoadModule('/src/components/Worktable.tsx'))
  preferences = await server.ssrLoadModule('/src/sudoku/preferences.ts')
  ;({ roomStore } = await server.ssrLoadModule('/src/sudoku/storage.ts'))
  ;({ DEFAULT_PLAY_PREFERENCES: defaults } = await server.ssrLoadModule('/src/sudoku/play-preferences.ts'))
  defaults.pinnedActions = ['candidates', 'check', 'hint']
  for (const [key, value] of Object.entries({ Worker: TestWorker, localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() })) {
    previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  }
})

after(async () => {
  roomStore?.flushElapsed()
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
  await server?.close()
})

function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...Object.values(node.props).flatMap(elements)]
}

function text(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(text).join('')
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : ''
}

function capture(game: Game, extra: Record<string, unknown> = {}) {
  // Exercise the real handlers and store guards. SSR does not run effect cleanup.
  let tree: ReactNode
  function Capture() {
    tree = Worktable({
      game, games: [game], preferredDifficulty: 'medium', modalOpen: false,
      advancedModes: preferences.DEFAULT_ADVANCED_MODES, appearance: preferences.DEFAULT_APPEARANCE,
      highlighting: preferences.DEFAULT_HIGHLIGHT_PREFERENCES, errorMode: 'none',
      cellReferenceStyle: 'concise', workspaceMode: 'advanced', multi: false, actionsRef: { current: null },
      inputSize: 210, panelHeight: 280, setPanelHeight() {}, beginResize() {}, toggleMulti() {},
      onShare() {}, onPublish() {}, onCancelDraft() {}, onNewPuzzle() {},
      onCreatePuzzle() {}, onEditPuzzle() {}, onStopPlaying() {},
      showLeftPanel: true, showRightPanel: true, showBottomPanel: true,
      onOpenHintPanel() {}, onOpenRightPanel() {}, puzzleBrowserView: 'active', setPuzzleBrowserView() {}, ...extra,
    })
    return null
  }
  renderToStaticMarkup(createElement(Capture))
  const nodes = elements(tree)
  return (label: string) => {
    const node = nodes.find(node => typeof node.props.onClick === 'function' &&
      (node.props.title === label || text(node.props.children).trim() === label))
    assert.ok(node, `Missing action: ${label}`)
    return node.props.onClick as () => void
  }
}

function playing(id: string) {
  return enter(makeGame(id, 'Async test', EMPTY, 'imported'), [0], 'value', 1)
}

const latest = (id: string) => roomStore.getSnapshot().games.find(game => game.id === id)!
const settle = () => new Promise<void>(resolve => setImmediate(resolve))
const masks = Array<number>(81).fill(511)

test('actual generate-candidates handler rejects a result after note or color edits, undo/redo, pause, or deletion', async t => {
  for (const change of ['note edit', 'color edit', 'undo/redo', 'pause', 'deletion']) {
    await t.test(change, async () => {
      const game = enter(playing(`stale-${change}`), [4], 'value', 5)
      roomStore.add(game)
      const action = capture(game)('Generate candidates')
      action()
      const worker = TestWorker.all.at(-1)!
      assert.equal(worker.waiting[0].request.type, 'notes')
      if (change === 'note edit') roomStore.update(game.id, current => enter(current, [8], 'corner', 7))
      else if (change === 'color edit') roomStore.update(game.id, current => enter(current, [8], 'color', 1))
      else if (change === 'undo/redo') {
        roomStore.update(game.id, undo)
        roomStore.update(game.id, redo)
        assert.equal(latest(game.id).position, game.position, 'redo restores the exact same board reference')
        assert.notEqual(latest(game.id).past, game.past, 'the undo history still records a different revision')
      } else if (change === 'pause') roomStore.update(game.id, current => ({ ...current, paused: true }))
      else roomStore.remove(game.id)
      const changed = latest(game.id)
      worker.reply(masks)
      await settle()
      assert.equal(latest(game.id), changed, 'the late handler must not replace the newer state')
    })
  }
})

test('generating candidates requires confirmation before replacing center or corner candidates', async () => {
  for (const mode of ['center', 'corner'] as const) {
    const game = enter(playing(`confirm-${mode}`), [8], mode, 7)
    roomStore.add(game)
    const before = TestWorker.all.length
    capture(game)('Generate candidates')()
    await settle()
    assert.equal(TestWorker.all.length, before)
    assert.equal(latest(game.id), game)
  }
})

test('actual generate-candidates handler accepts clock-only changes and guards duplicate requests before React commits', async () => {
  const game = playing('clock-candidates')
  roomStore.add(game)
  const action = capture(game)('Generate candidates')
  action()
  const worker = TestWorker.all.at(-1)!
  action()
  assert.equal(worker.waiting.length, 1, 'the ref guards a second click before busy state rerenders')
  roomStore.advanceElapsed(game.id, 3)
  worker.reply(masks)
  await settle()
  assert.equal(latest(game.id).elapsed, 3)
  assert.equal(latest(game.id).position.corner[8], 511)
  assert.equal(latest(game.id).candidatesInitialized, true)
})

test('hint collections retain their owning worker and a new hint closes the previous collection', async () => {
  const game = playing('hint-ownership')
  roomStore.add(game)
  const action = capture(game)('Analyze all moves')
  action()
  const first = TestWorker.all.at(-1)!
  assert.equal(first.waiting[0].request.type, 'hints')
  assert.ok('collection' in first.waiting[0].request)
  first.reply({ choices: [], candidates: masks, available: 0, offset: 0 })
  await settle()
  assert.equal(first.closed, false, 'future hint pages need the same worker')
  action()
  const second = TestWorker.all.at(-1)!
  assert.notEqual(second, first)
  assert.equal(first.closed, true)
  roomStore.update(game.id, current => enter(current, [8], 'corner', 7))
  second.reply({ choices: [], candidates: masks, available: 0, offset: 0 })
  await settle()
  assert.equal(second.closed, true, 'a stale collection is released')
})

test('a launch-paused board starts no candidate or hint work', async () => {
  const game = playing('launch-paused')
  roomStore.add(game)
  const actions = capture(game, { pausedOnLaunch: true })
  const before = TestWorker.all.length
  actions('Generate candidates')()
  actions('Analyze all moves')()
  await settle()
  assert.equal(TestWorker.all.length, before)
  assert.equal(latest(game.id), game)
})
