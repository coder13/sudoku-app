import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repository = path.resolve(directory, '../..')
const args = process.argv.slice(2)
const value = (flag, fallback) => {
  const index = args.indexOf(flag)
  if (index === -1) return fallback
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing ${flag} value.`)
  return args[index + 1]
}
const output = path.resolve(directory, value('--output', 'results/latest.json'))
const profile = value('--profile', 'both')
if (!['desktop', 'mobile', 'both'].includes(profile)) throw new Error('Use --profile desktop, mobile, or both.')
const options = { samples: Number(value('--samples', '60')), rounds: Number(value('--rounds', '3')), warmup: Number(value('--warmup', '20')) }
const baseline = JSON.parse(await readFile(path.join(directory, 'baseline/manifest.json'), 'utf8'))
const sha256 = content => createHash('sha256').update(content).digest('hex')
for (const [name, expected] of Object.entries(baseline.files)) {
  const fixture = await readFile(path.join(directory, 'baseline', name), 'utf8')
  if (sha256(fixture) !== expected.fixtureSha256) throw new Error(`Pinned baseline changed: ${name}.`)
  // Reconstruct the original imports so this check also works in a shallow CI checkout.
  const original = fixture.replaceAll("from '../../../src/sudoku/", "from '../sudoku/")
    .replaceAll("from '../../../src/components/", "from './")
  if (sha256(original) !== expected.originalSha256) throw new Error(`Original baseline does not match ${name}.`)
}
const versions = {}
for (const name of ['react', 'react-dom', 'vite', '@vitejs/plugin-react']) {
  versions[name] = JSON.parse(await readFile(path.join(repository, 'node_modules', name, 'package.json'), 'utf8')).version
}
const sourceFiles = [
  'src/components/Board.tsx', 'src/components/BoardMarks.tsx', 'src/components/BoardAnnotations.tsx',
  'src/components/board-mark-cleanup.ts',
  'src/components/VariantClues.tsx', 'src/components/OutsideClues.tsx', 'src/styles.css', 'package-lock.json',
  ...['game', 'highlighting', 'preferences', 'board-link-geometry', 'grid', 'variants', 'clone', 'outside-clues', 'sized-linked-double-arrow', 'engine', 'themes']
    .map(name => `src/sudoku/${name}.ts`),
  ...(await readdir(path.join(directory, 'src'))).map(name => `tools/react-board-performance/src/${name}`),
  'tools/react-board-performance/scripts/run.mjs', 'tools/react-board-performance/scripts/browser.mjs',
  'tools/react-board-performance/package.json', 'tools/react-board-performance/package-lock.json',
  'tools/react-board-performance/vite.config.ts', 'tools/react-board-performance/index.html',
]
const sourceHashes = {}
for (const name of sourceFiles) sourceHashes[name] = sha256(await readFile(path.join(repository, name)))
const report = {
  schema: 'production-react-board-run-v1', startedAt: new Date().toISOString(), baseline, versions, options,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
  sourceStatus: execFileSync('git', ['status', '--short'], { cwd: repository, encoding: 'utf8' }).trim(),
  sourceHashes, profiles: [], motionRegression: null,
  notes: [
    'Both renderers are complete production Board components. The baseline Board, BoardMarks, and BoardAnnotations are pinned to the recorded commit.',
    'Other dependencies and production CSS are shared. Baseline imports alone are adjusted to their fixture directory.',
    'The timed workload runs with reduced motion. Normal-motion fades, bursts, and callback semantics are checked separately.',
    'The mobile profile is desktop Chromium with mobile dimensions and fourfold CPU throttling, not a physical phone.',
    'Dispatch, observed DOM commit, and subsequent animation-frame timestamps do not measure paint latency or INP.',
  ],
}
async function save() {
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
}
async function playwright() {
  if (process.env.PLAYWRIGHT_MODULE_PATH) return createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH)
  try { return await import('playwright') } catch (error) {
    if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error
    return createRequire(import.meta.url)(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'))
  }
}
const { chromium } = await playwright()
try {
  const manifest = process.env.PLAYWRIGHT_MODULE_PATH
    ? path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'package.json')
    : createRequire(import.meta.url).resolve('playwright/package.json')
  report.versions.playwright = JSON.parse(await readFile(manifest, 'utf8')).version
} catch { report.versions.playwright = 'unknown' }
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
async function pageFor(context) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:8785', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForFunction(() => window.boardPerformance && window.runBoardRegression, undefined, { timeout: 15000 })
  await page.evaluate(async () => { await window.boardPerformance.ready })
  await page.exposeFunction('pressRegressionKey', key => page.keyboard.press(key))
  return { page, errors }
}
try {
  report.browserVersion = browser.version()
  const profiles = [
    { id: 'desktop', viewport: { width: 1440, height: 1000 }, cpuRate: 1, isMobile: false, hasTouch: false },
    { id: 'mobile-emulated-cpu4x', viewport: { width: 390, height: 844 }, cpuRate: 4, isMobile: true, hasTouch: true },
  ].filter(item => profile === 'both' || (profile === 'desktop' ? item.id === 'desktop' : item.id !== 'desktop'))
  for (const configuration of profiles) {
    const context = await browser.newContext({ viewport: configuration.viewport, deviceScaleFactor: 1,
      isMobile: configuration.isMobile, hasTouch: configuration.hasTouch, reducedMotion: 'reduce' })
    try {
      const { page, errors } = await pageFor(context)
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: configuration.cpuRate })
      console.log(`Checking full Board parity: ${configuration.id}.`)
      const regression = await page.evaluate(() => window.runBoardRegression({ pressKey: key => window.pressRegressionKey(key) }))
      const entry = { ...configuration, regression }
      if (!args.includes('--regression-only')) {
        await page.exposeFunction('reportProgress', message => console.log(`[${configuration.id}] ${message}`))
        entry.performance = await page.evaluate(settings => window.runBoardComparison({ ...settings,
          onProgress: message => window.reportProgress(message) }), options)
      }
      if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`)
      report.profiles.push(entry)
      await save()
    } finally { await context.close() }
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' })
  try {
    const { page, errors } = await pageFor(context)
    console.log('Checking normal-motion fades and synchronous bursts.')
    report.motionRegression = await page.evaluate(() => window.runBoardRegression({ motionOnly: true }))
    if (errors.length) throw new Error(`Motion regression browser errors: ${errors.join('; ')}`)
  } finally { await context.close() }
  for (const [name, expected] of Object.entries(sourceHashes)) {
    if (sha256(await readFile(path.join(repository, name))) !== expected) throw new Error(`Source changed during the run: ${name}.`)
  }
  report.sourceHashesVerifiedAtEnd = true
  report.finishedAt = new Date().toISOString()
  await save()
  console.log(`Saved ${path.relative(directory, output)}.`)
} catch (error) {
  report.error = error instanceof Error ? { message: error.message, stack: error.stack } : String(error)
  report.finishedAt = new Date().toISOString()
  await save()
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
} finally { await browser.close() }
