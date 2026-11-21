import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, preview } from 'vite'

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repository = path.resolve(directory, '../..')
const configFile = path.join(directory, 'vite.config.ts')
const args = process.argv.slice(2)
const option = (flag, fallback) => {
  const index = args.indexOf(flag)
  if (index === -1) return fallback
  assert.ok(args[index + 1] && !args[index + 1].startsWith('--'), `Missing ${flag} value`)
  return args[index + 1]
}
const settings = {
  profile: option('--profile', 'both'), rounds: Number(option('--rounds', '3')),
  highlightMs: Number(option('--highlight-ms', '3000')), bulkMs: Number(option('--bulk-ms', '800')),
  highlightSteps: Number(option('--highlight-steps', '15')), regressionOnly: args.includes('--regression-only'),
}
assert.ok(['desktop', 'mobile', 'both'].includes(settings.profile))
assert.ok(Number.isInteger(settings.rounds) && settings.rounds > 0)
assert.ok(settings.highlightMs >= 300 && settings.bulkMs >= 350)
assert.ok(Number.isInteger(settings.highlightSteps) && settings.highlightSteps > 0)
const output = path.resolve(directory, option('--output', 'results/motion-latest.json'))
const sha256 = value => createHash('sha256').update(value).digest('hex')
const oldTransitions = JSON.parse(await readFile(path.join(directory, 'baseline/paint-transitions.json'), 'utf8'))
const restoredTransitions = oldTransitions.transitions
const oldTransitionOverlay = Object.entries(restoredTransitions).map(([selector, transition]) => `${oldTransitions.overlayScope} ${selector} { transition: ${transition}; }`).join('\n')
assert.equal(sha256(oldTransitionOverlay), oldTransitions.overlaySha256, 'Pinned transition overlay changed')
const baseline = JSON.parse(await readFile(path.join(directory, 'baseline/manifest.json'), 'utf8'))
for (const [name, expected] of Object.entries(baseline.files)) {
  const fixture = await readFile(path.join(directory, 'baseline', name), 'utf8')
  assert.equal(sha256(fixture), expected.fixtureSha256, `Pinned baseline changed: ${name}`)
}
const sourceFiles = [
  'src/components/Board.tsx', 'src/components/BoardMarks.tsx', 'src/components/board-mark-cleanup.ts',
  'src/components/BoardAnnotations.tsx', 'src/components/VariantClues.tsx', 'src/components/OutsideClues.tsx',
  'src/styles.css', 'package-lock.json',
  ...['game', 'highlighting', 'preferences', 'board-link-geometry', 'grid', 'variants', 'clone', 'outside-clues', 'engine', 'themes'].map(name => `src/sudoku/${name}.ts`),
  ...(await readdir(path.join(directory, 'src'))).map(name => `tools/react-board-performance/src/${name}`),
  'tools/react-board-performance/scripts/motion.mjs', 'tools/react-board-performance/package.json',
  'tools/react-board-performance/baseline/paint-transitions.json',
  'tools/react-board-performance/package-lock.json', 'tools/react-board-performance/vite.config.ts',
  'tools/react-board-performance/index.html',
]
async function hashes() {
  return Object.fromEntries(await Promise.all(sourceFiles.map(async name => [name, sha256(await readFile(path.join(repository, name)))])))
}
const versions = {}
for (const name of ['react', 'react-dom', 'vite', '@vitejs/plugin-react']) {
  versions[name] = JSON.parse(await readFile(path.join(repository, 'node_modules', name, 'package.json'), 'utf8')).version
}
const require = createRequire(import.meta.url)
const playwright = process.env.PLAYWRIGHT_MODULE_PATH
  ? require(process.env.PLAYWRIGHT_MODULE_PATH) : await import('playwright')
versions.playwright = JSON.parse(await readFile(require.resolve('playwright/package.json'), 'utf8')).version
const report = {
  schema: 'production-react-board-motion-v1', startedAt: new Date().toISOString(), settings, baseline, versions,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
  sourceStatus: execFileSync('git', ['status', '--short'], { cwd: repository, encoding: 'utf8' }).trim(),
  sourceHashes: await hashes(),
  cssComparison: { oldCommit: oldTransitions.sourceCommit, oldFullCssSha256: oldTransitions.sourceSha256, restoredTransitions,
    overlay: oldTransitionOverlay, overlaySha256: sha256(oldTransitionOverlay),
    explanation: 'Only the old paint transition declarations are overlaid on current CSS. Both highlight cases use the same current Board.' },
  regressions: [], profiles: [],
  notes: [
    'Normal-motion production Board harness only. These measurements do not cover complete app responsiveness, solver work, startup, or a physical phone.',
    'Dense highlights toggle all 729 candidate highlights and matching cell fills for an equal count of actions. This is a deliberate dense stress case.',
    'Bulk removal compares pinned baseline Board/BoardMarks with current Board/BoardMarks using identical current CSS. The changes are measured together.',
    'Bulk fallback blocks transitionend propagation to verify timer cleanup. It is a fault-path measurement, separate from normal fade completion.',
    'Paint, style and layout trace totals are main-renderer-thread work within named performance marks. They do not measure display latency, raster completion, or INP.',
    'Performance counters include surrounding calls and a bounded post-observation cleanup drain. Observed-final and drained-final DOM counts are both reported. Use marked trace totals for the observation window. rAF intervals are callback gaps, not paint timestamps.',
    'The first-frame field measures workload start to its first rAF callback separately, so the interval list does not hide an initial stall.',
    'Timer instrumentation covers setTimeout/clearTimeout only during the workload. One shared fallback means at most one active timer, not necessarily one timer registration across successive deadlines.',
  ],
}
const save = async () => { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`) }

async function metrics(client) {
  return Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]))
}
function metricChange(before, after) {
  return Object.fromEntries(['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration']
    .map(name => [name.endsWith('Duration') ? `${name}Ms` : name, (after[name] - before[name]) * (name.endsWith('Duration') ? 1000 : 1)]))
}
function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = fraction => sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? 0
  return { count: values.length, median: percentile(.5), p95: percentile(.95), max: sorted.at(-1) ?? 0 }
}
function traceSummary(events, id) {
  const start = events.find(event => event.name === `board-motion-start:${id}`)
  const end = events.find(event => event.name === `board-motion-end:${id}`)
  assert.ok(start && end, 'The trace must contain both workload marks')
  const names = ['Paint', 'UpdateLayoutTree', 'RecalculateStyles', 'Layout', 'PrePaint', 'Layerize']
  return { spanMs: (end.ts - start.ts) / 1000, pid: start.pid, tid: start.tid,
    events: Object.fromEntries(names.map(name => {
      const durations = events.filter(event => event.name === name && event.ph === 'X' && event.pid === start.pid && event.tid === start.tid
        && event.ts < end.ts && event.ts + (event.dur ?? 0) > start.ts)
        .map(event => Math.max(0, Math.min(end.ts, event.ts + event.dur) - Math.max(start.ts, event.ts)) / 1000)
      return [name, { count: durations.length, totalMs: durations.reduce((sum, value) => sum + value, 0), maxMs: Math.max(0, ...durations) }]
    })) }
}
async function endTrace(client) {
  const completed = new Promise(resolve => client.once('Tracing.tracingComplete', resolve))
  await client.send('Tracing.end')
  const { stream } = await completed
  assert.ok(stream, 'Chromium must return its trace stream')
  const chunks = []
  try {
    for (;;) {
      const part = await client.send('IO.read', { handle: stream })
      chunks.push(Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8'))
      if (part.eof) break
    }
  } finally { await client.send('IO.close', { handle: stream }) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')).traceEvents
}

async function setTransitionOverlay(page, css) {
  await page.evaluate(css => {
    let style = document.querySelector('#motion-transition-overlay')
    if (!style) { style = document.createElement('style'); style.id = 'motion-transition-overlay'; document.head.append(style) }
    style.textContent = css
  }, css)
}
async function verifyTransitions(page, legacy) {
  const actual = await page.evaluate(() => {
    const root = document.querySelector('#board-root')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.classList.add('board-links')
    svg.style.visibility = 'hidden'
    const line = document.createElementNS(svg.namespaceURI, 'line')
    const polyline = document.createElementNS(svg.namespaceURI, 'polyline')
    const marker = document.createElementNS(svg.namespaceURI, 'marker')
    const path = document.createElementNS(svg.namespaceURI, 'path')
    marker.append(path); svg.append(line, polyline, marker); root.append(svg)
    const glyph = document.createElement('span')
    glyph.className = 'candidate-glyph'; root.append(glyph)
    try {
      return Object.fromEntries(Object.entries({ cell: root.querySelector('.cell'), candidate: root.querySelector('.board-candidate'),
        glyph, line, polyline, markerPath: path }).map(([key, element]) => [key, getComputedStyle(element).transitionProperty]))
    } finally { svg.remove(); glyph.remove() }
  })
  assert.deepEqual(actual, legacy ? {
    cell: 'background-color, border-color, color, box-shadow', candidate: 'opacity, color, background-color, box-shadow',
    glyph: 'color, background-color, box-shadow', line: 'stroke', polyline: 'stroke', markerPath: 'fill',
  } : { cell: 'none', candidate: 'opacity', glyph: 'none', line: 'none', polyline: 'none', markerPath: 'none' },
  'The effective transition properties must match the requested CSS condition, including SVG selector specificity')
  return actual
}

let server, browser
try {
  await build({ configFile })
  server = await preview({ configFile, preview: { host: '127.0.0.1', port: 0, strictPort: false } })
  const address = server.httpServer.address()
  assert.ok(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}`
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] })
  report.browser = { version: browser.version(), executablePath: executablePath ?? 'Playwright default', headless: true, deviceScaleFactor: 1 }
  async function pageFor(configuration, reducedMotion = 'no-preference') {
    const context = await browser.newContext({ viewport: configuration.viewport, deviceScaleFactor: 1,
      isMobile: configuration.isMobile ?? false, hasTouch: configuration.hasTouch ?? false, reducedMotion })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.boardMotion && window.boardPerformance)
    await page.evaluate(() => window.boardPerformance.ready)
    const client = await context.newCDPSession(page)
    await client.send('Emulation.setCPUThrottlingRate', { rate: configuration.cpuRate })
    await client.send('Performance.enable')
    return { context, page, client, errors }
  }
  const regressionProfile = { viewport: { width: 1280, height: 900 }, cpuRate: 1 }
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { context, page, errors } = await pageFor(regressionProfile, reducedMotion)
    try {
      if (reducedMotion === 'no-preference') {
        await setTransitionOverlay(page, oldTransitionOverlay)
        const legacy = await verifyTransitions(page, true)
        await setTransitionOverlay(page, '')
        const current = await verifyTransitions(page, false)
        report.regressions.push({ id: 'transition-selector-specificity', passed: true, legacy, current })
      }
      for (const implementation of ['baseline', 'optimized']) {
        if (reducedMotion === 'no-preference') {
          const reversal = await page.evaluate(implementation => window.boardMotion.checkReversal(implementation), implementation)
          report.regressions.push({ id: `reused-elements:${implementation}`, reducedMotion, ...regressionProfile, ...reversal })
          await save()
          assert.equal(reversal.passed, true, `Reused-element reversal failed for ${implementation}`)
        }
        await page.evaluate(implementation => window.boardMotion.prepare(implementation), implementation)
        const removal = await page.evaluate(async ({ implementation, reducedMotion }) => {
          const result = await window.boardMotion.run({ id: `cleanup:${implementation}:${reducedMotion}`, workload: 'bulk-fallback', durationMs: 800 })
          return { result, timers: window.boardMotion.lastTimers, restored: await window.boardMotion.restore() }
        }, { implementation, reducedMotion })
        assert.equal(removal.result.final.candidates, 0)
        assert.equal(removal.restored.live, 729)
        assert.equal(removal.timers.remaining, 0)
        if (reducedMotion === 'reduce') assert.equal(removal.timers.scheduled, 0)
        else {
          assert.equal(removal.result.observedExits, 729, 'All removed marks must be represented as inert exits')
          if (implementation === 'optimized') assert.equal(removal.timers.peakActive, 1, 'Optimized marks must share one fallback timer')
        }
        report.regressions.push({ id: `bulk-cleanup:${implementation}`, reducedMotion, ...regressionProfile, ...removal })
      }
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  }
  await save()
  if (!settings.regressionOnly) {
    const profiles = [
      { id: 'desktop', viewport: { width: 1440, height: 1000 }, cpuRate: 1, isMobile: false, hasTouch: false },
      { id: 'mobile-emulated-cpu4x', viewport: { width: 390, height: 844 }, cpuRate: 4, isMobile: true, hasTouch: true },
    ].filter(profile => settings.profile === 'both' || (settings.profile === 'desktop' ? profile.id === 'desktop' : profile.id !== 'desktop'))
    for (const configuration of profiles) {
      const { context, page, client, errors } = await pageFor(configuration)
      const profile = { ...configuration, runs: [] }
      report.profiles.push(profile)
      try {
        for (let round = 0; round < settings.rounds; round++) {
          const comparisons = [
            [{ id: 'old-paint-transitions', implementation: 'optimized', workload: 'highlights', css: oldTransitionOverlay },
              { id: 'current-transitions', implementation: 'optimized', workload: 'highlights', css: '' }],
            [{ id: 'baseline-removal', implementation: 'baseline', workload: 'bulk-removal', css: '' },
              { id: 'optimized-removal', implementation: 'optimized', workload: 'bulk-removal', css: '' }],
            [{ id: 'baseline-fallback', implementation: 'baseline', workload: 'bulk-fallback', css: '' },
              { id: 'optimized-fallback', implementation: 'optimized', workload: 'bulk-fallback', css: '' }],
          ]
          for (const comparison of comparisons) for (const entry of round % 2 ? [...comparison].reverse() : comparison) {
            console.log(`[${configuration.id}] round ${round + 1}: ${entry.id}`)
            await setTransitionOverlay(page, entry.css)
            const prepared = await page.evaluate(implementation => window.boardMotion.prepare(implementation), entry.implementation)
            prepared.verifiedTransitions = await verifyTransitions(page, Boolean(entry.css))
            assert.equal(prepared.reducedMotion, false)
            const id = `${configuration.id}:${round}:${entry.id}`
            const before = await metrics(client)
            await client.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream', options: 'record-as-much-as-possible' })
            const result = await page.evaluate(options => window.boardMotion.run(options), { id, workload: entry.workload,
              durationMs: entry.workload === 'highlights' ? settings.highlightMs : settings.bulkMs, highlightSteps: settings.highlightSteps })
            const after = await metrics(client)
            const trace = traceSummary(await endTrace(client), id)
            const timers = await page.evaluate(() => window.boardMotion.lastTimers)
            report.activeRun = { id, observedFinal: result.observedFinal, final: result.final,
              pendingTimersAtObservationEnd: result.pendingTimersAtObservationEnd, cleanupDrainMs: result.cleanupDrainMs,
              timers: { scheduled: timers.scheduled, fired: timers.fired, cleared: timers.cleared, peakActive: timers.peakActive, remaining: timers.remaining } }
            assert.equal(timers.remaining, 0)
            if (entry.workload !== 'highlights') {
              assert.equal(result.observedExits, 729)
              if (entry.implementation === 'optimized') assert.equal(timers.peakActive, 1)
            }
            const restored = await page.evaluate(() => window.boardMotion.restore())
            profile.runs.push({ round: round + 1, case: entry.id, implementation: entry.implementation,
              prepared, ...result, timers, trace, counters: metricChange(before, after), restored,
              frames: { ...summarize(result.frameIntervalsMs), over25Ms: result.frameIntervalsMs.filter(value => value > 25).length,
                over50Ms: result.frameIntervalsMs.filter(value => value > 50).length } })
            delete report.activeRun
            await save()
          }
        }
        assert.deepEqual(errors, [])
        profile.summary = Object.fromEntries([...new Set(profile.runs.map(run => run.case))].map(name => {
          const runs = profile.runs.filter(run => run.case === name)
          return [name, { rounds: runs.length, paintMs: summarize(runs.map(run => run.trace.events.Paint.totalMs)),
            styleMs: summarize(runs.map(run => run.trace.events.UpdateLayoutTree.totalMs + run.trace.events.RecalculateStyles.totalMs)),
            layoutMs: summarize(runs.map(run => run.trace.events.Layout.totalMs)),
            frames: { ...summarize(runs.flatMap(run => run.frameIntervalsMs)), over25Ms: runs.reduce((sum, run) => sum + run.frames.over25Ms, 0) },
            firstFrameDelayMs: summarize(runs.map(run => run.firstFrameDelayMs)),
            timerPeak: Math.max(...runs.map(run => run.timers.peakActive)),
            scheduledTimers: summarize(runs.map(run => run.timers.scheduled)) }]
        }))
      } finally { await context.close() }
    }
  }
  report.finalSourceHashes = await hashes()
  assert.deepEqual(report.finalSourceHashes, report.sourceHashes, 'Measured source files changed during the run')
  report.finishedAt = new Date().toISOString()
  await save()
  console.log(`Saved ${path.relative(repository, output)}`)
} catch (error) {
  report.error = { message: error.message, stack: error.stack }
  report.finishedAt = new Date().toISOString()
  await save()
  console.error(error.stack)
  process.exitCode = 1
} finally {
  await browser?.close()
  if (server) await new Promise(resolve => server.httpServer.close(resolve))
}
