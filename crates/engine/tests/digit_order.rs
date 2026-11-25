#![cfg(feature = "variants")]

use sudoku_app_engine::{Analysis, PuzzleRule, VariantPuzzle, parse_givens};

const SOLUTION: &str =
    "834196257769542813521837649385764192472918536196253784617389425948625371253471968";

fn puzzle(cells: Vec<usize>, digits: Vec<u8>) -> VariantPuzzle {
    let mut puzzle = VariantPuzzle::classic([0; 81]);
    puzzle.rules.push(PuzzleRule::DigitOrder { cells, digits });
    puzzle
}

#[test]
fn directed_digit_groups_accept_and_reject_the_printed_completion() {
    let solution = parse_givens(SOLUTION).unwrap();
    let left_to_right = puzzle((45..54).collect(), vec![1, 2, 3]);
    assert_eq!(
        left_to_right
            .compile()
            .unwrap()
            .analyze(&solution, &[0; 81], 1),
        Ok(Analysis::Unique)
    );

    let right_to_left = puzzle((9..18).rev().collect(), vec![4, 5, 6]);
    assert_eq!(
        right_to_left
            .compile()
            .unwrap()
            .analyze(&solution, &[0; 81], 1),
        Ok(Analysis::Unique)
    );

    let invalid_order = puzzle((0..9).collect(), vec![1, 2, 3]);
    assert!(matches!(
        invalid_order
            .compile()
            .unwrap()
            .analyze(&solution, &[0; 81], 1),
        Ok(Analysis::Conflict)
    ));
}

#[test]
fn only_rows_or_columns_and_real_entropy_groups_are_accepted() {
    for (cells, digits) in [
        (vec![0, 1, 2, 3, 4, 5, 6, 7], vec![1, 2, 3]),
        ((0..9).map(|row| row * 9 + row).collect(), vec![1, 2, 3]),
        ((0..9).collect(), vec![1, 2]),
        ((0..9).collect(), vec![1, 2, 4]),
        ((0..9).collect(), vec![2, 3, 4]),
    ] {
        assert!(puzzle(cells, digits).compile().is_err());
    }
}

#[test]
fn every_square_symmetry_preserves_the_directed_order_rule() {
    let solution = parse_givens(SOLUTION).unwrap();
    let original_cells: Vec<_> = (45..54).collect();
    for symmetry in 0..8 {
        let cell = |cell: usize| {
            let (mut row, mut column) = (cell / 9, cell % 9);
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
        let transformed = puzzle(
            original_cells.iter().copied().map(cell).collect(),
            vec![1, 2, 3],
        );
        let mut board = [0; 81];
        for (index, &digit) in solution.iter().enumerate() {
            board[cell(index)] = digit;
        }
        assert_eq!(
            transformed.compile().unwrap().analyze(&board, &[0; 81], 1),
            Ok(Analysis::Unique)
        );
    }
}

#[cfg(feature = "wasm-api")]
#[test]
fn rule_round_trips_through_the_variant_wire_format() {
    let rule = PuzzleRule::DigitOrder {
        cells: (0..9).rev().collect(),
        digits: vec![1, 2, 3],
    };
    let encoded = serde_json::to_value(&rule).unwrap();
    assert_eq!(encoded["type"], "digit-order");
    assert_eq!(serde_json::from_value::<PuzzleRule>(encoded).unwrap(), rule);
}
