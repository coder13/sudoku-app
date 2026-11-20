#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repository = path.resolve(directory, '../..')
const argv = process.argv.slice(2)
const value = (name, fallback) => {
  const index = argv.indexOf(name)
  if (index === -1) return fallback
  if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}.`)
  return argv[index + 1]
}
const url = value('--url', 'http://127.0.0.1:8775')
const output = path.resolve(directory, value('--output', 'results/latest.json'))
const profile = value('--profile', 'both')
if (!['desktop', 'mobile', 'both'].includes(profile)) throw new Error('--profile must be desktop, mobile, or both.')
const options = {
  samples: Number(value('--samples', '60')),
  rounds: Number(value('--rounds', '3')),
  warmup: Number(value('--warmup', '20')),
}
const screenshots = argv.includes('--screenshots')

async function loadPlaywright() {
  try { return await import('playwright') } catch (original) {
    const runtime = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
    if (!runtime) throw original
    return createRequire(import.meta.url)(path.join(runtime, 'playwright'))
  }
}

async function provenance() {
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
  const versions = {}
  for (const name of ['react', 'react-dom', 'solid-js', '@solidjs/web', 'vite', 'playwright']) {
    try {
      versions[name] = JSON.parse(await readFile(path.join(directory, 'node_modules', name, 'package.json'), 'utf8')).version
    } catch { versions[name] = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name] ?? 'unknown' }
  }
  let commit = 'unknown'
  let workingTree = 'unknown'
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim()
    workingTree = execFileSync('git', ['status', '--short', '--', 'tools/solid-board'], { cwd: repository, encoding: 'utf8' }).trim()
  } catch { /* The same harness can run from an exported directory. */ }
  const files = ['package.json', 'package-lock.json', 'vite.config.ts', 'index.html', 'src/lab.css',
    'scripts/run.mjs', 'scripts/benchmark.mjs', '../../package-lock.json',
    '../../src/components/Board.tsx', '../../src/components/BoardMarks.tsx', '../../src/styles.css',
    '../../src/sudoku/game.ts', '../../src/sudoku/highlighting.ts', '../../src/sudoku/preferences.ts',
    ...(await readdir(path.join(directory, 'src'))).filter(name => /\.[cm]?[jt]sx?$/.test(name)).map(name => `src/${name}`)]
  const hashes = {}
  for (const file of files) {
    try { hashes[file] = createHash('sha256').update(await readFile(path.join(directory, file))).digest('hex') } catch { /* Optional lock file. */ }
  }
  return { commit, workingTree, versions, sha256: hashes }
}

const report = {
  schema: 'sudoku-board-browser-run-v1', startedAt: new Date().toISOString(), url,
  options, provenance: await provenance(), profiles: [], motionCorrectness: null,
  limitations: [
    'The page must come from the production build. This script does not build or start the server.',
    'Mobile emulation uses desktop Chromium at 390 × 844 with fourfold CPU throttling. It is not a physical-phone test.',
    'The update benchmark requests reduced motion. A separate normal-motion check compares visible and settled DOM states.',
    'Programmatic DOM clicks do not measure hardware input delay, paint latency, or INP.',
  ],
}

async function save() {
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
}

async function openPage(context) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForFunction(() => window.sudokuPrototype && window.runSudokuComparison, undefined, { timeout: 15000 })
  await page.evaluate(async () => { await window.sudokuPrototype.ready })
  return { page, errors }
}

async function normalMotionCheck(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' })
  try {
    const { page, errors } = await openPage(context)
    const result = await page.evaluate(async () => {
      const api = window.sudokuPrototype
      const implementations = ['current-react', 'memo-react', 'solid']
      const actions = [
        { type: 'select', cell: 3 }, { type: 'candidate', cell: 2, digit: 1 },
        { type: 'candidate', cell: 2, digit: 1 }, { type: 'value', cell: 2, digit: 4 },
        { type: 'value', cell: 2, digit: 0 }, { type: 'color', cell: 2, color: 2 },
        { type: 'candidate-color', cell: 2, digit: 1, color: 3 }, { type: 'highlight', digit: 1 },
        { type: 'select', cell: 2, extend: true }, { type: 'highlight', digit: null },
      ]
      const bursts = [
        { id: 'reverted-value', actions: [
          { type: 'value', cell: 2, digit: 4 }, { type: 'value', cell: 2, digit: 0 },
        ] },
        { id: 'reverted-candidate', actions: [
          { type: 'candidate', cell: 2, digit: 1 }, { type: 'candidate', cell: 2, digit: 1 },
        ] },
      ]
      const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
      const reference = new Map()
      let checked = 0
      const check = (implementation, key, snapshot = JSON.stringify(api.snapshot())) => {
        if (implementation === 'current-react') reference.set(key, snapshot)
        else if (snapshot !== reference.get(key)) throw new Error(`Normal-motion DOM parity failed: ${implementation}, ${key}.`)
        checked++
      }
      const fadeSnapshot = (selector = '[data-board-fade]') =>
        [...api.getRoot().querySelectorAll(selector)].map(mark => ({
          cell: mark.closest('[data-cell]')?.getAttribute('data-cell'), tag: mark.tagName.toLowerCase(),
          className: [...mark.classList].sort().join(' '), text: mark.textContent?.trim(),
          phase: mark.getAttribute('data-board-fade'), hidden: mark.getAttribute('aria-hidden'),
          inert: mark.hasAttribute('inert'), gridArea: mark.style.gridArea,
        })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      const observeAction = action => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          observer.disconnect()
          reject(new Error(`No DOM mutation during normal-motion action ${JSON.stringify(action)}.`))
        }, 3000)
        const observer = new MutationObserver(() => {
          observer.disconnect()
          clearTimeout(timeout)
          const exits = fadeSnapshot('[data-board-fade="exit"]')
          resolve({ live: JSON.stringify(api.snapshot()), exits: JSON.stringify(exits) })
        })
        observer.observe(api.getRoot(), { subtree: true, childList: true, attributes: true, characterData: true })
        api.dispatch(action)
      })
      for (const implementation of implementations) {
        await api.setImplementation(implementation)
        await api.reset('puzzle')
        await delay(320)
        check(implementation, 'initial')
        for (const [index, action] of actions.entries()) {
          const observed = await observeAction(action)
          check(implementation, `commit-live:${index}`, observed.live)
          check(implementation, `commit-exits:${index}`, observed.exits)
          await frame()
          await frame()
          check(implementation, `live:${index}`)
          await delay(320)
          check(implementation, `settled:${index}`)
          if (api.getRoot().querySelector('[data-board-fade="exit"]')) {
            throw new Error(`An exiting mark survived its cleanup period: ${implementation}, action ${index}.`)
          }
        }
        for (const burst of bursts) {
          await api.reset('puzzle')
          await delay(320)
          const initial = JSON.stringify(api.snapshot())
          check(implementation, `burst:${burst.id}:initial`, initial)
          // Both updates happen in one turn. There is no frame, await, or forced flush between them.
          for (const action of burst.actions) api.dispatch(action)
          await frame()
          await frame()
          check(implementation, `burst:${burst.id}:live`)
          check(implementation, `burst:${burst.id}:fade-phases`, JSON.stringify(fadeSnapshot()))
          if (JSON.stringify(api.snapshot()) !== initial) {
            throw new Error(`A reverted burst changed the live board: ${implementation}, ${burst.id}.`)
          }
          if (burst.id === 'reverted-value' && api.getRoot().querySelector('.cell-value[data-board-fade="exit"]')) {
            throw new Error(`A reverted value burst left a ghost value: ${implementation}.`)
          }
          await delay(320)
          check(implementation, `burst:${burst.id}:settled`)
          if (api.getRoot().querySelector('[data-board-fade="exit"]')) {
            throw new Error(`An exiting burst mark survived cleanup: ${implementation}, ${burst.id}.`)
          }
        }
      }
      return { passed: true, snapshotsChecked: checked, actions, bursts, implementations,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }
    })
    if (errors.length) throw new Error(`Browser errors during normal-motion checks: ${errors.join('; ')}`)
    if (screenshots) {
      const file = path.join(path.dirname(output), 'normal-motion.png')
      await page.screenshot({ path: file, fullPage: true })
      result.screenshot = path.relative(directory, file)
    }
    return result
  } finally { await context.close() }
}

const { chromium } = await loadPlaywright()
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
})
try {
  report.browserVersion = browser.version()
  const profiles = [
    { id: 'desktop', viewport: { width: 1440, height: 1000 }, cpuRate: 1, isMobile: false, hasTouch: false },
    { id: 'mobile-emulated-cpu4x', viewport: { width: 390, height: 844 }, cpuRate: 4, isMobile: true, hasTouch: true },
  ].filter(item => profile === 'both' || (profile === 'desktop' ? item.id === 'desktop' : item.id !== 'desktop'))
  for (const configuration of profiles) {
    console.log(`Running ${configuration.id}: ${options.rounds} rounds, ${options.samples} samples per workload.`)
    const context = await browser.newContext({ viewport: configuration.viewport, deviceScaleFactor: 1,
      isMobile: configuration.isMobile, hasTouch: configuration.hasTouch, reducedMotion: 'reduce' })
    try {
      const { page, errors } = await openPage(context)
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: configuration.cpuRate })
      await page.exposeFunction('reportBenchmarkProgress', message => console.log(`[${configuration.id}] ${message}`))
      const result = await page.evaluate(async settings => window.runSudokuComparison({ ...settings,
        onProgress: message => window.reportBenchmarkProgress(message) }), options)
      if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`)
      const entry = { ...configuration, result }
      if (screenshots) {
        await mkdir(path.dirname(output), { recursive: true })
        const file = path.join(path.dirname(output), `${configuration.id}.png`)
        await page.screenshot({ path: file, fullPage: true })
        entry.screenshot = path.relative(directory, file)
      }
      report.profiles.push(entry)
      await save()
    } finally { await context.close() }
  }
  if (!argv.includes('--skip-motion')) {
    console.log('Checking live and settled DOM parity with normal motion.')
    report.motionCorrectness = await normalMotionCheck(browser)
  }
  report.finishedAt = new Date().toISOString()
  await save()
  console.log(`Saved ${path.relative(directory, output)}.`)
} catch (error) {
  report.error = error instanceof Error ? { message: error.message, stack: error.stack } : String(error)
  report.finishedAt = new Date().toISOString()
  await save()
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally { await browser.close() }
