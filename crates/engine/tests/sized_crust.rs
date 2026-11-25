#![cfg(feature = "variants")]

use sudoku_app_engine::ClueDirection::{self, East, North, South, West};
use sudoku_app_engine::{Analysis, CrustClue, SizedConstraint, SizedConstraintGrid, SizedGrid};

type OutsideCount = (ClueDirection, usize, u16, Option<u8>);

// Sudoku Coach ABjn by h4nv.
const SEVEN: &[OutsideCount] = &[
    (East, 0, 18, Some(1)),
    (East, 1, 10, Some(0)),
    (East, 2, 10, Some(1)),
    (South, 1, 10, Some(2)),
    (South, 2, 22, Some(0)),
    (West, 1, 18, Some(3)),
    (West, 0, 20, Some(1)),
    (West, 2, 23, Some(3)),
    (West, 3, 13, Some(1)),
    (North, 1, 23, Some(3)),
    (North, 0, 5, Some(0)),
    (South, 3, 18, Some(1)),
    (East, 3, 15, Some(2)),
    (East, 4, 22, Some(3)),
    (West, 4, 19, Some(4)),
];

// Sudoku Coach LLgC by h4nv.
const FIVE: &[OutsideCount] = &[
    (East, 1, 12, Some(1)),
    (West, 1, 10, Some(1)),
    (East, 3, 10, Some(1)),
    (West, 3, 11, Some(2)),
    (North, 2, 12, None),
    (South, 2, 8, Some(1)),
];

const NINE_EDGE_COUNT: &[(ClueDirection, usize, u16, Option<u8>)] = &[
    (South, 6, 18, Some(1)),
    (South, 8, 23, Some(0)),
    (South, 5, 15, Some(0)),
    (South, 4, 10, Some(0)),
    (South, 2, 9, Some(1)),
    (South, 1, 2, Some(0)),
    (South, 3, 3, Some(0)),
    (South, 7, 30, Some(2)),
    (South, 0, 35, Some(1)),
    (North, 6, 39, Some(4)),
    (North, 5, 16, Some(2)),
    (North, 8, 21, Some(1)),
    (North, 0, 10, Some(1)),
    (West, 6, 40, Some(2)),
    (West, 4, 6, Some(1)),
    (West, 0, 16, Some(0)),
    (West, 1, 24, Some(1)),
    (West, 2, 20, Some(2)),
    (West, 3, 29, Some(1)),
    (West, 5, 20, Some(1)),
    (East, 4, 42, Some(4)),
    (East, 0, 29, Some(0)),
    (East, 1, 19, Some(0)),
    (East, 2, 39, Some(4)),
    (East, 3, 10, Some(0)),
    (East, 5, 38, Some(3)),
    (North, 7, 23, Some(1)),
];

// Sudoku Coach Crust of Void BKR7. Its completed digits are published, but
// its nine connected region boundaries are not.
const NINE_VOID: &[(ClueDirection, usize, u16, Option<u8>)] = &[
    (North, 2, 16, None),
    (North, 4, 13, None),
    (North, 5, 26, None),
    (East, 0, 25, None),
    (East, 3, 17, None),
    (East, 4, 16, None),
    (East, 5, 18, None),
    (East, 7, 19, None),
    (West, 2, 11, None),
    (West, 3, 15, None),
    (West, 4, 25, None),
    (West, 5, 23, None),
    (West, 7, 22, None),
    (South, 1, 21, None),
    (South, 4, 23, None),
    (South, 5, 13, None),
    (South, 7, 23, None),
];

fn variant(
    size: usize,
    counts: &[OutsideCount],
    companions: &[SizedConstraint],
) -> SizedConstraintGrid {
    let clues = counts
        .iter()
        .map(|&(direction, index, sum, crossed)| {
            let cells = (0..size)
                .map(|offset| match direction {
                    East => size * index + offset,
                    West => size * index + size - 1 - offset,
                    South => size * offset + index,
                    North => size * (size - 1 - offset) + index,
                    _ => unreachable!(),
                })
                .collect();
            CrustClue {
                direction,
                cells,
                sum,
                crossed,
            }
        })
        .collect();
    let mut rules = vec![SizedConstraint::Crust {
        clues,
        shared_region: None,
        fixed_edges: vec![],
    }];
    rules.extend_from_slice(companions);
    SizedConstraintGrid::with_layout(SizedGrid::without_regions(size).unwrap(), &rules).unwrap()
}

fn nine_edge_count(
    include_counts: bool,
    shared_region: Option<[usize; 2]>,
    fixed_edges: Vec<[usize; 2]>,
) -> SizedConstraintGrid {
    let clues: Vec<CrustClue> = NINE_EDGE_COUNT
        .iter()
        .map(|&(direction, index, sum, crossed)| {
            let cells = (0..9)
                .map(|offset| match direction {
                    East => index * 9 + offset,
                    West => index * 9 + 8 - offset,
                    South => offset * 9 + index,
                    North => (8 - offset) * 9 + index,
                    _ => unreachable!(),
                })
                .collect();
            CrustClue {
                direction,
                cells,
                sum,
                crossed: include_counts.then_some(crossed).flatten(),
            }
        })
        .collect();
    SizedConstraintGrid::with_layout(
        SizedGrid::without_regions(9).unwrap(),
        &[SizedConstraint::Crust {
            clues,
            shared_region,
            fixed_edges,
        }],
    )
    .unwrap()
}

fn digits(text: &str) -> Vec<u8> {
    text.bytes().map(|byte| byte - b'0').collect()
}

#[test]
fn published_seven_grid_has_one_digit_solution_and_the_inferred_regions_match() {
    let grid = variant(7, SEVEN, &[]);
    let expected = digits("7164523641237552367142351467367514215472364723651");
    assert_eq!(grid.solve_unique(&[0; 49], 150_000), Ok(expected.clone()));
    let layout = digits("0011222001332601133260013326441342654444665555556");
    let mut regions = grid.inferred_regions(&expected, 10_000).unwrap();
    regions.sort();
    let mut expected_regions: Vec<Vec<_>> = (0..7)
        .map(|label| {
            layout
                .iter()
                .enumerate()
                .filter_map(|(cell, &value)| (value == label).then_some(cell))
                .collect()
        })
        .collect();
    expected_regions.sort();
    assert_eq!(regions, expected_regions);
    assert_eq!(
        grid.inferred_regions(&expected, 0),
        Err(Analysis::SearchLimit)
    );

    let mixed = variant(
        7,
        SEVEN,
        &[SizedConstraint::Parity {
            cells: vec![0],
            parity: sudoku_app_engine::SizedParity::Odd,
        }],
    );
    let mut givens = expected.clone();
    givens[..14].fill(0);
    assert_eq!(mixed.solve_unique(&givens, 20_000), Ok(expected));
}

#[test]
fn published_five_grid_and_the_alternative_both_satisfy_all_outside_clues() {
    let grid = variant(5, FIVE, &[]);
    for allowed in ["5234114523234154513231254", "2534153412321544152314235"] {
        let board = digits(allowed);
        assert_eq!(grid.analyze(&board, 10_000), Analysis::Unique);
        assert!(grid.inferred_regions(&board, 10_000).is_ok());
    }
    assert_eq!(grid.analyze(&[0; 25], 10_000), Analysis::Multiple);
}

#[test]
fn inferred_regions_span_both_bitset_words_on_a_sixteen_grid() {
    let size = 16;
    let counts: Vec<_> = (0..size).map(|row| (East, row, 136, Some(0))).collect();
    let grid = variant(size, &counts, &[]);
    let digits: Vec<_> = (0..size * size)
        .map(|cell| ((cell / size + cell % size) % size + 1) as u8)
        .collect();
    let mut actual = grid.inferred_regions(&digits, 100).unwrap();
    actual.sort();
    let expected: Vec<Vec<_>> = (0..size)
        .map(|row| (row * size..(row + 1) * size).collect())
        .collect();
    assert_eq!(actual, expected);
}

#[test]
fn completed_crust_candidate_check_preserves_search_limit_status() {
    let grid = SizedConstraintGrid::with_layout(
        SizedGrid::without_regions(4).unwrap(),
        &[SizedConstraint::Crust {
            clues: vec![CrustClue {
                direction: East,
                cells: vec![0, 1, 2, 3],
                sum: 1,
                crossed: None,
            }],
            shared_region: None,
            fixed_edges: vec![],
        }],
    )
    .unwrap();
    let completion = digits("1234234134124123");

    assert_eq!(
        grid.candidates_with_budget(&completion, 0),
        Err(Analysis::SearchLimit)
    );
    assert!(
        grid.candidates_with_budget(&completion, 10_000)
            .unwrap()
            .is_some()
    );
}

#[test]
fn published_nine_by_nine_edge_count_reconstructs_its_split_region_and_fixed_edge() {
    let solution =
        digits("524318679865297413731952846912463785476589321298675134143726958359841267687134592");
    let grid = nine_edge_count(true, Some([42, 72]), vec![[72, 73]]);
    assert_eq!(grid.analyze(&solution, 100_000), Analysis::Unique);
    let mut regions = grid.inferred_regions(&solution, 10_000_000).unwrap();
    assert_eq!(regions.len(), 9);
    assert!(regions.iter().all(|region| region.len() == 9));
    assert!(
        regions
            .iter()
            .any(|region| region.contains(&42) && region.contains(&72))
    );
    assert!(
        !regions
            .iter()
            .any(|region| region.contains(&72) && region.contains(&73))
    );
    regions.sort();
    assert_eq!(
        regions
            .iter()
            .flatten()
            .copied()
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        81
    );
}

#[test]
fn published_nine_by_nine_crust_of_void_completion_has_a_valid_region_partition() {
    let solution =
        digits("583967241264781395672195438891534672715342986936428517148259763427613859359876124");
    let grid = variant(9, NINE_VOID, &[]);
    assert_eq!(grid.analyze(&solution, 100_000), Analysis::Unique);
    let regions = grid.inferred_regions(&solution, 10_000_000).unwrap();
    assert_eq!(regions.len(), 9);
    assert!(regions.iter().all(|region| region.len() == 9));
    assert_eq!(
        regions
            .iter()
            .flatten()
            .copied()
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        81
    );
}

#[test]
fn crust_rejects_invalid_split_region_and_fixed_edge_metadata() {
    let clues: Vec<CrustClue> = NINE_EDGE_COUNT
        .iter()
        .map(|&(direction, index, sum, crossed)| {
            let cells = (0..9)
                .map(|offset| match direction {
                    East => index * 9 + offset,
                    West => index * 9 + 8 - offset,
                    South => offset * 9 + index,
                    North => (8 - offset) * 9 + index,
                    _ => unreachable!(),
                })
                .collect();
            CrustClue {
                direction,
                cells,
                sum,
                crossed,
            }
        })
        .collect();
    for (shared_region, fixed_edges) in [
        (Some([42, 42]), vec![[72, 73]]),
        (Some([42, 81]), vec![[72, 73]]),
        (Some([42, 72]), vec![[72, 74]]),
        (Some([42, 72]), vec![[72, 73], [73, 72]]),
    ] {
        assert!(
            SizedConstraintGrid::with_layout(
                SizedGrid::without_regions(9).unwrap(),
                &[SizedConstraint::Crust {
                    clues: clues.clone(),
                    shared_region,
                    fixed_edges
                }],
            )
            .is_none()
        );
    }
}
