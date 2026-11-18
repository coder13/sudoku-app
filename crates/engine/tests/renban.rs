#![cfg(feature = "variants")]

use sudoku_app_engine::{
    Analysis, PuzzleRule, VariantPuzzle, VariantTechnique, canonical_variant, parse_givens,
};

fn puzzle(cells: Vec<usize>, segments: Option<Vec<Vec<usize>>>) -> VariantPuzzle {
    let mut puzzle = VariantPuzzle::classic([0; 81]);
    puzzle.rules.push(PuzzleRule::Renban { cells, segments });
    puzzle
}

#[test]
fn drawing_paths_do_not_change_the_distinct_consecutive_set_or_its_proof() {
    let cells = vec![18, 27, 36];
    let plain = puzzle(cells.clone(), None).compile().unwrap();
    let mut entries = [0; 81];
    entries[18] = 2;
    entries[27] = 1;
    let expected = plain
        .deductions(&entries, &[0; 81], VariantTechnique::Renban)
        .unwrap();
    assert!(!expected.is_empty());
    let complete = parse_givens(
        "891623745654179823237854691128967534349285167765431289916542378472318956583796412",
    )
    .unwrap();
    for segments in [
        vec![vec![18, 27], vec![27, 36]],
        vec![vec![18, 27, 36, 18]],
        vec![vec![18, 27, 36]; 82],
    ] {
        let compiled = puzzle(cells.clone(), Some(segments)).compile().unwrap();
        assert_eq!(
            compiled
                .deductions(&entries, &[0; 81], VariantTechnique::Renban)
                .unwrap(),
            expected
        );
        assert_eq!(
            compiled.analyze(&complete, &[0; 81], 1),
            Ok(Analysis::Unique)
        );
        // Digit relabelling preserves every ordinary house but breaks this set.
        let changed = complete.map(|d| {
            if d == 1 {
                9
            } else if d == 9 {
                1
            } else {
                d
            }
        });
        assert_eq!(
            compiled.analyze(&changed, &[0; 81], 1),
            Ok(Analysis::Conflict)
        );
    }
}

#[test]
fn drawings_must_cover_exactly_the_distinct_logical_cells() {
    for segments in [
        vec![],
        vec![vec![]],
        vec![vec![0, 10]],
        vec![vec![0, 10, 20, 1]],
        vec![vec![0, 10, 20, 81]],
    ] {
        assert!(puzzle(vec![0, 10, 20], Some(segments)).compile().is_err());
    }
    for cells in [vec![], vec![0, 10, 0], vec![0, 81], (0..10).collect()] {
        assert!(puzzle(cells, None).compile().is_err());
    }
}

#[test]
fn a_single_cell_is_a_valid_unrestricted_consecutive_set() {
    let compiled = puzzle(vec![40], Some(vec![vec![40]])).compile().unwrap();
    for domain in 1..=511 {
        let mut removals = [0; 81];
        removals[40] = 511 ^ domain;
        assert!(
            compiled
                .deductions(&[0; 81], &removals, VariantTechnique::Renban)
                .unwrap()
                .is_empty()
        );
    }
}

#[test]
fn every_square_transform_preserves_segmented_renban_identity() {
    let original = puzzle(vec![0, 10, 20], Some(vec![vec![0, 10], vec![10, 20, 0]]));
    let expected = canonical_variant(&original).unwrap();
    for transform in 0..8 {
        let cell = |cell: usize| {
            let (mut row, mut col) = (cell / 9, cell % 9);
            if transform & 1 != 0 {
                (row, col) = (col, row)
            }
            if transform & 2 != 0 {
                row = 8 - row
            }
            if transform & 4 != 0 {
                col = 8 - col
            }
            row * 9 + col
        };
        let changed = puzzle(
            [0, 10, 20].into_iter().map(cell).collect(),
            Some(vec![
                vec![cell(0), cell(10)],
                vec![cell(10), cell(20), cell(0)],
            ]),
        );
        assert_eq!(canonical_variant(&changed).unwrap(), expected);
    }
}

#[cfg(feature = "wasm-api")]
#[test]
fn legacy_wire_data_stays_identical_and_segmented_geometry_roundtrips() {
    let legacy = serde_json::json!({"type":"renban","cells":[0,10,20]});
    let rule: PuzzleRule = serde_json::from_value(legacy.clone()).unwrap();
    assert_eq!(serde_json::to_value(rule).unwrap(), legacy);
    let segmented = puzzle(vec![0, 10, 20], Some(vec![vec![0, 10], vec![10, 20, 0]]));
    let wire = serde_json::to_value(&segmented).unwrap();
    assert_eq!(
        wire["rules"][0]["segments"],
        serde_json::json!([[0, 10], [10, 20, 0]])
    );
    assert_eq!(
        serde_json::from_value::<VariantPuzzle>(wire).unwrap(),
        segmented
    );
}
