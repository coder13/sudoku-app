#![cfg(all(feature = "variants", feature = "teaching"))]

use std::collections::{BTreeSet, HashSet};

use sudoku_app_engine::{
    Analysis, DEFAULT_VARIANT_SEARCH_NODES, HintAction, VariantEvidence, VariantExclusionPremise, VariantTechnique,
    canonical_variant, variant_practice_examples,
};

#[test]
fn variant_practice_library_proves_its_answers_on_distinct_unique_puzzles() {
    let mut overlaps = BTreeSet::new();
    for technique in VariantTechnique::all() {
        let exercises = variant_practice_examples(technique)
            .unwrap_or_else(|error| panic!("{}: {error:?}", technique.id()));
        assert_eq!(exercises.len(), 3);
        let mut keys = HashSet::new();
        let mut scopes = HashSet::new();
        for exercise in exercises {
            let position = &exercise.position;
            let compiled = position.puzzle.compile().unwrap();
            assert!(
                keys.insert(canonical_variant(&position.puzzle).unwrap()),
                "equivalent {} exercises",
                technique.id()
            );
            let entries = &position.entries;
            let removals = &position.eliminations;
            assert_eq!(
                compiled.analyze(entries, removals, DEFAULT_VARIANT_SEARCH_NODES),
                Ok(Analysis::Unique),
                "{}",
                technique.id()
            );
            let solution = compiled
                .solve(entries, removals, DEFAULT_VARIANT_SEARCH_NODES)
                .unwrap();
            assert_eq!(exercise.deduction.technique, technique);
            assert!(exercise.answers.contains(&exercise.suggestion));
            assert!(exercise.deduction.actions.contains(&exercise.suggestion));
            for action in &exercise.answers {
                let candidate = action.candidate();
                assert_ne!(
                    exercise.candidates[candidate.cell] & (1 << (candidate.digit - 1)),
                    0
                );
                assert_eq!(
                    solution[candidate.cell] == candidate.digit,
                    matches!(action, HintAction::Place(_)),
                    "unsound {} action {action:?}",
                    technique.id()
                );
            }
            assert_eq!(
                compiled
                    .check_practice_move(entries, removals, technique, exercise.suggestion)
                    .unwrap(),
                Some(exercise.deduction.clone())
            );
            let different = exercise
                .answers
                .iter()
                .find(|&&action| action != exercise.suggestion);
            if let Some(&action) = different {
                assert!(
                    compiled
                        .check_practice_move(entries, removals, technique, action)
                        .unwrap()
                        .is_some()
                );
            }

            match exercise.deduction.evidence {
                VariantEvidence::Constraint { rules, cells, .. } => {
                    if position.puzzle.rules.len() > 1 {
                        overlaps.insert(technique);
                    }
                    assert!(
                        rules
                            .iter()
                            .all(|&rule| position.puzzle.rules.get(rule).is_some())
                    );
                    scopes.insert(cells);
                }
                VariantEvidence::LockedDigit { clue, .. } => {
                    assert!(
                        clue.rules
                            .iter()
                            .all(|&rule| position.puzzle.rules.get(rule).is_some())
                    );
                    scopes.insert(clue.cells);
                }
                VariantEvidence::CageSum { cells, .. }
                | VariantEvidence::Intersection { cells, .. } => {
                    scopes.insert(cells);
                }
                VariantEvidence::Single { .. } | VariantEvidence::Classic { .. } => {}
                VariantEvidence::Exclusion { premise, rules, .. } => {
                    assert!(rules.iter().all(|&rule| position.puzzle.rules.get(rule).is_some()));
                    let mut cells = match premise {
                        VariantExclusionPremise::Cell { cell, .. } => vec![cell],
                        VariantExclusionPremise::House { cells, .. } => cells,
                    };
                    cells.extend(exercise.deduction.actions.iter().map(|action| action.candidate().cell));
                    cells.sort_unstable();
                    cells.dedup();
                    scopes.insert(cells);
                }
            }
        }
        if !scopes.is_empty() {
            assert!(
                scopes.len() >= 2,
                "all {} examples repeat the same scope",
                technique.id()
            );
        }
    }
    assert!(overlaps.contains(&VariantTechnique::Thermometer));
    assert!(overlaps.contains(&VariantTechnique::Arrow));
    assert!(overlaps.contains(&VariantTechnique::Renban));
}
