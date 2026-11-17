use super::{PuzzleRule, VariantDeduction, VariantPosition, VariantPuzzle, VariantTechnique};
use crate::{CELLS, Candidate, HintAction, Technique, parse_givens};

mod examples;

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
    let snapshot = compiled
        .proof_position(&position.entries, &position.eliminations)
        .map_err(|_| VariantPracticeError::InvalidPosition(index))?;
    let proofs = compiled.explain(&snapshot, technique);
    let mut answers: Vec<_> = proofs
        .iter()
        .flat_map(|proof| proof.actions.iter().copied())
        .collect();
    answers.sort_unstable();
    answers.dedup();
    let deduction = proofs
        .into_iter()
        .find(|proof| proof.actions.contains(&suggestion))
        .ok_or(VariantPracticeError::MissingProof(index))?;
    Ok(VariantPracticeExercise {
        position,
        candidates: snapshot.masks,
        answers,
        suggestion,
        deduction,
    })
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
