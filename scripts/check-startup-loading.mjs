import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '../tools/react-board-performance/node_modules/playwright/index.mjs'
import { enter, isSolved, makeGame } from '../src/sudoku/game.ts'
import { STARTER } from '../src/sudoku/formats.ts'
import { GAME_PREFIX } from '../src/sudoku/storage.ts'
import { createSyncEngine, syncRequest } from '../src/sudoku/sync-engine.ts'
import { MemoryStorage } from '../tests/helpers/memory-storage.ts'
import { syncDatabase } from '../tests/helpers/sync-database.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const option = flag => {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  assert.ok(process.argv[index + 1] && !process.argv[index + 1].startsWith('--'), `Missing ${flag} value`)
  return process.argv[index + 1]
}
const output = option('--output')
const screenshots = option('--screenshots')
const selectedCase = option('--case')
const selectedProfile = option('--profile') ?? 'both'
assert.ok(['desktop', 'mobile', 'both'].includes(selectedProfile), 'Use --profile desktop, mobile, or both')
const profiles = [
  { name: 'desktop', viewport: { width: 1440, height: 1000 } },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
].filter(profile => selectedProfile === 'both' || profile.name === selectedProfile)
const game = { ...makeGame('startup-loading', 'Startup fixture', STARTER, 'imported', 1),
  difficulty: 'easy', score: 100 }
const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
let solvedGame = game
for (let digit = 1; digit <= 9; digit++) {
  const cells = [...STARTER].flatMap((given, index) => given === '0' && solution[index] === String(digit) ? [index] : [])
  solvedGame = enter(solvedGame, cells, 'value', digit, { allowMultipleValues: true, removeCandidates: false })
}
assert.ok(isSolved(solvedGame), 'The remote completion fixture must be solved')
const preferences = {
  'sudoku-app:v1:workspace-mode': 'standard',
  'sudoku-app:v1:error-mode': 'none',
  'sudoku-app:v1:puzzle-timing': JSON.stringify({ showTimer: false, showPause: false, pauseOnOpen: false, trackTime: true }),
  'sudoku-app:v1:advanced-modes': JSON.stringify({
    candidateLayout: 'grid', autoGenerateCandidates: false, autoRemoveCandidates: true, autoPlaceNakedSingles: false,
  }),
}
const sourceFiles = [
  'src/components/Workspace.tsx', 'src/components/DesktopPlayLayout.tsx', 'src/components/Worktable.tsx',
  'src/components/CompletedPuzzle.tsx', 'src/components/PuzzlesPage.tsx', 'src/components/SyncConnectionStatus.tsx',
  'src/routes/__root.tsx', 'src/routes/index.tsx', 'src/styles.css', 'src/sudoku/storage.ts',
  'src/sudoku/device-sync.ts', 'src/sudoku/sync-engine.ts', 'src/sudoku/sync-settings.ts',
  'src/sudoku/sync-connectivity.ts', 'src/sudoku/sync-socket.ts', 'src/sudoku/puzzle-activity.ts',
  'src/sudoku/preferences.ts', 'src/sudoku/puzzle-timing.ts', 'src/sudoku/game.ts',
  'src/sudoku/generated/engine.wasm', 'cloudflare/pages/_worker.js', 'vite.config.ts',
  'scripts/check-startup-loading.mjs', 'tests/helpers/sync-database.ts', 'tests/helpers/memory-storage.ts',
  'package-lock.json', 'tools/react-board-performance/package-lock.json',
]
async function hashes() {
  return Object.fromEntries(await Promise.all(sourceFiles.map(async file =>
    [file, createHash('sha256').update(await readFile(resolve(root, file))).digest('hex')])))
}
const report = {
  status: 'running',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceStatus: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHashes: await hashes(), profiles, checks: [], screenshots: [],
  notes: [
    'Chromium runs the real Vite development SSR, client router, stores, sync engine, and generated WASM.',
    'API requests use the production sync Worker and an isolated SQLite database. Selected responses wait at explicit test gates.',
    'A document-start MutationObserver records Puzzles page mounts, including nodes removed before its callback. The server HTML is also checked with JavaScript disabled.',
    'The offline case uses Chromium offline mode. The test supplies only local app assets, as a stand-in for an installed offline cache. This does not test service-worker installation.',
    'Geometry assertions cover the loading line and unchanged cached content. A requested change to workspace mode can change the header layout.',
    'These are functional checks with normal motion, plus a reduced-motion assertion during the initial sync hold. They do not measure production startup speed or physical phone behavior.',
  ],
}
let server, browser
const failures = []

function checks() {
  let count = 0
  return {
    get count() { return count },
    ok(value, message) { count++; assert.ok(value, message) },
    equal(actual, expected, message) { count++; assert.equal(actual, expected, message) },
    deepEqual(actual, expected, message) { count++; assert.deepEqual(actual, expected, message) },
  }
}

function gate(path, method = 'GET', failureStatus) {
  let release, arrived
  const pending = new Promise(resolve => { release = resolve })
  const started = new Promise(resolve => { arrived = resolve })
  return {
    path, method, failureStatus, started, hits: 0, released: false,
    matches(request) { return request.method === method && request.path.split('?')[0] === path },
    async wait() { this.hits++; arrived(); if (!this.released) await pending },
    release() { this.released = true; release() },
  }
}

async function fixture({ cached = false, remoteSolved = false, empty = false, remoteMode, linked = true, firstVisit = false } = {}) {
  const local = new MemoryStorage()
  let db, credentials
  if (linked) {
    db = syncDatabase()
    const anon = syncRequest(undefined, db.fetcher)
    const remoteCredentials = await anon('libraries', 'POST', { name: 'Remote fixture' })
    const remoteAPI = syncRequest(remoteCredentials.token, db.fetcher)
    const { ticket } = await remoteAPI('invitations', 'POST')
    credentials = await anon('join', 'POST', { name: 'Browser fixture', secret: ticket })
    const remote = new MemoryStorage()
    const remoteEngine = createSyncEngine(remote, remoteCredentials.id, remoteAPI, () => {})
    if (!empty) {
      remote.setItem(GAME_PREFIX + game.id, JSON.stringify(game))
      await remoteEngine.run({ settings: false })
    }
    if (cached) {
      const localEngine = createSyncEngine(local, credentials.id, syncRequest(credentials.token, db.fetcher), () => {})
      await localEngine.run({ settings: false })
      assert.equal(JSON.parse(local.getItem(GAME_PREFIX + game.id)).id, game.id)
    }
    if (remoteSolved) {
      assert.ok(cached, 'The completion case needs a matching cached base revision')
      remote.setItem(GAME_PREFIX + game.id, JSON.stringify(solvedGame))
      await remoteEngine.run({ settings: false })
    }
    if (remoteMode) await remoteAPI('settings', 'PATCH', { seeds: {}, edits: { 'workspace-mode': JSON.stringify(remoteMode) } })
  } else if (cached) local.setItem(GAME_PREFIX + game.id, JSON.stringify(game))
  const values = { ...Object.fromEntries(Object.entries(local)), ...preferences,
    ...(!firstVisit && { 'sudoku-app:v1:initialized': '1' }),
    ...(cached && { 'sudoku-app:v1:active': game.id }),
    ...(credentials && { 'sudoku-app:sync:device': JSON.stringify(credentials) }),
  }
  return { db, values }
}

function instrument(values) {
  for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value)
  let stage = 'startup', forbidPuzzles = true
  const puzzleMounts = [], samples = []
  let previous
  function sample() {
    const next = {
      stage, puzzles: Boolean(document.querySelector('.puzzles-page')),
      loading: Boolean(document.querySelector('.startup-progress')),
      workspace: Boolean(document.querySelector('#sudoku-workspace')),
      workspaceClass: document.querySelector('#sudoku-workspace')?.className ?? null,
      complete: Boolean(document.querySelector('#completion-title')),
    }
    const signature = JSON.stringify(next)
    if (signature !== previous) { samples.push({ ...next, time: performance.now() }); previous = signature }
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue
        if (node.matches('.puzzles-page') || node.querySelector('.puzzles-page')) {
          puzzleMounts.push({ stage, forbidden: forbidPuzzles, time: performance.now() })
        }
      }
    }
    sample()
  })
  observer.observe(document, { childList: true, subtree: true })
  window.startupProbe = {
    setStage(value, allowPuzzles = false) { stage = value; forbidPuzzles = !allowPuzzles; sample() },
    snapshot() { sample(); return { puzzleMounts, samples } },
  }
}

const frames = (page, count = 4) => page.evaluate(count => new Promise(resolve => {
  const next = () => --count <= 0 ? resolve() : requestAnimationFrame(next)
  requestAnimationFrame(next)
}), count)
async function settled(page) { await page.evaluate(() => document.fonts.ready); await frames(page) }
async function capture(page, profile, name) {
  if (!screenshots) return
  const path = resolve(screenshots, `${profile.name}-${name}.png`)
  await mkdir(dirname(path), { recursive: true })
  await page.screenshot({ path, fullPage: true })
  report.screenshots.push({ profile: profile.name, name, path })
}
async function geometry(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const element = document.querySelector(selector)
      if (!element) return null
      const { x, y, width, height, bottom } = element.getBoundingClientRect()
      return { x, y, width, height, bottom }
    }
    const progress = document.querySelector('.startup-progress')
    return {
      header: rect('.topbar'), nav: rect('.primary-navigation'), line: rect('.startup-progress'),
      board: rect('#sudoku-workspace .sudoku-grid'), cell: rect('#sudoku-workspace .cell'),
      linePosition: progress ? getComputedStyle(progress).position : null,
    }
  })
}
function sameBounds(check, before, after, subject) {
  check.ok(before && after, `${subject} must exist before and after sync`)
  for (const key of ['x', 'y', 'width', 'height']) {
    check.ok(Math.abs(before[key] - after[key]) <= 0.5, `${subject} ${key} must remain stable (${before[key]} -> ${after[key]})`)
  }
}
async function pending(page, check, staticHTML = false) {
  await page.locator('.startup-progress').waitFor({ state: 'visible' })
  // A JavaScript-disabled document does not run requestAnimationFrame callbacks.
  if (!staticHTML) await settled(page)
  check.equal(await page.getByRole('progressbar', { name: 'Loading puzzles', exact: true }).count(), 1)
  check.equal(await page.locator('.startup-loading[aria-busy="true"]').count(), 1)
  check.equal(await page.locator('.startup-loading').innerText(), '', 'The pending main must contain no visible copy')
  check.equal(await page.locator('main:not(.startup-loading)').count(), 0, 'No content page can mount during uncached startup')
  check.equal(await page.locator('.puzzles-page').count(), 0)
  const measured = await geometry(page)
  check.equal(measured.linePosition, 'absolute', 'The loading line must not take layout space')
  check.ok(measured.line.height > 0 && measured.line.height <= 4, 'The loading line must be thin')
  check.ok(Math.abs(measured.line.y - measured.header.bottom) <= 1.5, 'The loading line must sit below the topbar')
  check.ok(Math.abs(measured.line.width - measured.header.width) <= 1, 'The loading line must span the topbar')
  return measured
}
async function board(page, check, expectedId = game.id) {
  await page.locator('#sudoku-workspace .sudoku-grid').first().waitFor({ state: 'visible' })
  await page.waitForFunction(id => new URL(location.href).searchParams.get('puzzle') === id, expectedId)
  await settled(page)
  check.equal(await page.locator('#sudoku-workspace .sudoku-grid').first().getByRole('gridcell').count(), 81)
  check.equal(await page.locator('.startup-progress, .startup-loading').count(), 0, 'Cached or ready play must not show a blocking loader')
  check.equal(await page.locator('#completion-title').count(), 0)
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), GAME_PREFIX + expectedId)
  check.equal(stored?.id, expectedId)
  if (expectedId === game.id) check.equal(stored.givens, STARTER)
  return geometry(page)
}
async function assertNoFlash(page, check) {
  const probe = await page.evaluate(() => window.startupProbe.snapshot())
  check.deepEqual(probe.puzzleMounts.filter(item => item.forbidden), [], 'Puzzles must not mount before the intended page')
  return probe
}
async function waitForGate(hold) {
  let timer
  try {
    await Promise.race([hold.started, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Sync did not reach ${hold.method} ${hold.path}`)), 20_000)
    })])
  } finally { clearTimeout(timer) }
}

async function installRoutes(context, data, holds, requests, backendErrors, sockets, offline) {
  await context.routeWebSocket('**/api/v1/live', socket => {
    sockets.push(socket)
    socket.onMessage(message => { if (message === 'ping') socket.send('pong') })
  })
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/v1/')) {
      const record = { method: request.method(), path: url.pathname.slice('/api/v1/'.length) + url.search, status: null }
      requests.push(record)
      if (offline) { record.status = 'offline'; await route.abort('internetdisconnected'); return }
      try {
        const hold = holds.find(item => !item.released && item.matches(record)) ?? holds.find(item => item.matches(record))
        if (hold) await hold.wait()
        if (hold?.failureStatus) {
          record.status = hold.failureStatus
          await route.fulfill({ status: hold.failureStatus, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture sync failure' }) })
          return
        }
        assert.ok(data.db, `Unexpected API request from an unlinked case: ${record.path}`)
        const headers = await request.allHeaders()
        // The in-process Worker uses its own origin. Keep its same-origin write check active.
        if (headers.origin) headers.origin = 'https://sudoku.example'
        delete headers.host
        const response = await data.db.fetcher(url.pathname + url.search, {
          method: request.method(), headers, body: request.postData() ?? undefined,
        })
        record.status = response.status
        if (!response.ok) backendErrors.push(`${record.method} ${record.path}: ${response.status}`)
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
      } catch (error) {
        backendErrors.push(error.message)
        await route.abort('failed').catch(() => {})
      }
      return
    }
    if (!offline) { await route.continue(); return }
    if (url.origin !== report.url) { await route.abort('internetdisconnected'); return }
    // Only app assets bypass the browser's offline network state.
    try {
      const response = await fetch(url)
      const headers = Object.fromEntries(response.headers)
      for (const key of ['content-encoding', 'content-length', 'transfer-encoding']) delete headers[key]
      await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) })
    } catch (error) {
      backendErrors.push(`Local offline asset ${url.pathname}: ${error.message}`)
      await route.abort('failed').catch(() => {})
    }
  })
  if (offline) await context.setOffline(true)
}

const cases = [
  { name: 'server-html', javaScriptEnabled: false, options: { linked: false }, async run({ page, check, response }) {
    check.equal(response.status(), 200)
    const html = await response.text()
    check.ok(html.includes('startup-progress'), 'The original server HTML must contain the loading line')
    check.ok(!/class="puzzles-page(?:\s|")/.test(html), 'The original server HTML must not contain Puzzles content')
    const bounds = await pending(page, check, true)
    return { bounds }
  } },
  { name: 'delayed-library', hold: () => gate('changes'), async run({ page, check, holds, sockets, profile }) {
    await waitForGate(holds[0])
    const before = await pending(page, check)
    check.equal(await page.evaluate(key => localStorage.getItem(key), GAME_PREFIX + game.id), null)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await frames(page)
    const reducedMotion = await page.locator('.startup-progress > span').evaluate(element => ({
      animation: getComputedStyle(element).animationName,
      activeAnimations: element.getAnimations().length,
      width: element.getBoundingClientRect().width,
      trackWidth: element.parentElement.getBoundingClientRect().width,
    }))
    check.equal(reducedMotion.animation, 'none', 'Reduced motion must disable the progress animation')
    check.equal(reducedMotion.activeAnimations, 0)
    check.ok(Math.abs(reducedMotion.width - reducedMotion.trackWidth) <= 0.5, 'Reduced motion must keep a visible static line')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await frames(page)
    check.ok(await page.locator('.startup-progress > span').evaluate(element => getComputedStyle(element).animationName !== 'none'),
      'Normal motion must resume before the screenshot')
    await capture(page, profile, 'startup-progress')
    holds[0].release()
    const after = await board(page, check)
    sameBounds(check, before.header, after.header, 'Header')
    sameBounds(check, before.nav, after.nav, 'Navigation')
    const background = gate('changes')
    holds.push(background)
    check.ok(sockets.length > 0, 'A live connection must trigger the later sync')
    await page.evaluate(() => window.startupProbe.setStage('background-sync'))
    sockets.at(-1).send('changes')
    await waitForGate(background)
    const duringBackgroundSync = await board(page, check)
    check.equal(background.released, false, 'The later sync must remain pending while the board stays visible')
    sameBounds(check, after.board, duringBackgroundSync.board, 'Open grid during later sync')
    background.release()
    await page.locator('.topbar .sync-connection-label .loading-spinner').waitFor({ state: 'hidden' })
    return { before, after, reducedMotion, duringBackgroundSync }
  } },
  { name: 'downloaded-puzzle-waits-for-settings', options: { remoteMode: 'advanced' }, hold: () => gate('settings', 'PATCH'), async run({ page, check, holds, requests, profile }) {
    await waitForGate(holds[0])
    check.ok(requests.some(item => item.path === 'puzzles/' + game.id && item.status === 200), 'The puzzle download must finish before the settings gate')
    check.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key))?.id, GAME_PREFIX + game.id), game.id)
    check.equal(await page.evaluate(() => localStorage.getItem('sudoku-app:v1:workspace-mode')), 'standard')
    const before = await pending(page, check)
    holds[0].release()
    const after = await board(page, check)
    check.equal(await page.evaluate(() => localStorage.getItem('sudoku-app:v1:workspace-mode')), 'advanced')
    check.equal(await page.locator('#sudoku-workspace.advanced-workspace-page').count(), profile.name === 'desktop' ? 1 : 0)
    const firstWorkspace = await page.evaluate(() => window.startupProbe.snapshot().samples.find(item => item.workspace))
    check.ok(firstWorkspace?.workspaceClass.includes(profile.name === 'desktop' ? 'advanced-workspace-page' : 'standard-workspace-page'),
      'The first workspace must use the synced settings')
    return { before, after }
  } },
  { name: 'cached-game-during-sync', options: { cached: true }, hold: () => gate('changes'), async run({ page, check, holds, profile }) {
    await waitForGate(holds[0])
    const before = await board(page, check)
    check.equal(holds[0].released, false, 'The cached board must appear before sync completes')
    check.equal(await page.locator('.topbar .sync-connection-label .loading-spinner').count(), 1)
    await capture(page, profile, 'cached-game-during-sync')
    holds[0].release()
    await page.locator('.topbar .sync-connection-label .loading-spinner').waitFor({ state: 'hidden' })
    const after = await board(page, check)
    sameBounds(check, before.header, after.header, 'Header')
    sameBounds(check, before.nav, after.nav, 'Navigation')
    sameBounds(check, before.board, after.board, 'Cached grid')
    sameBounds(check, before.cell, after.cell, 'Cached cell')
    return { before, after }
  } },
  { name: 'offline-cached-game', options: { cached: true }, offline: true, async run({ page, check, requests }) {
    const bounds = await board(page, check)
    check.equal(await page.evaluate(() => navigator.onLine), false, 'Chromium must report a real offline network state')
    check.equal(requests.length, 0, 'Offline startup must not wait for an API request')
    return { bounds }
  } },
  { name: 'remote-completion-keeps-puzzle', options: { cached: true, remoteSolved: true }, hold: () => gate('changes'), async run({ page, check, holds }) {
    await waitForGate(holds[0])
    await board(page, check)
    check.equal(holds[0].released, false)
    holds[0].release()
    await page.getByRole('heading', { name: 'Puzzle solved', exact: true }).waitFor({ state: 'visible' })
    await settled(page)
    check.equal(new URL(page.url()).searchParams.get('puzzle'), game.id, 'Remote completion must keep the selected puzzle route')
    check.equal(await page.locator('.startup-progress, .puzzles-page').count(), 0)
    const saved = await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix))
      .map(key => JSON.parse(localStorage.getItem(key))), GAME_PREFIX)
    check.equal(saved.length, 1, 'Opening an unchanged cached puzzle must not create a conflict copy')
    check.equal(saved[0].id, game.id)
    check.ok(isSolved(saved[0]), 'The saved remote revision must also be solved')
    return { savedIds: saved.map(item => item.id) }
  } },
  { name: 'missing-requested-puzzle', pathname: '/?puzzle=' + game.id, hold: () => gate('puzzles/' + game.id), async run({ page, check, holds, requests }) {
    await waitForGate(holds[0])
    const before = await pending(page, check)
    check.equal(requests.filter(item => item.path.startsWith('changes')).length, 0, 'The requested puzzle must be fetched before the general changes feed')
    check.equal(await page.getByRole('heading', { name: 'Puzzle unavailable on this device' }).count(), 0)
    holds[0].release()
    const after = await board(page, check)
    sameBounds(check, before.header, after.header, 'Header')
    return { before, after }
  } },
  { name: 'empty-library', options: { empty: true }, hold: () => gate('changes'), async run({ page, check, holds }) {
    await waitForGate(holds[0])
    const before = await pending(page, check)
    await page.evaluate(() => window.startupProbe.setStage('sync-released', true))
    holds[0].release()
    await page.locator('.puzzles-page').waitFor({ state: 'visible' })
    await settled(page)
    check.equal(await page.locator('.startup-progress, .startup-loading, #sudoku-workspace').count(), 0)
    const after = await geometry(page)
    sameBounds(check, before.header, after.header, 'Header')
    sameBounds(check, before.nav, after.nav, 'Navigation')
    return { before, after }
  } },
  { name: 'sync-failure-releases-startup', options: { empty: true }, hold: () => gate('changes', 'GET', 503), async run({ page, check, holds, requests }) {
    await waitForGate(holds[0])
    await pending(page, check)
    await page.evaluate(() => window.startupProbe.setStage('sync-failed', true))
    holds[0].release()
    await page.locator('.puzzles-page').waitFor({ state: 'visible' })
    check.equal(await page.locator('.startup-progress, .startup-loading').count(), 0, 'A failed sync must not leave startup blocked')
    check.ok(requests.some(item => item.path.startsWith('changes') && item.status === 503))
    return {}
  } },
  { name: 'first-unlinked-launch', options: { linked: false, firstVisit: true }, async run({ page, check, requests }) {
    await page.locator('#sudoku-workspace .sudoku-grid').first().waitFor({ state: 'visible' })
    const saved = await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix))
      .map(key => JSON.parse(localStorage.getItem(key))), GAME_PREFIX)
    check.equal(saved.length, 1, 'A first unlinked visit must create exactly one first puzzle')
    check.equal(saved[0].source, 'generated')
    await board(page, check, saved[0].id)
    check.equal(requests.length, 0)
    return { savedIds: saved.map(item => item.id) }
  } },
]

async function runCase(specification, profile) {
  const check = checks(), data = await fixture(specification.options)
  const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.isMobile, hasTouch: profile.hasTouch, reducedMotion: 'no-preference',
    javaScriptEnabled: specification.javaScriptEnabled ?? true, serviceWorkers: 'block' })
  const holds = specification.hold ? [specification.hold()] : []
  const requests = [], errors = [], backendErrors = [], sockets = []
  await installRoutes(context, data, holds, requests, backendErrors, sockets, specification.offline)
  if (specification.javaScriptEnabled !== false) await context.addInitScript(instrument, data.values)
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)
  page.on('pageerror', error => errors.push(error.message))
  try {
    const response = await page.goto(report.url + (specification.pathname ?? '/'), {
      waitUntil: specification.javaScriptEnabled === false ? 'load' : 'domcontentloaded',
    })
    const details = await specification.run({ page, check, holds, requests, sockets, profile, response })
    const probe = specification.javaScriptEnabled === false ? null : await assertNoFlash(page, check)
    check.deepEqual(errors, [], 'The app must not throw browser errors')
    check.deepEqual(backendErrors, [], 'All ungated real sync requests must succeed')
    report.checks.push({ name: specification.name, profile: profile.name, status: 'passed', assertions: check.count,
      ...details, requests, probe })
    console.log(`Passed: ${profile.name} ${specification.name} (${check.count} assertions)`)
  } catch (error) {
    const detail = { name: specification.name, profile: profile.name, status: 'failed', assertions: check.count,
      error: error.message, url: page.url(), errors, backendErrors, requests,
      body: (await page.locator('body').innerText().catch(() => '')).slice(0, 3500),
      probe: await page.evaluate(() => window.startupProbe?.snapshot()).catch(() => null),
    }
    report.checks.push(detail)
    failures.push(error)
    console.error(JSON.stringify(detail, null, 2))
  } finally {
    for (const hold of holds) hold.release()
    await context.close()
    data.db?.sqlite.close()
  }
}

try {
  server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null } })
  await server.listen()
  report.url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
  report.browser = browser.version()
  const selected = selectedCase ? cases.filter(item => item.name === selectedCase) : cases
  assert.ok(selected.length, `Unknown case: ${selectedCase}`)
  for (const profile of profiles) for (const specification of selected) await runCase(specification, profile)
  assert.deepEqual(await hashes(), report.sourceHashes, 'Sources must remain unchanged during the startup regression')
  report.sourceHashesVerifiedAtEnd = true
  report.assertions = report.checks.reduce((sum, item) => sum + item.assertions, 0)
  report.status = failures.length ? 'failed' : 'passed'
} finally {
  await browser?.close()
  await server?.close()
  if (output) {
    await mkdir(dirname(resolve(output)), { recursive: true })
    await writeFile(resolve(output), JSON.stringify(report, null, 2) + '\n')
    console.log(`Saved ${resolve(output)}`)
  }
}
assert.equal(failures.length, 0, `${failures.length} startup scenarios failed`)
console.log(`Passed ${report.checks.length} startup scenarios (${report.assertions} assertions)`)
