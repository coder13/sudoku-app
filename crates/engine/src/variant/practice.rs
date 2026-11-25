#[cfg(all(
    feature = "teaching",
    feature = "wasm-api",
    any(target_arch = "wasm32", test, feature = "cli")
))]
use super::DEFAULT_VARIANT_SEARCH_NODES;
#[cfg(all(
    feature = "teaching",
    feature = "wasm-api",
    any(target_arch = "wasm32", test, feature = "cli")
))]
use super::symmetry::SquareTransform;
use super::{
    CompiledVariant, PuzzleRule, VariantDeduction, VariantEvidence, VariantHouseKind,
    VariantPosition, VariantPuzzle, VariantTechnique,
};
#[cfg(all(
    feature = "teaching",
    feature = "wasm-api",
    any(target_arch = "wasm32", test, feature = "cli")
))]
use crate::Random;
#[cfg(all(
    feature = "teaching",
    feature = "wasm-api",
    any(target_arch = "wasm32", test, feature = "cli")
))]
use crate::{Analysis, Board};
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

/// Load three distinct exercises positioned where the target is easiest.
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
                    shades: [0; crate::CELLS],
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
                let mut position = VariantPosition::new(puzzle);
                for &(cell, mask) in seed.removals {
                    position.eliminations[cell] = mask;
                }
                exercise(index, position, technique, seed.suggestion)
            })
            .collect()
    }
}

/// Build a seeded variant drill by changing clues around a verified teaching move.
#[cfg(all(
    feature = "teaching",
    feature = "wasm-api",
    any(target_arch = "wasm32", test, feature = "cli")
))]
pub(crate) fn generate_practice_example(
    technique: VariantTechnique,
    seed: u32,
    exclude: Board,
) -> Option<VariantPracticeExercise> {
    let mut random = Random::from_seed(seed);
    let mut examples = variant_practice_examples(technique).ok()?;
    random.shuffle(&mut examples);
    for source in examples.iter().cycle().take(6) {
        let transform = SquareTransform::ALL[random.index(SquareTransform::ALL.len())];
        let mut position = source.position.clone();
        transform.position(&mut position);
        let mut candidate = source.suggestion.candidate();
        candidate.cell = transform.cell(candidate.cell);
        let suggestion = match source.suggestion {
            HintAction::Place(_) => HintAction::Place(candidate),
            HintAction::Eliminate(_) => HintAction::Eliminate(candidate),
        };
        let mut compiled = position.puzzle.compile().ok()?;
        let solution = compiled
            .solve(
                &position.entries,
                &position.eliminations,
                DEFAULT_VARIANT_SEARCH_NODES,
            )
            .ok()?;
        let mut order: [usize; CELLS] = std::array::from_fn(|cell| cell);
        random.shuffle(&mut order);
        let wanted = 2 + random.index(6);
        let mut edits = 0;
        let mut generated = None;

        for cell in order.into_iter().take(32) {
            if cell == candidate.cell || position.entries[cell] != 0 {
                continue;
            }
            let before = position.puzzle.givens[cell];
            let after = if before == 0 { solution[cell] } else { 0 };
            position.puzzle.givens[cell] = after;
            compiled.givens[cell] = after;
            let unique = after != 0
                || compiled.analyze(
                    &position.entries,
                    &position.eliminations,
                    DEFAULT_VARIANT_SEARCH_NODES,
                ) == Ok(Analysis::Unique);
            if unique
                && let Some((focused, focused_suggestion)) =
                    focus_position(&compiled, position.clone(), technique, Some(suggestion))
                && let Ok(example) =
                    exercise_with(&compiled, 0, &focused, technique, focused_suggestion)
            {
                edits += 1;
                let values = std::array::from_fn(|cell| {
                    focused.puzzle.givens[cell].max(focused.entries[cell])
                });
                if values != exclude {
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

fn exercise(
    index: usize,
    position: VariantPosition,
    technique: VariantTechnique,
    preferred_suggestion: HintAction,
) -> Result<VariantPracticeExercise, VariantPracticeError> {
    let compiled = position
        .puzzle
        .compile()
        .map_err(|_| VariantPracticeError::InvalidPosition(index))?;
    let (position, suggestion) = focus_position(
        &compiled,
        position.clone(),
        technique,
        Some(preferred_suggestion),
    )
    .unwrap_or((position, preferred_suggestion));
    exercise_with(&compiled, index, &position, technique, suggestion)
}

fn focus_position(
    compiled: &CompiledVariant,
    mut position: VariantPosition,
    technique: VariantTechnique,
    preferred_suggestion: Option<HintAction>,
) -> Option<(VariantPosition, HintAction)> {
    let techniques: Vec<_> = VariantTechnique::all().collect();
    let easier: Vec<_> = techniques
        .iter()
        .copied()
        .filter(|candidate| {
            (candidate.difficulty(), candidate.cost()) < (technique.difficulty(), technique.cost())
        })
        .collect();

    for _ in 0..(CELLS * 10) {
        let target_proofs = compiled
            .deductions(&position.entries, &position.eliminations, technique)
            .ok()?;
        let easier_hint = compiled
            .ranked_hints(&position.entries, &position.eliminations, &easier, 1)
            .ok()?
            .into_iter()
            .next();

        if easier_hint.is_none() {
            if let Some(suggestion) = preferred_suggestion
                .filter(|suggestion| {
                    target_proofs
                        .iter()
                        .any(|proof| proof.actions.contains(suggestion))
                })
                .or_else(|| {
                    target_proofs
                        .first()
                        .and_then(|proof| proof.actions.first())
                        .copied()
                })
            {
                return Some((position, suggestion));
            }
        }

        let next = match easier_hint {
            Some(hint) => hint,
            None => compiled
                .ranked_hints(&position.entries, &position.eliminations, &techniques, 1)
                .ok()?
                .into_iter()
                .next()?,
        };
        let previous = position.clone();
        crate::position::record_actions(
            &mut position.entries,
            &mut position.eliminations,
            &next.actions,
        );
        if position == previous {
            return None;
        }
    }
    None
}

fn exercise_with(
    compiled: &CompiledVariant,
    index: usize,
    position: &VariantPosition,
    technique: VariantTechnique,
    suggestion: HintAction,
) -> Result<VariantPracticeExercise, VariantPracticeError> {
    let snapshot = compiled
        .proof_position(&position.entries, &position.eliminations)
        .map_err(|_| VariantPracticeError::InvalidPosition(index))?;
    let mut proofs = compiled.explain(&snapshot, technique);
    if technique == VariantTechnique::LockedCandidates {
        proofs.retain(|proof| {
            matches!(
                proof.evidence,
                VariantEvidence::Intersection {
                    source: VariantHouseKind::Diagonal(_),
                    ..
                } | VariantEvidence::Intersection {
                    target: VariantHouseKind::Diagonal(_),
                    ..
                }
            )
        });
    }
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
        position: position.clone(),
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
    removals: &'static [(usize, u16)],
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
        removals: &[],
    }
}
