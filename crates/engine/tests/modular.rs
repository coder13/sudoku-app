#![cfg(feature = "variants")]

use sudoku_app_engine::{
    Analysis, PuzzleRule, VariantPosition, VariantPuzzle, VariantTechnique, canonical_variant,
    parse_givens,
};

const GIVENS: &str =
    "000000000000060200092000000000389000030406080000127000000000740007010000000000000";
const SOLUTION: &str =
    "613542879874961235592738461756389124231456987489127356165293748347815692928674513";
const MODULAR: &[&[usize]] = &[
    &[11, 19, 28, 38],
    &[22, 14, 15, 25],
    &[21, 31, 32],
    &[48, 49, 59],
    &[55, 65, 66, 58],
    &[42, 52, 61, 69],
];
const ENTROPIC: &[&[usize]] = &[
    &[29, 20, 12, 13],
    &[23, 24, 34, 43],
    &[47, 39, 30],
    &[33, 41, 50],
    &[37, 46, 56, 57],
    &[51, 60, 68, 67],
];

fn published() -> VariantPuzzle {
    let mut puzzle = VariantPuzzle::classic(parse_givens(GIVENS).unwrap());
    puzzle
        .rules
        .extend(ENTROPIC.iter().map(|cells| PuzzleRule::Entropic {
            cells: cells.to_vec(),
        }));
    puzzle
        .rules
        .extend(MODULAR.iter().map(|cells| PuzzleRule::Modular {
            cells: cells.to_vec(),
        }));
    puzzle
}

#[test]
fn printed_eighteen_given_completion_requires_both_independent_line_families() {
    let puzzle = published();
    let compiled = puzzle.compile().unwrap();
    let solution = compiled.solve(&[0; 81], &[0; 81], 1_000_000).unwrap();
    assert_eq!(solution, parse_givens(SOLUTION).unwrap());
    assert_eq!(
        compiled.analyze(&[0; 81], &[0; 81], 1_000_000),
        Ok(Analysis::Unique)
    );
    for line in MODULAR {
        for triple in line.windows(3) {
            let values = [
                solution[triple[0]] % 3,
                solution[triple[1]] % 3,
                solution[triple[2]] % 3,
            ];
            assert!(values[0] != values[1] && values[0] != values[2] && values[1] != values[2]);
        }
    }
    for modular in [false, true] {
        let mut without = puzzle.clone();
        without.rules.retain(|rule| {
            if modular {
                !matches!(rule, PuzzleRule::Modular { .. })
            } else {
                !matches!(rule, PuzzleRule::Entropic { .. })
            }
        });
        assert_eq!(
            without
                .compile()
                .unwrap()
                .analyze(&[0; 81], &[0; 81], 1_000_000),
            Ok(Analysis::Multiple)
        );
    }
    let disabled = VariantPosition::new(puzzle).solve_logically(&[]).unwrap();
    assert!(disabled.steps.is_empty());
    assert_eq!(disabled.end.entries, [0; 81]);
}

#[test]
fn residue_groups_allow_different_or_repeated_digits_three_positions_apart() {
    let mut puzzle = VariantPuzzle::classic([0; 81]);
    puzzle.rules.push(PuzzleRule::Modular {
        cells: vec![0, 10, 20, 30],
    });
    let compiled = puzzle.compile().unwrap();
    assert!(!compiled.peers(0).unwrap().any(|cell| cell == 30));
    for last in [1, 4, 7] {
        let mut entries = [0; 81];
        for (cell, digit) in [(0, 1), (10, 2), (20, 3), (30, last)] {
            entries[cell] = digit;
        }
        assert!(compiled.candidates(&entries, &[0; 81]).is_ok());
        assert_ne!(
            compiled.analyze(&entries, &[0; 81], 20_000),
            Ok(Analysis::Conflict)
        );
    }
}

#[test]
fn closures_and_revisits_retain_their_original_phase_constraints() {
    for (cells, possible) in [
        (vec![0], true),
        (vec![0, 10], true),
        (vec![0, 10, 20, 0], true),
        (vec![0, 10, 0], false),
        (vec![0, 0], false),
    ] {
        let mut puzzle = VariantPuzzle::classic([0; 81]);
        puzzle.rules.push(PuzzleRule::Modular { cells });
        let result = puzzle
            .compile()
            .unwrap()
            .analyze(&[0; 81], &[0; 81], 20_000);
        assert_eq!(result == Ok(Analysis::Multiple), possible);
    }
    for cells in [vec![], vec![81]] {
        let mut puzzle = VariantPuzzle::classic([0; 81]);
        puzzle.rules.push(PuzzleRule::Modular { cells });
        assert!(puzzle.compile().is_err());
    }
}

#[test]
fn modular_deductions_are_optional_while_exact_rules_and_the_published_identity_remain() {
    let puzzle = published();
    assert!(
        !puzzle
            .compile()
            .unwrap()
            .deductions(&[0; 81], &[0; 81], VariantTechnique::Modular)
            .unwrap()
            .is_empty()
    );
    let key = canonical_variant(&puzzle).unwrap();
    for symmetry in 0..8 {
        let mut transformed = puzzle.clone();
        let cell = |index: usize| {
            let (mut row, mut column) = (index / 9, index % 9);
            if symmetry & 1 != 0 {
                (row, column) = (column, row);
            }
            if symmetry & 2 != 0 {
                row = 8 - row;
            }
            if symmetry & 4 != 0 {
                column = 8 - column;
            }
            row * 9 + column
        };
        transformed.givens = [0; 81];
        for (index, digit) in puzzle.givens.iter().copied().enumerate() {
            transformed.givens[cell(index)] = digit;
        }
        for rule in &mut transformed.rules {
            match rule {
                PuzzleRule::Entropic { cells } | PuzzleRule::Modular { cells } => {
                    *cells = cells.iter().copied().map(cell).collect()
                }
                _ => unreachable!(),
            }
        }
        assert_eq!(canonical_variant(&transformed).unwrap(), key);
    }
}

#[cfg(feature = "wasm-api")]
#[test]
fn wire_rule_preserves_walks_and_rejects_unknown_group_or_modulus_parameters() {
    let value = serde_json::json!({ "type": "modular", "cells": [0, 10, 20, 0] });
    let rule: PuzzleRule = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(rule).unwrap(), value);
    for field in ["groups", "modulus", "negative"] {
        let mut wrong = value.clone();
        wrong[field] = serde_json::json!(3);
        assert!(serde_json::from_value::<PuzzleRule>(wrong).is_err());
    }
}
