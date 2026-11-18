#![cfg(feature = "variants")]

use sudoku_app_engine::{
    Analysis, Candidate, HintAction, MarkedPairs, PuzzleRule, VariantDefinitionError,
    VariantEvidence, VariantPosition, VariantPuzzle, VariantTechnique, VariantVisibility,
    VariantVisibilityError, parse_givens,
};

const EMPTY: [u8; 81] = [0; 81];
const MASK: u16 = 511;
const SOLUTION: &str =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

fn puzzle(cells: [usize; 2], sum: u8) -> VariantPuzzle {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules.push(PuzzleRule::AdjacentTotal { cells, sum });
    puzzle
}

#[test]
fn every_total_and_digit_assignment_obeys_sum_and_house_distinctness() {
    let original = parse_givens(SOLUTION).unwrap();
    for sum in 3..=17 {
        for cells in [[0, 1], [9, 0]] {
            let compiled = puzzle(cells, sum).compile().unwrap();
            for left in 1..=9 {
                for right in 1..=9 {
                    let mut map = [0; 10];
                    map[original[cells[0]] as usize] = left;
                    map[original[cells[1]] as usize] = right;
                    let mut remaining = (1..=9).filter(|&d| d != left && d != right);
                    for digit in 1..=9 {
                        if map[digit] == 0 {
                            map[digit] = remaining.next().unwrap_or(1);
                        }
                    }
                    let complete = original.map(|d| map[d as usize]);
                    let expected = if left != right && left + right == sum {
                        Analysis::Unique
                    } else {
                        Analysis::Conflict
                    };
                    assert_eq!(
                        compiled.analyze(&complete, &[0; 81], 1),
                        Ok(expected),
                        "{cells:?}, {sum}, {left}, {right}"
                    );
                }
            }
        }
    }
}

#[test]
fn supported_candidates_match_independent_digit_pairs_for_every_domain() {
    for sum in 3..=17 {
        for cells in [[0, 1], [0, 9]] {
            let compiled = puzzle(cells, sum).compile().unwrap();
            for partner in 1..=9u8 {
                let Some(required) = sum
                    .checked_sub(partner)
                    .filter(|&d| (1..=9).contains(&d) && d != partner)
                else {
                    continue;
                };
                for domain in 1..=MASK {
                    if domain & (1 << (required - 1)) == 0 {
                        continue;
                    }
                    let mut removals = [0; 81];
                    removals[cells[0]] = MASK & !domain;
                    removals[cells[1]] = MASK & !(1 << (partner - 1));
                    let proofs = compiled
                        .deductions(&EMPTY, &removals, VariantTechnique::AdjacentTotal)
                        .unwrap();
                    let expected: Vec<_> = (1..=9)
                        .filter(|&digit| domain & (1 << (digit - 1)) != 0 && digit != required)
                        .map(|digit| {
                            HintAction::Eliminate(Candidate {
                                cell: cells[0],
                                digit,
                            })
                        })
                        .collect();
                    if expected.is_empty() {
                        assert!(proofs.is_empty());
                    } else {
                        assert_eq!(proofs.len(), 1);
                        assert_eq!(proofs[0].actions, expected);
                        assert_eq!(
                            proofs[0].evidence,
                            VariantEvidence::Constraint {
                                rules: vec![0],
                                cells: cells.to_vec(),
                                domains: vec![domain, 1 << (partner - 1)]
                            }
                        );
                    }
                }
            }
        }
    }
}

#[test]
fn even_totals_cannot_use_the_same_digit_twice_and_invalid_definitions_reject() {
    for sum in 3..=17 {
        let compiled = puzzle([0, 1], sum).compile().unwrap();
        let proofs = compiled
            .deductions(&EMPTY, &[0; 81], VariantTechnique::AdjacentTotal)
            .unwrap();
        let expected: Vec<_> = [0, 1]
            .into_iter()
            .flat_map(|cell| {
                (1..=9)
                    .filter(move |&digit| {
                        !(1..=9).any(|other| digit != other && digit + other == sum)
                    })
                    .map(move |digit| HintAction::Eliminate(Candidate { cell, digit }))
            })
            .collect();
        assert_eq!(
            proofs
                .into_iter()
                .flat_map(|proof| proof.actions)
                .collect::<Vec<_>>(),
            expected
        );
    }
    for cells in [[0, 0], [8, 9], [0, 10], [80, 81], [0, usize::MAX]] {
        assert!(matches!(
            puzzle(cells, 15).compile(),
            Err(VariantDefinitionError::InvalidRule(0))
        ));
    }
    for sum in [0, 1, 2, 18, 255] {
        assert!(matches!(
            puzzle([0, 1], sum).compile(),
            Err(VariantDefinitionError::InvalidRule(0))
        ));
    }
}

#[test]
fn generic_five_and_ten_marks_exempt_negative_xv_without_changing_proof_provenance() {
    let solution = parse_givens(SOLUTION).unwrap();
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    for a in 0..81 {
        for b in [
            if a % 9 < 8 { a + 1 } else { 81 },
            if a < 72 { a + 9 } else { 81 },
        ] {
            if b < 81 && matches!(solution[a] + solution[b], 5 | 10) {
                puzzle.rules.push(PuzzleRule::AdjacentTotal {
                    cells: [b, a],
                    sum: solution[a] + solution[b],
                });
            }
        }
    }
    puzzle.rules.push(PuzzleRule::Xv {
        five: MarkedPairs {
            pairs: vec![],
            negative: true,
        },
        ten: MarkedPairs {
            pairs: vec![],
            negative: true,
        },
    });
    assert_eq!(
        puzzle.compile().unwrap().analyze(&solution, &[0; 81], 1),
        Ok(Analysis::Unique)
    );
    let mut simple = superposition(5);
    for reverse in [false, true] {
        if reverse {
            simple.rules.reverse();
        }
        let compiled = simple.compile().unwrap();
        let total_index = usize::from(reverse);
        let proofs = compiled
            .deductions(&EMPTY, &[0; 81], VariantTechnique::AdjacentTotal)
            .unwrap();
        assert!(proofs.iter().all(|proof| matches!(&proof.evidence, VariantEvidence::Constraint { rules, .. } if rules == &[total_index])));
        let negative = compiled
            .deductions(&EMPTY, &[0; 81], VariantTechnique::Xv)
            .unwrap();
        assert!(negative.iter().all(|proof| !matches!(&proof.evidence, VariantEvidence::Constraint { cells, .. } if cells == &[0,1])));
    }
}

fn superposition(sum: u8) -> VariantPuzzle {
    let mut result = puzzle([0, 1], sum);
    result.rules.push(PuzzleRule::Xv {
        five: MarkedPairs {
            pairs: vec![],
            negative: true,
        },
        ten: MarkedPairs::default(),
    });
    result
}

#[test]
fn fog_requires_all_generic_v_x_marks_before_negative_xv_is_safe() {
    let position = VariantPosition::new(superposition(5));
    let mut visibility = VariantVisibility::new();
    visibility.rules = vec![1];
    visibility.complete_xv = true;
    assert_eq!(
        position.visible(&visibility),
        Err(VariantVisibilityError::HiddenMarkers)
    );
    visibility.complete_xv = false;
    let projected = position.visible(&visibility).unwrap();
    assert!(matches!(&projected.puzzle.rules[0], PuzzleRule::Xv { five, .. } if !five.negative));
    visibility.complete_xv = true;
    visibility.rules = vec![0, 1];
    assert_eq!(
        position.visible(&visibility).unwrap().puzzle.rules,
        position.puzzle.rules
    );
    // A hidden sum of 15 is not a V or X mark.
    assert!(
        VariantPosition::new(superposition(15))
            .visible(&VariantVisibility {
                rules: vec![1],
                ..visibility
            })
            .is_ok()
    );
}

#[cfg(feature = "wasm-api")]
#[test]
fn wire_totals_preserve_source_order_and_reject_unknown_or_malformed_data() {
    let rule: PuzzleRule =
        serde_json::from_str(r#"{"type":"adjacent-total","cells":[80,79],"sum":15}"#).unwrap();
    assert_eq!(
        rule,
        PuzzleRule::AdjacentTotal {
            cells: [80, 79],
            sum: 15
        }
    );
    assert_eq!(
        serde_json::to_value(rule).unwrap(),
        serde_json::json!({ "type": "adjacent-total", "cells": [80,79], "sum": 15 })
    );
    for input in [
        r#"{"type":"adjacent-total","cells":[80],"sum":15}"#,
        r#"{"type":"adjacent-total","cells":[80,79,78],"sum":15}"#,
        r#"{"type":"adjacent-total","cells":[80,79],"sum":15.5}"#,
        r#"{"type":"adjacent-total","cells":[80,79],"sum":15,"negative":true}"#,
    ] {
        assert!(
            serde_json::from_str::<PuzzleRule>(input).is_err(),
            "{input}"
        );
    }
}

#[cfg(feature = "generation")]
#[test]
fn derived_sum_generation_preserves_targets_and_a_real_dependence_on_the_family() {
    use sudoku_app_engine::{
        GenerationStep, VariantClueLayout, VariantGenerationError, VariantGenerationOptions,
        start_variant_generation,
    };
    for seed in [17, 43, 227] {
        let mut options =
            VariantGenerationOptions::new(seed, VariantPuzzle::classic(EMPTY), 30..=30);
        options.derived_clues = (0..81)
            .filter(|a| a % 9 < 8)
            .take(20)
            .map(|a| VariantClueLayout::AdjacentTotal { cells: [a, a + 1] })
            .collect();
        options.variant_clues = Some(20..=20);
        options.required_rule = Some("adjacent-total".into());
        options.max_attempts = 20;
        options.max_nodes = 50_000;
        let mut search = start_variant_generation(options).unwrap();
        let mut result = None;
        while let Some(event) = search.advance() {
            if let GenerationStep::Matched { puzzle, .. } = event {
                result = Some(puzzle);
                break;
            }
        }
        let output = result.expect("target must match within its bounded attempts");
        assert_eq!(output.givens, 30);
        assert_eq!(output.variant_clues, 20);
        for rule in &output.puzzle.rules {
            if let PuzzleRule::AdjacentTotal { cells: [a, b], sum } = rule {
                assert_eq!(output.solution[*a] + output.solution[*b], *sum);
            } else {
                panic!("unexpected derived rule");
            }
        }
        let compiled = output.puzzle.compile().unwrap();
        assert_eq!(
            compiled.analyze(&EMPTY, &[0; 81], 50_000),
            Ok(Analysis::Unique)
        );
        let mut without = output.puzzle;
        without.rules.clear();
        assert_eq!(
            without.compile().unwrap().analyze(&EMPTY, &[0; 81], 50_000),
            Ok(Analysis::Multiple)
        );
    }
    let mut bad = VariantGenerationOptions::new(1, VariantPuzzle::classic(EMPTY), 30..=30);
    bad.derived_clues = vec![VariantClueLayout::AdjacentTotal { cells: [8, 9] }];
    assert!(matches!(
        start_variant_generation(bad),
        Err(VariantGenerationError::InvalidLayout(0))
    ));
}
