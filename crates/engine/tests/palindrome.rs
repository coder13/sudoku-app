#![cfg(feature = "variants")]

use sudoku_app_engine::{PuzzleRule, VariantPuzzle, canonical_variant};

const CELLS: usize = 81;

fn puzzle(segments: Option<Vec<Vec<usize>>>) -> VariantPuzzle {
    let mut puzzle = VariantPuzzle::classic([0; CELLS]);
    puzzle.rules.push(PuzzleRule::Palindrome {
        cells: vec![0, 10, 40, 50],
        segments,
    });
    puzzle
}

#[test]
fn drawing_segments_preserve_logical_pairs_and_allow_revisits() {
    let plain = puzzle(None).compile().unwrap();
    let mut entries = [0; CELLS];
    entries[0] = 4;
    entries[10] = 7;
    let expected = plain.candidates(&entries, &[0; CELLS]).unwrap();
    assert_eq!(expected[50], 1 << 3);
    assert_eq!(expected[40], 1 << 6);
    for segments in [
        vec![vec![0, 10, 40], vec![40, 50]],
        vec![vec![0, 10, 40, 50, 0]],
        vec![vec![0, 10, 40, 50]; 82],
    ] {
        let compiled = puzzle(Some(segments)).compile().unwrap();
        assert_eq!(
            compiled.candidates(&entries, &[0; CELLS]).unwrap(),
            expected
        );
    }
}

#[test]
fn invalid_geometry_cannot_misrepresent_the_logical_cells() {
    for segments in [
        vec![],
        vec![vec![]],
        vec![vec![0, 10, 40]],
        vec![vec![0, 10, 40, 50, 1]],
        vec![vec![0, 10, 40, 50, 81]],
    ] {
        assert!(puzzle(Some(segments)).compile().is_err());
    }
    for cells in [vec![0], vec![0, 40, 0], vec![0, 81]] {
        let mut invalid = VariantPuzzle::classic([0; CELLS]);
        invalid.rules.push(PuzzleRule::Palindrome {
            cells,
            segments: None,
        });
        assert!(invalid.compile().is_err());
    }
}

#[test]
fn odd_centers_and_distinct_cells_do_not_require_distinct_digits() {
    let mut puzzle = VariantPuzzle::classic([0; CELLS]);
    puzzle.rules.push(PuzzleRule::Palindrome {
        cells: vec![0, 40, 80],
        segments: None,
    });
    let compiled = puzzle.compile().unwrap();
    let mut entries = [0; CELLS];
    entries[40] = 5;
    let masks = compiled.candidates(&entries, &[0; CELLS]).unwrap();
    assert!(masks[0].count_ones() > 1 && masks[80].count_ones() > 1);
    entries[0] = 5;
    entries[80] = 5;
    assert!(compiled.candidates(&entries, &[0; CELLS]).is_ok());
    entries[80] = 6;
    assert!(compiled.candidates(&entries, &[0; CELLS]).is_err());
}

#[test]
fn canonical_symmetries_transform_every_drawing_reference() {
    let original = puzzle(Some(vec![vec![0, 10, 40], vec![40, 50, 0]]));
    let expected = canonical_variant(&original).unwrap();
    for symmetry in 0..8 {
        let cell = |cell: usize| {
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
            row * 9 + col
        };
        let mut changed = VariantPuzzle::classic([0; CELLS]);
        changed.rules.push(PuzzleRule::Palindrome {
            cells: [0, 10, 40, 50].into_iter().map(cell).collect(),
            segments: Some(vec![
                vec![cell(0), cell(10), cell(40)],
                vec![cell(40), cell(50), cell(0)],
            ]),
        });
        assert_eq!(canonical_variant(&changed).unwrap(), expected);
    }
}

#[cfg(feature = "wasm-api")]
#[test]
fn old_wire_data_omits_segments_and_new_data_roundtrips_them() {
    let old = serde_json::json!({"type": "palindrome", "cells": [0, 10, 40, 50]});
    let rule: PuzzleRule = serde_json::from_value(old.clone()).unwrap();
    assert_eq!(serde_json::to_value(rule).unwrap(), old);
    let segmented = puzzle(Some(vec![vec![0, 10, 40], vec![40, 50]]));
    let json = serde_json::to_value(&segmented).unwrap();
    assert_eq!(
        json["rules"][0]["segments"],
        serde_json::json!([[0, 10, 40], [40, 50]])
    );
    assert_eq!(
        serde_json::from_value::<VariantPuzzle>(json).unwrap(),
        segmented
    );
}
