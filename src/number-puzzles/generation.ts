import { calcudokuCatalog } from '../calcudoku/catalog.ts'
import {
  calcudokuCandidates, calcudokuClueVariants, calcudokuRecipeKeys, calcudokuRecipeSignature, generateCalcudoku,
  type CalcudokuGenerationHistory, type CalcudokuRecipe,
} from '../calcudoku/generator.ts'
import { kakuroCatalog } from '../kakuro/catalog.ts'
import { solveKakuro, type KakuroPuzzle } from '../kakuro/engine.ts'
import {
  generateKakuro, kakuroHintDifficulty, kakuroRecipeFromPuzzle, kakuroRecipeSignature, varyKakuroClues, type KakuroRecipe,
} from '../kakuro/generator.ts'
import { solveLatin } from '../latin/engine.ts'
import type { NumberPuzzleDifficulty } from './catalog.ts'
import {
  calcudokuFromRecipe, decodeGeneratedNumberPayload, decodeGeneratedNumberPuzzle, encodeGeneratedNumberPuzzle,
  generatedNumberPayload, kakuroFromRecipe, RECENT_GENERATED_PUZZLE_LIMIT, type GeneratedNumberGame,
} from './generated.ts'
import type { GeneratedIdentity } from './generated-storage.ts'
import type { PuzzleLayout } from './layout-index.ts'

export type GenerationOptions = {
  game: GeneratedNumberGame
  difficulty: NumberPuzzleDifficulty
  seed: number
}
export type GenerationRequest = GenerationOptions & { previous?: readonly string[] }

export function retrySeed(seed: number) {
  return (seed ^ 0x9e3779b1) >>> 0
}

export function calcudokuPlaySeeds(seed: number) {
  return [seed, retrySeed(seed), (seed ^ 0x85ebca6b) >>> 0] as const
}

function calcudokuCatalogAtDifficulty(difficulty: NumberPuzzleDifficulty) {
  return calcudokuCatalog.filter(entry => entry.difficulty === difficulty)
    .map(({ puzzle }) => ({ puzzle, signature: calcudokuRecipeSignature(puzzle) }))
}

function* distinctCalcudokuCandidates(difficulty: NumberPuzzleDifficulty, seed: number) {
  const seen = new Set(calcudokuCatalogAtDifficulty(difficulty).map(({ signature }) => signature))
  const searches = calcudokuPlaySeeds(seed).map(nextSeed => calcudokuCandidates(difficulty, nextSeed))
  // Expand the cage shapes after the regular searches, before repeating a board.
  searches.push(calcudokuCandidates(difficulty, seed, { largerCage: true }))
  searches.push(calcudokuClueVariants(difficulty, seed))
  for (const candidates of searches) {
    for (const candidate of candidates) {
      if (seen.has(candidate.signature)) continue
      seen.add(candidate.signature)
      yield candidate
    }
  }
}

/** Look up history in small batches and prefer harder deductions for Hard. */
export function* findFreshCalcudoku(
  { difficulty, seed }: GenerationOptions,
): Generator<string[], CalcudokuRecipe | null, Pick<ReadonlySet<string>, 'has'>> {
  const candidates = distinctCalcudokuCandidates(difficulty, seed)
  let limit = difficulty === 'hard' ? 24 : 4
  while (true) {
    const batch = []
    while (batch.length < limit) {
      const next = candidates.next()
      if (next.done) break
      batch.push(next.value)
    }
    if (!batch.length) return null

    const played = yield batch.map(({ signature }) => signature)
    let basicRecipe: CalcudokuRecipe | undefined
    for (const { recipe, signature } of batch) {
      if (played.has(signature)) continue
      const puzzle = calcudokuFromRecipe(recipe)
      if (difficulty !== 'hard') {
        if (solveLatin(puzzle, [], 1).status === 'unique') return recipe
        continue
      }
      // Try cage arithmetic and basic row and column deductions on their own.
      const basicRules = puzzle.rules.filter(rule => !rule.afterBasic && rule.kind !== 'line-total')
      const basic = solveLatin({ ...puzzle, rules: basicRules }, [], 1).status
      if (basic === 'unique') basicRecipe ??= recipe
      else if (basic === 'search-limit' && solveLatin(puzzle, [], 1).status === 'unique') return recipe
    }
    // Prefer a fresh basic board to spending another lookup on a harder one.
    if (basicRecipe) return basicRecipe
    limit = 32
  }
}

function leastRecentCatalogPuzzle<Puzzle>(
  catalog: { puzzle: Puzzle; signature: string }[],
  recent: ReadonlyMap<string, number>,
): Puzzle {
  // Published puzzles provide a fallback even if every search reaches its limit.
  return catalog.sort((a, b) => (recent.get(a.signature) ?? -1) - (recent.get(b.signature) ?? -1))[0].puzzle
}

export function olderCalcudoku(
  difficulty: NumberPuzzleDifficulty,
  previous: readonly string[],
  excluded: ReadonlySet<string>,
): CalcudokuRecipe | undefined {
  const seen = new Set<string>()
  for (const token of previous) {
    const payload = firstSavedPayload(token, seen)
    if (!payload) continue
    const stored = decodeGeneratedNumberPayload(payload, 'calcudoku')
    if (stored?.difficulty !== difficulty) continue
    try {
      const recipe = stored.recipe
      if (excluded.has(calcudokuRecipeSignature(recipe))) continue
      if (solveLatin(calcudokuFromRecipe(recipe), [], 1).status === 'unique') return recipe
    } catch { /* Ignore invalid saved cages. */ }
  }
}

export function selectCalcudokuReplay(
  { difficulty, seed }: GenerationOptions,
  recent: ReadonlyMap<string, number>,
  history: CalcudokuGenerationHistory,
) {
  const catalog = calcudokuCatalogAtDifficulty(difficulty)
  const excluded = new Set([...catalog.map(({ signature }) => signature), ...recent.keys()])
  const recipe = generateCalcudoku(difficulty, seed, excluded, history) ??
    generateCalcudoku(difficulty, retrySeed(seed), excluded, history) ??
    generateCalcudoku(difficulty, seed, excluded)
  return {
    recipe,
    excluded,
    catalogRecipe(): CalcudokuRecipe {
      const { size, cages } = leastRecentCatalogPuzzle(catalog, recent)
      return { size, cages: [...cages] }
    },
  }
}

export function selectCalcudokuPlay(
  request: GenerationOptions,
  recent: ReadonlyMap<string, number>,
  history: CalcudokuGenerationHistory,
  previous: readonly string[],
): CalcudokuRecipe {
  const search = findFreshCalcudoku(request)
  const played = { has: (signature: string) => history.signatures.has(signature) || recent.has(signature) }
  let candidate = search.next()
  while (!candidate.done) candidate = search.next(played)
  if (candidate.value) return candidate.value

  const selection = selectCalcudokuReplay(request, recent, history)
  return selection.recipe ?? olderCalcudoku(request.difficulty, previous, selection.excluded) ?? selection.catalogRecipe()
}

function calcudokuRecipeForPlay(request: GenerationOptions, previous: readonly string[]): CalcudokuRecipe {
  const { difficulty } = request
  const recent = new Map<string, number>()
  const signatures = new Set<string>()
  const recipes = new Set<string>()
  const seen = new Set<string>()

  for (let index = previous.length - 1; index >= 0; index--) {
    // Replays share a puzzle payload. The newest play supplies its recency.
    const payload = firstSavedPayload(previous[index], seen)
    if (!payload) continue
    const stored = decodeGeneratedNumberPayload(payload, 'calcudoku')
    if (stored?.difficulty !== difficulty) continue
    try {
      const { key, signature } = calcudokuRecipeKeys(stored.recipe)
      recipes.add(key)
      if (!signatures.has(signature) && recent.size < RECENT_GENERATED_PUZZLE_LIMIT) {
        recent.set(signature, index)
      }
      signatures.add(signature)
    } catch { /* Ignore invalid saved cages. */ }
  }

  return selectCalcudokuPlay(request, recent, { signatures, recipes }, previous)
}

function firstSavedPayload(token: string, seen: Set<string>) {
  const payload = generatedNumberPayload(token)
  if (!payload || seen.has(payload)) return undefined
  seen.add(payload)
  return payload
}

function olderKakuro(
  difficulty: NumberPuzzleDifficulty,
  previous: readonly string[],
  recent: ReadonlyMap<string, number>,
): KakuroRecipe | undefined {
  const seen = new Set<string>()
  for (const token of previous) {
    const payload = firstSavedPayload(token, seen)
    if (!payload) continue
    const stored = decodeGeneratedNumberPayload(payload, 'kakuro')
    if (stored?.difficulty !== difficulty) continue
    try {
      const puzzle = kakuroFromRecipe(stored.recipe)
      if (recent.has(kakuroRecipeSignature(puzzle))) continue
      const whiteCount = puzzle.cells.filter(cell => cell === null).length
      if (solveKakuro(puzzle, [], 1).status === 'unique' &&
        kakuroHintDifficulty(puzzle, whiteCount) === difficulty) return stored.recipe
    } catch { /* Ignore invalid saved clues. */ }
  }
}

export type KakuroLayout = PuzzleLayout & { id: string }
export const KAKURO_CLUE_SOURCE_LIMIT = 4

/** Summarize the latest play of each layout in newest-first order. */
export function summarizeKakuroLayouts(sessions: readonly GeneratedIdentity[]): KakuroLayout[] {
  const summaries = new Map<string, KakuroLayout>()
  const seen = new Set<string>()
  for (let index = sessions.length - 1; index >= 0; index--) {
    const { id, number } = sessions[index]
    const payload = firstSavedPayload(id, seen)
    if (!payload) continue
    const stored = decodeGeneratedNumberPayload(payload, 'kakuro')
    if (!stored) continue
    try {
      const { difficulty } = stored
      const signature = kakuroRecipeSignature(kakuroFromRecipe(stored.recipe))
      const key = difficulty + ':' + signature
      if (!summaries.has(key)) summaries.set(key, { difficulty, signature, latest: number, id })
    } catch { /* Ignore invalid saved clues. */ }
  }
  return [...summaries.values()]
}

const kakuroCatalogLayouts = kakuroCatalog.map(({ puzzle, difficulty }) =>
  ({ puzzle, difficulty, signature: kakuroRecipeSignature(puzzle) }))
export const kakuroCatalogSignatures: ReadonlySet<string> = new Set(kakuroCatalogLayouts.map(({ signature }) => signature))

export function kakuroClueSources(difficulty: NumberPuzzleDifficulty, recent: readonly KakuroLayout[]): KakuroPuzzle[] {
  const sources: KakuroPuzzle[] = []
  for (const { id } of recent.slice(0, KAKURO_CLUE_SOURCE_LIMIT)) {
    const stored = decodeGeneratedNumberPuzzle(id, 'kakuro')
    if (stored) sources.push(kakuroFromRecipe(stored.recipe))
  }
  for (const entry of kakuroCatalogLayouts) if (entry.difficulty === difficulty) sources.push(entry.puzzle)
  return sources
}

export function replayKakuro(
  difficulty: NumberPuzzleDifficulty, recent: readonly KakuroLayout[], previous: readonly string[],
): KakuroRecipe {
  const latest = new Map(recent.map(({ signature, latest }) => [signature, latest]))
  const catalog = kakuroCatalogLayouts.filter(entry => entry.difficulty === difficulty)
  return olderKakuro(difficulty, previous, latest)
    ?? kakuroRecipeFromPuzzle(leastRecentCatalogPuzzle(catalog, latest))
}

export function selectKakuroFromHistory(
  request: GenerationOptions, layouts: readonly KakuroLayout[], sessions: readonly GeneratedIdentity[],
): KakuroRecipe {
  const { difficulty, seed } = request
  const excluded = new Set(kakuroCatalogSignatures)
  for (const { signature } of layouts) excluded.add(signature)
  const recipe = generateKakuro(difficulty, seed, excluded)
  if (recipe) return recipe
  const recent = layouts.filter(layout => layout.difficulty === difficulty).slice(0, RECENT_GENERATED_PUZZLE_LIMIT)
  return varyKakuroClues(difficulty, seed, excluded, kakuroClueSources(difficulty, recent))
    ?? generateKakuro(difficulty, retrySeed(seed), excluded)
    ?? replayKakuro(difficulty, recent, sessions.map(({ id }) => id))
}

function kakuroRecipeForPlay(request: GenerationOptions, previous: readonly string[]): KakuroRecipe {
  const sessions = previous.map((id, index) => ({ id, number: index + 1 }))
  return selectKakuroFromHistory(request, summarizeKakuroLayouts(sessions), sessions)
}

export function generateNumberPuzzle(request: GenerationOptions & { previous: readonly string[] }): string {
  const { game, difficulty } = request
  const puzzle = game === 'calcudoku'
    ? { game, difficulty, recipe: calcudokuRecipeForPlay(request, request.previous) }
    : { game, difficulty, recipe: kakuroRecipeForPlay(request, request.previous) }
  // A new session needs its own save even when the board has the same clues.
  return encodeGeneratedNumberPuzzle(puzzle, crypto.randomUUID())
}
