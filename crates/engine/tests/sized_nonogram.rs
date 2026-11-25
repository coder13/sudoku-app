#![cfg(feature = "variants")]

use sudoku_app_engine::{Analysis, RunAxis, SizedConstraint, SizedConstraintGrid, SizedGrid};

fn rule() -> SizedConstraint {
    SizedConstraint::Nonogram {
        axis: RunAxis::Row,
        index: 0,
        digits: vec![2, 4],
        runs: vec![1, 1],
    }
}

#[test]
fn ordered_run_clue_accepts_separated_selected_digits_and_rejects_a_joined_run() {
    let grid = SizedConstraintGrid::with_layout(SizedGrid::without_regions(4).unwrap(), &[rule()])
        .unwrap();

    assert_eq!(
        grid.analyze(&[1, 2, 3, 4, 2, 1, 4, 3, 4, 3, 2, 1, 3, 4, 1, 2], 10_000),
        Analysis::Unique
    );
    assert_eq!(
        grid.analyze(&[2, 4, 3, 1, 3, 1, 4, 2, 4, 2, 1, 3, 1, 3, 2, 4], 10_000),
        Analysis::Conflict
    );
}

#[test]
fn nonogram_restricts_a_cell_to_the_marked_or_gap_digit_group() {
    let grid = SizedConstraintGrid::with_layout(SizedGrid::without_regions(4).unwrap(), &[rule()])
        .unwrap();
    let mut digits = [0; 16];
    digits[0] = 2;
    digits[3] = 3;
    let candidates = grid
        .candidates_with_budget(&digits, 10_000)
        .unwrap()
        .unwrap();
    assert_eq!(candidates[2], 1 << 3);
}

#[test]
fn a_full_digit_group_can_form_one_full_length_run() {
    let rule = SizedConstraint::Nonogram {
        axis: RunAxis::Row,
        index: 0,
        digits: vec![1, 2, 3, 4],
        runs: vec![4],
    };
    let grid =
        SizedConstraintGrid::with_layout(SizedGrid::without_regions(4).unwrap(), &[rule]).unwrap();

    let solution = [1, 2, 3, 4, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3];
    assert_eq!(grid.analyze(&solution, 10_000), Analysis::Unique);
    let mut partial = solution;
    partial[0] = 0;
    assert_eq!(
        grid.candidates_with_budget(&partial, 10_000)
            .unwrap()
            .unwrap()[0],
        1
    );
}
