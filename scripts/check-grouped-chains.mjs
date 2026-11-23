import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '../tools/react-board-performance/node_modules/playwright/index.mjs'
import { makeGame, replaceCandidates } from '../src/sudoku/game.ts'
import { analyzeChainPaths, candidateId, chainGroup, makeChainGraph } from '../src/sudoku/chains.ts'
import { savedPuzzles, waitForSavedPuzzle } from '../tests/helpers/browser-puzzle-saves.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const option = flag => {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  assert.ok(process.argv[index + 1] && !process.argv[index + 1].startsWith('--'), `Missing ${flag} value`)
  return process.argv[index + 1]
}
const output = option('--output')
const screenshotDirectory = option('--screenshots')
const onlyProfile = option('--profile')
const practice = JSON.parse(await readFile(resolve(root, 'src/sudoku/generated/lesson-examples.json'), 'utf8'))['grouped-aic'].practice
const initial = replaceCandidates(makeGame('grouped-chain-contract', 'Grouped chain practice', practice.givens, 'imported', 1),
  practice.candidates, { recordHistory: false })
const fixture = { ...initial, started: true, difficulty: 'master', score: 4000,
  position: { ...initial.position, entries: practice.entries, eliminations: practice.eliminations } }
const gameKey = 'sudoku-app:v1:game:' + fixture.id
const nodes = [candidateId({ cell: 0, digit: 3 }), chainGroup(3, [9, 11]), candidateId({ cell: 15, digit: 3 }),
  candidateId({ cell: 78, digit: 3 }), chainGroup(3, [76, 77]), chainGroup(3, [67, 68])]
const expectedEdges = nodes.slice(1).map((node, index) => [nodes[index], node])
const files = ['src/sudoku/chains.ts', 'src/sudoku/chain-sketch.ts', 'src/components/useChainSketch.ts',
  'src/components/ChainsPanel.tsx', 'src/components/Board.tsx', 'src/components/BoardAnnotations.tsx',
  'src/components/Worktable.tsx', 'src/sudoku/generated/engine.wasm', 'src/sudoku/generated/lesson-examples.json',
  'scripts/check-grouped-chains.mjs', 'tests/helpers/browser-puzzle-saves.mjs']
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async file =>
  [file, createHash('sha256').update(await readFile(resolve(root, file))).digest('hex')])))
const report = { status: 'running', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHashes: await hashes(), checks: [], screenshots: [],
  notes: ['Runs the real Vite app and current generated WASM with an existing Grouped AIC practice position.',
    'Checks pointer, touch, keyboard, stored group membership, deductions, and undo. This is a functional check, not a performance benchmark.'] }
const profiles = [{ name: 'desktop', viewport: { width: 1440, height: 1000 } },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]
let server, browser
const failures = []

function seed({ game, key }) {
  // IndexedDB migration removes the legacy localStorage game key. Keep a
  // separate marker so reloads do not reseed over the edited IndexedDB save.
  const marker = `sudoku-app:grouped-chain-check-seeded:${game.id}`
  if (localStorage.getItem(marker)) return
  localStorage.setItem(marker, '1')
  localStorage.setItem(key, JSON.stringify(game))
  localStorage.setItem('sudoku-app:v1:initialized', '1')
  localStorage.setItem('sudoku-app:v1:active', game.id)
  localStorage.setItem('sudoku-app:v1:puzzle-timing', JSON.stringify({ showTimer: false, showPause: true, pauseOnOpen: false, trackTime: false }))
  localStorage.setItem('sudoku-app:v1:workspace-mode', 'standard')
  localStorage.setItem('sudoku-app:v1:error-mode', 'none')
  localStorage.setItem('sudoku-app:v1:advanced-modes', JSON.stringify({
    candidateLayout: 'grid', autoGenerateCandidates: false, autoRemoveCandidates: true, autoPlaceNakedSingles: false,
  }))
  localStorage.setItem('sudoku-app:v1:puzzle-tabs:' + game.id, JSON.stringify({
    toolPanels: { open: ['chains'], active: 'chains' }, drawingIntent: true,
  }))
}
const savedGame = async page => (await savedPuzzles(page)).find(game => game.id === fixture.id) ?? null
async function waitForEdges(page, count) {
  await waitForSavedPuzzle(page, game => game.id === fixture.id &&
    game.chainSketch?.sketches[0]?.history.at(-1)?.length === count)
}
async function screenshot(page, profile, name) {
  if (!screenshotDirectory) return
  await mkdir(resolve(screenshotDirectory), { recursive: true })
  const path = resolve(screenshotDirectory, `${profile}-${name}.png`)
  await page.screenshot({ path, fullPage: true })
  report.screenshots.push({ profile, name, path })
}
async function run(profile) {
  const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.isMobile,
    hasTouch: profile.hasTouch, reducedMotion: 'reduce' })
  await context.addInitScript(seed, { game: fixture, key: gameKey })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const click = locator => profile.hasTouch ? locator.tap() : locator.click()
  const candidate = (cell, digit = 3) => page.getByRole('grid', { name: 'Sudoku grid for drawing links' })
    .getByRole('button', { name: new RegExp(`^${digit} in row ${Math.floor(cell / 9) + 1}, column ${cell % 9 + 1}(?:\\D|$)`) })
  let assertions = 0
  let phase = 'open fixture'
  const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++ }
  async function ready() {
    await page.getByRole('grid', { name: 'Sudoku grid for drawing links' }).waitFor()
    const resume = page.getByRole('button', { name: 'Resume puzzle', exact: true })
    if (await resume.count()) await click(resume)
    await page.getByRole('button', { name: 'Create group', exact: true }).waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Create group' && !button.disabled))
  }
  async function addGroup(cells, expectedCount, keyboard = false) {
    phase = `select group ${cells.join(',')}`
    await click(page.getByRole('button', { name: 'Create group', exact: true }))
    await click(candidate(cells[0]))
    equal(await page.getByRole('button', { name: 'Use group', exact: true }).isDisabled(), true, 'a group requires two candidates')
    if (keyboard) { await candidate(cells[1]).focus(); await page.keyboard.press('Enter') }
    else await click(candidate(cells[1]))
    for (const cell of cells) equal(await candidate(cell).getAttribute('aria-pressed'), 'true', 'all selected group members are pressed')
    phase = `use group ${cells.join(',')}`
    await click(page.getByRole('button', { name: 'Use group', exact: true }))
    await waitForEdges(page, expectedCount)
    equal((await savedGame(page)).chainSketch.pending, chainGroup(3, cells), 'the exact group is the endpoint')
    for (const cell of cells) equal(await candidate(cell).getAttribute('aria-pressed'), 'true', 'all pending group members remain pressed')
  }
  try {
    await page.goto(report.url + '/?puzzle=' + fixture.id)
    await ready()
    phase = 'select first candidate'
    await click(candidate(0))
    await addGroup([9, 11], 1, !profile.hasTouch)
    phase = 'link group to R2C7'
    await click(candidate(15))
    await waitForEdges(page, 2)
    phase = 'link R2C7 to R9C7'
    await click(candidate(78))
    await waitForEdges(page, 3)
    await addGroup([76, 77], 4)
    await addGroup([67, 68], 5)
    phase = 'check complete grouped chain'
    const drawn = await savedGame(page)
    equal(drawn.chainSketch.sketches[0].history.at(-1), expectedEdges, 'drawing includes the group-to-group link')
    equal(await page.locator('.board-chain-group').count(), 3, 'each group has one enclosure')
    const visibleMasks = await page.locator('.candidate-button').evaluateAll(buttons => {
      const masks = Array(81).fill(0)
      for (const button of buttons) {
        const match = button.getAttribute('aria-label')?.match(/^(\\d+) in row (\\d+), column (\\d+)/)
        if (match) masks[(Number(match[2]) - 1) * 9 + Number(match[3]) - 1] |= 1 << (Number(match[1]) - 1)
      }
      return masks
    })
    const visibleProofs = analyzeChainPaths(makeChainGraph(visibleMasks), expectedEdges)
      .map(proof => ({ nodes: proof.nodes, actions: proof.actions }))
    console.log(`Visible grouped-chain proof: ${JSON.stringify({ visibleMasks, visibleProofs })}`)
    await click(page.getByRole('button', { name: 'Chain display options', exact: true }))
    const showEliminations = page.getByRole('menuitemcheckbox', { name: 'Show eliminations', exact: true })
    if (await showEliminations.getAttribute('aria-checked') !== 'true') await click(showEliminations)
    equal(await showEliminations.getAttribute('aria-checked'), 'true', 'chain eliminations are visible')
    await click(page.getByRole('button', { name: 'Chain display options', exact: true }))
    const resume = page.getByRole('button', { name: 'Resume puzzle', exact: true })
    if (await resume.count()) await click(resume)
    await page.waitForFunction(() => !document.querySelector('.puzzle-play-layers')?.hasAttribute('data-paused'))
    await page.waitForFunction(() => !document.querySelector('.apply-chain-edits')?.disabled)
    equal(await page.getByRole('button', { name: 'Apply edits', exact: true }).isDisabled(), false, 'the grouped chain has deductions')
    await screenshot(page, profile.name, 'grouped-aic')

    phase = 'undo chain edit'
    await click(page.getByRole('button', { name: 'Undo edit', exact: true }))
    await waitForEdges(page, 4)
    equal((await savedGame(page)).chainSketch.pending, nodes[4], 'Undo restores the previous group endpoint')
    phase = 'redo chain edit'
    await click(page.getByRole('button', { name: 'Redo edit', exact: true }))
    await waitForEdges(page, 5)
    equal((await savedGame(page)).chainSketch.sketches[0].history.at(-1), expectedEdges, 'Redo restores exact membership')
    phase = 'reload saved chain'
    await page.reload()
    await ready()
    equal((await savedGame(page)).chainSketch.sketches[0].history.at(-1), expectedEdges, 'reload preserves exact membership')
    equal((await savedGame(page)).chainSketch.pending, nodes[5], 'reload preserves the pending group')
    for (const cell of [67, 68]) equal(await candidate(cell).getAttribute('aria-pressed'), 'true', 'reload keeps all group members selected')

    phase = 'cancel group selection'
    await click(page.getByRole('button', { name: 'Create group', exact: true }))
    await click(candidate(0))
    await click(page.getByRole('button', { name: 'Cancel group', exact: true }))
    equal(await page.getByRole('button', { name: 'Use group', exact: true }).count(), 0, 'cancel closes group selection')
    equal((await savedGame(page)).chainSketch.sketches[0].history.at(-1), expectedEdges, 'cancel preserves links')
    phase = 'apply grouped deductions'
    const beforeApply = await savedGame(page)
    await click(page.getByRole('button', { name: 'Apply edits', exact: true }))
    await waitForSavedPuzzle(page, game => game.id === fixture.id && Boolean(game.position.eliminations?.[63] & 4))
    const applied = await savedGame(page)
    equal(Boolean(applied.position.eliminations[63] & 4), true, 'the grouped AIC removes 3 from R8C1')
    equal(applied.chainSketch, undefined, 'applied chains are removed')
    equal(applied.past.length, beforeApply.past.length + 1, 'all deductions form one puzzle undo step')
    phase = 'undo puzzle deductions'
    const inputTabs = page.getByRole('tablist', { name: 'Sudoku input', exact: true })
    if (profile.isMobile) await click(inputTabs.getByRole('tab', { name: 'Digits', exact: true }))
    await click(page.getByRole('button', { name: 'Undo', exact: true }))
    await waitForEdges(page, 5)
    const undone = await savedGame(page)
    equal(undone.position, beforeApply.position, 'puzzle Undo restores all candidates')
    equal(undone.chainSketch, beforeApply.chainSketch, 'puzzle Undo restores grouped links and endpoint')
    phase = 'show restored grouped chain'
    if (profile.isMobile) {
      await click(inputTabs.getByRole('tab', { name: 'Chains', exact: true }))
      await ready()
    }
    await screenshot(page, profile.name, 'undo-restored')
    equal(errors, [], 'the app must not throw browser errors')
    report.checks.push({ profile: profile.name, status: 'passed', assertions })
    console.log(`Passed grouped chain drawing, reload, and apply/undo: ${profile.name} (${assertions} assertions)`)
  } catch (error) {
    let screenshotError
    await screenshot(page, profile.name, 'failure').catch(error => { screenshotError = error.message })
    const saved = await savedGame(page).catch(() => null)
    const detail = { profile: profile.name, status: 'failed', phase, assertions, error: error.message, errors,
      url: page.url(), screenshotError,
      savedState: saved ? { chainSketch: saved.chainSketch, position: saved.position, past: saved.past, future: saved.future } : null,
      body: (await page.locator('body').innerText().catch(() => '')).slice(0, 5000) }
    report.checks.push(detail)
    failures.push(error)
    console.error(JSON.stringify(detail, null, 2))
  } finally { await context.close() }
}

try {
  server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null } })
  await server.listen()
  report.url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
  report.browser = browser.version()
  const selected = profiles.filter(profile => !onlyProfile || profile.name === onlyProfile)
  assert.ok(selected.length, `Unknown profile: ${onlyProfile}`)
  for (const profile of selected) await run(profile)
  assert.deepEqual(await hashes(), report.sourceHashes, 'sources must stay unchanged during the checks')
  report.sourceHashesVerifiedAtEnd = true
  report.status = failures.length ? 'failed' : 'passed'
} catch (error) {
  report.status = 'failed'
  report.infrastructureError = error.message
  throw error
} finally {
  await browser?.close()
  await server?.close()
  if (output) {
    await mkdir(dirname(resolve(output)), { recursive: true })
    await writeFile(resolve(output), JSON.stringify(report, null, 2) + '\n')
    console.log(`Saved ${resolve(output)}`)
  }
}
assert.equal(failures.length, 0, `${failures.length} grouped chain profiles failed`)
