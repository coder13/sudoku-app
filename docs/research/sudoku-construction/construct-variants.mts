// Two bounded construction experiments. The input is study.py's results.json.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { EngineError, runEngine, type VariantPuzzle } from '../../../src/sudoku/engine.ts'
import { getVariantPlayOrder } from '../../../src/sudoku/variant-play.ts'
import { countMixedSolutions } from '../../../tests/helpers/mixed-oracle.ts'
import { seedFor, wasmSha256 } from './engine.mts'

const [input, output] = process.argv.slice(2)
const study = JSON.parse(await readFile(input, 'utf8'))
assert.equal(study.wasmSha256, wasmSha256)
const targetWidth: number = study.classic.byTier.easy.medianWidths[0]
const order = await getVariantPlayOrder()
const cells = Array.from({ length: 81 }, (_, i) => i)
const indices = cells.slice(0, 9)
const rows = indices.map(r => indices.map(c => r * 9 + c))
const cols = indices.map(c => indices.map(r => r * 9 + c))
const boxes = indices.map(b => indices.map(i => Math.floor(b / 3) * 27 + 3 * (b % 3) + 9 * Math.floor(i / 3) + i % 3))
const adjacent = cells.map(i => cells.filter(j => Math.abs(i % 9 - j % 9) + Math.abs(Math.floor(i / 9) - Math.floor(j / 9)) === 1))

function random(seed: number) {
  let state = seed
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}
function pick<T>(choices: readonly T[], draw: () => number) {
  return choices[Math.floor(draw() * choices.length)]
}
function neighbors(a: number[], b: number[]) {
  return a.some(cell => adjacent[cell].some(other => b.includes(other)))
}
function connected(group: number[]) {
  const seen = new Set([group[0]])
  for (const cell of seen) {
    for (const next of adjacent[cell]) if (group.includes(next)) seen.add(next)
  }
  return seen.size === group.length
}
type Proposal = { puzzle: VariantPuzzle; target: number; anchor?: number; sums?: number[] }

function killer(solution: string, draw: () => number): Proposal | undefined {
  // The eight protected cells cover part of box 1. The ninth must join a crossing cage.
  const target = 20
  const inside = (cell: number) => cell !== target && boxes[0].includes(cell)
  const groups = cells.map(c => [c])
  const goal = 32 + Math.floor(draw() * 6)
  function partners(a: number[]) {
    return groups.filter(b => a !== b && inside(a[0]) === inside(b[0]) && a.length + b.length <= 4
      && neighbors(a, b) && new Set([...a, ...b].map(c => solution[c])).size === a.length + b.length)
  }
  for (;;) {
    const singletons = groups.filter(g => g.length === 1)
    if (singletons.length === 0 && groups.length <= goal) break
    const eligible = (singletons.length ? singletons : groups).map(a => ({ a, bs: partners(a) }))
    if (singletons.length && eligible.some(pair => !pair.bs.length)) return
    const pairs = eligible.filter(pair => pair.bs.length)
    if (!pairs.length) break
    const minimum = Math.min(...pairs.map(p => p.bs.length))
    const { a, bs } = pick(pairs.filter(p => p.bs.length === minimum), draw)
    const shortest = Math.min(...bs.map(b => b.length))
    const b = pick(bs.filter(b => b.length === shortest), draw)
    a.push(...b)
    groups.splice(groups.indexOf(b), 1)
  }
  const cages = groups.map(cells => ({ cells: cells.toSorted((a, b) => a - b),
    sum: cells.reduce((total, cell) => total + Number(solution[cell]), 0) }))
  const sums = cages.filter(cage => inside(cage.cells[0])).map(cage => cage.sum)
  assert.equal(45 - sums.reduce((a, b) => a + b), Number(solution[target]))
  return { puzzle: { version: 1, givens: '0'.repeat(81), rules: [{ type: 'killer-cages', cages, coverGrid: true }] }, target, sums }
}

function trade(regions: number[][], a: number, b: number, solution: string, draw: () => number) {
  const trades: { from: number; to: number; left: number[]; right: number[] }[] = []
  for (const from of regions[a]) for (const to of regions[b]) {
    if (solution[from] !== solution[to]) continue
    const left = regions[a].map(c => c === from ? to : c)
    const right = regions[b].map(c => c === to ? from : c)
    if (connected(left) && connected(right)) trades.push({ from, to, left, right })
  }
  if (!trades.length) return
  const choice = pick(trades, draw)
  regions[a] = choice.left
  regions[b] = choice.right
  return choice
}
async function jigsaw(solution: string, draw: () => number, seed: number): Promise<Proposal | undefined> {
  const regions = boxes.map(box => [...box])
  const top = Math.floor(draw() * 3)
  const swap = trade(regions, top, top + 3, solution, draw)
  if (!swap) return
  const lower = Math.floor(draw() * 3) + 3
  trade(regions, lower, lower + 3, solution, draw)
  let puzzle: VariantPuzzle
  try {
    const built = await runEngine({ type: 'generate-variant', seed, maxAttempts: 1, maxNodes: 30000,
      template: { version: 1, givens: solution, regions: { type: 'jigsaw', regions } },
      givens: [24, 29], requiredRule: 'jigsaw', techniqueOrder: order })
    puzzle = built.puzzle
  } catch (e) {
    if (e instanceof EngineError && e.code === 'search-limit') return
    throw e
  }
  const visible = [swap.from, swap.to].filter(c => puzzle.givens[c] !== '0')
  if (visible.length !== 1) return
  const anchor = visible[0]
  return { puzzle, target: anchor === swap.from ? swap.to : swap.from, anchor }
}

async function opening(puzzle: VariantPuzzle) {
  const masks = await runEngine({ type: 'variant', operation: 'candidates', position: { puzzle } })
  const full = new Set(cells.filter(c => puzzle.givens[c] === '0' && masks[c] && (masks[c] & (masks[c] - 1)) === 0))
  const regions = puzzle.regions?.type === 'jigsaw' ? puzzle.regions.regions : boxes
  for (const house of [...rows, ...cols, ...regions]) for (let bit = 1; bit <= 256; bit *= 2) {
    const places = house.filter(c => puzzle.givens[c] === '0' && (masks[c] & bit))
    if (places.length === 1) full.add(places[0])
  }
  return full
}
async function construct(family: 'killer' | 'jigsaw') {
  const candidates = []
  const outcomes: Record<string, number> = {}
  const record = (status: string) => { outcomes[status] = (outcomes[status] ?? 0) + 1 }
  let attempts = 0
  while (candidates.length < 4 && attempts < 600) {
    const seed = seedFor('motif/' + family + '/' + attempts++)
    const start = await runEngine({ type: 'generate', seed })
    const solution = await runEngine({ type: 'solve', values: start })
    assert.ok(solution)
    const draw = random(seed)
    const proposal = family === 'killer' ? killer(solution, draw) : await jigsaw(solution, draw, seed)
    if (!proposal) { record('layout-or-carving'); continue }
    const position = { puzzle: proposal.puzzle }
    const status = await runEngine({ type: 'variant', operation: 'analyze', position, maxNodes: 40000 })
    if (status !== 'unique') { record(status); continue }
    const forced = await opening(proposal.puzzle)
    if (family === 'jigsaw' && forced.has(proposal.target)) { record('target-already-single'); continue }
    const trace = await runEngine({ type: 'variant', operation: 'trace', position, techniqueOrder: order })
    if (trace.rating.status === 'stalled') { record('logical-stall'); continue }
    const filled = [...proposal.puzzle.givens]
    for (const step of trace.steps) for (const action of step.actions) {
      if ('place' in action) {
        assert.equal(filled[action.place.cell], '0')
        filled[action.place.cell] = String(action.place.digit)
      } else assert.notEqual(Number(solution[action.eliminate.cell]), action.eliminate.digit)
    }
    assert.equal(filled.join(''), solution)
    record('eligible')
    candidates.push({ ...proposal, seed, opening: forced.size, tier: trace.rating.status.solved,
      solution, steps: trace.steps.length, scoring: trace.rating.scoringVersion })
  }
  assert.equal(candidates.length, 4, JSON.stringify({ family, attempts, outcomes }))
  const winner = candidates.toSorted((a, b) => Math.abs(a.opening - targetWidth) - Math.abs(b.opening - targetWidth))[0]
  const oracle = countMixedSolutions(winner.puzzle)
  assert.equal(oracle.count, 1)
  assert.equal(oracle.solution, winner.solution)
  return { attempts, outcomes, widths: candidates.map(c => c.opening), winner, independentNodes: oracle.nodes }
}
const killerExample = await construct('killer')
const jigsawExample = await construct('jigsaw')
await writeFile(output, JSON.stringify({ wasmSha256, targetWidth, killer: killerExample, jigsaw: jigsawExample }, null, 2) + '\n')
console.log('Saved one uniquely solvable example per family.')
