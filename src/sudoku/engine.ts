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
  | VariantGenerationRequest

type GenerationCommand =
  | { type: 'generation-start'; job: number; request: GenerationRequest }
  | { type: 'generation-advance' | 'generation-cancel'; job: number }

type MarkedPairs = { pairs?: readonly (readonly [number, number])[]; negative?: boolean }
type ClueDirection = 'north' | 'east' | 'south' | 'west'
type DiagonalDirection = 'north-east' | 'south-east' | 'south-west' | 'north-west'

export type VariantRule =
  | { type: 'diagonal'; diagonal: 'main' | 'anti' }
  | { type: 'extra-house'; cells: readonly number[] }
  | { type: 'killer-cages'; cages: readonly { cells: readonly number[]; sum: number }[]; coverGrid?: boolean }
  | { type: 'parity'; cells: readonly number[]; parity: 'odd' | 'even' }
  | { type: 'clone'; groups: readonly (readonly number[])[] }
  | { type: 'anti-knight' | 'anti-king' | 'non-consecutive' }
  | { type: 'inequality'; less: number; greater: number }
  | { type: 'kropki'; consecutive?: MarkedPairs; ratioTwo?: MarkedPairs }
  | { type: 'xv'; five?: MarkedPairs; ten?: MarkedPairs }
  | { type: 'thermometer' | 'palindrome' | 'renban' | 'between'; cells: readonly number[] }
  | { type: 'whispers'; cells: readonly number[]; minDifference: number }
  | { type: 'arrow'; circle: number; cells: readonly number[] }
  | { type: 'region-sum'; cells: readonly number[]; groupByRegion?: boolean }
  | { type: 'sandwich' | 'x-sum'; direction: ClueDirection; cells: readonly number[]; sum: number }
  | { type: 'little-killer'; direction: DiagonalDirection; cells: readonly number[]; sum: number }
  | { type: 'skyscrapers'; direction: ClueDirection; cells: readonly number[]; count: number }

export type VariantPuzzle = {
  version: 1
  givens: string
  regions?: { type: 'boxes' } | { type: 'jigsaw'; regions: readonly (readonly number[])[] }
  rules?: readonly VariantRule[]
}

export type VariantClueLayout =
  | { type: 'killer-cages'; cages: readonly (readonly number[])[]; coverGrid?: boolean }
  | { type: 'killer-cage-sizes'; sizes: readonly number[]; coverGrid?: boolean }
  | { type: 'parity'; cells: readonly number[] }
  | { type: 'inequality'; cells: readonly [number, number] }
  | { type: 'markers'; family: 'kropki' | 'xv'; negative?: readonly [boolean, boolean]; count?: number }
  | { type: 'outside'; clue: 'sandwich' | 'x-sum' | 'skyscrapers'; direction: ClueDirection; cells: readonly number[] }
  | { type: 'outside'; clue: 'little-killer'; direction: DiagonalDirection; cells: readonly number[] }

export type VariantGenerationRequest = {
  type: 'generate-variant'
  seed: number
  maxAttempts: number
  maxNodes?: number
  template: VariantPuzzle
  derivedClues?: readonly VariantClueLayout[]
  givens: number | readonly [number, number]
  variantClues?: number | readonly [number, number]
  requiredRule?: string
  technique?: TechniqueTarget
  techniqueOrder?: readonly string[]
  exclude?: readonly VariantPuzzle[]
} & RatingTarget

export type VariantPosition = {
  puzzle: VariantPuzzle
  entries?: string
  eliminations?: readonly number[]
}

export type VariantVisibility = {
  cells: readonly number[]
  rules: readonly number[]
  completeKropki?: boolean
  completeXv?: boolean
  knownRemovals?: readonly number[]
}

type VariantRequest = {
  type: 'variant'
  position: VariantPosition
} & (
  | { operation: 'candidates' }
  | { operation: 'analyze'; maxNodes?: number }
  | { operation: 'solve'; maxNodes?: number; seed?: number }
  | ({ visibility?: VariantVisibility } & (
    | { operation?: 'normalize' }
    | { operation: 'hints'; techniqueOrder?: readonly string[]; limit?: number }
    | { operation: 'rate'; techniqueOrder?: readonly string[] }
    | { operation: 'trace'; techniqueOrder?: readonly string[] }
    | { operation: 'replay-step'; techniqueOrder?: readonly string[]; stepIndex: number }
    | { operation: 'practice-position'; techniqueOrder?: readonly string[]; technique: string }
    | { operation: 'check-practice-move'; technique: string; action: DeductionAction }
  ))
)

export type EngineRequest =
  | VariantRequest
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
  | { type: 'techniques'; variant?: boolean }
  | { type: 'lesson-examples' }
  | { type: 'practice-examples'; technique: string; variant?: false }
  | { type: 'practice-examples'; technique: string; variant: true }
  | GenerationRequest
  | GenerationCommand

export type PuzzleRating = {
  score: { points: number; hardest: string | null; counts: Record<string, number> }
  status: { solved: Difficulty } | 'stalled'
  techniqueOrder: string[]
  scoringVersion: number
}
export type GeneratedPuzzle = { board: string; rating: PuzzleRating }
export type GeneratedVariant = {
  seed: number
  puzzle: VariantPuzzle
  solution: string
  givens: number
  variantClues: number
  rating: VariantRating
}
type Generated = string | GeneratedPuzzle | GeneratedVariant
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

type VariantResult<T extends VariantRequest> =
  T extends { operation: 'analyze' } ? Analysis :
  T extends { operation: 'solve' } ? string :
  T extends { operation: 'candidates' } ? number[] :
  T extends { operation: 'hints' } ? VariantDeduction[] :
  T extends { operation: 'rate' } ? VariantRating :
  T extends { operation: 'trace' } ? VariantTrace :
  T extends { operation: 'replay-step' } ? VariantReplay | null :
  T extends { operation: 'practice-position' } ? Required<VariantPosition> | null :
  T extends { operation: 'check-practice-move' } ? VariantDeduction | null :
  Required<VariantPosition>

type VariantHouse = { row: number } | { column: number } | { region: number }
  | { diagonal: 'main' | 'anti' } | { extra: number }
export type VariantDeduction = {
  technique: string
  actions: DeductionAction[]
  evidence:
    | { type: 'single'; candidate: Candidate; house: VariantHouse | null }
    | { type: 'cage-sum'; house: VariantHouse | null; cages: [number, number][]; sum: number; cells: number[]; domains: number[] }
    | { type: 'constraint'; rules: number[]; cells: number[]; domains: number[] }
    | { type: 'intersection'; source: VariantHouse; target: VariantHouse; cells: number[]; digit: number }
    | { type: 'classic'; proof: Evidence; swapCells: number[] }
}
export type VariantRating = Pick<PuzzleRating, 'status' | 'techniqueOrder' | 'scoringVersion'> & {
  regions: NonNullable<VariantPuzzle['regions']>
  rules: VariantRule[]
  points: number
  counts: Record<string, number>
  hardest: string | null
}
export type VariantTrace = {
  start: Required<VariantPosition>
  end: Required<VariantPosition>
  rating: VariantRating
  steps: VariantDeduction[]
}
export type VariantReplay = {
  before: Required<VariantPosition>
  after: Required<VariantPosition>
  deduction: VariantDeduction
}
export type VariantPracticeExercise = {
  position: Required<VariantPosition>
  candidates: number[]
  answers: DeductionAction[]
  suggestion: DeductionAction
  deduction: VariantDeduction
}

export type EngineResult<T extends EngineRequest> =
  T extends VariantRequest ? VariantResult<T> :
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
  T extends { type: 'generate-variant' } ? GeneratedVariant :
  T extends { type: GenerationCommand['type'] } ? GenerationProgress<Generated> :
  T extends { type: 'lesson-examples' } ? Record<string, LessonExample> :
  T extends { type: 'practice-examples'; variant: true } ? VariantPracticeExercise[] :
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
  let current: GenerationProgress<Generated>
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
