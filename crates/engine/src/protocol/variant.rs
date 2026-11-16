use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    Analysis, DEFAULT_HINT_LIMIT, DEFAULT_VARIANT_SEARCH_NODES, Difficulty, HintAction, PuzzleRule,
    VARIANT_SCORING_VERSION, VariantClueLayout, VariantDefinitionError, VariantGenerationError,
    VariantGenerationOptions, VariantLogicalError, VariantPosition, VariantPositionError,
    VariantPuzzle, VariantTechnique, VariantVisibility, VariantVisibilityError,
    start_variant_generation, variant_practice_examples,
};

use super::{
    ActiveGeneration, ClueCount, GenerationOutput, GenerationProfile, INVALID_ELIMINATIONS,
    INVALID_LESSON, INVALID_TECHNIQUE, ResultValue, TechniqueRequest, grid_string, puzzle_error,
    rating_target,
};

pub(super) fn catalog() -> Value {
    json!({
        "defaultOrder": VariantTechnique::DEFAULT_ORDER,
        "scoringVersion": VARIANT_SCORING_VERSION,
        "techniques": VariantTechnique::all().map(|technique| {
            let (aliases, unique) = match technique {
                VariantTechnique::Classic(classic) => (classic.aliases(), classic.requires_unique_solution()),
                _ => (&[][..], false),
            };
            json!({
                "id": technique,
                "aliases": aliases,
                "cost": technique.cost(),
                "difficulty": technique.difficulty(),
                "requiresUniqueSolution": unique,
            })
        }).collect::<Vec<_>>(),
    })
}

pub(super) fn practice_examples(id: &str) -> ResultValue {
    let technique = VariantTechnique::from_id(id).ok_or(INVALID_TECHNIQUE)?;
    Ok(json!(
        variant_practice_examples(technique).map_err(|_| INVALID_LESSON)?
    ))
}

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum Operation {
    #[default]
    Normalize,
    Candidates,
    Analyze,
    Solve,
    Hints,
    Rate,
    Trace,
    ReplayStep,
    PracticePosition,
    CheckPracticeMove,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Options {
    max_nodes: Option<u32>,
    seed: Option<u32>,
    technique_order: Option<Vec<String>>,
    technique: Option<String>,
    limit: Option<usize>,
    step_index: Option<usize>,
    action: Option<HintAction>,
    visibility: Option<Box<VariantVisibility>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct GenerationRequest {
    seed: u32,
    max_attempts: u32,
    max_nodes: Option<u32>,
    template: VariantPuzzle,
    #[serde(default)]
    derived_clues: Vec<VariantClueLayout>,
    givens: ClueCount,
    variant_clues: Option<ClueCount>,
    required_rule: Option<String>,
    score: Option<[u32; 2]>,
    difficulty: Option<Difficulty>,
    technique: Option<TechniqueRequest>,
    technique_order: Option<Vec<String>>,
    #[serde(default)]
    exclude: Vec<VariantPuzzle>,
}

impl GenerationRequest {
    pub(super) fn start(self) -> ResultValue<(GenerationProfile, ActiveGeneration)> {
        let order = technique_order(self.technique_order.as_deref())?;
        let technique = self
            .technique
            .map(|technique| {
                let (id, mode) = technique.parts();
                VariantTechnique::from_id(&id)
                    .map(|technique| (technique, mode))
                    .ok_or(INVALID_TECHNIQUE)
            })
            .transpose()?;
        let options = VariantGenerationOptions {
            seed: self.seed,
            max_attempts: self.max_attempts,
            max_nodes: self.max_nodes.unwrap_or(DEFAULT_VARIANT_SEARCH_NODES),
            template: self.template,
            derived_clues: self.derived_clues,
            givens: self.givens.range(),
            variant_clues: self.variant_clues.map(ClueCount::range),
            rating: rating_target(self.score, self.difficulty)?,
            required_rule: self.required_rule,
            technique,
            technique_order: order.clone(),
            exclude: self.exclude,
        };
        let search = start_variant_generation(options)
            .map_err(generation_error)?
            .map(|result| GenerationOutput::Variant(Box::new(result)));
        Ok((GenerationProfile::Variant(order), search))
    }
}

fn generation_error(error: VariantGenerationError) -> (&'static str, &'static str) {
    use VariantGenerationError::*;
    match error {
        Definition(error) => definition_error(error),
        ConflictingTemplate => ("conflict", "The template givens conflict with its rules."),
        InvalidGivenCount => (
            "invalid-clue-count",
            "Choose a given count between 0 and 81.",
        ),
        InvalidClueCount => (
            "invalid-variant-clue-count",
            "Choose a nonempty range of variant clue counts.",
        ),
        InvalidLayout(_) => (
            "invalid-clue-layout",
            "A derived clue has invalid cells, dimensions, or marker settings.",
        ),
        MissingRequiredRule => (
            "missing-required-rule",
            "Include the required family in the fixed or derived rules.",
        ),
        InvalidRating => (
            "invalid-rating-target",
            "Choose a rating that fits the profile and technique target.",
        ),
        InvalidTechnique => (
            "incompatible-technique-target",
            "Choose a technique that can meet the requested target.",
        ),
        InvalidExclusion(_) => (
            "invalid-exclusion",
            "Every excluded puzzle must have a valid rule definition.",
        ),
    }
}

fn technique_order(ids: Option<&[String]>) -> ResultValue<Vec<VariantTechnique>> {
    let Some(ids) = ids else {
        return Ok(VariantTechnique::DEFAULT_ORDER.to_vec());
    };
    let mut techniques = Vec::with_capacity(ids.len());
    for id in ids {
        let technique = VariantTechnique::from_id(id).ok_or(INVALID_TECHNIQUE)?;
        if techniques.contains(&technique) {
            return Err((
                "duplicate-technique",
                "Each technique can appear once in the solver order.",
            ));
        }
        techniques.push(technique);
    }
    Ok(techniques)
}

pub(super) fn execute(operation: Operation, input: Value, options: Options) -> ResultValue {
    let puzzle = &input["puzzle"];
    if puzzle["regions"]["type"]
        .as_str()
        .is_some_and(|id| !matches!(id, "boxes" | "jigsaw"))
        || puzzle["rules"].as_array().is_some_and(|rules| {
            rules.iter().any(|rule| {
                rule["type"]
                    .as_str()
                    .is_some_and(|id| !PuzzleRule::supports_id(id))
            })
        })
    {
        return Err((
            "unsupported-rule",
            "This engine does not support a rule in the puzzle definition.",
        ));
    }
    let position: VariantPosition = serde_json::from_value(input).map_err(|_| (
        "invalid-variant-position",
        "The position must contain a versioned puzzle, an 81-cell grid, and valid optional candidate masks.",
    ))?;
    let position = match &options.visibility {
        Some(_)
            if matches!(
                operation,
                Operation::Analyze | Operation::Solve | Operation::Candidates
            ) =>
        {
            return Err((
                "invalid-visibility",
                "Use a visible position to analyze only the visible clues.",
            ));
        }
        Some(visibility) => position.visible(visibility).map_err(visibility_error)?,
        None => position,
    };
    let order = || technique_order(options.technique_order.as_deref());
    let technique = || {
        options
            .technique
            .as_deref()
            .and_then(VariantTechnique::from_id)
            .ok_or(INVALID_TECHNIQUE)
    };
    let trace = || position.solve_logically(&order()?).map_err(logical_error);
    let budget = options.max_nodes.unwrap_or(DEFAULT_VARIANT_SEARCH_NODES);
    let entries = &position.entries;
    let eliminations = &position.eliminations;
    if eliminations.iter().any(|&mask| mask & !crate::DIGITS != 0) {
        return Err(INVALID_ELIMINATIONS);
    }
    match operation {
        Operation::Rate => return Ok(json!(position.rate(&order()?).map_err(logical_error)?)),
        Operation::Trace => return Ok(json!(trace()?)),
        Operation::ReplayStep => {
            let step = options
                .step_index
                .ok_or(("invalid-step", "Choose a step index."))?;
            return Ok(json!(trace()?.replay_step(step)));
        }
        Operation::PracticePosition => {
            return Ok(json!(trace()?.practice_position(technique()?)));
        }
        _ => {}
    }
    let compiled = position.puzzle.compile().map_err(definition_error)?;
    Ok(match operation {
        Operation::Normalize => json!(position),
        Operation::Candidates => json!(
            compiled
                .candidates(entries, eliminations)
                .map_err(position_error)?
                .as_slice()
        ),
        Operation::Analyze => {
            let analysis = compiled
                .analyze(entries, eliminations, budget)
                .map_err(position_error)?;
            json!(if analysis == Analysis::Unique {
                "unique"
            } else {
                puzzle_error(analysis).0
            })
        }
        Operation::Solve => {
            let solution = match options.seed {
                Some(seed) => compiled.solve_seeded(entries, eliminations, budget, seed),
                None => compiled.solve(entries, eliminations, budget),
            };
            json!(grid_string(solution.map_err(position_error)?))
        }
        Operation::Hints => json!(
            compiled
                .ranked_hints(
                    entries,
                    eliminations,
                    &order()?,
                    options.limit.unwrap_or(DEFAULT_HINT_LIMIT)
                )
                .map_err(position_error)?
        ),
        Operation::CheckPracticeMove => {
            let action = options.action.ok_or((
                "invalid-action",
                "Provide a placement or candidate removal.",
            ))?;
            json!(
                compiled
                    .check_practice_move(entries, eliminations, technique()?, action)
                    .map_err(position_error)?
            )
        }
        _ => unreachable!("rating and trace operations compile the puzzle internally"),
    })
}

fn logical_error(error: VariantLogicalError) -> (&'static str, &'static str) {
    match error {
        VariantLogicalError::Definition(error) => definition_error(error),
        VariantLogicalError::Position(error) => position_error(error),
    }
}

fn visibility_error(error: VariantVisibilityError) -> (&'static str, &'static str) {
    use VariantVisibilityError::*;
    match error {
        InvalidCells | InvalidRules => (
            "invalid-visibility",
            "Visible cells and rules must have distinct, valid indices.",
        ),
        HiddenMarkers => (
            "invalid-visibility",
            "A marker family can use its negative rules only after all of its markers are visible.",
        ),
        InvalidRemovals => INVALID_ELIMINATIONS,
    }
}

fn definition_error(error: VariantDefinitionError) -> (&'static str, &'static str) {
    use VariantDefinitionError::*;
    match error {
        UnsupportedVersion(_) => (
            "unsupported-variant-version",
            "This engine does not support the puzzle format version.",
        ),
        InvalidGiven(_) => ("invalid-grid", "Each given digit must be between 0 and 9."),
        InvalidRegionCount | OverlappingRegion(_) | DisconnectedRegion(_) => (
            "invalid-regions",
            "Jigsaw regions must be nine connected groups of nine cells and cover the grid exactly once.",
        ),
        InvalidHouse(_) => (
            "invalid-house",
            "Each house must contain nine distinct indices between 0 and 80.",
        ),
        InvalidCage(_) => (
            "invalid-cage",
            "A cage must contain one to nine distinct indices between 0 and 80.",
        ),
        OverlappingCage(_) => ("overlapping-cages", "Killer cages cannot share cells."),
        InvalidCageSum(_) => (
            "invalid-cage-sum",
            "The cage sum must be possible with distinct digits.",
        ),
        IncompleteCages => (
            "incomplete-cages",
            "This Killer rule requires cages that cover every cell.",
        ),
        InvalidRule(_) => (
            "invalid-rule",
            "A puzzle rule has invalid cell references or parameters.",
        ),
    }
}

fn position_error(error: VariantPositionError) -> (&'static str, &'static str) {
    match error {
        VariantPositionError::Puzzle(analysis) => puzzle_error(analysis),
        VariantPositionError::InvalidEliminations(_) => INVALID_ELIMINATIONS,
    }
}
