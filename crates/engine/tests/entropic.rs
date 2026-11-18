#![cfg(feature = "variants")]
use sudoku_app_engine::{
    Analysis, PuzzleRule, VariantPuzzle, VariantTechnique, canonical_variant, parse_givens,
};

fn puzzle(cells: Vec<usize>) -> VariantPuzzle {
    let mut puzzle = VariantPuzzle::classic([0; 81]);
    puzzle.rules.push(PuzzleRule::Entropic { cells });
    puzzle
}

#[test]
fn exact_checks_enforce_groups_with_logical_techniques_disabled() {
    let solution = parse_givens(
        "284539167651784932739162485918453276462978513375216849526847391893621754147395628",
    )
    .unwrap();
    let compiled = puzzle(vec![0, 10, 20, 0]).compile().unwrap();
    assert_eq!(
        compiled.analyze(&solution, &[0; 81], 1),
        Ok(Analysis::Unique)
    );
    let changed = solution.map(|d| {
        if d == 2 {
            4
        } else if d == 4 {
            2
        } else {
            d
        }
    });
    assert_eq!(
        compiled.analyze(&changed, &[0; 81], 1),
        Ok(Analysis::Conflict)
    );
    // Closing at a different phase is a valid definition with no assignment.
    let impossible = puzzle(vec![0, 10, 20, 30, 0]).compile().unwrap();
    assert_eq!(
        impossible.analyze(&solution, &[0; 81], 1),
        Ok(Analysis::Conflict)
    );
    assert_eq!(
        impossible.analyze(&[0; 81], &[0; 81], 100),
        Ok(Analysis::Unsolvable)
    );
}

#[test]
fn singleton_sets_are_unrestricted_and_bad_cell_references_reject() {
    let compiled = puzzle(vec![40]).compile().unwrap();
    for domain in 1..=511 {
        let mut eliminated = [0; 81];
        eliminated[40] = 511 ^ domain;
        assert!(
            compiled
                .deductions(&[0; 81], &eliminated, VariantTechnique::Entropic)
                .unwrap()
                .is_empty()
        );
    }
    for cells in [vec![], vec![81], vec![0, usize::MAX]] {
        assert!(puzzle(cells).compile().is_err());
    }
}

#[test]
fn every_grid_transform_preserves_the_original_walk_and_its_canonical_identity() {
    let walk = vec![0, 10, 20, 0];
    let key = canonical_variant(&puzzle(walk.clone())).unwrap();
    for symmetry in 0..8 {
        let cell = |c: usize| {
            let (mut r, mut c) = (c / 9, c % 9);
            if symmetry & 1 != 0 {
                (r, c) = (c, r)
            }
            if symmetry & 2 != 0 {
                r = 8 - r
            }
            if symmetry & 4 != 0 {
                c = 8 - c
            }
            r * 9 + c
        };
        assert_eq!(
            canonical_variant(&puzzle(walk.iter().copied().map(cell).collect())).unwrap(),
            key
        );
    }
}

#[cfg(feature = "wasm-api")]
#[test]
fn wire_data_preserves_repeated_references_in_their_original_order() {
    let wire = serde_json::json!({"type":"entropic","cells":[0,10,20,0]});
    let rule: PuzzleRule = serde_json::from_value(wire.clone()).unwrap();
    assert_eq!(serde_json::to_value(rule).unwrap(), wire);
}
