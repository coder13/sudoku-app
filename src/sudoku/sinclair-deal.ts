import { getGameCollection, getCollectionPuzzle } from './collections.ts'
import { DIFFICULTY_LABELS } from './difficulty.ts'
import { runEngine, type Difficulty } from './engine.ts'
import { createGameId, makeGame, type Game } from './game.ts'
import { ratingAttemptFor } from './player-rating.ts'
import { libraryFamily, libraryLevel } from './sinclair-catalog.ts'
import { sinclairDownloads } from './sinclair-download.ts'
import { definitionOf, libraryId, puzzleCode, type SinclairPack } from './sinclair-format.ts'
import { puzzleSimilarity, visibleClues, type PuzzleStyle } from './sinclair-variety.ts'
import { randomIndex } from './sinclair-layout.ts'
import { autoTechniqueFocus, type TechniqueProgress } from './technique-progress.ts'
import { VARIANTS, type VariantId } from './variants.ts'
import { history, historyKey, rememberSinclair } from './sinclair-history.ts'

const classicAnswers = new Map<string, string | null>(), answerKeys = new Map<string, string>()
async function savedAnswers(games: readonly Game[], signal: AbortSignal) {
  const solutions = new Set<string>()
  for (const game of games) {
    signal.throwIfAborted()
    if (game.source === 'draft' || game.collection && libraryFamily(game.collection.collectionId) && getGameCollection(game)) continue
    // An imported grid can be incomplete or admit more than one solution.
    if (game.variant) { solutions.add(game.variant.solution); continue }
    if (!classicAnswers.has(game.givens)) {
      const unique = await runEngine({ type: 'analyze', values: game.givens }, { background: true }) === 'unique'
      classicAnswers.set(game.givens, unique ? await runEngine({ type: 'solve', values: game.givens }, { background: true }) : null)
    }
    const answer = classicAnswers.get(game.givens)
    if (answer) solutions.add(answer)
  }
  const missing = [...solutions].filter(answer => !answerKeys.has(answer))
  for (let start = 0; start < missing.length; start += 32) {
    signal.throwIfAborted()
    const values = missing.slice(start, start + 32)
    const keys = await runEngine({ type: 'canonical-puzzles', values }, { background: true })
    values.forEach((answer, i) => answerKeys.set(answer, keys[i]))
  }
  return new Set([...solutions].map(s => answerKeys.get(s)!))
}

export function chooseSinclair(pack: SinclairPack, ids: readonly string[], dealt: readonly string[], used: ReadonlySet<string>,
  games: readonly Game[], seed: number, progress?: readonly TechniqueProgress[]) {
  const excluded = new Set(dealt), own = libraryId(pack.variant)
  for (const game of games) if (game.collection?.collectionId === own && getGameCollection(game)) excluded.add(game.collection.puzzleId)
  const remaining = pack.puzzles.flatMap((row, i) => excluded.has(ids[i]) || used.has(row[2]) ? [] : [i])
  if (!remaining.length) throw Error('You have seen every available ' + VARIANTS[pack.variant].name + ' puzzle at ' + DIFFICULTY_LABELS[pack.difficulty] + '. Choose another difficulty, turn off Sinclair, or replay a puzzle in Collections.')
  const focus = progress && autoTechniqueFocus(progress, [...new Set(remaining.map(i => pack.order[pack.puzzles[i][4]]))])
  const prefer = focus ? remaining.filter(i => pack.puzzles[i][5].includes(pack.order.indexOf(focus))) : remaining
  const style = (i: number): PuzzleStyle => {
    const row = pack.puzzles[i]
    return { ...visibleClues(definitionOf(row)), hardest: pack.order[row[4]], opening: pack.openings[row[6]] }
  }
  const recent: PuzzleStyle[] = []
  const previous = games.filter(g => g.source !== 'draft' && (g.variant?.id ?? 'classic') === pack.variant)
    .sort((a, b) => b.created - a.created)[0]
  const priorId = previous?.collection?.collectionId === own ? previous.collection.puzzleId : undefined
  if (previous) {
    const i = priorId ? ids.indexOf(priorId) : -1
    recent.push(i >= 0 ? style(i) : { ...visibleClues(previous.variant?.puzzle ?? { version: 1, givens: previous.givens }),
      hardest: getGameCollection(previous)?.puzzle.hardestTechnique ?? undefined })
  }
  for (const code of [...dealt].reverse()) {
    if (recent.length >= 3) break
    const i = ids.indexOf(code)
    if (i >= 0 && code !== priorId) recent.push(style(i))
  }
  const pick = randomIndex(seed)
  if (!recent.length) return prefer[pick(prefer.length)]
  let best = prefer[0], bestScore = Infinity
  for (const i of prefer) {
    const candidate = style(i)
    const score = recent.reduce((sum, s, age) => sum + puzzleSimilarity(candidate, s) / (3 ** age), 0) + pick(1000) / 25000
    if (score < bestScore) { best = i; bestScore = score }
  }
  return best
}

export async function dealSinclair(family: VariantId, tier: Difficulty, seed: number, auto: boolean,
  progress: readonly TechniqueProgress[] | undefined, games: () => readonly Game[], add: (game: Game) => void, signal: AbortSignal) {
  const pack = await sinclairDownloads.load(family, tier, signal)
  const ids = libraryLevel(family, tier).rows.map(([given, variant]) => puzzleCode(tier, variant ?? given))
  const commit = async () => {
    const used = await savedAnswers(games(), signal)
    signal.throwIfAborted()
    const i = chooseSinclair(pack, ids, history(historyKey(family, tier)), used, games(), seed, progress)
    const row = pack.puzzles[i], definition = definitionOf(row)
    const collectionId = libraryId(family), puzzleId = ids[i]
    const { puzzle } = getCollectionPuzzle(collectionId, puzzleId)!
    const game = makeGame(createGameId(), puzzle.title, definition.givens, 'generated')
    game.collection = { collectionId, puzzleId }
    game.generationStyle = 'sinclair'
    game.difficulty = tier
    game.score = row[3]
    if (family !== 'classic') game.variant = { id: family, puzzle: definition, solution: row[1] }
    if (auto) game.generatedWithAuto = true
    game.ratingAttempt = ratingAttemptFor({ difficulty: tier, points: row[3], scoringVersion: pack.scoringVersion,
      techniqueOrder: pack.order }, auto ? undefined : 'fixed')
    add(game)
    rememberSinclair(collectionId, puzzleId, tier)
  }
  if (globalThis.navigator?.locks) await navigator.locks.request(historyKey(family, tier), { signal }, commit)
  else await commit()
}
