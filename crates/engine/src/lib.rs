#![cfg_attr(all(feature = "variants", feature = "generation", feature = "teaching"), doc = include_str!("../README.md"))]
#![cfg_attr(not(all(feature = "variants", feature = "generation", feature = "teaching")), doc = include_str!("../BUILD_FEATURES.md"))]

#[cfg(any(feature = "generation", test))]
mod generation;
mod hints;
mod logical;
#[cfg(any(feature = "generation", feature = "teaching", test))]
mod permutation;
mod position;
#[cfg(any(feature = "teaching", test))]
mod practice;
#[cfg(all(
    feature = "wasm-api",
    any(target_arch = "wasm32", test, feature = "cli")
))]
mod protocol;
mod rank;
mod sized;
mod technique;
#[cfg(feature = "variants")]
mod variant;

#[cfg(any(feature = "generation", test))]
pub use generation::{
    GeneratedPuzzle, GenerationConflict, GenerationConstraints, GenerationCriteria,
    GenerationRating, GenerationSearch, GenerationStep, TechniqueTargetMode, VerifiedTemplate,
    accepts_difficulty, builtin_templates, canonical_puzzle, generate_constrained,
    generate_from_pool, generate_matching, generate_matching_with_mode, impossible_templates,
    start_from_pool, start_matching, start_targeted,
};
pub use hints::{
    AlignedExclusionCase, AlignedExclusionReason, AlmostLockedSet, AlmostLockedSetLink,
    BlossomPetal, Candidate, CandidateLink, ColoringReason, ConjugatePair, DEFAULT_HINT_LIMIT,
    DeductionMatch, DeductionProof, DoubleExocetProof, ExocetAssignment, ExocetComponent,
    ExocetCover, ExocetTarget, FireworkPivot, ForcingBranch, ForcingCase, ForcingConflict,
    ForcingInference, ForcingLiteral, ForcingScope, GroupedDoubleExocetProof,
    GroupedExocetComponent, Hint, HintAction, HintChoices, HintError, HintEvidence, HintStages,
    House, InferenceLink, InferenceNode, KrakenLink, KrakenLinkReason, LinkSource, LinkStrength,
    PatternOverlayDigit, PatternOverlayGeometry, PatternOverlayProof, ProofPattern,
    RectangleSupport, SectorLink, SectorSubset, SkLoopProof, UniquenessSupport, deductions,
    deductions_at, hint_choices, hints_at, next_deduction, next_deduction_at,
    next_enabled_deduction, ranked_hints, technique_deductions, technique_deductions_at,
};
pub use logical::{
    AlternatePath, AlternatePathStatus, CompleteClassicSolve, Difficulty,
    EightDigitOverlayCompletion, EightDigitOverlayProof, LogicalSolve, MoveAvailability,
    PathComparison, PuzzleRating, RankFallbackOptions, RankSolve, RankSolveReplay, RankSolveSearch,
    RankSolveStatus, RankSolveStep, ReplayedStep, SCORING_VERSION, SolveScore, SolveStatus,
    compare_paths, opening_techniques, rate_puzzle, replay_eight_digit_overlay_at,
    search_alternate_path, solve_logically, solve_position, solve_position_completely,
    solve_position_with_rank,
};
pub use position::PositionSnapshot;
#[cfg(any(feature = "teaching", test))]
pub use practice::{PracticeExample, check_practice_move};
#[cfg(feature = "cli")]
pub use protocol::batch::{BatchCommand, run_batch};
pub use rank::{
    RANK_PROOF_EFFORT_VERSION, RankConstraint, RankDiscovery, RankDiscoveryScan, RankError,
    RankOutcome, RankPattern, RankProof, RankProofEffort, RankProofNode, RankScan,
    discover_rank_at, discover_rank_deductions_at, prove_rank_at, rank_deductions_at,
    rank_proof_effort_at, replay_rank_proof_at,
};
#[cfg(feature = "variants")]
pub use sized::{
    AlgebraicBounds, AlgebraicCage, AlgebraicCageBound, AlgebraicCageProof, AlgebraicCompletion,
    AlgebraicDifficulty, AlgebraicHints, AlgebraicRating, AlgebraicStep, AlgebraicTracePosition,
    CageTotal, SizedAlgebraicCages,
};
#[cfg(feature = "variants")]
pub use sized::{
    CrustClue, EquationOperator, RunAxis, SizedConstraint, SizedConstraintFailure,
    SizedConstraintGrid, SizedConstraintHints, SizedConstraintStep, SizedConstraintTracePosition,
    SizedDiagonal, SizedDotRelation, SizedKropkiPair, SizedKropkiRelation, SizedLabeledDot,
    SizedParity, SizedSumEnd,
};
#[cfg(all(feature = "generation", feature = "variants"))]
pub use sized::{GeneratedAlgebraic, generate_algebraic};
pub use sized::{
    GridSpec, SIZED_GRID_VERSION, SizedDeduction, SizedGrid, SizedHints, SizedTechnique,
    SizedTracePosition,
};
#[cfg(feature = "generation")]
pub use sized::{
    MiniDifficulty, generate_eight, generate_five_jigsaw, generate_jigsaw, generate_mini,
    generate_six,
};
pub use technique::{ProfileError, SolverProfile, Technique};
#[cfg(feature = "variants")]
pub use variant::{
    AqreCount, AqreGivenShade, AqreKind, AqrePositionError, AqreRegion, AqreShade, ClueDirection,
    CompiledVariant, DEFAULT_VARIANT_SEARCH_NODES, Diagonal, EntropyGroup, KillerCage,
    LetteredQuadruple, MarkedPairs, NeighborMatchClue, Parity, PuzzleRule, RegionLayout,
    VARIANT_FORMAT_VERSION, VARIANT_SCORING_VERSION, VariantClueScope, VariantConstraintCheck,
    VariantConstraintScope, VariantDeduction, VariantDefinitionError, VariantEntropyAreaProof,
    VariantEvidence, VariantExclusionPremise, VariantGroupLineHouseCase,
    VariantGroupLineHouseConflict, VariantGroupLineHouseProof, VariantGroupOrderBranch,
    VariantGroupOrderCheck, VariantGroupOrderEliminationProof, VariantGroupOrderProof,
    VariantGroupOrderRefutation, VariantGroupOrderScope, VariantGroupSumChainProof,
    VariantGroupSumLink, VariantGroupSumLinkSource, VariantHouse, VariantHouseKind,
    VariantKropkiHouseProof, VariantLineHouseProof, VariantLinkedClueProof, VariantLogicalError,
    VariantMatchingDigitBlock, VariantMatchingDigitCheck, VariantMatchingDigitProof,
    VariantMatchingLayoutCase, VariantMatchingLayoutProof, VariantPosition, VariantPositionError,
    VariantPuzzle, VariantRating, VariantRayHouseProof, VariantRegionSumHouseLine,
    VariantRegionSumHouseProof, VariantRegionSumPart, VariantRegionSumProof,
    VariantRenbanGroupConflict, VariantRenbanGroupPlacement, VariantRenbanGroupProjection,
    VariantRenbanGroupProof, VariantRenbanHouseProof, VariantRenbanSumHouseProof,
    VariantRenbanSumHouseWitness, VariantRenbanSumProof, VariantReplay, VariantSumPairProof,
    VariantTechnique, VariantThermometerHouseProof, VariantTrace, VariantTrialFailure,
    VariantVisibility, VariantVisibilityError, canonical_variant,
};
#[cfg(all(feature = "variants", any(feature = "generation", test)))]
pub use variant::{
    GeneratedVariant, MarkerFamily, OutsideClueKind, VariantClueLayout, VariantGenerationError,
    VariantGenerationOptions, start_variant_generation,
};
#[cfg(all(feature = "variants", any(feature = "teaching", test)))]
pub use variant::{VariantPracticeError, VariantPracticeExercise, variant_practice_examples};

const CELLS: usize = 81;
const DIGITS: u16 = 0x1ff;
const SEARCH_LIMIT: u32 = 1_000_000;
const EXACT_PROBE_NODES: u32 = 256;
#[cfg(any(feature = "generation", test))]
const DEFAULT_CLUES: usize = 34;

/// A classic 9 × 9 grid in row-major order. Digits are 1–9 and 0 marks an empty cell.
pub type Board = [u8; CELLS];

/// The outcome of checking a grid for conflicts and counting up to two solutions.
#[repr(u32)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Analysis {
    /// A digit is out of range or appears twice in a row, column, or box.
    Conflict,
    /// The grid has no completion.
    Unsolvable,
    /// The grid has exactly one completion.
    Unique,
    /// The grid has at least two completions.
    Multiple,
    /// The exact-search budget ran out before the engine could classify the grid.
    SearchLimit,
}

#[derive(Default)]
struct Units {
    rows: [u16; 9],
    columns: [u16; 9],
    boxes: [u16; 9],
}

const fn coordinates(index: usize) -> (usize, usize, usize) {
    let (row, column) = (index / 9, index % 9);
    (row, column, (row / 3) * 3 + column / 3)
}

impl Units {
    fn from_board(board: &Board) -> Option<Self> {
        let mut units = Self::default();
        for (index, &digit) in board.iter().enumerate() {
            if digit == 0 {
                continue;
            }
            if digit > 9 {
                return None;
            }
            let bit = 1 << (digit - 1);
            if units.available(index) & bit == 0 {
                return None;
            }
            units.toggle(index, bit);
        }
        Some(units)
    }

    fn available(&self, index: usize) -> u16 {
        let (row, column, group) = coordinates(index);
        DIGITS & !(self.rows[row] | self.columns[column] | self.boxes[group])
    }

    fn toggle(&mut self, index: usize, bit: u16) {
        let (row, column, group) = coordinates(index);
        self.rows[row] ^= bit;
        self.columns[column] ^= bit;
        self.boxes[group] ^= bit;
    }

    fn next_cell(&self, board: &Board) -> Option<(usize, u16)> {
        let mut best = None;
        let mut fewest = 10;
        for (index, &digit) in board.iter().enumerate() {
            if digit != 0 {
                continue;
            }
            let choices = self.available(index);
            let count = choices.count_ones();
            if count < fewest {
                best = Some((index, choices));
                fewest = count;
            }
            if count == 0 {
                break;
            }
        }
        best
    }
}

/// Parse 81 ASCII cells in row order. Both `0` and `.` represent empty cells.
///
/// Use [`analyze`] to check whether the parsed grid has a unique solution.
pub fn parse_givens(text: &str) -> Option<Board> {
    if text.len() != CELLS {
        return None;
    }
    let mut board = [0; CELLS];
    for (index, byte) in text.bytes().enumerate() {
        board[index] = match byte {
            b'.' => 0,
            b'0'..=b'9' => byte - b'0',
            _ => return None,
        };
    }
    Some(board)
}

/// Validate a grid and classify its number of solutions using bounded exact search.
pub fn analyze(board: &Board) -> Analysis {
    // Most grids finish in the first probe. Forced placements preserve every
    // completion and make the remaining budget useful on sparse grids.
    match analyze_with_budget(board, EXACT_PROBE_NODES) {
        Analysis::SearchLimit => {
            let reduced = classic_singles(*board, &[DIGITS; CELLS]);
            reduced.map_or(Analysis::Unsolvable, |grid| {
                analyze_with_budget(&grid, SEARCH_LIMIT - EXACT_PROBE_NODES)
            })
        }
        result => result,
    }
}

fn analyze_with_budget(board: &Board, mut budget: u32) -> Analysis {
    let Some(mut units) = Units::from_board(board) else {
        return Analysis::Conflict;
    };
    let mut work = *board;
    match count_solutions(&mut work, &mut units, &mut budget, 2) {
        None => Analysis::SearchLimit,
        Some(0) => Analysis::Unsolvable,
        Some(1) => Analysis::Unique,
        Some(_) => Analysis::Multiple,
    }
}

fn count_solutions(
    board: &mut Board,
    units: &mut Units,
    budget: &mut u32,
    limit: u8,
) -> Option<u8> {
    *budget = budget.checked_sub(1)?;
    let Some((index, mut choices)) = units.next_cell(board) else {
        return Some(1);
    };
    let mut count = 0;
    while choices != 0 && count < limit {
        let offset = choices.trailing_zeros();
        let bit = 1 << offset;
        choices ^= bit;
        board[index] = offset as u8 + 1;
        units.toggle(index, bit);
        let found = count_solutions(board, units, budget, limit - count);
        units.toggle(index, bit);
        board[index] = 0;
        count += found?;
    }
    Some(count)
}

/// Find one completion by exact search.
///
/// Returns `None` on conflict, impossibility, or budget exhaustion. Use [`analyze`]
/// for uniqueness and [`solve_logically`] for a human-style deduction trace.
pub fn solve(board: &Board) -> Option<Board> {
    let mut units = Units::from_board(board)?;
    let mut work = *board;
    let mut budget = EXACT_PROBE_NODES;
    if solve_one(&mut work, &mut units, &mut budget) {
        return Some(work);
    }
    if budget != 0 {
        return None;
    }
    work = classic_singles(*board, &[DIGITS; CELLS])?;
    units = Units::from_board(&work)?;
    budget = SEARCH_LIMIT - EXACT_PROBE_NODES;
    solve_one(&mut work, &mut units, &mut budget).then_some(work)
}

fn solve_one(board: &mut Board, units: &mut Units, budget: &mut u32) -> bool {
    let Some(remaining) = budget.checked_sub(1) else {
        return false;
    };
    *budget = remaining;
    let Some((index, mut choices)) = units.next_cell(board) else {
        return true;
    };
    while choices != 0 {
        let offset = choices.trailing_zeros();
        let bit = 1 << offset;
        choices ^= bit;
        board[index] = offset as u8 + 1;
        units.toggle(index, bit);
        if solve_one(board, units, budget) {
            return true;
        }
        units.toggle(index, bit);
    }
    board[index] = 0;
    false
}

/// Compute candidate masks from the placed digits in a conflict-free grid.
///
/// Bit 0 represents digit 1, bit 8 represents digit 9, and filled cells have mask 0.
/// A zero mask in an empty cell indicates that its peers rule out every digit.
pub fn candidates(board: &Board) -> Option<[u16; CELLS]> {
    let units = Units::from_board(board)?;
    Some(std::array::from_fn(|index| {
        if board[index] == 0 {
            units.available(index)
        } else {
            0
        }
    }))
}

// Masks must be zero for filled cells and exclude digits already in each house.
// Choose naked singles first, then hidden singles in house and digit order.
fn next_single(
    masks: &[u16; CELLS],
    houses: impl Iterator<Item = [usize; 9]>,
) -> Option<(usize, u8)> {
    if let Some(cell) = masks.iter().position(|mask| mask.is_power_of_two()) {
        return Some((cell, masks[cell].trailing_zeros() as u8 + 1));
    }
    for house in houses {
        let mut seen = 0;
        let mut repeated = 0;
        for cell in house {
            repeated |= seen & masks[cell];
            seen |= masks[cell];
        }
        let singles = seen & !repeated;
        if singles != 0 {
            let offset = singles.trailing_zeros();
            let cell = house
                .into_iter()
                .find(|&cell| masks[cell] & (1 << offset) != 0)?;
            return Some((cell, offset as u8 + 1));
        }
    }
    None
}

fn classic_singles(mut board: Board, allowed: &[u16; CELLS]) -> Option<Board> {
    let mut units = Units::from_board(&board)?;
    loop {
        let masks = std::array::from_fn(|cell| {
            if board[cell] == 0 {
                units.available(cell) & allowed[cell]
            } else {
                0
            }
        });
        let Some((cell, digit)) = next_single(&masks, House::all().map(House::cells)) else {
            return Some(board);
        };
        board[cell] = digit;
        units.toggle(cell, 1 << (digit - 1));
    }
}

struct Random(u32);

impl Random {
    fn from_seed(seed: u32) -> Self {
        Self(if seed == 0 { 0x9e3779b9 } else { seed })
    }

    fn next(&mut self) -> u32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        self.0
    }

    fn index(&mut self, bound: usize) -> usize {
        self.next() as usize % bound
    }

    fn shuffle<T>(&mut self, values: &mut [T]) {
        for last in (1..values.len()).rev() {
            values.swap(last, self.index(last + 1));
        }
    }
}

#[cfg(any(feature = "generation", test))]
fn fill(board: &mut Board, units: &mut Units, random: &mut Random) -> bool {
    let Some((index, choices)) = units.next_cell(board) else {
        return true;
    };
    let mut order = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    random.shuffle(&mut order);
    for digit in order {
        let bit = 1 << (digit - 1);
        if choices & bit == 0 {
            continue;
        }
        board[index] = digit;
        units.toggle(index, bit);
        if fill(board, units, random) {
            return true;
        }
        units.toggle(index, bit);
    }
    board[index] = 0;
    false
}

/// Generate a uniquely solvable puzzle from a seed, aiming for 34 clues.
#[cfg(any(feature = "generation", test))]
pub fn generate(seed: u32) -> Board {
    let mut random = Random::from_seed(seed);
    let mut board = filled_board(&mut random);
    carve(&mut board, &mut random, |_, clues| clues == DEFAULT_CLUES);
    board
}

/// A difficulty or exclusive-opening target for [`generate_targeted`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg(any(feature = "generation", test))]
pub enum GenerationTarget<'a> {
    /// A complete solve at the specified difficulty using the supplied order.
    Difficulty {
        /// Required difficulty of the full solve.
        level: Difficulty,
        /// Ordered set of techniques available to the solver.
        technique_order: &'a [Technique],
    },
    /// The only technique that can produce a deduction from the givens.
    Opening(Technique),
}

#[cfg(any(feature = "generation", test))]
impl GenerationTarget<'_> {
    fn match_path(self, board: &Board) -> Option<generation::MatchedPath> {
        match self {
            Self::Difficulty {
                level,
                technique_order,
            } => logical::match_generation_path(
                board,
                technique_order,
                Some(&GenerationRating::Difficulty(level)),
                None,
            ),
            Self::Opening(technique) => logical::has_exclusive_opener(board, technique)
                .then_some(generation::MatchedPath::Unrated),
        }
    }
}

/// Why a generation request was rejected or failed to produce a match.
#[cfg(any(feature = "generation", test))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GenerationError {
    /// A clue count lies outside 17–81 or the clue range is reversed.
    InvalidClueCount,
    /// The score range is reversed.
    InvalidScoreRange,
    /// The engine identified a conflict between the requested targets.
    IncompatibleTargets(GenerationConflict),
    /// The search ended before it found a match.
    SearchLimit,
}

/// Generate a uniquely solvable puzzle matching the target.
/// Each attempt starts with a new completed grid and checks its successive clue removals.
#[cfg(any(feature = "generation", test))]
pub fn generate_targeted(
    seed: u32,
    target: GenerationTarget<'_>,
    max_attempts: u32,
) -> Result<Board, GenerationError> {
    start_targeted(seed, target, max_attempts)?.finish()
}

#[cfg(any(feature = "generation", test))]
fn filled_board(random: &mut Random) -> Board {
    let mut board = [0; CELLS];
    assert!(fill(&mut board, &mut Units::default(), random));
    board
}

#[cfg(any(feature = "generation", test))]
fn carve(
    board: &mut Board,
    random: &mut Random,
    mut matches: impl FnMut(&Board, usize) -> bool,
) -> bool {
    let mut order = std::array::from_fn::<_, CELLS, _>(|index| index);
    random.shuffle(&mut order);
    let mut clues = CELLS;
    for index in order {
        let previous = std::mem::take(&mut board[index]);
        if analyze(board) == Analysis::Unique {
            clues -= 1;
            if matches(board, clues) {
                return true;
            }
        } else {
            board[index] = previous;
        }
    }
    false
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use std::cell::Cell;

    use super::*;

    // JS views these fixed-size buffers between synchronous calls on one worker.
    thread_local! {
        static BOARD: Cell<Board> = const { Cell::new([0; CELLS]) };
        static NOTES: Cell<[u16; CELLS]> = const { Cell::new([0; CELLS]) };
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn board_buffer() -> *mut u8 {
        BOARD.with(|board| board.as_ptr().cast())
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn notes_buffer() -> *mut u16 {
        NOTES.with(|notes| notes.as_ptr().cast())
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn analyze_board() -> u32 {
        BOARD.with(|board| analyze(&board.get()) as u32)
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn fill_notes() -> u32 {
        let Some(masks) = BOARD.with(|board| candidates(&board.get())) else {
            return 0;
        };
        NOTES.with(|notes| notes.set(masks));
        1
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn solve_board() -> u32 {
        let Some(solution) = BOARD.with(|board| solve(&board.get())) else {
            return 0;
        };
        BOARD.with(|board| board.set(solution));
        1
    }

    #[cfg(feature = "generation")]
    #[unsafe(no_mangle)]
    pub extern "C" fn generate_board(seed: u32) {
        BOARD.with(|board| board.set(generate(seed)));
    }
}

#[cfg(all(target_arch = "wasm32", feature = "wasm-api"))]
mod wasm_protocol {
    use std::cell::RefCell;

    thread_local! {
        static REQUEST: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
        static RESPONSE: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    }

    // The worker writes the request buffer before the call and reads the response after it.
    #[unsafe(no_mangle)]
    pub extern "C" fn request_buffer(length: usize) -> *mut u8 {
        REQUEST.with(|request| {
            let mut request = request.borrow_mut();
            request.resize(length, 0);
            request.as_mut_ptr()
        })
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn run_request() -> usize {
        let response = REQUEST.with(|request| super::protocol::process(&request.borrow()));
        let length = response.len();
        RESPONSE.with(|buffer| buffer.replace(response));
        length
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn response_buffer() -> *const u8 {
        RESPONSE.with(|response| response.borrow().as_ptr())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WARMUP: &str =
        "530070000600195000098000060800060003400803001700020006060000280000419005000080079";

    #[test]
    fn checks_solution_count_and_conflicts() {
        let mut board = parse_givens(WARMUP).unwrap();
        assert_eq!(analyze(&board), Analysis::Unique);
        board[2] = 1;
        assert_eq!(analyze(&board), Analysis::Unsolvable);
        board[2] = 3;
        assert_eq!(analyze(&board), Analysis::Conflict);
        assert_eq!(analyze(&[0; CELLS]), Analysis::Multiple);
    }

    #[test]
    fn exact_search_requires_enough_budget_to_prove_uniqueness() {
        let mut board = solve(&parse_givens(WARMUP).unwrap()).unwrap();
        board[0] = 0;
        assert_eq!(analyze_with_budget(&board, 1), Analysis::SearchLimit);
        assert_eq!(analyze_with_budget(&board, 2), Analysis::Unique);
    }

    #[test]
    fn validation_resolves_sparse_puzzles_with_forced_singles() {
        let board = parse_givens(
            "345000000000200010000000000020100000000004500600000007800750000000060040000000300",
        )
        .unwrap();
        assert_eq!(analyze(&board), Analysis::Unique);
        let answer = solve(&board).unwrap();
        assert!(!answer.contains(&0));
        assert_eq!(analyze(&answer), Analysis::Unique);
    }

    #[test]
    fn returns_legal_candidates_only_for_empty_cells() {
        let board = parse_givens(WARMUP).unwrap();
        let masks = candidates(&board).unwrap();
        assert_eq!(masks[0], 0);
        assert_eq!(masks[2], 0b1011);
        assert_eq!(masks[40], 1 << 4);
    }

    #[test]
    fn solves_a_valid_puzzle() {
        let board = parse_givens(WARMUP).unwrap();
        let solution = solve(&board).unwrap();
        assert_eq!(analyze(&solution), Analysis::Unique);
        assert!(!solution.contains(&0));
        assert!(
            board
                .iter()
                .zip(solution)
                .all(|(&given, solved)| given == 0 || given == solved)
        );
    }

    #[test]
    fn generator_produces_distinct_unique_puzzles() {
        for seed in [0, 1, 42, u32::MAX] {
            let board = generate(seed);
            assert_eq!(analyze(&board), Analysis::Unique);
            assert!((34..=40).contains(&board.iter().filter(|&&digit| digit != 0).count()));
        }
        assert_ne!(generate(1), generate(42));
    }

    #[test]
    fn targeted_generation_checks_the_rating_under_the_requested_order() {
        for level in [Difficulty::Beginner, Difficulty::Easy, Difficulty::Medium] {
            let order = level.technique_order();
            let target = GenerationTarget::Difficulty {
                level,
                technique_order: &order,
            };
            let board = generate_targeted(42, target, 512).unwrap();
            assert_eq!(analyze(&board), Analysis::Unique);
            assert!(board.iter().filter(|&&digit| digit != 0).count() <= 40);
            assert_eq!(
                solve_logically(&board, &order).unwrap().status,
                SolveStatus::Solved(level)
            );
            let lower: Vec<_> = order
                .iter()
                .copied()
                .filter(|t| t.difficulty() < level)
                .collect();
            assert_eq!(
                solve_logically(&board, &lower).unwrap().status,
                SolveStatus::Stalled
            );
        }
        let stalled = GenerationTarget::Difficulty {
            level: Difficulty::Easy,
            technique_order: &[],
        };
        assert_eq!(
            generate_targeted(42, stalled, 1),
            Err(GenerationError::IncompatibleTargets(
                GenerationConflict::EmptySolverProfile
            ))
        );
    }

    #[test]
    fn targeted_generation_rejects_a_competing_opening_proof() {
        let target = GenerationTarget::Opening(Technique::HiddenSingle);
        // The previously exclusive board now also has forcing proofs.
        let board = parse_givens(
            "020900000490000830008000005000003070080020400370410009006085000050000100000360000",
        )
        .unwrap();
        let openers = opening_techniques(&board).unwrap();
        for technique in [
            Technique::HiddenSingle,
            Technique::ForcingChain,
            Technique::ForcingNet,
        ] {
            assert!(openers.contains(&technique));
        }
        assert!(target.match_path(&board).is_none());
        assert_eq!(
            generate_targeted(795_642_738, target, 1),
            Err(GenerationError::SearchLimit)
        );
    }
}
