#![cfg(feature = "variants")]
use sudoku_app_engine::{
    Analysis, PuzzleRule, VariantPosition, VariantPositionError, VariantPuzzle, VariantTechnique,
    canonical_variant, parse_givens,
};

const GIVEN: &str =
    "304010000000020000050030400020046000000000000000350070005060040000070000000080506";
const SOLUTION: &str =
    "364519728791824365258637491823746159576291834419358672185963247642175983937482516";

fn puzzle() -> VariantPuzzle {
    let mut puzzle = VariantPuzzle::classic(parse_givens(GIVEN).unwrap());
    puzzle.rules.push(PuzzleRule::GlobalEntropy {});
    puzzle
}

#[cfg(feature = "generation")]
#[test]
fn global_entropy_has_no_printed_clues_and_preserves_companion_counts() {
    let mut puzzle = puzzle();
    assert_eq!(puzzle.variant_clue_count(), 0);
    puzzle.rules.push(PuzzleRule::Quadruple {
        top_left: 21,
        digits: vec![2, 2, 6],
    });
    assert_eq!(puzzle.variant_clue_count(), 1);
}

fn assert_entropy(solution: &[u8; 81]) {
    for row in 0..8 {
        for col in 0..8 {
            let first = row * 9 + col;
            let values = [first, first + 1, first + 9, first + 10].map(|cell| solution[cell]);
            assert!(values.iter().any(|d| (1..=3).contains(d)));
            assert!(values.iter().any(|d| (4..=6).contains(d)));
            assert!(values.iter().any(|d| (7..=9).contains(d)));
        }
    }
}

#[test]
fn published_twenty_given_puzzle_has_its_printed_completion_and_requires_entropy() {
    let puzzle = puzzle();
    let compiled = puzzle.compile().unwrap();
    let solution = compiled.solve(&[0; 81], &[0; 81], 1_000_000).unwrap();
    assert_eq!(solution, parse_givens(SOLUTION).unwrap());
    assert_entropy(&solution);
    assert_eq!(
        compiled.analyze(&[0; 81], &[0; 81], 1_000_000),
        Ok(Analysis::Unique)
    );
    assert_eq!(
        VariantPuzzle::classic(puzzle.givens)
            .compile()
            .unwrap()
            .analyze(&[0; 81], &[0; 81], 1_000_000),
        Ok(Analysis::Multiple)
    );
    let position = VariantPosition::new(puzzle);
    let disabled = position.solve_logically(&[]).unwrap();
    assert!(disabled.steps.is_empty());
    assert_eq!(disabled.end.entries, [0; 81]);
    assert!(
        !position
            .puzzle
            .compile()
            .unwrap()
            .deductions(&[0; 81], &[0; 81], VariantTechnique::GlobalEntropy)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn completed_grids_still_enforce_entropy_with_all_logical_techniques_disabled() {
    let solution = parse_givens(SOLUTION).unwrap();
    let mut definition = VariantPuzzle::classic([0; 81]);
    definition.rules.push(PuzzleRule::GlobalEntropy {});
    let compiled = definition.compile().unwrap();
    assert_eq!(
        compiled.analyze(&solution, &[0; 81], 1),
        Ok(Analysis::Unique)
    );
    let changed = solution.map(|digit| match digit {
        1 => 4,
        4 => 1,
        d => d,
    });
    assert_eq!(
        VariantPuzzle::classic([0; 81])
            .compile()
            .unwrap()
            .analyze(&changed, &[0; 81], 1),
        Ok(Analysis::Unique)
    );
    assert_eq!(
        compiled.analyze(&changed, &[0; 81], 1),
        Ok(Analysis::Conflict)
    );
    // Renaming digits within one group retains the rule.
    let within = solution.map(|digit| match digit {
        1 => 2,
        2 => 1,
        d => d,
    });
    assert_eq!(compiled.analyze(&within, &[0; 81], 1), Ok(Analysis::Unique));
}

#[test]
fn diagonal_repeats_across_four_boxes_are_valid_but_missing_groups_are_not() {
    let mut definition = VariantPuzzle::classic([0; 81]);
    definition.rules.push(PuzzleRule::GlobalEntropy {});
    let compiled = definition.compile().unwrap();
    let mut entries = [0; 81];
    for (cell, digit) in [(20, 7), (21, 1), (29, 6), (30, 7)] {
        entries[cell] = digit;
    }
    assert!(compiled.candidates(&entries, &[0; 81]).is_ok());
    for (cell, digit) in [(20, 2), (21, 3), (29, 7), (30, 8)] {
        entries[cell] = digit;
    }
    assert!(
        VariantPuzzle::classic([0; 81])
            .compile()
            .unwrap()
            .candidates(&entries, &[0; 81])
            .is_ok()
    );
    assert_eq!(
        compiled.candidates(&entries, &[0; 81]),
        Err(VariantPositionError::Puzzle(Analysis::Conflict))
    );
}

#[test]
fn square_symmetries_preserve_the_complete_global_rule_and_identity() {
    let definition = puzzle();
    let key = canonical_variant(&definition).unwrap();
    for symmetry in 0..8 {
        let mut transformed = definition.clone();
        transformed.givens = [0; 81];
        for (cell, digit) in definition.givens.iter().copied().enumerate() {
            let (mut row, mut col) = (cell / 9, cell % 9);
            if symmetry & 1 != 0 {
                (row, col) = (col, row);
            }
            if symmetry & 2 != 0 {
                row = 8 - row;
            }
            if symmetry & 4 != 0 {
                col = 8 - col;
            }
            transformed.givens[row * 9 + col] = digit;
        }
        assert_eq!(transformed.rules, definition.rules);
        assert_eq!(canonical_variant(&transformed).unwrap(), key);
    }
}

#[cfg(feature = "wasm-api")]
#[test]
fn wire_data_preserves_the_global_rule_and_rejects_unknown_parameters() {
    let wire = serde_json::json!({"type":"global-entropy"});
    let rule: PuzzleRule = serde_json::from_value(wire.clone()).unwrap();
    assert_eq!(serde_json::to_value(rule).unwrap(), wire);
    for invalid in [
        serde_json::json!({"type":"global-entropy","cells":[0,1,9,10]}),
        serde_json::json!({"type":"global-entropy","groups":[1,2,3]}),
    ] {
        assert!(serde_json::from_value::<PuzzleRule>(invalid).is_err());
    }
}
