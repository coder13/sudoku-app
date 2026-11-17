use std::collections::BTreeMap;

use super::hints::{Deduction, DeductionSearch, checked_position};
use super::position::Position;
use super::{
    Analysis, Board, GenerationRating, Hint, HintError, PositionSnapshot, Technique,
    TechniqueTargetMode,
};

#[path = "logical/paths.rs"]
mod paths;
pub use paths::{
    AlternatePath, AlternatePathStatus, MoveAvailability, PathComparison, compare_paths,
    search_alternate_path,
};
mod rank_fallback;
mod quality;
pub use rank_fallback::{
    RankFallbackOptions, RankSolve, RankSolveReplay, RankSolveSearch, RankSolveStatus,
    RankSolveStep, solve_position_with_rank,
};

/// Version of the scoring rules recorded in ratings and exported traces.
pub const SCORING_VERSION: u32 = 11;
const QUICK_VERIFICATION_NODES: u32 = 4096;

/// Ordered difficulty tiers for techniques and complete solve paths.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "kebab-case")
)]
pub enum Difficulty {
    /// Full houses and hidden singles in boxes.
    Beginner,
    /// All singles, including candidate-based and line singles.
    Easy,
    /// Local candidate eliminations and small subsets.
    Medium,
    /// Fixed single-digit patterns across houses.
    Tricky,
    /// Wings and advanced fixed patterns.
    Hard,
    /// Restricted chains and coloring.
    VeryHard,
    /// Ordinary alternating inference chains and loops.
    #[cfg_attr(feature = "wasm-api", serde(alias = "unfair"))]
    Expert,
    /// Grouped inference and almost locked sets.
    Master,
    /// Multiple forcing proofs and specialist patterns.
    Extreme,
    /// No promise of a practical human solve path.
    Impossible,
}

impl Difficulty {
    /// The ten current levels in increasing order. Points never select a level.
    pub const ALL: [Self; 10] = [
        Self::Beginner, Self::Easy, Self::Medium, Self::Tricky, Self::Hard,
        Self::VeryHard, Self::Expert, Self::Master, Self::Extreme, Self::Impossible,
    ];

    /// Canonical techniques allowed at this level, from easiest to hardest.
    pub fn technique_order(self) -> Vec<Technique> {
        Technique::DIFFICULTY_ORDER
            .iter()
            .copied()
            .filter(|t| t.difficulty() <= self)
            .collect()
    }
}

/// Point total and technique usage for a logical path.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct SolveScore {
    /// Sum of the costs of all applied deductions.
    pub points: u32,
    /// Hardest applied technique by tier, then cost, then catalog order.
    pub hardest: Option<Technique>,
    /// Number of applied deductions per technique.
    pub counts: BTreeMap<Technique, u32>,
}

#[derive(Clone, Copy, Debug, Default)]
struct Tally {
    points: u32,
    hardest: Option<Technique>,
}

impl Tally {
    fn record(&mut self, technique: Technique) {
        self.points += u32::from(technique.cost());
        let rank = |technique: Technique| (technique.difficulty(), technique.cost(), technique);
        if self
            .hardest
            .is_none_or(|current| rank(technique) > rank(current))
        {
            self.hardest = Some(technique);
        }
    }

    fn difficulty(&self) -> Difficulty {
        self.hardest.map_or(Difficulty::Beginner, Technique::difficulty)
    }
}

/// Whether the selected logical path completed the puzzle.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum SolveStatus {
    /// Completed grid with a difficulty derived from the techniques used.
    Solved(Difficulty),
    /// The profile ran out of productive deductions on an unfinished grid.
    Stalled,
}

/// A versioned score and status for one ordered logical path.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct PuzzleRating {
    /// The score is a partial subtotal when the status is [`SolveStatus::Stalled`].
    pub score: SolveScore,
    /// Result of following this path.
    pub status: SolveStatus,
    /// Solver order used for the rating.
    pub technique_order: Vec<Technique>,
    /// Scoring rules used for the rating.
    pub scoring_version: u32,
}

/// An ordered proof trace plus the last grid and its versioned score.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LogicalSolve {
    start: PositionSnapshot,
    /// Grid reached after applying every recorded deduction.
    pub board: Board,
    /// Deductions in application order, with their proofs and actions.
    pub steps: Vec<Hint>,
    /// The score is a partial subtotal when the status is `Stalled`.
    pub score: SolveScore,
    /// Whether this trace reached a complete grid.
    pub status: SolveStatus,
    /// Ordered profile used by the solver or alternate-path search.
    pub technique_order: Vec<Technique>,
    /// Scoring rules used for the trace.
    pub scoring_version: u32,
}

/// A single deduction in context, with its before and after snapshots.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplayedStep<'a> {
    /// Position just before the move.
    pub before: PositionSnapshot,
    /// Proof and actions taken at this step.
    pub deduction: &'a Hint,
    /// Position after all of the move's actions.
    pub after: PositionSnapshot,
}

impl LogicalSolve {
    /// Return the summary rating for this trace, including a partial subtotal if stalled.
    pub fn rating(&self) -> PuzzleRating {
        PuzzleRating {
            score: self.score.clone(),
            status: self.status,
            technique_order: self.technique_order.clone(),
            scoring_version: self.scoring_version,
        }
    }

    /// Replay the recorded deduction at a zero-based index.
    pub fn replay_step(&self, index: usize) -> Option<ReplayedStep<'_>> {
        let deduction = self.steps.get(index)?;
        let before = self.position_before(index);
        let mut after = before.clone();
        after.record_actions(&deduction.actions);
        Some(ReplayedStep {
            before,
            deduction,
            after,
        })
    }

    /// Open the position just before the first use of a technique in this trace.
    pub fn practice_position(&self, technique: Technique) -> Option<PositionSnapshot> {
        let index = self
            .steps
            .iter()
            .position(|step| step.technique == technique)?;
        Some(self.position_before(index))
    }

    fn position_before(&self, index: usize) -> PositionSnapshot {
        let mut position = self.start.clone();
        for step in &self.steps[..index] {
            position.record_actions(&step.actions);
        }
        position
    }

    /// Yield the starting position and the position after each recorded deduction.
    pub fn positions(&self) -> impl Iterator<Item = PositionSnapshot> + '_ {
        let mut position = self.start.clone();
        std::iter::once(self.start.clone()).chain(self.steps.iter().map(move |step| {
            position.record_actions(&step.actions);
            position.clone()
        }))
    }
}

/// Solve and score a puzzle using only the techniques in the specified order.
/// `Technique::DEFAULT_ORDER` is the default order. An empty slice enables no techniques.
/// Errors report the result of the uniqueness check.
pub fn solve_logically(
    board: &Board,
    technique_order: &[Technique],
) -> Result<LogicalSolve, Analysis> {
    traced_solve(
        PositionSnapshot::new(*board),
        Position::new(board)?,
        technique_order,
    )
}

/// Continue a logical solve from the entries and established removals in a snapshot.
pub fn solve_position(
    snapshot: &PositionSnapshot,
    technique_order: &[Technique],
) -> Result<LogicalSolve, HintError> {
    traced_solve(
        snapshot.clone(),
        restore_position(snapshot)?,
        technique_order,
    )
    .map_err(HintError::Puzzle)
}

fn restore_position(snapshot: &PositionSnapshot) -> Result<Position, HintError> {
    let board = snapshot.values().map_err(HintError::Puzzle)?;
    match snapshot.removals() {
        Some(removals) => checked_position(&board, Some(removals)),
        None => Position::new(&board).map_err(HintError::Puzzle),
    }
}

fn traced_solve(
    start: PositionSnapshot,
    position: Position,
    technique_order: &[Technique],
) -> Result<LogicalSolve, Analysis> {
    let mut steps = Vec::new();
    let (board, rating) =
        summarize_path(position, technique_order, |step| steps.push(step.into()))?;
    Ok(LogicalSolve {
        start,
        board,
        steps,
        score: rating.score,
        status: rating.status,
        technique_order: rating.technique_order,
        scoring_version: rating.scoring_version,
    })
}

/// Score a puzzle with the same ordered deductions as `solve_logically`.
/// The result includes technique counts and omits the individual deductions.
pub fn rate_puzzle(board: &Board, technique_order: &[Technique]) -> Result<PuzzleRating, Analysis> {
    summarize_path(Position::new(board)?, technique_order, |_| {}).map(|(_, rating)| rating)
}

pub(crate) fn verified_position(board: &Board) -> Result<Position, Analysis> {
    let order = Technique::DEFAULT_ORDER;
    let inexpensive = order
        .iter()
        .position(|technique| {
            technique.requires_unique_solution() || technique.difficulty() > Difficulty::Hard
        })
        .unwrap_or(order.len());
    // Most puzzles are cheap to finish with the first techniques. A small exact
    // probe can verify a stalled grid before searching the more expensive patterns.
    let mut position = follow_path(Position::new(board)?, &order[..inexpensive], |_| true)?;
    if position.try_verify_unique(QUICK_VERIFICATION_NODES)? {
        return Ok(position);
    }
    verified_path(position, order, |_| {})
}

fn verified_path(
    position: Position,
    technique_order: &[Technique],
    mut on_step: impl FnMut(Deduction),
) -> Result<Position, Analysis> {
    let mut position = follow_path(position, technique_order, |step| {
        on_step(step);
        true
    })?;
    position.verify_unique()?;
    Ok(position)
}

fn summarize_path(
    position: Position,
    technique_order: &[Technique],
    mut record_step: impl FnMut(Deduction),
) -> Result<(Board, PuzzleRating), Analysis> {
    let mut tally = RatingTally::default();
    let position = verified_path(position, technique_order, |step| {
        tally.record(step.technique);
        record_step(step);
    })?;
    Ok((
        *position.board(),
        tally.finish(position.is_solved(), technique_order),
    ))
}

#[derive(Default)]
struct RatingTally {
    total: Tally,
    counts: BTreeMap<Technique, u32>,
}

impl RatingTally {
    fn record(&mut self, technique: Technique) {
        self.total.record(technique);
        *self.counts.entry(technique).or_default() += 1;
    }

    fn finish(self, solved: bool, technique_order: &[Technique]) -> PuzzleRating {
        PuzzleRating {
            status: if solved {
                SolveStatus::Solved(self.total.difficulty())
            } else {
                SolveStatus::Stalled
            },
            score: SolveScore {
                points: self.total.points,
                hardest: self.total.hardest,
                counts: self.counts,
            },
            technique_order: technique_order.to_vec(),
            scoring_version: SCORING_VERSION,
        }
    }
}

pub(crate) fn matches_generation_path(
    board: &Board,
    technique_order: &[Technique],
    rating: Option<&GenerationRating>,
    technique: Option<(Technique, TechniqueTargetMode)>,
) -> bool {
    if matches!(rating, Some(GenerationRating::Difficulty(_)))
        && board.iter().filter(|&&digit| digit != 0).count() > 40
    {
        return false;
    }
    let ordered;
    let technique_order = if let Some(GenerationRating::Difficulty(level)) = rating {
        ordered = level.technique_order().into_iter()
            .filter(|t| technique_order.contains(t)).collect::<Vec<_>>();
        ordered.as_slice()
    } else {
        technique_order
    };
    let mut quality = quality::GenerationQuality::default();
    let mut pending = match technique {
        Some((opening, TechniqueTargetMode::ExclusiveOpening)) => {
            if !has_exclusive_opener(board, opening) {
                return false;
            }
            None
        }
        path_target => path_target,
    };
    if rating.is_none() && pending.is_none() {
        return true;
    }
    // Match the public solver's uniqueness checks and deduction order on sparse boards.
    let Ok(position) = Position::new(board) else {
        return false;
    };
    let mut total = Tally::default();
    let Ok(position) = follow_path(position, technique_order, |step| {
        if let Some((target, mode)) = pending {
            if step.technique == target {
                pending = None;
            } else if mode == TechniqueTargetMode::First {
                return false;
            }
        }
        if rating.is_some() {
            total.record(step.technique);
            quality.record(step.technique);
        }
        match rating {
            Some(GenerationRating::Score(range)) => total.points <= *range.end(),
            Some(GenerationRating::Difficulty(level)) => total.difficulty() <= *level,
            None => pending.is_some(),
        }
    }) else {
        return false;
    };
    let matched = pending.is_none()
        && rating.is_none_or(|target| {
            position.is_solved()
                && match target {
                    GenerationRating::Score(range) => range.contains(&total.points),
                    GenerationRating::Difficulty(level) => total.difficulty() == *level,
                }
        });
    if !matched {
        return false;
    }
    if let Some(GenerationRating::Difficulty(level)) = rating {
        if !quality.accepts(*level) {
            return false;
        }
        // A different deduction order can reveal an easier route. Reject a
        // candidate if any checked lower-tier profile completes it.
        for lower in quality::lower_tier_orders(*level) {
            if lower.is_empty() {
                continue;
            }
            let Ok(result) = follow_path(Position::known_unique(board), &lower, |_| true) else {
                return false;
            };
            if result.is_solved() {
                return false;
            }
        }
    }
    true
}

fn follow_path(
    mut position: Position,
    technique_order: &[Technique],
    mut continue_after_step: impl FnMut(Deduction) -> bool,
) -> Result<Position, Analysis> {
    while !position.is_solved() {
        let search = DeductionSearch::new(position.board(), position.masks());
        let Some(step) = technique_order
            .iter()
            .filter(|&&technique| {
                !position.uniqueness_deferred() || !technique.requires_unique_solution()
            })
            .find_map(|&technique| search.first(technique))
        else {
            break;
        };
        if step.technique.requires_unique_solution() {
            match position.verify_unique() {
                Ok(()) => {}
                // An independent deduction may make the exact check cheaper after a placement.
                Err(Analysis::SearchLimit) => continue,
                Err(error) => return Err(error),
            }
        }
        position.apply(step.actions());
        if !continue_after_step(step) {
            break;
        }
    }
    position.check_consistency()?;
    Ok(position)
}

/// List the techniques with productive deductions from the untouched givens.
/// Each technique is checked independently, including alternative proofs of the same move.
pub fn opening_techniques(board: &Board) -> Result<Vec<Technique>, Analysis> {
    verified_position(board)?;
    let position = Position::known_unique(board);
    Ok(available_openers(&position).collect())
}

pub(crate) fn has_exclusive_opener(board: &Board, opening: Technique) -> bool {
    let position = Position::known_unique(board);
    let mut available = available_openers(&position);
    available.next() == Some(opening) && available.next().is_none()
}

fn available_openers(position: &Position) -> impl Iterator<Item = Technique> + '_ {
    let search = DeductionSearch::new(position.board(), position.masks());
    Technique::ALL
        .into_iter()
        .filter(move |&technique| search.first(technique).is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CELLS, parse_givens, solve};
    use std::collections::BTreeSet;

    const WARMUP: &str =
        "530070000600195000098000060800060003400803001700020006060000280000419005000080079";

    #[test]
    fn a_uniqueness_search_limit_does_not_stop_an_independent_solve() {
        let board = parse_givens(
            "345000000000200010000000000020100000000004500600000007800750000000060040000000300",
        )
        .unwrap();
        let mut position = Position::new(&board).unwrap();
        assert_eq!(
            position.try_verify_unique(QUICK_VERIFICATION_NODES),
            Ok(false)
        );
        assert!(!position.uniqueness_deferred());
        assert_eq!(position.verify_unique(), Err(Analysis::SearchLimit));
        assert!(position.uniqueness_deferred());
        let solved = verified_path(position, Technique::DEFAULT_ORDER, |step| {
            assert!(!step.technique.requires_unique_solution());
        })
        .unwrap();
        assert!(solved.is_solved());
        assert!(!solved.uniqueness_deferred());
    }

    #[test]
    fn follows_the_chosen_order_and_scores_complete_paths() {
        let board = parse_givens(WARMUP).unwrap();
        let normal = solve_logically(&board, &Technique::ALL).unwrap();
        assert_eq!(normal.board, solve(&board).unwrap());
        assert_eq!(normal.steps.len(), 51);
        assert_eq!(normal.score.points, normal.score.counts.iter().map(|(t, count)| u32::from(t.cost()) * count).sum::<u32>());
        assert_eq!(normal.status, SolveStatus::Solved(Difficulty::Beginner));
        assert_eq!(normal.technique_order, Technique::ALL);
        assert_eq!(normal.scoring_version, SCORING_VERSION);

        let custom_order = [Technique::HiddenSingle, Technique::NakedSingle];
        let custom = solve_logically(&board, &custom_order).unwrap();
        assert_eq!(custom.board, normal.board);
        assert_eq!(custom.steps[0].technique, Technique::HiddenSingle);
        assert!(
            custom
                .steps
                .iter()
                .all(|step| custom_order.contains(&step.technique))
        );
        assert!(custom.score.points > normal.score.points);
        assert_eq!(custom.score.counts.values().sum::<u32>(), 51);
        let rating = rate_puzzle(&board, &custom_order).unwrap();
        assert_eq!(rating.score, custom.score);
        assert_eq!(rating.status, custom.status);
        assert_eq!(rating.technique_order, custom.technique_order);
        assert_eq!(rating.scoring_version, custom.scoring_version);
        assert_eq!(solve_logically(&board, &custom_order), Ok(custom));
    }

    #[test]
    fn reports_partial_paths_and_keeps_candidate_removals_between_steps() {
        let board = parse_givens(Technique::XWing.practice_example().givens).unwrap();
        let empty = solve_logically(&board, &[]).unwrap();
        assert_eq!(empty.board, board);
        assert_eq!(empty.status, SolveStatus::Stalled);
        assert!(empty.steps.is_empty());
        assert_eq!(empty.score, SolveScore::default());

        let result = solve_logically(&board, &[Technique::XWing]).unwrap();
        assert_eq!(result.status, SolveStatus::Stalled);
        assert_eq!(result.board, board);
        assert!(result.steps[0].actions.len() > 1);
        let mut removals = BTreeSet::new();
        for step in &result.steps {
            assert_eq!(step.technique, Technique::XWing);
            assert!(step.actions.iter().all(|&action| removals.insert(action)));
        }
        assert_eq!(result.score.points, result.steps.len() as u32 * 140);
        let rating = rate_puzzle(&board, &[Technique::XWing]).unwrap();
        assert_eq!(rating.score, result.score);
        assert_eq!(rating.status, SolveStatus::Stalled);
    }

    #[test]
    fn repetition_never_promotes_the_technique_tier() {
        for technique in [Technique::HiddenSingleBox, Technique::NakedPair, Technique::XYWing, Technique::Aic] {
            let mut tally = Tally::default();
            for _ in 0..100 { tally.record(technique); }
            assert!(tally.points > 1800 || technique == Technique::HiddenSingleBox);
            assert_eq!(tally.difficulty(), technique.difficulty());
        }
        assert_eq!(Difficulty::ALL.len(), 10);
        assert!(Technique::DIFFICULTY_ORDER.windows(2).all(|pair| pair[0].difficulty() <= pair[1].difficulty()));
        assert_eq!(Technique::DIFFICULTY_ORDER.len(), Technique::ALL.len());
    }

    #[test]
    fn a_high_point_total_does_not_make_a_wing_puzzle_extreme() {
        let board = parse_givens("100070890000000010203080000020490000070300050000060000080500900000000103007100060").unwrap();
        let rating = rate_puzzle(&board, &Difficulty::Hard.technique_order()).unwrap();
        assert_eq!(rating.status, SolveStatus::Solved(Difficulty::Hard));
        assert_eq!(rate_puzzle(&board, &Difficulty::Tricky.technique_order()).unwrap().status, SolveStatus::Stalled);
        assert!(!matches_generation_path(&board, Technique::DEFAULT_ORDER,
            Some(&GenerationRating::Difficulty(Difficulty::Extreme)), None));
    }

    #[test]
    fn distinguishes_invalid_puzzles_and_competing_opening_techniques() {
        let mut board = parse_givens(WARMUP).unwrap();
        board[2] = 1;
        assert_eq!(
            solve_logically(&board, &Technique::ALL),
            Err(Analysis::Unsolvable)
        );
        assert_eq!(
            rate_puzzle(&board, &Technique::ALL),
            Err(Analysis::Unsolvable)
        );
        board[2] = 3;
        assert_eq!(
            solve_logically(&board, &Technique::ALL),
            Err(Analysis::Conflict)
        );
        assert_eq!(
            rate_puzzle(&board, &Technique::ALL),
            Err(Analysis::Conflict)
        );
        assert_eq!(
            solve_logically(&[0; CELLS], &Technique::ALL),
            Err(Analysis::Multiple)
        );
        assert_eq!(
            rate_puzzle(&[0; CELLS], &Technique::ALL),
            Err(Analysis::Multiple)
        );

        let mut board = solve(&parse_givens(WARMUP).unwrap()).unwrap();
        board[0] = 0;
        assert_eq!(
            opening_techniques(&board),
            Ok(vec![
                Technique::FullHouse,
                Technique::HiddenSingleBox,
                Technique::NakedSingle,
                Technique::HiddenSingle,
                Technique::PatternOverlay,
            ])
        );
        assert!(!has_exclusive_opener(&board, Technique::FullHouse));
    }
}
