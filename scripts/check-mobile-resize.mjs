import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, preview } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium } from '../tools/react-board-performance/node_modules/playwright/index.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const option = (flag, fallback) => {
  const index = process.argv.indexOf(flag)
  if (index === -1) return fallback
  assert.ok(process.argv[index + 1] && !process.argv[index + 1].startsWith('--'), `Missing ${flag} value`)
  return process.argv[index + 1]
}
const output = option('--output')
const compare = option('--compare')
const regressionOnly = process.argv.includes('--regression-only')
const rounds = Number(option('--rounds', '1'))
const cpuRate = Number(option('--cpu-rate', '1'))
assert.ok(Number.isInteger(rounds) && rounds > 0)
assert.ok(Number.isFinite(cpuRate) && cpuRate >= 1)
assert.ok(!regressionOnly || !compare, '--regression-only checks current behavior without a historical comparison')
const temporary = await mkdtemp(resolve(tmpdir(), 'sudoku-mobile-resize-'))
let server, browser
const errors = []
const sha256 = value => createHash('sha256').update(value).digest('hex')
const sourceFiles = [
  'src/components/MobileInputResizeHandle.tsx', 'src/components/MobilePanelLayout.tsx',
  'src/components/Board.tsx', 'src/components/BoardMarks.tsx', 'src/components/BoardAnnotations.tsx',
  'src/components/Controls.tsx', 'src/components/MobileInputTabs.tsx', 'src/components/ModeBadge.tsx',
  'src/components/ResizeStepControls.tsx',
  'src/components/usePuzzleZoom.ts', 'src/components/Presence.tsx', 'src/styles.css',
  'src/sudoku/mobile-input-sizing.ts', 'tests/browser/mobile-resize/fixture.tsx',
  'tests/browser/mobile-resize/index.html', 'scripts/check-mobile-resize.mjs', 'package-lock.json',
  'tools/react-board-performance/package-lock.json',
]
async function hashes() {
  return Object.fromEntries(await Promise.all(sourceFiles.map(async name => [name, sha256(await readFile(resolve(root, name)))])))
}

async function frames(page, count = 2) {
  await page.evaluate(count => new Promise(resolve => {
    const next = () => --count <= 0 ? resolve() : requestAnimationFrame(next)
    requestAnimationFrame(next)
  }), count)
}

async function snapshot(page) {
  return page.evaluate(() => {
    const layout = document.querySelector('.mobile-panel-layout')
    const input = document.querySelector('.mobile-input-tabs')
    const digit = input.querySelector('.key')
    const grid = document.querySelector('.sudoku-grid')
    const frame = document.querySelector('.board-frame')
    const badge = document.querySelector('.puzzle-mode-tab')
    const handle = document.querySelector('.mobile-input-resize')
    const box = element => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }
    const badgeBox = box(badge)
    const handleBox = box(handle)
    return {
      input: box(input), digit: box(digit), grid: box(grid), frame: box(frame), badge: badgeBox,
      outsideClues: [...document.querySelectorAll('[data-outside-clue]')].map(clue => ({
        type: clue.dataset.outsideClue, box: box(clue),
      })),
      edge: document.querySelector('[data-mobile-panel="input"]').dataset.resizeEdge,
      preview: Boolean(document.querySelector('[data-resize-preview], .puzzle[style*="--mobile-input-resize-puzzle-scale"]')),
      resizing: layout.hasAttribute('data-input-resizing'),
      commits: window.resizeCommits.length,
      savedHeight: layout.style.getPropertyValue('--mobile-resized-input-height'),
      boardLimit: layout.style.getPropertyValue('--mobile-fit-board-height'),
      resizeHandleReachable: handle.contains(document.elementFromPoint(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)),
      badgeVisible: badge.contains(document.elementFromPoint(badgeBox.x + badgeBox.width / 2, badgeBox.y + badgeBox.height / 2)),
      styles: [...document.querySelectorAll('.mobile-input-tabs, .puzzle-column, .puzzle, .puzzle-zoom, .puzzle-zoom-content, .puzzle-metadata, .puzzle-actions')]
        .map(element => element.getAttribute('style') || ''),
    }
  })
}

function assertGeometry(state, message) {
  const bounds = state.outsideClues.length ? state.frame : state.grid
  assert.ok(bounds.width <= state.input.width + 2, `${message}: board and clue gutters must stay within the input width`)
  assert.ok(Math.abs(bounds.x + bounds.width / 2 - state.input.x - state.input.width / 2) < 2,
    `${message}: board including its clue gutters must stay centered over the input`)
  assert.ok(state.badgeVisible, `${message}: floating mode badge must remain visible and reachable`)
  if (state.outsideClues.length) {
    const contained = inner => inner.x >= state.frame.x - 1 && inner.y >= state.frame.y - 1 &&
      inner.x + inner.width <= state.frame.x + state.frame.width + 1 &&
      inner.y + inner.height <= state.frame.y + state.frame.height + 1
    assert.ok(contained(state.grid), `${message}: the grid border must stay inside the board frame`)
    assert.equal(state.outsideClues.length, 4, `${message}: all side, top, and diagonal clues must remain present`)
    for (const clue of state.outsideClues) assert.ok(clue.box.width > 0 && clue.box.height > 0 && contained(clue.box),
      `${message}: the ${clue.type} clue must stay inside its reserved board gutter`)
  }
}

async function startDrag(page, client) {
  const handle = await page.locator('.mobile-input-resize').boundingBox()
  assert.ok(handle)
  const point = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2, id: 1 }
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  return point
}

async function moveDrag(page, client, start, distance, steps = 18) {
  for (let step = 1; step <= steps; step++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...start, y: start.y + distance * step / steps }] })
    await frames(page, 1)
  }
}

async function finishDrag(page, client, cancel = false) {
  await client.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] })
  await frames(page, 3)
}

async function dragPuzzleFromSide(page, distance) {
  const frame = await page.locator('.board-frame').boundingBox()
  assert.ok(frame)
  const point = { x: frame.x - 8, y: frame.y + frame.height / 2, id: 2 }
  assert.ok(point.x >= 0, 'the side drag point must stay inside the mobile viewport')
  const target = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y)
    return { className: element?.className?.toString() ?? '', panel: element?.closest('.mobile-panel')?.getAttribute('data-mobile-panel') ?? null,
      touchAction: getComputedStyle(element).touchAction }
  }, point)
  assert.equal(target.panel, 'puzzle', 'the drag must start beside the puzzle within its panel')
  assert.ok(target.className.includes('mobile-puzzle-gesture-side'), 'the side gap must have its own touch target')
  assert.equal(target.touchAction, 'none', 'the side hit target must keep touch drags from scrolling the page')
  assert.ok(!target.className.includes('cell'), 'the side drag must start in blank space, outside the grid')
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  for (let step = 1; step <= 18; step++) {
    await page.mouse.move(point.x, point.y + distance * step / 18)
    await frames(page, 1)
  }
  await page.mouse.up()
  await frames(page, 3)
  await page.locator('[data-puzzle-gesture-locking]').first().waitFor({ state: 'detached' })
  return page.evaluate(() => window.puzzleGestureCommits.at(-1))
}

async function metrics(client) {
  return Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]))
}
function metricChange(before, after) {
  return {
    layouts: after.LayoutCount - before.LayoutCount,
    styleRecalculations: after.RecalcStyleCount - before.RecalcStyleCount,
    layoutMilliseconds: (after.LayoutDuration - before.LayoutDuration) * 1000,
    styleMilliseconds: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
  }
}
function frameSummary(frames) {
  const gaps = frames.map(({ gap }) => gap)
  return { intervals: gaps, longestMilliseconds: Math.max(0, ...gaps), over25ms: gaps.filter(gap => gap > 25).length }
}

async function measure(page, client) {
  const before = await metrics(client)
  const startedAt = await page.evaluate(() => {
    window.resizeFrames = []
    window.resizePreviousFrame = undefined
    window.measureResizeFrames = true
    const frame = time => {
      if (!window.measureResizeFrames) return
      if (window.resizePreviousFrame !== undefined) window.resizeFrames.push({ time, gap: time - window.resizePreviousFrame })
      window.resizePreviousFrame = time
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    return performance.now()
  })
  const start = await startDrag(page, client)
  await moveDrag(page, client, start, -72)
  const beforeRelease = await metrics(client)
  const releasedAt = await page.evaluate(() => performance.now())
  await finishDrag(page, client)
  const timing = await page.evaluate(() => {
    window.measureResizeFrames = false
    return { finishedAt: performance.now(), frames: window.resizeFrames }
  })
  const after = await metrics(client)
  return {
    drag: { ...metricChange(before, beforeRelease), durationMilliseconds: releasedAt - startedAt,
      frames: frameSummary(timing.frames.filter(frame => frame.time <= releasedAt)) },
    release: { ...metricChange(beforeRelease, after), durationMilliseconds: timing.finishedAt - releasedAt,
      frames: frameSummary(timing.frames.filter(frame => frame.time > releasedAt)) },
    total: metricChange(before, after),
  }
}

async function checkBehavior(page, client) {
  const beforeCancel = await snapshot(page)
  const direction = beforeCancel.edge === 'top' ? -1 : 1
  assertGeometry(beforeCancel, 'before cancellation')
  const cancelStart = await startDrag(page, client)
  await moveDrag(page, client, cancelStart, -direction * 36, 9)
  const duringCancel = await snapshot(page)
  assert.ok(duringCancel.preview && duringCancel.resizing, 'drag must show an active resize preview')
  assertGeometry(duringCancel, 'during drag')
  await finishDrag(page, client, true)
  const afterCancel = await snapshot(page)
  assert.ok(!afterCancel.preview && !afterCancel.resizing, 'cancellation must remove preview attributes')
  assert.equal(afterCancel.commits, beforeCancel.commits, 'cancellation must not save a height')
  assert.equal(afterCancel.savedHeight, beforeCancel.savedHeight, 'cancellation must restore the saved height')
  assert.deepEqual(afterCancel.styles, beforeCancel.styles, 'cancellation must restore all inline preview styles')
  assert.ok(Math.abs(afterCancel.grid.width - beforeCancel.grid.width) < 1, 'cancellation must restore the grid size')

  await page.locator('.mobile-input-resize').press('End')
  await frames(page, 3)
  const small = await snapshot(page)
  assertGeometry(small, 'small board')
  const expandStart = await startDrag(page, client)
  // Outside clues reserve fixed-size coordinate labels as well as proportional
  // gutters. Compare the full frame when its labels return to their normal size.
  const widthOf = state => state.outsideClues.length ? state.frame.width : state.grid.width
  const widths = [widthOf(small)]
  let lastPreview = small
  // End on an anchor here to compare preview and committed board geometry.
  for (const distance of [24, 48, 64]) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...expandStart, y: expandStart.y - direction * distance }] })
    await frames(page, 2)
    const current = await snapshot(page)
    assertGeometry(current, `expanding board at ${distance}px`)
    widths.push(widthOf(current))
    lastPreview = current
  }
  assert.ok(widths.every((width, index) => index === 0 || width >= widths[index - 1]), 'board growth must be gradual')
  assert.ok(widths.at(-1) > widths[0] + 20,
    `a previously shrunken board must grow again: ${widths.join(' → ')}, ` +
    `input heights ${small.input.height} → ${lastPreview.input.height}, board limit ${small.boardLimit}, ` +
    `resize handle reachable: ${small.resizeHandleReachable}, resizing: ${lastPreview.resizing}`)
  await finishDrag(page, client)
  const expanded = await snapshot(page)
  assertGeometry(expanded, 'after expansion commits')
  assert.ok(Math.abs(parseFloat(small.savedHeight) - parseFloat(expanded.savedHeight) - 64) < 1,
    'shrinking the input must save the relative 64 px anchor')
  assert.ok(Math.abs(widthOf(expanded) - widths.at(-1)) < 2,
    `release must keep the preview width (${widths.at(-1)}px preview, ${widthOf(expanded)}px released)`)

  await page.locator('.mobile-input-resize').press('Home')
  await frames(page, 3)
  const restored = await snapshot(page)
  assertGeometry(restored, 'keyboard reset')
  assert.equal(restored.savedHeight, '', 'Home must restore natural sizing')
  return { expandWidths: widths, edge: beforeCancel.edge,
    ...(small.outsideClues.length ? { measuredElement: 'board frame including clue gutters',
      outsideGeometry: { small, preview: lastPreview, committed: expanded } } : {}) }
}

async function checkViewportInterruption(page, client) {
  const before = await snapshot(page)
  const start = await startDrag(page, client)
  await moveDrag(page, client, start, -24, 6)
  await page.setViewportSize({ width: 414, height: 896 })
  await frames(page, 3)
  await finishDrag(page, client, true)
  const after = await snapshot(page)
  assert.ok(!after.preview && !after.resizing, 'viewport changes must stop the preview')
  assert.equal(after.commits, before.commits, 'viewport changes must not save an unfinished drag')
  assertGeometry(after, 'after a viewport change interrupts the drag')
}

try {
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const sourceStatus = execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim()
  const sourceHashes = await hashes()
  const baselineHashes = {}
  let baselineModule = resolve(root, 'src/components/MobilePanelLayout.tsx')
  let baselineCss = resolve(root, 'src/styles.css')
  let baselineResizeRule
  let baselineCssSha256
  if (compare) {
    for (const name of ['MobileInputResizeHandle.tsx', 'MobilePanelLayout.tsx']) {
      const sourceName = `src/components/${name}`
      const original = execFileSync('git', ['show', `${compare}:${sourceName}`], { cwd: root, encoding: 'utf8' })
      baselineHashes[sourceName] = sha256(original)
      const rewritten = original.replace(/from\s+(['"])(\.[^'"]+)\1/g, (_, quote, path) => {
        const target = path === './MobileInputResizeHandle'
          ? resolve(temporary, 'MobileInputResizeHandle.tsx') : resolve(root, 'src/components', path)
        return `from ${quote}${target}${quote}`
      })
      await writeFile(resolve(temporary, name), rewritten)
    }
    baselineModule = resolve(temporary, 'MobilePanelLayout.tsx')
    const originalCss = execFileSync('git', ['show', `${compare}:src/styles.css`], { cwd: root, encoding: 'utf8' })
    baselineResizeRule = originalCss.match(/\.puzzle-zoom-content\s*\{[^}]*\}/)?.[0]
    assert.ok(baselineResizeRule, 'The baseline must contain the resize content rule')
    const currentCss = await readFile(resolve(root, 'src/styles.css'), 'utf8')
    const comparisonCss = currentCss.replace(/\.puzzle-zoom-content\s*\{[^}]*\}/, baselineResizeRule)
    baselineCssSha256 = sha256(comparisonCss)
    baselineCss = resolve(temporary, 'resize-baseline.css')
    await writeFile(baselineCss, comparisonCss)
  }
  await build({
    configFile: false, root: resolve(root, 'tests/browser/mobile-resize'), logLevel: 'warn',
    plugins: [react()], resolve: { dedupe: ['react', 'react-dom', 'lucide-react'], alias: {
      'virtual:resize-baseline': baselineModule, 'virtual:resize-legacy.css': baselineCss,
    } },
    build: { outDir: resolve(temporary, 'dist'), emptyOutDir: true },
  })
  assert.deepEqual(await hashes(), sourceHashes, 'Sources must not change while building the comparison')
  server = await preview({ configFile: false, root, logLevel: 'warn',
    build: { outDir: resolve(temporary, 'dist') }, preview: { host: '127.0.0.1', port: 0, strictPort: false } })
  const address = server.httpServer.address()
  const url = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
  const report = {
    baselineRevision: compare || null, baselineHashes, baselineResizeRule, baselineCssSha256, sourceHashes, browser: browser.version(),
    sourceCommit, sourceStatus,
    configuration: { viewport: { width: 390, height: 844 }, cpuRate, reducedMotion: false, visibleCandidates: 729,
      dragPixels: 72, dragSteps: 18, rounds, regressionOnly },
    notes: [
      'Both resize implementations share the same production Board and controls. Baseline uses its original resize JS and puzzle-zoom-content CSS rule; all other current CSS is shared.',
      'The fixture uses real mobile layout, resize, controls, badge, and zoom components without Worktable, routing, WASM, or app room storage initialization.',
      'This is desktop Chromium with mobile dimensions and touch input, not a physical phone.',
      'Layout/style metrics are Chromium Performance counters. Animation-frame intervals do not measure paint latency or INP.',
      'The dense fixture shows nine candidates in all 81 cells to make board invalidation costs visible.',
    ],
    measurements: [], checks: [],
  }
  async function openPage(query = '', reversed = false) {
    const context = await browser.newContext({ viewport: report.configuration.viewport, hasTouch: true,
      isMobile: true, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
    if (reversed) await context.addInitScript(() => {
      localStorage.setItem('sudoku-app:v1:mobile-panel-order', JSON.stringify(['input', 'puzzle', 'hint', 'completion']))
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const client = await context.newCDPSession(page)
    await client.send('Performance.enable')
    await client.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
    await page.goto(`${url}${query}`)
    await page.locator('.mobile-input-resize').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(350)
    await frames(page, 4)
    return { context, page, client }
  }
  for (let round = 0; round < rounds; round++) {
    const variants = compare ? (round % 2 ? ['optimized', 'baseline'] : ['baseline', 'optimized']) : ['optimized']
    for (const variant of variants) {
      const { context, page, client } = await openPage(variant === 'baseline' ? '?baseline=1' : '')
      try {
        assertGeometry(await snapshot(page), `${variant} initial layout`)
        if (regressionOnly) {
          for (const [distance, expected] of [[-76, 80], [21, -16]]) {
            const before = await snapshot(page)
            const start = await startDrag(page, client)
            await moveDrag(page, client, start, distance)
            await finishDrag(page, client)
            const after = await snapshot(page)
            const initialHeight = parseFloat(before.savedHeight) || before.input.height
            assert.equal(after.commits, before.commits + 1, 'a completed drag must save exactly once')
            assert.ok(Math.abs(parseFloat(after.savedHeight) - initialHeight - expected) < 1,
              `a ${distance} px input drag must snap to the nearest 16 px anchor`)
            await page.locator('[data-mobile-panel="input"]').evaluate(panel =>
              Promise.allSettled(panel.getAnimations().map(animation => animation.finished)))
          }
          const handle = page.locator('.mobile-input-resize')
          const initialHeight = Number(await handle.getAttribute('aria-valuenow'))
          await handle.press('ArrowUp')
          assert.equal(Number(await handle.getAttribute('aria-valuenow')), initialHeight + 16)
          await handle.press('Shift+Enter')
          const options = page.getByRole('dialog', { name: 'Resize input panel' })
          await options.getByRole('button', { name: 'Shorter' }).click()
          assert.equal(Number(await handle.getAttribute('aria-valuenow')), initialHeight)
          await options.getByRole('button', { name: 'Close dialog' }).click()
          await page.locator('.resize-options-dialog').waitFor({ state: 'detached' })
        } else {
          const result = await measure(page, client)
          report.measurements.push({ variant, round: round + 1, ...result })
          console.log(`${variant} round ${round + 1}: drag style ${result.drag.styleMilliseconds.toFixed(1)}ms; layout ${result.drag.layoutMilliseconds.toFixed(1)}ms; frames over 25ms ${result.drag.frames.over25ms}`)
        }
        assertGeometry(await snapshot(page), `${variant} committed layout`)
        if (variant === 'optimized' && round === 0) {
          report.checks.push({ scenario: 'portrait', ...await checkBehavior(page, client) })
          await checkViewportInterruption(page, client)
          report.checks.push({ scenario: 'viewport change cancels drag' })
        }
      } finally { await context.close() }
    }
  }
  const withoutHint = await openPage()
  const noHint = await snapshot(withoutHint.page)
  await withoutHint.context.close()
  for (const scenario of [{ query: '', reversed: true, name: 'input above puzzle' },
    { query: '?hint=1', reversed: false, name: 'hint panel open' },
    { query: '?outside=1', reversed: false, name: 'outside clues at side, top, and diagonal' }]) {
    console.log(`Checking ${scenario.name}`)
    const { context, page, client } = await openPage(scenario.query, scenario.reversed)
    try {
      if (scenario.query === '?hint=1') {
        const withHint = await snapshot(page)
        for (const item of ['input', 'digit']) {
          assert.ok(Math.abs(withHint[item].height - noHint[item].height) < 1, `hint must preserve ${item} height`)
          assert.ok(Math.abs(withHint[item].width - noHint[item].width) < 1, `hint must preserve ${item} width`)
        }
        assert.ok(withHint.grid.height < noHint.grid.height, 'hint must make room by shrinking the grid')
      }
      report.checks.push({ scenario: scenario.name, ...await checkBehavior(page, client) })
    }
    finally { await context.close() }
  }
  console.log('Checking puzzle resize from its side')
  {
    const { context, page, client } = await openPage()
    try {
      const smaller = await dragPuzzleFromSide(page, 300)
      assert.ok(smaller?.shrink > 0, 'dragging down beside the puzzle must shrink it')
      const larger = await dragPuzzleFromSide(page, -76)
      assert.ok(larger?.shrink < smaller.shrink, 'dragging up from the side after shrinking must restore puzzle size')
      const displacement = (from, to) => to.space + to.shrink - from.space - from.shrink
      assert.ok(Math.abs(displacement(smaller, larger) + 80) < 1, 'an upward puzzle drag must snap to the nearest 16 px anchor')
      const lowered = await dragPuzzleFromSide(page, 22)
      assert.ok(Math.abs(displacement(larger, lowered) - 16) < 1, 'a downward puzzle drag must snap to the nearest 16 px anchor')
      report.checks.push({ scenario: 'shrink and restore puzzle from side negative space', smaller, larger, lowered })
    } finally { await context.close() }
  }
  assert.deepEqual(errors, [], 'resize must not produce browser or ResizeObserver errors')
  assert.deepEqual(await hashes(), sourceHashes, 'Sources must not change during the resize checks or measurements')
  report.sourceHashesVerifiedAtEnd = true
  report.status = 'passed'
  if (output) {
    await mkdir(dirname(resolve(output)), { recursive: true })
    await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`)
  }
  console.log(output ? `Saved ${resolve(output)}` : JSON.stringify(report, null, 2))
} finally {
  await browser?.close()
  if (server) await new Promise(resolve => server.httpServer.close(resolve))
  await rm(temporary, { recursive: true, force: true })
}
