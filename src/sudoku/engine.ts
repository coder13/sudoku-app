import { withHintPreferences } from './hint-preferences.ts'
import { withSolverProfile } from './solver-profile.ts'

export type EngineCapabilities = { classic: true; variants: boolean; generation: boolean; teaching: boolean }

export type Analysis = 'conflict' | 'unsolvable' | 'unique' | 'multiple' | 'search-limit'
// 'unfair' is accepted only for historical saves and legacy input.
export type Difficulty = 'beginner' | 'easy' | 'medium' | 'tricky' | 'hard' | 'very-hard' | 'expert' | 'master' | 'extreme' | 'impossible' | 'unfair'
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
  exclude?: readonly string[]
} & RatingTarget & SolverOptions

export type GenerationRequest =
  | { type: 'generate-targeted'; seed: number; maxAttempts: number; target: GenerationTarget; includeRating?: boolean; exclude?: readonly string[] }
  | ({ type: 'generate-constrained'; includeRating?: boolean; templates?: readonly string[] } & MatchingOptions)
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
  | { type: 'quadruple'; topLeft: number; digits: readonly number[] }
  | { type: 'parity'; cells: readonly number[]; parity: 'odd' | 'even' }
  | { type: 'clone'; groups: readonly (readonly number[])[] }
  | { type: 'anti-knight' | 'anti-king' }
  | { type: 'non-consecutive'; except?: readonly (readonly [number, number])[] }
  | { type: 'inequality'; less: number; greater: number }
  | { type: 'kropki'; consecutive?: MarkedPairs; ratioTwo?: MarkedPairs }
  | { type: 'xv'; five?: MarkedPairs; ten?: MarkedPairs }
  | { type: 'adjacent-total'; cells: readonly [number, number]; sum: number }
  | { type: 'thermometer' | 'renban' | 'between'; cells: readonly number[] }
  | { type: 'palindrome'; cells: readonly number[]; segments?: readonly (readonly number[])[] }
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
  | { type: 'quadruple'; topLeft: number; clueSize: number }
  | { type: 'parity'; cells: readonly number[] }
  | { type: 'inequality'; cells: readonly [number, number] }
  | { type: 'adjacent-total'; cells: readonly [number, number] }
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
  | { operation: 'solve-singles'; displayedCandidates?: readonly number[] }
  | { operation: 'analyze'; maxNodes?: number }
  | { operation: 'solve'; maxNodes?: number; seed?: number }
  | ({ visibility?: VariantVisibility } & (
    | { operation?: 'normalize' }
    | { operation: 'hints'; collection?: number; techniqueOrder?: readonly string[]; limit?: number; preferProgress?: boolean; difficulty?: Difficulty }
    | { operation: 'rate'; techniqueOrder?: readonly string[] }
    | { operation: 'trace'; techniqueOrder?: readonly string[] }
    | { operation: 'replay-step'; techniqueOrder?: readonly string[]; stepIndex: number }
    | { operation: 'practice-position'; techniqueOrder?: readonly string[]; technique: string }
    | { operation: 'check-practice-move'; technique: string; action: DeductionAction }
  ))
)

export type EngineRequest =
  | { type: 'capabilities' }
  | VariantRequest
  | { type: 'canonical-puzzles'; values: readonly string[] }
  | { type: 'impossible-templates' }
  | { type: 'analyze'; values: string }
  | { type: 'notes'; values: string }
  | { type: 'solve'; values: string }
  | ({ type: 'solve-singles'; displayedCandidates?: readonly number[] } & CandidatePosition)
  | { type: 'generate'; seed: number }
  | ({ type: 'rate'; values: string } & SolverOptions)
  | ({ type: 'logical-solve'; includePositions?: boolean; includeStepDetails?: boolean; includeMoveAvailability?: boolean } & StartingPosition & SolverOptions)
  | ({ type: 'logical-solve-with-rank'; includePositions?: boolean; rankOptions?: Partial<RankFallbackOptions> } & StartingPosition & SolverOptions)
  | ({ type: 'compare-solve-paths'; technique: string } & StartingPosition & SolverOptions)
  | ({ type: 'alternate-solve-path'; technique: string; maxPositions: number } & StartingPosition & SolverOptions)
  | ({ type: 'practice-position'; technique: string } & StartingPosition & SolverOptions)
  | ({ type: 'check-practice-move'; technique: string; action: DeductionAction } & StartingPosition)
  | ({ type: 'hints'; collection?: number; limit?: number | 'all'; includePatterns?: boolean; preferProgress?: boolean; difficulty?: Difficulty } & CandidatePosition & HintOptions)
  | { type: 'hint-page'; collection: number; index: number; variant?: boolean }
  | { type: 'release-hints'; collection: number }
  | ({ type: 'next-deduction' } & CandidatePosition & HintOptions)
  | ({ type: 'deductions' } & CandidatePosition & SolverOptions)
  | ({ type: 'technique-count'; technique: string } & CandidatePosition)
  | ({ type: 'prove-rank'; pattern: RankPattern; target: Candidate; nodeBudget: number } & StartingPosition)
  | ({ type: 'discover-rank'; target: Candidate; nodeBudget: number } & StartingPosition)
  | ({ type: 'discover-rank-deductions'; limit?: number; nodeBudget: number; maxNodesPerCandidate: number } & StartingPosition)
  | ({ type: 'rank-deductions'; pattern: RankPattern; nodeBudget: number } & StartingPosition)
  | ({ type: 'replay-rank-proof'; proof: RankProof } & StartingPosition)
  | ({ type: 'rank-proof-effort'; proof: RankProof } & StartingPosition)
  | ({ type: 'classify-actions'; actions: readonly DeductionAction[] } & CandidatePosition)
  | { type: 'opening-techniques'; values: string }
  | { type: 'techniques'; variant?: boolean }
  | { type: 'lesson-examples' }
  | { type: 'practice-examples'; technique: string; variant?: false }
  | { type: 'practice-examples'; technique: string; variant: true }
  | { type: 'generate-practice-example'; technique: string; seed: number; exclude: string; variant?: boolean }
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
export type RankConstraint = { cell: number } | { 'house-digit': { house: House; digit: number } }
export type RankPattern = { bases: readonly RankConstraint[]; covers: readonly RankConstraint[] }
export type RankProof = {
  target: Candidate
  pattern: RankPattern
  nodes: readonly { base: number; cases: readonly Candidate[] }[]
}
export type RankProofEffort = {
  version: number
  constraints: number
  cells: number
  candidates: number
  nodes: number
  extraCases: number
  score: number
}
export type RankFallbackOptions = {
  maxSteps: number
  nodeBudget: number
  maxNodesPerScan: number
  maxNodesPerCandidate: number
}
export type RankSolveSearch = {
  nodeBudget: number
  nodesVisited: number
  candidatesExamined: number
  candidatesLimited: number
  complete: boolean
}
export type RankSolveStep =
  | ({ type: 'technique' } & Deduction)
  | { type: 'rank'; proof: RankProof; effort: RankProofEffort; search: RankSolveSearch; actions: [{ eliminate: Candidate }] }
export type RankSolution = {
  board: string
  steps: RankSolveStep[]
  status: 'solved' | 'stalled' | 'rank-step-limit' | 'rank-search-limit'
  techniqueOrder: string[]
  namedScore: PuzzleRating['score']
  namedScoringVersion: number
  rankOptions: RankFallbackOptions
  rankNodesVisited: number
  terminalRankSearch: RankSolveSearch | null
  positions?: PositionSnapshot[]
}
export type RankOutcome = { status: 'proven'; proof: RankProof } | { status: 'compatible' | 'search-limit' }
export type RankDiscovery = { outcome: RankOutcome; effort: RankProofEffort | null; nodesVisited: number }
export type RankDiscoveryScan = RankScan & {
  efforts: RankProofEffort[]
  candidatesExamined: number
  candidatesLimited: number
}
export type RankScan = { proofs: RankProof[]; nodesVisited: number; complete: boolean }
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
  | { 'mixed-group': Candidate[] }
type InferenceLink = {
  from: InferenceNode
  to: InferenceNode
  source: CandidateLink['source'] | { firework: number } | { peers: Record<string, never> }
    | { tridagon: { cells: [number, number, number][]; digits: [number, number, number] } }
    | { 'unique-rectangle': { corners: [number, number, number, number]; digits: [number, number] } }
    | { 'almost-locked-set': AlmostLockedSet }
    | { 'almost-locked-set-cell': { set: AlmostLockedSet; cell: number; blocked: number } }
  strength: CandidateLink['strength']
}
type RectangleSupport =
  | { 'extra-candidates': Candidate[] }
  | { subset: { houses: House[]; cells: number[]; digits: number[] } }
  | { 'strong-links': { houses: House[]; digit: number } }
type UniqueLoopSupport = RectangleSupport | { 'hidden-subset': { house: House; cells: number[]; digits: number[] } }
type ForcingLiteral = { candidate: Candidate; truth: boolean }
type ForcingScope =
  | 'guardians'
  | { candidate: Candidate }
  | { cell: number }
  | { house: { house: House; digit: number } }
  | { intersection: { source: House; target: House; digit: number } }
  | { 'naked-pair': { house: House; cells: [number, number]; digits: [number, number] } }
  | { 'hidden-pair': { house: House; cells: [number, number]; digits: [number, number] } }
  | { 'x-wing': { digit: number; bases: [House, House]; covers: [House, House] } }
type ForcingBranch = {
  assumption: ForcingLiteral
  steps: { effect: ForcingLiteral; scope: ForcingScope; causes: number[] }[]
  conflict:
    | { opposite: [number, number] }
    | { exhausted: { scope: ForcingScope; causes: number[] } }
    | { cases: [ForcingCase, ForcingCase] }
    | null
}
type ForcingCase = { premises: number[]; branch: ForcingBranch }
type AlmostLockedSet = { cells: number[]; digits: number[] }
type KrakenLink = {
  from: InferenceNode
  to: InferenceNode
  reason: 'exclusion' | { cell: number } | { house: House } | { 'almost-locked-set': AlmostLockedSet }
}
type SectorSubset = { house: House; cells: number[]; digits: number[] }
type SectorLink = { house: House; digits: number[] }
type ExocetCover = { digit: number; cells: number[]; houses: House[] }
type ExocetAssignment = { bases: [number, number]; targets: [number, number] }
type ExocetComponent = { bases: [number, number]; targets: [number, number]; covers: ExocetCover[] }
type ExocetTarget = { cell: number } | { 'conjugate-pair': { digit: number; link: ConjugatePair } }
type GroupedExocetComponent = Omit<ExocetComponent, 'targets'> & { targets: [ExocetTarget, ExocetTarget] }
type Evidence =
  | { 'pattern-overlay': {
      digit: number
      scopes: { digit: number; allowed: number[]; supported: number[] }[]
      geometry?: { houses: number[][]; excludedPairs: [number, number][] }
    } }
  | { variant: {
      description: string; reason: string
      /** App display context; native proof data and worker responses stay unchanged. */
      source?: { deduction: VariantDeduction; puzzle: VariantPuzzle }
    } }
  | { cell: number }
  | { house: House }
  | { intersection: { source: House; target: House; cells: number[] } }
  | { pair: { house: House; cells: [number, number]; digits: [number, number] } }
  | { subset: { house: House; cells: number[]; digits: number[]; lockedIn: House | null } }
  | { 'x-wing': { digit: number; bases: [House, House]; covers: [House, House] } }
  | { fish: { digit: number; bases: House[]; covers: House[]; fins: number[] } }
  | { 'complex-fish': { digit: number; bases: House[]; covers: House[]; fins: number[] } }
  | { 'kraken-fish': { digit: number; bases: House[]; covers: House[]; fins: number[]; cover: House | null; branches: KrakenLink[][] } }
  | { wing: { pivot: number; pincers: [number, number]; digits: [number, number, number] } }
  | { 'wxyz-wing': { cells: [number, number, number, number]; digits: [number, number, number, number]; unrestricted: number | null } }
  | { 'w-wing': { wings: [number, number]; link: ConjugatePair; linkedDigit: number; digit: number } }
  | { 'single-digit-chain': { digit: number; links: [ConjugatePair, ConjugatePair]; bridge: [number, number] } }
  | { 'empty-rectangle': { digit: number; row: number; column: number; cells: number[]; link: ConjugatePair } }
  | { chain: { links: CandidateLink[] } }
  | { inference: { links: InferenceLink[] } }
  | { 'unique-rectangle': { corners: [number, number, number, number]; digits: [number, number]; support: RectangleSupport } }
  | { 'unique-loop': { sides: [number[], number[]]; digits: [number, number]; support: UniqueLoopSupport } }
  | { 'bug-plus-one': { cell: number; candidates: [number, number, number]; houses: [House, House, House] } }
  | { 'aligned-exclusion': { cells: number[]; cases: { digits: number[]; reason: { 'repeated-digit': [number, number] } | { 'empty-cell': number } }[] } }
  | { firework: { wings: [number, number]; pivots: { cell: number; digits: number[] }[] } }
  | { 'firework-w-wing': { pivot: number; digits: [number, number]; wings: [number[], number[]]; bivalue: [number, number] } }
  | { 'firework-l-wing': { pivot: number; digits: [number, number]; wings: [number, number]; link: ConjugatePair; linked_digit: number } }
  | { 'firework-als-wing': { pivots: [number, number]; digits: [number, number]; wings: [[number[], number[]], [number[], number[]]]; bivalue: number } }
  | { tridagon: { cells: [number, number, number][]; digits: [number, number, number]; guardians: Candidate[]; branches: ForcingBranch[] } }
  | { forcing: { scope: ForcingScope | null; branches: ForcingBranch[] } }
  | { 'als-xz': { sets: [AlmostLockedSet, AlmostLockedSet]; links: number[] } }
  | { 'als-chain': { sets: AlmostLockedSet[]; links: number[] } }
  | { 'death-blossom': { stem: number; petals: { digit: number; set: AlmostLockedSet }[] } }
  | { 'sue-de-coq': { intersection: number[]; digits: number[]; line: SectorSubset; block: SectorSubset } }
  | { exocet: {
      bases: [number, number]
      targets: [number, number]
      crossLines: [House, House, House]
      covers: ExocetCover[]
      assignments: ExocetAssignment[]
    } }
  | { 'grouped-exocet': {
      bases: [number, number]
      targets: [ExocetTarget, ExocetTarget]
      crossLines: [House, House, House]
      covers: ExocetCover[]
    } }
  | { 'double-exocet': {
      components: [ExocetComponent, ExocetComponent]
      crossLines: [House, House, House]
      jointCrossLineSupport?: boolean
      assignments: [ExocetAssignment, ExocetAssignment][]
    } }
  | { 'grouped-double-exocet': {
      components: [GroupedExocetComponent, GroupedExocetComponent]
      crossLines: [House, House, House]
      rankPattern: RankPattern
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
export type LessonPosition = PositionSnapshot & { candidates: number[]; pattern?: ProofPattern }

export type LessonPractice = LessonPosition & { answers: DeductionAction[]; suggestion: DeductionAction }
export type PracticeExercise = LessonPractice & { deduction: Deduction }

export type LessonExample = LessonPosition & {
  deduction: Deduction
  practice: PracticeExercise
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
type HintPage<T> = { choices: T[]; available: number; offset: number; candidates?: number[] }
export type HintChoices = { choices: HintChoice[]; available: number; candidates?: number[] }
export type HintStages = { technique: string; pattern: ProofPattern; deduction: Deduction }
export type TechniqueCatalog = {
  defaultOrder: string[]
  difficultyOrder: string[]
  scoringVersion: number
  techniques: { id: string; aliases: string[]; cost: number; difficulty: Difficulty; requiresUniqueSolution: boolean }[]
}

type VariantResult<T extends VariantRequest> =
  T extends { operation: 'analyze' } ? Analysis :
  T extends { operation: 'solve' | 'solve-singles' } ? string :
  T extends { operation: 'candidates' } ? number[] :
  T extends { operation: 'hints'; collection: number } ? HintPage<VariantDeduction> :
  T extends { operation: 'hints' } ? VariantDeduction[] :
  T extends { operation: 'rate' } ? VariantRating :
  T extends { operation: 'trace' } ? VariantTrace :
  T extends { operation: 'replay-step' } ? VariantReplay | null :
  T extends { operation: 'practice-position' } ? Required<VariantPosition> | null :
  T extends { operation: 'check-practice-move' } ? VariantDeduction | null :
  Required<VariantPosition>

export type VariantHouse = { row: number } | { column: number } | { region: number }
  | { diagonal: 'main' | 'anti' }
  /** Index into the full puzzle rule list. */
  | { extra: number }
export type VariantExclusionPremise =
  | { type: 'cell'; cell: number; domain: number }
  | { type: 'house'; house: VariantHouse; digit: number; cells: number[] }
export type VariantDeduction = {
  technique: string
  actions: DeductionAction[]
  evidence:
    | { type: 'single'; candidate: Candidate; house: VariantHouse | null }
    | { type: 'cage-sum'; house: VariantHouse | null; cages: [number, number][]; sum: number; cells: number[]; domains: number[] }
    | { type: 'line-houses'; rules: number[]; cells: number[]; domains: number[]; supported: number[]; houses: VariantHouse[]; assignments: number }
    | { type: 'constraint'; rules: number[]; cells: number[]; domains: number[] }
    | { type: 'locked-digit'; clue: { rules: number[]; cells: number[] }; target: VariantHouse; cells: number[]; domains: number[]; digit: number }
    | { type: 'intersection'; source: VariantHouse; target: VariantHouse; cells: number[]; digit: number }
    | { type: 'exclusion'; premise: VariantExclusionPremise; rules: number[]; houses: VariantHouse[] }
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
  T extends { type: 'capabilities' } ? EngineCapabilities :
  T extends VariantRequest ? VariantResult<T> :
  T extends { type: 'analyze' } ? Analysis :
  T extends { type: 'notes' } ? number[] | null :
  T extends { type: 'canonical-puzzles' | 'impossible-templates' } ? string[] :
  T extends { type: 'solve' } ? string | null :
  T extends { type: 'rate' } ? PuzzleRating :
  T extends { type: 'logical-solve' } ? LogicalSolution :
  T extends { type: 'logical-solve-with-rank' } ? RankSolution :
  T extends { type: 'compare-solve-paths' } ? PathComparison :
  T extends { type: 'alternate-solve-path' } ? AlternatePath :
  T extends { type: 'practice-position' } ? LessonPosition | null :
  T extends { type: 'check-practice-move' } ? Deduction | null :
  T extends { type: 'release-hints' } ? null :
  T extends { type: 'hint-page'; variant: true } ? HintPage<VariantDeduction> :
  T extends { type: 'hint-page' } ? HintPage<HintChoice> :
  T extends { type: 'hints'; collection: number } ? HintPage<HintChoice> :
  T extends { type: 'hints' } ? HintChoices :
  T extends { type: 'next-deduction' } ? HintStages | null :
  T extends { type: 'deductions' } ? DeductionMatch[] :
  T extends { type: 'technique-count' } ? number :
  T extends { type: 'prove-rank' } ? RankOutcome :
  T extends { type: 'discover-rank' } ? RankDiscovery :
  T extends { type: 'discover-rank-deductions' } ? RankDiscoveryScan :
  T extends { type: 'rank-deductions' } ? RankScan :
  T extends { type: 'replay-rank-proof' } ? boolean :
  T extends { type: 'rank-proof-effort' } ? RankProofEffort | null :
  T extends { type: 'classify-actions' } ? (string | null)[] :
  T extends { type: 'opening-techniques' } ? string[] :
  T extends { type: 'techniques' } ? TechniqueCatalog :
  T extends { type: 'generate-targeted' | 'generate-constrained'; includeRating: true } ? GeneratedPuzzle :
  T extends { type: 'generate-from-pool' } ? GeneratedPuzzle :
  T extends { type: 'generate-variant' } ? GeneratedVariant :
  T extends { type: GenerationCommand['type'] } ? GenerationProgress<Generated> :
  T extends { type: 'lesson-examples' } ? Record<string, LessonExample> :
  T extends { type: 'practice-examples'; variant: true } ? VariantPracticeExercise[] :
  T extends { type: 'generate-practice-example'; variant: true } ? VariantPracticeExercise :
  T extends { type: 'generate-practice-example' } ? PracticeExercise :
  T extends { type: 'practice-examples' } ? PracticeExercise[] : string

export type EnginePayload = { value: EngineResult<EngineRequest> } | { error: string; code?: string }
export type EngineResponse = { id: number } & EnginePayload

export function replayStep<Step, Position extends PositionSnapshot>(
  trace: { steps: readonly Step[]; positions?: readonly Position[] },
  index: number,
): { before: Position; deduction: Step; after: Position } | null {
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

type EngineConnection = {
  worker?: Worker
  pending: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>
}
const playEngine: EngineConnection = { pending: new Map() }
const generationEngine: EngineConnection = { pending: new Map() }
const historyEngine: EngineConnection = { pending: new Map() }
const techniqueEngine: EngineConnection = { pending: new Map() }
const techniqueDetailEngine: EngineConnection = { pending: new Map() }
let requestId = 0
let generationId = 0

function connect(connection: EngineConnection) {
  const { pending } = connection
  const instance = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
  instance.onmessage = ({ data }: MessageEvent<EngineResponse>) => {
    const request = pending.get(data.id)
    if (!request) return
    pending.delete(data.id)
    if ('error' in data) request.reject(new EngineError(data.error, data.code))
    else request.resolve(data.value)
  }
  instance.onerror = () => {
    if (connection.worker === instance) closeConnection(connection, new Error('The Sudoku engine could not start. Try again.'))
  }
  return instance
}

function closeConnection(connection: EngineConnection, error: Error) {
  connection.worker?.terminate()
  connection.worker = undefined
  for (const request of connection.pending.values()) request.reject(error)
  connection.pending.clear()
}

type WorkerOptions = { interactive?: boolean; background?: boolean }

function connectionFor(request: EngineRequest, options: WorkerOptions) {
  switch (request.type) {
    case 'generate':
    case 'generate-constrained':
    case 'generate-targeted':
    case 'generate-from-pool':
    case 'generate-variant':
    case 'generate-practice-example':
    case 'generation-start':
    case 'generation-advance':
    case 'generation-cancel':
    case 'impossible-templates':
    case 'canonical-puzzles':
      return generationEngine
    case 'technique-count': return techniqueEngine
    case 'deductions': return options.interactive ? techniqueDetailEngine : historyEngine
    case 'classify-actions': return historyEngine
    default: return options.interactive ? techniqueDetailEngine : options.background ? historyEngine : playEngine
  }
}

export function runEngine<T extends EngineRequest>(request: T, options: WorkerOptions = {}): Promise<EngineResult<T>> {
  return sendRequest(connectionFor(request, options), request)
}

// Each visible board owns its synchronous Wasm work. Closing it interrupts even
// an in-flight forcing search without cancelling another board or action history.
let idleCountConnection: EngineConnection | undefined

export function createCountWorker(values: string, eliminations: readonly number[] | undefined, position?: VariantPosition) {
  let connection: EngineConnection | undefined
  return {
    count(technique: string) {
      if (!connection) {
        connection = idleCountConnection ?? { pending: new Map() }
        idleCountConnection = undefined
      }
      if (!position) return sendRequest(connection, { type: 'technique-count', values, eliminations, technique })
      return sendRequest(connection, { type: 'variant', operation: 'hints',
        position: { ...position, eliminations }, techniqueOrder: [technique], limit: 0xffff_ffff,
      }).then((hints) => new Set(hints.flatMap(({ actions }) => actions.map((action) => {
        const { cell, digit } = 'place' in action ? action.place : action.eliminate
        return `${'place' in action ? 'p' : 'e'}:${cell}:${digit}`
      }))).size)
    },
    close() {
      if (!connection) return
      if (!connection.pending.size && !idleCountConnection) idleCountConnection = connection
      else closeConnection(connection, new DOMException('Technique scan closed.', 'AbortError'))
      connection = undefined
    },
  }
}

function sendRequest<T extends EngineRequest>(connection: EngineConnection, request: T): Promise<EngineResult<T>> {
  return new Promise((resolve, reject) => {
    connection.worker ??= connect(connection)
    const id = ++requestId
    connection.pending.set(id, { resolve: (value) => resolve(value as EngineResult<T>), reject })
    connection.worker.postMessage({ id, request: withHintPreferences(withSolverProfile(request)) })
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
