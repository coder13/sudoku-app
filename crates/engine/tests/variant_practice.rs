#![cfg(all(feature = "variants", feature = "teaching"))]

use std::collections::{BTreeSet, HashSet};

use sudoku_app_engine::{
    Analysis, DEFAULT_VARIANT_SEARCH_NODES, HintAction, PuzzleRule, VariantEvidence,
    VariantExclusionPremise, VariantTechnique, canonical_variant, variant_practice_examples,
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
                    if matches!(technique, VariantTechnique::InsideGrid | VariantTechnique::LetteredQuadruples) {
                        // The shared set or key stays in view. Each exercise
                        // must use it to explain a different part of the grid.
                        let focus: Vec<_> = exercise.deduction.actions.iter()
                            .map(|action| action.candidate().cell)
                            .collect::<BTreeSet<_>>().into_iter().collect();
                        assert!(focus.iter().all(|cell| cells.contains(cell)));
                        scopes.insert(focus);
                    } else {
                        scopes.insert(cells);
                    }
                }
                VariantEvidence::SumPair(proof) => {
                    assert!(proof.rules.iter().all(|&rule| position.puzzle.rules.get(rule).is_some()));
                    scopes.insert(proof.cells.to_vec());
                }
                VariantEvidence::GroupLineHouse { rule, cells, .. } => {
                    assert!(position.puzzle.rules.get(rule).is_some());
                    scopes.insert(cells.to_vec());
                }
                VariantEvidence::GroupLineHouseTriplet { rule, cells, .. } => {
                    assert!(position.puzzle.rules.get(rule).is_some());
                    scopes.insert(cells.to_vec());
                }
                VariantEvidence::GroupLineSumHouse { rules, cells, .. } => {
                    assert!(rules.iter().all(|&rule| position.puzzle.rules.get(rule).is_some()));
                    scopes.insert(cells.to_vec());
                }
                VariantEvidence::GroupSumImplication { assumption, links, .. } => {
                    let cells = std::iter::once(assumption.cell)
                        .chain(links.into_iter().map(|link| link.candidate.cell))
                        .collect();
                    scopes.insert(cells);
                }
                VariantEvidence::GroupLinePhaseSum { rules, cells, .. } => {
                    assert!(rules.iter().all(|&rule| position.puzzle.rules.get(rule).is_some()));
                    scopes.insert(cells.to_vec());
                }
                VariantEvidence::GroupLineDisjointSum { rules, cells, .. } => {
                    assert!(rules.iter().all(|&rule| position.puzzle.rules.get(rule).is_some()));
                    scopes.insert(cells.to_vec());
                }
                VariantEvidence::GroupLineSumChain(proof) => {
                    assert!(proof.rules.iter().all(|&rule| position.puzzle.rules.get(rule).is_some()));
                    scopes.insert(proof.cells.to_vec());
                }
                VariantEvidence::GroupLineHouseSupport(proof) => {
                    assert!(matches!(
                        position.puzzle.rules[proof.rule],
                        sudoku_app_engine::PuzzleRule::Entropic { .. } | sudoku_app_engine::PuzzleRule::Modular { .. }
                    ));
                    scopes.insert(proof.cells.to_vec());
                }
                VariantEvidence::LinkedClue(proof) => {
                    assert_eq!(exercise.suggestion, HintAction::Eliminate(proof.assumption));
                    assert!(proof.conflict.supported.contains(&0));
                    scopes.insert(proof.conflict.cells.to_vec());
                }
                VariantEvidence::KropkiHouse(proof) => {
                    assert!(proof.rules.iter().all(|&rule| {
                        matches!(position.puzzle.rules[rule], PuzzleRule::Kropki { .. })
                    }));
                    assert!(proof.pair.iter().all(|cell| proof.cells.contains(cell)));
                    scopes.insert(proof.cells.to_vec());
                }
                VariantEvidence::ThermometerHouse(proof) => {
                    let PuzzleRule::Thermometer { cells } = &position.puzzle.rules[proof.rule] else {
                        panic!("the proof must cite its Thermometer")
                    };
                    assert_eq!(cells, &proof.line_cells);
                    scopes.insert(proof.cells.to_vec());
                }
                VariantEvidence::RegionSumHouse(proof) => {
                    assert!(proof.lines.iter().all(|line| matches!(
                        position.puzzle.rules[line.rule], PuzzleRule::RegionSum { .. }
                    )));
                    let cells = proof.lines.iter().flat_map(|line| &line.parts)
                        .flat_map(|part| part.cells.iter().copied()).chain(proof.remainder).collect();
                    scopes.insert(cells);
                }
                VariantEvidence::RegionSumDistinct(proof) => {
                    assert!(matches!(
                        position.puzzle.rules[proof.rule],
                        PuzzleRule::RegionSum { .. }
                    ));
                    scopes.insert(proof.parts.iter().flat_map(|part| part.cells.clone()).collect());
                }
                VariantEvidence::GroupOrder(proof) => {
                    assert!(matches!(
                        position.puzzle.rules[proof.rule],
                        sudoku_app_engine::PuzzleRule::Entropic { .. } | sudoku_app_engine::PuzzleRule::Modular { .. }
                    ));
                    for order in proof.rejected {
                        scopes.insert(order.conflict.cells);
                    }
                }
                VariantEvidence::LineHouses(proof) => {
                    if position.puzzle.rules.len() > 1 {
                        overlaps.insert(technique);
                    }
                    assert!(
                        proof
                            .rules
                            .iter()
                            .all(|&rule| position.puzzle.rules.get(rule).is_some())
                    );
                    scopes.insert(proof.cells);
                }
                VariantEvidence::EntropyAreas(proof) => {
                    let (entropy, circles) = proof.rules.split_first().unwrap();
                    assert!(matches!(
                        position.puzzle.rules[*entropy],
                        PuzzleRule::GlobalEntropy {}
                    ));
                    if technique == VariantTechnique::EntropyQuadruple {
                        assert!(!circles.is_empty());
                    } else {
                        assert_eq!(technique, VariantTechnique::GlobalEntropy);
                        assert_eq!(proof.windows.len(), 2);
                    }
                    for &rule in circles {
                        let PuzzleRule::Quadruple { top_left, .. } = &position.puzzle.rules[rule] else {
                            panic!("the proof must cite a printed circle");
                        };
                        assert!(proof.windows.iter().any(|window| window[0] == *top_left));
                    }
                    overlaps.insert(technique);
                    scopes.insert(proof.cells);
                }
                VariantEvidence::RayHouses(proof) => {
                    assert!(!proof.houses.is_empty());
                    assert!(proof.rules.iter().all(|&index| index < position.puzzle.rules.len()));
                    scopes.insert(proof.cells);
                }
                VariantEvidence::RenbanGroupCounts(proof) => {
                    assert!(proof.initial.iter().chain(&proof.subsequent).all(|projection| {
                        matches!(&position.puzzle.rules[projection.rule], sudoku_app_engine::PuzzleRule::Renban { cells, .. }
                            if *cells == projection.cells)
                    }));
                    scopes.insert(proof.conflict.cells.to_vec());
                }
                VariantEvidence::RenbanHouseSupport(proof) => {
                    let sudoku_app_engine::PuzzleRule::Renban { cells, .. } =
                        &position.puzzle.rules[proof.rule]
                    else {
                        panic!("proof should identify the source Renban");
                    };
                    assert_eq!(cells, &proof.cells[..proof.line_length]);
                    scopes.insert(proof.cells);
                }
                VariantEvidence::RenbanSum(proof) => {
                    let [renban, ray] = proof.rules.map(|index| &position.puzzle.rules[index]);
                    assert!(matches!(renban, sudoku_app_engine::PuzzleRule::Renban { .. }));
                    assert!(matches!(ray, sudoku_app_engine::PuzzleRule::LittleKiller { .. }));
                    scopes.insert(proof.cells);
                }
                VariantEvidence::RenbanSumHouse(proof) => {
                    let [contained, sum, other] = proof.rules.map(|index| &position.puzzle.rules[index]);
                    assert!(matches!(contained, sudoku_app_engine::PuzzleRule::Renban { .. }));
                    assert!(matches!(sum, sudoku_app_engine::PuzzleRule::LittleKiller { .. }));
                    assert!(matches!(other, sudoku_app_engine::PuzzleRule::Renban { .. }));
                    scopes.insert(proof.cells);
                }
                VariantEvidence::LockedDigit { clue, .. } => {
                    assert!(
                        clue.rules
                            .iter()
                            .all(|&rule| position.puzzle.rules.get(rule).is_some())
                    );
                    scopes.insert(clue.cells);
                }
                VariantEvidence::QuadrupleLock { clues, sites, digit, .. } => {
                    for (clue, sites) in clues.iter().zip(sites) {
                        assert!(clue.rules.iter().all(|&rule| matches!(
                            &position.puzzle.rules[rule],
                            PuzzleRule::Quadruple { digits, .. } if digits.contains(&digit)
                        )));
                        assert!(sites.iter().all(|site| clue.cells.contains(site)));
                    }
                    scopes.insert(clues.into_iter().flat_map(|clue| clue.cells).collect());
                }
                VariantEvidence::RuleForcing { assumption, .. } => {
                    assert_eq!(exercise.deduction.actions, vec![HintAction::Eliminate(assumption)]);
                    scopes.insert(vec![assumption.cell]);
                }
                VariantEvidence::CageSum { cells, .. }
                | VariantEvidence::Intersection { cells, .. } => {
                    scopes.insert(cells);
                }
                VariantEvidence::Single { .. } | VariantEvidence::Classic { .. } => {}
                VariantEvidence::Exclusion { premise, rules, .. } => {
                    assert!(
                        rules
                            .iter()
                            .all(|&rule| position.puzzle.rules.get(rule).is_some())
                    );
                    let mut cells = match premise {
                        VariantExclusionPremise::Cell { cell, .. } => vec![cell],
                        VariantExclusionPremise::House { cells, .. } => cells,
                    };
                    cells.extend(
                        exercise
                            .deduction
                            .actions
                            .iter()
                            .map(|action| action.candidate().cell),
                    );
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
    assert!(overlaps.contains(&VariantTechnique::EntropyQuadruple));
}
