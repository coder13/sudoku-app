//! Classic generation requests and the job lifecycle shared by Classic and variant generation.

use std::{
    borrow::Cow,
    cell::RefCell,
    collections::{HashMap, HashSet, hash_map::Entry},
};

use serde::Deserialize;
use serde_json::{Value, json};

use super::{
    INVALID_PROFILE, INVALID_TECHNIQUE, Request, ResultValue, board, grid_string, profile,
};
use crate::{
    Board, Difficulty, GeneratedPuzzle, GenerationConflict, GenerationCriteria, GenerationError,
    GenerationRating, GenerationSearch, GenerationStep, GenerationTarget, SolverProfile, Technique,
    TechniqueTargetMode,
    generation::{MatchedPath, start_builtin_pool, start_matching_path, start_targeted_path},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MatchingRequest {
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
    required_techniques: Vec<String>,
    #[serde(default)]
    exclude: Vec<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub(super) enum ClueCount {
    Exact(usize),
    Range([usize; 2]),
}

impl ClueCount {
    pub(super) fn range(self) -> std::ops::RangeInclusive<usize> {
        match self {
            Self::Exact(count) => count..=count,
            Self::Range([min, max]) => min..=max,
        }
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
pub(super) enum TechniqueRequest {
    Id(String),
    WithMode {
        id: String,
        mode: TechniqueTargetMode,
    },
}

impl TechniqueRequest {
    pub(super) fn parts(self) -> (String, TechniqueTargetMode) {
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
pub(super) enum Target {
    Difficulty {
        level: Difficulty,
        technique_order: Option<Vec<String>>,
    },
    Opening {
        technique: String,
    },
}

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

pub(super) fn rating_target(
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

impl MatchingRequest {
    fn start(
        self,
        templates: Option<Vec<String>>,
    ) -> ResultValue<(SolverProfile, ActiveGeneration)> {
        let required = self.required_techniques.iter()
            .map(|id| Technique::from_id(id).ok_or(INVALID_TECHNIQUE))
            .collect::<Result<Vec<_>, _>>()?;
        let rating = rating_target(self.score, self.difficulty)?
            .or_else(|| (!required.is_empty()).then(|| GenerationRating::Score(0..=u32::MAX)));
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
                required,
            )
            .map_err(generation_error)?;
            let search = generation_output(search, self.include_rating, &profile);
            return Ok((profile, exclude_puzzles(search, self.exclude)?));
        }
        let search = start_builtin_pool(self.seed, &criteria, mode, self.max_attempts, required)
            .map_err(generation_error)?;
        Ok((
            profile,
            exclude_puzzles(search.map(GenerationOutput::Rated), self.exclude)?,
        ))
    }
}

pub(super) enum GenerationOutput {
    Board(Board),
    Rated(GeneratedPuzzle),
    #[cfg(feature = "variants")]
    Variant(Box<crate::GeneratedVariant>),
}

impl GenerationOutput {
    pub(super) fn into_wire(self) -> Value {
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

pub(super) type ActiveGeneration = GenerationSearch<'static, GenerationOutput>;

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
    static GENERATION: RefCell<HashMap<u32, ActiveGeneration>> = RefCell::new(HashMap::new());
    static PUZZLE_KEYS: RefCell<HashMap<Board, Board>> = RefCell::new(HashMap::new());
}

pub(super) fn puzzle_key(board: Board) -> Board {
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
pub(super) enum GenerationProfile {
    Classic(SolverProfile),
    #[cfg(feature = "variants")]
    Variant(Vec<crate::VariantTechnique>),
}

pub(super) fn start_generation(
    request: Request,
) -> ResultValue<(GenerationProfile, ActiveGeneration)> {
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
                        start_targeted_path(
                            seed,
                            GenerationTarget::Opening(technique),
                            max_attempts,
                        ),
                    )
                }
            };
            let search =
                generation_output(search.map_err(generation_error)?, include_rating, &profile);
            Ok((
                GenerationProfile::Classic(profile),
                exclude_puzzles(search, exclude)?,
            ))
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

pub(super) fn start_job(job: u32, request: Request) -> ResultValue {
    GENERATION.with_borrow_mut(|jobs| match jobs.entry(job) {
        Entry::Occupied(_) => Err((
            "generation-active",
            "This generation request is already active.",
        )),
        Entry::Vacant(slot) => {
            slot.insert(start_generation(request)?.1);
            Ok(json!({ "status": "pending", "attempts": 0 }))
        }
    })
}

pub(super) fn update_job(job: u32, cancel: bool) -> ResultValue {
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

pub(super) fn finish_generation(request: Request) -> ResultValue {
    start_generation(request)?
        .1
        .finish()
        .map(GenerationOutput::into_wire)
        .map_err(generation_error)
}
