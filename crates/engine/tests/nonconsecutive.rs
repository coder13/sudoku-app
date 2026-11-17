#![cfg(feature = "variants")]

use sudoku_app_engine::{
    Analysis, MarkedPairs, PuzzleRule, VariantDefinitionError, VariantPuzzle,
    canonical_variant, parse_givens,
};

const EMPTY: [u8; 81] = [0; 81];
const NO_REMOVALS: [u16; 81] = [0; 81];

fn puzzle(except: Vec<[usize; 2]>) -> VariantPuzzle {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules = vec![PuzzleRule::NonConsecutive { except }];
    puzzle
}

#[test]
fn exceptions_remove_only_the_listed_edge_restriction_and_do_not_require_a_difference() {
    let mut entries = EMPTY;
    entries[0] = 4;
    let restricted = puzzle(vec![]).compile().unwrap().candidates(&entries, &NO_REMOVALS).unwrap();
    let exempt = puzzle(vec![[1, 0]]).compile().unwrap();
    let candidates = exempt.candidates(&entries, &NO_REMOVALS).unwrap();
    for digit in [3, 5] {
        assert_eq!(restricted[1] & (1 << (digit - 1)), 0);
        assert_ne!(candidates[1] & (1 << (digit - 1)), 0);
        assert_eq!(candidates[9] & (1 << (digit - 1)), 0);
    }
    for digit in [3, 5, 7] {
        entries[1] = digit;
        assert!(exempt.candidates(&entries, &NO_REMOVALS).is_ok());
    }
    entries[1] = 4; // An exception never disables row/column/box uniqueness.
    assert!(exempt.candidates(&entries, &NO_REMOVALS).is_err());
    entries[1] = 0;
    entries[0] = 9;
    assert_ne!(puzzle(vec![]).compile().unwrap().candidates(&entries, &NO_REMOVALS).unwrap()[1] & 1, 0);
}

#[test]
fn white_dots_impose_their_difference_in_addition_to_an_explicit_nonconsecutive_exception() {
    let mut mixed = puzzle(vec![[0, 1]]);
    mixed.rules.push(PuzzleRule::Kropki {
        consecutive: MarkedPairs { pairs: vec![[1, 0]], negative: false },
        ratio_two: MarkedPairs::default(),
    });
    let mut entries = EMPTY;
    entries[0] = 4;
    let candidates = mixed.compile().unwrap().candidates(&entries, &NO_REMOVALS).unwrap();
    assert_eq!(candidates[1], (1 << 2) | (1 << 4)); // Exactly 3 or 5.
    entries[1] = 7;
    assert!(mixed.compile().unwrap().candidates(&entries, &NO_REMOVALS).is_err());
    entries[1] = 5;
    assert!(mixed.compile().unwrap().candidates(&entries, &NO_REMOVALS).is_ok());
    mixed.rules[0] = PuzzleRule::NonConsecutive { except: vec![] };
    assert_eq!(mixed.compile().unwrap().analyze(&entries, &NO_REMOVALS, 100), Ok(Analysis::Conflict));
}

#[test]
fn exception_geometry_rejects_repeated_out_of_range_diagonal_and_wrapped_cells() {
    for cells in [[0, 0], [0, 81], [0, 10], [8, 9], [0, 2]] {
        assert!(matches!(puzzle(vec![cells]).compile(), Err(VariantDefinitionError::InvalidRule(0))));
    }
    for cells in [[0, 1], [1, 0], [0, 9], [8, 17], [79, 80]] {
        assert!(puzzle(vec![cells]).compile().is_ok());
    }
}

#[test]
fn rotations_and_reflections_keep_every_exception_and_canonical_identity() {
    let mut original = puzzle(vec![[1, 0], [9, 0], [79, 80]]);
    original.givens = parse_givens("400000007050030080000204000003000500040090060005000700000608000020070050300000006").unwrap();
    let key = canonical_variant(&original).unwrap();
    for reflected in [false, true] {
        for rotations in 0..4 {
            let cell = |cell: usize| {
                let (mut row, mut col) = (cell / 9, cell % 9);
                if reflected { col = 8 - col; }
                for _ in 0..rotations { (row, col) = (col, 8 - row); }
                9 * row + col
            };
            let mut transformed = VariantPuzzle::classic(EMPTY);
            for (index, digit) in original.givens.iter().enumerate() { transformed.givens[cell(index)] = *digit; }
            transformed.rules = vec![PuzzleRule::NonConsecutive {
                except: vec![[cell(0), cell(1)], [cell(0), cell(9)], [cell(80), cell(79)], [cell(1), cell(0)]],
            }];
            assert_eq!(canonical_variant(&transformed).unwrap(), key);
        }
    }
    original.rules = vec![PuzzleRule::NonConsecutive { except: vec![] }];
    assert_ne!(canonical_variant(&original).unwrap(), key);
}

#[cfg(feature = "wasm-api")]
#[test]
fn legacy_wire_shape_is_unchanged_and_exceptions_round_trip_explicitly() {
    let legacy = serde_json::json!({ "type": "non-consecutive" });
    let rule: PuzzleRule = serde_json::from_value(legacy.clone()).unwrap();
    assert_eq!(rule, PuzzleRule::NonConsecutive { except: vec![] });
    assert_eq!(serde_json::to_value(rule).unwrap(), legacy);
    let wire = serde_json::json!({ "type": "non-consecutive", "except": [[0, 1], [9, 0]] });
    let rule: PuzzleRule = serde_json::from_value(wire.clone()).unwrap();
    assert_eq!(serde_json::to_value(rule).unwrap(), wire);
    for invalid in [
        serde_json::json!({ "type": "non-consecutive", "except": [[0]] }),
        serde_json::json!({ "type": "non-consecutive", "except": [[0, 1, 2]] }),
        serde_json::json!({ "type": "non-consecutive", "exceptions": [[0, 1]] }),
    ] { assert!(serde_json::from_value::<PuzzleRule>(invalid).is_err()); }
}
