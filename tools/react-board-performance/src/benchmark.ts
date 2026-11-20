import { cellInputs, createFixture, describeCell, reduceAction } from './model'
import type { Action, BoardState, CellInput, Fixture, Implementation } from './model'

export interface BoardBenchmarkApi {
  ready?: Promise<void>
  setImplementation(implementation: Implementation): Promise<void>
  reset(fixture: Fixture): Promise<void>
  dispatch(action: Action): void
  getState(): BoardState
  getImplementation(): Implementation
  getRoot(): HTMLElement
  snapshot(): unknown
}

export interface ComparisonOptions {
  samples?: number
  rounds?: number
  warmup?: number
  onProgress?: (message: string) => void
}

type WorkloadId = 'selection' | 'candidate-toggle' | 'value-entry' | 'dense-highlight'
type Metrics = { dispatchMs: number; commitMs: number; nextFrameMs: number }
export type Sample = Metrics & {
  implementation: Implementation
  workload: WorkloadId
  round: number
  step: number
  action: Action
}

interface Probe {
  cell: number
  className: string
  label: string
  selected: string
  tabIndex: string
  value: string
  digits: string
}

interface Step {
  action: Action
  probes: Probe[]
}

interface Workload {
  id: WorkloadId
  fixture: Fixture
  steps: Step[]
}

export interface ComparisonReport {
  schema: 'sudoku-react-board-comparison-v1'
  startedAt: string
  finishedAt: string
  seed: 'classic-board-sequence-v1'
  settings: { samples: number; rounds: number; warmup: number }
  environment: {
    userAgent: string
    viewport: { width: number; height: number; devicePixelRatio: number }
    board: { width: number; height: number }
    reducedMotion: boolean
    initialFrameIntervalMs: number
  }
  methodology: string[]
  parity: { passed: true; snapshotsChecked: number }
  summaries: ReturnType<typeof summarize>[]
  raw: Sample[]
}

const IMPLEMENTATIONS: Implementation[] = ['baseline', 'optimized']
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(() => resolve(performance.now())))
const classTokens = (value: string) => value.trim().split(/\s+/).filter(Boolean).sort().join(' ')

function option(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  const result = value ?? fallback
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new Error(`Benchmark options must be integers between ${minimum} and ${maximum}.`)
  }
  return result
}

function describeProbe(cell: CellInput): Probe {
  const description = describeCell(cell)
  return {
    cell: cell.index, className: classTokens(description.className), label: description.label,
    selected: String(cell.selected), tabIndex: cell.active ? '0' : '-1',
    value: cell.value ? String(cell.value) : '',
    digits: cell.value ? '' : description.digits.join(','),
  }
}

/** Probe only a few changed cells. Complete DOM comparisons run after the timed span. */
function prepareStep(state: BoardState, action: Action): { next: BoardState; step: Step } {
  const next = reduceAction(state, action)
  const before = cellInputs(state).map(describeProbe)
  const after = cellInputs(next).map(describeProbe)
  const changed = after.filter((probe, index) => JSON.stringify(probe) !== JSON.stringify(before[index]))
  if (!changed.length) throw new Error(`The benchmark contains a no-op action: ${JSON.stringify(action)}`)
  const indexes = new Set([changed[0].cell, changed[changed.length - 1].cell])
  if ('cell' in action) indexes.add(action.cell)
  return { next, step: { action, probes: [...indexes].map(index => after[index]) } }
}

function workloads(count: number): Workload[] {
  const open = [...createFixture('puzzle').givens].flatMap((value, index) => value === '0' ? [index] : [])
  const definitions: { id: WorkloadId; fixture: Fixture; action: (step: number) => Action }[] = [
    { id: 'selection', fixture: 'puzzle', action: step => ({ type: 'select', cell: (step * 17 + 11) % 81 }) },
    { id: 'candidate-toggle', fixture: 'puzzle', action: step => ({
      type: 'candidate', cell: open[step % open.length], digit: step % 9 + 1,
    }) },
    { id: 'value-entry', fixture: 'puzzle', action: step => {
      const cell = open[Math.floor(step / 2) % open.length]
      return { type: 'value', cell, digit: step % 2 ? 0 : Number(SOLUTION[cell]) }
    } },
    { id: 'dense-highlight', fixture: 'dense', action: step => ({
      type: 'highlight', digit: step % 10 === 9 ? null : step % 10 + 1,
    }) },
  ]
  return definitions.map(definition => {
    let state = createFixture(definition.fixture)
    const steps = Array.from({ length: count }, (_, index) => {
      const prepared = prepareStep(state, definition.action(index))
      state = prepared.next
      return prepared.step
    })
    return { id: definition.id, fixture: definition.fixture, steps }
  })
}

function liveElements(cell: Element, selector: string) {
  return [...cell.querySelectorAll<HTMLElement>(selector)].filter(element => !element.closest('[data-board-fade="exit"]'))
}

function probeMatches(root: HTMLElement, probe: Probe) {
  const cell = root.querySelector<HTMLElement>(`[data-cell="${probe.cell}"]`)
  if (!cell || cell.getAttribute('aria-label') !== probe.label ||
    cell.getAttribute('aria-selected') !== probe.selected || cell.getAttribute('tabindex') !== probe.tabIndex ||
    classTokens(cell.className) !== probe.className) return false
  const values = liveElements(cell, '.cell-value').map(element => element.textContent?.trim() ?? '').join('')
  if (values !== probe.value) return false
  return liveElements(cell, '.board-candidate')
    .map(element => Number(element.textContent?.trim())).sort((a, b) => a - b).join(',') === probe.digits
}

function measureUpdate(api: BoardBenchmarkApi, step: Step): Promise<Metrics> {
  return new Promise((resolve, reject) => {
    const root = api.getRoot()
    let started = 0
    let dispatchMs = 0
    let settled = false
    const timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      observer.disconnect()
      const failed = step.probes.filter(probe => !probeMatches(root, probe)).map(probe => probe.cell)
      reject(new Error(`DOM update timed out for ${api.getImplementation()} ${JSON.stringify(step.action)}. Unready cells: ${failed.join(', ')}.`))
    }, 3000)
    const observer = new MutationObserver(() => {
      const observedAt = performance.now()
      if (settled || !step.probes.every(probe => probeMatches(root, probe))) return
      settled = true
      observer.disconnect()
      window.clearTimeout(timeout)
      requestAnimationFrame(() => resolve({ dispatchMs, commitMs: observedAt - started, nextFrameMs: performance.now() - started }))
    })
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true })
    try {
      started = performance.now()
      api.dispatch(step.action)
      dispatchMs = performance.now() - started
    } catch (error) {
      settled = true
      observer.disconnect()
      window.clearTimeout(timeout)
      reject(error)
    }
  })
}

function percentile(sorted: number[], fraction: number) {
  if (!sorted.length) return 0
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower)
}

function distribution(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b)
  return {
    min: sorted[0], median: percentile(sorted, .5), p95: percentile(sorted, .95), max: sorted[sorted.length - 1],
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    q1: percentile(sorted, .25), q3: percentile(sorted, .75),
  }
}

function summarize(samples: Sample[], implementation: Implementation, workload: WorkloadId) {
  const selected = samples.filter(sample => sample.implementation === implementation && sample.workload === workload)
  const roundIds = [...new Set(selected.map(sample => sample.round))]
  return {
    implementation, workload, sampleCount: selected.length,
    dispatchMs: distribution(selected.map(sample => sample.dispatchMs)),
    commitMs: distribution(selected.map(sample => sample.commitMs)),
    nextFrameMs: distribution(selected.map(sample => sample.nextFrameMs)),
    rounds: roundIds.map(round => {
      const values = selected.filter(sample => sample.round === round)
      return { round, commitMedianMs: distribution(values.map(sample => sample.commitMs)).median,
        nextFrameMedianMs: distribution(values.map(sample => sample.nextFrameMs)).median }
    }),
  }
}

function mismatch(expected: string, actual: string) {
  let index = 0
  while (index < Math.min(expected.length, actual.length) && expected[index] === actual[index]) index++
  return `at character ${index}; expected ${expected.slice(Math.max(0, index - 80), index + 180)}; received ${actual.slice(Math.max(0, index - 80), index + 180)}`
}

export async function runComparison(api: BoardBenchmarkApi, options: ComparisonOptions = {}): Promise<ComparisonReport> {
  if (!import.meta.env.PROD) throw new Error('Measure the production build: run npm run build, then npm run preview.')
  await api.ready
  if (document.visibilityState !== 'visible') throw new Error('Keep the benchmark tab visible during the comparison.')
  const samples = option(options.samples, 60, 1, 500)
  const rounds = option(options.rounds, 3, 1, 12)
  const warmup = option(options.warmup, 20, 0, 100)
  const startedAt = new Date().toISOString()
  const boardBounds = api.getRoot().querySelector('.sudoku-grid')?.getBoundingClientRect()
  if (!boardBounds) throw new Error('The board must be mounted before measurement.')
  const initialImplementation = api.getImplementation()
  const definitions = workloads(warmup + samples)
  const raw: Sample[] = []
  const reference = new Map<string, string>()
  let snapshotsChecked = 0
  const frames: number[] = []
  for (let index = 0; index < 13; index++) frames.push(await nextFrame())
  const initialFrameIntervalMs = distribution(frames.slice(1).map((time, index) => time - frames[index])).median

  function checkSnapshot(key: string, implementation: Implementation) {
    const actual = JSON.stringify(api.snapshot())
    if (actual === undefined) throw new Error('The board snapshot must be JSON-serializable.')
    const expected = reference.get(key)
    if (expected === undefined) {
      if (implementation !== 'baseline') throw new Error(`The production reference is missing for ${key}.`)
      reference.set(key, actual)
    } else if (actual !== expected) {
      throw new Error(`DOM parity failed for ${implementation} ${key}: ${mismatch(expected, actual)}`)
    }
    snapshotsChecked++
  }

  try {
    for (const workload of definitions) {
      for (let round = 0; round < rounds; round++) {
        const order = IMPLEMENTATIONS.map((_, index) => IMPLEMENTATIONS[(index + round) % IMPLEMENTATIONS.length])
        for (const implementation of order) {
          options.onProgress?.(`${workload.id}: ${implementation}, round ${round + 1}/${rounds}`)
          await api.setImplementation(implementation)
          await api.reset(workload.fixture)
          await nextFrame()
          await nextFrame()
          checkSnapshot(`${workload.id}:initial`, implementation)
          for (const [index, step] of workload.steps.entries()) {
            const metrics = await measureUpdate(api, step)
            checkSnapshot(`${workload.id}:${index}`, implementation)
            if (index >= warmup) raw.push({ implementation, workload: workload.id, round: round + 1,
              step: index - warmup, action: step.action, ...metrics })
            // Snapshot work and the preceding frame opportunity stay outside the next timed update.
            await nextFrame()
          }
        }
      }
    }
  } finally {
    await api.setImplementation(initialImplementation)
    await api.reset('puzzle')
  }

  return {
    schema: 'sudoku-react-board-comparison-v1', startedAt, finishedAt: new Date().toISOString(),
    seed: 'classic-board-sequence-v1', settings: { samples, rounds, warmup },
    environment: {
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      board: { width: boardBounds.width, height: boardBounds.height },
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, initialFrameIntervalMs,
    },
    methodology: [
      'One complete production Board is mounted at a time. The baseline is pinned to 55067cc6; the optimized Board is imported from the app. Fixtures and actions are identical.',
      'Each action uses the same host DOM click path. These are programmatic clicks, not trusted hardware input.',
      'Framework scheduling is unchanged. No flushSync, flush, or forced layout is used to complete an update.',
      'dispatchMs is synchronous DOM dispatch duration. It excludes deferred framework work.',
      'commitMs is dispatch start to a MutationObserver callback that sees the expected live DOM. It includes scheduling delay.',
      'nextFrameMs is dispatch start to a requestAnimationFrame callback after DOM readiness. It is not paint latency or INP.',
      'Full normalized DOM comparisons and fixture generation are outside the timed interval. Exiting marks are excluded.',
      'Warmup actions are discarded. Implementation order rotates between rounds. Another frame separates timed actions.',
      'These measurements cover classic board updates. They do not measure startup, the solver, navigation, or complete app responsiveness.',
    ],
    parity: { passed: true, snapshotsChecked },
    summaries: definitions.flatMap(workload => IMPLEMENTATIONS.map(implementation => summarize(raw, implementation, workload.id))), raw,
  }
}
