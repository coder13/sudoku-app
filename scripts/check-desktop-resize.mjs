import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, preview } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium } from '../tools/react-board-performance/node_modules/playwright/index.mjs'

// Last main before this desktop fix. CI fetches this exact object, not a moving branch.
const BASELINE = 'f5dcace8f5115d6752c63ee826ee27a0380d232e'
const root = fileURLToPath(new URL('../', import.meta.url))
const preferenceKey = 'sudoku-app:v1:play-preferences'
const viewport = { width: 1440, height: 1000 }
const handles = [
  { name: 'left-edge', selector: '.desktop-layout-edge[data-edge="left"]', direction: -1, outer: true },
  { name: 'right-edge', selector: '.desktop-layout-edge[data-edge="right"]', direction: 1, outer: true },
  { name: 'divider', selector: '.desktop-layout-divider', direction: -1, outer: false },
]
const option = (flag, fallback) => {
  const index = process.argv.indexOf(flag)
  if (index === -1) return fallback
  assert.ok(process.argv[index + 1] && !process.argv[index + 1].startsWith('--'), `Missing ${flag} value`)
  return process.argv[index + 1]
}
const output = option('--output')
const baselineRoot = option('--baseline-root')
const rounds = Number(option('--rounds', '2'))
const cpuRate = Number(option('--cpu-rate', '1'))
const regressionOnly = process.argv.includes('--regression-only')
const buildOnly = process.argv.includes('--build-only')
const traceCurrentDivider = process.argv.includes('--trace-current-divider')
assert.ok(Number.isInteger(rounds) && rounds > 0)
assert.ok(Number.isFinite(cpuRate) && cpuRate >= 1)
assert.ok(!traceCurrentDivider || output && !regressionOnly,
  '--trace-current-divider requires --output and a baseline comparison')
const temporary = await mkdtemp(resolve(tmpdir(), 'sudoku-desktop-resize-'))
const sha256 = value => createHash('sha256').update(value).digest('hex')
const sourceFiles = [
  'src/components/DesktopPlayLayout.tsx', 'src/components/desktop-resize-preview.ts', 'src/components/PlayLayout.tsx', 'src/components/Worktable.tsx',
  'src/components/HintCard.tsx', 'src/components/Board.tsx', 'src/components/BoardMarks.tsx', 'src/components/BoardAnnotations.tsx',
  'src/components/Controls.tsx', 'src/components/ModeBadge.tsx', 'src/components/Modal.tsx',
  'src/components/ResizeStepControls.tsx', 'src/components/Presence.tsx', 'src/components/usePlayPreference.ts',
  'src/sudoku/play-preferences.ts', 'src/sudoku/themes.ts', 'src/styles.css', 'package-lock.json',
  'tests/browser/desktop-resize/fixture.tsx', 'tests/browser/desktop-resize/index.html',
  'tests/browser/desktop-resize/tsconfig.json', 'tests/browser/desktop-resize/virtual.d.ts',
  'scripts/check-desktop-resize.mjs', 'tools/react-board-performance/package-lock.json',
]
const hashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file =>
  [file, sha256(await readFile(resolve(root, file)))])))
const report = {
  status: 'running', baselineRevision: regressionOnly ? null : BASELINE,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceStatus: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHashes: await hashes(), baselineHashes: {},
  configuration: { viewport, cpuRate, reducedMotion: false, dragPixels: 72, dragSteps: 18, rounds, regressionOnly, traceCurrentDivider },
  notes: [
    'Production React fixture with real DesktopPlayLayout, PlayWorkspace, PlayLayout, Board, Controls, ModeBadge, dialog, and preference store.',
    'The fixture mirrors Worktable play layers and its input-alignment ResizeObserver. It excludes Worktable state, routing, WASM, syncing, and the clock.',
    'Baseline uses the pinned DesktopPlayLayout controller, Board renderer, and complete stylesheet. Other components and theme tokens are shared current sources. This compares the desktop fix, not whole app releases.',
    'Normal notes are precomputed for the starter puzzle. The dense stress board has nine candidates in every cell. Neither case invokes the solver.',
    'Mouse drags use native Chromium input. Only queued pointer lifecycle checks dispatch synthetic pointer events to exercise events within one task.',
    'Style/layout counters and animation-frame gaps do not measure paint latency or INP. Headless Chromium does not establish performance on the user desktop.',
    'Timings are observations, not CI pass/fail thresholds. Behavior and geometry assertions are the regression gates.',
    'An optional current dense-divider trace repeats the first-round scenario in a fresh page. Its timings are diagnostic only and are excluded from paired measurements.',
  ],
  measurements: [], diagnostics: [], checks: [], browserErrors: [],
}
let server, browser

const frames = (page, count = 3) => page.evaluate(count => new Promise(resolve => {
  const frame = () => --count <= 0 ? resolve() : requestAnimationFrame(frame)
  requestAnimationFrame(frame)
}), count)

async function snapshot(page) {
  return page.evaluate(key => {
    const box = selector => {
      const element = document.querySelector(selector)
      if (!element) return null
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }
    const badge = document.querySelector('.puzzle-mode-tab')
    const badgeBox = box('.puzzle-mode-tab')
    const styleSelectors = ['.desktop-play-resizable', '.standard-workspace-page', '.workspace',
      '.standard-puzzle-stack', '.puzzle-column', '.puzzle', '.puzzle-stage', '.puzzle-play-layers',
      '.puzzle-live-layer', '.board-frame', '.board-body',
      '.standard-input-stack', '.controls', '.desktop-layout-edges']
    const styles = Object.fromEntries(styleSelectors.map(selector => {
      const element = document.querySelector(selector)
      return [selector, element ? Object.fromEntries([...element.style].sort().map(name => [name, element.style.getPropertyValue(name)])) : null]
    }))
    const layoutStyle = getComputedStyle(document.querySelector('.workspace'))
    return {
      page: box('.standard-workspace-page'), puzzle: box('.puzzle'), stage: box('.puzzle-stage'), frame: box('.board-frame'), grid: box('.sudoku-grid'),
      hint: box('.hint-dock'),
      input: box('.controls'), badge: badgeBox,
      solvedStyle: Boolean(document.querySelector('[data-desktop-solved]')),
      badgeReachable: badge && badgeBox && badge.contains(document.elementFromPoint(badgeBox.x + badgeBox.width / 2, badgeBox.y + badgeBox.height / 2)),
      outsideClues: [...document.querySelectorAll('[data-outside-clue]')].map(clue => {
        const { x, y, width, height } = clue.getBoundingClientRect()
        return { type: clue.dataset.outsideClue, x, y, width, height }
      }),
      links: [...document.querySelectorAll('.board-links polyline:not(.board-link-target)')].map(link => {
        const { x, y, width, height } = link.getBoundingClientRect()
        return { points: link.getAttribute('points'), x, y, width, height }
      }),
      handles: Object.fromEntries([...document.querySelectorAll('.desktop-layout-edge, .desktop-layout-divider')].map(handle => [
        handle.dataset.edge ? `${handle.dataset.edge}-edge` : 'divider', {
          width: Number(handle.getAttribute('aria-valuenow')), min: Number(handle.getAttribute('aria-valuemin')),
          max: Number(handle.getAttribute('aria-valuemax')), text: handle.getAttribute('aria-valuetext'),
        },
      ])),
      scale: Number(layoutStyle.getPropertyValue('--desktop-layout-scale')) || 1,
      contentWidth: parseFloat(layoutStyle.getPropertyValue('--desktop-layout-content-width')) || 1128,
      resizing: Boolean(document.querySelector('[data-layout-resizing]')), styles,
      glyphStyles: Object.fromEntries([...document.querySelectorAll('.cell-value')].map(glyph => [
        glyph.closest('[data-cell]')?.getAttribute('data-cell'),
        Object.fromEntries([...glyph.style].sort().map(name => [name, glyph.style.getPropertyValue(name)])),
      ])),
      candidateStyles: [...document.querySelectorAll('.candidate-marks')].map(marks => {
        const hasStyleAttribute = marks.hasAttribute('style')
        return {
          cell: marks.closest('[data-cell]')?.getAttribute('data-cell'),
          preview: marks.getAttribute('data-desktop-candidate-preview'), hasStyleAttribute,
          // Do not create a CSSOM declaration when there is no inline style.
          styles: hasStyleAttribute ? Object.fromEntries([...marks.style].sort().map(name => [name, {
            value: marks.style.getPropertyValue(name), priority: marks.style.getPropertyPriority(name),
          }])) : {},
        }
      }),
      preferences: JSON.parse(localStorage.getItem(key)), writes: window.desktopResizeProbe.writes.length,
      candidates: window.desktopResizeFixture.candidates,
    }
  }, preferenceKey)
}

function assertGeometry(state, label) {
  for (const name of ['page', 'frame', 'grid', 'input', ...(!state.solvedStyle ? ['badge'] : []), ...(state.hint ? ['hint'] : [])]) {
    assert.ok(state[name]?.width > 0 && state[name]?.height > 0, `${label}: ${name} must be visible`)
  }
  const contains = (outer, inner) => inner.x >= outer.x - 2 && inner.y >= outer.y - 2 &&
    inner.x + inner.width <= outer.x + outer.width + 2 && inner.y + inner.height <= outer.y + outer.height + 2
  assert.ok(contains(state.frame, state.grid), `${label}: grid must stay inside its frame`)
  assert.ok(Math.abs(state.grid.width - state.grid.height) < 2, `${label}: grid must remain square`)
  assert.ok(state.frame.x + state.frame.width <= state.input.x + 2, `${label}: board and input must not overlap`)
  assert.ok(Math.abs(state.grid.y - state.input.y) < 2,
    `${label}: input must align with grid top (${state.input.y}px input, ${state.grid.y}px grid)`)
  if (!state.solvedStyle) assert.ok(state.badgeReachable, `${label}: mode badge must remain reachable above resize handles`)
  for (const link of state.links) assert.ok(contains(state.grid, link), `${label}: chain links must remain aligned inside the grid`)
  if (state.outsideClues.length) {
    assert.equal(state.outsideClues.length, 4, `${label}: every outside clue must remain mounted`)
    for (const clue of state.outsideClues) assert.ok(clue.width > 0 && clue.height > 0 && contains(state.frame, clue),
      `${label}: ${clue.type} clue must stay within the board frame`)
  }
}

function assertSameGeometry(before, after, label, tolerance = 2) {
  for (const name of ['page', 'puzzle', 'stage', 'frame', 'grid', 'input', ...(before.badge ? ['badge'] : []), ...(before.hint ? ['hint'] : [])]) {
    for (const property of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(before[name][property] - after[name][property]) <= tolerance,
        `${label}: ${name}.${property} moved from ${before[name][property]} to ${after[name][property]}`)
    }
  }
  assert.equal(after.links.length, before.links.length, `${label}: chain links must remain mounted`)
  for (let index = 0; index < before.links.length; index++) {
    assert.equal(after.links[index].points, before.links[index].points, `${label}: chain path must stay unchanged`)
    for (const property of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(before.links[index][property] - after.links[index][property]) <= tolerance,
        `${label}: chain ${index} ${property} must not jump`)
    }
  }
}

async function glyphSnapshot(page) {
  return page.evaluate(() => {
    const selectors = {
      given: '.cell.given .cell-value',
      candidate: '.candidate-marks .board-candidate, .center-marks .board-candidate',
    }
    return Object.entries(selectors).flatMap(([kind, selector]) => {
      const elements = [...document.querySelectorAll(selector)]
      return [...new Set([0, Math.floor(elements.length / 2), elements.length - 1])].filter(index => elements[index]).map(index => {
        const element = elements[index]
        const range = document.createRange()
        range.selectNodeContents(element)
        const { x, y, width, height } = range.getBoundingClientRect()
        const rect = target => {
          const { x, y, width, height } = target.getBoundingClientRect()
          return { x, y, width, height }
        }
        return { kind, cell: element.closest('[data-cell]')?.getAttribute('data-cell'), text: element.textContent,
          x, y, width, height, fontSize: getComputedStyle(element).fontSize, scale: getComputedStyle(element).scale,
          elementBounds: rect(element), cellBounds: rect(element.closest('[data-cell]')) }
      })
    })
  })
}

function assertSameGlyphs(before, after, label) {
  assert.ok(before.some(glyph => glyph.kind === 'given') && before.some(glyph => glyph.kind === 'candidate'),
    `${label}: fixture must contain given digits and notes`)
  assert.equal(after.length, before.length)
  for (let index = 0; index < before.length; index++) {
    const previous = before[index], next = after[index]
    assert.deepEqual([next.kind, next.cell, next.text], [previous.kind, previous.cell, previous.text])
    for (const property of ['x', 'y', 'width', 'height']) {
      assert.ok(previous.width > 0 && previous.height > 0 && Math.abs(previous[property] - next[property]) <= 1.5,
        `${label}: ${previous.kind} ${previous.text} in cell ${previous.cell} ${property} changed from ${previous[property]} to ${next[property]}`)
    }
  }
}

async function startDrag(page, handle) {
  const bounds = await page.locator(handle.selector).boundingBox()
  assert.ok(bounds?.width > 0 && bounds.height > 0, `${handle.name}: resize handle must have a hit target`)
  const point = { x: bounds.x + bounds.width / 2, y: Math.min(bounds.y + bounds.height * .35, viewport.height - 80) }
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  return point
}

async function moveDrag(page, start, distance, steps = 18) {
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(start.x + distance * step / steps, start.y)
    await frames(page, 1)
  }
}

const metrics = async client => Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]))
const difference = (before, after) => ({
  layouts: after.LayoutCount - before.LayoutCount,
  styleRecalculations: after.RecalcStyleCount - before.RecalcStyleCount,
  layoutMilliseconds: (after.LayoutDuration - before.LayoutDuration) * 1000,
  styleMilliseconds: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
})
function frameSummary(samples) {
  const gaps = samples.map(({ gap }) => gap)
  return { intervals: gaps, longestMilliseconds: Math.max(0, ...gaps),
    over25ms: gaps.filter(gap => gap > 25).length, over50ms: gaps.filter(gap => gap > 50).length }
}

async function measure(page, client, handle) {
  const initial = await snapshot(page)
  assertGeometry(initial, 'before measurement')
  const before = await metrics(client)
  const startedAt = await page.evaluate(() => {
    const probe = window.desktopResizeProbe
    probe.frames = []
    probe.previousFrame = undefined
    probe.recording = true
    const frame = time => {
      if (!probe.recording) return
      if (probe.previousFrame !== undefined) probe.frames.push({ time, gap: time - probe.previousFrame })
      probe.previousFrame = time
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    performance.mark('desktop-resize-drag-start')
    return performance.now()
  })
  const start = await startDrag(page, handle)
  await moveDrag(page, start, -handle.direction * 72)
  const beforeRelease = await metrics(client)
  const releasedAt = await page.evaluate(() => {
    performance.mark('desktop-resize-release-start')
    return performance.now()
  })
  await page.mouse.up()
  await page.waitForTimeout(250)
  await frames(page, 2)
  const timing = await page.evaluate(() => {
    window.desktopResizeProbe.recording = false
    performance.mark('desktop-resize-release-end')
    return { finishedAt: performance.now(), frames: window.desktopResizeProbe.frames }
  })
  const after = await metrics(client)
  const final = await snapshot(page)
  assertGeometry(final, 'after measurement')
  assert.ok(final.handles[handle.name].width < initial.handles[handle.name].width, 'measured drag must actually resize the panel')
  assert.equal(final.writes, initial.writes + 1, 'measured drag must save once')
  return {
    candidates: initial.candidates, initialWidth: initial.handles[handle.name].width, finalWidth: final.handles[handle.name].width,
    drag: { ...difference(before, beforeRelease), durationMilliseconds: releasedAt - startedAt,
      frames: frameSummary(timing.frames.filter(frame => frame.time <= releasedAt)) },
    release: { ...difference(beforeRelease, after), durationMilliseconds: timing.finishedAt - releasedAt,
      frames: frameSummary(timing.frames.filter(frame => frame.time > releasedAt)) },
    total: difference(before, after),
  }
}

async function finishTrace(client) {
  const completed = new Promise(resolve => client.once('Tracing.tracingComplete', resolve))
  await client.send('Tracing.end')
  const { stream } = await completed
  assert.ok(stream, 'Chromium must return a diagnostic trace stream')
  const chunks = []
  try {
    for (;;) {
      const part = await client.send('IO.read', { handle: stream })
      chunks.push(Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8'))
      if (part.eof) break
    }
  } finally { await client.send('IO.close', { handle: stream }) }
  return Buffer.concat(chunks)
}

async function traceDenseDivider() {
  const { context, page, client } = await openPage('', 'current-dense-divider-diagnostic')
  const path = resolve(dirname(output), 'desktop-resize-current-dense-divider-trace.json')
  const diagnostic = { variant: 'current', density: 'dense', handle: 'divider', afterRound: 1,
    timingExcludedFromComparison: true, trace: path }
  report.diagnostics.push(diagnostic)
  let tracing = false
  try {
    await client.send('Tracing.start', {
      categories: 'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking,disabled-by-default-devtools.timeline.stack',
      transferMode: 'ReturnAsStream', options: 'record-as-much-as-possible',
    })
    tracing = true
    diagnostic.measurement = await measure(page, client, handles.find(handle => !handle.outer))
  } finally {
    try {
      if (tracing) {
        const trace = await finishTrace(client)
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, trace)
        diagnostic.bytes = trace.length
        diagnostic.sha256 = sha256(trace)
        console.log(`Saved desktop divider diagnostic trace: ${path}`)
      }
    } finally { await context.close() }
  }
}

async function checkDragAndSave(page, handle, expandFirst = false) {
  const initial = await snapshot(page)
  assertGeometry(initial, 'initial')
  const start = await startDrag(page, handle)
  const values = []
  for (const distance of [24, 48, 72, 48, 24]) {
    await page.mouse.move(start.x + handle.direction * distance * (expandFirst ? 1 : -1), start.y)
    await frames(page, 2)
    const current = await snapshot(page)
    assertGeometry(current, `drag at ${distance}px`)
    assert.equal(current.writes, initial.writes, 'pointer moves must not save preferences')
    assert.ok(current.resizing, 'drag must expose its active state')
    assert.match(current.handles[handle.name].text, new RegExp(String(current.handles[handle.name].width)), 'ARIA width must describe preview')
    values.push(current.handles[handle.name].width)
  }
  const direction = expandFirst ? 1 : -1
  assert.ok((values[1] - values[0]) * direction > 0 && (values[2] - values[1]) * direction > 0 &&
    (values[3] - values[2]) * direction < 0 && (values[4] - values[3]) * direction < 0,
  'resizing and reversing the same drag must follow the pointer')
  const preview = await snapshot(page)
  await page.mouse.up()
  await frames(page, 4)
  const committed = await snapshot(page)
  assert.equal(committed.writes, initial.writes + 1, 'release must save exactly once')
  assert.equal(committed.handles[handle.name].width, preview.handles[handle.name].width, 'release must preserve the preview width')
  assertSameGeometry(preview, committed, 'release must not snap')
  assert.deepEqual(committed.glyphStyles, initial.glyphStyles, 'release must clear temporary glyph styles')
  assert.deepEqual(committed.candidateStyles, initial.candidateStyles, 'release must restore candidate styles and preview attributes')
  assert.equal(committed.resizing, false)
  assert.equal(await page.getByRole('dialog').count(), 0, 'a drag must not open the width dialog')
  await page.reload()
  await ready(page)
  const reloaded = await snapshot(page)
  assert.deepEqual(reloaded.preferences, committed.preferences, 'saved widths must survive reload')
  assertSameGeometry(committed, reloaded, 'reload must restore saved dimensions')
  const grow = await startDrag(page, handle)
  await moveDrag(page, grow, handle.direction * 24, 6)
  const grownPreview = await snapshot(page)
  assert.ok(grownPreview.handles[handle.name].width > reloaded.handles[handle.name].width, 'a previously shrunken panel must grow')
  await page.mouse.up()
  await frames(page, 4)
  const grownCommitted = await snapshot(page)
  assertSameGeometry(grownPreview, grownCommitted, 'expanded release must not snap')
  assert.deepEqual(grownCommitted.candidateStyles, reloaded.candidateStyles, 'expanded release must restore candidate styles and preview attributes')
  return { previewWidths: values, expandFirst }
}

async function checkInterruption(page, handle, kind) {
  const initial = await snapshot(page)
  const start = await startDrag(page, handle)
  await moveDrag(page, start, -handle.direction * 36, 6)
  assert.ok((await snapshot(page)).resizing)
  if (kind === 'cancel') {
    await page.locator(handle.selector).evaluate(element => element.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true, pointerId: window.desktopResizeProbe.pointerId, pointerType: 'mouse', isPrimary: true,
    })))
  } else if (kind === 'lost-capture') {
    await page.locator(handle.selector).evaluate(element => element.releasePointerCapture(window.desktopResizeProbe.pointerId))
    await page.mouse.move(start.x - handle.direction * 40, start.y)
  } else if (kind === 'unmount') {
    await page.evaluate(() => window.desktopResizeFixture.setMounted(false))
  } else if (kind === 'disable') {
    await page.evaluate(() => window.desktopResizeFixture.setEnabled(false))
  } else {
    await page.setViewportSize({ width: viewport.width - 80, height: viewport.height - 40 })
  }
  await frames(page, 3)
  await page.mouse.up()
  if (kind === 'unmount') await page.evaluate(() => window.desktopResizeFixture.setMounted(true))
  if (kind === 'disable') await page.evaluate(() => window.desktopResizeFixture.setEnabled(true))
  if (kind === 'viewport') await page.setViewportSize(viewport)
  await ready(page)
  const restored = await snapshot(page)
  assert.equal(restored.resizing, false, `${kind}: unfinished drag must end`)
  assert.equal(restored.writes, initial.writes, `${kind}: unfinished drag must not save`)
  assert.deepEqual(restored.preferences, initial.preferences, `${kind}: saved widths must not change`)
  assertSameGeometry(initial, restored, `${kind}: old dimensions must return`)
  assert.deepEqual(restored.styles, initial.styles, `${kind}: temporary inline styles must be restored`)
  assert.deepEqual(restored.glyphStyles, initial.glyphStyles, `${kind}: temporary glyph scales must be restored`)
  assert.deepEqual(restored.candidateStyles, initial.candidateStyles, `${kind}: candidate styles and preview attributes must be restored`)
  assertGeometry(restored, kind)
}

async function checkQueuedFinish(page, handle, kind) {
  const initial = await snapshot(page)
  const start = await startDrag(page, handle)
  // Both events run in one browser task, before the queued preview frame.
  await page.locator(handle.selector).evaluate((element, { start, direction, kind }) => {
    const common = { bubbles: true, pointerId: window.desktopResizeProbe.pointerId,
      pointerType: 'mouse', isPrimary: true, button: 0, clientY: start.y }
    element.dispatchEvent(new PointerEvent('pointermove', { ...common, buttons: 1, clientX: start.x - direction * 12 }))
    element.dispatchEvent(new PointerEvent(kind === 'release' ? 'pointerup' : kind === 'cancel' ? 'pointercancel' : 'lostpointercapture',
      { ...common, buttons: 0, clientX: start.x - direction * 60 }))
  }, { start, direction: handle.direction, kind })
  await page.mouse.up()
  await frames(page, 4)
  const final = await snapshot(page)
  assert.equal(final.resizing, false, 'queued preview must not survive its ending event')
  assert.deepEqual(final.candidateStyles, initial.candidateStyles, `queued ${kind}: candidate styles and preview attributes must be restored`)
  if (kind === 'release') {
    const multiplier = handle.outer ? 2 * 1128 / initial.contentWidth : 1 / initial.scale
    const expected = Math.min(initial.handles[handle.name].max,
      Math.max(initial.handles[handle.name].min, Math.round(initial.handles[handle.name].width - 60 * multiplier)))
    assert.equal(final.handles[handle.name].width, expected, 'release must use the final pointer coordinate, not the queued move')
    assert.equal(final.writes, initial.writes + 1)
  } else {
    assert.equal(final.writes, initial.writes, 'canceled queued preview must not save')
    assert.deepEqual(final.preferences, initial.preferences)
    assert.deepEqual(final.styles, initial.styles, 'canceled queued frame must not restore preview styles later')
    assert.deepEqual(final.glyphStyles, initial.glyphStyles, 'canceled queued frame must not leave glyph scales')
    assertSameGeometry(initial, final, 'canceled queued preview')
  }
  assertGeometry(final, `queued ${kind}`)
}

async function checkKeyboard(page, handle) {
  const locator = page.locator(handle.selector)
  const initial = await snapshot(page)
  await locator.focus()
  await locator.press(handle.direction > 0 ? 'ArrowRight' : 'ArrowLeft')
  await frames(page)
  assert.equal((await snapshot(page)).handles[handle.name].width, initial.handles[handle.name].width + 24, 'arrow key must grow width by one step')
  await locator.press('Home')
  await frames(page)
  assert.equal((await snapshot(page)).handles[handle.name].width, handle.outer ? 1128 : 420, 'Home must restore default width')
  await locator.press(handle.direction > 0 ? 'ArrowLeft' : 'ArrowRight')
  await locator.click({ button: 'right' })
  await frames(page)
  assert.equal((await snapshot(page)).handles[handle.name].width, handle.outer ? 1128 : 420, 'context menu must reset width')
  if (handle.outer) return
  for (const open of ['click', 'Enter', 'Space']) {
    if (open === 'click') await locator.click()
    else await locator.press(open)
    const dialog = page.getByRole('dialog', { name: 'Resize input panel' })
    await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Narrower', exact: true }).click()
    await frames(page)
    assert.equal((await snapshot(page)).handles.divider.width, 396)
    await dialog.getByRole('button', { name: 'Wider', exact: true }).click()
    await frames(page)
    assert.equal((await snapshot(page)).handles.divider.width, 420)
    await dialog.getByRole('button', { name: 'Reset size', exact: true }).click()
    await dialog.press('Escape')
    // The role locator stops matching as soon as the exit sets aria-hidden.
    // Focus returns after that animation and the real dialog unmounts.
    await page.locator('dialog.resize-options-dialog').waitFor({ state: 'detached' })
    await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), handle.selector)
    assert.ok(await locator.evaluate(element => document.activeElement === element), 'closing size options must return focus to the divider')
  }
}

async function checkDividerLimits(page) {
  const handle = handles.find(handle => !handle.outer)
  const records = []
  const initialWidth = (await snapshot(page)).handles.divider.width
  for (const limit of ['min', 'max', 'min', 'initial']) {
    const before = await snapshot(page)
    const target = limit === 'initial' ? initialWidth : before.handles.divider[limit]
    const start = await startDrag(page, handle)
    // The center divider grows the input when moved left. A small overshoot
    // checks both clamps without depending on the location of the old handle.
    const distance = (before.handles.divider.width - target) * before.scale + (limit === 'min' ? 24 : limit === 'max' ? -24 : 0)
    await moveDrag(page, start, distance, 18)
    await frames(page, 2)
    const preview = await snapshot(page)
    const previewGlyphs = await glyphSnapshot(page)
    assert.equal(preview.handles.divider.width, target, `divider must reach ${limit} width`)
    assert.equal(preview.writes, before.writes, 'limit preview must not persist')
    assertGeometry(preview, `divider ${limit} preview`)
    await page.mouse.up()
    await frames(page, 4)
    const committed = await snapshot(page)
    const committedGlyphs = await glyphSnapshot(page)
    assert.equal(committed.writes, before.writes + 1, 'limit release must save once')
    try {
      assertSameGeometry(preview, committed, `divider ${limit} release`)
      assertSameGlyphs(previewGlyphs, committedGlyphs, `divider ${limit} release`)
    } catch (error) {
      error.resizeDiagnostic = { limit, width: target, preview, committed, previewGlyphs, committedGlyphs }
      throw error
    }
    assert.deepEqual(committed.glyphStyles, before.glyphStyles, 'committing a limit must restore glyph styles')
    assert.deepEqual(committed.candidateStyles, before.candidateStyles, 'committing a limit must restore candidate styles and preview attributes')
    assert.deepEqual(committed.styles['.board-body'], before.styles['.board-body'], 'committing a limit must restore board-body styles')
    assertGeometry(committed, `divider ${limit} committed`)
    records.push({ limit, width: target, previewGrid: preview.grid, committedGrid: committed.grid,
      previewGlyphs, committedGlyphs, links: committed.links.length })
  }
  return { limits: records }
}

async function checkHintDivider(page) {
  const divider = page.getByRole('separator', { name: 'Resize hint panel' })
  const card = page.getByRole('complementary', { name: 'Puzzle hint' })
  const toolbar = page.locator('.hint-toolbar')
  const close = toolbar.getByRole('button', { name: 'Close hint' })
  const navigation = toolbar.getByRole('group', { name: 'Hint navigation' })
  const board = page.locator('.board-frame')
  await navigation.getByRole('button', { name: 'Next hint' }).click()
  assert.equal(await navigation.locator('span').textContent(), '2/2')
  const cardBox = await card.boundingBox(), toolbarBox = await toolbar.boundingBox()
  assert.ok(toolbarBox.y + toolbarBox.height <= cardBox.y, 'toolbar must sit above the card')
  assert.ok((await navigation.boundingBox()).x < (await close.boundingBox()).x, 'navigation must precede Close')
  const title = await card.getByRole('heading', { name: 'WXYZ-Wing' }).boundingBox()
  const action = await card.getByRole('button', { name: 'Apply hint' }).boundingBox()
  assert.ok(title.y >= action.y && title.y + title.height <= action.y + action.height, 'actions and title must share a row')

  const roomyBoard = await board.boundingBox()
  await divider.press('ArrowUp')
  await ready(page)
  assert.ok((await card.boundingBox()).height > cardBox.height, 'Up Arrow must grow the hint')
  assert.equal((await board.boundingBox()).width, roomyBoard.width, 'the board must use the spare room before shrinking')
  await divider.press('Home')
  await ready(page)

  await page.setViewportSize({ width: viewport.width, height: 760 })
  await ready(page)
  const before = { card: await card.boundingBox(), board: await board.boundingBox() }
  const handle = await divider.boundingBox()
  const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 96, { steps: 10 })
  await frames(page)
  assert.ok((await card.boundingBox()).height > before.card.height + 48, 'drag must grow the card during the gesture')
  assert.ok((await board.boundingBox()).width < before.board.width, 'the board must shrink once it needs the space')
  const liveHeight = (await card.boundingBox()).height
  await page.mouse.up()
  await ready(page)
  assert.equal((await card.boundingBox()).height, liveHeight, 'release must keep the chosen height')
  assert.equal(await card.locator('.hint-card-body').evaluate(body => body.scrollHeight > body.clientHeight), true)

  await divider.press('ArrowDown')
  await ready(page)
  assert.ok((await card.boundingBox()).height < liveHeight, 'Down Arrow must shrink the card')
  await divider.press('Home')
  await ready(page)
  assert.equal((await card.boundingBox()).height, before.card.height, 'Home must restore the compact height')
  await close.click()
  await divider.waitFor({ state: 'detached' })
  await ready(page)
  assert.ok((await board.boundingBox()).width >= before.board.width, 'closing the hint must restore space to the board')
}

async function ready(page) {
  await page.locator('.desktop-layout-divider').waitFor()
  await page.evaluate(() => document.fonts.ready)
  await frames(page, 4)
  // Hint cards use the real Presence transition. Start after that entrance has
  // settled so reload geometry and resize timings do not include startup motion.
  await page.evaluate(async () => {
    await Promise.allSettled(document.getAnimations().filter(animation =>
      animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished))
  })
}

async function openPage(query = '', name = '') {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
  await context.addInitScript(key => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      desktopLayoutWidth: 1128, desktopPanelWidths: { input: 420, puzzle: null },
    }))
    const probe = { writes: [], pointerId: null }
    window.desktopResizeProbe = probe
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === key) probe.writes.push({ time: performance.now(), value })
      return setItem.call(this, name, value)
    }
    window.addEventListener('pointerdown', event => { probe.pointerId = event.pointerId }, true)
  }, preferenceKey)
  const page = await context.newPage()
  page.on('pageerror', error => report.browserErrors.push({ name, message: error.message }))
  const client = await context.newCDPSession(page)
  await client.send('Performance.enable')
  await client.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
  await page.goto(report.url + (query ? '?' + query : ''))
  await ready(page)
  return { context, page, client }
}

async function runCheck(name, query, check) {
  const { context, page } = await openPage(query, name)
  try {
    const detail = await check(page)
    report.checks.push({ name, status: 'passed', ...detail })
    console.log(`Passed desktop resize: ${name}`)
  } catch (error) {
    const result = { name, status: 'failed', error: error.stack || String(error), diagnostic: error.resizeDiagnostic }
    if (output) {
      const directory = resolve(dirname(output), 'desktop-resize-failures')
      await mkdir(directory, { recursive: true })
      result.screenshot = resolve(directory, name + '.png')
      await page.screenshot({ path: result.screenshot }).catch(() => {})
    }
    report.checks.push(result)
    console.error(`Failed desktop resize: ${name}\n${error.stack || error}`)
  } finally { await context.close() }
}

try {
  let baselineModule = resolve(root, 'src/components/DesktopPlayLayout.tsx')
  let baselineBoard = resolve(root, 'src/components/Board.tsx')
  let baselineCss = resolve(root, 'src/styles.css')
  if (!regressionOnly) {
    if (baselineRoot) assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: resolve(baselineRoot), encoding: 'utf8',
    }).trim(), BASELINE, 'Baseline checkout must match the pinned revision')
    for (const name of ['src/components/DesktopPlayLayout.tsx', 'src/components/Board.tsx', 'src/styles.css']) {
      let source
      try { source = baselineRoot ? await readFile(resolve(baselineRoot, name), 'utf8')
        : execFileSync('git', ['show', `${BASELINE}:${name}`], { cwd: root, encoding: 'utf8' }) }
      catch { throw new Error(`Pinned desktop baseline is missing. Run: git fetch --depth=1 origin ${BASELINE}`) }
      report.baselineHashes[name] = sha256(source)
      if (name.endsWith('.tsx')) {
        const destination = resolve(temporary, basename(name))
        const rewritten = source.replace(/from\s+(['"])(\.[^'"]+)\1/g, (_, quote, path) =>
          `from ${quote}${resolve(root, 'src/components', path)}${quote}`)
        await writeFile(destination, rewritten)
        if (name.endsWith('/Board.tsx')) baselineBoard = destination
        else baselineModule = destination
      } else {
        baselineCss = resolve(temporary, 'baseline.css')
        await writeFile(baselineCss, source)
      }
    }
  }
  await build({
    configFile: false, root: resolve(root, 'tests/browser/desktop-resize'), logLevel: 'warn',
    plugins: [react()], resolve: { dedupe: ['react', 'react-dom', 'lucide-react'], alias: {
      'virtual:desktop-resize-baseline': baselineModule, 'virtual:desktop-resize-baseline.css': baselineCss,
      'virtual:desktop-resize-baseline-board': baselineBoard,
    } },
    build: { outDir: resolve(temporary, 'dist'), emptyOutDir: true },
  })
  assert.deepEqual(await hashes(), report.sourceHashes, 'Sources must not change while the fixture builds')
  if (buildOnly) {
    report.status = 'built'
    report.notes.push('Build-only run: no browser assertions or performance measurements were executed.')
  } else {
    server = await preview({ configFile: false, root, logLevel: 'warn', build: { outDir: resolve(temporary, 'dist') },
      preview: { host: '127.0.0.1', port: 0, strictPort: false } })
    const address = server.httpServer.address()
    report.url = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
    report.browser = browser.version()
    if (!regressionOnly) for (let round = 0; round < rounds; round++) {
      const variants = round % 2 ? ['current', 'baseline'] : ['baseline', 'current']
      for (const density of ['normal', 'dense']) for (const handle of handles) for (const variant of variants) {
        const query = [density === 'normal' && 'normal=1', variant === 'baseline' && 'baseline=1'].filter(Boolean).join('&')
        const { context, page, client } = await openPage(query, `${variant}-${handle.name}-${density}`)
        try {
          const result = await measure(page, client, handle)
          report.measurements.push({ variant, handle: handle.name, density, round: round + 1, ...result })
          console.log(`${variant} ${density} ${handle.name}: drag style ${result.drag.styleMilliseconds.toFixed(1)}ms; layout ${result.drag.layoutMilliseconds.toFixed(1)}ms; frames over 25ms ${result.drag.frames.over25ms}`)
        } finally { await context.close() }
        if (traceCurrentDivider && round === 0 && variant === 'current' && density === 'dense' && !handle.outer) {
          await traceDenseDivider()
        }
      }
    }
    for (const handle of handles) {
      await runCheck(`${handle.name}-drag-save-reload`, '', page => checkDragAndSave(page, handle))
      await runCheck(`${handle.name}-keyboard`, '', page => checkKeyboard(page, handle))
      for (const kind of ['cancel', 'lost-capture', 'disable', 'unmount', 'viewport']) {
        await runCheck(`${handle.name}-${kind}`, handle.outer ? '' : 'normal=1', page => checkInterruption(page, handle, kind))
      }
      for (const kind of ['release', 'cancel', 'lost-capture']) {
        await runCheck(`${handle.name}-queued-${kind}`, '', page => checkQueuedFinish(page, handle, kind))
      }
      await runCheck(`${handle.name}-outside-clues`, 'outside=1', page => checkDragAndSave(page, handle))
      await runCheck(`${handle.name}-hint`, 'hint=1', page => checkDragAndSave(page, handle))
      await runCheck(`${handle.name}-height-constrained`, 'solved=1&normal=1', async page => {
        await page.setViewportSize({ width: viewport.width, height: 640 })
        await ready(page)
        return { ...await checkDragAndSave(page, handle, true), viewport: { width: viewport.width, height: 640 }, solvedStyle: true }
      })
      if (handle.outer) await runCheck(`${handle.name}-short-expand`, 'normal=1', async page => {
        await page.setViewportSize({ width: viewport.width, height: 640 })
        await ready(page)
        return { ...await checkDragAndSave(page, handle, true), viewport: { width: viewport.width, height: 640 } }
      })
    }
    await runCheck('hint-divider', 'hint-detail=1', checkHintDivider)
    await runCheck('badge-edges', 'outside=1', async page => {
      for (const edge of ['top', 'right', 'bottom', 'left']) {
        await page.evaluate(edge => window.desktopResizeFixture.setBadge({ edge, offset: .5 }), edge)
        await frames(page)
        assertGeometry(await snapshot(page), `badge at ${edge}`)
      }
    })
    for (const [name, query] of [
      ['divider-limits', 'normal=1'],
      ['divider-limits-andoku', 'normal=1&andoku=1'],
      ['divider-limits-center-notes', 'normal=1&center=1'],
      ['divider-limits-chain-outside', 'normal=1&chains=1&outside=1'],
    ]) await runCheck(name, query, checkDividerLimits)
    assert.deepEqual(report.browserErrors, [], 'resize must not produce browser or ResizeObserver errors')
    assert.equal(report.checks.filter(check => check.status === 'failed').length, 0, 'desktop resize behavior must pass')
    report.status = 'passed'
  }
} catch (error) {
  report.status = 'failed'
  report.error = error.stack || String(error)
  process.exitCode = 1
  console.error(report.error)
} finally {
  try {
    assert.deepEqual(await hashes(), report.sourceHashes, 'Sources must not change during desktop resize checks')
    report.sourceHashesVerifiedAtEnd = true
  } catch (error) {
    report.sourceHashesVerifiedAtEnd = false
    report.sourceVerificationError = error.stack || String(error)
    report.status = 'failed'
    process.exitCode = 1
    console.error(report.sourceVerificationError)
  }
  if (output) {
    await mkdir(dirname(resolve(output)), { recursive: true })
    await writeFile(resolve(output), JSON.stringify(report, null, 2) + '\n')
    console.log(`Saved ${resolve(output)}`)
  } else console.log(JSON.stringify(report, null, 2))
  await browser?.close()
  if (server) await new Promise(resolve => server.httpServer.close(resolve))
  await rm(temporary, { recursive: true, force: true })
}
