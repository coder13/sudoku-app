import { withHintPreferences } from './hint-preferences.ts'
import { withSolverProfile } from './solver-profile.ts'

export type Analysis = 'conflict' | 'unsolvable' | 'unique' | 'multiple' | 'search-limit'
export type Difficulty = 'easy' | 'medium' | 'hard' | 'unfair' | 'extreme'
type SolverOptions = { techniqueOrder?: readonly string[] }
type HintOptions = { disabledTechniques?: readonly string[] }
type CandidatePosition = { values: string; eliminations?: readonly number[] }
type StartingPosition = CandidatePosition & { entries?: string }
type GenerationTarget =
  | ({ type: 'difficulty'; level: Difficulty } & SolverOptions)
  | { type: 'opening'; technique: string }
type RatingTarget =
  | { score?: readonly [number, number]; difficulty?: never }
  | { difficulty: Difficulty; score?: never }
type TechniqueTarget = string | { id: string; mode: 'anywhere' | 'first' | 'exclusive-opening' }
type MatchingOptions = {
  seed: number
  maxAttempts: number
  clues: number | readonly [number, number]
  technique?: TechniqueTarget
} & RatingTarget & SolverOptions

export type GenerationRequest =
  | { type: 'generate-targeted'; seed: number; maxAttempts: number; target: GenerationTarget }
  | ({ type: 'generate-constrained'; templates?: readonly string[] } & MatchingOptions)
  | ({ type: 'generate-from-pool' } & MatchingOptions)

type GenerationCommand =
  | { type: 'generation-start'; job: number; request: GenerationRequest }
  | { type: 'generation-advance' | 'generation-cancel'; job: number }

export type EngineRequest =
  | { type: 'analyze'; values: string }
  | { type: 'notes'; values: string }
  | { type: 'solve'; values: string }
  | { type: 'generate'; seed: number }
  | ({ type: 'rate'; values: string } & SolverOptions)
  | ({ type: 'logical-solve'; includePositions?: boolean; includeStepDetails?: boolean; includeMoveAvailability?: boolean } & StartingPosition & SolverOptions)
  | ({ type: 'compare-solve-paths'; technique: string } & StartingPosition & SolverOptions)
  | ({ type: 'alternate-solve-path'; technique: string; maxPositions: number } & StartingPosition & SolverOptions)
  | ({ type: 'practice-position'; technique: string } & StartingPosition & SolverOptions)
  | ({ type: 'check-practice-move'; technique: string; action: DeductionAction } & StartingPosition)
  | ({ type: 'hints'; limit?: number | 'all'; includePatterns?: boolean } & CandidatePosition & HintOptions)
  | ({ type: 'next-deduction' } & CandidatePosition & HintOptions)
  | ({ type: 'deductions' } & CandidatePosition & SolverOptions)
  | { type: 'opening-techniques'; values: string }
  | { type: 'techniques' }
  | { type: 'lesson-examples' }
  | { type: 'practice-examples'; technique: string }
  | GenerationRequest
  | GenerationCommand

export type PuzzleRating = {
  score: { points: number; hardest: string | null; counts: Record<string, number> }
  status: { solved: Difficulty } | 'stalled'
  techniqueOrder: string[]
  scoringVersion: number
}
export type GeneratedPuzzle = { board: string; rating: PuzzleRating }
type GenerationProgress<T> =
  | { status: 'pending'; attempts: number }
  | { status: 'matched'; attempts: number; puzzle: T }
  | { status: 'exhausted' | 'cancelled'; attempts: number }

export type GenerationOutcome<T> =
  | Exclude<GenerationProgress<T>, { status: 'pending' }>
  | { status: 'invalid'; attempts: 0; code: string; message: string }

export type House = { row: number } | { column: number } | { box: number }
export type Candidate = { cell: number; digit: number }
type ConjugatePair = { house: House; cells: [number, number] }
type CandidateLink = {
  from: Candidate
  to: Candidate
  source: { cell: number } | { house: House }
  strength: 'strong' | 'weak'
}
type ColoringReason =
  | 'both-colors'
  | { 'same-color-conflict': [Candidate, Candidate] }
  | { 'emptied-cell': number }
  | { 'emptied-house': { house: House; digit: number } }
export type InferenceNode = { candidate: Candidate } | { group: { digit: number; cells: number[] } }
type InferenceLink = Omit<CandidateLink, 'from' | 'to'> & { from: InferenceNode; to: InferenceNode }
type RectangleSupport =
  | { 'extra-candidates': Candidate[] }
  | { subset: { houses: House[]; cells: number[]; digits: number[] } }
  | { 'strong-links': { houses: House[]; digit: number } }
type ForcingLiteral = { candidate: Candidate; truth: boolean }
type ForcingScope = { candidate: Candidate } | { cell: number } | { house: { house: House; digit: number } }
type ForcingBranch = {
  assumption: ForcingLiteral
  steps: { effect: ForcingLiteral; scope: ForcingScope; causes: number[] }[]
  conflict: { opposite: [number, number] } | { exhausted: { scope: ForcingScope; causes: number[] } } | null
}
type AlmostLockedSet = { cells: number[]; digits: number[] }
type SectorSubset = { house: House; cells: number[]; digits: number[] }
type SectorLink = { house: House; digits: number[] }
type Evidence =
  | { cell: number }
  | { house: House }
  | { intersection: { source: House; target: House; cells: number[] } }
  | { pair: { house: House; cells: [number, number]; digits: [number, number] } }
  | { subset: { house: House; cells: number[]; digits: number[]; lockedIn: House | null } }
  | { 'x-wing': { digit: number; bases: [House, House]; covers: [House, House] } }
  | { fish: { digit: number; bases: House[]; covers: House[]; fins: number[] } }
  | { 'complex-fish': { digit: number; bases: House[]; covers: House[]; fins: number[] } }
  | { wing: { pivot: number; pincers: [number, number]; digits: [number, number, number] } }
  | { 'wxyz-wing': { cells: [number, number, number, number]; digits: [number, number, number, number]; unrestricted: number | null } }
  | { 'w-wing': { wings: [number, number]; link: ConjugatePair; linkedDigit: number; digit: number } }
  | { 'single-digit-chain': { digit: number; links: [ConjugatePair, ConjugatePair]; bridge: [number, number] } }
  | { 'empty-rectangle': { digit: number; row: number; column: number; cells: number[]; link: ConjugatePair } }
  | { chain: { links: CandidateLink[] } }
  | { inference: { links: InferenceLink[] } }
  | { 'unique-rectangle': { corners: [number, number, number, number]; digits: [number, number]; support: RectangleSupport } }
  | { 'bug-plus-one': { cell: number; candidates: [number, number, number]; houses: [House, House, House] } }
  | { forcing: { scope: ForcingScope | null; branches: ForcingBranch[] } }
  | { 'als-xz': { sets: [AlmostLockedSet, AlmostLockedSet]; links: number[] } }
  | { 'als-chain': { sets: AlmostLockedSet[]; links: number[] } }
  | { 'death-blossom': { stem: number; petals: { digit: number; set: AlmostLockedSet }[] } }
  | { 'sue-de-coq': { intersection: number[]; digits: number[]; line: SectorSubset; block: SectorSubset } }
  | { exocet: {
      bases: [number, number]
      targets: [number, number]
      crossLines: [House, House, House]
      covers: { digit: number; cells: number[]; houses: House[] }[]
      assignments: { bases: [number, number]; targets: [number, number] }[]
    } }
  | { 'sk-loop': { anchors: [number, number, number, number]; arms: number[][]; links: SectorLink[] } }
  | { 'multi-sector-locked-sets': { core: number[]; attachments: number[]; links: SectorLink[] } }
  | { coloring: { colors: [Candidate[], Candidate[]]; links: CandidateLink[]; reason: ColoringReason } }

export type DeductionAction = { place: Candidate } | { eliminate: Candidate }

export type Deduction = {
  technique: string
  evidence: Evidence
  actions: DeductionAction[]
}

export type ProofPattern = { houses: House[]; cells: number[]; candidates: Candidate[] }
export type DeductionProof = Pick<Deduction, 'technique' | 'evidence'> & { pattern: ProofPattern }
export type DeductionMatch = Pick<Deduction, 'actions'> & {
  affectedCells: number[]
  affectedCandidates: Candidate[]
  proofs: DeductionProof[]
}

export type PositionSnapshot = { givens: string; entries: string; eliminations: number[] }
export type LessonPosition = PositionSnapshot & { candidates: number[] }

export type LessonPractice = LessonPosition & { answers: DeductionAction[]; suggestion: DeductionAction }
export type PracticeExercise = LessonPractice & { deduction: Deduction }

export type LessonExample = LessonPosition & {
  deduction: Deduction
  practice: LessonPractice
}

export type SolvePosition = PositionSnapshot & { candidates?: number[]; pattern?: ProofPattern }

export type MoveAvailability = { easyMoves: number; bottleneck: boolean }
export type LogicalSolution = {
  board: string
  steps: Deduction[]
  rating: PuzzleRating
  positions?: SolvePosition[]
  moveAvailability?: MoveAvailability[]
}
export type PathComparison = { withTechnique: LogicalSolution; withoutTechnique: LogicalSolution }
export type AlternatePath =
  | { status: 'found'; positionsSearched: number; path: LogicalSolution }
  | { status: 'no-path' | 'inconclusive'; positionsSearched: number; path: null }
export type ReplayedStep = { before: SolvePosition; deduction: Deduction; after: SolvePosition }
export type HintChoice = Deduction & { pattern?: ProofPattern }
export type HintChoices = { choices: HintChoice[]; available: number; candidates?: number[] }
export type HintStages = { technique: string; pattern: ProofPattern; deduction: Deduction }
export type TechniqueCatalog = {
  defaultOrder: string[]
  scoringVersion: number
  techniques: { id: string; aliases: string[]; cost: number; difficulty: Difficulty; requiresUniqueSolution: boolean }[]
}

export type EngineResult<T extends EngineRequest> =
  T extends { type: 'analyze' } ? Analysis :
  T extends { type: 'notes' } ? number[] | null :
  T extends { type: 'solve' } ? string | null :
  T extends { type: 'rate' } ? PuzzleRating :
  T extends { type: 'logical-solve' } ? LogicalSolution :
  T extends { type: 'compare-solve-paths' } ? PathComparison :
  T extends { type: 'alternate-solve-path' } ? AlternatePath :
  T extends { type: 'practice-position' } ? LessonPosition | null :
  T extends { type: 'check-practice-move' } ? Deduction | null :
  T extends { type: 'hints' } ? HintChoices :
  T extends { type: 'next-deduction' } ? HintStages | null :
  T extends { type: 'deductions' } ? DeductionMatch[] :
  T extends { type: 'opening-techniques' } ? string[] :
  T extends { type: 'techniques' } ? TechniqueCatalog :
  T extends { type: 'generate-from-pool' } ? GeneratedPuzzle :
  T extends { type: GenerationCommand['type'] } ? GenerationProgress<string | GeneratedPuzzle> :
  T extends { type: 'lesson-examples' } ? Record<string, LessonExample> :
  T extends { type: 'practice-examples' } ? PracticeExercise[] : string

export type EnginePayload = { value: EngineResult<EngineRequest> } | { error: string; code?: string }
export type EngineResponse = { id: number } & EnginePayload

export function replayStep(trace: LogicalSolution, index: number): ReplayedStep | null {
  if (!Number.isInteger(index) || index < 0) return null
  const before = trace.positions?.[index]
  const after = trace.positions?.[index + 1]
  const deduction = trace.steps[index]
  return before && after && deduction ? { before, deduction, after } : null
}

export class EngineError extends Error {
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'EngineError'
    this.code = code
  }
}

let worker: Worker | undefined
let requestId = 0
let generationId = 0
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

function connect() {
  const instance = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
  instance.onmessage = ({ data }: MessageEvent<EngineResponse>) => {
    const request = pending.get(data.id)
    if (!request) return
    pending.delete(data.id)
    if ('error' in data) request.reject(new EngineError(data.error, data.code))
    else request.resolve(data.value)
  }
  instance.onerror = () => {
    instance.terminate()
    worker = undefined
    for (const request of pending.values()) request.reject(new Error('The Sudoku engine could not start. Try again.'))
    pending.clear()
  }
  return instance
}

export function runEngine<T extends EngineRequest>(request: T): Promise<EngineResult<T>> {
  return new Promise((resolve, reject) => {
    worker ??= connect()
    const id = ++requestId
    pending.set(id, { resolve: (value) => resolve(value as EngineResult<T>), reject })
    worker.postMessage({ id, request: withHintPreferences(withSolverProfile(request)) })
  })
}

/** Run a targeted search with an attempt count and cancellation at attempt boundaries. */
export async function runGeneration<T extends GenerationRequest>(
  request: T,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (attempts: number) => void } = {},
): Promise<GenerationOutcome<EngineResult<T>>> {
  if (signal?.aborted) return { status: 'cancelled', attempts: 0 }
  const job = ++generationId
  let current: GenerationProgress<string | GeneratedPuzzle>
  try {
    current = await runEngine({ type: 'generation-start', job, request })
  } catch (error) {
    if (error instanceof EngineError && error.code && error.code !== 'generation-active') {
      return { status: 'invalid', attempts: 0, code: error.code, message: error.message }
    }
    throw error
  }

  try {
    while (current.status === 'pending') {
      const previous = current.attempts
      current = await runEngine({ type: signal?.aborted ? 'generation-cancel' : 'generation-advance', job })
      if (current.attempts > previous) onProgress?.(current.attempts)
    }
    return current as GenerationOutcome<EngineResult<T>>
  } finally {
    if (current.status === 'pending') {
      await runEngine({ type: 'generation-cancel', job }).catch(() => {})
    }
  }
}
