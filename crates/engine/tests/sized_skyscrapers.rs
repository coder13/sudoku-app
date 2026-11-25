#![cfg(feature = "variants")]

use sudoku_app_engine::{Analysis, ClueDirection, SizedConstraint, SizedConstraintGrid, SizedGrid};

fn rule(direction: ClueDirection, index: usize, count: u8) -> SizedConstraint {
    SizedConstraint::Skyscrapers {
        direction,
        index,
        count,
    }
}

#[test]
fn all_four_directions_validate_the_published_seven_by_seven_solution() {
    let clues = [
        rule(ClueDirection::North, 3, 3),
        rule(ClueDirection::North, 5, 2),
        rule(ClueDirection::East, 4, 4),
        rule(ClueDirection::West, 2, 5),
        rule(ClueDirection::North, 4, 2),
        rule(ClueDirection::East, 1, 3),
        rule(ClueDirection::East, 2, 3),
        rule(ClueDirection::East, 6, 5),
        rule(ClueDirection::South, 5, 4),
        rule(ClueDirection::South, 0, 4),
        rule(ClueDirection::West, 5, 5),
        rule(ClueDirection::West, 0, 3),
    ];
    let grid =
        SizedConstraintGrid::with_layout(SizedGrid::without_regions(7).unwrap(), &clues).unwrap();
    let solution: Vec<u8> = "4573261764213512367545124376631754234516272765413"
        .bytes()
        .map(|digit| digit - b'0')
        .collect();
    assert_eq!(grid.analyze(&solution, 100_000), Analysis::Unique);
    let mut invalid = solution.clone();
    invalid[3] = 1;
    assert_eq!(grid.analyze(&invalid, 100_000), Analysis::Conflict);
}

#[test]
fn a_single_north_clue_restricts_unsupported_candidates() {
    let grid = SizedConstraintGrid::with_layout(
        SizedGrid::without_regions(4).unwrap(),
        &[rule(ClueDirection::North, 0, 1)],
    )
    .unwrap();
    let digits = [0; 16];
    let candidates = grid
        .candidates_with_budget(&digits, 10_000)
        .unwrap()
        .unwrap();
    assert_eq!(candidates[0], 1 << 3);
}

#[test]
fn impossible_counts_and_diagonal_directions_are_rejected() {
    assert!(
        SizedConstraintGrid::with_layout(
            SizedGrid::without_regions(4).unwrap(),
            &[rule(ClueDirection::North, 0, 5)],
        )
        .is_none()
    );
    assert!(
        SizedConstraintGrid::with_layout(
            SizedGrid::without_regions(4).unwrap(),
            &[rule(ClueDirection::NorthEast, 0, 2)],
        )
        .is_none()
    );
}

#[test]
fn a_wide_sized_grid_propagates_visibility_without_enumerating_all_permutations() {
    let grid = SizedConstraintGrid::with_layout(
        SizedGrid::without_regions(16).unwrap(),
        &[rule(ClueDirection::North, 0, 1)],
    )
    .unwrap();
    let candidates = grid.candidates(&[0; 256]).unwrap().unwrap();
    assert_eq!(candidates[0], 1 << 15);
}
