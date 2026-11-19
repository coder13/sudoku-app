use std::cell::RefCell;
#[cfg(feature = "generation")]
use std::collections::HashMap;
#[cfg(feature = "generation")]
use std::{
    borrow::Cow,
    collections::{HashSet, hash_map::Entry},
};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[cfg(feature = "generation")]
use super::generation::{MatchedPath, start_builtin_pool, start_matching_path, start_targeted_path};
use super::hints::technique_counts::TechniqueCountScan;
use super::hints::{checked_position, classify_actions, rank_position, rank_useful_position};
use super::{
    Analysis, Board, Candidate, DEFAULT_HINT_LIMIT, DeductionMatch, Difficulty, Hint, HintAction,
    HintError, HintStages, PositionSnapshot, ProofPattern, RankDiscovery, RankDiscoveryScan,
    RankError, RankFallbackOptions, RankOutcome, RankPattern, RankProof, RankScan, SCORING_VERSION,
    SolverProfile, Technique, candidates, compare_paths, deductions, discover_rank_at,
    discover_rank_deductions_at, next_enabled_deduction, opening_techniques, parse_givens,
    prove_rank_at, rank_deductions_at, rank_proof_effort_at, rate_puzzle, replay_rank_proof_at,
    search_alternate_path, solve_position, solve_position_with_rank,
};
#[cfg(feature = "generation")]
use super::{
    GeneratedPuzzle, GenerationConflict, GenerationCriteria, GenerationError, GenerationRating,
    GenerationSearch, GenerationStep, GenerationTarget, TechniqueTargetMode,
};
#[cfg(feature = "teaching")]
use super::{Random, technique_deductions_at};
#[cfg(feature = "teaching")]
use crate::{check_practice_move, permutation::puzzle_permutation};

#[cfg(feature = "cli")]
pub(crate) mod batch;
mod hint_pages;
mod sized;
#[cfg(feature = "variants")]
mod sized_variant;
#[cfg(feature = "variants")]
mod variant;

#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
enum Request {
    Capabilities,
    #[cfg(feature = "generation")]
    GenerateMini {
        seed: u32,
        difficulty: crate::MiniDifficulty,
        #[serde(default)]
        exclude: Vec<[u8; 16]>,
    },
    #[cfg(feature = "generation")]
    GenerateSix {
        seed: u32,
        difficulty: crate::MiniDifficulty,
        grid: crate::GridSpec,
        #[serde(default)]
        exclude: Vec<Vec<u8>>,
    },
    #[cfg(all(feature = "generation", feature = "variants"))]
    GenerateAlgebraic {
        seed: u32,
        difficulty: Option<crate::AlgebraicDifficulty>,
        #[serde(default)]
        exclude: Vec<sized_variant::Definition>,
    },
    SizedClassic {
        position: sized::Definition,
        #[serde(flatten)]
        operation: sized::Operation,
    },
    #[cfg(feature = "variants")]
    SizedVariant {
        position: sized_variant::Definition,
        #[serde(flatten)]
        operation: sized_variant::Operation,
    },
    #[cfg(feature = "generation")]
    CanonicalPuzzles {
        values: Vec<String>,
    },
    #[cfg(feature = "generation")]
    ImpossibleTemplates,
    #[cfg(feature = "variants")]
    Variant {
        #[serde(default)]
        operation: variant::Operation,
        position: Value,
        #[serde(flatten)]
        options: variant::Options,
    },
    SolveSingles {
        values: String,
        eliminations: Option<Vec<u16>>,
        displayed_candidates: Option<Vec<u16>>,
    },
    Rate {
        values: String,
        technique_order: Option<Vec<String>>,
    },
    LogicalSolve {
        values: String,
        entries: Option<String>,
        eliminations: Option<Vec<u16>>,
        technique_order: Option<Vec<String>>,
        #[serde(default)]
        include_positions: bool,
        #[serde(default)]
        include_step_details: bool,
        #[serde(default)]
        include_move_availability: bool,
    },
    LogicalSolveWithRank {
        values: String,
        entries: Option<String>,
        eliminations: Option<Vec<u16>>,
        technique_order: Option<Vec<String>>,
        #[serde(default)]
        rank_options: RankFallbackOptions,
        #[serde(default)]
        include_positions: bool,
    },
    CompareSolvePaths {
        values: String,
        entries: Option<String>,
        eliminations: Option<Vec<u16>>,
        technique_order: Option<Vec<String>>,
        technique: String,
    },
    AlternateSolvePath {
        values: String,
        entries: Option<String>,
        eliminations: Option<Vec<u16>>,
        technique_order: Option<Vec<String>>,
        technique: String,
        max_positions: u32,
    },
    #[cfg(feature = "teaching")]
    PracticePosition {
        values: String,
        entries: Option<String>,
        eliminations: Option<Vec<u16>>,
        technique_order: Option<Vec<String>>,
        technique: String,
    },
    #[cfg(feature = "teaching")]
    CheckPracticeMove {
        values: String,
        entries: Option<String>,
        eliminations: Option<Vec<u16>>,
        technique: String,
        action: HintAction,
    },
    HintPage { collection: u32, index: usize },
    ReleaseHints { collection: u32 },
    Hints {
        collection: Option<u32>,
        values: String,
        eliminations: Option<Vec<u16>>,
        limit: Option<HintLimit>,
        #[serde(default)]
        include_patterns: bool,
        #[serde(default)]
        disabled_techniques: Vec<String>,
        #[serde(default)]
        prefer_progress: bool,
        difficulty: Option<Difficulty>,
    },
    NextDeduction {
        values: String,
        eliminations: Option<Vec<u16>>,
        #[serde(default)]
        disabled_techniques: Vec<String>,
    },
    Deductions {
        values: String,
        eliminations: Option<Vec<u16>>,
        technique_order: Option<Vec<String>>,
    },
    TechniqueCount {
        values: String,
        eliminations: Option<Vec<u16>>,
        technique: String,
    },
    ProveRank {
        values: String,
        entries: Option<String>,
        eliminations: Option<Vec<u16>>,
        pattern: RankPattern,
        target: Candidate,
        node_budget: u32,
    },
    DiscoverRank {
        values: String,
        entries: Option<String>,
        eliminations: Option<Vec<u16>>,
        target: Candidate,
        node_budget: u32,
    },
    DiscoverRankDeductions {
        values: String,
        entries: Option<String>,
        eliminations: Option<Vec<u16>>,
        limit: Option<usize>,
        node_budget: u32,
        max_nodes_per_candidate: u32,
    },
    RankDeductions {
        values: String,
        entries: Option<String>,
        eliminations: Option<Vec<u16>>,
        pattern: RankPattern,
        node_budget: u32,
    },
    ReplayRankProof {
        values: String,
        entries: Option<String>,
        eliminations: Option<Vec<u16>>,
        proof: RankProof,
    },
    RankProofEffort {
        values: String,
        entries: Option<String>,
        eliminations: Option<Vec<u16>>,
        proof: RankProof,
    },
    ClassifyActions {
        values: String,
        eliminations: Option<Vec<u16>>,
        actions: Vec<HintAction>,
    },
    OpeningTechniques {
        values: String,
    },
    Techniques {
        #[serde(default)]
        variant: bool,
    },
    #[cfg(feature = "teaching")]
    LessonExamples,
    #[cfg(feature = "teaching")]
    PracticeExamples {
        technique: String,
        #[serde(default)]
        variant: bool,
    },
    #[cfg(feature = "teaching")]
    GeneratePracticeExample {
        technique: String,
        seed: u32,
        exclude: String,
        #[serde(default)]
        variant: bool,
    },
    #[cfg(feature = "generation")]
    GenerateTargeted {
        seed: u32,
        max_attempts: u32,
        target: Target,
        #[serde(default)]
        include_rating: bool,
        #[serde(default)]
        exclude: Vec<String>,
    },
    #[cfg(feature = "generation")]
    GenerateConstrained {
        #[serde(flatten)]
        options: MatchingRequest,
        #[serde(default)]
        templates: Vec<String>,
    },
    #[cfg(feature = "generation")]
    GenerateFromPool(MatchingRequest),
    #[cfg(all(feature = "generation", feature = "variants"))]
    GenerateVariant(Box<variant::GenerationRequest>),
    #[cfg(feature = "generation")]
    GenerationStart {
        job: u32,
        request: Box<Request>,
    },
    #[cfg(feature = "generation")]
    GenerationAdvance {
        job: u32,
    },
    #[cfg(feature = "generation")]
    GenerationCancel {
        job: u32,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg(feature = "generation")]
struct MatchingRequest {
    #[serde(default)]
    include_rating: bool,
    seed: u32,
    max_attempts: u32,
    clues: ClueCount,
    score: Option<[u32; 2]>,
    difficulty: Option<Difficulty>,
    technique: Option<TechniqueRequest>,
    technique_order: Option<Vec<String>>,
    #[serde(default)]
    exclude: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum HintLimit {
    All,
    #[serde(untagged)]
    Count(usize),
}

#[derive(Serialize)]
struct HintWithPattern {
    #[serde(flatten)]
    hint: Hint,
    pattern: ProofPattern,
}

impl HintWithPattern {
    fn new(hint: Hint, masks: &[u16; super::CELLS]) -> Self {
        let pattern = ProofPattern::from_evidence(&hint.evidence, hint.actions[0].candidate(), masks);
        Self { hint, pattern }
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
#[cfg(feature = "generation")]
enum ClueCount {
    Exact(usize),
    Range([usize; 2]),
}

#[cfg(feature = "generation")]
impl ClueCount {
    fn range(self) -> std::ops::RangeInclusive<usize> {
        match self {
            Self::Exact(count) => count..=count,
            Self::Range([min, max]) => min..=max,
        }
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
#[cfg(feature = "generation")]
enum TechniqueRequest {
    Id(String),
    WithMode {
        id: String,
        mode: TechniqueTargetMode,
    },
}

#[cfg(feature = "generation")]
impl TechniqueRequest {
    fn parts(self) -> (String, TechniqueTargetMode) {
        match self {
            Self::Id(id) => (id, TechniqueTargetMode::Anywhere),
            Self::WithMode { id, mode } => (id, mode),
        }
    }
}

#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
#[cfg(feature = "generation")]
enum Target {
    Difficulty {
        level: Difficulty,
        technique_order: Option<Vec<String>>,
    },
    Opening {
        technique: String,
    },
}

type ResultValue<T = Value> = Result<T, (&'static str, &'static str)>;

#[derive(Serialize)]
#[serde(untagged)]
enum ResponseValue {
    Json(Value),
    SizedTrace(Option<Vec<crate::SizedTracePosition>>),
    SizedHints(Option<crate::SizedHints>),
    SizedDeduction(Option<crate::SizedDeduction>),
    #[cfg(feature = "variants")]
    SizedConstraintTrace(Option<Vec<crate::SizedConstraintTracePosition>>),
    #[cfg(feature = "variants")]
    SizedConstraintHints(Option<crate::SizedConstraintHints>),
    #[cfg(feature = "variants")]
    AlgebraicTrace(Option<Vec<crate::AlgebraicTracePosition>>),
    #[cfg(feature = "variants")]
    AlgebraicHints(Option<crate::AlgebraicHints>),
    #[cfg(all(feature = "generation", feature = "variants"))]
    AlgebraicPuzzle(sized_variant::Definition),
    HintPage(hint_pages::HintPage),
    Hints { choices: Vec<Hint>, available: usize },
    HintsWithPatterns {
        choices: Vec<HintWithPattern>,
        available: usize,
        candidates: Vec<u16>,
    },
    Deductions(Vec<DeductionMatch>),
    HintStages(Option<Box<HintStages>>),
    RankOutcome(RankOutcome),
    RankDiscovery(RankDiscovery),
    RankDiscoveryScan(RankDiscoveryScan),
    RankScan(RankScan),
}

#[cfg(any(target_arch = "wasm32", test))]
#[derive(Serialize)]
#[serde(untagged)]
enum Response {
    Success {
        value: ResponseValue,
    },
    Error {
        code: &'static str,
        error: &'static str,
    },
}
const INVALID_PROFILE: (&str, &str) = (
    "invalid-profile",
    "Use each known technique ID at most once.",
);
const INVALID_TECHNIQUE: (&str, &str) = ("invalid-technique", "Choose a known Sudoku technique.");
const INVALID_ELIMINATIONS: (&str, &str) = (
    "invalid-eliminations",
    "The candidate eliminations are invalid.",
);
#[cfg(feature = "teaching")]
const INVALID_LESSON: (&str, &str) = (
    "invalid-lesson",
    "The engine could not find the expected deduction for a technique lesson.",
);

#[cfg(any(target_arch = "wasm32", test))]
pub(crate) fn process(bytes: &[u8]) -> Vec<u8> {
    let result = serde_json::from_slice::<Request>(bytes)
        .map_err(|_| {
            // Decode generic JSON only on failure. Normal requests keep one typed parse.
            serde_json::from_slice::<Value>(bytes)
                .ok()
                .and_then(|value| unavailable_capability(&value))
                .map(unsupported)
                .unwrap_or((
                    "invalid-request",
                    "The Sudoku engine could not read this request.",
                ))
        })
        .and_then(execute);
    let response = match result {
        Ok(value) => Response::Success { value },
        Err((code, error)) => Response::Error { code, error },
    };
    serde_json::to_vec(&response).expect("the protocol returns valid JSON")
}

fn board(values: &str) -> Result<Board, (&'static str, &'static str)> {
    parse_givens(values).ok_or((
        "invalid-grid",
        "Enter exactly 81 cells. Use a dot or 0 for each empty cell.",
    ))
}

fn profile(ids: Option<Vec<String>>) -> Result<SolverProfile, (&'static str, &'static str)> {
    ids.map_or_else(
        || Ok(SolverProfile::default()),
        |ids| SolverProfile::from_ids(ids.iter().map(String::as_str)).map_err(|_| INVALID_PROFILE),
    )
}

fn elimination_masks(
    data: Option<Vec<u16>>,
) -> Result<Option<[u16; super::CELLS]>, (&'static str, &'static str)> {
    data.map(|data| data.try_into().map_err(|_| INVALID_ELIMINATIONS))
        .transpose()
}

fn play_masks(
    displayed: Option<Vec<u16>>,
    removed: Option<Vec<u16>>,
) -> ResultValue<[u16; super::CELLS]> {
    let shown = elimination_masks(displayed)?.unwrap_or([super::DIGITS; super::CELLS]);
    let removed = elimination_masks(removed)?.unwrap_or([0; super::CELLS]);
    if shown.iter().chain(&removed).any(|mask| mask & !super::DIGITS != 0) {
        return Err(INVALID_ELIMINATIONS);
    }
    Ok(std::array::from_fn(|cell| shown[cell] & !removed[cell]))
}

fn starting_position(
    values: &str,
    entries: Option<&str>,
    eliminations: Option<Vec<u16>>,
) -> ResultValue<PositionSnapshot> {
    let mut position = PositionSnapshot::new(board(values)?);
    if let Some(entries) = entries {
        position.entries = board(entries)?;
    }
    if let Some(removals) = elimination_masks(eliminations)? {
        position.eliminations = removals;
    }
    Ok(position)
}

fn disabled_hint_techniques(ids: &[String]) -> Vec<Technique> {
    // Saved preferences may include a technique from another version of the app.
    ids.iter().filter_map(|id| Technique::from_id(id)).collect()
}

fn hint_error(error: HintError) -> (&'static str, &'static str) {
    match error {
        HintError::Puzzle(analysis) => puzzle_error(analysis),
        HintError::InvalidEliminations => INVALID_ELIMINATIONS,
    }
}

fn rank_error(error: RankError) -> (&'static str, &'static str) {
    match error {
        RankError::Position(error) => hint_error(error),
        RankError::NoBases => (
            "invalid-rank-pattern",
            "Select at least one base constraint.",
        ),
        RankError::InvalidConstraint(_) => (
            "invalid-rank-pattern",
            "Use valid cell indices, house indices, and digits in the rank pattern.",
        ),
        RankError::DuplicateConstraint(_) => (
            "invalid-rank-pattern",
            "Use each constraint at most once per role in the rank pattern.",
        ),
        RankError::SatisfiedConstraint(_) => (
            "invalid-rank-pattern",
            "Use constraints that still need a digit.",
        ),
        RankError::InactiveTarget(_) => ("invalid-rank-target", "Choose an active candidate."),
        RankError::UnconstrainedTarget(_) => (
            "invalid-rank-target",
            "Choose a candidate in at least one base or cover.",
        ),
    }
}

fn grid_string(board: Board) -> String {
    board
        .into_iter()
        .map(|digit| char::from(b'0' + digit))
        .collect()
}

fn snapshot_value(snapshot: &PositionSnapshot) -> Value {
    json!({
        "givens": grid_string(snapshot.givens),
        "entries": grid_string(snapshot.entries),
        "eliminations": snapshot.eliminations[..],
    })
}

fn position_masks(position: &PositionSnapshot) -> ResultValue<[u16; super::CELLS]> {
    let values = position.values().map_err(puzzle_error)?;
    let mut masks = candidates(&values).ok_or_else(|| puzzle_error(Analysis::Conflict))?;
    for (mask, eliminated) in masks.iter_mut().zip(position.eliminations) {
        *mask &= !eliminated;
    }
    Ok(masks)
}

#[cfg(feature = "teaching")]
fn position_with_candidates(position: &PositionSnapshot) -> ResultValue {
    let masks = position_masks(position)?;
    let mut data = snapshot_value(position);
    data["candidates"] = json!(masks[..]);
    Ok(data)
}

#[cfg(feature = "teaching")]
fn lesson_position(position: &PositionSnapshot, deduction: &Hint) -> ResultValue {
    let masks = position_masks(position)?;
    let mut data = snapshot_value(position);
    data["candidates"] = json!(masks[..]);
    data["deduction"] = json!(deduction);
    data["pattern"] = json!(ProofPattern::from_evidence(
        &deduction.evidence,
        deduction.actions[0].candidate(),
        &masks,
    ));
    Ok(data)
}

#[cfg(feature = "teaching")]
fn transpose_lesson_position(position: &PositionSnapshot) -> PositionSnapshot {
    // Transpose the grid and rename every digit. The same technique applies in a new orientation.
    let transpose = |cell: usize| cell % 9 * 9 + cell / 9;
    let rename = |digit: u8| if digit == 0 { 0 } else { (digit + 2) % 9 + 1 };
    PositionSnapshot {
        givens: std::array::from_fn(|cell| rename(position.givens[transpose(cell)])),
        entries: std::array::from_fn(|cell| rename(position.entries[transpose(cell)])),
        eliminations: std::array::from_fn(|cell| {
            let mask = position.eliminations[transpose(cell)];
            ((mask << 3) | (mask >> 6)) & super::DIGITS
        }),
    }
}

#[cfg(feature = "teaching")]
fn lesson_examples() -> ResultValue {
    let mut lessons = serde_json::Map::new();
    for technique in Technique::ALL {
        let example = technique.practice_example();
        let position = example.position().map_err(puzzle_error)?;
        let deduction = technique_deductions_at(&position, technique)
            .map_err(|_| INVALID_LESSON)?
            .into_iter()
            .find(|hint| hint.actions == example.expected_actions)
            .ok_or(INVALID_LESSON)?;
        let practice = transpose_lesson_position(&position);
        let proofs = technique_deductions_at(&practice, technique).map_err(|_| INVALID_LESSON)?;
        let proof = proofs.first().ok_or(INVALID_LESSON)?;
        let mut lesson = lesson_position(&position, &deduction)?;
        lesson["practice"] = practice_value(&practice, &proofs, proof)?;
        lessons.insert(technique.id().into(), lesson);
    }
    Ok(Value::Object(lessons))
}

#[cfg(feature = "teaching")]
fn practice_value(position: &PositionSnapshot, proofs: &[Hint], proof: &Hint) -> ResultValue {
    let mut answers: Vec<_> = proofs
        .iter()
        .flat_map(|proof| proof.actions.iter().copied())
        .collect();
    answers.sort_unstable();
    answers.dedup();
    let mut drill = lesson_position(position, proof)?;
    drill["answers"] = json!(answers);
    drill["suggestion"] = json!(proof.actions.first().ok_or(INVALID_LESSON)?);
    Ok(drill)
}

#[cfg(feature = "teaching")]
fn practice_examples(technique: Technique) -> ResultValue {
    let mut exercises = Vec::new();
    for example in technique.practice_examples() {
        let position = example.position().map_err(puzzle_error)?;
        let proofs = technique_deductions_at(&position, technique).map_err(|_| INVALID_LESSON)?;
        let expected = proofs
            .iter()
            .find(|hint| hint.actions == example.expected_actions)
            .ok_or(INVALID_LESSON)?;
        exercises.push(practice_value(&position, &proofs, expected)?);
    }
    Ok(Value::Array(exercises))
}

#[cfg(feature = "teaching")]
fn generate_practice_example(technique: Technique, seed: u32, exclude: Board) -> ResultValue {
    let mut random = Random::from_seed(seed);
    let mut examples = technique.practice_examples();
    random.shuffle(&mut examples);
    for example in examples.into_iter().cycle().take(6) {
        let original = example.position().map_err(puzzle_error)?;
        let (cells, digits) = puzzle_permutation(&mut random);
        let position = PositionSnapshot {
            givens: cells.map(|cell| digits[usize::from(original.givens[cell])]),
            entries: cells.map(|cell| digits[usize::from(original.entries[cell])]),
            eliminations: cells.map(|cell| {
                (1..=9).fold(0, |mask, digit| {
                    let bit = (original.eliminations[cell] >> (digit - 1)) & 1;
                    mask | (bit << (digits[digit] - 1))
                })
            }),
        };
        if position.values().map_err(puzzle_error)? == exclude {
            continue;
        }
        // Find the proof again so the answer and its explanation match the new grid.
        let proofs = technique_deductions_at(&position, technique).map_err(|_| INVALID_LESSON)?;
        if let Some(proof) = proofs.first() {
            return practice_value(&position, &proofs, proof);
        }
    }
    Err(INVALID_LESSON)
}

fn puzzle_error(analysis: Analysis) -> (&'static str, &'static str) {
    match analysis {
        Analysis::Conflict => ("conflict", "The puzzle contains conflicting digits."),
        Analysis::Unsolvable => ("unsolvable", "The puzzle has no solution."),
        Analysis::Multiple => ("multiple", "The puzzle has more than one solution."),
        Analysis::SearchLimit => (
            "search-limit",
            "The engine reached its puzzle search limit.",
        ),
        Analysis::Unique => unreachable!("a unique puzzle is not an error"),
    }
}

#[cfg(feature = "generation")]
fn generation_error(error: GenerationError) -> (&'static str, &'static str) {
    match error {
        GenerationError::InvalidClueCount => (
            "invalid-clue-count",
            "Choose a clue count or an ordered range between 17 and 81.",
        ),
        GenerationError::InvalidScoreRange => (
            "invalid-score-range",
            "The minimum score must be at most the maximum score.",
        ),
        GenerationError::IncompatibleTargets(conflict) => (
            "incompatible-targets",
            match conflict {
                GenerationConflict::CompetingOpening {
                    target: Technique::FullHouse,
                    competitor: Technique::NakedSingle,
                } => "A Full House also gives a Naked Single. Choose another exclusive opening.",
                GenerationConflict::CompetingOpening { .. } => {
                    "The requested opening always has a competing proof."
                }
                GenerationConflict::DisabledTechnique(_) => {
                    "Enable the target technique in the solver profile."
                }
                GenerationConflict::TechniqueOnFilledGrid => {
                    "A technique target needs at least one empty cell."
                }
                GenerationConflict::RatingBelowTechnique(_) => {
                    "Raise the score ceiling or difficulty to include the target technique."
                }
                GenerationConflict::EmptySolverProfile => {
                    "Enable a technique to rate a puzzle with empty cells."
                }
            },
        ),
        GenerationError::SearchLimit => (
            "search-limit",
            "The generator reached its limit before finding a matching puzzle.",
        ),
    }
}

#[cfg(feature = "generation")]
fn rating_target(
    score: Option<[u32; 2]>,
    difficulty: Option<Difficulty>,
) -> ResultValue<Option<GenerationRating>> {
    Ok(match (score, difficulty) {
        (Some(_), Some(_)) => {
            return Err((
                "invalid-rating-target",
                "Choose either a score range or a difficulty.",
            ));
        }
        (Some([min, max]), None) => Some(GenerationRating::Score(min..=max)),
        (None, Some(level)) => Some(GenerationRating::Difficulty(level)),
        (None, None) => None,
    })
}

#[cfg(feature = "generation")]
impl MatchingRequest {
    fn start(
        self,
        templates: Option<Vec<String>>,
    ) -> ResultValue<(SolverProfile, ActiveGeneration)> {
        let rating = rating_target(self.score, self.difficulty)?;
        let (technique, mode) = match self.technique {
            None => (None, TechniqueTargetMode::Anywhere),
            Some(technique) => {
                let (id, mode) = technique.parts();
                (
                    Some(Technique::from_id(&id).ok_or(INVALID_TECHNIQUE)?),
                    mode,
                )
            }
        };
        let profile = profile(self.technique_order)?;
        let criteria = GenerationCriteria {
            clues: self.clues.range(),
            rating,
            technique,
            technique_order: profile.technique_order(),
        };
        if let Some(templates) = templates {
            let templates = templates
                .iter()
                .map(|text| board(text))
                .collect::<Result<Vec<_>, _>>()?;
            let search = start_matching_path(
                self.seed,
                &criteria,
                mode,
                Cow::Owned(templates),
                self.max_attempts,
            )
            .map_err(generation_error)?;
            let search = generation_output(search, self.include_rating, &profile);
            return Ok((profile, exclude_puzzles(search, self.exclude)?));
        }
        let search = start_builtin_pool(self.seed, &criteria, mode, self.max_attempts)
            .map_err(generation_error)?;
        Ok((
            profile,
            exclude_puzzles(search.map(GenerationOutput::Rated), self.exclude)?,
        ))
    }
}

#[cfg(feature = "generation")]
enum GenerationOutput {
    Board(Board),
    Rated(GeneratedPuzzle),
    #[cfg(feature = "variants")]
    Variant(Box<crate::GeneratedVariant>),
}

#[cfg(feature = "generation")]
impl GenerationOutput {
    fn into_wire(self) -> Value {
        match self {
            Self::Board(board) => json!(grid_string(board)),
            Self::Rated(puzzle) => {
                json!({ "board": grid_string(puzzle.board), "rating": puzzle.rating })
            }
            #[cfg(feature = "variants")]
            Self::Variant(puzzle) => json!(puzzle),
        }
    }
}

#[cfg(feature = "generation")]
type ActiveGeneration = GenerationSearch<'static, GenerationOutput>;

#[cfg(feature = "generation")]
fn generation_output(
    search: GenerationSearch<'static, (Board, MatchedPath)>,
    rated: bool,
    profile: &SolverProfile,
) -> ActiveGeneration {
    if !rated {
        return search.map(|(board, _)| GenerationOutput::Board(board));
    }
    let order = profile.technique_order().to_vec();
    search.filter_map(move |(board, path)| path.rated(board, &order).map(GenerationOutput::Rated))
}

thread_local! {
    #[cfg(feature = "generation")]
    static GENERATION: RefCell<HashMap<u32, ActiveGeneration>> = RefCell::new(HashMap::new());
    static TECHNIQUE_COUNTS: RefCell<TechniqueCountScan> = RefCell::default();
    #[cfg(feature = "generation")]
    static PUZZLE_KEYS: RefCell<HashMap<Board, Board>> = RefCell::new(HashMap::new());
}

#[cfg(feature = "generation")]
fn puzzle_key(board: Board) -> Board {
    PUZZLE_KEYS.with_borrow_mut(|keys| {
        if let Some(key) = keys.get(&board) {
            return *key;
        }
        let key = crate::canonical_puzzle(&board);
        if keys.len() >= 8192 {
            keys.clear();
        }
        keys.insert(board, key);
        key
    })
}

#[cfg(feature = "generation")]
fn exclude_puzzles(
    search: ActiveGeneration,
    exclude: Vec<String>,
) -> ResultValue<ActiveGeneration> {
    if exclude.is_empty() {
        return Ok(search);
    }
    let excluded = exclude
        .iter()
        .map(|text| board(text).map(puzzle_key))
        .collect::<Result<HashSet<_>, _>>()?;
    Ok(search.filter(move |candidate| match candidate {
        GenerationOutput::Board(board) => !excluded.contains(&puzzle_key(*board)),
        GenerationOutput::Rated(puzzle) => !excluded.contains(&puzzle_key(puzzle.board)),
        #[cfg(feature = "variants")]
        GenerationOutput::Variant(_) => true,
    }))
}

#[cfg_attr(not(feature = "cli"), allow(dead_code))]
#[cfg(feature = "generation")]
enum GenerationProfile {
    Classic(SolverProfile),
    #[cfg(feature = "variants")]
    Variant(Vec<crate::VariantTechnique>),
}

#[cfg(feature = "generation")]
fn start_generation(request: Request) -> ResultValue<(GenerationProfile, ActiveGeneration)> {
    match request {
        Request::GenerateTargeted {
            seed,
            max_attempts,
            target,
            include_rating,
            exclude,
        } => {
            let (profile, search) = match target {
                Target::Difficulty {
                    level,
                    technique_order,
                } => {
                    let profile = profile(technique_order)?;
                    let search = start_targeted_path(
                        seed,
                        GenerationTarget::Difficulty {
                            level,
                            technique_order: profile.technique_order(),
                        },
                        max_attempts,
                    );
                    (profile, search)
                }
                Target::Opening { technique } => {
                    let technique = Technique::from_id(&technique).ok_or(INVALID_PROFILE)?;
                    (
                        SolverProfile::default(),
                        start_targeted_path(seed, GenerationTarget::Opening(technique), max_attempts),
                    )
                }
            };
            let search = generation_output(search.map_err(generation_error)?, include_rating, &profile);
            Ok((GenerationProfile::Classic(profile), exclude_puzzles(search, exclude)?))
        }
        Request::GenerateConstrained { options, templates } => options
            .start(Some(templates))
            .map(|(profile, search)| (GenerationProfile::Classic(profile), search)),
        Request::GenerateFromPool(options) => options
            .start(None)
            .map(|(profile, search)| (GenerationProfile::Classic(profile), search)),
        #[cfg(feature = "variants")]
        Request::GenerateVariant(options) => options.start(),
        _ => Err(("invalid-request", "Choose a targeted generation request.")),
    }
}

#[cfg(feature = "generation")]
fn generation_update(job: u32, cancel: bool) -> ResultValue {
    GENERATION.with_borrow_mut(|jobs| {
        let search = jobs
            .get_mut(&job)
            .ok_or(("unknown-generation", "This generation request has ended."))?;
        let step = (if cancel {
            search.cancel()
        } else {
            search.advance()
        })
        .expect("closed searches are removed from the active jobs");
        let value = match step {
            GenerationStep::Pending { attempts } => {
                return Ok(json!({ "status": "pending", "attempts": attempts }));
            }
            GenerationStep::Matched { attempts, puzzle } => {
                json!({ "status": "matched", "attempts": attempts, "puzzle": puzzle.into_wire() })
            }
            GenerationStep::Exhausted { attempts } => {
                json!({ "status": "exhausted", "attempts": attempts })
            }
            GenerationStep::Cancelled { attempts } => {
                json!({ "status": "cancelled", "attempts": attempts })
            }
        };
        jobs.remove(&job);
        Ok(value)
    })
}

fn trace_value(trace: &super::LogicalSolve) -> Value {
    json!({ "board": grid_string(trace.board), "steps": trace.steps, "rating": trace.rating() })
}

fn execute(request: Request) -> ResultValue<ResponseValue> {
    let result = match request {
        #[cfg(feature = "generation")]
        Request::GenerateMini { seed, difficulty, exclude } => {
            crate::generate_mini(seed, difficulty, &exclude).map(|puzzle| json!(puzzle))
                .ok_or_else(|| puzzle_error(Analysis::SearchLimit))
        }
        #[cfg(feature = "generation")]
        Request::GenerateSix { seed, difficulty, grid, exclude } => {
            if grid.size != 6 || !matches!((grid.box_rows, grid.box_columns), (2, 3) | (3, 2)) {
                return Err(("invalid-layout", "Use six 2 × 3 or 3 × 2 boxes."));
            }
            if exclude.iter().any(|puzzle| puzzle.len() != 36 || puzzle.iter().any(|digit| *digit > 6)) {
                return Err(("invalid-grid", "The cell count and digits must match the grid size."));
            }
            crate::generate_six(grid, seed, difficulty, &exclude).map(|puzzle| json!(puzzle.as_slice()))
                .ok_or_else(|| puzzle_error(Analysis::SearchLimit))
        }
        #[cfg(all(feature = "generation", feature = "variants"))]
        Request::GenerateAlgebraic { seed, difficulty, exclude } => return sized_variant::generate(seed, difficulty, exclude),
        Request::SizedClassic { position, operation } => return sized::execute(position, operation),
        #[cfg(feature = "variants")]
        Request::SizedVariant { position, operation } => return sized_variant::execute(position, operation),
        #[cfg(feature = "generation")]
        Request::ImpossibleTemplates => Ok(json!(
            crate::impossible_templates()
                .iter()
                .map(|board| grid_string(*board))
                .collect::<Vec<_>>()
        )),
        #[cfg(feature = "generation")]
        Request::CanonicalPuzzles { values } => values
            .iter()
            .map(|text| board(text).map(|board| grid_string(puzzle_key(board))))
            .collect::<Result<Vec<_>, _>>()
            .map(|keys| json!(keys)),
        #[cfg(feature = "variants")]
        Request::Variant {
            operation,
            position,
            options,
        } => variant::execute(operation, position, options),
        Request::SolveSingles { values, eliminations, displayed_candidates } => {
            let allowed = play_masks(displayed_candidates, eliminations)?;
            let filled = super::classic_singles(board(&values)?, &allowed)
                .ok_or_else(|| puzzle_error(Analysis::Conflict))?;
            Ok(json!(grid_string(filled)))
        }
        Request::Rate {
            values,
            technique_order,
        } => {
            let rating = rate_puzzle(
                &board(&values)?,
                profile(technique_order)?.technique_order(),
            )
            .map_err(puzzle_error)?;
            Ok(json!(rating))
        }
        Request::LogicalSolve {
            values,
            entries,
            eliminations,
            technique_order,
            include_positions,
            include_step_details,
            include_move_availability,
        } => {
            let start = starting_position(&values, entries.as_deref(), eliminations)?;
            let trace = solve_position(&start, profile(technique_order)?.technique_order())
                .map_err(hint_error)?;
            let positions = (include_positions || include_step_details)
                .then(|| {
                    trace
                        .positions()
                        .enumerate()
                        .map(|(index, position)| {
                            let mut data = snapshot_value(&position);
                            if include_step_details {
                                let masks = position_masks(&position)?;
                                data["candidates"] = json!(masks[..]);
                                if let Some(step) = trace.steps.get(index) {
                                    data["pattern"] = json!(ProofPattern::from_evidence(
                                        &step.evidence,
                                        step.actions[0].candidate(),
                                        &masks,
                                    ));
                                }
                            }
                            Ok(data)
                        })
                        .collect::<ResultValue<Vec<_>>>()
                })
                .transpose()?;
            let mut response = trace_value(&trace);
            if let Some(positions) = positions {
                response["positions"] = Value::Array(positions);
            }
            if include_move_availability {
                response["moveAvailability"] = json!(trace.move_availability());
            }
            Ok(response)
        }
        Request::LogicalSolveWithRank {
            values,
            entries,
            eliminations,
            technique_order,
            rank_options,
            include_positions,
        } => {
            let start = starting_position(&values, entries.as_deref(), eliminations)?;
            let trace = solve_position_with_rank(
                &start,
                profile(technique_order)?.technique_order(),
                rank_options,
            )
            .map_err(hint_error)?;
            let mut response = json!({
                "board": grid_string(trace.board),
                "steps": trace.steps,
                "status": trace.status,
                "techniqueOrder": trace.technique_order,
                "namedScore": trace.named_score,
                "namedScoringVersion": trace.named_scoring_version,
                "rankOptions": trace.rank_options,
                "rankNodesVisited": trace.rank_nodes_visited,
                "terminalRankSearch": trace.terminal_rank_search,
            });
            if include_positions {
                let positions = trace
                    .positions()
                    .map(|snapshot| snapshot_value(&snapshot))
                    .collect();
                response["positions"] = Value::Array(positions);
            }
            Ok(response)
        }
        Request::CompareSolvePaths {
            values,
            entries,
            eliminations,
            technique_order,
            technique,
        } => {
            let start = starting_position(&values, entries.as_deref(), eliminations)?;
            let technique = Technique::from_id(&technique).ok_or(INVALID_TECHNIQUE)?;
            let paths = compare_paths(
                &start,
                profile(technique_order)?.technique_order(),
                technique,
            )
            .map_err(hint_error)?;
            Ok(json!({
                "withTechnique": trace_value(&paths.with_technique),
                "withoutTechnique": trace_value(&paths.without_technique),
            }))
        }
        Request::AlternateSolvePath {
            values,
            entries,
            eliminations,
            technique_order,
            technique,
            max_positions,
        } => {
            let start = starting_position(&values, entries.as_deref(), eliminations)?;
            let technique = Technique::from_id(&technique).ok_or(INVALID_TECHNIQUE)?;
            let result = search_alternate_path(
                &start,
                profile(technique_order)?.technique_order(),
                technique,
                max_positions,
            )
            .map_err(hint_error)?;
            Ok(json!({
                "status": result.status,
                "positionsSearched": result.positions_searched,
                "path": result.path.as_ref().map(trace_value),
            }))
        }
        #[cfg(feature = "teaching")]
        Request::PracticePosition {
            values,
            entries,
            eliminations,
            technique_order,
            technique,
        } => {
            let technique = Technique::from_id(&technique).ok_or(INVALID_TECHNIQUE)?;
            let start = starting_position(&values, entries.as_deref(), eliminations)?;
            let trace = solve_position(&start, profile(technique_order)?.technique_order())
                .map_err(hint_error)?;
            match trace.practice_position(technique) {
                Some(position) => position_with_candidates(&position),
                None => Ok(Value::Null),
            }
        }
        #[cfg(feature = "teaching")]
        Request::CheckPracticeMove {
            values,
            entries,
            eliminations,
            technique,
            action,
        } => {
            let technique = Technique::from_id(&technique).ok_or(INVALID_TECHNIQUE)?;
            let position = starting_position(&values, entries.as_deref(), eliminations)?;
            let proof = check_practice_move(&position, technique, action).map_err(hint_error)?;
            Ok(json!(proof))
        }
        Request::HintPage { collection, index } => {
            return hint_pages::read(collection, index).map(ResponseValue::HintPage);
        }
        Request::ReleaseHints { collection } => {
            hint_pages::release(collection);
            Ok(Value::Null)
        }
        Request::Hints {
            collection,
            values,
            eliminations,
            limit,
            include_patterns,
            disabled_techniques,
            prefer_progress,
            difficulty,
        } => {
            let eliminations = elimination_masks(eliminations)?;
            let limit = match limit {
                Some(HintLimit::All) => usize::MAX,
                Some(HintLimit::Count(count)) => count,
                None => DEFAULT_HINT_LIMIT,
            };
            let position =
                checked_position(&board(&values)?, eliminations.as_ref()).map_err(hint_error)?;
            let disabled = disabled_hint_techniques(&disabled_techniques);
            let choices = if prefer_progress {
                rank_useful_position(
                    &position,
                    limit,
                    &disabled,
                    difficulty.unwrap_or(Difficulty::Medium),
                )
            } else {
                rank_position(&position, limit, &disabled)
            };
            if let Some(collection) = collection {
                let cached = hint_pages::Choices::Classic(choices, *position.masks());
                return hint_pages::start(collection, cached).map(ResponseValue::HintPage);
            }
            if include_patterns {
                let choices: Vec<_> = choices.into_iter()
                    .map(|hint| HintWithPattern::new(hint, position.masks()))
                    .collect();
                return Ok(ResponseValue::HintsWithPatterns {
                    available: choices.len(),
                    choices,
                    candidates: position.masks().to_vec(),
                });
            }
            return Ok(ResponseValue::Hints { available: choices.len(), choices });
        }
        Request::NextDeduction {
            values,
            eliminations,
            disabled_techniques,
        } => {
            let eliminations = elimination_masks(eliminations)?;
            let stages = next_enabled_deduction(
                &board(&values)?,
                eliminations.as_ref(),
                &disabled_hint_techniques(&disabled_techniques),
            )
            .map_err(hint_error)?;
            return Ok(ResponseValue::HintStages(stages.map(Box::new)));
        }
        Request::Deductions {
            values,
            eliminations,
            technique_order,
        } => {
            let eliminations = elimination_masks(eliminations)?;
            let results = deductions(
                &board(&values)?,
                eliminations.as_ref(),
                profile(technique_order)?.technique_order(),
            )
            .map_err(hint_error)?;
            return Ok(ResponseValue::Deductions(results));
        }
        Request::TechniqueCount {
            values,
            eliminations,
            technique,
        } => {
            let board = board(&values)?;
            let eliminations = elimination_masks(eliminations)?;
            let technique = Technique::from_id(&technique).ok_or(INVALID_TECHNIQUE)?;
            let count = TECHNIQUE_COUNTS
                .with_borrow_mut(|scan| scan.count(board, eliminations, technique))
                .map_err(hint_error)?;
            Ok(json!(count))
        }
        Request::ProveRank {
            values,
            entries,
            eliminations,
            pattern,
            target,
            node_budget,
        } => {
            let snapshot = starting_position(&values, entries.as_deref(), eliminations)?;
            let outcome =
                prove_rank_at(&snapshot, &pattern, target, node_budget).map_err(rank_error)?;
            return Ok(ResponseValue::RankOutcome(outcome));
        }
        Request::DiscoverRank {
            values,
            entries,
            eliminations,
            target,
            node_budget,
        } => {
            let snapshot = starting_position(&values, entries.as_deref(), eliminations)?;
            let result = discover_rank_at(&snapshot, target, node_budget).map_err(rank_error)?;
            return Ok(ResponseValue::RankDiscovery(result));
        }
        Request::DiscoverRankDeductions {
            values,
            entries,
            eliminations,
            limit,
            node_budget,
            max_nodes_per_candidate,
        } => {
            let snapshot = starting_position(&values, entries.as_deref(), eliminations)?;
            let result = discover_rank_deductions_at(
                &snapshot,
                limit.unwrap_or(DEFAULT_HINT_LIMIT),
                node_budget,
                max_nodes_per_candidate,
            )
            .map_err(rank_error)?;
            return Ok(ResponseValue::RankDiscoveryScan(result));
        }
        Request::RankDeductions {
            values,
            entries,
            eliminations,
            pattern,
            node_budget,
        } => {
            let snapshot = starting_position(&values, entries.as_deref(), eliminations)?;
            let scan = rank_deductions_at(&snapshot, &pattern, node_budget).map_err(rank_error)?;
            return Ok(ResponseValue::RankScan(scan));
        }
        Request::ReplayRankProof {
            values,
            entries,
            eliminations,
            proof,
        } => {
            let snapshot = starting_position(&values, entries.as_deref(), eliminations)?;
            let valid = replay_rank_proof_at(&snapshot, &proof).map_err(rank_error)?;
            Ok(json!(valid))
        }
        Request::RankProofEffort {
            values,
            entries,
            eliminations,
            proof,
        } => {
            let snapshot = starting_position(&values, entries.as_deref(), eliminations)?;
            let effort = rank_proof_effort_at(&snapshot, &proof).map_err(rank_error)?;
            Ok(json!(effort))
        }
        Request::ClassifyActions {
            values,
            eliminations,
            actions,
        } => {
            let eliminations = elimination_masks(eliminations)?;
            let techniques = classify_actions(&board(&values)?, eliminations.as_ref(), &actions)
                .map_err(hint_error)?;
            Ok(json!(techniques))
        }
        Request::OpeningTechniques { values } => {
            let techniques = opening_techniques(&board(&values)?).map_err(puzzle_error)?;
            Ok(json!(techniques))
        }
        Request::Capabilities => Ok(json!({
            "classic": true,
            "variants": cfg!(feature = "variants"),
            "generation": cfg!(feature = "generation"),
            "teaching": cfg!(feature = "teaching"),
        })),
        #[cfg(not(feature = "variants"))]
        Request::Techniques { variant: true } => Err(unsupported("variants")),
        #[cfg(feature = "variants")]
        Request::Techniques { variant: true } => Ok(variant::catalog()),
        Request::Techniques { variant: false } => Ok(json!({
            "defaultOrder": Technique::DEFAULT_ORDER,
            "difficultyOrder": Technique::DIFFICULTY_ORDER,
            "scoringVersion": SCORING_VERSION,
            "techniques": Technique::ALL.into_iter().map(|technique| json!({
                "id": technique,
                "aliases": technique.aliases(),
                "cost": technique.cost(),
                "difficulty": technique.difficulty(),
                "requiresUniqueSolution": technique.requires_unique_solution(),
            })).collect::<Vec<_>>(),
        })),
        #[cfg(feature = "teaching")]
        Request::LessonExamples => lesson_examples(),
        #[cfg(all(feature = "teaching", feature = "variants"))]
        Request::PracticeExamples {
            technique,
            variant: true,
        } => variant::practice_examples(&technique),
        #[cfg(feature = "teaching")]
        Request::PracticeExamples {
            technique,
            variant: false,
        } => practice_examples(Technique::from_id(&technique).ok_or(INVALID_TECHNIQUE)?),
        #[cfg(all(feature = "teaching", feature = "variants"))]
        Request::GeneratePracticeExample {
            technique,
            seed,
            exclude,
            variant: true,
        } => variant::generate_practice_example(&technique, seed, board(&exclude)?),
        #[cfg(feature = "teaching")]
        Request::GeneratePracticeExample {
            technique,
            seed,
            exclude,
            variant: false,
        } => generate_practice_example(
            Technique::from_id(&technique).ok_or(INVALID_TECHNIQUE)?,
            seed,
            board(&exclude)?,
        ),
        #[cfg(feature = "generation")]
        request @ (Request::GenerateTargeted { .. }
        | Request::GenerateConstrained { .. }
        | Request::GenerateFromPool(_)) => finish_generation(request),
        #[cfg(all(feature = "generation", feature = "variants"))]
        request @ Request::GenerateVariant(_) => finish_generation(request),
        #[cfg(all(feature = "teaching", not(feature = "variants")))]
        Request::PracticeExamples { variant: true, .. }
        | Request::GeneratePracticeExample { variant: true, .. } => Err(unsupported("variants")),
        #[cfg(feature = "generation")]
        Request::GenerationStart { job, request } => {
            GENERATION.with_borrow_mut(|jobs| match jobs.entry(job) {
                Entry::Occupied(_) => Err((
                    "generation-active",
                    "This generation request is already active.",
                )),
                Entry::Vacant(slot) => {
                    slot.insert(start_generation(*request)?.1);
                    Ok(json!({ "status": "pending", "attempts": 0 }))
                }
            })
        }
        #[cfg(feature = "generation")]
        Request::GenerationAdvance { job } => generation_update(job, false),
        #[cfg(feature = "generation")]
        Request::GenerationCancel { job } => generation_update(job, true),
    };
    result.map(ResponseValue::Json)
}

#[cfg(feature = "generation")]
fn finish_generation(request: Request) -> ResultValue {
    start_generation(request)?
        .1
        .finish()
        .map(GenerationOutput::into_wire)
        .map_err(generation_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SPARSE: &str =
        "345000000000200010000000000020100000000004500600000007800750000000060040000000300";

    fn request(data: Value) -> Value {
        serde_json::from_slice(&process(data.to_string().as_bytes())).unwrap()
    }

    #[cfg(feature = "variants")]
    #[test]
    fn sized_variant_protocol_retains_the_shared_assignment_and_source_rule_order() {
        let position = json!({
            "version": 2, "grid": { "size": 4, "boxRows": 2, "boxColumns": 2 },
            "digits": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            "rules": [
                {"type":"algebraic-cage","cells":[5,6,9],"total":{"type":"variable","name":"x","offset":0},"label":"x"},
                {"type":"algebraic-cage","cells":[11,15],"total":{"type":"variable","name":"x","offset":1},"label":"x+1"},
                {"type":"algebraic-cage","cells":[0],"total":{"type":"variable","name":"x","offset":-5},"label":"x-5"},
            ],
        });
        let send = |operation: &str| request(json!({
            "type": "sized-variant", "operation": operation, "position": position, "rule": 2,
        }));
        assert_eq!(send("analyze")["value"], "unique");
        assert_eq!(send("solve")["value"]["variables"]["x"], 6);
        assert_eq!(send("cage-proof")["value"]["target"], 2);
        assert_eq!(send("cage-proof")["value"]["actions"].as_array().unwrap().len(), 3);
        let trace = send("trace");
        let positions = trace["value"].as_array().unwrap();
        assert_eq!(positions[0]["step"]["type"], "cage");
        assert_eq!(positions.last().unwrap()["digits"], send("solve")["value"]["digits"]);

    }

    #[test]
    fn sized_classic_protocol_does_not_discard_rules_or_coerce_dimensions() {
        let position = json!({
            "version": 2,
            "grid": { "size": 4, "boxRows": 2, "boxColumns": 2 },
            "digits": [0,2,3,4,3,4,1,2,2,1,4,3,4,3,2,1],
        });
        let run = |operation: &str, position: Value| request(json!({
            "type": "sized-classic", "operation": operation, "position": position,
        }));
        assert_eq!(run("analyze", position.clone())["value"], "unique");
        assert_eq!(run("candidates", position.clone())["value"][0], 1);
        assert_eq!(run("solve", position.clone())["value"][0], 1);
        assert_eq!(run("next-deduction", position.clone())["value"], json!({
            "technique": "naked-single", "houses": [],
            "candidates": [{"cell": 0, "digit": 1}],
            "actions": [{"place": {"cell": 0, "digit": 1}}],
        }));
        let mut unsupported = position.clone();
        unsupported["rules"] = json!([{ "type": "diagonal" }]);
        assert!(run("analyze", unsupported).get("error").is_some());
        let mut old_version = position.clone();
        old_version["version"] = json!(1);
        assert_eq!(run("analyze", old_version)["code"], "unsupported-format");
        let mut invalid_grid = position;
        invalid_grid["digits"][0] = json!(9);
        assert_eq!(run("analyze", invalid_grid)["code"], "invalid-grid");
    }

    #[test]
    fn capabilities_match_build_features_and_omitted_operations_preserve_the_solver() {
        assert_eq!(
            request(json!({"type":"capabilities"}))["value"],
            json!({
                "classic": true,
                "variants": cfg!(feature = "variants"),
                "generation": cfg!(feature = "generation"),
                "teaching": cfg!(feature = "teaching"),
            })
        );
        let solved =
            "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
        for (enabled, operation) in [
            (
                cfg!(feature = "variants"),
                json!({"type":"techniques", "variant":true}),
            ),
            (
                cfg!(feature = "generation"),
                json!({"type":"impossible-templates"}),
            ),
            (
                cfg!(feature = "teaching"),
                json!({"type":"practice-examples", "technique":"naked-single"}),
            ),
        ] {
            let reply = request(operation);
            if enabled {
                assert!(reply.get("value").is_some(), "{reply}");
            } else {
                assert_eq!(reply["code"], "unsupported-capability", "{reply}");
            }
            assert_eq!(
                request(json!({"type":"rate", "values":solved}))["value"]["status"],
                json!({"solved":"beginner"})
            );
        }
        if !cfg!(feature = "generation") {
            assert_eq!(
                request(
                    json!({"type":"generation-start", "job":9, "request":{"type":"generate-variant"}})
                )["code"],
                "unsupported-capability"
            );
        }
    }

    #[test]
    fn protocol_distinguishes_a_missing_profile_from_an_empty_profile() {
        let rating = request(json!({"type":"rate", "values":SPARSE}));
        assert_eq!(rating["value"]["score"]["points"], 846);
        assert_eq!(rating["value"]["status"], json!({"solved":"medium"}));
        assert_eq!(rating["value"]["scoringVersion"], SCORING_VERSION);
        assert_eq!(
            request(json!({"type":"rate", "values":SPARSE, "techniqueOrder":[]}))["code"],
            "search-limit"
        );
        assert_eq!(
            request(json!({"type":"rate", "values":SPARSE, "techniqueOrder":["unknown"]}))["code"],
            "invalid-profile"
        );
        assert_eq!(
            request(json!({"type":"rate", "values":"x"}))["code"],
            "invalid-grid"
        );
    }
}

#[cfg_attr(feature = "cli", allow(dead_code))]
fn unsupported(capability: &str) -> (&'static str, &'static str) {
    (
        "unsupported-capability",
        match capability {
            "variants" => "This engine build does not include variant rules.",
            "generation" => "This engine build does not include puzzle generation.",
            _ => "This engine build does not include teaching fixtures.",
        },
    )
}

#[cfg(any(target_arch = "wasm32", test))]
fn unavailable_capability(request: &Value) -> Option<&'static str> {
    let kind = request["type"].as_str()?;
    if !cfg!(feature = "generation")
        && matches!(
            kind,
            "canonical-puzzles"
                | "impossible-templates"
                | "generate-targeted"
                | "generate-mini"
                | "generate-six"
                | "generate-algebraic"
                | "generate-constrained"
                | "generate-from-pool"
                | "generate-variant"
                | "generation-start"
                | "generation-advance"
                | "generation-cancel"
        )
    {
        return Some("generation");
    }
    if !cfg!(feature = "teaching")
        && matches!(
            kind,
            "lesson-examples"
                | "practice-examples"
                | "generate-practice-example"
                | "practice-position"
                | "check-practice-move"
        )
    {
        return Some("teaching");
    }
    if !cfg!(feature = "teaching")
        && kind == "variant"
        && matches!(
            request["operation"].as_str(),
            Some("practice-position" | "check-practice-move")
        )
    {
        return Some("teaching");
    }
    if !cfg!(feature = "variants")
        && (matches!(kind, "variant" | "sized-variant" | "generate-variant" | "generate-algebraic")
            || (matches!(
                kind,
                "techniques" | "practice-examples" | "generate-practice-example"
            ) && request["variant"] == true))
    {
        return Some("variants");
    }
    if kind == "generation-start" {
        return unavailable_capability(&request["request"]);
    }
    None
}
