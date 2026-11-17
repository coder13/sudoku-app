use std::{borrow::Cow, collections::HashMap, ops::RangeInclusive};

use super::{
    Board, CELLS, DEFAULT_CLUES, Difficulty, GenerationError, GenerationTarget, PuzzleRating,
    Random, Technique, carve, filled_board, logical, rate_puzzle,
};

mod canonical;
mod search;
mod templates;
pub use canonical::canonical_puzzle;
use crate::permutation::puzzle_permutation;
pub use search::{GenerationSearch, GenerationStep};
pub use templates::{VerifiedTemplate, builtin_templates, impossible_templates};

const MIN_CLUES: usize = 17;

/// Check the normal-play quality floor and all configured lower-tier orders.
/// This does not prove that no unimplemented or alternate human route exists.
pub fn accepts_difficulty(board: &Board, level: Difficulty) -> bool {
    logical::matches_generation_path(
        board, &level.technique_order(), Some(&GenerationRating::Difficulty(level)), None,
    )
}

/// Criteria for an exact clue count and optional point range.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GenerationConstraints<'a> {
    /// Number of clues in the result, between 17 and 81 inclusive.
    pub clues: usize,
    /// Inclusive point range for a complete solve. `None` accepts any unique puzzle.
    pub score: Option<RangeInclusive<u32>>,
    /// Solver order used to evaluate the point range.
    pub technique_order: &'a [Technique],
}

/// Rating of the full solve required for a generation match.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GenerationRating {
    /// Match the final difficulty exactly.
    Difficulty(Difficulty),
    /// Match any final score in the inclusive range.
    Score(RangeInclusive<u32>),
}

/// Where the requested technique must appear for a puzzle to match.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize),
    serde(rename_all = "kebab-case")
)]
pub enum TechniqueTargetMode {
    /// The technique occurs anywhere in the configured solve path.
    Anywhere,
    /// The technique makes the first move in the configured solve path.
    First,
    /// The technique is the only one that can make a move from the givens.
    ExclusiveOpening,
}

/// A combination of targets that cannot be satisfied by a puzzle.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GenerationConflict {
    /// Every deduction of the target opening also has a known competing technique.
    CompetingOpening {
        /// Requested opening technique.
        target: Technique,
        /// Technique that necessarily competes with the target.
        competitor: Technique,
    },
    /// The solver order omits the requested technique.
    DisabledTechnique(Technique),
    /// A fully given grid has no move for the requested technique.
    TechniqueOnFilledGrid,
    /// The score ceiling or difficulty tier cannot include the requested technique.
    RatingBelowTechnique(Technique),
    /// The rating target requires a solve, but the profile enables no techniques.
    EmptySolverProfile,
}

/// Targets shared by the fresh-grid and template search APIs.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GenerationCriteria<'a> {
    /// Inclusive clue range, with both bounds between 17 and 81.
    pub clues: RangeInclusive<usize>,
    /// A rating target requires a complete solve using the requested technique order.
    pub rating: Option<GenerationRating>,
    /// The technique to match according to the requested mode.
    pub technique: Option<Technique>,
    /// Solver priority order used to evaluate the requested path.
    pub technique_order: &'a [Technique],
}

impl GenerationCriteria<'_> {
    fn validate(&self, mode: TechniqueTargetMode) -> Result<(), GenerationError> {
        use GenerationConflict::*;
        use GenerationError::IncompatibleTargets;

        let (&min, &max) = (self.clues.start(), self.clues.end());
        if min < MIN_CLUES || max > CELLS || self.clues.is_empty() {
            return Err(GenerationError::InvalidClueCount);
        }
        if matches!(&self.rating, Some(GenerationRating::Score(range)) if range.is_empty()) {
            return Err(GenerationError::InvalidScoreRange);
        }
        if let Some(technique) = self.technique {
            let exclusive = mode == TechniqueTargetMode::ExclusiveOpening;
            if exclusive {
                validate_exclusive_opening(technique)?;
            }
            if min == CELLS {
                return Err(IncompatibleTargets(TechniqueOnFilledGrid));
            }
            if (!exclusive || self.rating.is_some()) && !self.technique_order.contains(&technique) {
                return Err(IncompatibleTargets(DisabledTechnique(technique)));
            }
            let rating_too_low = match &self.rating {
                Some(GenerationRating::Score(range)) => *range.end() < u32::from(technique.cost()),
                Some(GenerationRating::Difficulty(level)) => *level < technique.difficulty(),
                None => false,
            };
            if rating_too_low {
                return Err(IncompatibleTargets(RatingBelowTechnique(technique)));
            }
        }
        if max < CELLS && self.rating.is_some() && self.technique_order.is_empty() {
            return Err(IncompatibleTargets(EmptySolverProfile));
        }
        Ok(())
    }
}

struct MatchingPlan {
    clues: RangeInclusive<usize>,
    rating: Option<GenerationRating>,
    technique: Option<(Technique, TechniqueTargetMode)>,
    technique_order: Vec<Technique>,
}

impl MatchingPlan {
    fn new(
        criteria: &GenerationCriteria<'_>,
        mode: TechniqueTargetMode,
    ) -> Result<Self, GenerationError> {
        criteria.validate(mode)?;
        Ok(Self {
            clues: criteria.clues.clone(),
            rating: criteria.rating.clone(),
            technique: criteria.technique.map(|technique| (technique, mode)),
            technique_order: match &criteria.rating {
                Some(GenerationRating::Difficulty(level)) => level.technique_order().into_iter()
                    .filter(|technique| criteria.technique_order.contains(technique)).collect(),
                _ => criteria.technique_order.to_vec(),
            },
        })
    }

    fn matches(&self, board: &Board) -> bool {
        logical::matches_generation_path(
            board,
            &self.technique_order,
            self.rating.as_ref(),
            self.technique,
        )
    }
}

pub(crate) fn validate_exclusive_opening(technique: Technique) -> Result<(), GenerationError> {
    // Eight placed digits in a house leave just one legal digit for its empty cell.
    if technique == Technique::FullHouse {
        return Err(GenerationError::IncompatibleTargets(
            GenerationConflict::CompetingOpening {
                target: technique,
                competitor: Technique::NakedSingle,
            },
        ));
    }
    Ok(())
}

/// Generate a unique puzzle with exactly the requested number of clues.
///
/// With no templates, each attempt carves a fresh solution to the requested count.
/// Otherwise, each attempt uses a supplied puzzle with at most that many clues. It adds
/// solution digits as needed and applies Sudoku symmetries. Only verified unique templates
/// are used. The result is rated after transformation because the deduction order can change.
pub fn generate_constrained(
    seed: u32,
    constraints: &GenerationConstraints<'_>,
    templates: &[Board],
    max_attempts: u32,
) -> Result<Board, GenerationError> {
    generate_matching(
        seed,
        &GenerationCriteria {
            clues: constraints.clues..=constraints.clues,
            rating: constraints.score.clone().map(GenerationRating::Score),
            technique: None,
            technique_order: constraints.technique_order,
        },
        templates,
        max_attempts,
    )
}

/// Generate a unique puzzle with the target technique anywhere in the configured path.
pub fn generate_matching(
    seed: u32,
    criteria: &GenerationCriteria<'_>,
    templates: &[Board],
    max_attempts: u32,
) -> Result<Board, GenerationError> {
    generate_matching_with_mode(
        seed,
        criteria,
        TechniqueTargetMode::Anywhere,
        templates,
        max_attempts,
    )
}

/// Generate a unique puzzle satisfying all criteria, including the selected technique mode.
pub fn generate_matching_with_mode(
    seed: u32,
    criteria: &GenerationCriteria<'_>,
    mode: TechniqueTargetMode,
    templates: &[Board],
    max_attempts: u32,
) -> Result<Board, GenerationError> {
    start_matching(seed, criteria, mode, Cow::Borrowed(templates), max_attempts)?.finish()
}

/// Start a resumable search using fresh grids or caller-supplied templates.
pub fn start_matching<'a>(
    seed: u32,
    criteria: &GenerationCriteria<'_>,
    mode: TechniqueTargetMode,
    templates: Cow<'a, [Board]>,
    max_attempts: u32,
) -> Result<GenerationSearch<'a, Board>, GenerationError> {
    let plan = MatchingPlan::new(criteria, mode)?;
    let mut random = Random::from_seed(seed);
    if !templates.is_empty() {
        let mut attempts =
            TemplateAttempts::new(TemplateSource::Boards(templates), &plan.clues, &mut random);
        let budget = attempts.budget(max_attempts);
        return Ok(GenerationSearch::new(random, budget, move |random| {
            attempts.draw(random).filter(|board| plan.matches(board))
        }));
    }
    Ok(GenerationSearch::new(random, max_attempts, move |random| {
        let (&min, &max) = (plan.clues.start(), plan.clues.end());
        let mut board = filled_board(random);
        if max == CELLS && plan.matches(&board) {
            return Some(board);
        }
        if min == CELLS {
            return None;
        }
        let mut matched = false;
        carve(&mut board, random, |board, clues| {
            matched = clues <= max && plan.matches(board);
            matched || clues == min
        });
        matched.then_some(board)
    }))
}

/// Start the legacy difficulty or exclusive-opening search at an attempt boundary.
pub fn start_targeted(
    seed: u32,
    target: GenerationTarget<'_>,
    max_attempts: u32,
) -> Result<GenerationSearch<'static, Board>, GenerationError> {
    let random = Random::from_seed(seed);
    match target {
        GenerationTarget::Opening(technique) => {
            validate_exclusive_opening(technique)?;
            Ok(GenerationSearch::new(random, max_attempts, move |random| {
                targeted_attempt(random, GenerationTarget::Opening(technique))
            }))
        }
        GenerationTarget::Difficulty {
            technique_order: [],
            ..
        } => Err(GenerationError::IncompatibleTargets(
            GenerationConflict::EmptySolverProfile,
        )),
        GenerationTarget::Difficulty {
            level,
            technique_order,
        } => {
            let order = technique_order.to_vec();
            Ok(GenerationSearch::new(random, max_attempts, move |random| {
                targeted_attempt(
                    random,
                    GenerationTarget::Difficulty {
                        level,
                        technique_order: &order,
                    },
                )
            }))
        }
    }
}

fn targeted_attempt(random: &mut Random, target: GenerationTarget<'_>) -> Option<Board> {
    let mut board = filled_board(random);
    let mut denser_puzzles = Vec::new();
    if carve(&mut board, random, |board, clues| {
        if matches!(target, GenerationTarget::Difficulty { .. }) && clues > DEFAULT_CLUES {
            denser_puzzles.push(*board);
            return false;
        }
        target.matches(board)
    }) {
        return Some(board);
    }
    denser_puzzles
        .into_iter()
        .rev()
        .find(|board| target.matches(board))
}

/// A matched puzzle and the rating computed after transforming its grid.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GeneratedPuzzle {
    /// Givens of the new puzzle.
    pub board: Board,
    /// Complete or partial rating under the requested solver order.
    pub rating: PuzzleRating,
}

/// Generate from reusable, verified templates and rate the resulting board.
pub fn generate_from_pool(
    seed: u32,
    criteria: &GenerationCriteria<'_>,
    mode: TechniqueTargetMode,
    templates: &[VerifiedTemplate],
    max_attempts: u32,
) -> Result<GeneratedPuzzle, GenerationError> {
    start_from_pool(seed, criteria, mode, templates, max_attempts)?.finish()
}

/// Start a resumable search over verified templates with a rating for any match.
pub fn start_from_pool<'a>(
    seed: u32,
    criteria: &GenerationCriteria<'_>,
    mode: TechniqueTargetMode,
    templates: &'a [VerifiedTemplate],
    max_attempts: u32,
) -> Result<GenerationSearch<'a, GeneratedPuzzle>, GenerationError> {
    let plan = MatchingPlan::new(criteria, mode)?;
    Ok(start_verified_templates(
        seed,
        plan,
        templates,
        max_attempts,
    ))
}

#[cfg(all(
    feature = "generation", feature = "wasm-api",
    any(target_arch = "wasm32", test, feature = "cli")
))]
pub(crate) fn start_builtin_pool(
    seed: u32,
    criteria: &GenerationCriteria<'_>,
    mode: TechniqueTargetMode,
    max_attempts: u32,
) -> Result<GenerationSearch<'static, GeneratedPuzzle>, GenerationError> {
    let plan = MatchingPlan::new(criteria, mode)?;
    let templates = if max_attempts == 0 {
        &[]
    } else {
        builtin_templates()
    };
    Ok(start_verified_templates(
        seed,
        plan,
        templates,
        max_attempts,
    ))
}

fn start_verified_templates(
    seed: u32,
    plan: MatchingPlan,
    templates: &[VerifiedTemplate],
    max_attempts: u32,
) -> GenerationSearch<'_, GeneratedPuzzle> {
    let mut random = Random::from_seed(seed);
    let mut attempts = TemplateAttempts::new(
        TemplateSource::Verified(templates),
        &plan.clues,
        &mut random,
    );
    let budget = attempts.budget(max_attempts);
    GenerationSearch::new(random, budget, move |random| {
        let board = attempts.draw(random).filter(|board| plan.matches(board))?;
        let rating = rate_puzzle(&board, &plan.technique_order).ok()?;
        Some(GeneratedPuzzle { board, rating })
    })
}

enum TemplateSource<'a> {
    Boards(Cow<'a, [Board]>),
    Verified(&'a [VerifiedTemplate]),
}

impl<'a> TemplateSource<'a> {
    fn len(&self) -> usize {
        match self {
            Self::Boards(boards) => boards.len(),
            Self::Verified(templates) => templates.len(),
        }
    }

    fn givens(&self, index: usize) -> &Board {
        match self {
            Self::Boards(boards) => &boards[index],
            Self::Verified(templates) => templates[index].givens(),
        }
    }
}

struct TemplateAttempts<'a> {
    templates: TemplateSource<'a>,
    order: Vec<(usize, usize)>,
    next: usize,
    min: usize,
    max: usize,
    solutions: HashMap<usize, Option<VerifiedTemplate>>,
}

impl<'a> TemplateAttempts<'a> {
    fn new(
        templates: TemplateSource<'a>,
        clues: &RangeInclusive<usize>,
        random: &mut Random,
    ) -> Self {
        let (&min, &max) = (clues.start(), clues.end());
        let mut order: Vec<_> = (0..templates.len())
            .filter_map(|index| {
                let clues = templates
                    .givens(index)
                    .iter()
                    .filter(|&&digit| digit != 0)
                    .count();
                (clues <= max).then_some((index, clues))
            })
            .collect();
        random.shuffle(&mut order);
        Self {
            templates,
            order,
            next: 0,
            min,
            max,
            solutions: HashMap::new(),
        }
    }

    fn budget(&self, max_attempts: u32) -> u32 {
        if self.order.is_empty() {
            0
        } else {
            max_attempts
        }
    }

    fn draw(&mut self, random: &mut Random) -> Option<Board> {
        let &(index, clues) = self.order.get(self.next)?;
        self.next = (self.next + 1) % self.order.len();
        let template = self.templates.givens(index);
        let solution = match &self.templates {
            TemplateSource::Verified(pool) => Some(pool[index].solution()),
            TemplateSource::Boards(_) => self
                .solutions
                .entry(index)
                .or_insert_with(|| VerifiedTemplate::verify(*template).ok())
                .as_ref()
                .map(VerifiedTemplate::solution),
        }?;
        let mut board = *template;
        let floor = self.min.max(clues);
        let target = if floor == self.max {
            floor
        } else {
            floor + random.index(self.max - floor + 1)
        };
        if clues < target {
            let mut blanks: Vec<_> = (0..CELLS).filter(|&cell| board[cell] == 0).collect();
            random.shuffle(&mut blanks);
            for cell in blanks.into_iter().take(target - clues) {
                board[cell] = solution[cell];
            }
        }
        // Adding solution digits and applying Sudoku symmetries preserve uniqueness.
        Some(permute(&board, random))
    }
}

fn permute(board: &Board, random: &mut Random) -> Board {
    let (cells, digits) = puzzle_permutation(random);
    cells.map(|cell| digits[usize::from(board[cell])])
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        Analysis, SolveStatus, analyze, parse_givens, rate_puzzle, solve, solve_logically,
    };

    // The 17-clue example in the HoDoKu command-line reference.
    const SPARSE: &str =
        "000000010400000000020000000000050407008000300001090000300400200050100000000806000";

    #[test]
    fn resumable_search_reports_terminal_counts_and_cancels_at_an_attempt_boundary() {
        let criteria = GenerationCriteria {
            clues: 80..=80,
            rating: Some(GenerationRating::Score(0..=0)),
            technique: None,
            technique_order: &[Technique::NakedSingle],
        };
        let start = |budget| {
            start_matching(
                42,
                &criteria,
                TechniqueTargetMode::Anywhere,
                Cow::Borrowed(&[]),
                budget,
            )
            .unwrap()
        };
        let mut search = start(3);
        assert_eq!(
            search.advance(),
            Some(GenerationStep::Pending { attempts: 1 })
        );
        assert_eq!(
            search.cancel(),
            Some(GenerationStep::Cancelled { attempts: 1 })
        );
        assert_eq!(search.advance(), None);
        assert_eq!(search.cancel(), None);

        let mut search = start(2);
        assert_eq!(
            search.advance(),
            Some(GenerationStep::Pending { attempts: 1 })
        );
        assert_eq!(
            search.advance(),
            Some(GenerationStep::Exhausted { attempts: 2 })
        );
        assert_eq!(search.advance(), None);
        assert_eq!(
            start(0).advance(),
            Some(GenerationStep::Exhausted { attempts: 0 })
        );
    }

    #[test]
    fn advancing_a_template_search_preserves_the_single_call_result() {
        let criteria = GenerationCriteria {
            clues: 20..=20,
            rating: Some(GenerationRating::Difficulty(Difficulty::Extreme)),
            technique: Some(Technique::MultiSectorLockedSets),
            technique_order: Technique::DEFAULT_ORDER,
        };
        let mode = TechniqueTargetMode::Anywhere;
        let pool = builtin_templates();
        let mut search = start_from_pool(42, &criteria, mode, pool, 64).unwrap();
        for number in 1..=64 {
            match search.advance() {
                Some(GenerationStep::Pending { attempts }) => assert_eq!(attempts, number),
                Some(GenerationStep::Matched { attempts, puzzle }) => {
                    assert_eq!(attempts, number);
                    assert_eq!(
                        generate_from_pool(42, &criteria, mode, pool, attempts),
                        Ok(puzzle)
                    );
                    assert_eq!(
                        generate_from_pool(42, &criteria, mode, pool, attempts - 1),
                        Err(GenerationError::SearchLimit)
                    );
                    assert_eq!(search.advance(), None);
                    return;
                }
                result => panic!("expected a verified match, received {result:?}"),
            }
        }
        panic!("the deterministic fixture should match");
    }

    #[test]
    fn the_builtin_pool_reuses_verified_sparse_and_expert_templates() {
        let pool = builtin_templates();
        assert!(std::ptr::eq(pool, builtin_templates()));
        let mut sparse = 0;
        let mut expert = 0;
        let mut canonical = std::collections::BTreeSet::new();
        for template in pool {
            assert!(
                canonical.insert(canonical_puzzle(template.givens())),
                "equivalent template"
            );
            assert_eq!(analyze(template.solution()), Analysis::Unique);
            assert!(
                template
                    .givens()
                    .iter()
                    .zip(template.solution())
                    .all(|(&given, &digit)| given == 0 || given == digit)
            );
            let rating = rate_puzzle(template.givens(), Technique::DEFAULT_ORDER).unwrap();
            assert!(matches!(rating.status, SolveStatus::Solved(_)));
            sparse += usize::from(
                template
                    .givens()
                    .iter()
                    .filter(|&&digit| digit != 0)
                    .count()
                    == 17,
            );
            expert += usize::from(matches!(
                rating.status,
                SolveStatus::Solved(level) if level >= Difficulty::VeryHard
            ));
        }
        assert!(sparse >= 12);
        assert!(expert >= 3);
        assert_eq!(
            VerifiedTemplate::verify([0; CELLS]),
            Err(Analysis::Multiple)
        );
    }

    #[test]
    fn canonical_puzzles_identify_symmetries_and_preserve_digit_relationships() {
        let board = parse_givens(SPARSE).unwrap();
        let canonical = canonical_puzzle(&board);
        for seed in [11, 24, 33, 109] {
            assert_eq!(
                canonical_puzzle(&permute(&board, &mut Random::from_seed(seed))),
                canonical
            );
        }
        let mut same_layout = [0; CELLS];
        same_layout[0] = 6;
        same_layout[40] = 6;
        let repeated = canonical_puzzle(&same_layout);
        same_layout[40] = 9;
        assert_ne!(canonical_puzzle(&same_layout), repeated);
    }

    #[test]
    fn reusable_templates_are_rated_after_the_board_changes() {
        let board = parse_givens(SPARSE).unwrap();
        let mut givens = solve(&board).unwrap();
        givens[0] = 0;
        givens[1] = 0;
        let templates = [VerifiedTemplate::verify(givens).unwrap()];
        let mut criteria = GenerationCriteria {
            clues: 80..=80,
            rating: None,
            technique: None,
            technique_order: &[Technique::HiddenSingle],
        };
        let base = rate_puzzle(&givens, criteria.technique_order).unwrap();
        assert_eq!(base.score.points, 28);
        let mode = TechniqueTargetMode::Anywhere;
        let puzzle = generate_from_pool(42, &criteria, mode, &templates, 1).unwrap();
        assert_eq!(puzzle.board.iter().filter(|&&digit| digit != 0).count(), 80);
        assert_eq!(
            puzzle.rating,
            rate_puzzle(&puzzle.board, criteria.technique_order).unwrap()
        );
        assert_eq!(puzzle.rating.score.points, 14);
        assert_eq!(puzzle.rating.technique_order, criteria.technique_order);

        criteria.rating = Some(GenerationRating::Score(28..=28));
        assert_eq!(
            generate_from_pool(42, &criteria, mode, &templates, 1),
            Err(GenerationError::SearchLimit)
        );
        criteria.rating = Some(GenerationRating::Score(14..=14));
        assert_eq!(
            generate_from_pool(42, &criteria, mode, &templates, 1),
            Ok(puzzle)
        );
    }

    #[test]
    fn fresh_generation_can_match_an_exact_clue_count_and_score() {
        let order: Vec<_> = Technique::ALL.into_iter().filter(|t| *t != Technique::HiddenSingleBox).collect();
        let constraints = GenerationConstraints {
            clues: 34,
            score: Some(188..=188),
            technique_order: &order,
        };
        let board = generate_constrained(42, &constraints, &[], 1).unwrap();
        assert_eq!(board.iter().filter(|&&digit| digit != 0).count(), 34);
        assert_eq!(
            solve_logically(&board, &order)
                .unwrap()
                .score
                .points,
            188
        );
    }

    #[test]
    fn scores_each_eligible_clue_count_and_checks_the_configured_technique() {
        let technique_order = &[Technique::HiddenSingle];
        let mut criteria = GenerationCriteria {
            clues: 79..=80,
            rating: Some(GenerationRating::Score(28..=28)),
            technique: Some(Technique::HiddenSingle),
            technique_order,
        };
        let board = generate_matching(42, &criteria, &[], 1).unwrap();
        // At 80 clues the configured solver would score 14, so keep carving.
        assert_eq!(board.iter().filter(|&&digit| digit != 0).count(), 79);
        let rating = rate_puzzle(&board, technique_order).unwrap();
        assert_eq!(rating.status, SolveStatus::Solved(Difficulty::Easy));
        assert_eq!(rating.score.points, 28);
        assert_eq!(rating.score.counts[&Technique::HiddenSingle], 2);
        assert_eq!(rating.technique_order, technique_order);

        criteria.technique = Some(Technique::NakedSingle);
        assert_eq!(
            generate_matching(42, &criteria, &[], 1),
            Err(GenerationError::IncompatibleTargets(
                GenerationConflict::DisabledTechnique(Technique::NakedSingle),
            ))
        );
        // A Naked Single also applies on the dense grids, but Hidden Single wins every step.
        criteria.technique_order = &[Technique::HiddenSingle, Technique::NakedSingle];
        assert_eq!(
            generate_matching(42, &criteria, &[], 1),
            Err(GenerationError::SearchLimit)
        );
    }

    #[test]
    fn distinguishes_a_later_technique_from_the_first_step() {
        use Technique::{HiddenSingle, LockedPair, NakedSingle};
        use TechniqueTargetMode::{Anywhere, First};
        let template = parse_givens(LockedPair.practice_example().givens).unwrap();
        let clues = template.iter().filter(|&&digit| digit != 0).count();
        let mut criteria = GenerationCriteria {
            clues: clues..=clues,
            rating: None,
            technique: Some(HiddenSingle),
            technique_order: &[LockedPair, NakedSingle, HiddenSingle],
        };
        let board = generate_matching_with_mode(42, &criteria, Anywhere, &[template], 1).unwrap();
        let trace = solve_logically(&board, criteria.technique_order).unwrap();
        assert_eq!(trace.steps[0].technique, LockedPair);
        assert!(
            trace.steps[1..]
                .iter()
                .any(|step| step.technique == HiddenSingle)
        );
        assert_eq!(
            generate_matching_with_mode(42, &criteria, First, &[template], 1),
            Err(GenerationError::SearchLimit)
        );
        criteria.technique = Some(LockedPair);
        assert_eq!(
            generate_matching_with_mode(42, &criteria, First, &[template], 1),
            Ok(board)
        );
    }

    #[test]
    fn a_disabled_technique_proving_the_same_move_prevents_an_exclusive_opening() {
        use Technique::{HiddenSingle, NakedSingle};
        use TechniqueTargetMode::{ExclusiveOpening, First};
        let criteria = GenerationCriteria {
            clues: 80..=80,
            rating: Some(GenerationRating::Score(14..=14)),
            technique: Some(HiddenSingle),
            technique_order: &[HiddenSingle],
        };
        let board = generate_matching_with_mode(42, &criteria, First, &[], 1).unwrap();
        let trace = solve_logically(&board, criteria.technique_order).unwrap();
        assert_eq!(trace.steps[0].technique, HiddenSingle);
        assert_eq!(
            crate::technique_deductions(&board, None, NakedSingle).unwrap()[0].actions,
            trace.steps[0].actions
        );
        assert_eq!(
            generate_matching_with_mode(42, &criteria, ExclusiveOpening, &[], 1),
            Err(GenerationError::SearchLimit)
        );
    }

    #[test]
    fn rejects_an_exclusive_full_house_before_search_and_allows_it_as_a_configured_first_step() {
        use Technique::{FullHouse, NakedSingle};
        use TechniqueTargetMode::{ExclusiveOpening, First};
        let criteria = GenerationCriteria {
            clues: 80..=80,
            rating: Some(GenerationRating::Score(4..=4)),
            technique: Some(FullHouse),
            technique_order: &[FullHouse],
        };
        let conflict = Err(GenerationError::IncompatibleTargets(
            GenerationConflict::CompetingOpening {
                target: FullHouse,
                competitor: NakedSingle,
            },
        ));
        assert_eq!(
            generate_matching_with_mode(42, &criteria, ExclusiveOpening, &[], 0),
            conflict
        );
        assert_eq!(
            crate::generate_targeted(42, crate::GenerationTarget::Opening(FullHouse), 0),
            conflict
        );

        let board = generate_matching_with_mode(42, &criteria, First, &[], 1).unwrap();
        let trace = solve_logically(&board, criteria.technique_order).unwrap();
        assert_eq!(trace.steps[0].technique, FullHouse);
        assert_eq!(
            crate::technique_deductions(&board, None, NakedSingle).unwrap()[0].actions,
            trace.steps[0].actions
        );
    }

    #[test]
    fn detects_clue_rating_and_profile_conflicts_before_search() {
        use GenerationConflict::{EmptySolverProfile, RatingBelowTechnique, TechniqueOnFilledGrid};
        use GenerationError::IncompatibleTargets;
        let mut criteria = GenerationCriteria {
            clues: 79..=80,
            rating: Some(GenerationRating::Score(0..=13)),
            technique: Some(Technique::HiddenSingle),
            technique_order: &[Technique::HiddenSingle],
        };
        assert_eq!(
            generate_matching(42, &criteria, &[], 0),
            Err(IncompatibleTargets(RatingBelowTechnique(
                Technique::HiddenSingle
            )))
        );
        criteria.technique = Some(Technique::Pointing);
        criteria.technique_order = &[Technique::Pointing];
        criteria.rating = Some(GenerationRating::Difficulty(Difficulty::Easy));
        assert_eq!(
            generate_matching(42, &criteria, &[], 0),
            Err(IncompatibleTargets(RatingBelowTechnique(
                Technique::Pointing
            )))
        );
        criteria.clues = 81..=81;
        assert_eq!(
            generate_matching(42, &criteria, &[], 0),
            Err(IncompatibleTargets(TechniqueOnFilledGrid))
        );
        criteria.technique = None;
        criteria.technique_order = &[];
        criteria.rating = Some(GenerationRating::Score(0..=0));
        let board = generate_matching(42, &criteria, &[], 1).unwrap();
        assert!(board.iter().all(|&digit| digit != 0));
        criteria.clues = 80..=80;
        assert_eq!(
            generate_matching(42, &criteria, &[], 0),
            Err(IncompatibleTargets(EmptySolverProfile))
        );
    }

    #[test]
    fn a_matching_technique_and_partial_subtotal_do_not_meet_a_rating_target() {
        let technique = Technique::LockedPair;
        let template = parse_givens(technique.practice_example().givens).unwrap();
        let clues = template.iter().filter(|&&digit| digit != 0).count();
        let mut criteria = GenerationCriteria {
            clues: clues..=clues,
            rating: None,
            technique: Some(technique),
            technique_order: &[Technique::LockedPair],
        };
        let board = generate_matching(42, &criteria, &[template], 1).unwrap();
        let rating = rate_puzzle(&board, criteria.technique_order).unwrap();
        assert_eq!(rating.status, SolveStatus::Stalled);
        assert!(rating.score.counts.contains_key(&technique));
        criteria.rating = Some(GenerationRating::Score(0..=u32::MAX));
        assert_eq!(
            generate_matching(42, &criteria, &[template], 1),
            Err(GenerationError::SearchLimit)
        );
    }

    #[test]
    fn template_generation_preserves_uniqueness_at_sparse_clue_counts() {
        let template = parse_givens(SPARSE).unwrap();
        for clues in 17..=20 {
            let mut constraints = GenerationConstraints {
                clues,
                score: None,
                technique_order: &Technique::ALL,
            };
            let board = generate_constrained(42, &constraints, &[template], 1).unwrap();
            assert_ne!(board, template);
            assert_eq!(board.iter().filter(|&&digit| digit != 0).count(), clues);
            let rating = solve_logically(&board, &Technique::ALL).unwrap();
            assert!(matches!(rating.status, SolveStatus::Solved(_)));
            constraints.score = Some(rating.score.points..=rating.score.points);
            assert_eq!(
                generate_constrained(42, &constraints, &[template], 1),
                Ok(board)
            );
            let different = rating.score.points + 1;
            constraints.score = Some(different..=different);
            assert_eq!(
                generate_constrained(42, &constraints, &[template], 1),
                Err(GenerationError::SearchLimit)
            );
        }
    }

    #[test]
    fn a_medium_template_supports_combined_sparse_and_score_targets() {
        // This puzzle is from Gordon Royle's 17-clue collection.
        let template = parse_givens(
            "050040000000010040009000300100000080002005000000300000000700502480000000600000000",
        )
        .unwrap();
        let order: Vec<_> = Technique::ALL.into_iter().filter(|t| *t != Technique::HiddenSingleBox).collect();
        for clues in 17..=20 {
            let constraints = GenerationConstraints {
                clues,
                score: Some(1001..=1600),
                technique_order: &order,
            };
            let board = generate_constrained(0, &constraints, &[template], 32).unwrap();
            assert_eq!(board.iter().filter(|&&digit| digit != 0).count(), clues);
            let rating = solve_logically(&board, &order).unwrap();
            assert_eq!(rating.status, SolveStatus::Solved(crate::Difficulty::Medium));
            assert!((1001..=1600).contains(&rating.score.points));
        }
        let criteria = GenerationCriteria {
            clues: 17..=20,
            rating: Some(GenerationRating::Difficulty(Difficulty::Medium)),
            technique: Some(Technique::HiddenSingle),
            technique_order: Technique::DEFAULT_ORDER,
        };
        let board = generate_matching(0, &criteria, &[template], 64).unwrap();
        assert!(
            criteria
                .clues
                .contains(&board.iter().filter(|&&digit| digit != 0).count())
        );
        let rating = rate_puzzle(&board, criteria.technique_order).unwrap();
        assert_eq!(rating.status, SolveStatus::Solved(Difficulty::Medium));
        assert!(rating.score.counts.contains_key(&Technique::HiddenSingle));
    }

    #[test]
    fn reports_invalid_goals_and_limited_searches() {
        let mut constraints = GenerationConstraints {
            clues: 16,
            score: None,
            technique_order: &[],
        };
        for clues in [16, 82] {
            constraints.clues = clues;
            assert_eq!(
                generate_constrained(42, &constraints, &[], 1),
                Err(GenerationError::InvalidClueCount)
            );
        }
        constraints.clues = 17;
        let (floor, ceiling) = (200, 100);
        constraints.score = Some(floor..=ceiling);
        assert_eq!(
            generate_constrained(42, &constraints, &[], 1),
            Err(GenerationError::InvalidScoreRange)
        );
        constraints.score = None;
        let template = parse_givens(SPARSE).unwrap();
        assert_eq!(
            generate_constrained(42, &constraints, &[template], 0),
            Err(GenerationError::SearchLimit)
        );
        assert_eq!(
            generate_constrained(42, &constraints, &[[0; CELLS]], 1),
            Err(GenerationError::SearchLimit)
        );
    }
}
