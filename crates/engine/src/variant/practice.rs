#[cfg(all(feature = "teaching", feature = "wasm-api", any(target_arch = "wasm32", test, feature = "cli")))]
use super::DEFAULT_VARIANT_SEARCH_NODES;
#[cfg(all(feature = "teaching", feature = "wasm-api", any(target_arch = "wasm32", test, feature = "cli")))]
use crate::{Analysis, Board, Difficulty};
#[cfg(all(feature = "teaching", feature = "wasm-api", any(target_arch = "wasm32", test, feature = "cli")))]
use super::symmetry::SquareTransform;
#[cfg(all(feature = "teaching", feature = "wasm-api", any(target_arch = "wasm32", test, feature = "cli")))]
use crate::Random;
use super::{
    CompiledVariant, PuzzleRule, VariantDeduction, VariantEvidence,
    VariantHouseKind, VariantPosition, VariantPuzzle, VariantTechnique,
};
use crate::{CELLS, Candidate, HintAction, Technique, parse_givens};

mod examples;
#[cfg(all(feature = "teaching", feature = "wasm-api", any(target_arch = "wasm32", test, feature = "cli")))]
mod focused;

/// A fixed variant exercise and the actions justified by its target technique.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantPracticeExercise {
    /// Givens, placed digits, established removals, and active rules.
    pub position: VariantPosition,
    /// Candidate masks before the target deduction.
    #[cfg_attr(feature = "wasm-api", serde(with = "super::wire::masks"))]
    pub candidates: [u16; CELLS],
    /// Every single placement or removal accepted for the target technique.
    pub answers: Vec<HintAction>,
    /// One of the accepted actions for a player who asks for a suggestion.
    pub suggestion: HintAction,
    /// A proof of the suggested action.
    pub deduction: VariantDeduction,
}

/// An expected exercise could not be reconstructed from the built-in catalog.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VariantPracticeError {
    /// The exercise at this index has an invalid position or definition.
    InvalidPosition(usize),
    /// The selected technique cannot explain the expected action in this exercise.
    MissingProof(usize),
}

/// Load three distinct exercises for a variant technique.
///
/// Classic techniques reuse the classic exercises in structured positions.
/// Pattern Overlay also includes a worked Jigsaw exercise.
/// The candidate masks retain the candidates that the target technique can
/// remove. Submit an action to [`crate::CompiledVariant::check_practice_move`]
/// to check it using the same detector and rule set.
pub fn variant_practice_examples(
    technique: VariantTechnique,
) -> Result<Vec<VariantPracticeExercise>, VariantPracticeError> {
    let classic = match technique {
        VariantTechnique::FullHouse => Some(Technique::FullHouse),
        VariantTechnique::NakedSingle => Some(Technique::NakedSingle),
        VariantTechnique::HiddenSingle => Some(Technique::HiddenSingle),
        VariantTechnique::Classic(technique) => Some(technique),
        _ => None,
    };
    if let Some(classic) = classic {
        classic
            .practice_examples()
            .iter()
            .enumerate()
            .map(|(index, example)| {
                if index == 0 && classic == Technique::PatternOverlay {
                    return exercise(
                        index,
                        examples::pattern_overlay_jigsaw(),
                        technique,
                        HintAction::Eliminate(Candidate { cell: 76, digit: 7 }),
                    );
                }
                let snapshot = example
                    .position()
                    .map_err(|_| VariantPracticeError::InvalidPosition(index))?;
                let position = VariantPosition {
                    puzzle: VariantPuzzle::classic(snapshot.givens),
                    entries: snapshot.entries,
                    eliminations: snapshot.eliminations,
                };
                exercise(index, position, technique, example.expected_actions[0])
            })
            .collect()
    } else {
        examples::examples(technique)
            .into_iter()
            .enumerate()
            .map(|(index, seed)| {
                let givens = parse_givens(seed.givens)
                    .ok_or(VariantPracticeError::InvalidPosition(index))?;
                let mut puzzle = VariantPuzzle::classic(givens);
                puzzle.rules = seed.rules;
                exercise(
                    index,
                    VariantPosition::new(puzzle),
                    technique,
                    seed.suggestion,
                )
            })
            .collect()
    }
}

/// Build a seeded variant drill by changing clues around a verified teaching move.
#[cfg(all(feature = "teaching", feature = "wasm-api", any(target_arch = "wasm32", test, feature = "cli")))]
pub(crate) fn generate_practice_example(
    technique: VariantTechnique,
    seed: u32,
    exclude: Board,
    focused: bool,
) -> Option<VariantPracticeExercise> {
    let focused = focused && technique.difficulty() >= Difficulty::Medium;
    let mut random = Random::from_seed(seed);
    let mut examples = if focused {
        focused_practice_examples(technique)
    } else {
        variant_practice_examples(technique)
    }.ok()?;
    random.shuffle(&mut examples);
    let mut transforms = SquareTransform::ALL;
    let mut fixed_values = Vec::new();
    if focused {
        random.shuffle(&mut transforms);
        fixed_values.extend(examples.iter().map(|example| lesson_values(&example.position)));
    }
    let distinct = |position: &VariantPosition| {
        let values = lesson_values(position);
        values != exclude && !fixed_values.contains(&values)
    };
    let attempts = if focused { examples.len() * transforms.len() } else { 6 };
    let build = if focused { focused::exercise } else { exercise_with };
    for (attempt, source) in examples.iter().cycle().take(attempts).enumerate() {
        let transform = if focused {
            transforms[(attempt / examples.len() + attempt % examples.len()) % transforms.len()]
        } else {
            transforms[random.index(transforms.len())]
        };
        let mut position = source.position.clone();
        transform.position(&mut position);
        let mut candidate = source.suggestion.candidate();
        candidate.cell = transform.cell(candidate.cell);
        let suggestion = match source.suggestion {
            HintAction::Place(_) => HintAction::Place(candidate),
            HintAction::Eliminate(_) => HintAction::Eliminate(candidate),
        };
        let mut compiled = position.puzzle.compile().ok()?;
        let solution = compiled.solve(&position.entries, &position.eliminations, DEFAULT_VARIANT_SEARCH_NODES).ok()?;
        let mut order: [usize; CELLS] = std::array::from_fn(|cell| cell);
        random.shuffle(&mut order);
        let wanted = 2 + random.index(6);
        let mut edits = 0;
        // A reflected exercise still teaches the move if edits to the givens fail.
        let mut generated = if focused && distinct(&position) {
            exercise_with(&compiled, 0, &position, technique, Some(suggestion)).ok()
        } else {
            None
        };

        for cell in order.into_iter().take(32) {
            if cell == candidate.cell || position.entries[cell] != 0 {
                continue;
            }
            let before = position.puzzle.givens[cell];
            let after = if before == 0 { solution[cell] } else { 0 };
            position.puzzle.givens[cell] = after;
            compiled.givens[cell] = after;
            let (entries, eliminations) = if focused {
                // Prefilled moves must not hide a second solution after removing a given.
                (&[0; CELLS], &[0; CELLS])
            } else {
                (&position.entries, &position.eliminations)
            };
            let unique = after != 0
                || compiled.analyze(entries, eliminations, DEFAULT_VARIANT_SEARCH_NODES) == Ok(Analysis::Unique);
            if unique && let Ok(example) = build(&compiled, 0, &position, technique, Some(suggestion)) {
                edits += 1;
                if distinct(&example.position) {
                    generated = Some(example);
                }
                if edits == wanted {
                    break;
                }
            } else {
                position.puzzle.givens[cell] = before;
                compiled.givens[cell] = before;
            }
        }
        if generated.is_some() {
            return generated;
        }
    }
    None
}

#[cfg(all(feature = "teaching", feature = "wasm-api", any(target_arch = "wasm32", test, feature = "cli")))]
fn lesson_values(position: &VariantPosition) -> Board {
    std::array::from_fn(|cell| position.puzzle.givens[cell].max(position.entries[cell]))
}

#[cfg(all(feature = "teaching", feature = "wasm-api", any(target_arch = "wasm32", test, feature = "cli")))]
pub(crate) use focused::focused_practice_examples;

fn exercise(
    index: usize,
    position: VariantPosition,
    technique: VariantTechnique,
    suggestion: HintAction,
) -> Result<VariantPracticeExercise, VariantPracticeError> {
    let compiled = position
        .puzzle
        .compile()
        .map_err(|_| VariantPracticeError::InvalidPosition(index))?;
    exercise_with(&compiled, index, &position, technique, Some(suggestion))
}

fn exercise_with(
    compiled: &CompiledVariant,
    index: usize,
    position: &VariantPosition,
    technique: VariantTechnique,
    suggestion: Option<HintAction>,
) -> Result<VariantPracticeExercise, VariantPracticeError> {
    let snapshot = compiled
        .proof_position(&position.entries, &position.eliminations)
        .map_err(|_| VariantPracticeError::InvalidPosition(index))?;
    let mut proofs = compiled.explain(&snapshot, technique);
    if technique == VariantTechnique::LockedCandidates {
        proofs.retain(diagonal_intersection);
    }
    let mut answers: Vec<_> = proofs
        .iter()
        .flat_map(|proof| proof.actions.iter().copied())
        .collect();
    answers.sort_unstable();
    answers.dedup();
    let deduction = proofs
        .into_iter()
        .find(|proof| suggestion.is_none_or(|action| proof.actions.contains(&action)))
        .ok_or(VariantPracticeError::MissingProof(index))?;
    Ok(VariantPracticeExercise {
        position: position.clone(),
        candidates: snapshot.masks,
        answers,
        suggestion: suggestion.unwrap_or(deduction.actions[0]),
        deduction,
    })
}

fn diagonal_intersection(proof: &VariantDeduction) -> bool {
    matches!(proof.evidence,
        VariantEvidence::Intersection { source: VariantHouseKind::Diagonal(_), .. } |
        VariantEvidence::Intersection { target: VariantHouseKind::Diagonal(_), .. }
    )
}

struct ExampleSeed {
    givens: &'static str,
    rules: Vec<PuzzleRule>,
    suggestion: HintAction,
}

fn seed<const N: usize>(
    givens: &'static str,
    cell: usize,
    digit: u8,
    rules: [PuzzleRule; N],
) -> ExampleSeed {
    ExampleSeed {
        givens,
        rules: rules.into(),
        suggestion: HintAction::Eliminate(Candidate { cell, digit }),
    }
}
