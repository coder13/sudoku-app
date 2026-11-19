import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createEngineHandler } from '../../src/sudoku/engine-protocol.ts'

const [wasmPath, ...runs] = process.argv.slice(2)
assert(wasmPath && runs.length, 'Pass the app Wasm and one or more calibration JSONL files.')
const wasm = await readFile(wasmPath)
const { instance } = await WebAssembly.instantiate(wasm)
const handle = createEngineHandler(async () => instance.exports)
let id = 0
const send = request => handle({ id: ++id, request })
const emit = record => console.log(JSON.stringify(record))
async function run(request) {
  const reply = await send(request)
  assert('value' in reply, JSON.stringify({ request, reply }))
  return reply.value
}

const inputs = await Promise.all(runs.map(async path => (await readFile(path, 'utf8'))
  .trim().split('\n').map(line => JSON.parse(line))))
const manifests = inputs.map(rows => rows.find(row => row.status === 'manifest'))
const templates = manifests[0].templates
for (const manifest of manifests) assert.deepEqual(manifest.templates, templates)
const matches = inputs.flatMap((rows, input) => rows
  .filter(row => row.status === 'outcome' && row.response.result.status === 'matched')
  .map(row => ({ ...row, input })))
const { defaultOrder, difficultyOrder } = await run({ type: 'techniques' })
emit({ status: 'manifest', wasmSha256: createHash('sha256').update(wasm).digest('hex'),
  node: process.version, runs, defaultOrder, difficultyOrder, matchedJobs: matches.length })

const keys = new Map()
async function canonicalize(grids) {
  const pending = [...new Set(grids)].filter(grid => !keys.has(grid))
  for (let index = 0; index < pending.length; index += 24) {
    const batch = pending.slice(index, index + 24)
    const canonical = await run({ type: 'canonical-puzzles', values: batch })
    assert.equal(batch.length, canonical.length)
    for (const [i, grid] of batch.entries()) {
      keys.set(grid, canonical[i])
      emit({ status: 'identity', grid, key: canonical[i] })
    }
  }
}

await canonicalize([...templates, ...matches.map(row => row.response.result.puzzle)])
const traces = new Map()
const exact = new Map()
for (const { job, input, route, request, response, truth } of matches) {
  const { puzzle, rating: original } = response.result
  assert.equal(truth.status, 'unique', JSON.stringify({ input, job, truth }))
  if (!exact.has(puzzle)) {
    assert.equal(await run({ type: 'analyze', values: puzzle }), 'unique')
    assert.equal(await run({ type: 'solve', values: puzzle }), truth.first)
    exact.set(puzzle, truth.first)
  }
  assert.equal(exact.get(puzzle), truth.first)
  const techniqueOrder = original?.techniqueOrder ?? defaultOrder
  const traceKey = JSON.stringify([puzzle, techniqueOrder])
  let path = traces.get(traceKey)
  if (!path) {
    path = await run({ type: 'logical-solve', values: puzzle, techniqueOrder })
    assert.deepEqual(path.rating.techniqueOrder, techniqueOrder)
    const cells = [...puzzle]
    for (const step of path.steps) {
      for (const action of step.actions) {
        const { cell, digit } = action.place ?? action.eliminate
        assert.equal(cells[cell], '0', JSON.stringify({ input, job, step }))
        if (action.place) {
          assert.equal(String(digit), truth.first[cell])
          cells[cell] = String(digit)
        } else {
          assert.notEqual(String(digit), truth.first[cell])
        }
      }
    }
    assert.equal(cells.join(''), path.board)
    if (typeof path.rating.status !== 'string' && 'solved' in path.rating.status) {
      assert.equal(path.board, truth.first)
    } else {
      assert(path.board.includes('0'), JSON.stringify(path.rating.status))
    }
    traces.set(traceKey, path)
    emit({ status: 'path', puzzle, solution: truth.first, path })
  }
  if (original) assert.deepEqual(path.rating, original)
  if (request.difficulty) assert.deepEqual(path.rating.status, { solved: request.difficulty })
  if (request.score) {
    const [minimum, maximum] = request.score
    assert(path.rating.score.points >= minimum && path.rating.score.points <= maximum)
    assert(typeof path.rating.status !== 'string' && 'solved' in path.rating.status)
  }
  const first = path.steps[0]?.technique ?? null
  if (request.technique?.mode === 'first') assert.equal(first, request.technique.id)
  emit({ status: 'verified', input, job, route, puzzle, key: keys.get(puzzle), first,
    rating: path.rating, steps: path.steps.length })
}

const transpose = grid => Array.from({ length: 81 }, (_, i) => grid[i % 9 * 9 + Math.floor(i / 9)]).join('')
const sparseSources = templates.filter(grid => grid.replaceAll('0', '').length === 17)
const history = [
  { type: 'generate-from-pool', seed: 42, maxAttempts: 64, clues: 17 },
  { type: 'generate-constrained', seed: 1, maxAttempts: 64, clues: [24, 28], includeRating: true },
]
for (const request of history) {
  const first = await run(request)
  const transposed = transpose(first.board)
  const exactRequest = { ...request, exclude: [first.board] }
  const equivalentRequest = { ...request, exclude: [transposed] }
  const exactReply = await run(exactRequest)
  const equivalentReply = await run(equivalentRequest)
  assert.deepEqual(exactReply, equivalentReply)
  await canonicalize([first.board, transposed, exactReply.board])
  assert.equal(keys.get(first.board), keys.get(transposed))
  assert.notEqual(keys.get(first.board), keys.get(exactReply.board))
  emit({ status: 'history', request, first, exactRequest, exactReply, equivalentRequest, equivalentReply })
}
const exhaustedRequest = { ...history[0], exclude: sparseSources }
const exhaustedReply = await send(exhaustedRequest)
assert.equal(exhaustedReply.code, 'search-limit', JSON.stringify(exhaustedReply))
emit({ status: 'history', exhaustedRequest, exhaustedReply })
emit({ status: 'finished', traces: traces.size, matchedJobs: matches.length, exactPuzzles: exact.size })
