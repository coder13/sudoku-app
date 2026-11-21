import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '../tools/react-board-performance/node_modules/playwright/index.mjs'
import { makeGame } from '../src/sudoku/game.ts'
import { STARTER } from '../src/sudoku/formats.ts'
import { savedPuzzles, waitForSavedPuzzle } from '../tests/helpers/browser-puzzle-saves.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const option = flag => {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  assert.ok(process.argv[index + 1] && !process.argv[index + 1].startsWith('--'), `Missing ${flag} value`)
  return process.argv[index + 1]
}
const output = option('--output')
const selectedCase = option('--case')
const game = { ...makeGame('worktable-lifecycle', 'Lifecycle fixture', STARTER, 'imported', 1),
  started: true, difficulty: 'easy', score: 100 }
const mixedImport = JSON.parse(await readFile(resolve(root, 'tests/fixtures/global-entropy-quadruple-preview.json'), 'utf8'))
const gameKey = 'sudoku-app:v1:game:' + game.id
const sourceFiles = [
  'src/components/Worktable.tsx', 'src/components/usePuzzleGeneration.ts', 'src/sudoku/engine.ts',
  'src/sudoku/puzzle-revision.ts', 'src/sudoku/storage.ts', 'src/sudoku/puzzle-saves.ts',
  'scripts/check-worktable-lifecycle.mjs', 'tests/helpers/browser-puzzle-saves.mjs',
  'src/components/ImportPuzzle.tsx', 'src/sudoku/puzzle-preview.ts', 'tests/fixtures/global-entropy-quadruple-preview.json',
  'package-lock.json', 'tools/react-board-performance/package-lock.json',
]
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file =>
  [file, createHash('sha256').update(await readFile(resolve(root, file))).digest('hex')])) )
let server, browser
const failures = []
const report = {
  status: 'running', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHashes, viewport: { width: 1440, height: 1000 }, checks: [],
  notes: [
    'The real Vite development app, Worktable, stores, router, worker protocol, and generated WASM run in Chromium.',
    'An instrumented native Worker delays only the selected action reply. Other replies, including metadata and candidates, pass through unchanged.',
    'Tests release the original reply even after cancellation to exercise late-message guards.',
    'This is a functional lifecycle check. It does not measure production performance or physical phone behavior.',
  ],
}

function instrument({ fixture, key, workspaceMode = 'standard', shortcuts }) {
  localStorage.setItem(key, JSON.stringify(fixture))
  localStorage.setItem('sudoku-app:v1:initialized', '1')
  localStorage.setItem('sudoku-app:v1:active', fixture.id)
  localStorage.setItem('sudoku-app:v1:puzzle-timing', JSON.stringify({ showTimer: true, showPause: true, pauseOnOpen: false, trackTime: true }))
  localStorage.setItem('sudoku-app:v1:workspace-mode', workspaceMode)
  if (shortcuts) localStorage.setItem('sudoku-app:v1:keyboard-shortcuts', JSON.stringify(shortcuts))
  localStorage.setItem('sudoku-app:v1:error-mode', 'none')
  localStorage.setItem('sudoku-app:v1:play-preferences', JSON.stringify({ pinnedActions: ['candidates', 'singles', 'hint', 'check'] }))
  localStorage.setItem('sudoku-app:v1:advanced-modes', JSON.stringify({
    candidateLayout: 'grid', autoGenerateCandidates: false, autoRemoveCandidates: true, autoPlaceNakedSingles: false,
  }))
  const NativeWorker = window.Worker
  const workers = [], holds = []
  let armed = null
  class InstrumentedWorker extends NativeWorker {
    constructor(url, options) {
      super(url, options)
      const worker = { id: workers.length + 1, url: String(url), terminated: false, sent: [], received: [] }
      workers.push(worker)
      let handler = null
      const nativePost = this.postMessage.bind(this)
      const nativeTerminate = this.terminate.bind(this)
      Object.defineProperty(this, 'onmessage', { configurable: true,
        get: () => handler, set: value => { handler = value } })
      this.addEventListener('message', event => {
        worker.received.push(event.data?.id)
        const hold = holds.find(item => item.workerId === worker.id && item.messageId === event.data?.id)
        if (hold && !hold.released) {
          hold.captured = true
          const value = event.data?.value
          hold.response = 'error' in event.data ? { error: event.data.error } : {
            kind: Array.isArray(value) ? 'array' : typeof value,
            ...(value?.length !== undefined ? { length: value.length } : {}),
            ...(value?.choices?.length !== undefined ? { choices: value.choices.length } : {}),
            ...(value?.available !== undefined ? { available: value.available } : {}),
            ...(value?.offset !== undefined ? { offset: value.offset } : {}),
          }
          hold.deliver = () => handler?.call(this, event)
        } else handler?.call(this, event)
      })
      this.postMessage = (message, ...rest) => {
        const request = message?.request
        worker.sent.push({ id: message?.id, type: request?.type, operation: request?.operation,
          collection: request?.collection, index: request?.index })
        if (armed && request?.type === armed.type && (!armed.operation || request.operation === armed.operation)) {
          holds.push({ id: holds.length + 1, workerId: worker.id, messageId: message.id,
            type: request.type, operation: request.operation, captured: false, released: false, deliver: null })
          armed = null
        }
        return nativePost(message, ...rest)
      }
      this.terminate = () => { worker.terminated = true; nativeTerminate() }
    }
  }
  window.Worker = InstrumentedWorker
  window.workerProbe = {
    arm(specification) {
      if (armed) throw new Error('An action reply is already armed')
      armed = specification
      return holds.length + 1
    },
    release(id) {
      const hold = holds.find(item => item.id === id)
      if (!hold?.captured || !hold.deliver) throw new Error(`Reply ${id} has not arrived`)
      if (hold.released) throw new Error(`Reply ${id} was already released`)
      hold.released = true
      hold.deliver()
      hold.deliver = null
    },
    snapshot() {
      return { armed, workers, holds: holds.map(({ deliver, ...hold }) => hold) }
    },
  }
}

const frames = (page, count = 3) => page.evaluate(count => new Promise(resolve => {
  const frame = () => --count <= 0 ? resolve() : requestAnimationFrame(frame)
  requestAnimationFrame(frame)
}), count)
const pin = (page, title) => page.locator(`.puzzle-quick-actions button[title="${title}"]`)
async function enabled(page, title) {
  await page.waitForFunction(title => [...document.querySelectorAll('.puzzle-quick-actions button')]
    .some(button => button.title === title && !button.disabled), title)
}
async function boardSnapshot(page) {
  const saved = (await savedPuzzles(page)).find(item => item.id === game.id)
  if (!saved) return null
  return { position: saved.position, past: saved.past, future: saved.future, actionHistory: saved.actionHistory ?? [] }
}
async function arm(page, type) { return page.evaluate(type => window.workerProbe.arm({ type }), type) }
async function held(page, id) {
  await page.waitForFunction(id => window.workerProbe.snapshot().holds.some(hold => hold.id === id && hold.captured), id,
    { timeout: 30_000 })
  const reply = await page.evaluate(id => window.workerProbe.snapshot().holds.find(hold => hold.id === id), id)
  assert.equal(reply.response.error, undefined, 'the delayed engine reply must succeed for the test to be meaningful')
  if (reply.type === 'notes') assert.deepEqual(reply.response, { kind: 'array', length: 81 })
  if (reply.type === 'solve-singles') assert.deepEqual(reply.response, { kind: 'string', length: 81 })
  if (reply.type === 'hints') assert.ok(reply.response.choices > 0, 'the delayed search must find a real hint')
  if (reply.type === 'generate-mini') assert.deepEqual(reply.response, { kind: 'array', length: 16 })
  return reply
}
async function terminated(page, workerId) {
  await page.waitForFunction(id => window.workerProbe.snapshot().workers.find(worker => worker.id === id)?.terminated, workerId)
}
async function release(page, id) {
  await page.evaluate(id => window.workerProbe.release(id), id)
  await frames(page)
}

async function withPage(name, pathname, check, { context: contextOptions, ...options } = {}) {
  const context = await browser.newContext({ viewport: report.viewport, reducedMotion: 'reduce', ...contextOptions })
  await context.addInitScript(instrument, { fixture: game, key: gameKey, ...options })
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(report.url + pathname)
    if (pathname.startsWith('/?')) {
      await enabled(page, 'Generate candidates')
      await enabled(page, 'Solve all singles')
    } else if (pathname === '/import') await page.getByRole('textbox', { name: 'Puzzle text or link' }).waitFor()
    else await page.getByRole('button', { name: /^Start .*puzzle$/ }).waitFor()
    await frames(page)
    const details = await check(page)
    assert.deepEqual(errors, [], 'the app must not throw browser errors')
    report.checks.push({ name, status: 'passed', ...details, workers: await page.evaluate(() => window.workerProbe.snapshot()) })
    console.log(`Passed: ${name}`)
  } catch (error) {
    const detail = { name, status: 'failed', error: error.message, url: page.url(), errors,
      body: (await page.locator('body').innerText().catch(() => '')).slice(0, 3500),
      workers: await page.evaluate(() => window.workerProbe?.snapshot()).catch(() => null) }
    report.checks.push(detail)
    failures.push(error)
    console.error(JSON.stringify(detail, null, 2))
  } finally { await context.close() }
}

const checks = [
  ['close-hint-and-restart', '/?puzzle=' + game.id, async page => {
    const first = await arm(page, 'hints')
    await pin(page, 'View hint').click()
    const hint = await held(page, first)
    await page.getByRole('button', { name: 'Close hint', exact: true }).click()
    await terminated(page, hint.workerId)
    await enabled(page, 'Generate candidates')
    const next = await arm(page, 'notes')
    await pin(page, 'Generate candidates').click()
    await held(page, next)
    await release(page, first)
    assert.equal(await pin(page, 'Generate candidates').isDisabled(), true, 'a late hint reply must not clear the next action busy state')
    assert.equal(await page.getByRole('button', { name: 'Close hint', exact: true }).count(), 0)
    await release(page, next)
    await enabled(page, 'Generate candidates')
    assert.ok((await boardSnapshot(page)).position.corner.some(Boolean), 'the next action must complete normally')
    return { assertions: 5 }
  }],
  ['pause-candidates', '/?puzzle=' + game.id, async page => {
    const before = await boardSnapshot(page)
    const reply = await arm(page, 'notes')
    await pin(page, 'Generate candidates').click()
    await held(page, reply)
    await page.locator('.puzzle-pause-trigger').click()
    await page.locator('.puzzle-play-layers[data-paused]').waitFor()
    await release(page, reply)
    assert.deepEqual(await boardSnapshot(page), before, 'a late candidate reply must not change paused board or history')
    await page.locator('.puzzle-pause-trigger').click()
    await enabled(page, 'Generate candidates')
    assert.deepEqual(await boardSnapshot(page), before)
    return { assertions: 3 }
  }],
  ['space-pauses-with-button-focus', '/?puzzle=' + game.id, async page => {
    const options = page.getByRole('button', { name: 'Open puzzle options' })
    const paused = page.locator('.puzzle-play-layers[data-paused]')
    await options.focus()
    await page.keyboard.down('Space')
    await page.keyboard.down('Space')
    await page.keyboard.up('Space')
    await paused.waitFor()
    assert.equal(await options.getAttribute('aria-expanded'), 'false', 'Space must not click the focused button')

    await page.getByRole('button', { name: 'Resume puzzle', exact: true }).last().focus()
    await page.keyboard.press('Space')
    await paused.waitFor({ state: 'detached' })

    await options.press('Enter')
    assert.equal(await options.getAttribute('aria-expanded'), 'true', 'Enter can still open Puzzle options')
    await page.keyboard.press('Space')
    await paused.waitFor()
    assert.equal(await options.getAttribute('aria-expanded'), 'false', 'pausing closes Puzzle options')
    await page.keyboard.press('t')
    await paused.waitFor({ state: 'detached' })
    return { assertions: 7 }
  }, { fixture: { ...game, started: false }, shortcuts: { pauseOrSwitchView: 't' } }],
  ['notes-during-singles', '/?puzzle=' + game.id, async page => {
    const before = await boardSnapshot(page)
    const reply = await arm(page, 'solve-singles')
    await pin(page, 'Solve all singles').click()
    await held(page, reply)
    await page.locator('.sudoku-grid [data-cell="2"]').click()
    await page.keyboard.press('Control+4')
    await waitForSavedPuzzle(page, saved => saved.id === game.id && (saved.position.center[2] | saved.position.corner[2]) !== 0)
    const edited = await boardSnapshot(page)
    assert.equal(edited.position.entries, before.position.entries, 'the user entered a note, not a digit')
    assert.ok(edited.past.length > before.past.length)
    await enabled(page, 'Generate candidates')
    await release(page, reply)
    assert.deepEqual(await boardSnapshot(page), edited, 'late singles must not overwrite the note or its undo history')
    return { assertions: 4 }
  }],
  ['hint-pages-after-color', '/?puzzle=' + game.id, async page => {
    const before = await boardSnapshot(page)
    const first = await arm(page, 'hints')
    await page.getByRole('button', { name: 'Analyze all moves', exact: true }).click()
    const hint = await held(page, first)
    const { choices: pageSize, available } = hint.response
    assert.ok(available > pageSize, 'the real exhaustive result must contain a second page')
    await release(page, first)
    const navigation = page.getByRole('group', { name: 'Hint navigation', exact: true })
    await navigation.getByText(`1/${available}`, { exact: true }).waitFor()

    await page.locator('.sudoku-grid [data-cell="2"]').click()
    await page.keyboard.press('c')
    await page.getByRole('button', { name: 'Light rose', exact: true }).click()
    await waitForSavedPuzzle(page, saved => saved.id === game.id && saved.position.colors[2] === 1)
    const colored = await boardSnapshot(page)
    assert.equal(colored.position.entries, before.position.entries)
    assert.deepEqual(colored.position.center, before.position.center)
    assert.deepEqual(colored.position.corner, before.position.corner)
    assert.ok(colored.past.length > before.past.length, 'the cosmetic edit must create a real undo revision')
    assert.equal(await page.evaluate(id => window.workerProbe.snapshot().workers.find(worker => worker.id === id).terminated,
      hint.workerId), false, 'a completed collection must survive a color-only revision')

    for (let index = 2; index <= pageSize; index++) {
      await navigation.getByRole('button', { name: 'Next hint', exact: true }).click()
      await navigation.getByText(`${index}/${available}`, { exact: true }).waitFor()
    }
    const next = await arm(page, 'hint-page')
    await navigation.getByRole('button', { name: 'Next hint', exact: true }).click()
    const nextPage = await held(page, next)
    assert.equal(nextPage.workerId, hint.workerId, 'pagination must use the worker that owns the collection')
    assert.equal(nextPage.response.offset, pageSize)
    await release(page, next)
    await navigation.getByText(`${pageSize + 1}/${available}`, { exact: true }).waitFor()

    await page.getByRole('button', { name: 'Stop coloring', exact: true }).click()
    await page.locator('.sudoku-grid [data-cell="2"]').click()
    await page.keyboard.press('Control+4')
    await waitForSavedPuzzle(page, saved => saved.id === game.id && (saved.position.center[2] | saved.position.corner[2]) !== 0)
    await terminated(page, hint.workerId)
    assert.equal(await page.getByRole('button', { name: 'Close hint', exact: true }).count(), 0,
      'a semantic note edit must hide the old hint and close its collection')
    return { assertions: 10, available, pageSize }
  }, { workspaceMode: 'advanced' }],
  ['color-during-pending-hint', '/?puzzle=' + game.id, async page => {
    const reply = await arm(page, 'hints')
    await pin(page, 'View hint').click()
    const hint = await held(page, reply)
    await page.locator('.sudoku-grid [data-cell="2"]').click()
    await page.keyboard.press('c')
    await page.getByRole('button', { name: 'Light rose', exact: true }).click()
    await waitForSavedPuzzle(page, saved => saved.id === game.id && saved.position.colors[2] === 1)
    await terminated(page, hint.workerId)
    await enabled(page, 'Generate candidates')
    assert.equal(await page.getByRole('button', { name: 'Close hint', exact: true }).count(), 0,
      'canceling a pending hint must remove its loading UI')
    await release(page, reply)
    assert.equal(await page.getByRole('button', { name: 'Close hint', exact: true }).count(), 0,
      'a late reply must not restore the canceled hint')
    return { assertions: 4 }
  }],
  ['leave-hint', '/?puzzle=' + game.id, async page => {
    const before = await boardSnapshot(page)
    const reply = await arm(page, 'hints')
    await pin(page, 'View hint').click()
    const hint = await held(page, reply)
    await page.locator('.primary-navigation a[href="/puzzles/browse"]').click()
    await page.waitForURL('**/puzzles/browse')
    await terminated(page, hint.workerId)
    await release(page, reply)
    assert.equal(await page.locator('.puzzle-quick-actions').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Close hint', exact: true }).count(), 0)
    assert.deepEqual(await boardSnapshot(page), before)
    return { assertions: 4 }
  }],
  ['mobile-solution-step-explanation', '/?puzzle=' + game.id, async page => {
    const before = await boardSnapshot(page)
    const options = page.getByRole('button', { name: 'Open puzzle options' })
    await options.tap()
    await page.locator('#puzzle-menu').getByRole('button', { name: 'Solution', exact: true }).tap()
    await options.tap()
    await page.getByRole('button', { name: 'Reveal solution', exact: true }).tap()

    const steps = page.getByRole('list', { name: 'Solving steps' })
    const step = steps.getByRole('button').first()
    const hint = page.getByRole('complementary', { name: 'Puzzle hint' })
    await step.tap()
    await hint.waitFor()
    assert.equal(await hint.getByRole('heading').first().textContent(), await step.locator('strong').textContent())
    await hint.getByRole('button', { name: 'Close hint', exact: true }).tap()
    await hint.waitFor({ state: 'hidden' })
    assert.equal(await step.getAttribute('aria-current'), 'step')
    await page.getByRole('grid', { name: 'Solution preview' }).waitFor()
    assert.deepEqual(await boardSnapshot(page), before, 'viewing a step must leave the editable position and history intact')
    return { assertions: 6, viewport: { width: 390, height: 844 } }
  }, { context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
  ['edit-import-during-verification', '/import', async page => {
    const input = page.getByRole('textbox', { name: 'Puzzle text or link' })
    const submit = page.getByRole('button', { name: 'Preview puzzle' })
    const board = page.getByRole('grid', { name: 'Puzzle preview' })
    const play = page.getByRole('button', { name: 'Start playing' })
    const reply = await page.evaluate(() => window.workerProbe.arm({ type: 'variant', operation: 'solve-unique' }))
    await input.fill(mixedImport.code)
    await submit.click()
    const check = await held(page, reply)
    assert.ok(await board.isVisible())
    assert.equal(await board.locator('..').locator('.variant-quadruple').count(), 18)
    assert.ok(await page.getByText('Checking solutions…', { exact: true }).isVisible())
    assert.ok(await play.isDisabled())
    assert.ok(await page.getByRole('button', { name: 'Save and import another' }).isDisabled())

    await page.getByRole('button', { name: 'Edit input' }).click()
    await terminated(page, check.workerId)
    await release(page, reply)
    assert.ok(await input.isVisible())
    assert.equal(await board.count(), 0)

    await submit.click()
    await page.getByText('Unique solution', { exact: true }).waitFor()
    assert.ok(await play.isEnabled())
    await play.click()
    await page.waitForURL(url => url.pathname !== '/import')
    await page.getByRole('button', { name: 'Open puzzle options' }).click()
    await page.getByRole('button', { name: 'Puzzle details', exact: true }).click()
    await page.getByRole('dialog', { name: 'Puzzle details' }).getByText('Unique solution', { exact: true }).waitFor()
    return { assertions: 10 }
  }],
  ['leave-generation', '/puzzles/new/difficulty?variant=mini', async page => {
    const savedIds = async () => (await savedPuzzles(page)).map(saved => saved.id).sort()
    const before = await savedIds()
    const reply = await arm(page, 'generate-mini')
    await page.getByRole('button', { name: /^Start .*puzzle$/ }).click()
    const generation = await held(page, reply)
    await page.locator('.primary-navigation a[href="/learn"]').click()
    await page.waitForURL('**/learn')
    await terminated(page, generation.workerId)
    await release(page, reply)
    assert.deepEqual(await savedIds(), before, 'an abandoned generator must not add a saved puzzle')
    assert.equal(new URL(page.url()).pathname, '/learn', 'an abandoned generator must not navigate back into play')
    return { assertions: 3 }
  }],
]

try {
  // The dev server and browser share one process tree, as required by isolated runners.
  server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null } })
  await server.listen()
  const address = server.httpServer.address()
  report.url = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
  report.browser = browser.version()
  const selected = selectedCase ? checks.filter(([name]) => name === selectedCase) : checks
  assert.ok(selected.length, `Unknown case: ${selectedCase}`)
  for (const [name, pathname, check, options] of selected) await withPage(name, pathname, check, options)
  report.status = failures.length ? 'failed' : 'passed'
  if (output) {
    await mkdir(dirname(resolve(output)), { recursive: true })
    await writeFile(resolve(output), JSON.stringify(report, null, 2) + '\n')
    console.log(`Saved ${resolve(output)}`)
  }
  assert.equal(failures.length, 0, `${failures.length} lifecycle checks failed`)
  console.log(`Passed ${report.checks.length} browser lifecycle scenarios`)
} finally {
  await browser?.close()
  await server?.close()
}
