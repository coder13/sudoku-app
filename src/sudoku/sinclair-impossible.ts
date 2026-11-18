import { SINGLE_TECHNIQUES } from './difficulty.ts'
import { EngineError, runEngine, type PuzzleRating } from './engine.ts'
import manifest from './generated/engine-profile.json' with { type: 'json' }
import bank from './sinclair-impossible-cores.json' with { type: 'json' }
import { randomIndex } from './sinclair-layout.ts'
import { classicSymbol, sinclairEvent, sinclairEventDistance, sinclairSelection, type SinclairEvent } from './sinclair-score.ts'
import { autoTechniqueFocus, type TechniqueProgress } from './technique-progress.ts'

type Core = (typeof bank.cores)[number]
type Continuation = { events: SinclairEvent[]; counts: Record<string, number> }
const continuations = new Map<Core, Continuation>()
const familyByGrid = new Map<string, Core | null>()
const canonicalByGrid = new Map<string, string>()

function continuation(core: Core): Continuation {
  const cached = continuations.get(core)
  if (cached) return cached
  const bytes = atob(core.events)
  const events: SinclairEvent[] = [], counts: Record<string, number> = {}
  for (let i = 0; i < bytes.length; i += 4) {
    const id = bank.difficultyOrder[bytes.charCodeAt(i)]
    counts[id] = (counts[id] ?? 0) + 1
    events.push({ token: classicSymbol(id), placements: bytes.charCodeAt(i + 1),
      eliminations: bytes.charCodeAt(i + 2), cell: bytes.charCodeAt(i + 3) })
  }
  const result = { events, counts }
  continuations.set(core, result)
  return result
}

function familyOf(grid: string) {
  if (familyByGrid.has(grid)) return familyByGrid.get(grid)
  const family = bank.cores.find(core => {
    for (let i = 0; i < 81; i++) {
      if (core.board[i] !== grid[i] && (grid[i] !== '0' || !core.optional.includes(i))) return false
    }
    return true
  }) ?? null
  familyByGrid.set(grid, family)
  return family
}

// Digit and box counts survive every Classic symmetry. Only matching signatures
// need the exact canonicalizer, including for imported or Standard games.
function signature(grid: string) {
  const digits = Array<number>(9).fill(0), boxes = Array<number>(9).fill(0)
  for (let i = 0; i < 81; i++) {
    if (grid[i] === '0') continue
    digits[grid.charCodeAt(i) - 49]++
    boxes[Math.floor(i / 27) * 3 + Math.floor(i % 9 / 3)]++
  }
  return digits.sort().join('') + '/' + boxes.sort().join('')
}

async function alreadyPlayed(board: string, history: Map<string, string[]>) {
  const matches = history.get(signature(board))
  if (!matches) return false
  if (matches.includes(board)) return true
  const missing = [board, ...matches].filter(grid => !canonicalByGrid.has(grid))
  if (missing.length) {
    const keys = await runEngine({ type: 'canonical-puzzles', values: missing })
    missing.forEach((grid, i) => canonicalByGrid.set(grid, keys[i]))
  }
  return matches.some(grid => canonicalByGrid.get(grid) === canonicalByGrid.get(board))
}

// Each odd stride visits every mask exactly once because the number of masks
// is a power of two. Visit one opening per family before trying a second one.
function* openings(cores: Core[], random: (limit: number) => number) {
  const order = [...cores]
  for (let i = order.length - 1; i > 0; i--) {
    const j = random(i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const cursors = order.map(core => {
    const count = 2 ** core.optional.length
    return { core, count, start: random(count), stride: random(count) | 1 }
  })
  for (let round = 0; cursors.length; round++) {
    for (let i = cursors.length - 1; i >= 0; i--) {
      const { core, start, stride, count } = cursors[i]
      const mask = (start + round * stride) % count
      const digits = [...core.board]
      core.optional.forEach((cell, k) => { if (mask & (1 << k)) digits[cell] = '0' })
      yield { core, board: digits.join('') }
      if (round + 1 === count) cursors.splice(i, 1)
    }
  }
}

const alternateSingles = ['hidden-single-box', 'full-house', 'hidden-single', 'naked-single']
const opening = (values: string, techniqueOrder: readonly string[]) =>
  runEngine({ type: 'logical-solve', values, techniqueOrder }, { background: true })

async function rateOpening(core: Core, board: string) {
  const suffix = continuation(core)
  const counts = { ...suffix.counts }
  let points = core.points, events = suffix.events
  if (board !== core.board) {
    const prefix = await opening(board, SINGLE_TECHNIQUES)
    if (prefix.board !== core.board || prefix.steps.some(step => step.actions.length !== 1 || !('place' in step.actions[0]))) return
    // The other two lower-tier checks both swap the two singles within each
    // tier. A placements-only prefix leaves precisely this core's candidates.
    if ((await opening(board, alternateSingles)).board !== core.board) return
    for (const [id, n] of Object.entries(prefix.rating.score.counts)) counts[id] = (counts[id] ?? 0) + n
    points += prefix.rating.score.points
    events = [...prefix.steps.map(sinclairEvent), ...suffix.events]
  }
  const rating: PuzzleRating = { scoringVersion: bank.scoringVersion, techniqueOrder: [...bank.difficultyOrder],
    status: { solved: 'impossible' }, score: { points, hardest: core.hardest, counts } }
  const distance = sinclairEventDistance('classic', 'impossible', events)
  const method = board === core.board ? 'certified-layout' : 'certified-opening'
  return { board, rating, canonical: rating, style: sinclairSelection(method, { version: 1, givens: board }, distance) }
}

type RatedOpening = NonNullable<Awaited<ReturnType<typeof rateOpening>>>
async function uniqueWinner(batch: RatedOpening[], signal?: AbortSignal) {
  for (const result of batch.sort((a, b) => a.style.rank - b.style.rank)) {
    signal?.throwIfAborted()
    const status = await runEngine({ type: 'analyze', values: result.board }, { background: true })
    signal?.throwIfAborted()
    if (status === 'unique') return { ...result, style: { ...result.style, candidates: batch.length } }
  }
}

export async function generateImpossible(seed: number, progress: readonly TechniqueProgress[] | undefined,
  previousPuzzles: readonly string[], signal?: AbortSignal) {
  signal?.throwIfAborted()
  if (!manifest.capabilities.generation || manifest.classicSolverFingerprint !== bank.fingerprint) return
  const catalog = await runEngine({ type: 'techniques' })
  if (catalog.scoringVersion !== bank.scoringVersion || catalog.difficultyOrder.join() !== bank.difficultyOrder.join()) return
  const available = catalog.techniques.filter(t => t.difficulty === 'impossible' && catalog.difficultyOrder.includes(t.id))
  const focus = progress && autoTechniqueFocus(progress, available.map(t => t.id))
  const eligible = focus ? bank.cores.filter(core => continuation(core).counts[focus]) : bank.cores
  if (!eligible.length) return
  if (familyByGrid.size > 4096) familyByGrid.clear()
  if (canonicalByGrid.size > 4096) canonicalByGrid.clear()
  const history = new Map<string, string[]>(), played = new Set<Core>()
  for (const grid of new Set(previousPuzzles.map(p => p.replaceAll('.', '0')))) {
    const key = signature(grid), matches = history.get(key)
    if (matches) matches.push(grid)
    else history.set(key, [grid])
    const prior = familyOf(grid)
    if (prior) played.add(prior)
  }
  const random = randomIndex(seed)
  for (const group of [eligible.filter(c => !played.has(c)), eligible.filter(c => played.has(c))]) {
    const batch: RatedOpening[] = []
    for (const { core, board } of openings(group, random)) {
      signal?.throwIfAborted()
      if (await alreadyPlayed(board, history)) continue
      try {
        const result = await rateOpening(core, board)
        if (!result) continue
        batch.push(result)
      } catch (error) {
        if (!(error instanceof EngineError && ['search-limit', 'multiple'].includes(error.code ?? ''))) throw error
      }
      if (batch.length === 6) {
        const result = await uniqueWinner(batch, signal)
        if (result) return result
        batch.length = 0
      }
    }
    signal?.throwIfAborted()
    const result = await uniqueWinner(batch, signal)
    if (result) return result
  }
}
