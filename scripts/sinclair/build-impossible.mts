// Build exact, reusable hard continuations with the same Wasm binary the app ships.
import assert from 'node:assert/strict'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { classicSolverFingerprint } from '../classic-solver-fingerprint.mjs'
import { digest, seedFor } from '../../docs/research/sudoku-construction/engine.mts'
import { SINGLE_TECHNIQUES } from '../../src/sudoku/difficulty.ts'
import { EngineError, runEngine } from '../../src/sudoku/engine.ts'
import { classicLayouts } from '../../src/sudoku/sinclair-layout.ts'
import manifest from '../../src/sudoku/generated/engine-profile.json' with { type: 'json' }

const bank = (await readFile(new URL('../../crates/engine/data/impossible.txt', import.meta.url), 'utf8')).trim().split('\n')
const { difficultyOrder, scoringVersion } = await runEngine({ type: 'techniques' })
assert.deepEqual(difficultyOrder.slice(0, 4), SINGLE_TECHNIQUES)
assert.equal(manifest.classicSolverFingerprint, classicSolverFingerprint(), 'Rebuild the browser engine first.')
const replace = (grid: string, i: number, digit: string) => grid.slice(0, i) + digit + grid.slice(i + 1)
const changed = (core: string, start: string) => Array.from(core).flatMap((d, i) => d === start[i] ? [] : [i])
const singles = (values: string) => runEngine({ type: 'logical-solve', values, techniqueOrder: SINGLE_TECHNIQUES })
const accepts = (values: string) => runEngine({ type: 'accepts-difficulty', difficulty: 'impossible', values })

async function certify(source: string) {
  const oriented = classicLayouts(source, seedFor(source), 1)[0]
  const solution = await runEngine({ type: 'solve', values: oriented })
  assert.ok(solution)
  const options = new Map<string, string>()
  for (let i = 0; i < 81; i++) {
    if (oriented[i] !== '0') continue
    const child = replace(oriented, i, solution[i])
    const core = (await singles(child)).board
    if (!options.has(core) && core.replaceAll('0', '').length <= 40 && changed(core, child).length >= 2) {
      options.set(core, child)
    }
  }
  const ranked = [...options].sort(([a, x], [b, y]) => changed(b, y).length - changed(a, x).length)
  // First try to add one true digit while preserving the hard reasoning. A source
  // in its original orientation remains available when the edited versions simplify.
  for (const start of [oriented, source]) {
    ranked.push([(await singles(start)).board, start])
  }
  for (const [core, start] of ranked) {
    if (!await accepts(core)) continue
    assert.equal(await runEngine({ type: 'analyze', values: core }), 'unique')
    assert.equal((await singles(core)).steps.length, 0)
    const path = await runEngine({ type: 'logical-solve', values: core, techniqueOrder: difficultyOrder })
    assert.deepEqual(path.rating.status, { solved: 'impossible' })
    assert.equal(path.board, await runEngine({ type: 'solve', values: core }))
    const events = path.steps.flatMap(step => {
      const technique = difficultyOrder.indexOf(step.technique)
      const placed = step.actions.filter(action => 'place' in action).length
      const first = step.actions[0]
      const cell = ('place' in first ? first.place : first.eliminate).cell
      const bytes = [technique, placed, step.actions.length - placed, cell]
      assert.ok(bytes.every(b => Number.isInteger(b) && b >= 0 && b <= 255))
      return bytes
    })
    // Any subset of jointly recoverable singles is recoverable. An extra removal
    // that gives multiple answers cannot belong to the group.
    let stripped = start
    for (let i = 0; i < 81 && changed(core, stripped).length < 12; i++) {
      if (stripped[i] === '0') continue
      const next = replace(stripped, i, '0')
      try {
        if ((await singles(next)).board === core) stripped = next
      } catch (error) {
        if (!(error instanceof EngineError && ['multiple', 'search-limit'].includes(error.code ?? ''))) throw error
      }
    }
    return { board: core, optional: changed(core, stripped), hardest: path.rating.score.hardest!,
      points: path.rating.score.points, events: Buffer.from(events).toString('base64') }
  }
  throw new Error('Could not certify bank source ' + source)
}

if (!isMainThread) {
  const { sources, cache } = workerData as { sources: string[]; cache: string }
  for (const source of sources) {
    const dest = join(cache, source + '.json')
    try { await readFile(dest) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const temporary = dest + '.' + process.pid + '.tmp'
      await writeFile(temporary, JSON.stringify(await certify(source)))
      await rename(temporary, dest)
    }
    parentPort!.postMessage(source)
  }
} else {
  const [output, cacheRoot, count = '256', lanes = '4'] = process.argv.slice(2)
  assert.ok(output && cacheRoot && +count >= 1 && +count <= bank.length && +lanes >= 1,
    'Pass an output JSON path, a scratch directory, and optionally parent count and workers.')
  const recipe = digest(await readFile(new URL(import.meta.url))) +
    digest(await readFile(new URL('../../src/sudoku/sinclair-layout.ts', import.meta.url)))
  const cache = join(cacheRoot, digest(manifest.classicSolverFingerprint + recipe))
  await mkdir(cache, { recursive: true })
  const sources = bank.sort((a, b) => seedFor('sinclair/' + a) - seedFor('sinclair/' + b)).slice(0, +count)
  let finished = 0
  await Promise.all(Array.from({ length: Math.min(+count, +lanes) }, (_, lane) => new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { cache, sources: sources.filter((_, i) => i % +lanes === lane) } })
    worker.on('message', () => { if (++finished % 16 === 0) console.log(finished, '/', sources.length) })
    worker.once('error', reject)
    worker.once('exit', code => code === 0 ? resolve() : reject(new Error('Certification worker exited ' + code)))
  })))
  const cores = await Promise.all(sources.map(async source => JSON.parse(await readFile(join(cache, source + '.json'), 'utf8'))))
  assert.equal(new Set(cores.map(c => c.board)).size, cores.length)
  const result = { fingerprint: manifest.classicSolverFingerprint, scoringVersion, difficultyOrder, cores }
  await writeFile(output, JSON.stringify(result) + '\n')
  console.log(cores.length, 'cores;', cores.reduce((sum, c) => sum + 2 ** c.optional.length, 0), 'starting masks before symmetry checks')
}
